<script lang="ts">
  import type { Card } from '@/domain/catalog';
  import CollectionTile from '@/components/collection/CollectionTile.svelte';

  interface Props {
    readonly cards: readonly Card[];
    readonly onOpen?: (card: Card) => void;
  }

  let { cards, onOpen }: Props = $props();
</script>

<div class="collection-grid-host">
  <ul class="collection-grid" aria-label="Cartas de la colección">
    {#each cards as card (card.id)}
      <li class="cell">
        <CollectionTile {card} {onOpen} />
      </li>
    {/each}
  </ul>
</div>

<style>
  /*
   * Container query (plan §10): el número de columnas depende del ancho real
   * del host, no del viewport. El host es el contenedor; la grilla queda como
   * descendiente consultable.
   */
  .collection-grid-host {
    container: collection / inline-size;
    width: 100%;
  }

  .collection-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4) var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cell {
    min-width: 0;
  }

  @container collection (width >= 26rem) {
    .collection-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container collection (width >= 40rem) {
    .collection-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container collection (width >= 54rem) {
    .collection-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }
</style>
