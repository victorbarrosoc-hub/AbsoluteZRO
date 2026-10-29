/**
 * Orçamentos (porte de quotes/quote_items e das ações de src/app/(painel)/painel/orcamentos do ZRO): número AAAA-NNN
 * por organização, versões, editor (só em rascunho), enviar/recusar/voltar, nova versão e aprovar, que abre o projeto e
 * lança as parcelas a receber no Financeiro, tudo numa transação e idempotente. Sempre como a pessoa (`asUser`, RLS).
 */
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, PG, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, padraoBusca, traduzirPg, type Res } from "@/lib/crm/comum";
import { proximoCodigo } from "@/lib/crm/projetos";
import { ehData, hojeBr, somarDias } from "@/lib/dinheiro";
import { lerEmpresaDe, lerEmpresaNaTx, type Empresa } from "@/lib/organizacao";
import { lerTabela } from "./precos";
import {
  aplicarModelo,
  codigoOrcamento,
  proximoNumero,
  rotulosDasParcelas,
  statusEfetivo,
  totais,
  totalDaLinha,
  type Parcela,
  type Respostas,
  type StatusEfetivo,
  type StatusOrcamento,
  type Totais,
} from "./motor";

export type LinhaOrc = {
  precoItemId: string | null;
  descricao: string;
  detalhe: string | null;
  quantidade: number;
  unidade: string | null;
  precoCents: number;
  custoCents: number;
};

type ItemBanco = {
  preco_item_id: string | null;
  descricao: string;
  detalhe: string | null;
  quantidade: string;
  unidade: string | null;
  preco_cents: string;
  custo_cents: string;
};
const deBanco = (i: ItemBanco): LinhaOrc => ({
  precoItemId: i.preco_item_id,
  descricao: i.descricao,
  detalhe: i.detalhe,
  quantidade: Number(i.quantidade),
  unidade: i.unidade,
  precoCents: Number(i.preco_cents),
  custoCents: Number(i.custo_cents),
});

/* ───────────── lista ───────────── */

export type OrcamentoLista = {
  id: string;
  numero: string;
  versao: number;
  versoes: number;
  titulo: string;
  status: StatusOrcamento;
  efetivo: StatusEfetivo;
  emissao: string;
  validade: string | null;
  cliente: string | null;
  totais: Totais;
};

/** Só a versão mais recente de cada número, com os totais pelas mesmas contas do editor. */
export async function listarOrcamentos(ctx: Contexto, o: { status?: string; busca?: string } = {}, hoje = hojeBr()): Promise<OrcamentoLista[]> {
  const busca = o.busca?.trim().slice(0, 100);
  return getBanco().asUser(ctx, async (tx) => {
    const linhas = (await tx.execute(sql`
      select distinct on (q.numero) q.id, q.numero, q.versao, q.titulo, q.status, q.emissao::text, q.validade::text,
             q.desconto_cents, q.imposto_pct, c.name as cliente,
             (select count(*)::int from maestro.orcamentos v where v.numero = q.numero) as versoes,
             (select coalesce(json_agg(i order by i.ordem), '[]') from maestro.orcamento_itens i where i.orcamento_id = q.id) as itens
        from maestro.orcamentos q
        left join maestro.clients c on c.id = q.cliente_id
       ${busca ? sql`where (q.titulo ilike ${padraoBusca(busca)} or q.numero ilike ${padraoBusca(busca)} or c.name ilike ${padraoBusca(busca)})` : sql``}
       order by q.numero, q.versao desc`)) as unknown as (Record<string, unknown> & { itens: ItemBanco[] })[];
    const out = linhas.map((q) => {
      const t = totais(q.itens.map(deBanco), Number(q.desconto_cents), Number(q.imposto_pct));
      const status = q.status as StatusOrcamento;
      return {
        id: q.id as string,
        numero: q.numero as string,
        versao: Number(q.versao),
        versoes: Number(q.versoes),
        titulo: q.titulo as string,
        status,
        efetivo: statusEfetivo({ status, validade: q.validade as string | null }, hoje),
        emissao: q.emissao as string,
        validade: q.validade as string | null,
        cliente: q.cliente as string | null,
        totais: t,
      };
    });
    const filtrada = o.status && o.status !== "todos" ? out.filter((q) => q.efetivo === o.status) : out;
    return filtrada.sort((a, b) => b.numero.localeCompare(a.numero));
  });
}

/* ───────────── ficha ───────────── */

export type OrcamentoFicha = {
  id: string;
  numero: string;
  versao: number;
  titulo: string;
  categoria: string | null;
  status: StatusOrcamento;
  efetivo: StatusEfetivo;
  emissao: string;
  validade: string | null;
  periodo: string | null;
  escopo: string | null;
  pagamento: string | null;
  condicoes: string | null;
  descontoCents: number;
  impostoPct: number;
  notasInternas: string | null;
  respostas: Respostas;
  parcelas: Parcela[];
  clienteId: string | null;
  clienteNome: string | null;
  projetoId: string | null;
  projetoCodigo: string | null;
  itens: LinhaOrc[];
  versoes: { id: string; versao: number; status: StatusOrcamento }[];
  /** Do pedido público, o aceite do cliente pelo link (nome e hora) e o último pedido de ajuste (drizzle/0012). */
  pedidoId: string | null;
  aceite: { nome: string; em: string } | null;
  retorno: { nome: string; texto: string; em: string } | null;
  /** "Enviar contrato junto" (drizzle/0020). */
  contrato: boolean;
};

async function lerFicha(tx: Tx, id: string, hoje: string): Promise<OrcamentoFicha | null> {
  const [q] = (await tx.execute(sql`
    select q.*, q.emissao::text as emissao_t, q.validade::text as validade_t, c.name as cliente_nome, p.code as projeto_codigo
      from maestro.orcamentos q
      left join maestro.clients c on c.id = q.cliente_id
      left join maestro.projects p on p.id = q.projeto_id
     where q.id = ${id}`)) as unknown as Record<string, unknown>[];
  if (!q) return null;
  const itens = (await tx.execute(sql`select * from maestro.orcamento_itens where orcamento_id = ${id} order by ordem`)) as unknown as ItemBanco[];
  const versoes = (await tx.execute(
    sql`select id, versao, status from maestro.orcamentos where numero = ${q.numero as string} order by versao`,
  )) as unknown as OrcamentoFicha["versoes"];
  const status = q.status as StatusOrcamento;
  return {
    id,
    numero: q.numero as string,
    versao: Number(q.versao),
    titulo: q.titulo as string,
    categoria: q.categoria as string | null,
    status,
    efetivo: statusEfetivo({ status, validade: q.validade_t as string | null }, hoje),
    emissao: q.emissao_t as string,
    validade: q.validade_t as string | null,
    periodo: q.periodo as string | null,
    escopo: q.escopo as string | null,
    pagamento: q.pagamento as string | null,
    condicoes: q.condicoes as string | null,
    descontoCents: Number(q.desconto_cents),
    impostoPct: Number(q.imposto_pct),
    notasInternas: q.notas_internas as string | null,
    respostas: (q.respostas ?? {}) as Respostas,
    parcelas: (q.parcelas ?? []) as Parcela[],
    clienteId: q.cliente_id as string | null,
    clienteNome: q.cliente_nome as string | null,
    projetoId: q.projeto_id as string | null,
    projetoCodigo: q.projeto_codigo as string | null,
    itens: itens.map(deBanco),
    versoes: [...versoes].map((v) => ({ ...v, versao: Number(v.versao) })),
    pedidoId: (q.pedido_id as string | null) ?? null,
    contrato: !!q.contrato,
    aceite: q.aceite ? { nome: (q.aceite as Record<string, string>).nome, em: (q.aceite as Record<string, string>).em } : null,
    retorno: q.retorno
      ? { nome: (q.retorno as Record<string, string>).nome, texto: (q.retorno as Record<string, string>).texto, em: (q.retorno as Record<string, string>).em }
      : null,
  };
}

export async function obterOrcamento(ctx: Contexto, id: string, hoje = hojeBr()): Promise<OrcamentoFicha | null> {
  if (!ehUuid(id)) return null;
  return getBanco().asUser(ctx, (tx) => lerFicha(tx, id, hoje));
}

/* ───────────── criar ───────────── */

async function inserirItens(tx: Tx, orgId: string, orcamentoId: string, linhas: LinhaOrc[]) {
  for (const [ordem, l] of linhas.entries()) {
    await tx.execute(sql`
      insert into maestro.orcamento_itens (org_id, orcamento_id, preco_item_id, descricao, detalhe, quantidade, unidade, preco_cents, custo_cents, ordem)
      values (${orgId}, ${orcamentoId}, ${l.precoItemId}, ${l.descricao}, ${l.detalhe}, ${l.quantidade}, ${l.unidade}, ${l.precoCents}, ${l.custoCents}, ${ordem})`);
  }
}

async function numeroNovo(tx: Tx, orgId: string, hoje: string): Promise<string> {
  const ano = hoje.slice(0, 4);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`maestro:orcamento:${orgId}:${ano}`}))`);
  const r = (await tx.execute(sql`select distinct numero from maestro.orcamentos where numero like ${`${ano}-%`}`)) as unknown as { numero: string }[];
  return proximoNumero(
    ano,
    r.map((x) => x.numero),
  );
}

export type NovoOrcamento = {
  titulo: string;
  clienteId: string | null;
  projetoId: string | null;
  modeloId: string | null;
  respostas: Respostas;
  demo?: boolean;
  /** Do pedido público (Comercial → Pedidos → "Gerar orçamento"). */
  pedidoId?: string | null;
  escopo?: string | null;
  periodo?: string | null;
  notasInternas?: string | null;
};

/** Cria o rascunho dentro de uma transação já aberta como a pessoa (o pedido usa). Linhas pelo motor, com o modelo. */
export async function criarOrcamentoNaTx(tx: Tx, ctx: Contexto, e: NovoOrcamento, hoje = hojeBr()): Promise<{ id: string; numero: string }> {
  const numero = await numeroNovo(tx, ctx.orgId, hoje);
  const [org] = (await tx.execute(sql`select settings from maestro.organizations where id = ${ctx.orgId}`)) as unknown as { settings: unknown }[];
  const empresa: Empresa = lerEmpresaDe(org?.settings);
  let linhas: LinhaOrc[] = [];
  let categoria: string | null = null;
  if (e.modeloId) {
    const tabela = await lerTabela(tx);
    const modelo = tabela.modelos.find((m) => m.id === e.modeloId);
    if (modelo) {
      linhas = aplicarModelo(modelo, { ...modelo.respostas, ...e.respostas }, tabela.itens, tabela.variaveis);
      categoria = modelo.nicho;
    }
  }
  const [q] = (await tx.execute(sql`
    insert into maestro.orcamentos (org_id, numero, versao, cliente_id, projeto_id, titulo, categoria, emissao, validade, condicoes, respostas,
                                    escopo, periodo, notas_internas, pedido_id, demo, created_by)
    values (${ctx.orgId}, ${numero}, 1, ${e.clienteId}, ${e.projetoId}, ${e.titulo}, ${categoria}, ${hoje}, ${somarDias(hoje, empresa.validadeDias)},
            ${empresa.condicoes}, ${JSON.stringify(e.respostas)}::jsonb, ${e.escopo ?? null}, ${e.periodo ?? null}, ${e.notasInternas ?? null},
            ${e.pedidoId ?? null}, ${e.demo ?? false}, ${ctx.sub})
    returning id`)) as unknown as { id: string }[];
  await inserirItens(tx, ctx.orgId, q.id, linhas);
  return { id: q.id, numero };
}

export async function criarOrcamento(ctx: Contexto, e: NovoOrcamento, hoje = hojeBr()): Promise<Res<{ id: string; numero: string }>> {
  try {
    return await getBanco().asUser(ctx, async (tx) => ({ ok: true as const, ...(await criarOrcamentoNaTx(tx, ctx, e, hoje)) }));
  } catch (err) {
    if (codigoPg(err) === PG.chaveEstrangeira) return falha("vinculo", "Escolha um cliente da lista.");
    return traduzirPg(err);
  }
}

/* ───────────── editar ───────────── */

export type EdicaoOrcamento = {
  titulo: string;
  categoria: string | null;
  clienteId: string | null;
  validade: string | null;
  periodo: string | null;
  escopo: string | null;
  pagamento: string | null;
  condicoes: string | null;
  descontoCents: number;
  impostoPct: number;
  notasInternas: string | null;
  itens: LinhaOrc[];
};

const texto = (v: unknown, max: number): string | null | undefined => {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\r\n?/g, "\n").trim();
  return !t ? null : t.length <= max ? t : undefined;
};

/** Confere o que o editor mandou (JSON). Devolve a mensagem do primeiro problema. */
export function validarEdicao(c: unknown): { ok: true; e: EdicaoOrcamento } | { ok: false; mensagem: string } {
  const r = (c ?? {}) as Record<string, unknown>;
  const titulo = texto(r.titulo, 200);
  if (!titulo) return { ok: false, mensagem: "Dê um título ao orçamento." };
  const campos = { categoria: 80, periodo: 200, escopo: 8000, pagamento: 2000, condicoes: 4000, notasInternas: 4000 } as const;
  const lidos: Record<string, string | null> = {};
  for (const [k, max] of Object.entries(campos)) {
    const v = texto(r[k], max);
    if (v === undefined) return { ok: false, mensagem: `O campo ${k} passou do limite (${max}).` };
    lidos[k] = v;
  }
  const clienteId = r.clienteId == null || r.clienteId === "" ? null : r.clienteId;
  if (clienteId !== null && !ehUuid(clienteId)) return { ok: false, mensagem: "Escolha um cliente da lista." };
  const validade = r.validade == null || r.validade === "" ? null : r.validade;
  if (validade !== null && !ehData(validade)) return { ok: false, mensagem: "Validade inválida." };
  const desconto = Number(r.descontoCents ?? 0);
  if (!Number.isInteger(desconto) || desconto < 0 || desconto > 1e11) return { ok: false, mensagem: "Desconto inválido." };
  const imposto = Number(r.impostoPct ?? 0);
  if (!Number.isFinite(imposto) || imposto < 0 || imposto > 100) return { ok: false, mensagem: "Imposto estimado entre 0 e 100%." };
  if (!Array.isArray(r.itens) || r.itens.length > 200) return { ok: false, mensagem: "Itens em formato que não cabe." };
  const itens: LinhaOrc[] = [];
  for (const [n, x] of (r.itens as Record<string, unknown>[]).entries()) {
    const descricao = texto(x?.descricao, 200);
    if (!descricao) return { ok: false, mensagem: `Linha ${n + 1}: falta a descrição.` };
    const detalhe = texto(x.detalhe, 500);
    if (detalhe === undefined) return { ok: false, mensagem: `Linha ${n + 1}: detalhe longo demais.` };
    const quantidade = Math.round(Number(x.quantidade) * 100) / 100;
    if (!(quantidade > 0 && quantidade <= 100000)) return { ok: false, mensagem: `Linha ${n + 1}: quantidade inválida.` };
    const preco = Number(x.precoCents);
    const custo = Number(x.custoCents ?? 0);
    if (!Number.isInteger(preco) || preco < 0 || preco > 1e11 || !Number.isInteger(custo) || custo < 0 || custo > 1e11)
      return { ok: false, mensagem: `Linha ${n + 1}: valor inválido.` };
    const unidade = texto(x.unidade, 20);
    itens.push({
      precoItemId: ehUuid(x.precoItemId) ? x.precoItemId : null,
      descricao,
      detalhe: detalhe ?? null,
      quantidade,
      unidade: unidade ?? null,
      precoCents: preco,
      custoCents: custo,
    });
  }
  return {
    ok: true,
    e: {
      titulo,
      categoria: lidos.categoria,
      clienteId: clienteId as string | null,
      validade: validade as string | null,
      periodo: lidos.periodo,
      escopo: lidos.escopo,
      pagamento: lidos.pagamento,
      condicoes: lidos.condicoes,
      descontoCents: desconto,
      impostoPct: Math.round(imposto * 100) / 100,
      notasInternas: lidos.notasInternas,
      itens,
    },
  };
}

export async function salvarOrcamento(ctx: Contexto, id: string, e: EdicaoOrcamento): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse orçamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [q] = (await tx.execute(sql`select status from maestro.orcamentos where id = ${id} for update`)) as unknown as { status: string }[];
      if (!q) return falha("nao_existe", "Esse orçamento não existe.");
      if (q.status !== "rascunho") return falha("travado", "Só o rascunho se edita. Volte para rascunho ou crie uma nova versão.");
      const r = await tx.execute(sql`
        update maestro.orcamentos set titulo = ${e.titulo}, categoria = ${e.categoria}, cliente_id = ${e.clienteId}, validade = ${e.validade},
               periodo = ${e.periodo}, escopo = ${e.escopo}, pagamento = ${e.pagamento}, condicoes = ${e.condicoes},
               desconto_cents = ${e.descontoCents}, imposto_pct = ${e.impostoPct}, notas_internas = ${e.notasInternas}
         where id = ${id} returning id`);
      if (!r.length) return falha("sem_permissao", "Seu papel nesta organização só lê.");
      await tx.execute(sql`delete from maestro.orcamento_itens where orcamento_id = ${id}`);
      await inserirItens(tx, ctx.orgId, id, e.itens);
      return { ok: true as const };
    });
  } catch (err) {
    if (codigoPg(err) === PG.chaveEstrangeira) return falha("vinculo", "Um dos vínculos não existe mais.");
    return traduzirPg(err);
  }
}

/* ───────────── status, versão e aprovação ───────────── */

const TRANSICOES: Record<string, StatusOrcamento[]> = {
  rascunho: ["enviado"],
  enviado: ["rascunho", "recusado"],
  recusado: ["rascunho"],
  aprovado: [],
};

export async function mudarStatus(ctx: Contexto, id: string, para: StatusOrcamento): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse orçamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [q] = (await tx.execute(sql`select status from maestro.orcamentos where id = ${id} for update`)) as unknown as { status: string }[];
      if (!q) return falha("nao_existe", "Esse orçamento não existe.");
      if (!TRANSICOES[q.status]?.includes(para)) return falha("status", "Esse passo não vale para o status atual.");
      const r = await tx.execute(sql`
        update maestro.orcamentos set status = ${para},
               enviado_em = case when ${para} = 'enviado' then now() else enviado_em end,
               decidido_em = case when ${para} = 'recusado' then now() when ${para} = 'rascunho' then null else decidido_em end
         where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", "Seu papel nesta organização só lê.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

/** Copia o orçamento para a próxima versão do mesmo número (rascunho). */
export async function novaVersao(ctx: Contexto, id: string, hoje = hojeBr()): Promise<Res<{ id: string; versao: number }>> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse orçamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [q] = (await tx.execute(sql`select * from maestro.orcamentos where id = ${id}`)) as unknown as Record<string, unknown>[];
      if (!q) return falha("nao_existe", "Esse orçamento não existe.");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`maestro:orcamento:${ctx.orgId}:${q.numero as string}`}))`);
      const [{ v }] = (await tx.execute(sql`select max(versao)::int as v from maestro.orcamentos where numero = ${q.numero as string}`)) as unknown as {
        v: number;
      }[];
      const validadeAntiga = q.validade && q.emissao ? Math.round((+new Date(q.validade as string) - +new Date(q.emissao as string)) / 86_400_000) : 15;
      const [n] = (await tx.execute(sql`
        insert into maestro.orcamentos (org_id, numero, versao, cliente_id, projeto_id, titulo, categoria, emissao, validade, periodo, escopo, pagamento,
                                        condicoes, desconto_cents, imposto_pct, notas_internas, respostas, contrato, demo, created_by)
        select org_id, numero, ${v + 1}, cliente_id, null, titulo, categoria, ${hoje}, ${somarDias(hoje, Math.max(1, validadeAntiga))}, periodo, escopo,
               pagamento, condicoes, desconto_cents, imposto_pct, notas_internas, respostas, contrato, demo, ${ctx.sub}
          from maestro.orcamentos where id = ${id}
        returning id`)) as unknown as { id: string }[];
      await tx.execute(sql`
        insert into maestro.orcamento_itens (org_id, orcamento_id, preco_item_id, descricao, detalhe, quantidade, unidade, preco_cents, custo_cents, ordem)
        select org_id, ${n.id}, preco_item_id, descricao, detalhe, quantidade, unidade, preco_cents, custo_cents, ordem
          from maestro.orcamento_itens where orcamento_id = ${id}`);
      return { ok: true as const, id: n.id, versao: v + 1 };
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

/** Confere as parcelas que a tela mandou: 1 a 3, datas válidas, soma igual ao total. */
export function validarParcelas(v: unknown, total: number): { ok: true; parcelas: Parcela[] } | { ok: false; mensagem: string } {
  if (!Array.isArray(v) || v.length < 1 || v.length > 3) return { ok: false, mensagem: "De 1 a 3 parcelas." };
  const rotulos = rotulosDasParcelas(v.length);
  const parcelas: Parcela[] = [];
  for (const [i, p] of (v as Record<string, unknown>[]).entries()) {
    const valor = Number(p?.valorCents);
    if (!Number.isInteger(valor) || valor <= 0) return { ok: false, mensagem: "Toda parcela precisa de valor." };
    if (!ehData(p.vencimento)) return { ok: false, mensagem: "Informe o vencimento de cada parcela." };
    parcelas.push({ rotulo: rotulos[i], valorCents: valor, vencimento: p.vencimento as string });
  }
  const soma = parcelas.reduce((s, p) => s + p.valorCents, 0);
  if (soma !== total) return { ok: false, mensagem: "A soma das parcelas precisa fechar o total." };
  return { ok: true, parcelas };
}

/**
 * Aprova: abre o projeto (se ainda não tem), lança as parcelas a receber e marca o orçamento, numa transação só.
 * Só administração e gestão (o Financeiro é deles; o banco confere). Aprovar de novo não duplica nada.
 */
export async function aprovarOrcamento(ctx: Contexto, id: string, parcelasBrutas: unknown): Promise<Res<{ projetoId: string; codigo: string }>> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse orçamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [q] = (await tx.execute(sql`
        select q.*, c.name as cliente_nome from maestro.orcamentos q left join maestro.clients c on c.id = q.cliente_id
         where q.id = ${id} for update of q`)) as unknown as Record<string, unknown>[];
      if (!q) return falha("nao_existe", "Esse orçamento não existe.");
      if (q.status === "aprovado") return falha("ja_aprovado", "Este orçamento já foi aprovado.");
      if (q.status === "recusado") return falha("recusado", "Orçamento recusado. Crie uma nova versão para aprovar.");
      const [irma] = (await tx.execute(sql`select versao from maestro.orcamentos where numero = ${q.numero as string} and status = 'aprovado'`)) as unknown as {
        versao: number;
      }[];
      if (irma) return falha("ja_aprovado", `A versão ${irma.versao} deste orçamento já foi aprovada.`);
      if (!q.cliente_id) return falha("cliente", "Escolha o cliente antes de aprovar.");
      const itens = ((await tx.execute(sql`select * from maestro.orcamento_itens where orcamento_id = ${id}`)) as unknown as ItemBanco[]).map(deBanco);
      const t = totais(itens, Number(q.desconto_cents), Number(q.imposto_pct));
      if (t.total <= 0) return falha("sem_valor", "O orçamento está sem valor. Adicione os itens antes de aprovar.");
      const v = validarParcelas(parcelasBrutas, t.total);
      if (!v.ok) return falha("parcelas", v.mensagem);

      let projetoId = q.projeto_id as string | null;
      let codigo: string;
      if (projetoId) {
        const [p] = (await tx.execute(sql`select code from maestro.projects where id = ${projetoId}`)) as unknown as { code: string }[];
        codigo = p?.code ?? "";
        await tx.execute(sql`update maestro.projects set value_cents = ${t.total} where id = ${projetoId}`);
      } else {
        codigo = await proximoCodigo(tx, ctx.orgId);
        const [p] = (await tx.execute(sql`
          insert into maestro.projects (org_id, client_id, code, title, category, status, value_cents, briefing, link_status, demo, created_by)
          values (${ctx.orgId}, ${q.cliente_id as string}, ${codigo}, ${q.titulo as string}, ${q.categoria as string | null}, 'active', ${t.total},
                  ${q.escopo as string | null}, 'pending', ${q.demo as boolean}, ${ctx.sub})
          returning id`)) as unknown as { id: string }[];
        projetoId = p.id;
      }
      const nome = (q.cliente_nome as string | null) ?? (q.titulo as string);
      for (const [i, p] of v.parcelas.entries()) {
        await tx.execute(sql`
          insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento, parcela, projeto_id, cliente_id, orcamento_id, demo, created_by)
          values (${ctx.orgId}, 'entrada', 'cliente', ${`${nome} · ${p.rotulo}`.slice(0, 200)}, ${p.valorCents}, ${p.vencimento},
                  ${`${i + 1}/${v.parcelas.length}`}, ${projetoId}, ${q.cliente_id as string}, ${id}, ${q.demo as boolean}, ${ctx.sub})`);
      }
      await tx.execute(sql`
        update maestro.orcamentos set status = 'aprovado', decidido_em = now(), projeto_id = ${projetoId}, parcelas = ${JSON.stringify(v.parcelas)}::jsonb
         where id = ${id}`);
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
        values (${ctx.orgId}, ${ctx.sub}, 'orcamento.aprovou', 'orcamento', ${id}, ${JSON.stringify({ numero: q.numero, versao: q.versao, projeto: codigo })}::jsonb)`);
      return { ok: true as const, projetoId: projetoId!, codigo };
    });
  } catch (err) {
    if (codigoPg(err) === PG.unicidade) return falha("ja_aprovado", "Outra versão deste orçamento acabou de ser aprovada.");
    return traduzirPg(err);
  }
}

export async function removerOrcamento(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse orçamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.orcamentos where id = ${id} and status <> 'aprovado' returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", "Só administração e gestão apagam, e nunca o aprovado.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

/* ───────────── timbrado ───────────── */

/** O que o cliente vê: sem custo, sem margem, sem notas internas. */
export type DocumentoOrcamento = {
  codigo: string;
  numero: string;
  versao: number;
  titulo: string;
  periodo: string | null;
  escopo: string | null;
  pagamento: string | null;
  condicoes: string | null;
  emissao: string;
  validade: string | null;
  status: StatusEfetivo;
  para: { nome: string; contato: string | null; cidade: string | null; documento: string | null } | null;
  itens: { descricao: string; detalhe: string | null; quantidade: number; unidade: string | null; precoCents: number; totalCents: number }[];
  subtotal: number;
  desconto: number;
  total: number;
  empresa: Empresa & { nomeOrg: string };
};

export async function documentoDoOrcamento(ctx: Contexto, id: string, hoje = hojeBr()): Promise<DocumentoOrcamento | null> {
  if (!ehUuid(id)) return null;
  return getBanco().asUser(ctx, async (tx) => {
    const f = await lerFicha(tx, id, hoje);
    if (!f) return null;
    const empresa = await lerEmpresaNaTx(tx, ctx.orgId);
    const [c] = f.clienteId
      ? ((await tx.execute(sql`select name, company, contact_name, city, document from maestro.clients where id = ${f.clienteId}`)) as unknown as Record<
          string,
          string | null
        >[])
      : [];
    const t = totais(f.itens, f.descontoCents, 0);
    return {
      codigo: codigoOrcamento(f.numero, f.versao),
      numero: f.numero,
      versao: f.versao,
      titulo: f.titulo,
      periodo: f.periodo,
      escopo: f.escopo,
      pagamento: f.pagamento,
      condicoes: f.condicoes,
      emissao: f.emissao,
      validade: f.validade,
      status: f.efetivo,
      para: c ? { nome: c.company || c.name!, contato: c.contact_name, cidade: c.city, documento: c.document } : null,
      itens: f.itens.map((i) => ({
        descricao: i.descricao,
        detalhe: i.detalhe,
        quantidade: i.quantidade,
        unidade: i.unidade,
        precoCents: i.precoCents,
        totalCents: totalDaLinha(i),
      })),
      subtotal: t.subtotal,
      desconto: t.desconto,
      total: t.total,
      empresa,
    };
  });
}
