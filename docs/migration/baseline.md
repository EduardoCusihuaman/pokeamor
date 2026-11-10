# Baseline de migración — Fase 1

**Fecha:** 2026-11-10
**Commit de referencia:** `37a8b3f` (HEAD al congelar el baseline)

## Entorno

| Componente | Versión |
|---|---|
| Node.js | v24.21.0 |
| Python | 3.14.7 |
| Navegadores objetivo | Chrome/Edge 111+, Firefox 115+, Safari/iOS 16.4+ (ver plan §10) |

## Resultados de las pruebas legacy

Comando: `node --test 'tests/*.test.*'`

| Métrica | Valor |
|---|---|
| Archivos de prueba | 39 |
| Tests | 154 |
| Pass | 154 |
| Fail | 0 |
| Skipped | 0 |
| Duración | ~2.1 s |

Los 39 archivos de `tests/` constituyen la suite de aceptación legacy (ATDD). Todos
verdes al congelar el baseline. Cualquier regresión funcional frente a este estado
bloquea la publicación (contratos exactos, plan §16).

## Notas

- `plan.md` (v1.1) es la especificación de referencia para la migración.
- `scripts/ingest-alternatives.py` tiene cambios sin commitear al congelar; no
  afecta la suite de tests.
- El pipeline de build es `scripts/build.sh` (genera `worker/index.js` y `dist/`).
