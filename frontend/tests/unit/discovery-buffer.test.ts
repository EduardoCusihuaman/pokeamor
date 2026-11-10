// Migrado de tests/07-discovery-buffer.test.mjs — buffer de presentaciones para swipe.
// Los casos legacy que ejecutaban `src/app.js` (`makeCard`, `vote`, `reconcileDeck`)
// cubrían la capa de aplicación y se migrarán con ella; aquí se preservan todas las
// invariantes del buffer: reutilización, promoción, ventana, presupuesto y liberación.
import { describe, expect, it } from 'vitest';

import {
  create,
  type DiscoveryBuffer,
  type DiscoveryEntry,
} from '../../src/domain/cards/discovery-buffer';

interface Item {
  readonly id: number;
  readonly card: string;
}

const queue: readonly Item[] = Array.from({ length: 30 }, (_, id) => ({
  id,
  card: String(id),
}));

function item(index: number): Item {
  const value = queue[index];
  if (!value) throw new Error(`Falta el encuentro ${index}`);
  return value;
}

/** Presentación de prueba con `ready()` controlable, como en el test legacy. */
class TestEntry implements DiscoveryEntry {
  readonly image = { naturalWidth: 600, naturalHeight: 825 };
  status = 'loading';
  owner = 'buffer';
  used?: number;
  readonly result: Promise<{ status: string }>;
  private resolveResult: (value: { status: string }) => void = () => {};

  constructor() {
    this.result = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }

  transferTo(owner: string): void {
    this.owner = owner;
  }

  release(): void {
    this.status = 'released';
  }

  ready(): void {
    this.status = 'ready';
    this.resolveResult({ status: 'ready' });
  }
}

function setup(): { buffer: DiscoveryBuffer<Item, TestEntry>; readonly made: number } {
  let made = 0;
  const buffer = create<Item, TestEntry>({
    key: (payload) => payload.card,
    prepare: () => {
      made += 1;
      return new TestEntry();
    },
  });
  return {
    buffer,
    get made() {
      return made;
    },
  };
}

function readyEntry(): DiscoveryEntry {
  const entry: DiscoveryEntry = {
    image: { naturalWidth: 600, naturalHeight: 825 },
    status: 'ready',
    owner: 'buffer',
    transferTo(owner) {
      entry.owner = owner;
    },
    release() {
      entry.status = 'released';
    },
  };
  return entry;
}

describe('discovery buffer', () => {
  it('back and prefetch reuse the same image and promotion preserves it', () => {
    const s = setup();

    s.buffer.reconcile(queue);
    const back = s.buffer.take(item(1), 'back');
    const art = back.image;
    s.buffer.reconcile(queue);

    expect(s.made).toBe(5);

    back.ready();
    expect(s.buffer.take(item(1), 'front').image).toBe(art);
    expect(back.status).toBe('ready');
    expect(back.owner).toBe('front');
  });

  it('rapid consumption refills without waiting for flights and keeps bounded entries', () => {
    const s = setup();

    for (let index = 0; index < 25; index += 1) {
      s.buffer.reconcile(queue.slice(index));
      const front = s.buffer.take(item(index), 'front');
      front.ready();
      front.transferTo('flight');
      s.buffer.reconcile(queue.slice(index + 1));

      expect(front.status).toBe('ready');
      expect(s.buffer.snapshot(queue.slice(index + 1)).entries).toBeLessThanOrEqual(10);
      front.release();
    }

    expect(s.made).toBe(30);
  });

  it('ready prefix stops at an undecoded image, even when a later one is ready', () => {
    const s = setup();

    s.buffer.reconcile(queue);
    s.buffer.get(item(0)).ready();
    s.buffer.get(item(2)).ready();

    expect(s.buffer.snapshot(queue).readyPrefix).toBe(1);
    expect(s.buffer.snapshot(queue).entries).toBe(5);
  });

  it('changing queue drops speculation without releasing an active flight', () => {
    const s = setup();

    s.buffer.reconcile(queue);
    const active = s.buffer.take(item(0), 'flight');
    const obsolete = s.buffer.get(item(1));

    s.buffer.reconcile(queue.slice(10));

    expect(active.status).toBe('loading');
    expect(obsolete.status).toBe('released');
  });

  it('a released entry is discarded and prepared again on demand', () => {
    const s = setup();

    const stale = s.buffer.get(item(0));
    stale.release();
    const fresh = s.buffer.get(item(0));

    expect(fresh).not.toBe(stale);
    expect(fresh.status).toBe('loading');
    expect(s.made).toBe(2);
    expect(s.buffer.snapshot(queue).entries).toBe(1);
  });

  it('invalidate only releases entries still owned by the buffer', () => {
    const s = setup();

    s.buffer.reconcile(queue);
    const flight = s.buffer.take(item(0), 'flight');
    const speculative = s.buffer.get(item(1));

    s.buffer.invalidate(item(0));
    expect(flight.status).toBe('loading');

    s.buffer.invalidate(item(1));
    expect(speculative.status).toBe('released');
  });

  it('stops speculation after the third card when the pixel budget is exhausted', () => {
    const buffer = create<Item>({
      key: (payload) => payload.card,
      pixelBudget: 6 * 1024 * 1024,
      prepare: () => readyEntry(),
    });

    buffer.reconcile(queue);

    // 600 x 825 x 4 = 1_980_000 bytes por carta: tres caben, la cuarta no.
    expect(buffer.snapshot(queue).entries).toBe(3);
    expect(buffer.snapshot(queue).windowSize).toBe(5);
  });

  it('burst expands prepared reserve within pixel budget without changing order', () => {
    let time = 0;
    const made: string[] = [];
    const buffer = create<Item>({
      key: (payload) => payload.card,
      now: () => time,
      prepare: (payload) => {
        made.push(payload.card);
        return readyEntry();
      },
    });

    buffer.reconcile(queue);
    expect(buffer.snapshot(queue).windowSize).toBe(5);

    for (let index = 1; index < 8; index += 1) {
      time += 100;
      buffer.reconcile(queue.slice(index));
    }

    expect(buffer.snapshot(queue.slice(7)).windowSize).toBe(10);
    expect(buffer.snapshot(queue.slice(7)).entries).toBeLessThanOrEqual(10);
    expect(made[0]).toBe('0');
    expect(made.slice(0, 5)).toEqual(['0', '1', '2', '3', '4']);
  });

  it('shrinks the window when consumption is slow', () => {
    let time = 0;
    const buffer = create<Item>({
      key: (payload) => payload.card,
      now: () => time,
      prepare: () => readyEntry(),
    });

    buffer.reconcile(queue);
    for (let index = 1; index < 10; index += 1) {
      time += 100;
      buffer.reconcile(queue.slice(index));
    }
    expect(buffer.snapshot(queue.slice(9)).windowSize).toBe(10);

    for (let index = 10; index < 13; index += 1) {
      time += 2_000;
      buffer.reconcile(queue.slice(index));
    }
    expect(buffer.snapshot(queue.slice(12)).windowSize).toBeLessThan(10);
    expect(buffer.snapshot(queue.slice(12)).windowSize).toBeGreaterThanOrEqual(5);
  });
});
