/**
 * Pool compartido de materiales foil/etch (motor independiente de Svelte).
 *
 * Migrado de `src/material-assets.js`. Mantiene una caché pequeña y acotada de
 * texturas de material. Cuando existe el coordinador compartido
 * (`resource-coordinator.ts`), delega en él para que las descargas se
 * dedupliquen con el resto de la aplicación; si se deshabilita expresamente,
 * usa una cola local equivalente.
 *
 * Contratos conservados:
 * - `prepare` descarga el lookahead completo (hasta cuatro cartas, o una con
 *   `saveData`) antes de que sea visible.
 * - Los cambios de carta no reinician descargas útiles: los recursos en vuelo
 *   se comparten y solo se descarta trabajo `queued` fuera del lookahead.
 * - La caché local respeta 16 MiB y 20 entradas, revocando las URLs de objeto
 *   de las entradas desalojadas y conservando las fijadas por `prepare`.
 * - Un fallo HTTP es reintentable y nunca se convierte en material cacheado.
 *
 * El I/O se inyecta con `MaterialAssetsOptions`; el singleton delega en el
 * coordinador compartido.
 */

import type { CardSurface, SurfaceAssets } from '@/domain/catalog';
import type { IdentitySource } from '@/domain/cards/identity';

import { resourceCoordinator, type TimerHandle } from './resource-coordinator';

/** Nombres de assets de material que consume este motor. */
export type MaterialAssetName = 'front' | 'foil' | 'etch';

/** Assets de una superficie; incluye `etch`, ausente del tipo de catálogo. */
export interface MaterialSurfaceAssets extends SurfaceAssets {
  readonly etch?: string;
}

/** Superficie con assets de material opcionales (compatibilidad legacy). */
export interface MaterialSurface extends CardSurface {
  readonly assets?: MaterialSurfaceAssets;
}

/** Carta mínima que necesita el pool; asignable a `IdentitySource`. */
export interface MaterialCard extends IdentitySource {
  readonly surface?: MaterialSurface | null;
}

/** Respuesta mínima de `fetch`. */
export interface MaterialFetcherResponse {
  readonly ok: boolean;
  blob(): Promise<Blob>;
}

/** Init mínimo enviado a `fetch`. */
export interface MaterialFetchInit {
  readonly signal: AbortSignal;
  readonly cache: 'force-cache';
  readonly priority: 'high' | 'low';
}

/** Fetcher inyectable. */
export type MaterialFetcher = (
  path: string,
  init: MaterialFetchInit,
) => Promise<MaterialFetcherResponse>;

/**
 * Puente opcional al coordinador compartido. `resourceCoordinator` lo
 * satisface estructuralmente.
 */
export interface MaterialResourceBridge {
  getBlob(path: string, priority?: number): Promise<Blob>;
  peek(path: string): string | null;
  front(card: MaterialCard): Promise<string>;
  plan(
    owner: string,
    cards: readonly MaterialCard[],
    options?: { readonly adaptive?: boolean },
  ): readonly unknown[];
}

/** Dependencias inyectables del pool local. */
export interface MaterialAssetsOptions {
  /** `undefined`: coordinador compartido; `null`: cola local. */
  readonly resources?: MaterialResourceBridge | null;
  readonly fetch?: MaterialFetcher;
  readonly createAbortController?: () => AbortController;
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly setTimer?: (callback: () => void, timeoutMs: number) => TimerHandle;
  readonly clearTimer?: (handle: TimerHandle) => void;
  readonly isSaveData?: () => boolean;
}

/** API pública del pool de materiales. */
export interface MaterialAssetsApi {
  readonly getBlob: (path: string, priority?: number) => Promise<Blob>;
  readonly front: (card: MaterialCard) => Promise<string>;
  readonly peekFront: (card: MaterialCard) => string | null;
  readonly prepare: (cards: readonly MaterialCard[], withFoil?: boolean) => void;
  /** Revoca URLs de objeto y vacía la cola local. No afecta al puente. */
  readonly destroy: () => void;
}

type MaterialState = 'queued' | 'loading' | 'ready';

interface MaterialEntry {
  readonly path: string;
  priority: number;
  state: MaterialState;
  used: number;
  blob: Blob | null;
  objectUrl: string | null;
  readonly promise: Promise<Blob>;
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
}

const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 20;
const MAX_CONCURRENCY = 4;
const MAX_MATERIAL_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;
const MATERIAL_PRIORITY = 30;
const BRIDGE_PRIORITY_BASE = 30;

const defaultFetch: MaterialFetcher = (path, init) => fetch(path, init);

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

function defaultIsSaveData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (
    navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }
  ).connection;
  return connection?.saveData === true;
}

function isValidPath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith('/materials/') && !path.includes('..');
}

function assetsOf(card: MaterialCard): Readonly<Partial<Record<MaterialAssetName, string>>> {
  const assets = card.surface?.assets;
  if (!assets) return {};
  return assets;
}

/**
 * Crea un pool aislado. Con `resources: null` usa la cola local; con
 * `resources` ausente delega en el coordinador compartido.
 */
export function createMaterialAssets(options: MaterialAssetsOptions = {}): MaterialAssetsApi {
  const bridge: MaterialResourceBridge | null =
    options.resources === undefined ? resourceCoordinator : options.resources;
  const fetchFn = options.fetch ?? defaultFetch;
  const createAbortController = options.createAbortController ?? defaultCreateAbortController;
  const createObjectURL = options.createObjectURL ?? defaultCreateObjectURL;
  const revokeObjectURL = options.revokeObjectURL ?? defaultRevokeObjectURL;
  const setTimer = options.setTimer ?? defaultSetTimer;
  const clearTimer = options.clearTimer ?? defaultClearTimer;
  const isSaveData = options.isSaveData ?? defaultIsSaveData;

  const entries = new Map<string, MaterialEntry>();
  let running = 0;
  let bytes = 0;
  let clock = 0;
  let pinned = new Set<string>();
  let destroyed = false;

  function trim(): void {
    const ordered = [...entries.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [path, entry] of ordered) {
      if (bytes <= MAX_BYTES && entries.size <= MAX_ENTRIES) break;
      if (entry.state !== 'ready' || !entry.blob || pinned.has(path)) continue;
      bytes -= entry.blob.size;
      if (entry.objectUrl) revokeObjectURL(entry.objectUrl);
      entries.delete(path);
    }
  }

  function pump(): void {
    if (destroyed) return;
    while (running < MAX_CONCURRENCY) {
      const entry = [...entries.values()]
        .filter((candidate) => candidate.state === 'queued')
        .sort((a, b) => a.priority - b.priority || a.used - b.used)[0];
      if (!entry) break;

      entry.state = 'loading';
      running++;
      const controller = createAbortController();
      const timer = setTimer(() => controller.abort(), REQUEST_TIMEOUT_MS);

      void fetchFn(entry.path, {
        cache: 'force-cache',
        signal: controller.signal,
        priority: entry.priority === 0 ? 'high' : 'low',
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('material unavailable');
          const blob = await response.blob();
          if (blob.size > MAX_MATERIAL_BYTES || !blob.type.startsWith('image/')) {
            throw new Error('invalid material');
          }
          entry.blob = blob;
          entry.state = 'ready';
          bytes += blob.size;
          entry.resolve(blob);
        })
        .catch((error: unknown) => {
          entries.delete(entry.path);
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

  function enqueue(path: string, priority = 0): Promise<Blob> {
    if (!isValidPath(path)) return Promise.reject(new Error('invalid material path'));

    const existing = entries.get(path);
    if (existing) {
      existing.used = ++clock;
      existing.priority = Math.min(existing.priority, priority);
      pump();
      return existing.promise;
    }

    let resolve!: (blob: Blob) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Blob>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const entry: MaterialEntry = {
      path,
      priority,
      state: 'queued',
      used: ++clock,
      blob: null,
      objectUrl: null,
      promise,
      resolve,
      reject,
    };
    entries.set(path, entry);
    return promise;
  }

  function getBlob(path: string, priority = 0): Promise<Blob> {
    if (bridge) {
      return bridge.getBlob(
        path,
        path.endsWith('/front.png') ? priority : Math.max(MATERIAL_PRIORITY, priority),
      );
    }
    const promise = enqueue(path, priority);
    pump();
    return promise;
  }

  function peekFront(card: MaterialCard): string | null {
    const path = assetsOf(card).front;
    if (bridge) return path ? bridge.peek(path) : null;
    if (!isValidPath(path)) return null;
    const entry = entries.get(path);
    if (entry?.state !== 'ready' || !entry.blob) return null;
    entry.used = ++clock;
    entry.objectUrl ??= createObjectURL(entry.blob);
    return entry.objectUrl;
  }

  async function front(card: MaterialCard): Promise<string> {
    if (bridge) return bridge.front(card);
    const path = assetsOf(card).front;
    if (!isValidPath(path)) throw new Error('invalid material path');
    await getBlob(path, 0);
    const url = peekFront(card);
    if (!url) throw new Error('material evicted');
    return url;
  }

  function prepare(cards: readonly MaterialCard[], withFoil = true): void {
    if (bridge) {
      bridge.plan('materials', cards.slice(0, 2));
      for (const [index, card] of cards.slice(0, 1).entries()) {
        if (!withFoil) continue;
        const names: readonly MaterialAssetName[] = [
          'foil',
          ...(card.surface?.etched ? (['etch'] as const) : []),
        ];
        for (const name of names) {
          const path = assetsOf(card)[name];
          if (isValidPath(path)) {
            void bridge.getBlob(path, BRIDGE_PRIORITY_BASE + index).catch(() => {});
          }
        }
      }
      return;
    }

    const upcoming = cards.slice(0, isSaveData() ? 1 : 4);
    const paths = new Set<string>();

    upcoming.forEach((card, index) => {
      const assets = assetsOf(card);
      const names: readonly MaterialAssetName[] = [
        'front',
        ...(withFoil
          ? (['foil', ...(card.surface?.etched ? (['etch'] as const) : [])] as const)
          : []),
      ];
      for (const name of names) {
        const path = assets[name];
        if (!isValidPath(path)) continue;
        paths.add(path);
        void enqueue(path, index === 0 ? 0 : 10 + index).catch(() => {});
      }
    });
    pinned = paths;

    // Descartar trabajo obsoleto, conservando descargas en vuelo para undo.
    for (const [path, entry] of entries) {
      if (entry.state === 'queued' && !paths.has(path)) {
        entries.delete(path);
        entry.reject(new Error('outside lookahead'));
      }
    }

    trim();
    pump();
  }

  function destroy(): void {
    destroyed = true;
    for (const [path, entry] of entries) {
      if (entry.objectUrl) revokeObjectURL(entry.objectUrl);
      entries.delete(path);
      if (entry.state !== 'ready') entry.reject(new Error('materials destroyed'));
    }
    bytes = 0;
    pinned = new Set();
  }

  return { getBlob, front, peekFront, prepare, destroy };
}

/** Singleton que delega en el coordinador compartido. */
export const materialAssets: MaterialAssetsApi = createMaterialAssets({
  resources: resourceCoordinator,
});

export const { getBlob, front, peekFront, prepare, destroy } = materialAssets;
