import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DiscoveryDeck from '@/components/discovery/DiscoveryDeck.svelte';
import { createDeckController } from '@/engines/deck/controller';
import type { Card } from '@/domain/catalog';
import type { ArtworkImage } from '@/engines/resources/artwork';

test('front artwork geometry follows loads and promotion, preserving images and removing listeners', async () => {
  const stage = document.createElement('div');
  document.body.append(stage);
  const cards: Card[] = [1, 2].map((id) => ({
    id,
    name: String(id),
    image: 'about:blank',
    card: String(id),
    rarity: '',
    palette: { h: 0, s: 0, v: 0 },
    language: 'es',
    surface: null,
    traits: [],
  }));
  const images: HTMLImageElement[] = [];
  const ratios: Array<number | null> = [];
  const deck = createDeckController(stage, {
    onDecision: () => {},
    onArtworkGeometry: (ratio) => ratios.push(ratio),
    createImage: () => {
      const image = document.createElement('img');
      Object.defineProperty(image, 'naturalWidth', { value: 0, configurable: true });
      Object.defineProperty(image, 'naturalHeight', { value: 0, configurable: true });
      images.push(image);
      return image as ArtworkImage;
    },
  });
  try {
    deck.setCards(cards);
    const front = stage.querySelector<HTMLElement>('.card:not(.under)')!;
    const back = stage.querySelector<HTMLElement>('.under')!;
    const load = (index: number, width: number, height: number) => {
      Object.defineProperty(images[index]!, 'naturalWidth', { value: width, configurable: true });
      Object.defineProperty(images[index]!, 'naturalHeight', { value: height, configurable: true });
      images[index]!.dispatchEvent(new Event('load'));
    };
    load(0, 245, 342);
    expect(parseFloat(front.style.aspectRatio)).toBeCloseTo(245 / 342, 6);
    expect(ratios.at(-1)).toBe(245 / 342);
    const count = ratios.length;
    load(1, 300, 400);
    expect(parseFloat(back.style.aspectRatio)).toBe(0.75);
    expect(ratios).toHaveLength(count);
    deck.setCards([cards[1]!]);
    expect(stage.querySelector('.card:not(.under)')).toBe(back);
    expect(back.querySelector('img')).toBe(images[1]);
    expect(ratios.at(-1)).toBe(0.75);
    load(1, 0, 0);
    expect(ratios.at(-1)).toBe(0.75);
    deck.destroy();
    const afterDestroy = ratios.length;
    load(1, 400, 400);
    await Promise.resolve();
    expect(ratios).toHaveLength(afterDestroy);
  } finally {
    deck.destroy();
    stage.remove();
  }
});

test('resize observer fits the front image ratio and disconnects on unmount', async () => {
  const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"/>')}`;
  const card = {
    id: 1,
    name: 'Test',
    image,
    card: '1',
    rarity: '',
    palette: { h: 0, s: 0, v: 0 },
    language: 'es',
    surface: null,
    traits: [],
  } as Card;
  const screen = await render(DiscoveryDeck, {
    current: card,
    resources: null,
    onDecision: () => {},
  });
  const stage = screen.container.querySelector<HTMLElement>('.stage')!;
  stage.style.width = '500px';
  stage.style.height = '406px';
  await vi.waitFor(() =>
    expect(parseFloat(stage.style.getPropertyValue('--card-width'))).toBeCloseTo(300),
  );
  stage.style.height = '206px';
  await vi.waitFor(() =>
    expect(parseFloat(stage.style.getPropertyValue('--card-width'))).toBeCloseTo(150),
  );
  await screen.unmount();
  const width = stage.style.getPropertyValue('--card-width');
  stage.style.height = '306px';
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(stage.style.getPropertyValue('--card-width')).toBe(width);
});

test('already complete artwork publishes geometry, but late complete work after destroy is ignored', async () => {
  const stage = document.createElement('div');
  document.body.append(stage);
  const card = {
    id: 1,
    name: 'Test',
    image: 'about:blank',
    card: '1',
    rarity: '',
    palette: { h: 0, s: 0, v: 0 },
    language: 'es',
    surface: null,
    traits: [],
  } as Card;
  const ratios: Array<number | null> = [];
  const createImage = () => {
    const image = document.createElement('img');
    Object.defineProperties(image, {
      complete: { value: true },
      naturalWidth: { value: 300 },
      naturalHeight: { value: 400 },
    });
    return image as ArtworkImage;
  };
  const deck = createDeckController(stage, {
    onDecision: () => {},
    onArtworkGeometry: (ratio) => ratios.push(ratio),
    createImage,
  });
  try {
    deck.setCards([card]);
    await Promise.resolve();
    expect(ratios.at(-1)).toBe(0.75);
    deck.setCards([]);
    deck.setCards([card]);
    deck.destroy();
    const count = ratios.length;
    await Promise.resolve();
    expect(ratios).toHaveLength(count);
  } finally {
    deck.destroy();
    stage.remove();
  }
});
