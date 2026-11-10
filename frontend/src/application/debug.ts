/**
 * Modo depuración: previsualización por pulsación larga y arrastre entre tiles.
 *
 * Extraído de `src/app.js`: `bindDebugPress`, `debugTileAtPoint`,
 * `moveDebugPeek` y `paintDebugPeek`. Es un módulo de aplicación independiente
 * del framework: no importa Svelte ni usa globals; el documento, los timers, el
 * puente de imágenes y las acciones de selección/overlay se inyectan.
 *
 * Contratos preservados:
 * - Una pulsación larga de 350 ms muestra la previsualización y llama a
 *   `tactile('choose')`, sin seleccionar ni abrir la carta.
 * - Mover más de 9 px antes del umbral cancela la pulsación (scroll incluido).
 * - Tras la pulsación larga, mover el puntero cambia la previsualización al tile
 *   bajo el dedo. Los gutters de 3 px por lado no cuentan como tile.
 * - El preview reutiliza la imagen de sesión y delega la carga en
 *   `PokeResources.bindImage` con `priority: 0`; cada pintura invalida la
 *   anterior con el serial de la sesión.
 * - La selección en modo depuración solo ocurre en un tap corto (click) o con
 *   Enter/Espacio, nunca después de una pulsación larga.
 *
 * La creación/eliminación del overlay (`#debug-peek`), los listeners globales y
 * el auto-scroll por borde (`tickDebugPeek`) quedan en la capa de presentación;
 * este módulo solo decide qué tile se pinta y cómo se carga su imagen.
 */

/** Carta mínima que se pinta en el zoom de depuración. */
export interface DebugPeekCard {
  readonly name: string;
  readonly image?: string;
  readonly fallbackImage?: string;
}

/** Rectángulo mínimo de un tile; evita depender de `DOMRect`. */
export interface DebugRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Operaciones de clase que el tile expone al preview. */
export interface DebugClassList {
  add(token: string): void;
  remove(token: string): void;
}

/** Tile de la grilla con metadatos de depuración. */
export interface DebugTile {
  readonly debugPokemon?: DebugPeekCard | null;
  readonly classList: DebugClassList;
  getBoundingClientRect(): DebugRect;
}

/** Elemento devuelto por `elementFromPoint`; `closest` puede no existir. */
export interface DebugTileElement {
  closest?(selector: string): DebugTile | null;
}

/** Subconjunto del documento que necesita el hit-test. */
export interface DebugTileDocument {
  elementFromPoint(x: number, y: number): DebugTileElement | null;
  querySelectorAll(selector: string): Iterable<DebugTile>;
}

/** Imagen del overlay de preview. */
export interface DebugPeekImage {
  src: string;
  alt: string;
  onerror?: ((event: unknown) => void) | null;
}

/**
 * Estado de la previsualización.
 *
 * `serial` invalida peticiones de imagen anteriores; `sharpTimer` es el timer
 * de imagen nítida que el legacy limpiaba al repintar.
 */
export interface DebugPeekSession {
  readonly image: DebugPeekImage;
  tile: DebugTile | null;
  x?: number;
  y?: number;
  serial: number;
  sharpTimer?: unknown;
  /** Dirección del auto-scroll por borde (-1, 0, 1). */
  edge?: number;
  edgeSince?: number;
  lastFrame?: number;
}

/** Puente de recursos para cargar la imagen del preview. */
export interface DebugPeekResourceBridge {
  bindImage(image: DebugPeekImage, card: DebugPeekCard, options: { priority: number }): void;
}

/** Timers inyectables usados al invalidar la imagen anterior. */
export interface DebugPeekTimers {
  clearTimeout(handle: unknown): void;
}

/** Dependencias de `paintDebugPeek`. */
export interface DebugPeekPaintOptions {
  readonly session: DebugPeekSession;
  readonly resources: DebugPeekResourceBridge;
  readonly timers: DebugPeekTimers;
}

/** Dependencias de `moveDebugPeek`. */
export interface DebugPeekMoveOptions {
  readonly session: DebugPeekSession | null | undefined;
  readonly document: DebugTileDocument;
  readonly paint: (card: DebugPeekCard, tile: DebugTile) => void;
}

/** Tolerancia en píxeles entre el borde del tile y el punto válido. */
export const DEBUG_TILE_GUTTER = 3;

/** Duración de la pulsación larga en milisegundos. */
export const DEBUG_LONG_PRESS_MS = 350;

/** Movimiento máximo, en píxeles, antes de cancelar la pulsación. */
export const DEBUG_PRESS_MOVE_TOLERANCE = 9;

/**
 * Devuelve el tile bajo `(x, y)` o `null` si el punto cae en un gutter.
 *
 * Primero consulta `elementFromPoint` (el dedo puede estar sobre un hijo) y
 * después recorre la grilla, igual que el legacy, para tolerar navegadores que
 * devuelven otro elemento durante el gesto.
 */
export function debugTileAtPoint(
  x: number,
  y: number,
  document: DebugTileDocument,
): DebugTile | null {
  const contains = (tile: DebugTile | null | undefined): tile is DebugTile => {
    if (!tile?.debugPokemon) return false;
    const rect = tile.getBoundingClientRect();
    return (
      x >= rect.left + DEBUG_TILE_GUTTER &&
      x <= rect.right - DEBUG_TILE_GUTTER &&
      y >= rect.top + DEBUG_TILE_GUTTER &&
      y <= rect.bottom - DEBUG_TILE_GUTTER
    );
  };

  const hit = document.elementFromPoint(x, y)?.closest?.('#grid .tile');
  if (contains(hit)) return hit;

  for (const tile of document.querySelectorAll('#grid .tile')) {
    if (contains(tile)) return tile;
  }

  return null;
}

/**
 * Mueve el preview al tile bajo el dedo.
 *
 * Es un no-op si no hay sesión o si el punto cae en un gutter: en ese caso se
 * conserva la previsualización actual.
 */
export function moveDebugPeek(x: number, y: number, options: DebugPeekMoveOptions): void {
  const { session, document, paint } = options;
  if (!session) return;

  session.x = x;
  session.y = y;

  const tile = debugTileAtPoint(x, y, document);
  if (tile?.debugPokemon && tile !== session.tile) paint(tile.debugPokemon, tile);
}

/**
 * Pinta `card` en el tile indicado reutilizando la imagen de la sesión.
 *
 * Repintar el mismo tile no hace nada. Al cambiar de tile se quita
 * `debug-inspecting` del anterior, se incrementa el serial y se delega la carga
 * de la imagen al coordinador de recursos.
 */
export function paintDebugPeek(
  card: DebugPeekCard,
  tile: DebugTile,
  options: DebugPeekPaintOptions,
): void {
  const { session, resources, timers } = options;
  if (session.tile === tile) return;

  session.tile?.classList.remove('debug-inspecting');
  session.tile = tile;
  tile.classList.add('debug-inspecting');

  const image = session.image;
  session.serial++;
  image.alt = card.name;
  timers.clearTimeout(session.sharpTimer);
  resources.bindImage(image, card, { priority: 0 });
}

/** Carta mínima que `bindDebugPress` transporta hasta los callbacks. */
export interface DebugPressCard {
  readonly name?: string;
  readonly card?: string | null;
}

/** Evento de pulsación inicial. */
export interface DebugPressPointerEvent {
  readonly isPrimary: boolean;
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
}

/** Evento de movimiento del puntero. */
export interface DebugPressMoveEvent {
  readonly clientX: number;
  readonly clientY: number;
}

/** Evento táctil usado para arrastrar el preview en iOS. */
export interface DebugPressTouch {
  readonly clientX: number;
  readonly clientY: number;
}

export interface DebugPressTouchEvent {
  readonly cancelable: boolean;
  readonly touches: ArrayLike<DebugPressTouch>;
  preventDefault(): void;
}

export interface DebugPressClickEvent {
  preventDefault(): void;
}

export interface DebugPressKeyEvent {
  readonly key: string;
  preventDefault(): void;
}

export interface DebugPressPreventableEvent {
  preventDefault(): void;
}

/** Botón de la grilla intervenido por el modo depuración. */
export interface DebugPressButton {
  debugPokemon?: DebugPressCard | null;
  readonly style: { touchAction?: string };
  readonly classList: DebugClassList;
  addEventListener(
    type: 'touchmove',
    listener: (event: DebugPressTouchEvent) => void,
    options: { passive: boolean },
  ): void;
  ondragstart?: (event: DebugPressPreventableEvent) => void;
  oncontextmenu?: (event: DebugPressPreventableEvent) => void;
  onpointerdown?: (event: DebugPressPointerEvent) => void;
  onpointermove?: (event: DebugPressMoveEvent) => void;
  onpointerup?: () => void;
  onpointercancel?: () => void;
  onlostpointercapture?: () => void;
  onclick?: (event: DebugPressClickEvent) => void;
  onkeydown?: (event: DebugPressKeyEvent) => void;
}

/** Timers del long-press. */
export interface DebugPressTimers {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Dependencias de `bindDebugPress`. */
export interface DebugPressDeps {
  readonly timers: DebugPressTimers;
  readonly isSelectionMode: () => boolean;
  readonly toggleSelection: (card: DebugPressCard) => void;
  readonly syncSelection: () => void;
  readonly tactile: (kind: 'choose') => void;
  readonly hasPeek: () => boolean;
  readonly showPeek: (
    card: DebugPressCard,
    tile: DebugPressButton,
    point: { x: number; y: number },
  ) => void;
  readonly hidePeek: () => void;
  readonly movePeek: (x: number, y: number) => void;
}

/**
 * Conecta un tile de la grilla con la pulsación larga de depuración.
 *
 * Un tap corto no hace nada fuera del modo selección; dentro del modo
 * selección alterna la carta. Una pulsación larga muestra el preview, y
 * cualquier movimiento posterior scrubbea el tile bajo el dedo. Soltar,
 * cancelar, perder la captura o hacer scroll ocultan el preview.
 */
export function bindDebugPress(
  button: DebugPressButton,
  card: DebugPressCard,
  deps: DebugPressDeps,
): void {
  button.debugPokemon = card;

  let timer: unknown = null;
  let start: { x: number; y: number } | null = null;
  let held = false;

  const cancel = (): void => {
    deps.timers.clearTimeout(timer);
    timer = null;
    start = null;
    button.classList.remove('pressing');
    deps.hidePeek();
  };

  button.style.touchAction = 'pan-y';
  button.ondragstart = (event) => event.preventDefault();
  button.oncontextmenu = (event) => event.preventDefault();

  button.onpointerdown = (event) => {
    if (!event.isPrimary || event.button > 0) return;

    cancel();
    held = false;
    start = { x: event.clientX, y: event.clientY };
    button.classList.add('pressing');

    timer = deps.timers.setTimeout(() => {
      if (!start) return;
      held = true;
      button.classList.remove('pressing');
      deps.showPeek(card, button, start);
      deps.tactile('choose');
    }, DEBUG_LONG_PRESS_MS);
  };

  button.addEventListener(
    'touchmove',
    (event) => {
      if (held && deps.hasPeek()) {
        if (event.cancelable) event.preventDefault();
        const touch = event.touches[0];
        if (touch) deps.movePeek(touch.clientX, touch.clientY);
      }
    },
    { passive: false },
  );

  button.onpointermove = (event) => {
    if (held && deps.hasPeek()) {
      deps.movePeek(event.clientX, event.clientY);
      return;
    }

    if (
      start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > DEBUG_PRESS_MOVE_TOLERANCE
    ) {
      held = true;
      cancel();
    }
  };

  button.onpointerup = cancel;
  button.onpointercancel = () => {
    cancel();
    held = true;
  };
  button.onlostpointercapture = cancel;

  button.onclick = (event) => {
    if (held) {
      event.preventDefault();
      return;
    }
    if (deps.isSelectionMode()) {
      deps.toggleSelection(card);
      deps.syncSelection();
    }
  };

  button.onkeydown = (event) => {
    if (event.key === 'Enter') held = false;
    if (event.key === ' ') {
      event.preventDefault();
      held = false;
      if (deps.isSelectionMode()) {
        deps.toggleSelection(card);
        deps.syncSelection();
      }
    }
  };
}
