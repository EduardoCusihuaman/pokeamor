<script lang="ts">
  import type { VoteValue } from '@/application/sync';

  interface Props {
    readonly disabled?: boolean;
    readonly step: number;
    readonly target: number;
    readonly arcOffset: number;
    readonly pearls: string;
    readonly name: string;
    readonly onVote: (value: VoteValue) => void;
  }

  let { disabled = false, step, target, arcOffset, pearls, name, onVote }: Props = $props();
</script>

<div class="controls">
  <button type="button" class="vote no" aria-label="Paso" {disabled} onclick={() => onVote('no')}>
    <span aria-hidden="true">×</span>
  </button>

  <div class="caption">
    <div>
      <button type="button" id="round-progress" aria-label="Progreso de la tanda">
        <svg class="round-ring" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="23" />
          <circle id="round-arc" cx="26" cy="26" r="23" style="stroke-dashoffset: {arcOffset}" />
        </svg>
        <span id="round-number">{step}/{target}</span>
      </button>
      <strong id="name">{name}</strong>
      <span id="round-pearls" aria-hidden="true">{pearls}</span>
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
