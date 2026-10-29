import { defineConfig, devices } from "@playwright/test";

/**
 * E2E do Maestro: o build local (`npm run build` antes) num banco descartável `maestro_test_e2e` (Postgres local, o
 * mesmo TEST_DATABASE_URL dos testes). O globalSetup recria e migra o banco, cria uma organização e uma sessão de
 * teste e guarda o cookie em test-results/. Nunca aponta para serviço externo.
 */
const PORT = Number(process.env.E2E_PORT || 3217);
const BASE = process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/postgres";
const u = new URL(BASE);
// E2E_DB_SUFIXO separa o banco quando duas cópias do repositório rodam o e2e ao mesmo tempo (maestro_test_e2e_<sufixo>).
const SUFIXO = (process.env.E2E_DB_SUFIXO ?? "").replace(/[^a-z0-9_]/g, "");
u.pathname = `/maestro_test_e2e${SUFIXO ? `_${SUFIXO}` : ""}`;
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
    // O Safari de verdade (WebKit) para o detector de corte, a troca de seção e os gestos do Quadro.
    { name: "iphone-safari", testMatch: /(sem-corte|transicao|gestos|set)\.spec\.ts/, use: { ...devices["iPhone 15 Pro"] } },
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
      // A página inicial lançada lê o app de computador no catálogo do HUB: no e2e, nunca (sem serviço externo).
      MAESTRO_CATALOGO_DESKTOP: "desligado",
      // O HUB e o SOBEDESCE de mentira do e2e de Arquivos (e2e/preparar.ts); o Google é interceptado no navegador.
      MAESTRO_PONTE_URL: `http://127.0.0.1:${Number(process.env.E2E_PONTE_PORT || 3219)}`,
      // A ANP de mentira (tests/anp-fixture.mts) e o segredo do agendamento: o combustível automático sem rede.
      MAESTRO_ANP_URL: `http://127.0.0.1:${Number(process.env.E2E_ANP_PORT || 3221)}/pagina`,
      CRON_SECRET: "segredo-do-cron-e2e",
      // Photon e OSRM de mentira (tests/rota-fixture.mts): lugares e km sem rede.
      MAESTRO_PHOTON_URL: `http://127.0.0.1:${Number(process.env.E2E_ROTA_PORT || 3223)}/photon/api/`,
      MAESTRO_OSRM_URL: `http://127.0.0.1:${Number(process.env.E2E_ROTA_PORT || 3223)}/osrm`,
    },
  },
});
