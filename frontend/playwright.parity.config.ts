import { defineConfig } from '@playwright/test';

// Opt-in: both servers must already be running; never start or modify legacy.
export default defineConfig({
  testDir: './tests/parity',
  timeout: 45_000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: '/tmp/opencode/parity-report', open: 'never' }]],
  outputDir: '/tmp/opencode/parity-results',
  snapshotPathTemplate: '/tmp/opencode/parity-snapshots/{testFilePath}/{testName}/{arg}{ext}',
  updateSnapshots: 'none',
  use: { browserName: 'chromium', reducedMotion: 'reduce', deviceScaleFactor: 1 },
});
