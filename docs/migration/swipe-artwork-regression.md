# Swipe: franjas y salto al promover la carta

## Problema y evidencia

La carta nueva agregaba nodos `.glint` y `.foil` inexistentes en el swipe del
legacy renderizado. Al activarse el gesto, `.foil` superponía un gradiente
repetido de líneas horizontales, con `color-dodge`, sobre cualquier impresión.
Se reprodujo en Chromium y se comparó contra `localhost:8787` con el dedo
presionado. Las capturas están en `/tmp/opencode/swipe-before-active.png` y
`/tmp/opencode/swipe-active-fixed-{8787,5173}.png`.

Además, `activate()` no limpiaba el transform y filtro de la undercard al
promoverla. Un flick corto podía conservar una escala/desplazamiento residual
hasta el próximo gesto. El legacy los limpia explícitamente. La activación
ahora es idempotente: reconciliar la misma carta no reinicia un gesto activo.

## Cambios y contratos

- `frontend/src/engines/deck/controller.ts`: se eliminan las capas sintéticas
  y se limpia la pose exclusivamente al promover una carta.
- `frontend/src/styles/deck.css`: se elimina el CSS de esas capas sin uso.
- `frontend/tests/components/deck-swipe-regression.test.ts`: comprueba flick,
  promoción, identidad de imagen y reconciliación durante otro gesto.
- `frontend/tests/e2e/swipe-stability.spec.ts`: tres swipes alternados a
  390×844 y 1440×900, muestreando el encabezado y scroll en cada frame.

No cambia la física de swipe, el sello, la iluminación de intención, la
trayectoria de salida ni el esquema de persistencia. No se sustituyen imágenes
al promoverlas. No se simula el renderer de materiales pendiente.

## Verificación

La prueba de componente se observó roja por las capas falsas y la pose heredada
antes de corregir el motor. Después pasan 22 pruebas browser, 187 unitarias,
8 E2E Chromium (incluida comparación de swipe contra legacy), typecheck, lint
y build. Las pruebas de estabilidad verifican scroll cero y rectángulo del
encabezado constante durante arrastre y salida, con motion habilitado.

El desplazamiento de **toda** la pantalla descrito por el usuario no se
reprodujo en Chromium de escritorio; sí se corrigieron las franjas y el salto
de promoción comprobados. Queda validar el resultado en el dispositivo del
usuario y Safari/iPhone físico. No se afirma mejora de rendimiento ni paridad
completa de materiales. Cloudflare sigue en pausa.

## Verificación adicional del degradado solicitado por el usuario

Se interceptó el mismo catálogo en ambos orígenes, asignando a todas las
impresiones la misma imagen SVG blanca de 245×342, `surface: null` y paleta
`{h:325,s:56,v:79}`. Se usaron contextos nuevos, viewport 390×844, escala 1,
sesión vacía y motion reducido para fijar exactamente la pose. Las fuentes
terminaron de cargar antes de capturar. No se inyectó CSS correctivo.

Con el puntero presionado se midieron 0, +50, +85, −50 y −85 px de arrastre.
El CSS computado fue idéntico en ambos orígenes para background, opacity,
sombras, blend mode, filter y transform de `.choice-light`, los dos
pseudoelementos de `.decision-glow`, ambas capas ambiente y `#tanda-light`.
También coincidieron `--love`, `--pass`, `--yes-intent` y `--no-intent`.

| Medida                                           | Legacy y Svelte     |
| ------------------------------------------------ | ------------------- |
| Alfa del degradado sobre la carta a 50 px        | 0,314               |
| Alfa del degradado sobre la carta a 85 px        | 0,48                |
| Alfa de sombra interior a 85 px                  | 0,9                 |
| Opacidad de luz global rosa a +50 / +85 px       | 0,523286 / 0,8      |
| Opacidad de luz global azul a −50 / −85 px       | 0,490581 / 0,75     |
| Stops transparentes del degradado sobre la carta | 42% y 58%           |
| Extensión de la luz global                       | Transparente al 64% |

Se compararon además siete muestras RGBA por captura (cinco sobre la zona
del deck y dos del fondo). Las siete coincidieron exactamente para los cinco
desplazamientos. Eso comprueba las muestras, no igualdad completa del frame.

Evidencia: `/tmp/opencode/gradient-audit/computed.json`,
`sampled-colors.json` y diez capturas `{8787,5173}-{dx}.png` en esa carpeta.
No se cambia la intensidad: la discrepancia comprobada eran las franjas
sintéticas, no un degradado más fuerte o más débil. La medición no valida
el renderer de materiales ni las transiciones con motion habilitado.
