/**
 * Sincronización multi-dispositivo (migrado de `tests/01-sync.test.mjs`).
 *
 * Cada aserción del legacy se conserva: serialización de PUT, drenaje de
 * pendientes, reconciliación por ETag obsoleto, tombstones de deshacer y
 * reintentos silenciosos que mantienen los datos durables localmente.
 */

import { describe, expect, it } from 'vitest';

import {
  createSyncController,
  type FetchLike,
  type RemoteSession,
  type SessionState,
  type StorageLike,
  type SyncRequestInit,
} from '@/application/sync';

const TOKEN = 'a'.repeat(64);
const KEY = 'pokeamor-' + TOKEN;

interface FakeTimers {
  readonly pending: Map<number, { fn: () => void; ms: number }>;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: unknown): void;
}

/**
 * Equivalente a los timers del test legacy: lo que vence en ≤500 ms corre de
 * inmediato y lo demás queda pendiente para inspección.
 */
function createTimers(): FakeTimers {
  let nextId = 0;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  return {
    pending,
    setTimeout(fn, ms) {
      if (ms <= 500) {
        fn();
        return 0;
      }
      const id = ++nextId;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimeout(handle) {
      if (typeof handle === 'number') pending.delete(handle);
    },
  };
}

function ok(etag = '"new"'): Response {
  return new Response('{}', { status: 200, headers: { ETag: etag } });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createClient(fetchImpl: FetchLike, initial?: RemoteSession) {
  const storageMap = new Map<string, string>();
  if (initial) storageMap.set(KEY, JSON.stringify(initial));

  const storage: StorageLike = {
    getItem: (key) => storageMap.get(key) ?? null,
    setItem: (key, value) => {
      storageMap.set(key, value);
    },
  };

  const timers = createTimers();
  const toasts: string[] = [];
  const statuses: string[] = [];

  const controller = createSyncController({
    token: TOKEN,
    fetch: fetchImpl,
    storage,
    timers,
    clock: { now: () => Date.now() },
    toast: (message) => toasts.push(message),
    setStatus: (message) => statuses.push(message),
  });

  return { controller, storage: storageMap, timers, toasts, statuses };
}

describe('session sync', () => {
  it('rapid edits serialize requests and drain all pending choices', async () => {
    const firstResponse = deferred<Response>();
    const calls: SyncRequestInit[] = [];
    const client = createClient((_url, init) => {
      if (init) calls.push(init);
      if (calls.length === 1) return firstResponse.promise;
      return Promise.resolve(ok('"second"'));
    });

    const { controller } = client;
    controller.cloudReady = true;
    controller.state.votes[25] = { value: 'yes', time: 1 };
    controller.save();

    const first = controller.sync();
    expect(calls.length).toBe(1);

    controller.state.votes[7] = { value: 'no', time: 2 };
    controller.save();
    await controller.sync();
    expect(calls.length).toBe(1);

    firstResponse.resolve(ok('"first"'));
    await first;

    expect(calls.length).toBe(2);
    expect(calls[1]?.headers?.['If-Match']).toBe('"first"');
    const body = JSON.parse(String(calls[1]?.body)) as { votes: Record<string, unknown> };
    expect(Object.keys(body.votes)).toEqual(['7', '25']);
    expect(controller.dirty).toBe(false);
  });

  it('a stale ETag reconciles choices and undo tombstones without a popup', async () => {
    const initial: RemoteSession = {
      votes: { 4: { value: 'yes', time: 1 } },
      ratings: {},
      duels: 0,
      history: [],
      revision: 2,
    };

    let count = 0;
    let uploaded: SessionState | undefined;
    const client = createClient((_url, init) => {
      if (init?.method === 'PUT') {
        count++;
        if (count === 1) return Promise.resolve(new Response('{}', { status: 412 }));
        uploaded = JSON.parse(String(init.body)) as SessionState;
        expect(init.headers?.['If-Match']).toBe('"remote"');
        return Promise.resolve(ok());
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            votes: {
              4: { value: 'yes', time: 1 },
              7: { value: 'yes', time: 2 },
            },
            ratings: {},
            history: [],
            duels: 0,
            revision: 8,
          }),
          { headers: { ETag: '"remote"' } },
        ),
      );
    }, initial);

    const { controller } = client;
    controller.cloudReady = true;
    controller.etag = 'stale';
    delete controller.state.votes[4];
    controller.state.votes[25] = { value: 'no', time: 3 };
    controller.save();

    await controller.sync();

    expect(count).toBe(2);
    expect(uploaded?.votes[4]).toBeUndefined();
    expect(uploaded?.votes[7]?.value).toBe('yes');
    expect(uploaded?.votes[25]?.value).toBe('no');
    expect(uploaded?.voteTimes[4] ?? 0).toBeGreaterThan(1);
    expect(client.toasts).toEqual([]);
    expect(controller.dirty).toBe(false);
  });

  it('failed writes stay durable locally and retry silently', async () => {
    let fails = true;
    const client = createClient(() =>
      Promise.resolve(fails ? new Response('{}', { status: 503 }) : ok()),
    );

    const { controller } = client;
    controller.cloudReady = true;
    controller.state.votes[25] = { value: 'yes', time: 1 };
    controller.save();

    await controller.sync();
    expect(controller.dirty).toBe(true);
    expect(client.storage.get(KEY + '-pending')).toBe('1');
    expect(client.timers.pending.size).toBeGreaterThan(0);
    expect(client.toasts).toEqual([]);

    fails = false;
    await controller.sync();
    expect(controller.dirty).toBe(false);
    expect(client.storage.get(KEY + '-pending')).toBe('0');
  });
});
