import { defineConfig, devices } from '@playwright/test';

export const E2E_PORT = 4173;
export const E2E_WRITE_TOKEN = 'e2e-write-token';
const baseURL = `http://127.0.0.1:${E2E_PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI !== undefined ? 2 : 0,
  reporter: process.env.CI !== undefined ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Allows pointing at a system Chromium (e.g. sandboxes without browser download).
        ...(process.env.CHROMIUM_PATH !== undefined
          ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'node start-server.mjs',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    stdout: 'ignore',
    timeout: 30_000,
    env: {
      PORT: String(E2E_PORT),
      HOST: '127.0.0.1',
      RECIPES_DIR: './.tmp/recipes',
      SEED_RECIPES_DIR: '../recipes',
      WEB_DIST_DIR: '../apps/web/dist',
      WRITE_TOKEN: E2E_WRITE_TOKEN,
      LOG_LEVEL: 'warn',
    },
  },
});
