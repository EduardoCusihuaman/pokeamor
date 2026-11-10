/**
 * Migración de `tests/27-battle-feedback.test.cjs` — feedback de la elección.
 *
 * Se conserva la aserción legacy: solo la mitad elegida recibe `battle-picked`
 * y el empate (`2`) marca ambas. Se añade la comprobación del overlay exacto
 * que el adaptador inserta en cada botón.
 */

import { describe, expect, it } from 'vitest';

import {
  BATTLE_FEEDBACK_HTML,
  createBattleFeedback,
  markBattleChoice,
  type BattleChoiceButton,
  type FeedbackNode,
} from '@/application/battle';

describe('battle feedback', () => {
  it('marks only the chosen half, or both for equality', () => {
    const selected = [false, false];
    const buttons: BattleChoiceButton[] = [0, 1].map((index) => ({
      classList: {
        toggle(_token: string, on?: boolean) {
          selected[index] = Boolean(on);
        },
      },
    }));

    markBattleChoice(buttons, 0);
    expect(selected).toEqual([true, false]);

    markBattleChoice(buttons, 1);
    expect(selected).toEqual([false, true]);

    markBattleChoice(buttons, 2);
    expect(selected).toEqual([true, true]);
  });

  it('creates the heart overlay hidden from assistive tech', () => {
    const attributes: Record<string, string> = {};
    const feedback: FeedbackNode = createBattleFeedback(() => ({
      className: '',
      innerHTML: '',
      setAttribute(name, value) {
        attributes[name] = value;
      },
    }));

    expect(feedback.className).toBe('battle-feedback');
    expect(attributes).toEqual({ 'aria-hidden': 'true' });
    expect(feedback.innerHTML).toBe(BATTLE_FEEDBACK_HTML);
    expect(feedback.innerHTML).toContain('class="battle-heart"');
  });
});
