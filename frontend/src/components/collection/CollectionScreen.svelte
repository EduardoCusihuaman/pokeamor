<script lang="ts">
  import {
    appCollection,
    type CollectionApi,
    type CollectionFilter,
  } from '@/application/collection.svelte';
  import { appNavigation } from '@/application/navigation.svelte';
  import type { Card } from '@/domain/catalog';
  import CollectionGrid from '@/components/collection/CollectionGrid.svelte';

  interface FilterTab {
    readonly value: CollectionFilter;
    readonly label: string;
  }

  const FILTERS: readonly FilterTab[] = [
    { value: 'all', label: 'Todas' },
    { value: 'yes', label: 'Favoritas' },
    { value: 'no', label: 'Pasadas' },
    { value: 'pending', label: 'Por descubrir' },
    { value: 'top', label: 'Finalistas' },
  ];

  const EMPTY_BY_FILTER: Readonly<Record<CollectionFilter, string>> = {
    all: 'Todavía no descubriste ninguna carta.',
    yes: 'Tu primer flechazo empieza con una carta.',
    no: 'No pasaste ninguna carta.',
    pending: 'No quedan cartas por descubrir.',
    top: 'Tus finalistas aparecen después de los duelos.',
  };

  interface Props {
    /** Instancia inyectable; la app usa la compartida. */
    readonly collection?: CollectionApi;
    /** Vuelve a descubrimiento. */
    readonly onBack?: () => void;
    /** Abre el detalle de una carta. El detalle llega en otra fase. */
    readonly onOpenCard?: (card: Card) => void;
  }

  let {
    collection = appCollection,
    onBack = () => appNavigation.go('discovery'),
    onOpenCard,
  }: Props = $props();

  const loading = $derived(collection.loading && collection.total === 0);
  const filterLabel = $derived(
    FILTERS.find((tab) => tab.value === collection.filter)?.label ?? 'Todas',
  );
  const summary = $derived(
    `${collection.favorites.length} favoritos · ` +
      `${collection.progress.discovered} de ${collection.progress.total} descubiertas · ` +
      `${collection.batches.groups.length} tandas`,
  );
  const resultText = $derived(
    `${collection.resultCount} ${collection.resultCount === 1 ? 'carta' : 'cartas'} en ${filterLabel}`,
  );
</script>

<section class="collection-screen" aria-labelledby="collection-title">
  <header class="screen-header">
    <button type="button" class="back" aria-label="Volver a descubrir" onclick={onBack}>
      <span aria-hidden="true">←</span>
    </button>

    <div class="heading">
      <p class="eyebrow">Tu álbum</p>
      <h1 id="collection-title">Tu colección</h1>
      {#if collection.total > 0}
        <p class="summary">{summary}</p>
      {/if}
    </div>
  </header>

  <div class="filters" role="group" aria-label="Filtrar la colección">
    {#each FILTERS as tab (tab.value)}
      <button
        type="button"
        class="filter"
        aria-pressed={collection.filter === tab.value}
        onclick={() => collection.setFilter(tab.value)}
      >
        <span>{tab.label}</span>
        <span class="count" aria-hidden="true">{collection.counts[tab.value]}</span>
      </button>
    {/each}
  </div>

  <p class="results" role="status">{resultText}</p>

  {#if loading}
    <p class="state" role="status">Cargando cartas…</p>
  {:else if collection.filteredCards.length === 0}
    <p class="state">{EMPTY_BY_FILTER[collection.filter]}</p>
  {:else}
    <CollectionGrid cards={collection.visibleCards} onOpen={onOpenCard} />

    {#if collection.hasMore}
      <button
        type="button"
        class="more"
        aria-label="Ver más cartas"
        onclick={() => collection.showMore()}
      >
        Ver más
      </button>
    {/if}
  {/if}
</section>

<style>
  .collection-screen {
    display: grid;
    gap: var(--space-4);
    width: min(100%, 56rem);
    padding: var(--space-8) var(--space-6);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    box-shadow: 0 1rem 2.5rem rgb(43 29 36 / 12%);
  }

  .screen-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--space-3);
  }

  .back {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    border: 1px solid rgb(43 29 36 / 14%);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-muted);
    font-size: 1.25rem;
    line-height: 1;
    transition:
      background-color var(--motion-fast) ease-in-out,
      border-color var(--motion-fast) ease-in-out;
  }

  .back:hover {
    border-color: var(--color-accent);
    background: rgb(43 29 36 / 6%);
  }

  .heading {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
  }

  .eyebrow {
    color: var(--color-muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.75rem, 6vw, 2.5rem);
    line-height: 1.1;
  }

  .summary {
    color: var(--color-muted);
    font-size: 0.875rem;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .filter {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 2.75rem;
    padding: var(--space-2) var(--space-4);
    border: 1px solid rgb(43 29 36 / 14%);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-muted);
    font-size: 0.875rem;
    font-weight: 600;
    transition:
      background-color var(--motion-fast) ease-in-out,
      border-color var(--motion-fast) ease-in-out,
      color var(--motion-fast) ease-in-out;
  }

  .filter:hover {
    border-color: var(--color-accent);
  }

  .filter[aria-pressed='true'] {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-surface);
  }

  .count {
    min-width: 1.5rem;
    padding-inline: var(--space-1);
    border-radius: var(--radius-pill);
    background: rgb(43 29 36 / 8%);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .filter[aria-pressed='true'] .count {
    background: rgb(255 255 255 / 24%);
  }

  .results {
    margin-block-start: calc(var(--space-1) * -1);
    color: var(--color-muted);
    font-size: 0.8125rem;
  }

  .state {
    display: grid;
    place-items: center;
    min-height: 12rem;
    color: var(--color-muted);
    text-align: center;
  }

  .more {
    justify-self: center;
    min-height: 2.75rem;
    padding: var(--space-2) var(--space-6);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-accent-strong);
    font-weight: 600;
    transition: background-color var(--motion-fast) ease-in-out;
  }

  .more:hover {
    background: rgb(214 85 122 / 10%);
  }

  @media (prefers-reduced-motion: reduce) {
    .back,
    .filter,
    .more {
      transition: none;
    }
  }
</style>
