# Aceptación comparativa en ejecución

Harness opt-in, independiente de `test:e2e`. Desde `frontend/`, con el legacy
en `http://localhost:8787` y Vite en `http://localhost:5173` ya iniciados:

```sh
npx playwright test -c playwright.parity.config.ts
```

Para otras instancias usar `PARITY_LEGACY_URL` y `PARITY_SVELTE_URL`. Una
referencia inaccesible falla explícitamente; no se inicia ni modifica legacy y
no se requiere el sitio publicado. Reporte: `/tmp/opencode/parity-report/index.html`;
capturas y JSON de estilos efectivos están adjuntos a cada caso. No actualizar
snapshots: cada ejecución compara DOM vivo contra DOM vivo. También existe
`npm run test:parity`. No ejecutar dos instancias concurrentes: comparten los
directorios temporales de resultados y snapshots.
Cada caso adjunta `reference-build.json` con URLs y SHA-256 del HTML servido,
`app.js` y `journey.js` del legacy. Eso identifica los bytes de la referencia,
no acredita un commit concreto. Se rechaza comparar un origen contra sí mismo.

## Contrato de fixtures

Chromium, escala 1, motion reducido, viewports 390×844 y 1440×900. Se descarga
una vez por worker el bundle real de la referencia. En **todas** las cartas se
reemplazan `image` por `/__parity__/art.svg`, `surface` por `null` y `palette`
por `{h:325,s:56,v:79}`; se mantienen IDs, orden y demás metadatos. Se entrega
el mismo bundle transformado a ambos orígenes. Cada caso usa dos contextos nuevos, token fijo,
estado local sembrado con 0, 1, 15 o 31 votos `yes` sobre los primeros IDs del
catálogo, y backend interceptado: GET 404, PUT 200. Nunca usa ni borra sesiones
reales. Se verifica que las dos colecciones rendericen el número sembrado.
Se fija `refinementSchedule.nextSeen` más allá del catálogo para aislar estos
escenarios de discovery/colección: un encuentro automático no debe reemplazar
la carta frontal durante la captura. El afinador necesita escenarios propios.

La ruta sintética responde al mismo SVG (245×342) tanto a `<img>` como a
`fetch`; imágenes no normalizadas se rechazan. Antes de comparar se decodifica
la imagen frontal y cada thumbnail, se exige tamaño 245×342 y SHA-256 igual
al SVG fixture (también para `blob:`). Se verifica la cantidad de thumbnails.
Cada miniatura se lleva al viewport mediante scroll para activar la carga
diferida real y comprobar sus bytes; luego se restaura el scroll inicial antes
de capturar. No se exige que miniaturas fuera de pantalla conserven `src`:
el legacy libera esas imágenes deliberadamente. Un fallo de carga dentro
del viewport sigue siendo un error, no un skip.
Se sustituye la respuesta CSS de Google Fonts por dos `@font-face` locales
DM Sans y Playfair Display con los mismos bytes DejaVu Sans, cargados desde
`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`, configurable mediante
`PARITY_FONT_FILE`; si faltan el archivo o las fuentes no cargan, falla. Son
fuentes sintéticas, no validan las tipografías reales. Se esperan `fonts.ready`
y dos frames; `Date` se fija, `Math.random` se siembra y screenshots desactivan
animaciones. Esto no garantiza igual secuencia en workers, recomendaciones,
WebGL o tareas asíncronas. La paleta común evita que cartas diferentes cambien
el fondo, pero nombres y otros metadatos pueden diferir. No se ha probado el
recomendador, la variación real de arte/paleta ni la fidelidad temporal.

Se comparan displays, SVG activo recursivo (atributos y descendientes),
estilos del panel y rectángulos (tolerancia 1 px para redondeos subpíxel), y
visibilidad de ajustes; los estilos y SVG completos inspeccionados se exportan
en JSON. Para home y colección se escribe una captura legacy nueva bajo
`/tmp/opencode/parity-snapshots/` inmediatamente antes del matcher Playwright
que compara la captura Svelte. `threshold: 0` y `maxDiffPixels: 0` no conceden
tolerancia de color ni de cantidad; el comparador de Playwright puede excluir
píxeles antialias. El reporte incluye expected, actual, diff, conteo y ratio
redondeado del matcher cuando hay diferencia. `--update-snapshots` está
prohibido y falla antes de escribir el baseline. No se ocultan elementos. El
primer slot se compara, no los 15 rectángulos. Los demás estados y navegadores
requieren cobertura adicional; diferencias de tiempo y candidato no deben
atribuirse automáticamente a CSS.

Además se adjunta `*-raw-pixels.json`: un conteo independiente de diferencias
RGBA y la máxima variación por canal, decodificando las capturas en canvas.
Ese diagnóstico incluye antialias y no debe confundirse con el conteo del
matcher. Una captura sin diferencias del matcher no acredita por sí sola
igualdad exacta de todos los píxeles.

## Baseline RED — 2026-11-10

Con ambas instancias locales, `npx playwright test -c playwright.parity.config.ts`
dio 8 fallos de 8 (las apps pueden cambiar durante trabajo paralelo). En el caso
vacío móvil se observaron nombre y contador `none` vs `block`, SVG activo
`0 0 24 30` vs `0 0 24 24`, tabs y exportación `none` vs `flex`, padding del
panel `0px` vs `8px 8px 12px`, y ajustes visible vs ausente. Primer slot:
legacy `(22,110,61.1875,85.453125)` vs Svelte
`(14,232,65.59375,91.609375)`. Los ocho casos llegaron a colección y ajustes;
los escenarios no vacíos comprobaron además el número de favoritos renderizados.
Posteriormente, al repetirse los casos no vacíos, algunas diferencias de home
ya habían cambiado por edición concurrente: el baseline no es una captura
inmutable. No se debilitaron las aserciones para obtener verde.

## Comparación de píxeles — 2026-11-10

La primera ejecución con matcher dio 8 fallos: seis casos completaron ambas
comparaciones; los dos casos con 31 favoritos quedaron bloqueados antes de medir
por ausencia intermitente de imagen frontal. Ejemplos móviles: vacío home 276 y
colección 921 píxeles; uno home 23.180 y colección 1.823; 15 favoritos home
130.150 y colección 53.289. El matcher reporta ratios redondeados (0,01; 0,08;
0,40; 0,17 respectivamente para las diferencias mayores). Son mediciones de
estas capturas sintéticas, no certificación de equivalencia ni atribución de
causa. La comprobación con `--update-snapshots` falló explícitamente como se
esperaba. Los resultados pueden variar por ejecución y cambios concurrentes.

No se modifican contratos de la aplicación ni se mide rendimiento. No se ha
validado Safari/iPhone físico, detalle, drag/undo, errores de imagen o paridad
temporal. Los tests son instrumentación de diagnóstico, no certificación total.
