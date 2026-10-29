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
    url: `http://localhost:${PORT}/icon.png`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: DB,
      ZRO_APP_ORIGIN: `http://localhost:${PORT}`,
      ZRO_BILLING_PROVIDERS: 'manual',
      ZRO_BILLING_WEBHOOK_SECRET_MANUAL: 'segredo-e2e',
      NEXT_TELEMETRY_DISABLED: '1',
      // Conexões (ADR 0026): o Google falso de tests/fixtures/google-falso.ts (sobe no próprio teste) e uma chave só de teste.
      ZRO_GOOGLE_TESTE_CLIENT_ID: 'google-e2e',
      ZRO_GOOGLE_TESTE_CLIENT_SECRET: 'segredo-google-e2e',
      ZRO_GOOGLE_TESTE_URL: `http://127.0.0.1:${Number(process.env.E2E_GOOGLE_PORT || 3298)}`,
      ZRO_CONEXOES_KEY: Buffer.alloc(32, 9).toString('base64'),
      // Dólar automático dos Custos: o Banco Central falso de tests/e2e/admin.spec.ts e o segredo do agendamento.
      ZRO_PTAX_URL: `http://127.0.0.1:${Number(process.env.E2E_PTAX_PORT || 3297)}`,
      CRON_SECRET: 'segredo-cron-e2e',
      // A Z "ligada" para a tela (tests/e2e/z-digitando.spec.ts): chave falsa, nunca usada (nenhum teste envia mensagem).
      IA_ANTHROPIC_KEY: 'chave-falsa-do-e2e',
    },
  },
})
