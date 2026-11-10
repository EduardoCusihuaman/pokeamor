// Migrado de tests/10-native-art-readiness.test.mjs — `artworkReady()` para
// imágenes nativas precargadas. Se conservan todas las aserciones del original
// y se prueba el módulo TS directamente (sin `node:vm` ni `slice()`).
import { describe, expect, it } from 'vitest';

import { artworkReady, type ArtworkImage, type ArtworkListener } from '@/engines/resources/artwork';

class NativeImage implements ArtworkImage {
  alt = '';
  draggable = false;
  decoding = 'async';
  src = 'exact';
  naturalWidth: number;
  naturalHeight = 825;
  complete: boolean;
  cardReady?: boolean;
  artReady?: Promise<boolean>;

  private readonly listeners = new Map<string, ArtworkListener>();

  constructor(complete: boolean, naturalWidth: number) {
    this.complete = complete;
    this.naturalWidth = naturalWidth;
  }

  addEventListener(type: string, listener: ArtworkListener): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string, listener: ArtworkListener): void {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  decode(): Promise<void> {
    return Promise.resolve();
  }

  async trigger(type: string): Promise<void> {
    const listener = this.listeners.get(type);
    if (listener) await listener();
  }
}

const fallback = (): string => 'sprite';

function setup(complete: boolean, naturalWidth: number): NativeImage {
  return new NativeImage(complete, naturalWidth);
}

describe('artworkReady for native preloaded images', () => {
  it('native preloaded alternative image acquires battle readiness without redownload', async () => {
    const art = setup(true, 600);
    expect(art.artReady).toBeUndefined();
    await expect(artworkReady(art, {}, { fallback })).resolves.toBe(true);
    expect(art.cardReady).toBe(true);
  });

  it('native image with empty source waits rather than failing immediately', async () => {
    const art = setup(true, 0);
    let done = false;
    const ready = artworkReady(art, {}, { fallback }).then((ok) => {
      done = true;
      return ok;
    });

    await Promise.resolve();
    expect(done).toBe(false);

    art.naturalWidth = 600;
    await art.trigger('load');
    await expect(ready).resolves.toBe(true);
  });

  it('failed native artwork settles false and cannot impersonate a valid card', async () => {
    const art = setup(false, 0);
    const ready = artworkReady(art, {}, { fallback });
    await art.trigger('error');
    await expect(ready).resolves.toBe(false);
    expect(art.cardReady).toBe(false);
  });
});
