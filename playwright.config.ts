import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || 3200)
const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    // Usa o build de produção local (npm run build antes). Nunca aponta para serviço externo.
    command: `npx next start -p ${PORT}`,
    cwd: 'apps/hub-web',
    // Arquivo estático: o banco de teste só é recriado no globalSetup, depois que o servidor sobe.
    url: `http://localhost:${PORT}/icon.svg`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: DB,
      ZRO_APP_ORIGIN: `http://localhost:${PORT}`,
      ZRO_BILLING_PROVIDERS: 'manual',
      ZRO_BILLING_WEBHOOK_SECRET_MANUAL: 'segredo-e2e',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
})
