/**
 * Navegación interna de la SPA (plan §5.1/§5.2 y §18).
 *
 * Estado en memoria con runes: la vista actual es el único dato y no se
 * persiste. A propósito **no** se administra `location.hash`: el enlace de
 * sesión `#s=...` pertenece a la aplicación existente y un router hash
 * competiría con ese formato (plan §28 de `AGENTS.md`).
 *
 * La fábrica permite aislar el estado en pruebas; la app usa la instancia
 * compartida `appNavigation`.
 */

export type AppView = 'discovery' | 'collection' | 'settings';

export interface NavigationApi {
  /** Vista visible. */
  readonly current: AppView;
  /** Cambia de vista. Es idempotente. */
  go(view: AppView): void;
  /** `true` cuando la vista indicada está activa. */
  is(view: AppView): boolean;
}

/** Crea una navegación aislada con una vista inicial. */
export function createNavigation(initial: AppView = 'discovery'): NavigationApi {
  let current = $state<AppView>(initial);

  function go(view: AppView): void {
    current = view;
  }

  return {
    get current() {
      return current;
    },
    go,
    is(view: AppView) {
      return current === view;
    },
  };
}

/** Instancia compartida que monta la app. */
export const appNavigation: NavigationApi = createNavigation();
