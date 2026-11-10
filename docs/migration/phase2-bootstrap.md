# Fase 2 — Bootstrap Svelte (progreso)

**Fecha:** 2026-11-10

## Estado

Bootstrap completado y verificado localmente. La SPA Svelte 5 mínima se construye,
se sirve y consume el backend existente a través del proxy de desarrollo.

## Qué se creó

- `frontend/` — Svelte 5.57 + Vite 8 + TypeScript 6 (strict), creado con
  `npm create vite -- --template svelte-ts`.
- Alias `@` → `frontend/src/` (en `vite.config.ts` y `tsconfig.app.json`).
- ESLint Flat Config con información de tipos, Svelte, `@eslint/css` (Baseline),
  detección de imports circulares y reglas de capas.
- Prettier + `prettier-plugin-svelte`.
- Vitest 5 con proyectos `unit` (Node) y `browser` (Playwright) + `vitest-browser-svelte`.
- Playwright (chromium/firefox/webkit + emulación móvil).
- Esqueleto en capas: `domain/` (contratos de catálogo), `infrastructure/` (cliente
  HTTP tipado), `application/` (estado con runes), `components/`, `styles/`.
- `AGENTS.md` en la raíz.
- Proxy de desarrollo que preserva el modelo `Origin` del Worker (§18).

## Verificación (todo verde)

| Comando | Resultado |
|---|---|
| `npm run check` | 0 errores, 0 warnings |
| `npm run lint` | 0 errores |
| `npm run build` | 36 KB JS (14 KB gzip) |
| `npm run test:unit` | 1/1 |
| `npm run test:browser` | 1/1 |
| `npm run test:legacy` | 154/154 |
| Smoke test (proxy + Worker) | `GET /` 200, `/catalog-bundle.json` OK, `PUT /api/session` `{"saved":true}` |

## Pendiente (requiere acceso al hosting)

La validación de despliegue en Cloudflare Static Assets (hashes, MIME types, rutas,
política de caché y fallback SPA) es manual y no se puede completar desde este
entorno. Es el criterio de salida restante de la Fase 2 antes de avanzar a la
migración grande (Fase 3+).

## Notas técnicas

- `tsconfig.app.json` ya no usa `baseUrl` (deprecado en TS 6); `paths` se resuelve
  relativo al archivo de configuración.
- La suite legacy exige correr desde la raíz del repo (rutas relativas a `src/`),
  por eso `test:legacy` ejecuta `npm --prefix .. run test`.
