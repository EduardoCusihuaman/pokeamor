# Fase 3 — Contratos y módulos independientes (completada)

**Fecha:** 2026-11-10

## Resultado

Todos los módulos legacy (`src/*.js`) quedaron extraídos a TypeScript
framework-free (sin Svelte ni DOM), con dependencias inyectadas, y los 39 tests
legacy tienen equivalente en Vitest (importan los módulos directamente, sin
`node:vm` ni `slice()`).

| Capa | Módulos extraídos |
|---|---|
| `domain/cards` | identity, resources, discovery-buffer |
| `domain/recommendations` | recommender |
| `domain/collection` | preference, journey, batch-export |
| `domain/battle` | refinement (regla Elo de duelo) |
| `application` | sync, events, battle, album, detail, debug, export, refinement-gestures |
| `engines/resources` | resource-coordinator, material-assets, artwork |
| `engines/materials` | material-renderer (WebGL), holo |
| `engines/deck` | reconcile |
| `engines/swipe` | coordinator, flight, seal |

## Verificación

| Comando | Resultado |
|---|---|
| `test:unit` | 174 tests / 38 archivos |
| `test:browser` | 1/1 |
| `test:legacy` | 154/154 (suite legacy intacta) |
| `check` | 0 errores |
| `lint` | 0 errores |

Los agentes hicieron fuzzing diferencial contra el código legacy (paridad exacta
en scores, ranking, batches, export y animaciones).

## Siguiente

Fase 4 — slice vertical de discovery en Svelte (datos → estado → componente →
estilos → tests → build), cableando los motores extraídos como islas imperativas
(plan §6, patrón A).
