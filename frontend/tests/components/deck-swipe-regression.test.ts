import { expect, test } from 'vitest';
import '@/styles/global.css';
import { createDeckController } from '@/engines/deck/controller';
import type { Card } from '@/domain/catalog';

test('swiping keeps original artwork and promotes the same undercard without inherited tilt', () => {
  const stage = document.createElement('div');
  document.body.append(stage);
  const cards: Card[] = [1, 2, 3].map((id) => ({
    id,
    name: String(id),
    image: '',
    card: String(id),
    rarity: 'Rare',
    palette: { h: 325, s: 56, v: 79 },
    language: 'es',
    surface: null,
    traits: [],
  }));
  let time = 0;
  const deck = createDeckController(stage, {
    onDecision: () => {},
    matchMedia: () => ({ matches: false }),
    now: () => time,
  });
  try {
    deck.setCards(cards);
    const front = stage.querySelector<HTMLElement>('.card:not(.under)')!;
    const back = stage.querySelector<HTMLElement>('.under')!;
    const image = back.querySelector('img');
    front.getBoundingClientRect = () => new DOMRect(0, 0, 300, 400);
    const pointer = (type: string, x: number) =>
      front.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          isPrimary: true,
          button: 0,
          clientX: x,
          clientY: 100,
        }),
      );
    pointer('pointerdown', 100);
    time = 20;
    pointer('pointermove', 140);
    expect(front.classList.contains('active')).toBe(true);
    // The rendered legacy does not overlay synthetic glint/striped foil on art.
    expect.soft(front.querySelector('.foil, .glint')).toBeNull();
    expect(back.style.transform).not.toBe('');
    // A short flick promotes before the undercard has reached its neutral pose.
    pointer('pointerup', 140);
    const promoted = stage.querySelector<HTMLElement>('.card:not(.under):not(.exiting)')!;
    expect(promoted).toBe(back);
    expect(promoted.querySelector('img')).toBe(image);
    expect(promoted.style.transform).toBe('');
    expect(promoted.style.filter).toBe('');

    promoted.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 2,
        isPrimary: true,
        button: 0,
        clientX: 100,
        clientY: 100,
      }),
    );
    promoted.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 2,
        isPrimary: true,
        button: 0,
        clientX: 120,
        clientY: 100,
      }),
    );
    const heldPose = promoted.style.transform;
    deck.setCards(cards.slice(1));
    expect(promoted.style.transform).toBe(heldPose);
  } finally {
    deck.destroy();
    stage.remove();
  }
});
