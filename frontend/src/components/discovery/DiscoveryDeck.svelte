<script lang="ts">
  import { onMount } from 'svelte';

  import type { Card } from '@/domain/catalog';
  import { createDeckController, type DeckController } from '@/engines/deck/controller';
  import { resourceCoordinator } from '@/engines/resources/resource-coordinator';
  import type { VoteDecision } from '@/engines/swipe/gesture';

  interface Props {
    /** Carta frontal actual. `null` vacía el deck. */
    readonly current: Card | null;
    /** Carta de debajo; `null` deja el deck con una sola carta. */
    readonly next?: Card | null;
    readonly enabled?: boolean;
    /** Confirmación del gesto (o de los controles accesibles del host). */
    readonly onDecision: (decision: VoteDecision, card: Card) => void;
    /** Deshacer del host; el botón accesible vive fuera de este componente. */
    readonly onUndo?: () => void;
    /** Coordinador de recursos; `null` desactiva la preparación de arte. */
    readonly resources?: typeof resourceCoordinator | null;
  }

  let {
    current,
    next = null,
    enabled = true,
    onDecision,
    onUndo,
    resources = resourceCoordinator,
  }: Props = $props();

  let stage: HTMLDivElement;
  let controller: DeckController | null = null;

  const CARD_RATIO = 0.716;

  function queue(): readonly Card[] {
    if (!current) return [];
    return next ? [current, next] : [current];
  }

  /**
   * Reproduce `fitCard()` del legacy: la carta se ajusta a la altura real del
   * escenario sin desbordar su ancho. El motor sigue leyendo `--card-width`.
   */
  function fitCard(): void {
    if (!stage) return;
    const width = Math.max(
      0,
      Math.min(stage.clientWidth - 2, (stage.clientHeight - 6) * CARD_RATIO),
    );
    stage.style.setProperty('--card-width', `${width}px`);
  }

  onMount(() => {
    fitCard();

    const instance = createDeckController(stage, {
      onDecision: (decision, card) => onDecision(decision, card),
      resources,
    });
    controller = instance;
    instance.setEnabled(enabled);
    instance.setCards(queue());

    const observer = new ResizeObserver(() => fitCard());
    observer.observe(stage);

    return () => {
      observer.disconnect();
      controller = null;
      instance.destroy();
    };
  });

  $effect(() => {
    const cards = queue();
    if (!controller) return;
    controller.setEnabled(enabled);
    controller.setCards(cards);
  });

  /** Deshace en el host y re-muestra la carta sin emitir un voto nuevo. */
  export function undo(): void {
    onUndo?.();
    controller?.undo();
  }

  /** Cancela el gesto activo sin decisión. */
  export function cancel(): void {
    controller?.cancel();
  }
</script>

<div class="stage" bind:this={stage} role="region" aria-label="Mazo de descubrimiento"></div>
