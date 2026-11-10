<script lang="ts">
  import type { Card } from '@/domain/catalog';

  interface Props {
    readonly card: Card;
  }

  let { card }: Props = $props();

  /**
   * El acento se expone como custom property para que el resto del componente
   * (marco, nombre, foco) lo reuse sin recalcular colores en el marcado.
   */
  const accent = $derived(
    `hsl(${card.palette.h} ${Math.min(90, Math.max(30, card.palette.s))}% 46%)`,
  );
  const accentSoft = $derived(
    `hsl(${card.palette.h} ${Math.min(90, Math.max(30, card.palette.s))}% 94%)`,
  );
</script>

<article
  class="discovery-card"
  style="--card-accent: {accent}; --card-accent-soft: {accentSoft};"
  aria-labelledby="discovery-card-name"
>
  <figure class="art">
    <img src={card.image} alt={`Carta de ${card.name}`} width="245" height="342" decoding="async" />
  </figure>

  <header class="meta">
    <h2 id="discovery-card-name">{card.name}</h2>
    <p class="rarity">{card.rarity}</p>
  </header>
</article>

<style>
  .discovery-card {
    display: grid;
    gap: var(--space-4);
    width: 100%;
    padding: var(--space-4);
    border: 2px solid var(--card-accent-soft);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    box-shadow: 0 1rem 2.5rem rgb(43 29 36 / 12%);
  }

  .art {
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--card-accent-soft);
  }

  .art img {
    width: min(100%, 15.3125rem);
    aspect-ratio: 245 / 342;
    object-fit: contain;
  }

  .meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  h2 {
    margin: 0;
    color: var(--color-text);
    font-size: clamp(1.25rem, 5vw, 1.5rem);
    line-height: 1.2;
  }

  .rarity {
    flex-shrink: 0;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--card-accent-soft);
    color: var(--color-muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>
