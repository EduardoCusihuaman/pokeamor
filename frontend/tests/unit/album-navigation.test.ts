/**
 * Índice del álbum (migrado de `tests/22-album-navigation.test.cjs`).
 *
 * Se conservan todas las aserciones del legacy: el grid no se mueve durante el
 * preview, la expansión anclada mantiene el agarre, el release hace scroll a la
 * tanda, las referencias se crean sólo cuando son visibles y el vuelo de las
 * miniaturas respeta el orden y los rectángulos.
 */

import { describe, expect, it } from 'vitest';

import {
  createAlbumIndex,
  type AlbumClassList,
  type AlbumControl,
  type AlbumDocument,
  type AlbumImageSource,
  type AlbumNode,
  type AlbumPointerEvent,
  type AlbumRail,
  type AlbumSection,
  type AlbumSheet,
  type AlbumStyle,
  type AlbumTimers,
  type AlbumUiEvent,
} from '@/application/album';
import type { DetailClone } from '@/application/detail';

interface TestStyle extends AlbumStyle {
  values: Record<string, string>;
}

interface TestClassList extends AlbumClassList {
  values: Set<string>;
}

function createStyle(): TestStyle {
  const values: Record<string, string> = {};
  return {
    values,
    top: undefined,
    setProperty(name, value) {
      values[name] = value;
    },
    removeProperty(name) {
      delete values[name];
    },
  };
}

function createClassList(initial: readonly string[] = []): TestClassList {
  const values = new Set(initial);
  return {
    values,
    add(...tokens) {
      for (const token of tokens) values.add(token);
    },
    remove(...tokens) {
      for (const token of tokens) values.delete(token);
    },
    contains(token) {
      return values.has(token);
    },
    toggle(token, force) {
      if (force === undefined) {
        if (values.has(token)) values.delete(token);
        else values.add(token);
        return;
      }
      if (force) values.add(token);
      else values.delete(token);
    },
  };
}

function createTimers() {
  let id = 0;
  const pending = new Map<number, () => void>();
  const timers: AlbumTimers = {
    setTimeout(callback) {
      const next = ++id;
      pending.set(next, callback);
      return next;
    },
    clearTimeout(handle) {
      if (handle !== undefined) pending.delete(handle);
    },
  };
  return { timers, pending };
}

function slotOf(node: AlbumNode | undefined): string | undefined {
  const style = node?.style as TestStyle | undefined;
  return style?.values['--slot'];
}

function setup(max = 5000) {
  const frames: ((time: number) => void)[] = [];
  const { timers, pending } = createTimers();
  const created: (AlbumNode & { style: TestStyle })[] = [];
  const listeners: Record<string, (event: AlbumUiEvent) => void> = {};
  const overlays: (DetailClone & { removed?: boolean })[] = [];

  const sheetClasses = createClassList(['open', 'rounds-mode']);
  const sheet: AlbumSheet = {
    classList: sheetClasses,
    scrollHeight: max + 600,
    clientHeight: 600,
    scrollTop: 0,
    querySelector: () => ({ offsetHeight: 44 }),
    getBoundingClientRect: () => ({ top: 0, bottom: 600 }),
    scrollTo({ top }) {
      sheet.scrollTop = top;
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };

  const railStyle = createStyle();
  const rail: AlbumRail = {
    classList: createClassList(),
    style: railStyle,
    hidden: false,
    getBoundingClientRect: () => ({ top: 100, bottom: 460, right: 390, height: 360 }),
  };

  const control: AlbumControl = {
    dataset: {},
    getBoundingClientRect: () => ({ top: 200, height: 60 }),
    setAttribute() {},
    setPointerCapture() {},
    hasPointerCapture: () => false,
    releasePointerCapture() {},
    addEventListener(type, listener) {
      listeners[`control-${type}`] = listener;
    },
  };

  const previewStyle = createStyle();
  const previewClasses = createClassList();
  const preview = {
    classList: previewClasses,
    style: previewStyle,
    hidden: false,
    getBoundingClientRect: () => ({ height: 200 }),
    animate: undefined as
      | ((
          frames: readonly { opacity?: number; translate?: string }[],
          options: { duration: number; easing: string },
        ) => { cancel(): void })
      | undefined,
  };

  const sections: AlbumSection[] = Array.from({ length: 5 }, (_, index) => ({
    dataset: { batch: String(4 - index) },
    classList: createClassList(),
    getBoundingClientRect: () => ({ top: index * 1000 - sheet.scrollTop }),
    querySelectorAll: () =>
      Array.from({ length: 15 }, (_, card) => ({
        src: `card-${index}-${card}`,
        alt: `Pokemon ${card}`,
      })),
  }));

  const cards = {
    images: [] as readonly AlbumNode[],
    children: undefined as readonly AlbumNode[] | undefined,
    replaceChildren(...nodes: readonly AlbumNode[]) {
      cards.images = nodes;
      cards.children = nodes;
    },
  };

  const label: { textContent?: string } = {};

  const doc: AlbumDocument = {
    createElement() {
      const node: AlbumNode & { style: TestStyle } = {
        style: createStyle(),
        setAttribute() {},
        append() {},
        replaceChildren() {},
      };
      created.push(node);
      return node;
    },
    body: {
      append(node) {
        overlays.push(node);
      },
    },
  };

  const controller = createAlbumIndex({
    sheet,
    rail,
    control,
    preview,
    root: { querySelectorAll: () => sections },
    cardsHost: cards,
    label,
    document: doc,
    timers,
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    now: () => 1000,
    innerHeight: () => 600,
    showCollectionTab() {},
  });

  return {
    controller,
    sheet,
    sheetClasses,
    rail,
    railStyle,
    control,
    preview,
    previewStyle,
    previewClasses,
    cards,
    label,
    created,
    sections,
    listeners,
    overlays,
    event: (x: number, y: number): AlbumPointerEvent => ({
      clientX: x,
      clientY: y,
      pointerId: 1,
      button: 0,
      preventDefault() {},
    }),
    advance() {
      const jobs = [...pending.values()];
      pending.clear();
      for (const job of jobs) job();
    },
    flush(time = 1000) {
      const jobs = frames.splice(0);
      for (const job of jobs) job(time);
    },
  };
}

describe('album navigation', () => {
  it('keeps the grid still while the preview changes and commits the selected batch', () => {
    const a = setup();
    a.control.onpointerdown?.(a.event(380, 230));
    a.control.onpointermove?.(a.event(380, 420));
    a.flush();
    expect(a.sheet.scrollTop).toBe(0);
    expect(a.cards.images.length).toBe(3);
    expect(a.label.textContent).toBe('3');
    a.control.onpointerup?.(a.event(380, 420));
    expect(a.sheet.scrollTop).toBe(1896);
  });

  it('expands previews from first/middle/last to five stable references', () => {
    const a = setup();
    a.control.onpointerdown?.(a.event(380, 230));
    expect(a.cards.images.map((image) => image.src)).toEqual(['card-0-0', 'card-0-7', 'card-0-14']);
    a.advance();
    expect(a.cards.images.map((image) => image.src)).toEqual([
      'card-0-0',
      'card-0-3',
      'card-0-7',
      'card-0-11',
      'card-0-14',
    ]);
    a.control.onpointermove?.(a.event(380, 420));
    a.flush();
    expect(a.cards.images.length).toBe(3);
    a.control.onpointercancel?.();
    a.advance();
    expect(a.preview.hidden).toBe(true);
    expect(a.sheet.scrollTop).toBe(0);
  });

  it('preserves the original position on a touch without dragging', () => {
    const a = setup();
    a.sheet.scrollTop = 350;
    a.control.onpointerdown?.(a.event(380, 230));
    a.control.onpointerup?.(a.event(380, 230));
    expect(a.sheet.scrollTop).toBe(350);
  });

  it('makes the thumb and preview follow the finger', () => {
    const a = setup();
    a.control.onpointerdown?.(a.event(380, 230));
    const top = a.previewStyle.top;
    a.control.onpointermove?.(a.event(380, 280));
    a.flush();
    const dragTop = parseFloat(a.railStyle.values['--drag-top'] ?? '0');
    const position = Number(a.railStyle.values['--index-position']);
    const dragHeight = parseFloat(a.railStyle.values['--drag-height'] ?? '0');
    expect(Math.abs(dragTop + position * (dragHeight - 60) - 250)).toBeLessThan(0.001);
    expect(a.previewStyle.top).not.toBe(top);
  });

  it('creates only visible references and keeps the last card anchored right', () => {
    const a = setup();
    a.control.onpointerdown?.(a.event(380, 230));
    expect(a.created.length).toBe(3);
    const last = a.cards.images[2];
    expect(slotOf(last)).toBe('0');
    a.advance();
    expect(a.created.length).toBe(5);
    expect(a.cards.images[4]).toBe(last);
    expect(slotOf(last)).toBe('0');
    expect(a.cards.images.map((image) => slotOf(image))).toEqual(['4', '3', '2', '1', '0']);
  });

  it('keeps the preview through destination paint and cancels the handoff on a new gesture', () => {
    const a = setup();
    a.control.onpointerdown?.(a.event(380, 230));
    a.control.onpointermove?.(a.event(380, 420));
    a.flush();
    a.control.onpointerup?.(a.event(380, 420));
    expect(a.preview.hidden).toBe(false);
    a.control.onpointerdown?.(a.event(380, 230));
    a.flush();
    expect(a.preview.hidden).toBe(false);
    a.control.onpointercancel?.();
    expect(a.preview.hidden).toBe(true);
  });

  it('flies previews to matching card rectangles and touch restores all targets', () => {
    const a = setup();
    const animations: {
      frames: readonly { transform?: string }[];
      options: { duration: number };
    }[] = [];
    const rect = { left: 250, top: 200, width: 46, height: 65 };

    a.control.onpointerdown?.(a.event(380, 230));
    a.control.onpointermove?.(a.event(380, 420));
    a.flush();

    const targets: (AlbumImageSource & {
      style: { visibility: string };
      getBoundingClientRect(): { left: number; top: number; width: number; height: number };
      animate(): { cancel(): void };
    })[] = Array.from({ length: 15 }, (_, index) => ({
      style: { visibility: '' },
      getBoundingClientRect: () => ({ left: index * 20, top: 100, width: 80, height: 112 }),
      animate: () => ({ cancel() {} }),
    }));
    const section = a.sections[2];
    if (section) section.querySelectorAll = () => targets;

    for (const node of a.cards.images) {
      node.getBoundingClientRect = () => rect;
      node.cloneNode = () => {
        const overlay: AlbumNode & { removed?: boolean } = {
          style: createStyle(),
          setAttribute() {},
          remove() {
            if (overlay) overlay.removed = true;
          },
          animate(frames, options) {
            animations.push({ frames, options });
            return { cancel() {} };
          },
        };
        return overlay;
      };
    }
    a.preview.animate = () => ({ cancel() {} });

    a.control.onpointerup?.(a.event(380, 420));
    a.control.onlostpointercapture?.();
    a.flush();
    a.flush();

    expect(a.overlays.length).toBe(3);
    expect(animations[0]?.options.duration).toBe(170);
    expect(targets[0]?.style.visibility).toBe('hidden');
    expect(targets[7]?.style.visibility).toBe('hidden');
    expect(targets[14]?.style.visibility).toBe('hidden');
    expect(targets[1]?.style.visibility).toBe('');

    a.listeners.touchstart?.({});
    expect(a.overlays.every((node) => node.removed)).toBe(true);
    expect(targets.every((node) => node.style.visibility === '')).toBe(true);
  });

  it('keeps the destination above the thumb and clamps at the upper edge', () => {
    const a = setup();
    a.control.onpointerdown?.(a.event(380, 230));
    a.control.onpointermove?.(a.event(380, 420));
    a.flush();
    expect((parseFloat(a.previewStyle.top ?? '0') || 0) + 100).toBe(420 - 56);
    a.control.onpointermove?.(a.event(380, 105));
    a.flush();
    const top = parseFloat(a.previewStyle.top ?? '0');
    expect(top).toBeGreaterThanOrEqual(104);
    expect(top + 200).toBeLessThanOrEqual(600);
  });

  it('prevents native touch scrolling only for a scrubber-owned gesture', () => {
    const a = setup();
    let prevented = 0;
    let stopped = 0;
    const event: AlbumUiEvent = {
      touches: [{}],
      cancelable: true,
      preventDefault() {
        prevented++;
      },
      stopPropagation() {
        stopped++;
      },
    };
    a.listeners.touchmove?.(event);
    expect(prevented).toBe(0);
    a.listeners['control-touchstart']?.(event);
    a.listeners.touchmove?.(event);
    expect(prevented).toBe(2);
    expect(stopped).toBe(2);
    a.listeners.touchend?.(event);
    a.listeners.touchmove?.(event);
    expect(prevented).toBe(2);
  });

  it('makes the native scroll grip follow exact continuous progress without moving the grid', () => {
    const a = setup();
    for (const top of [25, 900, 1300, 4123, 5000, 2100, 0]) {
      a.sheet.scrollTop = top;
      a.listeners.scroll?.({});
      expect(a.sheet.scrollTop).toBe(top);
      expect(parseFloat(a.railStyle.values['--index-offset'] ?? '0')).toBeCloseTo(
        (top / 5000) * 300,
        10,
      );
      expect(a.preview.hidden).toBe(true);
    }
  });
});
