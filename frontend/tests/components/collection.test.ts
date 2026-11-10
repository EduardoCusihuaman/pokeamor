import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

import { createCollection, type CollectionSource } from '@/application/collection.svelte';
import { createEmptySession } from '@/application/sync';
import type { Card, CatalogBundle } from '@/domain/catalog';
import CollectionScreen from '@/components/collection/CollectionScreen.svelte';

function makeCard(id: number, name: string, hue: number, rarity: string): Card {
  return {
    id,
    name,
    image: `https://assets.tcgdex.net/es/sv/sv01/${id}/high.webp`,
    card: `sv01-${id}`,
    rarity,
    palette: { h: hue, s: 80, v: 70 },
    language: 'es',
    surface: null,
    traits: [],
  };
}

const pikachu = makeCard(25, 'Pikachu', 50, 'Rare');
const bulbasaur = makeCard(1, 'Bulbasaur', 120, 'Common');
const charmander = makeCard(4, 'Charmander', 20, 'Common');
const squirtle = makeCard(7, 'Squirtle', 200, 'Common');

/** Misma forma que `/catalog-bundle.json`; el catálogo falso es inmutable. */
const bundle: CatalogBundle = {
  catalog: [pikachu, bulbasaur, charmander, squirtle],
  manifest: null,
  alternatives: null,
  proxies: null,
};

/**
 * Fuente con la misma estructura que `DiscoveryApi`: la colección comparte
 * votos y sesión, no los copia.
 */
function makeSource(): CollectionSource {
  return {
    catalog: bundle.catalog,
    status: 'ready',
    votes: {
      '25': { value: 'yes', time: 1 },
      '1': { value: 'yes', time: 2 },
      '4': { value: 'no', time: 3 },
    },
    session: {
      ...createEmptySession(),
      votes: {
        '25': { value: 'yes', time: 1 },
        '1': { value: 'yes', time: 2 },
        '4': { value: 'no', time: 3 },
      },
      // Un duelo jugado entre Pikachu y Bulbasaur deja a Pikachu como finalista.
      ratings: { '25': { score: 1, played: 2 } },
      comparisons: [{ id: 'duel-1', ids: [25, 1], winner: 0 }],
      revision: 3,
    },
  };
}

test('opens in tandas and uses the settings control without exposing the old gallery', async () => {
  const collection = createCollection({ source: makeSource() });
  const screen = await render(CollectionScreen, { collection });

  // El sheet legacy abre en «Tus tandas» con su contador y la tanda activa.
  await expect.element(screen.getByRole('heading', { name: 'Tu colección' })).toBeVisible();
  await expect.element(screen.getByText('2 / 4', { exact: true })).toBeVisible();
  expect(document.querySelector('#album-seen')?.getAttribute('data-batches')).toBe(' · 1 tandas');
  expect(getComputedStyle(document.querySelector('.collection-switch')!).display).toBe('none');

  await expect.element(screen.getByText('Tanda 1')).toBeVisible();
  await expect.element(screen.getByText(/2\/15/)).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Ver Pikachu' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Ver Bulbasaur' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Ver Charmander' }).query()).toBeNull();

  // Un solo slot «+» para seguir descubriendo, no quince celdas fijas.
  expect(
    screen.getByRole('button', { name: 'Seguir descubriendo Pokémon' }).elements(),
  ).toHaveLength(1);
  await expect.element(screen.getByRole('button', { name: 'Copiar tandas' })).toBeEnabled();
  await expect.element(screen.getByRole('button', { name: 'Copiar tanda 1' })).toBeEnabled();

  // El runtime legacy oculta pestañas y galería; el icono abre el panel real.
  await screen.getByRole('button', { name: 'Abrir ajustes y respaldo' }).click();
  expect(collection.mode).toBe('settings');
  await expect.element(screen.getByText('Guardar y recuperar')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Tus elegidos.' }).query()).toBeNull();
  await screen.getByRole('button', { name: 'Volver a las tandas' }).click();
  await expect.element(screen.getByText('Tanda 1')).toBeVisible();
  expect(collection.mode).toBe('rounds');
});

test('hidden gallery filters retain their collection state and card membership', () => {
  const collection = createCollection({ source: makeSource() });
  expect(collection.filter).toBe('yes');
  expect(collection.filteredCards.map((card) => card.id)).toEqual([25, 1]);
  collection.setFilter('all');
  expect(collection.filteredCards.map((card) => card.id)).toEqual([25, 1, 4]);
  collection.setFilter('no');
  expect(collection.filteredCards.map((card) => card.id)).toEqual([4]);
  collection.setFilter('pending');
  expect(collection.filteredCards.map((card) => card.id)).toEqual([7]);
  collection.setFilter('top');
  expect(collection.filteredCards.map((card) => card.id)).toEqual([25]);
  expect(collection.resultCount).toBe(1);
});

test('renders newest batch first and omits progress for completed batches', async () => {
  const catalog = Array.from({ length: 32 }, (_, index) =>
    makeCard(index + 1, `Card ${index + 1}`, 0, 'Common'),
  );
  const votes = Object.fromEntries(
    catalog
      .slice(0, 31)
      .map((card, index) => [card.id, { value: 'yes' as const, time: index + 1 }]),
  );
  const collection = createCollection({
    source: { catalog, status: 'ready', votes, session: { ...createEmptySession(), votes } },
  });
  await render(CollectionScreen, { collection });
  const groups = [...document.querySelectorAll('.batch-group')];
  expect(groups.map((group) => group.getAttribute('data-batch'))).toEqual(['2', '1', '0']);
  expect(
    groups.map((group) => group.querySelector('.batch-state')?.textContent?.trim() ?? null),
  ).toEqual(['1/15', null, null]);
  expect(
    groups.map((group) => group.querySelector('.memory-card')?.getAttribute('data-pokemon')),
  ).toEqual(['31', '16', '1']);
});

test('shows the next batch message after exactly fifteen favorites', async () => {
  const catalog = Array.from({ length: 16 }, (_, index) =>
    makeCard(index + 1, `Card ${index + 1}`, 0, 'Common'),
  );
  const votes = Object.fromEntries(
    catalog
      .slice(0, 15)
      .map((card, index) => [card.id, { value: 'yes' as const, time: index + 1 }]),
  );
  const collection = createCollection({
    source: { catalog, status: 'ready', votes, session: { ...createEmptySession(), votes } },
  });
  const screen = await render(CollectionScreen, { collection });
  await expect.element(screen.getByText('Próxima tanda · 0/15 ♡')).toBeVisible();
  expect(document.querySelector('.batch-state')).toBeNull();
  expect(document.querySelectorAll('.memory-card')).toHaveLength(15);
});

test('album scrubber follows scroll, previews and commits or cancels a drag', async () => {
  const catalog = Array.from({ length: 32 }, (_, index) =>
    makeCard(index + 1, `Card ${index + 1}`, 0, 'Common'),
  );
  const votes = Object.fromEntries(
    catalog
      .slice(0, 31)
      .map((card, index) => [card.id, { value: 'yes' as const, time: index + 1 }]),
  );
  const collection = createCollection({
    source: { catalog, status: 'ready', votes, session: { ...createEmptySession(), votes } },
  });
  const screen = await render(CollectionScreen, { collection });
  const sheet = document.querySelector<HTMLElement>('#sheet')!;
  const rail = document.querySelector<HTMLElement>('#album-index')!;
  const scrubber = document.querySelector<HTMLElement>('#album-scrubber')!;
  const preview = document.querySelector<HTMLElement>('#album-index-preview')!;
  await expect.element(screen.getByRole('slider', { name: 'Navegar tandas' })).toBeVisible();
  expect(preview.hidden).toBe(true);
  sheet.scrollTop = 100;
  sheet.dispatchEvent(new Event('scroll'));
  expect(Number.parseFloat(rail.style.getPropertyValue('--index-offset'))).toBeGreaterThan(0);

  scrubber.setPointerCapture = vi.fn();
  scrubber.hasPointerCapture = () => false;
  const y = scrubber.getBoundingClientRect().top + 20;
  const pointer = (type: string, clientY: number) =>
    scrubber.dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientY }),
    );
  pointer('pointerdown', y);
  expect(preview.hidden).toBe(false);
  expect(preview.querySelectorAll('img').length).toBeGreaterThan(0);
  pointer('pointermove', window.innerHeight - 40);
  pointer('pointercancel', window.innerHeight - 40);
  expect(preview.hidden).toBe(true);
  expect(sheet.scrollTop).toBe(100);

  pointer('pointerdown', y);
  pointer('pointermove', window.innerHeight - 40);
  pointer('pointerup', window.innerHeight - 40);
  expect(sheet.scrollTop).toBeGreaterThan(100);
  scrubber.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  expect(sheet.scrollTop).toBe(0);

  pointer('pointerdown', scrubber.getBoundingClientRect().top + 20);
  pointer('pointermove', window.innerHeight - 40);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(preview.querySelectorAll('img')).toHaveLength(5);
  const clearTimeout = vi.spyOn(window, 'clearTimeout');
  await screen.unmount();
  expect(clearTimeout).toHaveBeenCalled();
  expect(preview.hidden).toBe(true);
  expect(scrubber.onpointerdown).toBeNull();
  expect(scrubber.onkeydown).toBeNull();
  clearTimeout.mockRestore();
});

test('the close control returns to discovery', async () => {
  const collection = createCollection({ source: makeSource() });
  const onBack = vi.fn();

  const screen = await render(CollectionScreen, { collection, onBack });
  await screen.getByRole('button', { name: 'Volver a las cartas' }).click();

  expect(onBack).toHaveBeenCalledTimes(1);
});

test('the settings control exposes the backup entry point', async () => {
  const collection = createCollection({ source: makeSource() });
  const onSettings = vi.fn();

  const screen = await render(CollectionScreen, { collection, onSettings });
  await screen.getByRole('button', { name: 'Abrir ajustes y respaldo' }).click();

  expect(onSettings).toHaveBeenCalledTimes(1);
});

test('runtime collection hides obsolete tabs and opens settings in the sheet', async () => {
  const source = makeSource();
  const collection = createCollection({ source: { ...source, votes: {} } });
  const screen = await render(CollectionScreen, { collection });

  const tabs = document.querySelector('.collection-switch');
  expect(tabs && getComputedStyle(tabs).display).toBe('none');
  const placeholder = screen.getByRole('button', { name: 'Seguir descubriendo Pokémon' }).element();
  expect(placeholder.getBoundingClientRect().top).toBeLessThan(150);

  await screen.getByRole('button', { name: 'Abrir ajustes y respaldo' }).click();
  await expect.element(screen.getByText('Guardar y recuperar')).toBeVisible();
  await expect.element(screen.getByText(/todavía no están disponibles/)).toBeVisible();
});
