/**
 * Controlador de gesto del swipe (plan §8).
 *
 * Migra la parte del gesto que sigue embebida en `src/app.js` dentro de
 * `makeCard()` (`pointerdown`/`pointermove`/`pointerup`/`pointercancel` y el
 * resorte `tick`). Es independiente del framework: no importa Svelte ni lee
 * `window`, `document` ni globals. El elemento, la fuente de Pointer Events, el
 * reloj, los timers, `requestAnimationFrame`, `matchMedia` y el rectángulo se
 * inyectan.
 *
 * Física preservada exactamente del legacy:
 *
 * - Arrastre: la pose sigue al dedo. `x` comprime el exceso sobre `0.7·width`
 *   al `45 %`; `y = dy·0.14 + swipeArc(dragX, width).y`; la rotación es la
 *   curva compartida `swipeArc(...).r` (`0.65·atan(x/(2·width))` en grados).
 * - Rotación/tilt: `rx`/`ry` derivan de la luz del puntero sobre la carta.
 * - Umbral: `min(78, width·0.21)`; `strength = min(|dx|/threshold, 1)`.
 * - Armado con histéresis: se arma al superar el umbral y solo se desarma por
 *   debajo de `0.72·threshold` o al cambiar de dirección.
 * - Decisión al soltar: `armed` en la misma dirección que `dx` **o** flick
 *   (`<90 ms` desde el último move, `|vx|>0.5`, `|dx|>28`,
 *   `|dx|>|dy|·0.65` y `sign(vx)===sign(dx)`).
 * - `vx` es una media exponencial `vx = vx·0.25 + (Δx/Δt)·0.75`.
 * - Vuelta al origen con el mismo resorte del legacy:
 *   `v += ((target − position)·1100 − v·60)·dt`, `dt` acotado a `25 ms`.
 * - Un toque sin desplazamiento (< 9 px en ambos ejes) primero crece a
 *   `scale(1.018)` y vuelve al origen a los `160 ms`.
 * - `prefers-reduced-motion` aplica la pose de inmediato, sin resorte; el
 *   vuelo de salida lo resuelve `@/engines/swipe/flight` (sin animación).
 *
 * La curva se importa de `flight.ts` y el sello de `seal.ts`: no se
 * reimplementan. El vuelo se dispara desde la callback `onDecision` del host,
 * que reutiliza `launchCard`; la pose liberada se entrega en el contexto.
 */
import { swipeArc } from './flight';
import { paintSwipeSeal, type SwipeSealElement } from './seal';

/** Decisión de voto del swipe. */
export type VoteDecision = 'yes' | 'no';

/** Momento capturado al soltar; `vx` y `dy` son los del legacy. */
export interface SwipeMomentum {
  readonly vx: number;
  readonly dy: number;
}

/** Pose de la carta. Coincide con `getFlightPose()` del legacy. */
export interface SwipePose {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly rx: number;
  readonly ry: number;
  readonly s: number;
}

/** Rectángulo real en coordenadas de viewport. */
export interface SwipeRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly right?: number;
  readonly bottom?: number;
}

/** Evento de puntero mínimo que el gesto necesita. */
export interface SwipePointerEvent {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly isPrimary: boolean;
  readonly button: number;
}

/** Eventos de puntero que conecta el controlador. */
export type SwipePointerEventType =
  'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'lostpointercapture';

/** Listener tipado del gesto. */
export type SwipePointerListener = (event: SwipePointerEvent) => void;

/**
 * Fuente de Pointer Events inyectable. Un `EventTarget` real se adapta con
 * `createPointerEventSource()`.
 */
export interface SwipePointerSource {
  addEventListener(
    type: SwipePointerEventType,
    listener: SwipePointerListener,
    options?: AddEventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: SwipePointerEventType,
    listener: SwipePointerListener,
    options?: EventListenerOptions | boolean,
  ): void;
}

/**
 * Adapta un `EventTarget` (normalmente la propia carta) a `SwipePointerSource`.
 *
 * El cast es seguro: el target emite `PointerEvent`, que es un superconjunto
 * estructural de `SwipePointerEvent`.
 */
export function createPointerEventSource(target: EventTarget): SwipePointerSource {
  return {
    addEventListener(type, listener, options) {
      // El target emite `PointerEvent` (superconjunto de `SwipePointerEvent`),
      // pero `EventListener` exige la firma de `Event`; el puente es explícito.
      target.addEventListener(type, listener as unknown as EventListener, options);
    },
    removeEventListener(type, listener, options) {
      target.removeEventListener(type, listener as unknown as EventListener, options);
    },
  };
}

/** Estilos que el gesto escribe en la carta. */
export interface SwipeGestureStyle {
  transform: string;
  transition?: string;
  opacity?: string;
  width?: string;
  height?: string;
  setProperty?(name: string, value: string): void;
}

/** Lista de clases mínima usada por el gesto. */
export interface SwipeGestureClassList {
  add(...tokens: string[]): void;
  remove(...tokens: string[]): void;
}

/** Nodo de carta administrado por el gesto (un `HTMLElement` lo satisface). */
export interface SwipeGestureElement {
  readonly style: SwipeGestureStyle;
  readonly classList?: SwipeGestureClassList;
  getBoundingClientRect?(): SwipeRect;
  setPointerCapture?(pointerId: number): void;
  releasePointerCapture?(pointerId: number): void;
}

/** Dependencias inyectables del gesto. */
export interface SwipeGestureDeps {
  /** Fuente de Pointer Events (la carta o un doble de prueba). */
  readonly pointerSource: SwipePointerSource;
  /** Rectángulo real de la carta. Se lee al iniciar para fijar `width`/`height`. */
  readonly getBoundingClientRect: (element: SwipeGestureElement) => SwipeRect;
  /** Rectángulo del stage para la luz; si falta se usa el de la carta. */
  readonly getStageRect?: () => SwipeRect;
  readonly setPointerCapture: (element: SwipeGestureElement, pointerId: number) => void;
  readonly releasePointerCapture: (element: SwipeGestureElement, pointerId: number) => void;
  readonly requestAnimationFrame: (callback: (time: number) => void) => number;
  readonly cancelAnimationFrame: (handle: number) => void;
  readonly matchMedia: (query: string) => { readonly matches: boolean };
  readonly setTimeout: (handler: () => void, ms: number) => number;
  readonly clearTimeout: (handle: number) => void;
  /** Reloj monótono (`performance.now()` en el navegador). */
  readonly now: () => number;
  /** Identidad estable de la carta para `onDecision`. */
  readonly getCardId: () => string;
  /** Gate de inicio (`busy`, `cardReady`, `committed`). Por defecto, siempre. */
  readonly canStart?: () => boolean;
  /** Sello opcional; si se entrega, el controlador lo pinta con `paintSwipeSeal`. */
  readonly seal?: SwipeSealElement | null;
  /** Undercard opcional: recibe transform o `null` para volver al reposo. */
  readonly onUndercard?: (transform: string | null, filter: string | null) => void;
}

/** Estado publicado en cada movimiento del dedo. */
export interface SwipeDragState {
  readonly pose: SwipePose;
  readonly dx: number;
  readonly dy: number;
  readonly vx: number;
  readonly threshold: number;
  readonly strength: number;
  readonly direction: 1 | -1;
  readonly armed: -1 | 0 | 1;
  readonly light: { readonly px: number; readonly py: number };
}

/** Estado publicado al soltar el dedo (con o sin decisión). */
export interface SwipeReleaseState {
  readonly decision: VoteDecision | null;
  readonly flick: boolean;
  readonly dx: number;
  readonly dy: number;
  readonly pose: SwipePose;
  readonly momentum: SwipeMomentum;
}

/** Contexto de una decisión confirmada. */
export interface SwipeDecisionContext {
  readonly cardId: string;
  readonly momentum: SwipeMomentum;
  /** Pose liberada: origen exacto para `launchCard`/`getFlightPose`. */
  readonly pose: SwipePose;
  readonly direction: 1 | -1;
}

/** Callbacks del host. */
export interface SwipeControllerCallbacks {
  /**
   * Decisión confirmada. El host debe reutilizar
   * `@/engines/swipe/flight` (`launchCard`) con `context.momentum` y la pose
   * liberada para conservar la trayectoria.
   */
  onDecision(decision: VoteDecision, context: SwipeDecisionContext): void;
  /**
   * Sello progresivo cuando no se inyectó `deps.seal`; el host debe llamar a
   * `paintSwipeSeal(seal, direction, strength)`.
   */
  onSeal?(direction: number, strength: number): void;
  /** Movimiento del dedo; el transform ya lo aplicó el controlador. */
  onDrag?(state: SwipeDragState): void;
  /** Liberación del dedo; `decision` es `null` si vuelve al origen. */
  onRelease?(state: SwipeReleaseState): void;
  /** El gesto volvió al reposo (no se emite en `cancel()` ni `destroy()`). */
  onReset?(): void;
  /** El dedo levantó la carta (sonido/material del legacy). */
  onLift?(): void;
}

/** API pública del controlador de gesto. */
export interface SwipeController {
  setEnabled(enabled: boolean): void;
  /** Cancela el gesto activo sin decisión; idempotente y silencioso. */
  cancel(): void;
  /** Cancela, libera timers/frames y desconecta eventos. */
  destroy(): void;
  /** Pose actual (copia). Útil para el vuelo y para pruebas. */
  getPose(): SwipePose;
  /** Verdadero mientras el dedo está sobre la carta. */
  isActive(): boolean;
}

const POSE_KEYS = ['x', 'y', 'r', 'rx', 'ry', 's'] as const;

interface MutablePose {
  x: number;
  y: number;
  r: number;
  rx: number;
  ry: number;
  s: number;
}

const REST_POSE: MutablePose = { x: 0, y: 0, r: 0, rx: 0, ry: 0, s: 1 };

const SPRING_STIFFNESS = 1100;
const SPRING_DAMPING = 60;
const MAX_DT_SECONDS = 0.025;
const DEFAULT_DT_SECONDS = 0.016;

const MAX_THRESHOLD = 78;
const THRESHOLD_RATIO = 0.21;
const RELEASE_HYSTERESIS = 0.72;

const MAX_DRAG_RATIO = 0.7;
const DRAG_OVERFLOW_COMPRESSION = 0.45;

const TAP_DISTANCE = 9;
const TAP_SETTLE_DELAY_MS = 160;
const FLICK_WINDOW_MS = 90;
const FLICK_MIN_SPEED = 0.5;
const FLICK_MIN_DISTANCE = 28;
const FLICK_VERTICAL_RATIO = 0.65;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function copyPose(pose: MutablePose): SwipePose {
  return { x: pose.x, y: pose.y, r: pose.r, rx: pose.rx, ry: pose.ry, s: pose.s };
}

function signOf(value: number): -1 | 0 | 1 {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

/**
 * Crea el controlador de gesto de una carta.
 *
 * @param element Nodo cuyo `transform` posee el motor durante el arrastre.
 * @param callbacks Decisión y hooks visuales opcionales.
 * @param deps APIs inyectadas; nunca se leen globals.
 */
export function createSwipeController(
  element: SwipeGestureElement,
  callbacks: SwipeControllerCallbacks,
  deps: SwipeGestureDeps,
): SwipeController {
  const position: MutablePose = { ...REST_POSE };
  const velocity: MutablePose = { x: 0, y: 0, r: 0, rx: 0, ry: 0, s: 0 };
  const target: MutablePose = { ...REST_POSE };

  let enabled = true;
  let destroyed = false;
  /** La decisión ya se emitió; el vuelo es dueño del transform. */
  let committed = false;

  let start: { readonly x: number; readonly y: number } | null = null;
  let dx = 0;
  let dy = 0;
  let vx = 0;
  let lastX = 0;
  let lastTime = 0;
  let lastMove = 0;
  let cardWidth = 0;
  let cardHeight = 0;

  let held = false;
  let armed: -1 | 0 | 1 = 0;
  let frame = 0;
  let previous = 0;
  let releaseTimer: number | null = null;

  let activePointerId: number | null = null;
  let captured = false;

  const reducedMotion = (): boolean => deps.matchMedia(REDUCED_MOTION_QUERY).matches;

  const paint = (): void => {
    element.style.transform =
      `translate3d(${position.x}px,${position.y}px,0) ` +
      `rotate(${position.r}deg) rotateX(${position.rx}deg) ` +
      `rotateY(${position.ry}deg) scale(${position.s})`;
  };

  const stopFrame = (): void => {
    if (frame !== 0) deps.cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  };

  /** Resorte exacto del legacy (`tick`). */
  const tick = (now: number): void => {
    const elapsed = (now - previous) / 1000;
    const dt = Math.min(elapsed || DEFAULT_DT_SECONDS, MAX_DT_SECONDS);
    previous = now;
    let moving = false;
    for (const key of POSE_KEYS) {
      velocity[key] +=
        ((target[key] - position[key]) * SPRING_STIFFNESS - velocity[key] * SPRING_DAMPING) * dt;
      position[key] += velocity[key] * dt;
      if (Math.abs(target[key] - position[key]) > 0.001 || Math.abs(velocity[key]) > 0.01) {
        moving = true;
      }
    }
    paint();
    if (moving) {
      frame = deps.requestAnimationFrame(tick);
    } else {
      frame = 0;
      previous = 0;
    }
  };

  /** Equivalente a `move(values)` del legacy. */
  const move = (values: Partial<MutablePose>): void => {
    Object.assign(target, values);
    if (reducedMotion()) {
      Object.assign(position, target);
      paint();
      return;
    }
    if (frame === 0) frame = deps.requestAnimationFrame(tick);
  };

  const paintSeal = (direction: number, strength: number, emit: boolean): void => {
    if (deps.seal) paintSwipeSeal(deps.seal, direction, strength);
    else if (emit) callbacks.onSeal?.(direction, strength);
  };

  const setIntent = (love: string, pass: string): void => {
    element.style.setProperty?.('--love', love);
    element.style.setProperty?.('--pass', pass);
  };

  const resetUndercard = (emit: boolean): void => {
    if (emit) deps.onUndercard?.(null, null);
  };

  const clearReleaseTimer = (): void => {
    if (releaseTimer !== null) {
      deps.clearTimeout(releaseTimer);
      releaseTimer = null;
    }
  };

  const releaseCapture = (): void => {
    const pointerId = activePointerId;
    activePointerId = null;
    if (!captured || pointerId === null) return;
    captured = false;
    try {
      deps.releasePointerCapture(element, pointerId);
    } catch {
      // La captura ya la liberó el navegador (p. ej. `pointercancel`).
    }
  };

  /**
   * Vuelve al reposo. `emit = false` es el camino silencioso de `cancel()` y
   * `destroy()`: no invoca ninguna callback del host.
   */
  const reset = (emit: boolean): void => {
    clearReleaseTimer();
    held = false;
    armed = 0;
    stopFrame();
    paintSeal(1, 0, emit);
    setIntent('0', '0');
    element.classList?.remove('active', 'lifted');
    move(REST_POSE);
    resetUndercard(emit);
    if (emit) callbacks.onReset?.();
  };

  const clearDecisionFeedback = (): void => {
    stopFrame();
  };

  const light = (x: number, y: number): { px: number; py: number } => {
    // Una carta sin layout aún no puede iluminarse; el centro es el neutro.
    if (!(cardWidth > 0) || !(cardHeight > 0)) return { px: 50, py: 50 };
    const bounds = deps.getStageRect?.() ?? deps.getBoundingClientRect(element);
    const px = clampPercent(
      ((x - (bounds.left + (bounds.width - cardWidth) / 2)) / cardWidth) * 100,
    );
    const py = clampPercent(
      ((y - (bounds.top + (bounds.height - cardHeight) / 2)) / cardHeight) * 100,
    );
    return { px, py };
  };

  const onPointerDown = (event: SwipePointerEvent): void => {
    if (destroyed || !enabled || committed || start) return;
    if (!event.isPrimary || event.button > 0) return;
    if (deps.canStart && !deps.canStart()) return;

    clearReleaseTimer();
    const rect = deps.getBoundingClientRect(element);
    cardWidth = rect.width;
    cardHeight = rect.height;

    start = { x: event.clientX, y: event.clientY };
    lastX = event.clientX;
    lastTime = lastMove = deps.now();
    dx = 0;
    dy = 0;
    vx = 0;
    armed = 0;
    held = true;

    activePointerId = event.pointerId;
    try {
      deps.setPointerCapture(element, event.pointerId);
      captured = true;
    } catch {
      captured = false;
    }

    element.style.transition = 'none';
    element.classList?.remove('dealt', 'returned');
    element.classList?.add('active', 'lifted');

    const point = light(event.clientX, event.clientY);
    move({ s: 1.012, rx: (50 - point.py) * 0.065, ry: (point.px - 50) * 0.065 });
    callbacks.onLift?.();
  };

  const onPointerMove = (event: SwipePointerEvent): void => {
    if (destroyed || !start || committed) return;
    if (activePointerId !== null && event.pointerId !== activePointerId) return;

    const now = deps.now();
    vx = vx * 0.25 + ((event.clientX - lastX) / Math.max(1, now - lastTime)) * 0.75;
    lastX = event.clientX;
    lastTime = lastMove = now;
    dx = event.clientX - start.x;
    dy = event.clientY - start.y;

    const point = light(event.clientX, event.clientY);
    const threshold = Math.min(MAX_THRESHOLD, cardWidth * THRESHOLD_RATIO);
    const strength = threshold > 0 ? Math.min(Math.abs(dx) / threshold, 1) : 0;
    const direction: 1 | -1 = dx > 0 ? 1 : -1;

    const dragX =
      signOf(dx) *
      (Math.min(Math.abs(dx), cardWidth * MAX_DRAG_RATIO) +
        Math.max(0, Math.abs(dx) - cardWidth * MAX_DRAG_RATIO) * DRAG_OVERFLOW_COMPRESSION);
    const arc = swipeArc(dragX, cardWidth);
    const drag: MutablePose = {
      x: dragX,
      y: dy * 0.14 + arc.y,
      r: arc.r,
      rx: (50 - point.py) * 0.04,
      ry: (point.px - 50) * 0.045,
      s: 1.008,
    };

    Object.assign(target, drag);
    Object.assign(position, drag);
    for (const key of POSE_KEYS) velocity[key] = 0;
    paint();

    const newArmed: -1 | 0 | 1 =
      Math.abs(dx) >= threshold
        ? direction
        : Math.abs(dx) < threshold * RELEASE_HYSTERESIS || direction !== armed
          ? 0
          : armed;
    armed = newArmed;
    paintSeal(direction, strength, true);
    setIntent(dx > 0 ? String(strength) : '0', dx < 0 ? String(strength) : '0');

    if (!reducedMotion() && deps.onUndercard) {
      deps.onUndercard(
        `translateY(${4 * (1 - strength)}px) scale(${0.98 + strength * 0.02})`,
        'none',
      );
    }

    callbacks.onDrag?.({
      pose: copyPose(position),
      dx,
      dy,
      vx,
      threshold,
      strength,
      direction,
      armed,
      light: point,
    });
  };

  const onPointerUp = (event: SwipePointerEvent): void => {
    if (destroyed || !start || committed) return;
    if (activePointerId !== null && event.pointerId !== activePointerId) return;

    start = null;
    releaseCapture();
    const now = deps.now();
    const flick =
      now - lastMove < FLICK_WINDOW_MS &&
      Math.abs(vx) > FLICK_MIN_SPEED &&
      Math.abs(dx) > FLICK_MIN_DISTANCE &&
      Math.abs(dx) > Math.abs(dy) * FLICK_VERTICAL_RATIO &&
      Math.sign(vx) === Math.sign(dx);

    const momentum: SwipeMomentum = { vx, dy };
    const decided = (armed !== 0 && Math.sign(dx) === armed) || flick;

    if (decided) {
      clearDecisionFeedback();
      committed = true;
      const direction: 1 | -1 = dx > 0 ? 1 : -1;
      const decision: VoteDecision = dx > 0 ? 'yes' : 'no';
      const pose = copyPose(position);

      if (deps.seal) {
        // `commitDecision`: solo completa el sello si seguía invisible.
        if (!(Number(deps.seal.style.opacity) > 0)) paintSwipeSeal(deps.seal, direction, 1);
      }

      const context: SwipeDecisionContext = {
        cardId: deps.getCardId(),
        momentum,
        pose,
        direction,
      };
      callbacks.onDecision(decision, context);
      if (!destroyed) {
        callbacks.onRelease?.({
          decision,
          flick,
          dx,
          dy,
          pose,
          momentum,
        });
      }
    } else {
      callbacks.onRelease?.({
        decision: null,
        flick,
        dx,
        dy,
        pose: copyPose(position),
        momentum,
      });

      if (Math.abs(dx) < TAP_DISTANCE && Math.abs(dy) < TAP_DISTANCE) {
        move({ s: 1.018, rx: 0, ry: 0 });
        releaseTimer = deps.setTimeout(() => {
          releaseTimer = null;
          reset(true);
        }, TAP_SETTLE_DELAY_MS);
      } else {
        reset(true);
      }
    }
  };

  const onPointerCancel = (event: SwipePointerEvent): void => {
    if (destroyed || !start) return;
    if (activePointerId !== null && event.pointerId !== activePointerId) return;
    start = null;
    releaseCapture();
    reset(true);
  };

  const onLostPointerCapture = (event: SwipePointerEvent): void => {
    if (destroyed || committed || !start) return;
    if (activePointerId !== null && event.pointerId !== activePointerId) return;
    start = null;
    releaseCapture();
    reset(true);
  };

  deps.pointerSource.addEventListener('pointerdown', onPointerDown);
  deps.pointerSource.addEventListener('pointermove', onPointerMove);
  deps.pointerSource.addEventListener('pointerup', onPointerUp);
  deps.pointerSource.addEventListener('pointercancel', onPointerCancel);
  deps.pointerSource.addEventListener('lostpointercapture', onLostPointerCapture);

  const cancel = (): void => {
    if (destroyed || committed) return;
    // Idempotente: si ya está en reposo (o volviendo a él) no hace nada más.
    if (!start && !held && releaseTimer === null) return;
    start = null;
    releaseCapture();
    reset(false);
  };

  return {
    setEnabled(value: boolean): void {
      if (destroyed || enabled === value) return;
      enabled = value;
      if (!enabled) cancel();
    },
    cancel,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clearReleaseTimer();
      stopFrame();
      releaseCapture();
      if (!committed) {
        committed = true;
        reset(false);
        // `destroy()` no puede dejar frames vivos: se aplica el reposo ya.
        stopFrame();
        Object.assign(position, REST_POSE);
        Object.assign(target, REST_POSE);
        for (const key of POSE_KEYS) velocity[key] = 0;
        paint();
      }
      deps.pointerSource.removeEventListener('pointerdown', onPointerDown);
      deps.pointerSource.removeEventListener('pointermove', onPointerMove);
      deps.pointerSource.removeEventListener('pointerup', onPointerUp);
      deps.pointerSource.removeEventListener('pointercancel', onPointerCancel);
      deps.pointerSource.removeEventListener('lostpointercapture', onLostPointerCapture);
    },
    getPose(): SwipePose {
      return copyPose(position);
    },
    isActive(): boolean {
      return start !== null;
    },
  };
}
