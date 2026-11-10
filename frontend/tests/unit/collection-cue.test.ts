/**
 * Señal del botón de colección (migrado de `tests/24-collection-cue.test.cjs`).
 *
 * Se conservan las aserciones del legacy: una tanda nueva invita como máximo
 * dos veces (700 ms y 30000 ms) durante 950 ms, y la respiración se suprime con
 * página oculta, reduced motion, batalla inline, gesto o una superposición
 * abierta.
 */

import { describe, expect, it } from 'vitest';

import {
  createCollectionCue,
  type AlbumMediaQuery,
  type AlbumTimers,
  type CollectionCueController,
} from '@/application/album';

interface CueState {
  hidden: boolean;
  reduced: boolean;
  busy: boolean;
  inlinePair: boolean;
  blocked: boolean;
}

function setup() {
  const timers = new Map<number, { run: () => void; ms: number }>();
  const classes = new Set<string>();
  const state: CueState = {
    hidden: false,
    reduced: false,
    busy: false,
    inlinePair: false,
    blocked: false,
  };
  let id = 0;

  const timersApi: AlbumTimers = {
    setTimeout(run, ms) {
      const next = ++id;
      timers.set(next, { run, ms });
      return next;
    },
    clearTimeout(handle) {
      if (handle !== undefined) timers.delete(handle);
    },
  };

  const button = {
    classList: {
      add(token: string) {
        classes.add(token);
      },
      remove(token: string) {
        classes.delete(token);
      },
    },
    addEventListener() {},
  };
  const sheet = { classList: { contains: () => false } };
  const reduced: AlbumMediaQuery = {
    get matches() {
      return state.reduced;
    },
    addEventListener() {},
  };

  const cue: CollectionCueController = createCollectionCue({
    button,
    sheet,
    document: {
      get hidden() {
        return state.hidden;
      },
      querySelector: () => (state.blocked ? {} : null),
      addEventListener() {},
    },
    matchMedia: () => reduced,
    isBusy: () => state.busy,
    hasInlinePair: () => state.inlinePair,
    timers: timersApi,
  });

  return {
    cue,
    classes,
    timers,
    state,
    fire(ms: number) {
      for (const [timerId, timer] of [...timers]) {
        if (timer.ms !== ms) continue;
        timers.delete(timerId);
        timer.run();
      }
    },
  };
}

describe('collection cue', () => {
  it('invites at most twice for a new batch and reading cancels the timers', () => {
    const a = setup();
    a.cue.complete([1]);
    a.fire(700);
    expect(a.classes.has('collection-breath')).toBe(true);
    a.fire(950);
    expect(a.classes.size).toBe(0);
    a.fire(30000);
    expect(a.classes.has('collection-breath')).toBe(true);
    a.fire(950);
    expect(a.timers.size).toBe(0);
    a.cue.complete([2]);
    a.cue.clear();
    expect(a.timers.size).toBe(0);
  });

  it('suppresses breathing for a hidden page, reduced motion, battle and interaction', () => {
    const changes: ((a: ReturnType<typeof setup>) => void)[] = [
      (a) => {
        a.state.hidden = true;
      },
      (a) => {
        a.state.reduced = true;
      },
      (a) => {
        a.state.inlinePair = true;
      },
      (a) => {
        a.state.busy = true;
      },
      (a) => {
        a.state.blocked = true;
      },
    ];
    for (const change of changes) {
      const a = setup();
      a.cue.complete([1]);
      change(a);
      a.fire(700);
      a.fire(30000);
      expect(a.classes.size).toBe(0);
      expect(a.timers.size).toBe(0);
    }
  });
});
