// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright config for Quantum UI tests.
 * Quantum server runs on http://127.0.0.1:8090 (config.json port).
 * Tests start the server automatically via webServer config.
 */
module.exports = defineConfig({
  testDir: './tests/ui',
  testMatch: '*.spec.cjs',
  fullyParallel: false,           // Quantum server is single-instance — no parallel
  forbidRetry: false,
  retries: 0,
  workers: 1,                     // single worker — shared server
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://127.0.0.1:8090',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 8_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Auto-start Quantum server before tests, auto-stop after
  webServer: {
    command: 'node server.cjs',
    url: 'http://127.0.0.1:8090',
    timeout: 30_000,
    reuseExistingServer: true,     // don't restart if already running
    stdout: 'ignore',
    stderr: 'pipe',
  },
});