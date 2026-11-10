// Migrado de tests/09-artwork-readiness.test.mjs — decode/readiness de `img()`.
// Se conservan todas las aserciones del original y se prueba el módulo TS
// directamente (sin `node:vm` ni `slice()`).
import { describe, expect, it } from 'vitest';

import {
  img,
  type ArtworkCard,
  type ArtworkImage,
  type ArtworkListener,
  type ArtworkTiming,
} from '@/engines/resources/artwork';

class DelayedSourceImage implements ArtworkImage {
  alt = '';
  draggable = true;
  decoding = '';
  src = '';
  naturalWidth = 600;
  naturalHeight = 825;
  artReady?: Promise<boolean>;
  cardReady?: boolean;
  materialSource?: boolean;
  artTiming?: ArtworkTiming;
  onerror: ((event?: unknown) => unknown) | null = null;
  decodes = 0;

  private readonly listeners = new Map<string, ArtworkListener>();

  addEventListener(type: string, listener: ArtworkListener): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string, listener: ArtworkListener): void {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  decode(): Promise<void> {
    this.decodes += 1;
    return Promise.resolve();
  }

  async trigger(type: string): Promise<void> {
    const listener = this.listeners.get(type);
    if (listener) await listener();
  }
}

describe('img artwork readiness', () => {
  it('delayed source decodes after load and keeps the exact resource during flight', async () => {
    let release: (src: string) => void = () => {};
    const image = new DelayedSourceImage();
    const card: ArtworkCard = {
      id: 1,
      card: 'exact',
      name: 'Test',
      image: '/materials/exact/front.png',
      surface: { effect: 'asset-foil' },
    };

    img(card, true, {
      createImage: () => image,
      resources: {
        path: (value) => value.image,
        key: (value) => value.card,
        peek: () => null,
        front: () =>
          new Promise<string>((resolve) => {
            release = resolve;
          }),
      },
      fallback: () => 'sprite',
    });

    expect(image.decodes).toBe(0);

    release('blob:exact');
    await Promise.resolve();
    expect(image.src).toBe('blob:exact');

    await image.trigger('load');
    expect(image.decodes).toBe(1);
    await expect(image.artReady).resolves.toBe(true);
    expect(image.src).toBe('blob:exact');
  });
});
