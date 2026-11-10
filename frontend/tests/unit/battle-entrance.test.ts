/**
 * Migración de `tests/26-battle-entrance.test.cjs` — entrada de batalla.
 *
 * Se conservan las dos aserciones legacy: movimiento opuesto con impacto a los
 * 140 ms y cancelación por toque (incluido el temporizador de 1150 ms), y la
 * ausencia total de animaciones/temporizadores con `prefers-reduced-motion`.
 */

import { describe, expect, it } from 'vitest';

import {
  createBattleEntrance,
  type BattleAnimation,
  type BattleKeyframe,
  type BattleTimerApi,
  type EntranceButton,
  type EntranceLayer,
  type EntranceNode,
} from '@/application/battle';

interface FakeTimer {
  readonly fn: () => void;
  readonly ms: number;
  cancelled: boolean;
}

interface FakeAnimation {
  readonly frames: readonly BattleKeyframe[];
  readonly opts: { readonly duration: number; readonly delay?: number };
  cancelled: boolean;
}

function setup(reduced = false): {
  entrance: ReturnType<typeof createBattleEntrance>;
  timers: FakeTimer[];
  animations: FakeAnimation[];
  listeners: Map<string, () => void>;
  removed: { count: number };
  sounds: () => number;
} {
  const timers: FakeTimer[] = [];
  const animations: FakeAnimation[] = [];
  const listeners = new Map<string, () => void>();
  const removed = { count: 0 };
  let sounds = 0;

  const timerApi: BattleTimerApi = {
    setTimeout(fn, ms) {
      const timer: FakeTimer = { fn, ms, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(handle) {
      const timer = handle as FakeTimer | undefined;
      if (timer) timer.cancelled = true;
    },
  };

  const node = (): EntranceNode => ({
    className: '',
    classList: {
      add() {},
      remove() {},
      contains: () => false,
    },
    style: {},
    setAttribute() {},
    remove() {
      removed.count += 1;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    animate(frames, opts) {
      const animation: FakeAnimation = { frames, opts, cancelled: false };
      animations.push(animation);
      const result: BattleAnimation = {
        cancel() {
          animation.cancelled = true;
        },
      };
      return result;
    },
  });

  const buttons: EntranceButton[] = [node(), node()];
  const eventLayer = node() as EntranceLayer;
  eventLayer.append = () => {};
  const equalTools = {
    addEventListener() {},
    removeEventListener() {},
  };

  const entrance = createBattleEntrance({
    createElement: () => node(),
    pairBox: { children: buttons },
    eventLayer,
    equalTools,
    timers: timerApi,
    reducedMotion: { matches: reduced },
    sound: () => {
      sounds += 1;
    },
    isInlinePair: () => true,
    isInlineBusy: () => false,
    isLayerHidden: () => false,
    isWide: () => false,
  });

  return {
    entrance,
    timers,
    animations,
    listeners,
    removed,
    sounds: () => sounds,
  };
}

describe('battle entrance', () => {
  it('uses opposite movement and impact sound; touch cancels delayed hints', () => {
    const test = setup();
    test.entrance.cue();

    expect(test.animations).toHaveLength(3);
    expect(test.animations[0]?.frames[0]?.translate).toMatch(/-22/);
    expect(test.animations[1]?.frames[0]?.translate).toMatch(/22/);

    test.timers.find((timer) => timer.ms === 140)?.fn();
    expect(test.sounds()).toBe(1);

    test.listeners.get('pointerdown')?.();
    expect(test.animations.every((animation) => animation.cancelled)).toBe(true);
    expect(test.timers.find((timer) => timer.ms === 1150)?.cancelled).toBe(true);
  });

  it('reduced motion adds no animation or timers', () => {
    const test = setup(true);
    test.entrance.cue();

    expect(test.animations).toHaveLength(0);
    expect(test.timers).toHaveLength(0);
  });
});
