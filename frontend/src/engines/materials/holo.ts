/**
 * Motor de pose por sensor y overlay holográfico.
 *
 * Extraído de `src/holo.js` sin dependencias de Svelte. Conserva el
 * comportamiento del legacy:
 *
 * - El sensor es opt-in: `enable()` pide permiso dentro del gesto del usuario y
 *   nunca se solicita al cargar.
 * - La lectura se calibra contra la primera orientación y se filtra con un
 *   factor 0.22; los ángulos se normalizan a `[-180, 180)`.
 * - El dedo siempre tiene prioridad: con `pressed` activo el sensor no escribe
 *   ni la luz ni el tilt.
 * - Movimiento reducido, sensores ausentes, pestaña oculta o overlays abiertos
 *   detienen el trabajo del sensor.
 * - `attach` delega el foil en `MaterialRendererApi`; una superficie no
 *   verificada queda como `original-surface` y nunca crea contexto GPU.
 *
 * DOM, sensores, timers y el renderer se inyectan para poder probar la lógica
 * en Node.
 */

import {
  getSharedMaterialRenderer,
  type MaterialCard,
  type MaterialRendererApi,
  type MaterialSceneHandle,
  type MaterialSurface,
} from './material-renderer';

/** Peso de la lectura nueva frente a la anterior en el filtro pasa-bajos. */
const FILTER_FACTOR = 0.22;
/** Divisor que convierte grados de inclinación en `[-1, 1]`. */
const TILT_DIVISOR = 22;
/** Ganancia del tilt entregado al consumidor (rotación de la carta). */
const TILT_GAIN = 2.2;
/** Energía base del material cuando no hay inclinación. */
const BASE_ENERGY = 0.36;
/** Energía del material al presionar con el dedo. */
const PRESSED_ENERGY = 0.98;
/** Energía mínima con sensor activo. */
const SENSOR_ENERGY = 0.48;
/** Ganancia de energía por magnitud de inclinación. */
const SENSOR_ENERGY_GAIN = 0.42;
/** Tiempo máximo sin lecturas antes de desactivar el sensor. */
const SENSOR_WATCHDOG_MS = 3500;
/** Mensajes de interfaz del legacy. */
const RELEASE_MESSAGE = 'Podés seguir deslizando con el dedo.';
const REDUCED_MESSAGE = 'El efecto respeta Movimiento reducido.';
const DENIED_MESSAGE = 'Sin permiso de movimiento. Podés seguir usando el dedo.';
const ENABLED_MESSAGE = 'Incliná suavemente el teléfono. El dedo tiene prioridad al deslizar.';
const NO_SENSOR_MESSAGE = 'No recibimos datos del sensor. Podés seguir deslizando con el dedo.';
const ENABLE_ERROR_MESSAGE = 'No pudimos activar el sensor. Podés seguir deslizando con el dedo.';
const TOUCH_ONLY_MESSAGE = 'Podés deslizar las cartas con el dedo.';
const INITIAL_MESSAGE = 'Activá el sensor para inclinar suavemente la carta.';

export interface HoloLight {
  readonly x: number;
  readonly y: number;
  readonly energy: number;
}

/** Elementos de control que el motor sincroniza. */
export interface HoloButton {
  disabled: boolean;
  title: string;
  onclick: ((event?: unknown) => void) | null;
  setAttribute(name: string, value: string): void;
  classList: { toggle(token: string, force?: boolean): void };
}

export interface HoloSetting {
  disabled: boolean;
  checked: boolean;
  onchange: ((event?: unknown) => void) | null;
}

export interface HoloStatus {
  textContent: string | null;
}

export interface HoloControls {
  readonly button: HoloButton;
  readonly setting: HoloSetting;
  readonly status: HoloStatus;
}

/**
 * Listener mínimo del `window`.
 *
 * El parámetro `never` permite aceptar tanto handlers con evento
 * (`deviceorientation`) como handlers sin argumentos (`pagehide`).
 */
export type HoloListener = (event: never) => void;

export interface HoloOrientationScreen {
  readonly angle?: number;
  addEventListener?(type: 'change', listener: () => void): void;
  removeEventListener?(type: 'change', listener: () => void): void;
}

export interface HoloWindow {
  readonly isSecureContext?: boolean;
  readonly orientation?: number;
  readonly screen?: { readonly orientation?: HoloOrientationScreen };
  readonly DeviceOrientationEvent?: DeviceOrientationApi;
  addEventListener(
    type: string,
    listener: HoloListener,
    options?: { readonly passive?: boolean },
  ): void;
  removeEventListener(type: string, listener: HoloListener): void;
}

export interface HoloDocument {
  readonly visibilityState: string;
  querySelector(selector: string): unknown;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
}

/** API mínima de `window.DeviceOrientationEvent`. */
export interface DeviceOrientationApi {
  requestPermission?(): Promise<string>;
}

export interface DeviceOrientationEventLike {
  readonly beta?: unknown;
  readonly gamma?: unknown;
}

export interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener?(type: 'change', listener: () => void): void;
  removeEventListener?(type: 'change', listener: () => void): void;
}

/** Descripción de impresión que recibe `attach` (compatible con materials). */
export interface HoloCardDescriptor {
  readonly card?: string;
  readonly surface?: MaterialSurface;
  readonly holo?: boolean;
  readonly rarity?: string;
  readonly special?: boolean;
}

export interface HoloAttachHooks {
  onTilt(x: number, y: number): void;
}

/** Estado de la escena activa. */
export interface HoloScene {
  readonly card: MaterialCard;
  holo: boolean;
  full: number;
  finish: number;
  pressed: boolean;
  readonly onTilt: (x: number, y: number) => void;
  light: HoloLight;
  material: MaterialSceneHandle | null;
  pointer(px: number, py: number): void;
  release(): void;
  dispose(): void;
}

export interface HoloEngineApi {
  readonly supported: boolean;
  attach(card: MaterialCard, descriptor: HoloCardDescriptor, hooks: HoloAttachHooks): HoloScene;
  refresh(): void;
  recenter(): void;
  enable(): Promise<boolean>;
  disable(message?: string): void;
  destroy(): void;
}

export interface HoloOptions {
  readonly document?: HoloDocument | null;
  readonly window?: HoloWindow | null;
  readonly matchMedia?: (query: string) => MediaQueryListLike;
  readonly controls?: HoloControls | null;
  readonly orientation?: DeviceOrientationApi;
  readonly material?: MaterialRendererApi | null;
  readonly setTimeout?: (callback: () => void, ms: number) => number;
  readonly clearTimeout?: (handle: number) => void;
}

interface TiltReading {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Normaliza grados a `[-180, 180)` como el legacy. */
export function wrapDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

/** Convierte beta/gamma en una lectura corregida por la rotación de pantalla. */
export function orientationReading(beta: number, gamma: number, angleRadians: number): TiltReading {
  return {
    x: gamma * Math.cos(angleRadians) + beta * Math.sin(angleRadians),
    y: beta * Math.cos(angleRadians) - gamma * Math.sin(angleRadians),
  };
}

/** Lee la rotación actual de la pantalla con la misma cadena `||` del legacy. */
function screenAngleRadians(windowRef: HoloWindow | null): number {
  const raw = windowRef?.screen?.orientation?.angle || windowRef?.orientation || 0;
  return (raw * Math.PI) / 180;
}

/** Tilt normalizado que consume el renderer. */
export function sensorTilt(reading: TiltReading): TiltReading {
  return {
    x: clamp(reading.x / TILT_DIVISOR, -1, 1),
    y: clamp(reading.y / TILT_DIVISOR, -1, 1),
  };
}

/** Giro de la carta derivado del tilt normalizado. */
export function holoTilt(x: number, y: number): TiltReading {
  return { x: -y * TILT_GAIN, y: x * TILT_GAIN };
}

/** Energía del material con sensor activo. */
export function sensorEnergy(x: number, y: number): number {
  return SENSOR_ENERGY + Math.hypot(x, y) * SENSOR_ENERGY_GAIN;
}

function defaultMatchMedia(query: string): MediaQueryListLike {
  if (typeof matchMedia !== 'function') return { matches: false };
  return matchMedia(query);
}

function defaultValue<T>(provided: T | undefined, fallback: T): T {
  return provided === undefined ? fallback : provided;
}

function resolveControls(
  documentRef: HoloDocument | null,
  provided: HoloControls | null | undefined,
): HoloControls | null {
  if (provided !== undefined) return provided;
  if (!documentRef) return null;
  return {
    // En producción estos nodos existen en `index.html`; el contrato legacy
    // asume la misma forma que `HTMLButtonElement`/`HTMLInputElement`.
    button: documentRef.querySelector('#motion-button') as HoloButton,
    setting: documentRef.querySelector('#motion-setting') as HoloSetting,
    status: documentRef.querySelector('#motion-status') as HoloStatus,
  };
}

/**
 * Crea una instancia aislada del motor holográfico.
 *
 * Sin `material` explícito usa el renderer compartido, igual que el legacy leía
 * `window.PokeMaterial`; pasar `null` reproduce una página sin renderer.
 */
export function createHoloEngine(options: HoloOptions = {}): HoloEngineApi {
  const documentRef = defaultValue(
    options.document,
    typeof document === 'undefined' ? null : (document as unknown as HoloDocument),
  );
  const windowRef = defaultValue(
    options.window,
    typeof window === 'undefined' ? null : (window as unknown as HoloWindow),
  );
  const media = options.matchMedia ?? defaultMatchMedia;
  const reduce = media('(prefers-reduced-motion: reduce)');
  const controls = resolveControls(documentRef, options.controls);
  const orientation = defaultValue(options.orientation, windowRef?.DeviceOrientationEvent);
  const material = options.material === undefined ? getSharedMaterialRenderer() : options.material;
  const scheduleTimeout = defaultValue(options.setTimeout, defaultSetTimeout);
  const clearScheduledTimeout = defaultValue(options.clearTimeout, defaultClearTimeout);
  const screenOrientation = windowRef?.screen?.orientation;
  const supported = orientation !== undefined && windowRef?.isSecureContext !== false;

  let active: HoloScene | null = null;
  let enabled = false;
  let pending = false;
  let baseline: TiltReading | null = null;
  let lastReading: TiltReading | null = null;
  let watchdog = 0;
  let epoch = 0;

  function isVisible(): boolean {
    if (!documentRef) return false;
    return (
      documentRef.visibilityState !== 'hidden' &&
      !documentRef.querySelector('.sheet.open') &&
      !documentRef.querySelector('dialog[open]')
    );
  }

  function ui(message?: string): void {
    if (!controls) return;
    const { button, setting, status } = controls;
    button.disabled = pending || reduce.matches || !supported;
    setting.disabled = button.disabled;
    setting.checked = enabled;
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute(
      'aria-label',
      enabled ? 'Desactivar brillo y movimiento' : 'Activar brillo y movimiento',
    );
    button.title = reduce.matches
      ? 'Movimiento reducido activado'
      : !supported
        ? 'Movimiento no disponible'
        : enabled
          ? 'Movimiento activado'
          : 'Activar brillo y movimiento';
    button.classList.toggle('enabled', enabled);
    if (message) status.textContent = message;
  }

  function applyLight(scene: HoloScene, x: number, y: number, energy: number): void {
    scene.light = { x, y, energy };
    scene.material?.set(x, y, energy);
  }

  function sensorLight(): void {
    if (!active || active.pressed || !lastReading || !enabled || reduce.matches || !isVisible()) {
      return;
    }
    const tilt = sensorTilt(lastReading);
    const rotation = holoTilt(tilt.x, tilt.y);
    active.onTilt(rotation.x, rotation.y);
    applyLight(active, tilt.x, tilt.y, sensorEnergy(tilt.x, tilt.y));
  }

  function handleOrientation(event: DeviceOrientationEventLike): void {
    const beta = event.beta;
    const gamma = event.gamma;
    if (
      !enabled ||
      reduce.matches ||
      documentRef?.visibilityState === 'hidden' ||
      typeof beta !== 'number' ||
      typeof gamma !== 'number' ||
      !Number.isFinite(beta) ||
      !Number.isFinite(gamma)
    ) {
      return;
    }

    clearScheduledTimeout(watchdog);
    const reading = orientationReading(beta, gamma, screenAngleRadians(windowRef));

    if (!isVisible()) {
      baseline = reading;
      lastReading = { x: 0, y: 0 };
      return;
    }
    if (!baseline) baseline = reading;
    const next: TiltReading = {
      x: wrapDegrees(reading.x - baseline.x),
      y: wrapDegrees(reading.y - baseline.y),
    };
    if (!lastReading) {
      lastReading = next;
    } else {
      lastReading.x += (next.x - lastReading.x) * FILTER_FACTOR;
      lastReading.y += (next.y - lastReading.y) * FILTER_FACTOR;
    }
    sensorLight();
  }

  function listen(): void {
    windowRef?.removeEventListener('deviceorientation', handleOrientation);
    windowRef?.addEventListener('deviceorientation', handleOrientation, { passive: true });
  }

  function recenter(): void {
    baseline = null;
    lastReading = null;
    if (active && !active.pressed) {
      active.onTilt(0, 0);
      applyLight(active, 0, 0, BASE_ENERGY);
    }
  }

  function disable(message?: string): void {
    epoch++;
    enabled = false;
    pending = false;
    clearScheduledTimeout(watchdog);
    watchdog = 0;
    windowRef?.removeEventListener('deviceorientation', handleOrientation);
    recenter();
    ui(message || RELEASE_MESSAGE);
  }

  async function enable(): Promise<boolean> {
    if (pending || reduce.matches || !supported) {
      ui(!supported ? TOUCH_ONLY_MESSAGE : REDUCED_MESSAGE);
      return false;
    }

    const ticket = ++epoch;
    pending = true;
    ui();

    try {
      // Debe permanecer directamente dentro del gesto del usuario en Safari.
      const permission =
        orientation && typeof orientation.requestPermission === 'function'
          ? await orientation.requestPermission()
          : 'granted';
      if (ticket !== epoch) return false;
      if (permission !== 'granted') {
        disable(DENIED_MESSAGE);
        return false;
      }
      enabled = true;
      pending = false;
      recenter();
      listen();
      ui(ENABLED_MESSAGE);
      watchdog = scheduleTimeout(() => {
        if (enabled && !baseline) disable(NO_SENSOR_MESSAGE);
      }, SENSOR_WATCHDOG_MS);
      return true;
    } catch {
      if (ticket === epoch) disable(ENABLE_ERROR_MESSAGE);
      return false;
    }
  }

  function attach(
    card: MaterialCard,
    descriptor: HoloCardDescriptor,
    hooks: HoloAttachHooks,
  ): HoloScene {
    if (active) active.dispose();

    const scene: HoloScene = {
      card,
      holo: false,
      full: 0,
      finish: 0,
      pressed: false,
      onTilt: (x: number, y: number) => hooks.onTilt(x, y),
      light: { x: 0, y: 0, energy: BASE_ENERGY },
      material: null,
      pointer(px: number, py: number): void {
        scene.pressed = true;
        applyLight(scene, clamp(px * 2 - 1, -1, 1), clamp(py * 2 - 1, -1, 1), PRESSED_ENERGY);
      },
      release(): void {
        scene.pressed = false;
        if (enabled && lastReading) {
          sensorLight();
        } else {
          scene.onTilt(0, 0);
          applyLight(scene, 0, 0, BASE_ENERGY);
        }
      },
      dispose(): void {
        scene.material?.dispose();
        if (active === scene) active = null;
      },
    };

    active = scene;
    scene.material = material?.attach(card, descriptor) ?? null;
    scene.holo = !!scene.material?.supported;
    card.classList.add('original-surface');
    sensorLight();
    return scene;
  }

  const onVisibilityChange = (): void => {
    if (documentRef?.visibilityState === 'hidden') {
      windowRef?.removeEventListener('deviceorientation', handleOrientation);
      clearScheduledTimeout(watchdog);
    } else if (enabled) {
      recenter();
      listen();
    }
  };
  const onPageHide = (): void => {
    disable();
  };
  const onReducedMotionChange = (): void => {
    if (reduce.matches) disable(REDUCED_MESSAGE);
    ui();
  };

  if (controls) {
    controls.button.onclick = () => {
      if (enabled) disable();
      else void enable();
    };
    controls.setting.onchange = () => {
      if (controls.setting.checked) void enable();
      else disable();
    };
  }

  windowRef?.addEventListener('orientationchange', recenter);
  screenOrientation?.addEventListener?.('change', recenter);
  documentRef?.addEventListener('visibilitychange', onVisibilityChange);
  windowRef?.addEventListener('pagehide', onPageHide);
  reduce.addEventListener?.('change', onReducedMotionChange);

  ui(supported ? INITIAL_MESSAGE : TOUCH_ONLY_MESSAGE);

  return {
    supported,
    attach,
    refresh(): void {
      if (active) applyLight(active, active.light.x, active.light.y, active.light.energy);
      material?.refresh();
    },
    recenter,
    enable,
    disable,
    destroy(): void {
      epoch++;
      enabled = false;
      pending = false;
      clearScheduledTimeout(watchdog);
      watchdog = 0;
      windowRef?.removeEventListener('deviceorientation', handleOrientation);
      windowRef?.removeEventListener('orientationchange', recenter);
      windowRef?.removeEventListener('pagehide', onPageHide);
      screenOrientation?.removeEventListener?.('change', recenter);
      documentRef?.removeEventListener?.('visibilitychange', onVisibilityChange);
      reduce.removeEventListener?.('change', onReducedMotionChange);
      if (active) {
        active.dispose();
        active = null;
      }
      if (controls) {
        controls.button.onclick = null;
        controls.setting.onchange = null;
      }
    },
  };
}

function defaultSetTimeout(callback: () => void, ms: number): number {
  // El handle es opaco para el motor; en navegador `setTimeout` devuelve number.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return globalThis.setTimeout(callback, ms) as unknown as number;
}

function defaultClearTimeout(handle: number): void {
  globalThis.clearTimeout(handle);
}
