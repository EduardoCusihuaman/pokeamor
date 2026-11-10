/**
 * Identidad inmutable de presentación de una carta.
 *
 * Módulo de dominio independiente del framework: no importa Svelte, DOM ni
 * globals. El proxy de presentación se obtiene de `cardResources` mediante
 * import explícito, no de `window.PokeCardResources`.
 *
 * Contratos (plan §7):
 * - La identidad separa **idioma**, **impresión** (`card`) y **revisión del
 *   recurso** (`resourceRevision`, la URL de imagen o `missing`). Cambiar
 *   cualquiera de los tres produce una `key` distinta.
 * - `resolve` memoriza por identidad del objeto de origen: la misma instancia
 *   devuelve siempre el mismo `CardIdentityRef` congelado.
 * - El `material` de superficies `asset-foil` se congela junto con una copia
 *   congelada de sus assets; el resto de cartas tiene `material: null`.
 * - El `thumbnail` deriva de la **imagen de catálogo** (`…/high.webp` →
 *   `…/low.webp`), nunca del material asignado. `fallbackImage` se ignora.
 * - `install` reconstruye los índices (especies, impresiones, locales) y la
 *   versión del catálogo de forma atómica.
 */

import type {
  CardLanguage,
  CardSurface,
  PrintId,
  SpeciesId,
  SurfaceAssets,
} from '@/domain/catalog';

import { cardResources, type CardProxy } from './resources';

/**
 * Forma mínima que `resolve` necesita. `Card` es asignable a este tipo; los
 * campos opcionales permiten resolver fichas legacy y pruebas parciales.
 */
export interface IdentitySource {
  readonly id?: SpeciesId;
  readonly name?: string;
  /** Identificador de impresión. */
  readonly card: PrintId;
  readonly image?: string;
  readonly language?: CardLanguage;
  /** Revisión del recurso asociado a esta presentación, si existe. */
  readonly resourceRevision?: string;
  readonly surface?: CardSurface | null;
  /** Campo legacy aceptado por compatibilidad; nunca se usa para resolver. */
  readonly fallbackImage?: string;
}

/**
 * Copia congelada de la superficie `asset-foil` que acompaña a una identidad.
 * `assets` siempre es un objeto propio (posiblemente vacío) para que nadie
 * pueda mutar el original del catálogo.
 */
export interface MaterialSnapshot extends Omit<CardSurface, 'assets'> {
  readonly assets: Readonly<Partial<SurfaceAssets>>;
}

/** Identidad de presentación congelada. */
export interface CardIdentityRef {
  /** `JSON.stringify([print, language, revision])`. */
  readonly key: string;
  /** Impresión (`Card.card`), no la especie. */
  readonly print: PrintId;
  readonly language: CardLanguage;
  readonly revision: string;
  /** Imagen frontal: material asignado o imagen de catálogo. */
  readonly image: string | null;
  /** Miniatura derivada de la imagen de catálogo. */
  readonly thumbnail: string | null;
  /** Superficie congelada solo para `effect === 'asset-foil'`. */
  readonly material: MaterialSnapshot | null;
  /** Proxy de set/número/nombre, si los recursos están cargados. */
  readonly proxy: CardProxy | null;
}

/** Entrada del índice de especies. */
export interface SpeciesRef {
  readonly id: SpeciesId;
  readonly name: string;
  /** `key` de la identidad principal de la especie en el catálogo. */
  readonly principal: string;
}

/** Entrada del índice de impresiones. */
export interface PrintRef {
  readonly id: PrintId;
}

/** Resolución de proxy inyectada desde el servicio de recursos. */
export type ProxyLookup = (print: PrintId) => CardProxy | null | undefined;

/** API pública de una instancia de identidad. */
export interface CardIdentityApi {
  /**
   * Reemplaza el catálogo y su versión. Lanza `Invalid catalog revision` si
   * `catalog` no es un array o `version` está vacía.
   */
  readonly install: (catalog: unknown, version: string) => void;
  readonly getSpecies: (id: SpeciesId) => SpeciesRef | undefined;
  readonly getPrint: (id: PrintId) => PrintRef | undefined;
  readonly getLocale: (key: string) => CardIdentityRef | undefined;
  /** Versión instalada; `initial` antes del primer `install`. */
  readonly getRevision: () => string;
  /**
   * Resuelve (y memoriza) la identidad de un origen. `null`/`undefined`
   * devuelven `null`.
   */
  readonly resolve: (source: IdentitySource | null | undefined) => CardIdentityRef | null;
  /** Atajo de `resolve(source)?.key`. */
  readonly key: (source: IdentitySource | null | undefined) => string | undefined;
  /**
   * Ventana acotada de índices alrededor de `index`: incluye el actual, el
   * anterior y hasta dos posteriores, recortada a `[0, length)`.
   */
  readonly windowIndices: (length: number, index: number) => number[];
}

/** Catálogo instalable: además de `IdentitySource`, exige `id` y `name`. */
interface InstalledCard extends IdentitySource {
  readonly id: SpeciesId;
  readonly name: string;
}

/**
 * Confía en la forma del catálogo, igual que el módulo legacy. La validación
 * profunda de cartas vive en `isCard` (`@/domain/catalog`); `install` solo
 * comprueba que el argumento sea una lista, como el original.
 */
function isInstallableCatalog(value: unknown): value is readonly InstalledCard[] {
  return Array.isArray(value);
}

function freezeMaterial(surface: CardSurface): MaterialSnapshot {
  const assets: Readonly<Partial<SurfaceAssets>> = Object.freeze({ ...(surface.assets ?? {}) });
  return Object.freeze({ ...surface, assets });
}

/**
 * Crea una instancia aislada del resolutor de identidad.
 *
 * @param lookupProxy Fuente explícita de proxies; por defecto no hay ninguno.
 */
export function createCardIdentity(lookupProxy: ProxyLookup = () => null): CardIdentityApi {
  let refs = new WeakMap<IdentitySource, CardIdentityRef>();
  let revisionVersion = 'initial';
  const species = new Map<SpeciesId, SpeciesRef>();
  const prints = new Map<PrintId, PrintRef>();
  const locales = new Map<string, CardIdentityRef>();

  function resolve(source: IdentitySource | null | undefined): CardIdentityRef | null {
    if (!source) return null;

    const cached = refs.get(source);
    if (cached) return cached;

    const image = source.surface?.assets?.front || source.image || null;
    const language = source.language || (/\/es\//.test(source.image ?? '') ? 'es' : 'source');
    const revision = source.resourceRevision || image || 'missing';
    const key = JSON.stringify([source.card, language, revision]);
    const thumbnail = source.image?.startsWith('https://assets.tcgdex.net/')
      ? source.image.replace('/high.webp', '/low.webp')
      : image;

    const ref: CardIdentityRef = Object.freeze({
      key,
      print: source.card,
      language,
      revision,
      image,
      thumbnail,
      material: source.surface?.effect === 'asset-foil' ? freezeMaterial(source.surface) : null,
      proxy: lookupProxy(source.card) ?? null,
    });

    refs.set(source, ref);
    return ref;
  }

  function install(catalog: unknown, version: string): void {
    if (!isInstallableCatalog(catalog) || !version) throw new Error('Invalid catalog revision');

    refs = new WeakMap();
    species.clear();
    prints.clear();
    locales.clear();
    revisionVersion = version;

    for (const source of catalog) {
      const ref = resolve(source);
      if (!ref) throw new Error('Invalid catalog revision');

      species.set(
        source.id,
        Object.freeze({ id: source.id, name: source.name, principal: ref.key }),
      );
      prints.set(ref.print, Object.freeze({ id: ref.print }));
      locales.set(ref.key, ref);
    }
  }

  return {
    install,
    getSpecies: (id) => species.get(id),
    getPrint: (id) => prints.get(id),
    getLocale: (key) => locales.get(key),
    getRevision: () => revisionVersion,
    resolve,
    key: (source) => resolve(source)?.key,
    windowIndices(length, index) {
      const start = Math.max(0, index - 1);
      const count = Math.min(length, index + 4) - start;
      return Array.from({ length: count }, (_, offset) => start + offset);
    },
  };
}

/**
 * Instancia compartida. Resuelve proxies contra el servicio de recursos
 * compartido; si los recursos no están instalados, `proxy` es `null`.
 */
export const cardIdentity: CardIdentityApi = createCardIdentity((print) =>
  cardResources.getProxy(print),
);

export const {
  install,
  getSpecies,
  getPrint,
  getLocale,
  getRevision,
  resolve,
  key,
  windowIndices,
} = cardIdentity;
