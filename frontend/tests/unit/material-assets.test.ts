// Migrado de tests/18-material-assets.test.mjs — pool de lookahead foil/etch.
import { describe, expect, it } from 'vitest';

import {
  createMaterialAssets,
  type MaterialAssetsApi,
  type MaterialCard,
  type MaterialFetcherResponse,
  type MaterialFetchInit,
  type MaterialResourceBridge,
} from '@/engines/resources/material-assets';

interface MaterialCall {
  readonly path: string;
  readonly options: MaterialFetchInit;
}

interface PendingRequest {
  readonly done: () => void;
}

interface Harness {
  readonly api: MaterialAssetsApi;
  readonly calls: MaterialCall[];
  readonly urls: Set<string>;
  readonly peak: () => number;
  readonly finish: () => Promise<void>;
  readonly drain: () => Promise<void>;
}

function card(id: string): MaterialCard {
  return {
    card: `print-${id}`,
    surface: {
      etched: true,
      assets: {
        front: `/materials/${id}/front.png`,
        foil: `/materials/${id}/foil.png`,
        etch: `/materials/${id}/etch.png`,
      },
    },
  };
}

function asset(target: MaterialCard, name: 'front' | 'foil' | 'etch'): string {
  const path = target.surface?.assets?.[name];
  if (!path) throw new Error(`Falta el asset ${name}`);
  return path;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Falta el elemento ${index}`);
  return item;
}

function turn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function setup(): Harness {
  const calls: MaterialCall[] = [];
  const urls = new Set<string>();
  const pending: PendingRequest[] = [];
  let active = 0;
  let peak = 0;
  let sequence = 0;

  const api = createMaterialAssets({
    resources: null,
    fetch: (path, options) => {
      active++;
      peak = Math.max(peak, active);
      calls.push({ path, options });
      return new Promise<MaterialFetcherResponse>((resolve) => {
        pending.push({
          done: () => {
            active--;
            resolve({
              ok: true,
              blob: () => Promise.resolve(new Blob(['actual-texture'], { type: 'image/png' })),
            });
          },
        });
      });
    },
    createObjectURL: () => {
      const url = `blob:${++sequence}`;
      urls.add(url);
      return url;
    },
    revokeObjectURL: (url) => {
      urls.delete(url);
    },
    isSaveData: () => false,
  });

  async function finish(): Promise<void> {
    for (const request of pending.splice(0)) request.done();
    await turn();
  }

  async function drain(): Promise<void> {
    while (pending.length) await finish();
  }

  return { api, calls, urls, peak: () => peak, finish, drain };
}

describe('material assets', () => {
  it('downloads the complete next material before its turn and reuses it', async () => {
    const harness = setup();
    const cards = [card('a'), card('b'), card('c'), card('d')];

    harness.api.prepare(cards);
    expect(harness.calls).toHaveLength(4);
    await harness.drain();
    expect(harness.calls).toHaveLength(12);

    const total = harness.calls.length;
    harness.api.prepare(cards.slice(1));
    await harness.api.getBlob(asset(at(cards, 1), 'foil'));

    const first = await harness.api.front(at(cards, 1));
    const second = await harness.api.front(at(cards, 1));
    expect(first).toBe(second);
    expect(harness.api.peekFront(at(cards, 1))).toBe(first);
    expect(harness.calls).toHaveLength(total);
    expect(harness.peak()).toBe(4);
  });

  it('shares in-flight requests on rapid swipes instead of aborting them', async () => {
    const harness = setup();
    const first = card('a');
    const second = card('b');
    harness.api.prepare([first, second]);

    const one = harness.api.getBlob(asset(first, 'foil'));
    const two = harness.api.getBlob(asset(first, 'foil'));
    harness.api.prepare([second]);
    await harness.drain();

    expect(await one).toBe(await two);
    expect(harness.calls.filter((call) => call.path === asset(first, 'foil'))).toHaveLength(1);
    expect(harness.calls.some((call) => call.options.signal.aborted)).toBe(false);
  });

  it('revokes old front URLs while retaining the current lookahead', async () => {
    const harness = setup();
    for (let index = 0; index < 30; index++) {
      const target = card(String(index));
      harness.api.prepare([target]);
      await harness.drain();
      await harness.api.front(target);
    }

    expect(harness.urls.size).toBeLessThanOrEqual(20);
    const count = harness.calls.length;
    await harness.api.front(card('29'));
    expect(harness.calls).toHaveLength(count);
  });

  it('keeps HTTP failures retryable and never caches them', async () => {
    let calls = 0;
    const api = createMaterialAssets({
      resources: null,
      fetch: () => {
        calls++;
        return Promise.resolve(
          calls === 1
            ? new Response('denied', { status: 403 })
            : new Response(new Blob(['foil'], { type: 'image/png' })),
        );
      },
    });

    await expect(api.getBlob('/materials/a/foil.png')).rejects.toThrow('material unavailable');
    await api.getBlob('/materials/a/foil.png');
    expect(calls).toBe(2);
  });

  it('delegates to the shared coordinator with material priorities', async () => {
    const calls: Array<{ readonly path: string; readonly priority: number }> = [];
    const bridge: MaterialResourceBridge = {
      getBlob: (path, priority = 0) => {
        calls.push({ path, priority });
        return Promise.resolve(new Blob(['shared'], { type: 'image/png' }));
      },
      peek: () => null,
      front: () => Promise.resolve('blob:shared'),
      plan: () => [],
    };
    const api = createMaterialAssets({ resources: bridge });

    await api.getBlob('/materials/a/front.png', 2);
    await api.getBlob('/materials/a/foil.png', 2);
    expect(calls).toEqual([
      { path: '/materials/a/front.png', priority: 2 },
      { path: '/materials/a/foil.png', priority: 30 },
    ]);
    expect(await api.front(card('a'))).toBe('blob:shared');
  });
});
