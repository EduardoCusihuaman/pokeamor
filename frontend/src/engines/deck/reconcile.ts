/**
 * Reconciliación del deck de descubrimiento (motor independiente de Svelte).
 *
 * Migrado de `reconcileDeck` en `src/app.js`. El motor conserva la identidad de
 * los nodos de carta: una carta que sigue en la cola reutiliza **el mismo nodo
 * DOM** (y por tanto la misma imagen preparada y sus listeners) en lugar de
 * recrearse. Esto es un contrato de rendimiento y de identidad del plan §7.
 *
 * Contratos preservados:
 * - `existing` es una instantánea de `.card:not(.exiting)` tomada antes de
 *   crear nodos nuevos; una carta recién creada no se busca de nuevo.
 * - La clave de reutilización es `id:card` (especie + impresión), la misma que
 *   usaba el legacy. No es la `key` de `@/domain/cards/identity`, que incluye
 *   idioma y revisión del recurso: el deck reconcilia encuentros, no recursos.
 * - `take` solo crea una carta si la clave no está en `existing`.
 * - El nodo del frente se activa; el nodo de atrás pasa a `under` solo si ya
 *   estaba activado. Las llamadas son las mismas, en el mismo orden.
 * - Las cartas existentes que sobran se detienen y liberan su presentación.
 * - Las salientes solo se retiran si no están en `flights` y no tienen un
 *   `cancelFlight` pendiente (una animación de salida en curso nunca se corta).
 * - `insertBefore(back, firstChild)` mueve el nodo de atrás al inicio **sin**
 *   reconstruir su arte; `append(front)` solo ocurre si cambió de contenedor.
 *
 * El motor no importa Svelte ni toca `window`: recibe el contenedor, los nodos
 * y la fábrica `makeCard` por inyección.
 */

/** Datos mínimos de una carta para calcular su clave de deck. */
export interface DeckCardKey {
  readonly id: string | number;
  readonly card: string;
}

/** Presentación transferible que posee la carta (plan §6/§7). */
export interface DeckPresentation {
  release(): void;
}

/**
 * Nodo de carta administrado por el deck. Es estructural: el adaptador puede
 * satisfacerlo con un `HTMLElement` enriquecido o con un doble de prueba.
 */
export interface DeckCardNode<C extends DeckCardKey = DeckCardKey> {
  readonly pokemon: C;
  hidden?: boolean;
  activated?: boolean;
  /** Solo se usa para comparar con el contenedor; no se inspecciona. */
  parentElement?: object | null;
  presentation?: DeckPresentation | null;
  /** Presente mientras la animación de salida sigue en curso. */
  cancelFlight?: unknown;
  stopMotion?: () => void;
  activate?: () => void;
  setUnder?: () => void;
  remove: () => void;
}

/** Contenedor del deck (`#stage` en el legacy). */
export interface DeckStage<
  C extends DeckCardKey = DeckCardKey,
  N extends DeckCardNode<C> = DeckCardNode<C>,
> {
  readonly firstChild: N | null;
  querySelectorAll(selector: string): ArrayLike<N>;
  insertBefore(node: N, reference: N | null): unknown;
  append(node: N): unknown;
}

/** Dependencias inyectables de la reconciliación. */
export interface DeckReconcileOptions<C extends DeckCardKey, N extends DeckCardNode<C>> {
  /** Crea una carta nueva; solo se invoca si la clave no está en el deck. */
  readonly makeCard: (card: C, under: boolean) => N;
  /** Clave de reutilización. Por defecto `id:card`, como el legacy. */
  readonly key?: (card: C) => string;
}

/** Nodos conservados tras reconciliar. */
export interface DeckReconcileResult<C extends DeckCardKey, N extends DeckCardNode<C>> {
  readonly front: N;
  readonly back: N | null;
}

const CARD_SELECTOR = '.card:not(.exiting)';
const EXITING_SELECTOR = '.exiting';

/** Clave legacy de una carta dentro del deck: especie + impresión. */
export function deckKey(card: DeckCardKey): string {
  return `${card.id}:${card.card}`;
}

/**
 * Ajusta el deck a la cola actual sin recrear cartas que siguen presentes.
 *
 * @param stage Contenedor cuyo subárbol posee el motor del deck.
 * @param queue Cola con al menos la carta frontal.
 * @param flights Cartas salientes cuyas animaciones siguen en curso.
 */
export function reconcileDeck<C extends DeckCardKey, N extends DeckCardNode<C>>(
  stage: DeckStage<C, N>,
  queue: readonly [C, ...C[]],
  flights: readonly N[],
  options: DeckReconcileOptions<C, N>,
): DeckReconcileResult<C, N> {
  const key = options.key ?? deckKey;
  const existing = Array.from(stage.querySelectorAll(CARD_SELECTOR));

  const take = (card: C, under: boolean): N => {
    const found = existing.find((node) => key(node.pokemon) === key(card));
    const node = found ?? options.makeCard(card, under);
    node.hidden = false;
    if (under && node.activated) node.setUnder?.();
    if (!under) node.activate?.();
    return node;
  };

  const front = take(queue[0], false);
  const backCard = queue[1];
  const back = backCard ? take(backCard, true) : null;

  for (const node of existing) {
    if (node !== front && node !== back) {
      node.stopMotion?.();
      node.presentation?.release();
      node.remove();
    }
  }

  for (const node of Array.from(stage.querySelectorAll(EXITING_SELECTOR))) {
    if (!flights.includes(node) && !node.cancelFlight) {
      node.presentation?.release();
      node.remove();
    }
  }

  // insertBefore mueve el nodo existente sin reconstruir su arte ni listeners.
  if (back) stage.insertBefore(back, stage.firstChild);
  if (front.parentElement !== stage) stage.append(front);

  return { front, back };
}
