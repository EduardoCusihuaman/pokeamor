/**
 * Sello de decisión del swipe (`paintSwipeSeal` en `src/app.js`).
 *
 * El sello es puramente progresivo y sin timers: cada `pointermove` vuelve a
 * pintarlo con la fuerza actual, de modo que avanzar hace crecer opacidad/relleno
 * y retroceder los reduce. No calcula preferencias ni lee layout.
 *
 * Valores exactos preservados:
 * - `amount = clamp01(strength)`.
 * - `is-yes` se activa con `direction > 0` (y se desactiva en cualquier otro
 *   caso, incluido `0`).
 * - `opacity = clamp01((amount − 0.12) / 0.48)`.
 * - `transform: scale(0.94 + amount · 0.06)`.
 * - `--seal-fill = clamp01((amount − 0.6) / 0.4)`.
 */

/** Lista de clases mínima que el sello necesita. */
export interface SwipeSealClassList {
  toggle(token: string, force?: boolean): boolean;
}

/** Estilos que el sello escribe. */
export interface SwipeSealStyle {
  opacity: string;
  transform: string;
  setProperty(name: string, value: string): void;
}

/** Nodo del sello de decisión. */
export interface SwipeSealElement {
  readonly classList: SwipeSealClassList;
  readonly style: SwipeSealStyle;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Pinta el sello para la fuerza y dirección actuales.
 *
 * @param seal Nodo del sello (`.swipe-seal`).
 * @param direction `> 0` para "sí", cualquier otro valor para "no".
 * @param strength Fuerza normalizada del gesto (se acota a `[0, 1]`).
 */
export function paintSwipeSeal(seal: SwipeSealElement, direction: number, strength: number): void {
  const amount = clamp01(strength);
  seal.classList.toggle('is-yes', direction > 0);
  seal.style.opacity = String(clamp01((amount - 0.12) / 0.48));
  seal.style.transform = `scale(${0.94 + amount * 0.06})`;
  seal.style.setProperty('--seal-fill', String(clamp01((amount - 0.6) / 0.4)));
}

/**
 * Fuerza el sello a su estado de decisión completa si aún no estaba visible.
 *
 * Réplica de `card.commitDecision`: si la opacidad actual ya es mayor que 0 no
 * vuelve a pintar (respeta el progreso del gesto); si no, lo completa.
 */
export function commitSwipeSeal(seal: SwipeSealElement, direction: number): void {
  if (!(Number(seal.style.opacity) > 0)) paintSwipeSeal(seal, direction, 1);
}
