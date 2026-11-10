<script lang="ts">
  import DiscoveryScreen from '@/components/discovery/DiscoveryScreen.svelte';
  import { scene } from '@/components/discovery/scene';
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
  const roundRatio = $derived(roundTarget > 0 ? roundStep / roundTarget : 0);
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

<div class="world" aria-hidden="true" use:scene={discovery.currentCard?.palette ?? null}>
  <div class="ambient" id="ambient-a"></div>
  <div class="ambient" id="ambient-b"></div>
  <div
    id="tanda-light"
    style:transform={`translateX(-50%) scale(${0.28 + roundRatio * 0.85})`}
    style:opacity={0.12 + roundRatio * 0.2}
  ></div>
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
    <span class="motion-indicator" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
      >
        <path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z" />
        <path d="M20 2v4m-2-2h4" />
      </svg>
    </span>
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
    <b id="likes">
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
  <svg viewBox="0 0 24 30" aria-hidden="true">
    <g>
      <path
        d="M8 2h8v3c2.2.8 3.5 2.8 3.5 5v.5A3.5 3.5 0 0 1 16 14h-4.5A3.5 3.5 0 0 1 8 10.5V9L6.5 7.5A1.5 1.5 0 0 0 4 8.6V10a3 3 0 0 0 4 2.8"
      />
      <path d="M8 5h8" />
    </g>
    <g transform="translate(0 30) scale(1 -1)">
      <path
        d="M8 2h8v3c2.2.8 3.5 2.8 3.5 5v.5A3.5 3.5 0 0 1 16 14h-4.5A3.5 3.5 0 0 1 8 10.5V9L6.5 7.5A1.5 1.5 0 0 0 4 8.6V10a3 3 0 0 0 4 2.8"
      />
      <path d="M8 5h8" />
    </g>
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
