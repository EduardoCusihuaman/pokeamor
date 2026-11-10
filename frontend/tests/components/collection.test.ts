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

test('opens in tandas with one + slot, then switches to the favorites grid', async () => {
  const collection = createCollection({ source: makeSource() });
  const screen = await render(CollectionScreen, { collection });

  // El sheet legacy abre en «Tus tandas» con su contador y la tanda activa.
  await expect.element(screen.getByRole('heading', { name: 'Tu colección' })).toBeVisible();
  await expect.element(screen.getByText(/2 \/ 4 · 1 tanda/)).toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Tus tandas' }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect
    .element(screen.getByRole('button', { name: 'Ajustes y respaldo' }))
    .toHaveAttribute('aria-pressed', 'false');

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

  // «Ajustes y respaldo»: título editorial, resumen y galería de elegidos.
  await screen.getByRole('button', { name: 'Ajustes y respaldo' }).click();
  await expect
    .element(screen.getByRole('button', { name: 'Ajustes y respaldo' }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect.element(screen.getByRole('heading', { name: 'Tus elegidos.' })).toBeVisible();
  await expect.element(screen.getByText(/2 favoritos/)).toBeVisible();
  await expect.element(screen.getByRole('group', { name: 'Filtrar la colección' })).toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Favoritas' }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect.element(screen.getByRole('button', { name: 'Ver Pikachu' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Ver Bulbasaur' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Ver Charmander' }).query()).toBeNull();

  // Volver a «Tus tandas» conserva los datos y oculta la galería editorial.
  await screen.getByRole('button', { name: 'Tus tandas' }).click();
  await expect.element(screen.getByText('Tanda 1')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Tus elegidos.' }).query()).toBeNull();

  // De nuevo en ajustes, los filtros siguen operativos.
  await screen.getByRole('button', { name: 'Ajustes y respaldo' }).click();
  await screen.getByRole('button', { name: 'Todas' }).click();
  await expect.element(screen.getByRole('button', { name: 'Ver Charmander' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Ver Squirtle' }).query()).toBeNull();

  // Pasadas: solo la carta con voto `no`.
  await screen.getByRole('button', { name: 'Pasadas' }).click();
  await expect.element(screen.getByRole('button', { name: 'Ver Charmander' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Ver Pikachu' }).query()).toBeNull();

  // Por descubrir: solo las cartas sin voto.
  await screen.getByRole('button', { name: 'Por descubrir' }).click();
  await expect.element(screen.getByRole('button', { name: 'Ver Squirtle' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Ver Pikachu' }).query()).toBeNull();

  // Finalistas: favoritas que jugaron duelos, ordenadas por afinidad.
  await screen.getByRole('button', { name: 'Finalistas' }).click();
  await expect.element(screen.getByRole('button', { name: 'Ver Pikachu' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Ver Bulbasaur' }).query()).toBeNull();
  await expect.element(screen.getByText('1 carta en Finalistas')).toBeVisible();
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
