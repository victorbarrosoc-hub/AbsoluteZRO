/**
 * Demonstração: monta, na organização ativa, uma produtora de exemplo inteira (10 clientes, projetos, cards nas 8
 * colunas, lotes em aprovação, tabela de preços, orçamentos, financeiro de 3 meses para trás e 2 para a frente,
 * freelas com escala e pagamentos, inventário com reservas, agenda e documentos) para a pessoa ver o Maestro
 * funcionando; e tira tudo de novo. Sempre como a pessoa (`asUser`, RLS): a organização vem da sessão. Cards nascem
 * pela `maestro.card_criar` e saem pela `maestro.demo_apagar_cards` (drizzle/0003).
 *
 * Idempotente por módulo: cada parte só é montada se ainda não houver dado `demo` dela. Assim, carregar de novo não
 * duplica nada e uma demonstração antiga (só Quadro, Clientes e Projetos) ganha os módulos novos ("completar").
 * Remover só toca no que é `demo` (e nos dados da empresa que a própria demonstração preencheu).
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getBanco, schema, type Contexto, type Tx } from "@/lib/db/client";
import { iso } from "@/lib/quadro/metodo";
import { traduzirPg, type Res } from "@/lib/crm/comum";
import { diaNoMes, hojeBr, mesPorExtenso, somarDias, somarMeses } from "@/lib/dinheiro";
import { parcelasPadrao, precificar, proximoNumero, totais, type ItemTabela, type Variavel } from "@/lib/orcamento/motor";
import { gravarEscala, gravarFreela, lerValores } from "@/lib/freelas/servidor";
import type { LinhaOrc } from "@/lib/orcamento/orcamentos";
import { cifrarCampo } from "@/lib/freelas/pagamento";
import { adivinharCategoria, chaveDoEquipamento } from "@/lib/inventario/nomes";
import { ordemDaDiaria } from "@/lib/documentos/servidor";
import { CARDS_DEMO, CLIENTES_DEMO, PROJETOS_DEMO } from "./produtora";
import {
  EMPRESA_DEMO,
  EQUIPAMENTOS_DEMO,
  ESCALAS_AVULSAS_DEMO,
  EVENTOS_DEMO,
  FREELAS_DEMO,
  ITENS_DEMO,
  LANCAMENTOS_DEMO,
  MODELOS_DEMO,
  ORCAMENTOS_DEMO,
  PLANOS_DEMO,
  RECORRENCIAS_DEMO,
  ROTEIRO_DEMO,
  VARIAVEIS_DEMO,
} from "./operacao";
import { carregarRevisaoDemo } from "./revisao";
import { montarKits, montarMarca, montarPedidos } from "./comercial";

const { clients, projects, lotes, loteCards, auditLog } = schema;

export type Contagem = {
  clientes: number;
  projetos: number;
  cards: number;
  lotes: number;
  precos: number;
  orcamentos: number;
  lancamentos: number;
  freelas: number;
  equipamentos: number;
  reservas: number;
  eventos: number;
  documentos: number;
  pedidos: number;
  kits: number;
};
export const CONTAGEM_ZERO: Contagem = {
  clientes: 0,
  projetos: 0,
  cards: 0,
  lotes: 0,
  precos: 0,
  orcamentos: 0,
  lancamentos: 0,
  freelas: 0,
  equipamentos: 0,
  reservas: 0,
  eventos: 0,
  documentos: 0,
  pedidos: 0,
  kits: 0,
};
const soma = (c: Contagem) => Object.values(c).reduce((s, n) => s + n, 0);

const dia = (n: number, base = new Date()) => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return iso(d);
};

/** Uma transação por vez por organização: dois cliques ao mesmo tempo não montam duas produtoras. */
const travar = (tx: Tx, orgId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`maestro:demo:${orgId}`}))`);

async function tem(tx: Tx, tabela: string): Promise<boolean> {
  const [r] = (await tx.execute(sql.raw(`select exists (select 1 from maestro.${tabela} where demo) as tem`))) as unknown as { tem: boolean }[];
  return r.tem;
}

async function existeDemo(tx: Tx): Promise<boolean> {
  const [r] = (await tx.execute(sql`
    select exists (select 1 from maestro.clients where demo)
        or exists (select 1 from maestro.projects where demo)
        or exists (select 1 from maestro.lotes where demo)
        or exists (select 1 from maestro.cards where id like 'demo-%' and dados ->> 'demo' = 'true')
        or exists (select 1 from maestro.precos_itens where demo)
        or exists (select 1 from maestro.orcamentos where demo)
        or exists (select 1 from maestro.freelas where demo)
        or exists (select 1 from maestro.equipamentos where demo)
        or exists (select 1 from maestro.eventos where demo)
        or exists (select 1 from maestro.pedidos where demo) as tem`)) as unknown as { tem: boolean }[];
  return r.tem;
}

/** Há demonstração nesta organização? (o selo "Demonstração" aparece enquanto houver) */
export async function temDemonstracao(ctx: Contexto): Promise<boolean> {
  return getBanco().asUser(ctx, existeDemo);
}

/** A demonstração está completa (todos os módulos)? Falso = "Completar demonstração" faz sentido. */
export async function demonstracaoCompleta(ctx: Contexto): Promise<boolean> {
  return getBanco().asUser(ctx, async (tx) => {
    for (const t of ["clients", "precos_itens", "orcamentos", "freelas", "equipamentos", "eventos", "documentos", "pedidos", "freela_equipamentos"])
      if (!(await tem(tx, t))) return false;
    return true;
  });
}

/* ───────────── base: clientes, projetos, cards e lotes ───────────── */

async function montarBase(tx: Tx, ctx: Contexto, c: Contagem) {
  const idsClientes = await tx
    .insert(clients)
    .values(
      CLIENTES_DEMO.map((k) => ({
        orgId: ctx.orgId,
        name: k.nome,
        company: k.empresa,
        segment: k.segmento,
        city: k.cidade,
        contactName: k.contato,
        email: k.email,
        status: k.status,
        notes: k.notas,
        approver: { nome: k.contato, email: k.email },
        demo: true,
        createdBy: ctx.sub,
      })),
    )
    .returning({ id: clients.id })
    .then((l) => l.map((x) => x.id));

  // Código DEMO-AAAA-NNN: não ocupa a numeração MAE dos projetos de verdade; nunca liga ao HUB (unlinked).
  const ano = new Date().getFullYear();
  const idsProjetos = await tx
    .insert(projects)
    .values(
      PROJETOS_DEMO.map((p, i) => ({
        orgId: ctx.orgId,
        clientId: idsClientes[p.cliente],
        code: `DEMO-${ano}-${String(i + 1).padStart(3, "0")}`,
        title: p.titulo,
        category: p.categoria,
        status: p.status,
        startDate: p.inicio === null ? null : dia(p.inicio),
        dueDate: p.prazo === null ? null : dia(p.prazo),
        valueCents: p.valorCentavos,
        briefing: p.briefing,
        linkStatus: "unlinked" as const,
        demo: true,
        createdBy: ctx.sub,
      })),
    )
    .returning({ id: projects.id })
    .then((l) => l.map((x) => x.id));

  const sufixo = Math.random().toString(36).slice(2, 8);
  const agora = Date.now();
  const idsCards: string[] = [];
  for (const [i, k] of CARDS_DEMO.entries()) {
    const id = `demo-${sufixo}${String(i).padStart(2, "0")}`;
    const entrouNaColuna = agora - (CARDS_DEMO.length - i) * 3_600_000;
    const dados: Record<string, unknown> = {
      tema: k.tema,
      coluna: k.coluna,
      ordem: i,
      cliente: idsClientes[k.cliente],
      ...(k.projeto !== null ? { projeto: idsProjetos[k.projeto] } : {}),
      // Pauta = ideia sem responsável (o método); dali em diante, quem carregou a demonstração.
      ...(k.coluna !== "pauta" ? { resp: ctx.sub } : {}),
      ...(k.prazo !== null ? { prazo: dia(k.prazo) } : {}),
      ...(k.prioridade ? { prioridade: k.prioridade } : {}),
      ...(k.briefing ? { briefing: k.briefing } : {}),
      criadoEm: entrouNaColuna - 5 * 86_400_000,
      colunaEm: entrouNaColuna,
      criadoPor: ctx.sub,
      demo: true,
    };
    await tx.execute(sql`select 1 from maestro.card_criar(${id}, ${JSON.stringify(dados)}::jsonb)`);
    idsCards.push(id);
  }

  // Um lote enviado por cliente com cards em aprovação (o link do cliente chega com a revisão: nenhum é criado aqui).
  const porCliente = new Map<number, number[]>();
  CARDS_DEMO.forEach((k, i) => {
    if (k.coluna === "aprovacao") porCliente.set(k.cliente, [...(porCliente.get(k.cliente) ?? []), i]);
  });
  for (const [cliente, cardsDoLote] of porCliente) {
    const projeto = CARDS_DEMO[cardsDoLote[0]].projeto;
    const [l] = await tx
      .insert(lotes)
      .values({
        orgId: ctx.orgId,
        clientId: idsClientes[cliente],
        projectId: projeto !== null ? idsProjetos[projeto] : null,
        title: `Aprovação da semana: ${CLIENTES_DEMO[cliente].nome}`,
        objective: "Aprovar as peças antes do agendamento.",
        period: `${dia(0)} a ${dia(7)}`,
        status: "enviado",
        sentAt: new Date(agora - 86_400_000),
        demo: true,
        createdBy: ctx.sub,
      })
      .returning({ id: lotes.id });
    await tx.insert(loteCards).values(cardsDoLote.map((i, posicao) => ({ loteId: l.id, orgId: ctx.orgId, cardId: idsCards[i], posicao })));
    c.lotes++;
  }
  c.clientes += idsClientes.length;
  c.projetos += idsProjetos.length;
  c.cards += idsCards.length;
}

/** Os ids da base de demonstração, pelos nomes (serve também para completar uma demonstração antiga). */
async function referencias(tx: Tx) {
  const cl = (await tx.execute(sql`select id, name from maestro.clients where demo`)) as unknown as { id: string; name: string }[];
  const pr = (await tx.execute(sql`select id, title from maestro.projects where demo`)) as unknown as { id: string; title: string }[];
  return {
    cliente: (i: number) => cl.find((x) => x.name === CLIENTES_DEMO[i]?.nome)?.id ?? null,
    projeto: (i: number) => pr.find((x) => x.title === PROJETOS_DEMO[i]?.titulo)?.id ?? null,
  };
}
type Refs = Awaited<ReturnType<typeof referencias>>;

/* ───────────── módulos novos ───────────── */

async function montarPrecos(tx: Tx, ctx: Contexto, c: Contagem) {
  const ids: string[] = [];
  for (const [ordem, i] of ITENS_DEMO.entries()) {
    const [r] = (await tx.execute(sql`
      insert into maestro.precos_itens (org_id, grupo, nome, descricao, unidade, preco_cents, custo_cents, ordem, demo)
      values (${ctx.orgId}, ${i.grupo}, ${i.nome}, ${i.descricao ?? null}, ${i.unidade}, ${i.preco}, ${i.custo}, ${ordem}, true) returning id`)) as unknown as {
      id: string;
    }[];
    for (const [q, p] of i.faixas ?? []) {
      await tx.execute(sql`insert into maestro.precos_faixas (org_id, item_id, a_partir_de, preco_cents) values (${ctx.orgId}, ${r.id}, ${q}, ${p})`);
    }
    ids.push(r.id);
  }
  for (const [ordem, v] of VARIAVEIS_DEMO.entries()) {
    await tx.execute(sql`
      insert into maestro.precos_variaveis (org_id, chave, rotulo, tipo, opcoes, ordem, demo)
      values (${ctx.orgId}, ${v.chave}, ${v.rotulo}, ${v.tipo}, ${JSON.stringify(v.opcoes)}::jsonb, ${ordem}, true)
      on conflict (org_id, chave) do nothing`);
  }
  for (const m of MODELOS_DEMO) {
    const linhas = m.linhas.map((l) => ({ itemId: ids[l.item], qtd: l.qtd }));
    await tx.execute(sql`
      insert into maestro.orcamento_modelos (org_id, nome, nicho, descricao, linhas, respostas, demo)
      values (${ctx.orgId}, ${m.nome}, ${m.nicho}, ${m.descricao}, ${JSON.stringify(linhas)}::jsonb, ${JSON.stringify(m.respostas)}::jsonb, true)`);
  }
  c.precos += ITENS_DEMO.length;
}

/** A tabela de preços de demonstração lida do banco (para precificar os orçamentos de exemplo). */
async function tabelaDemo(tx: Tx): Promise<{ itens: (ItemTabela | null)[]; variaveis: Variavel[] }> {
  const its = (await tx.execute(sql`
    select i.id, i.grupo, i.nome, i.descricao, i.unidade, i.preco_cents::float8 as p, i.custo_cents::float8 as c,
           (select coalesce(json_agg(json_build_object('aPartirDe', f.a_partir_de, 'precoCents', f.preco_cents)), '[]') from maestro.precos_faixas f where f.item_id = i.id) as faixas
      from maestro.precos_itens i where i.demo`)) as unknown as {
    id: string;
    grupo: ItemTabela["grupo"];
    nome: string;
    descricao: string | null;
    unidade: string;
    p: number;
    c: number;
    faixas: { aPartirDe: number; precoCents: number }[];
  }[];
  const vars = (await tx.execute(sql`select chave, rotulo, tipo, opcoes from maestro.precos_variaveis`)) as unknown as Variavel[];
  return {
    itens: ITENS_DEMO.map((d) => {
      const i = its.find((x) => x.nome === d.nome);
      return i
        ? {
            id: i.id,
            grupo: i.grupo,
            nome: i.nome,
            descricao: i.descricao,
            unidade: i.unidade,
            precoCents: Number(i.p),
            custoCents: Number(i.c),
            ativo: true,
            faixas: i.faixas.map((f) => ({ aPartirDe: Number(f.aPartirDe), precoCents: Number(f.precoCents) })),
          }
        : null;
    }),
    variaveis: [...vars],
  };
}

async function baixar(tx: Tx, ctx: Contexto, lancamentoId: string, valor: number, data: string) {
  await tx.execute(sql`
    insert into maestro.baixas (org_id, lancamento_id, valor_cents, data, forma, created_by) values (${ctx.orgId}, ${lancamentoId}, ${valor}, ${data}, 'pix', ${ctx.sub})`);
}

async function montarOrcamentos(tx: Tx, ctx: Contexto, c: Contagem, refs: Refs, hoje: string) {
  const tabela = await tabelaDemo(tx);
  const ano = hoje.slice(0, 4);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`maestro:orcamento:${ctx.orgId}:${ano}`}))`);
  const existentes = (
    (await tx.execute(sql`select distinct numero from maestro.orcamentos where numero like ${`${ano}-%`}`)) as unknown as { numero: string }[]
  ).map((x) => x.numero);
  for (const o of ORCAMENTOS_DEMO) {
    const numero = proximoNumero(ano, existentes);
    existentes.push(numero);
    const linhas = o.linhas.flatMap((l): LinhaOrc[] => {
      if ("livre" in l)
        return [{ precoItemId: null, descricao: l.livre, detalhe: l.detalhe, quantidade: 1, unidade: l.unidade, precoCents: l.preco, custoCents: l.custo }];
      const item = tabela.itens[l.item];
      if (!item) return [];
      const { precoCents, detalhe } = precificar(item, l.qtd, tabela.variaveis, o.respostas);
      return [
        {
          precoItemId: item.id,
          descricao: item.nome,
          detalhe: [item.descricao, detalhe].filter(Boolean).join(" · ") || null,
          quantidade: l.qtd,
          unidade: item.unidade,
          precoCents,
          custoCents: item.custoCents,
        },
      ];
    });
    const emissao = somarDias(hoje, o.emissao);
    const versoes: { versao: number; status: string; linhas: typeof linhas; emissao: string }[] = o.versaoAnteriorRecusada
      ? [
          {
            versao: 1,
            status: "recusado",
            emissao: somarDias(emissao, -12),
            linhas: linhas.map((l) => ({ ...l, precoCents: Math.round(l.precoCents * 1.18) })),
          },
          { versao: 2, status: o.status, emissao, linhas },
        ]
      : [{ versao: 1, status: o.status, emissao, linhas }];
    for (const v of versoes) {
      const t = totais(v.linhas, o.desconto ?? 0, 0);
      const parcelas =
        o.status === "aprovado" && o.parcelas && v.status === "aprovado" ? parcelasPadrao(t.total, o.parcelas.n, somarDias(hoje, o.parcelas.desde)) : [];
      const projetoId = o.projeto !== null ? refs.projeto(o.projeto) : null;
      const clienteId = refs.cliente(o.cliente);
      const [q] = (await tx.execute(sql`
        insert into maestro.orcamentos (org_id, numero, versao, cliente_id, projeto_id, titulo, categoria, status, emissao, validade, periodo, escopo, pagamento,
                                        condicoes, desconto_cents, respostas, parcelas, enviado_em, decidido_em, demo, created_by)
        values (${ctx.orgId}, ${numero}, ${v.versao}, ${clienteId}, ${v.status === "aprovado" ? projetoId : null}, ${o.titulo}, ${o.categoria}, ${v.status},
                ${v.emissao}, ${somarDias(v.emissao, o.validadeDias)}, ${o.periodo ?? null}, ${o.escopo}, ${o.pagamento ?? null}, ${EMPRESA_DEMO.condicoes},
                ${o.desconto ?? 0}, ${JSON.stringify(o.respostas)}::jsonb, ${JSON.stringify(parcelas)}::jsonb,
                ${v.status === "rascunho" ? null : `${v.emissao}T12:00:00Z`},
                ${v.status === "aprovado" || v.status === "recusado" ? `${somarDias(v.emissao, 3)}T12:00:00Z` : null}, true, ${ctx.sub})
        returning id`)) as unknown as { id: string }[];
      for (const [ordem, l] of v.linhas.entries()) {
        await tx.execute(sql`
          insert into maestro.orcamento_itens (org_id, orcamento_id, preco_item_id, descricao, detalhe, quantidade, unidade, preco_cents, custo_cents, ordem)
          values (${ctx.orgId}, ${q.id}, ${l.precoItemId}, ${l.descricao}, ${l.detalhe}, ${l.quantidade}, ${l.unidade}, ${l.precoCents}, ${l.custoCents}, ${ordem})`);
      }
      c.orcamentos++;
      // Aprovado: o projeto fica com o valor do orçamento e as parcelas entram a receber (as vencidas, recebidas).
      if (parcelas.length && projetoId) {
        await tx.execute(sql`update maestro.projects set value_cents = ${t.total} where id = ${projetoId}`);
        const nome = CLIENTES_DEMO[o.cliente].nome;
        for (const [i, p] of parcelas.entries()) {
          const [l] = (await tx.execute(sql`
            insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento, parcela, projeto_id, cliente_id, orcamento_id, demo, created_by)
            values (${ctx.orgId}, 'entrada', 'cliente', ${`${nome} · ${p.rotulo}`}, ${p.valorCents}, ${p.vencimento}, ${`${i + 1}/${parcelas.length}`},
                    ${projetoId}, ${clienteId}, ${q.id}, true, ${ctx.sub})
            returning id`)) as unknown as { id: string }[];
          c.lancamentos++;
          if (p.vencimento < hoje) await baixar(tx, ctx, l.id, p.valorCents, p.vencimento);
        }
      }
    }
  }
}

async function montarFreelas(tx: Tx, ctx: Contexto, c: Contagem) {
  for (const f of FREELAS_DEMO) {
    const primeiro = f.nome.split(" ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const r = await gravarFreela(
      tx,
      ctx,
      {
        nome: f.nome,
        cidade: f.cidade,
        email: `${primeiro}.freela@exemplo.com`,
        whatsapp: null,
        instagram: null,
        funcoes: f.funcoes,
        nichos: f.nichos,
        whatsappMsg: null,
        notas: f.notas ?? null,
        ativo: f.ativo !== false,
        valores: lerValores(f.valores, f.funcoes) ?? [],
      },
      undefined,
      true,
    );
    if (!r.ok) continue;
    c.freelas++;
    // Só chave PIX aleatória (um UUID gerado agora): nenhum CPF, nenhum dado de gente de verdade.
    if (f.pix) {
      await tx.execute(sql`
        insert into maestro.freela_pagamento (org_id, freela_id, pix_enc, pix_tipo, titular, updated_by)
        values (${ctx.orgId}, ${r.id}, ${cifrarCampo(ctx.orgId, r.id, "pix", randomUUID())}, 'aleatoria', ${f.nome}, ${ctx.sub})`);
    }
  }
}

async function idsPorNome(tx: Tx, tabela: "freelas" | "equipamentos", nomes: string[]): Promise<(string | null)[]> {
  const r = (await tx.execute(sql.raw(`select id, nome from maestro.${tabela} where demo`))) as unknown as { id: string; nome: string }[];
  return nomes.map((n) => r.find((x) => x.nome === n)?.id ?? null);
}

async function montarInventario(tx: Tx, ctx: Contexto, c: Contagem, hoje: string) {
  const freelas = await idsPorNome(
    tx,
    "freelas",
    FREELAS_DEMO.map((f) => f.nome),
  );
  for (const [i, e] of EQUIPAMENTOS_DEMO.entries()) {
    const patrimonio = e.freela === undefined ? `PAT-${String(i + 1).padStart(3, "0")}` : null;
    await tx.execute(sql`
      insert into maestro.equipamentos (org_id, nome, chave, categoria, marca, patrimonio, compra_em, valor_cents, dono, freela_id, estado, local, km_l, demo)
      values (${ctx.orgId}, ${e.nome}, ${chaveDoEquipamento(e.nome)}, ${e.categoria ?? adivinharCategoria(e.nome)}, ${e.marca ?? null}, ${patrimonio},
              ${e.compra != null ? somarDias(hoje, e.compra) : null}, ${e.valor ?? null}, ${e.freela !== undefined ? "freela" : "produtora"},
              ${e.freela !== undefined ? freelas[e.freela] : null}, ${e.estado ?? "disponivel"}, ${e.local ?? (e.freela !== undefined ? null : "Estúdio")},
              ${e.kmL ?? null}, true)`);
    c.equipamentos++;
  }
}

async function montarAgenda(tx: Tx, ctx: Contexto, c: Contagem, refs: Refs, hoje: string) {
  const freelas = await idsPorNome(
    tx,
    "freelas",
    FREELAS_DEMO.map((f) => f.nome),
  );
  const equips = await idsPorNome(
    tx,
    "equipamentos",
    EQUIPAMENTOS_DEMO.map((e) => e.nome),
  );
  const diarias = (await tx.execute(sql`
    select v.freela_id, v.funcao, v.valor_cents::float8 as v from maestro.freela_valores v join maestro.freelas f on f.id = v.freela_id
     where f.demo and v.unidade = 'diaria'`)) as unknown as { freela_id: string; funcao: string; v: number }[];
  for (const ev of EVENTOS_DEMO) {
    const projetoId = ev.projeto !== null ? refs.projeto(ev.projeto) : null;
    const data = somarDias(hoje, ev.dia);
    const fim = ev.ate != null ? somarDias(hoje, ev.ate) : null;
    const [r] = (await tx.execute(sql`
      insert into maestro.eventos (org_id, projeto_id, tipo, titulo, data, data_fim, hora_ini, hora_fim, local, cor, demo, created_by)
      values (${ctx.orgId}, ${projetoId}, ${ev.tipo}, ${ev.titulo}, ${data}, ${fim}, ${ev.hora ?? null}, ${ev.horaFim ?? null}, ${ev.local ?? null},
              ${ev.cor ?? null}, true, ${ctx.sub})
      returning id`)) as unknown as { id: string }[];
    c.eventos++;
    for (const [fi, funcao] of ev.equipe ?? []) {
      const freelaId = freelas[fi];
      if (!freelaId) continue;
      const d = diarias.filter((x) => x.freela_id === freelaId);
      const diaria = (d.find((x) => x.funcao === funcao) ?? d[0])?.v ?? 0;
      await gravarEscala(
        tx,
        ctx,
        { projetoId, eventoId: r.id, freelaId, funcao, inicio: data, fim: fim ?? data, diariaCents: diaria, valorCents: null, notas: null },
        undefined,
        true,
      );
    }
    for (const ei of ev.equipamentos ?? []) {
      const equipamentoId = equips[ei];
      if (!equipamentoId) continue;
      const passou = (fim ?? data) < hoje;
      await tx.execute(sql`
        insert into maestro.reservas (org_id, equipamento_id, projeto_id, evento_id, inicio, fim, saida_em, retorno_em, demo, created_by)
        values (${ctx.orgId}, ${equipamentoId}, ${projetoId}, ${r.id}, ${data}, ${fim ?? data},
                ${passou ? `${data}T08:00:00Z` : null}, ${passou ? `${fim ?? data}T22:00:00Z` : null}, true, ${ctx.sub})`);
      c.reservas++;
    }
  }
  for (const [fi, pi, funcao, de, ate, total] of ESCALAS_AVULSAS_DEMO) {
    const freelaId = freelas[fi];
    if (!freelaId) continue;
    await gravarEscala(
      tx,
      ctx,
      {
        projetoId: refs.projeto(pi),
        eventoId: null,
        freelaId,
        funcao,
        inicio: somarDias(hoje, de),
        fim: somarDias(hoje, ate),
        diariaCents: null,
        valorCents: total,
        notas: null,
      },
      undefined,
      true,
    );
  }
}

async function montarFinanceiro(tx: Tx, ctx: Contexto, c: Contagem, refs: Refs, hoje: string) {
  for (const l of LANCAMENTOS_DEMO) {
    const [r] = (await tx.execute(sql`
      insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento, parcela, projeto_id, cliente_id, demo, created_by)
      values (${ctx.orgId}, ${l.tipo}, ${l.categoria}, ${l.descricao}, ${l.valor}, ${somarDias(hoje, l.dia)}, ${l.parcela ?? null},
              ${l.projeto != null ? refs.projeto(l.projeto) : null}, ${l.cliente != null ? refs.cliente(l.cliente) : null}, true, ${ctx.sub})
      returning id`)) as unknown as { id: string }[];
    c.lancamentos++;
    if (l.pagoEm != null) await baixar(tx, ctx, r.id, l.valor, somarDias(hoje, l.pagoEm));
  }
  // Recorrências desde 3 meses atrás, com o que já foi gerado até 2 meses à frente (o futuro fica previsto, em aberto).
  const mes = hoje.slice(0, 7);
  for (const rec of RECORRENCIAS_DEMO) {
    const clienteId = rec.cliente != null ? refs.cliente(rec.cliente) : null;
    const [r] = (await tx.execute(sql`
      insert into maestro.recorrencias (org_id, tipo, categoria, descricao, valor_cents, dia, cliente_id, inicio_mes, demo, created_by)
      values (${ctx.orgId}, ${rec.tipo}, ${rec.categoria}, ${rec.descricao}, ${rec.valor}, ${rec.dia}, ${clienteId}, ${somarMeses(mes, -3)}, true, ${ctx.sub})
      returning id`)) as unknown as { id: string }[];
    for (let n = -3; n <= 2; n++) {
      const m = somarMeses(mes, n);
      const venc = diaNoMes(m, rec.dia);
      const [l] = (await tx.execute(sql`
        insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento, competencia, cliente_id, recorrencia_id, demo, created_by)
        values (${ctx.orgId}, ${rec.tipo}, ${rec.categoria}, ${`${rec.descricao} · ${mesPorExtenso(m)}`}, ${rec.valor}, ${venc}, ${m}, ${clienteId}, ${r.id}, true, ${ctx.sub})
        returning id`)) as unknown as { id: string }[];
      c.lancamentos++;
      if (venc < hoje) await baixar(tx, ctx, l.id, rec.valor, venc);
      await tx.execute(sql`
        insert into maestro.recorrencia_execucoes (org_id, recorrencia_id, mes, lancamento_id) values (${ctx.orgId}, ${r.id}, ${m}, ${l.id})`);
    }
  }
  // Pagamentos de freela que já venceram: pagos dois dias depois, menos um (fica atrasado, para a tela mostrar).
  const devidos = (await tx.execute(sql`
    select l.id, l.valor_cents::float8 as v, l.vencimento::text as d, f.nome
      from maestro.lancamentos l join maestro.freelas f on f.id = l.freela_id
     where l.demo and l.escala_id is not null and l.pago_cents = 0 and l.vencimento < ${somarDias(hoje, -2)}::date
     order by l.vencimento`)) as unknown as { id: string; v: number; d: string; nome: string }[];
  for (const d of devidos) {
    if (d.nome === "Caio Bastos" && d.d > somarDias(hoje, -25)) continue;
    await baixar(tx, ctx, d.id, d.v, somarDias(d.d, 2) < hoje ? somarDias(d.d, 2) : hoje);
  }
}

async function montarDocumentos(tx: Tx, ctx: Contexto, c: Contagem, refs: Refs, hoje: string) {
  const ev = (await tx.execute(sql`select id, titulo, projeto_id, data::text from maestro.eventos where demo`)) as unknown as {
    id: string;
    titulo: string;
    projeto_id: string | null;
    data: string;
  }[];
  const evento = (t: string) => ev.find((e) => e.titulo === t);
  const inserir = async (projetoId: string | null, tipo: string, titulo: string, data: string | null, eventoId: string | null, conteudo: unknown) => {
    if (!projetoId) return;
    await tx.execute(sql`
      insert into maestro.documentos (org_id, projeto_id, evento_id, tipo, titulo, data, conteudo, demo, created_by)
      values (${ctx.orgId}, ${projetoId}, ${eventoId}, ${tipo}, ${titulo}, ${data}, ${JSON.stringify(conteudo)}::jsonb, true, ${ctx.sub})`);
    c.documentos++;
  };
  const checklistDe = async (eventoId: string) => {
    const itens = (await tx.execute(sql`
      select q.nome from maestro.reservas r join maestro.equipamentos q on q.id = r.equipamento_id where r.evento_id = ${eventoId} order by q.nome`)) as unknown as {
      nome: string;
    }[];
    return { itens: itens.map((i) => ({ nome: i.nome, qtd: 1, saiu: false, voltou: false })) };
  };
  const fazenda = evento("Safra 2027: fazenda");
  if (fazenda) {
    const ordem = await ordemDaDiaria(tx, fazenda.id);
    if (ordem) {
      ordem.localUrl = "https://www.openstreetmap.org/";
      ordem.cronograma = [
        { hora: "05:00", atividade: "Saída do estúdio (Ducato)", obs: "Equipamento carregado na véspera" },
        { hora: "06:00", atividade: "Chegada e café", obs: "" },
        { hora: "06:30", atividade: "Cena 1: cafezal no amanhecer", obs: "Drone primeiro, luz baixa" },
        { hora: "09:30", atividade: "Cena 1: detalhes da colheita", obs: "" },
        { hora: "12:00", atividade: "Almoço", obs: "Na sede da fazenda" },
        { hora: "14:00", atividade: "Cena 2: terreiro", obs: "Slider e top shot" },
        { hora: "17:30", atividade: "Golden hour e encerramento", obs: "" },
      ];
      ordem.contatos = [{ nome: "Juliana Prado", funcao: "Cliente · Café Serra Alta", telefone: "" }];
      ordem.notas = "Levar protetor solar e capa de chuva. Autorização de imagem dos colhedores com a produção.";
    }
    await inserir(fazenda.projeto_id, "ordem_do_dia", "Ordem do dia: fazenda (dia 1)", fazenda.data, fazenda.id, ordem ?? {});
    await inserir(fazenda.projeto_id, "checklist", "Checklist: fazenda", fazenda.data, fazenda.id, await checklistDe(fazenda.id));
  }
  await inserir(refs.projeto(0), "roteiro", "Roteiro do filme de 60s", null, null, { texto: ROTEIRO_DEMO });
  await inserir(refs.projeto(0), "decupagem", "Decupagem: cenas 1 a 4", null, null, {
    planos: PLANOS_DEMO.map((p, i) => ({ ...p, feito: i < 2 })),
  });
  const externa = evento("Lookbook verão: externa");
  if (externa) {
    await inserir(externa.projeto_id, "checklist", "Checklist: externa no parque", externa.data, externa.id, await checklistDe(externa.id));
    const ordem = await ordemDaDiaria(tx, externa.id);
    await inserir(externa.projeto_id, "ordem_do_dia", "Ordem do dia: externa", externa.data, externa.id, ordem ?? {});
  }
  const estudio = evento("Diária de estúdio: lookbook");
  if (estudio) {
    const lista = await checklistDe(estudio.id);
    await inserir(estudio.projeto_id, "checklist", "Checklist: estúdio", estudio.data, estudio.id, {
      itens: lista.itens.map((i) => ({ ...i, saiu: true, voltou: true })),
    });
  }
  const pais = evento("Depoimentos de pais");
  if (pais) await inserir(pais.projeto_id, "ordem_do_dia", "Ordem do dia: depoimentos", pais.data, pais.id, (await ordemDaDiaria(tx, pais.id)) ?? {});
  void hoje;
}

/** Preenche os dados da empresa só se a organização ainda não tem nenhum (marcados como da demonstração). */
async function montarEmpresa(tx: Tx, ctx: Contexto) {
  await tx.execute(sql`
    update maestro.organizations set settings = settings || jsonb_build_object('empresa', ${JSON.stringify(EMPRESA_DEMO)}::jsonb)
     where id = ${ctx.orgId} and not (settings ? 'empresa')`);
}

/** Carrega (ou completa) a produtora de exemplo. Nada a fazer = `criou: false`. */
export async function carregarDemonstracao(ctx: Contexto, hoje = hojeBr()): Promise<Res<{ criou: boolean; contagem: Contagem }>> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      await travar(tx, ctx.orgId);
      const c: Contagem = { ...CONTAGEM_ZERO };
      if (!(await tem(tx, "clients")) && !(await tem(tx, "projects"))) await montarBase(tx, ctx, c);
      const refs = await referencias(tx);
      if (!(await tem(tx, "precos_itens"))) await montarPrecos(tx, ctx, c);
      if (!(await tem(tx, "freelas"))) await montarFreelas(tx, ctx, c);
      if (!(await tem(tx, "equipamentos"))) await montarInventario(tx, ctx, c, hoje);
      if (!(await tem(tx, "eventos"))) await montarAgenda(tx, ctx, c, refs, hoje);
      if (!(await tem(tx, "orcamentos"))) await montarOrcamentos(tx, ctx, c, refs, hoje);
      if (!(await tem(tx, "recorrencias"))) await montarFinanceiro(tx, ctx, c, refs, hoje);
      if (!(await tem(tx, "documentos"))) await montarDocumentos(tx, ctx, c, refs, hoje);
      // Kit dos freelas, pedidos pelo link (um orçado e um aceito que virou projeto e parcelas) e a marca (fases 11 e 14).
      if (!(await tem(tx, "freela_equipamentos"))) c.kits += await montarKits(tx, ctx);
      c.pedidos += await montarPedidos(tx, ctx, hoje);
      const marca = await montarMarca(tx, ctx);
      // Aprovações (versões, comentários, decisões e link dos lotes): idempotente, completa uma demonstração antiga.
      const versoes = await carregarRevisaoDemo(tx, ctx);
      const criou = soma(c) > 0 || versoes > 0 || marca;
      if (criou) {
        await montarEmpresa(tx, ctx);
        await tx
          .insert(auditLog)
          .values({ orgId: ctx.orgId, actorSub: ctx.sub, action: "demo.carregou", targetType: "organization", targetId: ctx.orgId, metadata: c });
      }
      return { ok: true as const, criou, contagem: c };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}

async function apagar(tx: Tx, tabela: string): Promise<number> {
  const r = await tx.execute(sql.raw(`delete from maestro.${tabela} where demo returning 1`));
  return r.length;
}

/** Tira a demonstração: tudo o que é `demo` desta organização, em todos os módulos. Nada mais. */
export async function removerDemonstracao(ctx: Contexto): Promise<Res<{ contagem: Contagem }>> {
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      await travar(tx, ctx.orgId);
      const c: Contagem = { ...CONTAGEM_ZERO };
      c.pedidos = await apagar(tx, "pedidos");
      await apagar(tx, "links_publicos");
      const marca = await apagar(tx, "org_marca");
      c.kits = await apagar(tx, "freela_equipamentos");
      c.documentos = await apagar(tx, "documentos");
      c.reservas = await apagar(tx, "reservas");
      c.lancamentos = await apagar(tx, "lancamentos");
      await apagar(tx, "recorrencias");
      await apagar(tx, "escalas");
      c.eventos = await apagar(tx, "eventos");
      c.equipamentos = await apagar(tx, "equipamentos");
      c.freelas = await apagar(tx, "freelas");
      c.orcamentos = await apagar(tx, "orcamentos");
      await apagar(tx, "orcamento_modelos");
      await apagar(tx, "precos_variaveis");
      c.precos = await apagar(tx, "precos_itens");
      const [{ n: cards }] = (await tx.execute(sql`select maestro.demo_apagar_cards() as n`)) as unknown as { n: number }[];
      c.cards = Number(cards);
      c.lotes = await apagar(tx, "lotes");
      c.projetos = await apagar(tx, "projects");
      c.clientes = await apagar(tx, "clients");
      if (soma(c) > 0 || marca > 0) {
        await tx.execute(sql`
          update maestro.organizations set settings = settings - 'empresa'
           where id = ${ctx.orgId} and settings -> 'empresa' ->> 'demo' = 'true'`);
        await tx
          .insert(auditLog)
          .values({ orgId: ctx.orgId, actorSub: ctx.sub, action: "demo.removeu", targetType: "organization", targetId: ctx.orgId, metadata: c });
      }
      return { ok: true as const, contagem: c };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}
