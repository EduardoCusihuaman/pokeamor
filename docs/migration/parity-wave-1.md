# Paridad visual — ola 1 en curso

## Alcance y referencia

Se corrigen las diferencias de presentación observadas en ejecución, sin
rediseñar la app ni sustituir la implementación Svelte por el legacy.
Referencia principal: `http://localhost:8787`. Se contrasta también el sitio
publicado para detectar divergencias entre versiones. El HTML inicial no es
el estado final: `app.js` y `journey.js` cambian nodos, iconos y visibilidad.

La auditoría inicial está en [visual-runtime-audit.md](./visual-runtime-audit.md).
La fidelidad de una pantalla no acredita automáticamente que sus flujos
estén integrados ni que el rendimiento sea equivalente.

## Distribución del trabajo

Cuatro subagentes `openai/gpt-6.1-terra#low`, con edición separada:

| Unidad                  | Alcance                                                    | Condición de verificación                                         |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Referencia y aceptación | Harness opt-in, fixtures comunes, capturas y CSS computado | Pruebas inicialmente rojas por diferencias reales                 |
| Home                    | Shell Svelte y CSS de discovery                            | Iconos efectivos, visibilidad y geometría contra navegador legacy |
| Colección               | Tandas, header y panel de ajustes                          | Estados vacío, parcial y completo, no solo CSS fuente             |
| Swipe                   | Integración de feedback en el motor                        | Intent, sello y cleanup sin alterar física ni identidad           |

La coordinación revisará los diffs y ejecutará los gates después de integrar
los resultados. Ningún subagente está autorizado a declarar completada la
migración ni a desplegar.

## Baseline y limitaciones del entorno

- `npm test` en la raíz: **154/154**, ejecutado antes de la integración de esta
  ola. No es una prueba de paridad del frontend.
- Chromium disponible: versión 158.0.8127.18.
- Firefox y WebKit de Playwright descargados, pero faltan dependencias nativas
  del sistema. La descarga no equivale a una ejecución satisfactoria.
- Safari/iPhone físico no validado.
- Cloudflare sigue en pausa; no se modifica el despliegue.

## Criterios de cierre

- [ ] Fixtures aisladas con iguales datos, impresión y artwork.
- [ ] Comparación de estados móviles y desktop, con fuentes listas.
- [ ] Iconos y visibilidad comprobados en el DOM final, incluidos reemplazos JS.
- [ ] Diferencias de geometría medidas y capturas revisadas por coordinación.
- [ ] Ajustes abre contenido real; acciones no implementadas se identifican.
- [ ] Swipe limpia feedback al cancelar, votar, destruir y cambiar de carta.
- [ ] Identidad de imágenes y propiedad del DOM imperativo preservadas.
- [ ] `check`, `lint`, formato, unit, browser, E2E y aceptación legacy revisados.
- [ ] Pruebas comparativas ejecutadas sin actualizar baselines a ciegas.
- [ ] Pendientes de funcionalidad, animación y navegadores registrados.

## Inventario de integración previo a la ola

Una inspección estática de imports desde `frontend/src/main.ts` encontró que
`application/album.ts`, `battle.ts`, `debug.ts`, `detail.ts`, `events.ts`,
`export.ts`, `refinement-gestures.ts`, y `engines/materials/holo.ts` /
`material-renderer.ts` no eran alcanzables por ese grafo. Esto es un indicio
de integración pendiente, no una prueba suficiente de comportamiento en sí.
Los módulos extraídos no deben contabilizarse como pantallas completadas.

No se autoriza ocultar estas carencias con botones sin acción ni cambiar
silenciosamente los contratos de persistencia, recursos o experiencia.

## Primera revisión de coordinación (todavía no aprobada)

- Home: se verificó el SVG de guantes en ambas referencias y se corrigió la
  visibilidad del nombre. La geometría inspeccionada coincidió, pero el fondo
  dinámico de `setScene()` todavía requería conexión. Se pidió una segunda
  revisión con paletas distintas y undo.
- Colección: el caso vacío coincidió en el primer slot móvil/desktop. Se pidió
  completar los casos con 1, 15 y 31 favoritos antes de aceptar la geometría.
- Swipe: el intent global ya coincide en las muestras a ±50 px y vuelve a cero
  al cancelar. Se eliminaron escrituras del motor en botones administrados por
  Svelte y se agregaron pruebas de ownership entre controladores. No se afirma
  equivalencia de WebGL ni de toda la animación de salida.
- Harness: el baseline quedó rojo en ocho casos. La primera versión adjuntaba
  screenshots pero no calculaba diferencias de píxeles; se pidió endurecerla
  antes de usarla como gate de paridad.
- No se acepta un gate verde obtenido con referencias de Svelte actualizadas
  automáticamente ni tolerancias amplias que oculten cambios de layout.

La ola sigue en curso. Las pruebas ejecutadas durante ediciones concurrentes
son diagnóstico; los checks finales deben repetirse con la integración estable.

## Verificación de integración antes de integrar el scrubber

- `check`: sin errores ni warnings; `lint`: sin errores.
- `test:browser`: 20/20; `test:unit`: 187/187; `build`: satisfactorio.
- E2E Chromium: 5 flujos existentes pasan; la comparación nueva de swipe es
  opt-in y se omite si no se configura `SWIPE_LEGACY_URL`.
- Comparación estricta sintética: 1/8 casos pasa, 7/8 siguen rojos. El caso
  vacío desktop pasa las comparaciones de home y colección del matcher.
- Home conserva diferencias de 1 a 44 píxeles del matcher según escenario
  (más los píxeles que el algoritmo clasifica como antialias). No se amplió
  ninguna tolerancia.
- Colección: desktop vacío/1/15 y móvil 15 no reportaron diferencias del
  matcher en esta ejecución. Móvil vacío/1 tuvo 5/6 píxeles distintos. Con 31
  favoritos móvil conserva 749 píxeles distintos, incluyendo el scrubber
  faltante; el caso desktop quedó bloqueado al decodificar una miniatura.
- El gate de ajustes solo comprueba que el panel abre: NO acredita que su
  contenido, acciones o apariencia equivalgan al legacy. Se mantiene el gap
  explícito de respaldo, sensaciones, detalle, afinador y sensor.

Estos resultados no certifican la paridad de toda la aplicación. El scrubber
se integra en una unidad separada, con pruebas de pointer, scroll y cleanup.

## Resultado final de esta ola (paridad total NO aprobada)

El scrubber ahora reutiliza `application/album.ts` mediante una acción con
ownership explícito del rail y preview. Sigue el scroll, permite arrastrar,
previsualizar, saltar a una tanda, cancelar y usar teclado. Al desmontar libera
listeners, observadores y frames. Se preserva la carga diferida de miniaturas:
el harness las recorre mediante scroll y restaura la posición antes de medir.

Checks de integración ejecutados después de los cambios:

| Check                                                     | Resultado               |
| --------------------------------------------------------- | ----------------------- |
| Typecheck Svelte y TypeScript                             | Sin errores ni warnings |
| ESLint                                                    | Sin errores             |
| Unit                                                      | 187/187                 |
| Browser Chromium                                          | 21/21                   |
| E2E Chromium con `SWIPE_LEGACY_URL=http://localhost:8787` | 6/6, sin skips          |
| Legacy                                                    | 154/154                 |
| Build Vite                                                | Satisfactorio           |
| Comparación estricta                                      | 1/8 verde; 7/8 rojos    |

Última comparación sintética, sin ampliar tolerancias:

| Viewport | Favoritos | Home: píxeles del matcher | Colección: píxeles del matcher |
| -------- | --------- | ------------------------- | ------------------------------ |
| 390×844  | 0         | 8                         | 0                              |
| 390×844  | 1         | 9                         | 0                              |
| 390×844  | 15        | 14                        | 0                              |
| 390×844  | 31        | 20                        | 87                             |
| 1440×900 | 0         | 0                         | 0                              |
| 1440×900 | 1         | 1                         | 2                              |
| 1440×900 | 15        | 21                        | 0                              |
| 1440×900 | 31        | 44                        | 81                             |

Son conteos del matcher, no prueba de igualdad RGBA: el reporte también
adjunta métricas crudas que incluyen antialias. Los pequeños cambios entre
ejecuciones no se deben interpretar automáticamente como regresiones de CSS.
Reporte local: `/tmp/opencode/parity-report/index.html`.

### Contratos y pendientes

- Se conserva la identidad de imágenes al promover cartas. El tamaño sigue
  la proporción natural de cada artwork, no una relación fija aproximada.
- El feedback global de swipe tiene propietario y limpieza al cancelar,
  liberar, deshabilitar y destruir; no escribe botones administrados por Svelte.
- No se cambian Worker, esquema de sesión ni validación de Origin.
- Ajustes abre un aviso explícito, no el panel equivalente: faltan respaldo,
  recuperación, importación/exportación y sensaciones.
- Afinador, detalle/álbum completo, sensor y materiales siguen pendientes de
  integración. El botón de pelea sigue sin acción y el destello es decorativo.
- Faltan cerrar diferencias de píxeles, comprobar la transición de aterrizaje
  del scrubber y comparar todos los estados animados con recursos reales.
- No se midió rendimiento ni se validó Safari/iPhone físico. Firefox/WebKit
  continúan bloqueados por dependencias nativas ausentes.
- Cloudflare permanece en pausa. Esta ola no completa la migración.
