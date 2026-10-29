/**
 * Contrato do lado da equipe (asUser; o banco confere, drizzle/0020): o modelo da produtora em versões (só inclusão;
 * administração escreve, gestão lê), "Enviar contrato junto" por orçamento (administração e gestão) e os contratos
 * aceitos (registro imutável, só administração e gestão leem), com a conferência do hash na hora de mostrar.
 * Sem "server-only": os testes chamam direto.
 */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getBanco, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Res } from "@/lib/crm/comum";
import { CONFIG_PADRAO, lerConfig, MODELO_PADRAO, validarConfig, validarTexto, type ConfigContrato } from "./modelo";

export const hashDoHtml = (html: string) => createHash("sha256").update(html, "utf8").digest("hex");

export type ModeloVigente = {
  /** 0 = o modelo base do Maestro (a produtora ainda não salvou nenhum). */
  versao: number;
  texto: string;
  config: ConfigContrato;
  padrao: boolean;
  em: string | null;
};

export const MODELO_BASE: ModeloVigente = { versao: 0, texto: MODELO_PADRAO, config: { ...CONFIG_PADRAO }, padrao: true, em: null };

/** O modelo vigente a partir do que o banco devolveu (`null` = o base). Puro. */
export function modeloDe(m: { versao: number; texto: string; config: unknown } | null | undefined): ModeloVigente {
  if (!m) return { ...MODELO_BASE, config: { ...CONFIG_PADRAO } };
  return { versao: Number(m.versao), texto: m.texto, config: lerConfig(m.config), padrao: false, em: null };
}

async function vigenteNaTx(tx: Tx): Promise<ModeloVigente> {
  const [m] = (await tx.execute(sql`
    select versao, texto, config, padrao, created_at from maestro.contrato_modelos order by versao desc limit 1`)) as unknown as {
    versao: number;
    texto: string;
    config: unknown;
    padrao: boolean;
    created_at: string;
  }[];
  if (!m) return { ...MODELO_BASE, config: { ...CONFIG_PADRAO } };
  return { ...modeloDe(m), padrao: m.padrao, em: new Date(m.created_at).toISOString() };
}

export const lerModeloVigente = (ctx: Contexto) => getBanco().asUser(ctx, vigenteNaTx);

export type VersaoDoModelo = { versao: number; padrao: boolean; em: string; quem: string | null };

export async function listarVersoes(ctx: Contexto): Promise<VersaoDoModelo[]> {
  return getBanco().asUser(ctx, async (tx) => {
    const r = (await tx.execute(sql`
      select m.versao, m.padrao, m.created_at, coalesce(p.display_name, p.email) as quem
        from maestro.contrato_modelos m left join maestro.members p on p.org_id = m.org_id and p.zro_sub = m.created_by
       order by m.versao desc limit 30`)) as unknown as { versao: number; padrao: boolean; created_at: string; quem: string | null }[];
    return r.map((v) => ({ versao: Number(v.versao), padrao: v.padrao, em: new Date(v.created_at).toISOString(), quem: v.quem }));
  });
}

async function gravarVersao(tx: Tx, ctx: Contexto, texto: string, config: ConfigContrato, padrao: boolean): Promise<Res<{ versao: number }>> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`maestro:contrato:${ctx.orgId}`}))`);
  const [atual] = (await tx.execute(sql`select texto, config from maestro.contrato_modelos order by versao desc limit 1`)) as unknown as {
    texto: string;
    config: unknown;
  }[];
  const [{ v }] = (await tx.execute(sql`select coalesce(max(versao), 0)::int as v from maestro.contrato_modelos`)) as unknown as { v: number }[];
  if (atual && atual.texto === texto && JSON.stringify(lerConfig(atual.config)) === JSON.stringify(config)) return { ok: true as const, versao: Number(v) };
  const r = await tx.execute(sql`
    insert into maestro.contrato_modelos (org_id, versao, texto, config, padrao, created_by)
    values (${ctx.orgId}, ${Number(v) + 1}, ${texto}, ${JSON.stringify(config)}::jsonb, ${padrao}, ${ctx.sub})
    returning versao`);
  if (!r.length) return falha("sem_permissao", "Só a administração muda o contrato.");
  await tx.execute(sql`
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (${ctx.orgId}, ${ctx.sub}, ${padrao ? "contrato.restaurou" : "contrato.salvou"}, 'organization', ${ctx.orgId},
            ${JSON.stringify({ versao: Number(v) + 1 })}::jsonb)`);
  return { ok: true as const, versao: Number(v) + 1 };
}

/** Salva o modelo como versão nova (igual ao vigente = nada muda). Só administração (o banco confere). */
export async function salvarModelo(ctx: Contexto, texto: string, config: Record<string, unknown>): Promise<Res<{ versao: number }>> {
  const t = validarTexto(texto);
  if (!t.ok) return falha("texto", t.mensagem, { texto: t.mensagem });
  const c = validarConfig(config);
  if (!c.ok) return falha("config", "Confira os números do contrato.", c.erros);
  try {
    return await getBanco().asUser(ctx, (tx) => gravarVersao(tx, ctx, t.texto, c.config, false));
  } catch (e) {
    return traduzirPg(e);
  }
}

/** Volta ao modelo base do Maestro (também como versão nova: o histórico fica). */
export async function restaurarPadrao(ctx: Contexto): Promise<Res<{ versao: number }>> {
  try {
    return await getBanco().asUser(ctx, (tx) => gravarVersao(tx, ctx, MODELO_PADRAO.trim(), { ...CONFIG_PADRAO }, true));
  } catch (e) {
    return traduzirPg(e);
  }
}

/** Liga ou desliga "Enviar contrato junto" (rascunho ou enviado; administração e gestão). */
export async function ligarContrato(ctx: Contexto, orcamentoId: string, ligar: boolean): Promise<Res> {
  if (!ehUuid(orcamentoId)) return falha("nao_existe", "Esse orçamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`
        update maestro.orcamentos set contrato = ${ligar}
         where id = ${orcamentoId} and status in ('rascunho', 'enviado') and maestro.has_role(org_id, array['admin', 'gestor'])
        returning id`);
      if (!r.length) return falha("status", "Só administração e gestão, e só em rascunho ou enviado.");
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
        values (${ctx.orgId}, ${ctx.sub}, 'orcamento.contrato', 'orcamento', ${orcamentoId}, ${JSON.stringify({ ligado: ligar })}::jsonb)`);
      return { ok: true as const };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

/* ───────────── contratos aceitos ───────────── */

export type ContratoAceito = {
  id: string;
  orcamentoId: string;
  orcamentoCodigo: string;
  clienteId: string | null;
  clienteNome: string | null;
  projetoId: string | null;
  projetoCodigo: string | null;
  modeloVersao: number;
  html: string;
  hash: string;
  /** O sha256 do HTML gravado bate com o hash gravado (conferido agora). */
  conferido: boolean;
  nome: string;
  documento: string;
  endereco: string;
  portfolio: boolean;
  aceitoEm: string;
  ipRegistrado: boolean;
  navegador: string | null;
  demo: boolean;
};

type Linha = Record<string, unknown>;

function deLinha(c: Linha): ContratoAceito {
  const html = c.html as string;
  return {
    id: c.id as string,
    orcamentoId: c.orcamento_id as string,
    orcamentoCodigo: `${c.numero as string} v${Number(c.versao)}`,
    clienteId: (c.cliente_id as string) ?? null,
    clienteNome: (c.cliente_nome as string) ?? null,
    projetoId: (c.projeto_id as string) ?? null,
    projetoCodigo: (c.projeto_codigo as string) ?? null,
    modeloVersao: Number(c.modelo_versao),
    html,
    hash: c.hash as string,
    conferido: hashDoHtml(html) === c.hash,
    nome: c.nome as string,
    documento: c.documento as string,
    endereco: c.endereco as string,
    portfolio: !!c.portfolio,
    aceitoEm: new Date(c.aceito_em as string).toISOString(),
    ipRegistrado: !!c.ip_hash,
    navegador: (c.user_agent as string) ?? null,
    demo: !!c.demo,
  };
}

const SELECAO = sql`
  select c.*, q.numero, q.versao, cl.name as cliente_nome, p.code as projeto_codigo
    from maestro.contratos c
    join maestro.orcamentos q on q.id = c.orcamento_id
    left join maestro.clients cl on cl.id = c.cliente_id
    left join maestro.projects p on p.id = c.projeto_id`;

export async function lerContrato(ctx: Contexto, id: string): Promise<ContratoAceito | null> {
  if (!ehUuid(id)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [c] = (await tx.execute(sql`${SELECAO} where c.id = ${id}`)) as unknown as Linha[];
    return c ? deLinha(c) : null;
  });
}

export type ResumoContrato = { id: string; orcamentoCodigo: string; nome: string; aceitoEm: string };

/** Os contratos aceitos de um projeto, cliente ou orçamento (vazio para quem não lê: o RLS esconde). */
export async function contratosDe(ctx: Contexto, de: { projetoId?: string; clienteId?: string; orcamentoId?: string }): Promise<ResumoContrato[]> {
  const [campo, valor] = de.projetoId ? ["projeto_id", de.projetoId] : de.clienteId ? ["cliente_id", de.clienteId] : ["orcamento_id", de.orcamentoId];
  if (!ehUuid(valor)) return [];
  return getBanco().asUser(ctx, async (tx) => {
    const r = (await tx.execute(sql`${SELECAO} where ${sql.raw(`c.${campo}`)} = ${valor} order by c.aceito_em desc`)) as unknown as Linha[];
    return r.map((c) => ({
      id: c.id as string,
      orcamentoCodigo: `${c.numero as string} v${Number(c.versao)}`,
      nome: c.nome as string,
      aceitoEm: new Date(c.aceito_em as string).toISOString(),
    }));
  });
}
