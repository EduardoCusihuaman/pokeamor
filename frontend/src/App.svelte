<script lang="ts">
  import { appSession } from '@/application/session.svelte';
  import DiscoveryPlaceholder from '@/components/DiscoveryPlaceholder.svelte';
</script>

<main class="app-shell">
  <DiscoveryPlaceholder session={appSession} />
</main>

<style>
  .app-shell {
    display: grid;
    place-items: center;
    min-height: 100dvh;
    padding: var(--space-6);
  }
</style>
