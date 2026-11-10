/**
 * Planificador de eventos de refinamiento (`src/app.js`: `runEvents`,
 * `scheduleEvents` y el wrapper `renderDiscovery`).
 *
 * Módulo de aplicación independiente del framework: no importa Svelte ni toca
 * el DOM. Las condiciones de UI (tarjeta activa, sheet abierto, diálogo,
 * documento oculto) y los efectos (render, pintar el duelo, preparar la
 * siguiente batalla) se inyectan.
 *
 * Contratos preservados del legacy:
 * - `runEvents` no evalúa nada mientras hay un gesto/una tarjeta activa, un
 *   duelo inline, un sheet/diálogo abierto o la pestaña está oculta.
 * - Un evento requiere ≥20 vistos, ≥6 favoritos, haber superado
 *   `eventPauseUntil`, alcanzar `refinementSchedule.nextSeen` (20 por defecto)
 *   y no tener un encuentro activo.
 * - Si hay una pareja en cola y una tarjeta saliendo, se reintenta a los 50 ms;
 *   si no, se pinta con `render()`.
 * - `renderDiscovery` promueve la pareja en cola solo cuando la batalla
 *   automática está `ready` y la UI está libre; después pinta el refinamiento.
 */

import type { RefinementSchedule, SessionState, TimerApi, TimerHandle, Vote } from './sync';

/** Carta mínima que el planificador necesita de una pareja. */
export interface EventPairCard {
  readonly id: number;
  readonly card?: string;
  readonly name?: string;
}

/** Pareja de cartas de un duelo. */
export type EventPair = readonly EventPairCard[];

/** Batalla automática preparada en segundo plano. */
export interface AutomaticBattleState {
  status: 'loading' | 'ready';
  pair: EventPair;
  resetAt: number;
}

/**
 * Estado de eventos que el legacy guardaba en variables de módulo.
 *
 * Se expone mutable para que la capa de presentación asigne `inlinePair`,
 * `queuedPair` o `automaticBattle` igual que lo hacía `app.js`.
 */
export interface EventsRuntimeState {
  inlinePair: EventPair | null;
  queuedPair: EventPair | null;
  automaticBattle: AutomaticBattleState | null;
  /** Encuentro alternativo visible; `null`/`undefined` cuando no hay ninguno. */
  activeEncounter: unknown;
  /** Bloqueo temporal tras un hito de favoritos (`recordVote` lo actualiza). */
  eventPauseUntil: number;
}

/** Snapshot de sesión que consume el planificador. */
export interface EventsSession {
  votes: Readonly<Record<string, Vote | undefined>>;
  refinementSchedule?: RefinementSchedule | null;
  resetAt?: number;
}

/** Condiciones de UI evaluadas por el planificador. */
export interface EventsUi {
  isBusy(): boolean;
  isDocumentHidden(): boolean;
  hasActiveCard(): boolean;
  isSheetOpen(): boolean;
  hasOpenDialog(): boolean;
  hasExitingCard(): boolean;
}

/** Dependencias inyectables del planificador. */
export interface EventsOptions {
  readonly timers: TimerApi;
  readonly getSession: () => EventsSession;
  readonly ui: EventsUi;
  /** Vistos de descubrimiento; por defecto, `Object.keys(votes).length`. */
  readonly eventSeen?: () => number;
  /** Hook que prepara una batalla alternativa mientras se juega. */
  readonly prepareBattleCandidate?: () => void;
  /** Arranca (o intenta arrancar) un refinamiento; `manual` es false aquí. */
  readonly startRefinement: (manual: boolean) => boolean;
  /** Libera las imágenes asociadas a la batalla automática. */
  readonly releaseBattleArt?: (battle: AutomaticBattleState) => void;
  readonly render: () => void;
  readonly paintRefinement: () => void;
  /** Estado runtime compartido; si se omite, se crea vacío. */
  readonly state?: EventsRuntimeState;
  readonly scheduleDelayMs?: number;
  readonly retryDelayMs?: number;
}

/** Controlador del planificador. */
export interface EventsController {
  readonly state: EventsRuntimeState;
  runEvents(): void;
  scheduleEvents(): void;
  /** Wrapper de `render`: drena `queuedPair` y repinta el refinamiento. */
  renderDiscovery(): void;
  clearAutomaticBattle(): void;
  dispose(): void;
}

const DEFAULT_SCHEDULE_DELAY = 210;
const DEFAULT_RETRY_DELAY = 50;
const MIN_SEEN = 20;
const MIN_LIKES = 6;
const DEFAULT_NEXT_SEEN = 20;

function countLikes(votes: Readonly<Record<string, Vote | undefined>>): number {
  let likes = 0;
  for (const vote of Object.values(votes)) {
    if (vote?.value === 'yes') likes++;
  }
  return likes;
}

/**
 * Crea el planificador de eventos de una sesión.
 *
 * No programa nada hasta que el host llame a `scheduleEvents()` (equivalente al
 * `scheduleEvents` legacy) o invoque `runEvents()` directamente.
 */
export function createEventsController(options: EventsOptions): EventsController {
  const { timers, ui, getSession, startRefinement, render, paintRefinement } = options;
  const prepareBattleCandidate = options.prepareBattleCandidate ?? (() => {});
  const releaseBattleArt = options.releaseBattleArt ?? (() => {});
  const scheduleDelay = options.scheduleDelayMs ?? DEFAULT_SCHEDULE_DELAY;
  const retryDelay = options.retryDelayMs ?? DEFAULT_RETRY_DELAY;

  const state: EventsRuntimeState = options.state ?? {
    inlinePair: null,
    queuedPair: null,
    automaticBattle: null,
    activeEncounter: null,
    eventPauseUntil: 0,
  };

  let eventTimer: TimerHandle;

  function eventSeen(): number {
    if (options.eventSeen) return options.eventSeen();
    return Object.keys(getSession().votes).length;
  }

  function clearAutomaticBattle(): void {
    if (!state.automaticBattle) return;
    releaseBattleArt(state.automaticBattle);
    state.automaticBattle = null;
    state.queuedPair = null;
  }

  function runEvents(): void {
    if (
      ui.isBusy() ||
      state.inlinePair ||
      ui.isDocumentHidden() ||
      ui.hasActiveCard() ||
      ui.isSheetOpen() ||
      ui.hasOpenDialog()
    ) {
      return;
    }

    prepareBattleCandidate();

    const session = getSession();
    const seen = eventSeen();
    const likes = countLikes(session.votes);
    const nextSeen = session.refinementSchedule?.nextSeen ?? DEFAULT_NEXT_SEEN;

    if (
      seen < MIN_SEEN ||
      likes < MIN_LIKES ||
      seen < state.eventPauseUntil ||
      seen < nextSeen ||
      state.activeEncounter
    ) {
      return;
    }

    const battle = state.automaticBattle;
    if (
      battle &&
      (battle.resetAt !== (session.resetAt ?? 0) ||
        !battle.pair.every((card) => session.votes[card.id]?.value === 'yes'))
    ) {
      clearAutomaticBattle();
    }

    if (state.queuedPair) {
      if (ui.hasExitingCard()) {
        eventTimer = timers.setTimeout(runEvents, retryDelay);
        return;
      }
      render();
      return;
    }

    if (!state.automaticBattle) startRefinement(false);
  }

  function scheduleEvents(): void {
    timers.clearTimeout(eventTimer);
    eventTimer = timers.setTimeout(runEvents, scheduleDelay);
  }

  function renderDiscovery(): void {
    const session = getSession();
    if (
      state.queuedPair &&
      state.automaticBattle?.status === 'ready' &&
      !state.inlinePair &&
      !ui.isBusy() &&
      !state.activeEncounter &&
      !ui.hasExitingCard() &&
      !ui.hasActiveCard() &&
      !ui.isDocumentHidden() &&
      !ui.isSheetOpen() &&
      !ui.hasOpenDialog() &&
      eventSeen() >= (session.refinementSchedule?.nextSeen ?? DEFAULT_NEXT_SEEN)
    ) {
      state.inlinePair = state.queuedPair;
      state.queuedPair = null;
    }

    render();
    paintRefinement();
  }

  function dispose(): void {
    timers.clearTimeout(eventTimer);
  }

  return {
    state,
    runEvents,
    scheduleEvents,
    renderDiscovery,
    clearAutomaticBattle,
    dispose,
  };
}

/** Reexporta los tipos de sesión para consumidores del planificador. */
export type { RefinementSchedule, SessionState, TimerApi, Vote };
