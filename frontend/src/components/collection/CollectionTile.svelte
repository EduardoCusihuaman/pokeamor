<script lang="ts">
  import type { Card } from '@/domain/catalog';

  /** `tile` es la tarjeta editorial de la galería; `memory` la del álbum. */
  type CollectionTileVariant = 'tile' | 'memory';

  interface Props {
    readonly card: Card;
    /** Abre el detalle de la carta. El detalle llega en una fase posterior. */
    readonly onOpen?: (card: Card) => void;
    /** Estructura legacy: `.tile` o `.memory-card` dentro de `.batch-grid`. */
    readonly variant?: CollectionTileVariant;
  }

  let { card, onOpen, variant = 'tile' }: Props = $props();

  const label = $derived(`Ver ${card.name}`);
</script>

{#if variant === 'memory'}
  <button
    type="button"
    class="memory-card"
    data-pokemon={card.id}
    aria-label={label}
    onclick={() => onOpen?.(card)}
  >
    <img
      src={card.image}
      alt={`Carta de ${card.name}`}
      width="245"
      height="342"
      loading="lazy"
      decoding="async"
    />
  </button>
{:else}
  <button type="button" class="tile" aria-label={label} onclick={() => onOpen?.(card)}>
    <img
      src={card.image}
      alt={`Carta de ${card.name}`}
      width="245"
      height="342"
      loading="lazy"
      decoding="async"
    />
    <b>{card.name}</b>
    <small>{card.rarity}</small>
  </button>
{/if}
