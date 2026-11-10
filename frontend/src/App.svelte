<script lang="ts">
  import CollectionScreen from '@/components/collection/CollectionScreen.svelte';
  import DiscoveryScreen from '@/components/discovery/DiscoveryScreen.svelte';
  import { appNavigation, type AppView } from '@/application/navigation.svelte';

  const VIEWS: readonly { readonly value: AppView; readonly label: string }[] = [
    { value: 'discovery', label: 'Descubrir' },
    { value: 'collection', label: 'Colección' },
  ];

  const current = $derived(appNavigation.current);
</script>

<div class="app">
  <header class="app-header">
    <nav class="app-nav" aria-label="Secciones de pokéamor">
      {#each VIEWS as view (view.value)}
        <button
          type="button"
          aria-current={current === view.value ? 'page' : undefined}
          onclick={() => appNavigation.go(view.value)}
        >
          {view.label}
        </button>
      {/each}
    </nav>
  </header>

  <main class="app-shell">
    {#if current === 'collection'}
      <CollectionScreen />
    {:else if current === 'settings'}
      <section class="settings-placeholder" aria-labelledby="settings-title">
        <h1 id="settings-title">Ajustes</h1>
        <p>Los ajustes y el respaldo llegan en una próxima fase.</p>
      </section>
    {:else}
      <DiscoveryScreen />
    {/if}
  </main>
</div>

<style>
  .app {
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 100dvh;
  }

  .app-header {
    display: flex;
    justify-content: center;
    padding: var(--space-4) var(--space-6) 0;
  }

  .app-nav {
    display: inline-flex;
    gap: var(--space-1);
    padding: var(--space-1);
    border: 1px solid rgb(43 29 36 / 10%);
    border-radius: var(--radius-pill);
    background: var(--color-surface);
    box-shadow: 0 0.25rem 0.75rem rgb(43 29 36 / 8%);
  }

  .app-nav button {
    min-height: 2.5rem;
    padding: var(--space-2) var(--space-4);
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-muted);
    font-size: 0.875rem;
    font-weight: 600;
    transition:
      background-color var(--motion-fast) ease-in-out,
      color var(--motion-fast) ease-in-out;
  }

  .app-nav button:hover {
    color: var(--color-text);
  }

  .app-nav button[aria-current='page'] {
    background: var(--color-accent);
    color: var(--color-surface);
  }

  .app-shell {
    display: grid;
    place-items: center;
    min-height: 0;
    padding: var(--space-4) var(--space-6) var(--space-8);
  }

  .settings-placeholder {
    display: grid;
    gap: var(--space-2);
    width: min(100%, 34rem);
    padding: var(--space-8) var(--space-6);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    box-shadow: 0 1rem 2.5rem rgb(43 29 36 / 12%);
  }

  .settings-placeholder h1 {
    margin: 0;
    font-size: clamp(1.75rem, 6vw, 2.5rem);
  }

  .settings-placeholder p {
    color: var(--color-muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .app-nav button {
      transition: none;
    }
  }
</style>
