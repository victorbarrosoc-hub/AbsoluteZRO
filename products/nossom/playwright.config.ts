import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'node scripts/test-server.mjs',
    url: 'http://localhost:3000/entrar',
    reuseExistingServer: false,
    timeout: 120000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-device-for-media-stream'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
