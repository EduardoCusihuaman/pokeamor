<script lang="ts">
  import type { VoteValue } from '@/application/sync';

  interface Props {
    readonly canUndo: boolean;
    readonly disabled?: boolean;
    readonly onVote: (value: VoteValue) => void;
    readonly onUndo: () => void;
  }

  let { canUndo, disabled = false, onVote, onUndo }: Props = $props();
</script>

<div class="discovery-controls" role="group" aria-label="Decidir sobre esta carta">
  <button
    type="button"
    class="vote vote-no"
    aria-label="Paso"
    {disabled}
    onclick={() => onVote('no')}
  >
    <span class="icon" aria-hidden="true">✕</span>
    <span class="label">Paso</span>
  </button>

  <button
    type="button"
    class="undo"
    aria-label="Deshacer última elección"
    disabled={!canUndo}
    onclick={onUndo}
  >
    <span class="icon" aria-hidden="true">↶</span>
    <span class="label">Deshacer</span>
  </button>

  <button
    type="button"
    class="vote vote-yes"
    aria-label="Me gusta"
    {disabled}
    onclick={() => onVote('yes')}
  >
    <span class="icon" aria-hidden="true">❤️</span>
    <span class="label">Me gusta</span>
  </button>
</div>

<style>
  .discovery-controls {
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: var(--space-3);
    width: 100%;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 3rem;
    padding: var(--space-2) var(--space-4);
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    font-weight: 600;
    transition:
      background-color var(--motion-fast) ease-in-out,
      border-color var(--motion-fast) ease-in-out,
      transform var(--motion-fast) ease-in-out;
  }

  button:active:not(:disabled) {
    transform: scale(0.97);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .vote {
    flex: 1;
    max-width: 9rem;
    border-color: rgb(43 29 36 / 14%);
    background: var(--color-surface);
  }

  .vote-yes {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-surface);
  }

  .vote-yes:hover:not(:disabled) {
    background: var(--color-accent-strong);
    border-color: var(--color-accent-strong);
  }

  .vote-no:hover:not(:disabled) {
    border-color: var(--color-accent-strong);
  }

  .undo {
    flex: 0 0 auto;
    padding-inline: var(--space-3);
    background: transparent;
    color: var(--color-muted);
  }

  .undo:hover:not(:disabled) {
    background: rgb(43 29 36 / 6%);
  }

  .icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .label {
    font-size: 0.875rem;
  }

  @media (max-width: 22rem) {
    .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }

    button:active:not(:disabled) {
      transform: none;
    }
  }
</style>
