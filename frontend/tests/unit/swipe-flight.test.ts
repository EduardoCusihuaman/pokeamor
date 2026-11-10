// Migrado de tests/35-swipe-flight.test.cjs — launchCard y swipeArc.
// Se conservan todas las aserciones y se prueba el módulo TS directamente
// (sin `node:vm` ni `slice()`).
import { describe, expect, it } from 'vitest';

import {
  launchCard,
  swipeArc,
  type FlightAnimationOptions,
  type FlightFrame,
  type SwipeFlightDeps,
  type SwipeFlightNode,
} from '@/engines/swipe/flight';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('valor de prueba ausente');
  return value;
}

interface FlightSetup {
  readonly node: SwipeFlightNode;
  readonly deps: SwipeFlightDeps;
  readonly animation: { frames: FlightFrame[]; options: FlightAnimationOptions } | undefined;
  readonly removed: number;
  finish(): void;
  cancel(): void;
}

function setup(reduced = false): FlightSetup {
  let resolve: (value: unknown) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  let removed = 0;
  let animation: { frames: FlightFrame[]; options: FlightAnimationOptions } | undefined;
  const node: SwipeFlightNode = {
    getFlightPose: () => ({ x: 60, y: 4, r: 3, rx: 2, ry: -2, s: 1.008 }),
    isConnected: true,
    clientWidth: 300,
    clientHeight: 420,
    style: {},
    getBoundingClientRect: () => ({ left: 70, right: 370, width: 300, height: 420 }),
    remove() {
      removed += 1;
    },
    animate(frames: FlightFrame[], options: FlightAnimationOptions) {
      animation = { frames, options };
      return {
        finished: new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        }),
      };
    },
  };
  return {
    node,
    deps: {
      viewportWidth: 390,
      isReducedMotion: () => reduced,
      setTimeout: () => 1,
      clearTimeout: () => {},
    },
    get animation() {
      return animation;
    },
    get removed() {
      return removed;
    },
    finish: () => resolve(undefined),
    cancel: () => reject(new Error('cancelado')),
  };
}

interface PulseProbe {
  readonly pulseCollection: () => void;
  readonly pulses: { count: number };
}

function pulseProbe(): PulseProbe {
  const pulses = { count: 0 };
  return {
    pulses,
    pulseCollection: () => {
      pulses.count += 1;
    },
  };
}

describe('launchCard flight', () => {
  for (const direction of ['yes', 'no'] as const) {
    it(`${direction} leaves fully opaque from the released position and removes only after completion`, async () => {
      const flight = setup();
      launchCard(flight.node, direction, { vx: 3, dy: 10 }, flight.deps);

      const { frames, options } = required(flight.animation);
      expect(frames[0]?.transform).toBe(
        'translate3d(60px,4px,0) rotate(3deg) rotateX(2deg) rotateY(-2deg) scale(1.008)',
      );
      expect(options.duration).toBeGreaterThanOrEqual(180);
      expect(options.duration).toBeLessThanOrEqual(260);
      expect(frames.length).toBe(17);
      expect(frames[0]?.opacity).toBe(1);
      expect(frames.at(-1)?.opacity).toBe(1);
      expect(options.easing).toBe('linear');

      const last = required(frames.at(-1));
      const travel = Number(required(last.transform.match(/translate3d\(([-\d.]+)px/)?.[1]));
      if (direction === 'yes') expect(70 + travel).toBeGreaterThan(390);
      else expect(370 + travel).toBeLessThan(0);

      expect(flight.removed).toBe(0);
      flight.finish();
      await Promise.resolve();
      expect(flight.removed).toBe(1);
    });
  }

  it('keeps concurrent flights independent', async () => {
    const first = setup();
    const second = setup();
    launchCard(first.node, 'yes', { vx: 3 }, first.deps);
    launchCard(second.node, 'no', { vx: 2 }, second.deps);
    expect(first.animation).toBeDefined();
    expect(second.animation).toBeDefined();

    first.finish();
    await Promise.resolve();
    expect(first.removed).toBe(1);
    expect(second.removed).toBe(0);

    second.cancel();
    await Promise.resolve();
    expect(second.removed).toBe(1);

    first.finish();
    await Promise.resolve();
    expect(first.removed).toBe(1);
  });

  it('reduced motion removes immediately without flight', () => {
    const flight = setup(true);
    launchCard(flight.node, 'yes', {}, flight.deps);
    expect(flight.removed).toBe(1);
    expect(flight.animation).toBeUndefined();
  });

  it('swipe completion has no extra heart animation', async () => {
    for (const direction of ['yes', 'no'] as const) {
      const flight = setup();
      const probe = pulseProbe();
      const deps: SwipeFlightDeps & { pulseCollection: () => void } = {
        ...flight.deps,
        pulseCollection: probe.pulseCollection,
      };

      launchCard(flight.node, direction, {}, deps);
      expect(probe.pulses.count).toBe(0);
      flight.finish();
      await Promise.resolve();
      expect(probe.pulses.count).toBe(0);
    }
  });

  it('undo, removed artwork and cancelled flights cannot pulse later', async () => {
    const modes = ['undo', 'removed', 'cancel'] as const;
    for (const mode of modes) {
      const flight = setup();
      const probe = pulseProbe();
      const deps: SwipeFlightDeps & { pulseCollection: () => void } = {
        ...flight.deps,
        pulseCollection: probe.pulseCollection,
      };

      launchCard(flight.node, 'yes', {}, deps);
      if (mode === 'undo') {
        flight.node.cancelFlight?.();
      } else if (mode === 'removed') {
        flight.node.isConnected = false;
        flight.finish();
      } else {
        flight.cancel();
      }
      await Promise.resolve();
      expect(probe.pulses.count).toBe(0);
    }
  });

  it('flight releases the material gate on completion and cancellation', async () => {
    for (const cancel of [false, true]) {
      const flight = setup();
      let gates = 0;
      const deps: SwipeFlightDeps = {
        ...flight.deps,
        beginFlight: () => {
          gates += 1;
          return () => {
            gates -= 1;
          };
        },
      };

      launchCard(flight.node, 'yes', {}, deps);
      expect(gates).toBe(1);
      if (cancel) flight.cancel();
      else flight.finish();
      await Promise.resolve();
      expect(gates).toBe(0);
    }
  });

  it('shared curve is symmetric and continues rotation and downward travel', () => {
    const left = swipeArc(-150, 300);
    const right = swipeArc(150, 300);
    expect(left.y).toBe(right.y);
    expect(left.r).toBe(-right.r);
    expect(right.y).toBeGreaterThan(0);

    const flight = setup();
    launchCard(flight.node, 'yes', {}, flight.deps);
    const frames = required(flight.animation).frames;
    const y = (frame: FlightFrame): number =>
      Number(required(frame.transform.match(/translate3d\([^,]+,([^p]+)px/)?.[1]));

    expect(y(required(frames.at(-1)))).toBeGreaterThan(y(required(frames[0])));
    expect(
      frames.every((frame, index) => index === 0 || y(frame) >= y(required(frames[index - 1]))),
    ).toBe(true);
  });
});
