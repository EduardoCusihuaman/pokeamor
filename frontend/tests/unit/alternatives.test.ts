/**
 * Alternativas curadas (migrado de `tests/15-alternatives.test.cjs`).
 *
 * Se conservan las tres aserciones del legacy: la carta alternativa descarta
 * los metadatos de la impresión heredada, la aplicación no busca metadatos en
 * runtime ni mantiene un mapa alternativo, y los datos curados siguen acotados
 * y con proxy para cada impresión.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { makeAlternativeCard } from '@/application/export';

interface CuratedRow {
  readonly printId: string;
  readonly technicalCheck: { readonly imageDecoded: boolean };
}

interface CuratedAlternatives {
  readonly pokemon: Readonly<Record<string, readonly CuratedRow[]>>;
}

interface CatalogEntry {
  readonly id: number;
  readonly card: string;
}

interface ProxyEntry {
  readonly name: string;
  readonly set: string;
  readonly number: string;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T;
}

describe('alternative cards', () => {
  it('clears inherited print metadata', () => {
    const source = {
      id: 1,
      name: 'Bulbasaur',
      card: 'old',
      surface: {},
      proxy: {},
    };

    const card = makeAlternativeCard(source, ['new', 'https://example.test/new', 'IR', 'Artist']);

    expect(card.card).toBe('new');
    expect(card.surface).toBeNull();
    expect((card as unknown as Record<string, unknown>).proxy).toBeUndefined();
    expect(card.image).toBe(card.fallbackImage);
  });

  it('has no runtime metadata searches or legacy alternative map', () => {
    const applicationModules = [
      readFileSync(new URL('../../src/application/export.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../../src/application/debug.ts', import.meta.url), 'utf8'),
    ];

    for (const source of applicationModules) {
      expect(source).not.toContain('api.tcgdex.net');
      expect(source).not.toContain('alternateCards');
    }
  });

  it('has bounded curated data with matching proxies', () => {
    const catalog = readJson<readonly CatalogEntry[]>('../../../data/catalog.json');
    const curated = readJson<CuratedAlternatives>('../../../data/alternatives-curated.json');
    const proxies = readJson<Readonly<Record<string, ProxyEntry>>>('../../../data/proxies.json');

    for (const [id, rows] of Object.entries(curated.pokemon)) {
      expect(rows.length).toBeLessThanOrEqual(3);
      expect(new Set(rows.map((row) => row.printId)).size).toBe(rows.length);

      const base = catalog.find((entry) => entry.id === Number(id));
      expect(base).toBeDefined();
      if (!base) throw new Error(`Especie ${id} ausente del catálogo`);

      for (const row of rows) {
        expect(row.printId).not.toBe(base.card);
        expect(row.technicalCheck.imageDecoded).toBeTruthy();
        expect(proxies[row.printId]).toBeTruthy();
      }
    }
  });
});
