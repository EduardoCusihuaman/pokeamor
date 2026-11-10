import { describe, expect, it } from 'vitest';

import {
  batches,
  celebration,
  composePlan,
  favoriteCount,
  favorites,
  newFavorite,
  progress,
  team,
} from '../../src/domain/collection/journey';
import type { JourneyVote } from '../../src/domain/collection/journey';
import type { Comparison } from '../../src/domain/collection/preference';

interface TestCard {
  readonly id: number;
  readonly name: string;
  readonly palette?: { readonly h: number };
}

const catalog: TestCard[] = Array.from({ length: 100 }, (_, index) => ({
  id: index + 1,
  name: `Pokémon ${index}`,
}));

interface MutableState {
  votes: Record<number, JourneyVote | undefined>;
  history?: { id: number | string }[];
  comparisons?: Comparison[];
}

function state(n: number): MutableState {
  const votes: Record<number, JourneyVote | undefined> = {};
  for (const card of catalog.slice(0, n)) votes[card.id] = { value: 'yes' };
  return { votes };
}

describe('journey progression', () => {
  it('progress reflects choices including undo without changing votes', () => {
    const current = state(14);
    const before = JSON.stringify(current);
    let result = batches(catalog, current);

    expect(progress(catalog, current, result.groups).collectionLabel).toMatch(/14 de 15/);
    expect(JSON.stringify(current)).toBe(before);

    delete current.votes[14];
    result = batches(catalog, current);
    expect(progress(catalog, current, result.groups).collectionLabel).toMatch(/13 de 15/);
  });

  it('round completion fills the ring briefly and cannot be farmed through undo or reload', () => {
    const current = state(15);
    let result = batches(catalog, current);
    let metrics = progress(catalog, current, result.groups);

    expect(metrics.step).toBe(15);
    expect(metrics.arcDashoffset).toBe(0);

    const first = celebration(catalog, current, result.groups);
    expect(first.rewards).toEqual([
      {
        kind: 'batch',
        key: `batch-${Array.from({ length: 15 }, (_, index) => index + 1).join('-')}`,
        ids: Array.from({ length: 15 }, (_, index) => index + 1),
      },
    ]);

    const repeated = celebration(catalog, current, result.groups, first.seen);
    expect(repeated.rewards).toHaveLength(0);

    result = batches(catalog, current);
    metrics = progress(catalog, current, result.groups);
    expect(metrics.step).toBe(15);
    const reloaded = celebration(catalog, current, result.groups, first.seen);
    expect(reloaded.rewards).toHaveLength(0);
  });

  it('completion reports the finished collection exactly once', () => {
    const current = state(100);
    const groups = batches(catalog, current).groups;
    const metrics = progress(catalog, current, groups);

    expect(metrics.complete).toBe(true);
    expect(metrics.journeyLabel).toBe('Tu universo Pokémon');

    const first = celebration(catalog, current, groups);
    expect(first.rewards.map((reward) => reward.kind)).toEqual(['finished']);

    const second = celebration(catalog, current, groups, first.seen);
    expect(second.rewards).toHaveLength(0);
  });

  it('pass choices progress normally without adding to favorite rewards', () => {
    const current = state(10);
    for (const id of Object.keys(current.votes).map(Number)) {
      current.votes[id] = { value: 'no' };
    }

    const result = batches(catalog, current);
    const metrics = progress(catalog, current, result.groups);
    expect(favoriteCount(current)).toBe(0);
    expect(metrics.likes).toBe(0);
    expect(metrics.collectionLabel).toMatch(/0 favoritos/);
    expect(celebration(catalog, current, result.groups).rewards).toHaveLength(0);
  });

  it('six-person team stays stable as new favorites arrive and duels can promote a challenger', () => {
    const current = state(6);
    const first = team(catalog, current);
    expect(first).toEqual([1, 2, 3, 4, 5, 6]);

    current.votes[7] = { value: 'yes', time: 999 };
    expect(team(catalog, current)).toEqual(first);

    current.comparisons = [{ id: 'test-duel', ids: [7, 1], winner: 0 }];
    expect(team(catalog, current)[0]).toBe(7);

    delete current.votes[7];
    expect(team(catalog, current)).not.toContain(7);
  });

  it('batches contain only likes, fill to fifteen and keep one active remainder', () => {
    const current = state(40);
    for (let id = 1; id <= 9; id++) current.votes[id] = { value: 'no' };
    let result = batches(catalog, current);

    expect(result.groups.map((group) => group.length)).toEqual([15, 15, 1]);
    expect(result.groups.flat().every((card) => card.id > 9)).toBe(true);

    current.votes[40] = { value: 'no' };
    result = batches(catalog, current, result.completed);
    expect(result.groups.map((group) => group.length)).toEqual([15, 15]);
  });

  it('passes never advance favorite round progress or complete a round', () => {
    const current = state(30);
    // El orden numérico de las claves coincide con el orden del legacy.
    for (let id = 15; id <= 30; id++) current.votes[id] = { value: 'no' };

    let result = batches(catalog, current);
    let metrics = progress(catalog, current, result.groups);
    expect(metrics.step).toBe(14);
    expect(celebration(catalog, current, result.groups).rewards).toHaveLength(0);

    current.votes[30] = { value: 'yes' };
    result = batches(catalog, current, result.completed);
    metrics = progress(catalog, current, result.groups);
    expect(metrics.step).toBe(15);
    expect(result.groups[0]?.length).toBe(15);
    expect(celebration(catalog, current, result.groups).rewards.map((r) => r.kind)).toEqual([
      'batch',
    ]);
  });

  it('completed batch progress holds, ignores old removals and reopens on undo', () => {
    const current = state(15);
    let result = batches(catalog, current);
    expect(progress(catalog, current, result.groups).step).toBe(15);

    delete current.votes[15];
    result = batches(catalog, current, result.completed);
    expect(progress(catalog, current, result.groups).step).toBe(14);

    current.votes[15] = { value: 'yes' };
    result = batches(catalog, current, result.completed);
    current.votes[16] = { value: 'yes' };
    result = batches(catalog, current, result.completed);
    expect(progress(catalog, current, result.groups).step).toBe(1);

    current.votes[1] = { value: 'no' };
    result = batches(catalog, current, result.completed);
    expect(progress(catalog, current, result.groups).step).toBe(1);
    expect(result.groups[0]?.length).toBe(15);
  });

  it('detects the new favorite only when the active batch grows', () => {
    const current = state(7);
    const groups = batches(catalog, current).groups;
    const active = groups.at(-1)?.map((card) => card.id) ?? [];

    expect(newFavorite(null, groups, current)).toBeNull();
    expect(newFavorite(active, groups, current)).toBeNull();
    expect(newFavorite(active.slice(0, -1), groups, current)).toBe(7);

    current.votes[7] = { value: 'no' };
    expect(newFavorite(active.slice(0, -1), groups, current)).toBeNull();
  });

  it('sorts favorites by affinity, vote age and id, and composes at most six', () => {
    const current = state(3);
    current.votes[1] = { value: 'yes', time: 20 };
    current.votes[2] = { value: 'yes', time: 5 };
    current.votes[3] = { value: 'yes', time: 10 };

    // Sin duelos, el orden es por antigüedad del voto (los más viejos primero).
    expect(
      favorites(catalog, current)
        .slice(0, 3)
        .map((card) => card.id),
    ).toEqual([2, 3, 1]);

    const plan = composePlan(catalog, current);
    expect(plan.selected).toHaveLength(3);
    expect(plan.hue).toBe(325);
    expect(plan.caption).toBe('pokéamor  ·  3 ♡');
    expect(plan.ariaLabel).toBe('Composición de Pokémon 1, Pokémon 2, Pokémon 0');
    expect(plan.slots).toHaveLength(3);
  });
});
