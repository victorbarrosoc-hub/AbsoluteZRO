/** Dados do site: endereço, contato, rotas e textos comuns. */

/** Endereço público do site (links do e-mail, URL do dispositivo, retorno do Google). */
export const SITE_OFICIAL = "https://sobedesce.com";

/**
 * Endereço antigo. Continua no ar e completo: apps de computador já instalados, o app do celular na Tela de Início
 * e as sessões de antes usam ele. O login com Google funciona nos dois (cada um tem o seu retorno cadastrado).
 */
export const SITE_ANTIGO = "https://sobedesce.vercel.app";

/**
 * O subdomínio da Absolute ZRO (decisão do titular, 30/10/2026). Entra como origem do próprio site (login, cookies,
 * conferência de origem) ao lado dos outros; vira o endereço principal quando o DNS estiver no ar.
 */
export const SITE_ZRO = "https://sobedesce.absolutezro.com";

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

/** Origens que são o próprio site (o principal, o oficial e o antigo). */
export function origensDoSite(): string[] {
  return [...new Set([siteUrl(), SITE_OFICIAL, SITE_ZRO, SITE_ANTIGO])];
}

/** A origem do pedido, se for uma das do site; senão o endereço principal. */
export function origemDoSite(origem?: string | null): string {
  return origem && origensDoSite().includes(origem) ? origem : siteUrl();
}

/**
 * Origem dos links que a pessoa leva para fora (link pra IA, atalho do iPhone): nunca o endereço antigo, mesmo
 * quando o pedido veio dele (app na Tela de Início instalado antes do domínio). Os links antigos continuam abrindo.
 */
export function origemPublica(origem?: string | null): string {
  const o = origemDoSite(origem);
  return o === SITE_ANTIGO ? siteUrl() : o;
}

/**
 * Cookies com Secure fora do localhost (Safari não guarda cookie Secure em http://localhost).
 * `origem`: a origem do pedido (http.ts → origemDoPedido); sem ela, vale o endereço do site.
 */
export function cookieSeguro(origem?: string | null): boolean {
  try {
    const host = new URL(origem || siteUrl()).hostname;
    return !["localhost", "127.0.0.1", "[::1]"].includes(host);
  } catch {
    return true;
  }
}

export const SITE_NOME = "SOBEDESCE";

export const SITE_URL = siteUrl();

export const CONTATO_EMAIL = "contato@absolutezro.com";

/** Data da última revisão da Política de Privacidade e dos Termos. */
export const LEGAL_ATUALIZADO_EM = "17 de outubro de 2026";

/**
 * O app de computador é instalado e atualizado só pela central Absolute ZRO (pedido do titular, 01/11/2026): o site
 * mostra "Use no computador com a Absolute ZRO" e manda para esta página. Desde a revisão de 01/11/2026 /baixar/mac e
 * /baixar/windows levam para cá (só o `?build=N` do "Atualizar" dos apps antigos ainda baixa o instalador daquele
 * build) e os instalar.* viraram um recado (no navegador, vêm para cá). /baixar/versao continua: é o aviso dos apps.
 */
export const CENTRAL_ZRO = "https://absolutezro.com/baixar";

export const ROTAS = {
  entrar: "/entrar",
  criarConta: "/criar-conta",
  celular: "/app/",
  privacidade: "/privacidade",
  termos: "/termos",
  precos: "/precos",
} as const;

export const SITE_DESCRICAO =
  "Transferências rápidas e retomáveis para o Google Drive, feitas para arquivos gigantes de audiovisual. Várias conexões em paralelo, pausa sem perder nada e cada arquivo conferido.";
