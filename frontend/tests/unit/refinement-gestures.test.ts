// Migrado de tests/33-refinement-gestures.test.cjs — bindRefinementChoice y
// exitRefinement. Se conservan todas las aserciones y se prueba el módulo TS
// directamente (sin `node:vm` ni `slice()`).
import { describe, expect, it } from 'vitest';

import {
  bindRefinementChoice,
  exitRefinement,
  type RefinementAnimationOptions,
  type RefinementChoiceButton,
  type RefinementClickEvent,
  type RefinementElement,
  type RefinementExitDeps,
  type RefinementFrame,
  type RefinementGestureDeps,
  type RefinementPointerEvent,
  type RefinementWinner,
} from '@/application/refinement-gestures';

const POINTER: RefinementPointerEvent & RefinementClickEvent = {
  button: 0,
  pointerId: 1,
  clientX: 10,
  clientY: 10,
  preventDefault() {},
};

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('valor de prueba ausente');
  return value;
}

interface GestureSetup {
  readonly button: RefinementChoiceButton;
  readonly chosen: number[];
  readonly holding: Set<string>;
  readonly classes: Set<string>;
  hold(): void;
}

function setup(index = 0): GestureSetup {
  let timer: (() => void) | null = null;
  const chosen: number[] = [];
  const holding = new Set<string>();
  const classes = new Set<string>();
  const button: RefinementChoiceButton = {
    classList: {
      add: (...tokens: string[]) => tokens.forEach((token) => classes.add(token)),
      remove: (...tokens: string[]) => tokens.forEach((token) => classes.delete(token)),
    },
    setPointerCapture() {},
  };
  const deps: RefinementGestureDeps = {
    isBusy: () => false,
    pairBox: {
      classList: {
        add: (...tokens: string[]) => tokens.forEach((token) => holding.add(token)),
        remove: (...tokens: string[]) => tokens.forEach((token) => holding.delete(token)),
      },
    },
    choose: (indexValue: number) => chosen.push(indexValue),
    setTimeout: (handler: () => void) => {
      timer = handler;
      return 1;
    },
    clearTimeout: () => {
      timer = null;
    },
  };
  bindRefinementChoice(button, index, deps);
  return {
    button,
    chosen,
    holding,
    classes,
    hold: () => timer?.(),
  };
}

describe('refinement gestures', () => {
  it('tap chooses once after implicit capture release', () => {
    const gesture = setup();
    gesture.button.onpointerdown?.(POINTER);
    gesture.button.onpointerup?.(POINTER);
    gesture.button.onlostpointercapture?.();
    gesture.button.onclick?.(POINTER);
    expect(gesture.chosen).toEqual([0]);
  });

  it('hold preview is removed on release and synthetic click never votes', () => {
    const gesture = setup();
    gesture.button.onpointerdown?.(POINTER);
    gesture.hold();
    gesture.button.onpointerup?.(POINTER);
    gesture.button.onlostpointercapture?.();
    gesture.button.onclick?.(POINTER);
    expect(gesture.holding.size).toBe(0);
    expect(gesture.chosen).toEqual([]);

    gesture.button.onpointerdown?.(POINTER);
    gesture.button.onpointerup?.(POINTER);
    gesture.button.onclick?.(POINTER);
    expect(gesture.chosen).toEqual([0]);
  });

  it('movement and cancellation cannot choose a card', () => {
    const cancels: ((button: RefinementChoiceButton) => void)[] = [
      (button) => button.onpointermove?.({ ...POINTER, clientY: 50 }),
      (button) => button.onpointercancel?.(POINTER),
    ];
    for (const cancel of cancels) {
      const gesture = setup();
      gesture.button.onpointerdown?.(POINTER);
      cancel(gesture.button);
      gesture.button.onpointerup?.(POINTER);
      gesture.button.onclick?.(POINTER);
      expect(gesture.chosen).toEqual([]);
    }
  });

  it('both holds move existing cards and release or cancellation restores the pair', () => {
    for (const index of [0, 1]) {
      for (const end of ['onpointerup', 'onpointercancel', 'onlostpointercapture'] as const) {
        const gesture = setup(index);
        gesture.button.onpointerdown?.(POINTER);
        gesture.hold();
        expect(gesture.holding.has(index === 0 ? 'holding-upper' : 'holding-lower')).toBe(true);

        if (end === 'onpointerup') gesture.button.onpointerup?.(POINTER);
        else if (end === 'onpointercancel') gesture.button.onpointercancel?.(POINTER);
        else gesture.button.onlostpointercapture?.();

        expect(gesture.holding.size).toBe(0);
        gesture.button.onclick?.(POINTER);
        expect(gesture.chosen).toEqual([]);
      }
    }
  });

  it('secondary finger cannot restart or cancel a hold owned by the first pointer', () => {
    const gesture = setup();
    gesture.button.onpointerdown?.(POINTER);
    gesture.button.onpointerdown?.({ ...POINTER, pointerId: 2, isPrimary: false });
    gesture.button.onpointercancel?.({ ...POINTER, pointerId: 2 });
    gesture.hold();
    expect(gesture.holding.has('holding-upper')).toBe(true);
    gesture.button.onpointerup?.({ ...POINTER, pointerId: 2 });
    expect(gesture.holding.has('holding-upper')).toBe(true);
    gesture.button.onpointerup?.(POINTER);
    expect(gesture.holding.size).toBe(0);
    gesture.button.onclick?.(POINTER);
    expect(gesture.chosen.length).toBe(0);
  });

  it('native drag is suppressed for the battle choice', () => {
    const gesture = setup();
    let prevented = false;
    gesture.button.ondragstart?.({
      preventDefault() {
        prevented = true;
      },
    });
    expect(prevented).toBe(true);
  });
});

interface Move {
  readonly frames: RefinementFrame[];
  readonly options: RefinementAnimationOptions;
}

interface ExitSetup {
  readonly deps: RefinementExitDeps;
  readonly sequence: string[];
  readonly moves: Move[];
  readonly nodes: RefinementElement[];
}

function setupExit(): ExitSetup {
  const sequence: string[] = [];
  const moves: Move[] = [];
  const nodes: RefinementElement[] = [];

  const created = (): RefinementElement => {
    const element: RefinementElement = {
      style: {},
      querySelector: () => created(),
      setAttribute() {},
      append() {},
      remove() {},
      animate(frames: RefinementFrame[], options: RefinementAnimationOptions) {
        sequence.push('animate');
        moves.push({ frames, options });
        return { finished: Promise.resolve() };
      },
    };
    return element;
  };

  const deps: RefinementExitDeps = {
    isReducedMotion: () => false,
    isWide: () => false,
    eventLayer: {
      classList: {
        add() {},
        remove() {},
      },
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 300, height: 600 }),
    },
    pairBox: {
      children: [0, 1].map(() => ({
        querySelector: (selector: string) => (selector === 'img' ? { cloneNode: created } : null),
      })),
    },
    createElement: () => {
      const element = created();
      nodes.push(element);
      return element;
    },
    body: {
      append: () => {
        sequence.push('cover');
      },
    },
    finish: () => {
      sequence.push('next');
    },
    setTimeout: () => 0,
  };

  return { deps, sequence, moves, nodes };
}

describe('equal exit', () => {
  it('equality mounts next scene before both outgoing halves travel the same distance', () => {
    const { deps, sequence, moves, nodes } = setupExit();

    exitRefinement(deps);

    expect(sequence).toEqual(['cover', 'next', 'animate', 'animate']);
    expect(required(moves[0]).frames[1]?.transform).toBe('translateY(-300px)');
    expect(required(moves[1]).frames[1]?.transform).toBe('translateY(300px)');
    expect(required(moves[0]).options).toEqual(required(moves[1]).options);
    expect(nodes[1]?.style.height).toBe(nodes[2]?.style.height);

    const winners: RefinementWinner[] = [0, 1];
    for (const winner of winners) {
      sequence.length = 0;
      moves.length = 0;
      exitRefinement(deps, winner);
      expect(sequence).toEqual(['cover', 'next', 'animate', 'animate']);

      const full = 300 / 0.716;
      const upper = required(moves[0]).frames;
      const lower = required(moves[1]).frames;
      const y = (frame: RefinementFrame | undefined): number =>
        Number(required(frame).transform.slice(11, -3));
      expect(Math.abs(y(upper[1]) + full - (300 + y(lower[1])))).toBeLessThan(0.001);
      expect(y(upper[2]) - y(upper[1])).toBe(y(lower[2]) - y(lower[1]));
      expect(Math.sign(y(upper[2]) - y(upper[1]))).toBe(winner === 0 ? 1 : -1);
      expect(required(moves[0]).options.duration).toBe(required(moves[1]).options.duration);
      expect(moves.every((move) => move.frames.every((frame) => !('opacity' in frame)))).toBe(true);
    }
  });
});
