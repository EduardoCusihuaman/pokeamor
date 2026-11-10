/**
 * Hit-test y zoom del modo depuración (migrado de `tests/37-debug-peek.test.cjs`).
 *
 * Se preservan las aserciones del legacy: el scrub sigue al tile bajo el dedo
 * aunque iOS conserve el tile original capturado, los gutters entre tiles no
 * repintan, y el zoom delega la carga de la imagen al coordinador de recursos
 * con `priority: 0`.
 */

import { describe, expect, it } from 'vitest';

import {
  moveDebugPeek,
  paintDebugPeek,
  type DebugPeekCard,
  type DebugPeekImage,
  type DebugPeekResourceBridge,
  type DebugPeekSession,
  type DebugRect,
  type DebugTile,
  type DebugTileDocument,
} from '@/application/debug';

interface TestElement {
  debugPokemon: DebugPeekCard;
  classList: { add(): void; remove(): void };
  getBoundingClientRect(): DebugRect;
  closest(selector: string): TestElement | null;
}

function tile(name: string, left: number): TestElement {
  return {
    debugPokemon: { name, image: `https://cards.test/${name}/high.webp` },
    classList: { add() {}, remove() {} },
    getBoundingClientRect: () => ({ left, right: left + 90, top: 100, bottom: 230 }),
    closest(selector) {
      return selector === '#grid .tile' ? this : null;
    },
  };
}

interface PaintCall {
  readonly card: DebugPeekCard;
  readonly tile: DebugTile;
}

function hitHarness() {
  const first = tile('first', 0);
  const second = tile('second', 100);
  const session: DebugPeekSession = {
    image: { src: '', alt: '' },
    tile: first,
    serial: 0,
  };
  const paints: PaintCall[] = [];
  const document: DebugTileDocument = {
    elementFromPoint: () => first,
    querySelectorAll: () => [first, second],
  };
  const move = (x: number, y: number): void =>
    moveDebugPeek(x, y, {
      session,
      document,
      paint: (card, target) => paints.push({ card, tile: target }),
    });

  return { session, first, second, paints, move };
}

interface BindCall {
  readonly image: DebugPeekImage;
  readonly card: DebugPeekCard;
  readonly options: { readonly priority: number };
}

function previewHarness() {
  const calls: BindCall[] = [];
  const image: DebugPeekImage = { src: '', alt: '', onerror: null };
  const session: DebugPeekSession = { image, tile: null, serial: 0 };
  const resources: DebugPeekResourceBridge = {
    bindImage(target, card, options) {
      calls.push({ image: target, card, options });
      target.src = (card.image ?? '').replace('/high.webp', '/low.webp');
    },
  };
  const paint = (card: DebugPeekCard, target: DebugTile): void =>
    paintDebugPeek(card, target, {
      session,
      resources,
      timers: { clearTimeout() {} },
    });

  return { session, image, calls, paint };
}

describe('debug peek hit-test', () => {
  it('follows the tile under the finger even when iOS keeps the original tile captured', () => {
    const harness = hitHarness();

    harness.move(145, 160);

    expect(harness.paints[0]?.card.name).toBe('second');
    expect(harness.paints[0]?.tile).toBe(harness.second);
  });

  it('ignores points in tile gutters and keeps the current preview', () => {
    const harness = hitHarness();

    harness.move(95, 160);

    expect(harness.paints).toHaveLength(0);
    expect(harness.session.tile).toBe(harness.first);
  });
});

describe('debug peek preview', () => {
  it('delegates image loading to the resource coordinator', () => {
    const harness = previewHarness();
    const current = tile('current', 0);
    const card: DebugPeekCard = {
      name: 'Morpeko',
      image: 'https://assets.tcgdex.net/es/me/me05/117/high.webp',
      fallbackImage: 'https://assets.tcgdex.net/es/sv/sv04/206/high.webp',
    };

    harness.paint(card, current);

    expect(harness.session.tile).toBe(current);
    expect(harness.image.alt).toBe('Morpeko');
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.card).toBe(card);
    expect(harness.calls[0]?.options.priority).toBe(0);
    expect(harness.session.serial).toBe(1);
  });
});
