/**
 * Contratos del catálogo de cartas.
 *
 * Este módulo es independiente del framework: no importa Svelte, componentes,
 * DOM ni infraestructura concreta. Los tipos reflejan la forma real de
 * `data/catalog.json` y de `/catalog-bundle.json`.
 */

/** Identificador de especie. Distinto del identificador de impresión (`Card.card`). */
export type SpeciesId = number;

/** Identificador de impresión, por ejemplo `sv07-143`. */
export type PrintId = string;

/**
 * Idioma de la ficha. El catálogo actual usa `es` y `en`.
 * Se mantiene abierto porque el catálogo puede incorporar otros idiomas.
 */
export type CardLanguage = string;

export interface Palette {
  /** Tono, 0–360. */
  readonly h: number;
  /** Saturación, 0–100. */
  readonly s: number;
  /** Valor, 0–100. */
  readonly v: number;
}

export interface SurfaceAssets {
  /** Imagen frontal preparada. */
  readonly front: string;
  /** Mapa de foil, cuando existe. */
  readonly foil?: string;
}

/**
 * Material de superficie de una carta.
 *
 * El catálogo contiene objetos completos (`status: 'material-matched'`),
 * parciales (`effect: 'none'`) y vacíos. Por eso todas las propiedades son
 * opcionales salvo que el guard compruebe su tipo cuando están presentes.
 */
export interface CardSurface {
  /** Valores observados: `material-matched`, `unverified`, `confirmed-nonfoil`, `matched-tcgl`. */
  readonly status?: string;
  /** Valores observados: `asset-foil`, `none`. */
  readonly effect?: string;
  /** Locale del material, por ejemplo `es-ES`. */
  readonly language?: string;
  /** Impresión a la que pertenece el material. */
  readonly cardId?: PrintId;
  /** Proveedor del material, por ejemplo `malie.io`. */
  readonly provider?: string;
  /** Valores observados: `SUN_PILLAR`, `SV_ULTRA`, `SV_HOLO`, `RAINBOW`, `NONE`. */
  readonly type?: string;
  readonly etched?: boolean;
  readonly assets?: SurfaceAssets;
}

export interface Card {
  /** Identificador de especie; es la identidad usada por votos y sesión. */
  readonly id: SpeciesId;
  readonly name: string;
  /** URL de la imagen principal de la carta. */
  readonly image: string;
  /** Identificador de impresión, por ejemplo `sv07-143`. */
  readonly card: PrintId;
  readonly rarity: string;
  readonly palette: Palette;
  readonly language: CardLanguage;
  /**
   * `null` cuando la impresión todavía no tiene material asignado; el catálogo
   * actual contiene 263 cartas así.
   */
  readonly surface: CardSurface | null;
  /** Rasgos usados por recomendaciones, por ejemplo `type:12` o `color_id:5`. */
  readonly traits: readonly string[];
  /** Prior comunitaria; no es afinidad personal. Puede faltar. */
  readonly communityVotes2020?: number;
}

/** Respuesta exacta de `/catalog-bundle.json`. */
export interface CatalogBundle {
  readonly catalog: readonly Card[];
  readonly manifest: unknown;
  readonly alternatives: unknown;
  readonly proxies: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string');
}

function isPalette(value: unknown): value is Palette {
  return (
    isRecord(value) &&
    typeof value.h === 'number' &&
    typeof value.s === 'number' &&
    typeof value.v === 'number'
  );
}

function isSurfaceAssets(value: unknown): value is SurfaceAssets {
  if (!isRecord(value) || typeof value.front !== 'string') return false;
  return isOptionalString(value.foil);
}

function isCardSurface(value: unknown): value is CardSurface {
  if (!isRecord(value)) return false;

  const validStrings =
    isOptionalString(value.status) &&
    isOptionalString(value.effect) &&
    isOptionalString(value.language) &&
    isOptionalString(value.cardId) &&
    isOptionalString(value.provider) &&
    isOptionalString(value.type);
  if (!validStrings) return false;

  if (value.etched !== undefined && typeof value.etched !== 'boolean') return false;
  if (value.assets !== undefined && !isSurfaceAssets(value.assets)) return false;

  return true;
}

/** Comprueba en tiempo de ejecución que un valor tiene la forma de `Card`. */
export function isCard(value: unknown): value is Card {
  if (!isRecord(value)) return false;

  if (typeof value.id !== 'number' || !Number.isInteger(value.id)) return false;
  if (typeof value.name !== 'string') return false;
  if (typeof value.image !== 'string') return false;
  if (typeof value.card !== 'string') return false;
  if (typeof value.rarity !== 'string') return false;
  if (typeof value.language !== 'string') return false;
  if (!isPalette(value.palette)) return false;
  if (value.surface !== null && !isCardSurface(value.surface)) return false;

  if (!isStringArray(value.traits)) return false;

  if (value.communityVotes2020 !== undefined && typeof value.communityVotes2020 !== 'number') {
    return false;
  }

  return true;
}

/** Comprueba la forma de `/catalog-bundle.json` y de cada carta del catálogo. */
export function isCatalogBundle(value: unknown): value is CatalogBundle {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.catalog) || !value.catalog.every(isCard)) return false;

  return 'manifest' in value && 'alternatives' in value && 'proxies' in value;
}
