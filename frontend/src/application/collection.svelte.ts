/**
 * Estado de colección/álbum (plan §5.1/§5.2 y §9).
 *
 * Es una vista derivada sobre la **misma sesión de descubrimiento**: por
 * defecto lee `appDiscovery`, de modo que los votos registrados al descubrir
 * aparecen acá sin copiar ni duplicar el estado. También acepta una fuente
 * estructural inyectada para pruebas y para futuras vistas.
 *
 * Convenciones:
 * - `$state` para el filtro activo y el tamaño visible de la galería.
 * - `$derived` para favoritos, filtros, tandas, equipo y progreso.
 * - El catálogo se lee como `$state.raw` desde la fuente; nunca se muta.
 * - Las reglas de progreso/tandas/equipo viven en el dominio
 *   (`@/domain/collection/journey`) y la afinidad de duelos en
 *   `@/domain/collection/preference`.
 *
 * Orden de cada filtro (documentado porque la fase 4 no migró todavía el
 * orden adaptativo del recomendador):
 * - `all`: cartas descubiertas en el orden del historial/votos.
 * - `yes`: favoritos por afinidad (misma base que equipo y playmat).
 * - `no`: cartas pasadas en el orden de descubrimiento.
 * - `pending`: cartas del catálogo sin voto.
 * - `top`: favoritos que participaron en duelos, ordenados por afinidad.
 */

import { appDiscovery } from '@/application/discovery.svelte';
import type { SessionState, Vote } from '@/application/sync';
import { cardResources } from '@/domain/cards/resources';
import type { Card } from '@/domain/catalog';
import { plan, type BatchExportResult, type ProxyLookup } from '@/domain/collection/batch-export';
import {
  BATCH_SIZE,
  TEAM_SIZE,
  batches as computeBatches,
  celebration,
  discoveries,
  favorites as favoriteCards,
  progress as journeyProgress,
  team as journeyTeam,
  type BatchComputation,
  type JourneyProgress,
  type JourneyReward,
  type JourneyState,
} from '@/domain/collection/journey';
import { model, type Comparison } from '@/domain/collection/preference';

export type CollectionFilter = 'all' | 'yes' | 'no' | 'pending' | 'top';

/**
 * Vista superior del sheet. El legacy abre en `rounds` ("Tus tandas"): el
 * álbum de tandas de 15 con un único slot «+» al final. `settings` abre el
 * panel de ajustes dentro de la colección.
 */
export type CollectionMode = 'rounds' | 'settings';

export const COLLECTION_FILTERS: readonly CollectionFilter[] = [
  'all',
  'yes',
  'no',
  'pending',
  'top',
];

/**
 * Fuente estructural de la colección. `DiscoveryApi` la satisface, así que la
 * app comparte la sesión de descubrimiento sin adaptadores.
 */
export interface CollectionSource {
  readonly catalog: readonly Card[];
  readonly votes: Readonly<Record<string, Vote>>;
  readonly session: SessionState;
  readonly status?: 'idle' | 'loading' | 'ready' | 'error';
}

export interface CollectionOptions {
  /** Fuente de catálogo/votos/sesión. Por defecto `appDiscovery`. */
  readonly source?: CollectionSource;
  /** Cartas que muestra la galería antes de "Ver más". Por defecto 40 (legacy). */
  readonly pageSize?: number;
  /** Impresiones para «Copiar tandas». Por defecto `cardResources`. */
  readonly lookupProxy?: ProxyLookup;
}

export interface CollectionApi {
  /** Vista activa del sheet; arranca en `rounds`, como el legacy. */
  readonly mode: CollectionMode;
  readonly filter: CollectionFilter;
  readonly visibleCount: number;
  readonly pageSize: number;
  readonly loading: boolean;
  /** Cartas del catálogo. */
  readonly total: number;
  /** Cartas que coinciden con el filtro activo. */
  readonly resultCount: number;
  readonly counts: Readonly<Record<CollectionFilter, number>>;
  readonly filteredCards: readonly Card[];
  readonly visibleCards: readonly Card[];
  readonly favorites: readonly Card[];
  readonly batches: BatchComputation<Card>;
  readonly team: readonly Card[];
  readonly progress: JourneyProgress;
  /** Recompensas pendientes según `celebration`; la UI decide cuándo mostrarlas. */
  readonly rewards: readonly JourneyReward[];
  readonly hasMore: boolean;
  /** Favoritos elegidos: el `N` del contador `N / total · M tandas`. */
  readonly seenCount: number;
  /** Tandas no vacías que muestra el álbum (el `M` del contador). */
  readonly tandaCount: number;
  setMode(mode: CollectionMode): void;
  setFilter(filter: CollectionFilter): void;
  showMore(): void;
  resetVisible(): void;
  /**
   * Genera las líneas de Limitless para todas las tandas o para una sola.
   * No toca el portapapeles: la presentación decide cómo copiar el texto.
   */
  exportTandas(group?: number): BatchExportResult;
}

/**
 * Convierte las comparaciones persistidas (`ComparisonRecord`) en las
 * comparaciones válidas que consume el modelo de preferencia. Los registros
 * incompletos se ignoran en lugar de romper el ajuste.
 */
function preferenceComparisons(session: SessionState): Comparison[] {
  const comparisons: Comparison[] = [];

  for (const record of session.comparisons ?? []) {
    const ids = record.ids;
    if (!ids || ids.length !== 2) continue;

    const first = ids[0];
    const second = ids[1];
    if (first === undefined || second === undefined) continue;

    const winner = record.winner;
    if (winner !== 0 && winner !== 1 && winner !== 2) continue;

    comparisons.push({ id: record.id, ids: [first, second], winner });
  }

  return comparisons;
}

/**
 * Crea una instancia aislada del estado de colección.
 *
 * Es una fábrica (no un singleton) para que las pruebas y futuras vistas
 * inyecten su propia fuente; la app usa `appCollection`.
 */
export function createCollection(options: CollectionOptions = {}): CollectionApi {
  const source: CollectionSource = options.source ?? appDiscovery;
  const pageSize = Math.max(1, options.pageSize ?? 40);
  const lookupProxy: ProxyLookup =
    options.lookupProxy ?? ((printId) => cardResources.getProxy(printId));

  let mode = $state<CollectionMode>('rounds');
  let filter = $state<CollectionFilter>('yes');
  let visibleCount = $state(pageSize);

  const session = $derived(source.session);
  const journeyState = $derived({
    votes: source.votes,
    comparisons: preferenceComparisons(session),
  } satisfies JourneyState);

  const favorites = $derived(favoriteCards(source.catalog, journeyState));
  const discovered = $derived(discoveries(source.catalog, journeyState));
  const pendingCards = $derived(source.catalog.filter((card) => !source.votes[String(card.id)]));
  const passed = $derived(
    discovered.filter((card) => source.votes[String(card.id)]?.value === 'no'),
  );
  const fitted = $derived(model(journeyState));
  const top = $derived(
    favorites
      .filter((card) => (session.ratings[String(card.id)]?.played ?? 0) > 0)
      .sort((a, b) => fitted.score(b.id) - fitted.score(a.id) || a.id - b.id),
  );

  const grouped = $derived(computeBatches(source.catalog, journeyState));
  const teamIds = $derived(journeyTeam(source.catalog, journeyState));
  const team = $derived(
    teamIds.flatMap((id) => {
      const card = source.catalog.find((candidate) => candidate.id === id);
      return card ? [card] : [];
    }),
  );
  const progress = $derived(journeyProgress(source.catalog, journeyState, grouped.groups));
  const rewards = $derived(celebration(source.catalog, journeyState, grouped.groups).rewards);

  // El contador del legacy cuenta favoritos (no descubiertas) y las tandas que
  // el álbum muestra; el catálogo completo queda como denominador.
  const seenCount = $derived(favorites.length);
  const tandaCount = $derived(grouped.groups.length);

  const counts: Readonly<Record<CollectionFilter, number>> = $derived({
    all: discovered.length,
    yes: favorites.length,
    no: passed.length,
    pending: pendingCards.length,
    top: top.length,
  });

  const filteredCards = $derived.by((): readonly Card[] => {
    switch (filter) {
      case 'all':
        return discovered;
      case 'yes':
        return favorites;
      case 'no':
        return passed;
      case 'pending':
        return pendingCards;
      case 'top':
        return top;
    }
  });

  const visibleCards = $derived(filteredCards.slice(0, visibleCount));

  function setMode(next: CollectionMode): void {
    mode = next;
  }

  function setFilter(next: CollectionFilter): void {
    filter = next;
    visibleCount = pageSize;
  }

  function showMore(): void {
    if (filteredCards.length > visibleCount) visibleCount += pageSize;
  }

  function resetVisible(): void {
    visibleCount = pageSize;
  }

  /**
   * Las tandas del dominio ya están ordenadas de la más antigua a la más
   * reciente, así que se exportan en ese mismo orden (el legacy invertía la
   * lista porque la dibujaba al revés).
   */
  function exportTandas(group?: number): BatchExportResult {
    if (group === undefined) return plan(grouped.groups, lookupProxy);
    const single = grouped.groups[group];
    return plan(single ? [single] : [], lookupProxy);
  }

  return {
    get mode() {
      return mode;
    },
    get filter() {
      return filter;
    },
    get visibleCount() {
      return visibleCount;
    },
    get pageSize() {
      return pageSize;
    },
    get loading() {
      return source.status === 'idle' || source.status === 'loading';
    },
    get total() {
      return source.catalog.length;
    },
    get resultCount() {
      return filteredCards.length;
    },
    get counts() {
      return counts;
    },
    get filteredCards() {
      return filteredCards;
    },
    get visibleCards() {
      return visibleCards;
    },
    get favorites() {
      return favorites;
    },
    get batches() {
      return grouped;
    },
    get team() {
      return team;
    },
    get progress() {
      return progress;
    },
    get rewards() {
      return rewards;
    },
    get hasMore() {
      return filteredCards.length > visibleCards.length;
    },
    get seenCount() {
      return seenCount;
    },
    get tandaCount() {
      return tandaCount;
    },
    setMode,
    setFilter,
    showMore,
    resetVisible,
    exportTandas,
  };
}

/** Instancia compartida que monta la app; lee la sesión de `appDiscovery`. */
export const appCollection: CollectionApi = createCollection();

/** Tamaño de tanda expuesto para etiquetas de la UI. */
export const COLLECTION_BATCH_SIZE = BATCH_SIZE;
/** Tamaño del equipo expuesto para etiquetas de la UI. */
export const COLLECTION_TEAM_SIZE = TEAM_SIZE;
