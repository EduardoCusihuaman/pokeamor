/**
 * Flujo E2E de navegación entre descubrimiento y colección (plan §15 y §18).
 *
 * La colección se abre como una hoja superpuesta desde el botón del corazón,
 * igual que el legacy, y se cierra con "Volver a las cartas". La SPA no usa un
 * router hash: el enlace de sesión `#s=<64hex>` se conserva y nunca aparece un
 * `#/` ajeno.
 */

import { expect, test } from '@playwright/test';

import { gotoApp, mockBackend, SESSION_TOKEN } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test('opens the collection sheet and returns to discovery preserving the session hash', async ({
  page,
}) => {
  await gotoApp(page);
  await expect(page.getByRole('article', { name: 'Pikachu' })).toBeVisible();

  await page.getByRole('button', { name: 'Abrir mi colección' }).click();

  await expect(page.getByRole('heading', { name: 'Tu colección' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Filtrar la colección' })).toBeVisible();

  const inCollection = new URL(page.url());
  expect(inCollection.pathname).toBe('/');
  expect(inCollection.hash).toBe(`#s=${SESSION_TOKEN}`);
  expect(page.url()).not.toContain('#/');

  await page.getByRole('button', { name: 'Volver a las cartas' }).click();

  await expect(page.getByRole('article', { name: 'Pikachu' })).toBeVisible();

  const backInDiscovery = new URL(page.url());
  expect(backInDiscovery.pathname).toBe('/');
  expect(backInDiscovery.hash).toBe(`#s=${SESSION_TOKEN}`);
  expect(page.url()).not.toContain('#/');
});
