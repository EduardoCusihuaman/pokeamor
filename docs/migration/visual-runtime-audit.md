# Auditoría de paridad en ejecución — 2026-11-10

## Resultado

La paridad visual y funcional no está completada. Los cambios anteriores
reprodujeron partes del HTML inicial y de la cascada CSS, sin verificar el DOM
final que JavaScript transforma. Los checks existentes no prueban esa paridad.

Esta auditoría no modifica la interfaz, los datos ni los tests.

## Referencias comprobadas

- `http://localhost:8787`: proceso `node scripts/dev.mjs`; sirve el Worker
  generado. Este servidor carga `worker/index.js` al arrancar, no en cada request.
- `http://localhost:5173`: Vite ejecutado desde `frontend/`.
- `https://pokeamor-cartas.h4lconn.chatgpt.site`: accesible y comprobado también
  con Chromium. No se publicó ni desplegó nada.
- El `/app.js` servido por 8787 coincide exactamente con `src/app.js` durante
  esta auditoría. El publicado no es idéntico byte a byte. Ambos renderizan
  los guantes de pelea y ocultan el nombre en la home.

Herramienta: Playwright/Chromium, contextos nuevos sin almacenamiento previo,
viewport móvil 390×844. También se guardaron capturas de colección a 1440×900,
pero no se ha completado una comparación desktop exhaustiva.

## Diferencias verificadas

| Área                                   | Legacy ejecutado                                  | Svelte actual                                          | Causa                                                                   |
| -------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Icono de pelea                         | Guantes, SVG `viewBox="0 0 24 30"`                | Dos cartas, SVG `0 0 24 24`                            | Se copió el SVG inicial; `paintBattleProgress()` lo reemplaza en legacy |
| Acción de pelea                        | Inicia preparación/sesión del afinador            | El botón no tiene handler                              | `App.svelte` agrega apariencia sin integrar el flujo                    |
| Nombre bajo la carta                   | `#name`: `display:none`                           | `display:block`                                        | Falta la regla efectiva `#app #name`                                    |
| Sensor en encabezado                   | Botón de destello con estado y acción             | Ausente                                                | No se integró `#motion-button`                                          |
| Contador de favoritos junto al corazón | Span oculto                                       | Número visible                                         | No se reprodujo el ocultamiento efectivo de `#likes>span`               |
| Pestañas de colección                  | `.collection-switch`: `display:none`              | `display:flex`                                         | Se recuperó una estructura de una iteración anterior                    |
| Barra de exportación, colección vacía  | `.batch-export-bar`: `display:none`               | `display:flex`                                         | Falta equivalencia de visibilidad según el estado                       |
| Tanda activa                           | Fondo transparente, padding 0                     | Panel con gradiente y padding                          | Se mantuvo el estilo anterior a `#sheet .active-batch` final            |
| Ajustes desde el icono                 | Panel `#collection-options` visible               | No aparece panel                                       | Navega a `settings`, pero `App.svelte` no renderiza esa vista           |
| Vista secundaria                       | Ajustes y respaldo; grid y summary legacy ocultos | «Tus elegidos.» y filtros                              | Se interpretó mal contenido existente pero oculto                       |
| Apertura de carta de colección         | Tiene flujo legacy de detalle                     | Callback opcional sin conexión en el montaje de la app | Extracción de módulos no equivale a integración de UI                   |

Fuentes relevantes: `src/page.html:119,137,152,155`,
`src/app.js:625-649,690`, `frontend/src/App.svelte`,
`frontend/src/components/collection/CollectionScreen.svelte` y
`frontend/src/application/navigation.svelte.ts`.

### Geometría de tandas con colección vacía

Ambas apps tienen 0 favoritos y un catálogo de 1025 en contextos nuevos.
Las coordenadas están en píxeles CSS de viewport 390×844:

| Elemento                  | 8787          | 5173          |
| ------------------------- | ------------- | ------------- |
| Header, x / ancho         | 22 / 346      | 14 / 362      |
| Placeholder, x / y        | 22 / 110      | 14 / 232      |
| Placeholder, ancho / alto | 61.19 / 85.45 | 65.59 / 91.61 |
| Gap de batch-grid         | 7             | 6             |

La diferencia vertical de 122 px persiste sin diferencias de votos. No se
puede atribuir el problema estructural al hash `#s=` ni al localStorage.

## Swipe: separar física de efectos conectados

Se arrastró la carta frontal desde su centro con desplazamientos horizontales
de 25, 50 y 85 px y vertical de 10 px; se canceló el gesto sin votar.

- Traslación horizontal, arco vertical, rotación Z, opacidad del sello y
  `--seal-fill` coinciden en las muestras tomadas. Las inclinaciones X/Y
  difieren ligeramente por geometría de carta; no se normalizó el artwork.
- A 50 px: ambos tienen `translate3d(50px, 1.7422px, 0px)`, rotación
  `2.55384deg`, opacidad de sello 1 y relleno `0.1352694924`.
- En legacy `--yes-intent` global vale `0.5232862376`; en Svelte está vacío.
  A 85 px legacy llega a `0.8`; Svelte sigue sin actualizarlo.
- El gesto extraído expone `onDrag`, `onLift`, `onReset` y otros hooks, pero
  `frontend/src/engines/deck/controller.ts` solo conecta `onDecision` en ese
  objeto de callbacks. Falta la integración del feedback global.
- El controlador nuevo declara explícitamente diferida la integración de
  material WebGL. Esto requiere auditoría separada; no se puede afirmar aquí
  que el holo explique un efecto observado: las muestras tenían cero canvas.

No se midieron todavía los frames de salida, retorno, undo, flick, cambios
de dirección ni materiales con un artwork idéntico. No se declara equivalencia
de animaciones. La explicación anterior de que faltaba el sello era incompleta:
el sello actual sí coincide en las muestras de arrastre.

## Evidencia local

Artefactos de diagnóstico en `/tmp/opencode/parity-audit/`:

- `legacy-home.png`, `published-home.png`, `svelte-home.png`.
- `legacy-collection.png`, `svelte-collection.png` y capturas desktop.
- `legacy-drag50.png`, `svelte-drag50.png`, `*-swipe.json`.
- `legacy-settings.png`, `svelte-settings.png`.
- `*-home.computed.css`, `*-collection.computed.css`: valores efectivos de
  `getComputedStyle()` para los elementos inspeccionados, incluidos los ocultos.
- `*-matched-home.json`: reglas coincidentes obtenidas mediante Chrome DevTools
  Protocol. Contienen también declaraciones sobreescritas; los valores
  computados son la referencia del resultado efectivo.
- HTML servido y scripts `app.js`/`journey.js` descargados para trazabilidad.

Los CSS computados son snapshots de diagnóstico, no hojas para pegar en la
app: no conservan responsive, transiciones, estados ni reglas condicionales.
Las capturas de home no usan el mismo artwork, por lo que no son un baseline
pixel-perfect de la imagen de carta. Una primera captura legacy mostró un
error transitorio de imagen; una captura posterior cargó correctamente.

## Corrección del proceso antes de otra ola visual

1. Fijar datos, artwork, viewport, almacenamiento y motion preference en ambas
   apps mediante fixtures de navegador aisladas, sin borrar datos del usuario.
2. Agregar pruebas de aceptación que fallen por los hallazgos anteriores:
   nombre y pestañas ocultos, SVG activo, ajustes funcionales y feedback de swipe.
3. Reparar por separado home, colección/ajustes e integración de efectos,
   preservando Svelte 5 y la propiedad de los subárboles imperativos.
4. Comparar estados en ejecución: vacío, tanda parcial/completa, varias tandas,
   ajustes, detalle, afinador, error de imagen, drag/cancel/release/undo.
5. Ejecutar checks y suites relacionados sin debilitar las pruebas. Las pruebas
   E2E actuales de votos usan flechas: no demuestran el efecto de swipe ni la
   funcionalidad de pelea/ajustes. Un resultado verde no sustituye esta cobertura.

Riesgos pendientes: equivalencia temporal, responsive completo, materiales,
persistencia en sesiones compartidas, accesibilidad y Safari/iPhone físico.
Esta auditoría no afirma mejoras de rendimiento ni finalización de la migración.
