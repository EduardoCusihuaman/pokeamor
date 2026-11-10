/**
 * Entrega y preparación de arte (motor independiente de Svelte).
 *
 * Migrado de `img()` y `artworkReady()` en `src/app.js`. El motor crea o
 * adopta una imagen, le asigna la fuente exacta y resuelve la disponibilidad
 * real de píxeles (`decode` + `naturalWidth`). No toca `window` ni importa
 * Svelte: el DOM, el coordinador de recursos, el reloj y el fallback se
 * inyectan desde el adaptador.
 *
 * Contratos preservados (plan §7):
 * - `img()` devuelve **la misma instancia** que creó; no la sustituye al
 *   asignar la fuente. Una imagen ya preparada conserva su identidad.
 * - En modo `exact`, si el coordinador expone `bindImage`, la imagen recibe el
 *   recurso vinculado y se observa `artReady`. Un fallo terminal con
 *   `resourceState === 'error'` y la imagen conectada usa el respaldo oficial
 *   **una sola vez**; nunca registra un voto por sí mismo.
 * - Sin `bindImage`, la imagen usa decodificación diferida: `artReady` se
 *   resuelve `true` solo después de `decode()` y con `naturalWidth > 0`.
 * - Un `load` sobre el propio fallback resuelve `false` (no es arte válido).
 * - El primer error reintenta con la URL canónica; el segundo aplica el
 *   fallback y marca `materialSource = false`.
 * - `artworkReady()` reutiliza `artReady` si ya existe y, para imágenes
 *   nativas precargadas, espera `load`/`error` sin descargar de nuevo.
 * - Un `error` terminal resuelve `false` y deja `cardReady === false`; la capa
 *   de aplicación ofrece recuperación sin votar.
 *
 * Los estados terminales se modelan como unión discriminada
 * (`ArtworkSettlement`) y el estado de recurso como
 * `ArtworkResourceState`, evitando banderas ambiguas.
 */

/** Estado del recurso publicado por el coordinador compartido. */
export type ArtworkResourceState = 'loading' | 'ready' | 'error';

/** Resultado terminal del handshake de decodificación. */
export type ArtworkSettlement = { readonly status: 'ready' } | { readonly status: 'failed' };

/** Marcas de tiempo conservadas para instrumentación (plan §19). */
export interface ArtworkTiming {
  started: number;
  loaded?: number;
  decodeMs?: number;
}

/** Carta mínima que necesita el motor de arte. */
export interface ArtworkCard {
  readonly id?: string | number;
  readonly name?: string;
  /** Impresión de la carta; la usa el coordinador para `key()`. */
  readonly card?: string;
  readonly image?: string;
  readonly surface?: {
    readonly effect?: string;
    readonly assets?: { readonly front?: string };
  } | null;
}

/** Lista de clases del contenedor de la imagen. */
export interface ArtworkClassList {
  add(...tokens: string[]): void;
}

/** Listener mínimo; `load` puede ser asíncrono. */
export type ArtworkListener = () => void | Promise<void>;

/**
 * Imagen mínima administrada por el motor. `HTMLImageElement` la satisface
 * estructuralmente (el adaptador añade los campos de recursos).
 */
export interface ArtworkImage {
  alt: string;
  draggable: boolean;
  decoding: string;
  src: string;
  naturalWidth: number;
  naturalHeight?: number;
  complete?: boolean;
  isConnected?: boolean;
  parentElement?: { readonly classList: ArtworkClassList } | null;
  cardIdentity?: string | undefined;
  cardReady?: boolean;
  materialSource?: boolean;
  artTiming?: ArtworkTiming;
  artReady?: Promise<boolean>;
  resourceState?: ArtworkResourceState;
  decode?: () => Promise<void>;
  addEventListener?: (
    type: string,
    listener: ArtworkListener,
    options?: { readonly once?: boolean },
  ) => void;
  removeEventListener?: (type: string, listener: ArtworkListener) => void;
  onerror?: ((event?: unknown) => unknown) | null;
}

/** Subconjunto del coordinador de recursos que consume el motor. */
export interface ArtworkResources {
  path?(card: ArtworkCard): string | undefined;
  key?(card: ArtworkCard): string | undefined;
  peek?(url: string): string | null | undefined;
  front?(card: ArtworkCard): Promise<string>;
  bindImage?(image: ArtworkImage, card: ArtworkCard, options?: { readonly priority: number }): void;
  observeImage?(
    image: ArtworkImage,
    card: ArtworkCard,
    options: { readonly priority: number },
  ): void;
  invalidate?(url: string | undefined): void;
}

/** Dependencias inyectables de `img`. */
export interface ArtworkImageOptions {
  /** Fábrica del nodo `<img>` (o doble de prueba). */
  readonly createImage: () => ArtworkImage;
  readonly resources?: ArtworkResources | null;
  readonly fallback?: (card: ArtworkCard) => string;
  readonly now?: () => number;
}

/** Dependencias inyectables de `artworkReady`. */
export interface ArtworkReadyOptions {
  readonly fallback?: (card: ArtworkCard) => string;
}

const READY: ArtworkSettlement = { status: 'ready' };
const FAILED: ArtworkSettlement = { status: 'failed' };

/** Respaldo oficial de PokeAPI, idéntico al legacy. */
export function officialArtworkFallback(card: ArtworkCard): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${String(card.id)}.png`;
}

/**
 * Crea la imagen de una carta y comienza su entrega.
 *
 * @param card Carta del catálogo.
 * @param exact `true` para el arte definitivo; `false` para una miniatura que
 *   solo debe observarse.
 */
export function img(card: ArtworkCard, exact = false, options: ArtworkImageOptions): ArtworkImage {
  const resources = options.resources ?? null;
  const fallback = options.fallback ?? officialArtworkFallback;
  const now = options.now ?? (() => performance.now());

  // Ruta preferida: el coordinador posee la imagen y su estado de recurso.
  if (resources?.bindImage) {
    const image = options.createImage();
    image.alt = card.name ?? '';
    image.draggable = false;
    image.decoding = 'async';

    if (!exact) {
      resources.observeImage?.(image, card, { priority: 20 });
      return image;
    }

    resources.bindImage(image, card);
    const readiness = image.artReady;
    void readiness?.then((ok) => {
      // Solo se recupera si esta sigue siendo la readiness vigente y el nodo
      // sigue montado: una respuesta tardía no puede pisar un recurso nuevo.
      if (
        !ok &&
        image.artReady === readiness &&
        image.resourceState === 'error' &&
        image.isConnected
      ) {
        image.parentElement?.classList.add('art-fallback', 'official');
        image.materialSource = false;
        image.src = fallback(card);
      }
    });
    return image;
  }

  // Ruta nativa de respaldo: la imagen se crea y se decodifica aquí.
  const image = options.createImage();
  const material = card.surface?.effect === 'asset-foil';
  const url = resources?.path?.(card) || card.image;

  image.alt = card.name ?? '';
  image.draggable = false;
  image.decoding = 'async';
  image.cardIdentity = resources?.key?.(card);
  image.cardReady = false;
  const timing: ArtworkTiming = { started: now() };
  image.artTiming = timing;
  image.materialSource = Boolean(exact && material);

  let attempt = 0;

  image.artReady = new Promise<boolean>((resolve) => {
    image.addEventListener?.(
      'load',
      async () => {
        if (image.src === fallback(card)) {
          resolve(false);
          return;
        }

        try {
          timing.loaded = now();
          const loadedAt = timing.loaded;
          await image.decode?.();
          timing.decodeMs = now() - loadedAt;
          image.cardReady = image.naturalWidth > 0;
          resolve(image.cardReady);
        } catch {
          resources?.invalidate?.(url);
          resolve(false);
        }
      },
      { once: true },
    );
  });

  image.onerror = () => {
    image.cardReady = false;
    if (attempt++ === 0 && url) {
      image.src = url;
      return;
    }

    image.materialSource = false;
    image.parentElement?.classList.add('art-fallback', 'official');
    image.onerror = null;
    image.src = fallback(card);
  };

  const cached = url ? resources?.peek?.(url) : null;
  if (cached) {
    image.src = cached;
  } else if (url) {
    if (exact && resources?.front) {
      resources
        .front(card)
        .then((src) => {
          image.src = src;
        })
        .catch(() => {
          image.src = url;
        });
    } else {
      image.src = url;
    }
  } else {
    image.src = fallback(card);
  }

  return image;
}

/**
 * Garantiza la disponibilidad de una imagen nativa ya precargada.
 *
 * Si la imagen no tiene `artReady`, instala un handshake de una sola vez:
 * espera `load`/`error`, exige `naturalWidth > 0`, llama a `decode()` cuando
 * existe y resuelve `false` ante cualquier error. No vuelve a descargar nada.
 */
export function artworkReady(
  image: ArtworkImage,
  card: ArtworkCard,
  options: ArtworkReadyOptions = {},
): Promise<boolean> {
  if (image.artReady) return image.artReady;

  const fallback = options.fallback ?? officialArtworkFallback;

  const readiness = new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = (settlement: ArtworkSettlement): void => {
      if (settled) return;
      settled = true;
      image.removeEventListener?.('load', loaded);
      image.removeEventListener?.('error', failed);
      const ready = settlement.status === 'ready';
      image.cardReady = ready;
      resolve(ready);
    };

    const loaded = async (): Promise<void> => {
      // Una fuente vacía o el fallback no representan arte utilizable.
      if (!image.naturalWidth || image.src === fallback(card)) {
        finish(FAILED);
        return;
      }

      try {
        await image.decode?.();
        finish(image.naturalWidth > 0 ? READY : FAILED);
      } catch {
        finish(FAILED);
      }
    };

    const failed = (): void => finish(FAILED);

    image.addEventListener?.('load', loaded);
    image.addEventListener?.('error', failed);
    if (image.complete && image.naturalWidth > 0) void loaded();
  });

  image.artReady = readiness;
  return readiness;
}
