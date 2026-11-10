<script lang="ts">
  import type { Card } from '@/domain/catalog';
  import CollectionTile from '@/components/collection/CollectionTile.svelte';

  interface Props {
    readonly cards: readonly Card[];
    readonly onOpen?: (card: Card) => void;
  }

  let { cards, onOpen }: Props = $props();
</script>

<div class="grid" id="grid">
  {#each cards as card (card.id)}
    <CollectionTile {card} {onOpen} />
  {/each}
</div>
