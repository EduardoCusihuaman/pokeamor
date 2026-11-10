/**
 * Coordinador compartido de descargas de recursos (motor independiente de Svelte).
 *
 * Migrado de `src/resource-coordinator.js`. Conserva la semántica documentada
 * en el plan §7:
 *
 * - La identidad de cada recurso es estable (`key` de `@/domain/cards/identity`).
 * - Una misma transferencia se comparte entre consumidores (deduplicación y
 *   una única promesa por URL).
 * - Cada presentación (`bindImage`) mantiene su propio estado de decodificación;
 *   liberar una presentación no cancela las demás.
 * - Una respuesta asíncrona tardía no puede sobrescribir una presentación más
 *   reciente: los manejadores comprueban `active`, `settled` y que
 *   `image.src` siga siendo la fuente que ellos instalaron.
 * - Los recursos solo se liberan cuando dejan de estar en uso (`owners`,
 *   `trim` y `wanted`).
 * - Un error terminal ofrece recuperación con un reintento nativo de la URL
 *   exacta antes de declarar `error`; la presentación nunca se marca `ready`.
 *
 * Todo el I/O del navegador (`fetch`, `AbortController`, `Image`, timers,
 * `IntersectionObserver`, `MutationObserver`, CacheStorage) se inyecta a
 * través de `ResourceCoordinatorOptions`, con valores por defecto tomados de
 * los globals del navegador en tiempo de llamada. El módulo no importa Svelte
 * ni componentes.
 */

import { cardIdentity, type IdentitySource } from '@/domain/cards/identity';

/** Estados de una transferencia en la cola compartida. */
export type TransferState = 'queued' | 'loading' | 'ready';

/** Estados de preparación de una presentación de imagen. */
export type ImageReadiness = 'queued' | 'decoding' | 'presentable' | 'error' | 'released';

/** Prioridad de descarga; `0` es urgente y `50` es lo más especulativo. */
export type ResourcePriority = number;

/** Tipo de recurso usado por las métricas. */
export type ResourceKind = 'front' | 'thumbnail' | 'material';

/** Resultado de una presentación preparada. */
export type PresentationResult =
  { readonly status: 'ready' } | { readonly status: 'cancelled' } | { readonly status: 'error' };

/** Estado observable de una presentación. */
export type PresentationStatus = ImageReadiness | 'ready';

/** Token opaco de temporizador; admite tanto `number` como `Timeout` de Node. */
export type TimerHandle = ReturnType<typeof setTimeout>;

/** Respuesta mínima que necesita el coordinador de una petición. */
export interface ResourceFetcherResponse {
  readonly ok: boolean;
  readonly type?: string;
  blob(): Promise<Blob>;
}

/** Init mínimo enviado a `fetch`. */
export interface ResourceFetchInit {
  readonly signal: AbortSignal;
  readonly cache: 'force-cache';
  readonly priority: 'high' | 'low';
}

/** Fetcher inyectable. */
export type ResourceFetcher = (
  url: string,
  init: ResourceFetchInit,
) => Promise<ResourceFetcherResponse>;

/** Subconjunto de CacheStorage que usa el coordinador. */
export interface ResourceCache {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  keys(): Promise<readonly Request[]>;
  delete(url: string): Promise<boolean>;
}

/** Abre (o deshabilita con `null`) la caché persistente. */
export type ResourceCacheFactory = () => Promise<ResourceCache> | null;

/** Escucha `visibilitychange` y devuelve la función de limpieza. */
export type VisibilityBinding = (listener: () => void) => (() => void) | null;

/**
 * Observa cambios en el DOM para liberar presentaciones desconectadas.
 * Devuelve la función de limpieza.
 */
export type ConnectionWatcherFactory = (onChange: () => void) => (() => void) | null;

/** Entrada mínima de `IntersectionObserver`. */
export interface IntersectionEntryLike {
  readonly isIntersecting: boolean;
  readonly target: PresentableImage;
}

/** Observador de intersección inyectable. */
export interface IntersectionObserverLike {
  observe(target: PresentableImage): void;
  disconnect(): void;
}

/** Fábrica de `IntersectionObserver`; `null` deshabilita la observación. */
export type IntersectionObserverFactory = (
  callback: (entries: readonly IntersectionEntryLike[]) => void,
  options: { readonly rootMargin: string },
) => IntersectionObserverLike | null;

/** Medición de una descarga preparada. */
export interface ArtTiming {
  started?: number;
  loaded?: number;
  decodeMs?: number;
}

/** Métodos de eventos que necesita una imagen presentable. */
export interface ImageEventTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/**
 * Imagen presentable. `HTMLImageElement` es asignable a esta interfaz, pero
 * las pruebas pueden inyectar una implementación sin DOM.
 */
export interface PresentableImage extends ImageEventTarget {
  alt: string;
  decoding: string;
  draggable: boolean;
  src: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly isConnected?: boolean;
  decode?: () => Promise<void>;
  removeAttribute(name: string): void;

  cardIdentity?: string;
  cardReady?: boolean;
  resourceState?: ImageReadiness;
  materialSource?: boolean;
  artTiming?: ArtTiming;
  artReady?: Promise<boolean>;
  resourceEager?: boolean;
  resourceWasConnected?: boolean;
  startResource?: () => void;
  stopResource?: () => void;
}

/** Opciones de `bindImage` / `observeImage`. */
export interface BindImageOptions {
  readonly variant?: 'front' | 'thumbnail';
  readonly priority?: ResourcePriority;
}

/** Opciones de `preparePresentation`. */
export interface PreparePresentationOptions {
  readonly owner?: string;
  readonly priority?: ResourcePriority;
  readonly image?: PresentableImage;
}

/** Opciones de `plan`. */
export interface PlanOptions {
  readonly adaptive?: boolean;
}

/** Presentación preparada y transferible. */
export interface Presentation {
  readonly key: string;
  readonly image: PresentableImage;
  owner: string;
  readonly status: PresentationStatus;
  readonly result: Promise<PresentationResult>;
  /** Transfiere la responsabilidad de liberación al nuevo dueño. */
  transferTo(owner: string, priority?: ResourcePriority): void;
  /** Libera la presentación; idempotente vía `bindings`. */
  release(): void;
}

/** Estadísticas por tipo de recurso. */
export interface ResourceKindStats {
  count: number;
  bytes: number;
  obtainMs: number;
}

/** Una medición de descarga. */
export interface ResourceTiming {
  readonly path: string;
  readonly queueMs: number;
  readonly obtainMs: number;
  readonly bytes: number;
}

/** Diagnóstico de presentaciones. */
export interface ResourceDiagnostics {
  readonly leases: number;
  readonly decodedImages: number;
  readonly decodedPixelBytes: number;
}

/** Instantánea que consumen las pantallas de diagnóstico. */
export interface ResourceSnapshot extends ResourceDiagnostics {
  readonly requests: number;
  readonly hits: number;
  readonly failures: number;
  /** Bytes actualmente retenidos en la caché en memoria. */
  readonly bytes: number;
  readonly downloadMs: number;
  readonly completed: number;
  readonly byKind: Readonly<Partial<Record<ResourceKind, ResourceKindStats>>>;
  readonly timings: readonly ResourceTiming[];
  readonly running: number;
  readonly entries: number;
  readonly windowSize: number;
  readonly states: Readonly<Partial<Record<TransferState, number>>>;
}

/** Dependencias inyectables; todas tienen un valor por defecto de navegador. */
export interface ResourceCoordinatorOptions {
  readonly now?: () => number;
  readonly fetch?: ResourceFetcher;
  readonly createAbortController?: () => AbortController;
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly setTimer?: (callback: () => void, timeoutMs: number) => TimerHandle;
  readonly clearTimer?: (handle: TimerHandle) => void;
  readonly isDocumentHidden?: () => boolean;
  readonly isSaveData?: () => boolean;
  /** `undefined`: CacheStorage del navegador; `null`: deshabilitada. */
  readonly openCache?: ResourceCacheFactory | null;
  readonly createResponse?: (blob: Blob) => Response;
  readonly createImage?: () => PresentableImage;
  readonly createIntersectionObserver?: IntersectionObserverFactory | null;
  readonly listenVisibility?: VisibilityBinding | null;
  readonly watchConnections?: ConnectionWatcherFactory | null;
}

/** API pública de una instancia del coordinador. */
export interface ResourceCoordinatorApi {
  readonly key: (card: IdentitySource | null | undefined) => string;
  readonly path: (card: IdentitySource | null | undefined) => string | null;
  readonly invalidate: (url: string) => Promise<void>;
  readonly bindImage: (
    image: PresentableImage,
    card: IdentitySource,
    options?: BindImageOptions,
  ) => PresentableImage;
  readonly preparePresentation: (
    card: IdentitySource,
    options?: PreparePresentationOptions,
  ) => Presentation;
  readonly readyImage: (card: IdentitySource) => PresentableImage | null;
  readonly observeImage: (
    image: PresentableImage,
    card: IdentitySource,
    options?: BindImageOptions,
  ) => PresentableImage;
  readonly releaseImage: (image: PresentableImage) => void;
  readonly resetPlans: () => void;
  readonly getBlob: (url: string, priority?: ResourcePriority) => Promise<Blob>;
  readonly peek: (url: string) => string | null;
  readonly front: (card: IdentitySource, priority?: ResourcePriority) => Promise<string>;
  readonly plan: (
    owner: string,
    cards: readonly IdentitySource[],
    options?: PlanOptions,
  ) => readonly IdentitySource[];
  readonly release: (owner: string) => void;
  readonly snapshot: () => ResourceSnapshot;
  /** Libera presentaciones, planes y URLs de objeto y desconecta observadores. */
  readonly destroy: () => void;
}

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ENTRIES = 64;
const MAX_CONCURRENCY = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;
const NATIVE_TIMEOUT_MS = 12_000;
const DEFAULT_PRIORITY = 50;
const CACHE_NAME = 'pokeamor-resources-v1';
const CACHE_ENTRIES = 32;
const TIMINGS_LIMIT = 40;
const DEFAULT_PIXEL_VIEWPORT = 4 * 1024 * 1024;
const DEFAULT_FRONT_BYTES = 93_257;
const DEFAULT_PLAN_SIZE = 12;
const ADAPTIVE_TARGET_MS = 3_000;

interface TransferEntry {
  readonly path: string;
  queuedAt: number;
  queueMs: number;
  priority: ResourcePriority;
  state: TransferState;
  used: number;
  blob: Blob | null;
  objectUrl: string | null;
  persist: Promise<void> | null;
  readonly promise: Promise<Blob>;
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
}

interface Lease {
  readonly id: string;
  readonly image: PresentableImage;
  readonly url: string;
  readonly key: string;
}

interface Binding {
  readonly id: string;
  readonly release: () => void;
}

function defaultNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

const defaultFetch: ResourceFetcher = (url, init) => fetch(url, init);

function defaultCreateAbortController(): AbortController {
  return new AbortController();
}

function defaultCreateObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob);
}

function defaultRevokeObjectURL(url: string): void {
  URL.revokeObjectURL(url);
}

function defaultSetTimer(callback: () => void, timeoutMs: number): TimerHandle {
  return setTimeout(callback, timeoutMs);
}

function defaultClearTimer(handle: TimerHandle): void {
  clearTimeout(handle);
}

function defaultIsDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

function defaultIsSaveData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (
    navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }
  ).connection;
  return connection?.saveData === true;
}

function defaultOpenCache(): Promise<ResourceCache> | null {
  const storage = (
    globalThis as typeof globalThis & {
      readonly caches?: { open(name: string): Promise<ResourceCache> };
    }
  ).caches;
  return storage ? storage.open(CACHE_NAME) : null;
}

function defaultCreateResponse(blob: Blob): Response {
  return new Response(blob);
}

function defaultCreateImage(): PresentableImage {
  if (typeof document === 'undefined') throw new Error('createImage unavailable');
  return document.createElement('img');
}

const defaultCreateIntersectionObserver: IntersectionObserverFactory = (callback, options) => {
  if (typeof IntersectionObserver === 'undefined') return null;
  const observer = new IntersectionObserver(
    (entries) => {
      callback(
        entries.map((entry) => ({
          isIntersecting: entry.isIntersecting,
          target: entry.target as unknown as PresentableImage,
        })),
      );
    },
    { rootMargin: options.rootMargin },
  );
  return {
    observe: (target) => observer.observe(target as unknown as Element),
    disconnect: () => observer.disconnect(),
  };
};

const defaultListenVisibility: VisibilityBinding = (listener) => {
  if (typeof document === 'undefined') return null;
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};

const defaultWatchConnections: ConnectionWatcherFactory = (onChange) => {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return null;
  const observer = new MutationObserver(onChange);
  observer.observe(document, { childList: true, subtree: true });
  return () => observer.disconnect();
};

function resourceKind(url: string): ResourceKind {
  if (url.includes('/materials/') && !url.endsWith('/front.png')) return 'material';
  if (url.includes('/low.webp')) return 'thumbnail';
  return 'front';
}

/**
 * Crea una instancia aislada del coordinador. Dos instancias no comparten cola
 * ni caché; el singleton exportado es el que comparten los motores de la app.
 */
export function createResourceCoordinator(
  options: ResourceCoordinatorOptions = {},
): ResourceCoordinatorApi {
  const now = options.now ?? defaultNow;
  const fetchFn = options.fetch ?? defaultFetch;
  const createAbortController = options.createAbortController ?? defaultCreateAbortController;
  const createObjectURL = options.createObjectURL ?? defaultCreateObjectURL;
  const revokeObjectURL = options.revokeObjectURL ?? defaultRevokeObjectURL;
  const setTimer = options.setTimer ?? defaultSetTimer;
  const clearTimer = options.clearTimer ?? defaultClearTimer;
  const isDocumentHidden = options.isDocumentHidden ?? defaultIsDocumentHidden;
  const isSaveData = options.isSaveData ?? defaultIsSaveData;
  const openCache = options.openCache === undefined ? defaultOpenCache : options.openCache;
  const createResponse = options.createResponse ?? defaultCreateResponse;
  const createImage = options.createImage ?? defaultCreateImage;
  const createIntersectionObserver =
    options.createIntersectionObserver === undefined
      ? defaultCreateIntersectionObserver
      : options.createIntersectionObserver;
  const listenVisibility =
    options.listenVisibility === undefined ? defaultListenVisibility : options.listenVisibility;
  const watchConnections =
    options.watchConnections === undefined ? defaultWatchConnections : options.watchConnections;

  const entries = new Map<string, TransferEntry>();
  const owners = new Map<string, Set<string>>();
  const ownerPriorities = new Map<Set<string>, ResourcePriority>();
  const bindings = new WeakMap<PresentableImage, Binding>();
  const leases = new Map<string, Lease>();
  const metrics = {
    requests: 0,
    hits: 0,
    failures: 0,
    downloadedBytes: 0,
    downloadMs: 0,
    completed: 0,
  };
  const timings: ResourceTiming[] = [];
  const byKind: Partial<Record<ResourceKind, ResourceKindStats>> = {};

  let running = 0;
  let bytes = 0;
  let clock = 0;
  let windowSize = 12;
  let lastAdvance = 0;
  let lastId: IdentitySource['id'];
  let interval = 700;
  let leaseId = 0;
  let imageObserver: IntersectionObserverLike | null | undefined;
  let destroyed = false;

  const stopVisibility = listenVisibility
    ? listenVisibility(() => {
        if (!destroyed) pump();
      })
    : null;
  const stopWatchingConnections = watchConnections
    ? watchConnections(() => {
        for (const lease of leases.values()) {
          if (lease.image.isConnected) lease.image.resourceWasConnected = true;
          else if (lease.image.resourceWasConnected) releaseImage(lease.image);
        }
      })
    : null;

  /** Ruta de imagen resuelta por identidad; conserva el fallback legacy. */
  function pathOf(card: IdentitySource | null | undefined): string | null {
    if (!card) return null;
    const resolved = cardIdentity.resolve(card);
    return resolved?.image || card.surface?.assets?.front || card.image || null;
  }

  /** Identidad estable; el fallback replica el formato legacy `card|lang|path`. */
  function keyOf(card: IdentitySource | null | undefined): string {
    const identity = cardIdentity.key(card);
    if (identity) return identity;
    const language = card?.language || (/\/es\//.test(card?.image ?? '') ? 'es' : 'source');
    return [card?.card, language, pathOf(card)].join('|');
  }

  function wanted(url: string): boolean {
    for (const owned of owners.values()) if (owned.has(url)) return true;
    return false;
  }

  function trim(): void {
    const ordered = [...entries.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [url, entry] of ordered) {
      if (bytes <= MAX_BYTES && entries.size <= MAX_ENTRIES) break;
      if (entry.state !== 'ready' || !entry.blob || wanted(url)) continue;
      bytes -= entry.blob.size;
      if (entry.objectUrl) revokeObjectURL(entry.objectUrl);
      entries.delete(url);
    }
  }

  async function read(
    url: string,
    signal: AbortSignal,
    priority: ResourcePriority,
  ): Promise<ResourceFetcherResponse> {
    let cache: ResourceCache | null = null;
    try {
      if (url.startsWith('/') && openCache) {
        const opened = openCache();
        cache = opened ? await opened : null;
      }
      const cached = await cache?.match(url);
      if (cached) return cached;
    } catch {
      // La caché es opcional: un fallo no impide la descarga.
    }

    const response = await fetchFn(url, {
      signal,
      cache: 'force-cache',
      priority: priority === 0 ? 'high' : 'low',
    });
    if (!response.ok || response.type === 'opaque') throw new Error('resource unavailable');
    return response;
  }

  function persist(url: string, blob: Blob): void {
    if (!url.startsWith('/') || !openCache) return;
    try {
      const opened = openCache();
      if (!opened) return;
      const persistPromise = opened
        .then(async (cache) => {
          await cache.put(url, createResponse(blob));
          const keys = await cache.keys();
          for (const key of keys.slice(0, Math.max(0, keys.length - CACHE_ENTRIES))) {
            await cache.delete(key.url);
          }
        })
        .catch(() => {});
      const entry = entries.get(url);
      if (entry) entry.persist = persistPromise;
    } catch {
      // Persistir es best-effort.
    }
  }

  function pump(): void {
    if (destroyed) return;
    while (running < MAX_CONCURRENCY) {
      const entry = [...entries.values()]
        .filter(
          (candidate) =>
            candidate.state === 'queued' &&
            (!isDocumentHidden() || candidate.priority === 0) &&
            (candidate.priority < 3 || running < 3),
        )
        .sort((a, b) => a.priority - b.priority || a.used - b.used)[0];
      if (!entry) break;

      entry.state = 'loading';
      entry.queueMs = now() - entry.queuedAt;
      running++;
      const controller = createAbortController();
      const timer = setTimer(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const start = now();

      const attempt = async (): Promise<Blob> => {
        let error: unknown;
        for (let index = 0; index < 2; index++) {
          try {
            const response = await read(entry.path, controller.signal, entry.priority);
            const blob = await response.blob();
            if (!blob.type.startsWith('image/') || !blob.size || blob.size > MAX_IMAGE_BYTES) {
              throw new Error('invalid image');
            }
            return blob;
          } catch (cause) {
            error = cause;
            if (controller.signal.aborted) break;
          }
        }
        throw error;
      };

      void attempt()
        .then((blob) => {
          entry.blob = blob;
          entry.state = 'ready';
          persist(entry.path, blob);

          const kind = resourceKind(entry.path);
          const stats = byKind[kind] ?? (byKind[kind] = { count: 0, bytes: 0, obtainMs: 0 });
          const obtainMs = now() - start;
          stats.count++;
          stats.bytes += blob.size;
          stats.obtainMs += obtainMs;
          bytes += blob.size;
          metrics.completed++;
          metrics.downloadedBytes += blob.size;
          metrics.downloadMs += obtainMs;
          timings.push({ path: entry.path, queueMs: entry.queueMs, obtainMs, bytes: blob.size });
          if (timings.length > TIMINGS_LIMIT) timings.shift();
          entry.resolve(blob);
        })
        .catch((error: unknown) => {
          entries.delete(entry.path);
          metrics.failures++;
          entry.reject(error);
        })
        .finally(() => {
          clearTimer(timer);
          running--;
          trim();
          pump();
        });
    }
  }

  function getBlob(url: string, priority: ResourcePriority = 0): Promise<Blob> {
    if (
      typeof url !== 'string' ||
      (!url.startsWith('/materials/') && !url.startsWith('https://'))
    ) {
      return Promise.reject(new Error('invalid resource'));
    }

    const existing = entries.get(url);
    if (existing) {
      metrics.hits++;
      existing.used = ++clock;
      existing.priority = Math.min(existing.priority, priority);
      pump();
      return existing.promise;
    }

    metrics.requests++;
    let resolve!: (blob: Blob) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Blob>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const entry: TransferEntry = {
      path: url,
      queuedAt: now(),
      queueMs: 0,
      priority,
      state: 'queued',
      used: ++clock,
      blob: null,
      objectUrl: null,
      persist: null,
      promise,
      resolve,
      reject,
    };
    entries.set(url, entry);
    pump();
    return promise;
  }

  function peek(url: string): string | null {
    const entry = entries.get(url);
    if (entry?.state !== 'ready' || !entry.blob) return null;
    entry.used = ++clock;
    entry.objectUrl ??= createObjectURL(entry.blob);
    return entry.objectUrl;
  }

  async function front(card: IdentitySource, priority: ResourcePriority = 0): Promise<string> {
    const url = pathOf(card);
    if (!url) throw new Error('invalid resource');
    await getBlob(url, priority);
    const result = peek(url);
    if (!result) throw new Error('resource evicted');
    return result;
  }

  function plan(
    owner: string,
    cards: readonly IdentitySource[],
    options: PlanOptions = {},
  ): readonly IdentitySource[] {
    if (options.adaptive && cards[0]?.id !== lastId) {
      const hadPrevious = lastAdvance !== 0;
      const current = now();
      if (lastAdvance) interval = 0.7 * interval + 0.3 * Math.max(100, current - lastAdvance);
      lastAdvance = current;
      lastId = cards[0]?.id;
      const target = Math.max(6, Math.min(24, Math.ceil(ADAPTIVE_TARGET_MS / interval)));
      if (hadPrevious) windowSize = target > windowSize ? target : Math.max(target, windowSize - 1);
    }

    const average =
      (byKind.front?.bytes ?? 0) / Math.max(1, byKind.front?.count ?? 0) || DEFAULT_FRONT_BYTES;
    const limit = Math.min(
      Math.max(3, Math.floor(DEFAULT_PIXEL_VIEWPORT / average)),
      isSaveData() ? 3 : options.adaptive ? windowSize : Math.min(cards.length, DEFAULT_PLAN_SIZE),
    );
    const selected = cards.slice(0, limit);
    const base = owner === 'battle-preview' ? 20 : 0;
    const paths = new Set(selected.map(pathOf).filter((url): url is string => url !== null));

    const previous = owners.get(owner);
    if (previous) ownerPriorities.delete(previous);
    owners.set(owner, paths);
    if (base) ownerPriorities.set(paths, base);

    for (const entry of entries.values()) {
      if (entry.state !== 'queued') continue;
      entry.priority = DEFAULT_PRIORITY;
      for (const owned of owners.values()) {
        const index = [...owned].indexOf(entry.path);
        if (index >= 0) {
          entry.priority = Math.min(
            entry.priority,
            ownerPriorities.get(owned) ?? (index < 3 ? index : 10 + index),
          );
        }
      }
    }

    for (const [index, card] of selected.entries()) {
      const url = pathOf(card);
      if (url) void getBlob(url, base + (index < 3 ? index : 10 + index)).catch(() => {});
    }

    for (const [url, entry] of entries) {
      if (entry.state === 'queued' && !wanted(url) && entry.priority > 2) {
        entries.delete(url);
        entry.reject(new Error('outside lookahead'));
      }
    }

    trim();
    return selected;
  }

  function release(owner: string): void {
    const previous = owners.get(owner);
    if (previous) ownerPriorities.delete(previous);
    owners.delete(owner);
    for (const [url, entry] of entries) {
      if (entry.state === 'queued' && !wanted(url) && entry.priority > 2) {
        entries.delete(url);
        entry.reject(new Error('released lookahead'));
      }
    }
    trim();
  }

  async function invalidate(url: string): Promise<void> {
    const entry = entries.get(url);
    if (entry?.state === 'ready' && entry.blob) {
      bytes -= entry.blob.size;
      if (entry.objectUrl) revokeObjectURL(entry.objectUrl);
      entries.delete(url);
    }
    try {
      await entry?.persist;
      if (url.startsWith('/') && openCache) {
        const opened = openCache();
        if (opened) await (await opened).delete(url);
      }
    } catch {
      // Invalidar es best-effort.
    }
  }

  function bindImage(
    image: PresentableImage,
    card: IdentitySource,
    options: BindImageOptions = {},
  ): PresentableImage {
    bindings.get(image)?.release();

    const { variant = 'front', priority = 0 } = options;
    const reference = cardIdentity.resolve(card);
    const url = variant === 'thumbnail' ? reference?.thumbnail || pathOf(card) : pathOf(card);
    const id = `image-${++leaseId}`;
    let active = true;
    let settled = false;
    let presentationSource: string | null = null;
    let nativeAttempt = false;
    let nativeTimer: TimerHandle | null = null;
    let resolveArt!: (ready: boolean) => void;

    image.cardIdentity = keyOf(card);
    image.cardReady = false;
    image.resourceState = 'queued';
    image.materialSource = variant === 'front' && card.surface?.effect === 'asset-foil';
    image.artTiming = { started: now() };
    image.artReady = new Promise<boolean>((resolve) => {
      resolveArt = resolve;
    });

    if (!url) {
      image.resourceState = 'error';
      settleArt(false);
      return image;
    }

    function settleArt(ready: boolean): void {
      if (settled) return;
      settled = true;
      resolveArt(ready);
    }

    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      if (nativeTimer !== null) {
        clearTimer(nativeTimer);
        nativeTimer = null;
      }
      image.cardReady = ok;
      image.resourceState = ok ? 'presentable' : 'error';
      if (!ok) {
        const owned = owners.get(id);
        if (owned) ownerPriorities.delete(owned);
        owners.delete(id);
        leases.delete(id);
      }
      resolveArt(ok);
    };

    const tryNative = (): boolean => {
      if (!active || nativeAttempt) return false;
      nativeAttempt = true;
      nativeTimer = setTimer(() => {
        if (active) finish(false);
      }, NATIVE_TIMEOUT_MS);
      image.resourceState = 'decoding';
      image.src = url;
      presentationSource = image.src;
      return true;
    };

    const failed = (): void => {
      if (!active || settled || !presentationSource || image.src !== presentationSource) return;
      void invalidate(url);
      if (tryNative()) return;
      finish(false);
    };

    const loaded = (): void => {
      if (!active || settled || !presentationSource || image.src !== presentationSource) return;
      image.resourceState = 'decoding';
      const loadedAt = now();
      if (image.artTiming) image.artTiming.loaded = loadedAt;
      void (async () => {
        try {
          await image.decode?.();
          if (!active) return;
          if (image.artTiming) image.artTiming.decodeMs = now() - loadedAt;
          if (!image.naturalWidth) throw new Error('empty image');
          finish(true);
        } catch {
          failed();
        }
      })();
    };

    const releaseBinding = (): void => {
      active = false;
      if (nativeTimer !== null) {
        clearTimer(nativeTimer);
        nativeTimer = null;
      }
      image.resourceState = 'released';
      const owned = owners.get(id);
      if (owned) ownerPriorities.delete(owned);
      owners.delete(id);
      leases.delete(id);
      bindings.delete(image);
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
      settleArt(false);
      trim();
    };

    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    const interest = new Set<string>([url]);
    owners.set(id, interest);
    ownerPriorities.set(interest, priority);
    leases.set(id, { id, image, url, key: image.cardIdentity });
    bindings.set(image, { id, release: releaseBinding });

    void getBlob(url, priority)
      .then(() => {
        if (!active) return;
        const source = peek(url);
        if (!source) throw new Error('resource evicted');
        image.resourceState = 'decoding';
        presentationSource = source;
        image.src = source;
      })
      .catch(() => {
        if (active && !tryNative()) finish(false);
      });

    return image;
  }

  function preparePresentation(
    card: IdentitySource,
    options: PreparePresentationOptions = {},
  ): Presentation {
    const { owner = 'buffer', priority = 1, image: preparedImage } = options;
    const image = preparedImage ?? createImage();
    image.alt = card.name ?? '';
    image.decoding = 'async';
    image.draggable = false;
    if (!preparedImage) bindImage(image, card, { priority });

    const presentation: Presentation = {
      key: keyOf(card),
      image,
      owner,
      get status(): PresentationStatus {
        if (image.cardReady && image.resourceState !== 'released') return 'ready';
        return image.resourceState ?? 'queued';
      },
      result: (image.artReady ?? Promise.resolve(false)).then((ok): PresentationResult => {
        if (ok) return { status: 'ready' };
        return { status: image.resourceState === 'released' ? 'cancelled' : 'error' };
      }),
      transferTo(next, nextPriority = priority) {
        presentation.owner = next;
        const binding = bindings.get(image);
        if (!binding) {
          pump();
          return;
        }
        const owned = owners.get(binding.id);
        if (owned) ownerPriorities.set(owned, nextPriority);
        const url = pathOf(card);
        if (url) {
          const entry = entries.get(url);
          if (entry) entry.priority = Math.min(entry.priority, nextPriority);
        }
        pump();
      },
      release() {
        releaseImage(image);
      },
    };

    return presentation;
  }

  function observeImage(
    image: PresentableImage,
    card: IdentitySource,
    options: BindImageOptions = {},
  ): PresentableImage {
    let started = false;
    image.startResource = () => {
      if (started) return;
      started = true;
      bindImage(image, card, options);
    };
    image.stopResource = () => {
      if (!started || image.resourceEager) return;
      started = false;
      releaseImage(image);
      image.removeAttribute('src');
    };

    const observer = getIntersectionObserver();
    if (!observer) image.startResource();
    else observer.observe(image);
    return image;
  }

  function getIntersectionObserver(): IntersectionObserverLike | null {
    if (imageObserver !== undefined) return imageObserver;
    imageObserver = createIntersectionObserver
      ? createIntersectionObserver(
          (observed) => {
            for (const entry of observed) {
              if (entry.isIntersecting) entry.target.startResource?.();
              else entry.target.stopResource?.();
            }
          },
          { rootMargin: '400px' },
        )
      : null;
    return imageObserver;
  }

  function readyImage(card: IdentitySource): PresentableImage | null {
    const identity = keyOf(card);
    for (const lease of leases.values()) {
      if (
        lease.key === identity &&
        lease.image.cardReady &&
        lease.image.resourceState === 'presentable'
      ) {
        return lease.image;
      }
    }
    return null;
  }

  function releaseImage(image: PresentableImage): void {
    bindings.get(image)?.release();
  }

  function resetPlans(): void {
    for (const name of [...owners.keys()]) if (!name.startsWith('image-')) release(name);
  }

  function diagnostics(): ResourceDiagnostics {
    let decodedImages = 0;
    let decodedPixelBytes = 0;
    for (const lease of leases.values()) {
      if (!lease.image.cardReady) continue;
      decodedImages++;
      decodedPixelBytes += lease.image.naturalWidth * lease.image.naturalHeight * 4;
    }
    return { leases: leases.size, decodedImages, decodedPixelBytes };
  }

  function snapshot(): ResourceSnapshot {
    const states: Partial<Record<TransferState, number>> = {};
    for (const entry of entries.values()) {
      states[entry.state] = (states[entry.state] ?? 0) + 1;
    }
    return {
      requests: metrics.requests,
      hits: metrics.hits,
      failures: metrics.failures,
      bytes,
      downloadMs: metrics.downloadMs,
      completed: metrics.completed,
      byKind,
      ...diagnostics(),
      timings: timings.slice(),
      running,
      entries: entries.size,
      windowSize,
      states,
    };
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    for (const lease of [...leases.values()]) releaseImage(lease.image);
    for (const name of [...owners.keys()]) release(name);
    for (const [url, entry] of entries) {
      if (entry.objectUrl) revokeObjectURL(entry.objectUrl);
      entries.delete(url);
    }
    bytes = 0;
    stopVisibility?.();
    stopWatchingConnections?.();
    imageObserver?.disconnect();
    imageObserver = null;
  }

  return {
    key: keyOf,
    path: pathOf,
    invalidate,
    bindImage,
    preparePresentation,
    readyImage,
    observeImage,
    releaseImage,
    resetPlans,
    getBlob,
    peek,
    front,
    plan,
    release,
    snapshot,
    destroy,
  };
}

/** Instancia compartida por la aplicación y los motores. */
export const resourceCoordinator: ResourceCoordinatorApi = createResourceCoordinator();

export const {
  key,
  path,
  invalidate,
  bindImage,
  preparePresentation,
  readyImage,
  observeImage,
  releaseImage,
  resetPlans,
  getBlob,
  peek,
  front,
  plan,
  release,
  snapshot,
  destroy,
} = resourceCoordinator;
