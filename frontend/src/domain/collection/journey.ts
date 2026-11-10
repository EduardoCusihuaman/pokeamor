/**
 * Progresión del viaje: tandas, equipo, recompensas y composición del playmat.
 *
 * Extraído de `window.PokeJourney` (`src/journey.js`). El módulo es puro e
 * independiente del framework: no importa Svelte, no consulta el DOM y no lee
 * globals. El catálogo, los votos y las tandas ya completadas se reciben como
 * parámetros; la persistencia y las animaciones quedan del lado de la UI.
 *
 * Contratos preservados:
 * - Una tanda completa tiene exactamente 15 cartas; el resto forma una única
 *   tanda activa (posiblemente vacía).
 * - Solo los votos `yes` forman tandas y equipo.
 * - El equipo son los 6 favoritos mejor rankeados.
 * - Las tandas completadas solo se recortan por el final cuando alguna de sus
 *   cartas perdió el voto (undo); los recortes antiguos no alteran el orden.
 * - Las recompensas son idempotentes: `finished` y `batch-<ids>` se registran
 *   en `seen` y no se pueden farmear repitiendo `celebration()`.
 *
 * Costuras documentadas (fuera del dominio):
 * - `PokeCards.key/resolve`, thumbnails y recursos de imagen.
 * - `PokeCollectionCue`, `PokePlaySound`, `PokeOpenBatch`, `PokeInspect`,
 *   `PokeAlbumIndex`: orquestación y efectos de UI.
 * - `localStorage` (`-journey`) y `requestAnimationFrame`/timers.
 * - Canvas real: `createRewardPreviews` recibe una fábrica de canvas y un
 *   thumbnail de respaldo inyectados; el motor de imágenes los implementa.
 */

import { model } from './preference';
import type { Comparison } from './preference';

export interface JourneyVote {
  readonly value: 'yes' | 'no';
  readonly time?: number;
}

export interface JourneyHistoryEntry {
  /** El legacy normaliza con `Number(h.id)`. */
  readonly id: number | string;
}

export interface JourneyState {
  readonly votes: Readonly<Record<number, JourneyVote | undefined>>;
  readonly history?: readonly JourneyHistoryEntry[];
  readonly revision?: number;
  readonly comparisons?: readonly Comparison[];
}

/** Mínimo estructural que la progresión necesita de una carta. */
export interface JourneyCard {
  readonly id: number;
}

export const BATCH_SIZE = 15;
export const TEAM_SIZE = 6;
/** Cursor máximo de progreso dibujado por la UI legacy. */
export const ARC_LENGTH = 144.52;

export function favoriteCount(state: JourneyState): number {
  return Object.values(state.votes).filter((vote) => vote?.value === 'yes').length;
}

/**
 * Favoritos ordenados por afinidad, luego por antigüedad del voto y, por
 * último, por id. Es la misma base que usan el equipo y el playmat.
 */
export function favorites<Card extends JourneyCard>(
  cards: readonly Card[],
  state: JourneyState,
): Card[] {
  const fitted = model(state);
  return cards
    .filter((card) => state.votes[card.id]?.value === 'yes')
    .sort(
      (a, b) =>
        fitted.score(b.id) - fitted.score(a.id) ||
        (state.votes[a.id]?.time ?? 0) - (state.votes[b.id]?.time ?? 0) ||
        a.id - b.id,
    );
}

/**
 * Cartas descubiertas (con voto, sí o no) en el orden del historial y luego
 * por hora del voto. El orden numérico de las claves enteras del objeto
 * `votes` es el mismo que observa el legacy a través de `Object.keys`.
 */
export function discoveries<Card extends JourneyCard>(
  cards: readonly Card[],
  state: JourneyState,
): Card[] {
  const byId = new Map(cards.map((card) => [card.id, card] as const));
  const ids = [
    ...new Set([
      ...(state.history ?? []).map((entry) => Number(entry.id)),
      ...Object.keys(state.votes)
        .map(Number)
        .sort((a, b) => (state.votes[a]?.time ?? 0) - (state.votes[b]?.time ?? 0) || a - b),
    ]),
  ];

  return ids.flatMap((id) => {
    const card = byId.get(id);
    return state.votes[id] && card ? [card] : [];
  });
}

export interface BatchComputation<Card extends JourneyCard> {
  /** Tandas visibles, de la más antigua a la más reciente. */
  readonly groups: readonly (readonly Card[])[];
  /** Ids de las tandas completas que deben persistirse en `seen`. */
  readonly completed: readonly (readonly number[])[];
}

/**
 * Calcula las tandas visibles a partir de las tandas completas persistidas.
 *
 * - Recorta por el final las tandas completas que ya no son válidas (alguna
 *   carta perdió su voto). Esto reproduce el comportamiento "reabrir al hacer
 *   undo" sin tocar tandas anteriores.
 * - Agrupa los favoritos restantes de 15 en 15 y deja como máximo una tanda
 *   parcial activa.
 * - Devuelve la nueva lista de tandas completas para que la capa de
 *   persistencia la guarde. No escribe storage.
 */
export function batches<Card extends JourneyCard>(
  cards: readonly Card[],
  state: JourneyState,
  completed: readonly (readonly number[])[] = [],
): BatchComputation<Card> {
  const byId = new Map(cards.map((card) => [card.id, card] as const));
  const saved: number[][] = completed.map((ids) => [...ids]);
  const groups: Card[][] = saved.map((ids) =>
    ids.flatMap((id) => {
      const card = byId.get(id);
      return card ? [card] : [];
    }),
  );

  const usedIds = (): Set<number> => new Set(saved.flat());
  let used = usedIds();

  while (saved.length > 0) {
    const lastBatch = saved[saved.length - 1];
    if (!lastBatch?.some((id) => !state.votes[id])) break;
    saved.pop();
    groups.pop();
    used = usedIds();
  }

  const remaining = discoveries(cards, state).filter(
    (card) => state.votes[card.id]?.value === 'yes' && !used.has(card.id),
  );

  while (remaining.length >= BATCH_SIZE) {
    const group = remaining.splice(0, BATCH_SIZE);
    saved.push(group.map((card) => card.id));
    groups.push(group);
  }

  if (remaining.length) groups.push(remaining);

  return { groups, completed: saved };
}

export interface JourneyProgress {
  /** Cartas de la tanda activa (0–15). */
  readonly step: number;
  readonly target: number;
  readonly likes: number;
  readonly discovered: number;
  readonly total: number;
  readonly completedBatches: number;
  readonly almostComplete: boolean;
  readonly complete: boolean;
  /** `strokeDashoffset` del anillo de progreso. */
  readonly arcDashoffset: number;
  /** `maskImage` del anillo; el legacy limita el conic-gradient a 360°. */
  readonly arcMask: string;
  readonly arcOpacity: number;
  /** Escala y opacidad de la luz de la tanda. */
  readonly lightScale: number;
  readonly lightOpacity: number;
  /** Perlitas de tandas completas (máximo 5). */
  readonly pearls: string;
  /** Texto accesible del botón que abre la colección. */
  readonly collectionLabel: string;
  readonly journeyLabel: string;
  readonly journeyProgressText: string;
  readonly activeIds: readonly number[];
}

/** Métricas y textos derivados que consume la presentación. */
export function progress<Card extends JourneyCard>(
  cards: readonly Card[],
  state: JourneyState,
  groups: readonly (readonly Card[])[],
): JourneyProgress {
  const active = groups.at(-1) ?? [];
  const step = active.length;
  const likes = favoriteCount(state);
  const discovered = Object.keys(state.votes).length;
  const total = cards.length;
  const completed = groups.filter((group) => group.length === BATCH_SIZE).length;
  const complete = discovered === total;

  return {
    step,
    target: BATCH_SIZE,
    likes,
    discovered,
    total,
    completedBatches: completed,
    almostComplete: step >= 12,
    complete,
    arcDashoffset: ARC_LENGTH * (1 - step / BATCH_SIZE),
    arcMask: `conic-gradient(black ${(step / BATCH_SIZE) * 360}deg,transparent 0deg)`,
    arcOpacity: 1,
    lightScale: 0.28 + (step / BATCH_SIZE) * 0.85,
    lightOpacity: 0.12 + (step / BATCH_SIZE) * 0.2,
    pearls: '●'.repeat(Math.min(5, completed)),
    collectionLabel: `Tu colección, ${likes} favoritos. Tanda: ${step} de ${BATCH_SIZE}. ${discovered} de ${total} descubiertos.`,
    journeyLabel: complete ? 'Tu universo Pokémon' : 'Tu playmat está tomando forma',
    journeyProgressText: `${discovered} / ${total}`,
    activeIds: active.map((card) => card.id),
  };
}

/**
 * Detecta la carta que acaba de entrar en la tanda activa para animarla.
 *
 * Reproduce la condición del legacy: solo cuenta si la tanda cambió, creció
 * (o se reinició desde una tanda completa) y la última carta tiene voto `yes`.
 * `previousActiveIds` es el estado de la llamada anterior (`null` al inicio).
 */
export function newFavorite<Card extends JourneyCard>(
  previousActiveIds: readonly number[] | null,
  groups: readonly (readonly Card[])[],
  state: JourneyState,
): number | null {
  if (previousActiveIds === null) return null;

  const active = groups.at(-1) ?? [];
  const step = active.length;
  if (step === 0) return null;

  const signature = active.map((card) => card.id).join(',');
  const previousSignature = previousActiveIds.join(',');
  if (signature === previousSignature) return null;

  const grew = step > previousActiveIds.length;
  const restarted = previousActiveIds.length === BATCH_SIZE && step === 1;
  if (!grew && !restarted) return null;

  const last = active[active.length - 1];
  if (!last || state.votes[last.id]?.value !== 'yes') return null;
  return last.id;
}

/** Ids del equipo (primeros 6 favoritos). */
export function team<Card extends JourneyCard>(
  cards: readonly Card[],
  state: JourneyState,
): number[] {
  return favorites(cards, state)
    .slice(0, TEAM_SIZE)
    .map((card) => card.id);
}

/** Copia de las tandas para exportar sin exponer los arrays internos. */
export function exportGroups<Card extends JourneyCard>(
  cards: readonly Card[],
  state: JourneyState,
  completed: readonly (readonly number[])[] = [],
): Card[][] {
  return batches(cards, state, completed).groups.map((group) => [...group]);
}

export type JourneyReward =
  | { readonly kind: 'finished'; readonly key: 'finished' }
  | { readonly kind: 'batch'; readonly key: string; readonly ids: readonly number[] };

export interface CelebrationResult {
  /** Recompensas nuevas, en el mismo orden que el legacy: fin, luego tanda. */
  readonly rewards: readonly JourneyReward[];
  /** Estado de recompensas ya vistas; incluye las nuevas. */
  readonly seen: Readonly<Record<string, boolean>>;
}

/**
 * Decide qué recompensas corresponden y actualiza el registro `seen`.
 *
 * La escritura en `localStorage` y los efectos visuales/sonoros quedan en la
 * capa de aplicación: si `rewards` está vacío no debe animarse nada.
 */
export function celebration<Card extends JourneyCard>(
  cards: readonly Card[],
  state: JourneyState,
  groups: readonly (readonly Card[])[],
  seen: Readonly<Record<string, boolean>> = {},
): CelebrationResult {
  const discovered = Object.keys(state.votes).length;
  const active = groups.at(-1) ?? [];
  const finished = discovered === cards.length ? 'finished' : null;
  const round =
    active.length === BATCH_SIZE ? `batch-${active.map((card) => card.id).join('-')}` : null;

  const rewards: JourneyReward[] = [];
  if (finished && !seen[finished]) {
    rewards.push({ kind: 'finished', key: 'finished' });
  }
  if (round && !seen[round]) {
    rewards.push({
      kind: 'batch',
      key: round,
      ids: active.map((card) => card.id),
    });
  }

  if (!rewards.length) return { rewards, seen };

  const nextSeen: Record<string, boolean> = { ...seen };
  for (const reward of rewards) nextSeen[reward.key] = true;
  return { rewards, seen: nextSeen };
}

export interface PlaymatPosition {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly scale: number;
}

/** Posiciones del abanico, de la carta central hacia los extremos. */
export const PLAYMAT_POSITIONS: readonly PlaymatPosition[] = [
  { x: 0.5, y: 0.48, angle: 0, scale: 1.14 },
  { x: 0.32, y: 0.51, angle: -10, scale: 0.95 },
  { x: 0.68, y: 0.51, angle: 10, scale: 0.95 },
  { x: 0.17, y: 0.53, angle: -17, scale: 0.82 },
  { x: 0.83, y: 0.53, angle: 17, scale: 0.82 },
  { x: 0.045, y: 0.56, angle: -22, scale: 0.69 },
  { x: 0.955, y: 0.56, angle: 22, scale: 0.69 },
];

export interface ComposeCard extends JourneyCard {
  readonly name: string;
  readonly palette?: { readonly h: number };
}

export interface PlaymatPlan<Card extends ComposeCard> {
  readonly selected: readonly Card[];
  /** Tono base; cae a 325 cuando no hay favoritos. */
  readonly hue: number;
  readonly caption: string;
  readonly ariaLabel: string;
  /** Posiciones para las cartas seleccionadas (máximo 6 en el legacy). */
  readonly slots: readonly PlaymatPosition[];
}

/** Selección y leyendas del playmat; el dibujo real pertenece al motor. */
export function composePlan<Card extends ComposeCard>(
  cards: readonly Card[],
  state: JourneyState,
): PlaymatPlan<Card> {
  const all = favorites(cards, state);
  const selected = all.slice(0, 6);
  const hue = selected[0]?.palette?.h ?? 325;

  return {
    selected,
    hue,
    caption: `pokéamor  ·  ${all.length} ♡`,
    ariaLabel: selected.length
      ? `Composición de ${selected.map((card) => card.name).join(', ')}`
      : 'Tu composición aparecerá al elegir un favorito',
    slots: PLAYMAT_POSITIONS.slice(0, selected.length),
  };
}

export const REWARD_PREVIEW_WIDTH = 96;
export const REWARD_PREVIEW_HEIGHT = 134;
export const REWARD_PREVIEW_CACHE_SIZE = 30;

/** Fuente ya decodificada que expone el motor de imágenes. */
export interface RewardImageSource {
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export interface RewardCanvasContext {
  drawImage(image: RewardImageSource, dx: number, dy: number, width: number, height: number): void;
}

/** Contrato mínimo de canvas; el motor entrega el elemento real. */
export interface RewardCanvas {
  width: number;
  height: number;
  setAttribute(name: string, value: string): void;
  getContext(contextId: '2d'): RewardCanvasContext | null;
}

export interface RewardPreviewCard {
  readonly card: string;
  readonly name?: string;
}

export interface RewardPreviewDeps<Canvas extends RewardCanvas> {
  readonly createCanvas: () => Canvas;
  /** Equivale a `PokeCards.key(card) || card.card`. */
  readonly keyOf: (card: RewardPreviewCard) => string;
  /** Equivale a `PokeResources.readyImage(card)`. */
  readonly readyImage?: (card: RewardPreviewCard) => RewardImageSource | null;
  /** Thumbnail normal cuando no hay arte lista o canvas disponible. */
  readonly fallbackThumbnail: (card: RewardPreviewCard) => Canvas;
  /** Equivale a `PokeResources.releaseImage`; se usa al desalojar la caché. */
  readonly releaseImage?: (image: Canvas) => void;
  readonly maxCached?: number;
}

export interface RewardPreviews<Canvas extends RewardCanvas> {
  /** Devuelve el canvas cacheado o crea uno nuevo. */
  get(card: RewardPreviewCard): Canvas;
  readonly size: number;
  has(card: RewardPreviewCard): boolean;
}

/**
 * Crea la caché de miniaturas de recompensa (96×134).
 *
 * El legacy copiaba el arte ya decodificada en un canvas con recorte "cover";
 * si no había arte lista o el canvas fallaba, usaba el thumbnail de red. Acá
 * esas dos operaciones se inyectan. La caché es LRU acotada (30 por defecto) y
 * libera la imagen desalojada mediante `releaseImage`.
 */
export function createRewardPreviews<Canvas extends RewardCanvas>(
  deps: RewardPreviewDeps<Canvas>,
): RewardPreviews<Canvas> {
  const maxCached = deps.maxCached ?? REWARD_PREVIEW_CACHE_SIZE;
  const cache = new Map<string, Canvas>();
  const keyOf = (card: RewardPreviewCard): string => deps.keyOf(card) || card.card;

  return {
    get(card) {
      const key = keyOf(card);
      const existing = cache.get(key);
      if (existing) return existing;

      let image: Canvas | undefined;
      const source = deps.readyImage?.(card);
      if (source) {
        try {
          const canvas = deps.createCanvas();
          canvas.width = REWARD_PREVIEW_WIDTH;
          canvas.height = REWARD_PREVIEW_HEIGHT;
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', card.name ?? '');
          const context = canvas.getContext('2d');
          if (context) {
            const scale = Math.min(
              REWARD_PREVIEW_WIDTH / source.naturalWidth,
              REWARD_PREVIEW_HEIGHT / source.naturalHeight,
            );
            const width = source.naturalWidth * scale;
            const height = source.naturalHeight * scale;
            context.drawImage(
              source,
              (REWARD_PREVIEW_WIDTH - width) / 2,
              (REWARD_PREVIEW_HEIGHT - height) / 2,
              width,
              height,
            );
            image = canvas;
          }
        } catch {
          // Un canvas no disponible cae al thumbnail normal, como el legacy.
        }
      }

      if (!image) image = deps.fallbackThumbnail(card);
      cache.set(key, image);

      if (cache.size > maxCached) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
          const evicted = cache.get(oldest);
          cache.delete(oldest);
          if (evicted) deps.releaseImage?.(evicted);
        }
      }

      return image;
    },
    get size() {
      return cache.size;
    },
    has(card) {
      return cache.has(keyOf(card));
    },
  };
}
