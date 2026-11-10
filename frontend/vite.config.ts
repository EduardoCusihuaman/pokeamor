import { fileURLToPath, URL } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// https://vite.dev/config/
//
// Local development proxies the backend routes to the Cloudflare Worker dev
// server (`node scripts/dev.mjs`, default port 8787). Override the target with
// the POKEAMOR_API env var if the Worker runs elsewhere.
//
// The Worker validates that a session PUT carries `Origin` equal to its own
// origin (see scripts/build-worker.py). The `/api/session` proxy rewrites the
// forwarded `Origin` header to the Worker's origin so local dev matches the
// production model WITHOUT relaxing the Worker's security check.
const API_TARGET = process.env.POKEAMOR_API ?? 'http://localhost:8787';
const API_ORIGIN = new URL(API_TARGET).origin;

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/catalog-bundle.json': API_TARGET,
      '/catalog.json': API_TARGET,
      '/materials': API_TARGET,
      '/api/session': {
        target: API_TARGET,
        changeOrigin: true,
        configure: (proxy) =>
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Origin', API_ORIGIN);
          }),
      },
    },
  },
});
