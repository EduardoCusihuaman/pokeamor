/**
 * Cierre del detalle con retorno animado a la miniatura de origen
 * (`src/app.js`: `closeDetail`, con el estado de retorno).
 *
 * Módulo de aplicación independiente del framework: no importa Svelte ni
 * consulta globals. El diálogo, la imagen grande, el origen, el sheet, el body,
 * los timers y `matchMedia` se inyectan. El módulo no mueve la miniatura
 * visible: la oculta, clona la imagen grande y vuela el clon hasta el
 * rectángulo del origen.
 *
 * Contrato preservado del legacy:
 * - Se libera el recurso `viewer` y se aborta si el diálogo no está abierto.
 * - Si la miniatura está fuera del área visible del sheet, se ajusta
 *   `sheet.scrollTop` antes de medir el destino.
 * - La animación dura 180 ms con `cubic-bezier(.16,1,.3,1)` y `fill:'both'`;
 *   el clon se limpia a los 190 ms y la miniatura recupera su visibilidad.
 * - Con reduced motion, sin medidas válidas o sin `animate`, no hay clon: el
 *   detalle se cierra de inmediato y la miniatura permanece visible.
 * - Después del cierre se repinta con `render()` en el siguiente tick si el
 *   diálogo sigue cerrado.
 */

/** Identificador de timer del host. */
export type DetailTimerHandle = number;

/** Timers inyectados. */
export interface DetailTimers {
  setTimeout(callback: () => void, ms: number): DetailTimerHandle;
  clearTimeout(handle: DetailTimerHandle | undefined): void;
}

/** `matchMedia` inyectado. */
export interface DetailMediaQuery {
  readonly matches: boolean;
}

/** Rectángulo mínimo. */
export interface DetailRect {
  readonly left?: number;
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly width?: number;
  readonly height?: number;
}

/** `style` mínimo del clon y de la miniatura. */
export interface DetailStyle {
  visibility?: string;
  [property: string]: unknown;
}

/** Fotograma de la animación de retorno. */
export interface DetailKeyframe {
  transform: string;
}

/** Opciones de la animación de retorno. */
export interface DetailAnimationOptions {
  duration: number;
  easing: string;
  fill: 'both';
}

/** Animación mínima. */
export interface DetailAnimation {
  cancel(): void;
  readonly finished?: PromiseLike<unknown>;
}

/** Imagen grande del visor. */
export interface DetailImage {
  style?: DetailStyle;
  getBoundingClientRect?(): DetailRect;
  cloneNode?(deep: boolean): DetailClone;
  animate?(frames: readonly DetailKeyframe[], options: DetailAnimationOptions): DetailAnimation;
}

/** Clon flotante que vuela de vuelta. */
export interface DetailClone {
  style: DetailStyle;
  setAttribute?(name: string, value: string): void;
  remove?(): void;
  animate?(frames: readonly DetailKeyframe[], options: DetailAnimationOptions): DetailAnimation;
}

/** Miniatura de origen dentro de la colección. */
export interface DetailThumb {
  style: DetailStyle;
  getBoundingClientRect(): DetailRect;
}

/** Tarjeta del álbum que aloja la miniatura. */
export interface DetailOrigin {
  readonly isConnected?: boolean;
  querySelector?(selector: string): DetailThumb | null;
  readonly classList?: { remove(token: string): void };
}

/** Header medido para el ajuste de scroll. */
export interface DetailSized {
  readonly offsetHeight?: number;
}

/** Sheet de la colección. */
export interface DetailSheet {
  scrollTop: number;
  readonly classList: { contains(token: string): boolean };
  getBoundingClientRect(): DetailRect;
  querySelector(selector: string): DetailSized | null;
}

/** Diálogo del detalle. */
export interface DetailDialog {
  readonly open: boolean;
  close(): void;
}

/** Documento inyectado. */
export interface DetailDocument {
  readonly body: { append(node: DetailClone): void };
}

/** Dependencias del cierre del detalle. */
export interface DetailReturnOptions {
  readonly dialog: DetailDialog;
  readonly sheet: DetailSheet;
  /** Imagen grande actual (`#viewer-surface img`). */
  readonly getImage: () => DetailImage | null;
  /** Tarjeta de origen (`detailOrigin`). */
  readonly getOrigin: () => DetailOrigin | null;
  /** `window.PokeResources?.release('viewer')`. */
  readonly releaseViewer?: () => void;
  /** Epoch, holo, preview y scroll-timer del visor. */
  readonly resetViewerState?: () => void;
  /** Libera las imágenes de `viewerItems` y vacía la lista. */
  readonly releaseViewerItems?: () => void;
  readonly document: DetailDocument;
  readonly timers: DetailTimers;
  readonly matchMedia: (query: string) => DetailMediaQuery;
  /** `render()` del host. */
  readonly render: () => void;
}

/** Controlador del cierre del detalle. */
export interface DetailReturnController {
  closeDetail(): void;
  /** Cancela la animación de retorno pendiente y restaura la miniatura. */
  clearDetailReturn(): void;
}

const DETAIL_QUERY = '(prefers-reduced-motion: reduce)';
const RETURN_DURATION = 180;
const RETURN_CLEANUP_DELAY = 190;
const RETURN_EASING = 'cubic-bezier(.16,1,.3,1)';
const VIEWER_SURFACE_ID = '#viewer-surface img';
const DEFAULT_HEADER_HEIGHT = 44;

/**
 * Crea el controlador de cierre del detalle.
 *
 * `clearDetailReturn` debe llamarse al iniciar un scroll/touch del sheet: el
 * host conecta los listeners legacy de `touchstart`/`wheel` a este método.
 */
export function createDetailReturn(options: DetailReturnOptions): DetailReturnController {
  const { dialog, sheet, document: doc, timers } = options;
  let returnCleanup: (() => void) | null = null;

  function clearDetailReturn(): void {
    returnCleanup?.();
    returnCleanup = null;
  }

  function closeDetail(): void {
    options.releaseViewer?.();
    if (!dialog.open) return;
    clearDetailReturn();

    const image = options.getImage() ?? null;
    const from = image?.getBoundingClientRect?.();
    const origin = options.getOrigin();
    const target = origin?.isConnected !== false ? origin : null;
    const thumb = target?.querySelector?.('img') ?? null;

    if (thumb && sheet.classList.contains('open')) {
      const bounds = sheet.getBoundingClientRect();
      const rect = thumb.getBoundingClientRect();
      const header =
        sheet.querySelector('.collection-header')?.offsetHeight || DEFAULT_HEADER_HEIGHT;
      const top = (bounds.top ?? 0) + header + 12;
      const bottom = (bounds.bottom ?? 0) - 12;
      if ((rect.top ?? 0) < top || (rect.bottom ?? 0) > bottom) {
        sheet.scrollTop +=
          (rect.top ?? 0) < top ? (rect.top ?? 0) - top : (rect.bottom ?? 0) - bottom;
      }
    }

    const to = thumb?.getBoundingClientRect();
    const canAnimate =
      typeof image?.animate === 'function' &&
      Boolean(from?.width) &&
      Boolean(to?.width) &&
      !options.matchMedia(DETAIL_QUERY).matches;
    const clone =
      canAnimate && typeof image?.cloneNode === 'function' ? image.cloneNode(true) : null;

    options.resetViewerState?.();
    dialog.close();
    options.releaseViewerItems?.();
    target?.classList?.remove('return-highlight');

    if (clone && from && to && from.width && to.width && thumb) {
      const old = thumb.style.visibility;
      thumb.style.visibility = 'hidden';
      clone.setAttribute?.('aria-hidden', 'true');
      Object.assign(clone.style, {
        position: 'fixed',
        left: `${to.left ?? 0}px`,
        top: `${to.top ?? 0}px`,
        width: `${to.width}px`,
        height: `${to.height}px`,
        maxWidth: 'none',
        maxHeight: 'none',
        margin: '0',
        objectFit: 'contain',
        transformOrigin: '0 0',
        pointerEvents: 'none',
        zIndex: '10000',
        borderRadius: '5px',
      });
      doc.body.append(clone);
      const animation = clone.animate?.(
        [
          {
            transform: `translate(${(from.left ?? 0) - (to.left ?? 0)}px,${(from.top ?? 0) - (to.top ?? 0)}px) scale(${from.width / to.width},${(from.height ?? 0) / (to.height ?? 1)})`,
          },
          { transform: 'translate(0,0) scale(1,1)' },
        ],
        { duration: RETURN_DURATION, easing: RETURN_EASING, fill: 'both' },
      );
      if (animation) {
        let timer: DetailTimerHandle = 0;
        let done = false;
        const cleanup = (): void => {
          if (done) return;
          done = true;
          timers.clearTimeout(timer);
          thumb.style.visibility = old;
          clone.remove?.();
          animation.cancel();
          if (returnCleanup === cleanup) returnCleanup = null;
        };
        returnCleanup = cleanup;
        timer = timers.setTimeout(cleanup, RETURN_CLEANUP_DELAY);
        void animation.finished?.then(cleanup, cleanup);
      }
    }

    timers.setTimeout(() => {
      if (!dialog.open) options.render();
    }, 0);
  }

  return { closeDetail, clearDetailReturn };
}

/** Selector usado por el legacy para localizar la imagen grande. */
export { VIEWER_SURFACE_ID };
