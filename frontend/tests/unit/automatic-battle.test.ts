/**
 * Migración de `tests/31-automatic-battle.test.mjs` — precarga y promoción.
 *
 * Se conservan las cuatro aserciones legacy: la pareja espera ambas imágenes y
 * retiene esos nodos, un reset durante la carga no encola nada y libera ambos,
 * un fallo nunca monta una pareja parcial y la promoción espera al swipe
 * saliente y al dedo activo antes de fijar una única pareja.
 */

import { describe, expect, it } from 'vitest';

import {
  createAutomaticBattle,
  createBattlePromotion,
  type AutomaticBattleArtwork,
  type BattleCard,
  type BattlePromotionUi,
  type BattleRuntimeState,
} from '@/application/battle';

const pair: readonly BattleCard[] = [
  { id: 1, card: 'exact-a', name: 'A' },
  { id: 2, card: 'exact-b', name: 'B' },
];

interface PendingImage {
  readonly art: AutomaticBattleArtwork;
  readonly card: BattleCard;
  readonly resolve: (ok: boolean) => void;
}

function setup(): {
  battle: ReturnType<typeof createAutomaticBattle>;
  pending: PendingImage[];
  released: AutomaticBattleArtwork[];
  schedules: () => number;
  ready: (index: number) => void;
  setResetAt: (value: number) => void;
} {
  const pending: PendingImage[] = [];
  const released: AutomaticBattleArtwork[] = [];
  let schedules = 0;
  let resetAt = 0;
  const votes: Record<number, { value: 'yes' | 'no' }> = {
    1: { value: 'yes' },
    2: { value: 'yes' },
  };

  const battle = createAutomaticBattle({
    createImage: () => ({}),
    bindImage(art, card) {
      art.artReady = new Promise<boolean>((resolve) => {
        pending.push({ art, card, resolve });
      });
    },
    releaseImage(art) {
      released.push(art);
    },
    random: () => 0,
    getResetAt: () => resetAt,
    isFavorite: (card) => votes[card.id]?.value === 'yes',
    scheduleEvents() {
      schedules += 1;
    },
  });

  return {
    battle,
    pending,
    released,
    schedules: () => schedules,
    ready(index) {
      const entry = pending[index];
      if (!entry) throw new Error(`missing pending image ${String(index)}`);
      Object.assign(entry.art, {
        cardReady: true,
        resourceState: 'presentable',
        naturalWidth: 600,
      });
      entry.resolve(true);
    },
    setResetAt(value) {
      resetAt = value;
    },
  };
}

const flush = async (): Promise<void> => {
  for (let index = 0; index < 5; index++) await Promise.resolve();
};

describe('automatic battle', () => {
  it('waits for BOTH decoded images and retains those same image nodes', async () => {
    const test = setup();
    test.battle.prepare(pair);
    test.ready(0);
    await flush();
    expect(test.battle.state.queuedPair).toBeNull();

    test.battle.prepare(pair);
    expect(test.pending).toHaveLength(2);

    test.ready(1);
    await flush();
    expect(test.battle.state.queuedPair).toHaveLength(2);
    expect(test.schedules()).toBe(1);

    const first = test.pending[0];
    if (!first) throw new Error('missing first image');
    expect(
      test.battle.state.automaticBattle?.art.get(
        `${String(first.card.id)}:${String(first.card.card)}`,
      ),
    ).toBe(first.art);
  });

  it('reset while loading prevents stale pair from being queued and releases both images', async () => {
    const test = setup();
    test.battle.prepare(pair);
    test.setResetAt(99);
    test.ready(0);
    test.ready(1);
    await flush();

    expect(test.battle.state.queuedPair).toBeNull();
    expect(test.released).toHaveLength(2);
  });

  it('failed image never mounts a partial pair; retry can start fresh', async () => {
    const test = setup();
    test.battle.prepare(pair);
    test.ready(0);
    const second = test.pending[1];
    if (!second) throw new Error('missing second image');
    second.resolve(false);
    await flush();

    expect(test.battle.state.queuedPair).toBeNull();
    expect(test.released).toHaveLength(2);

    test.battle.prepare(pair);
    expect(test.pending).toHaveLength(4);
  });

  it('automatic promotion waits for outgoing swipe and active finger, then mounts one fixed pair', () => {
    let exiting = true;
    let active = false;
    const fixed = [...pair];
    const state: BattleRuntimeState = {
      automaticBattle: {
        pair: fixed,
        art: new Map(),
        resetAt: 0,
        status: 'ready',
      },
      queuedPair: fixed,
      inlinePair: null,
      activeEncounter: null,
    };
    const ui: BattlePromotionUi = {
      isBusy: () => false,
      isDocumentHidden: () => false,
      hasActiveCard: () => active,
      isSheetOpen: () => false,
      hasOpenDialog: () => false,
      hasExitingCard: () => exiting,
    };

    const promotion = createBattlePromotion({
      state,
      ui,
      eventSeen: () => 30,
      nextSeen: () => 20,
      render() {},
      paintRefinement() {},
    });

    promotion.renderDiscovery();
    expect(state.inlinePair).toBeNull();

    exiting = false;
    active = true;
    promotion.renderDiscovery();
    expect(state.inlinePair).toBeNull();

    active = false;
    promotion.renderDiscovery();
    expect(state.inlinePair).toBe(fixed);
    expect(state.queuedPair).toBeNull();
  });
});
