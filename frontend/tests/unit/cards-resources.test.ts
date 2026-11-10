// Migrado de tests/14-card-resources.test.cjs — carga perezosa y direccionada por contenido.
import { describe, expect, it } from 'vitest';

import {
  createCardResources,
  type CardResourcesManifest,
  type ResourceFetcher,
} from '../../src/domain/cards/resources';

const MANIFEST: CardResourcesManifest = {
  dataVersion: 'v',
  alternatives: '/a',
  proxies: '/p',
};

const PROXIES = {
  schema: 1,
  dataVersion: 'v',
  sets: ['PGO'],
  prints: { id: [0, '76', 'Dragonite V'] },
};

const ALTERNATIVES = {
  schema: 1,
  dataVersion: 'v',
  pokemon: { '1': [['a', 'https://assets.example/a.webp', 'Common', 'artist']] },
};

function setup(fetcher: ResourceFetcher) {
  return createCardResources({ manifest: MANIFEST, fetch: fetcher });
}

function respondsWith(payload: unknown, urls?: string[]): ResourceFetcher {
  return (url) => {
    urls?.push(url);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
  };
}

/** Bundle mínimo válido; se puede ajustar por campo en cada prueba. */
function validBundle(dataVersion = 'v2') {
  return {
    catalog: [
      { id: 1, card: 'a', image: '/a.webp' },
      { id: 2, card: 'b', image: '/b.webp' },
    ],
    manifest: {
      schema: 1 as const,
      dataVersion,
      alternatives: '/alternatives.json',
      proxies: '/proxies.json',
    },
    alternatives: {
      schema: 1,
      dataVersion,
      pokemon: { '1': [['a', 'https://assets.example/a.webp', 'Common', 'artist']] },
    },
    proxies: {
      schema: 1,
      dataVersion,
      sets: ['PGO'],
      prints: { id: [0, '76', 'Dragonite V'] },
    },
  };
}

describe('card resources', () => {
  it('lazy and concurrent deduplicated loads; memory reuse', async () => {
    let requests = 0;
    const urls: string[] = [];
    const api = setup((url) => {
      requests += 1;
      urls.push(url);
      return Promise.resolve({ ok: true, json: () => Promise.resolve(PROXIES) });
    });

    expect(requests).toBe(0);
    expect(api.getStatus()).toEqual({ alternatives: 'idle', proxies: 'idle' });

    const first = api.loadProxies();
    const second = api.loadProxies();
    expect(first).toBe(second);
    await first;
    await api.loadProxies();

    expect(requests).toBe(1);
    expect(urls).toEqual(['/p']);
    expect(api.getProxy('id')).toEqual({ set: 'PGO', number: '76', name: 'Dragonite V' });
    expect(api.getStatus().proxies).toBe('ready');
    expect(api.getStatus().alternatives).toBe('idle');
    expect(api.getProxy('missing')).toBeNull();
  });

  it('retries failed request independently', async () => {
    let requests = 0;
    const api = setup(() => {
      requests += 1;
      if (requests === 1) return Promise.reject(new Error('offline'));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...ALTERNATIVES, pokemon: {} }),
      });
    });

    await expect(api.loadAlternatives()).rejects.toThrow('offline');
    expect(api.getStatus().alternatives).toBe('error');

    await api.loadAlternatives();
    expect(requests).toBe(2);
    expect(api.getStatus().alternatives).toBe('ready');
    expect(api.getStatus().proxies).toBe('idle');
    expect(api.getAlternatives(1)).toEqual([]);
  });

  it('rejects mismatched version', async () => {
    const api = setup(respondsWith({ schema: 1, dataVersion: 'old', pokemon: {} }));

    await expect(api.loadAlternatives()).rejects.toThrow(/incompatible/);
    expect(api.getStatus().alternatives).toBe('error');
  });

  it('rejects payloads that do not match the documented shape', async () => {
    const badImage = setup(
      respondsWith({
        schema: 1,
        dataVersion: 'v',
        pokemon: { '1': [['a', 'http://insecure/a.webp', 'Common', 'artist']] },
      }),
    );
    await expect(badImage.loadAlternatives()).rejects.toThrow('Alternativa inválida');

    const tooMany = setup(
      respondsWith({
        schema: 1,
        dataVersion: 'v',
        pokemon: {
          '1': Array.from({ length: 4 }, (_, index) => [
            `a${index}`,
            'https://assets.example/a.webp',
            'Common',
            'artist',
          ]),
        },
      }),
    );
    await expect(tooMany.loadAlternatives()).rejects.toThrow('Alternativa inválida');

    const badProxy = setup(
      respondsWith({
        schema: 1,
        dataVersion: 'v',
        sets: ['PGO'],
        prints: { id: [4, '76', 'Dragonite V'] },
      }),
    );
    await expect(badProxy.loadProxies()).rejects.toThrow('Proxy inválido');

    const badSets = setup(
      respondsWith({ schema: 1, dataVersion: 'v', prints: { id: [0, '76', 'Dragonite V'] } }),
    );
    await expect(badSets.loadProxies()).rejects.toThrow('Proxies inválidos');
  });

  it('reports transport errors without marking the slot ready', async () => {
    const api = setup(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));

    await expect(api.loadProxies()).rejects.toThrow('No se pudo cargar el recurso');
    expect(api.getStatus().proxies).toBe('error');
  });

  it('aborts a stalled request through the injected signal', async () => {
    const api = createCardResources({
      manifest: MANIFEST,
      timeoutMs: 5,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });

    await expect(api.loadProxies()).rejects.toThrow('aborted');
    expect(api.getStatus().proxies).toBe('error');
  });

  it('installs a validated bundle eagerly and reuses memory without network', async () => {
    let requests = 0;
    const api = createCardResources({
      fetch: () => {
        requests += 1;
        return Promise.reject(new Error('no debería pedir'));
      },
    });

    api.installBundle(validBundle());

    expect(api.getStatus()).toEqual({ alternatives: 'ready', proxies: 'ready' });
    expect(api.getAlternatives(1)).toEqual([
      ['a', 'https://assets.example/a.webp', 'Common', 'artist'],
    ]);
    expect(api.getAlternatives(2)).toEqual([]);
    expect(api.getProxy('id')).toEqual({ set: 'PGO', number: '76', name: 'Dragonite V' });

    await expect(api.loadAlternatives()).resolves.toMatchObject({ dataVersion: 'v2' });
    await expect(api.loadProxies()).resolves.toMatchObject({ dataVersion: 'v2' });
    expect(requests).toBe(0);
  });

  it('rejects invalid bundles without publishing partial state', () => {
    const api = createCardResources();
    api.installBundle(validBundle());

    expect(() => api.installBundle(null)).toThrow('Invalid resource bundle');
    expect(() =>
      api.installBundle({
        ...validBundle('v3'),
        manifest: { schema: 2, dataVersion: 'v3' },
      }),
    ).toThrow('Invalid resource bundle');
    expect(() =>
      api.installBundle({
        ...validBundle('v3'),
        catalog: [
          { id: 1, card: 'a', image: '/a.webp' },
          { id: 1, card: 'b', image: '/b.webp' },
        ],
      }),
    ).toThrow('Invalid catalog');
    expect(() =>
      api.installBundle({
        ...validBundle('v3'),
        alternatives: { schema: 1, dataVersion: 'old', pokemon: {} },
      }),
    ).toThrow('Versión de recursos incompatible');

    // La instalación es atómica: el bundle válido anterior sigue vigente.
    expect(api.getStatus()).toEqual({ alternatives: 'ready', proxies: 'ready' });
    expect(api.getProxy('id')).toEqual({ set: 'PGO', number: '76', name: 'Dragonite V' });
  });
});
