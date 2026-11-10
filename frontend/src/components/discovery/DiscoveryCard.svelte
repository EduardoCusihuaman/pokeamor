<script lang="ts">
  import type { Card } from '@/domain/catalog';

  interface Props {
    readonly card: Card;
  }

  let { card }: Props = $props();
</script>

<article class="card" aria-label={card.name}>
  <img src={card.image} alt={`Carta de ${card.name}`} width="245" height="342" decoding="async" />
  <div class="glint" aria-hidden="true"></div>
  <div class="foil" aria-hidden="true"></div>
  <div class="choice-light" aria-hidden="true"></div>
  <div class="stamp" aria-hidden="true">
    <svg class="heart" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s-9-5.5-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-9 12-9 12Z" />
    </svg>
    <svg class="cross" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  </div>
</article>
