// Migrado de tests/36-swipe-seal.test.cjs — paintSwipeSeal.
// Se conservan todas las aserciones y se prueba el módulo TS directamente
// (sin `node:vm` ni `slice()`).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { commitSwipeSeal, paintSwipeSeal, type SwipeSealElement } from '@/engines/swipe/seal';

interface SealSetup {
  readonly seal: SwipeSealElement;
  readonly styles: Record<string, string>;
  readonly classes: Set<string>;
  paint(direction: number, strength: number): void;
}

function setup(): SealSetup {
  const styles: Record<string, string> = {};
  const classes = new Set<string>();
  const seal: SwipeSealElement = {
    style: {
      opacity: '',
      transform: '',
      setProperty: (name: string, value: string) => {
        styles[name] = value;
      },
    },
    classList: {
      toggle: (token: string, force?: boolean) => {
        const enabled = force ?? !classes.has(token);
        if (enabled) classes.add(token);
        else classes.delete(token);
        return enabled;
      },
    },
  };
  return {
    seal,
    styles,
    classes,
    paint: (direction: number, strength: number) => paintSwipeSeal(seal, direction, strength),
  };
}

describe('paintSwipeSeal', () => {
  it('seal follows gesture progressively, reverses and clears without timers', () => {
    const state = setup();
    let opacity = 0;
    let fill = 0;
    for (const amount of [0, 0.1, 0.3, 0.6, 0.8, 1]) {
      state.paint(1, amount);
      expect(Number(state.seal.style.opacity)).toBeGreaterThanOrEqual(opacity);
      expect(Number(state.styles['--seal-fill'])).toBeGreaterThanOrEqual(fill);
      opacity = Number(state.seal.style.opacity);
      fill = Number(state.styles['--seal-fill']);
    }
    expect(fill).toBe(1);

    state.paint(-1, 0.5);
    expect(state.classes.has('is-yes')).toBe(false);
    state.paint(-1, 0);
    expect(state.seal.style.opacity).toBe('0');
    expect(state.styles['--seal-fill']).toBe('0');
  });

  it('feedback strength is bounded and independent of preference calculation', () => {
    const state = setup();
    state.paint(1, 10);
    expect(state.seal.style.opacity).toBe('1');
    state.paint(-1, -10);
    expect(state.seal.style.opacity).toBe('0');

    const code = readFileSync(
      fileURLToPath(new URL('../../src/engines/swipe/seal.ts', import.meta.url)),
      'utf8',
    );
    expect(code).not.toMatch(/setTimeout|requestAnimationFrame|model\(|getBoundingClientRect/);
  });

  it('commit completes the seal only when it was still hidden', () => {
    const state = setup();
    paintSwipeSeal(state.seal, 1, 0.5);
    const partial = state.seal.style.opacity;

    commitSwipeSeal(state.seal, 1);
    expect(state.seal.style.opacity).toBe(partial);

    state.paint(-1, 0);
    commitSwipeSeal(state.seal, -1);
    expect(state.seal.style.opacity).toBe('1');
    expect(state.styles['--seal-fill']).toBe('1');
    expect(state.classes.has('is-yes')).toBe(false);
  });
});
