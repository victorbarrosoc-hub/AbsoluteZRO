import { defineConfig, devices } from "@playwright/test";

/**
 * E2E do Maestro: o build local (`npm run build` antes) num banco descartável `maestro_test_e2e` (Postgres local, o
 * mesmo TEST_DATABASE_URL dos testes). O globalSetup recria e migra o banco, cria uma organização e uma sessão de
 * teste e guarda o cookie em test-results/. Nunca aponta para serviço externo.
 */
const PORT = Number(process.env.E2E_PORT || 3217);
const BASE = process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/postgres";
const u = new URL(BASE);
u.pathname = "/maestro_test_e2e";
export const E2E_DB = u.toString();
export const E2E_KEY = Buffer.alloc(32, 7).toString("base64");

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/preparar.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "computador", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "iphone", use: { ...devices["iPhone 15 Pro"], browserName: "chromium" } },
    // O Safari de verdade (WebKit) só para o detector de corte (e2e/sem-corte.spec.ts).
    { name: "iphone-safari", testMatch: /sem-corte\.spec\.ts/, use: { ...devices["iPhone 15 Pro"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    // Arquivo estático: o banco só é recriado no globalSetup; o servidor só conecta no primeiro pedido.
    url: `http://localhost:${PORT}/brand/maestro-symbol.svg`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      MAESTRO_DATABASE_URL: E2E_DB,
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
      // Chave fixa só de teste (32 bytes 0x07): o build roda em modo produção, que exige MAESTRO_KEY.
      MAESTRO_KEY: E2E_KEY,
      NEXT_TELEMETRY_DISABLED: "1",
      // O HUB e o SOBEDESCE de mentira do e2e de Arquivos (e2e/preparar.ts); o Google é interceptado no navegador.
      MAESTRO_PONTE_URL: `http://127.0.0.1:${Number(process.env.E2E_PONTE_PORT || 3219)}`,
      // A ANP de mentira (tests/anp-fixture.mts) e o segredo do agendamento: o combustível automático sem rede.
      MAESTRO_ANP_URL: `http://127.0.0.1:${Number(process.env.E2E_ANP_PORT || 3221)}/pagina`,
      CRON_SECRET: "segredo-do-cron-e2e",
    },
  },
});
