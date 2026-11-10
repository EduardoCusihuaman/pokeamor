/**
 * Exportación de alternativas y códigos de Limitless.
 *
 * Extraído de `src/app.js`: `makeAlternativeCard` y `debugProxyText`. Es un
 * módulo de aplicación independiente del framework: no toca el DOM, `window`
 * ni Svelte; la capa de presentación inyecta la selección, las impresiones y la
 * búsqueda de equivalencias.
 *
 * Contratos preservados:
 * - `makeAlternativeCard` conserva la identidad de especie del catálogo
 *   (`id`, `name`, rasgos, paleta y prior comunitaria) y reemplaza la impresión
 *   completa con la fila curada: `card`, `image` y `fallbackImage` son la misma
 *   impresión, con `surface: null` y `reencounter: true`. No copia metadatos de
 *   la carta base (`surface`, `proxy`, etc.).
 * - `debugProxyText` ordena por `pokemonId` y luego por `printId`, emite una
 *   línea `1 <name> <set> <number>` por impresión y falla con el mismo mensaje
 *   si la selección contiene una impresión desconocida o si falta un código de
 *   Limitless.
 */

import { plan, type ProxyLookup } from '@/domain/collection/batch-export';

/**
 * Fila curada de alternativa: `[printId, image, rarity, artist]`.
 *
 * Es la forma que publica `data/alternatives-curated.json` una vez validada por
 * la capa de recursos.
 */
export type AlternativeRow = readonly [
  printId: string,
  image: string,
  rarity: string,
  artist: string,
];

/** Mínimo estructural de la carta de catálogo que usa la alternativa. */
export interface AlternativeCardSource {
  readonly id: number;
  readonly name: string;
  readonly traits?: unknown;
  readonly palette?: unknown;
  readonly communityVotes2020?: unknown;
  /** Impresión original; se reemplaza por la de la fila curada. */
  readonly card?: string | null;
}

/**
 * Carta de encuentro alternativa.
 *
 * `image` y `fallbackImage` apuntan a la impresión alternativa, nunca a la
 * original. `surface` se anula a propósito porque el material de la impresión
 * base no corresponde a la ilustración alternativa.
 */
export interface AlternativeCard {
  readonly id: number;
  readonly name: string;
  readonly traits: unknown;
  readonly palette: unknown;
  readonly communityVotes2020: unknown;
  readonly card: string;
  readonly image: string;
  readonly fallbackImage: string;
  readonly rarity: string;
  readonly artist: string;
  readonly surface: null;
  readonly reencounter: true;
}

/** Impresión elegible para la exportación de proxies. */
export interface DebugPrint {
  /** Identidad de especie; manda el orden de salida. */
  readonly pokemonId: number;
  /** Identificador de impresión (`sv07-143`). */
  readonly printId: string;
  readonly name?: string;
}

/**
 * Construye la carta de una alternativa curada.
 *
 * No busca metadatos en runtime: la fila ya trae impresión, imagen, rareza y
 * artista verificados.
 */
export function makeAlternativeCard(
  card: AlternativeCardSource,
  row: AlternativeRow,
): AlternativeCard {
  return {
    id: card.id,
    name: card.name,
    traits: card.traits,
    palette: card.palette,
    communityVotes2020: card.communityVotes2020,
    card: row[0],
    image: row[1],
    fallbackImage: row[1],
    rarity: row[2],
    artist: row[3],
    surface: null,
    reencounter: true,
  };
}

/**
 * Genera el listado para «List input» de Limitless.
 *
 * @throws `Selección inválida` si algún id seleccionado no está en `prints`.
 * @throws `<n> sin código de Limitless: <name> (<printId>), …` si falta algún
 *   proxy. La exportación nunca omite una carta en silencio.
 */
export function debugProxyText(
  selection: Iterable<string>,
  prints: ReadonlyMap<string, DebugPrint>,
  lookup: ProxyLookup,
): string {
  const selected = [...selection].map((id) => prints.get(id));

  if (selected.some((print) => !print)) throw new Error('Selección inválida');

  const resolved = selected.filter((print): print is DebugPrint => print !== undefined);
  resolved.sort((a, b) => a.pokemonId - b.pokemonId || a.printId.localeCompare(b.printId));

  const missing = resolved.filter((print) => !lookup(print.printId));
  if (missing.length) {
    throw new Error(
      `${missing.length} sin código de Limitless: ${missing
        .map((print) => `${print.name} (${print.printId})`)
        .join(', ')}`,
    );
  }

  // El formato de línea (`1 <name> <set> <number>`) vive en `batch-export`;
  // acá solo se aporta el orden y las validaciones propias de la herramienta.
  const result = plan(
    [
      resolved.map((print) => ({
        id: print.pokemonId,
        name: print.name ?? '',
        card: print.printId,
      })),
    ],
    lookup,
  );

  return result.text;
}
