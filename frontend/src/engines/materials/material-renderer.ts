/**
 * Motor WebGL del material foil/etch por impresión.
 *
 * Extraído de `src/material-renderer.js` sin dependencias de Svelte. El motor
 * conserva los contratos del legacy:
 *
 * - Solo se aceptan superficies `malie.io` en español verificadas por
 *   `isSupportedMaterial`.
 * - La caché de texturas reutiliza la pareja exacta `assets` y libera como
 *   máximo la entrada más antigua cuando supera tres parejas (LRU).
 * - Las imágenes se suben con el lado mayor acotado a 1024 px; nunca se
 *   decodifica dos veces la misma pareja mientras siga en caché.
 * - Los vuelos (`beginFlight`/`beginInteraction`) bloquean decodificación,
 *   subida y `requestAnimationFrame`; al liberarlos se espera una ventana de
 *   silencio de 180 ms antes de reanudar el trabajo diferido.
 * - `prefers-reduced-motion` desactiva por completo el motor.
 *
 * Todo el I/O del navegador se inyecta (`MaterialRendererOptions`) para que
 * la lógica sea ejecutable en Node sin globals.
 */

/** Códigos de material usados por el shader. */
export const MATERIAL_KINDS = {
  FLAT_SILVER: 0,
  SV_HOLO: 1,
  SUN_PILLAR: 2,
  SV_ULTRA: 3,
} as const;

export type MaterialKind = keyof typeof MATERIAL_KINDS;

/** Lado mayor máximo de la textura subida a la GPU. */
export const MAX_MATERIAL_TEXTURE_SIZE = 1024;

/** Tamaño máximo del blob aceptado antes de decodificar. */
export const MAX_MATERIAL_BYTES = 8_388_608;

/** Ventana de silencio tras liberar el último vuelo. */
export const FLIGHT_QUIET_MS = 180;

/** Número de parejas de texturas retenidas por la caché LRU. */
export const MATERIAL_TEXTURE_CACHE_LIMIT = 3;

/** Ancho mínimo del canvas de material. */
const MIN_CANVAS_SIZE = 1;
/** Ancho máximo del canvas de material en píxeles CSS. */
const MAX_CANVAS_WIDTH = 480;
/** Relación de aspecto de respaldo cuando la carta aún no la conoce. */
const DEFAULT_ART_RATIO = 0.716;
/** Energía inicial de la luz. */
const DEFAULT_ENERGY = 0.22;

export interface MaterialAssets {
  readonly front?: string;
  readonly foil?: string;
  readonly etch?: string;
}

/** Superficie declarada por el catálogo para una impresión. */
export interface MaterialSurface {
  readonly scope?: string;
  readonly status?: string;
  readonly effect?: string;
  readonly provider?: string;
  readonly language?: string;
  readonly cardId?: string;
  readonly type?: string;
  readonly etched?: boolean;
  readonly assets?: MaterialAssets;
}

/** Candidato mínimo que necesita `prepare`/`attach`. */
export interface MaterialCandidate {
  readonly card?: string;
  readonly surface?: MaterialSurface;
}

export interface MaterialLight {
  readonly x: number;
  readonly y: number;
  readonly energy: number;
}

export interface MaterialClassList {
  add(token: string): void;
  remove(token: string): void;
}

/** Carta observada por el motor. La app puede pasar un `HTMLElement`. */
export interface MaterialCard {
  readonly clientWidth: number;
  readonly artRatio?: number;
  readonly materialFrontReady?: boolean;
  readonly classList: MaterialClassList;
  append(child: unknown): void;
}

/** Blob mínimo requerido para validar y decodificar el material. */
export interface AssetBlob {
  readonly size: number;
  readonly type: string;
}

/** Imagen decodificada; `close` libera los píxeles. */
export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  close?(): void;
}

export interface ImageBitmapOptionsLike {
  readonly resizeWidth: number;
  readonly resizeHeight: number;
  readonly resizeQuality: 'medium';
}

/** Fuente aceptada por `createImageBitmap` en el legacy (blob o imagen ya decodificada). */
export type ImageBitmapSourceLike = AssetBlob | DecodedImage;

export type CreateImageBitmap = (
  source: ImageBitmapSourceLike,
  options?: ImageBitmapOptionsLike,
) => Promise<DecodedImage>;

/** Respuesta de `fetch` que el motor necesita. */
export interface MaterialFetchResponse {
  readonly ok: boolean;
  blob(): Promise<AssetBlob>;
}

export type MaterialFetch = (
  url: string,
  init: { readonly signal: AbortSignal; readonly cache: 'force-cache' },
) => Promise<MaterialFetchResponse>;

/** Pool de assets foil/etch ya decodificados o descargables. */
export interface AssetsSource {
  getBlob(path: string, index?: number): Promise<AssetBlob>;
  prepare(cards: readonly MaterialCandidate[], schedule: boolean): void;
}

export interface MaterialImageElement extends DecodedImage {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

export interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener?(type: 'change', listener: () => void): void;
  removeEventListener?(type: 'change', listener: () => void): void;
}

export interface MaterialDocument {
  readonly visibilityState: string;
  querySelector(selector: string): unknown;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener?(type: 'visibilitychange', listener: () => void): void;
}

export interface MaterialWindow {
  addEventListener(type: 'pagehide' | 'pageshow', listener: () => void): void;
  removeEventListener?(type: 'pagehide' | 'pageshow', listener: () => void): void;
}

export interface WebGLContextAttributesLike {
  readonly alpha?: boolean;
  readonly premultipliedAlpha?: boolean;
  readonly antialias?: boolean;
  readonly depth?: boolean;
  readonly stencil?: boolean;
  readonly powerPreference?: 'default' | 'low-power' | 'high-performance';
}

/**
 * Subconjunto tipado de `WebGLRenderingContext`.
 *
 * Los recursos opacos se modelan como `unknown` porque el motor solo los
 * reenvía al contexto; un contexto real y un doble de pruebas lo satisfacen.
 */
export interface WebGLLike {
  readonly VERTEX_SHADER: number;
  readonly FRAGMENT_SHADER: number;
  readonly COMPILE_STATUS: number;
  readonly LINK_STATUS: number;
  readonly ARRAY_BUFFER: number;
  readonly STATIC_DRAW: number;
  readonly TEXTURE_2D: number;
  readonly TEXTURE_WRAP_S: number;
  readonly TEXTURE_WRAP_T: number;
  readonly TEXTURE_MIN_FILTER: number;
  readonly TEXTURE_MAG_FILTER: number;
  readonly CLAMP_TO_EDGE: number;
  readonly LINEAR: number;
  readonly RGBA: number;
  readonly UNSIGNED_BYTE: number;
  readonly FLOAT: number;
  readonly TEXTURE0: number;
  readonly TEXTURE1: number;
  readonly TRIANGLE_STRIP: number;
  readonly COLOR_BUFFER_BIT: number;

  createShader(type: number): unknown;
  shaderSource(shader: unknown, source: string): void;
  compileShader(shader: unknown): void;
  getShaderParameter(shader: unknown, pname: number): unknown;
  deleteShader(shader: unknown): void;

  createProgram(): unknown;
  attachShader(program: unknown, shader: unknown): void;
  linkProgram(program: unknown): void;
  getProgramParameter(program: unknown, pname: number): unknown;

  createBuffer(): unknown;
  bindBuffer(target: number, buffer: unknown): void;
  bufferData(target: number, data: Float32Array, usage: number): void;

  getAttribLocation(program: unknown, name: string): number;
  getUniformLocation(program: unknown, name: string): unknown;

  createTexture(): unknown;
  bindTexture(target: number, texture: unknown): void;
  texParameteri(target: number, pname: number, param: number): void;
  texImage2D(
    target: number,
    level: number,
    internalformat: number,
    width: number,
    height: number,
    border: number,
    format: number,
    type: number,
    pixels: ArrayBufferView | null,
  ): void;
  texImage2D(
    target: number,
    level: number,
    internalformat: number,
    format: number,
    type: number,
    source: DecodedImage,
  ): void;
  deleteTexture(texture: unknown): void;

  viewport(x: number, y: number, width: number, height: number): void;
  useProgram(program: unknown): void;
  enableVertexAttribArray(index: number): void;
  vertexAttribPointer(
    index: number,
    size: number,
    type: number,
    normalized: boolean,
    stride: number,
    offset: number,
  ): void;
  activeTexture(texture: number): void;
  uniform1i(location: unknown, x: number): void;
  uniform2f(location: unknown, x: number, y: number): void;
  uniform1f(location: unknown, x: number): void;
  drawArrays(mode: number, first: number, count: number): void;
  clearColor(red: number, green: number, blue: number, alpha: number): void;
  clear(mask: number): void;

  deleteProgram?(program: unknown): void;
  deleteBuffer?(buffer: unknown): void;
}

/** Canvas mínimo que usa el motor. */
export interface MaterialCanvas {
  className: string;
  width: number;
  height: number;
  parentElement: { readonly classList: MaterialClassList } | null;
  setAttribute(name: string, value: string): void;
  getContext(contextId: 'webgl', attributes?: WebGLContextAttributesLike): WebGLLike | null;
  addEventListener(type: string, listener: (event: { preventDefault(): void }) => void): void;
  remove(): void;
}

/** Pareja de texturas subida a la GPU. */
export interface MaterialTexturePair {
  readonly mask: unknown;
  readonly etch: unknown;
  readonly width: number;
  readonly height: number;
}

export interface MaterialRendererOptions {
  readonly document?: MaterialDocument | null;
  readonly window?: MaterialWindow | null;
  readonly matchMedia?: (query: string) => MediaQueryListLike;
  readonly createCanvas?: () => MaterialCanvas | null;
  readonly requestAnimationFrame?: (callback: (time: number) => void) => number;
  readonly cancelAnimationFrame?: (handle: number) => void;
  readonly setTimeout?: (callback: () => void, ms: number) => number;
  readonly clearTimeout?: (handle: number) => void;
  readonly assets?: AssetsSource | null;
  readonly fetch?: MaterialFetch;
  readonly createImageBitmap?: CreateImageBitmap | null;
  readonly createImage?: () => MaterialImageElement;
  readonly createObjectURL?: (blob: AssetBlob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly createAbortController?: () => AbortController;
}

/** Escena devuelta por `attach`. */
export interface MaterialSceneHandle {
  readonly supported: boolean;
  set(x: number, y: number, energy: number): void;
  dispose(): void;
}

/** API pública del motor de materiales. */
export interface MaterialRendererApi {
  readonly isSupported: (
    surface: MaterialSurface | null | undefined,
    cardId: string | undefined,
  ) => boolean;
  beginInteraction(): () => void;
  beginFlight(): () => void;
  prepare(cards: readonly MaterialCandidate[]): void;
  attach(card: MaterialCard, candidate: MaterialCandidate): MaterialSceneHandle;
  refresh(): void;
  pause(): void;
  destroy(): void;
}

interface MaterialSceneInternal extends MaterialSceneHandle {
  readonly supported: true;
  readonly card: MaterialCard;
  readonly surface: MaterialSurface;
  light: MaterialLight;
}

interface MaterialEngine {
  attach(scene: MaterialSceneInternal): void;
  set(light: MaterialLight): void;
  pause(): void;
  detach(): void;
  destroy(): void;
}

interface EngineDependencies {
  readonly createCanvas: () => MaterialCanvas | null;
  readonly requestAnimationFrame: (callback: (time: number) => void) => number;
  readonly cancelAnimationFrame: (handle: number) => void;
  readonly createAbortController: () => AbortController;
  readonly decode: (path: string | undefined, signal: AbortSignal) => Promise<DecodedImage>;
  readonly afterFlights: () => Promise<void>;
  readonly isFlightActive: () => boolean;
  readonly isVisible: () => boolean;
  readonly reducedMotion: () => boolean;
  readonly getCurrent: () => MaterialSceneInternal | null;
}

interface MaterialLocations {
  position: number;
  mask: unknown;
  etch: unknown;
  texel: unknown;
  light: unknown;
  energy: unknown;
  kind: unknown;
  etched: unknown;
}

const VERTEX_SHADER_SOURCE =
  'attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}';

const FRAGMENT_SHADER_SOURCE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_mask;
uniform sampler2D u_etch;
uniform vec2 u_texel;
uniform vec2 u_light;
uniform float u_energy;
uniform float u_kind;
uniform float u_etched;
const float TAU=6.2831853;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float heightAt(vec2 uv){vec4 t=texture2D(u_etch,uv);return lum(t.rgb)*t.a;}
void main(){
 vec2 uv=vec2(v_uv.x,1.-v_uv.y);
 vec4 plate=texture2D(u_mask,uv);
 float coverage=lum(plate.rgb)*plate.a;
 if(coverage<.006){gl_FragColor=vec4(0.);return;}
 // Derivatives come from this printing's actual etched image, not procedural grain.
 vec2 gradient=vec2(0.);
 if(u_etched>.5)gradient=vec2(heightAt(uv+vec2(u_texel.x,0.))-heightAt(uv-vec2(u_texel.x,0.)),heightAt(uv+vec2(0.,u_texel.y))-heightAt(uv-vec2(0.,u_texel.y)));
 vec3 normal=normalize(vec3(gradient*8.*u_etched,1.));
 vec3 light=normalize(vec3(u_light*.9,1.35));
 vec3 halfVector=normalize(light+vec3(0.,0.,1.));
 float spec=pow(max(0.,dot(normal,halfVector)),mix(28.,76.,u_etched));
 bool diagonal=u_kind>1.5&&u_kind<2.5;
 vec2 axis=diagonal?normalize(vec2(.7,.7)):vec2(0.,1.);
 float frequency=u_kind>2.5?2.3:diagonal?3.4:5.4;
 float phase=dot(uv,axis)*frequency+dot(u_light,vec2(.64,.43))+dot(normal.xy,vec2(.17,.21));
 vec3 spectral=.5+.5*cos(TAU*(phase+vec3(.0,.333,.666)));
 if(u_kind<.5)spectral=vec3(.8,.84,.9);
 float band=pow(.5+.5*sin(TAU*phase),4.);
 float facet=spec*(.4+.6*band);
 vec3 color=mix(.04+spectral*.68,vec3(.96,.97,1.),facet*.58);
 // The source plate preserves printed text and selects the real reflective areas.
 float alpha=clamp(coverage*u_energy*(.12+band*.31+facet*.3),0.,.48);
 gl_FragColor=vec4(color*alpha,alpha);
}`;

const UNSUPPORTED_SCENE: MaterialSceneHandle = {
  supported: false,
  set(): void {
    // Sin material verificado no hay nada que actualizar.
  },
  dispose(): void {
    // Sin recursos que liberar.
  },
};

const DEFAULT_MEDIA_QUERY: MediaQueryListLike = {
  matches: false,
  addEventListener(): void {
    // Sin soporte de cambios.
  },
};

export function isMaterialKind(value: unknown): value is MaterialKind {
  return typeof value === 'string' && Object.hasOwn(MATERIAL_KINDS, value);
}

/**
 * Igual que `isSupported` del legacy: la superficie debe declarar una
 * impresión verificada de Malie.io con assets servidos desde `/materials/`.
 */
export function isSupportedMaterial(
  surface: MaterialSurface | null | undefined,
  cardId: string | undefined,
): boolean {
  if (!surface) return false;
  return (
    surface.status === 'material-matched' &&
    surface.effect === 'asset-foil' &&
    surface.provider === 'malie.io' &&
    surface.language === 'es-ES' &&
    surface.cardId === cardId &&
    isMaterialKind(surface.type) &&
    surface.assets?.foil?.startsWith('/materials/') === true &&
    surface.assets?.front?.startsWith('/materials/') === true &&
    (!surface.etched || surface.assets?.etch?.startsWith('/materials/') === true)
  );
}

/** Clave exacta de caché: la pareja completa de assets de la impresión. */
export function materialCacheKey(surface: MaterialSurface): string {
  return JSON.stringify(surface.assets);
}

/**
 * Calcula el tamaño de subida preservando la relación de aspecto.
 *
 * Nunca amplía (`scale <= 1`) y redondea cada eje con mínimo de 1 px.
 */
export function materialUploadSize(
  width: number,
  height: number,
  maxSize: number = MAX_MATERIAL_TEXTURE_SIZE,
): { readonly width: number; readonly height: number; readonly scale: number } {
  const longest = Math.max(width, height);
  const scale = Math.min(1, maxSize / longest);
  if (scale >= 1) return { width, height, scale: 1 };
  return {
    width: Math.max(MIN_CANVAS_SIZE, Math.round(width * scale)),
    height: Math.max(MIN_CANVAS_SIZE, Math.round(height * scale)),
    scale,
  };
}

function closeImage(image: DecodedImage | undefined): void {
  image?.close?.();
}

/**
 * Caché LRU de parejas de texturas.
 *
 * `set` devuelve las parejas desalojadas para que el motor libere la GPU sin
 * mezclar contabilidad con llamadas WebGL.
 */
export class MaterialTextureCache {
  private readonly entries = new Map<string, MaterialTexturePair>();

  constructor(private readonly limit = MATERIAL_TEXTURE_CACHE_LIMIT) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string): MaterialTexturePair | undefined {
    const value = this.entries.get(key);
    if (!value) return undefined;
    // Tocar la entrada la mueve al final: la más antigua es la primera.
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, pair: MaterialTexturePair): readonly MaterialTexturePair[] {
    this.entries.set(key, pair);
    const evicted: MaterialTexturePair[] = [];
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      const value = this.entries.get(oldest.value);
      this.entries.delete(oldest.value);
      if (value) evicted.push(value);
    }
    return evicted;
  }

  clear(): readonly MaterialTexturePair[] {
    const values = [...this.entries.values()];
    this.entries.clear();
    return values;
  }
}

function defaultMatchMedia(query: string): MediaQueryListLike {
  if (typeof matchMedia !== 'function') return DEFAULT_MEDIA_QUERY;
  return matchMedia(query);
}

function defaultValue<T>(provided: T | undefined, fallback: T): T {
  return provided === undefined ? fallback : provided;
}

function createEngine(deps: EngineDependencies): MaterialEngine | null {
  const canvas = deps.createCanvas();
  if (!canvas) return null;
  const canvasElement = canvas;

  canvasElement.className = 'material-canvas';
  canvasElement.setAttribute('aria-hidden', 'true');

  const attributes: WebGLContextAttributesLike = {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  };

  let context: WebGLLike | null;
  try {
    context = canvasElement.getContext('webgl', attributes);
  } catch {
    return null;
  }
  if (!context) return null;
  const gl = context;

  let program: unknown = null;
  let buffer: unknown = null;
  let loc: MaterialLocations | null = null;
  let flat: unknown = null;
  let ready = false;
  let pair: MaterialTexturePair | null = null;
  let controller: AbortController | null = null;
  let serial = 0;
  let frame = 0;
  let available = false;
  let target: MaterialLight = { x: 0, y: 0, energy: DEFAULT_ENERGY };
  const smooth: { x: number; y: number; energy: number } = { ...target };
  const textures = new MaterialTextureCache();

  function compile(type: number, source: string): unknown {
    const shader = gl.createShader(type);
    if (shader === null || shader === undefined) throw Error('compile failed');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw Error('compile failed');
    }
    return shader;
  }

  function texture(image: DecodedImage | null): unknown {
    const created = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, created);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([128, 128, 128, 255]),
      );
    }
    return created;
  }

  function init(): boolean {
    try {
      const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
      const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('link failed');
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const uniform = (name: string): unknown => gl.getUniformLocation(program, `u_${name}`);
      loc = {
        position: gl.getAttribLocation(program, 'a_position'),
        mask: uniform('mask'),
        etch: uniform('etch'),
        texel: uniform('texel'),
        light: uniform('light'),
        energy: uniform('energy'),
        kind: uniform('kind'),
        etched: uniform('etched'),
      };
      flat = texture(null);
      available = true;
      return true;
    } catch {
      available = false;
      return false;
    }
  }

  if (!init()) return null;

  function pause(): void {
    deps.cancelAnimationFrame(frame);
    frame = 0;
  }

  function cleanup(): void {
    controller?.abort();
    controller = null;
    serial++;
    ready = false;
    pause();
    pair = null;
    canvasElement.parentElement?.classList.remove('has-material');
    canvasElement.remove();
  }

  function draw(): void {
    frame = 0;
    const scene = deps.getCurrent();
    if (
      deps.isFlightActive() ||
      !ready ||
      !pair ||
      !loc ||
      !scene ||
      !scene.card.materialFrontReady ||
      deps.reducedMotion() ||
      !deps.isVisible() ||
      !available
    ) {
      return;
    }

    const card = scene.card;
    const width = Math.max(
      MIN_CANVAS_SIZE,
      Math.min(MAX_CANVAS_WIDTH, Math.round(card.clientWidth)),
    );
    const height = Math.max(
      MIN_CANVAS_SIZE,
      Math.round(width / (card.artRatio ?? DEFAULT_ART_RATIO)),
    );
    if (canvasElement.width !== width || canvasElement.height !== height) {
      canvasElement.width = width;
      canvasElement.height = height;
    }
    gl.viewport(0, 0, width, height);

    let settling = false;
    for (const key of ['x', 'y', 'energy'] as const) {
      smooth[key] += (target[key] - smooth[key]) * 0.25;
      if (Math.abs(smooth[key] - target[key]) > 0.002) settling = true;
    }

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc.position);
    gl.vertexAttribPointer(loc.position, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pair.mask);
    gl.uniform1i(loc.mask, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, pair.etch);
    gl.uniform1i(loc.etch, 1);
    gl.uniform2f(loc.texel, 1 / pair.width, 1 / pair.height);
    gl.uniform2f(loc.light, smooth.x, smooth.y);
    gl.uniform1f(loc.energy, smooth.energy);
    gl.uniform1f(
      loc.kind,
      isMaterialKind(scene.surface.type) ? MATERIAL_KINDS[scene.surface.type] : 0,
    );
    gl.uniform1f(loc.etched, scene.surface.etched ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (settling) frame = deps.requestAnimationFrame(draw);
  }

  function commit(
    scene: MaterialSceneInternal,
    key: string,
    images: readonly DecodedImage[],
  ): void {
    const maskImage = images[0];
    if (!maskImage) throw Error('invalid material');
    const etchImage = images[1] ?? null;
    const nextPair: MaterialTexturePair = {
      mask: texture(maskImage),
      etch: etchImage ? texture(etchImage) : flat,
      width: etchImage?.width || maskImage.width,
      height: etchImage?.height || maskImage.height,
    };
    for (const old of textures.set(key, nextPair)) {
      gl.deleteTexture(old.mask);
      if (old.etch !== flat) gl.deleteTexture(old.etch);
    }
    pair = nextPair;
    ready = true;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    scene.card.append(canvas);
    scene.card.classList.add('has-material');
    api.set(scene.light);
  }

  function attach(scene: MaterialSceneInternal): void {
    cleanup();
    if (!available || deps.reducedMotion()) return;

    const key = materialCacheKey(scene.surface);
    const cached = textures.get(key);
    if (cached) {
      pair = cached;
      ready = true;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      scene.card.append(canvas);
      scene.card.classList.add('has-material');
      api.set(scene.light);
      return;
    }

    const generation = serial;
    controller = deps.createAbortController();
    const signal = controller.signal;
    const names: readonly ('foil' | 'etch')[] = scene.surface.etched ? ['foil', 'etch'] : ['foil'];

    void Promise.allSettled(
      names.map((name) => deps.decode(scene.surface.assets?.[name], signal)),
    ).then(async (results) => {
      await deps.afterFlights();
      const loaded: DecodedImage[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') loaded.push(result.value);
      }
      if (
        generation !== serial ||
        deps.getCurrent() !== scene ||
        results.some((result) => result.status === 'rejected') ||
        !available
      ) {
        loaded.forEach(closeImage);
        return;
      }
      try {
        commit(scene, key, loaded);
      } catch {
        cleanup();
      } finally {
        loaded.forEach(closeImage);
      }
    });
  }

  function set(light: MaterialLight): void {
    target = { ...light };
    if (!deps.isFlightActive() && !frame && deps.isVisible()) {
      frame = deps.requestAnimationFrame(draw);
    }
  }

  const api: MaterialEngine & { destroy(): void } = {
    attach,
    set,
    pause,
    detach: cleanup,
    destroy(): void {
      cleanup();
      for (const old of textures.clear()) {
        gl.deleteTexture(old.mask);
        if (old.etch !== flat) gl.deleteTexture(old.etch);
      }
      if (flat !== null) gl.deleteTexture(flat);
      if (program !== null) gl.deleteProgram?.(program);
      if (buffer !== null) gl.deleteBuffer?.(buffer);
      available = false;
      flat = null;
      program = null;
      buffer = null;
      loc = null;
    },
  };

  canvasElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cleanup();
    textures.clear();
    available = false;
    deps.getCurrent()?.card.classList.remove('has-material');
  });

  canvasElement.addEventListener('webglcontextrestored', () => {
    const scene = deps.getCurrent();
    if (init() && scene) api.attach(scene);
  });

  return api;
}

/**
 * Crea una instancia aislada del motor de materiales.
 *
 * Las dependencias no indicadas se resuelven contra los globals del navegador
 * en el momento de construir; en Node basta con inyectarlas todas.
 */
export function createMaterialRenderer(options: MaterialRendererOptions = {}): MaterialRendererApi {
  const documentRef = defaultValue(
    options.document,
    typeof document === 'undefined' ? null : (document as unknown as MaterialDocument),
  );
  const windowRef = defaultValue(
    options.window,
    typeof window === 'undefined' ? null : (window as unknown as MaterialWindow),
  );
  const media = options.matchMedia ?? defaultMatchMedia;
  const reduce = media('(prefers-reduced-motion: reduce)');
  const createCanvas = defaultValue(options.createCanvas, defaultCreateCanvas);
  const requestFrame = defaultValue(options.requestAnimationFrame, defaultRequestAnimationFrame);
  const cancelFrame = defaultValue(options.cancelAnimationFrame, defaultCancelAnimationFrame);
  const scheduleTimeout = defaultValue(options.setTimeout, defaultSetTimeout);
  const clearScheduledTimeout = defaultValue(options.clearTimeout, defaultClearTimeout);
  const assets = options.assets ?? null;
  const materialFetch: MaterialFetch = options.fetch ?? ((url, init) => fetch(url, init));
  const createBitmap =
    options.createImageBitmap !== undefined
      ? options.createImageBitmap
      : resolveCreateImageBitmap();
  const createImage = defaultValue(options.createImage, defaultCreateImage);
  const createObjectUrl = defaultValue(options.createObjectURL, defaultCreateObjectURL);
  const revokeObjectUrl = defaultValue(options.revokeObjectURL, defaultRevokeObjectURL);
  const createAbortController = defaultValue(
    options.createAbortController,
    () => new AbortController(),
  );

  let engine: MaterialEngine | null | false = null;
  let current: MaterialSceneInternal | null = null;
  let destroyed = false;
  const flights = new Set<object>();
  const flightWaiters: Array<() => void> = [];
  const scheduledReleases = new Set<number>();
  let deferredScene: MaterialSceneInternal | null = null;
  let deferredCards: readonly MaterialCandidate[] | null = null;

  function isVisible(): boolean {
    if (!documentRef) return false;
    return (
      documentRef.visibilityState !== 'hidden' &&
      !documentRef.querySelector('.sheet.open') &&
      !documentRef.querySelector('dialog[open]')
    );
  }

  function afterFlights(): Promise<void> {
    if (flights.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      flightWaiters.push(resolve);
    });
  }

  async function decode(path: string | undefined, signal: AbortSignal): Promise<DecodedImage> {
    await afterFlights();
    if (signal.aborted) throw Error('cancelled');
    if (!path) throw Error('material unavailable');

    let blob: AssetBlob;
    if (assets) {
      blob = await assets.getBlob(path, 0);
    } else {
      const response = await materialFetch(path, { signal, cache: 'force-cache' });
      if (!response.ok) throw Error('material unavailable');
      blob = await response.blob();
    }

    await afterFlights();
    if (signal.aborted) throw Error('cancelled');
    if (blob.size > MAX_MATERIAL_BYTES || !blob.type.startsWith('image/')) {
      throw Error('invalid material');
    }

    if (createBitmap) {
      let image = await createBitmap(blob);
      const size = materialUploadSize(image.width, image.height);
      if (size.scale < 1) {
        const original = image;
        try {
          image = await createBitmap(original, {
            resizeWidth: size.width,
            resizeHeight: size.height,
            resizeQuality: 'medium',
          });
        } finally {
          original.close?.();
        }
      }
      if (signal.aborted) {
        image.close?.();
        throw Error('cancelled');
      }
      return image;
    }

    return new Promise<DecodedImage>((resolve, reject) => {
      const image = createImage();
      const url = createObjectUrl(blob);
      const abort = (): void => {
        image.src = '';
        revokeObjectUrl(url);
        reject(Error('cancelled'));
      };
      signal.addEventListener('abort', abort, { once: true });
      image.onload = () => {
        signal.removeEventListener('abort', abort);
        revokeObjectUrl(url);
        resolve(image);
      };
      image.onerror = () => {
        signal.removeEventListener('abort', abort);
        revokeObjectUrl(url);
        reject(Error('decode failed'));
      };
      image.src = url;
    });
  }

  function currentEngine(): MaterialEngine | null {
    return engine === null || engine === false ? null : engine;
  }

  function acquire(): MaterialEngine | null {
    if (destroyed) return null;
    if (engine === null) {
      engine =
        createEngine({
          createCanvas,
          requestAnimationFrame: requestFrame,
          cancelAnimationFrame: cancelFrame,
          createAbortController,
          decode,
          afterFlights,
          isFlightActive: () => flights.size > 0,
          isVisible,
          reducedMotion: () => reduce.matches,
          getCurrent: () => current,
        }) ?? false;
    }
    return currentEngine();
  }

  function prepare(cards: readonly MaterialCandidate[]): void {
    if (flights.size > 0) {
      deferredCards = cards;
      return;
    }
    const matched = cards
      .slice(0, 4)
      .filter((card) => isSupportedMaterial(card.surface, card.card));
    assets?.prepare(matched, !reduce.matches && matched.length > 0 && acquire() !== null);
  }

  function attach(card: MaterialCard, candidate: MaterialCandidate): MaterialSceneHandle {
    const surface = candidate.surface;
    if (!surface || !isSupportedMaterial(surface, candidate.card) || reduce.matches) {
      return UNSUPPORTED_SCENE;
    }
    if (current) current.dispose();

    const scene: MaterialSceneInternal = {
      card,
      surface,
      light: { x: 0, y: 0, energy: DEFAULT_ENERGY },
      supported: true,
      set(x: number, y: number, energy: number): void {
        scene.light = { x, y, energy };
        if (current === scene) currentEngine()?.set(scene.light);
      },
      dispose(): void {
        if (current === scene) {
          currentEngine()?.detach();
          current = null;
        }
        card.classList.remove('has-material');
      },
    };

    current = scene;
    if (flights.size > 0) deferredScene = scene;
    else acquire()?.attach(scene);
    return scene;
  }

  function refresh(): void {
    // Equivalente a `engine.refresh()`: reaplica la luz de la escena vigente.
    if (current) currentEngine()?.set(current.light);
  }

  function beginFlight(): () => void {
    const token: object = {};
    flights.add(token);
    currentEngine()?.pause();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      let handle = 0;
      handle = scheduleTimeout(() => {
        scheduledReleases.delete(handle);
        if (!flights.delete(token) || flights.size > 0) return;
        for (const resolve of flightWaiters.splice(0)) resolve();
        const scene = deferredScene;
        const cards = deferredCards;
        deferredScene = null;
        deferredCards = null;
        if (scene && current === scene && !reduce.matches) acquire()?.attach(scene);
        else if (current) currentEngine()?.set(current.light);
        if (cards) prepare(cards);
      }, FLIGHT_QUIET_MS);
      scheduledReleases.add(handle);
    };
  }

  const onVisibilityChange = (): void => {
    if (documentRef?.visibilityState === 'hidden') currentEngine()?.pause();
    else refresh();
  };
  const onPageHide = (): void => {
    currentEngine()?.pause();
  };
  const onPageShow = (): void => {
    refresh();
  };
  const onReducedMotionChange = (): void => {
    if (reduce.matches) {
      currentEngine()?.detach();
      current?.card.classList.remove('has-material');
    } else if (current) {
      acquire()?.attach(current);
    }
  };

  documentRef?.addEventListener('visibilitychange', onVisibilityChange);
  windowRef?.addEventListener('pagehide', onPageHide);
  windowRef?.addEventListener('pageshow', onPageShow);
  reduce.addEventListener?.('change', onReducedMotionChange);

  return {
    isSupported: isSupportedMaterial,
    beginInteraction: beginFlight,
    beginFlight,
    prepare,
    attach,
    refresh,
    pause(): void {
      currentEngine()?.pause();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      documentRef?.removeEventListener?.('visibilitychange', onVisibilityChange);
      windowRef?.removeEventListener?.('pagehide', onPageHide);
      windowRef?.removeEventListener?.('pageshow', onPageShow);
      reduce.removeEventListener?.('change', onReducedMotionChange);
      for (const handle of scheduledReleases) clearScheduledTimeout(handle);
      scheduledReleases.clear();
      for (const resolve of flightWaiters.splice(0)) resolve();
      flights.clear();
      deferredScene = null;
      deferredCards = null;
      current?.dispose();
      currentEngine()?.destroy();
      engine = null;
    },
  };
}

function defaultCreateCanvas(): MaterialCanvas | null {
  if (typeof document === 'undefined') return null;
  // `getContext` está sobrecargado en el DOM; el motor solo usa la variante webgl.
  return document.createElement('canvas') as unknown as MaterialCanvas;
}

function defaultRequestAnimationFrame(callback: (time: number) => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  // Fallback para entornos sin rAF; el handle se trata como opaco.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return globalThis.setTimeout(
    () => callback(globalThis.performance.now()),
    16,
  ) as unknown as number;
}

function defaultCancelAnimationFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle);
    return;
  }
  globalThis.clearTimeout(handle);
}

function defaultSetTimeout(callback: () => void, ms: number): number {
  // El handle es opaco para el motor; en navegador `setTimeout` devuelve number.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return globalThis.setTimeout(callback, ms) as unknown as number;
}

function defaultClearTimeout(handle: number): void {
  globalThis.clearTimeout(handle);
}

function resolveCreateImageBitmap(): CreateImageBitmap | null {
  if (typeof createImageBitmap !== 'function') return null;
  // El API real acepta tanto `Blob` como `ImageBitmap`; la unión modela ambos
  // casos del legacy y se estrecha aquí en el borde del navegador.
  return (source, options) => createImageBitmap(source as unknown as Blob, options);
}

function defaultCreateImage(): MaterialImageElement {
  return new Image() as unknown as MaterialImageElement;
}

function defaultCreateObjectURL(blob: AssetBlob): string {
  return URL.createObjectURL(blob as Blob);
}

function defaultRevokeObjectURL(url: string): void {
  URL.revokeObjectURL(url);
}

let sharedMaterialRenderer: MaterialRendererApi | null = null;

/**
 * Instancia compartida que deben usar la aplicación y `holo`.
 *
 * Se crea perezosamente para que importar el módulo no toque `document` ni
 * `window` (y para no romper pruebas en Node).
 */
export function getSharedMaterialRenderer(): MaterialRendererApi {
  sharedMaterialRenderer ??= createMaterialRenderer();
  return sharedMaterialRenderer;
}
