import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';

import '@/styles/global.css';

import App from '@/App.svelte';
import { createDiscovery } from '@/application/discovery.svelte';
import type { FetchLike, StorageLike, TimerApi } from '@/application/sync';
import type { Card, CatalogBundle } from '@/domain/catalog';

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

test('home hides the card name and displays the active battle gloves in the footer', async () => {
  const discovery = createDiscovery({ loadCatalog: () => Promise.resolve(bundle) });
  const screen = await render(App, { discovery });
  screen.container.id = 'app';
  await expect.poll(() => document.querySelector('#name')).not.toBeNull();
  const name = document.querySelector<HTMLElement>('#name');
  const battle = document.querySelector<HTMLElement>('#front-refine');
  expect(name && getComputedStyle(name).display).toBe('none');
  expect(battle?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 30');
  expect(battle?.querySelectorAll('svg g')).toHaveLength(2);
  expect(battle?.querySelector('svg g:nth-child(2)')?.getAttribute('transform')).toBe(
    'translate(0 30) scale(1 -1)',
  );
  expect(battle && getComputedStyle(battle).position).toBe('absolute');
  expect(battle && getComputedStyle(battle).right).toBe('14px');
  expect(battle?.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
  // The active legacy keeps a 50px likes wrapper even when its count is hidden.
  // An intrinsic-width wrapper shifts the heart 16px to the right.
  const likes = document.querySelector<HTMLElement>('#likes');
  expect(likes?.getBoundingClientRect().width).toBe(50);
  discovery.dispose();
});

test('scene follows the current palette on vote and undo and restores root styles on unmount', async () => {
  const root = document.documentElement;
  root.style.setProperty('--journey-hue', '17');
  root.style.setProperty('--card-paper', 'pink');
  const discovery = createDiscovery({
    loadCatalog: () => Promise.resolve(bundle),
    sessionToken: null,
  });
  const screen = await render(App, { discovery });
  await expect.element(screen.getByRole('article', { name: 'Pikachu' })).toBeVisible();
  await expect.poll(() => root.style.getPropertyValue('--journey-hue')).toBe('50');
  expect(root.style.getPropertyValue('--card-paper')).toBe('hsl(50 35% 95%)');
  const first = document.querySelector<HTMLElement>('#ambient-b');
  const expected = document.createElement('div');
  expected.style.background =
    'radial-gradient(ellipse at 50% 40%,hsl(50 52% 84% / .5),transparent 72%),radial-gradient(ellipse at 100% 90%,hsl(170 48% 89% / .4),transparent 65%),linear-gradient(150deg,hsl(230 42% 97%),hsl(50 45% 94%))';
  expect(first?.style.background).toBe(expected.style.background);
  expect(first?.style.opacity).toBe('1');
  const light = document.querySelector<HTMLElement>('#tanda-light');
  expect(light?.style.opacity).toBe('0.12');
  await screen.getByRole('button', { name: 'Me gusta' }).click();
  await expect.poll(() => root.style.getPropertyValue('--journey-hue')).toBe('120');
  expect(document.querySelector<HTMLElement>('#ambient-a')?.style.opacity).toBe('1');
  expect(first?.style.opacity).toBe('0');
  expect(Number(light?.style.opacity)).toBeCloseTo(0.12 + 0.2 / 15);
  expected.style.transform = `translateX(-50%) scale(${0.28 + 0.85 / 15})`;
  expect(light?.style.transform).toBe(expected.style.transform);
  await screen.getByRole('button', { name: 'Deshacer última elección' }).click();
  await expect.poll(() => root.style.getPropertyValue('--journey-hue')).toBe('50');
  expect(first?.style.opacity).toBe('1');
  expect(light?.style.opacity).toBe('0.12');
  await screen.unmount();
  expect(root.style.getPropertyValue('--journey-hue')).toBe('17');
  expect(root.style.getPropertyValue('--card-paper')).toBe('pink');
  root.style.removeProperty('--journey-hue');
  root.style.removeProperty('--card-paper');
  discovery.dispose();
});

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

  const screen = await render(App, { discovery });

  await expect.element(screen.getByText('Cargando cartas…')).toBeVisible();

  catalog.resolve(bundle);

  await expect.element(screen.getByRole('article', { name: 'Pikachu' })).toBeVisible();
  expect(screen.getByText(/0 me gusta/).query()).not.toBeNull();
  await expect
    .element(screen.getByRole('button', { name: 'Deshacer última elección' }))
    .toBeDisabled();
  expect(fetchCalls).toEqual([]);

  await screen.getByRole('button', { name: 'Me gusta' }).click();

  await expect.element(screen.getByRole('article', { name: 'Bulbasaur' })).toBeVisible();
  expect(screen.getByText(/1 me gusta/).query()).not.toBeNull();
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

  await expect.element(screen.getByRole('article', { name: 'Pikachu' })).toBeVisible();
  expect(screen.getByText(/0 me gusta/).query()).not.toBeNull();
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
