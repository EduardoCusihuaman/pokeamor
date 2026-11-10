/**
 * Migración de `tests/30-battle-session.test.cjs` — preparación y validación.
 *
 * Se conservan las dos aserciones legacy: la preparación de la siguiente
 * pareja es single-flight y espera al decode, y un cambio de perfil invalida la
 * sesión mientras un rechazo de imagen resuelve `false` sin romper la promesa.
 */

import { describe, expect, it } from 'vitest';

import {
  prepareRefinementPair,
  refinementFavorites,
  validRefinementSession,
  type BattleArtwork,
  type BattleCard,
  type BattleTimerApi,
  type BattleVotes,
  type RefinementPreparationOptions,
  type RefinementSession,
} from '@/application/battle';

function noTimers(): BattleTimerApi {
  return {
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
}

interface Fixture {
  session: RefinementSession;
  art: BattleArtwork;
  card: BattleCard;
  catalog: readonly BattleCard[];
  votes: Record<number, { value: 'yes' | 'no' }>;
  options: RefinementPreparationOptions;
  loads: () => number;
  resolveArt: (ok: boolean) => void;
  rejectArt: (reason: unknown) => void;
}

function setup(): Fixture {
  let loads = 0;
  const card: BattleCard = { id: 1, card: 'print', name: 'Test', image: 'image' };
  const session: RefinementSession = {
    pairs: [[card, card]],
    ready: new Map(),
    favorites: '1:print',
    resetAt: 0,
    done: 0,
    target: 1,
  };

  let resolveArt: (ok: boolean) => void = () => {};
  let rejectArt: (reason: unknown) => void = () => {};
  const art: BattleArtwork = {
    naturalWidth: 200,
    cardReady: true,
    src: 'image',
    artReady: new Promise<boolean>((resolve, reject) => {
      resolveArt = resolve;
      rejectArt = reject;
    }),
  };

  const catalog: readonly BattleCard[] = [card];
  const votes: Record<number, { value: 'yes' | 'no' }> = { 1: { value: 'yes' } };
  const warm = new Map<string, BattleArtwork>([['image', art]]);

  const options: RefinementPreparationOptions = {
    warmArtwork() {
      loads += 1;
    },
    getWarmArt: (url) => warm.get(url),
    deleteWarmArt: (url) => {
      warm.delete(url);
    },
    fallback: () => '',
    isManualSession: () => false,
    timers: noTimers(),
  };

  return {
    session,
    art,
    card,
    catalog,
    votes,
    options,
    loads: () => loads,
    resolveArt,
    rejectArt,
  };
}

describe('battle session preparation', () => {
  it('next pair readiness is single flight and waits for decode', async () => {
    const test = setup();

    const first = prepareRefinementPair(test.session, 0, test.options);
    expect(first).toBe(prepareRefinementPair(test.session, 0, test.options));

    let ready = false;
    void first.then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(ready).toBe(false);

    test.resolveArt(true);
    await expect(first).resolves.toBe(true);
    expect(test.loads()).toBe(2);
  });

  it('failed image resolves safely and profile changes invalidate prepared sessions', async () => {
    const test = setup();
    const favorites = refinementFavorites(test.catalog, test.votes as BattleVotes);

    expect(validRefinementSession(test.session, favorites, 0)).toBe(true);

    test.votes[1] = { value: 'no' };
    const afterChange = refinementFavorites(test.catalog, test.votes as BattleVotes);
    expect(afterChange).not.toBe(favorites);
    expect(validRefinementSession(test.session, afterChange, 0)).toBe(false);

    const pending = prepareRefinementPair(test.session, 0, test.options);
    test.rejectArt(new Error('fail'));
    await expect(pending).resolves.toBe(false);
  });
});
