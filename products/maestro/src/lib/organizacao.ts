/**
 * Dados da empresa para o timbrado e a calculadora (Ajustes → Empresa): nome fantasia, razão social, CNPJ, endereço,
 * contatos, cidade base (origem do deslocamento, UF da gasolina), validade e condições padrão do orçamento e o
 * fechamento. Ficam em maestro.organizations.settings.empresa; só administração muda (RLS da 0000).
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto, type Tx } from "@/lib/db/client";
import { traduzirPg, type Erros, type Res, falha } from "@/lib/crm/comum";
import { ehUf } from "@/lib/orcamento/deslocamento";
import { lerMarcaNaTx, type Marca } from "@/lib/marca/servidor";

export type Empresa = {
  fantasia: string | null;
  razao: string | null;
  cnpj: string | null;
  endereco: string | null;
  email: string | null;
  telefone: string | null;
  instagram: string | null;
  site: string | null;
  cidade: string | null;
  uf: string | null;
  lat: number | null;
  lon: number | null;
  validadeDias: number;
  condicoes: string | null;
  fechamento: string | null;
  /** O freela escalado vê o nome do cliente em "Seus trabalhos" (drizzle/0037). Padrão: sim. */
  freelaVeCliente?: boolean;
  /** Da marca (Ajustes → Marca): logo, cor de destaque e linha de assinatura. */
  logo?: string | null;
  cor?: string | null;
  assinatura?: string | null;
};

export const EMPRESA_VAZIA: Empresa = {
  fantasia: null,
  razao: null,
  cnpj: null,
  endereco: null,
  email: null,
  telefone: null,
  instagram: null,
  site: null,
  cidade: null,
  uf: null,
  lat: null,
  lon: null,
  validadeDias: 15,
  condicoes: null,
  fechamento: null,
  freelaVeCliente: true,
};

const LIMITES: Record<string, number> = {
  fantasia: 120,
  razao: 200,
  cnpj: 20,
  endereco: 300,
  email: 254,
  telefone: 30,
  instagram: 60,
  site: 200,
  cidade: 120,
  condicoes: 4000,
  fechamento: 500,
};

export function lerEmpresaDe(settings: unknown): Empresa {
  const e = ((settings as Record<string, unknown> | null)?.empresa ?? {}) as Record<string, unknown>;
  const t = (k: string) => (typeof e[k] === "string" && (e[k] as string).trim() ? (e[k] as string) : null);
  const n = (k: string) => (typeof e[k] === "number" && Number.isFinite(e[k]) ? (e[k] as number) : null);
  return {
    fantasia: t("fantasia"),
    razao: t("razao"),
    cnpj: t("cnpj"),
    endereco: t("endereco"),
    email: t("email"),
    telefone: t("telefone"),
    instagram: t("instagram"),
    site: t("site"),
    cidade: t("cidade"),
    uf: ehUf(e.uf) ? (e.uf as string) : null,
    lat: n("lat"),
    lon: n("lon"),
    validadeDias: Math.min(180, Math.max(1, n("validadeDias") ?? 15)),
    condicoes: t("condicoes"),
    fechamento: t("fechamento"),
    freelaVeCliente: e.freelaVeCliente !== false,
  };
}

/**
 * Nome, CNPJ, contato e endereço moram na marca (drizzle/0011); o que estiver lá vale sobre o antigo de
 * `settings.empresa`. Logo, cor e assinatura também vêm dela.
 */
export function comMarca(e: Empresa, m: Marca): Empresa {
  return {
    ...e,
    fantasia: m.nome ?? e.fantasia,
    cnpj: m.cnpj ?? e.cnpj,
    email: m.email ?? e.email,
    telefone: m.telefone ?? e.telefone,
    endereco: m.endereco ?? e.endereco,
    logo: m.logo,
    cor: m.cor,
    assinatura: m.assinatura,
  };
}

export async function lerEmpresaNaTx(tx: Tx, orgId: string): Promise<Empresa & { nomeOrg: string }> {
  const [o] = (await tx.execute(sql`select name, settings from maestro.organizations where id = ${orgId}`)) as unknown as {
    name: string;
    settings: unknown;
  }[];
  return { ...comMarca(lerEmpresaDe(o?.settings), await lerMarcaNaTx(tx, orgId)), nomeOrg: o?.name ?? "" };
}

export async function lerEmpresa(ctx: Contexto): Promise<Empresa & { nomeOrg: string }> {
  return getBanco().asUser(ctx, (tx) => lerEmpresaNaTx(tx, ctx.orgId));
}

export function validarEmpresa(f: Record<string, unknown>): { ok: true; empresa: Empresa } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const out: Record<string, unknown> = { ...EMPRESA_VAZIA };
  for (const [k, max] of Object.entries(LIMITES)) {
    const v = typeof f[k] === "string" ? (f[k] as string).trim() : "";
    if (v.length > max) erros[k] = `Até ${max} caracteres.`;
    out[k] = v ? v.replace(/\r\n?/g, "\n") : null;
  }
  const uf = String(f.uf ?? "")
    .trim()
    .toUpperCase();
  if (uf && !ehUf(uf)) erros.uf = "Escolha a UF.";
  out.uf = uf || null;
  const dias = Number(f.validadeDias ?? 15);
  if (!Number.isInteger(dias) || dias < 1 || dias > 180) erros.validadeDias = "Entre 1 e 180 dias.";
  out.validadeDias = dias;
  out.freelaVeCliente = f.freelaVeCliente !== "nao" && f.freelaVeCliente !== false;
  for (const k of ["lat", "lon"] as const) {
    const v = f[k];
    const n = v === "" || v == null ? null : Number(v);
    out[k] = n != null && Number.isFinite(n) && Math.abs(n) <= (k === "lat" ? 90 : 180) ? n : null;
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, empresa: out as Empresa };
}

/** Grava os dados da empresa (só administração: o banco confere). */
export async function salvarEmpresa(ctx: Contexto, empresa: Empresa): Promise<Res> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        update maestro.organizations set settings = settings || jsonb_build_object('empresa', ${JSON.stringify(empresa)}::jsonb)
         where id = ${ctx.orgId} returning id`);
      if (!r.length) return falha("sem_permissao", "Só a administração muda os dados da empresa.");
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}
