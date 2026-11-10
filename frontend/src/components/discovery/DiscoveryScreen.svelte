<script lang="ts">
  import { onMount } from 'svelte';

  import { appDiscovery, type DiscoveryApi } from '@/application/discovery.svelte';
  import DiscoveryControls from '@/components/discovery/DiscoveryControls.svelte';
  import DiscoveryDeck from '@/components/discovery/DiscoveryDeck.svelte';

  interface Props {
    /** Instancia inyectable; la app usa la compartida. */
    readonly discovery?: DiscoveryApi;
  }

  let { discovery = appDiscovery }: Props = $props();

  const isLoading = $derived(discovery.status === 'idle' || discovery.status === 'loading');
  const isReady = $derived(discovery.status === 'ready');
  const currentCard = $derived(discovery.currentCard);
  const nextCard = $derived.by(() => {
    const current = discovery.currentCard;
    if (!current) return null;

    const start = discovery.catalog.indexOf(current);
    for (let index = start + 1; index < discovery.catalog.length; index += 1) {
      const candidate = discovery.catalog[index];
      if (candidate && !discovery.votes[String(candidate.id)]) return candidate;
    }
    return null;
  });

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

{#if isLoading}
  <div class="stage">
    <p class="state" role="status">Cargando cartas…</p>
  </div>
{:else if discovery.error}
  <div class="stage">
    <div class="state state-error" role="alert">
      <p>No se pudieron cargar las cartas.</p>
      <p class="detail">{discovery.error}</p>
      <button type="button" aria-label="Reintentar la carga del catálogo" onclick={retry}>
        Reintentar
      </button>
    </div>
  </div>
{:else if isReady && discovery.cardCount === 0}
  <div class="stage">
    <p class="state">No hay cartas en el catálogo.</p>
  </div>
{:else if isReady && !currentCard}
  <div class="stage">
    <p class="state">No hay más cartas por descubrir.</p>
  </div>
{:else if isReady && currentCard}
  <DiscoveryDeck
    current={currentCard}
    next={nextCard}
    enabled={isReady}
    onDecision={vote}
    onUndo={undo}
  />
{/if}

<DiscoveryControls
  disabled={currentCard === null}
  step={discovery.progress.step}
  target={discovery.progress.target}
  arcOffset={discovery.progress.arcDashoffset}
  pearls={discovery.progress.pearls}
  name={currentCard?.name ?? ''}
  onVote={vote}
/>

<p class="tally" aria-live="polite">
  <strong>{discovery.yesCount}</strong> me gusta · <strong>{discovery.noCount}</strong> pasos
</p>

{#if discovery.sessionError}
  <p class="session-error" role="status">{discovery.sessionError}</p>
{/if}
