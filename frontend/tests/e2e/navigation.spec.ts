/**
 * Flujo E2E de navegación entre descubrimiento y colección (plan §15 y §18).
 *
 * Comprueba que la SPA cambia de vista sin router hash: el enlace de sesión
 * existente `#s=<64hex>` se conserva y nunca aparece un `#/` ajeno.
 */

import { expect, test } from '@playwright/test';

import { gotoApp, mockBackend, SESSION_TOKEN } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test('enters the collection and returns to discovery preserving the session hash', async ({
  page,
}) => {
  await gotoApp(page);
  await expect(page.getByRole('heading', { name: 'Pikachu' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Secciones de pokéamor' });

  await nav.getByRole('button', { name: 'Colección' }).click();

  await expect(page.getByRole('heading', { name: 'Tu colección' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Filtrar la colección' })).toBeVisible();

  const inCollection = new URL(page.url());
  expect(inCollection.pathname).toBe('/');
  expect(inCollection.hash).toBe(`#s=${SESSION_TOKEN}`);
  expect(page.url()).not.toContain('#/');

  await nav.getByRole('button', { name: 'Descubrir' }).click();

  await expect(page.getByRole('heading', { name: 'Pikachu' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Descubrir' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const backInDiscovery = new URL(page.url());
  expect(backInDiscovery.pathname).toBe('/');
  expect(backInDiscovery.hash).toBe(`#s=${SESSION_TOKEN}`);
  expect(page.url()).not.toContain('#/');
});
