/**
 * Auto-expansión de una tanda asentada (migrado de
 * `tests/23-album-reading.test.cjs`).
 *
 * Se conservan las aserciones del legacy: la tanda crece a los dos segundos y
 * deja el encabezado debajo del header, el scroll continuo y un pointer
 * mantenido la bloquean, reduced motion la desactiva y al salir de una tanda
 * expandida se conserva el encabezado siguiente.
 */

import { describe, expect, it } from 'vitest';

import {
  createSettledBatch,
  type AlbumAnimation,
  type AlbumRect,
  type AlbumTimers,
  type AlbumUiEvent,
  type BatchSection,
  type BatchTile,
  type SettledBatchSheet,
} from '@/application/album';

interface FakeTile extends BatchTile {
  getBoundingClientRect(): AlbumRect;
  animate(): AlbumAnimation;
}

function setup(reduced = false) {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { run: () => void; at: number }>();
  const events: Record<string, (event: AlbumUiEvent) => void> = {};
  const classes = new Set<string>();
  const sheetClasses = new Set(['open', 'rounds-mode']);
  const sheetScroll = { top: 0 };

  const rect = (top: number, height: number): AlbumRect => ({
    left: 0,
    top: top - sheetScroll.top,
    right: 300,
    bottom: top + height - sheetScroll.top,
    width: 300,
    height,
  });

  const tile: FakeTile = {
    getBoundingClientRect: () => rect(classes.has('reading-batch') ? 160 : 100, 100),
    animate: () => ({ cancel() {}, finished: Promise.resolve() }),
  };
  const heading: FakeTile = {
    getBoundingClientRect: () => rect(80, 20),
    animate: () => ({ cancel() {}, finished: Promise.resolve() }),
  };
  const next: FakeTile = {
    getBoundingClientRect: () => rect(classes.has('reading-batch') ? 1000 : 500, 20),
    animate: () => ({ cancel() {}, finished: Promise.resolve() }),
  };
  const section: BatchSection = {
    querySelector: () => heading,
    contains: (node) => node === tile || node === heading,
    isConnected: true,
    classList: {
      toggle(token, value) {
        if (value) classes.add(token);
        else classes.delete(token);
      },
      remove(token) {
        classes.delete(token);
      },
    },
    querySelectorAll: () => [tile, tile, tile, tile],
    getBoundingClientRect: () => rect(80, classes.has('reading-batch') ? 900 : 400),
  };
  const root = {
    querySelectorAll: (selector: string): readonly BatchTile[] =>
      selector === '.batch-group' ? [section] : [tile, heading, next],
  };

  const sheet: SettledBatchSheet = {
    get scrollTop() {
      return sheetScroll.top;
    },
    set scrollTop(value: number) {
      sheetScroll.top = value;
    },
    classList: { contains: (token) => sheetClasses.has(token) },
    querySelector: () => ({
      getBoundingClientRect: () => ({ bottom: 50 }),
    }),
    getBoundingClientRect: () => ({ top: 0, bottom: 700 }),
    addEventListener(type, listener) {
      events[type] = listener;
    },
  };
  const reducedQuery = {
    matches: reduced,
    addEventListener() {},
  };

  const timersApi: AlbumTimers = {
    setTimeout(run, ms) {
      const nextId = ++id;
      timers.set(nextId, { run, at: now + ms });
      return nextId;
    },
    clearTimeout(handle) {
      if (handle !== undefined) timers.delete(handle);
    },
  };

  createSettledBatch({
    sheet,
    root,
    document: {
      hidden: false,
      addEventListener(type, listener) {
        events[type] = listener;
      },
    },
    window: { addEventListener() {} },
    matchMedia: () => reducedQuery,
    isDetailOpen: () => false,
    now: () => now,
    innerHeight: () => 700,
    timers: timersApi,
  });

  return {
    classes,
    sheet,
    events,
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const nextTimer = [...timers]
          .filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!nextTimer) break;
        now = nextTimer[1].at;
        timers.delete(nextTimer[0]);
        nextTimer[1].run();
      }
      now = end;
    },
  };
}

describe('settled batch auto-expand', () => {
  it('grows after two seconds and places its heading below the collection header', () => {
    const h = setup();
    h.events.scroll?.({});
    h.advance(2199);
    expect(h.classes.size).toBe(0);
    h.advance(1);
    expect(h.classes.has('reading-batch')).toBe(true);
    expect(h.sheet.scrollTop).toBe(22);
  });

  it('blocks automatic expansion during continuous native scroll and a held pointer', () => {
    const h = setup();
    h.events.scroll?.({});
    h.advance(1500);
    h.events.scroll?.({});
    h.advance(1500);
    expect(h.classes.size).toBe(0);
    h.events.pointerdown?.({});
    h.advance(5000);
    expect(h.classes.size).toBe(0);
    h.events.pointerup?.({});
    h.advance(2220);
    expect(h.classes.has('reading-batch')).toBe(true);
  });

  it('disables automatic growth with reduced motion', () => {
    const h = setup(true);
    h.events.scroll?.({});
    h.advance(10000);
    expect(h.classes.size).toBe(0);
  });

  it('preserves the next heading while cards contract after leaving an expanded batch', () => {
    const h = setup();
    h.events.scroll?.({});
    h.advance(2200);
    h.sheet.scrollTop = 950;
    h.events.scroll?.({});
    h.advance(500);
    expect(h.classes.size).toBe(0);
    expect(h.sheet.scrollTop).toBe(450);
  });
});
