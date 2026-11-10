/**
 * Estado de descubrimiento (plan §5.2 y §9).
 *
 * Caso de uso de la Fase 4: cargar catálogo + sesión, mostrar una carta en un
 * orden estable y registrar votos accesibles (botones). El gesto de swipe y el
 * orden del recomendador llegan en fases posteriores.
 *
 * Contratos preservados:
 * - El catálogo se guarda con `$state.raw`: es grande e inmutable y no debe
 *   convertirse en un proxy reactivo profundo.
 * - Los votos usan el esquema de `SessionState` (`votes[id] = { value, time }`,
 *   `voteTimes`, `history`, `revision`) y se persisten con el controlador de
 *   sincronización existente (`@/application/sync`), sin duplicar su lógica.
 * - Deshacer restaura el voto anterior (o lo elimina) y devuelve la carta a la
 *   posición de descubrimiento, igual que el legacy (`state.history.pop()`).
 * - Sin token de sesión no hay red ni almacenamiento: el estado vive en memoria,
 *   de modo que el slice se puede probar y usar de forma aislada.
 */

import type { Card, CatalogBundle } from '@/domain/catalog';
import {
  favoriteCount,
  favorites as favoriteCards,
  batches,
  progress as journeyProgress,
  type JourneyProgress,
  type JourneyState,
} from '@/domain/collection/journey';
import { getCatalogBundle, getSession, SESSION_PATH } from '@/infrastructure/api';
import type { SessionReadResult } from '@/infrastructure/api';
import {
  cloneSession,
  createEmptySession,
  createSyncController,
  type Clock,
  type FetchLike,
  type HistoryEntry,
  type Rating,
  type SessionState,
  type StorageLike,
  type SyncController,
  type TimerApi,
  type Vote,
  type VoteValue,
} from '@/application/sync';

export type DiscoveryStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Dependencias inyectables. Todas tienen un valor por defecto razonable para
 * producción; las pruebas pasan un catálogo falso, `fetch`, storage y reloj.
 */
export interface DiscoveryOptions {
  /** Fuente del catálogo. Por defecto `/catalog-bundle.json`. */
  readonly loadCatalog?: () => Promise<CatalogBundle>;
  /** Fuente de la sesión remota. Por defecto `getSession`. */
  readonly readSession?: (token: string) => Promise<SessionReadResult>;
  /** `fetch` para el controlador de sincronización. */
  readonly fetch?: FetchLike;
  /** Storage para persistencia local. */
  readonly storage?: StorageLike;
  /** Timers del controlador de sincronización (pruebas deterministas). */
  readonly timers?: TimerApi;
  /** Reloj inyectable para votos y `voteTimes`. */
  readonly clock?: Clock;
  /**
   * Token de sesión explícito. `undefined` lee el enlace `#s=`; `null` desactiva
   * la carga remota y la sincronización.
   */
  readonly sessionToken?: string | null;
}

/** API estable que consumen los componentes. Los getters mantienen las runes. */
export interface DiscoveryApi {
  readonly status: DiscoveryStatus;
  readonly loading: boolean;
  readonly error: string | null;
  readonly sessionError: string | null;
  readonly catalog: readonly Card[];
  readonly session: SessionState;
  readonly votes: Readonly<Record<string, Vote>>;
  /** Revisión de la sesión; se incrementa con cada voto/deshacer. */
  readonly revision: number;
  /** Índice de la carta actual dentro del catálogo. */
  readonly position: number;
  readonly cardCount: number;
  readonly currentCard: Card | null;
  readonly favorites: readonly Card[];
  readonly yesCount: number;
  readonly noCount: number;
  readonly discoveredCount: number;
  readonly remaining: number;
  readonly progress: JourneyProgress;
  readonly canUndo: boolean;
  load(): Promise<void>;
  vote(value: VoteValue): void;
  undo(): void;
  dispose(): void;
}

const SESSION_HASH_KEY = 's';

function describeError(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return 'Error desconocido al cargar los datos.';
}

/**
 * Lee el token del enlace de sesión existente (`#s=...`). No administra ni
 * compite con ese formato de hash.
 */
function readSessionTokenFromLocation(): string | null {
  if (typeof globalThis.location === 'undefined') return null;

  const params = new URLSearchParams(globalThis.location.hash.slice(1));
  const token = params.get(SESSION_HASH_KEY)?.trim();
  return token ? token : null;
}

function browserFetch(): FetchLike | undefined {
  if (typeof globalThis.fetch !== 'function') return undefined;
  return (url, init) => {
    if (!init) return globalThis.fetch(url);
    const cache = init.cache === 'no-store' || init.cache === 'no-cache' ? init.cache : undefined;
    return globalThis.fetch(url, {
      method: init.method,
      headers: init.headers ? { ...init.headers } : undefined,
      body: init.body,
      cache,
    });
  };
}

function browserStorage(): StorageLike | undefined {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return undefined;
    return storage;
  } catch {
    // Safari puede negar el acceso a localStorage en contextos restringidos.
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readVote(value: unknown): Vote | null {
  if (!isRecord(value)) return null;
  if (value.value !== 'yes' && value.value !== 'no') return null;

  const vote: Vote = { value: value.value };
  if (typeof value.time === 'number' && Number.isFinite(value.time)) vote.time = value.time;
  if (typeof value.card === 'string') vote.card = value.card;
  return vote;
}

function readVotes(value: unknown): Record<string, Vote> {
  if (!isRecord(value)) return {};
  const votes: Record<string, Vote> = {};
  for (const [id, raw] of Object.entries(value)) {
    const vote = readVote(raw);
    if (vote) votes[id] = vote;
  }
  return votes;
}

function readNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const numbers: Record<string, number> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) numbers[id] = raw;
  }
  return numbers;
}

function readRatings(value: unknown): Record<string, Rating> {
  if (!isRecord(value)) return {};
  const ratings: Record<string, Rating> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    if (typeof raw.score !== 'number' || typeof raw.played !== 'number') continue;
    ratings[id] = { score: raw.score, played: raw.played };
  }
  return ratings;
}

function readHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];

  const history: HistoryEntry[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;

    const entry: HistoryEntry = {};
    if (typeof raw.id === 'number' && Number.isFinite(raw.id)) entry.id = raw.id;
    else if (typeof raw.id === 'string' && Number.isFinite(Number(raw.id)))
      entry.id = Number(raw.id);

    if (raw.previous === null) entry.previous = null;
    else {
      const previous = readVote(raw.previous);
      if (previous) entry.previous = previous;
    }

    if (raw.direction === 'yes' || raw.direction === 'no') entry.direction = raw.direction;
    if (raw.refinement === true) entry.refinement = true;
    if (typeof raw.encounterKey === 'string') entry.encounterKey = raw.encounterKey;
    history.push(entry);
  }
  return history;
}

/**
 * Normaliza una sesión remota sin descartar campos que este slice todavía no
 * usa (`comparisons`, `encounters`, etc.): el spread conserva lo desconocido
 * para que un PUT posterior no borre datos del legacy.
 */
function hydrateSession(snapshot: Readonly<Record<string, unknown>> | null): SessionState {
  const empty = createEmptySession();
  if (!snapshot) return empty;

  const raw = snapshot as Partial<SessionState>;
  return {
    ...empty,
    ...raw,
    votes: readVotes(raw.votes),
    voteTimes: readNumberRecord(raw.voteTimes),
    ratings: readRatings(raw.ratings),
    ratingTimes: readNumberRecord(raw.ratingTimes),
    duels: typeof raw.duels === 'number' && Number.isFinite(raw.duels) ? raw.duels : 0,
    history: readHistory(raw.history),
    revision: typeof raw.revision === 'number' && Number.isFinite(raw.revision) ? raw.revision : 0,
  };
}

function lastUndoableIndex(history: readonly HistoryEntry[]): number {
  for (let index = history.length - 1; index >= 0; index--) {
    if (!history[index]?.refinement) return index;
  }
  return -1;
}

/**
 * Crea una instancia aislada del estado de descubrimiento.
 *
 * Es una fábrica (no un singleton) para que las pruebas inyecten su propio
 * catálogo y su propio `fetch`, y para que la app use una única instancia.
 */
export function createDiscovery(options: DiscoveryOptions = {}): DiscoveryApi {
  const clock: Clock = options.clock ?? { now: () => Date.now() };
  const loadCatalog = options.loadCatalog ?? getCatalogBundle;
  const readSession = options.readSession ?? getSession;
  const fetchImpl = options.fetch ?? browserFetch();
  const storage = options.storage ?? browserStorage();

  let status = $state<DiscoveryStatus>('idle');
  let catalog = $state.raw<readonly Card[]>([]);
  let session = $state.raw<SessionState>(createEmptySession());
  let votes = $state<Record<string, Vote>>({});
  let history = $state<HistoryEntry[]>([]);
  let position = $state(0);
  let error = $state<string | null>(null);
  let sessionError = $state<string | null>(null);

  let sync: SyncController | null = null;
  let syncToken: string | null = null;
  let inFlight: Promise<void> | null = null;

  const cardCount = $derived(catalog.length);
  const currentCard = $derived(catalog[position] ?? null);
  const journeyState = $derived({ votes } satisfies JourneyState);
  const favorites = $derived(favoriteCards(catalog, journeyState));
  const yesCount = $derived(favoriteCount(journeyState));
  const noCount = $derived(Object.values(votes).filter((vote) => vote.value === 'no').length);
  const discoveredCount = $derived(Object.keys(votes).length);
  const remaining = $derived(Math.max(0, cardCount - discoveredCount));
  const grouped = $derived(batches(catalog, journeyState));
  const progress = $derived(journeyProgress(catalog, journeyState, grouped.groups));
  const canUndo = $derived(lastUndoableIndex(history) >= 0);

  function firstUnvotedIndex(nextVotes: Readonly<Record<string, Vote>>): number {
    for (let index = 0; index < catalog.length; index++) {
      const card = catalog[index];
      if (card && !nextVotes[String(card.id)]) return index;
    }
    return catalog.length;
  }

  function nextUnvotedIndex(from: number, nextVotes: Readonly<Record<string, Vote>>): number {
    for (let index = from; index < catalog.length; index++) {
      const card = catalog[index];
      if (card && !nextVotes[String(card.id)]) return index;
    }
    return catalog.length;
  }

  /** Crea el controlador de sync una sola vez por token. */
  function ensureSync(token: string, read: SessionReadResult | null): void {
    if (!sync || syncToken !== token) {
      if (!fetchImpl || !storage) return;

      const controller = createSyncController({
        token,
        fetch: fetchImpl,
        storage,
        timers: options.timers,
        clock,
        apiBase: SESSION_PATH,
      });

      if (read) {
        controller.etag = read.etag;
        // Si no existe sesión remota, se conserva el estado local del storage.
        if (read.found && read.body) controller.replaceState(hydrateSession(read.body), false);
      }
      // Aunque falle la lectura inicial, los votos deben intentar subirse
      // (el controlador resuelve el 412 leyendo el estado remoto).
      controller.cloudReady = true;

      sync = controller;
      syncToken = token;
    } else if (read) {
      // Reintento de carga: se vuelve a hidratar desde el servidor.
      sync.etag = read.etag;
      sync.cloudReady = true;
      if (read.found && read.body) sync.replaceState(hydrateSession(read.body), false);
    }

    if (sync) {
      votes = { ...sync.state.votes };
      history = [...sync.state.history];
      session = cloneSession(sync.state);
    }
  }

  /**
   * Aplica un cambio de votos/historial.
   *
   * Con sync, la mutación ocurre sobre `sync.state` y `save({ votes })` se
   * encarga de `voteTimes`, `revision`, persistencia local y PUT con ETag.
   * Sin sync (sin token), se hace el equivalente mínimo en memoria.
   */
  function applyChange(
    nextVotes: Record<string, Vote>,
    nextHistory: HistoryEntry[],
    changedIds: readonly string[],
  ): void {
    if (sync) {
      for (const id of changedIds) {
        const vote = nextVotes[id];
        if (vote) sync.state.votes[id] = vote;
        else delete sync.state.votes[id];
      }
      sync.state.history = nextHistory;
      sync.save({ votes: changedIds });

      votes = { ...sync.state.votes };
      history = [...sync.state.history];
      session = cloneSession(sync.state);
      return;
    }

    const base = session;
    const nextVoteTimes = { ...base.voteTimes };
    const now = clock.now();
    for (const id of changedIds) {
      nextVoteTimes[id] = Math.max(now, (nextVoteTimes[id] ?? 0) + 1);
    }

    votes = { ...nextVotes };
    history = [...nextHistory];
    session = {
      ...base,
      votes: { ...nextVotes },
      voteTimes: nextVoteTimes,
      history: [...nextHistory],
      revision: base.revision + 1,
    };
  }

  async function runLoad(): Promise<void> {
    status = 'loading';
    error = null;
    sessionError = null;

    try {
      const bundle = await loadCatalog();
      catalog = bundle.catalog;

      const token =
        options.sessionToken === undefined
          ? readSessionTokenFromLocation()
          : options.sessionToken?.trim() || null;

      if (token) {
        let read: SessionReadResult | null = null;
        try {
          read = await readSession(token);
        } catch (cause) {
          // La sesión no es crítica para mostrar el catálogo.
          sessionError = describeError(cause);
        }
        ensureSync(token, read);
      }

      position = firstUnvotedIndex(votes);
      status = 'ready';
    } catch (cause) {
      status = 'error';
      error = describeError(cause);
    }
  }

  function load(): Promise<void> {
    if (inFlight) return inFlight;

    inFlight = runLoad().finally(() => {
      inFlight = null;
    });

    return inFlight;
  }

  function vote(value: VoteValue): void {
    const card = currentCard;
    if (!card || status !== 'ready') return;

    const id = String(card.id);
    const time = clock.now();
    const nextVotes: Record<string, Vote> = { ...votes, [id]: { value, time } };
    const entry: HistoryEntry = {
      id: card.id,
      previous: votes[id] ?? null,
      direction: value,
    };

    applyChange(nextVotes, [...history, entry], [id]);
    position = nextUnvotedIndex(position + 1, nextVotes);
  }

  function undo(): void {
    if (status !== 'ready') return;

    const historyIndex = lastUndoableIndex(history);
    if (historyIndex < 0) return;

    const entry = history[historyIndex];
    if (!entry || entry.id === undefined) return;

    const id = String(entry.id);
    const cardIndex = catalog.findIndex((card) => String(card.id) === id);
    if (cardIndex >= 0) position = cardIndex;

    const nextVotes = { ...votes };
    if (entry.previous) nextVotes[id] = entry.previous;
    else delete nextVotes[id];

    const nextHistory = history.filter((_, index) => index !== historyIndex);
    applyChange(nextVotes, nextHistory, [id]);
  }

  function dispose(): void {
    sync?.dispose();
  }

  return {
    get status() {
      return status;
    },
    get loading() {
      return status === 'loading';
    },
    get error() {
      return error;
    },
    get sessionError() {
      return sessionError;
    },
    get catalog() {
      return catalog;
    },
    get session() {
      return session;
    },
    get votes() {
      return votes;
    },
    get revision() {
      return session.revision;
    },
    get position() {
      return position;
    },
    get cardCount() {
      return cardCount;
    },
    get currentCard() {
      return currentCard;
    },
    get favorites() {
      return favorites;
    },
    get yesCount() {
      return yesCount;
    },
    get noCount() {
      return noCount;
    },
    get discoveredCount() {
      return discoveredCount;
    },
    get remaining() {
      return remaining;
    },
    get progress() {
      return progress;
    },
    get canUndo() {
      return canUndo;
    },
    load,
    vote,
    undo,
    dispose,
  };
}

/** Instancia compartida que monta la app. */
export const appDiscovery: DiscoveryApi = createDiscovery();
