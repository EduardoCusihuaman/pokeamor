<script lang="ts">
  import type { Card } from '@/domain/catalog';

  interface Props {
    readonly card: Card;
    /** Abre el detalle de la carta. El detalle llega en una fase posterior. */
    readonly onOpen?: (card: Card) => void;
  }

  let { card, onOpen }: Props = $props();

  const label = $derived(`Ver ${card.name}`);
</script>

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
