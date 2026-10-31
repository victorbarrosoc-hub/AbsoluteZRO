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
export function configDoPicker(env: Record<string, string | undefined> = process.env): { clientId: string; apiKey: string; appId: string } | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const apiKey = env[VARIAVEIS_PICKER.apiKey]?.trim() ?? "";
  const appId = env[VARIAVEIS_PICKER.appId]?.trim() ?? "";
  if (!clientId || !/^[\w-]{20,80}$/.test(apiKey) || !/^\d{6,20}$/.test(appId)) return null;
  return { clientId, apiKey, appId };
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
