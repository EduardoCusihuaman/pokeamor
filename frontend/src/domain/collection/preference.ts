/**
 * Preferencia de especies: Bradley–Terry regularizado con repetición determinista.
 *
 * Extraído de `window.PokePreference` (`src/journey.js`). El módulo es puro e
 * independiente del framework: no toca Svelte, el DOM, `window` ni storage.
 *
 * Contratos preservados del código legacy:
 * - La fuerza de cada especie se ajusta con 80 épocas de Newton y un prior
 *   L2 de `0.8`; los empates (`winner === 2`) usan objetivo `0.5`.
 * - `model()` memoiza el último conjunto de comparaciones válidas por firma.
 * - `plan()` produce como máximo `limit` parejas (por defecto 3), nunca repite
 *   protagonistas dentro de una sesión y evita parejas recientes.
 * - El hash determinista depende de `seed`; por defecto es el número de
 *   comparaciones, igual que en el legacy.
 *
 * Única costura de presentación: los ids de carta son la identidad usada por
 * los votos y las comparaciones. El catálogo real (`Card`) cumple el contrato
 * estructural `PreferenceCard`, por lo que se puede pasar directamente.
 */

/** Resultado de un duelo: 0 gana el primer id, 1 gana el segundo, 2 empate. */
export type ComparisonWinner = 0 | 1 | 2;

export interface Comparison {
  readonly id: string;
  /** Ids de las dos especies enfrentadas. */
  readonly ids?: readonly number[];
  readonly winner: ComparisonWinner;
}

export interface PreferenceVote {
  readonly value: 'yes' | 'no';
  /** Marca temporal usada para desempatar favoritos. */
  readonly time?: number;
}

export interface PreferenceState {
  readonly votes: Readonly<Record<number, PreferenceVote | undefined>>;
  readonly comparisons?: readonly Comparison[];
}

/** Mínimo estructural que la preferencia necesita de una carta. */
export interface PreferenceCard {
  readonly id: number;
}

export interface PreferenceModel {
  /** Cantidad de comparaciones válidas usadas para el ajuste. */
  readonly events: number;
  /** Veces que cada especie participó en un duelo. */
  readonly played: Readonly<Record<number, number>>;
  /** Fuerza estimada; `0` para ids desconocidos. */
  score(id: number): number;
}

export interface PlanOptions {
  /** Cantidad máxima de parejas. Por defecto 3. */
  readonly limit?: number;
  /** Semilla del desempate. Por defecto, el número de comparaciones. */
  readonly seed?: number;
}

type ValidComparison = Comparison & { readonly ids: readonly [number, number] };

const PRIOR = 0.8;
const EPOCHS = 80;

let cachedSignature = '';
let cachedModel: PreferenceModel | undefined;

function isValidWinner(value: number): value is ComparisonWinner {
  return value === 0 || value === 1 || value === 2;
}

function validComparisons(state: PreferenceState): ValidComparison[] {
  return (state.comparisons ?? []).filter((event): event is ValidComparison => {
    const ids = event.ids;
    return Array.isArray(ids) && ids.length === 2 && isValidWinner(event.winner);
  });
}

/**
 * Ajusta el modelo Bradley–Terry a las comparaciones del estado.
 * La memoización replica el cache de una sola entrada del legacy.
 */
export function model(state: PreferenceState): PreferenceModel {
  const events = validComparisons(state);
  const signature = JSON.stringify(events.map((event) => [event.id, event.ids, event.winner]));
  if (signature === cachedSignature && cachedModel) return cachedModel;

  const ids = [...new Set(events.flatMap((event) => [...event.ids]))];
  const index = new Map(ids.map((id, position) => [id, position] as const));
  const values = new Float64Array(ids.length);
  const played: Record<number, number> = {};

  for (const event of events) {
    for (const id of event.ids) played[id] = (played[id] ?? 0) + 1;
  }

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const gradient = Float64Array.from(values, (value) => -PRIOR * value);
    const curvature = new Float64Array(ids.length).fill(PRIOR);

    for (const event of events) {
      const a = index.get(event.ids[0]);
      const b = index.get(event.ids[1]);
      if (a === undefined || b === undefined) continue;

      const valueA = values[a] ?? 0;
      const valueB = values[b] ?? 0;
      const probability = 1 / (1 + Math.exp(valueB - valueA));
      const target = event.winner === 2 ? 0.5 : event.winner === 0 ? 1 : 0;
      const delta = target - probability;
      const weight = probability * (1 - probability);

      gradient[a] = (gradient[a] ?? 0) + delta;
      gradient[b] = (gradient[b] ?? 0) - delta;
      curvature[a] = (curvature[a] ?? 0) + weight;
      curvature[b] = (curvature[b] ?? 0) + weight;
    }

    for (let position = 0; position < values.length; position++) {
      values[position] =
        (values[position] ?? 0) +
        (0.5 * (gradient[position] ?? 0)) / (curvature[position] ?? PRIOR);
    }
  }

  const score = (id: number): number => {
    const position = index.get(Number(id));
    if (position === undefined) return 0;
    return (values[position] ?? 0) || 0;
  };

  const result: PreferenceModel = { events: events.length, played, score };
  cachedSignature = signature;
  cachedModel = result;
  return result;
}

/**
 * Favoritos ordenados por afinidad personal.
 * Solo incluye votos `yes` que hayan participado en al menos un duelo.
 */
export function ranked<Card extends PreferenceCard>(
  cards: readonly Card[],
  state: PreferenceState,
): Card[] {
  const fitted = model(state);
  return cards
    .filter((card) => state.votes[card.id]?.value === 'yes' && fitted.played[card.id])
    .sort((a, b) => fitted.score(b.id) - fitted.score(a.id) || a.id - b.id);
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function hashId(id: number, seed: number): number {
  let value = (Number(id) ^ Math.imul(seed + 1, 2654435761)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 2246822507);
  return (value ^ (value >>> 13)) >>> 0;
}

/**
 * Planifica las parejas de una sesión de duelos.
 *
 * Invariantes:
 * - `target = min(limit, floor(likes / 2))`, así que con menos de dos
 *   favoritos no hay parejas.
 * - Ninguna carta aparece dos veces en el plan.
 * - La primera pareja evita a los protagonistas de la última comparación.
 * - Las parejas exactas recientes (`events.length - 6`) se postengan cuando
 *   hay alternativas.
 */
export function plan<Card extends PreferenceCard>(
  cards: readonly Card[],
  state: PreferenceState,
  options: PlanOptions = {},
): [Card, Card][] {
  const { limit = 3 } = options;
  const events = state.comparisons ?? [];
  const seed = options.seed ?? events.length;
  const fitted = model(state);
  const likes = cards.filter((card) => state.votes[card.id]?.value === 'yes');
  const target = Math.min(limit, Math.floor(likes.length / 2));
  if (!target) return [];

  const pairSeed = (a: number, b: number): string => pairKey(a, b);
  const hash = (id: number): number => hashId(id, seed);
  const last = new Map<number, number>();
  const pairLast = new Map<string, number>();

  events.forEach((event, position) => {
    for (const id of event.ids ?? []) last.set(id, position);
    const ids = event.ids;
    if (ids?.length === 2) {
      const first = ids[0];
      const second = ids[1];
      if (first !== undefined && second !== undefined) {
        pairLast.set(pairSeed(first, second), position);
      }
    }
  });

  const tie = (a: Card, b: Card): number => hash(a.id) - hash(b.id) || a.id - b.id;
  const played = (card: Card): number => fitted.played[card.id] ?? 0;

  const rankedLikes = [...likes].sort(
    (a, b) => fitted.score(b.id) - fitted.score(a.id) || tie(a, b),
  );
  const top = new Set(rankedLikes.slice(0, 8).map((card) => card.id));
  const edgeCard = rankedLikes[Math.min(7, rankedLikes.length - 1)];
  const edge = edgeCard ? fitted.score(edgeCard.id) : 0;

  const lanes: Card[][] = [
    [...likes].sort((a, b) => played(a) - played(b) || tie(a, b)),
    rankedLikes,
    [...likes].sort((a, b) => (last.get(a.id) ?? -1) - (last.get(b.id) ?? -1) || tie(a, b)),
    [...likes].sort(
      (a, b) =>
        Math.abs(fitted.score(a.id) - edge) - Math.abs(fitted.score(b.id) - edge) || tie(a, b),
    ),
  ];

  const pool: Card[] = [];
  const poolIds = new Set<number>();
  const poolSize = Math.min(32, likes.length);
  for (let position = 0; pool.length < poolSize; position++) {
    for (const lane of lanes) {
      const card = lane[position];
      if (card && !poolIds.has(card.id)) {
        poolIds.add(card.id);
        pool.push(card);
        if (pool.length === poolSize) break;
      }
    }
  }

  const used = new Set<number>();
  const out: [Card, Card][] = [];
  const previous = new Set<number>(events.at(-1)?.ids ?? []);

  for (let slot = 0; slot < target; slot++) {
    const pairs: {
      a: Card;
      b: Card;
      rest: number;
      recent: number;
      prior: number;
      value: number;
      tie: number;
    }[] = [];

    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i];
        const b = pool[j];
        if (!a || !b || used.has(a.id) || used.has(b.id)) continue;

        const prior = pairLast.get(pairSeed(a.id, b.id)) ?? -1;
        const recent = prior >= Math.max(0, events.length - 6);
        const rest = slot === 0 && (previous.has(a.id) || previous.has(b.id));
        const probability = 1 / (1 + Math.exp(fitted.score(b.id) - fitted.score(a.id)));
        const balance = 4 * probability * (1 - probability);
        const exposure = (1 / Math.sqrt(1 + played(a)) + 1 / Math.sqrt(1 + played(b))) / 2;
        const anchored = Number(played(a) > 0 !== played(b) > 0);
        const relevance = (Number(top.has(a.id)) + Number(top.has(b.id))) / 2;
        const age =
          (events.length - (last.get(a.id) ?? -1) + (events.length - (last.get(b.id) ?? -1))) /
          (2 * (events.length + 1));
        const value =
          balance +
          (slot === 0 ? 0.8 : 0.25) * exposure +
          (slot === 1 ? 0.6 : 0.2) * relevance +
          0.2 * age +
          0.15 * anchored;

        pairs.push({
          a,
          b,
          rest: Number(rest),
          recent: Number(recent),
          prior,
          value,
          tie: hash(a.id) ^ hash(b.id),
        });
      }
    }

    pairs.sort(
      (x, y) =>
        x.rest - y.rest ||
        x.recent - y.recent ||
        (x.recent ? x.prior - y.prior : 0) ||
        y.value - x.value ||
        x.tie - y.tie ||
        x.a.id - y.a.id ||
        x.b.id - y.b.id,
    );

    const best = pairs[0];
    if (!best) break;
    used.add(best.a.id);
    used.add(best.b.id);
    out.push(hash(best.a.id) & 1 ? [best.a, best.b] : [best.b, best.a]);
  }

  return out;
}

/** Primera pareja del plan o `null` si no hay suficientes favoritos. */
export function pair<Card extends PreferenceCard>(
  cards: readonly Card[],
  state: PreferenceState,
): [Card, Card] | null {
  return plan(cards, state, { limit: 1 })[0] ?? null;
}
