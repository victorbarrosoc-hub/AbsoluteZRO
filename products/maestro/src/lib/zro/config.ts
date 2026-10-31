/**
 * "Entrar com Absolute ZRO": o Maestro é um app cliente do login único da Absolute ZRO (OpenID Connect, código +
 * PKCE S256, cliente confidencial `maestro-web`). Sem ZRO_CLIENT_ID e ZRO_CLIENT_SECRET o botão não aparece.
 * O cadastro do cliente no console do HUB (retorno https://maestro.absolutezro.com/api/zro/callback) só com
 * autorização do titular.
 */
import { origemDoSite } from "@/lib/site";

export const EMISSOR_PADRAO = "https://absolutezro.com";
/** Sempre: identidade, organização (zro_org, zro_products) e refresh token (perfil único e a Z). */
export const ESCOPOS_BASICOS = "openid email profile org offline_access";
/** A Z (repasse /api/zro/ia) e a API de projetos do HUB (etapa 3). */
export const ESCOPO_IA = "zro.ia";
export const ESCOPO_PROJETOS = "maestro.projects";
/** O Google Agenda das Conexões da Absolute ZRO (ADR 0026 do HUB): ocupado e eventos pelo HUB. */
export const ESCOPO_AGENDA = "zro.agenda";
/** Pessoas da Absolute ZRO (ADR 0029 do HUB): busca por @ ou nome e convite pelo @. */
export const ESCOPO_PESSOAS = "zro.pessoas";
/** O Set da Absolute ZRO (ADR 0032 do HUB): quem está online e as conversas, pelo repasse /api/zro/set. */
export const ESCOPO_SET = "zro.set";
export const ESCOPOS_SEM_AGENDA = `${ESCOPOS_BASICOS} ${ESCOPO_IA} ${ESCOPO_PROJETOS}`;
export const ESCOPOS_SEM_PESSOAS = `${ESCOPOS_SEM_AGENDA} ${ESCOPO_AGENDA}`;
export const ESCOPOS_SEM_SET = `${ESCOPOS_SEM_PESSOAS} ${ESCOPO_PESSOAS}`;
export const ESCOPOS_COMPLETOS = `${ESCOPOS_SEM_SET} ${ESCOPO_SET}`;
/**
 * Até onde pedir: `completo` (tudo); `sem_set` quando a Absolute ZRO ainda não conhece zro.set (recusou com
 * invalid_scope); `sem_pessoas` quando recusou de novo (sem zro.pessoas); `sem_agenda` (sem zro.agenda); `basico` por
 * último.
 */
export type NivelEscopo = "completo" | "sem_set" | "sem_pessoas" | "sem_agenda" | "basico";
export const ESCOPOS_DO_NIVEL: Record<NivelEscopo, string> = {
  completo: ESCOPOS_COMPLETOS,
  sem_set: ESCOPOS_SEM_SET,
  sem_pessoas: ESCOPOS_SEM_PESSOAS,
  sem_agenda: ESCOPOS_SEM_AGENDA,
  basico: ESCOPOS_BASICOS,
};
export const PROXIMO_NIVEL: Record<NivelEscopo, NivelEscopo | null> = {
  completo: "sem_set",
  sem_set: "sem_pessoas",
  sem_pessoas: "sem_agenda",
  sem_agenda: "basico",
  basico: null,
};

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

/** Retorno cadastrado no console da Absolute ZRO, um por endereço do site. */
export function retornoZro(origem?: string | null): string {
  return `${origemDoSite(origem)}/api/zro/callback`;
}
