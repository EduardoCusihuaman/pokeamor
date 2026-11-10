# Pokeamor — Especificación técnica de migración a Svelte 5

**Versión:** 1.1  
**Fecha:** 9 de noviembre de 2026  
**Estado:** Arquitectura propuesta y revisada; pendiente de implementación y validación  
**Revisión:** incorpora las correcciones de la revisión crítica de la v1.0  
**Repositorio:** `EduardoCusihuaman/pokeamor`  
**Objetivo:** Reestructurar Pokeamor como una SPA moderna, mantenible y extremadamente interactiva, preservando su comportamiento visual, sus optimizaciones y su experiencia de usuario.

---

## 1. Resumen ejecutivo

Pokeamor será migrada de JavaScript imperativo monolítico a una arquitectura basada en **Svelte 5, Vite, TypeScript estricto y APIs web nativas**.

La migración debe mejorar la mantenibilidad, modularidad, capacidad de testing y facilidad de trabajo con agentes de IA.

El rendimiento, la continuidad visual y el comportamiento funcional actuales son restricciones de producto, no funcionalidades opcionales.

La implementación existente será la referencia de comportamiento hasta que la nueva versión demuestre equivalencia funcional y ausencia de regresiones significativas de rendimiento.

### Stack aprobado

| Área | Tecnología |
|---|---|
| Framework de UI | Svelte 5 |
| Bundler y desarrollo | Vite |
| Lenguaje | TypeScript, modo `strict` |
| CSS | CSS nativo moderno |
| Estilos encapsulados | Svelte |
| Estilos del motor imperativo | CSS global controlado (`deck.css`) |
| Reactividad | Svelte 5 Runes |
| Gestos | Pointer Events |
| Animaciones complejas | Web Animations API |
| Scheduling visual | `requestAnimationFrame` |
| Efectos holográficos | WebGL existente |
| Cómputo aislado | Web Workers |
| Persistencia | IndexedDB, localStorage y backend actual |
| Backend | Cloudflare Worker + R2 existentes |
| Linter | ESLint Flat Config |
| Lint con información de tipos | typescript-eslint type-checked |
| Formatter | Prettier + plugin Svelte |
| Control de compatibilidad CSS | `@eslint/css` con `css/use-baseline` + Stylelint para `<style>` de componentes |
| Pruebas unitarias | Vitest en Node |
| Pruebas de componentes | Vitest Browser Mode + `vitest-browser-svelte` |
| Pruebas de navegador | Playwright |
| Navegadores objetivo | Chrome, Firefox y Safari/iOS mínimos definidos en §10 |
| Análisis de bundles | Visualizador de Rollup/Vite |
| Automatización de calidad | CI con comandos reproducibles |

### Tecnologías excluidas inicialmente

- Astro.
- SvelteKit.
- React o Preact.
- Redux, Zustand y bibliotecas de estado equivalentes.
- Tailwind y frameworks CSS.
- Bibliotecas externas de animaciones.
- Routers externos.
- Bibliotecas de componentes completas.
- Polyfills extensos para APIs web recientes.
- Service Workers nuevos sin un caso concreto y verificado.

**Criterio:** una dependencia nueva debe demostrar que reduce complejidad o mejora un requisito verificable. No se instalarán bibliotecas únicamente por popularidad.

### Cambios incorporados en la v1.1

- Se sustituye «Baseline» genérico por versiones mínimas explícitas y tres niveles de compatibilidad.
- Se adelanta la validación del hosting y de los assets compilados a la fase de bootstrap.
- Se adopta Vitest Browser Mode para pruebas de componentes.
- Se formalizan la propiedad y las transferencias de nodos, imágenes y animaciones.
- Se separan contratos exactos y métricas estadísticas de rendimiento.
- Se elimina el uso de `$lib` y se evita duplicar estructuras de proyecto.
- Se añade linting con información de tipos y verificación de dependencias.
- Se separa la migración estructural de la modernización visual.
- Se amplían las reglas para agentes con reglas específicas de Svelte 5.

---

## 2. Contexto del repositorio

La implementación existente contiene:

- `src/app.js`: aplicación principal, estado e interacciones.
- `src/page.html`: estructura y estilos actuales.
- `src/journey.js`: lógica de colección, progreso y álbum.
- `src/discovery-buffer.js`: preparación de cartas.
- `src/resource-coordinator.js`: transferencias, decodificación y recursos de imágenes.
- `src/card-identity.js`: identidad de presentaciones.
- `src/material-assets.js`: preparación de materiales.
- `src/material-renderer.js`: renderizado WebGL.
- `src/holo.js`: comportamiento holográfico.
- `src/recommender.js`: recomendaciones mediante Web Worker.
- `src/card-resources.js`: recursos versionados del catálogo.
- `data/`: catálogo, materiales, alternativas y proxies.
- `scripts/`: generación y validación de artefactos.
- `tests/`: 39 archivos de pruebas existentes.

El Worker generado expone rutas para la aplicación, el catálogo, recursos y sincronización de sesiones.

### Comportamientos existentes que deben conservarse

1. Descubrimiento mediante swipe y botones.
2. Precarga adaptable de cartas.
3. Identidad estable de imágenes preparadas.
4. Promoción de cartas sin recreación innecesaria.
5. Animación continua desde la posición liberada.
6. Múltiples cartas salientes simultáneamente.
7. Undo y cancelación segura de animaciones.
8. Gestión de prioridades de recursos.
9. Pausa de trabajo gráfico durante gestos.
10. Reutilización y liberación controlada de texturas GPU.
11. Colección, álbum, tandas, favoritos y recompensas.
12. Duelos, equipos y refinamiento de preferencias.
13. Recomendaciones.
14. Persistencia local.
15. Sincronización mediante R2, ETags y resolución de conflictos.
16. Funcionamiento con conexiones lentas y errores de imágenes.
17. Accesibilidad y reducción de movimiento.
18. Comportamiento móvil, incluyendo Safari.

La migración no autoriza modificar silenciosamente estos contratos.

---

## 3. Objetivos

### O1. Mantenibilidad

Separar los módulos por responsabilidad y eliminar la necesidad de comprender `app.js` completo para editar una funcionalidad.

### O2. Rendimiento

Preservar o mejorar el rendimiento percibido en teléfonos reales, especialmente durante el descubrimiento de cartas.

### O3. Fidelidad de UX

Conservar las animaciones, duraciones, estados visuales, gestos, transiciones y comportamientos que definen la experiencia actual.

### O4. Modernización web

Reducir JavaScript imperativo de interfaz cuando exista una alternativa declarativa o nativa más simple, estable y compatible.

### O5. Testabilidad

Garantizar que motores, estado, componentes y flujos completos puedan probarse sin extraer fragmentos de archivos mediante `slice()` o depender de su posición textual.

### O6. Escalabilidad técnica

Facilitar nuevas funcionalidades, nuevos tipos de cartas y cambios en el catálogo sin multiplicar estados globales.

### O7. Trabajo asistido por IA

Proporcionar contratos, reglas y pruebas que permitan realizar cambios localizados y verificar automáticamente sus consecuencias.

---

## 4. No objetivos

La primera migración no debe:

- Rediseñar visualmente la aplicación.
- Modificar el modelo de recomendaciones.
- Reemplazar WebGL por otra tecnología.
- Cambiar el modelo de datos persistidos.
- Reemplazar R2.
- Cambiar las reglas de votación o duelo.
- Sustituir animaciones actuales sin pruebas comparativas.
- Implementar SSR.
- Convertir toda la aplicación a renderizado declarativo por obligación.
- Introducir infraestructura nueva que no aporte a la SPA.
- Hacer optimizaciones de rendimiento basadas únicamente en hipótesis.

La modernización del CSS está permitida cuando mantiene equivalencia visual y funcional.

---

## 5. Arquitectura objetivo

La aplicación tendrá cinco capas principales. La dirección de dependencias no es estrictamente lineal: los motores y la infraestructura implementan contratos definidos por el dominio.

### 5.1. Presentación — Svelte

Responsable de:

- Componentes visuales.
- Navegación interna.
- Formularios y controles.
- Estados de carga y error.
- Vistas de álbum y colección.
- Diálogos y paneles.
- Accesibilidad.
- Montaje y desmontaje de motores nativos.

No debe controlar animaciones de alta frecuencia por medio de cambios reactivos en cada frame.

### 5.2. Aplicación y estado

Responsable de los casos de uso y del estado observable:

- Votar, avanzar, abrir el álbum y restaurar una sesión.
- Votos y decisiones.
- Historial.
- Selección y navegación.
- Progreso de colección.
- Sesiones.
- Preferencias.
- Estados derivados de UI.

Utilizará Svelte Runes cuando el estado deba ser observado por componentes.

El catálogo completo y los objetos de recursos no deberán convertirse indiscriminadamente en proxies reactivos profundos.

### 5.3. Dominio y contratos

Módulos TypeScript independientes del framework:

- Reglas de votación.
- Cálculos de progreso.
- Preferencias.
- Resolución de identidad.
- Reglas de duelos.
- Normalización de recursos.
- Sincronización y resolución de conflictos.
- Interfaces estables que implementan motores e infraestructura.

No deben depender de componentes `.svelte`, selectores de DOM ni variables globales de UI.

### 5.4. Motores de interacción y recursos

Motores nativos para:

- Swipe.
- Animaciones salientes.
- Preparación de cartas.
- Gestión de imágenes.
- Coordinación de recursos.
- WebGL.
- Recomendaciones.

Estos módulos podrán utilizar directamente APIs del navegador.

Implementan contratos del dominio. Pueden importar tipos del dominio, pero nunca componentes Svelte ni consultar su estado reactivo. Deben exponer interfaces explícitas, ser inicializables, permitir limpieza de recursos y mantenerse independientes de Svelte.

### 5.5. Infraestructura

Responsable de:

- Cliente HTTP.
- IndexedDB.
- localStorage.
- Worker de recomendaciones.
- Cloudflare Worker.
- R2.
- Publicación de catálogo.
- Versionado de recursos.

Implementa contratos y no importa componentes de interfaz.

### Dirección de dependencias

```text
Presentación Svelte
  ↓
Aplicación / casos de uso
  ↓
Dominio y contratos
  ↑                 ↑
Motores nativos    Infraestructura
```

Los motores y la infraestructura implementan contratos del dominio. El dominio no importa Svelte, DOM ni infraestructura concreta.

---

## 6. Regla crítica: propiedad del DOM

**Cada subárbol del DOM debe tener un único propietario.**

La aplicación utilizará dos patrones admitidos.

### Patrón A: motor imperativo encapsulado

Svelte administra el contenedor y su ciclo de vida.

El motor administra todos los nodos dentro del contenedor.

Ejemplo conceptual:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createDeckController } from '@/engines/deck';

  let stage: HTMLDivElement;

  onMount(() => {
    const controller = createDeckController(stage);

    return () => controller.destroy();
  });
</script>

<div class="discovery-stage" bind:this={stage}></div>
```

Es el patrón inicial recomendado para el deck existente.

### Patrón B: elemento Svelte con comportamiento nativo

Svelte administra la creación y destrucción del elemento.

Un motor imperativo administra exclusivamente las propiedades asignadas contractualmente, por ejemplo `transform`.

Este patrón requiere definir quién administra:

- Posición.
- Transformación.
- Opacidad.
- Eventos.
- Recursos.
- Desmontaje.
- Animaciones salientes.

### Reglas obligatorias

- No eliminar manualmente nodos administrados por Svelte.
- No utilizar `innerHTML` sobre subárboles administrados por Svelte.
- No permitir que dos sistemas escriban simultáneamente `transform`.
- No recrear imágenes preparadas innecesariamente.
- No destruir una carta saliente antes de que finalice su animación.
- No dejar listeners, observers, timers o frames activos después del desmontaje.
- No forzar cambios de estructura DOM desde Svelte durante una operación crítica sin un contrato de coordinación.

### Propiedad de estilos, eventos y recursos

La regla de propietario único se extiende a estilos, eventos y recursos:

| Recurso | Propietario |
|---|---|
| Nodo raíz del deck | Svelte |
| Cartas dentro del deck legacy | Motor del deck |
| Elemento `<img>` preparado | Sistema de presentación de recursos |
| `transform` durante `pointermove` | Motor de swipe |
| Animación de salida | Motor de animaciones |
| Texturas WebGL | Renderizador |
| Estilos del deck imperativo | CSS global del deck |
| Estado de voto confirmado | Capa de aplicación |
| Desmontaje del deck completo | Svelte, mediante el adaptador |

Toda transferencia de propiedad debe ser explícita, ocurrir una sola vez y designar un único responsable de liberación. El receptor de la transferencia asume el cleanup.

### Abandono de pantalla durante un gesto

Cuando el usuario abandona la pantalla mientras hay un swipe en curso:

1. El adaptador de Svelte solicita `cancel()` al motor antes de desmontar.
2. El motor cancela la animación, libera los vuelos activos y notifica el resultado como cancelación, no como voto.
3. La capa de aplicación persiste únicamente votos confirmados.
4. Las respuestas asíncronas tardías se descartan mediante un token de generación o `cardId`; no pueden montar nodos ni sobrescribir estado.
5. Los recursos se liberan por conteo de consumidores, no por desmontaje indiscriminado.
6. Un voto ya confirmado no se revierte por abandonar la pantalla.

Ningún callback de decisión puede ejecutarse después de `destroy()`.

**Criterio de migración:** primero encapsular el deck imperativo; después evaluar, con pruebas, qué partes conviene hacer declarativas.

---

## 7. Identidad y ciclo de vida de las imágenes

La gestión de imágenes es un subsistema crítico de rendimiento.

### Contratos obligatorios

1. Un recurso preparado tiene identidad estable.
2. La misma transferencia puede compartirse entre consumidores.
3. Cada presentación mantiene su propio estado de decodificación.
4. La cancelación de un consumidor no cancela automáticamente a los demás.
5. Una carta puede transferir la propiedad de su presentación sin recrear la imagen.
6. Las respuestas asíncronas tardías no pueden sobrescribir recursos más recientes.
7. Los recursos se liberan únicamente cuando dejan de estar en uso.
8. Una imagen no lista no se convierte en carta interactiva.
9. Un error terminal ofrece recuperación sin registrar una votación accidental.
10. El trabajo especulativo respeta presupuestos de memoria y prioridades.
11. Toda transferencia de propiedad de una presentación es explícita, ocurre una sola vez y designa un único responsable de liberación.

### Política de migración

Se conservarán inicialmente las reglas existentes de `PokeResources` y `PokeDiscoveryBuffer`.

La migración a TypeScript deberá cambiar la forma de exponer las APIs, no su semántica.

En particular, se preservarán los límites actuales documentados de concurrencia, caché, lookahead, recursos preparados y coordinación con el renderizador.

Cualquier cambio de presupuesto necesitará una justificación y mediciones.

---

## 8. Motor de swipe

### Arquitectura

El swipe será un controlador TypeScript independiente del framework.

Responsabilidades:

- Captura de Pointer Events.
- Cálculo de desplazamiento y velocidad.
- Decisión de aceptación o rechazo.
- Movimiento continuo.
- Animación saliente.
- Cancelación.
- Undo.
- Coordinación con recursos.
- Limpieza.

### Interfaz conceptual

```ts
export type VoteDecision = 'yes' | 'no';

export interface SwipeController {
  setEnabled(enabled: boolean): void;
  cancel(): void;
  destroy(): void;
}

export interface SwipeCallbacks {
  onDecision(
    decision: VoteDecision,
    context: { cardId: string }
  ): void;
}

export function createSwipeController(
  element: HTMLElement,
  callbacks: SwipeCallbacks
): SwipeController;
```

Es un contrato inicial de diseño, no la firma exacta del código existente.

### Reglas de rendimiento

- No actualizar `$state` por cada `pointermove` para posicionar una carta.
- Procesar el gesto directamente en el controlador.
- Utilizar `requestAnimationFrame` si corresponde para agrupar escrituras visuales.
- Evitar lecturas de layout después de escrituras dentro del mismo frame.
- Preferir `transform` y `opacity` para animaciones.
- Conservar la trayectoria y física actuales.
- Mantener la posición inicial real al liberar el dedo.
- Permitir vuelos concurrentes cuando corresponda.
- Liberar recursos al terminar o cancelar cada vuelo.
- Mantener las prioridades de renderizado durante la interacción.

### No cambiar inicialmente

- Curva de movimiento.
- Umbrales de decisión.
- Duraciones.
- Política de rotación.
- Comportamiento de undo.
- Feedback háptico y sonoro.
- Coordinación de trabajo diferido.

### Ciclo de vida y cancelación

- `cancel()` es idempotente y no registra una decisión.
- `destroy()` implica cancelar, liberar recursos y desconectar eventos.
- Después de `destroy()` no se emiten callbacks de decisión, animación ni recursos.
- El abandono de pantalla delega en el contrato de §6.
- Las coordenadas se calculan contra el rectángulo real del elemento, no contra unidades de viewport.
- El motor no lee ni escribe estado reactivo de Svelte.

---

## 9. Reactividad Svelte 5

### Convenciones

Utilizar:

- `$state` para estado mutable de interfaz.
- `$derived` para valores derivados.
- `$props` para las propiedades de componentes.
- `$effect` para sincronización con sistemas externos cuando sea necesario.
- `$state.raw` para estructuras grandes o inmutables donde corresponda.
- `onMount` o attachments para inicializar integraciones nativas.

### Reglas

- No utilizar `$effect` para mantener sincronizados estados que podrían derivarse directamente.
- No crear ciclos de efectos.
- No utilizar reactividad para cálculos pesados por frame.
- No introducir stores externos sin necesidad.
- No mezclar patrones legacy de Svelte con runes modernos en código nuevo.
- Los datos grandes del catálogo permanecerán preferentemente inmutables.
- Los recursos WebGL, DOM, `ImageBitmap` y `AbortController` no serán convertidos en proxies reactivos.

### División de responsabilidades

**Estado reactivo:** voto confirmado, selección, progreso, visibilidad de paneles.

**Estado imperativo:** coordenadas del dedo, instancia de animación, texturas, nodos preparados y recursos en vuelo.

**Estado persistente:** votos, ratings, historial, revisiones y datos de sincronización.

Estos tres tipos de estado no deben mezclarse automáticamente.

---

## 10. CSS moderno

La migración priorizará CSS nativo.

### Navegadores objetivo y política de compatibilidad

«Baseline Widely Available» es una referencia de adopción, no una garantía de compatibilidad con todos los iPhone ni con todas las versiones de Safari en uso. La compatibilidad se define contra versiones mínimas explícitas.

**Nivel 1 — Compatibilidad obligatoria.** Safari/iOS 16.4+, Chrome/Edge 111+ y Firefox 115+. Todas las funcionalidades esenciales deben funcionar en estos navegadores. Este mínimo coincide con la referencia de Vite para Baseline Widely Available, no con el mínimo de todas las APIs DOM.

**Nivel 2 — Mejora progresiva.** Funcionalidad disponible en las versiones actuales de Chrome, Firefox y Safari, pero no en el mínimo elegido. Se acepta con fallback funcional y nunca como requisito único de una interacción crítica.

**Nivel 3 — Experimental.** Funcionalidad sin soporte suficiente o con diferencias significativas entre motores. No puede ser requisito para votar, navegar, recuperar una sesión o ver una carta.

Las versiones mínimas se revisan al inicio de cada ciclo de release y se documentan en `AGENTS.md`. Subir el mínimo es una decisión de producto, no un efecto secundario de una dependencia.

### Funcionalidades CSS y decisión

| Funcionalidad | Estado | Nivel | Decisión en Pokeamor |
|---|---|---|---|
| Custom Properties | Widely Available | 1 | Tokens visuales |
| Cascade Layers | Widely Available | 1 | Adoptar solo después de ordenar la cascada legacy |
| Container Queries | Madura | 1 | Álbum y colección |
| `:has()` | Madura | 1 | Estados de presentación |
| `dvh`, `svh` | Madura | 1, con medición | Comparar en Safari antes de usarlas para coordenadas de swipe |
| `color-mix()` | Madura | 1 | Variantes de color y tokens |
| Logical Properties | Widely Available | 1 | Layout adaptable |
| `clamp()`, `min()`, `max()` | Widely Available | 1 | Tipografía y medidas fluidas |
| `aspect-ratio` | Widely Available | 1 | Proporciones de cartas |
| `prefers-reduced-motion` | Widely Available | 1 | Accesibilidad |
| `prefers-color-scheme` | Widely Available | 1 | Tema, si se adopta |
| CSS Nesting | Widely Available, no en Safari 16.4 | 2 | Adoptar en código nuevo sin convertirlo en requisito de layout en iOS 16.4 |
| Popover API | Widely Available, Safari 17+ | 2 | Elementos flotantes nuevos con fallback |
| View Transitions para SPA | Baseline 2025, Newly Available | 2 | Mejora progresiva |
| `@starting-style` | Baseline 2024, Newly Available | 2 | Mejora progresiva |
| Transiciones de propiedades discretas | Reciente | 2–3 | Evaluar caso por caso |
| CSS Anchor Positioning | Baseline 2026, Newly Available | 3 | Solo mejora visual |
| Scroll-driven Animations | Baseline 2026, Newly Available | 3 | Solo mejora visual |
| `content-visibility` | Widely Available | 1, previa medición | Contenido extenso, nunca nodos que deban medirse o animarse de inmediato |
| CSS Grid y Flexbox | Widely Available | 1 | Estructura |

### Reglas de adopción

- No se aplicará `@layer` indiscriminadamente sobre `src/page.html`.
- Los estilos sin `@layer` tienen prioridad sobre las declaraciones normales dentro de capas; por eso la migración a capas puede alterar la cascada aunque parezca más específica.
- Orden obligatorio: extraer el CSS legacy sin cambiar su cascada, capturar referencias visuales, migrar por grupos a capas y verificar cada grupo.
- Los estilos encapsulados de un componente Svelte no alcanzan necesariamente a los nodos creados por un controlador imperativo. El deck mantiene un `deck.css` global explícito.
- No se asumirá que `dvh` es mejor que `svh` para una superficie donde se calculan coordenadas de swipe. Se medirá en Safari físico.
- Toda funcionalidad de Nivel 2 o 3 debe tener un fallback o no ser necesaria para completar una tarea esencial.
- La compatibilidad se verifica con pruebas en navegador real y en dispositivo físico cuando corresponda, no solo con el linter.

### Verificación automática de compatibilidad

`@eslint/css` permite exigir Baseline mediante la regla `css/use-baseline`. Se aplicará a archivos `.css`:

```js
import css from '@eslint/css';

const cssRules = {
  files: ['**/*.css'],
  language: 'css/css',
  plugins: { css },
  extends: ['css/recommended'],
  rules: {
    'css/use-baseline': ['error', { available: 'widely' }]
  }
};
```

Esta regla no cubre por sí sola los bloques `<style>` dentro de archivos `.svelte`. Para esos estilos se evaluará Stylelint con una sintaxis compatible con componentes o un paso equivalente. La cobertura real se documentará para evitar una falsa sensación de seguridad.

### Convenciones de CSS

Ejemplo de tokens y layout una vez estabilizada la cascada legacy:

```css
@layer reset, tokens, base, components, utilities;

@layer tokens {
  :root {
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;

    --radius-card: 1rem;
    --motion-fast: 160ms;
  }
}

@layer components {
  .album {
    container: album / inline-size;
  }

  .album-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  @container album (width >= 420px) {
    .album-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .decorative-motion {
    animation: none;
    transition: none;
  }
}
```

### Reglas de estilo

- Preferir CSS sobre JS para estados visuales simples.
- Utilizar CSS encapsulado en componentes nuevos.
- Mantener una hoja global pequeña para tokens y reglas comunes.
- Evitar especificidad excesiva.
- Evitar `!important`, salvo justificación documentada.
- No utilizar `will-change` indiscriminadamente.
- No aplicar `content-visibility` a nodos cuya presencia, medición o animación sea necesaria inmediatamente.
- No introducir filtros, sombras o efectos costosos sin medir su impacto.
- Mantener soporte táctil y teclado.
- Preservar la estética actual antes de rediseñar.

---

## 11. APIs modernas del navegador

### Base estable

| API | Responsabilidad |
|---|---|
| Pointer Events | Entrada táctil y puntero |
| Web Animations API | Animaciones controladas |
| `requestAnimationFrame` | Actualizaciones visuales |
| `IntersectionObserver` | Visibilidad y carga diferida |
| `ResizeObserver` | Cambios de tamaño |
| IndexedDB | Persistencia estructurada |
| AbortController | Cancelación |
| Web Workers | Cálculo aislado |
| WebGL | Renderizado gráfico |
| Page Visibility API | Suspensión de trabajo |
| `<dialog>` | Diálogos modales |
| `matchMedia()` | Preferencias y capacidades |
| Performance APIs | Instrumentación |

### Uso selectivo

- `HTMLImageElement.decode()`: útil para preparación de imágenes; conservar la semántica actual de decodificación y errores.
- `createImageBitmap()`: solo cuando reduzca trabajo real; no duplicar decodificaciones.
- Cache API: evaluar junto con el versionado de recursos existente.
- Popover API: nuevos elementos flotantes no modales, con fallback en el mínimo soportado.
- View Transitions: mejora progresiva, nunca requisito de navegación.

### No incorporar al núcleo todavía

- `scheduler.postTask()`.
- WebGPU.
- Navigation API.
- Un pipeline nuevo con OffscreenCanvas.
- APIs de GPU alternativas a WebGL.

Pokeamor ya tiene `afterSwipe()`, prioridades de recursos y una política de trabajo diferido. No se reemplazará ese mecanismo por una API nueva sin demostrar equivalencia funcional y de rendimiento.

### Reglas de compatibilidad

- Comprobar compatibilidad contra las versiones mínimas de §10 antes de introducir una API nueva.
- Evitar detección basada únicamente en user-agent.
- Preferir detección de capacidades.
- Proporcionar una alternativa funcional.
- Verificar Safari de iPhone, no solo Chrome.
- No modificar el pipeline gráfico para usar una API nueva sin evidencia de mejora.
- No usar View Transitions ni APIs equivalentes como requisito para completar un flujo.

### Medición de gestos

INP y Event Timing miden interacciones discretas; no describen por sí solos el comportamiento continuo de `pointermove`. Para el swipe se instrumentará:

- Tiempo de procesamiento por evento de puntero.
- Intervalo entre frames durante el gesto.
- Frames lentos y frames perdidos.
- Tiempo desde `pointerup` hasta la siguiente carta usable.
- Trabajo de decodificación o GPU iniciado durante el gesto.

La instrumentación no debe añadirse en producción si genera overhead perceptible.

---

## 12. Organización de carpetas

### Estructura inicial durante la migración

Durante la migración convive una aplicación nueva en `frontend/` con el código legacy intacto. La estructura inicial es deliberadamente pequeña: cada carpeta se crea cuando tiene contenido real.

```text
pokeamor/
├── frontend/
│   ├── src/
│   │   ├── App.svelte
│   │   ├── main.ts
│   │   ├── components/
│   │   ├── application/
│   │   ├── domain/
│   │   ├── engines/
│   │   ├── infrastructure/
│   │   └── styles/
│   ├── tests/
│   ├── vite.config.ts
│   └── package.json
│
├── src/                  # Legacy temporal
├── data/                 # Se conserva
├── scripts/              # Build existente
├── tests/                # Tests legacy
├── docs/
└── AGENTS.md
```

El backend actual no se mueve a `server/worker.ts` ni se reescribe como parte de esta migración. Primero se conserva el pipeline existente y se añade una capa de frontend nueva.

### Estructura final consolidada

```text
pokeamor/
├── public/
│
├── src/
│   ├── main.ts
│   ├── App.svelte
│   │
│   ├── components/
│   │   ├── discovery/
│   │   │   ├── DiscoveryScreen.svelte
│   │   │   ├── DiscoveryDeck.svelte
│   │   │   └── DiscoveryControls.svelte
│   │   ├── collection/
│   │   ├── album/
│   │   ├── battle/
│   │   ├── detail/
│   │   └── shared/
│   │
│   ├── application/
│   │   ├── state/
│   │   │   ├── session.svelte.ts
│   │   │   ├── navigation.svelte.ts
│   │   │   └── discovery.svelte.ts
│   │   └── use-cases/
│   │
│   ├── domain/
│   │   ├── votes/
│   │   ├── collection/
│   │   ├── battle/
│   │   ├── recommendations/
│   │   ├── cards/
│   │   └── contracts/
│   │
│   ├── engines/
│   │   ├── swipe/
│   │   ├── deck/
│   │   ├── resources/
│   │   ├── materials/
│   │   └── animation/
│   │
│   ├── infrastructure/
│   │   ├── api/
│   │   ├── persistence/
│   │   ├── sync/
│   │   └── workers/
│   │
│   ├── styles/
│   │   ├── tokens.css
│   │   ├── global.css
│   │   ├── layout.css
│   │   ├── motion.css
│   │   └── deck.css
│   │
│   └── types/
│
├── data/
├── scripts/
├── tests/
│   ├── unit/
│   ├── components/
│   ├── integration/
│   ├── e2e/
│   └── performance/
│
├── docs/
│   ├── architecture/
│   └── migration/
│
├── AGENTS.md
├── eslint.config.js
├── .prettierrc.json
├── playwright.config.ts
├── vitest.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

La consolidación ocurre solo cuando la nueva implementación demuestra equivalencia funcional y de despliegue.

### Alias de imports

`$lib` es una convención de SvelteKit y no existe por defecto en una aplicación creada con Vite. Se usarán imports relativos o un alias explícito `@` que apunte a `src/`:

```ts
import { createDeckController } from '@/engines/deck';
```

El alias se declara en `vite.config.ts` y en `tsconfig.json` antes de usarlo.

### Regla de dependencia

La dirección permitida es:

```text
Presentación (componentes Svelte)
  ↓
Aplicación / casos de uso
  ↓
Dominio y contratos
  ↑                 ↑
Motores nativos    Infraestructura
```

- La presentación no importa motores ni infraestructura concretos; habla con casos de uso y adaptadores.
- La aplicación orquesta dominio y motores, pero no contiene reglas puras.
- El dominio no importa componentes, Svelte, DOM ni infraestructura concreta.
- Los motores implementan contratos del dominio y pueden importar sus tipos; nunca componentes Svelte.
- La infraestructura implementa contratos y no importa módulos de interfaz.
- El backend no importa módulos de interfaz.
- Los módulos compartidos declaran tipos y contratos estables.
- No se permiten imports circulares.

---

## 13. Instalación y bootstrap

### Estrategia de instalación

Durante la migración, se creará el proyecto Svelte dentro de `frontend/`, conservando intacta la aplicación original.

Una vez validada la nueva implementación, se consolidará la estructura final.

### Comandos iniciales

Ejecutar desde la raíz del repositorio:

```bash
npm create vite@latest frontend -- --template svelte-ts

cd frontend
npm install
```

Verificar las versiones resueltas en `package.json` y guardar el lockfile.

No utilizar rangos de dependencias sin control reproducible en CI.

### Herramientas de calidad

Primero se conserva lo que trae el template y se completa lo necesario:

```bash
npm install -D \
  eslint @eslint/js typescript-eslint \
  eslint-plugin-svelte globals @eslint/css \
  prettier prettier-plugin-svelte eslint-config-prettier \
  svelte-check
```

Se usan las configuraciones recomendadas del plugin oficial de Svelte y se evita duplicar reglas ya incluidas por el template.

### Pruebas

```bash
npm install -D \
  vitest \
  @vitest/browser-playwright \
  vitest-browser-svelte \
  @playwright/test

npx playwright install
```

`jsdom` o `@testing-library/svelte` se instalan solamente si se decide mantener además una capa de pruebas de componentes simuladas. No se mantendrán dos estrategias de componentes en paralelo sin una razón verificable.

### Análisis de bundles

```bash
npm install -D rollup-plugin-visualizer
```

Se usará durante la optimización, no como dependencia necesaria en cada ejecución.

### Requisitos

- Node.js LTS compatible con las versiones fijadas.
- TypeScript `strict`.
- Gestor de paquetes y lockfile únicos.
- Compilación reproducible.
- Entornos de desarrollo y producción comparables.
- Variables de entorno documentadas.

---

## 14. ESLint, Prettier y convenciones

### ESLint

Utilizar Flat Config.

Activar:

- Reglas recomendadas de ESLint.
- TypeScript ESLint con información de tipos (`recommendedTypeChecked`, `parserOptions.projectService: true`).
- Reglas recomendadas de Svelte.
- Detección de variables no utilizadas.
- Reglas de accesibilidad de Svelte.
- Reglas de sintaxis y seguridad de componentes.
- Reglas de dependencia y detección de imports circulares.
- Reglas CSS compatibles con Baseline para archivos `.css`.

Separar entornos:

- Navegador.
- Node.js.
- Web Worker.
- Backend Cloudflare.

No habilitar globalmente todas las APIs para todos los módulos.

El linting con información de tipos es especialmente útil para detectar promesas olvidadas, tipos inseguros y errores en operaciones asíncronas de recursos.

### Reglas de dependencia

Las reglas de §12 se verifican de forma automática:

- `import/no-cycle` para imports circulares.
- `no-restricted-imports` para impedir que dominio o motores importen componentes o estado de Svelte.
- Revisión de límites de capa en code review cuando una regla estática no alcance.

### Prettier

Configuración propuesta:

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [
    {
      "files": "*.svelte",
      "options": {
        "parser": "svelte"
      }
    }
  ]
}
```

### Linting CSS

`@eslint/css` incluye la regla `css/use-baseline`. Se incorpora al Flat Config existente:

```js
import css from '@eslint/css';

const cssRules = {
  files: ['**/*.css'],
  language: 'css/css',
  plugins: { css },
  extends: ['css/recommended'],
  rules: {
    'css/use-baseline': ['error', { available: 'widely' }]
  }
};
```

La regla analiza archivos `.css`. No se asumirá que verifica automáticamente los bloques `<style>` dentro de archivos `.svelte`. Para esos estilos se evaluará Stylelint con sintaxis compatible con componentes o un paso equivalente, y la limitación se documentará.

### TypeScript

Requisitos:

- `strict: true`.
- `noUncheckedIndexedAccess: true`, si la migración puede satisfacerlo.
- Evitar `any` sin justificación.
- Modelar resultados de operaciones asíncronas.
- Usar tipos discriminados para estados complejos.
- Distinguir IDs de especie, impresión y presentación.
- No silenciar errores de TypeScript para acelerar la migración.

### Reglas adicionales

- Prohibir imports circulares.
- Prohibir acoplamiento de dominio a Svelte.
- Prohibir módulos que muten el DOM durante su importación.
- Prohibir listeners globales sin cleanup.
- Prohibir timers permanentes sin estrategia de cancelación.
- Prohibir cambios silenciosos del esquema de sesión.
- Prohibir manipular `window.Poke*` desde código nuevo, salvo adaptadores temporales.

---

## 15. Testing

La arquitectura de pruebas prioriza el navegador real para componentes y flujos, y mantiene Vitest en Node para lógica pura.

| Capa | Herramienta |
|---|---|
| Lógica pura y dominio | Vitest en Node |
| Motores con mocks | Vitest |
| Componentes Svelte | Vitest Browser Mode + `vitest-browser-svelte` |
| Flujos completos | Playwright |
| Performance, GPU y sensores | Navegador y dispositivo físico |

`vitest-browser-svelte` renderiza componentes Svelte dentro de un navegador real y permite interactuar con locators y eventos del navegador. Esto detecta diferencias que `jsdom` no representa: layout, dimensiones reales, CSS y comportamiento de navegador.

No se instalarán `@testing-library/svelte` y `vitest-browser-svelte` obligatoriamente desde el primer día. Se elige una estrategia de componentes y se evita redundancia.

El sistema de pruebas tendrá cuatro niveles y una validación física complementaria.

### Nivel 1 — Unitario

Vitest en Node para:

- Votación.
- Recomendaciones.
- Modelos.
- Identidad de recursos.
- Orden y selección.
- Persistencia.
- Cálculos de progreso.
- Resolución de conflictos.

Priorizar módulos puros.

### Nivel 2 — Integración de motores

Verificar:

- Identidad DOM.
- Transferencia de imágenes.
- Prioridades.
- Decodificación.
- Cancelación.
- Animaciones.
- Recursos de GPU.
- Ciclos de vida.
- Eventos concurrentes.

Utilizar dobles de prueba para APIs complejas, sin confundirlos con rendimiento real de navegador.

### Nivel 3 — Componentes en navegador real

Vitest Browser Mode con `vitest-browser-svelte` para:

- Renderizado de estados.
- Interacciones con eventos reales del navegador.
- Accesibilidad.
- Errores.
- Navegación.
- Integración con controladores.
- Comportamiento dependiente de layout y CSS.

Probar comportamiento observable, no detalles internos de compilación.

Si se conserva una capa con `@testing-library/svelte` y `jsdom`, debe tener un propósito distinto y no duplicar las mismas aserciones.

### Nivel 4 — End-to-end

Playwright con:

- Chromium.
- Firefox.
- WebKit.
- Emulación de dispositivos móviles.

Flujos mínimos:

1. Arranque desde sesión vacía.
2. Carga de la primera carta.
3. Swipe positivo.
4. Swipe negativo.
5. Acciones por botones.
6. Undo.
7. Ráfaga de votos.
8. Entrada y salida del álbum.
9. Navegación de detalles.
10. Apertura y cierre de diálogo.
11. Duelos.
12. Sincronización.
13. Recuperación ante errores de recursos.
14. Persistencia después de recargar.
15. Reduced Motion.
16. Navegación mediante teclado cuando corresponda.

### Migración de los 39 tests

Todos los tests existentes deberán:

- Conservar sus invariantes funcionales.
- Migrar a imports de módulos cuando sea posible.
- Evitar extracción textual con `slice()` / `indexOf()`.
- Mantener pruebas explícitas de identidad y ciclo de vida.
- Conservar verificaciones de sincronización.
- No debilitar assertions para conseguir un resultado verde.
- Mantener una suite `test:legacy` ejecutable hasta completar la migración.

Algunos tests podrán ser reemplazados por pruebas equivalentes mejor diseñadas, pero no deberán perder cobertura de comportamiento.

### Tests de navegador físico

Antes de publicar, probar en dispositivos reales cuando estén disponibles.

Playwright no sustituye las mediciones de memoria GPU, sensores ni fluidez de Safari en un iPhone físico.

---

## 16. Presupuestos de rendimiento

La referencia inicial será la implementación legacy ejecutada en el mismo dispositivo y bajo las mismas condiciones.

### Métricas obligatorias

- Tiempo hasta la primera carta usable.
- Bytes JS comprimidos transferidos.
- Trabajo de CPU durante inicialización.
- Tiempo de respuesta al gesto.
- Tiempo de procesamiento por `pointermove`.
- Intervalo entre frames durante el gesto.
- Frames lentos.
- Frames perdidos.
- Tiempo entre aceptación del voto y siguiente carta usable.
- Tiempo de decodificación de imágenes.
- Cantidad de imágenes decodificadas.
- Estimación de bytes de píxeles activos.
- Memoria de recursos comprimidos.
- Subidas de texturas WebGL.
- Memoria y actividad GPU, cuando sea medible.
- Consumo durante ráfagas.
- Tiempo de entrada y salida de álbum.
- Comportamiento con red lenta.
- Errores de runtime.

### Objetivos iniciales

| Indicador | Objetivo |
|---|---|
| Latencia de swipe | Sin regresión significativa frente a legacy |
| Continuidad de animación | Preservar comportamiento y trayectoria |
| Trabajo pesado durante gesture | Evitarlo |
| Decodificación repetida | No introducirla |
| Transferencias duplicadas | No introducirlas |
| Recursos activos | Respetar presupuestos existentes |
| Tiempo hasta primera carta | Igual o mejor, salvo regresión justificada |
| Tamaño de JS | Mantener un presupuesto explícito y buscar reducción |
| Memoria | Sin crecimiento sostenido injustificado |
| Errores de runtime | Cero errores conocidos en flujos principales |

Estos son criterios de aceptación, no mediciones ya obtenidas.

### Clases de aceptación

**Contratos exactos, tolerancia cero:**

- Transferencias duplicadas introducidas por la migración.
- Recursos filtrados.
- Votos perdidos o votos accidentales.
- Animaciones terminadas anticipadamente.
- Imágenes que cambian de identidad cuando no deberían.
- Conflictos de sesión mal resueltos.
- Errores de runtime conocidos en flujos principales.

Cualquier violación de esta lista bloquea la publicación.

**Métricas estadísticas:**

- Latencia de input y de gesto.
- Tiempo hasta la primera carta usable.
- Frames lentos y frames perdidos.
- Memoria.
- Tamaño de bundle.

Para estas métricas se establece un umbral después de medir la variabilidad del baseline. No se declarará una regresión o una mejora por una sola ejecución.

### Metodología estadística

1. Medir el baseline al menos 10 veces por escenario.
2. Calcular mediana y percentiles p95 y p99.
3. Repetir la misma secuencia en la nueva implementación, en el mismo dispositivo, navegador y red.
4. Comparar distribuciones, no promedios aislados.
5. Aceptar una diferencia solo si supera el ruido medido del baseline.
6. Documentar toda diferencia aceptada y su justificación.

El umbral concreto se fija tras la Fase 1 y se registra en `docs/migration/`.

### Presupuesto de JavaScript

Se mantendrán presupuestos separados:

| Ámbito | Presupuesto |
|---|---|
| Arranque inicial | Explícito y medido |
| Funcionalidad de discovery | Explícito y medido |
| Álbum y colección bajo demanda | Cargados en un chunk separado |
| Herramientas de depuración | Excluidas de producción |

El objetivo no es solo que la SPA sea Svelte, sino que no cargue de entrada toda la aplicación.

### Procedimiento de medición

1. Capturar baseline de legacy.
2. Fijar dispositivos, versión del navegador y condiciones de red.
3. Definir secuencias reproducibles.
4. Repetir múltiples ejecuciones.
5. Comparar medianas y percentiles.
6. Revisar trazas cuando haya regresiones.
7. Documentar diferencias y causas.
8. No afirmar mejoras sin mediciones.

Para una pantalla de 120 Hz, el presupuesto total por frame es de aproximadamente 8,33 ms. No todo ese tiempo está disponible para JavaScript: el navegador también necesita realizar trabajo de renderizado.

---

## 17. Accesibilidad

Requisitos:

- Interacciones principales utilizables sin gestos cuando sea viable.
- Botones correctamente etiquetados.
- Foco visible.
- Gestión de foco en diálogos.
- Estados de carga y error comprensibles.
- Navegación accesible por teclado.
- Respeto por `prefers-reduced-motion`, también en los motores imperativos y no solo en componentes Svelte.
- Contraste suficiente.
- Evitar animaciones obligatorias que bloqueen el uso.
- Respetar preferencias de ahorro de datos cuando corresponda.
- No depender exclusivamente de color para comunicar decisiones.
- La navegación por teclado no depende del controlador de gestos.

La estética y los efectos visuales no deben impedir el acceso a las funciones esenciales.

---

## 18. Backend, Worker y publicación

### Objetivo

Separar la compilación de la SPA de la lógica del Worker.

### Mantener

- `/api/session/*`.
- `/catalog.json`.
- `/catalog-bundle.json`.
- `/materials/*`.
- Rutas de recursos versionados.
- Validación de datos.
- ETags.
- Reglas de sincronización.
- Protección frente a recursos inválidos.
- Modelo de persistencia en R2.

### Construcción del frontend

Vite generará:

- `index.html`.
- JavaScript optimizado.
- CSS optimizado.
- Assets con nombres versionados o hashes.

### Estrategia preferida de despliegue

Cuando el entorno de hosting lo permita:

- Utilizar Static Assets de Cloudflare para archivos compilados.
- Mantener el Worker para las rutas dinámicas.
- Configurar correctamente la respuesta de la SPA.
- Conservar las rutas de API fuera del fallback de navegación.
- Aprovechar caché inmutable para assets versionados.
- No establecer caché inmutable para HTML ni manifiestos cambiantes.

### Validación temprana del hosting

La validación del despliegue es un requisito de la fase de bootstrap, no de la fase de publicación.

El repositorio usa actualmente un pipeline personalizado que genera `worker/index.js` y `dist/server/index.js`. Además, `.openai/hosting.json` declara la vinculación R2 y el proyecto de hosting; no es un proyecto Cloudflare Workers con un `wrangler.toml` convencional.

Antes de migrar funcionalidades se debe demostrar que una SPA Svelte mínima puede publicarse en el entorno actual y seguir consumiendo:

- `/catalog-bundle.json`.
- `/api/session/*`.
- `/materials/*`.
- Los recursos versionados de `data/`.

Ese mecanismo no debe reemplazarse sin verificar que la plataforma de publicación acepte Static Assets.

Si la plataforma exige un Worker único, el build deberá integrar los archivos producidos por Vite respetando sus hashes, MIME types, rutas y política de caché.

La especificación no asume que la configuración de Wrangler sea directamente compatible con el hosting actual.

### Desarrollo local y origen

El backend comprueba el encabezado `Origin` en las solicitudes `PUT` de sesión. Si Vite corre en un puerto y el Worker local en otro, un proxy mal configurado puede provocar `403`.

- El proxy de desarrollo debe preservar correctamente el modelo de origen o usar una configuración específica de desarrollo.
- No se relajará la validación de seguridad del Worker para hacer funcionar Vite.
- Se documentará una configuración local reproducible.

### Enlaces de sesión

Se preserva el enlace actual de sesión `#s=...`. No se introducirá un router basado en hash que compita con ese formato.

### Versionado de catálogo

El catálogo y sus tablas auxiliares deben seguir instalándose de manera consistente y versionada.

No permitir que una actualización parcial mezcle recursos de revisiones distintas.

Las presentaciones montadas deben terminar de forma segura con sus recursos originales.

### Persistencia

- No modificar claves existentes sin migración.
- No romper sesiones existentes.
- Conservar el comportamiento de conflictos por ETag.
- Conservar operaciones pendientes y reintentos.
- Mantener recuperación tras errores de red.
- Probar escenarios de múltiples dispositivos.

---

## 19. Instrumentación y observabilidad

Se conservarán las capacidades de diagnóstico existentes y se establecerán interfaces estables para consultarlas.

Métricas deseadas:

- Estado del deck.
- Longitud de cola.
- Cartas preparadas.
- Recursos cargados.
- Recursos en decodificación.
- Recursos liberados.
- Vuelos activos.
- Actividad del motor gráfico.
- Tiempos de renderizado.
- Estado del recomendador.
- Estado de sincronización.
- Tiempo de procesamiento por `pointermove`.
- Intervalo entre frames durante el gesto.
- Tiempo desde `pointerup` hasta la siguiente carta usable.

INP y Event Timing no sustituyen la medición continua de `pointermove`. La instrumentación de gestos se activa solo en diagnóstico o mediante muestreo, nunca de forma permanente si añade overhead perceptible.

La instrumentación no debe generar trabajo significativo durante gestos.

Los logs de desarrollo no deben ejecutarse constantemente en producción.

---

## 20. Plan de migración

### Fase 1 — Baseline y congelamiento de contratos

**Acciones:**

- Crear una referencia de la versión actual y congelar el commit.
- Ejecutar las pruebas existentes y registrar resultados.
- Capturar videos de los flujos principales.
- Documentar duraciones, estados visuales y versiones de navegador.
- Medir los dispositivos disponibles.
- Identificar contratos críticos y contratos exactos de §16.
- Medir la variabilidad del baseline y fijar umbrales de aceptación.
- No modificar el comportamiento.

**Criterio de salida:** existe una referencia reproducible de la experiencia actual, con contratos, métricas y umbrales documentados.

### Fase 2 — Bootstrap Svelte y demostración de despliegue

**Acciones:**

- Inicializar Vite + Svelte 5 + TypeScript en `frontend/`.
- Configurar ESLint con información de tipos, Prettier y alias `@`.
- Configurar Vitest, Vitest Browser Mode y Playwright.
- Configurar CI reproducible con `npm ci`.
- Configurar `AGENTS.md` y las reglas de §21.
- Configurar el entorno local y el proxy que preserva `Origin`.
- Publicar una pantalla mínima que consuma el backend y los recursos existentes.
- Verificar hashes, MIME types, rutas y política de caché de los assets compilados.

**Criterio de salida:** una SPA Svelte mínima se publica en el hosting actual y consume `/catalog-bundle.json`, `/api/session/*` y `/materials/*` sin romper sesiones ni rutas. Esta fase es obligatoria antes de una migración grande.

### Fase 3 — Contratos y módulos independientes

**Acciones:**

- Extraer dominio, aplicación y estado.
- Definir contratos de motores e infraestructura.
- Separar persistencia, sincronización, votación y preferencias.
- Encapsular recursos, preparación de cartas, WebGL, animaciones y recomendador.
- Reducir globals.
- Migrar los 39 tests a imports de módulos conservando todas sus invariantes.
- Mantener la suite legacy ejecutable hasta completar la migración.

**Criterio de salida:** dominio y motores pueden probarse sin DOM ni Svelte, y los tests legacy siguen verdes o fueron reemplazados con cobertura equivalente.

### Fase 4 — Una funcionalidad vertical completa

**Acciones:**

- Migrar una pantalla real de punta a punta: datos, componente, estado, estilo, tests y despliegue.
- Incluir pruebas de componente en navegador real.
- Incluir al menos un flujo E2E de esa pantalla.
- Verificar que la pantalla funciona en el build desplegado.

**Criterio de salida:** existe una funcionalidad de producción completa en Svelte, probada y desplegada. No se avanza solo con componentes vacíos.

### Fase 5 — Álbum, colección, navegación y paneles

**Acciones:**

- Migrar estilos y tokens sin alterar la cascada legacy.
- Migrar componentes compartidos, navegación, ajustes, álbum, colección y paneles.
- Mantener equivalencia visual.
- Añadir pruebas de componente en navegador real.

**Criterio de salida:** estas pantallas mantienen comportamiento, accesibilidad y apariencia con pruebas completas.

### Fase 6 — Descubrimiento y swipe

**Acciones:**

- Montar el deck actual como una isla imperativa mediante un adaptador.
- Conectar eventos de decisión, estado y recursos.
- Preservar continuidad DOM, vuelos y undo.
- Aplicar los contratos de propiedad y transferencia de §6 y §7.
- Probar el abandono de pantalla durante un gesto.
- Verificar fidelidad visual y de timing.

**Criterio de salida:** el descubrimiento en Svelte cumple todos los contratos críticos, sin recreación de imágenes ni conflictos de DOM.

### Fase 7 — Modernización de CSS y APIs web

**Acciones:**

- Aplicar solo mejoras que simplifiquen el código o la experiencia.
- Migrar `@layer` por grupos, con capturas y verificación de cascada.
- Evaluar View Transitions, Scroll-driven Animations, `@starting-style` y Anchor Positioning como mejoras progresivas.
- Comparar visual y funcionalmente cada animación reemplazada.
- No introducir APIs de Nivel 3 en flujos esenciales.

**Criterio de salida:** las modernizaciones están documentadas, no hay dependencia de funcionalidades experimentales y la equivalencia visual está verificada. Esta fase se mantiene separada de la migración estructural.

### Fase 8 — Comparación de performance y publicación

**Acciones:**

- Medir legacy contra Svelte en las mismas condiciones.
- Comparar medianas y percentiles contra los umbrales de §16.
- Ejecutar E2E en Chromium, Firefox y WebKit.
- Validar Safari en dispositivo físico cuando esté disponible.
- Revisar presupuestos de JavaScript y memoria.
- Publicar de manera controlada.
- Conservar una estrategia de rollback.

**Criterio de salida:** los contratos exactos se cumplen, las métricas estadísticas quedan dentro del umbral acordado y la nueva versión reemplaza la anterior sin pérdida de datos ni degradación conocida de UX.

---

## 21. Reglas para agentes de IA

Crear `AGENTS.md` en el repositorio.

> Los agentes pueden cambiar la arquitectura interna, pero no pueden cambiar silenciosamente los contratos de experiencia, identidad DOM, recursos y persistencia. Toda optimización debe demostrar que preserva el comportamiento o justificar expresamente la diferencia.

### Reglas principales

1. Utilizar Svelte 5 Runes en código nuevo.
2. No introducir React, Astro ni SvelteKit.
3. Mantener TypeScript estricto.
4. Preferir APIs nativas del navegador.
5. No agregar dependencias sin justificación.
6. Separar presentación, aplicación, dominio y motores.
7. No usar Svelte para actualizar coordenadas en cada frame.
8. No modificar un subárbol DOM administrado por otro sistema.
9. Preservar identidad de imágenes y recursos.
10. Respetar contratos de cleanup y cancelación.
11. Preservar el modelo de datos.
12. No debilitar los tests para hacerlos pasar.
13. Ejecutar checks relacionados con cada cambio.
14. No alterar animaciones sin comprobar equivalencia.
15. No afirmar mejoras de performance sin mediciones.
16. Respetar el soporte de Safari, Firefox y Chromium.
17. Evitar funcionalidades web experimentales en flujos esenciales.
18. Mantener una ruta de rollback durante la migración.
19. No modificar varios subsistemas críticos simultáneamente si impide aislar regresiones.
20. Documentar las decisiones arquitectónicas importantes.

### Reglas específicas de Svelte 5

21. No usar `$effect` para derivar estado que puede calcularse con `$derived`.
22. No mutar props; usar callbacks o `bind` explícito.
23. Usar `$state.raw` para catálogo, recursos, texturas y estructuras grandes.
24. No usar `$lib` sin alias configurado; usar `@/` o imports relativos.
25. Los estilos de nodos imperativos van en CSS global del deck, no en `<style>` scoped.
26. Las pruebas de componentes usan Vitest Browser Mode cuando el comportamiento dependa de layout o CSS.
27. No aplicar `@layer` sobre CSS legacy sin capturas y verificación de cascada.
28. No introducir un router hash que compita con `#s=`.
29. No relajar la validación de `Origin` del Worker.
30. No declarar compatibilidad CSS solo por Baseline; comprobar las versiones mínimas de §10.
31. No crear carpetas vacías ni mover el backend sin necesidad.

### Protocolo para cambios

Cada cambio significativo debe documentar:

- Qué problema resuelve.
- Qué archivos modifica.
- Qué contratos afecta.
- Qué pruebas ejecutó.
- Qué riesgos quedan.
- Si altera rendimiento.
- Si requiere validación en navegador físico.

---

## 22. Scripts de desarrollo

Scripts objetivo del nuevo frontend:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-check --tsconfig ./tsconfig.app.json && tsc --noEmit -p tsconfig.node.json",
    "lint": "eslint .",
    "format": "prettier . --write",
    "format:check": "prettier . --check",
    "test:unit": "vitest run --project unit",
    "test:browser": "vitest run --project browser",
    "test:legacy": "npm --prefix .. run test",
    "test": "npm run test:unit && npm run test:browser",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

Instalar `svelte-check` si no está presente.

Ajustar el nombre del `tsconfig` y el comando `test:legacy` al generado por el template y al pipeline real del repositorio.

`check` evita duplicar el mismo typecheck: `svelte-check` cubre componentes y `tsc` cubre módulos y configuración. No se ejecutarán dos verificaciones equivalentes sin una razón clara.

Estos scripts pertenecen inicialmente al proyecto Svelte en `frontend/`; deberán integrarse con los scripts existentes del repositorio sin eliminar el pipeline legacy antes de validar su reemplazo.

### Pipeline de CI

El pipeline mínimo realizará:

1. Instalación reproducible con `npm ci` y lockfile.
2. Typecheck.
3. ESLint con información de tipos.
4. Verificación de formato.
5. Tests unitarios.
6. Tests de componentes en navegador real.
7. Tests de integración.
8. Build de producción.
9. Validación de artefactos del catálogo.
10. E2E en los navegadores configurados.
11. Smoke test del build desplegado en el hosting actual.
12. Tests legacy hasta completar la migración.

Los tests de rendimiento de dispositivos físicos serán una validación adicional antes de publicar cambios sensibles.

---

## 23. Definition of Done

La migración estará terminada solamente cuando:

- [ ] La SPA esté construida con Svelte 5 y Vite.
- [ ] TypeScript estricto esté activo en código nuevo.
- [ ] El código crítico esté separado en módulos.
- [ ] No queden dependencias circulares relevantes.
- [ ] No queden globals legacy innecesarios.
- [ ] Los comportamientos existentes estén cubiertos por tests.
- [ ] Los tests puedan importar módulos reales.
- [ ] La identidad de imágenes esté preservada.
- [ ] Las animaciones salientes funcionen correctamente.
- [ ] Undo y cancelaciones funcionen.
- [ ] El sistema WebGL libere recursos correctamente.
- [ ] El recomendador mantenga su comportamiento.
- [ ] La persistencia y sincronización sean compatibles.
- [ ] El catálogo mantenga consistencia de versión.
- [ ] El backend y R2 funcionen sin cambios incompatibles.
- [ ] La aplicación funcione en las versiones mínimas de Chrome, Firefox y Safari/iOS definidas en §10.
- [ ] El hosting actual sirva la SPA compilada y las rutas existentes desde la fase de bootstrap.
- [ ] El enlace de sesión `#s=...` siga funcionando.
- [ ] Las pruebas de componentes corran en navegador real.
- [ ] La experiencia sea usable mediante los controles alternativos.
- [ ] Los contratos exactos de §16 tengan tolerancia cero y estén verificados.
- [ ] Los umbrales estadísticos estén definidos y cumplidos.
- [ ] Los presupuestos de JavaScript por ámbito estén definidos y cumplidos.
- [ ] La cascada CSS se haya migrado por grupos con verificación visual.
- [ ] No existan violaciones de los contratos exactos ni regresiones estadísticas fuera del umbral acordado.
- [ ] El alias `@` esté configurado y no se use `$lib` sin configurar.
- [ ] El build de producción sea reproducible.
- [ ] CI pase completamente con `npm ci`.
- [ ] Exista documentación actualizada.
- [ ] Exista un procedimiento de rollback.

---

## 24. Riesgos principales

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Recreación de imágenes | Crítica | Contratos de identidad y pruebas DOM |
| Conflictos entre Svelte y motores | Crítica | Propietario único de DOM |
| Regresión de swipe | Crítica | Conservar motor y medir |
| Trabajo GPU durante gestos | Alta | Mantener coordinación de recursos |
| Cambio accidental de sincronización | Crítica | Tests de perfiles, ETags y conflictos |
| Regresión de Safari | Alta | Pruebas WebKit y dispositivo físico |
| Crecimiento de bundle | Media | Análisis de artefactos |
| Estado reactivo excesivo | Alta | Estado granular y catálogo inmutable |
| Tests frágiles | Media | APIs explícitas |
| Incompatibilidad de hosting | Alta | Validación temprana del deployment en la fase de bootstrap |
| Diferencias de CSS | Media | Migración visual incremental |
| Cascada legacy alterada por `@layer` | Alta | Extraer CSS sin capas primero y verificar por grupos |
| Falsa cobertura de compatibilidad CSS | Alta | `@eslint/css` para `.css`, Stylelint para `<style>` y pruebas en navegador |
| Proxy de desarrollo rompe `Origin` | Alta | Proxy que preserve el origen; no relajar el Worker |
| Componentes probados solo en `jsdom` | Media | Vitest Browser Mode |
| Router hash compite con `#s=` | Media | No introducir router hash |
| Dependencia de `dvh` para coordenadas | Media | Comparar `svh` y `dvh` en Safari físico |
| Bundle inicial sin desglose | Media | Presupuestos por ámbito |
| Dependencias innecesarias | Media | Política estricta de incorporación |

---

## 25. Decisiones finales de arquitectura

### ADR-001 — Framework

**Decisión:** Svelte 5.

**Razón:** interfaz declarativa, reactividad granular y soporte para integración nativa con DOM.

### ADR-002 — Build

**Decisión:** Vite.

**Razón:** herramienta compatible con Svelte y adecuada para una SPA client-side.

### ADR-003 — Backend

**Decisión:** conservar el backend existente.

**Razón:** no hay necesidad funcional de sustituir R2, las APIs ni el sistema de sesiones para modernizar la interfaz.

### ADR-004 — Motores nativos

**Decisión:** mantenerlos independientes del framework.

**Razón:** preservar control sobre gestos, recursos, animaciones y GPU.

### ADR-005 — CSS

**Decisión:** CSS nativo moderno con versiones mínimas explícitas (Safari/iOS 16.4+, Chrome/Edge 111+, Firefox 115+), tres niveles de compatibilidad y migración de capas por grupos.

**Razón:** «Baseline» por sí solo no garantiza compatibilidad con todos los iPhone, y la cascada legacy requiere una transición controlada.

### ADR-006 — Estado

**Decisión:** Svelte Runes para UI; TypeScript independiente para dominio.

**Razón:** evitar un framework dentro de otro y minimizar acoplamiento.

### ADR-007 — Testing

**Decisión:** Vitest en Node + Vitest Browser Mode con `vitest-browser-svelte` + Playwright + validación física.

**Razón:** los componentes de Pokeamor dependen de layout, CSS y eventos reales; `jsdom` no representa esas diferencias.

### ADR-008 — Migración

**Decisión:** gradual, verificable y con referencia legacy.

**Razón:** minimizar regresiones visuales y funcionales.

### ADR-009 — Performance

**Decisión:** medir con trazas y dispositivos reales, separando contratos exactos de métricas estadísticas.

**Razón:** los benchmarks genéricos de framework no pueden garantizar el rendimiento del swipe, de imágenes ni de WebGL.

### ADR-010 — Compatibilidad de navegador

**Decisión:** versiones mínimas explícitas y tres niveles de compatibilidad.

**Razón:** Baseline Widely Available no significa soporte universal ni cubre todas las APIs DOM.

### ADR-011 — Validación de despliegue

**Decisión:** validar el hosting y los assets compilados durante el bootstrap.

**Razón:** descubrir una incompatibilidad de despliegue al final obligaría a rehacer trabajo ya migrado.

### ADR-012 — Estructura de migración

**Decisión:** `frontend/` temporal, alias `@` para `src/` y backend intacto.

**Razón:** evitar dos estructuras de proyecto contradictorias y no acoplar la migración a una reescritura del Worker.

### ADR-013 — Propiedad y transferencias

**Decisión:** propietario único y transferencias explícitas de nodos, imágenes y animaciones.

**Razón:** evitar recreaciones de imágenes, conflictos de DOM y liberaciones dobles.

---

## 26. Referencias técnicas

- Svelte: [https://svelte.dev/docs/svelte/overview](https://svelte.dev/docs/svelte/overview)
- Svelte 5 Runes: [https://svelte.dev/docs/svelte/what-are-runes](https://svelte.dev/docs/svelte/what-are-runes)
- Svelte TypeScript: [https://svelte.dev/docs/svelte/typescript](https://svelte.dev/docs/svelte/typescript)
- Svelte Testing: [https://svelte.dev/docs/svelte/testing](https://svelte.dev/docs/svelte/testing)
- Vite: [https://vite.dev/guide/](https://vite.dev/guide/)
- ESLint: [https://eslint.org/docs/latest/](https://eslint.org/docs/latest/)
- ESLint Svelte: [https://sveltejs.github.io/eslint-plugin-svelte/](https://sveltejs.github.io/eslint-plugin-svelte/)
- Vitest: [https://vitest.dev/](https://vitest.dev/)
- Vitest Browser Mode: [https://vitest.dev/guide/browser/](https://vitest.dev/guide/browser/)
- vitest-browser-svelte: [https://github.com/vitest-dev/vitest-browser-svelte](https://github.com/vitest-dev/vitest-browser-svelte)
- Playwright: [https://playwright.dev/](https://playwright.dev/)
- Baseline: [https://web-platform-dx.github.io/web-features/](https://web-platform-dx.github.io/web-features/)
- MDN Baseline: [https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility)
- Vite build target: [https://vite.dev/config/build-options.html#build-target](https://vite.dev/config/build-options.html#build-target)
- typescript-eslint typed linting: [https://typescript-eslint.io/getting-started/typed-linting/](https://typescript-eslint.io/getting-started/typed-linting/)
- `@eslint/css`: [https://github.com/eslint/css](https://github.com/eslint/css)
- Stylelint: [https://stylelint.io/](https://stylelint.io/)
- MDN Cascade Layers: [https://developer.mozilla.org/en-US/docs/Web/CSS/@layer](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer)
- MDN CSS Nesting: [https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_nesting](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_nesting)
- MDN Event Timing: [https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming)
- MDN Scheduler.postTask: [https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/postTask](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/postTask)
- MDN Web APIs: [https://developer.mozilla.org/en-US/docs/Web/API](https://developer.mozilla.org/en-US/docs/Web/API)
- Cloudflare Static Assets: [https://developers.cloudflare.com/workers/static-assets/](https://developers.cloudflare.com/workers/static-assets/)
- Cloudflare SPA Routing: [https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)

---

## 27. Principio rector

**Pokeamor debe cambiar su arquitectura sin perder su personalidad.**

La migración no busca hacer que toda la aplicación sea declarativa ni eliminar JavaScript imperativo por principio.

Busca que cada responsabilidad esté implementada en la tecnología que mejor la resuelve:

- Svelte para interfaces.
- TypeScript para lógica y contratos.
- CSS moderno para presentación y transiciones sencillas.
- APIs nativas para interacciones.
- WebGL para materiales.
- Web Workers para cómputo.
- Cloudflare Worker y R2 para servicios y persistencia.

El éxito no se medirá solamente por la cantidad de código eliminado.

**Se medirá por una Pokeamor más fácil de mantener, con la misma experiencia o mejor, y con un rendimiento demostrado mediante pruebas reales.**

La v1.1 no autoriza a iniciar una migración grande sin la demostración temprana de despliegue de §20. El mayor riesgo no es una limitación de Svelte: es introducir más decodificaciones, trabajo reactivo, conflictos de DOM o cambios de timing que la versión actual evita cuidadosamente.