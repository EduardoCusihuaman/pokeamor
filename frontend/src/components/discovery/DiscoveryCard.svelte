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
  <div class="swipe-seal" aria-hidden="true">
    <span class="seal-fill"></span>
    <svg class="seal-heart seal-outline" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"
      />
    </svg>
    <svg class="seal-heart seal-solid" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"
      />
    </svg>
    <svg class="seal-cross seal-outline" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
    <svg class="seal-cross seal-solid" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  </div>
</article>
