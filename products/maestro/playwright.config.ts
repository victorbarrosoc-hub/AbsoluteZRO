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
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // E2E_VIDEO=1 grava cada teste (test-results/<teste>/video.webm), para ver o movimento quadro a quadro.
    video: process.env.E2E_VIDEO ? { mode: "on", size: { width: 1440, height: 900 } } : "off",
    // Nome de arquivo baixado com acento ("Café · Ana.txt"): o navegador só respeita com um locale UTF-8 (no POSIX ele
    // troca por "download").
    launchOptions: { env: { ...process.env, LANG: process.env.LANG?.includes("UTF-8") ? process.env.LANG : "C.UTF-8" } },
    // Nada sai para a internet: o que não é o próprio servidor (ou um falso local) falha na hora, em vez de ficar
    // pendurado (o `<zro-set>` de absolutezro.com deixava a página sem "networkidle" num ambiente sem rede). Quem
    // precisa de um serviço de fora intercepta com `route` (que vem antes do proxy).
    proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1,::1" },
  },
  projects: [
    { name: "computador", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "iphone", use: { ...devices["iPhone 15 Pro"], browserName: "chromium" } },
    // O Safari de verdade (WebKit) para o detector de corte, a troca de seção, os gestos do Quadro e o deslizar para apagar.
    { name: "iphone-safari", testMatch: /(sem-corte|transicao|gestos|set|criacao-apagar)\.spec\.ts/, use: { ...devices["iPhone 15 Pro"] } },
    // O Safari do Mac (WebKit) para arrastar o card com o mouse.
    { name: "computador-safari", testMatch: /arrastar\.spec\.ts/, use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
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
