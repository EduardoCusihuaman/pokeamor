/**
 * Sincronización de sesión (`src/app.js`: `save`/`sync`/`restore`/`mergeRemote`).
 *
 * Módulo de aplicación independiente del framework: no importa Svelte ni toca
 * el DOM. Toda la E/S se inyecta (`fetch`, storage, timers, reloj, toasts) para
 * poder probar la máquina de estados sin navegador.
 *
 * Contratos preservados del legacy (plan §18):
 * - Claves de persistencia `pokeamor-<token>` y `pokeamor-<token>-pending`, con
 *   el mismo `SessionState` serializado (no se renombra ningún campo).
 * - Un único PUT en vuelo: una segunda llamada a `sync()` devuelve una promesa
 *   resuelta sin abrir otra petición.
 * - `If-Match` con el ETag vigente; `If-None-Match: *` cuando todavía no hay ETag.
 * - `412` reconcilia local+remoto por `voteTimes`/`ratingTimes` (incluye
 *   tombstones de deshacer y comparaciones borradas) y reintenta, sin popup.
 * - Fallos de red/5xx conservan los cambios localmente y programan reintentos
 *   silenciosos con backoff exponencial (1200 ms → 30000 ms).
 * - Las elecciones pendientes se drenan en un bucle de hasta 4 intentos.
 */

/** Valor de un voto de descubrimiento. */
export type VoteValue = 'yes' | 'no';

/** Voto persistido. `time` es el desempate histórico; `voteTimes` manda. */
export interface Vote {
  value: VoteValue;
  card?: string;
  time?: number;
}

/** Rating de un duelo de refinamiento. */
export interface Rating {
  score: number;
  played: number;
}

/** Un resultado de comparación (duelo). */
export interface ComparisonRecord {
  id: string;
  ids?: number[];
  winner?: 0 | 1 | 2;
  time?: number;
}

/** Un encuentro alternativo registrado durante el descubrimiento. */
export interface EncounterRecord {
  id: number;
  card: string;
  value: VoteValue;
  time: number;
  checkpoint: number;
}

/** Programación del próximo evento de refinamiento. */
export interface RefinementSchedule {
  lastSeen?: number;
  nextSeen?: number;
  started?: boolean;
  time?: number;
}

/** Entrada del historial (votos, encuentros y deshacer de duelos). */
export interface HistoryEntry {
  id?: number;
  previous?: Vote | null;
  direction?: VoteValue;
  encounterKey?: string;
  refinement?: boolean;
  eventId?: string;
  ratings?: Record<string, Rating>;
  previousSchedule?: RefinementSchedule | null;
  ids?: number[];
}

/** Métricas de la experiencia de descubrimiento. */
export interface ExperienceState {
  milestones?: Record<string, boolean>;
  metrics?: {
    newDecisions?: number;
    startedAt?: number;
    lastAt?: number;
  };
}

/**
 * Esquema canónico de la sesión persistida.
 *
 * Las claves de `votes`, `voteTimes`, `ratings` y `ratingTimes` son ids de
 * especie serializados como strings por JSON, igual que en el legacy.
 */
export interface SessionState {
  votes: Record<string, Vote>;
  voteTimes: Record<string, number>;
  ratings: Record<string, Rating>;
  ratingTimes: Record<string, number>;
  duels: number;
  history: HistoryEntry[];
  revision: number;
  resetAt?: number;
  comparisons?: ComparisonRecord[];
  comparisonDeleted?: Record<string, number>;
  encounters?: Record<string, EncounterRecord>;
  refinementSchedule?: RefinementSchedule | null;
  experience?: ExperienceState;
}

/** Sesión remota: el servidor puede devolver un subconjunto de campos. */
export type RemoteSession = Partial<SessionState>;

/** Adaptador mínimo de almacenamiento (localStorage/IndexedDB). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Handle opaco para que el módulo no dependa de tipos de Node ni del DOM. */
export type TimerHandle = unknown;

/** Temporizadores inyectables. */
export interface TimerApi {
  setTimeout(handler: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

/** Reloj inyectable (epoch en milisegundos). */
export interface Clock {
  now(): number;
}

/** Opciones de una petición de sesión. */
export interface SyncRequestInit {
  method?: string;
  headers?: Readonly<Record<string, string>>;
  body?: string;
  cache?: string;
}

/** Respuesta mínima usada por la máquina de sincronización. */
export interface ResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

/** `fetch` inyectable. */
export type FetchLike = (url: string, init?: SyncRequestInit) => Promise<ResponseLike>;

/** Cambio explícito de votos que ya ocurrió en `state.votes`. */
export interface SaveChange {
  votes?: readonly (string | number)[];
}

/** Estado observable del sincronizador. */
export interface SyncController {
  /** Sesión viva. Se puede mutar como en el legacy (`state.votes[id] = ...`). */
  readonly state: SessionState;
  readonly token: string;
  readonly storageKey: string;
  readonly pendingKey: string;
  dirty: boolean;
  cloudReady: boolean;
  etag: string | null;
  isDirty(): boolean;
  /** Reemplaza la sesión (p. ej. al hidratar desde IndexedDB). */
  replaceState(next: SessionState, nextDirty?: boolean): void;
  /** Marca cambios y persiste; programa el push con debounce de 700 ms. */
  save(change?: SaveChange): void;
  /** Sube el snapshot actual si `cloudReady` y hay cambios. */
  sync(): Promise<void>;
  /** Lee la sesión remota y drena pendientes; reintenta con backoff. */
  restore(): Promise<void>;
  /** Handlers para eventos del host (online/visibilitychange). */
  handleOnline(): void;
  handleHidden(): void;
  /** Libera timers pendientes. */
  dispose(): void;
}

/** Dependencias inyectables del sincronizador. */
export interface SyncOptions {
  readonly token: string;
  readonly fetch: FetchLike;
  readonly storage: StorageLike;
  readonly timers?: TimerApi;
  readonly clock?: Clock;
  /** Mensajes de error accionables (no se usa en reintentos silenciosos). */
  readonly toast?: (message: string) => void;
  /** Etiqueta de estado de guardado (`#save.textContent` en el legacy). */
  readonly setStatus?: (message: string) => void;
  /** Hook para el motor de recomendaciones. */
  readonly scheduleEngine?: () => void;
  /** Se invoca cuando la reconciliación cambió los votos. */
  readonly onVotesMerged?: () => void;
  readonly storagePrefix?: string;
  readonly apiBase?: string;
  readonly retryDelayMs?: number;
  readonly retryMaxMs?: number;
  readonly initialRetryDelayMs?: number;
  readonly saveDebounceMs?: number;
  readonly persistDelayMs?: number;
}

const DEFAULT_RETRY_DELAY = 1200;
const DEFAULT_RETRY_MAX = 30000;
const DEFAULT_SAVE_DEBOUNCE = 700;
const DEFAULT_PERSIST_DELAY = 100;

const fallbackTimers: TimerApi = {
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

const fallbackClock: Clock = { now: () => Date.now() };

const noop = (): void => {};

/** Clona estructuras JSON del esquema de sesión. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emptyState(): SessionState {
  return {
    votes: {},
    voteTimes: {},
    ratings: {},
    ratingTimes: {},
    duels: 0,
    history: [],
    revision: 0,
  };
}

function loadState(storage: StorageLike, storageKey: string): SessionState {
  let loaded: SessionState | null = null;
  try {
    const raw = storage.getItem(storageKey);
    if (raw) loaded = JSON.parse(raw) as SessionState;
  } catch {
    loaded = null;
  }

  const state = loaded ?? emptyState();
  state.voteTimes = state.voteTimes ?? {};
  state.ratingTimes = state.ratingTimes ?? {};
  return state;
}

/**
 * Crea el controlador de sincronización de una sesión.
 *
 * El legacy usaba variables globales (`state`, `dirty`, `etag`, `cloudReady`).
 * Aquí viven en el closure y se exponen como propiedades mutables para que la
 * capa de presentación las consuma sin compartir estado global de módulo.
 */
export function createSyncController(options: SyncOptions): SyncController {
  const timers = options.timers ?? fallbackTimers;
  const clock = options.clock ?? fallbackClock;
  const toast = options.toast ?? noop;
  const setStatus = options.setStatus ?? noop;
  const scheduleEngine = options.scheduleEngine ?? noop;
  const onVotesMerged = options.onVotesMerged ?? noop;

  const token = options.token;
  const storagePrefix = options.storagePrefix ?? 'pokeamor-';
  const apiBase = options.apiBase ?? '/api/session/';
  const storageKey = storagePrefix + token;
  const pendingKey = storageKey + '-pending';
  const apiUrl = apiBase + token;

  const initialRetryDelay = options.initialRetryDelayMs ?? DEFAULT_RETRY_DELAY;
  const retryMax = options.retryMaxMs ?? DEFAULT_RETRY_MAX;
  const saveDebounce = options.saveDebounceMs ?? DEFAULT_SAVE_DEBOUNCE;
  const persistDelay = options.persistDelayMs ?? DEFAULT_PERSIST_DELAY;

  let state = loadState(options.storage, storageKey);
  let dirty = options.storage.getItem(pendingKey) === '1';
  let etag: string | null = null;
  let cloudReady = false;

  let syncing = false;
  let restoring: Promise<void> | null = null;
  let retryDelay = initialRetryDelay;
  let syncTimer: TimerHandle;
  let diskTimer: TimerHandle;

  let observedVotes: Record<string, Vote | undefined> = clone(state.votes);
  let observedRatings: Record<string, Rating | undefined> = clone(state.ratings);

  function persistNow(): boolean {
    try {
      options.storage.setItem(storageKey, JSON.stringify(state));
      options.storage.setItem(pendingKey, dirty ? '1' : '0');
      return true;
    } catch {
      setStatus('No se pudo guardar');
      return false;
    }
  }

  /** Persistencia diferida (equivalente al debounce de 100 ms del legacy). */
  function persist(): boolean {
    timers.clearTimeout(diskTimer);
    diskTimer = timers.setTimeout(() => {
      persistNow();
    }, persistDelay);
    return true;
  }

  function trackChanges(): void {
    for (const id of new Set([...Object.keys(observedVotes), ...Object.keys(state.votes)])) {
      if (JSON.stringify(observedVotes[id]) !== JSON.stringify(state.votes[id])) {
        state.voteTimes[id] = Math.max(clock.now(), (state.voteTimes[id] ?? 0) + 1);
      }
    }
    for (const id of new Set([...Object.keys(observedRatings), ...Object.keys(state.ratings)])) {
      if (JSON.stringify(observedRatings[id]) !== JSON.stringify(state.ratings[id])) {
        state.ratingTimes[id] = Math.max(clock.now(), (state.ratingTimes[id] ?? 0) + 1);
      }
    }
    observedVotes = clone(state.votes);
    observedRatings = clone(state.ratings);
  }

  function save(change?: SaveChange): void {
    scheduleEngine();
    if (change?.votes) {
      for (const rawId of change.votes) {
        const id = String(rawId);
        state.voteTimes[id] = Math.max(clock.now(), (state.voteTimes[id] ?? 0) + 1);
        const vote = state.votes[id];
        if (vote) observedVotes[id] = clone(vote);
        else delete observedVotes[id];
      }
    } else {
      trackChanges();
    }

    state.revision += 1;
    dirty = true;
    if (persist()) setStatus('Guardando…');
    else toast('Exportá tu colección para conservarla.');

    timers.clearTimeout(syncTimer);
    syncTimer = timers.setTimeout(() => {
      void sync();
    }, saveDebounce);
  }

  function mergeRemote(remote: RemoteSession): void {
    // Un reset local más reciente pisa al remoto: se subirá en el próximo push.
    if (state.resetAt && state.resetAt > (remote.resetAt ?? 0)) {
      dirty = true;
      return;
    }

    const local = state;
    const votes: Record<string, Vote> = {};
    const voteTimes: Record<string, number> = {};
    const ratings: Record<string, Rating> = {};
    const ratingTimes: Record<string, number> = {};

    const voteIds = new Set([
      ...Object.keys(local.votes),
      ...Object.keys(remote.votes ?? {}),
      ...Object.keys(local.voteTimes),
      ...Object.keys(remote.voteTimes ?? {}),
    ]);
    for (const id of voteIds) {
      const localTime = local.voteTimes[id] ?? local.votes[id]?.time ?? 0;
      const remoteTime = remote.voteTimes?.[id] ?? remote.votes?.[id]?.time ?? 0;
      const takeRemote = remoteTime > localTime || (!local.votes[id] && !localTime);
      const value = takeRemote ? remote.votes?.[id] : local.votes[id];
      if (value) votes[id] = value;
      voteTimes[id] = Math.max(localTime, remoteTime);
    }

    const ratingIds = new Set([
      ...Object.keys(local.ratings),
      ...Object.keys(remote.ratings ?? {}),
    ]);
    for (const id of ratingIds) {
      const localTime = local.ratingTimes[id] ?? 0;
      const remoteTime = remote.ratingTimes?.[id] ?? 0;
      const takeRemote =
        remoteTime > localTime ||
        (!localTime &&
          !remoteTime &&
          (remote.ratings?.[id]?.played ?? 0) > (local.ratings[id]?.played ?? 0));
      const value = takeRemote ? remote.ratings?.[id] : local.ratings[id];
      if (value) ratings[id] = value;
      ratingTimes[id] = Math.max(localTime, remoteTime);
    }

    const changed = JSON.stringify(local.votes) !== JSON.stringify(votes);
    const comparisons = [
      ...new Map(
        [...(remote.comparisons ?? []), ...(local.comparisons ?? [])].map((entry) => [
          entry.id,
          entry,
        ]),
      ).values(),
    ].filter(
      (entry) =>
        !(remote.comparisonDeleted ?? {})[entry.id] && !(local.comparisonDeleted ?? {})[entry.id],
    );
    const refinementSchedule =
      (remote.refinementSchedule?.time ?? 0) > (local.refinementSchedule?.time ?? 0)
        ? remote.refinementSchedule
        : local.refinementSchedule;

    state = {
      ...local,
      comparisons,
      comparisonDeleted: {
        ...(remote.comparisonDeleted ?? {}),
        ...(local.comparisonDeleted ?? {}),
      },
      refinementSchedule,
      encounters: { ...(remote.encounters ?? {}), ...(local.encounters ?? {}) },
      votes,
      voteTimes,
      ratings,
      ratingTimes,
      duels: Math.max(local.duels, remote.duels ?? 0),
      revision: Math.max(local.revision, remote.revision ?? 0) + 1,
    };
    observedVotes = clone(votes);
    observedRatings = clone(ratings);
    dirty = true;
    persist();
    scheduleEngine();
    if (changed) onVotesMerged();
  }

  async function readRemote(): Promise<void> {
    const response = await options.fetch(apiUrl, { cache: 'no-store' });
    if (!response.ok && response.status !== 404) throw new Error('read failed');
    etag = response.ok ? response.headers.get('ETag') : null;
    if (response.ok) {
      const remote = (await response.json()) as RemoteSession;
      mergeRemote(remote);
    }
  }

  async function sync(): Promise<void> {
    if (!cloudReady || syncing || !dirty) return;
    syncing = true;
    timers.clearTimeout(syncTimer);
    let failed = false;

    try {
      for (let attempts = 0; dirty && attempts < 4; attempts++) {
        const snapshot = JSON.stringify(state);
        const response = await options.fetch(apiUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }),
          },
          body: snapshot,
        });

        if (response.status === 412) {
          await readRemote();
          continue;
        }
        if (!response.ok) throw new Error('write failed');

        etag = response.headers.get('ETag');
        if (snapshot === JSON.stringify(state)) dirty = false;
        persist();
        setStatus(dirty ? 'Guardado en este iPhone' : 'Colección sincronizada');
        retryDelay = initialRetryDelay;
      }
    } catch {
      failed = true;
      setStatus('Guardado local · sin conexión');
    } finally {
      syncing = false;
      if (dirty) {
        timers.clearTimeout(syncTimer);
        syncTimer = timers.setTimeout(
          () => {
            void sync();
          },
          failed ? retryDelay : DEFAULT_SAVE_DEBOUNCE,
        );
        if (failed) retryDelay = Math.min(retryDelay * 2, retryMax);
      }
    }
  }

  function restore(): Promise<void> {
    if (restoring) return restoring;

    const task = (async (): Promise<void> => {
      try {
        await readRemote();
        cloudReady = true;
        retryDelay = initialRetryDelay;
        if (dirty) await sync();
        else setStatus('Colección sincronizada');
      } catch {
        setStatus('Guardado en este iPhone');
        timers.clearTimeout(syncTimer);
        syncTimer = timers.setTimeout(() => {
          void restore();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, retryMax);
      } finally {
        restoring = null;
      }
    })();

    restoring = task;
    return task;
  }

  function replaceState(next: SessionState, nextDirty?: boolean): void {
    state = next;
    state.voteTimes = state.voteTimes ?? {};
    state.ratingTimes = state.ratingTimes ?? {};
    observedVotes = clone(state.votes);
    observedRatings = clone(state.ratings);
    if (nextDirty !== undefined) dirty = nextDirty;
  }

  function handleOnline(): void {
    if (cloudReady) void sync();
    else void restore();
  }

  function handleHidden(): void {
    if (dirty) void sync();
  }

  function dispose(): void {
    timers.clearTimeout(syncTimer);
    timers.clearTimeout(diskTimer);
    restoring = null;
  }

  return {
    get state() {
      return state;
    },
    get token() {
      return token;
    },
    get storageKey() {
      return storageKey;
    },
    get pendingKey() {
      return pendingKey;
    },
    get dirty() {
      return dirty;
    },
    set dirty(value: boolean) {
      dirty = value;
    },
    get cloudReady() {
      return cloudReady;
    },
    set cloudReady(value: boolean) {
      cloudReady = value;
    },
    get etag() {
      return etag;
    },
    set etag(value: string | null) {
      etag = value;
    },
    isDirty: () => dirty,
    replaceState,
    save,
    sync,
    restore,
    handleOnline,
    handleHidden,
    dispose,
  };
}

export { clone as cloneSession, emptyState as createEmptySession, loadState as loadSession };
