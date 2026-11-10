// Migrado de tests/20-holo.test.mjs — sensor de movimiento y overlay foil.
// Usa dobles inyectados en lugar de `node:vm`.
import { describe, expect, it } from 'vitest';

import {
  createHoloEngine,
  type HoloControls,
  type HoloDocument,
  type HoloWindow,
} from '../../src/engines/materials/holo';

interface SetupOptions {
  readonly permission?: string;
  readonly supported?: boolean;
  readonly reduced?: boolean;
}

function setup({ permission = 'granted', supported = true, reduced = false }: SetupOptions = {}) {
  let permissionCalls = 0;
  let contextAttempts = 0;

  class FakeElement {
    readonly classes = new Set<string>();
    readonly classList = {
      add: (...tokens: string[]): void => {
        tokens.forEach((token) => this.classes.add(token));
      },
      remove: (...tokens: string[]): void => {
        tokens.forEach((token) => this.classes.delete(token));
      },
      toggle: (token: string, force?: boolean): boolean => {
        const on = force ?? !this.classes.has(token);
        if (on) this.classes.add(token);
        else this.classes.delete(token);
        return on;
      },
      contains: (token: string): boolean => this.classes.has(token),
    };
    children: FakeElement[] = [];
    parentElement: FakeElement | null = null;
    clientWidth = 380;
    artRatio = 0.716;
    disabled = false;
    checked = false;
    title = '';
    textContent: string | null = '';
    onclick: (() => void) | null = null;
    onchange: (() => void) | null = null;
    private readonly attributes = new Map<string, string>();

    setAttribute(name: string, value: string): void {
      this.attributes.set(name, value);
    }

    getAttribute(name: string): string | undefined {
      return this.attributes.get(name);
    }

    append(child: unknown): void {
      if (child instanceof FakeElement) {
        child.parentElement = this;
        this.children.push(child);
      }
    }

    remove(): void {
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      }
      this.parentElement = null;
    }

    addEventListener(): void {
      // Las cartas no reciben listeners del motor holo.
    }

    getContext(): null {
      contextAttempts += 1;
      return null;
    }
  }

  const nodes = new Map<string, FakeElement>();
  const get = (selector: string): FakeElement => {
    if (selector === '.sheet.open' || selector === 'dialog[open]') {
      throw new Error('Los overlays deben consultarse como ausentes');
    }
    let node = nodes.get(selector);
    if (!node) {
      node = new FakeElement();
      nodes.set(selector, node);
    }
    return node;
  };

  const listeners = new Map<string, (event?: unknown) => void>();
  const documentListeners = new Map<string, () => void>();

  const documentRef = {
    visibilityState: 'visible',
    querySelector: (selector: string): FakeElement | null =>
      selector === '.sheet.open' || selector === 'dialog[open]' ? null : get(selector),
    addEventListener: (type: string, listener: () => void): void => {
      documentListeners.set(type, listener);
    },
    removeEventListener: (type: string): void => {
      documentListeners.delete(type);
    },
  };

  const windowRef = {
    isSecureContext: true,
    screen: {
      orientation: {
        angle: 0,
        addEventListener: (): void => undefined,
      },
    },
    ...(supported
      ? {
          DeviceOrientationEvent: {
            requestPermission: (): Promise<string> => {
              permissionCalls += 1;
              return Promise.resolve(permission);
            },
          },
        }
      : {}),
    addEventListener: (type: string, listener: (event?: unknown) => void): void => {
      listeners.set(type, listener);
    },
    removeEventListener: (type: string, listener: (event?: unknown) => void): void => {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };

  let timerId = 0;
  const timers = new Map<number, () => void>();
  const media = { matches: reduced, addEventListener: (): void => undefined };
  const controls: HoloControls = {
    button: get('#motion-button'),
    setting: get('#motion-setting'),
    status: get('#motion-status'),
  };

  const api = createHoloEngine({
    document: documentRef as unknown as HoloDocument,
    window: windowRef as unknown as HoloWindow,
    matchMedia: () => media,
    controls,
    material: null,
    setTimeout: (callback) => {
      timerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
    clearTimeout: (handle) => {
      timers.delete(handle);
    },
  });

  return {
    api,
    get,
    document: documentRef,
    listeners,
    Element: FakeElement,
    calls: () => permissionCalls,
    contexts: () => contextAttempts,
    timers,
    documentListeners,
    emit(type: string, event?: unknown): void {
      listeners.get(type)?.(event);
    },
    emitDocument(type: string): void {
      documentListeners.get(type)?.();
    },
  };
}

describe('holo', () => {
  it('el sensor es opt-in y el permiso denegado deja el dedo disponible', async () => {
    const context = setup({ permission: 'denied' });
    expect(context.calls()).toBe(0);
    expect(context.listeners.has('deviceorientation')).toBe(false);
    expect(await context.api.enable()).toBe(false);
    expect(context.calls()).toBe(1);
    expect(context.listeners.has('deviceorientation')).toBe(false);

    const card = new context.Element();
    const scene = context.api.attach(card, { holo: true }, { onTilt: () => undefined });
    scene.pointer(0.8, 0.25);
    expect(Math.abs(scene.light.x - 0.6)).toBeLessThan(0.001);
    expect(card.classList.contains('has-shader')).toBe(false);
  });

  it('calibra, filtra y da prioridad al dedo sin GPU', async () => {
    const context = setup();
    const card = new context.Element();
    const tilts: Array<[number, number]> = [];
    const scene = context.api.attach(
      card,
      { holo: true },
      {
        onTilt: (x, y) => {
          tilts.push([x, y]);
        },
      },
    );

    expect(await context.api.enable()).toBe(true);
    context.emit('deviceorientation', { beta: 40, gamma: 0 });
    const calibrated = tilts.at(-1);
    expect(calibrated).toBeDefined();
    if (!calibrated) throw new Error('Falta el tilt calibrado');
    expect(Object.is(calibrated[0], -0)).toBe(true);
    expect(calibrated[1]).toBe(0);

    context.emit('deviceorientation', { beta: 50, gamma: 10 });
    const tilted = tilts.at(-1);
    if (!tilted) throw new Error('Falta el tilt filtrado');
    expect(tilted[0]).toBeLessThan(0);
    expect(tilted[1]).toBeGreaterThan(0);

    scene.pointer(0.8, 0.25);
    const count = tilts.length;
    context.emit('deviceorientation', { beta: 60, gamma: 20 });
    expect(tilts.length).toBe(count);
    expect(Math.abs(scene.light.x - 0.6)).toBeLessThan(0.001);

    scene.release();
    expect(tilts.length).toBeGreaterThan(count);
    const beforeInvalid = tilts.length;
    context.emit('deviceorientation', { beta: null, gamma: null });
    expect(tilts.length).toBe(beforeInvalid);

    context.api.attach(new context.Element(), { holo: true }, { onTilt: () => undefined });
    expect(context.contexts()).toBe(0);
  });

  it('pasar a segundo plano detiene el sensor y volver recalibra', async () => {
    const context = setup();
    const tilts: Array<[number, number]> = [];
    context.api.attach(
      new context.Element(),
      { holo: false },
      {
        onTilt: (x, y) => {
          tilts.push([x, y]);
        },
      },
    );

    await context.api.enable();
    context.emit('deviceorientation', { beta: 20, gamma: 20 });

    context.document.visibilityState = 'hidden';
    context.emitDocument('visibilitychange');
    expect(context.listeners.has('deviceorientation')).toBe(false);

    context.document.visibilityState = 'visible';
    context.emitDocument('visibilitychange');
    expect(context.listeners.has('deviceorientation')).toBe(true);

    context.emit('deviceorientation', { beta: 80, gamma: 60 });
    const recalibrated = tilts.at(-1);
    expect(recalibrated).toBeDefined();
    if (!recalibrated) throw new Error('Falta el tilt recalibrado');
    expect(Object.is(recalibrated[0], -0)).toBe(true);
    expect(recalibrated[1]).toBe(0);

    context.api.disable();
    expect(context.listeners.has('deviceorientation')).toBe(false);
    expect(context.get('#motion-setting').checked).toBe(false);
  });

  it('movimiento reducido y sensores ausentes nunca piden permiso', async () => {
    for (const options of [{ reduced: true }, { supported: false }]) {
      const context = setup(options);
      expect(await context.api.enable()).toBe(false);
      expect(context.calls()).toBe(0);
      expect(context.get('#motion-button').disabled).toBe(true);
    }
  });

  it('rareza, disponibilidad holo y arte especial no habilitan un foil sin verificar', () => {
    const context = setup();
    const descriptors = [
      { holo: false },
      { holo: true, rarity: 'Holo Rare' },
      { holo: true, special: true, rarity: 'Illustration rare' },
      { holo: true, rarity: 'Ultra Rare' },
      {
        card: 'sv06-214',
        surface: { scope: 'physical', status: 'unverified', effect: 'none' },
      },
    ];
    for (const descriptor of descriptors) {
      const card = new context.Element();
      const scene = context.api.attach(card, descriptor, { onTilt: () => undefined });
      expect(scene.holo).toBe(false);
      expect(card.classList.contains('original-surface')).toBe(true);
    }
    expect(context.contexts()).toBe(0);
  });

  it('la salida de página desactiva el sensor sin lanzar', async () => {
    const context = setup();
    await context.api.enable();
    expect(() => {
      context.emit('pagehide');
    }).not.toThrow();
    expect(context.listeners.has('deviceorientation')).toBe(false);
  });
});
