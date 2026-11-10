import { fileURLToPath } from 'node:url'

import { svelte } from '@sveltejs/vite-plugin-svelte'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const srcAlias = fileURLToPath(new URL('./src', import.meta.url))

// https://vitest.dev/guide/projects
export default defineConfig({
  resolve: {
    alias: {
      '@': srcAlias,
    },
  },
  test: {
    projects: [
      {
        resolve: {
          alias: {
            '@': srcAlias,
          },
        },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
        },
      },
      {
        plugins: [svelte()],
        resolve: {
          alias: {
            '@': srcAlias,
          },
        },
        test: {
          name: 'browser',
          include: ['tests/components/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
