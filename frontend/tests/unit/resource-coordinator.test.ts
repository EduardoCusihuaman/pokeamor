// Migrado de tests/11-resource-coordinator.test.mjs — cola compartida, dedup y prioridades.
// Las pruebas importan el motor TypeScript directamente y sustituyen fetch/URLs por mocks.
import { describe, expect, it } from 'vitest';

import type { IdentitySource } from '@/domain/cards/identity';
import {
  createResourceCoordinator,
  type ResourceCoordinatorApi,
  type ResourceFetcherResponse,
  type ResourceFetchInit,
} from '@/engines/resources/resource-coordinator';

interface CardFixture extends IdentitySource {
  readonly id: number;
  readonly image: string;
}

interface FetchCall {
  readonly url: string;
  readonly options: ResourceFetchInit;
}

interface PendingRequest {
  readonly finish: () => void;
}

interface Harness {
  readonly api: ResourceCoordinatorApi;
  readonly calls: FetchCall[];
  readonly setHidden: (hidden: boolean) => void;
  readonly peak: () => number;
  readonly turn: () => Promise<void>;
  readonly drain: () => Promise<void>;
}

function card(id: number): CardFixture {
  return { id, card: `print-${id}`, image: `https://example.org/es/${id}.webp` };
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Falta el elemento ${index}`);
  return item;
}

function turn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function setup(options: { readonly fail?: boolean } = {}): Harness {
  const calls: FetchCall[] = [];
  const pending: PendingRequest[] = [];
  let active = 0;
  let peak = 0;
  let hidden = false;

  const api = createResourceCoordinator({
    fetch: (url, init) => {
      calls.push({ url, options: init });
      active++;
      peak = Math.max(peak, active);
      return new Promise<ResourceFetcherResponse>((resolve) => {
        pending.push({
          finish: () => {
            active--;
            resolve({
              ok: !options.fail,
              type: 'basic',
              blob: () => Promise.resolve(new Blob(['image'], { type: 'image/png' })),
            });
          },
        });
      });
    },
    createObjectURL: () => 'blob:ready',
    revokeObjectURL: () => undefined,
    openCache: null,
    isDocumentHidden: () => hidden,
    listenVisibility: null,
    watchConnections: null,
    createIntersectionObserver: null,
  });

  async function drain(): Promise<void> {
    await turn();
    while (pending.length) {
      for (const request of pending.splice(0)) request.finish();
      await turn();
    }
  }

  return {
    api,
    calls,
    setHidden: (value) => {
      hidden = value;
    },
    peak: () => peak,
    turn,
    drain,
  };
}

describe('resource coordinator', () => {
  it('shares one in-flight exact resource between screens', async () => {
    const harness = setup();
    const target = card(1);

    const first = harness.api.front(target);
    const second = harness.api.front(target);
    await harness.drain();

    expect(await first).toBe(await second);
    expect(harness.calls).toHaveLength(1);
    expect(harness.api.snapshot().hits).toBe(1);
  });

  it('bounds the adaptive window and respects download concurrency', async () => {
    const harness = setup();
    const cards = Array.from({ length: 40 }, (_, index) => card(index));

    harness.api.plan('discovery', cards, { adaptive: true });
    await harness.drain();
    expect(harness.peak()).toBeLessThanOrEqual(4);
    expect(harness.calls).toHaveLength(12);

    harness.api.plan('discovery', cards.slice(1), { adaptive: true });
    await harness.drain();
    const windowSize = harness.api.snapshot().windowSize;
    expect(windowSize).toBeLessThanOrEqual(24);
    expect(windowSize).toBeGreaterThanOrEqual(6);
    expect(harness.calls.filter((call) => call.url === at(cards, 1).image)).toHaveLength(1);
  });

  it('retries a failed response once and never caches it as ready', async () => {
    const harness = setup({ fail: true });
    const target = card(1);
    const failure = expect(harness.api.front(target)).rejects.toThrow('resource unavailable');

    await harness.drain();
    await failure;

    expect(harness.calls).toHaveLength(2);
    expect(harness.api.peek(target.image)).toBeNull();
    expect(harness.api.snapshot().failures).toBe(1);
  });

  it('suspends speculative work on a hidden page but still loads an urgent image', async () => {
    const harness = setup();
    harness.setHidden(true);

    harness.api.plan('album', [card(1), card(2), card(3), card(4)]);
    await harness.drain();
    expect(harness.calls).toHaveLength(1);

    const urgent = harness.api.front(card(4));
    await harness.drain();
    await urgent;
    expect(harness.calls).toHaveLength(2);
  });

  it('distinguishes print and URL revisions in the identity', () => {
    const harness = setup();
    const target = card(1);

    expect(harness.api.key(target)).not.toBe(harness.api.key({ ...target, card: 'other' }));
    expect(harness.api.key(target)).not.toBe(
      harness.api.key({ ...target, image: `${target.image}?v=2` }),
    );
  });

  it('leaves a download slot free for an urgent card', async () => {
    const harness = setup();
    for (let index = 0; index < 8; index++) {
      void harness.api.getBlob(card(index).image, 30).catch(() => undefined);
    }

    await harness.turn();
    expect(harness.calls).toHaveLength(3);

    const urgent = harness.api.front(card(99));
    await harness.turn();
    expect(harness.calls).toHaveLength(4);
    expect(at(harness.calls, 3).url).toBe(card(99).image);

    await harness.drain();
    await urgent;
    expect(harness.peak()).toBeLessThanOrEqual(4);
  });

  it('can evict and fetch again an invalidated decoded resource', async () => {
    const harness = setup();
    const target = card(1);

    const first = harness.api.front(target);
    await harness.drain();
    await first;
    expect(harness.api.peek(target.image)).not.toBeNull();

    await harness.api.invalidate(target.image);
    expect(harness.api.peek(target.image)).toBeNull();

    const second = harness.api.front(target);
    await harness.drain();
    await second;
    expect(harness.calls).toHaveLength(2);
  });

  it('releasing one consumer preserves another consumer resource', async () => {
    const harness = setup();
    const target = card(1);

    harness.api.plan('viewer', [target]);
    harness.api.plan('battle', [target]);
    harness.api.release('viewer');
    await harness.drain();

    expect(harness.api.peek(target.image)).not.toBeNull();
    expect(harness.calls).toHaveLength(1);
  });
});
