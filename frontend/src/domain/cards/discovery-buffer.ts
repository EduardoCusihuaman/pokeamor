/**
 * Buffer de presentaciones para la continuidad del swipe.
 *
 * Módulo de dominio/motor independiente del framework: no toca Svelte, DOM ni
 * globals. Mantiene **una presentación por encuentro próximo** y reutiliza la
 * misma imagen cuando se vuelve atrás o se promueve la carta a interactiva.
 *
 * Contratos (plan §7):
 * - `get` devuelve la presentación existente; una entrada `released` se
 *   descarta y se vuelve a preparar.
 * - `take` transfiere la propiedad de la presentación una sola vez; `front`
 *   recibe el índice 0 y el resto el 1.
 * - `reconcile` conserva una ventana adaptativa (`5..max`): se expande si el
 *   consumo es rápido (< 300 ms) y se reduce si es lento (> 1500 ms).
 * - La ventana respeta `pixelBudget` a partir del cuarto elemento; las
 *   entradas fuera de la ventana se descartan y solo se liberan si siguen
 *   siendo propiedad del buffer (las transferencias activas no se tocan).
 * - `invalidate` libera únicamente si el buffer sigue siendo el dueño.
 */

/** Imagen mínima necesaria para estimar el costo de memoria. */
export interface DiscoveryImage {
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

/**
 * Presentación preparada por el motor de imágenes.
 *
 * `status` observado: `loading`, `ready`, `released`. `owner` identifica al
 * responsable de liberarla (`buffer`, `front`, `back`, `flight`, …).
 */
export interface DiscoveryEntry {
  readonly image: DiscoveryImage;
  status: string;
  owner: string;
  /** Marca de uso asignada por el buffer; la más alta es la más reciente. */
  used?: number;
  /** Transfiere la propiedad; el segundo argumento es la prioridad de slot. */
  transferTo(owner: string, index?: number): void;
  /** Libera la presentación; solo debe llamarse desde el dueño. */
  release(): void;
}

/** Opciones de construcción del buffer. */
export interface DiscoveryBufferOptions<P, E extends DiscoveryEntry = DiscoveryEntry> {
  /** Clave estable del encuentro (por ejemplo `Card.card`). */
  readonly key: (payload: P) => string;
  /** Prepara una presentación nueva; no debe reutilizar entradas `released`. */
  readonly prepare: (payload: P) => E;
  /** Tamaño máximo de la ventana adaptativa. */
  readonly max?: number;
  /** Presupuesto de píxeles para la especulación. */
  readonly pixelBudget?: number;
  /** Reloj inyectable para la adaptación de la ventana. */
  readonly now?: () => number;
}

/** Instantánea observable del buffer. */
export interface DiscoverySnapshot {
  readonly entries: number;
  readonly readyPrefix: number;
  readonly windowSize: number;
}

/** API pública del buffer. */
export interface DiscoveryBuffer<P, E extends DiscoveryEntry = DiscoveryEntry> {
  get(payload: P): E;
  take(payload: P, owner: string): E;
  /** Ajusta la ventana a la cola actual y libera lo que quedó fuera. */
  reconcile(queue: readonly P[]): void;
  invalidate(payload: P): void;
  snapshot(queue: readonly P[]): DiscoverySnapshot;
}

const DEFAULT_MAX = 10;
const DEFAULT_PIXEL_BUDGET = 24 * 1024 * 1024;
const DEFAULT_PIXEL_COST = 2 * 1024 * 1024;
const MIN_WINDOW = 5;

/**
 * Crea un buffer aislado.
 *
 * No comparte caché entre instancias: el estado descargado vive fuera de este
 * módulo y está pensado para compartirse entre pantallas mediante `prepare`.
 */
export function create<P, E extends DiscoveryEntry = DiscoveryEntry>({
  key,
  prepare,
  max = DEFAULT_MAX,
  pixelBudget = DEFAULT_PIXEL_BUDGET,
  now = () => Date.now(),
}: DiscoveryBufferOptions<P, E>): DiscoveryBuffer<P, E> {
  const entries = new Map<string, E>();
  let sequence = 0;
  let windowSize = MIN_WINDOW;
  let lastKey: string | null = null;
  let lastAdvance = 0;

  function get(payload: P): E {
    const id = key(payload);
    let entry = entries.get(id);

    if (entry?.status === 'released') {
      entries.delete(id);
      entry = undefined;
    }

    if (!entry) {
      entry = prepare(payload);
      entry.used = ++sequence;
      entries.set(id, entry);
    }

    return entry;
  }

  function reconcile(queue: readonly P[]): void {
    const head = queue[0];
    if (head && key(head) !== lastKey) {
      const time = now();
      if (lastKey !== null) {
        const interval = time - lastAdvance;
        if (interval < 300) windowSize = Math.min(max, windowSize + 1);
        else if (interval > 1500) windowSize = Math.max(MIN_WINDOW, windowSize - 1);
      }
      lastKey = key(head);
      lastAdvance = time;
    }

    const keep = new Set<string>();
    let pixels = 0;

    for (const [index, payload] of queue.slice(0, windowSize).entries()) {
      const id = key(payload);
      const entry = entries.get(id);
      const cost = entry
        ? entry.image.naturalWidth * entry.image.naturalHeight * 4 || DEFAULT_PIXEL_COST
        : DEFAULT_PIXEL_COST;

      if (index >= 3 && pixels + cost > pixelBudget) break;

      keep.add(id);
      pixels += cost;
      get(payload);
    }

    for (const [id, entry] of entries) {
      if (keep.has(id)) continue;
      entries.delete(id);
      if (entry.owner === 'buffer') entry.release();
    }
  }

  function take(payload: P, owner: string): E {
    const entry = get(payload);
    entry.transferTo(owner, owner === 'front' ? 0 : 1);
    return entry;
  }

  function invalidate(payload: P): void {
    const id = key(payload);
    const entry = entries.get(id);
    if (entry?.owner === 'buffer') entry.release();
    entries.delete(id);
  }

  function snapshot(queue: readonly P[]): DiscoverySnapshot {
    let readyPrefix = 0;
    for (const payload of queue) {
      if (entries.get(key(payload))?.status !== 'ready') break;
      readyPrefix += 1;
    }
    return { entries: entries.size, readyPrefix, windowSize };
  }

  return { get, take, reconcile, invalidate, snapshot };
}
