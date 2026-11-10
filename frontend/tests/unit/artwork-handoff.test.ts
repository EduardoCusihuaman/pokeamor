// Migrado de tests/08-artwork-handoff.test.cjs — entrega exacta de arte en `img()`.
// Se conservan todas las aserciones del original y se prueba el módulo TS
// directamente (sin `node:vm` ni `slice()`).
import { describe, expect, it } from 'vitest';

import {
  img,
  type ArtworkCard,
  type ArtworkImage,
  type ArtworkListener,
} from '@/engines/resources/artwork';

class TestImage implements ArtworkImage {
  alt = '';
  draggable = true;
  decoding = '';
  src = '';
  naturalWidth = 300;
  naturalHeight = 420;
  isConnected = false;
  cardReady?: boolean;
  materialSource?: boolean;
  artReady?: Promise<boolean>;
  onerror: ((event?: unknown) => unknown) | null = null;

  private readonly listeners = new Map<string, ArtworkListener>();

  addEventListener(type: string, listener: ArtworkListener): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string, listener: ArtworkListener): void {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  decode(): Promise<void> {
    return Promise.resolve();
  }
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function setup(): { image: TestImage; card: ArtworkCard } {
  const image = new TestImage();
  const card: ArtworkCard = {
    id: 1,
    card: 'exact',
    name: 'Test',
    image: '/exact',
    surface: { effect: 'asset-foil' },
  };

  img(card, true, {
    createImage: () => image,
    resources: {
      path: (value) => value.image,
      peek: () => null,
      key: (value) => value.card,
      front: () => Promise.resolve('/exact-ready'),
    },
    fallback: () => '/official',
  });

  return { image, card };
}

describe('img exact artwork handoff', () => {
  it('detached lookahead image receives decoded exact artwork before mounting', async () => {
    const { image } = setup();
    await settle();
    expect(image.src).toBe('/exact-ready');
    expect(image.materialSource).toBe(true);
  });
});
