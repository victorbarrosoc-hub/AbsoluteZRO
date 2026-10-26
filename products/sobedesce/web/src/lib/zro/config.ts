/**
 * "Entrar com Absolute ZRO": a SOBEDESCE é um app cliente do login único da Absolute ZRO (OpenID Connect, código +
 * PKCE, cliente confidencial). Sem ZRO_CLIENT_ID e ZRO_CLIENT_SECRET o botão não aparece e o resto segue normal.
 */
import { origemDoSite } from "@/lib/site";

export const EMISSOR_PADRAO = "https://absolutezro.com";
export const ESCOPOS_ZRO = "openid email profile org";

export function emissor(): string {
  return (process.env.ZRO_ISSUER?.trim() || EMISSOR_PADRAO).replace(/\/$/, "");
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
