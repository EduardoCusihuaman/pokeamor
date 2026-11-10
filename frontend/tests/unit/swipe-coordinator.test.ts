// Migrado de tests/34-swipe-coordinator.test.cjs — coalescing de afterSwipe y
// los guardas de `favoriteCount`/`favorites` que viajaban en el mismo archivo.
// Se prueba el módulo TS directamente (sin `node:vm` ni `slice()`).
import { describe, expect, it, vi } from 'vitest';

const preference = vi.hoisted(() => ({ calls: 0 }));

vi.mock('@/domain/collection/preference', () => ({
  model: () => {
    preference.calls += 1;
    return { score: (id: number) => id % 7 };
  },
}));

import { celebration, favoriteCount, favorites, progress } from '@/domain/collection/journey';
import type { JourneyCard, JourneyState, JourneyVote } from '@/domain/collection/journey';
import { createSwipeCoordinator } from '@/engines/swipe/coordinator';

interface CoordinatorSetup {
  readonly coordinator: ReturnType<typeof createSwipeCoordinator>;
  readonly timers: Map<number, { handler: () => void; ms: number }>;
  release(): void;
  advance(time: number): void;
}

function setup(): CoordinatorSetup {
  let blocked = true;
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, { handler: () => void; ms: number }>();
  const coordinator = createSwipeCoordinator({
    isBlocked: () => blocked,
    now: () => now,
    setTimeout: (handler: () => void, ms: number) => {
      const id = ++nextId;
      timers.set(id, { handler, ms });
      return id;
    },
    clearTimeout: (handle: number) => {
      timers.delete(handle);
    },
  });
  return {
    coordinator,
    timers,
    release() {
      blocked = false;
      coordinator.flush();
    },
    advance(time: number) {
      now = time;
      coordinator.flush();
    },
  };
}

describe('afterSwipe', () => {
  it('secondary tasks coalesce, wait through flights and run once after release', () => {
    const setupState = setup();
    const done: string[] = [];
    setupState.coordinator.afterSwipe('surface', () => done.push('old'));
    setupState.coordinator.afterSwipe('surface', () => done.push('latest'));
    expect(done).toEqual([]);
    setupState.release();
    setupState.release();
    expect(done).toEqual(['latest']);
  });

  it('durable work keeps its original deadline under continuous swiping', () => {
    const setupState = setup();
    const done: string[] = [];
    setupState.coordinator.afterSwipe('persist', () => done.push('old'), 500);
    setupState.advance(400);
    setupState.coordinator.afterSwipe('persist', () => done.push('latest'), 500);
    setupState.advance(501);
    expect(done).toEqual(['latest']);
  });

  it('cancel and clear release pending tasks without running them', () => {
    const setupState = setup();
    const done: string[] = [];
    setupState.coordinator.afterSwipe('persist', () => done.push('persist'), 500);
    setupState.coordinator.afterSwipe('engine', () => done.push('engine'), 1000);
    expect(setupState.coordinator.size).toBe(2);
    expect(setupState.coordinator.cancel('persist')).toBe(true);
    expect(setupState.coordinator.cancel('persist')).toBe(false);
    setupState.coordinator.clear();
    expect(setupState.coordinator.size).toBe(0);
    expect(setupState.timers.size).toBe(0);
    setupState.release();
    expect(done).toEqual([]);
  });
});

function journeyState(cards: readonly JourneyCard[]): JourneyState {
  const votes: Record<number, JourneyVote | undefined> = {};
  for (const card of cards) votes[card.id] = { value: 'yes', time: card.id };
  return { votes };
}

describe('journey guards from legacy test 34', () => {
  it('favorite sorting reads the model once and counting never reads it', () => {
    preference.calls = 0;
    const cards = Array.from({ length: 300 }, (_, index) => ({ id: index + 1 }));
    const state = journeyState(cards);

    expect(favoriteCount(state)).toBe(300);
    expect(preference.calls).toBe(0);

    const sorted = favorites(cards, state);
    expect(sorted.length).toBe(300);
    expect(preference.calls).toBe(1);
    expect((sorted[0]?.id ?? 0) % 7).toBe(6);
  });

  it('counter update and celebration never sort favorites', () => {
    preference.calls = 0;
    const cards = Array.from({ length: 15 }, (_, index) => ({ id: index + 1 }));
    const state = journeyState(cards);
    const groups = [cards];

    progress(cards, state, groups);
    celebration(cards, state, groups);
    expect(preference.calls).toBe(0);
  });
});
