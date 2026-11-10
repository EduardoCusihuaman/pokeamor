/**
 * Migración de `tests/28-battle-image-loading.test.mjs` — gate de arte.
 *
 * Se conservan las dos aserciones legacy: una imagen `complete` pero vacía
 * espera la decodificación exacta en vez de fallar, y una preparación fallida
 * queda reintentable (el sprite/fallback nunca cuenta como listo).
 */

import { describe, expect, it } from 'vitest';

import {
  prepareRefinementPair,
  type BattleArtwork,
  type BattleCard,
  type BattleTimerApi,
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
  card: BattleCard;
  art: BattleArtwork;
  session: RefinementSession;
  options: RefinementPreparationOptions;
  resolveArt: (ok: boolean) => void;
}

function setup(): Fixture {
  let resolveArt: (ok: boolean) => void = () => {};
  const card: BattleCard = { id: 1, card: 'print', name: 'Test', image: 'exact' };
  const art: BattleArtwork = {
    complete: true,
    naturalWidth: 0,
    cardReady: false,
    artReady: new Promise<boolean>((resolve) => {
      resolveArt = resolve;
    }),
  };
  const session: RefinementSession = {
    done: 0,
    target: 1,
    pairs: [[card, card]],
    ready: new Map(),
    favorites: '',
    resetAt: 0,
  };
  const warm = new Map<string, BattleArtwork>([['exact', art]]);
  const options: RefinementPreparationOptions = {
    warmArtwork() {},
    getWarmArt: (url) => warm.get(url),
    deleteWarmArt: (url) => {
      warm.delete(url);
    },
    fallback: () => 'sprite',
    isManualSession: () => false,
    timers: noTimers(),
  };

  return { card, art, session, options, resolveArt };
}

describe('battle image loading', () => {
  it('empty complete image waits for exact decoded artwork instead of failing battle', async () => {
    const fixture = setup();
    let finished = false;

    const ready = prepareRefinementPair(fixture.session, 0, fixture.options).then((ok) => {
      finished = true;
      return ok;
    });

    await Promise.resolve();
    expect(finished).toBe(false);

    fixture.art.cardReady = true;
    fixture.art.naturalWidth = 600;
    fixture.resolveArt(true);

    await expect(ready).resolves.toBe(true);
  });

  it('failed preparation remains retryable and sprite never counts as ready', async () => {
    const fixture = setup();

    const ready = prepareRefinementPair(fixture.session, 0, fixture.options);
    fixture.art.naturalWidth = 600;
    fixture.resolveArt(false);

    await expect(ready).resolves.toBe(false);
    expect(fixture.session.ready.has(0)).toBe(false);
  });
});
