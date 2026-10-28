// Pedido público e aceite do orçamento (drizzle/0012, fase 14): token só como sha256, revogação, validade, armadilha,
// tempo mínimo, consentimento e limites no pedido; "Gerar orçamento" pelo motor com as respostas do pedido; link do
// orçamento só para administração e gestão; aceite idempotente que abre projeto, cliente e parcelas; duas organizações.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { pedido, prepararAmbiente } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("pedidos");
const { getBanco } = amb.banco;
const { hashToken } = await import("../src/lib/auth/cripto");
const eq = await import("../src/lib/pedidos/equipe");
const pub = await import("../src/lib/pedidos/publico");
const form = await import("../src/lib/pedidos/formulario");
const lk = await import("../src/lib/orcamento/link");
const { obterOrcamento, novaVersao } = await import("../src/lib/orcamento/orcamentos");
const { aplicarModelo, totais } = await import("../src/lib/orcamento/motor");
const { lerTabela } = await import("../src/lib/orcamento/precos");
const { rotaPedido, rotaAceitar } = await import("../src/lib/publico/rotas");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
const ids: Record<string, string> = {};
const HOJE = new Date().toISOString().slice(0, 10);

const CONFIG = { perguntas: form.PERGUNTAS_PADRAO, boasVindas: "Conte o que você precisa." };
let ipN = 0;
const ip = () => `10.1.0.${++ipN}`;
const selo = (token: string) => pub.seloDoFormulario(token, Date.now() - 10_000);
const contar = async (q: ReturnType<typeof sql>) => ((await getBanco().asSystem("teste", (tx) => tx.execute(q))) as unknown as { n: number }[])[0].n;

before(async () => {
  o = await duasOrganizacoes();
  await getBanco().asSystem("semente", async (tx) => {
    const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0].id;
    const A = o.orgA;
    ids.diaria = await um(
      sql`insert into maestro.precos_itens (org_id, grupo, nome, unidade, preco_cents, custo_cents) values (${A}, 'captacao', 'Diária', 'diaria', 100000, 50000) returning id`,
    );
    ids.edicao = await um(
      sql`insert into maestro.precos_itens (org_id, grupo, nome, unidade, preco_cents, custo_cents) values (${A}, 'pos', 'Edição', 'video', 50000, 20000) returning id`,
    );
    await tx.execute(sql`insert into maestro.precos_faixas (org_id, item_id, a_partir_de, preco_cents) values (${A}, ${ids.edicao}, 4, 40000)`);
    await tx.execute(sql`
      insert into maestro.precos_variaveis (org_id, chave, rotulo, tipo, opcoes, ordem) values
        (${A}, 'nicho', 'Nicho', 'escolha', ${JSON.stringify([
          { valor: "corporativo", rotulo: "Corporativo", mult: 1 },
          { valor: "casamento", rotulo: "Casamento", mult: 1.3 },
        ])}::jsonb, 0),
        (${A}, 'videos', 'Vídeos', 'numero', '[]'::jsonb, 1),
        (${A}, 'diarias', 'Diárias', 'numero', '[]'::jsonb, 2)`);
    ids.modelo = await um(sql`
      insert into maestro.orcamento_modelos (org_id, nome, nicho, linhas, respostas) values (${A}, 'Filme', 'corporativo',
        ${JSON.stringify([
          { itemId: ids.diaria, qtd: { var: "diarias", min: 1 } },
          { itemId: ids.edicao, qtd: { var: "videos" } },
        ])}::jsonb, ${JSON.stringify({ nicho: "corporativo", diarias: 1, videos: 1 })}::jsonb) returning id`);
    await tx.execute(sql`insert into maestro.org_marca (org_id, nome, telefone, cor) values (${A}, 'Lumen Filmes', '(11) 98888-7777', '#1f6feb')`);
  });
});
after(() => amb.fechar());

describe("link de pedido", () => {
  test("só administração e gestão criam; o banco guarda só o sha256 e a cópia cifrada", async () => {
    assert.equal((await eq.criarLinkDePedido(o.equipe, CONFIG)).ok, false);
    assert.equal((await eq.criarLinkDePedido(o.leitura, CONFIG)).ok, false);
    const r = await eq.criarLinkDePedido(o.gestor, CONFIG);
    assert.ok(r.ok);
    if (!r.ok) return;
    ids.token = r.token;
    assert.match(r.token, /^[A-Za-z0-9_-]{43}$/);
    const [l] = (await getBanco().asSystem("teste", (tx) => tx.execute(sql`select token_hash, token_enc from maestro.links_publicos`))) as unknown as {
      token_hash: string;
      token_enc: string;
    }[];
    assert.equal(l.token_hash, hashToken(r.token));
    assert.ok(!l.token_enc.includes(r.token), "nunca em claro");
    const lido = await eq.lerLinkDePedido(o.admin);
    assert.equal(lido?.token, r.token, "a equipe copia de novo");
    assert.equal(await eq.lerLinkDePedido(o.equipe), null, "a equipe não vê o link");
  });

  test("o formulário traz a marca, os tipos e as variáveis sem preço nem multiplicador", async () => {
    const a = await pub.abrirFormulario(ids.token, ip());
    assert.equal(a.estado, "ok");
    if (a.estado !== "ok") return;
    assert.equal(a.form.marca.nome, "Lumen Filmes");
    assert.deepEqual(
      a.form.modelos.map((m) => m.nome),
      ["Filme"],
    );
    const txt = JSON.stringify(a.form);
    assert.ok(!/mult|preco|custo/.test(txt), "nada de conta interna");
    assert.equal((await pub.abrirFormulario("x".repeat(43), ip())).estado, "morto");
    assert.equal((await pub.abrirFormulario("curto", ip())).estado, "morto");
  });
});

describe("enviar o pedido", () => {
  const corpo = (extra: Record<string, unknown> = {}) => ({
    selo: selo(ids.token),
    nome: "Carla Souza",
    empresa: "Café Aurora",
    email: "carla@exemplo.com",
    whatsapp: "(11) 97777-6666",
    consentimento: true,
    idem: `idem-${Math.random().toString(36).slice(2, 12)}`,
    respostas: {
      modelo: ids.modelo,
      nicho: "casamento",
      vars: { videos: 5, diarias: 2 },
      inicio: "2026-12-10",
      fim: "2026-12-11",
      local: "São Paulo",
      investimento: "15-40k",
      ideia: "Filme do casamento.",
    },
    ...extra,
  });

  test("armadilha: finge que deu certo e não grava", async () => {
    const r = await pub.enviarPedido(ids.token, corpo({ site: "http://spam" }), ip());
    assert.ok(r.ok);
    assert.equal(await contar(sql`select count(*)::int as n from maestro.pedidos`), 0);
  });

  test("tempo mínimo, selo adulterado e consentimento", async () => {
    const rapido = await pub.enviarPedido(ids.token, corpo({ selo: pub.seloDoFormulario(ids.token) }), ip());
    assert.ok(!rapido.ok && rapido.erro === "rapido");
    const [t, s] = selo(ids.token).split(".");
    const adulterado = await pub.enviarPedido(ids.token, corpo({ selo: `${Number(t) - 1000}.${s}` }), ip());
    assert.ok(!adulterado.ok && adulterado.erro === "selo");
    const outroLink = await pub.enviarPedido(ids.token, corpo({ selo: pub.seloDoFormulario("y".repeat(43), Date.now() - 10_000) }), ip());
    assert.ok(!outroLink.ok && outroLink.erro === "selo", "o selo é preso ao link");
    const sem = await pub.enviarPedido(ids.token, corpo({ consentimento: false }), ip());
    assert.ok(!sem.ok && sem.erros?.consentimento);
    const semContato = await pub.enviarPedido(ids.token, corpo({ email: "", whatsapp: "" }), ip());
    assert.ok(!semContato.ok && semContato.erros?.whatsapp);
    const modeloFalso = await pub.enviarPedido(ids.token, corpo({ respostas: { modelo: "00000000-0000-4000-8000-000000000000", vars: {} } }), ip());
    assert.ok(!modeloFalso.ok && modeloFalso.erros?.modelo);
  });

  test("grava com protocolo; a mesma chave do aparelho não duplica; WhatsApp da produtora", async () => {
    const c = corpo();
    const r = await pub.enviarPedido(ids.token, c, ip());
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.match(r.protocolo, /^[A-Z0-9]{8}$/);
    assert.match(r.whatsapp ?? "", /^https:\/\/wa\.me\/5511988887777\?text=/);
    const de_novo = await pub.enviarPedido(ids.token, { ...c, selo: selo(ids.token) }, ip());
    assert.ok(de_novo.ok && de_novo.protocolo === r.protocolo);
    assert.equal(await contar(sql`select count(*)::int as n from maestro.pedidos`), 1);
    const [p] = (await getBanco().asSystem("teste", (tx) => tx.execute(sql`select * from maestro.pedidos`))) as unknown as Record<string, unknown>[];
    assert.equal(p.whatsapp, "11977776666");
    assert.match(String(p.ip_hash), /^[0-9a-f]{64}$/, "o IP só como HMAC");
    ids.pedido = p.id as string;
  });

  test("limite: 5 por hora por IP", async () => {
    const mesmo = "10.9.9.9";
    const res: boolean[] = [];
    for (let i = 0; i < 6; i++) res.push((await pub.enviarPedido(ids.token, corpo(), mesmo)).ok);
    assert.deepEqual(res, [true, true, true, true, true, false]);
  });

  test("a rota confere a origem e devolve o protocolo", async () => {
    const outra = await rotaPedido(pedido("/api/publico/pedido", { corpo: { token: ids.token, ...corpo() }, origin: "https://malvado.exemplo", ip: ip() }));
    assert.equal(outra.status, 403);
    const boa = await rotaPedido(pedido("/api/publico/pedido", { corpo: { token: ids.token, ...corpo() }, ip: ip() }));
    assert.equal(boa.status, 200);
    assert.match(((await boa.json()) as { protocolo: string }).protocolo, /^[A-Z0-9]{8}$/);
  });

  test("a B e a forjada não veem os pedidos da A; a equipe vê; leitura não muda", async () => {
    assert.equal((await eq.listarPedidos(o.b)).length, 0);
    assert.equal((await eq.listarPedidos(o.forjado)).length, 0);
    assert.ok((await eq.listarPedidos(o.equipe)).length >= 1);
    assert.equal((await eq.mudarStatusPedido(o.leitura, ids.pedido, "recusado")).ok, false);
    assert.equal(await eq.obterPedido(o.b, ids.pedido), null);
  });

  test("revogar: o link morre na hora", async () => {
    const r = await eq.criarLinkDePedido(o.admin, CONFIG);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal((await pub.abrirFormulario(ids.token, ip())).estado, "morto", "criar outro troca o anterior");
    ids.token = r.token;
    assert.ok((await eq.revogarLinkDePedido(o.admin)).ok);
    assert.equal((await pub.abrirFormulario(r.token, ip())).estado, "morto");
    const env = await pub.enviarPedido(r.token, { ...corpo(), selo: selo(r.token) }, ip());
    assert.ok(!env.ok && env.status === 404);
  });
});

describe("gerar orçamento a partir do pedido", () => {
  test("o motor monta as linhas com as respostas do cliente; o cliente nasce lead; idempotente", async () => {
    const r = await eq.gerarOrcamentoDoPedido(o.equipe, ids.pedido, HOJE);
    assert.ok(r.ok && r.novo);
    if (!r.ok) return;
    ids.orc = r.orcamentoId;
    const q = await obterOrcamento(o.admin, r.orcamentoId, HOJE);
    assert.ok(q);
    // Casamento ×1,3; 2 diárias e 5 vídeos (faixa de 4+ na edição).
    const tabela = await getBanco().asUser(o.admin, lerTabela);
    const esperado = aplicarModelo(tabela.modelos[0], { nicho: "casamento", diarias: 2, videos: 5 }, tabela.itens, tabela.variaveis);
    assert.deepEqual(
      q!.itens.map((i) => [i.descricao, i.quantidade, i.precoCents]),
      esperado.map((i) => [i.descricao, i.quantidade, i.precoCents]),
    );
    assert.deepEqual(
      q!.itens.map((i) => i.precoCents),
      [130000, 52000],
    );
    assert.equal(q!.titulo, "Filme · Café Aurora");
    assert.match(q!.escopo ?? "", /Filme do casamento\.\nEntregas: Vídeos: 5 · Diárias: 2/);
    assert.equal(q!.periodo, "10/12/2026 a 11/12/2026");
    assert.match(q!.notasInternas ?? "", /investimento previsto: R\$ 15 a 40 mil/);
    const p = await eq.obterPedido(o.admin, ids.pedido);
    assert.equal(p?.status, "em_orcamento");
    assert.equal(p?.orcamento?.id, r.orcamentoId);
    const [c] = (await getBanco().asSystem("t", (tx) => tx.execute(sql`select status, name from maestro.clients where id = ${p!.clienteId}`))) as unknown as {
      status: string;
      name: string;
    }[];
    assert.deepEqual(c, { status: "lead", name: "Café Aurora" });
    const de_novo = await eq.gerarOrcamentoDoPedido(o.admin, ids.pedido, HOJE);
    assert.ok(de_novo.ok && !de_novo.novo && de_novo.orcamentoId === r.orcamentoId);
    assert.equal((await eq.gerarOrcamentoDoPedido(o.b, ids.pedido, HOJE)).ok, false, "a B não acha o pedido");
  });

  test("rascunhoDoPedido sem modelo usa o do nicho e o título do cliente", () => {
    const r = form.rascunhoDoPedido(
      { protocolo: "ABC12345", nome: "João", empresa: null, respostas: { tipo: "Outro", nicho: "corporativo", vars: { videos: 2 } } },
      [{ id: "m1", nome: "Institucional", nicho: "corporativo", respostas: { diarias: 1 }, ativo: true }],
      [],
    );
    assert.equal(r.modeloId, "m1");
    assert.deepEqual(r.respostas, { diarias: 1, nicho: "corporativo", videos: 2 });
    assert.equal(r.titulo, "Institucional · João");
  });
});

describe("link do orçamento e aceite", () => {
  test("só administração e gestão geram; o rascunho vira enviado com as parcelas", async () => {
    assert.equal((await lk.gerarLinkDoOrcamento(o.equipe, ids.orc, 2, HOJE)).ok, false);
    const r = await lk.gerarLinkDoOrcamento(o.gestor, ids.orc, 2, HOJE);
    assert.ok(r.ok);
    if (!r.ok) return;
    ids.otoken = r.token;
    const q = await obterOrcamento(o.admin, ids.orc, HOJE);
    assert.equal(q?.status, "enviado");
    assert.equal(q?.parcelas.length, 2);
    assert.equal(
      q!.parcelas.reduce((s, p) => s + p.valorCents, 0),
      totais(q!.itens).total,
    );
    assert.equal((await lk.lerLinkDoOrcamento(o.admin, ids.orc))?.token, r.token);
  });

  test("o cliente vê o timbrado sem custo nem margem", async () => {
    const a = await lk.abrirOrcamentoDoCliente(ids.otoken, ip());
    assert.equal(a.estado, "ok");
    if (a.estado !== "ok") return;
    assert.equal(a.dados.doc.total, 520000, "2 diárias × 1.300 + 5 vídeos × 520");
    assert.equal(a.dados.doc.empresa.fantasia, "Lumen Filmes");
    assert.equal(a.dados.doc.para?.nome, "Café Aurora");
    assert.ok(!/custo|margem|notas|interna/i.test(JSON.stringify(a.dados)), "nada interno");
  });

  test("aceite: confere nome e aceite; abre projeto, ativa o cliente e lança as parcelas uma vez só", async () => {
    const sem = await lk.aceitarOrcamento(ids.otoken, { nome: "", aceite: true }, ip(), "teste");
    assert.ok(!sem.ok && sem.erro === "nome");
    const semAceite = await lk.aceitarOrcamento(ids.otoken, { nome: "Carla Souza", aceite: false }, ip(), "teste");
    assert.ok(!semAceite.ok && semAceite.erro === "aceite");
    const res = await rotaAceitar(pedido("/api/publico/orcamento/aceitar", { corpo: { token: ids.otoken, nome: "Carla Souza", aceite: true }, ip: ip() }));
    assert.equal(res.status, 200);
    const de_novo = await lk.aceitarOrcamento(ids.otoken, { nome: "Outra Pessoa", aceite: true }, ip(), "teste");
    assert.ok(de_novo.ok && de_novo.repetido && de_novo.nome === "Carla Souza");
    const q = await obterOrcamento(o.admin, ids.orc, HOJE);
    assert.equal(q?.status, "aprovado");
    assert.ok(q?.projetoId);
    const lanc = (await getBanco().asUser(o.admin, (tx) =>
      tx.execute(sql`select valor_cents::int as v, parcela, vencimento::text as d from maestro.lancamentos where orcamento_id = ${ids.orc} order by parcela`),
    )) as unknown as { v: number; parcela: string; d: string }[];
    assert.deepEqual(
      lanc.map((l) => l.parcela),
      ["1/2", "2/2"],
    );
    assert.equal(
      lanc.reduce((s, l) => s + l.v, 0),
      520000,
    );
    assert.equal(lanc[0].d, HOJE);
    const [p] = (await getBanco().asSystem("t", (tx) =>
      tx.execute(
        sql`select p.code, p.value_cents::int as v, c.status from maestro.projects p join maestro.clients c on c.id = p.client_id where p.id = ${q!.projetoId}`,
      ),
    )) as unknown as { code: string; v: number; status: string }[];
    assert.match(p.code, /^MAE-\d{4}-\d{3}$/);
    assert.equal(p.v, 520000);
    assert.equal(p.status, "ativo", "o lead virou cliente");
    assert.equal((await eq.obterPedido(o.admin, ids.pedido))?.status, "virou_projeto");
    assert.equal(await contar(sql`select count(*)::int as n from maestro.projects`), 1);
    const [ac] = (await getBanco().asSystem("t", (tx) => tx.execute(sql`select aceite from maestro.orcamentos where id = ${ids.orc}`))) as unknown as {
      aceite: Record<string, string>;
    }[];
    assert.match(ac.aceite.hash, /^[0-9a-f]{64}$/);
    assert.match(ac.aceite.ip, /^[0-9a-f]{64}$/);
  });

  test("orçamento sem cliente: o aceite cria o cliente; versão nova barra o aceite; ajuste; vencido e revogado morrem", async () => {
    const [q] = (await getBanco().asSystem("t", async (tx) => {
      const r = (await tx.execute(sql`
        insert into maestro.orcamentos (org_id, numero, titulo, validade) values (${o.orgA}, '2026-090', 'Sem cliente', ${HOJE}) returning id`)) as unknown as {
        id: string;
      }[];
      await tx.execute(
        sql`insert into maestro.orcamento_itens (org_id, orcamento_id, descricao, quantidade, preco_cents) values (${o.orgA}, ${r[0].id}, 'Item', 3, 3333)`,
      );
      return r;
    })) as unknown as { id: string }[];
    const g = await lk.gerarLinkDoOrcamento(o.admin, q.id, 3, HOJE);
    assert.ok(g.ok);
    if (!g.ok) return;
    const aj = await lk.pedirAjusteDoOrcamento(g.token, { nome: "Rui", texto: "Dá para tirar um item?" }, ip());
    assert.ok(aj.ok);
    const ficha = await obterOrcamento(o.admin, q.id, HOJE);
    assert.equal(ficha?.status, "enviado");
    // Versão nova: a anterior não aceita mais.
    const v2 = await novaVersao(o.admin, q.id, HOJE);
    assert.ok(v2.ok);
    const barrado = await lk.aceitarOrcamento(g.token, { nome: "Rui", aceite: true }, ip(), null);
    assert.ok(!barrado.ok && barrado.erro === "versao_nova");
    if (!v2.ok) return;
    const g2 = await lk.gerarLinkDoOrcamento(o.admin, v2.id, 3, HOJE);
    assert.ok(g2.ok);
    if (!g2.ok) return;
    assert.equal((await lk.abrirOrcamentoDoCliente(g.token, ip())).estado, "morto", "o link da v1 caiu");
    const ok = await lk.aceitarOrcamento(g2.token, { nome: "Rui Barros", aceite: true }, ip(), null);
    assert.ok(ok.ok);
    const [c] = (await getBanco().asSystem("t", (tx) =>
      tx.execute(sql`select c.name, c.status from maestro.orcamentos q join maestro.clients c on c.id = q.cliente_id where q.id = ${v2.id}`),
    )) as unknown as { name: string; status: string }[];
    assert.deepEqual(c, { name: "Rui Barros", status: "ativo" });
    const parcelas = await contar(sql`select count(*)::int as n from maestro.lancamentos where orcamento_id = ${v2.id}`);
    assert.equal(parcelas, 3);
    // Vencido e revogado: tela neutra.
    await getBanco().asSystem("t", (tx) =>
      tx.execute(sql`update maestro.links_publicos set expira_em = now() - interval '1 minute' where token_hash = ${hashToken(g2.token)}`),
    );
    assert.equal((await lk.abrirOrcamentoDoCliente(g2.token, ip())).estado, "morto");
    const outro = await lk.gerarLinkDoOrcamento(o.admin, ids.orc, 1, HOJE);
    assert.ok(!outro.ok, "aprovado não gera link");
  });

  test("a B não acha o link nem o orçamento da A", async () => {
    assert.equal(await lk.lerLinkDoOrcamento(o.b, ids.orc), null);
    assert.equal((await lk.gerarLinkDoOrcamento(o.b, ids.orc, 1, HOJE)).ok, false);
    assert.equal((await lk.revogarLinkDoOrcamento(o.b, ids.orc)).ok, false);
  });
});
