// Migrado de tests/13-card-identity.test.mjs — identidad inmutable de presentación.
// El cuarto caso legacy (`hydrateViewer`) ejercitaba `src/app.js`, no este módulo;
// su cobertura corresponde a la migración de la capa de aplicación.
import { describe, expect, it } from 'vitest';

import {
  createCardIdentity,
  type CardIdentityApi,
  type CardIdentityRef,
  type IdentitySource,
} from '../../src/domain/cards/identity';

/** Resuelve y falla de forma explícita si no hay identidad. */
function resolveOrThrow(api: CardIdentityApi, source: IdentitySource): CardIdentityRef {
  const ref = api.resolve(source);
  if (!ref) throw new Error('Se esperaba una identidad resuelta');
  return ref;
}

const api = createCardIdentity();

describe('card identity', () => {
  it('separates language, print and resource revision', () => {
    const source: IdentitySource = {
      card: 'a',
      image: 'https://assets.tcgdex.net/es/a/high.webp',
    };
    const ref = resolveOrThrow(api, source);

    expect(Object.isFrozen(ref)).toBe(true);
    expect(api.resolve(source)).toBe(ref);
    expect(ref.language).toBe('es');
    expect(ref.revision).toBe('https://assets.tcgdex.net/es/a/high.webp');

    const changes: readonly IdentitySource[] = [
      { ...source, language: 'en' },
      { ...source, card: 'b' },
      { ...source, resourceRevision: '2' },
    ];
    for (const change of changes) {
      expect(api.key(change)).not.toBe(ref.key);
    }

    expect(ref.thumbnail).toBe('https://assets.tcgdex.net/es/a/low.webp');
  });

  it('keeps identity stable per source object while the key ignores object identity', () => {
    const first = resolveOrThrow(api, { card: 'x', image: '/x.webp' });
    const second = resolveOrThrow(api, { card: 'x', image: '/x.webp' });

    expect(first).not.toBe(second);
    expect(first.key).toBe(second.key);
    expect(first.key).toBe(JSON.stringify(['x', 'source', '/x.webp']));
  });

  it('material front and thumbnail preserve explicit assigned print, ignoring alternate fallback', () => {
    const ref = resolveOrThrow(api, {
      card: 'a',
      image: 'https://assets.tcgdex.net/es/a/high.webp',
      fallbackImage: 'https://wrong/b.webp',
      surface: { effect: 'asset-foil', assets: { front: '/materials/a/front.png' } },
    });

    expect(ref.image).toBe('/materials/a/front.png');
    expect(ref.thumbnail).toBe('https://assets.tcgdex.net/es/a/low.webp');
  });

  it('freezes the material snapshot only for asset-foil surfaces', () => {
    const ref = resolveOrThrow(api, {
      card: 'm',
      image: '/m/high.webp',
      surface: { effect: 'asset-foil', assets: { front: '/m/front.png', foil: '/m/foil.png' } },
    });

    expect(ref.material).toEqual({
      effect: 'asset-foil',
      assets: { front: '/m/front.png', foil: '/m/foil.png' },
    });
    expect(Object.isFrozen(ref.material)).toBe(true);
    expect(Object.isFrozen(ref.material?.assets)).toBe(true);

    const plain = resolveOrThrow(api, {
      card: 'n',
      image: '/n/high.webp',
      surface: { effect: 'none' },
    });
    expect(plain.material).toBeNull();
  });

  it('resolves absent sources and missing images without inventing values', () => {
    expect(api.resolve(null)).toBeNull();
    expect(api.resolve(undefined)).toBeNull();
    expect(api.key(null)).toBeUndefined();

    const ref = resolveOrThrow(api, { card: 'z' });
    expect(ref).toMatchObject({
      print: 'z',
      language: 'source',
      revision: 'missing',
      image: null,
      thumbnail: null,
      material: null,
      proxy: null,
    });
  });

  it('large carousel keeps a bounded window including current and edges', () => {
    for (const index of [0, 1, 500, 1024]) {
      const indices = api.windowIndices(1025, index);

      expect(indices.length).toBeLessThanOrEqual(5);
      expect(indices).toContain(index);
      expect(indices.every((value) => value >= 0 && value < 1025)).toBe(true);
    }

    expect(api.windowIndices(1025, 0)).toEqual([0, 1, 2, 3]);
    expect(api.windowIndices(1025, 1024)).toEqual([1023, 1024]);
  });

  it('wires proxies through the injected resource lookup', () => {
    const proxy = { set: 'SCR', number: '143', name: 'Bulbasaur' };
    const withProxy = createCardIdentity((print) => (print === 'sv07-143' ? proxy : null));

    expect(resolveOrThrow(withProxy, { card: 'sv07-143', image: '/x.webp' }).proxy).toBe(proxy);
    expect(resolveOrThrow(withProxy, { card: 'other', image: '/x.webp' }).proxy).toBeNull();
    // La instancia compartida no tiene recursos instalados en esta prueba.
    expect(resolveOrThrow(api, { card: 'sv07-143', image: '/x.webp' }).proxy).toBeNull();
  });

  it('install indexes species, prints and locales for the installed revision', () => {
    const identity = createCardIdentity();
    const first: IdentitySource = {
      id: 1,
      name: 'Bulbasaur',
      card: 'a',
      image: 'https://assets.tcgdex.net/es/a/high.webp',
    };
    const catalog: readonly IdentitySource[] = [
      first,
      {
        id: 2,
        name: 'Ivysaur',
        card: 'b',
        image: '/b.webp',
      },
    ];

    expect(identity.getRevision()).toBe('initial');
    identity.install(catalog, 'rev-1');
    expect(identity.getRevision()).toBe('rev-1');

    const species = identity.getSpecies(1);
    const principal = JSON.stringify(['a', 'es', 'https://assets.tcgdex.net/es/a/high.webp']);
    expect(species).toEqual({ id: 1, name: 'Bulbasaur', principal });
    expect(Object.isFrozen(species)).toBe(true);
    if (!species) throw new Error('Falta la especie instalada');

    const print = identity.getPrint('a');
    expect(print).toEqual({ id: 'a' });
    expect(Object.isFrozen(print)).toBe(true);

    const locale = identity.getLocale(principal);
    expect(locale).toBe(identity.resolve(first));
    expect(identity.getLocale('missing')).toBeUndefined();
    expect(identity.getSpecies(2)?.name).toBe('Ivysaur');
  });

  it('install replaces the previous revision atomically', () => {
    const identity = createCardIdentity();
    identity.install([{ id: 1, name: 'Bulbasaur', card: 'a', image: '/a.webp' }], 'rev-1');
    const previous = identity.getSpecies(1);
    const previousKey = previous?.principal;
    if (!previousKey) throw new Error('Falta la identidad principal');

    identity.install([{ id: 3, name: 'Venusaur', card: 'c', image: '/c.webp' }], 'rev-2');

    expect(identity.getRevision()).toBe('rev-2');
    expect(identity.getSpecies(1)).toBeUndefined();
    expect(identity.getPrint('a')).toBeUndefined();
    expect(identity.getLocale(previousKey)).toBeUndefined();
    expect(identity.getSpecies(3)?.name).toBe('Venusaur');
  });

  it('rejects invalid catalog revisions', () => {
    const identity = createCardIdentity();

    expect(() => identity.install(null, 'rev')).toThrow('Invalid catalog revision');
    expect(() => identity.install({}, 'rev')).toThrow('Invalid catalog revision');
    expect(() => identity.install([], '')).toThrow('Invalid catalog revision');
  });
});
