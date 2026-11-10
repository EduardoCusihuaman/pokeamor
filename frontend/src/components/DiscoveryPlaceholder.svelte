<script lang="ts">
  import { onMount } from 'svelte';
  import type { AppSession } from '@/application/session.svelte';

  interface Props {
    session: AppSession;
  }

  let { session }: Props = $props();

  const totalLabel = $derived(session.cardCount.toLocaleString('es'));
  const firstCard = $derived(session.firstCard);
  const errorMessage = $derived(session.error);

  onMount(() => {
    void session.load();
  });

  function retry(): void {
    void session.load();
  }
</script>

<section class="discovery-placeholder" aria-labelledby="discovery-title">
  <header class="intro">
    <p class="eyebrow">Colección de cartas</p>
    <h1 id="discovery-title">pokéamor</h1>
    <p class="subtitle">Descubrí cartas y armá tu colección.</p>
  </header>

  {#if session.loading}
    <p class="state" role="status">Cargando cartas…</p>
  {:else if errorMessage}
    <div class="state state-error" role="alert">
      <p>No se pudieron cargar las cartas.</p>
      <p class="detail">{errorMessage}</p>
      <button type="button" aria-label="Reintentar la carga del catálogo" onclick={retry}>
        Reintentar
      </button>
    </div>
  {:else if firstCard}
    <div class="state">
      <p>{totalLabel} cartas disponibles.</p>
      <figure class="preview">
        <img src={firstCard.image} alt={firstCard.name} width="245" height="342" decoding="async" />
        <figcaption>{firstCard.name}</figcaption>
      </figure>
    </div>
  {:else}
    <p class="state">No hay cartas en el catálogo.</p>
  {/if}
</section>

<style>
  .discovery-placeholder {
    display: grid;
    gap: var(--space-6);
    width: min(100%, 34rem);
    padding: var(--space-8) var(--space-6);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    box-shadow: 0 1rem 2.5rem rgb(43 29 36 / 12%);
  }

  .intro {
    display: grid;
    gap: var(--space-1);
  }

  .eyebrow {
    color: var(--color-muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    font-size: clamp(2rem, 8vw, 2.75rem);
    line-height: 1.1;
  }

  .subtitle,
  .detail {
    color: var(--color-muted);
  }

  .state {
    display: grid;
    justify-items: center;
    gap: var(--space-4);
    text-align: center;
  }

  .state-error {
    color: var(--color-danger);
  }

  .detail {
    font-size: 0.875rem;
  }

  button {
    padding: var(--space-2) var(--space-6);
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    color: var(--color-surface);
    font-weight: 600;
    transition: background-color var(--motion-fast) ease-in-out;
  }

  button:hover {
    background: var(--color-accent-strong);
  }

  .preview {
    display: grid;
    justify-items: center;
    gap: var(--space-3);
  }

  .preview img {
    width: min(100%, 15.3125rem);
    height: auto;
    border-radius: var(--radius-sm);
  }

  .preview figcaption {
    font-weight: 600;
  }
</style>
