import { describe, expect, it } from 'vitest';

import {
  createRecommenderIndex,
  createRecommenderMessageHandler,
  createRecommenderSession,
  handleRecommenderMessage,
  recommend,
  scoreCandidates,
  sigmoid,
  trainRecommenderModel,
  type Recommendation,
  type RecommenderCatalogEntry,
  type RecommenderResponse,
  type RecommenderState,
  type RecommenderVote,
} from '../../src/domain/recommendations/recommender';

/** Catálogo equivalente al del test legacy de `src/recommender.js`. */
function catalogOf(size: number): RecommenderCatalogEntry[] {
  return Array.from({ length: size }, (_, index) => ({
    id: index + 1,
    traits: [`type:${index % 2}`, `shape:${index % 4}`],
  }));
}

const catalog = catalogOf(80);

function run(
  votes: RecommenderState['votes'] = {},
  comparisons: RecommenderState['comparisons'] = [],
): Recommendation {
  return recommend(createRecommenderIndex(catalog), { votes, comparisons });
}

describe('online logistic model', () => {
  it('opposite preferences change unseen predictions and preserve coverage', () => {
    const a: Record<string, RecommenderVote> = {};
    const b: Record<string, RecommenderVote> = {};
    for (let id = 1; id <= 30; id += 1) {
      a[id] = { value: id % 2 ? 'yes' : 'no' };
      b[id] = { value: id % 2 ? 'no' : 'yes' };
    }

    const resultA = run(a);
    const resultB = run(b);

    expect(resultA.ids).toHaveLength(50);
    expect(new Set(resultA.ids).size).toBe(50);

    const predictionA = resultA.scores.find((score) => score.id === 31);
    const predictionB = resultB.scores.find((score) => score.id === 31);
    expect(predictionA).toBeDefined();
    expect(predictionB).toBeDefined();
    expect(predictionA?.p ?? 0).toBeGreaterThan(predictionB?.p ?? 1);
  });

  it('pairwise feedback does not relabel acceptance predictions', () => {
    const withoutDuels = run();
    const withDuels = run({}, [{ ids: [1, 2], winner: 0 }]);

    expect(withDuels.scores[0]?.p).toBe(withoutDuels.scores[0]?.p);
    expect(withDuels.scores[0]?.score ?? 0).toBeGreaterThan(withDuels.scores[1]?.score ?? 0);
  });

  it('undo rebuild produces the original model and reports computation cost', () => {
    const first = run();
    const second = run();

    expect(second.ids).toEqual(first.ids);
    expect(Number.isFinite(first.ms)).toBe(true);
    expect(first.observations).toBe(0);
  });

  it('encounters weight acceptance evidence without creating votes', () => {
    const base = run({ 1: { value: 'yes' } });
    const index = createRecommenderIndex(catalog);
    const model = trainRecommenderModel(index, {
      votes: { 1: { value: 'yes' } },
      encounters: { 'alt-1': { id: 1, value: 'no' } },
    });
    const scores = scoreCandidates(index, model);

    expect(scores[0]?.consistency).toEqual([1, 2]);
    expect(scores[0]?.p).toBeLessThan(base.scores[0]?.p ?? 0);
    expect(scores).toHaveLength(80);
  });

  it('sigmoid clamps extreme inputs', () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(1000)).toBe(sigmoid(20));
    expect(sigmoid(-1000)).toBe(sigmoid(-20));
  });
});

describe('encounters and the discovery queue', () => {
  const discoveryCatalog: RecommenderCatalogEntry[] = Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    traits: [`shape:${index % 4}`],
    communityVotes2020: 10000 - index * 100,
  }));

  function discoveryVotes(count: number): Record<string, RecommenderVote> {
    const votes: Record<string, RecommenderVote> = {};
    for (let id = 1; id <= count; id += 1) votes[id] = { value: 'yes' };
    return votes;
  }

  function discoveryRun(state: RecommenderState): Recommendation {
    return recommend(createRecommenderIndex(discoveryCatalog), state);
  }

  it('an alternate encounter does not remove an unseen species', () => {
    const result = discoveryRun({
      votes: discoveryVotes(30),
      encounters: { 'alt-1:1': { id: 1, card: 'alt-1', checkpoint: 1, value: 'no' } },
    });

    expect(result.ids).toHaveLength(30);
    expect(result.ids).not.toContain(1);
    expect(result.ids).toContain(31);
  });

  it('an encounter for an unseen species keeps it in the queue', () => {
    const result = discoveryRun({
      votes: discoveryVotes(30),
      encounters: { 'alt-40:1': { id: 40, card: 'alt-40', checkpoint: 1, value: 'yes' } },
    });

    expect(result.ids).toHaveLength(30);
    expect(result.ids).toContain(40);
    const score = result.scores.find((candidate) => candidate.id === 40);
    expect(score?.consistency).toEqual([2, 1]);
  });

  it('covers every unseen species exactly once', () => {
    const result = discoveryRun({ votes: discoveryVotes(12) });
    expect(result.ids).toHaveLength(48);
    expect(new Set(result.ids).size).toBe(48);
    expect(result.ids.every((id) => id > 12)).toBe(true);
  });
});

describe('worker message plumbing', () => {
  it('applies deltas and removes votes like the legacy worker', () => {
    const session = createRecommenderSession();
    const initial = handleRecommenderMessage(session, {
      type: 'init',
      catalog,
      state: { votes: { 1: { value: 'yes' }, 2: { value: 'yes' } } },
      revision: 1,
    });

    expect(initial?.ids).not.toContain(1);
    expect(initial?.revision).toBe(1);

    const updated = handleRecommenderMessage(session, {
      type: 'delta',
      votes: { 1: null, 40: { value: 'yes' } },
      revision: 2,
    });

    expect(updated?.revision).toBe(2);
    expect(updated?.ids).toContain(1);
    expect(updated?.ids).not.toContain(40);
  });

  it('does not publish when init carries no state', () => {
    const session = createRecommenderSession();
    const response = handleRecommenderMessage(session, { type: 'init', catalog, revision: 1 });
    expect(response).toBeNull();
  });

  it('posts results and errors through the handler entrypoint', () => {
    const responses: RecommenderResponse[] = [];
    const handler = createRecommenderMessageHandler((response) => responses.push(response));

    handler({ data: { type: 'init', catalog, state: { votes: {} }, revision: 3 } });
    handler({
      data: {
        type: 'init',
        catalog: null as unknown as RecommenderCatalogEntry[],
        state: { votes: {} },
        revision: 4,
      },
    });

    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatchObject({ revision: 3, observations: 0 });
    expect(responses[1]).toHaveProperty('error');
  });
});
