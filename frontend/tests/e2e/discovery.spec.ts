/**
 * Flujo E2E de descubrimiento (plan §15, nivel 4).
 *
 * Cubre arranque desde sesión vacía, voto positivo, voto negativo y deshacer
 * usando los controles accesibles. La red se resuelve con `page.route`, de modo
 * que no se depende del Worker ni de internet.
 */

import { expect, test } from '@playwright/test';

import { gotoApp, mockBackend, readStoredVotes } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test('boots from an empty session and resolves to the first card', async ({ page }) => {
  await gotoApp(page);

  await expect(page.getByRole('article', { name: 'Pikachu' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Me gusta' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Paso' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Deshacer última elección' })).toBeDisabled();
});

test('votes yes, advances and persists the vote locally', async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByRole('article', { name: 'Pikachu' })).toBeVisible();

  await page.getByRole('button', { name: 'Me gusta' }).click();

  await expect(page.getByRole('article', { name: 'Bulbasaur' })).toBeVisible();
  await expect(page.locator('.tally')).toContainText('1 me gusta');
  await expect.poll(async () => (await readStoredVotes(page))?.['25']?.value).toBe('yes');
});

test('votes no and advances to the next card', async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByRole('article', { name: 'Pikachu' })).toBeVisible();

  await page.getByRole('button', { name: 'Paso' }).click();

  await expect(page.getByRole('article', { name: 'Bulbasaur' })).toBeVisible();
  await expect(page.locator('.tally')).toContainText('1 pasos');
});

test('undo returns to the previous card without keeping the vote', async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByRole('article', { name: 'Pikachu' })).toBeVisible();

  await page.getByRole('button', { name: 'Me gusta' }).click();
  await expect(page.getByRole('article', { name: 'Bulbasaur' })).toBeVisible();

  await page.getByRole('button', { name: 'Deshacer última elección' }).click();

  await expect(page.getByRole('article', { name: 'Pikachu' })).toBeVisible();
  await expect(page.locator('.tally')).toContainText('0 me gusta');
  await expect(page.getByRole('button', { name: 'Deshacer última elección' })).toBeDisabled();
});
