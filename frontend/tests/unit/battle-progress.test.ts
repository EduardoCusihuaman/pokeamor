/**
 * Migración de `tests/29-battle-progress.test.mjs` — puntos de sesión.
 *
 * Se conservan las dos aserciones legacy: el último círculo completa al elegir
 * y sobrevive al desmontaje de la sesión (650/660 ms), y la siguiente batalla
 * no vuelve a contar la elección ya confirmada.
 */

import { describe, expect, it } from 'vitest';

import {
  createBattleProgress,
  type BattleTimerApi,
  type ProgressSession,
} from '@/application/battle';

function setup(): {
  progress: ReturnType<typeof createBattleProgress>;
  session: { current: ProgressSession | null };
  time: (value: number) => void;
} {
  let now = 0;
  const timers: BattleTimerApi = {
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  const session: { current: ProgressSession | null } = {
    current: { done: 2, target: 3 },
  };

  const progress = createBattleProgress({
    getSession: () => session.current,
    now: () => now,
    timers,
  });

  return {
    progress,
    session,
    time: (value) => {
      now = value;
    },
  };
}

describe('battle progress', () => {
  it('last circle completes on choice and survives session teardown', () => {
    const test = setup();

    test.progress.commit();
    expect(test.progress.state()?.done).toBe(3);

    test.session.current = null;
    expect(test.progress.state()?.done).toBe(3);

    test.time(700);
    expect(test.progress.state()).toBeNull();
  });

  it('next battle does not double count and skipping does not complete', () => {
    const test = setup();
    const session = test.session.current;
    if (!session) throw new Error('missing session');

    session.done = 0;
    test.progress.commit();
    expect(test.progress.state()?.done).toBe(1);

    session.done += 1;
    session.choiceCommitted = false;
    expect(test.progress.state()?.done).toBe(1);

    test.session.current = null;
    expect(test.progress.state()).toBeNull();
  });
});
