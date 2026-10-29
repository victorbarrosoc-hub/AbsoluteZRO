/**
 * "Maestro com a sua marca" (white-label, plano v2 §8, fase 20): com o sinal `maestro.marca_propria` (adicional ou Pro,
 * vindo do HUB na claim `zro_features`), o app inteiro usa o logo, o nome e a cor da produtora; fica só um "Powered by
 * Absolute ZRO" discreto. Sem o sinal, null: nada muda. O logo no timbrado e nas páginas do cliente é de todos os planos
 * (Ajustes → Marca) e não passa por aqui.
 */
import { temMarcaPropria } from "@/lib/auth/acesso";
import type { Sessao } from "@/lib/auth/sessao";
import { acentosDaMarca, type AcentosDaMarca } from "./cor";
import { lerMarca, type Marca } from "./servidor";

export type MarcaPropria = { nome: string; logo: string | null; acentos: AcentosDaMarca | null };

/** Puro: a marca própria a partir da marca gravada (nome da organização se a marca não tem nome). */
export function marcaPropriaDe(m: Pick<Marca, "nome" | "logo" | "cor">, nomeOrg: string): MarcaPropria {
  return { nome: m.nome?.trim() || nomeOrg, logo: m.logo, acentos: acentosDaMarca(m.cor) };
}

/** A marca própria da sessão, ou null sem o sinal (ou se a leitura falhar: o app segue com a marca do Maestro). */
export async function marcaPropriaDaSessao(s: Sessao): Promise<MarcaPropria | null> {
  if (!temMarcaPropria(s)) return null;
  const m = await lerMarca({ sub: s.sub, orgId: s.orgId }).catch(() => null);
  return m ? marcaPropriaDe(m, s.orgNome) : { nome: s.orgNome, logo: null, acentos: null };
}

/** As variáveis de CSS do acento da produtora no shell (claro e escuro), ou nada. */
export function estiloDaMarcaPropria(m: MarcaPropria | null): Record<string, string> | undefined {
  if (!m?.acentos) return undefined;
  return {
    "--wl-claro": m.acentos.claro,
    "--wl-escuro": m.acentos.escuro,
    "--wl-suave-claro": m.acentos.suaveClaro,
    "--wl-suave-escuro": m.acentos.suaveEscuro,
  };
}
