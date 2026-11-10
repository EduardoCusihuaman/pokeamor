// Gesture controller del swipe: física legacy de `src/app.js`
// (`pointerdown`/`pointermove`/`pointerup`/`pointercancel` y el resorte `tick`).
// Sin `node:vm` ni `slice()`: se importa el módulo TS directamente y se
// inyectan eventos de puntero, rectángulos, rAF, timers y matchMedia falsos.
import { describe, expect, it } from 'vitest';

import {
  createSwipeController,
  type SwipeController,
  type SwipeControllerCallbacks,
  type SwipeDecisionContext,
  type SwipeDragState,
  type SwipeGestureDeps,
  type SwipeGestureElement,
  type SwipeGestureStyle,
  type SwipePointerEvent,
  type SwipePointerEventType,
  type SwipePointerListener,
  type SwipePointerSource,
  type SwipeRect,
  type SwipeReleaseState,
  type VoteDecision,
} from '@/engines/swipe/gesture';
import { swipeArc } from '@/engines/swipe/flight';
import type { SwipeSealElement } from '@/engines/swipe/seal';

const CARD: SwipeRect = {
  left: 40,
  top: 60,
  width: 300,
  height: 420,
  right: 340,
  bottom: 480,
};

const STAGE: SwipeRect = {
  left: 0,
  top: 0,
  width: 390,
  height: 844,
  right: 390,
  bottom: 844,
};

/** Fuente de punteros falsa: guarda listeners y despacha eventos tipados. */
class FakePointerSource implements SwipePointerSource {
  private readonly listeners = new Map<SwipePointerEventType, Set<SwipePointerListener>>();

  addEventListener(type: SwipePointerEventType, listener: SwipePointerListener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: SwipePointerEventType, listener: SwipePointerListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: SwipePointerEventType, event: SwipePointerEvent): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  count(type: SwipePointerEventType): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  get total(): number {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}

/** Reloj determinista para rAF y timers. */
class FakeClock {
  time = 1000;
  private readonly frames = new Map<number, (time: number) => void>();
  private readonly timers = new Map<number, { at: number; callback: () => void }>();
  private nextHandle = 1;

  readonly now = (): number => this.time;

  readonly requestAnimationFrame = (callback: (time: number) => void): number => {
    const handle = this.nextHandle++;
    this.frames.set(handle, callback);
    return handle;
  };

  readonly cancelAnimationFrame = (handle: number): void => {
    this.frames.delete(handle);
  };

  readonly setTimeout = (callback: () => void, ms: number): number => {
    const handle = this.nextHandle++;
    this.timers.set(handle, { at: this.time + ms, callback });
    return handle;
  };

  readonly clearTimeout = (handle: number): void => {
    this.timers.delete(handle);
  };

  advance(ms: number): void {
    this.time += ms;
    for (const [handle, timer] of [...this.timers]) {
      if (timer.at <= this.time) {
        this.timers.delete(handle);
        timer.callback();
      }
    }
  }

  frame(ms = 16.7): void {
    this.time += ms;
    const pending = [...this.frames.values()];
    this.frames.clear();
    for (const callback of pending) callback(this.time);
  }

  runFrames(count: number, ms = 16.7): void {
    for (let index = 0; index < count; index += 1) this.frame(ms);
  }

  get pendingFrames(): number {
    return this.frames.size;
  }

  get pendingTimers(): number {
    return this.timers.size;
  }
}

interface ElementProbe {
  readonly element: SwipeGestureElement;
  readonly classes: Set<string>;
  readonly styles: Record<string, string>;
}

function makeElement(): ElementProbe {
  const classes = new Set<string>();
  const styles: Record<string, string> = {};
  const style: SwipeGestureStyle = {
    transform: '',
    transition: '',
    setProperty(name: string, value: string) {
      styles[name] = value;
    },
  };
  const element: SwipeGestureElement = {
    style,
    classList: {
      add(...tokens: string[]) {
        for (const token of tokens) classes.add(token);
      },
      remove(...tokens: string[]) {
        for (const token of tokens) classes.delete(token);
      },
    },
  };
  return { element, classes, styles };
}

interface Harness {
  readonly controller: SwipeController;
  readonly source: FakePointerSource;
  readonly clock: FakeClock;
  readonly element: SwipeGestureElement;
  readonly classes: Set<string>;
  readonly styles: Record<string, string>;
  readonly decisions: Array<{ decision: VoteDecision; context: SwipeDecisionContext }>;
  readonly drags: SwipeDragState[];
  readonly releases: SwipeReleaseState[];
  readonly captures: number[];
  readonly releasedCaptures: number[];
  readonly resets: { count: number };
  readonly lifts: { count: number };
  down(x: number, y: number, overrides?: Partial<SwipePointerEvent>): void;
  move(x: number, y: number, overrides?: Partial<SwipePointerEvent>): void;
  up(x: number, y: number, overrides?: Partial<SwipePointerEvent>): void;
  cancelEvent(x: number, y: number): void;
}

function pointer(
  x: number,
  y: number,
  overrides: Partial<SwipePointerEvent> = {},
): SwipePointerEvent {
  return { pointerId: 1, clientX: x, clientY: y, isPrimary: true, button: 0, ...overrides };
}

function makeSeal(): {
  seal: SwipeSealElement;
  styles: Record<string, string>;
  classes: Set<string>;
} {
  const styles: Record<string, string> = {};
  const classes = new Set<string>();
  const seal: SwipeSealElement = {
    style: {
      opacity: '',
      transform: '',
      setProperty(name: string, value: string) {
        styles[name] = value;
      },
    },
    classList: {
      toggle(token: string, force?: boolean) {
        const enabled = force ?? !classes.has(token);
        if (enabled) classes.add(token);
        else classes.delete(token);
        return enabled;
      },
    },
  };
  return { seal, styles, classes };
}

function setup(reduced = false, seal: SwipeSealElement | null = null): Harness {
  const source = new FakePointerSource();
  const clock = new FakeClock();
  const probe = makeElement();
  const decisions: Harness['decisions'] = [];
  const drags: Harness['drags'] = [];
  const releases: Harness['releases'] = [];
  const captures: number[] = [];
  const releasedCaptures: number[] = [];
  const resets = { count: 0 };
  const lifts = { count: 0 };

  const callbacks: SwipeControllerCallbacks = {
    onDecision(decision, context) {
      decisions.push({ decision, context });
    },
    onDrag(state) {
      drags.push(state);
    },
    onRelease(state) {
      releases.push(state);
    },
    onReset() {
      resets.count += 1;
    },
    onLift() {
      lifts.count += 1;
    },
  };

  const deps: SwipeGestureDeps = {
    pointerSource: source,
    getBoundingClientRect: () => CARD,
    getStageRect: () => STAGE,
    setPointerCapture: (_element, pointerId) => {
      captures.push(pointerId);
    },
    releasePointerCapture: (_element, pointerId) => {
      releasedCaptures.push(pointerId);
    },
    requestAnimationFrame: clock.requestAnimationFrame,
    cancelAnimationFrame: clock.cancelAnimationFrame,
    matchMedia: () => ({ matches: reduced }),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    getCardId: () => 'card-42',
    seal,
  };

  const controller = createSwipeController(probe.element, callbacks, deps);

  return {
    controller,
    source,
    clock,
    element: probe.element,
    classes: probe.classes,
    styles: probe.styles,
    decisions,
    drags,
    releases,
    captures,
    releasedCaptures,
    resets,
    lifts,
    down: (x, y, overrides) => source.dispatch('pointerdown', pointer(x, y, overrides)),
    move: (x, y, overrides) => source.dispatch('pointermove', pointer(x, y, overrides)),
    up: (x, y, overrides) => source.dispatch('pointerup', pointer(x, y, overrides)),
    cancelEvent: (x, y) => source.dispatch('pointercancel', pointer(x, y)),
  };
}

describe('createSwipeController', () => {
  it('emits yes with the cardId after a rightward swipe beyond the threshold', () => {
    const harness = setup();
    harness.down(100, 200);
    harness.clock.advance(10);
    harness.move(300, 205);
    harness.clock.advance(10);
    harness.up(300, 205);

    expect(harness.decisions).toHaveLength(1);
    const decision = harness.decisions[0];
    expect(decision?.decision).toBe('yes');
    expect(decision?.context.cardId).toBe('card-42');
    expect(decision?.context.direction).toBe(1);
    expect(decision?.context.momentum.vx).toBeGreaterThan(0);
    expect(decision?.context.pose.x).toBe(200);
    expect(harness.lifts.count).toBe(1);
    expect(harness.classes.has('active')).toBe(true);
  });

  it('emits no with the cardId after a leftward swipe beyond the threshold', () => {
    const harness = setup();
    harness.down(300, 200);
    harness.clock.advance(10);
    harness.move(100, 205);
    harness.clock.advance(10);
    harness.up(100, 205);

    expect(harness.decisions).toHaveLength(1);
    expect(harness.decisions[0]?.decision).toBe('no');
    expect(harness.decisions[0]?.context.cardId).toBe('card-42');
    expect(harness.decisions[0]?.context.direction).toBe(-1);
    expect(harness.decisions[0]?.context.pose.x).toBe(-200);
  });

  it('applies the legacy drag transform and arc rotation', () => {
    const harness = setup();
    harness.down(100, 200);
    harness.clock.advance(10);
    harness.move(500, 240);

    // `dragX` comprime el exceso sobre 0.7·width (210 px) al 45 %.
    const dragX = 210 + (400 - 210) * 0.45;
    const arc = swipeArc(dragX, CARD.width);
    const px = 100; // clamp((500 − (0 + (390 − 300)/2)) / 300 · 100)
    const py = ((240 - (STAGE.height - CARD.height) / 2) / CARD.height) * 100;
    const rx = (50 - py) * 0.04;
    const ry = (px - 50) * 0.045;

    expect(harness.element.style.transform).toBe(
      `translate3d(${dragX}px,${40 * 0.14 + arc.y}px,0) ` +
        `rotate(${arc.r}deg) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.008)`,
    );
    expect(harness.drags).toHaveLength(1);
    expect(harness.drags[0]?.threshold).toBe(63);
    expect(harness.drags[0]?.direction).toBe(1);
    expect(harness.drags[0]?.armed).toBe(1);
    expect(harness.drags[0]?.strength).toBe(1);
    expect(harness.styles['--love']).toBe('1');
    expect(harness.styles['--pass']).toBe('0');
  });

  it('arms at the threshold and keeps hysteresis below 0.72·threshold', () => {
    const harness = setup();
    harness.down(100, 200);
    harness.clock.advance(10);

    harness.move(162, 200); // dx = 62 < 63
    expect(harness.drags.at(-1)?.armed).toBe(0);

    harness.move(163, 200); // dx = 63 === threshold
    expect(harness.drags.at(-1)?.armed).toBe(1);

    harness.move(145, 200); // dx = 45 < 45.36
    expect(harness.drags.at(-1)?.armed).toBe(0);

    harness.move(146, 200); // dx = 46: ya desarmado, sigue 0
    expect(harness.drags.at(-1)?.armed).toBe(0);

    harness.move(163, 200); // vuelve a armar
    expect(harness.drags.at(-1)?.armed).toBe(1);

    harness.move(150, 200); // dx = 50 > 45.36: conserva el armado
    expect(harness.drags.at(-1)?.armed).toBe(1);
  });

  it('cancels a small move back to origin without a decision', () => {
    const harness = setup();
    harness.down(100, 200);
    harness.clock.advance(10);
    harness.move(110, 202); // dx = 10, por debajo del umbral de 63
    harness.clock.advance(10);
    harness.up(110, 202);

    expect(harness.decisions).toHaveLength(0);
    expect(harness.releases.at(-1)?.decision).toBeNull();
    expect(harness.resets.count).toBe(1);
    expect(harness.classes.has('active')).toBe(false);
    expect(harness.classes.has('lifted')).toBe(false);

    harness.clock.runFrames(240);
    const pose = harness.controller.getPose();
    expect(Math.abs(pose.x)).toBeLessThan(0.01);
    expect(Math.abs(pose.y)).toBeLessThan(0.01);
    expect(Math.abs(pose.r)).toBeLessThan(0.01);
    expect(pose.s).toBeCloseTo(1, 3);
  });

  it('settles a tap after 160 ms and still emits no decision', () => {
    const harness = setup();
    harness.down(100, 200);
    harness.clock.advance(10);
    harness.up(100, 200);

    expect(harness.resets.count).toBe(0);
    expect(harness.releases.at(-1)?.decision).toBeNull();

    harness.clock.advance(159);
    expect(harness.resets.count).toBe(0);
    harness.clock.advance(1);
    expect(harness.resets.count).toBe(1);
    expect(harness.clock.pendingTimers).toBe(0);

    harness.clock.runFrames(240);
    expect(harness.controller.getPose().x).toBeCloseTo(0, 3);
  });

  it('cancel() is idempotent, silent and leaves the origin pose', () => {
    const harness = setup();
    harness.down(100, 200);
    harness.clock.advance(10);
    harness.move(300, 205);

    const dragsBefore = harness.drags.length;
    const releasesBefore = harness.releases.length;

    harness.controller.cancel();
    const framesAfterFirstCancel = harness.clock.pendingFrames;
    harness.controller.cancel();

    expect(harness.clock.pendingFrames).toBe(framesAfterFirstCancel);
    expect(harness.decisions).toHaveLength(0);
    expect(harness.resets.count).toBe(0);
    expect(harness.lifts.count).toBe(1);
    expect(harness.drags).toHaveLength(dragsBefore);
    expect(harness.releases).toHaveLength(releasesBefore);
    // La captura se libera una sola vez (el segundo cancel es un no-op).
    expect(harness.releasedCaptures).toEqual([1]);

    harness.clock.runFrames(240);
    const pose = harness.controller.getPose();
    expect(Math.abs(pose.x)).toBeLessThan(0.01);
    expect(Math.abs(pose.y)).toBeLessThan(0.01);
    expect(pose.s).toBeCloseTo(1, 3);
    expect(harness.controller.isActive()).toBe(false);

    // Sigue habilitado para un gesto nuevo.
    harness.down(100, 200);
    harness.clock.advance(10);
    harness.move(300, 205);
    harness.clock.advance(10);
    harness.up(300, 205);
    expect(harness.decisions).toHaveLength(1);
    expect(harness.decisions[0]?.decision).toBe('yes');
  });

  it('destroy() disconnects every listener and emits no callbacks afterwards', () => {
    const harness = setup();
    harness.down(100, 200);
    harness.clock.advance(10);
    harness.move(300, 205);

    const dragsBefore = harness.drags.length;
    harness.controller.destroy();

    expect(harness.clock.pendingFrames).toBe(0);
    expect(harness.clock.pendingTimers).toBe(0);
    expect(harness.source.total).toBe(0);
    for (const type of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'lostpointercapture',
    ] as const) {
      expect(harness.source.count(type)).toBe(0);
    }

    harness.move(500, 205);
    harness.up(500, 205);
    harness.down(100, 200);

    expect(harness.decisions).toHaveLength(0);
    expect(harness.drags).toHaveLength(dragsBefore);
    expect(harness.releases).toHaveLength(0);
    expect(harness.captures).toEqual([1]);

    expect(() => {
      harness.controller.destroy();
    }).not.toThrow();
  });

  it('does not start while disabled and starts after setEnabled(true)', () => {
    const harness = setup();
    harness.controller.setEnabled(false);
    harness.down(100, 200);
    expect(harness.captures).toHaveLength(0);
    expect(harness.lifts.count).toBe(0);

    harness.controller.setEnabled(true);
    harness.down(100, 200);
    expect(harness.captures).toEqual([1]);
    expect(harness.lifts.count).toBe(1);
  });

  it('honours prefers-reduced-motion with immediate poses and no spring frames', () => {
    const harness = setup(true);
    harness.down(100, 200);
    harness.move(110, 202);
    harness.clock.advance(10);
    harness.up(110, 202);

    expect(harness.decisions).toHaveLength(0);
    expect(harness.clock.pendingFrames).toBe(0);
    expect(harness.controller.getPose().x).toBe(0);
    expect(harness.controller.getPose().s).toBe(1);

    harness.down(100, 200);
    harness.move(300, 205);
    harness.clock.advance(10);
    harness.up(300, 205);
    expect(harness.decisions).toHaveLength(1);
    expect(harness.decisions[0]?.decision).toBe('yes');
  });

  it('ignores secondary pointers and non-primary buttons', () => {
    const harness = setup();
    harness.down(100, 200, { isPrimary: false });
    harness.down(100, 200, { button: 2 });
    expect(harness.captures).toHaveLength(0);
    expect(harness.lifts.count).toBe(0);

    harness.down(100, 200);
    harness.clock.advance(10);
    harness.move(300, 205, { pointerId: 2 });
    expect(harness.drags).toHaveLength(0);
    harness.up(300, 205, { pointerId: 2 });
    expect(harness.decisions).toHaveLength(0);
  });

  it('paints the seal progressively, reverses it and clears it on cancel', () => {
    const { seal, styles, classes } = makeSeal();
    const harness = setup(false, seal);

    harness.down(100, 200);
    harness.move(150, 200); // dx = 50, strength ≈ 0.79
    const firstOpacity = Number(seal.style.opacity);
    expect(firstOpacity).toBeGreaterThan(0);
    expect(classes.has('is-yes')).toBe(true);
    expect(Number(styles['--seal-fill'])).toBeGreaterThan(0);

    harness.move(110, 200); // dx = 10, la fuerza baja
    expect(Number(seal.style.opacity)).toBeLessThan(firstOpacity);
    expect(Number(styles['--seal-fill'])).toBe(0);

    harness.move(90, 200); // dx = −10, invierte la dirección
    expect(classes.has('is-yes')).toBe(false);

    harness.controller.cancel();
    expect(seal.style.opacity).toBe('0');
    expect(styles['--seal-fill']).toBe('0');
  });

  it('treats pointercancel as a silent decision-free reset', () => {
    const harness = setup();
    harness.down(100, 200);
    harness.clock.advance(10);
    harness.move(300, 205);
    harness.cancelEvent(300, 205);

    expect(harness.decisions).toHaveLength(0);
    expect(harness.resets.count).toBe(1);
    expect(harness.releasedCaptures).toEqual([1]);
  });
});
