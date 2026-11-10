/**
 * Retorno animado del detalle (migrado de `tests/39-detail-return.test.cjs`).
 *
 * Se conservan las aserciones del legacy: el cierre vuela un clon de la imagen
 * grande hasta la miniatura sin moverla, dura 180 ms, oculta la miniatura
 * mientras dura y la restaura al limpiar; con reduced motion cierra de
 * inmediato y deja la miniatura visible.
 */

import { describe, expect, it } from 'vitest';

import {
  createDetailReturn,
  type DetailAnimation,
  type DetailAnimationOptions,
  type DetailClone,
  type DetailImage,
  type DetailKeyframe,
  type DetailMediaQuery,
  type DetailTimers,
} from '@/application/detail';

function setup(reduced = false) {
  let removed = false;
  const animations: { frames: readonly DetailKeyframe[]; options: DetailAnimationOptions }[] = [];
  const timers: (() => void)[] = [];

  const thumb = {
    style: { visibility: '' },
    getBoundingClientRect: () => ({ left: 30, top: 200, bottom: 300, width: 70, height: 100 }),
  };
  const origin = {
    isConnected: true,
    querySelector: () => thumb,
    classList: {
      remove() {},
      add() {
        throw new Error('Unexpected return highlight');
      },
    },
  };
  const dialog = {
    open: true,
    close() {
      dialog.open = false;
    },
  };
  const clone: DetailClone = {
    style: {},
    setAttribute() {},
    remove() {
      removed = true;
    },
    animate(frames, options) {
      animations.push({ frames, options });
      return { cancel() {}, finished: new Promise(() => {}) };
    },
  };
  const sheet = {
    scrollTop: 123,
    classList: { contains: () => true },
    getBoundingClientRect: () => ({ top: 0, bottom: 600 }),
    querySelector: () => ({ offsetHeight: 44 }),
  };
  const image: DetailImage = {
    animate: (): DetailAnimation => ({ cancel() {} }),
    getBoundingClientRect: () => ({ left: 5, top: 70, width: 300, height: 420 }),
    cloneNode: () => clone,
  };
  const reducedQuery: DetailMediaQuery = { matches: reduced };
  const timersApi: DetailTimers = {
    setTimeout(run) {
      timers.push(run);
      return timers.length;
    },
    clearTimeout() {},
  };

  const controller = createDetailReturn({
    dialog,
    sheet,
    getImage: () => image,
    getOrigin: () => origin,
    document: { body: { append() {} } },
    timers: timersApi,
    matchMedia: () => reducedQuery,
    render() {},
  });

  return {
    controller,
    dialog,
    thumb,
    sheet,
    animations,
    isRemoved: () => removed,
  };
}

describe('detail return', () => {
  it('animates back without moving a visible origin or adding a highlight', () => {
    const a = setup();
    a.controller.closeDetail();
    expect(a.dialog.open).toBe(false);
    expect(a.sheet.scrollTop).toBe(123);
    expect(a.animations[0]?.options.duration).toBe(180);
    expect(a.thumb.style.visibility).toBe('hidden');
    a.controller.clearDetailReturn();
    expect(a.thumb.style.visibility).toBe('');
    expect(a.isRemoved()).toBe(true);
  });

  it('closes immediately and keeps the thumbnail visible with reduced motion', () => {
    const a = setup(true);
    a.controller.closeDetail();
    expect(a.dialog.open).toBe(false);
    expect(a.animations.length).toBe(0);
    expect(a.thumb.style.visibility).toBe('');
  });
});
