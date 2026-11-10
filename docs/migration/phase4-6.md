# Fases 4–6 — Slice vertical, colección y descubrimiento (completadas)

**Fecha:** 2026-11-10

## Fase 4 — Slice vertical de discovery

- `application/discovery.svelte.ts`: estado con runes (`$state.raw` para catálogo
  y sesión, `$state` para posición/votos/undo, `$derived` para progreso). Los
  votos escriben el esquema canónico de sesión y persisten vía el sync controller
  (ETag).
- `components/discovery/*`: pantalla + carta + controles accesibles (voto por
  botones/teclado, sin gesto).
- Test de componente en navegador real.

## Fase 5 — Álbum, colección y navegación

- `application/navigation.svelte.ts`: navegación en memoria (sin router hash).
- `application/collection.svelte.ts`: filtros (all/yes/no/pending/top), favoritos,
  tandas, equipo y recompensas derivados de la misma sesión de discovery.
- `components/collection/*`: pantalla + grid (container query) + tiles accesibles.
- `App.svelte`: navegación header Descubrir/Colección.

## Fase 6 — Descubrimiento y swipe

- `engines/swipe/gesture.ts`: `SwipeController` con la física exacta de `app.js`
  (umbral `min(78, 0.21w)`, arrastre `sign·(min(|dx|,0.7w)+max(0,|dx|−0.7w)·0.45)`,
  rotación por arco, spring 1100/60, heurística de flick, tap 9px).
- `engines/deck/controller.ts` + `components/discovery/DiscoveryDeck.svelte`:
  isla imperativa (patrón A) que cablea gesture + flight + seal + reconcile +
  artwork/resource; decisión → voto, undo sin voto, destroy libera todo.
- `styles/deck.css`: estilos globales para nodos del motor.

## Tests

| Nivel | Herramienta | Resultado |
|---|---|---|
| Unitario | Vitest (Node) | 187 tests / 39 archivos |
| Componentes | Vitest Browser Mode | 7 tests / 4 archivos |
| E2E | Playwright (chromium) | 5 flows |
| Legacy (aceptación) | node:test | 154/154 |

## Siguiente

- Fase 7: modernización de CSS/APIs (mejora progresiva, migración `@layer` por
  grupos con capturas).
- Fase 8: comparación de performance + publicación (requiere el despliegue de
  Cloudflare — en pausa — y dispositivos físicos).
