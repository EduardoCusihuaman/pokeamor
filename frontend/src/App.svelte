<script lang="ts">
  import DiscoveryScreen from '@/components/discovery/DiscoveryScreen.svelte';
</script>

<main class="app-shell">
  <DiscoveryScreen />
</main>

<style>
  .app-shell {
    display: grid;
    place-items: center;
    min-height: 100dvh;
    padding: var(--space-6);
  }
</style>
