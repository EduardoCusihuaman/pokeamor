// Migrado de tests/12-resource-presentation.test.mjs — leases de presentación y decodificación.
// Los casos que ejercitaban src/app.js, src/journey.js, card-resources y el worker
// pertenecen a otras capas y se migran con ellas; aquí se preservan todas las
// invariantes del motor de presentaciones.
import { describe, expect, it } from 'vitest';

import type { IdentitySource } from '@/domain/cards/identity';
import {
  createResourceCoordinator,
  type ArtTiming,
  type ImageReadiness,
  type PresentableImage,
  type ResourceCoordinatorApi,
} from '@/engines/resources/resource-coordinator';

interface CardFixture extends IdentitySource {
  readonly id: number;
  readonly image: string;
}

interface Harness {
  readonly api: ResourceCoordinatorApi;
  readonly calls: string[];
}

class TestImage implements PresentableImage {
  alt = '';
  decoding = '';
  draggable = true;
  src = '';
  naturalWidth = 600;
  naturalHeight = 825;
  isConnected = true;

  cardIdentity?: string;
  cardReady?: boolean;
  resourceState?: ImageReadiness;
  materialSource?: boolean;
  artTiming?: ArtTiming;
  artReady?: Promise<boolean>;
  resourceEager?: boolean;
  resourceWasConnected?: boolean;
  startResource?: () => void;
  stopResource?: () => void;

  decode: () => Promise<void> = () => Promise.resolve();

  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }
}

function card(id: number): CardFixture {
  return { id, card: `print-${id}`, image: `https://assets.tcgdex.net/es/${id}/high.webp` };
}

function artReady(image: PresentableImage): Promise<boolean> {
  if (!image.artReady) throw new Error('La imagen no tiene artReady');
  return image.artReady;
}

function turn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function setup(fetchFails = false): Harness {
  const calls: string[] = [];
  let sequence = 0;

  const api = createResourceCoordinator({
    fetch: (url) => {
      calls.push(url);
      if (fetchFails) return Promise.reject(new Error('fetch blocked'));
      return Promise.resolve({
        ok: true,
        type: 'basic',
        blob: () => Promise.resolve(new Blob(['image'], { type: 'image/png' })),
      });
    },
    createObjectURL: () => `blob:${++sequence}`,
    revokeObjectURL: () => undefined,
    openCache: null,
    createImage: () => new TestImage(),
    listenVisibility: null,
    watchConnections: null,
    createIntersectionObserver: null,
  });

  return { api, calls };
}

describe('resource presentations', () => {
  it('gives a shared transfer independent decode state and lifecycle', async () => {
    const { api, calls } = setup();
    const first = new TestImage();
    const second = new TestImage();

    api.bindImage(first, card(1));
    api.bindImage(second, card(1));
    await turn();
    expect(calls).toHaveLength(1);
    expect(first.cardReady).toBe(false);

    first.dispatch('load');
    second.dispatch('load');
    await expect(artReady(first)).resolves.toBe(true);
    await expect(artReady(second)).resolves.toBe(true);

    api.releaseImage(first);
    expect(api.snapshot().leases).toBe(1);
    expect(second.cardReady).toBe(true);

    api.releaseImage(second);
    expect(api.snapshot().leases).toBe(0);
  });

  it('settles an obsolete presentation on rebind and never installs it later', async () => {
    const { api } = setup();
    const image = new TestImage();

    api.bindImage(image, card(1));
    const obsolete = artReady(image);
    api.bindImage(image, card(2));

    await expect(obsolete).resolves.toBe(false);
    await turn();
    image.dispatch('load');
    await expect(artReady(image)).resolves.toBe(true);
    expect(image.cardIdentity).toBe(api.key(card(2)));
    expect(api.snapshot().leases).toBe(1);

    api.releaseImage(image);
  });

  it('cannot become ready after a decode failure and releases its lease', async () => {
    const { api } = setup();
    const image = new TestImage();
    image.decode = () => Promise.reject(new Error('bad decode'));

    api.bindImage(image, card(1));
    await turn();
    image.dispatch('load');
    await turn();
    expect(image.src).toBe(card(1).image);

    image.dispatch('load');
    await expect(artReady(image)).resolves.toBe(false);
    expect(image.resourceState).toBe('error');
    expect(api.snapshot().leases).toBe(0);
    expect(api.peek(card(1).image)).toBeNull();
  });

  it('uses the exact print low resource for thumbnails and shares deduplication', async () => {
    const { api, calls } = setup();
    const image = new TestImage();

    api.bindImage(image, card(1), { variant: 'thumbnail', priority: 20 });
    await turn();
    expect(calls[0]).toBe('https://assets.tcgdex.net/es/1/low.webp');

    api.releaseImage(image);
    await expect(artReady(image)).resolves.toBe(false);
  });

  it('retries the identical native URL after a fetch failure before declaring an error', async () => {
    const { api } = setup(true);
    const image = new TestImage();

    api.bindImage(image, card(1));
    await turn();
    expect(image.src).toBe(card(1).image);
    expect(image.resourceState).not.toBe('error');

    image.dispatch('load');
    await expect(artReady(image)).resolves.toBe(true);
    api.releaseImage(image);
  });

  it('treats release as cancellation, never as terminal failure', async () => {
    const { api } = setup();
    const image = new TestImage();

    api.bindImage(image, card(1));
    api.releaseImage(image);

    await expect(artReady(image)).resolves.toBe(false);
    expect(image.resourceState).toBe('released');
    await turn();
    expect(image.src).toBe('');
  });

  it('accepts browser-normalized same-origin material URLs on native retry', async () => {
    const { api } = setup(true);
    const image = new TestImage();
    let normalized = '';

    Object.defineProperty(image, 'src', {
      configurable: true,
      get: () => normalized,
      set: (value: string) => {
        normalized = new URL(value, 'https://test.local').href;
      },
    });

    const source: IdentitySource = { ...card(1), image: '/materials/a/front.png' };
    api.bindImage(image, source);
    await turn();
    expect(image.src).toBe('https://test.local/materials/a/front.png');

    image.dispatch('load');
    await expect(artReady(image)).resolves.toBe(true);
    api.releaseImage(image);
  });
});
