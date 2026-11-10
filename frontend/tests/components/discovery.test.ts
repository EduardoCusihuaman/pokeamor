import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';

import { createDiscovery } from '@/application/discovery.svelte';
import type { FetchLike, StorageLike, TimerApi } from '@/application/sync';
import type { Card, CatalogBundle } from '@/domain/catalog';
import DiscoveryScreen from '@/components/discovery/DiscoveryScreen.svelte';

function makeCard(id: number, name: string, hue: number): Card {
  return {
    id,
    name,
    image: `https://assets.tcgdex.net/es/sv/sv01/${id}/high.webp`,
    card: `sv01-${id}`,
    rarity: 'Rare',
    palette: { h: hue, s: 80, v: 70 },
    language: 'es',
    surface: null,
    traits: [],
  };
}

const pikachu = makeCard(25, 'Pikachu', 50);
const bulbasaur = makeCard(1, 'Bulbasaur', 120);
const charmander = makeCard(4, 'Charmander', 20);

const bundle: CatalogBundle = {
  catalog: [pikachu, bulbasaur, charmander],
  manifest: null,
  alternatives: null,
  proxies: null,
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Ejecuta lo que vence en ≤500 ms (persistencia) y deja el PUT pendiente. */
function createTimers(): TimerApi {
  const pending = new Map<number, () => void>();
  let nextId = 0;
  return {
    setTimeout(handler, ms) {
      if (ms <= 500) {
        handler();
        return 0;
      }
      const id = ++nextId;
      pending.set(id, handler);
      return id;
    },
    clearTimeout(handle) {
      if (typeof handle === 'number') pending.delete(handle);
    },
  };
}

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

test('loads the catalog, votes with accessible controls and undoes', async () => {
  const catalog = deferred<CatalogBundle>();
  const fetchCalls: string[] = [];
  const storage = createMemoryStorage();
  const fakeFetch: FetchLike = (url) => {
    fetchCalls.push(url);
    return Promise.resolve(new Response('{}', { status: 200, headers: { ETag: '"test"' } }));
  };

  const discovery = createDiscovery({
    loadCatalog: () => catalog.promise,
    sessionToken: 'test-session',
    readSession: () => Promise.resolve({ found: false, etag: null, body: null }),
    fetch: fakeFetch,
    storage,
    timers: createTimers(),
    clock: { now: () => 1000 },
  });

  const screen = await render(DiscoveryScreen, { discovery });

  await expect.element(screen.getByText('Cargando cartas…')).toBeVisible();

  catalog.resolve(bundle);

  await expect.element(screen.getByRole('heading', { name: 'Pikachu' })).toBeVisible();
  await expect.element(screen.getByText(/0 me gusta/)).toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Deshacer última elección' }))
    .toBeDisabled();
  expect(fetchCalls).toEqual([]);

  await screen.getByRole('button', { name: 'Me gusta' }).click();

  await expect.element(screen.getByRole('heading', { name: 'Bulbasaur' })).toBeVisible();
  await expect.element(screen.getByText(/1 me gusta/)).toBeVisible();
  expect(discovery.votes['25']).toEqual({ value: 'yes', time: 1000 });
  expect(discovery.session.votes['25']).toEqual({ value: 'yes', time: 1000 });
  expect(discovery.session.voteTimes['25']).toBe(1000);
  expect(discovery.position).toBe(1);
  expect(discovery.revision).toBe(1);
  expect(discovery.canUndo).toBe(true);

  const saved = JSON.parse(storage.getItem('pokeamor-test-session') ?? '{}') as {
    votes?: Record<string, { value?: string; time?: number }>;
  };
  expect(saved.votes?.['25']).toEqual({ value: 'yes', time: 1000 });

  await screen.getByRole('button', { name: 'Deshacer última elección' }).click();

  await expect.element(screen.getByRole('heading', { name: 'Pikachu' })).toBeVisible();
  await expect.element(screen.getByText(/0 me gusta/)).toBeVisible();
  expect(discovery.votes['25']).toBeUndefined();
  expect(discovery.session.votes['25']).toBeUndefined();
  expect(discovery.position).toBe(0);
  expect(discovery.revision).toBe(2);
  expect(discovery.canUndo).toBe(false);

  const afterUndo = JSON.parse(storage.getItem('pokeamor-test-session') ?? '{}') as {
    votes?: Record<string, unknown>;
    revision?: number;
  };
  expect(afterUndo.votes?.['25']).toBeUndefined();
  expect(afterUndo.revision).toBe(2);

  discovery.dispose();
});
