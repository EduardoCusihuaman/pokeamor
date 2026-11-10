<script lang="ts">
  import { onMount } from 'svelte';

  import {
    appCollection,
    COLLECTION_BATCH_SIZE,
    type CollectionApi,
    type CollectionFilter,
  } from '@/application/collection.svelte';
  import { appNavigation } from '@/application/navigation.svelte';
  import type { Card } from '@/domain/catalog';
  import CollectionGrid from '@/components/collection/CollectionGrid.svelte';
  import '@/styles/collection.css';

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

  /** Vista interna: la galería de elegidos o las tandas de 15. */
  type CollectionView = 'rounds' | 'liked';

  interface Props {
    /** Instancia inyectable; la app usa la compartida. */
    readonly collection?: CollectionApi;
    /** Vuelve a descubrimiento. */
    readonly onBack?: () => void;
    /** Abre el detalle de una carta. El detalle llega en otra fase. */
    readonly onOpenCard?: (card: Card) => void;
    /** Abre ajustes y respaldo. */
    readonly onSettings?: () => void;
  }

  let {
    collection = appCollection,
    onBack = () => appNavigation.go('discovery'),
    onOpenCard,
    onSettings = () => appNavigation.go('settings'),
  }: Props = $props();

  // El legacy abre en tandas; acá la entrada prioriza la galería de elegidos
  // (el título y los filtros), y "Tus tandas" queda a un toque.
  let view = $state<CollectionView>('liked');

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

  function placeholders(count: number): number[] {
    return count > 0 ? Array.from({ length: count }, (_, index) => index) : [];
  }

  function showRounds(): void {
    view = 'rounds';
  }

  function showLiked(): void {
    view = 'liked';
  }

  function chooseTeam(): void {
    view = 'liked';
    collection.setFilter('yes');
  }

  onMount(() => {
    // El sheet es un overlay a pantalla completa: el documento no debe scrollear
    // por detrás. Se restaura exactamente el valor previo al desmontar.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });
</script>

<section
  class="sheet open"
  class:rounds-mode={view === 'rounds'}
  id="sheet"
  aria-labelledby="collection-title"
>
  <div class="inner">
    <header class="collection-header">
      <button type="button" class="close" aria-label="Volver a las cartas" onclick={onBack}>
        <span aria-hidden="true">←</span>
      </button>

      <span role="heading" aria-level={1}>Tu colección</span>

      <button
        type="button"
        class="close settings-icon"
        aria-label="Ajustes y respaldo"
        onclick={onSettings}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h9m4 0h3M4 17h3m4 0h9" />
          <circle cx="15" cy="7" r="2" />
          <circle cx="9" cy="17" r="2" />
        </svg>
      </button>
    </header>

    <nav class="collection-switch" aria-label="Vistas de la colección">
      <button
        type="button"
        class:selected={view === 'rounds'}
        aria-pressed={view === 'rounds'}
        onclick={showRounds}
      >
        Tus tandas
      </button>
      <button
        type="button"
        class:selected={view === 'liked'}
        aria-pressed={view === 'liked'}
        onclick={showLiked}
      >
        Tus elegidos
      </button>
    </nav>

    <h2 class="collection-title" id="collection-title">Tus elegidos.</h2>
    <p class="muted" id="summary">{summary}</p>

    {#if view === 'rounds'}
      {#if collection.batches.groups.length === 0}
        <p class="muted">Todavía no completaste tu primera tanda.</p>
      {:else}
        <section class="memories-section" aria-label="Tus tandas">
          {#each collection.batches.groups as group, index (index)}
            <section
              class="batch-group"
              class:active-batch={group.length < COLLECTION_BATCH_SIZE}
              data-batch={index}
            >
              <h3 class="batch-title">
                <span>Tanda {index + 1}</span>
                <span>{group.length} / {COLLECTION_BATCH_SIZE}</span>
              </h3>

              <div class="batch-grid">
                {#each group as card (card.id)}
                  <button
                    type="button"
                    class="memory-card"
                    data-pokemon={card.id}
                    aria-label={`Ver ${card.name}`}
                    onclick={() => onOpenCard?.(card)}
                  >
                    <img
                      src={card.image}
                      alt={`Carta de ${card.name}`}
                      width="245"
                      height="342"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                {/each}

                {#each placeholders(COLLECTION_BATCH_SIZE - group.length) as slot (slot)}
                  <span class="batch-placeholder" aria-hidden="true">+</span>
                {/each}
              </div>
            </section>
          {/each}
        </section>
      {/if}
    {:else}
      <div class="tabs" role="group" aria-label="Filtrar la colección">
        {#each FILTERS as tab (tab.value)}
          <button
            type="button"
            class="pill"
            class:selected={collection.filter === tab.value}
            aria-pressed={collection.filter === tab.value}
            aria-label={tab.label}
            onclick={() => collection.setFilter(tab.value)}
          >
            <span>{tab.label}</span>
            <span class="pill-count" aria-hidden="true">{collection.counts[tab.value]}</span>
          </button>
        {/each}
      </div>

      <p class="collection-results" role="status">{resultText}</p>

      {#if loading}
        <div class="grid grid-empty">
          <p class="muted" role="status">Cargando cartas…</p>
        </div>
      {:else if collection.filteredCards.length === 0}
        <div class="grid grid-empty">
          <p class="muted">{EMPTY_BY_FILTER[collection.filter]}</p>
        </div>
      {:else}
        <CollectionGrid cards={collection.visibleCards} onOpen={onOpenCard} />

        {#if collection.hasMore}
          <button
            type="button"
            class="pill"
            id="gallery-more"
            aria-label="Ver más cartas"
            onclick={() => collection.showMore()}
          >
            Ver más
          </button>
        {/if}
      {/if}
    {/if}

    <div class="collection-dock">
      <button type="button" disabled={collection.team.length === 0} onclick={chooseTeam}>
        Elegir mi equipo <span aria-hidden="true">↗</span>
      </button>
    </div>
  </div>
</section>
