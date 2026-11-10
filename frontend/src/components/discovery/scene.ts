import type { Palette } from '@/domain/catalog';

/** The action exclusively owns the inline styles of the two ambient layers. */
export function scene(node: HTMLElement, initial: Palette | null) {
  function layer(selector: string): HTMLElement {
    const element = node.querySelector<HTMLElement>(selector);
    if (!element) throw new Error('Missing ambient layer');
    return element;
  }
  const a = layer('#ambient-a');
  const b = layer('#ambient-b');
  const root = node.ownerDocument.documentElement.style;
  const properties = ['--journey-hue', '--card-paper'] as const;
  const previous = properties.map((name) => ({
    name,
    value: root.getPropertyValue(name),
    priority: root.getPropertyPriority(name),
  }));
  let side = 0;
  let last = '';

  function update(palette: Palette | null): void {
    if (!palette) return;
    const { h, s, v } = palette;
    root.setProperty('--journey-hue', String(h));
    const key = [h, s, v].join(':');
    if (key === last) return;
    last = key;
    root.setProperty('--card-paper', `hsl(${h} 35% 95%)`);
    const saturation = Math.max(28, Math.min(52, s * 0.65));
    const next = side ? a : b;
    const old = side ? b : a;
    side = 1 - side;
    next.style.background = `radial-gradient(ellipse at 50% 40%,hsl(${h} ${saturation}% 84% / .5),transparent 72%),radial-gradient(ellipse at 100% 90%,hsl(${(h + 120) % 360} 48% 89% / .4),transparent 65%),linear-gradient(150deg,hsl(${(h + 180) % 360} 42% 97%),hsl(${h} 45% 94%))`;
    next.style.opacity = '1';
    old.style.opacity = '0';
  }

  update(initial);
  return {
    update,
    destroy() {
      for (const { name, value, priority } of previous) {
        if (value) root.setProperty(name, value, priority);
        else root.removeProperty(name);
      }
    },
  };
}
