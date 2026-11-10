import { createAlbumIndex, type AlbumIndexOptions } from '@/application/album';

/** La acción es dueña exclusiva del rail, preview y listeners del controlador. */
export function albumIndex(rail: HTMLElement): { destroy(): void } {
  const sheet = rail.closest<HTMLElement>('#sheet');
  const root = sheet?.querySelector<HTMLElement>('.round-memories');
  const control = rail.querySelector<HTMLButtonElement>('#album-scrubber');
  const preview = sheet?.querySelector<HTMLElement>('#album-index-preview');
  const cardsHost = preview?.querySelector<HTMLElement>('#album-index-cards');
  const label = preview?.querySelector<HTMLElement>('#album-index-label');
  if (!sheet || !root || !control || !preview || !cardsHost || !label) {
    throw new Error('El índice del álbum necesita sus nodos de colección.');
  }

  const abort = new AbortController();
  const frames = new Set<number>();
  // El módulo extraído registra listeners anónimos: el adaptador agrega un
  // signal sin cambiar su contrato y conserva el receptor nativo de cada API.
  function scoped<T extends HTMLElement>(node: T): T {
    return new Proxy(node, {
      get(target, property) {
        if (property === 'addEventListener') {
          return (
            type: string,
            listener: EventListener,
            options?: AddEventListenerOptions | boolean,
          ) => {
            const normalized = typeof options === 'boolean' ? { capture: options } : options;
            target.addEventListener(type, listener, { ...normalized, signal: abort.signal });
          };
        }
        const value: unknown = Reflect.get(target, property, target);
        if (typeof value === 'function') {
          const bound: unknown = value.bind(target);
          return bound;
        }
        return value;
      },
      set(target, property, value: unknown) {
        return Reflect.set(target, property, value, target);
      },
    });
  }

  const options = {
    sheet: scoped(sheet),
    rail,
    control: scoped(control),
    preview,
    root: { querySelectorAll: (selector: string) => Array.from(root.querySelectorAll(selector)) },
    cardsHost,
    label,
    document,
    timers: {
      setTimeout: (callback: () => void, ms: number) => window.setTimeout(callback, ms),
      clearTimeout: (handle: number | undefined) => window.clearTimeout(handle),
    },
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const id = requestAnimationFrame((time) => {
        frames.delete(id);
        callback(time);
      });
      frames.add(id);
      return id;
    },
    now: () => performance.now(),
    innerHeight: () => window.innerHeight,
    matchMedia: (query: string) => window.matchMedia(query),
  } as unknown as AlbumIndexOptions;
  const controller = createAlbumIndex(options);
  // La primera medición puede quitar `hidden`; la segunda mide el rail visible.
  controller.measure();
  const resize = new ResizeObserver(() => controller.measure());
  resize.observe(sheet);
  resize.observe(root);
  const mutation = new MutationObserver(() => controller.measure());
  mutation.observe(root, { childList: true, subtree: true });

  return {
    destroy() {
      mutation.disconnect();
      resize.disconnect();
      controller.dispose();
      abort.abort();
      for (const id of frames) cancelAnimationFrame(id);
      control.onpointerdown = null;
      control.onpointermove = null;
      control.onpointerup = null;
      control.onpointercancel = null;
      control.onlostpointercapture = null;
      control.onkeydown = null;
    },
  };
}
