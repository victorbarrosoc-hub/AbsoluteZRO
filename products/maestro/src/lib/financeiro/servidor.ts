/**
 * Financeiro no banco (porte das consultas e ações de src/app/(painel)/painel/financeiro e src/lib/services do ZRO):
 * lançamentos, baixas, a pagar e a receber, fluxo, resultado por projeto e recorrências. Só administração e gestão
 * (o banco confere em todo comando). Sempre como a pessoa (`asUser`, RLS).
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Erros, type Res } from "@/lib/crm/comum";
import { ehData, ehMes, hojeBr, lerReais, limitesDoMes, mesPorExtenso } from "@/lib/dinheiro";
import { totais } from "@/lib/orcamento/motor";
import {
  CATEGORIAS,
  FORMAS,
  cardsDoMes,
  categoriaDoTipo,
  emAberto,
  fluxoPorMes,
  mesesEntre,
  nomeCategoria,
  resultadoPorProjeto,
  resumir,
  statusDe,
  valeNoMes,
  vencimentoNoMes,
  type Status,
  type Tipo,
} from "./contas";

export type Baixa = { id: string; valorCents: number; data: string; forma: string | null; notas: string | null };
export type Lancamento = {
  id: string;
  tipo: Tipo;
  categoria: string;
  descricao: string;
  valorCents: number;
  pagoCents: number;
  vencimento: string;
  pagoEm: string | null;
  parcela: string | null;
  notas: string | null;
  projetoId: string | null;
  projetoCodigo: string | null;
  clienteId: string | null;
  cliente: string | null;
  freelaId: string | null;
  freela: string | null;
  escalaId: string | null;
  recorrenciaId: string | null;
  status: Status;
  aberto: number;
  baixas: Baixa[];
};

const COLUNAS = sql`
  l.id, l.tipo, l.categoria, l.descricao, l.valor_cents::float8 as "valorCents", l.pago_cents::float8 as "pagoCents",
  l.vencimento::text, l.pago_em::text as "pagoEm", l.parcela, l.notas, l.projeto_id as "projetoId", p.code as "projetoCodigo",
  l.cliente_id as "clienteId", c.name as cliente, l.freela_id as "freelaId", f.nome as freela, l.escala_id as "escalaId",
  l.recorrencia_id as "recorrenciaId",
  (select coalesce(json_agg(json_build_object('id', b.id, 'valorCents', b.valor_cents, 'data', b.data, 'forma', b.forma, 'notas', b.notas) order by b.data), '[]')
     from maestro.baixas b where b.lancamento_id = l.id) as baixas`;
const JUNCOES = sql`
  from maestro.lancamentos l
  left join maestro.projects p on p.id = l.projeto_id
  left join maestro.clients c on c.id = l.cliente_id
  left join maestro.freelas f on f.id = l.freela_id`;

function hidratar(linhas: unknown[], hoje: string): Lancamento[] {
  return (linhas as Omit<Lancamento, "status" | "aberto">[]).map((l) => ({
    ...l,
    baixas: (l.baixas ?? []).map((b) => ({ ...b, valorCents: Number(b.valorCents) })),
    status: statusDe(l, hoje),
    aberto: emAberto(l),
  }));
}

const dobra = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type Filtros = { mes: string | null; tipo?: Tipo; status?: Status; projeto?: string; busca?: string };

/** Lançamentos do recorte (pelo vencimento), contagens para os filtros e o resumo. */
export async function listarLancamentos(ctx: Contexto, f: Filtros, hoje = hojeBr()) {
  return getBanco().asUser(ctx, async (tx) => {
    const lim = f.mes && ehMes(f.mes) ? limitesDoMes(f.mes) : null;
    const linhas = await tx.execute(sql`
      select ${COLUNAS} ${JUNCOES}
       where true
         ${lim ? sql`and l.vencimento between ${lim.inicio} and ${lim.fim}` : sql``}
         ${f.projeto === "sem" ? sql`and l.projeto_id is null` : ehUuid(f.projeto) ? sql`and l.projeto_id = ${f.projeto}` : sql``}
       order by l.vencimento, l.tipo, l.created_at
       limit 2000`);
    const agulha = f.busca ? dobra(f.busca.trim()) : "";
    const base = hidratar(linhas, hoje).filter(
      (l) =>
        !agulha ||
        dobra([l.descricao, l.projetoCodigo, l.cliente, l.freela, l.parcela, l.notas, nomeCategoria(l.categoria)].filter(Boolean).join(" ")).includes(agulha),
    );
    const contaTipo: Record<string, number> = { todos: 0, entrada: 0, saida: 0 };
    const contaStatus: Record<string, number> = { todos: 0, pendente: 0, parcial: 0, atrasado: 0, pago: 0 };
    for (const l of base) {
      if (!f.status || l.status === f.status) {
        contaTipo.todos++;
        contaTipo[l.tipo]++;
      }
      if (!f.tipo || l.tipo === f.tipo) {
        contaStatus.todos++;
        contaStatus[l.status]++;
      }
    }
    const lista = base.filter((l) => (!f.tipo || l.tipo === f.tipo) && (!f.status || l.status === f.status));
    return { lancamentos: lista, resumo: resumir(lista, hoje), contaTipo, contaStatus };
  });
}

export async function obterLancamento(ctx: Contexto, id: string, hoje = hojeBr()): Promise<Lancamento | null> {
  if (!ehUuid(id)) return null;
  return getBanco().asUser(ctx, async (tx) => hidratar(await tx.execute(sql`select ${COLUNAS} ${JUNCOES} where l.id = ${id}`), hoje)[0] ?? null);
}

/** Opções dos formulários: projetos, clientes e freelas. */
export async function opcoesFinanceiro(ctx: Contexto) {
  return getBanco().asUser(ctx, async (tx) => {
    const [projetos, clientes, freelas] = await Promise.all([
      tx.execute(sql`select id, code as codigo, title as titulo from maestro.projects where deleted_at is null order by code desc limit 500`),
      tx.execute(sql`select id, name as nome from maestro.clients where deleted_at is null order by name limit 500`),
      tx.execute(sql`select id, nome from maestro.freelas order by nome limit 500`),
    ]);
    return {
      projetos: projetos as unknown as { id: string; codigo: string; titulo: string }[],
      clientes: clientes as unknown as { id: string; nome: string }[],
      freelas: freelas as unknown as { id: string; nome: string }[],
    };
  });
}

/* ───────────── escrever ───────────── */

export type EntradaLancamento = {
  tipo: Tipo;
  categoria: string;
  descricao: string;
  valorCents: number;
  vencimento: string;
  parcela: string | null;
  notas: string | null;
  projetoId: string | null;
  clienteId: string | null;
  freelaId: string | null;
};

export function validarLancamento(f: Record<string, string>): { ok: true; entrada: EntradaLancamento } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const tipo = f.tipo === "saida" ? "saida" : f.tipo === "entrada" ? "entrada" : null;
  if (!tipo) erros.tipo = "Entrada ou saída?";
  const categoria = f.categoria ?? "";
  if (tipo && !categoriaDoTipo(categoria, tipo)) erros.categoria = "Escolha uma categoria deste tipo.";
  const descricao = (f.descricao ?? "").trim();
  if (!descricao || descricao.length > 200) erros.descricao = "Descreva em até 200 caracteres.";
  const valor = lerReais(f.valor);
  if (valor == null || !(valor > 0)) erros.valor = "Valor maior que zero.";
  if (!ehData(f.vencimento)) erros.vencimento = "Escolha a data.";
  const notas = (f.notas ?? "").trim();
  if (notas.length > 2000) erros.notas = "Até 2.000 caracteres.";
  const parcela = (f.parcela ?? "").trim();
  if (parcela.length > 20) erros.parcela = "Até 20 caracteres.";
  const id = (k: string) => (ehUuid(f[k]) ? f[k] : null);
  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    entrada: {
      tipo: tipo!,
      categoria,
      descricao,
      valorCents: valor!,
      vencimento: f.vencimento,
      parcela: parcela || null,
      notas: notas || null,
      projetoId: id("projeto"),
      clienteId: id("cliente"),
      freelaId: id("freela"),
    },
  };
}

const SEM_DINHEIRO = "Só administração e gestão mexem no Financeiro.";

export async function salvarLancamento(ctx: Contexto, e: EntradaLancamento, id?: string): Promise<Res<{ id: string }>> {
  if (id && !ehUuid(id)) return falha("nao_existe", "Esse lançamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      if (id) {
        const [l] = (await tx.execute(sql`select pago_cents from maestro.lancamentos where id = ${id} for update`)) as unknown as { pago_cents: string }[];
        if (!l) return falha("nao_existe", "Esse lançamento não existe.");
        if (e.valorCents < Number(l.pago_cents))
          return falha("valor", "O valor não pode ficar menor do que já foi baixado.", { valor: "Menor que o já baixado." });
        await tx.execute(sql`
          update maestro.lancamentos set tipo = ${e.tipo}, categoria = ${e.categoria}, descricao = ${e.descricao}, valor_cents = ${e.valorCents},
                 vencimento = ${e.vencimento}, parcela = ${e.parcela}, notas = ${e.notas}, projeto_id = ${e.projetoId}, cliente_id = ${e.clienteId},
                 freela_id = ${e.freelaId}
           where id = ${id}`);
        return { ok: true as const, id };
      }
      const [r] = (await tx.execute(sql`
        insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento, parcela, notas, projeto_id, cliente_id, freela_id, created_by)
        values (${ctx.orgId}, ${e.tipo}, ${e.categoria}, ${e.descricao}, ${e.valorCents}, ${e.vencimento}, ${e.parcela}, ${e.notas}, ${e.projetoId},
                ${e.clienteId}, ${e.freelaId}, ${ctx.sub})
        returning id`)) as unknown as { id: string }[];
      return { ok: true as const, id: r.id };
    });
  } catch (err) {
    const f = traduzirPg(err);
    return f.erro === "sem_permissao" ? falha("sem_permissao", SEM_DINHEIRO) : f;
  }
}

export async function removerLancamento(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Esse lançamento não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.lancamentos where id = ${id} and escala_id is null returning id`);
      return r.length ? { ok: true as const } : falha("nao_removivel", "Pagamento de escala sai pela escala do projeto.");
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

/** Baixa total ou parcial. Sem valor, quita o que falta. */
export async function darBaixa(
  ctx: Contexto,
  lancamentoId: string,
  b: { valorCents?: number | null; data?: string | null; forma?: string | null; notas?: string | null },
  hoje = hojeBr(),
): Promise<Res> {
  if (!ehUuid(lancamentoId)) return falha("nao_existe", "Esse lançamento não existe.");
  if (b.forma && !FORMAS.some((x) => x.k === b.forma)) return falha("forma", "Forma de pagamento inválida.");
  if (b.data && !ehData(b.data)) return falha("data", "Data inválida.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [l] = (await tx.execute(sql`select valor_cents, pago_cents from maestro.lancamentos where id = ${lancamentoId} for update`)) as unknown as {
        valor_cents: string;
        pago_cents: string;
      }[];
      if (!l) return falha("nao_existe", SEM_DINHEIRO);
      const aberto = Math.max(0, Number(l.valor_cents) - Number(l.pago_cents));
      const valor = b.valorCents ?? aberto;
      if (aberto <= 0) return falha("quitado", "Não há valor em aberto neste lançamento.");
      if (!(valor > 0) || valor > aberto) return falha("valor", "A baixa vai de R$ 0,01 até o que está em aberto.");
      await tx.execute(sql`
        insert into maestro.baixas (org_id, lancamento_id, valor_cents, data, forma, notas, created_by)
        values (${ctx.orgId}, ${lancamentoId}, ${valor}, ${b.data ?? hoje}, ${b.forma ?? null}, ${b.notas?.slice(0, 500) ?? null}, ${ctx.sub})`);
      return { ok: true as const };
    });
  } catch (err) {
    const f = traduzirPg(err);
    return f.erro === "sem_permissao" ? falha("sem_permissao", SEM_DINHEIRO) : f;
  }
}

export async function desfazerBaixa(ctx: Contexto, baixaId: string): Promise<Res> {
  if (!ehUuid(baixaId)) return falha("nao_existe", "Essa baixa não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.baixas where id = ${baixaId} returning id`);
      return r.length ? { ok: true as const } : falha("nao_existe", SEM_DINHEIRO);
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

/* ───────────── a pagar e a receber ───────────── */

export type Grupo = { chave: string; nome: string; aberto: number; proximo: string; atrasado: boolean; lancamentos: Lancamento[] };

/** O que está em aberto (qualquer mês): a receber por cliente e a pagar por freela ou fornecedor. */
export async function aPagarEReceber(ctx: Contexto, hoje = hojeBr()) {
  return getBanco().asUser(ctx, async (tx) => {
    const abertos = hidratar(await tx.execute(sql`select ${COLUNAS} ${JUNCOES} where l.valor_cents > l.pago_cents order by l.vencimento limit 2000`), hoje);
    const agrupar = (lista: Lancamento[], chave: (l: Lancamento) => [string, string]) => {
      const m = new Map<string, Grupo>();
      for (const l of lista) {
        const [k, nome] = chave(l);
        const g = m.get(k) ?? { chave: k, nome, aberto: 0, proximo: l.vencimento, atrasado: false, lancamentos: [] };
        g.aberto += l.aberto;
        if (l.vencimento < g.proximo) g.proximo = l.vencimento;
        if (l.vencimento < hoje) g.atrasado = true;
        g.lancamentos.push(l);
        m.set(k, g);
      }
      return [...m.values()].sort((a, b) => a.proximo.localeCompare(b.proximo) || a.nome.localeCompare(b.nome));
    };
    const receber = abertos.filter((l) => l.tipo === "entrada");
    const pagar = abertos.filter((l) => l.tipo === "saida");
    const freelas = pagar.filter((l) => l.freelaId || l.categoria === "freela");
    const outros = pagar.filter((l) => !(l.freelaId || l.categoria === "freela"));
    return {
      receber: agrupar(receber, (l) => [l.clienteId ?? "sem", l.cliente ?? "Sem cliente"]),
      freelas: agrupar(freelas, (l) => [l.freelaId ?? "sem", l.freela ?? "Sem cadastro no banco"]),
      contas: agrupar(outros, (l) => [l.categoria, nomeCategoria(l.categoria)]),
      totalReceber: receber.reduce((s, l) => s + l.aberto, 0),
      totalPagar: pagar.reduce((s, l) => s + l.aberto, 0),
      atrasado: abertos.filter((l) => l.status === "atrasado").reduce((s, l) => s + (l.tipo === "entrada" ? l.aberto : -l.aberto), 0),
    };
  });
}

/* ───────────── fluxo e resultado ───────────── */

export async function fluxoEResultado(ctx: Contexto, de: string, ate: string, hoje = hojeBr()) {
  return getBanco().asUser(ctx, async (tx) => {
    const todos = hidratar(await tx.execute(sql`select ${COLUNAS} ${JUNCOES} order by l.vencimento limit 5000`), hoje);
    const meses = mesesEntre(de, ate);
    const projetos = (await tx.execute(sql`
      select p.id, p.code as codigo, p.title as titulo, c.name as cliente, coalesce(p.value_cents, 0)::float8 as valor,
             (select json_build_object('desconto', q.desconto_cents, 'imposto', q.imposto_pct,
                     'itens', (select coalesce(json_agg(json_build_object('quantidade', i.quantidade, 'precoCents', i.preco_cents, 'custoCents', i.custo_cents)), '[]')
                                 from maestro.orcamento_itens i where i.orcamento_id = q.id))
                from maestro.orcamentos q where q.projeto_id = p.id and q.status = 'aprovado' limit 1) as orcado
        from maestro.projects p left join maestro.clients c on c.id = p.client_id
       where p.deleted_at is null and p.status <> 'archived'
       order by p.code desc limit 300`)) as unknown as {
      id: string;
      codigo: string;
      titulo: string;
      cliente: string | null;
      valor: number;
      orcado: { desconto: number; imposto: number; itens: { quantidade: number; precoCents: number; custoCents: number }[] } | null;
    }[];
    const resultado = resultadoPorProjeto(
      projetos.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        titulo: p.titulo,
        cliente: p.cliente,
        valor: Number(p.valor),
        margemOrcadaPct: p.orcado
          ? totais(
              p.orcado.itens.map((i) => ({ quantidade: Number(i.quantidade), precoCents: Number(i.precoCents), custoCents: Number(i.custoCents) })),
              Number(p.orcado.desconto),
              Number(p.orcado.imposto),
            ).margemPct
          : null,
      })),
      todos,
    );
    return { fluxo: fluxoPorMes(todos, meses), resultado };
  });
}

/* ───────────── recorrências ───────────── */

export type RecorrenciaLista = {
  id: string;
  tipo: Tipo;
  categoria: string;
  descricao: string;
  valorCents: number;
  dia: number;
  clienteId: string | null;
  cliente: string | null;
  inicioMes: string;
  fimMes: string | null;
  entregas: { titulo: string; qtd: number }[];
  ativo: boolean;
  ultimoMes: string | null;
};

export async function listarRecorrencias(ctx: Contexto): Promise<RecorrenciaLista[]> {
  return getBanco().asUser(ctx, async (tx) => {
    const r = await tx.execute(sql`
      select r.id, r.tipo, r.categoria, r.descricao, r.valor_cents::float8 as "valorCents", r.dia, r.cliente_id as "clienteId", c.name as cliente,
             r.inicio_mes as "inicioMes", r.fim_mes as "fimMes", r.entregas, r.ativo,
             (select max(e.mes) from maestro.recorrencia_execucoes e where e.recorrencia_id = r.id) as "ultimoMes"
        from maestro.recorrencias r left join maestro.clients c on c.id = r.cliente_id
       order by r.ativo desc, r.tipo, r.descricao`);
    return r as unknown as RecorrenciaLista[];
  });
}

export type EntradaRecorrencia = {
  tipo: Tipo;
  categoria: string;
  descricao: string;
  valorCents: number;
  dia: number;
  clienteId: string | null;
  inicioMes: string;
  fimMes: string | null;
  entregas: { titulo: string; qtd: number }[];
  ativo: boolean;
};

/** Entregas em texto, uma por linha: "8 reels", "12 posts", "Stories da semana". */
export function lerEntregas(texto: string): { titulo: string; qtd: number }[] | null {
  const out: { titulo: string; qtd: number }[] = [];
  for (const l of texto
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)) {
    const m = l.match(/^(\d{1,2})\s*[x×]?\s+(.+)$/i);
    const qtd = m ? Number(m[1]) : 1;
    const titulo = (m ? m[2] : l).trim().slice(0, 80);
    if (!titulo || qtd < 1 || qtd > 60) return null;
    out.push({ titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1), qtd });
  }
  return out.length > 20 ? null : out;
}

export function validarRecorrencia(f: Record<string, string>): { ok: true; entrada: EntradaRecorrencia } | { ok: false; erros: Erros } {
  const erros: Erros = {};
  const tipo = f.tipo === "entrada" ? "entrada" : f.tipo === "saida" ? "saida" : null;
  if (!tipo) erros.tipo = "Entrada ou saída?";
  if (tipo && !categoriaDoTipo(f.categoria ?? "", tipo)) erros.categoria = "Escolha uma categoria deste tipo.";
  const descricao = (f.descricao ?? "").trim();
  if (!descricao || descricao.length > 200) erros.descricao = "Descreva em até 200 caracteres.";
  const valor = lerReais(f.valor);
  if (valor == null || !(valor > 0)) erros.valor = "Valor maior que zero.";
  const dia = Number(f.dia || 1);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) erros.dia = "Dia de 1 a 31.";
  if (!ehMes(f.inicio)) erros.inicio = "Mês de início (AAAA-MM).";
  const fim = f.fim ? f.fim : null;
  if (fim && (!ehMes(fim) || fim < f.inicio)) erros.fim = "Mês final depois do início.";
  const entregas = lerEntregas(f.entregas ?? "");
  if (!entregas) erros.entregas = "Uma por linha, assim: 8 reels";
  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    entrada: {
      tipo: tipo!,
      categoria: f.categoria,
      descricao,
      valorCents: valor!,
      dia,
      clienteId: ehUuid(f.cliente) ? f.cliente : null,
      inicioMes: f.inicio,
      fimMes: fim,
      entregas: entregas!,
      ativo: f.ativo !== "nao",
    },
  };
}

export async function salvarRecorrencia(ctx: Contexto, e: EntradaRecorrencia, id?: string): Promise<Res<{ id: string }>> {
  if (id && !ehUuid(id)) return falha("nao_existe", "Essa recorrência não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const ent = JSON.stringify(e.entregas);
      const r = (await (id
        ? tx.execute(sql`update maestro.recorrencias set tipo = ${e.tipo}, categoria = ${e.categoria}, descricao = ${e.descricao}, valor_cents = ${e.valorCents},
                                dia = ${e.dia}, cliente_id = ${e.clienteId}, inicio_mes = ${e.inicioMes}, fim_mes = ${e.fimMes}, entregas = ${ent}::jsonb,
                                ativo = ${e.ativo} where id = ${id} returning id`)
        : tx.execute(sql`insert into maestro.recorrencias (org_id, tipo, categoria, descricao, valor_cents, dia, cliente_id, inicio_mes, fim_mes, entregas, ativo, created_by)
                          values (${ctx.orgId}, ${e.tipo}, ${e.categoria}, ${e.descricao}, ${e.valorCents}, ${e.dia}, ${e.clienteId}, ${e.inicioMes}, ${e.fimMes},
                                  ${ent}::jsonb, ${e.ativo}, ${ctx.sub}) returning id`))) as unknown as { id: string }[];
      return r.length ? { ok: true as const, id: r[0].id } : falha("sem_permissao", SEM_DINHEIRO);
    });
  } catch (err) {
    const f = traduzirPg(err);
    return f.erro === "sem_permissao" ? falha("sem_permissao", SEM_DINHEIRO) : f;
  }
}

export async function removerRecorrencia(ctx: Contexto, id: string): Promise<Res> {
  if (!ehUuid(id)) return falha("nao_existe", "Essa recorrência não existe.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`delete from maestro.recorrencias where id = ${id} returning id`);
      return r.length ? { ok: true as const } : falha("sem_permissao", SEM_DINHEIRO);
    });
  } catch (err) {
    return traduzirPg(err);
  }
}

export type Geracao = { lancamentos: number; cards: number };

/** Gera numa transação o que falta do mês: o lançamento de cada recorrência e os cards das entregas fixas. */
export async function gerarNoMes(tx: Tx, ctx: Contexto, mes: string): Promise<Geracao> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`maestro:recorrencias:${ctx.orgId}:${mes}`}))`);
  const recs = (await tx.execute(sql`
    select r.id, r.tipo, r.categoria, r.descricao, r.valor_cents, r.dia, r.cliente_id, r.inicio_mes, r.fim_mes, r.entregas, r.ativo, r.demo, c.name as cliente
      from maestro.recorrencias r left join maestro.clients c on c.id = r.cliente_id
     where r.ativo and not exists (select 1 from maestro.recorrencia_execucoes e where e.recorrencia_id = r.id and e.mes = ${mes})`)) as unknown as Record<
    string,
    unknown
  >[];
  const out: Geracao = { lancamentos: 0, cards: 0 };
  const nomeMes = mesPorExtenso(mes);
  for (const r of recs) {
    if (!valeNoMes({ inicioMes: r.inicio_mes as string, fimMes: r.fim_mes as string | null, ativo: true, dia: Number(r.dia) }, mes)) continue;
    const descricao = `${r.descricao as string} · ${nomeMes}`.slice(0, 200);
    const [l] = (await tx.execute(sql`
      insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento, competencia, cliente_id, recorrencia_id, demo, created_by)
      values (${ctx.orgId}, ${r.tipo as string}, ${r.categoria as string}, ${descricao}, ${r.valor_cents as string},
              ${vencimentoNoMes({ dia: Number(r.dia) }, mes)}, ${mes}, ${r.cliente_id as string | null}, ${r.id as string}, ${r.demo as boolean}, ${ctx.sub})
      returning id`)) as unknown as { id: string }[];
    out.lancamentos++;
    let cards = 0;
    const entregas = (r.entregas ?? []) as { titulo: string; qtd: number }[];
    for (const c of cardsDoMes(r.id as string, entregas, mes, nomeMes.split(" de ")[0])) {
      const id = `${r.demo ? "demo-" : ""}${c.id}`;
      const ja = await tx.execute(sql`select 1 from maestro.cards where id = ${id}`);
      if (ja.length) continue;
      const dados = {
        tema: c.tema,
        coluna: "pauta",
        ordem: cards,
        ...(r.cliente_id ? { cliente: r.cliente_id } : {}),
        prazo: limitesDoMes(mes).fim,
        criadoEm: Date.now(),
        colunaEm: Date.now(),
        criadoPor: ctx.sub,
        recorrente: mes,
        ...(r.demo ? { demo: true } : {}),
      };
      await tx.execute(sql`select 1 from maestro.card_criar(${id}, ${JSON.stringify(dados)}::jsonb)`);
      cards++;
    }
    out.cards += cards;
    await tx.execute(sql`
      insert into maestro.recorrencia_execucoes (org_id, recorrencia_id, mes, lancamento_id, cards)
      values (${ctx.orgId}, ${r.id as string}, ${mes}, ${l.id}, ${cards})`);
  }
  return out;
}

/** Gera o mês (padrão: o atual). Gerar de novo não duplica nada. */
export async function gerarRecorrencias(ctx: Contexto, mes = hojeBr().slice(0, 7)): Promise<Res<Geracao>> {
  if (!ehMes(mes)) return falha("mes", "Mês inválido.");
  try {
    return await getBanco().asUser(ctx, async (tx) => ({ ok: true as const, ...(await gerarNoMes(tx, ctx, mes)) }));
  } catch (err) {
    const f = traduzirPg(err);
    return f.erro === "sem_permissao" ? falha("sem_permissao", SEM_DINHEIRO) : f;
  }
}

export { CATEGORIAS, FORMAS };
