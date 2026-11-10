<script lang="ts">
  import type { VoteValue } from '@/application/sync';

  interface Props {
    readonly disabled?: boolean;
    readonly name: string;
    readonly onVote: (value: VoteValue) => void;
  }

  let { disabled = false, name, onVote }: Props = $props();
</script>

<div class="controls">
  <!--
    Los votos son swipe-only en la superficie, pero los botones siguen en el
    árbol de accesibilidad y se pueden activar con teclado o lector de pantalla.
  -->
  <button type="button" class="vote no" aria-label="Paso" {disabled} onclick={() => onVote('no')}>
    <span aria-hidden="true">×</span>
  </button>

  <div class="caption">
    <div>
      <strong id="name">{name}</strong>
    </div>
  </div>

  <button
    type="button"
    class="vote yes"
    aria-label="Me gusta"
    {disabled}
    onclick={() => onVote('yes')}
  >
    <span aria-hidden="true">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M20.8 8.8c0 5.1-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.8a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z"
        />
      </svg>
    </span>
  </button>
</div>
