/**
 * Reglas de duelo: actualización Elo de las calificaciones (`chooseRefinement`).
 *
 * Extraído de `src/app.js` (`chooseRefinement` y `duel`). El módulo es puro e
 * independiente del framework: no toca Svelte, el DOM, `window`, storage ni
 * temporizadores.
 *
 * Contrato numérico preservado del legacy:
 * - Una calificación ausente vale `1000`.
 * - `expected = 1 / (1 + 10 ** ((ratingB - ratingA) / 400))`.
 * - `actual` es `1` si gana el primer id, `0` si gana el segundo y `0.5` en
 *   empate (`winner === 2`).
 * - El ajuste es de suma cero con `K = 28`: el primero suma
 *   `28 * (actual - expected)` y el segundo resta exactamente lo mismo.
 * - Cada participante incrementa `played` en uno y la entrada resultante
 *   contiene solo `{ score, played }`, igual que el legacy.
 *
 * Seams de presentación diferidos (no forman parte de esta regla):
 * - `inlineBusy` evita que un doble toque registre dos veces el mismo duelo.
 *   Ese candado pertenece a la capa de aplicación/UI; esta función es
 *   stateless y aplica exactamente una elección por llamada.
 * - `markBattleChoice`, `exitRefinement`, animaciones, sonido y háptica
 *   (`sound`, `tactile`, `adaptiveBlock`) quedan en presentación/aplicación.
 * - El alta del evento en `state.comparisons`, el contador `state.duels`, el
 *   historial para deshacer y la persistencia también son orquestación; aquí
 *   solo se devuelve la nueva foto de `ratings` y metadatos de la elección.
 */

/** Calificación inicial cuando todavía no existe una entrada. */
export const DEFAULT_RATING = 1000;

/** Constante K del ajuste Elo del legacy. */
export const RATING_K_FACTOR = 28;

/** Resultado de un duelo: `0` gana el primer id, `1` el segundo, `2` empate. */
export type DuelWinner = 0 | 1 | 2;

/** Entrada de calificación tal como se persiste en `state.ratings`. */
export interface RatingEntry {
  readonly score: number;
  readonly played: number;
}

/** Mapa de calificaciones por id de especie. */
export type Ratings = Readonly<Record<number, RatingEntry | undefined>>;

/** Elección de un duelo entre dos especies. */
export interface DuelChoice {
  /** Ids enfrentados en el orden en que se muestran. */
  readonly ids: readonly [number, number];
  readonly winner: DuelWinner;
}

/** Cambio aplicado a una de las dos especies del duelo. */
export interface RatingChange {
  readonly id: number;
  readonly previousScore: number;
  readonly previousPlayed: number;
  readonly score: number;
  readonly played: number;
}

/** Resultado puro de aplicar una elección de duelo. */
export interface DuelRatingUpdate {
  /** Nueva foto inmutable; el mapa de entrada no se muta. */
  readonly ratings: Ratings;
  /** Ganador tal como llegó (`2` significa empate). */
  readonly winner: DuelWinner;
  /** Objetivo normalizado: `1`, `0` o `0.5`. */
  readonly actual: number;
  /** Probabilidad esperada de que ganara el primer id. */
  readonly expected: number;
  /** Ajuste aplicado al primer id (el segundo recibe el opuesto). */
  readonly delta: number;
  /** Detalle de las dos entradas escritas, en orden de aplicación. */
  readonly changes: readonly RatingChange[];
}

/** Calificación de `id`; replica `state.ratings[id]?.score || 1000`. */
export function scoreOf(ratings: Ratings, id: number): number {
  return ratings[id]?.score || DEFAULT_RATING;
}

/** Cantidad de duelos jugados por `id`; replica `state.ratings[id]?.played || 0`. */
export function playedOf(ratings: Ratings, id: number): number {
  return ratings[id]?.played || 0;
}

/** Probabilidad Elo de que el primer rating gane al segundo. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** Objetivo del ajuste para un resultado: victoria, derrota o empate. */
export function actualScore(winner: DuelWinner): number {
  return winner === 2 ? 0.5 : winner === 0 ? 1 : 0;
}

/**
 * Aplica una elección de duelo y devuelve la nueva foto de calificaciones.
 *
 * Las dos calificaciones base se leen antes de escribir, como en el legacy.
 * El orden de escritura se conserva para que una entrada `played` repetida
 * (ids iguales, caso que la selección de parejas nunca produce) también
 * replique el comportamiento original.
 */
export function applyDuel(ratings: Ratings, choice: DuelChoice): DuelRatingUpdate {
  const [firstId, secondId] = choice.ids;
  const firstScore = scoreOf(ratings, firstId);
  const secondScore = scoreOf(ratings, secondId);
  const expected = expectedScore(firstScore, secondScore);
  const actual = actualScore(choice.winner);
  const delta = RATING_K_FACTOR * (actual - expected);

  const next: Record<number, RatingEntry | undefined> = { ...ratings };
  const changes: RatingChange[] = [];

  const firstPreviousPlayed = playedOf(ratings, firstId);
  const first: RatingEntry = {
    score: firstScore + delta,
    played: firstPreviousPlayed + 1,
  };
  next[firstId] = first;
  changes.push({
    id: firstId,
    previousScore: firstScore,
    previousPlayed: firstPreviousPlayed,
    score: first.score,
    played: first.played,
  });

  // En el legacy `played` se relee del estado ya actualizado.
  const secondPreviousPlayed = playedOf(next, secondId);
  const second: RatingEntry = {
    score: secondScore - delta,
    played: secondPreviousPlayed + 1,
  };
  next[secondId] = second;
  changes.push({
    id: secondId,
    previousScore: secondScore,
    previousPlayed: secondPreviousPlayed,
    score: second.score,
    played: second.played,
  });

  return { ratings: next, winner: choice.winner, actual, expected, delta, changes };
}
