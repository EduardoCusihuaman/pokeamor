/**
 * Controlador imperativo del deck de descubrimiento (plan §6, «Patrón A»).
 *
 * Svelte es dueño del contenedor (`stage`) y de su ciclo de vida; este motor es
 * dueño de **todos** los nodos que viven dentro. El adaptador Svelte solo llama
 * a `setCards`, `setEnabled`, `undo`, `cancel` y `destroy`; nunca lee ni escribe
 * los nodos de carta.
 *
 * El controlador compone los motores ya extraídos, sin reimplementar su física:
 *
 * - `@/engines/deck/reconcile` conserva la identidad de las cartas y la
 *   undercard al avanzar o deshacer.
 * - `@/engines/swipe/gesture` mueve la carta con la física legacy.
 * - `@/engines/swipe/flight` realiza el vuelo de salida desde la pose liberada,
 *   con vuelos concurrentes y retirada inmediata con `prefers-reduced-motion`.
 * - `@/engines/swipe/seal` pinta y confirma el sello.
 * - `@/engines/resources/artwork` entrega la imagen exacta una sola vez; el
 *   coordinador de recursos mantiene la presentación y su liberación.
 *
 * Contratos de ciclo de vida:
 * - Ninguna callback del host (`onDecision`) se ejecuta después de `destroy()`.
 * - `undo()` cancela los vuelos activos y vuelve a mostrar la carta decidida
 *   sin emitir una nueva decisión.
 * - `destroy()` desconecta el gesto, cancela vuelos y libera presentaciones.
 */

import type { Card } from '@/domain/catalog';
import {
  img,
  type ArtworkCard,
  type ArtworkImage,
  type ArtworkResources,
} from '@/engines/resources/artwork';
import type {
  Presentation,
  PresentableImage,
  ResourceCoordinatorApi,
} from '@/engines/resources/resource-coordinator';
import type { FlightAnimationOptions, FlightFrame, SwipeFlight } from '@/engines/swipe/flight';
import { launchCard } from '@/engines/swipe/flight';
import {
  createPointerEventSource,
  createSwipeController,
  type SwipeController,
  type SwipeDecisionContext,
  type SwipePose,
  type VoteDecision,
} from '@/engines/swipe/gesture';
import { commitSwipeSeal, type SwipeSealElement } from '@/engines/swipe/seal';

import { deckKey, reconcileDeck, type DeckCardNode, type DeckStage } from './reconcile';

/** Presentación mínima que el deck transfiere a los vuelos y al reconciliar. */
export interface DeckPresentation {
  transferTo(owner: string, priority?: number): void;
  release(): void;
}

/** Nodo de carta propiedad exclusiva de este motor. */
interface DeckCardNodeInternal extends DeckCardNode<Card> {
  readonly element: HTMLElement;
  readonly image: ArtworkImage;
  readonly seal: SwipeSealElement;
  readonly swipe: SwipeController;
  readonly presentation: DeckPresentation;
  activated: boolean;
  decided: boolean;
  cancelFlight?: () => void;
  activate(): void;
  setUnder(): void;
  stopMotion(): void;
  remove(): void;
  getFlightPose(): SwipePose;
  readonly parentElement: HTMLElement | null;
  readonly style: CSSStyleDeclaration;
  readonly clientWidth: number;
  readonly clientHeight: number;
  getBoundingClientRect(): DOMRect;
  animate(frames: FlightFrame[], options: FlightAnimationOptions): Animation;
  readonly isConnected: boolean;
}

/** Dependencias inyectables del controlador. */
export interface DeckControllerDeps {
  /** Decisión confirmada por el gesto. El host actualiza su estado aquí. */
  readonly onDecision: (decision: VoteDecision, card: Card) => void;
  /** Coordinador compartido de recursos; `null` desactiva la preparación. */
  readonly resources?: ResourceCoordinatorApi | null;
  /** Fábrica de imágenes; por defecto `document.createElement('img')`. */
  readonly createImage?: () => ArtworkImage;
  readonly fallback?: (card: Card) => string;
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
  readonly requestAnimationFrame?: (callback: (time: number) => void) => number;
  readonly cancelAnimationFrame?: (handle: number) => void;
  readonly setTimeout?: (handler: () => void, ms: number) => number;
  readonly clearTimeout?: (handle: number) => void;
  readonly now?: () => number;
  readonly getViewportWidth?: () => number;
}

/** API pública que consume el adaptador Svelte. */
export interface DeckController {
  /** Reemplaza la cola visible (como máximo carta frontal + undercard). */
  setCards(cards: readonly Card[]): void;
  /** Habilita o deshabilita el gesto; al deshabilitar cancela sin decidir. */
  setEnabled(enabled: boolean): void;
  /** Cancela vuelos y re-muestra la última carta decidida sin votar. */
  undo(): void;
  /** Cancela el gesto activo sin decisión (idempotente). */
  cancel(): void;
  /** Desconecta todo y libera recursos; no emite callbacks después. */
  destroy(): void;
  /** Identidad de la carta frontal, o `null` si el deck está vacío. */
  getCardId(): string | null;
  /** Verdadero mientras el dedo está sobre la carta frontal. */
  isActive(): boolean;
}

const CARD_SELECTOR = '.card:not(.exiting)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const HEART_PATH =
  'M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z';
const CROSS_PATH = 'm6 6 12 12M18 6 6 18';
const SVG_NS = 'http://www.w3.org/2000/svg';

function defaultMatchMedia(query: string): { readonly matches: boolean } {
  if (typeof globalThis.matchMedia !== 'function') return { matches: false };
  return globalThis.matchMedia(query);
}

function defaultRequestAnimationFrame(callback: (time: number) => void): number {
  return globalThis.requestAnimationFrame(callback);
}

function defaultCancelAnimationFrame(handle: number): void {
  globalThis.cancelAnimationFrame(handle);
}

function defaultSetTimeout(handler: () => void, ms: number): number {
  return globalThis.setTimeout(handler, ms);
}

function defaultClearTimeout(handle: number): void {
  globalThis.clearTimeout(handle);
}

function defaultNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function defaultViewportWidth(): number {
  return globalThis.innerWidth ?? 0;
}

/** El motor de arte solo entrega cartas completas del catálogo. */
function asCard(card: ArtworkCard): Card {
  return card as unknown as Card;
}

/**
 * Adapta el coordinador completo a la vista estrecha que consume `img()`.
 * Las llamadas de `img()` siempre entregan un `Card`, que es asignable a la
 * identidad de recursos; el cast solo satisface la firma más amplia.
 */
function artworkResources(coordinator: ResourceCoordinatorApi): ArtworkResources {
  return {
    path: (card) => coordinator.path(asCard(card)) ?? undefined,
    key: (card) => coordinator.key(asCard(card)),
    peek: (url) => coordinator.peek(url),
    front: (card) => coordinator.front(asCard(card)),
    bindImage: (image, card, options) => {
      coordinator.bindImage(image as unknown as PresentableImage, asCard(card), options);
    },
    invalidate: (url) => {
      if (url) void coordinator.invalidate(url);
    },
  };
}

/** `HTMLImageElement` satisface ambas vistas; el motor de arte usa la estrecha. */
function asPresentable(image: ArtworkImage): PresentableImage {
  return image as unknown as PresentableImage;
}

function createSeal(document: Document): HTMLElement {
  const seal = document.createElement('div');
  // El badge vive dentro de la carta y comparte su vuelo. El motor de gesto
  // pinta opacidad, escala y `--seal-fill` sobre este mismo nodo.
  seal.className = 'swipe-seal';
  seal.setAttribute('aria-hidden', 'true');

  const fill = document.createElement('span');
  fill.className = 'seal-fill';
  seal.append(fill);

  const paths: ReadonlyArray<readonly [string, string]> = [
    ['seal-heart', HEART_PATH],
    ['seal-cross', CROSS_PATH],
  ];
  for (const [name, data] of paths) {
    for (const variant of ['seal-outline', 'seal-solid']) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', `${name} ${variant}`);
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', data);
      svg.append(path);
      seal.append(svg);
    }
  }

  return seal;
}

function createMeta(document: Document, card: Card): HTMLElement {
  const meta = document.createElement('div');
  meta.className = 'card-meta';

  const name = document.createElement('h2');
  name.textContent = card.name;

  const rarity = document.createElement('p');
  rarity.className = 'card-rarity';
  rarity.textContent = card.rarity;

  meta.append(name, rarity);
  return meta;
}

/**
 * Crea el controlador del deck sobre `stage`.
 *
 * @param stage Contenedor cuyo subárbol posee este motor.
 * @param deps Callbacks del host y APIs inyectables.
 */
export function createDeckController(stage: HTMLElement, deps: DeckControllerDeps): DeckController {
  const document = stage.ownerDocument;
  const resources = deps.resources ?? null;
  const matchMedia = deps.matchMedia ?? defaultMatchMedia;
  const requestFrame = deps.requestAnimationFrame ?? defaultRequestAnimationFrame;
  const cancelFrame = deps.cancelAnimationFrame ?? defaultCancelAnimationFrame;
  const setTimer = deps.setTimeout ?? defaultSetTimeout;
  const clearTimer = deps.clearTimeout ?? defaultClearTimeout;
  const now = deps.now ?? defaultNow;
  const getViewportWidth = deps.getViewportWidth ?? defaultViewportWidth;
  // `HTMLImageElement` satisface `ArtworkImage`; la vista estrecha solo omite
  // miembros que el motor de arte no necesita.
  const createImage: () => ArtworkImage =
    deps.createImage ?? (() => document.createElement('img') as ArtworkImage);

  const artwork = resources ? artworkResources(resources) : null;
  const nodes = new WeakMap<Element, DeckCardNodeInternal>();
  const flights = new Map<DeckCardNodeInternal, SwipeFlight>();

  let queue: readonly Card[] = [];
  let currentNode: DeckCardNodeInternal | null = null;
  let backNode: DeckCardNodeInternal | null = null;
  let lastDecided: Card | null = null;
  let enabled = true;
  let destroyed = false;

  const stageAdapter: DeckStage<Card, DeckCardNodeInternal> = {
    get firstChild() {
      const first = stage.firstElementChild;
      return first ? (nodes.get(first) ?? null) : null;
    },
    querySelectorAll(selector) {
      const found: DeckCardNodeInternal[] = [];
      for (const element of stage.querySelectorAll(selector)) {
        const node = nodes.get(element);
        if (node) found.push(node);
      }
      return found;
    },
    insertBefore(node, reference) {
      stage.insertBefore(node.element, reference?.element ?? null);
    },
    append(node) {
      stage.append(node.element);
    },
  };

  const isReducedMotion = (): boolean => matchMedia(REDUCED_MOTION_QUERY).matches;

  function createPresentation(
    card: Card,
    image: ArtworkImage,
    owner: string,
    priority: number,
  ): DeckPresentation {
    if (resources) {
      const presentation: Presentation = resources.preparePresentation(card, {
        owner,
        priority,
        image: asPresentable(image),
      });
      // `img()` vinculó la imagen antes de crear la presentación; esta
      // transferencia aplica la prioridad real de la carta (frente/undercard).
      presentation.transferTo(owner, priority);
      return presentation;
    }

    let released = false;
    return {
      transferTo() {
        // Sin coordinador no hay prioridad de descarga que transferir.
      },
      release() {
        if (released) return;
        released = true;
      },
    };
  }

  function activeFlightCards(): DeckCardNodeInternal[] {
    const active: DeckCardNodeInternal[] = [];
    for (const node of flights.keys()) {
      if (!node.isConnected) {
        flights.delete(node);
        continue;
      }
      active.push(node);
    }
    return active;
  }

  function cancelFlights(): void {
    for (const flight of [...flights.values()]) flight.cancel();
    flights.clear();
  }

  function applyUndercard(transform: string | null, filter: string | null): void {
    if (!backNode || !backNode.isConnected) return;
    backNode.style.transform = transform ?? '';
    backNode.style.filter = filter ?? '';
  }

  function handleDecision(
    node: DeckCardNodeInternal,
    decision: VoteDecision,
    context: SwipeDecisionContext,
  ): void {
    if (destroyed || node.decided || node !== currentNode) return;

    node.decided = true;
    commitSwipeSeal(node.seal, context.direction);

    const element = node.element;
    element.classList.add('exiting');
    element.classList.remove('lifted', 'dealt', 'returned', 'active');
    element.setAttribute('aria-hidden', 'true');
    element.style.pointerEvents = 'none';
    element.style.setProperty('--love', decision === 'yes' ? '1' : '0');
    element.style.setProperty('--pass', decision === 'no' ? '1' : '0');

    // Protege la carta de una reconciliación reentrante del host mientras se
    // crea el vuelo real.
    node.cancelFlight = () => {};

    // El host confirma el voto antes de que el motor avance visualmente.
    deps.onDecision(decision, node.pokemon);
    if (destroyed) return;

    const flight = launchCard(node, decision, context.momentum, {
      viewportWidth: getViewportWidth(),
      isReducedMotion,
      setTimeout: setTimer,
      clearTimeout: clearTimer,
    });

    if (flight) {
      flights.set(node, flight);
      node.cancelFlight = () => flight.cancel();
    } else {
      // `launchCard` ya retiró y liberó la carta (reduced motion).
      node.cancelFlight = undefined;
    }

    lastDecided = node.pokemon;
    if (queue[0] === node.pokemon) render(queue.slice(1));
    else render(queue);
  }

  function makeCard(card: Card, under: boolean): DeckCardNodeInternal {
    const element = document.createElement('article');
    element.className = `card${under ? ' under' : ''}`;
    element.setAttribute('aria-label', card.name);
    if (under) element.setAttribute('aria-hidden', 'true');

    const image = img(card, true, {
      createImage,
      resources: artwork,
      fallback: deps.fallback
        ? (candidate) => deps.fallback?.(asCard(candidate)) ?? candidate.image ?? ''
        : undefined,
      now: deps.now,
    });
    image.alt = `Carta de ${card.name}`;
    image.draggable = false;

    // Capas estáticas de la carta. El material WebGL queda diferido; estos
    // nodos preservan la estructura y los efectos del legacy (glint/foil).
    const glint = document.createElement('div');
    glint.className = 'glint';
    glint.setAttribute('aria-hidden', 'true');

    const foil = document.createElement('div');
    foil.className = 'foil';
    foil.setAttribute('aria-hidden', 'true');

    const choice = document.createElement('div');
    choice.className = 'choice-light';
    choice.setAttribute('aria-hidden', 'true');

    const seal = createSeal(document);
    const meta = createMeta(document, card);

    element.append(image as unknown as Node, glint, foil, choice, seal, meta);

    const presentation = createPresentation(card, image, under ? 'back' : 'front', under ? 1 : 0);

    const holder: { current: DeckCardNodeInternal | null } = { current: null };
    const swipe = createSwipeController(
      element,
      {
        onDecision(decision, context) {
          if (holder.current) handleDecision(holder.current, decision, context);
        },
      },
      {
        pointerSource: createPointerEventSource(element),
        getBoundingClientRect: () => element.getBoundingClientRect(),
        getStageRect: () => stage.getBoundingClientRect(),
        setPointerCapture: (_target, pointerId) => element.setPointerCapture(pointerId),
        releasePointerCapture: (_target, pointerId) => element.releasePointerCapture(pointerId),
        requestAnimationFrame: requestFrame,
        cancelAnimationFrame: cancelFrame,
        matchMedia,
        setTimeout: setTimer,
        clearTimeout: clearTimer,
        now,
        getCardId: () => String(card.id),
        canStart: () =>
          !destroyed &&
          enabled &&
          holder.current !== null &&
          holder.current === currentNode &&
          !holder.current.decided &&
          !element.classList.contains('under') &&
          !element.classList.contains('exiting'),
        seal,
        onUndercard: applyUndercard,
      },
    );

    const node: DeckCardNodeInternal = {
      element,
      image,
      seal,
      swipe,
      presentation,
      pokemon: card,
      activated: false,
      decided: false,
      get parentElement() {
        return element.parentElement;
      },
      get style() {
        return element.style;
      },
      get clientWidth() {
        return element.clientWidth;
      },
      get clientHeight() {
        return element.clientHeight;
      },
      get isConnected() {
        return element.isConnected;
      },
      getBoundingClientRect() {
        return element.getBoundingClientRect();
      },
      animate(frames, options) {
        // `FlightFrame` es un `Keyframe` estructural; la DOM lib exige la
        // interfaz completa con índice de cadenas.
        return element.animate(frames as unknown as Keyframe[], options);
      },
      getFlightPose() {
        return swipe.getPose();
      },
      activate() {
        if (node.decided) return;
        element.classList.remove('under');
        element.removeAttribute('aria-hidden');
        node.activated = true;
        node.presentation.transferTo('front', 0);
      },
      setUnder() {
        swipe.cancel();
        element.style.transform = '';
        element.style.filter = '';
        element.classList.add('under');
        element.setAttribute('aria-hidden', 'true');
        node.activated = false;
        node.presentation.transferTo('back', 1);
      },
      stopMotion() {
        // El nodo sale del deck: desconecta el gesto y sus frames. Es
        // idempotente si el vuelo ya lo había detenido.
        swipe.destroy();
      },
      remove() {
        element.remove();
      },
    };

    holder.current = node;
    nodes.set(element, node);
    return node;
  }

  function render(cards: readonly Card[]): void {
    if (destroyed) return;

    const unique: Card[] = [];
    for (const card of cards) {
      if (unique.length >= 2) break;
      if (!unique.some((candidate) => deckKey(candidate) === deckKey(card))) unique.push(card);
    }

    const front = unique[0];
    if (!front) {
      for (const element of Array.from(stage.querySelectorAll(CARD_SELECTOR))) {
        const node = nodes.get(element);
        if (!node) continue;
        node.stopMotion();
        node.presentation.release();
        node.element.remove();
      }
      queue = [];
      currentNode = null;
      backNode = null;
      return;
    }

    const next = unique[1];
    const reconciled = reconcileDeck(
      stageAdapter,
      next ? [front, next] : [front],
      activeFlightCards(),
      { makeCard },
    );

    queue = unique;
    currentNode = reconciled.front;
    backNode = reconciled.back;
    currentNode.swipe.setEnabled(enabled);
    backNode?.swipe.setEnabled(false);
  }

  return {
    setCards(cards: readonly Card[]): void {
      if (destroyed) return;

      const first = cards[0];
      // El host deshizo: la carta restaurada es la última decisión. Se cancelan
      // los vuelos antes de reconciliar para no mostrar un duplicado saliendo.
      if (first && lastDecided && deckKey(first) === deckKey(lastDecided)) {
        cancelFlights();
        lastDecided = null;
      }

      render(cards);
    },

    setEnabled(value: boolean): void {
      if (destroyed || enabled === value) return;
      enabled = value;
      if (!enabled) currentNode?.swipe.cancel();
      else currentNode?.swipe.setEnabled(true);
    },

    undo(): void {
      if (destroyed) return;
      const previous = lastDecided;
      cancelFlights();
      lastDecided = null;
      if (!previous) {
        render(queue);
        return;
      }

      const restored: Card[] = [previous];
      for (const card of queue) {
        if (deckKey(card) !== deckKey(previous)) restored.push(card);
      }
      render(restored.slice(0, 2));
    },

    cancel(): void {
      if (destroyed) return;
      currentNode?.swipe.cancel();
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      cancelFlights();

      for (const element of Array.from(stage.querySelectorAll('.card'))) {
        const node = nodes.get(element);
        if (!node) {
          element.remove();
          continue;
        }
        node.swipe.destroy();
        node.presentation.release();
        node.element.remove();
      }

      queue = [];
      currentNode = null;
      backNode = null;
      lastDecided = null;
    },

    getCardId(): string | null {
      return currentNode ? String(currentNode.pokemon.id) : null;
    },

    isActive(): boolean {
      return currentNode?.swipe.isActive() ?? false;
    },
  };
}
