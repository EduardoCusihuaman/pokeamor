/**
 * Recursos opcionales e inmutables del catálogo (alternativas y proxies).
 *
 * Módulo de dominio independiente del framework: no toca `window`, ni el DOM,
 * ni Svelte. La carga es perezosa y direccionada por contenido: el manifiesto
 * publicado contiene las URLs con hash de cada recurso y su `dataVersion`, y
 * ningún `fetch` ocurre hasta que se llama a un loader.
 *
 * Contratos preservados del módulo legacy `src/card-resources.js`:
 * - `loadAlternatives`/`loadProxies` deduplican peticiones concurrentes (la
 *   misma promesa se comparte) y reutilizan la memoria una vez resuelta.
 * - Un fallo deja el slot en `error` y el siguiente intento vuelve a pedir.
 * - Los datos se validan contra el `dataVersion` del manifiesto vigente.
 * - `installBundle` valida todo antes de publicar nada: o instala catálogo y
 *   recursos, o lanza y conserva el estado anterior.
 * - Los payloads publicados son de solo lectura por contrato; no se clonan.
 *
 * El acceso a `fetch` y al manifiesto inicial se inyecta explícitamente
 * (`createCardResources`) para que el dominio no dependa de globals. El
 * singleton `cardResources` es el que consumen los motores y la aplicación.
 */

import type { PrintId, SpeciesId } from '@/domain/catalog';

/** Estado observable de un slot de recursos. */
export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Los dos recursos opcionales que se cargan bajo demanda. */
export type ResourceKind = 'alternatives' | 'proxies';

/**
 * Manifiesto de recursos publicado junto al catálogo.
 *
 * `schema` es opcional porque la configuración legacy en `index.html` podía
 * declarar solo `dataVersion`, `alternatives` y `proxies`; el manifiesto
 * generado por `scripts/build-card-resources.py` siempre incluye `schema: 1`.
 */
export interface CardResourcesManifest {
  readonly schema?: 1;
  readonly dataVersion: string;
  /** URL del JSON de alternativas. */
  readonly alternatives?: string;
  /** URL del JSON de proxies. */
  readonly proxies?: string;
}

/**
 * Fila de alternativa: `[printId, image, rarity, artist]`.
 * `image` debe ser una URL absoluta `https://`.
 */
export type AlternativeRow = readonly [
  printId: string,
  image: string,
  rarity: string,
  artist: string,
];

/** Fila de proxy: `[índice en sets, número, nombre]`. */
export type ProxyRow = readonly [setIndex: number, number: string, name: string];

/** Payload validado de `/alternatives.<hash>.json`. */
export interface AlternativesData {
  readonly schema: 1;
  readonly dataVersion: string;
  readonly pokemon: Readonly<Record<string, readonly AlternativeRow[]>>;
}

/** Payload validado de `/proxies.<hash>.json`. */
export interface ProxiesData {
  readonly schema: 1;
  readonly dataVersion: string;
  readonly sets: readonly string[];
  readonly prints: Readonly<Record<string, ProxyRow>>;
}

/** Resultado de `getProxy`: set, número y nombre de la impresión. */
export interface CardProxy {
  readonly set: string;
  readonly number: string;
  readonly name: string;
}

/** Respuesta mínima que el loader necesita de `fetch`. */
export interface ResourceResponse {
  readonly ok: boolean;
  json(): Promise<unknown>;
}

/**
 * Fetcher inyectable. Recibe la URL del manifiesto y la señal de aborto que
 * el loader cancela a los 10 s (o al `timeoutMs` configurado).
 */
export type ResourceFetcher = (
  url: string,
  init: { readonly signal: AbortSignal },
) => Promise<ResourceResponse>;

/** Estado de ambos slots, tal como lo devuelve `getStatus`. */
export interface CardResourcesStatus {
  readonly alternatives: ResourceStatus;
  readonly proxies: ResourceStatus;
}

/** Opciones de construcción de una instancia de recursos. */
export interface CardResourcesOptions {
  /** Manifiesto ya publicado; `null`/ausente deja los loaders sin URL. */
  readonly manifest?: CardResourcesManifest | null;
  /** Fetcher inyectable; por defecto, `fetch` global. */
  readonly fetch?: ResourceFetcher;
  /** Tiempo máximo de una petición antes de abortarla. */
  readonly timeoutMs?: number;
}

interface ResourceSlot<T> {
  data?: T;
  status: ResourceStatus;
  promise: Promise<T> | null;
}

/** API pública de una instancia de recursos. */
export interface CardResourcesApi {
  /** Instala un bundle completo (catálogo + recursos) de forma atómica. */
  readonly installBundle: (bundle: unknown) => void;
  readonly loadAlternatives: () => Promise<AlternativesData>;
  readonly loadProxies: () => Promise<ProxiesData>;
  /** Alternativas de una especie; `[]` si aún no están cargadas. */
  readonly getAlternatives: (id: SpeciesId | string) => readonly AlternativeRow[];
  /** Proxy de una impresión; `null` si no existe o no está cargado. */
  readonly getProxy: (id: PrintId) => CardProxy | null;
  readonly getStatus: () => CardResourcesStatus;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_FETCH: ResourceFetcher = (url, init) => fetch(url, init);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createSlot<T>(): ResourceSlot<T> {
  return { status: 'idle', promise: null };
}

/**
 * Comprueba la cabecera común de un payload de recursos.
 *
 * @throws `Versión de recursos incompatible` si el esquema o la versión no
 * coinciden con el manifiesto vigente.
 */
function assertSchema(
  value: unknown,
  expected: CardResourcesManifest,
): asserts value is Record<string, unknown> {
  if (!isRecord(value) || value.schema !== 1 || value.dataVersion !== expected.dataVersion) {
    throw new Error('Versión de recursos incompatible');
  }
}

function isAlternativeRow(value: unknown): value is AlternativeRow {
  if (!Array.isArray(value)) return false;
  const row: readonly unknown[] = value;
  if (row.length !== 4) return false;
  if (!row.every((cell): cell is string => typeof cell === 'string')) return false;
  const image = row[1];
  return typeof image === 'string' && image.startsWith('https://');
}

function isProxyRow(value: unknown, sets: readonly unknown[]): value is ProxyRow {
  if (!Array.isArray(value)) return false;
  const row: readonly unknown[] = value;
  if (row.length !== 3) return false;
  const setIndex = row[0];
  if (typeof setIndex !== 'number' || !Number.isInteger(setIndex)) return false;
  if (!sets[setIndex]) return false;
  return typeof row[1] === 'string' && typeof row[2] === 'string';
}

/**
 * Valida las alternativas conservando las reglas legacy: claves numéricas,
 * listas de hasta tres filas de cuatro cadenas y `image` con `https://`.
 */
function validateAlternatives(value: unknown, expected: CardResourcesManifest): AlternativesData {
  assertSchema(value, expected);

  const pokemon = value.pokemon;
  if (!pokemon || typeof pokemon !== 'object') throw new Error('Alternativas inválidas');

  const validated: Record<string, readonly AlternativeRow[]> = {};
  for (const [id, rows] of Object.entries(pokemon as Record<string, unknown>)) {
    if (!/^\d+$/.test(id) || !Array.isArray(rows)) throw new Error('Alternativa inválida');
    const rowList: readonly unknown[] = rows;
    if (rowList.length > 3 || !rowList.every(isAlternativeRow)) {
      throw new Error('Alternativa inválida');
    }
    validated[id] = rowList;
  }

  return { schema: 1, dataVersion: expected.dataVersion, pokemon: validated };
}

/**
 * Valida los proxies: `sets` es una lista de cadenas y cada fila referencia
 * un set existente, con número y nombre de tipo cadena.
 */
function validateProxies(value: unknown, expected: CardResourcesManifest): ProxiesData {
  assertSchema(value, expected);

  const sets = value.sets;
  const prints = value.prints;
  if (
    !Array.isArray(sets) ||
    !prints ||
    typeof prints !== 'object' ||
    !sets.every((set): set is string => typeof set === 'string')
  ) {
    throw new Error('Proxies inválidos');
  }

  for (const row of Object.values(prints as Record<string, unknown>)) {
    if (!isProxyRow(row, sets)) throw new Error('Proxy inválido');
  }

  return {
    schema: 1,
    dataVersion: expected.dataVersion,
    sets,
    prints: prints as ProxiesData['prints'],
  };
}

/**
 * Crea una instancia aislada del servicio de recursos.
 *
 * La instancia encapsula manifiesto, slots y deduplicación; dos instancias no
 * comparten caché. Es la forma testeable del singleton `cardResources`.
 */
export function createCardResources(options: CardResourcesOptions = {}): CardResourcesApi {
  const fetcher = options.fetch ?? DEFAULT_FETCH;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let manifest: CardResourcesManifest | null = options.manifest ?? null;
  const slots = {
    alternatives: createSlot<AlternativesData>(),
    proxies: createSlot<ProxiesData>(),
  };

  /**
   * Carga perezosa de un slot.
   *
   * Si ya hay datos, resuelve con ellos sin red. Si hay una petición en curso,
   * devuelve exactamente la misma promesa (deduplicación). Si falla, marca
   * `error` y permite reintentar.
   */
  function loadSlot<T>(
    slot: ResourceSlot<T>,
    kind: ResourceKind,
    validateData: (value: unknown, expected: CardResourcesManifest) => T,
  ): Promise<T> {
    if (slot.data) return Promise.resolve(slot.data);
    if (slot.promise) return slot.promise;

    slot.status = 'loading';

    const expected = manifest;
    const url = expected?.[kind];
    if (!expected || !url) throw new Error('Recurso de cartas no instalado');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    slot.promise = fetcher(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo cargar el recurso');
        return response.json();
      })
      .then((value) => {
        const data = validateData(value, expected);
        slot.data = data;
        slot.status = 'ready';
        return data;
      })
      .catch((error: unknown) => {
        slot.status = 'error';
        throw error;
      })
      .finally(() => {
        clearTimeout(timer);
        slot.promise = null;
      });

    return slot.promise;
  }

  function installBundle(bundle: unknown): void {
    const candidate = isRecord(bundle) ? bundle : null;
    const next = candidate ? toManifest(candidate.manifest) : null;
    if (!candidate || !next || !Array.isArray(candidate.catalog)) {
      throw new Error('Invalid resource bundle');
    }

    const catalog: readonly unknown[] = candidate.catalog;
    const ids = catalog.map((entry) => (isRecord(entry) ? entry.id : undefined));
    const invalidCatalog = catalog.some(
      (entry) =>
        !isRecord(entry) ||
        !Number.isInteger(entry.id) ||
        typeof entry.card !== 'string' ||
        typeof entry.image !== 'string',
    );
    if (new Set(ids).size !== catalog.length || invalidCatalog) {
      throw new Error('Invalid catalog');
    }

    // Validar ambos recursos antes de publicar nada: la instalación es atómica.
    const alternatives = validateAlternatives(candidate.alternatives, next);
    const proxies = validateProxies(candidate.proxies, next);

    manifest = next;
    slots.alternatives = { data: alternatives, status: 'ready', promise: null };
    slots.proxies = { data: proxies, status: 'ready', promise: null };
  }

  return {
    installBundle,
    loadAlternatives: () => loadSlot(slots.alternatives, 'alternatives', validateAlternatives),
    loadProxies: () => loadSlot(slots.proxies, 'proxies', validateProxies),
    getAlternatives: (id) => slots.alternatives.data?.pokemon[String(id)] ?? [],
    getProxy: (id) => {
      const data = slots.proxies.data;
      const row = data?.prints[id];
      if (!data || !row) return null;
      const set = data.sets[row[0]];
      if (!set) return null;
      return { set, number: row[1], name: row[2] };
    },
    getStatus: () => ({
      alternatives: slots.alternatives.status,
      proxies: slots.proxies.status,
    }),
  };
}

/**
 * Normaliza el manifiesto de un bundle sin aceptar formas inválidas.
 * Devuelve `null` si el schema no es 1 o falta `dataVersion`.
 */
function toManifest(value: unknown): CardResourcesManifest | null {
  if (!isRecord(value) || value.schema !== 1 || typeof value.dataVersion !== 'string') return null;
  const alternatives = typeof value.alternatives === 'string' ? value.alternatives : undefined;
  const proxies = typeof value.proxies === 'string' ? value.proxies : undefined;
  return {
    schema: 1,
    dataVersion: value.dataVersion,
    ...(alternatives === undefined ? {} : { alternatives }),
    ...(proxies === undefined ? {} : { proxies }),
  };
}

/**
 * Instancia compartida que consumen la aplicación y los motores.
 *
 * Se crea sin manifiesto: en producción el bootstrap llama a `installBundle`
 * con `/catalog-bundle.json`, que publica manifiesto y recursos a la vez.
 */
export const cardResources: CardResourcesApi = createCardResources();

export const {
  installBundle,
  loadAlternatives,
  loadProxies,
  getAlternatives,
  getProxy,
  getStatus,
} = cardResources;
