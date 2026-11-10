/**
 * Gestos de refinamiento (duelos de preferencia).
 *
 * Migrado de `bindRefinementChoice` y `exitRefinement` en `src/app.js`. El
 * módulo es de aplicación: orquesta el gesto y la animación de salida de la
 * pareja, pero no importa Svelte ni lee globals; el DOM, los timers, el estado
 * `inlineBusy` y la transición al siguiente par se inyectan.
 *
 * Máquina de estados del tap/hold (contratos exactos):
 * - `pointerdown` inicia la presión (ignora `button > 0`, punteros secundarios
 *   y un press ya activo). Cancela la entrada de batalla y limpia restos.
 * - A los **320 ms** el hold pasa a *preview*: `consumed = true`, quita
 *   `pressing` y agrega `holding-upper`/`holding-lower` al par. No elige.
 * - Moverse más de **12 px** antes del preview (scroll/drag) cancela el gesto y
 *   marca `consumed`, de modo que el `click` sintético nunca vota.
 * - `pointerup`, `pointercancel` y `lostpointercapture` liberan el preview.
 *   Cancelar también marca `consumed`; soltar tras un tap no.
 * - El `click` solo elige si el gesto no fue consumido. Un segundo puntero no
 *   puede reiniciar ni cancelar el hold del primero.
 * - `cancelRefinementPress()` permite a la aplicación abortar el gesto al
 *   desmontar o cambiar de pareja.
 */

/** Lista de clases mínima para el botón y el contenedor de la pareja. */
export interface RefinementTokenList {
  add(...tokens: string[]): void;
  remove(...tokens: string[]): void;
}

/** Evento de puntero mínimo que consume la máquina de gestos. */
export interface RefinementPointerEvent {
  readonly button?: number;
  readonly isPrimary?: boolean;
  readonly pointerId?: number;
  readonly clientX?: number;
  readonly clientY?: number;
}

/** Evento de click/contexto mínimo. */
export interface RefinementClickEvent {
  preventDefault(): void;
}

/** Botón de una carta del par de refinamiento. */
export interface RefinementChoiceButton {
  readonly classList: RefinementTokenList;
  setPointerCapture?(pointerId: number): void;
  onpointerdown?: ((event: RefinementPointerEvent) => void) | null;
  onpointermove?: ((event: RefinementPointerEvent) => void) | null;
  onpointerup?: ((event: RefinementPointerEvent) => void) | null;
  onpointercancel?: ((event: RefinementPointerEvent) => void) | null;
  onlostpointercapture?: ((event?: RefinementPointerEvent) => void) | null;
  ondragstart?: ((event: RefinementClickEvent) => void) | null;
  oncontextmenu?: ((event: RefinementClickEvent) => void) | null;
  onclick?: ((event: RefinementClickEvent) => void) | null;
  /** Asignado por el binding para que la app cancele el press pendiente. */
  cancelRefinementPress?: () => void;
}

/** Dependencias inyectables del binding de una carta. */
export interface RefinementGestureDeps {
  /** `inlineBusy` de la aplicación. */
  readonly isBusy: () => boolean;
  /** Contenedor del par (`#pair`), usado para el preview del hold. */
  readonly pairBox: { readonly classList: RefinementTokenList };
  /** Confirma la elección (`chooseRefinement(index)`). */
  readonly choose: (index: number) => void;
  /** `battleEntranceCleanup?.()`: detiene la entrada de batalla. */
  readonly cancelEntrance?: () => void;
  readonly setTimeout: (handler: () => void, ms: number) => number;
  readonly clearTimeout: (handle: number) => void;
}

/** Handle devuelto por el binding. */
export interface RefinementGestureHandle {
  /** Aborta el gesto en curso sin elegir. Idempotente. */
  cancel(): void;
}

interface GestureOrigin {
  readonly x: number;
  readonly y: number;
  readonly id: number | undefined;
}

/** Distancia (px) que convierte un press en tap cancelado. */
export const REFINEMENT_MOVE_CANCEL = 12;
/** Retardo (ms) del preview de hold. */
export const REFINEMENT_HOLD_DELAY = 320;

/**
 * Enlaza los handlers de gesto de una carta del par.
 *
 * @param button Botón de la carta.
 * @param index `0` o `1` dentro del par.
 * @returns Handle con `cancel()`; además se asigna
 *   `button.cancelRefinementPress` para el cleanup del legacy.
 */
export function bindRefinementChoice(
  button: RefinementChoiceButton,
  index: number,
  deps: RefinementGestureDeps,
): RefinementGestureHandle {
  let timer: number | null = null;
  let peek = false;
  let origin: GestureOrigin | null = null;
  let consumed = false;

  const clear = (): void => {
    if (timer !== null) deps.clearTimeout(timer);
    timer = null;
    button.classList.remove('pressing');
    if (peek) {
      deps.pairBox.classList.remove('holding-upper', 'holding-lower');
      peek = false;
    }
  };

  const cancel = (): void => {
    origin = null;
    consumed = true;
    clear();
  };

  button.onpointerdown = (event) => {
    if (deps.isBusy() || (event.button ?? 0) > 0 || event.isPrimary === false || origin) {
      return;
    }
    deps.cancelEntrance?.();
    clear();
    consumed = false;
    origin = { x: event.clientX ?? 0, y: event.clientY ?? 0, id: event.pointerId };
    button.classList.add('pressing');
    button.setPointerCapture?.(event.pointerId ?? 0);
    timer = deps.setTimeout(() => {
      if (!origin || deps.isBusy()) return;
      consumed = true;
      button.classList.remove('pressing');
      peek = true;
      deps.pairBox.classList.add(index === 0 ? 'holding-upper' : 'holding-lower');
    }, REFINEMENT_HOLD_DELAY);
  };

  button.onpointermove = (event) => {
    if (origin && event.pointerId !== undefined && event.pointerId !== origin.id) return;
    if (
      origin &&
      Math.hypot((event.clientX ?? 0) - origin.x, (event.clientY ?? 0) - origin.y) >
        REFINEMENT_MOVE_CANCEL &&
      !peek
    ) {
      consumed = true;
      clear();
    }
  };

  button.onpointerup = (event) => {
    if (origin && event?.pointerId !== undefined && event.pointerId !== origin.id) return;
    origin = null;
    clear();
  };

  button.onpointercancel = (event) => {
    if (origin && event?.pointerId !== undefined && event.pointerId !== origin.id) return;
    origin = null;
    consumed = true;
    clear();
  };

  button.onlostpointercapture = (event) => {
    if (origin && event?.pointerId !== undefined && event.pointerId !== origin.id) return;
    if (origin) {
      origin = null;
      consumed = true;
      clear();
    }
  };

  button.ondragstart = (event) => event.preventDefault();
  button.oncontextmenu = (event) => event.preventDefault();

  button.onclick = (event) => {
    if (consumed) {
      event.preventDefault();
      return;
    }
    deps.choose(index);
  };

  button.cancelRefinementPress = cancel;

  return { cancel };
}

/** Ganador de la comparación: `0` arriba, `1` abajo, `2` empate. */
export type RefinementWinner = 0 | 1 | 2;

/** Rectángulo en coordenadas de viewport. */
export interface RefinementRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Estilos que escribe la animación de salida. */
export interface RefinementStyle {
  position?: string;
  left?: string;
  top?: string;
  width?: string;
  height?: string;
  overflow?: string;
  borderRadius?: string;
  pointerEvents?: string;
  touchAction?: string;
  zIndex?: string;
  display?: string;
  opacity?: string;
}

/** Keyframe de la Web Animations API. */
export interface RefinementFrame {
  readonly transform: string;
  readonly offset?: number;
  readonly easing?: string;
}

/** Opciones pasadas a `animate()`. */
export interface RefinementAnimationOptions {
  readonly duration: number;
  readonly easing: string;
  readonly fill: 'forwards';
}

/** Animación mínima que la salida necesita. */
export interface RefinementAnimation {
  readonly finished: Promise<unknown>;
}

/** Nodo creado/gestionado por la animación de salida. */
export interface RefinementElement {
  readonly style: RefinementStyle;
  setAttribute?(name: string, value: string): void;
  append?(child: unknown): void;
  querySelector?(selector: string): RefinementElement | null;
  animate?(frames: RefinementFrame[], options: RefinementAnimationOptions): RefinementAnimation;
  cloneNode?(): RefinementElement;
  remove?(): void;
  getBoundingClientRect?(): RefinementRect;
}

/** Fuente clonable dentro de una carta (imagen o feedback). */
export interface RefinementNodeSource {
  readonly style?: RefinementStyle;
  cloneNode?(): RefinementElement;
  getBoundingClientRect?(): RefinementRect;
}

/** Botón del par tal como lo ve la animación de salida. */
export interface RefinementPairButton {
  querySelector(selector: string): RefinementNodeSource | null;
  getBoundingClientRect?(): RefinementRect;
}

/** Capa del evento de refinamiento (`#refinement-event`). */
export interface RefinementEventLayer {
  readonly classList: RefinementTokenList;
  getBoundingClientRect(): RefinementRect;
}

/** Dependencias inyectables de la salida de la pareja. */
export interface RefinementExitDeps {
  /** `matchMedia('(prefers-reduced-motion: reduce)').matches`. */
  readonly isReducedMotion: () => boolean;
  /** `#app` tiene `battle-wide` (viewport ancho). */
  readonly isWide: () => boolean;
  readonly eventLayer: RefinementEventLayer;
  readonly pairBox: { readonly children: ArrayLike<RefinementPairButton> };
  readonly createElement: (tag: string) => RefinementElement;
  readonly body: { append(node: RefinementElement): void };
  /** Monta el siguiente par y actualiza el estado (`finishRefinement`). */
  readonly finish: () => void;
  /** `battleEntranceCleanup?.()`. */
  readonly cancelEntrance?: () => void;
  readonly setTimeout: (handler: () => void, ms: number) => unknown;
}

/**
 * Saca la pareja de refinamiento con la animación legacy.
 *
 * En móvil el par se divide en dos mitades; un empate las separa la misma
 * distancia (`half`) en direcciones opuestas. Con ganador, la mitad elegida
 * viaja hasta alinear las cartas completas y luego ambas salen de la pantalla.
 * El siguiente par se monta **antes** de mover las salientes.
 */
export function exitRefinement(deps: RefinementExitDeps, winner: RefinementWinner = 2): void {
  deps.cancelEntrance?.();
  if (deps.isReducedMotion()) {
    deps.eventLayer.classList.add('equal-exit');
    deps.finish();
    return;
  }

  const wide = deps.isWide();
  const rect = deps.eventLayer.getBoundingClientRect();
  const half = rect.height / 2;
  const firstImage = deps.pairBox.children[0]?.querySelector('img');
  const full = firstImage?.getBoundingClientRect?.().height || rect.width / 0.716;
  const duration = winner === 2 ? 210 : 360;

  const cover = deps.createElement('div');
  cover.setAttribute?.('aria-hidden', 'true');
  cover.style.position = 'fixed';
  cover.style.left = `${rect.left}px`;
  cover.style.top = `${rect.top}px`;
  cover.style.width = `${rect.width}px`;
  cover.style.height = `${rect.height}px`;
  cover.style.overflow = 'hidden';
  cover.style.borderRadius = '17px';
  cover.style.pointerEvents = 'auto';
  cover.style.touchAction = 'none';
  cover.style.zIndex = '9';

  const panels: RefinementElement[] = [];
  Array.from(deps.pairBox.children).forEach((button, index) => {
    const panel = deps.createElement('div');
    const art = button.querySelector('img')?.cloneNode?.();
    panel.style.position = 'absolute';
    panel.style.left = '0';
    panel.style.top = `${index * half}px`;
    panel.style.width = '100%';
    panel.style.height = `${winner === 2 ? half : full}px`;
    panel.style.overflow = 'hidden';
    panel.style.borderRadius = '17px';

    if (art) {
      art.style.display = 'block';
      art.style.width = '100%';
      art.style.height = 'auto';
      art.style.borderRadius = '17px';
      panel.append?.(art);
    }

    if (wide) {
      const bounds = button.getBoundingClientRect?.();
      if (bounds) {
        panel.style.left = `${bounds.left - rect.left}px`;
        panel.style.top = `${bounds.top - rect.top}px`;
        panel.style.width = `${bounds.width}px`;
        panel.style.height = `${bounds.height}px`;
      }
    }

    const feedback = button.querySelector('.battle-feedback');
    if ((winner === 2 || winner === index) && feedback) {
      const overlay = feedback.cloneNode?.();
      if (overlay) {
        overlay.style.height = wide ? '100%' : `${half}px`;
        overlay.style.opacity = '1';
        panel.append?.(overlay);
      }
    }

    cover.append?.(panel);
    panels.push(panel);
  });

  deps.body.append(cover);

  // Monta el siguiente par debajo antes de mover cualquier mitad saliente.
  deps.eventLayer.classList.add('equal-exit', 'continuous-handoff');
  deps.finish();

  const animations: RefinementAnimation[] = [];
  panels.forEach((panel, index) => {
    if (wide) {
      const direction = winner === 2 ? (index ? 1 : -1) : winner === 0 ? -1 : 1;
      const travel = direction * (rect.width + 1);
      const animation = panel.animate?.(
        [{ transform: 'translateX(0)' }, { transform: `translateX(${travel}px)` }],
        {
          duration: winner === 2 ? 210 : 280,
          easing: 'cubic-bezier(.35,0,.7,1)',
          fill: 'forwards',
        },
      );
      if (animation) animations.push(animation);
      return;
    }

    if (winner === 2) {
      const travel = (index ? 1 : -1) * half;
      const animation = panel.animate?.(
        [{ transform: 'translateY(0)' }, { transform: `translateY(${travel}px)` }],
        {
          duration,
          easing: 'cubic-bezier(.2,.75,.2,1)',
          fill: 'forwards',
        },
      );
      if (animation) animations.push(animation);
      return;
    }

    const aligned = winner === 0 ? (index === 0 ? 0 : full - half) : index === 0 ? half - full : 0;
    const travel = winner === 0 ? rect.height + 1 : -(half + full + 1);
    const animation = panel.animate?.(
      [
        {
          transform: 'translateY(0)',
          offset: 0,
          easing: 'cubic-bezier(.2,.75,.2,1)',
        },
        {
          transform: `translateY(${aligned}px)`,
          offset: 0.42,
          easing: 'cubic-bezier(.4,0,.7,1)',
        },
        { transform: `translateY(${aligned + travel}px)`, offset: 1 },
      ],
      { duration, easing: 'linear', fill: 'forwards' },
    );
    if (animation) animations.push(animation);
  });

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    cover.remove?.();
    deps.eventLayer.classList.remove('continuous-handoff');
  };
  Promise.all(animations.map((animation) => animation.finished)).then(cleanup, cleanup);
  deps.setTimeout(cleanup, duration + 60);
}
