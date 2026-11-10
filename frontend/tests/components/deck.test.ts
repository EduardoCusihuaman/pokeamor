import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

import '@/styles/global.css';

import App from '@/App.svelte';
import { createDiscovery } from '@/application/discovery.svelte';
import DiscoveryDeck from '@/components/discovery/DiscoveryDeck.svelte';
import type { Card, CatalogBundle } from '@/domain/catalog';
import type { VoteDecision } from '@/engines/swipe/gesture';

/** GIF transparente: el deck no depende de red ni de decodificación real. */
const IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

function makeCard(id: number, name: string, hue: number): Card {
  return {
    id,
    name,
    image: IMAGE,
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

function frontCard(container: HTMLElement): HTMLElement {
  const card = container.querySelector<HTMLElement>('.stage .card:not(.under):not(.exiting)');
  if (!card) throw new Error('No se encontró la carta frontal del deck.');
  return card;
}

/**
 * Arrastra con Pointer Events del proveedor de Playwright. El primer paso usa
 * la carta como target; el movimiento y la liberación usan coordenadas
 * absolutas para no esperar estabilidad sobre una carta que ya sigue al dedo.
 */
async function dragCard(card: HTMLElement, dx: number, dy = 0): Promise<void> {
  const rect = card.getBoundingClientRect();
  const startX = rect.left + rect.width / 2;
  const startY = rect.top + rect.height / 2;

  await userEvent.pointer([
    { target: card, keys: '[MouseLeft>]' },
    { coords: { x: startX + dx, y: startY + dy } },
    { keys: '[/MouseLeft]' },
  ]);
}

test('a drag past the threshold decides yes and advances to the next card', async () => {
  const decisions: Array<{ decision: VoteDecision; card: Card }> = [];

  const screen = await render(DiscoveryDeck, {
    current: pikachu,
    next: bulbasaur,
    resources: null,
    onDecision: (decision: VoteDecision, card: Card) => decisions.push({ decision, card }),
  });

  await expect.element(screen.getByRole('article', { name: 'Pikachu' })).toBeVisible();
  await dragCard(frontCard(screen.container), 130);

  expect(decisions).toHaveLength(1);
  expect(decisions[0]?.decision).toBe('yes');
  expect(decisions[0]?.card.id).toBe(25);
  await expect.element(screen.getByRole('article', { name: 'Bulbasaur' })).toBeVisible();
});

test('a sub-threshold drag snaps back without a decision', async () => {
  const decisions: Array<{ decision: VoteDecision; card: Card }> = [];

  const screen = await render(DiscoveryDeck, {
    current: pikachu,
    next: bulbasaur,
    resources: null,
    onDecision: (decision: VoteDecision, card: Card) => decisions.push({ decision, card }),
  });

  await expect.element(screen.getByRole('article', { name: 'Pikachu' })).toBeVisible();
  await dragCard(frontCard(screen.container), 12);

  expect(decisions).toHaveLength(0);
  await expect.element(screen.getByRole('article', { name: 'Pikachu' })).toBeVisible();
  expect(screen.getByRole('article', { name: 'Bulbasaur' }).query()).toBeNull();
});

test('DiscoveryScreen routes a gesture into app state and undo restores without voting', async () => {
  const bundle: CatalogBundle = {
    catalog: [pikachu, bulbasaur, charmander],
    manifest: null,
    alternatives: null,
    proxies: null,
  };
  const discovery = createDiscovery({
    loadCatalog: () => Promise.resolve(bundle),
    sessionToken: null,
    clock: { now: () => 1000 },
  });

  const screen = await render(App, { discovery });

  await expect.element(screen.getByRole('article', { name: 'Pikachu' })).toBeVisible();
  await dragCard(frontCard(screen.container), 130);

  await expect.element(screen.getByRole('article', { name: 'Bulbasaur' })).toBeVisible();
  expect(discovery.votes['25']).toEqual({ value: 'yes', time: 1000 });
  expect(discovery.position).toBe(1);
  expect(discovery.canUndo).toBe(true);

  await screen.getByRole('button', { name: 'Deshacer última elección' }).click();

  await expect.element(screen.getByRole('article', { name: 'Pikachu' })).toBeVisible();
  expect(discovery.votes['25']).toBeUndefined();
  expect(discovery.position).toBe(0);
  expect(discovery.revision).toBe(2);

  discovery.dispose();
});
