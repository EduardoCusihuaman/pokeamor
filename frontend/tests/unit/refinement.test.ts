// Migración de tests/32-refinement.test.cjs — domain/battle/refinement.
// Los casos legacy ejecutaban `chooseRefinement` completo con `node:vm`; aquí se
// prueba la regla pura importando el módulo TypeScript directamente.
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RATING,
  RATING_K_FACTOR,
  actualScore,
  applyDuel,
  expectedScore,
  playedOf,
  scoreOf,
} from '../../src/domain/battle/refinement';
import type { Ratings } from '../../src/domain/battle/refinement';

interface LegacyVotes {
  readonly [id: number]: { readonly value: 'yes' | 'no' };
}

interface LegacyFixture {
  readonly votes: LegacyVotes;
  readonly ratings: Ratings;
  readonly duels: number;
}

function setup(): LegacyFixture {
  return {
    votes: { 1: { value: 'yes' }, 2: { value: 'yes' } },
    ratings: {},
    duels: 0,
  };
}

describe('chooseRefinement (rating update)', () => {
  it('comparison ranks favorites without changing votes or batch progress', () => {
    const state = setup();
    const before = JSON.stringify(state.votes);

    const update = applyDuel(state.ratings, { ids: [1, 2], winner: 0 });

    // Votos y progreso de colección no participan en la regla de ratings.
    expect(JSON.stringify(state.votes)).toBe(before);
    expect(state.duels).toBe(0);

    // El ganador queda por delante y ambos registran el duelo jugado.
    expect(scoreOf(update.ratings, 1)).toBeGreaterThan(scoreOf(update.ratings, 2));
    expect(playedOf(update.ratings, 1)).toBe(1);
    expect(playedOf(update.ratings, 2)).toBe(1);

    // Valores exactos del legacy: 1000 vs 1000, K = 28, victoria del primero.
    expect(scoreOf(update.ratings, 1)).toBe(1014);
    expect(scoreOf(update.ratings, 2)).toBe(986);
    expect(update.delta).toBe(14);
    expect(update.changes).toHaveLength(2);

    // La entrada original no se muta: la aplicación reemplaza la foto.
    expect(state.ratings).toEqual({});
  });

  it('tie preserves equal scores and repeated taps cannot submit twice', () => {
    const state = setup();

    const tie = applyDuel(state.ratings, { ids: [1, 2], winner: 2 });
    expect(scoreOf(tie.ratings, 1)).toBe(scoreOf(tie.ratings, 2));
    expect(tie.ratings[1]).toEqual({ score: DEFAULT_RATING, played: 1 });
    expect(tie.ratings[2]).toEqual({ score: DEFAULT_RATING, played: 1 });
    expect(tie.changes).toHaveLength(2);

    // El legacy impedía el doble envío con `inlineBusy`, un candado de la capa
    // de aplicación/UI. La regla pura es stateless: una llamada aceptada produce
    // exactamente un cambio por participante (y el caller debe subir `duels`
    // una sola vez). Ese guard se verifica en la migración de la aplicación.
    expect(tie.actual).toBe(0.5);
    expect(tie.expected).toBe(0.5);
    expect(tie.delta).toBe(0);
  });

  it('applies the exact Elo formula to existing asymmetric ratings', () => {
    const ratings: Ratings = {
      1: { score: 1200, played: 4 },
      2: { score: 1000, played: 2 },
    };

    const update = applyDuel(ratings, { ids: [1, 2], winner: 1 });
    const expected = 1 / (1 + 10 ** ((1000 - 1200) / 400));
    const delta = RATING_K_FACTOR * (0 - expected);

    expect(update.expected).toBe(expected);
    expect(update.actual).toBe(actualScore(1));
    expect(update.delta).toBe(delta);
    expect(scoreOf(update.ratings, 1)).toBe(1200 + delta);
    expect(scoreOf(update.ratings, 2)).toBe(1000 - delta);
    expect(playedOf(update.ratings, 1)).toBe(5);
    expect(playedOf(update.ratings, 2)).toBe(3);

    // La expectativa coincide con el helper Elo exportado.
    expect(expectedScore(1200, 1000)).toBe(expected);
    // Los ratings previos siguen intactos.
    expect(ratings).toEqual({
      1: { score: 1200, played: 4 },
      2: { score: 1000, played: 2 },
    });
  });
});
