import { describe, expect, it } from 'vitest';

import { model, pair, plan, ranked } from '../../src/domain/collection/preference';
import type {
  Comparison,
  PreferenceState,
  PreferenceVote,
} from '../../src/domain/collection/preference';

interface TestCard {
  readonly id: number;
}

interface MutableState {
  votes: Record<number, PreferenceVote>;
  comparisons?: Comparison[];
}

function fixture(n: number): { cards: TestCard[]; state: MutableState } {
  const cards = Array.from({ length: n }, (_, index) => ({ id: index + 1 }));
  const votes: Record<number, PreferenceVote> = {};
  for (const card of cards) votes[card.id] = { value: 'yes' };
  return { cards, state: { votes, comparisons: [] } };
}

function comparison(id: string, ids: [number, number], winner: 0 | 1 | 2): Comparison {
  return { id, ids, winner };
}

describe('preference model', () => {
  it('comparisons alone rank favorites; undo and ties reconstruct deterministic preferences', () => {
    const cards: TestCard[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const votes: Record<number, PreferenceVote> = {
      1: { value: 'yes' },
      2: { value: 'yes' },
      3: { value: 'yes' },
    };
    const comparisons: Comparison[] = [comparison('a', [1, 2], 0), comparison('b', [1, 3], 0)];

    let state: PreferenceState = { votes, comparisons };
    expect(ranked(cards, state)[0]?.id).toBe(1);

    const score = model(state).score(1);
    state = { votes, comparisons: [...comparisons, comparison('c', [1, 2], 1)] };
    expect(model(state).score(1)).toBeLessThan(score);

    state = { votes, comparisons };
    expect(model(state).score(1)).toBe(score);

    state = { votes: { ...votes, 1: { value: 'no' } }, comparisons };
    expect(ranked(cards, state).some((card) => card.id === 1)).toBe(false);

    state = { votes, comparisons: [comparison('tie', [2, 3], 2)] };
    expect(model(state).score(2)).toBe(model(state).score(3));
  });

  it('pair selection uses personal scores and avoids recent pairs when alternatives exist', () => {
    const { cards, state } = fixture(4);
    const first = pair(cards, state);
    expect(first).not.toBeNull();

    const firstIds = (first ?? []).map((card) => card.id);
    state.comparisons = [comparison('a', [firstIds[0] ?? 0, firstIds[1] ?? 0], 0)];

    const next = pair(cards, state);
    const nextKey = (next ?? [])
      .map((card) => card.id)
      .sort((a, b) => a - b)
      .join(':');
    const firstKey = [...firstIds].sort((a, b) => a - b).join(':');
    expect(nextKey).not.toBe(firstKey);
  });

  it('session size and distinct protagonists for small and large collections', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 20, 100, 1025]) {
      const { cards, state } = fixture(n);
      const session = plan(cards, state);
      expect(session).toHaveLength(Math.min(3, Math.floor(n / 2)));
      expect(new Set(session.flatMap((p) => p).map((card) => card.id)).size).toBe(
        session.length * 2,
      );
    }
  });

  it('first pair rests both last participants whenever four favorites exist', () => {
    for (const n of [4, 5, 6, 30]) {
      const { cards, state } = fixture(n);
      state.comparisons = [comparison('last', [1, 2], 0)];
      const first = plan(cards, state)[0] ?? [];
      expect(first.length).toBe(2);
      expect(first.every((card) => card.id !== 1 && card.id !== 2)).toBe(true);
    }
  });

  it('recent exact pairs are avoided without sacrificing session variety', () => {
    const { cards, state } = fixture(8);
    state.comparisons = [
      comparison('a', [1, 2], 2),
      comparison('b', [3, 4], 2),
      comparison('c', [5, 6], 2),
    ];

    const recent = new Set(state.comparisons.map((event) => event.ids?.join(':') ?? ''));
    const session = plan(cards, state);
    for (const [a, b] of session) {
      const key = [a.id, b.id].sort((x, y) => x - y).join(':');
      expect(recent.has(key)).toBe(false);
    }
    expect(new Set(session.flatMap((p) => p).map((card) => card.id)).size).toBe(6);
  });

  it('deterministic plans rotate ties across seeds rather than favor low dex IDs', () => {
    const { cards, state } = fixture(100);
    expect(JSON.stringify(plan(cards, state, { seed: 8 }))).toBe(
      JSON.stringify(plan(cards, state, { seed: 8 })),
    );

    const firsts = new Set(
      Array.from({ length: 12 }, (_, seed) => plan(cards, state, { seed })[0]?.[0]?.id),
    );
    expect(firsts.size).toBeGreaterThan(5);
    expect([...firsts].some((id) => (id ?? 0) > 20)).toBe(true);
  });

  it('successive sessions create different links and preserve previous plans', () => {
    const { cards, state } = fixture(8);
    const first = plan(cards, state);
    const snapshot = JSON.stringify(first);
    const links = new Set<string>();

    for (let round = 0; round < 5; round++) {
      const session = plan(cards, state);
      for (const [a, b] of session) {
        const ids = [a.id, b.id] as [number, number];
        links.add([...ids].sort((x, y) => x - y).join(':'));
        state.comparisons = [
          ...(state.comparisons ?? []),
          comparison(`e${state.comparisons?.length ?? 0}`, ids, 2),
        ];
      }
    }

    expect(links.size).toBeGreaterThan(6);
    expect(JSON.stringify(first)).toBe(snapshot);
  });
});
