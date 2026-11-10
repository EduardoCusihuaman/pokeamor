/**
 * Coordinador de trabajo secundario detrás del gesto/vuelo activo.
 *
 * Migrado de `afterSwipe`/`flushSwipeTasks` en `src/app.js`. Conserva dos
 * contratos exactos del legacy:
 *
 * 1. Las tareas se agrupan por clave: una llamada nueva reemplaza el `run`
 *    anterior sin duplicar la tarea.
 * 2. El trabajo durable conserva **su deadline original** mientras el usuario
 *    sigue haciendo swipe. Solo la primera llamada de una clave fija el
 *    deadline (`now + maxWait`); las siguientes lo reutilizan. Por eso una
 *    tarea con `maxWait = 500` no se pospone indefinidamente bajo gestos
 *    continuos.
 *
 * `isBlocked` representa `#stage .card.lifted, #stage .card.exiting`: mientras
 * haya una carta levantada o saliendo, el trabajo secundario espera (salvo que
 * el deadline durable ya haya vencido). El motor no consulta el DOM ni `window`
 * directamente: todo se inyecta.
 */

/** Selector legacy que bloquea el trabajo secundario durante un gesto/vuelo. */
export const SWIPE_LOCK_SELECTOR = '#stage .card.lifted,#stage .card.exiting';

/** Dependencias inyectables del coordinador. */
export interface SwipeCoordinatorDeps {
  /** Verdadero si hay una carta levantada o una salida en curso. */
  readonly isBlocked: () => boolean;
  /** Reloj monótono (`performance.now()` en el navegador). */
  readonly now: () => number;
  /** `setTimeout` del entorno; devuelve un handle numérico. */
  readonly setTimeout: (handler: () => void, ms: number) => number;
  /** `clearTimeout` del entorno. */
  readonly clearTimeout: (handle: number) => void;
}

interface SwipeTask {
  run: () => void;
  readonly deadline: number;
  timer: number | null;
}

/** API pública del coordinador. */
export interface SwipeCoordinator {
  /**
   * Encola (o reemplaza) una tarea con la clave dada.
   *
   * @param key Identificador de la tarea (`persist`, `engine`, `surface`…).
   * @param run Trabajo a ejecutar.
   * @param maxWait Espera máxima en ms antes de forzar la ejecución. Solo la
   *   primera llamada de una clave fija el deadline; `Infinity` (por defecto)
   *   significa que solo corre cuando el deck se libera.
   */
  afterSwipe(key: string, run: () => void, maxWait?: number): void;
  /** Ejecuta ahora las tareas que ya pueden correr (respeta bloqueo/deadline). */
  flush(): void;
  /** Programa un `flush` en el próximo tick (equivalente a `setTimeout(..., 0)`). */
  flushSoon(): void;
  /** Cancela una tarea pendiente sin ejecutarla. */
  cancel(key: string): boolean;
  /** Cancela todas las tareas pendientes. */
  clear(): void;
  /** Cantidad de tareas pendientes (instrumentación). */
  readonly size: number;
}

/**
 * Crea el coordinador de trabajo diferido del swipe.
 *
 * El orden de operaciones replica el legacy: reemplazar `run`, conservar el
 * deadline previo, reprogramar el timer y, si el deck ya está libre, vaciar la
 * cola de inmediato.
 */
export function createSwipeCoordinator(deps: SwipeCoordinatorDeps): SwipeCoordinator {
  const tasks = new Map<string, SwipeTask>();

  const flush = (): void => {
    // La instantánea evita reejecutar tareas encoladas por una tarea en curso.
    for (const [key, task] of [...tasks]) {
      if (deps.isBlocked() && deps.now() < task.deadline) continue;
      tasks.delete(key);
      if (task.timer !== null) deps.clearTimeout(task.timer);
      task.run();
    }
  };

  const afterSwipe = (key: string, run: () => void, maxWait = Infinity): void => {
    const previous = tasks.get(key);
    if (previous && previous.timer !== null) deps.clearTimeout(previous.timer);
    const deadline = previous?.deadline ?? deps.now() + maxWait;
    const task: SwipeTask = { run, deadline, timer: null };
    tasks.set(key, task);
    if (Number.isFinite(deadline)) {
      task.timer = deps.setTimeout(flush, Math.max(0, deadline - deps.now()));
    }
    if (!deps.isBlocked()) flush();
  };

  const flushSoon = (): void => {
    deps.setTimeout(flush, 0);
  };

  const cancel = (key: string): boolean => {
    const task = tasks.get(key);
    if (!task) return false;
    tasks.delete(key);
    if (task.timer !== null) deps.clearTimeout(task.timer);
    return true;
  };

  const clear = (): void => {
    for (const task of tasks.values()) {
      if (task.timer !== null) deps.clearTimeout(task.timer);
    }
    tasks.clear();
  };

  return {
    afterSwipe,
    flush,
    flushSoon,
    cancel,
    clear,
    get size() {
      return tasks.size;
    },
  };
}

/** Objetivo mínimo de eventos para enlazar el flush de liberación. */
export interface SwipeReleaseTarget {
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

/**
 * Enlaza `pointerup`/`pointercancel` para vaciar la cola en el próximo tick.
 *
 * El legacy hacía `setTimeout(flushSwipeTasks, 0)` para no competir con el
 * handler de la carta que acaba de liberar el gesto. Devuelve el cleanup; es
 * obligatorio llamarlo al desmontar (plan §6).
 */
export function bindSwipeReleaseFlush(
  target: SwipeReleaseTarget,
  coordinator: SwipeCoordinator,
): () => void {
  const listener = (): void => coordinator.flushSoon();
  target.addEventListener('pointerup', listener, { passive: true });
  target.addEventListener('pointercancel', listener, { passive: true });
  return () => {
    target.removeEventListener('pointerup', listener);
    target.removeEventListener('pointercancel', listener);
  };
}
