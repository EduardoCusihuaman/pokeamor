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
  import CollectionTile from '@/components/collection/CollectionTile.svelte';
  import { albumIndex } from '@/components/collection/album-index';
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

  /** El legacy siempre dibuja una tanda activa, aunque esté vacía. */
  const EMPTY_GROUP: readonly Card[] = [];

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
    onSettings,
  }: Props = $props();

  let copyMessage = $state('');
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  const rounds = $derived(collection.mode === 'rounds');
  const loading = $derived(collection.loading && collection.total === 0);
  const displayGroups = $derived(
    (collection.batches.groups.length > 0 ? collection.batches.groups : [EMPTY_GROUP])
      .map((group, index) => ({ group, index }))
      .reverse(),
  );
  const nextBatch = $derived(
    collection.batches.groups.length > 0 &&
      collection.batches.groups.at(-1)?.length === COLLECTION_BATCH_SIZE,
  );
  const batchCardCount = $derived(
    collection.batches.groups.reduce((total, group) => total + group.length, 0),
  );
  const hasPending = $derived(collection.counts.pending > 0);
  const tandaLabel = $derived(
    collection.tandaCount === 1 ? '1 tanda' : `${collection.tandaCount} tandas`,
  );
  const filterLabel = $derived(
    FILTERS.find((tab) => tab.value === collection.filter)?.label ?? 'Todas',
  );
  const summary = $derived(
    `${collection.favorites.length} favoritos · ` +
      `${collection.progress.discovered} de ${collection.progress.total} descubiertas · ` +
      tandaLabel,
  );
  const resultText = $derived(
    `${collection.resultCount} ${collection.resultCount === 1 ? 'carta' : 'cartas'} en ${filterLabel}`,
  );

  function report(message: string): void {
    copyMessage = message;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyMessage = '';
      copyTimer = null;
    }, 2600);
  }

  async function copyTandas(group?: number): Promise<void> {
    try {
      const result = collection.exportTandas(group);
      if (result.count === 0) {
        report('No hay cartas para copiar.');
        return;
      }
      if (!navigator.clipboard) {
        report('No se pudo copiar.');
        return;
      }
      await navigator.clipboard.writeText(result.text);
      report(
        result.missing.length > 0
          ? `Copiadas ${result.count} cartas · ${result.missing.length} sin código`
          : `Copiadas ${result.count} cartas`,
      );
    } catch {
      report('No se pudo copiar.');
    }
  }

  function chooseTeam(): void {
    collection.setFilter('yes');
  }

  function openSettings(): void {
    collection.setMode(rounds ? 'settings' : 'rounds');
    onSettings?.();
  }

  onMount(() => {
    // El sheet es un overlay a pantalla completa: el documento no debe scrollear
    // por detrás. Se restaura exactamente el valor previo al desmontar.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      if (copyTimer) clearTimeout(copyTimer);
    };
  });
</script>

<section class="sheet open" class:rounds-mode={rounds} id="sheet" aria-labelledby="album-heading">
  <div class="inner">
    <header class="collection-header">
      <button
        type="button"
        class="close"
        aria-label={rounds ? 'Volver a las cartas' : 'Volver a las tandas'}
        onclick={() => (rounds ? onBack() : collection.setMode('rounds'))}
      >
        <span aria-hidden="true">←</span>
      </button>

      <span class="album-heading-wrap">
        <span id="album-heading" role="heading" aria-level={1}>
          {rounds ? 'Tu colección' : 'Ajustes y respaldo'}
        </span>
        {#if rounds}
          <small
            id="album-seen"
            aria-label={`${collection.seenCount} de ${collection.total} Pokémon te gustan`}
            data-batches={` · ${collection.tandaCount} tandas`}
          >
            {collection.seenCount} / {collection.total}
          </small>
        {/if}
      </span>

      <button
        type="button"
        class="close settings-icon"
        aria-label={rounds ? 'Abrir ajustes y respaldo' : 'Volver a tus tandas'}
        onclick={openSettings}
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
        class:selected={rounds}
        aria-pressed={rounds}
        onclick={() => collection.setMode('rounds')}
      >
        Tus tandas
      </button>
      <button
        type="button"
        class:selected={!rounds}
        aria-pressed={!rounds}
        onclick={() => collection.setMode('settings')}
      >
        Ajustes y respaldo
      </button>
    </nav>

    {#if rounds}
      <section class="memories-section" aria-label="Tus tandas">
        <div class="batch-export-bar" hidden={batchCardCount === 0}>
          <div class="batch-export-heading">
            <strong>Tus tandas</strong>
            <small>{collection.tandaCount} tandas · {batchCardCount} cartas</small>
          </div>
          <button
            type="button"
            class="batch-export"
            aria-label="Copiar tandas"
            disabled={batchCardCount === 0}
            onclick={() => void copyTandas()}
          >
            <i class="export-symbol"
              ><svg viewBox="0 0 24 24" aria-hidden="true"
                ><path
                  d="M8 8V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-4M4 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
                /></svg
              ></i
            >
            <span>Copiar tandas</span>
          </button>
        </div>

        <div class="round-memories">
          {#if nextBatch}<p class="next-batch">Próxima tanda · 0/15 ♡</p>{/if}
          {#each displayGroups as { group, index } (index)}
            <section
              class="batch-group"
              class:active-batch={group.length < COLLECTION_BATCH_SIZE}
              data-batch={index}
              aria-label={`Tanda ${index + 1}${
                group.length === COLLECTION_BATCH_SIZE
                  ? ', completa, 15 cartas'
                  : `, ${group.length} de 15 cartas`
              }`}
            >
              <h3>
                <button
                  type="button"
                  class="batch-export-one"
                  aria-label={`Copiar tanda ${index + 1}`}
                  disabled={group.length === 0}
                  onclick={() => void copyTandas(index)}
                >
                  <span class="batch-heading">
                    <strong class="batch-title">Tanda {index + 1}</strong>
                    {#if group.length < COLLECTION_BATCH_SIZE}
                      <span class="batch-state" aria-label={`${group.length} de 15 cartas`}>
                        {group.length}/{COLLECTION_BATCH_SIZE}
                      </span>
                    {/if}
                  </span>
                  <i class="export-symbol"
                    ><svg viewBox="0 0 24 24" aria-hidden="true"
                      ><path
                        d="M8 8V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-4M4 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
                      /></svg
                    ></i
                  >
                </button>
              </h3>

              <div class="batch-grid">
                {#each group as card (card.id)}
                  <CollectionTile {card} variant="memory" onOpen={onOpenCard} />
                {/each}

                {#if group.length < COLLECTION_BATCH_SIZE && hasPending}
                  <button
                    type="button"
                    class="batch-placeholder"
                    aria-label="Seguir descubriendo Pokémon"
                    onclick={onBack}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                {/if}
              </div>
            </section>
          {/each}
        </div>

        <div id="album-index" hidden use:albumIndex>
          <button
            id="album-scrubber"
            type="button"
            role="slider"
            aria-label="Navegar tandas"
            aria-valuemin="0"
            aria-valuemax="0"
            aria-valuenow="0"
            aria-orientation="vertical"
          ></button>
        </div>
        <aside id="album-index-preview" hidden aria-live="polite">
          <span id="album-index-label"></span>
          <div id="album-index-cards"></div>
        </aside>

        {#if copyMessage}
          <p class="muted batch-copy-status" role="status">{copyMessage}</p>
        {/if}
      </section>
    {/if}

    {#if !rounds}
      <section id="collection-options" class="settings-panel" aria-label="Ajustes y respaldo">
        <p class="menu-label">Guardar y recuperar</p>
        <p role="status">
          Las opciones de respaldo y sensaciones todavía no están disponibles en esta versión.
        </p>
      </section>
      <h2 class="collection-title">Tus elegidos.</h2>
      <p class="muted" id="summary">{summary}</p>
    {/if}

    <!--
      El legacy oculta los filtros en «Tus tandas». Los dejamos en el árbol de
      accesibilidad (sin ocupar espacio) para conservar el contrato del sheet.
    -->
    <div class="tabs" class:tabs-is-hidden={rounds} role="group" aria-label="Filtrar la colección">
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

    {#if !rounds}
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

    {#if !rounds && collection.team.length >= 2}
      <div class="collection-dock">
        <button type="button" onclick={chooseTeam}>
          Elegir mi equipo <span aria-hidden="true">↗</span>
        </button>
      </div>
    {/if}
  </div>
</section>
