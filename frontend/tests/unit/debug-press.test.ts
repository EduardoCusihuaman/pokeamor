/**
 * Pulsación larga del modo depuración (migrado de `tests/38-debug-press.test.cjs`).
 *
 * Se preservan las aserciones del legacy: un tap corto no abre nada y solo
 * alterna la selección en modo selección; la pulsación larga previsualiza sin
 * seleccionar; el scroll cancela el preview y cualquier activación posterior; y
 * después del hold, mover scrubbea en lugar de cancelar o seleccionar.
 */

import { describe, expect, it } from 'vitest';

import {
  bindDebugPress,
  type DebugPressButton,
  type DebugPressCard,
  type DebugPressDeps,
} from '@/application/debug';

type MutableDeps = { -readonly [Key in keyof DebugPressDeps]: DebugPressDeps[Key] };

interface SetupResult {
  readonly button: DebugPressButton;
  readonly deps: MutableDeps;
  readonly hold: () => void;
  readonly counts: () => readonly [number, number, boolean];
  readonly setSelectionMode: (value: boolean) => void;
}

const down = { isPrimary: true, button: 0, clientX: 0, clientY: 0 };

function setup(mode = false): SetupResult {
  let timer: (() => void) | null = null;
  let selected = 0;
  const opened = 0;
  let peekSession: object | null = null;
  let selectionMode = mode;

  const deps = {
    timers: {
      setTimeout(callback: () => void) {
        timer = callback;
        return 1;
      },
      clearTimeout() {
        timer = null;
      },
    },
    isSelectionMode: () => selectionMode,
    toggleSelection() {
      selected++;
    },
    syncSelection() {},
    tactile() {},
    hasPeek: () => peekSession !== null,
    showPeek() {
      peekSession = {};
    },
    hidePeek() {
      peekSession = null;
    },
    movePeek() {},
  } satisfies DebugPressDeps;

  const button: DebugPressButton = {
    addEventListener() {},
    style: {},
    classList: { add() {}, remove() {} },
  };
  const card: DebugPressCard = {};
  bindDebugPress(button, card, deps);

  return {
    button,
    deps,
    hold: () => timer?.(),
    counts: () => [selected, opened, peekSession !== null],
    setSelectionMode: (value) => {
      selectionMode = value;
    },
  };
}

describe('debug press', () => {
  it('keeps a normal short tap in the grid and toggles only in selection mode', () => {
    const harness = setup();

    harness.button.onpointerdown?.(down);
    harness.button.onpointerup?.();
    harness.button.onclick?.({ preventDefault() {} });
    expect(harness.counts()).toEqual([0, 0, false]);

    harness.setSelectionMode(true);
    harness.button.onpointerdown?.(down);
    harness.button.onpointerup?.();
    harness.button.onclick?.({ preventDefault() {} });
    expect(harness.counts()).toEqual([1, 0, false]);
  });

  for (const mode of [false, true]) {
    it(`previews on hold without selecting or opening; mode ${String(mode)}`, () => {
      const harness = setup(mode);

      harness.button.onpointerdown?.(down);
      harness.hold();
      expect(harness.counts()).toEqual([0, 0, true]);

      harness.button.onpointerup?.();
      harness.button.onlostpointercapture?.();
      harness.button.onclick?.({ preventDefault() {} });
      expect(harness.counts()).toEqual([0, 0, false]);
      expect(harness.deps.isSelectionMode()).toBe(mode);

      harness.button.onpointerdown?.(down);
      harness.button.onpointerup?.();
      harness.button.onclick?.({ preventDefault() {} });
      expect(harness.counts()).toEqual(mode ? [1, 0, false] : [0, 0, false]);
    });
  }

  it('cancels preview and any trailing activation on scroll', () => {
    const harness = setup(true);

    harness.button.onpointerdown?.(down);
    harness.button.onpointermove?.({ clientX: 0, clientY: 25 });
    harness.hold();
    harness.button.onpointercancel?.();
    harness.button.onclick?.({ preventDefault() {} });
    expect(harness.counts()).toEqual([0, 0, false]);
  });

  it('scrubs after a hold rather than cancelling or selecting', () => {
    const harness = setup(true);
    let moves = 0;
    harness.deps.movePeek = () => {
      moves++;
    };

    harness.button.onpointerdown?.(down);
    harness.hold();
    harness.button.onpointermove?.({ clientX: 150, clientY: 250 });
    expect(moves).toBe(1);
    expect(harness.counts()).toEqual([0, 0, true]);

    harness.button.onpointerup?.();
    expect(harness.counts()).toEqual([0, 0, false]);
  });
});
