/**
 * Exportación de proxies (migrado de `tests/16-proxy.test.cjs`).
 *
 * Se preservan las dos aserciones del legacy: la exportación usa la impresión
 * exacta y bloquea la copia si falta algún código de Limitless; dos
 * impresiones de la misma especie permanecen independientes y ordenadas.
 */

import { describe, expect, it } from 'vitest';

import { debugProxyText, type DebugPrint } from '@/application/export';
import type { ProxyEntry } from '@/domain/collection/batch-export';

function print(pokemonId: number, printId: string): DebugPrint {
  return { pokemonId, printId };
}

describe('debug proxy export', () => {
  it('exports the exact print and blocks copy when a mapping is missing', () => {
    const ids = new Set(['swsh10.5-076', 'sv08.5-146']);
    const prints = new Map<string, DebugPrint>([
      ['swsh10.5-076', { pokemonId: 149, printId: 'swsh10.5-076', name: 'Dragonite' }],
      ['sv08.5-146', { pokemonId: 136, printId: 'sv08.5-146', name: 'Flareon' }],
    ]);
    const lookup = (printId: string): ProxyEntry | null =>
      printId === 'sv08.5-146'
        ? { name: 'Flareon ex', set: 'PRE', number: '146' }
        : { name: 'Dragonite V', set: 'PGO', number: '76' };

    expect(debugProxyText(ids, prints, lookup)).toBe('1 Flareon ex PRE 146\n1 Dragonite V PGO 76');
    expect(() => debugProxyText(ids, prints, () => null)).toThrow(/2 sin código/);
  });

  it('keeps two prints of the same species independent', () => {
    const prints = new Map<string, DebugPrint>([
      ['b', print(1, 'b')],
      ['a', print(1, 'a')],
    ]);
    const lookup = (printId: string): ProxyEntry => ({
      name: 'Bulbasaur',
      set: 'SET',
      number: printId,
    });

    expect(debugProxyText(new Set(['b', 'a']), prints, lookup)).toBe(
      '1 Bulbasaur SET a\n1 Bulbasaur SET b',
    );
  });
});
