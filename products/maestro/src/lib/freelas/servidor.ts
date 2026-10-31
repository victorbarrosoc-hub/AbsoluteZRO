/**
 * Banco de freelas e escala (porte de freelancers/freelancer_rates/project_crew/event_crew do ZRO). Sempre como a
 * pessoa (`asUser`, RLS). A escala vira "a pagar" no Financeiro pelo gatilho do banco (drizzle/0008). Por área
 * (src/lib/acessos.ts, lida no banco por `maestro.pode` na mesma transação): diárias e cachês só com "Diárias";
 * e-mail, WhatsApp, CPF e PIX só com "Dados da equipe"; o status pago/pendente só com "Financeiro".
 */
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, PG, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, padraoBusca, traduzirPg, type Erros, type Res } from "@/lib/crm/comum";
import { ehData, lerReais } from "@/lib/dinheiro";
import { areasNaTx } from "@/lib/acessos-servidor";
import { statusDe, type Status } from "@/lib/financeiro/contas";
import { diasDoPeriodo, normalizarFuncao, UNIDADES_VALOR, type UnidadeValor } from "./funcoes";
import { abrirCampo, cifrarCampo, lerDocumento, lerPix, type TipoPix } from "./pagamento";
import { desligarNaTx, ligarNaTx } from "./convite-servidor";
import type { PessoaZro } from "@/lib/zro/pessoas";

/** A conta Absolute ZRO no salvar: ligar à pessoa do @ (perfil relido no HUB pelo servidor) ou desligar. */
export type ContaNoSalvar = { pessoa: PessoaZro } | { desligar: true };

/* ───────────── lista e ficha ───────────── */

export type FreelaLista = {
  id: string;
  nome: string;
  cidade: string | null;
  funcoes: string[];
  ativo: boolean;
  diaria: number | null;
  escalas: number;
  /** Itens ativos do kit próprio (drizzle/0013). */
  equipamentos: number;
};

/** `equip`: "sim" = tem equipamento próprio; uma categoria (camera, drone…) = tem dessa categoria. */
export async function listarFreelas(ctx: Contexto, o: { busca?: string; funcao?: string; inativos?: boolean; equip?: string } = {}): Promise<FreelaLista[]> {
  const busca = o.busca?.trim().slice(0, 100);
  return getBanco().asUser(ctx, async (tx) => {
    const r = await tx.execute(sql`
      select f.id, f.nome, f.cidade, f.funcoes, f.ativo,
             -- freela_valores já é da área "Diárias" no RLS: sem ela, a subconsulta volta vazia.
             (select min(v.valor_cents)::float8 from maestro.freela_valores v where v.freela_id = f.id and v.unidade = 'diaria') as diaria,
             (select count(*)::int from maestro.escalas e where e.freela_id = f.id) as escalas,
             (select count(*)::int from maestro.freela_equipamentos q where q.freela_id = f.id and q.ativo) as equipamentos
        from maestro.freelas f
       where true
         ${o.equip === "sim" ? sql`and exists (select 1 from maestro.freela_equipamentos q where q.freela_id = f.id and q.ativo)` : sql``}
         ${o.equip && o.equip !== "sim" ? sql`and exists (select 1 from maestro.freela_equipamentos q where q.freela_id = f.id and q.ativo and q.categoria = ${o.equip})` : sql``}
         ${o.inativos ? sql`` : sql`and f.ativo`}
         ${o.funcao ? sql`and ${o.funcao} = any (f.funcoes)` : sql``}
         ${busca ? sql`and (f.nome ilike ${padraoBusca(busca)} or f.cidade ilike ${padraoBusca(busca)} or array_to_string(f.funcoes, ' ') ilike ${padraoBusca(busca)})` : sql``}
       order by f.ativo desc, f.nome
       limit 500`);
    return r as unknown as FreelaLista[];
  });
}

export type Valor = { funcao: string; unidade: UnidadeValor; valorCents: number };
export type EscalaDoFreela = {
  id: string;
  projetoId: string | null;
  projeto: string | null;
  projetoCodigo: string | null;
  evento: string | null;
  funcao: string;
  inicio: string;
  fim: string;
  dias: number;
  /** null = a pessoa não tem a área "Diárias e cachês". */
  valorCents: number | null;
  /** Só com a área Financeiro. */
  pagamento: { status: Status; pagoCents: number; lancamentoId: string } | null;
};
export type DadosPagamento = { documento: string | null; pixTipo: TipoPix | null; pix: string | null; titular: string | null; ilegivel: boolean };
export type FreelaFicha = {
  id: string;
  nome: string;
  cidade: string | null;
  email: string | null;
  whatsapp: string | null;
  instagram: string | null;
  /** O @ na Absolute ZRO quando o freela foi achado pela busca de pessoas (drizzle/0022). */
  zroArroba: string | null;
  funcoes: string[];
  nichos: string[];
  whatsappMsg: string | null;
  notas: string | null;
  ativo: boolean;
  valores: Valor[];
  escalas: EscalaDoFreela[];
  equipamentos: { id: string; nome: string; categoria: string }[];
  /** undefined = a pessoa não tem a área "Dados da equipe"; null = sem cadastro. */
  dadosPagamento?: DadosPagamento | null;
  /** O que a pessoa vê nesta ficha (a tela esconde o resto; os campos já vêm vazios). */
  ve: { diarias: boolean; dados: boolean; financeiro: boolean };
};

export async function obterFreela(ctx: Contexto, id: string, hoje: string): Promise<FreelaFicha | null> {
  if (!ehUuid(id)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const [f] = (await tx.execute(sql`select * from maestro.freelas where id = ${id}`)) as unknown as Record<string, unknown>[];
    if (!f) return null;
    const a = await areasNaTx(tx, ctx.orgId);
    const dinheiro = a.financeiro;
    const dados = a.dados_equipe;
    const valores = (await tx.execute(sql`
      select funcao, unidade, valor_cents::float8 as "valorCents" from maestro.freela_valores where freela_id = ${id} order by funcao, unidade`)) as unknown as Valor[];
    const escalas = (await tx.execute(sql`
      select e.id, e.projeto_id as "projetoId", p.title as projeto, p.code as "projetoCodigo", ev.titulo as evento, e.funcao, e.inicio::text, e.fim::text, e.dias,
             case when maestro.pode(e.org_id, 'diarias') then e.valor_cents::float8 end as "valorCents"
        from maestro.escalas e
        left join maestro.projects p on p.id = e.projeto_id
        left join maestro.eventos ev on ev.id = e.evento_id
       where e.freela_id = ${id} order by e.inicio desc limit 200`)) as unknown as Omit<EscalaDoFreela, "pagamento">[];
    const pagos = dinheiro
      ? ((await tx.execute(sql`
          select id, escala_id, valor_cents::float8 as v, pago_cents::float8 as p, vencimento::text as d from maestro.lancamentos where freela_id = ${id} and escala_id is not null`)) as unknown as {
          id: string;
          escala_id: string;
          v: number;
          p: number;
          d: string;
        }[])
      : [];
    const equipamentos = (await tx.execute(sql`
      select id, nome, categoria from maestro.equipamentos where freela_id = ${id} order by categoria, nome`)) as unknown as FreelaFicha["equipamentos"];
    let dadosPagamento: DadosPagamento | null | undefined;
    if (dados) {
      const [pg] = (await tx.execute(sql`select * from maestro.freela_pagamento where freela_id = ${id}`)) as unknown as Record<string, string | null>[];
      if (pg) {
        const d = abrirCampo(ctx.orgId, id, "documento", pg.documento_enc);
        const p = abrirCampo(ctx.orgId, id, "pix", pg.pix_enc);
        dadosPagamento = { documento: d.valor, pix: p.valor, pixTipo: pg.pix_tipo as TipoPix | null, titular: pg.titular, ilegivel: d.ilegivel || p.ilegivel };
      } else dadosPagamento = null;
    }
    return {
      id,
      nome: f.nome as string,
      cidade: f.cidade as string | null,
      email: dados ? (f.email as string | null) : null,
      whatsapp: dados ? (f.whatsapp as string | null) : null,
      instagram: f.instagram as string | null,
      zroArroba: (f.zro_arroba as string | null) ?? null,
      funcoes: (f.funcoes as string[]) ?? [],
      nichos: (f.nichos as string[]) ?? [],
      whatsappMsg: f.whatsapp_msg as string | null,
      notas: f.notas as string | null,
      ativo: f.ativo as boolean,
      valores: [...valores],
      escalas: escalas.map((e) => {
        const l = pagos.find((x) => x.escala_id === e.id);
        return {
          ...e,
          pagamento: l ? { status: statusDe({ valorCents: l.v, pagoCents: l.p, vencimento: l.d }, hoje), pagoCents: l.p, lancamentoId: l.id } : null,
        };
      }),
      equipamentos: [...equipamentos],
      ...(dados ? { dadosPagamento } : {}),
      ve: { diarias: a.diarias, dados, financeiro: dinheiro },
    };
  });
}

/* ───────────── escrever o freela ───────────── */

export type EntradaFreela = {
  nome: string;
  cidade: string | null;
  email: string | null;
  whatsapp: string | null;
  instagram: string | null;
  funcoes: string[];
  nichos: string[];
  whatsappMsg: string | null;
  notas: string | null;
  ativo: boolean;
  valores: Valor[];
};

/** Valores em texto, um por linha: "Edição: 450,00 por diária" (sem unidade = por diária). */
export function lerValores(texto: string, existentes: string[] = []): Valor[] | null {
  const out: Valor[] = [];
  for (const l of texto
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)) {
    const m = l.match(/^(.+?)\s*[:=]\s*(?:R\$\s*)?([\d.,]+)\s*(?:por\s+)?(di[aá]ria|projeto|v[ií]deo)?\s*$/i);
    if (!m) return null;
    const funcao = normalizarFuncao(m[1], existentes);
    const valor = lerReais(m[2]);
    const u = (m[3] ?? "diaria")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (!funcao || valor == null || !(valor >= 0) || !UNIDADES_VALOR.some((x) => x.k === u)) return null;
    out.push({ funcao, unidade: u as UnidadeValor, valorCents: valor });
  }
  const chaves = new Set(out.map((v) => `${v.funcao}|${v.unidade}`));
  return chaves.size === out.length && out.length <= 30 ? out : null;
}

const lista = (s: string | undefined, max: number) =>
  [
    ...new Set(
      (s ?? "")
        .split(/[,;\n]/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ].slice(0, max);

export function validarFreela(f: Record<string, string>): { ok: true; entrada: EntradaFreela } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const t = (k: string, max: number) => {
    const v = (f[k] ?? "").trim();
    if (v.length > max) erros[k] = `Até ${max} caracteres.`;
    return v || null;
  };
  const nome = t("nome", 120);
  if (!nome) erros.nome = "Qual o nome?";
  const email = t("email", 254);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) erros.email = "E-mail inválido.";
  const wpp = (f.whatsapp ?? "").replace(/\D/g, "");
  if (wpp && (wpp.length < 8 || wpp.length > 15)) erros.whatsapp = "Número com DDD.";
  const funcoes = lista(f.funcoes, 20)
    .map((x) => normalizarFuncao(x))
    .filter((x): x is string => !!x);
  const valores = lerValores(f.valores ?? "", funcoes);
  if (!valores) erros.valores = "Um por linha, assim: Edição: 450,00 por diária";
  const entrada: EntradaFreela = {
    nome: nome ?? "",
    cidade: t("cidade", 120),
    email: email?.toLowerCase() ?? null,
    whatsapp: wpp ? (wpp.length <= 11 ? `55${wpp}` : wpp) : null,
    instagram: t("instagram", 60)?.replace(/^@/, "") ?? null,
    funcoes: [...new Set([...funcoes, ...(valores ?? []).map((v) => v.funcao)])].slice(0, 20),
    nichos: lista(f.nichos, 20).map((x) => x.slice(0, 40)),
    whatsappMsg: t("whatsappMsg", 500),
    notas: t("notas", 4000),
    ativo: f.ativo !== "nao",
    valores: valores ?? [],
  };
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, entrada };
}

export async function salvarFreela(ctx: Contexto, e: EntradaFreela, id?: string, demo = false, conta?: ContaNoSalvar): Promise<Res<{ id: string }>> {
  if (id && !ehUuid(id)) return falha("nao_existe", "Esse freela não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await gravarFreela(tx, ctx, e, id, demo);
      if (!r.ok || !conta) return r;
      if ("desligar" in conta) {
        await desligarNaTx(tx, ctx, r.id);
        return r;
      }
      const l = await ligarNaTx(tx, ctx, r.id, conta.pessoa);
      // a conta já é de outro freela: nada do salvar fica (a tela mostra o erro no campo do @)
      if (!l.ok) throw new ContaEmOutro(l.mensagem);
      return r;
    });
  } catch (err) {
    if (err instanceof ContaEmOutro) return falha("conta_em_outro", err.message, { zro_arroba: err.message });
    return traduzirPg(err);
  }
}

class ContaEmOutro extends Error {}

export async function gravarFreela(tx: Tx, ctx: Contexto, e: EntradaFreela, id?: string, demo = false): Promise<Res<{ id: string }>> {
  const arr = (a: string[]) => sql`${`{${a.map((x) => `"${x.replace(/["\\]/g, "")}"`).join(",")}}`}::text[]`;
  let freelaId = id;
  if (id) {
    const r = await tx.execute(sql`
      update maestro.freelas set nome = ${e.nome}, cidade = ${e.cidade}, email = ${e.email}, whatsapp = ${e.whatsapp}, instagram = ${e.instagram},
             funcoes = ${arr(e.funcoes)}, nichos = ${arr(e.nichos)}, whatsapp_msg = ${e.whatsappMsg}, notas = ${e.notas}, ativo = ${e.ativo}
       where id = ${id} returning id`);
    if (!r.length) return falha("sem_permissao", "Seu papel nesta organização só lê.");
  } else {
    const [r] = (await tx.execute(sql`
      insert into maestro.freelas (org_id, nome, cidade, email, whatsapp, instagram, funcoes, nichos, whatsapp_msg, notas, ativo, demo)
      values (${ctx.orgId}, ${e.nome}, ${e.cidade}, ${e.email}, ${e.whatsapp}, ${e.instagram}, ${arr(e.funcoes)}, ${arr(e.nichos)}, ${e.whatsappMsg},
              ${e.notas}, ${e.ativo}, ${demo})
      returning id`)) as unknown as { id: string }[];
    freelaId = r.id;
  }
  // Diárias e cachês só para quem tem a área (o RLS também barra): sem ela, o cadastro de valores fica como estava.
  const [{ ve }] = (await tx.execute(sql`select maestro.pode(${ctx.orgId}::uuid, 'diarias') as ve`)) as unknown as { ve: boolean }[];
  if (!ve) return { ok: true as const, id: freelaId! };
  if (id) await tx.execute(sql`delete from maestro.freela_valores where freela_id = ${id}`);
  for (const v of e.valores) {
    await tx.execute(sql`
      insert into maestro.freela_valores (org_id, freela_id, funcao, unidade, valor_cents) values (${ctx.orgId}, ${freelaId}, ${v.funcao}, ${v.unidade}, ${v.valorCents})`);
  }
  return { ok: true as const, id: freelaId! };
}

export async function removerFreela(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse freela não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.freelas where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", "Só administração e gestão removem freelas.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

/* ───────────── dados de pagamento (só administração e gestão) ───────────── */

export type EntradaPagamento = { documento: string | null; pixTipo: TipoPix | null; pix: string | null; titular: string | null };

export function validarPagamento(f: Record<string, string>): { ok: true; entrada: EntradaPagamento } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const documento = lerDocumento(f.documento);
  if (documento === undefined) erros.documento = "CPF ou CNPJ inválido.";
  const pix = lerPix(f.pixTipo, f.pix);
  if (pix === undefined) erros.pix = "Chave PIX não confere com o tipo.";
  const titular = (f.titular ?? "").trim();
  if (titular.length > 120) erros.titular = "Até 120 caracteres.";
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, entrada: { documento: documento ?? null, pixTipo: pix?.tipo ?? null, pix: pix?.chave ?? null, titular: titular || null } };
}

export async function salvarPagamento(ctx: Contexto, freelaId: string, e: EntradaPagamento): Promise<Res> {
  if (!ehUuid(freelaId)) return falha("nao_existe", "Esse freela não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const doc = e.documento ? cifrarCampo(ctx.orgId, freelaId, "documento", e.documento) : null;
      const pix = e.pix ? cifrarCampo(ctx.orgId, freelaId, "pix", e.pix) : null;
      await tx.execute(sql`
        insert into maestro.freela_pagamento (org_id, freela_id, documento_enc, pix_enc, pix_tipo, titular, updated_by)
        values (${ctx.orgId}, ${freelaId}, ${doc}, ${pix}, ${e.pixTipo}, ${e.titular}, ${ctx.sub})
        on conflict (org_id, freela_id) do update set documento_enc = excluded.documento_enc, pix_enc = excluded.pix_enc, pix_tipo = excluded.pix_tipo,
           titular = excluded.titular, updated_by = excluded.updated_by`);
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id) values (${ctx.orgId}, ${ctx.sub}, 'freela.pagamento', 'freela', ${freelaId})`);
      return { ok: true as const };
    });
  } catch (err) {
    const f = traduzirPg(err);
    return f.erro === "sem_permissao" ? falha("sem_permissao", "Só administração e gestão veem e mudam dados de pagamento.") : f;
  }
}

/* ───────────── escala ───────────── */

export type EntradaEscala = {
  projetoId: string | null;
  eventoId: string | null;
  freelaId: string;
  funcao: string;
  inicio: string;
  fim: string;
  /** Diária: o total é diária × dias. Sem diária, `valorCents` é o total (por projeto). */
  diariaCents: number | null;
  valorCents: number | null;
  notas: string | null;
};

export function validarEscala(f: Record<string, string>): { ok: true; entrada: EntradaEscala } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  if (!ehUuid(f.freela)) erros.freela = "Escolha o freela.";
  const funcao = normalizarFuncao(f.funcao ?? "");
  if (!funcao) erros.funcao = "Qual a função?";
  if (!ehData(f.inicio)) erros.inicio = "Escolha a data.";
  const fim = f.fim || f.inicio;
  if (!ehData(fim) || fim < f.inicio) erros.fim = "O fim vem depois do início.";
  const modo = f.modo === "total" ? "total" : "diaria";
  const v = lerReais(f.valor);
  if (v == null || !(v >= 0)) erros.valor = "Valor inválido.";
  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    entrada: {
      projetoId: ehUuid(f.projeto) ? f.projeto : null,
      eventoId: ehUuid(f.evento) ? f.evento : null,
      freelaId: f.freela,
      funcao: funcao!,
      inicio: f.inicio,
      fim,
      diariaCents: modo === "diaria" ? v! : null,
      valorCents: modo === "total" ? v! : null,
      notas: (f.notas ?? "").trim().slice(0, 1000) || null,
    },
  };
}

export async function gravarEscala(tx: Tx, ctx: Contexto, e: EntradaEscala, id?: string, demo = false): Promise<{ id: string }> {
  const dias = diasDoPeriodo(e.inicio, e.fim);
  const total = e.diariaCents != null ? e.diariaCents * dias : (e.valorCents ?? 0);
  if (id) {
    await tx.execute(sql`
      update maestro.escalas set projeto_id = ${e.projetoId}, evento_id = ${e.eventoId}, freela_id = ${e.freelaId}, funcao = ${e.funcao}, inicio = ${e.inicio},
             fim = ${e.fim}, dias = ${dias}, diaria_cents = ${e.diariaCents}, valor_cents = ${total}, notas = ${e.notas}
       where id = ${id}`);
    return { id };
  }
  const [r] = (await tx.execute(sql`
    insert into maestro.escalas (org_id, projeto_id, evento_id, freela_id, funcao, inicio, fim, dias, diaria_cents, valor_cents, origem, notas, demo, created_by)
    values (${ctx.orgId}, ${e.projetoId}, ${e.eventoId}, ${e.freelaId}, ${e.funcao}, ${e.inicio}, ${e.fim}, ${dias}, ${e.diariaCents}, ${total},
            ${e.eventoId ? "agenda" : "manual"}, ${e.notas}, ${demo}, ${ctx.sub})
    returning id`)) as unknown as { id: string }[];
  return r;
}

export async function salvarEscala(ctx: Contexto, e: EntradaEscala, id?: string): Promise<Res<{ id: string }>> {
  if (id && !ehUuid(id)) return falha("nao_existe", "Essa escala não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => ({ ok: true as const, ...(await gravarEscala(tx, ctx, e, id)) }));
  } catch (err) {
    if (codigoPg(err) === PG.unicidade) return falha("repetida", "Essa pessoa já está nessa diária.");
    if (codigoPg(err) === PG.chaveEstrangeira) return falha("vinculo", "Escolha o freela e o projeto da lista.");
    return traduzirPg(err);
  }
}

export async function removerEscala(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Essa escala não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.escalas where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", "Seu papel nesta organização só lê.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

export type EscalaDoProjeto = {
  id: string;
  freelaId: string;
  freela: string;
  funcao: string;
  inicio: string;
  fim: string;
  dias: number;
  /** null = sem a área "Diárias e cachês" (ou escala por total, no caso da diária). */
  diariaCents: number | null;
  valorCents: number | null;
  evento: string | null;
  conflitos: { titulo: string; inicio: string }[];
  pagamento: { status: Status; pagoCents: number } | null;
  /** O freela tem a conta Absolute ZRO ligada: vê o trabalho em "Seus trabalhos" (drizzle/0037). */
  conta: boolean;
  /** A resposta do freela para as datas de hoje da escala (mudou a data, volta a null). */
  resposta: "confirmado" | "recusado" | null;
  paraFreela: string | null;
  entregaUrl: string | null;
};

/** Quem está escalado em outra escala que se cruza com o período (o aviso de conflito de agenda do ZRO). */
async function conflitos(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, { titulo: string; inicio: string }[]>();
  const r = (await tx.execute(sql`
    select a.id, coalesce(ev.titulo, p.title, 'Outra escala') as titulo, b.inicio::text as inicio
      from maestro.escalas a
      join maestro.escalas b on b.freela_id = a.freela_id and b.id <> a.id and b.inicio <= a.fim and a.inicio <= b.fim
      left join maestro.eventos ev on ev.id = b.evento_id
      left join maestro.projects p on p.id = b.projeto_id
     where a.id = any (${`{${ids.join(",")}}`}::uuid[])
       and (b.projeto_id is distinct from a.projeto_id or b.evento_id is distinct from a.evento_id)
     order by b.inicio`)) as unknown as { id: string; titulo: string; inicio: string }[];
  const m = new Map<string, { titulo: string; inicio: string }[]>();
  for (const x of r) m.set(x.id, [...(m.get(x.id) ?? []), { titulo: x.titulo, inicio: x.inicio }]);
  return m;
}

export async function escalasDoProjeto(ctx: Contexto, projetoId: string, hoje: string): Promise<EscalaDoProjeto[]> {
  if (!ehUuid(projetoId)) return [];
  return getBanco().asUser(ctx, async (tx) => {
    const r = (await tx.execute(sql`
      select e.id, e.freela_id as "freelaId", f.nome as freela, e.funcao, e.inicio::text, e.fim::text, e.dias,
             case when maestro.pode(e.org_id, 'diarias') then e.diaria_cents::float8 end as "diariaCents",
             case when maestro.pode(e.org_id, 'diarias') then e.valor_cents::float8 end as "valorCents", ev.titulo as evento,
             f.zro_sub is not null as conta, case when r.inicio = e.inicio and r.fim = e.fim then r.resposta end as resposta,
             e.para_freela as "paraFreela", e.entrega_url as "entregaUrl"
        from maestro.escalas e join maestro.freelas f on f.id = e.freela_id
        left join maestro.eventos ev on ev.id = e.evento_id
        left join maestro.escala_respostas r on r.org_id = e.org_id and r.escala_id = e.id
       where e.projeto_id = ${projetoId} order by e.inicio, f.nome`)) as unknown as Omit<EscalaDoProjeto, "conflitos" | "pagamento">[];
    const c = await conflitos(
      tx,
      r.map((x) => x.id),
    );
    const pagos = (await areasNaTx(tx, ctx.orgId)).financeiro
      ? ((await tx.execute(sql`
          select escala_id, valor_cents::float8 as v, pago_cents::float8 as p, vencimento::text as d from maestro.lancamentos where projeto_id = ${projetoId} and escala_id is not null`)) as unknown as {
          escala_id: string;
          v: number;
          p: number;
          d: string;
        }[])
      : [];
    return r.map((x) => {
      const l = pagos.find((p) => p.escala_id === x.id);
      return {
        ...x,
        conflitos: c.get(x.id) ?? [],
        pagamento: l ? { status: statusDe({ valorCents: l.v, pagoCents: l.p, vencimento: l.d }, hoje), pagoCents: l.p } : null,
      };
    });
  });
}

export { conflitos as conflitosDeEscala };

/* ───────────── o que o freela vê (drizzle/0037) ───────────── */

export type ParaFreela = { recado: string | null; entrega: string | null };

/** O recado da produção e o link de entrega da escala: o freela vê os dois em "Seus trabalhos". */
export function validarParaFreela(f: Record<string, string>): { ok: true; entrada: ParaFreela } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const recado = (f.recado ?? "").replace(/\r\n?/g, "\n").trim();
  if (recado.length > 2000) erros.recado = "Até 2.000 caracteres.";
  const entrega = (f.entrega ?? "").trim();
  if (entrega) {
    let ok = false;
    try {
      ok = new URL(entrega).protocol === "https:" && entrega.length <= 1000 && !/\s/.test(entrega);
    } catch {
      ok = false;
    }
    if (!ok) erros.entrega = "Cole um link que comece com https://";
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, entrada: { recado: recado || null, entrega: entrega || null } };
}

export async function salvarParaFreela(ctx: Contexto, id: string, e: ParaFreela): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Essa escala não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`update maestro.escalas set para_freela = ${e.recado}, entrega_url = ${e.entrega} where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", "Seu papel nesta organização só lê.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}
