/**
 * Cliente OAuth "Aplicativo da Web" da SOBEDESCE (docs/CONTAS.md §2).
 * Desde 31/10/2026 o cliente mora no projeto Google "SOBEDESCE", separado do HUB (a verificação do HUB não espera a do Drive).
 * Nada aqui lança no import: sem as variáveis, a tela de conta avisa e o resto abre normal.
 */
import { origemDoSite } from "@/lib/site";
import { GoogleError } from "./erros";

/** Drive inteiro (restrito: sem a auditoria, no máximo 100 contas na vida do projeto Google). Só com "Acesso total". */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
/** Só o que passou pelo SOBEDESCE (criou ou enviou) e o que a pessoa escolher no Picker. Não sensível, sem limite. */
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const BASICOS = ["openid", "email", "profile"];

/** "total" = escopo `drive`; "arquivos" = `drive.file` (Arquivos escolhidos). */
export type ModoDrive = "total" | "arquivos";

/** Entrar com Google: só quem é a pessoa. Nunca pede Drive (não gasta vaga). */
export const ESCOPOS_ENTRAR = BASICOS.join(" ");
/** Conectar Drive: o escopo sai do modo, decidido antes de ir ao Google (lib/google/vagas.ts). */
export function escoposDoModo(modo: ModoDrive): string {
  return [...BASICOS, modo === "total" ? DRIVE_SCOPE : DRIVE_FILE_SCOPE].join(" ");
}

/**
 * O "Escolher do Drive" (Google Picker) no app do celular. Valores públicos (a chave é restrita por referenciador e
 * à Picker API; o App ID é o número do projeto Google SOBEDESCE), lidos em tempo de execução e entregues por
 * /api/drive/picker. Os três precisam ser do mesmo projeto do GOOGLE_CLIENT_ID.
 */
export const VARIAVEIS_PICKER = { apiKey: "GOOGLE_PICKER_API_KEY", appId: "GOOGLE_APP_ID" } as const;

/** Valor de variável como veio colado: sem espaços e sem aspas em volta. */
const limpo = (v: string | undefined) => (v ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
/** O número do projeto Google está no começo do client ID ("123456789012-abc….apps.googleusercontent.com"). */
const numeroDoProjeto = (clientId: string) => /^(\d{6,20})-/.exec(clientId)?.[1] ?? null;

export type ProblemaPicker = "client_id_falta" | "chave_falta" | "chave_formato" | "app_id_formato" | "app_id_outro_projeto";

/**
 * O que falta para o Picker, sem expor valor nenhum (vai para o log e para o /admin). O App ID aceita o número do
 * projeto ("projects/123…" também); vazio ou inválido, vale o número que já está no começo do client ID (é o mesmo
 * projeto, e o Picker só funciona com o projeto do client ID).
 */
export function diagnosticoPicker(env: Record<string, string | undefined> = process.env): { config: { clientId: string; apiKey: string; appId: string } | null; problemas: ProblemaPicker[]; appIdDoClientId: boolean } {
  const clientId = limpo(env.GOOGLE_CLIENT_ID);
  const apiKey = limpo(env[VARIAVEIS_PICKER.apiKey]);
  const appIdBruto = limpo(env[VARIAVEIS_PICKER.appId]).replace(/^projects\//, "");
  const doClient = numeroDoProjeto(clientId);
  const problemas: ProblemaPicker[] = [];
  if (!clientId) problemas.push("client_id_falta");
  if (!apiKey) problemas.push("chave_falta");
  else if (!/^[\w-]{20,80}$/.test(apiKey)) problemas.push("chave_formato");
  let appId = /^\d{6,20}$/.test(appIdBruto) ? appIdBruto : "";
  if (appIdBruto && !appId) problemas.push("app_id_formato");
  if (appId && doClient && appId !== doClient) problemas.push("app_id_outro_projeto");
  if ((!appId || appId !== doClient) && doClient) appId = doClient;
  const pronto = Boolean(clientId && apiKey && /^[\w-]{20,80}$/.test(apiKey) && appId);
  return { config: pronto ? { clientId, apiKey, appId } : null, problemas, appIdDoClientId: Boolean(doClient && appId === doClient && appIdBruto !== doClient) };
}

export function configDoPicker(env: Record<string, string | undefined> = process.env): { clientId: string; apiKey: string; appId: string } | null {
  return diagnosticoPicker(env).config;
}

/**
 * Endereço de retorno cadastrado no Google Cloud. Um por endereço do site (sobedesce.com e o antigo .vercel.app):
 * o Google volta para o mesmo endereço onde o login começou, onde está o cookie do state.
 */
export function redirectUri(origem?: string | null): string {
  return `${origemDoSite(origem)}/api/google/callback`;
}

/** Id e segredo do cliente. Sem eles: GoogleError("sem_config"). */
export function credenciais(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new GoogleError("sem_config", 0, "Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.");
  return { clientId, clientSecret };
}

export function googleConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

/**
 * Google falso (SOBEDESCE_GOOGLE_BASE), só em teste local: nunca na Vercel nem em produção,
 * porque o segredo do cliente e os tokens iriam para essa base. E só em 127.0.0.1/localhost.
 */
export function baseDeTeste(): string | null {
  const base = process.env.SOBEDESCE_GOOGLE_BASE;
  if (!base || process.env.VERCEL || process.env.NODE_ENV === "production") return null;
  try {
    const u = new URL(base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Endpoints (função, não constante: os testes trocam o ambiente). */
export function endpoints() {
  const base = baseDeTeste();
  if (base) {
    return {
      auth: `${base}/o/oauth2/v2/auth`,
      token: `${base}/token`,
      revoke: `${base}/revoke`,
      userinfo: `${base}/v1/userinfo`,
      drive: `${base}/drive/v3`,
    };
  }
  return {
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    revoke: "https://oauth2.googleapis.com/revoke",
    userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
    drive: "https://www.googleapis.com/drive/v3",
  };
}
