<script lang="ts">
  import { onMount } from 'svelte';

  import { appDiscovery, type DiscoveryApi } from '@/application/discovery.svelte';
  import DiscoveryCard from '@/components/discovery/DiscoveryCard.svelte';
  import DiscoveryControls from '@/components/discovery/DiscoveryControls.svelte';

  interface Props {
    /** Instancia inyectable; la app usa la compartida. */
    readonly discovery?: DiscoveryApi;
  }

  let { discovery = appDiscovery }: Props = $props();

  const isLoading = $derived(discovery.status === 'idle' || discovery.status === 'loading');
  const isReady = $derived(discovery.status === 'ready');
  const currentCard = $derived(discovery.currentCard);
  const progressText = $derived(
    `${discovery.progress.discovered} de ${discovery.progress.total} descubiertas`,
  );

  onMount(() => {
    if (discovery.status === 'idle') void discovery.load();
  });

  function retry(): void {
    void discovery.load();
  }

  function vote(value: 'yes' | 'no'): void {
    discovery.vote(value);
  }

  function undo(): void {
    discovery.undo();
  }
</script>

<section class="discovery-screen" aria-labelledby="discovery-title">
  <header class="intro">
    <p class="eyebrow">Colección de cartas</p>
    <h1 id="discovery-title">pokéamor</h1>
    {#if isReady && discovery.progress.total > 0}
      <p class="progress-text">{progressText}</p>
    {/if}
  </header>

  {#if isLoading}
    <p class="state" role="status">Cargando cartas…</p>
  {:else if discovery.error}
    <div class="state state-error" role="alert">
      <p>No se pudieron cargar las cartas.</p>
      <p class="detail">{discovery.error}</p>
      <button type="button" aria-label="Reintentar la carga del catálogo" onclick={retry}>
        Reintentar
      </button>
    </div>
  {:else if isReady}
    {#if discovery.cardCount === 0}
      <p class="state">No hay cartas en el catálogo.</p>
    {:else}
      {#if currentCard}
        <DiscoveryCard card={currentCard} />
      {:else}
        <p class="state">No hay más cartas por descubrir.</p>
      {/if}

      <p class="tally" aria-live="polite">
        <strong>{discovery.yesCount}</strong> me gusta · <strong>{discovery.noCount}</strong> pasos
      </p>

      {#if discovery.sessionError}
        <p class="session-error" role="status">{discovery.sessionError}</p>
      {/if}

      <DiscoveryControls
        canUndo={discovery.canUndo}
        disabled={currentCard === null}
        onVote={vote}
        onUndo={undo}
      />
    {/if}
  {/if}
</section>

<style>
  .discovery-screen {
    display: grid;
    gap: var(--space-6);
    width: min(100%, 34rem);
    padding: var(--space-8) var(--space-6);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    box-shadow: 0 1rem 2.5rem rgb(43 29 36 / 12%);
  }

  .intro {
    display: grid;
    gap: var(--space-1);
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
    font-size: clamp(2rem, 8vw, 2.75rem);
    line-height: 1.1;
  }

  .progress-text {
    color: var(--color-muted);
    font-size: 0.875rem;
  }

  .state {
    display: grid;
    justify-items: center;
    gap: var(--space-4);
    text-align: center;
  }

  .state-error {
    color: var(--color-danger);
  }

  .detail {
    color: var(--color-muted);
    font-size: 0.875rem;
  }

  .state button {
    padding: var(--space-2) var(--space-6);
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    color: var(--color-surface);
    font-weight: 600;
    transition: background-color var(--motion-fast) ease-in-out;
  }

  .state button:hover {
    background: var(--color-accent-strong);
  }

  .tally {
    color: var(--color-muted);
    text-align: center;
  }

  .tally strong {
    color: var(--color-text);
  }

  .session-error {
    color: var(--color-muted);
    font-size: 0.8125rem;
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .state button {
      transition: none;
    }
  }
</style>
