import { expect, test } from 'vitest';
import { createDeckController } from '@/engines/deck/controller';
import type { Card } from '@/domain/catalog';

test('deck drag publishes and clears document feedback without replacing artwork or undercard', () => {
  const stage = document.createElement('div');
  document.body.append(stage);
  const card = (id: number) =>
    ({
      id,
      name: String(id),
      image: '',
      card: String(id),
      rarity: '',
      palette: { h: 0, s: 0, v: 0 },
      language: 'es',
      surface: null,
      traits: [],
    }) as Card;
  const deck = createDeckController(stage, {
    onDecision: () => {},
    matchMedia: () => ({ matches: true }),
  });
  try {
    deck.setCards([card(1), card(2)]);
    const front = stage.querySelector<HTMLElement>('.card:not(.under)')!;
    const back = stage.querySelector('.under');
    const image = front.querySelector('img');
    front.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 300,
      height: 400,
      right: 300,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const event = (type: string, x: number) =>
      front.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: 100,
        }),
      );
    event('pointerdown', 100);
    event('pointermove', 150);
    expect(Number(document.documentElement.style.getPropertyValue('--yes-intent'))).toBeCloseTo(
      (50 / 63) * 0.8,
    );
    expect(front.style.getPropertyValue('--x')).not.toBe('');
    expect(stage.querySelector('.under')).toBe(back);
    expect(front.querySelector('img')).toBe(image);
    deck.cancel();
    expect(Number(document.documentElement.style.getPropertyValue('--yes-intent'))).toBe(0);
    event('pointerdown', 100);
    event('pointermove', 50);
    expect(Number(document.documentElement.style.getPropertyValue('--no-intent'))).toBeCloseTo(
      (50 / 63) * 0.75,
    );
    deck.destroy();
    expect(Number(document.documentElement.style.getPropertyValue('--no-intent'))).toBe(0);
  } finally {
    deck.destroy();
    stage.remove();
    document.documentElement.style.removeProperty('--yes-intent');
    document.documentElement.style.removeProperty('--no-intent');
  }
});

test('release, direction reversal and disable clear feedback; confirmed release votes once', () => {
  const stage = document.createElement('div');
  document.body.append(stage);
  const decisions: string[] = [];
  const card = {
    id: 1,
    name: 'Test',
    image: '',
    card: '1',
    rarity: '',
    palette: { h: 0, s: 0, v: 0 },
    language: 'es',
    surface: null,
    traits: [],
  } as Card;
  let time = 0;
  const deck = createDeckController(stage, {
    onDecision: (decision) => decisions.push(decision),
    matchMedia: () => ({ matches: true }),
    now: () => time,
  });
  const root = document.documentElement.style;
  try {
    deck.setCards([card]);
    const front = stage.querySelector<HTMLElement>('.card')!;
    front.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 300,
      height: 400,
      right: 300,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const event = (type: string, x: number) =>
      front.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: 100,
        }),
      );
    event('pointerdown', 100);
    event('pointermove', 150);
    event('pointermove', 50);
    expect(Number(root.getPropertyValue('--yes-intent'))).toBe(0);
    expect(Number(root.getPropertyValue('--no-intent'))).toBeCloseTo((50 / 63) * 0.75);
    time = 1000;
    event('pointerup', 50);
    expect(decisions).toEqual([]);
    expect(Number(root.getPropertyValue('--no-intent'))).toBe(0);
    event('pointerdown', 100);
    event('pointermove', 150);
    deck.setEnabled(false);
    expect(Number(root.getPropertyValue('--yes-intent'))).toBe(0);
    deck.setEnabled(true);
    event('pointerdown', 100);
    event('pointermove', 180);
    event('pointerup', 180);
    expect(decisions).toEqual(['yes']);
    expect(Number(root.getPropertyValue('--yes-intent'))).toBe(0);
  } finally {
    deck.destroy();
    stage.remove();
    root.removeProperty('--yes-intent');
    root.removeProperty('--no-intent');
  }
});

test('cleanup of an older controller does not erase another controller gesture', () => {
  const stages = [document.createElement('div'), document.createElement('div')];
  document.body.append(...stages);
  const card = {
    id: 1,
    name: 'Test',
    image: '',
    card: '1',
    rarity: '',
    palette: { h: 0, s: 0, v: 0 },
    language: 'es',
    surface: null,
    traits: [],
  } as Card;
  const decks = stages.map((stage) =>
    createDeckController(stage, { onDecision: () => {}, matchMedia: () => ({ matches: true }) }),
  );
  const root = document.documentElement.style;
  try {
    for (const [index, deck] of decks.entries()) {
      deck.setCards([card]);
      const front = stages[index]!.querySelector<HTMLElement>('.card')!;
      front.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 300,
        height: 400,
        right: 300,
        bottom: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      for (const [type, x] of [
        ['pointerdown', 100],
        ['pointermove', index ? 50 : 150],
      ] as const)
        front.dispatchEvent(
          new PointerEvent(type, {
            pointerId: index + 1,
            isPrimary: true,
            button: 0,
            clientX: x,
            clientY: 100,
          }),
        );
    }
    expect(Number(root.getPropertyValue('--no-intent'))).toBeCloseTo((50 / 63) * 0.75);
    decks[0]!.destroy();
    expect(Number(root.getPropertyValue('--no-intent'))).toBeCloseTo((50 / 63) * 0.75);
    decks[1]!.cancel();
    expect(Number(root.getPropertyValue('--no-intent'))).toBe(0);
  } finally {
    for (const deck of decks) deck.destroy();
    for (const stage of stages) stage.remove();
    root.removeProperty('--yes-intent');
    root.removeProperty('--no-intent');
  }
});
