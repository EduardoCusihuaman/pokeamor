/**
 * Datos y dobles de red compartidos por las pruebas E2E.
 *
 * El backend real (Worker, R2 y sesiones) no participa: cada prueba monta la
 * SPA de Vite y resuelve `/catalog-bundle.json` y `/api/session/*` con
 * `page.route`. Así los flujos son deterministas y no dependen de red.
 */

import type { Page } from '@playwright/test';

/** Token de sesión de 64 hex, igual que los enlaces reales `#s=...`. */
export const SESSION_TOKEN = '0123456789abcdef'.repeat(4);

/** Clave de persistencia local del controlador de sincronización. */
export const STORAGE_KEY = `pokeamor-${SESSION_TOKEN}`;

const CARD_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4b10PRwzEcQDU8huRZaonugAAAABJRU5ErkJggg==';

/** Forma mínima de una carta de `/catalog-bundle.json`. */
export interface MockCard {
  readonly id: number;
  readonly name: string;
  readonly image: string;
  readonly card: string;
  readonly rarity: string;
  readonly palette: { readonly h: number; readonly s: number; readonly v: number };
  readonly language: string;
  readonly surface: null;
  readonly traits: readonly string[];
  readonly communityVotes2020: number;
}

function makeCard(id: number, name: string, print: string, hue: number): MockCard {
  return {
    id,
    name,
    image: CARD_IMAGE,
    card: print,
    rarity: 'Rare',
    palette: { h: hue, s: 80, v: 70 },
    language: 'es',
    surface: null,
    traits: [],
    communityVotes2020: 1,
  };
}

/** Catálogo pequeño con forma real; el orden define el flujo de descubrimiento. */
export const CATALOG: readonly MockCard[] = [
  makeCard(25, 'Pikachu', 'sv01-025', 50),
  makeCard(1, 'Bulbasaur', 'sv01-001', 120),
  makeCard(4, 'Charmander', 'sv01-004', 20),
  makeCard(7, 'Squirtle', 'sv01-007', 200),
];

const CATALOG_BUNDLE = {
  catalog: CATALOG,
  manifest: null,
  alternatives: null,
  proxies: null,
};

/**
 * Instala los dobles de red. Debe llamarse antes de navegar.
 *
 * - El catálogo responde 200 con las cartas de prueba.
 * - `GET /api/session/:token` responde 404: todavía no existe sesión remota.
 * - `PUT /api/session/:token` responde 200 con ETag para que el debounce de
 *   sincronización no deje reintentos pendientes.
 */
export async function mockBackend(page: Page): Promise<void> {
  await page.route('**/catalog-bundle.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CATALOG_BUNDLE),
    });
  });

  await page.route('**/api/session/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'not-found' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ETag: '"e2e-1"' },
      body: JSON.stringify({ saved: true }),
    });
  });
}

/** Navega a la raíz conservando el enlace de sesión existente `#s=...`. */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto(`/#s=${SESSION_TOKEN}`);
}

interface StoredSession {
  readonly votes?: Readonly<Record<string, { readonly value?: string }>>;
}

/** Lee los votos persistidos en `localStorage` para la sesión actual. */
export async function readStoredVotes(
  page: Page,
): Promise<Readonly<Record<string, { readonly value?: string }>> | undefined> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!raw) return undefined;

  const parsed = JSON.parse(raw) as StoredSession;
  return parsed.votes;
}
