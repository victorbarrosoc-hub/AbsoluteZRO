/**
 * Ajustes → Marca (plano v2 §8, fase 11): ler e gravar a marca da produtora (`maestro.org_marca`) e servir o logo às
 * páginas públicas. A equipe lê e grava como a pessoa (`asUser`: todos leem, só a administração muda; o banco
 * confere). O logo público passa pela porta estreita `maestro.marca_logo(org, sha)` (maestro_app sem organização).
 * Sem "server-only": os testes chamam direto.
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto, type Tx } from "@/lib/db/client";
import { PAPEL_APP } from "@/lib/db/config";
import { falha, traduzirPg, UUID, type Erros, type Res } from "@/lib/crm/comum";
import { conferirCor } from "./cor";
import { prepararLogo } from "./logo";

export type Marca = {
  nome: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  assinatura: string | null;
  cor: string | null;
  /** Endereço do logo (`/api/marca/<org>/<sha>`), ou null. */
  logo: string | null;
  logoLargura: number | null;
  logoAltura: number | null;
};

export const MARCA_VAZIA: Marca = {
  nome: null,
  cnpj: null,
  email: null,
  telefone: null,
  endereco: null,
  assinatura: null,
  cor: null,
  logo: null,
  logoLargura: null,
  logoAltura: null,
};

export const urlDoLogo = (orgId: string, sha: string) => `/api/marca/${orgId}/${sha}`;

/** A marca da organização ativa, dentro de uma transação como a pessoa. */
export async function lerMarcaNaTx(tx: Tx, orgId: string): Promise<Marca> {
  const [m] = (await tx.execute(sql`
    select nome, cnpj, email, telefone, endereco, assinatura, cor, logo_sha256, logo_largura, logo_altura
      from maestro.org_marca where org_id = ${orgId}`)) as unknown as Record<string, string | number | null>[];
  if (!m) return { ...MARCA_VAZIA };
  return {
    nome: m.nome as string | null,
    cnpj: m.cnpj as string | null,
    email: m.email as string | null,
    telefone: m.telefone as string | null,
    endereco: m.endereco as string | null,
    assinatura: m.assinatura as string | null,
    cor: m.cor as string | null,
    logo: m.logo_sha256 ? urlDoLogo(orgId, m.logo_sha256 as string) : null,
    logoLargura: m.logo_largura == null ? null : Number(m.logo_largura),
    logoAltura: m.logo_altura == null ? null : Number(m.logo_altura),
  };
}

export const lerMarca = (ctx: Contexto) => getBanco().asUser(ctx, (tx) => lerMarcaNaTx(tx, ctx.orgId));

export type EntradaMarca = Omit<Marca, "logo" | "logoLargura" | "logoAltura">;

const LIMITES = { nome: 120, cnpj: 20, email: 254, telefone: 30, endereco: 300, assinatura: 200 } as const;

/** Confere o formulário da marca (sem o logo, que tem envio próprio). */
export function validarMarca(f: Record<string, string>): { ok: true; entrada: EntradaMarca } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const out: Record<string, string | null> = {};
  for (const [k, max] of Object.entries(LIMITES)) {
    const v = (f[k] ?? "").replace(/\s+/g, " ").trim();
    if (v.length > max) erros[k] = `Até ${max} caracteres.`;
    out[k] = v || null;
  }
  if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) erros.email = "Confira o e-mail.";
  if (out.cnpj && !/^[0-9./-]{11,20}$/.test(out.cnpj)) erros.cnpj = "Só números, pontos, barra e traço.";
  const c = conferirCor(f.cor);
  if (!c.ok) erros.cor = c.mensagem;
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, entrada: { ...(out as Omit<EntradaMarca, "cor">), cor: c.ok ? c.cor : null } };
}

async function auditar(tx: Tx, ctx: Contexto, acao: string, meta: Record<string, unknown> = {}) {
  await tx.execute(sql`
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (${ctx.orgId}, ${ctx.sub}, ${acao}, 'organization', ${ctx.orgId}, ${JSON.stringify(meta)}::jsonb)`);
}

/** Grava os textos e a cor (só administração: o banco confere). */
export async function salvarMarca(ctx: Contexto, e: EntradaMarca): Promise<Res> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        insert into maestro.org_marca (org_id, nome, cnpj, email, telefone, endereco, assinatura, cor, updated_by)
        values (${ctx.orgId}, ${e.nome}, ${e.cnpj}, ${e.email}, ${e.telefone}, ${e.endereco}, ${e.assinatura}, ${e.cor}, ${ctx.sub})
        on conflict (org_id) do update set nome = excluded.nome, cnpj = excluded.cnpj, email = excluded.email, telefone = excluded.telefone,
               endereco = excluded.endereco, assinatura = excluded.assinatura, cor = excluded.cor, updated_by = excluded.updated_by, demo = false
        returning org_id`);
      if (!r.length) return falha("sem_permissao", "Só a administração muda a marca.");
      await auditar(tx, ctx, "marca.salvou", { cor: e.cor });
      return { ok: true as const };
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

/** Recebe o arquivo, confere e reencoda (src/lib/marca/logo.ts) e grava. */
export async function salvarLogo(ctx: Contexto, arquivo: Uint8Array | ArrayBuffer): Promise<Res<{ logo: string }>> {
  const p = await prepararLogo(arquivo);
  if (!p.ok) return falha(p.erro, p.mensagem);
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        insert into maestro.org_marca (org_id, logo, logo_mime, logo_sha256, logo_largura, logo_altura, updated_by)
        values (${ctx.orgId}, ${p.bytes}, ${p.mime}, ${p.sha256}, ${p.largura}, ${p.altura}, ${ctx.sub})
        on conflict (org_id) do update set logo = excluded.logo, logo_mime = excluded.logo_mime, logo_sha256 = excluded.logo_sha256,
               logo_largura = excluded.logo_largura, logo_altura = excluded.logo_altura, updated_by = excluded.updated_by, demo = false
        returning org_id`);
      if (!r.length) return falha("sem_permissao", "Só a administração muda a marca.");
      await auditar(tx, ctx, "marca.logo", { sha256: p.sha256, bytes: p.bytes.length });
      return { ok: true as const, logo: urlDoLogo(ctx.orgId, p.sha256) };
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

export async function removerLogo(ctx: Contexto): Promise<Res> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        update maestro.org_marca set logo = null, logo_mime = null, logo_sha256 = null, logo_largura = null, logo_altura = null, updated_by = ${ctx.sub}
         where org_id = ${ctx.orgId} returning org_id`);
      if (!r.length) return falha("sem_permissao", "Só a administração muda a marca.");
      await auditar(tx, ctx, "marca.tirou_logo");
      return { ok: true as const };
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

/** O logo para a rota pública: só com a organização e o sha256 certos. */
export async function lerLogoPublico(orgId: string, sha: string): Promise<{ mime: string; bytes: Buffer } | null> {
  if (!UUID.test(orgId) || !/^[0-9a-f]{64}$/.test(sha)) return null;
  return getBanco().asSystem("logo da marca (porta estreita)", async (tx) => {
    await tx.execute(sql.raw(`set local role ${PAPEL_APP}`));
    const [r] = (await tx.execute(sql`select mime, logo from maestro.marca_logo(${orgId}::uuid, ${sha})`)) as unknown as { mime: string; logo: Buffer }[];
    return r ? { mime: r.mime, bytes: Buffer.from(r.logo) } : null;
  });
}
