/**
 * Exportación de tandas a Limitless (herramienta de proxies).
 *
 * Extraído de `window.PokeBatchExport.plan` (`src/batch-export.js`). El módulo
 * es puro: no lee `PokeCardResources`, `PokeJourney` ni el DOM. La capa de
 * aplicación inyecta las tandas visibles y la búsqueda de equivalencias.
 *
 * Contrato preservado:
 * - Se emite una línea `1 <name> <set> <number>` por carta con proxy.
 * - Las cartas sin equivalencia se acumulan en `missing` con `card: null`
 *   cuando la carta no tiene impresión asignada.
 * - Las tandas vacías no generan bloque y los bloques se separan con una línea
 *   en blanco (`\n\n`).
 * - El orden de `groups` manda: la UI legacy pasa las tandas invertidas para
 *   exportar de la más antigua a la más reciente.
 */

/** Mínimo estructural que la exportación necesita de una carta. */
export interface ExportCardRef {
  readonly id: number;
  readonly name: string;
  readonly card?: string | null;
}

/** Equivalencia de proxy resuelta desde el bundle de recursos. */
export interface ProxyEntry {
  readonly name: string;
  readonly set: string;
  readonly number: string;
}

export interface MissingExport {
  readonly id: number;
  readonly name: string;
  readonly card: string | null;
}

export interface BatchExportResult {
  /** Lista lista para pegar en «List input» de Limitless. */
  readonly text: string;
  /** Cantidad de cartas efectivamente exportadas. */
  readonly count: number;
  readonly missing: readonly MissingExport[];
}

/** Resuelve la impresión (`card`) a su entrada de proxy, o `null`. */
export type ProxyLookup = (printId: string) => ProxyEntry | null | undefined;

export function plan(
  groups: readonly (readonly ExportCardRef[])[],
  lookup: ProxyLookup,
): BatchExportResult {
  const missing: MissingExport[] = [];
  const blocks: string[] = [];
  let count = 0;

  for (const group of groups) {
    const lines: string[] = [];

    for (const card of group) {
      const proxy = card.card ? lookup(card.card) : null;
      if (!proxy) {
        missing.push({ id: card.id, name: card.name, card: card.card || null });
        continue;
      }

      lines.push(`1 ${proxy.name} ${proxy.set} ${proxy.number}`);
      count++;
    }

    if (lines.length) blocks.push(lines.join('\n'));
  }

  return { text: blocks.join('\n\n'), count, missing };
}

/**
 * Variante para el formato plano de `data/proxies.json`
 * (`printId -> {name,set,number}`), útil en tests y en la capa de recursos.
 */
export function planFromProxies(
  groups: readonly (readonly ExportCardRef[])[],
  proxies: Readonly<Record<string, ProxyEntry | undefined>>,
): BatchExportResult {
  return plan(groups, (printId) => proxies[printId] ?? null);
}
