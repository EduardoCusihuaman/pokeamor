/**
 * Planificador de eventos (migrado de `tests/02-events.test.cjs`).
 *
 * Se conservan las cuatro aserciones del legacy: el bloqueo por gesto, el
 * cooldown/colección abierta, el pintado de la pareja en cola y la entrada a la
 * comparación reservada solo cuando la batalla automática está lista.
 */

import { describe, expect, it } from 'vitest';

import {
  createEventsController,
  type AutomaticBattleState,
  type EventsController,
  type EventsRuntimeState,
  type EventsSession,
  type EventPair,
} from '@/application/events';
import type { Vote } from '@/application/sync';

interface UiFlags {
  busy: boolean;
  hidden: boolean;
  activeCard: boolean;
  sheetOpen: boolean;
  dialogOpen: boolean;
  exitingCard: boolean;
}

interface SetupOptions {
  render?: () => void;
  paintRefinement?: () => void;
}

function createTimers() {
  let nextId = 0;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  return {
    pending,
    setTimeout(fn: () => void, ms: number) {
      const id = ++nextId;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimeout(handle: unknown) {
      if (typeof handle === 'number') pending.delete(handle);
    },
  };
}

function setup(options: SetupOptions = {}): {
  events: EventsController;
  session: EventsSession;
  ui: UiFlags;
  runtime: EventsRuntimeState;
  timers: ReturnType<typeof createTimers>;
  started: { count: number };
} {
  const votes: Record<string, Vote> = {};
  for (let index = 0; index < 6; index++) votes[String(index)] = { value: 'yes' };

  const session: EventsSession = { votes };
  const ui: UiFlags = {
    busy: false,
    hidden: false,
    activeCard: false,
    sheetOpen: false,
    dialogOpen: false,
    exitingCard: false,
  };
  const runtime: EventsRuntimeState = {
    inlinePair: null,
    queuedPair: null,
    automaticBattle: null,
    activeEncounter: null,
    eventPauseUntil: 0,
  };
  const timers = createTimers();
  const started = { count: 0 };

  const events = createEventsController({
    timers,
    getSession: () => session,
    eventSeen: () => 25,
    ui: {
      isBusy: () => ui.busy,
      isDocumentHidden: () => ui.hidden,
      hasActiveCard: () => ui.activeCard,
      isSheetOpen: () => ui.sheetOpen,
      hasOpenDialog: () => ui.dialogOpen,
      hasExitingCard: () => ui.exitingCard,
    },
    prepareBattleCandidate: () => {},
    startRefinement: () => {
      started.count += 1;
      return true;
    },
    render: options.render ?? (() => {}),
    paintRefinement: options.paintRefinement ?? (() => {}),
    state: runtime,
  });

  return { events, session, ui, runtime, timers, started };
}

describe('event scheduler', () => {
  it('event evaluation after releasing swipe lock starts a due comparison', () => {
    const { events, ui, started } = setup();

    ui.busy = true;
    events.runEvents();
    expect(started.count).toBe(0);

    ui.busy = false;
    events.runEvents();
    expect(started.count).toBe(1);
  });

  it('cooldown and open collection prevent interruption', () => {
    const { events, session, ui, started } = setup();

    session.refinementSchedule = { nextSeen: 40 };
    events.runEvents();
    expect(started.count).toBe(0);

    session.refinementSchedule = { nextSeen: 20 };
    ui.activeCard = true;
    events.runEvents();
    expect(started.count).toBe(0);
  });

  it('a prepared event paints the queued pair without starting a new refinement', () => {
    let rendered = 0;
    const { events, runtime, started } = setup({
      render: () => {
        rendered += 1;
      },
    });
    runtime.queuedPair = [{ id: 1 }, { id: 2 }];

    events.runEvents();
    expect(rendered).toBe(1);
    expect(started.count).toBe(0);
  });

  it('reserved comparison enters only when the automatic battle is ready', () => {
    let painted = 0;
    const { events, runtime } = setup({
      render: () => {
        painted += 1;
      },
    });
    const pair: EventPair = [{ id: 1 }, { id: 2 }];
    runtime.queuedPair = pair;
    runtime.automaticBattle = { status: 'loading', pair, resetAt: 0 };

    events.renderDiscovery();
    expect(runtime.inlinePair).toBeNull();
    expect(runtime.queuedPair).not.toBeNull();

    const ready: AutomaticBattleState = { status: 'ready', pair, resetAt: 0 };
    runtime.automaticBattle = ready;
    events.renderDiscovery();
    expect(runtime.inlinePair?.length).toBe(2);
    expect(runtime.queuedPair).toBeNull();
    expect(painted).toBe(2);
  });
});
