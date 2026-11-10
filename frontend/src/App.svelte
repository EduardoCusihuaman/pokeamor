<script lang="ts">
  import DiscoveryScreen from '@/components/discovery/DiscoveryScreen.svelte';
  import { appDiscovery, type DiscoveryApi } from '@/application/discovery.svelte';
  import { appNavigation } from '@/application/navigation.svelte';

  interface Props {
    /** Instancia inyectable; la app usa la compartida. */
    readonly discovery?: DiscoveryApi;
  }

  let { discovery = appDiscovery }: Props = $props();

  const current = $derived(appNavigation.current);
  const canUndo = $derived(discovery.canUndo);
  const yesCount = $derived(discovery.yesCount);
  const roundStep = $derived(discovery.progress.step);
  const roundTarget = $derived(discovery.progress.target);
  const discoveredCount = $derived(discovery.discoveredCount);
  const cardCount = $derived(discovery.cardCount);
  const trackWidth = $derived(
    discovery.cardCount > 0
      ? Math.min(100, (discovery.discoveredCount / discovery.cardCount) * 100)
      : 0,
  );

  // Álbum/colección bajo demanda (plan §16): chunk separado cargado al abrir.
  type CollectionChunk = typeof import('@/components/collection/CollectionScreen.svelte');
  let collectionChunk: Promise<CollectionChunk> | null = null;
  const loadCollection = (): Promise<CollectionChunk> =>
    (collectionChunk ??= import('@/components/collection/CollectionScreen.svelte'));

  function openCollection(): void {
    appNavigation.go('collection');
  }

  function undo(): void {
    discovery.undo();
  }
</script>

<div class="world" aria-hidden="true">
  <div class="ambient"></div>
</div>

<div class="decision-glow" aria-hidden="true">
  <span class="sigil yes">
    <svg viewBox="0 0 24 24" width="29" height="29" fill="currentColor" aria-hidden="true">
      <path d="M12 21s-9-5.5-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-9 12-9 12Z" />
    </svg>
  </span>
  <span class="sigil no">×</span>
</div>

<header>
  <button
    type="button"
    class="undo"
    aria-label="Deshacer última elección"
    disabled={!canUndo}
    onclick={undo}
  >
    ↶
  </button>

  <div class="identity">
    <div class="brand">poké<span>amor</span></div>
  </div>

  <button
    type="button"
    id="round-progress"
    aria-label="Progreso de la tanda"
    title="Progreso de la tanda"
  >
    <svg class="round-ring" viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r="23" />
      <circle id="round-arc" cx="26" cy="26" r="23" />
    </svg>
    <span id="round-number">{roundStep}/{roundTarget}</span>
  </button>

  <button type="button" class="collection" aria-label="Abrir mi colección" onclick={openCollection}>
    <b>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"
        />
      </svg>
      <span>{yesCount}</span>
    </b>
  </button>
</header>

<DiscoveryScreen {discovery} />

<button
  type="button"
  id="front-refine"
  aria-label="Afinar mis favoritos"
  title="Afinar mis favoritos"
>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="5" width="7" height="13" rx="2" />
    <rect x="14" y="5" width="7" height="13" rx="2" />
    <path d="m11 10 1 1 1-1m-2 4 1-1 1 1" />
  </svg>
</button>

<span id="discovery-count" aria-label="{discoveredCount} de {cardCount} Pokémon descubiertos">
  {discoveredCount} / {cardCount}
</span>

<div class="track"><i style="width: {trackWidth}%"></i></div>

{#if current === 'collection'}
  {#await loadCollection() then { default: CollectionScreen }}
    <CollectionScreen />
  {:catch}
    <p class="overlay-error" role="alert">No se pudo abrir la colección.</p>
  {/await}
{/if}
