/** Dados do site: nome, endereço, frases e rotas. Sem segredo. */

export const SITE_NOME = "Maestro";
export const SITE_OFICIAL = "https://maestro.absolutezro.com";
export const SITE_DESCRICAO = "A gestão da sua produtora num lugar só: CRM, financeiro, controle de pauta e aprovação do cliente. Uma plataforma Absolute ZRO.";

/** Endereço público do site (retorno do login, links). NEXT_PUBLIC_SITE_URL manda; sem ela, o oficial. */
export function siteUrl(): string {
  const v = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (v) {
    try {
      return new URL(v).origin;
    } catch {
      // valor inválido: cai no oficial
    }
  }
  return SITE_OFICIAL;
}

/** Origens que são o próprio site. */
export function origensDoSite(): string[] {
  return [...new Set([siteUrl(), SITE_OFICIAL])];
}

/** A origem do pedido, se for uma das do site; senão o endereço principal. */
export function origemDoSite(origem?: string | null): string {
  return origem && origensDoSite().includes(origem) ? origem : siteUrl();
}

/** Cookies com Secure fora do localhost (Safari não guarda cookie Secure em http://localhost). */
export function cookieSeguro(origem?: string | null): boolean {
  try {
    const host = new URL(origem || siteUrl()).hostname;
    return !["localhost", "127.0.0.1", "[::1]"].includes(host);
  } catch {
    return true;
  }
}

export const ROTAS = {
  entrar: "/entrar",
  semAcesso: "/sem-acesso",
  /** A entrada: o Quadro com tarefa sua em andamento, senão a Z (src/app/(app)/app/page.tsx, 28/10/2026). */
  app: "/app",
} as const;

/** Onde a pessoa vê (e pede) as ferramentas liberadas para a conta Absolute ZRO. */
export const HUB_URL = "https://absolutezro.com";
export const FERRAMENTAS_ZRO = `${HUB_URL}/ferramentas`;
