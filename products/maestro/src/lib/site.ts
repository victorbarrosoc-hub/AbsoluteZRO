/** Dados do site: nome, endereço, frases e rotas. Sem segredo. */

export const SITE_NOME = "Maestro";
export const SITE_OFICIAL = "https://maestro.absolutezro.com";
/** A frase do Maestro (título da página inicial e do OG). */
export const SITE_FRASE = "A produtora inteira num lugar só.";
/**
 * Lançamento (ADR 0027 do HUB; checklist em docs/operations/lancamento-maestro.md; no ar sem selo de Beta desde
 * 30/10/2026, decisão do titular). Liga só a vitrine
 * (página inicial, descrição): quem entra continua decidido pelo gate do HUB (migration 0027 + temAcesso). Vira com
 * `node scripts/lancamento-maestro.mjs --abrir` (e volta com `--fechar`), junto com as listas da família dos outros apps.
 */
export const MAESTRO_LANCADO = true;

export const SITE_DESCRICAO = MAESTRO_LANCADO
  ? "Pauta, aprovação do cliente, orçamentos, financeiro, freelas, equipamento e agenda da sua produtora num lugar só, com a conta Absolute ZRO."
  : "Pauta, aprovação do cliente, orçamentos, financeiro, freelas, equipamento e agenda da sua produtora num lugar só, com a conta Absolute ZRO. Em teste fechado, por convite.";
/** Fale com a gente (rodapé, lista de espera). */
export const CONTATO = "contato@absolutezro.com";

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

/** O login único já com a volta para o app: "Entrar" e "Criar conta" (o mesmo login com prompt=create). */
export const ENTRAR_ZRO = `/api/zro/entrar?${new URLSearchParams({ volta: ROTAS.app })}`;
export const CRIAR_CONTA_ZRO = `/api/zro/entrar?${new URLSearchParams({ modo: "criar", volta: ROTAS.app })}`;
