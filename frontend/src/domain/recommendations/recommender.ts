/**
 * Modelo de recomendaciones online (logístico + Bradley–Terry).
 *
 * Puerto puro de `src/recommender.js`. No importa Svelte, componentes, DOM ni
 * `window`: recibe explícitamente el catálogo y el estado, y expone funciones
 * puras para poder probarlas directamente en Node. El manejo de mensajes del
 * Worker se conserva como un entrypoint pequeño que delega en esas funciones.
 *
 * Convenciones del modelo (idénticas al legacy):
 * - `votes` alimenta el modelo logístico de aceptación (`yes`).
 * - `encounters` (reencuentros alternativos) aporta evidencia con peso 0.35 y
 *   no marca a la especie como vista.
 * - `comparisons` (duelos) entrena un segundo modelo de ranking. Los duelos no
 *   alteran la probabilidad de aceptación.
 */

import type { SpeciesId } from '@/domain/catalog';

/** Carta mínima que consume el modelo; `src/app.js` envía solo estos campos. */
export interface RecommenderCatalogEntry {
  readonly id: SpeciesId;
  readonly traits?: readonly string[];
  readonly communityVotes2020?: number;
}

/** Voto de aceptación persistido por especie. */
export interface RecommenderVote {
  readonly value: 'yes' | 'no';
  readonly time?: number;
  readonly card?: string;
}

/** Reencuentro con una impresión alternativa; no cuenta como voto. */
export interface RecommenderEncounter {
  readonly id: SpeciesId;
  readonly value: 'yes' | 'no';
  readonly card?: string;
  readonly checkpoint?: number;
  readonly time?: number;
}

/** Duelo entre dos especies. `winner: 2` representa un empate. */
export interface RecommenderComparison {
  readonly ids?: readonly [SpeciesId, SpeciesId];
  readonly winner?: 0 | 1 | 2;
}

/** Estado que el Worker recibe desde `engineState()` en `src/app.js`. */
export interface RecommenderState {
  readonly votes?: Readonly<Record<string, RecommenderVote>>;
  readonly encounters?: Readonly<Record<string, RecommenderEncounter>>;
  readonly comparisons?: readonly RecommenderComparison[];
}

/** Par `[índice, valor]` dentro del vector disperso de una carta. */
export type RecommenderFeature = readonly [index: number, value: number];

/** Índice de características construido una vez por catálogo. */
export interface RecommenderIndex {
  readonly items: readonly RecommenderCatalogEntry[];
  readonly vectors: ReadonlyMap<SpeciesId, readonly RecommenderFeature[]>;
  readonly dimensions: number;
}

/** Parámetros entrenados por `trainRecommenderModel`. */
export interface RecommenderModel {
  /** Pesos del modelo de aceptación personal. */
  readonly yes: Float32Array;
  /** Pesos del modelo de preferencia relativa (duelos). */
  readonly rank: Float32Array;
  /** Frecuencia de cada característica en los votos observados. */
  readonly counts: Float32Array;
  /** Cantidad de votos usados para entrenar. */
  readonly observations: number;
  /** Conteo `[yes, no]` de reencuentros por especie. */
  readonly repeats: Readonly<Record<string, readonly [number, number]>>;
}

/** Puntaje de una carta candidata. */
export interface RecommendationScore {
  readonly id: SpeciesId;
  /** Probabilidad de aceptación según el modelo personal. */
  readonly p: number;
  /** Incertidumbre del vector (para exploración). */
  readonly u: number;
  /** Puntaje combinado usado para ordenar. */
  readonly score: number;
  /** Conteo `[yes, no]` de reencuentros, o `null` si no hubo. */
  readonly consistency: readonly [number, number] | null;
}

/** Resultado de separar candidatos vistos y ordenar los no vistos. */
export interface CandidateRanking {
  readonly unseen: readonly RecommendationScore[];
  /** Orden por puntaje combinado. */
  readonly ranked: readonly RecommendationScore[];
  /** Orden que prioriza incertidumbre. */
  readonly exploration: readonly RecommendationScore[];
}

/** Resultado del cómputo completo, con la misma forma que el legacy. */
export interface Recommendation {
  readonly ids: number[];
  readonly scores: RecommendationScore[];
  readonly ms: number;
  readonly observations: number;
}

/** Normaliza `x` y aplica la sigmoide, recortando el exponente a [-20, 20]. */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, x))));
}

/** Producto punto de pesos dispersos contra un vector de características. */
export function dotProduct(
  weights: ArrayLike<number>,
  features: readonly RecommenderFeature[],
): number {
  let value = 0;
  for (const [index, feature] of features) {
    value += (weights[index] ?? 0) * feature;
  }
  return value;
}

/**
 * Un paso de descenso logístico con regularización L2.
 *
 * Muta `weights` en sitio, igual que el modelo legacy. `target` es 1 para
 * aceptación y 0 para rechazo; `sampleWeight` permite dar menos peso a la
 * evidencia de reencuentros.
 */
export function applyLogisticUpdate(
  weights: Float32Array,
  features: readonly RecommenderFeature[],
  target: number,
  sampleWeight = 1,
): void {
  const error = target - sigmoid(dotProduct(weights, features));
  for (const [index, feature] of features) {
    const current = weights[index] ?? 0;
    weights[index] = current + 0.12 * sampleWeight * (error * feature - 0.015 * current);
  }
}

/**
 * Construye el índice de características del catálogo.
 *
 * Además de `bias` y los rasgos directos, agrega una interacción
 * `type:<t>|color_id:<c>` por cada tipo cuando la carta tiene color. El valor
 * de cada rasgo se escala por `1 / sqrt(cantidad de valores - 1)`.
 */
export function createRecommenderIndex(
  catalog: readonly RecommenderCatalogEntry[],
): RecommenderIndex {
  const names = new Map<string, number>([['bias', 0]]);
  const vectors = new Map<SpeciesId, readonly RecommenderFeature[]>();

  for (const item of catalog) {
    const traits = item.traits ?? [];
    const values = ['bias', ...traits];
    const types = traits.filter((trait) => trait.startsWith('type:'));
    const color = traits.find((trait) => trait.startsWith('color_id:'));
    if (color) {
      for (const type of types) values.push(`${type}|${color}`);
    }

    const scale = 1 / Math.sqrt(Math.max(1, values.length - 1));
    vectors.set(
      item.id,
      values.map<RecommenderFeature>((feature) => {
        let index = names.get(feature);
        if (index === undefined) {
          index = names.size;
          names.set(feature, index);
        }
        return [index, feature === 'bias' ? 1 : scale];
      }),
    );
  }

  return { items: catalog, vectors, dimensions: names.size };
}

/**
 * Entrena ambos modelos a partir del estado.
 *
 * Los votos se recorren tres épocas en orden temporal. Los reencuentros se
 * aplican una vez con peso 0.35 y los duelos se recorren tres épocas sobre la
 * diferencia de vectores.
 */
export function trainRecommenderModel(
  index: RecommenderIndex,
  state: RecommenderState,
): RecommenderModel {
  const { votes = {}, encounters = {}, comparisons = [] } = state;
  const yes = new Float32Array(index.dimensions);
  const rank = new Float32Array(index.dimensions);
  const counts = new Float32Array(index.dimensions);

  const observations = Object.entries(votes).sort((a, b) => (a[1].time ?? 0) - (b[1].time ?? 0));

  for (let epoch = 0; epoch < 3; epoch += 1) {
    for (const [id, vote] of observations) {
      const features = index.vectors.get(Number(id));
      if (features) applyLogisticUpdate(yes, features, vote.value === 'yes' ? 1 : 0);
    }
  }

  for (const [id] of observations) {
    const features = index.vectors.get(Number(id));
    if (!features) continue;
    for (const [feature, value] of features) {
      counts[feature] = (counts[feature] ?? 0) + value * value;
    }
  }

  const repeats: Record<string, [number, number]> = {};
  for (const encounter of Object.values(encounters)) {
    const features = index.vectors.get(encounter.id);
    if (features) {
      applyLogisticUpdate(yes, features, encounter.value === 'yes' ? 1 : 0, 0.35);
    }
    const repeat = repeats[String(encounter.id)] ?? [1, 1];
    repeats[String(encounter.id)] = repeat;
    repeat[encounter.value === 'yes' ? 0 : 1] += 1;
  }

  for (let epoch = 0; epoch < 3; epoch += 1) {
    for (const comparison of comparisons) {
      const first = comparison.ids?.[0];
      const second = comparison.ids?.[1];
      if (first === undefined || second === undefined) continue;
      const a = index.vectors.get(first);
      const b = index.vectors.get(second);
      if (!a || !b) continue;

      const difference = new Map(a);
      for (const [feature, value] of b) {
        difference.set(feature, (difference.get(feature) ?? 0) - value);
      }
      const target = comparison.winner === 2 ? 0.5 : comparison.winner === 0 ? 1 : 0;
      applyLogisticUpdate(rank, [...difference], target);
    }
  }

  return { yes, rank, counts, observations: observations.length, repeats };
}

/**
 * Calcula el puntaje de cada carta del catálogo.
 *
 * Combina la probabilidad personal con el prior comunitario. La confianza crece
 * con la cantidad de votos y con la familiaridad (menor incertidumbre); el
 * término `0.04 * tanh(utilidad)` incorpora la preferencia por duelos sin
 * reemplazar la aceptación.
 */
export function scoreCandidates(
  index: RecommenderIndex,
  model: RecommenderModel,
): RecommendationScore[] {
  return index.items.map((item) => {
    const features = index.vectors.get(item.id) ?? [];
    const personal = sigmoid(dotProduct(model.yes, features));
    const utility = dotProduct(model.rank, features);

    let variance = 0;
    for (const [feature, value] of features) {
      variance += (value * value) / (1 + (model.counts[feature] ?? 0));
    }
    const uncertainty = Math.sqrt(variance);

    const prior = item.communityVotes2020
      ? Math.log1p(item.communityVotes2020) / Math.log1p(140559)
      : 0.45;
    const familiarity = 1 / (1 + uncertainty * 3);
    const strength = Math.min(0.85, model.observations / 100) * familiarity;

    return {
      id: item.id,
      p: personal,
      u: uncertainty,
      score: strength * personal + (1 - strength) * prior + 0.04 * Math.tanh(utility),
      consistency: model.repeats[String(item.id)] ?? null,
    };
  });
}

/** Separa los no votados y construye los dos órdenes que usa la cola. */
export function rankCandidates(
  scores: readonly RecommendationScore[],
  votes: RecommenderState['votes'],
): CandidateRanking {
  const unseen = scores.filter((candidate) => !votes?.[String(candidate.id)]);
  const ranked = [...unseen].sort((a, b) => b.score - a.score || a.id - b.id);
  const exploration = [...unseen].sort(
    (a, b) => b.score * 0.4 + b.u * 0.6 - (a.score * 0.4 + a.u * 0.6) || a.id - b.id,
  );
  return { unseen, ranked, exploration };
}

/**
 * Selecciona el orden final intercalando exploración.
 *
 * Cada quinto slot (índice 3 dentro del bloque de 5) toma el siguiente
 * candidato del orden por incertidumbre; el resto sigue el orden por puntaje.
 * Se preserva el corte temprano del legacy si una lista se agota.
 */
export function selectRecommendationQueue(
  ranked: readonly RecommendationScore[],
  exploration: readonly RecommendationScore[],
): number[] {
  const selected: number[] = [];
  const used = new Set<SpeciesId>();
  let rankedCursor = 0;
  let explorationCursor = 0;

  for (let slot = 0; selected.length < ranked.length; slot += 1) {
    const exploring = slot % 5 === 3;
    const list = exploring ? exploration : ranked;
    let position = exploring ? explorationCursor : rankedCursor;

    while (position < list.length && used.has(list[position]?.id ?? -1)) position += 1;
    const candidate = list[position];
    if (position >= list.length || !candidate) break;

    used.add(candidate.id);
    selected.push(candidate.id);
    if (exploring) explorationCursor = position + 1;
    else rankedCursor = position + 1;
  }

  return selected;
}

/** Cómputo completo: entrena, puntúa, ordena y selecciona. */
export function recommend(
  index: RecommenderIndex,
  state: RecommenderState,
  clock: () => number = () => performance.now(),
): Recommendation {
  const started = clock();
  const model = trainRecommenderModel(index, state);
  const scores = scoreCandidates(index, model);
  const { ranked, exploration } = rankCandidates(scores, state.votes);
  const ids = selectRecommendationQueue(ranked, exploration);
  return { ids, scores, ms: clock() - started, observations: model.observations };
}

/** Mensaje de inicialización enviado por `startEngine()`. */
export interface RecommenderInitMessage {
  readonly type: 'init';
  readonly catalog: readonly RecommenderCatalogEntry[];
  readonly state?: RecommenderState;
  readonly revision?: number;
}

/** Mensaje incremental enviado por `scheduleEngine()`. */
export interface RecommenderDeltaMessage {
  readonly type: 'delta';
  readonly votes?: Readonly<Record<string, RecommenderVote | null>>;
  readonly encounters?: Readonly<Record<string, RecommenderEncounter>>;
  readonly comparisons?: readonly RecommenderComparison[];
  /** El legacy reemplaza el perfil si cualquier mensaje trae `state`. */
  readonly state?: RecommenderState;
  readonly revision?: number;
}

/** Mensajes aceptados por el entrypoint del Worker. */
export type RecommenderRequest = RecommenderInitMessage | RecommenderDeltaMessage;

/** Respuesta exitosa: el resultado más la revisión que la originó. */
export type RecommenderResult = Recommendation & { readonly revision?: number };

/** Respuesta del Worker, incluyendo el canal de error del legacy. */
export type RecommenderResponse = RecommenderResult | { readonly error: string };

/** Estado mutable que el Worker conserva entre mensajes. */
export interface RecommenderSession {
  index: RecommenderIndex;
  profile: RecommenderState;
}

/** Sesión vacía, equivalente al estado inicial del script legacy. */
export function createRecommenderSession(): RecommenderSession {
  return { index: createRecommenderIndex([]), profile: { votes: {} } };
}

/**
 * Aplica un mensaje al estado de la sesión y devuelve la respuesta a publicar.
 *
 * `null` significa que el legacy no habría publicado nada: un `init` sin
 * `state` solo reconstruye el índice.
 */
export function handleRecommenderMessage(
  session: RecommenderSession,
  message: RecommenderRequest,
): RecommenderResult | null {
  if (message.type === 'init') session.index = createRecommenderIndex(message.catalog);
  if (message.state) session.profile = message.state;

  if (message.type === 'delta') {
    const votes: Record<string, RecommenderVote> = { ...(session.profile.votes ?? {}) };
    for (const [id, vote] of Object.entries(message.votes ?? {})) {
      if (vote) votes[id] = vote;
      else delete votes[id];
    }
    session.profile = {
      ...session.profile,
      votes,
      encounters: message.encounters,
      comparisons: message.comparisons,
    };
  }

  if (!message.state && message.type !== 'delta') return null;

  return { revision: message.revision, ...recommend(session.index, session.profile) };
}

/**
 * Entrypoint del Worker: crea el `onmessage` que publica resultados o errores.
 *
 * No usa `self` ni `window`; la infraestructura conecta el `postMessage` real.
 */
export function createRecommenderMessageHandler(
  postMessage: (response: RecommenderResponse) => void,
): (event: { readonly data: RecommenderRequest }) => void {
  const session = createRecommenderSession();

  return ({ data }) => {
    try {
      const response = handleRecommenderMessage(session, data);
      if (response) postMessage(response);
    } catch (error) {
      postMessage({ error: String(error) });
    }
  };
}
