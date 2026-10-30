/**
 * "Entrar com Absolute ZRO": a SOBEDESCE é um app cliente do login único da Absolute ZRO (OpenID Connect, código +
 * PKCE, cliente confidencial). Sem ZRO_CLIENT_ID e ZRO_CLIENT_SECRET o botão não aparece e o resto segue normal.
 */
import { origemDoSite } from "@/lib/site";

export const EMISSOR_PADRAO = "https://absolutezro.com";
export const ESCOPOS_ZRO = "openid email profile org";
/**
 * A Z, a IA do ecossistema (27/10/2026): o login também pede `offline_access zro.ia`. O refresh token fica cifrado em
 * contas_zro.ia (lib/zro/ia.ts) e só o servidor o usa, no repasse /api/zro/ia/*. Se a Absolute ZRO recusar o escopo
 * (invalid_scope), o login refaz o pedido só com ESCOPOS_ZRO e tudo segue, sem a Z.
 */
export const ESCOPO_IA = "zro.ia";
export const ESCOPOS_ZRO_IA = `${ESCOPOS_ZRO} offline_access ${ESCOPO_IA}`;
/**
 * O Set (presença e conversas do ecossistema, ADR 0032 da Absolute ZRO, 30/10/2026): o login também pede `zro.set`,
 * com os mesmos tokens da Z (contas_zro.ia), para o repasse /api/zro/set/*. A Absolute ZRO de antes do Set recusa o
 * escopo (invalid_scope): o login refaz o pedido sem ele (ESCOPOS_ZRO_IA) e tudo segue, sem o Set.
 */
export const ESCOPO_SET = "zro.set";
export const ESCOPOS_ZRO_IA_SET = `${ESCOPOS_ZRO_IA} ${ESCOPO_SET}`;

export function emissor(): string {
  return (process.env.ZRO_ISSUER?.trim() || EMISSOR_PADRAO).replace(/\/$/, "");
}

/**
 * Conexões da central Absolute ZRO: para onde vai quem acabou de ligar a conta (é lá que a pessoa vê o Google Drive
 * da SOBEDESCE junto das outras ferramentas). ZRO_CONEXOES_URL troca; o padrão é `${ZRO_ISSUER}/conexoes`.
 */
export function conexoesZro(): string {
  const env = process.env.ZRO_CONEXOES_URL?.trim();
  if (env && /^https?:\/\//i.test(env)) return env;
  return `${emissor()}/conexoes`;
}

export function zroConfigurado(): boolean {
  return Boolean(process.env.ZRO_CLIENT_ID?.trim() && process.env.ZRO_CLIENT_SECRET?.trim());
}

export function credenciaisZro(): { clientId: string; clientSecret: string } {
  const clientId = process.env.ZRO_CLIENT_ID?.trim();
  const clientSecret = process.env.ZRO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Faltam ZRO_CLIENT_ID e ZRO_CLIENT_SECRET.");
  return { clientId, clientSecret };
}

/** Retorno cadastrado no console da Absolute ZRO, um por endereço do site (como no Google). */
export function retornoZro(origem?: string | null): string {
  return `${origemDoSite(origem)}/api/zro/callback`;
}
