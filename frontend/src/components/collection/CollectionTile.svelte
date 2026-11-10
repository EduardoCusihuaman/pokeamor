<script lang="ts">
  import type { Card } from '@/domain/catalog';

  interface Props {
    readonly card: Card;
    /** Abre el detalle de la carta. El detalle llega en una fase posterior. */
    readonly onOpen?: (card: Card) => void;
  }

  let { card, onOpen }: Props = $props();

  /**
   * Acento de la carta como custom property para que el marco, la rareza y el
   * foco lo reutilicen sin recalcular colores en el marcado. El rango de
   * saturación replica `DiscoveryCard`.
   */
  const accent = $derived(
    `hsl(${card.palette.h} ${Math.min(90, Math.max(30, card.palette.s))}% 46%)`,
  );
  const accentSoft = $derived(
    `hsl(${card.palette.h} ${Math.min(90, Math.max(30, card.palette.s))}% 94%)`,
  );
  const label = $derived(`Ver ${card.name}`);
</script>

<button
  type="button"
  class="collection-tile"
  style="--card-accent: {accent}; --card-accent-soft: {accentSoft};"
  aria-label={label}
  onclick={() => onOpen?.(card)}
>
  <img
    class="art"
    src={card.image}
    alt={`Carta de ${card.name}`}
    width="245"
    height="342"
    loading="lazy"
    decoding="async"
  />
  <span class="name">{card.name}</span>
  <span class="rarity">{card.rarity}</span>
</button>

<style>
  .collection-tile {
    display: grid;
    gap: var(--space-1);
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text);
    text-align: start;
    transition: transform var(--motion-fast) ease-in-out;
  }

  .collection-tile:hover {
    transform: translateY(-2px);
  }

  .collection-tile:active {
    transform: scale(0.98);
  }

  .collection-tile:focus-visible {
    outline-color: var(--card-accent);
  }

  .art {
    width: 100%;
    aspect-ratio: 245 / 342;
    object-fit: contain;
    border: 2px solid var(--card-accent-soft);
    border-radius: var(--radius-sm);
    background: var(--card-accent-soft);
  }

  .name {
    overflow: hidden;
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rarity {
    justify-self: start;
    max-width: 100%;
    overflow: hidden;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--card-accent-soft);
    color: var(--color-muted);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .collection-tile,
    .collection-tile:hover,
    .collection-tile:active {
      transition: none;
      transform: none;
    }
  }
</style>
