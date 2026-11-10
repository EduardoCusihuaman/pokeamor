/**
 * Navegación del álbum, índice de tandas, auto-expansión de una tanda asentada
 * y señal del botón de colección (`src/app.js`: IIFE de `#album-scrubber`, IIFE
 * de `PokeCollectionCue` y IIFE de la tanda asentada).
 *
 * Módulo de aplicación independiente del framework: no importa Svelte ni
 * consulta globals. El DOM, los timers, `requestAnimationFrame`,
 * `matchMedia`, el reloj y los límites de viewport se inyectan. Los nodos se
 * manejan de forma estructural para que el host pueda pasar elementos reales o
 * dobles de prueba.
 *
 * Contratos preservados del legacy:
 * - El scrubber sólo captura gestos que empiezan sobre él; el scroll nativo del
 *   álbum sigue siendo nativo.
 * - La expansión anclada conserva el agarre inicial y la posición del scroll
 *   (`pending = origin * y / anchor` por encima del ancla; interpolación lineal
 *   entre `origin` y 1 por debajo).
 * - Al soltar con movimiento se hace scroll instantáneo a la tanda y las
 *   tarjetas del preview vuelan a sus rectángulos (170 ms).
 * - Una tanda asentada se abre tras 2000 ms de calma, sin pointer ni scroll
 *   continuo, y el encabezado queda debajo del header de la colección.
 * - La señal de colección late como máximo dos veces por tanda nueva (700 ms y
 *   30000 ms), durante 950 ms, y se suprime con página oculta, reduced motion,
 *   batalla inline, gesto o cualquier superposición abierta.
 */

/** Identificador de timer del host. */
export type AlbumTimerHandle = number;

/** Timers inyectados. */
export interface AlbumTimers {
  setTimeout(callback: () => void, ms: number): AlbumTimerHandle;
  clearTimeout(handle: AlbumTimerHandle | undefined): void;
}

/** `matchMedia` inyectado. */
export interface AlbumMediaQuery {
  readonly matches: boolean;
  addEventListener?(type: 'change', listener: () => void): void;
}

/** Rectángulo mínimo usado por el índice y sus animaciones. */
export interface AlbumRect {
  readonly left?: number;
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly width?: number;
  readonly height?: number;
}

/** `classList` mínimo. */
export interface AlbumClassList {
  add(...tokens: string[]): void;
  remove(...tokens: string[]): void;
  contains(token: string): boolean;
  toggle(token: string, force?: boolean): void;
}

/** `style` mínimo; admite propiedades directas (`top`, `color`, …). */
export interface AlbumStyle {
  top?: string;
  setProperty(name: string, value: string): void;
  removeProperty?(name: string): void;
  [property: string]: unknown;
}

/** Fotograma aceptado por `Element.animate`. */
export interface AlbumKeyframe {
  opacity?: number;
  offset?: number;
  transform?: string;
  translate?: string;
}

/** Opciones de animación usadas por este módulo. */
export interface AlbumAnimationOptions {
  duration: number;
  easing: string;
  fill?: 'none' | 'both' | 'forwards';
}

/** Animación mínima devuelta por `Element.animate`. */
export interface AlbumAnimation {
  cancel(): void;
  readonly finished?: PromiseLike<unknown>;
}

/** Imagen de una tarjeta tal como la lee el preview. */
export interface AlbumImageSource {
  src?: string;
  currentSrc?: string;
  alt?: string;
}

/** Nodo estructural que el módulo puede crear, animar o eliminar. */
export interface AlbumNode extends AlbumImageSource {
  width?: number;
  height?: number;
  decoding?: string;
  textContent?: string;
  style: AlbumStyle;
  _albumIndex?: number;
  setAttribute?(name: string, value: string): void;
  append?(...nodes: readonly AlbumNode[]): void;
  replaceChildren?(...nodes: readonly AlbumNode[]): void;
  getBoundingClientRect?(): AlbumRect;
  cloneNode?(deep: boolean): AlbumNode;
  animate?(frames: readonly AlbumKeyframe[], options: AlbumAnimationOptions): AlbumAnimation;
  remove?(): void;
  getAnimations?(): readonly { cancel(): void }[];
}

/** Grupo de tandas (`#round-memories .batch-group`). */
export interface AlbumSection {
  readonly dataset: { readonly batch: string };
  readonly classList: AlbumClassList;
  getBoundingClientRect(): AlbumRect;
  querySelectorAll(selector: string): readonly AlbumImageSource[];
  querySelector?(selector: string): AlbumNode | null;
  contains?(node: unknown): boolean;
  readonly isConnected?: boolean;
}

/** Elemento que aporta `offsetHeight` (header/switch de la colección). */
export interface AlbumSized {
  readonly offsetHeight?: number;
}

/** Sheet del álbum. */
export interface AlbumSheet {
  readonly classList: AlbumClassList;
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  querySelector(selector: string): AlbumSized | null;
  getBoundingClientRect(): AlbumRect;
  scrollTo?(options: { top: number; behavior: string }): void;
  addEventListener(type: string, listener: (event: AlbumUiEvent) => void, options?: unknown): void;
}

/** Rail del índice. */
export interface AlbumRail {
  readonly classList: AlbumClassList;
  readonly style: AlbumStyle;
  hidden?: boolean;
  getBoundingClientRect(): AlbumRect;
}

/** Control scrubbable. */
export interface AlbumControl {
  readonly dataset: { position?: string };
  getBoundingClientRect(): AlbumRect;
  setAttribute(name: string, value: string): void;
  setPointerCapture?(pointerId: number): void;
  hasPointerCapture?(pointerId: number): boolean;
  releasePointerCapture?(pointerId: number): void;
  addEventListener(type: string, listener: (event: AlbumUiEvent) => void, options?: unknown): void;
  onpointerdown?: (event: AlbumPointerEvent) => void;
  onpointermove?: (event: AlbumPointerEvent) => void;
  onpointerup?: (event: AlbumPointerEvent) => void;
  onpointercancel?: () => void;
  onlostpointercapture?: () => void;
  onkeydown?: (event: AlbumKeyEvent) => void;
}

/** Preview flotante del índice. */
export interface AlbumPreview {
  readonly classList: AlbumClassList;
  readonly style: AlbumStyle;
  hidden: boolean;
  getBoundingClientRect(): AlbumRect;
  animate?(frames: readonly AlbumKeyframe[], options: AlbumAnimationOptions): AlbumAnimation;
  getAnimations?(): readonly { cancel(): void }[];
}

/** Contenedor de las miniaturas que vuela al soltar. */
export interface AlbumCardsHost {
  replaceChildren(...nodes: readonly AlbumNode[]): void;
  children?: readonly AlbumNode[];
}

/** Etiqueta con el número de tanda. */
export interface AlbumLabel {
  textContent?: string;
  getBoundingClientRect?(): AlbumRect;
}

/** Documento inyectado. */
export interface AlbumDocument {
  createElement(tagName: string): AlbumNode;
  readonly body: { append(node: AlbumNode): void };
  readonly visibilityState?: string;
  readonly hidden?: boolean;
  addEventListener?(type: string, listener: () => void, options?: unknown): void;
  querySelector?(selector: string): unknown;
}

/** Evento táctil/click mínimo. */
export interface AlbumUiEvent {
  readonly touches?: readonly unknown[];
  readonly cancelable?: boolean;
  readonly key?: string;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly pointerId?: number;
  readonly button?: number;
  preventDefault?(): void;
  stopPropagation?(): void;
  stopImmediatePropagation?(): void;
}

/** Evento pointer usado por el scrubber. */
export interface AlbumPointerEvent {
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerId: number;
  readonly button: number;
  preventDefault(): void;
}

/** Evento de teclado del scrubber. */
export interface AlbumKeyEvent {
  readonly key: string;
  preventDefault(): void;
}

/** Entrada de `morphLanding`. */
export interface AlbumLandingRef {
  node: AlbumNode;
  index: number | undefined;
  rect: AlbumRect | undefined;
}

/** Dependencias del índice del álbum. */
export interface AlbumIndexOptions {
  readonly sheet: AlbumSheet;
  readonly rail: AlbumRail;
  readonly control: AlbumControl;
  readonly preview: AlbumPreview;
  readonly root: { querySelectorAll(selector: string): readonly AlbumSection[] };
  readonly cardsHost: AlbumCardsHost;
  readonly label: AlbumLabel;
  readonly document: AlbumDocument;
  readonly timers: AlbumTimers;
  readonly requestAnimationFrame: (callback: (time: number) => void) => number;
  readonly now: () => number;
  readonly innerHeight: () => number;
  readonly matchMedia?: (query: string) => AlbumMediaQuery;
  /** `showCollectionTab` del host; el wrapper legacy se expone como `refresh`. */
  readonly showCollectionTab?: (rounds: boolean) => void;
}

/** Controlador del índice del álbum. */
export interface AlbumIndexController {
  /** Equivalente a `PokeAlbumIndex.refresh()`. */
  refresh(): void;
  /** Llama al `showCollectionTab` inyectado y remide (wrapper legacy). */
  showCollectionTab(rounds: boolean): void;
  measure(): void;
  dispose(): void;
}

const ALBUM_DETAIL_QUERY = '(prefers-reduced-motion: reduce)';
const GUTTER = 16;
const DEFAULT_HEADER_HEIGHT = 44;
const DEFAULT_GRIP_HEIGHT = 60;
const LANDING_DURATION = 170;
const LANDING_CLEANUP_DELAY = 180;
const EXPAND_DELAY = 250;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Crea el índice lateral del álbum.
 *
 * El host sigue siendo responsable de crear/destruir el markup; el controlador
 * registra sus listeners sobre los elementos inyectados.
 */
export function createAlbumIndex(options: AlbumIndexOptions): AlbumIndexController {
  const { sheet, rail, control, preview, root, cardsHost, label, document: doc, timers } = options;
  const raf = options.requestAnimationFrame;
  const now = options.now;
  const innerHeight = options.innerHeight;
  const isReduced = (): boolean => options.matchMedia?.(ALBUM_DETAIL_QUERY).matches ?? false;

  let sections: readonly AlbumSection[] = [];
  let offsets: number[] = [];
  let maximum = 0;
  let dragging = false;
  let pointer: number | null = null;
  let frame = 0;
  let pending: number | null = null;
  let quietUntil = 0;
  let selected = 0;
  let trackTop = 0;
  let travel = 1;
  let grab = 30;
  let anchor = 0;
  let origin = 0;
  let rendered: AlbumSection | null = null;
  let expandTimer: AlbumTimerHandle | undefined;
  let moved = false;
  let startY = 0;
  let handoff = 0;
  let railTravel = 1;
  let railTouch = false;
  let landingTimer: AlbumTimerHandle | undefined;

  const cache = new Map<string, Map<number, AlbumNode>>();
  preview.hidden = true;

  const flights: { node?: AlbumNode; animation?: AlbumAnimation }[] = [];
  const restores: (() => void)[] = [];

  function inset(): number {
    const header = sheet.querySelector('.collection-header')?.offsetHeight ?? DEFAULT_HEADER_HEIGHT;
    const switcher = sheet.querySelector('.collection-switch')?.offsetHeight ?? 0;
    return header + switcher + GUTTER;
  }

  function visible(): boolean {
    return (
      sheet.classList.contains('open') &&
      sheet.classList.contains('rounds-mode') &&
      !sheet.classList.contains('debug-mode')
    );
  }

  function current(): number {
    let index = 0;
    while (index + 1 < offsets.length && (offsets[index + 1] ?? 0) <= sheet.scrollTop + 4) index++;
    return index;
  }

  function positionGrip(ratio: number): void {
    rail.style.setProperty('--index-position', String(ratio));
    rail.style.setProperty('--index-offset', `${ratio * (dragging ? travel : railTravel)}px`);
  }

  function update(): void {
    if (!sections.length) return;
    if (!dragging) selected = current();
    const section = sections[selected];
    if (!section) return;
    const batch = Number(section.dataset.batch) + 1;
    if (!dragging) positionGrip(maximum ? clamp(sheet.scrollTop / maximum, 0, 1) : 0);
    control.dataset.position = String(batch);
    control.setAttribute('aria-valuemin', '0');
    control.setAttribute('aria-valuemax', String(Math.round(maximum)));
    control.setAttribute('aria-valuenow', String(Math.round(sheet.scrollTop)));
    control.setAttribute('aria-valuetext', `Tanda ${batch}`);
    control.setAttribute('aria-orientation', 'vertical');
    if (dragging) render();
  }

  function measure(): void {
    railTravel = Math.max(0, (rail.getBoundingClientRect().height ?? 0) - DEFAULT_GRIP_HEIGHT);
    sections = [...root.querySelectorAll('.batch-group')];
    maximum = Math.max(0, sheet.scrollHeight - sheet.clientHeight);
    const top = sheet.getBoundingClientRect().top ?? 0;
    offsets = sections.map(
      (section) => (section.getBoundingClientRect().top ?? 0) - top + sheet.scrollTop - inset(),
    );
    rail.hidden = !visible() || maximum < 8 || !sections.length;
    rail.classList.toggle('short-album', maximum < sheet.clientHeight * 2);
    update();
  }

  function render(): void {
    const section = sections[selected];
    if (!section || rendered === section) return;
    timers.clearTimeout(expandTimer);
    rendered = section;
    preview.classList.remove('expanded');
    label.textContent = String(Number(section.dataset.batch) + 1);

    const sources = [...section.querySelectorAll('.memory-card img')].slice(0, 15);
    const key = sources.map((source) => source.currentSrc || source.src).join('|');
    let images = cache.get(key);
    if (!images) {
      images = new Map<number, AlbumNode>();
      cache.set(key, images);
      if (cache.size > 8) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
    }
    const imageMap = images;

    const pick = (fractions: readonly number[]): AlbumNode[] => {
      const indexes = [
        ...new Set(
          fractions.map((fraction) =>
            Math.min(sources.length - 1, Math.floor(fraction * sources.length)),
          ),
        ),
      ].filter((index) => sources[index] !== undefined);
      const picked: AlbumNode[] = [];
      for (const index of indexes) {
        let image = imageMap.get(index);
        if (!image) {
          const source = sources[index];
          if (!source) continue;
          image = doc.createElement('img');
          image.src = source.currentSrc || source.src;
          image.alt = source.alt;
          image.width = 245;
          image.height = 337;
          image.decoding = 'async';
          image._albumIndex = index;
          imageMap.set(index, image);
        }
        picked.push(image);
      }
      return picked;
    };

    const place = (list: readonly AlbumNode[]): void => {
      list.forEach((image, index) =>
        image.style.setProperty('--slot', String(list.length - 1 - index)),
      );
    };

    const initial = pick([0, 0.5, 1]);
    place(initial);
    cardsHost.replaceChildren(...initial);

    expandTimer = timers.setTimeout(() => {
      if (!dragging || rendered !== section) return;
      const expanded = pick([0, 0.25, 0.5, 0.75, 1]);
      if (expanded.length <= initial.length) return;
      preview.classList.add('expanded');
      place(expanded);
      cardsHost.replaceChildren(...expanded);
      expanded
        .filter((image) => !initial.includes(image))
        .forEach((image) => motion(image, [{ opacity: 0 }, { opacity: 1 }], 100));
    }, EXPAND_DELAY);
  }

  function motion(
    element: AlbumNode | undefined,
    frames: readonly AlbumKeyframe[],
    duration: number,
  ): void {
    if (isReduced()) return;
    element?.getAnimations?.().forEach((animation) => animation.cancel());
    element?.animate?.(frames, { duration, easing: 'ease-out' });
  }

  function apply(): void {
    frame = 0;
    if (!dragging || pending === null) return;
    selected = clamp(Math.round(pending * (sections.length - 1)), 0, sections.length - 1);
    pending = null;
    update();
  }

  function move(event: AlbumPointerEvent): void {
    if (Math.abs(event.clientY - startY) > 4) moved = true;
    const y = clamp(event.clientY - grab - trackTop, 0, travel);
    // La expansión anclada conserva el agarre inicial y el scroll actual.
    pending =
      y <= anchor
        ? anchor
          ? (origin * y) / anchor
          : 0
        : origin + ((1 - origin) * (y - anchor)) / Math.max(1, travel - anchor);
    positionGrip(y / travel);
    positionPreview(event.clientY);
    if (!frame) frame = raf(apply);
  }

  function clearLanding(): void {
    timers.clearTimeout(landingTimer);
    flights.splice(0).forEach(({ node, animation }) => {
      animation?.cancel();
      node?.remove?.();
    });
    restores.splice(0).forEach((restore) => restore());
  }

  function hidePreview(): void {
    preview.hidden = true;
    preview.classList.remove('map-preview', 'expanded');
    preview.getAnimations?.().forEach((animation) => animation.cancel());
  }

  function interruptLanding(): void {
    handoff++;
    clearLanding();
    hidePreview();
  }

  function fly(node: AlbumNode, from: AlbumRect | undefined, to: AlbumRect | undefined): boolean {
    if (!from?.width || !from.height || !to?.width || !to.height) return false;
    Object.assign(node.style, {
      position: 'fixed',
      left: `${to.left ?? 0}px`,
      top: `${to.top ?? 0}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: '10000',
      objectFit: 'contain',
      transformOrigin: '0 0',
      borderRadius: '3px',
    });
    node.setAttribute?.('aria-hidden', 'true');
    doc.body.append(node);
    const animation = node.animate?.(
      [
        {
          transform: `translate(${(from.left ?? 0) - (to.left ?? 0)}px,${(from.top ?? 0) - (to.top ?? 0)}px) scale(${from.width / to.width},${(from.height ?? 0) / to.height})`,
        },
        { transform: 'translate(0,0) scale(1,1)' },
      ],
      {
        duration: LANDING_DURATION,
        easing: 'cubic-bezier(.16,1,.3,1)',
        fill: 'both',
      },
    );
    if (!animation) return false;
    flights.push({ node, animation });
    return true;
  }

  function morphLanding(
    destination: AlbumSection | undefined,
    refs: readonly AlbumLandingRef[],
    numberRect: AlbumRect | undefined,
    token: number,
  ): void {
    if (token !== handoff || dragging || !destination) return;
    if (isReduced() || !preview.animate) {
      hidePreview();
      return;
    }
    const targets = [...(destination.querySelectorAll('.memory-card img') as readonly AlbumNode[])];
    const matched = new Set<AlbumNode>();

    for (const ref of refs) {
      const target = ref.index === undefined ? undefined : targets[ref.index];
      if (!target || !ref.node.cloneNode || !target.getBoundingClientRect || !target.style) {
        continue;
      }
      const to = target.getBoundingClientRect();
      if (fly(ref.node.cloneNode(true), ref.rect, to)) {
        const old = target.style.visibility;
        target.style.visibility = 'hidden';
        restores.push(() => {
          target.style.visibility = old;
        });
        matched.add(target);
      }
    }

    const title = destination.querySelector?.('.batch-title');
    if (title && numberRect?.width) {
      const number = doc.createElement('span');
      number.textContent = title.textContent;
      number.style.color = '#876c7e';
      number.style.fontSize = '11px';
      number.style.whiteSpace = 'nowrap';
      const titleRect = title.getBoundingClientRect?.();
      if (titleRect && fly(number, numberRect, titleRect)) {
        const old = title.style.visibility;
        title.style.visibility = 'hidden';
        restores.push(() => {
          title.style.visibility = old;
        });
      }
    }

    for (const target of targets) {
      if (matched.has(target)) continue;
      const animation = target.animate?.([{ opacity: 0.6 }, { opacity: 1 }], {
        duration: 120,
        easing: 'ease-out',
      });
      if (animation) flights.push({ animation });
    }

    hidePreview();
    landingTimer = timers.setTimeout(() => {
      if (token === handoff) clearLanding();
    }, LANDING_CLEANUP_DELAY);
  }

  function positionPreview(y: number): void {
    const height = preview.getBoundingClientRect().height || 94;
    const bottom = Math.min(innerHeight() - 12, (sheet.getBoundingClientRect().bottom ?? 0) - 12);
    preview.style.top = `${clamp(y - 56 - height / 2, trackTop + 4, Math.max(trackTop + 4, bottom - height))}px`;
  }

  function finish(commit = true): void {
    if (!dragging) {
      if (!commit) interruptLanding();
      return;
    }
    if (pending !== null) apply();
    timers.clearTimeout(expandTimer);
    const destination = sections[selected];
    const land = commit && moved;
    const token = ++handoff;
    if (land) {
      const refs: AlbumLandingRef[] = [...(cardsHost.children ?? [])].map((node) => ({
        node,
        index: node._albumIndex,
        rect: node.getBoundingClientRect?.(),
      }));
      const numberRect = label.getBoundingClientRect?.();
      sheet.scrollTo?.({ top: clamp(offsets[selected] ?? 0, 0, maximum), behavior: 'instant' });
      raf(() => morphLanding(destination, refs, numberRect, token));
    } else {
      hidePreview();
    }
    dragging = false;
    quietUntil = now() + 180;
    rail.classList.remove('scrubbing');
    rail.style.removeProperty?.('--drag-top');
    rail.style.removeProperty?.('--drag-height');
    sheet.classList.remove('album-scrubbing');
    const id = pointer;
    pointer = null;
    if (id !== null && control.hasPointerCapture?.(id)) control.releasePointerCapture?.(id);
    update();
  }

  function onPointerDown(event: AlbumPointerEvent): void {
    if (rail.hidden || event.button > 0) return;
    event.preventDefault();
    interruptLanding();
    measure();
    const rect = control.getBoundingClientRect();
    const bounds = sheet.getBoundingClientRect();
    grab = clamp(event.clientY - (rect.top ?? 0), 0, DEFAULT_GRIP_HEIGHT);
    trackTop = Math.max(8, (bounds.top ?? 0) + inset());
    const bottom = Math.min(innerHeight() - 12, (bounds.bottom ?? 0) - 12);
    travel = Math.max(1, bottom - trackTop - DEFAULT_GRIP_HEIGHT);
    anchor = clamp((rect.top ?? 0) - trackTop, 0, travel);
    origin = selected / Math.max(1, sections.length - 1);
    startY = event.clientY;
    moved = false;
    dragging = true;
    pointer = event.pointerId;
    pending = null;
    rail.style.setProperty('--drag-top', `${trackTop}px`);
    rail.style.setProperty('--drag-height', `${travel + DEFAULT_GRIP_HEIGHT}px`);
    positionGrip(anchor / travel);
    rail.classList.add('scrubbing');
    sheet.classList.add('album-scrubbing');
    rendered = null;
    preview.classList.add('map-preview');
    preview.hidden = false;
    render();
    motion(
      preview,
      [
        { opacity: 0, translate: '3px 0' },
        { opacity: 1, translate: '0 0' },
      ],
      80,
    );
    positionPreview(event.clientY);
    control.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: AlbumPointerEvent): void {
    if (dragging && event.pointerId === pointer) {
      event.preventDefault();
      move(event);
    }
  }

  function onPointerUp(event: AlbumPointerEvent): void {
    if (event.pointerId === pointer) finish();
  }

  control.onpointerdown = onPointerDown;
  control.onpointermove = onPointerMove;
  control.onpointerup = onPointerUp;
  control.onpointercancel = () => finish(false);
  control.onlostpointercapture = () => {
    if (dragging) finish(false);
  };

  control.addEventListener(
    'touchstart',
    (event) => {
      if ((event.touches?.length ?? 0) !== 1) return;
      railTouch = true;
      if (event.cancelable) event.preventDefault?.();
      event.stopPropagation?.();
    },
    { passive: false },
  );

  sheet.addEventListener(
    'touchmove',
    (event) => {
      if (!railTouch) return;
      if (event.cancelable) event.preventDefault?.();
      event.stopPropagation?.();
    },
    { passive: false, capture: true },
  );
  sheet.addEventListener(
    'touchend',
    () => {
      railTouch = false;
    },
    { passive: true, capture: true },
  );
  sheet.addEventListener(
    'touchcancel',
    () => {
      railTouch = false;
      finish(false);
    },
    { passive: true, capture: true },
  );
  sheet.addEventListener(
    'touchstart',
    () => {
      if (!dragging) interruptLanding();
    },
    { passive: true },
  );
  sheet.addEventListener(
    'wheel',
    () => {
      if (!dragging) interruptLanding();
    },
    { passive: true },
  );
  sheet.addEventListener(
    'click',
    (event) => {
      if (dragging || now() < quietUntil) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
      }
    },
    true,
  );

  control.onkeydown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    measure();
    const delta = event.key.startsWith('Page') ? sheet.clientHeight * 0.8 : 80;
    sheet.scrollTo?.({
      top:
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? maximum
            : clamp(
                sheet.scrollTop + (['ArrowDown', 'PageDown'].includes(event.key) ? delta : -delta),
                0,
                maximum,
              ),
      behavior: 'instant',
    });
    update();
  };

  sheet.addEventListener(
    'scroll',
    () => {
      if (!dragging) update();
    },
    { passive: true },
  );

  function refresh(): void {
    finish(false);
    cache.clear();
    measure();
  }

  function showCollectionTab(rounds: boolean): void {
    finish(false);
    options.showCollectionTab?.(rounds);
    raf(() => measure());
  }

  function dispose(): void {
    finish(false);
    clearLanding();
    cache.clear();
  }

  measure();

  return { refresh, showCollectionTab, measure, dispose };
}

/** Límites verticales usados por la auto-expansión. */
export interface BatchViewport {
  readonly top: number;
  readonly bottom: number;
}

/** Tarjeta/encabezado de una tanda. */
export interface BatchTile {
  getBoundingClientRect?(): AlbumRect;
  animate?(frames: readonly AlbumKeyframe[], options: AlbumAnimationOptions): AlbumAnimation;
  readonly isConnected?: boolean;
}

/** Sección con encabezado y tarjetas. */
export interface BatchSection extends BatchTile {
  readonly classList: { toggle(token: string, force?: boolean): void; remove(token: string): void };
  getBoundingClientRect(): AlbumRect;
  querySelector(selector: string): BatchTile | null;
  querySelectorAll(selector: string): readonly BatchTile[];
  contains(node: unknown): boolean;
}

/** Sheet mínimo para la auto-expansión. */
export interface SettledBatchSheet {
  readonly classList: { contains(token: string): boolean };
  scrollTop: number;
  getBoundingClientRect(): AlbumRect;
  querySelector(selector: string): BatchTile | null;
  addEventListener(type: string, listener: (event: AlbumUiEvent) => void, options?: unknown): void;
}

/** Dependencias de la auto-expansión de tandas asentadas. */
export interface SettledBatchOptions {
  readonly sheet: SettledBatchSheet;
  readonly root: {
    querySelectorAll(selector: string): readonly BatchTile[];
  };
  readonly document: {
    readonly hidden: boolean;
    addEventListener?(type: string, listener: () => void, options?: unknown): void;
  };
  readonly window?: {
    addEventListener?(type: string, listener: () => void, options?: unknown): void;
  };
  readonly matchMedia: (query: string) => AlbumMediaQuery;
  readonly isDetailOpen: () => boolean;
  readonly now: () => number;
  readonly innerHeight: () => number;
  readonly timers: AlbumTimers;
  /** El host conecta `MutationObserver` del sheet a `notifyClassChange`. */
  readonly observeSheetClass?: (listener: () => void) => void;
  /** El host conecta `MutationObserver` de la raíz a `notifyContentChange`. */
  readonly observeRootContent?: (listener: () => void) => void;
}

/** Controlador de la auto-expansión. */
export interface SettledBatchController {
  inspect(): void;
  pause(): void;
  resume(): void;
  notifyClassChange(): void;
  notifyContentChange(): void;
  notifyVisibilityChange(): void;
  notifyBlur(): void;
  notifyReducedMotionChange(): void;
  dispose(): void;
}

const SETTLED_QUERY = '(prefers-reduced-motion: reduce)';
const OPEN_DELAY = 2000;
const SETTLE_DELAY = 320;
const RESUME_DELAY = 220;
const MIN_CARDS = 4;
const COOLDOWN_MS = 12000;
const QUIET_MS = 300;
const GROW_DURATION = 230;

/**
 * Crea la auto-expansión de una tanda asentada.
 *
 * El módulo escucha scroll/pointer/wheel/click del sheet y
 * visibilitychange/blur. Los `MutationObserver` que el legacy creaba se
 * inyectan como callbacks (`observeSheetClass`/`observeRootContent`) o se
 * notifican manualmente.
 */
export function createSettledBatch(options: SettledBatchOptions): SettledBatchController {
  const { sheet, root, document: doc, timers } = options;
  const now = options.now;
  const innerHeight = options.innerHeight;

  let expanded: BatchSection | null = null;
  let timer: AlbumTimerHandle | undefined;
  let settle: AlbumTimerHandle | undefined;
  let pressed = false;
  let quietUntil = 0;
  const cooldown = new WeakMap<BatchSection, number>();
  const animations = new Set<AlbumAnimation>();

  function cancel(): void {
    timers.clearTimeout(timer);
    timers.clearTimeout(settle);
    timer = undefined;
    settle = undefined;
  }

  function enabled(): boolean {
    return (
      sheet.classList.contains('open') &&
      sheet.classList.contains('rounds-mode') &&
      !sheet.classList.contains('debug-mode') &&
      !sheet.classList.contains('scrubbing') &&
      !doc.hidden &&
      !options.matchMedia(SETTLED_QUERY).matches &&
      !options.isDetailOpen()
    );
  }

  function bounds(): BatchViewport {
    const rect = sheet.getBoundingClientRect();
    const header = sheet.querySelector('header')?.getBoundingClientRect?.();
    return {
      top: Math.max(rect.top ?? 0, header?.bottom ?? 0) + 8,
      bottom: Math.min(rect.bottom ?? 0, innerHeight()) - 16,
    };
  }

  function change(section: BatchSection, open: boolean): void {
    const view = bounds();
    const elements = [...root.querySelectorAll('.memory-card,.batch-placeholder,.batch-group h3')];
    const own = [...section.querySelectorAll('.memory-card,.batch-placeholder,h3')];
    const visible = elements.filter((tile) => {
      const rect = tile.getBoundingClientRect?.();
      if (!rect) return false;
      return (rect.bottom ?? 0) > view.top && (rect.top ?? 0) < view.bottom;
    });
    const before = new Map<BatchTile, AlbumRect>(
      [...new Set([...visible, ...own])].map((tile) => [
        tile,
        tile.getBoundingClientRect?.() ?? {},
      ]),
    );

    // Al abrir se ancla el encabezado; al cerrar, el contenido alcanzado.
    const heading = section.querySelector('h3') ?? section;
    const outside = visible.filter((tile) => !section.contains(tile));
    const anchor: { tile: BatchTile; top: number } = open
      ? { tile: heading, top: view.top }
      : (outside.reduce<{ tile: BatchTile; top: number; distance: number } | null>((best, tile) => {
          const rect = tile.getBoundingClientRect?.() ?? {};
          const distance = Math.abs((rect.top ?? 0) - view.top);
          return !best || distance < best.distance ? { tile, top: rect.top ?? 0, distance } : best;
        }, null) ?? { tile: heading, top: heading.getBoundingClientRect?.().top ?? 0 });

    for (const animation of animations) animation.cancel();
    animations.clear();
    section.classList.toggle('reading-batch', open);
    expanded = open ? section : null;
    quietUntil = now() + QUIET_MS;
    sheet.scrollTop += (anchor.tile.getBoundingClientRect?.().top ?? 0) - anchor.top;

    for (const [tile, rect] of before) {
      const next = tile.getBoundingClientRect?.();
      if (!next?.width || !next.height) continue;
      const animation = tile.animate?.(
        [
          {
            transform: `translate(${(rect.left ?? 0) - (next.left ?? 0)}px,${(rect.top ?? 0) - (next.top ?? 0)}px) scale(${(rect.width ?? 0) / next.width},${(rect.height ?? 0) / next.height})`,
          },
          { transform: 'none' },
        ],
        {
          duration: GROW_DURATION,
          easing: 'cubic-bezier(.2,.75,.2,1)',
        },
      );
      if (!animation) continue;
      animations.add(animation);
      void animation.finished?.then(
        () => animations.delete(animation),
        () => animations.delete(animation),
      );
    }
    if (!open) cooldown.set(section, now() + COOLDOWN_MS);
  }

  function inspect(): void {
    cancel();
    if (!enabled() || pressed) return;
    const view = bounds();
    if (expanded) {
      const rect = expanded.getBoundingClientRect();
      if ((rect.bottom ?? 0) > view.top + 70 && (rect.top ?? 0) < view.bottom - 70) return;
      change(expanded, false);
      settle = timers.setTimeout(inspect, SETTLE_DELAY);
      return;
    }
    const height = view.bottom - view.top;
    let candidate: BatchSection | null = null;
    let best = 0;
    for (const section of root.querySelectorAll('.batch-group') as readonly BatchSection[]) {
      if (
        (cooldown.get(section) ?? 0) > now() ||
        section.querySelectorAll('.memory-card').length < MIN_CARDS
      ) {
        continue;
      }
      const rect = section.getBoundingClientRect();
      const overlap = Math.max(
        0,
        Math.min(rect.bottom ?? 0, view.bottom) - Math.max(rect.top ?? 0, view.top),
      );
      if (overlap < Math.min((rect.height ?? 0) * 0.65, height * 0.55)) continue;
      if (overlap > best) {
        best = overlap;
        candidate = section;
      }
    }
    if (candidate) {
      const chosen = candidate;
      timer = timers.setTimeout(() => {
        if (enabled() && !pressed && chosen.isConnected !== false) change(chosen, true);
      }, OPEN_DELAY);
    }
  }

  function pause(): void {
    cancel();
    pressed = true;
  }

  function resume(): void {
    pressed = false;
    cancel();
    settle = timers.setTimeout(inspect, RESUME_DELAY);
  }

  function notifyClassChange(): void {
    cancel();
    if (!enabled()) {
      if (expanded) expanded.classList.remove('reading-batch');
      expanded = null;
      return;
    }
    settle = timers.setTimeout(inspect, QUIET_MS);
  }

  function notifyContentChange(): void {
    cancel();
    if (expanded && expanded.isConnected === false) expanded = null;
    settle = timers.setTimeout(inspect, QUIET_MS);
  }

  function notifyVisibilityChange(): void {
    cancel();
    if (!doc.hidden) resume();
  }

  function notifyBlur(): void {
    pressed = false;
    cancel();
  }

  function notifyReducedMotionChange(): void {
    cancel();
    if (options.matchMedia(SETTLED_QUERY).matches && expanded) {
      expanded.classList.remove('reading-batch');
      expanded = null;
    }
  }

  sheet.addEventListener('pointerdown', pause, { passive: true });
  doc.addEventListener?.('pointerup', resume, { passive: true });
  doc.addEventListener?.('pointercancel', resume, { passive: true });
  sheet.addEventListener(
    'scroll',
    () => {
      cancel();
      settle = timers.setTimeout(inspect, Math.max(200, quietUntil - now() + 20));
    },
    { passive: true },
  );
  sheet.addEventListener(
    'wheel',
    () => {
      cancel();
      settle = timers.setTimeout(inspect, 240);
    },
    { passive: true },
  );
  sheet.addEventListener(
    'click',
    () => {
      cancel();
      settle = timers.setTimeout(inspect, 300);
    },
    { passive: true },
  );
  doc.addEventListener?.('visibilitychange', notifyVisibilityChange);
  options.window?.addEventListener?.('blur', notifyBlur);
  options.matchMedia(SETTLED_QUERY).addEventListener?.('change', notifyReducedMotionChange);
  options.observeSheetClass?.(notifyClassChange);
  options.observeRootContent?.(notifyContentChange);

  return {
    inspect,
    pause,
    resume,
    notifyClassChange,
    notifyContentChange,
    notifyVisibilityChange,
    notifyBlur,
    notifyReducedMotionChange,
    dispose: cancel,
  };
}

/** Botón de colección y sheet para la señal. */
export interface CollectionCueOptions {
  readonly button: {
    readonly classList: {
      add(...tokens: string[]): void;
      remove(...tokens: string[]): void;
    };
    addEventListener(type: string, listener: () => void): void;
  };
  readonly sheet: {
    readonly classList: { contains(token: string): boolean };
    scrollTo?(options: { top: number; behavior: string }): void;
    readonly scrollTop?: number;
    getBoundingClientRect?(): AlbumRect;
    querySelector?(selector: string): (BatchTile & { getBoundingClientRect?(): AlbumRect }) | null;
  };
  readonly document: {
    readonly hidden: boolean;
    addEventListener?(type: string, listener: () => void, options?: unknown): void;
    querySelector?(selector: string): unknown;
  };
  readonly matchMedia: (query: string) => AlbumMediaQuery;
  readonly isBusy: () => boolean;
  readonly hasInlinePair: () => boolean;
  readonly timers: AlbumTimers;
  readonly requestAnimationFrame?: (callback: (time: number) => void) => number;
  /** El host conecta `MutationObserver` del sheet a `notifyClassChange`. */
  readonly observeSheetClass?: (listener: () => void) => void;
}

/** API equivalente a `window.PokeCollectionCue`. */
export interface CollectionCueController {
  complete(ids: readonly number[]): void;
  clear(): void;
  /** Notifica que la clase del sheet cambió (MutationObserver del host). */
  notifyClassChange(): void;
  dispose(): void;
}

const CUE_QUERY = '(prefers-reduced-motion: reduce)';
const CUE_FIRST_DELAY = 700;
const CUE_REMINDER_DELAY = 30000;
const CUE_VISIBLE_MS = 950;

/**
 * Crea la señal contextual del botón de colección.
 *
 * Late como máximo dos veces por tanda nueva: a los 700 ms y a los 30000 ms,
 * durante 950 ms. Leer la tanda, abrir el sheet, tocar, ocultar la página o
 * cambiar reduced motion cancela los timers.
 */
export function createCollectionCue(options: CollectionCueOptions): CollectionCueController {
  const { button, sheet, document: doc, timers } = options;
  const raf =
    options.requestAnimationFrame ??
    ((callback) => {
      callback(0);
      return 0;
    });
  let pending: readonly number[] | null = null;
  let firstTimer: AlbumTimerHandle | undefined;
  let reminderTimer: AlbumTimerHandle | undefined;
  let stopTimer: AlbumTimerHandle | undefined;

  function stop(): void {
    timers.clearTimeout(stopTimer);
    stopTimer = undefined;
    button.classList.remove('collection-breath');
  }

  function read(): void {
    pending = null;
    timers.clearTimeout(firstTimer);
    timers.clearTimeout(reminderTimer);
    firstTimer = undefined;
    reminderTimer = undefined;
    stop();
  }

  function pulse(): void {
    if (
      !pending ||
      doc.hidden ||
      options.matchMedia(CUE_QUERY).matches ||
      options.isBusy() ||
      options.hasInlinePair() ||
      doc.querySelector?.('.sheet.open,dialog[open],.card.lifted')
    ) {
      return;
    }
    stop();
    button.classList.add('collection-breath');
    stopTimer = timers.setTimeout(stop, CUE_VISIBLE_MS);
  }

  function complete(ids: readonly number[]): void {
    read();
    if (sheet.classList.contains('open')) return;
    pending = ids;
    firstTimer = timers.setTimeout(pulse, CUE_FIRST_DELAY);
    reminderTimer = timers.setTimeout(pulse, CUE_REMINDER_DELAY);
  }

  button.addEventListener('click', () => {
    const ids = pending;
    read();
    if (ids && ids.length)
      raf(() => {
        const tile = doc.querySelector?.(`.memory-card[data-pokemon="${ids[0]}"]`);
        const section = (
          tile as { closest?(selector: string): unknown } | null | undefined
        )?.closest?.('.batch-group');
        if (!section || typeof section !== 'object') return;
        const batch = section as {
          getBoundingClientRect(): AlbumRect;
        };
        const sheetRect = sheet.getBoundingClientRect?.();
        if (!sheetRect) return;
        const headerHeight =
          sheet.querySelector?.('header')?.getBoundingClientRect?.().height ?? 50;
        sheet.scrollTo?.({
          top:
            (sheet.scrollTop ?? 0) +
            (batch.getBoundingClientRect().top ?? 0) -
            (sheetRect.top ?? 0) -
            headerHeight -
            12,
          behavior: 'instant',
        });
      });
  });

  function notifyClassChange(): void {
    if (sheet.classList.contains('open')) read();
  }

  doc.addEventListener?.('visibilitychange', () => {
    if (doc.hidden) stop();
  });
  doc.addEventListener?.('pointerdown', stop, { passive: true });
  options.matchMedia(CUE_QUERY).addEventListener?.('change', stop);
  options.observeSheetClass?.(notifyClassChange);

  return {
    complete,
    clear: read,
    notifyClassChange,
    dispose: read,
  };
}
