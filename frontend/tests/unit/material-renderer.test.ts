// Migrado de tests/19-material-gpu.test.cjs — caché de texturas, límites de
// resolución y gate de gestos. Usa dobles inyectados en lugar de `node:vm`.
import { describe, expect, it } from 'vitest';

import {
  createMaterialRenderer,
  materialCacheKey,
  materialUploadSize,
  MAX_MATERIAL_TEXTURE_SIZE,
  type AssetsSource,
  type CreateImageBitmap,
  type MaterialCandidate,
  type MaterialCanvas,
  type MaterialCard,
  type MaterialClassList,
  type MaterialDocument,
  type MaterialSurface,
  type MaterialWindow,
  type MediaQueryListLike,
  type WebGLLike,
} from '../../src/engines/materials/material-renderer';

interface UploadedImage {
  readonly width: number;
  readonly height: number;
}

interface GlRecorder {
  readonly uploads: UploadedImage[];
  readonly deleted: { count: number };
}

/** Contexto WebGL mínimo: registra subidas y liberaciones de texturas. */
function createFakeGl(recorder: GlRecorder): WebGLLike {
  const shader = {};
  const program = {};
  const buffer = {};
  const texture = {};
  const location = {};
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    TEXTURE_2D: 7,
    TEXTURE_WRAP_S: 8,
    TEXTURE_WRAP_T: 9,
    TEXTURE_MIN_FILTER: 10,
    TEXTURE_MAG_FILTER: 11,
    CLAMP_TO_EDGE: 12,
    LINEAR: 13,
    RGBA: 14,
    UNSIGNED_BYTE: 15,
    FLOAT: 16,
    TEXTURE0: 17,
    TEXTURE1: 18,
    TRIANGLE_STRIP: 19,
    COLOR_BUFFER_BIT: 20,

    createShader: () => shader,
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: () => true,
    deleteShader: () => undefined,

    createProgram: () => program,
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,

    createBuffer: () => buffer,
    bindBuffer: () => undefined,
    bufferData: () => undefined,

    getAttribLocation: () => 0,
    getUniformLocation: () => location,

    createTexture: () => texture,
    bindTexture: () => undefined,
    texParameteri: () => undefined,
    texImage2D(...args: unknown[]): void {
      if (args.length === 6) recorder.uploads.push(args[5] as UploadedImage);
    },
    deleteTexture: () => {
      recorder.deleted.count += 1;
    },

    viewport: () => undefined,
    useProgram: () => undefined,
    enableVertexAttribArray: () => undefined,
    vertexAttribPointer: () => undefined,
    activeTexture: () => undefined,
    uniform1i: () => undefined,
    uniform2f: () => undefined,
    uniform1f: () => undefined,
    drawArrays: () => undefined,
    clearColor: () => undefined,
    clear: () => undefined,
  };
}

class FakeCanvas implements MaterialCanvas {
  className = '';
  width = 0;
  height = 0;
  parentElement: { readonly classList: MaterialClassList } | null = null;
  private readonly listeners = new Map<string, (event: { preventDefault(): void }) => void>();

  constructor(private readonly gl: WebGLLike | null) {}

  setAttribute(): void {
    // El fake no necesita atributos ARIA.
  }

  getContext(): WebGLLike | null {
    return this.gl;
  }

  addEventListener(type: string, listener: (event: { preventDefault(): void }) => void): void {
    this.listeners.set(type, listener);
  }

  remove(): void {
    this.parentElement = null;
  }
}

class FakeCard implements MaterialCard {
  clientWidth = 390;
  artRatio = 0.716;
  materialFrontReady = true;
  readonly classes = new Set<string>();
  readonly appended: unknown[] = [];
  readonly classList: MaterialClassList = {
    add: (token: string) => {
      this.classes.add(token);
    },
    remove: (token: string) => {
      this.classes.delete(token);
    },
  };

  append(child: unknown): void {
    this.appended.push(child);
  }
}

function candidate(index: number): MaterialCandidate {
  const surface: MaterialSurface = {
    status: 'material-matched',
    effect: 'asset-foil',
    provider: 'malie.io',
    language: 'es-ES',
    cardId: `test-${index}`,
    type: 'FLAT_SILVER',
    etched: false,
    assets: {
      front: `/materials/front${index}`,
      foil: `/materials/foil${index}`,
    },
  };
  return { card: `test-${index}`, surface };
}

function setup() {
  let decodes = 0;
  const recorder: GlRecorder = { uploads: [], deleted: { count: 0 } };
  const frames: Array<(time: number) => void> = [];
  const timers: Array<() => void> = [];
  const canvas = new FakeCanvas(createFakeGl(recorder));

  const documentRef: MaterialDocument = {
    visibilityState: 'visible',
    querySelector: () => null,
    addEventListener: () => undefined,
  };
  const windowRef: MaterialWindow = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const media: MediaQueryListLike = { matches: false, addEventListener: () => undefined };
  const assets: AssetsSource = {
    getBlob: () => Promise.resolve({ size: 100, type: 'image/png' }),
    prepare: () => undefined,
  };
  const createBitmap: CreateImageBitmap = (_source, resize) => {
    decodes += 1;
    return Promise.resolve({
      width: resize?.resizeWidth ?? 2048,
      height: resize?.resizeHeight ?? 2860,
      close: () => undefined,
    });
  };

  const renderer = createMaterialRenderer({
    document: documentRef,
    window: windowRef,
    matchMedia: () => media,
    createCanvas: () => canvas,
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame: () => undefined,
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout: () => undefined,
    assets,
    createImageBitmap: createBitmap,
  });

  return {
    renderer,
    canvas,
    uploads: recorder.uploads,
    deleted: recorder.deleted,
    frames,
    timers,
    get decodes(): number {
      return decodes;
    },
    quiet(): void {
      timers.splice(0).forEach((callback) => {
        callback();
      });
    },
  };
}

const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

describe('material-renderer', () => {
  it('reutiliza texturas exactas, limita la subida y desaloja entradas antiguas', async () => {
    const app = setup();
    app.renderer.attach(new FakeCard(), candidate(1));
    await settle();
    expect(app.uploads.length).toBe(1);
    const first = app.uploads[0];
    if (!first) throw new Error('Falta la primera subida');
    expect(Math.max(first.width, first.height)).toBeLessThanOrEqual(MAX_MATERIAL_TEXTURE_SIZE);
    expect(first.height).toBe(MAX_MATERIAL_TEXTURE_SIZE);

    const before = app.decodes;
    app.renderer.attach(new FakeCard(), candidate(1));
    await settle();
    expect(app.decodes).toBe(before);
    expect(app.uploads.length).toBe(1);

    app.frames.at(-1)?.(0);
    expect(app.canvas.width).toBe(390);

    for (const index of [2, 3, 4]) {
      app.renderer.attach(new FakeCard(), candidate(index));
      await settle();
    }
    expect(app.deleted.count).toBe(1);

    app.renderer.attach(new FakeCard(), candidate(1));
    await settle();
    expect(app.uploads.length).toBe(5);
  });

  it('espera a que termine el vuelo antes de subir texturas', async () => {
    const app = setup();
    const end = app.renderer.beginFlight();
    app.renderer.attach(new FakeCard(), candidate(1));
    await settle();
    expect(app.decodes).toBe(0);
    expect(app.uploads.length).toBe(0);

    end();
    app.quiet();
    await settle();
    expect(app.uploads.length).toBe(1);
  });

  it('un gesto nuevo mantiene bloqueado el trabajo durante la ventana de silencio', async () => {
    const app = setup();
    const release = app.renderer.beginInteraction();
    app.renderer.attach(new FakeCard(), candidate(1));
    await settle();
    expect(app.decodes).toBe(0);

    release();
    await settle();
    expect(app.uploads.length).toBe(0);

    const next = app.renderer.beginInteraction();
    app.quiet();
    await settle();
    expect(app.decodes).toBe(0);

    next();
    app.quiet();
    await settle();
    expect(app.uploads.length).toBe(1);
  });
});

describe('lógica pura del material', () => {
  it('acota el lado mayor sin ampliar imágenes pequeñas', () => {
    expect(materialUploadSize(2048, 2860)).toEqual({
      width: 733,
      height: 1024,
      scale: 1024 / 2860,
    });
    expect(materialUploadSize(300, 400)).toEqual({ width: 300, height: 400, scale: 1 });
  });

  it('usa la pareja exacta de assets como clave de caché', () => {
    const surface = candidate(7).surface;
    if (!surface) throw new Error('Falta la superficie');
    expect(materialCacheKey(surface)).toBe(
      '{"front":"/materials/front7","foil":"/materials/foil7"}',
    );
  });
});
