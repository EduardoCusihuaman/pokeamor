# AGENTS.md

Guía de trabajo para personas y agentes que modifiquen **pokéamor**.

> La especificación completa es [`plan.md`](./plan.md). Las decisiones, el baseline y los
> umbrales de rendimiento se registran en [`docs/migration/`](./docs/migration/). Si este
> archivo y `plan.md` difieren, `plan.md` manda.

> Los agentes pueden cambiar la arquitectura interna, pero no pueden cambiar silenciosamente
> los contratos de experiencia, identidad DOM, recursos y persistencia. Toda optimización debe
> demostrar que preserva el comportamiento o justificar expresamente la diferencia.

## Contexto rápido

- La app nueva vive en `frontend/` y usa Svelte 5, Vite y TypeScript estricto.
- El código legacy en `src/`, `data/`, `scripts/`, `worker/` y `tests/` se conserva y es la
  referencia de comportamiento hasta demostrar equivalencia.
- Las importaciones entre capas usan el alias `@/`, que apunta a `frontend/src/`. No se usa
  `$lib`.
- Navegadores mínimos: Safari/iOS 16.4+, Chrome/Edge 111+ y Firefox 115+.

## Reglas principales

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

## Reglas específicas de Svelte 5

21. No usar `$effect` para derivar estado que puede calcularse con `$derived`.
22. No mutar props; usar callbacks o `bind` explícito.
23. Usar `$state.raw` para catálogo, recursos, texturas y estructuras grandes.
24. No usar `$lib` sin alias configurado; usar `@/` o imports relativos.
25. Los estilos de nodos imperativos van en CSS global del deck, no en `<style>` scoped.
26. Las pruebas de componentes usan Vitest Browser Mode cuando el comportamiento dependa de
    layout o CSS.
27. No aplicar `@layer` sobre CSS legacy sin capturas y verificación de cascada.
28. No introducir un router hash que compita con `#s=`.
29. No relajar la validación de `Origin` del Worker.
30. No declarar compatibilidad CSS solo por Baseline; comprobar las versiones mínimas de §10.
31. No crear carpetas vacías ni mover el backend sin necesidad.

## Protocolo para cambios

Cada cambio significativo debe documentar:

- Qué problema resuelve.
- Qué archivos modifica.
- Qué contratos afecta.
- Qué pruebas ejecutó.
- Qué riesgos quedan.
- Si altera rendimiento.
- Si requiere validación en navegador físico.

Antes de cerrar un cambio, verificar además:

- [ ] Los checks relacionados pasan (typecheck, lint, formato y pruebas aplicables).
- [ ] No se debilitó ninguna prueba para obtener un resultado verde.
- [ ] No se modificó un contrato de experiencia, identidad DOM, recursos o persistencia sin
      justificación explícita.
- [ ] La dirección de dependencias entre capas se mantiene.
- [ ] Si hubo un cambio visual, se comparó contra el comportamiento legacy.
