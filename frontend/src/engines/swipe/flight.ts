/**
 * Vuelo de salida de una carta decidida.
 *
 * Migrado de `swipeArc`/`launchCard` en `src/app.js`. Conserva exactamente:
 *
 * - La curva compartida con el arrastre: `x` se convierte en ángulo
 *   (`atan(x / (2 · width))`); el descenso es `width · 0.4 · (1 − cos)` y la
 *   rotación es `0.65 · ángulo` en grados. La curva es simétrica.
 * - La trayectoria sale de la **pose liberada** (`getFlightPose()`), no del
 *   centro: posición, rotación y tilt continúan desde donde quedó el dedo.
 * - La distancia suma `max(width, height) · 0.3 + 24` para que el borde
 *   delantero/trasero despeje el viewport.
 * - La duración queda acotada a `[180, 260]` ms y depende de la velocidad
 *   horizontal (`|vx|`), con un mínimo de 2.
 * - 17 keyframes lineales, opacidad 1 en todos (el arte no se desvanece).
 * - Vuelos concurrentes: cada invocación mantiene su propio cierre, timer y
 *   cancelación; no hay estado compartido.
 * - `prefers-reduced-motion` retira la carta de inmediato, sin animación.
 * - La finalización es idempotente y libera presentación, animación y gate de
 *   material una sola vez; una carta cancelada/undo no se retira dos veces.
 *
 * El motor no importa Svelte ni lee `window`: recibe pose, rectángulo,
 * `animate`, timers y el ancho del viewport por inyección.
 */

/** Punto de la curva compartida entre arrastre y vuelo. */
export interface SwipeArc {
  /** Descenso vertical de la curva en px. */
  readonly y: number;
  /** Rotación de la curva en grados. */
  readonly r: number;
}

/**
 * Curva simétrica del swipe.
 *
 * `swipeArc(-x, w).y === swipeArc(x, w).y` y las rotaciones son opuestas.
 */
export function swipeArc(x: number, width: number): SwipeArc {
  const angle = Math.atan(x / Math.max(1, width * 2));
  return {
    y: width * 0.4 * (1 - Math.cos(angle)),
    r: ((angle * 180) / Math.PI) * 0.65,
  };
}

/** Pose de la carta en el momento de liberar el dedo. */
export interface FlightPose {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly rx: number;
  readonly ry: number;
  readonly s: number;
}

/** Momento capturado por el gesto; solo `vx` afecta la duración. */
export interface FlightMomentum {
  readonly vx?: number;
  readonly dy?: number;
}

/** Rectángulo real de la carta (coordenadas de viewport). */
export interface FlightRect {
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}

/** Keyframe de la Web Animations API. */
export interface FlightFrame {
  readonly offset: number;
  readonly opacity: number;
  readonly transform: string;
}

/** Opciones pasadas a `animate()`. */
export interface FlightAnimationOptions {
  readonly duration: number;
  readonly easing: 'linear';
  readonly fill: 'forwards';
}

/** Animación mínima que el motor necesita. */
export interface FlightAnimation {
  readonly finished: Promise<unknown>;
  cancel?(): void;
}

/** Estilos que el vuelo escribe en la carta. */
export interface FlightStyle {
  width?: string;
  height?: string;
  transition?: string;
  opacity?: string;
}

/** Presentación transferible que posee la carta (plan §7). */
export interface FlightPresentation {
  transferTo(owner: string, priority: number): void;
  release(): void;
}

/** Nodo de carta administrado por el motor de swipe. */
export interface SwipeFlightNode {
  readonly style: FlightStyle;
  readonly clientWidth: number;
  readonly clientHeight: number;
  /** Pose actual; si falta se usa el reposo. */
  getFlightPose?(): FlightPose | null | undefined;
  getBoundingClientRect(): FlightRect;
  animate(frames: FlightFrame[], options: FlightAnimationOptions): FlightAnimation;
  stopMotion?(): void;
  remove(): void;
  presentation?: FlightPresentation | null;
  /** Se asigna durante el vuelo para que undo pueda cancelarlo. */
  cancelFlight?: () => void;
  /** Solo diagnóstico del adaptador: una carta desmontada no revive el vuelo. */
  isConnected?: boolean;
}

/** Dependencias inyectables del vuelo. */
export interface SwipeFlightDeps {
  /** `innerWidth` del viewport. */
  readonly viewportWidth: number;
  /** `matchMedia('(prefers-reduced-motion: reduce)').matches`, leído al lanzar. */
  readonly isReducedMotion: () => boolean;
  readonly setTimeout: (handler: () => void, ms: number) => number;
  readonly clearTimeout: (handle: number) => void;
  /** `PokeMaterial.beginFlight()`: devuelve el release del gate. */
  readonly beginFlight?: () => (() => void) | undefined;
  /** Vacía la cola de trabajo diferido al terminar/cancelar. */
  readonly flushSwipeTasks?: () => void;
  readonly isDiscoveryComplete?: () => boolean;
  readonly render?: () => void;
}

/** Handle del vuelo lanzado. */
export interface SwipeFlight {
  /** Cancela y limpia el vuelo; idempotente. */
  cancel(): void;
  readonly duration: number;
  readonly frames: readonly FlightFrame[];
}

const REST_POSE: FlightPose = { x: 0, y: 0, r: 0, rx: 0, ry: 0, s: 1 };

const FRAME_COUNT = 17;

function buildFrames(
  pose: FlightPose,
  direction: 1 | -1,
  distance: number,
  width: number,
): FlightFrame[] {
  const origin = swipeArc(pose.x, width);
  return Array.from({ length: FRAME_COUNT }, (_, index) => {
    const t = index / (FRAME_COUNT - 1);
    const x = pose.x + direction * distance * t;
    const arc = swipeArc(x, width);
    const y = pose.y + (arc.y - origin.y);
    const r = pose.r + (arc.r - origin.r);
    return {
      offset: t,
      opacity: 1,
      transform:
        `translate3d(${x}px,${y}px,0) rotate(${r}deg) ` +
        `rotateX(${pose.rx}deg) rotateY(${pose.ry}deg) scale(${pose.s})`,
    };
  });
}

/**
 * Lanza una carta fuera de la pantalla.
 *
 * @returns El handle del vuelo, o `null` si se retiró por reduced motion.
 */
export function launchCard(
  node: SwipeFlightNode,
  value: 'yes' | 'no',
  momentum: FlightMomentum,
  deps: SwipeFlightDeps,
): SwipeFlight | null {
  if (deps.isReducedMotion()) {
    node.stopMotion?.();
    node.presentation?.release();
    node.remove();
    deps.flushSwipeTasks?.();
    return null;
  }

  const pose = node.getFlightPose?.() ?? REST_POSE;
  const rect = node.getBoundingClientRect();
  const direction: 1 | -1 = value === 'yes' ? 1 : -1;
  const distance =
    Math.max(0, direction > 0 ? deps.viewportWidth - rect.left : rect.right) +
    Math.max(rect.width, rect.height) * 0.3 +
    24;
  const duration = Math.max(180, Math.min(260, distance / Math.max(2, Math.abs(momentum.vx || 0))));
  const frames = buildFrames(pose, direction, distance, node.clientWidth);

  node.style.width = `${node.clientWidth}px`;
  node.style.height = `${node.clientHeight}px`;
  node.style.transition = 'none';
  node.style.opacity = '1';

  const resumeMaterial = deps.beginFlight?.();
  const flight = node.animate(frames, { duration, easing: 'linear', fill: 'forwards' });

  let timer: number | null = null;
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    if (timer !== null) deps.clearTimeout(timer);
    node.stopMotion?.();
    node.presentation?.release();
    node.remove();
    flight.cancel?.();
    resumeMaterial?.();
    deps.flushSwipeTasks?.();
    if (deps.isDiscoveryComplete?.()) deps.render?.();
  };

  node.cancelFlight = finish;
  node.presentation?.transferTo('flight', 0);
  flight.finished.then(
    () => finish(),
    () => finish(),
  );
  timer = deps.setTimeout(finish, duration + 250);

  return { cancel: finish, duration, frames };
}
