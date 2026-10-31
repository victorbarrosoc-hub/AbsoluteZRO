// Criação · o roteiro aprovado pelo cliente no link do card (fase F7, drizzle/0033, src/lib/criacao/roteiro/cliente.ts,
// src/lib/revisao/roteiro.ts): a vista do cliente sem nada interno (puro); mandar ao cliente (só administração e gestão,
// sem card não vai, lote e link nascem, idempotente); o /a com o roteiro sem vazar nota, plano, observação, dica, ids
// nem outra organização; as rotas públicas (comentar por bloco, pedir ajuste, aprovar; token errado; limite); o editor
// com os comentários por versão e bloco (resolver só quem edita); versão nova troca a peça e os comentários antigos
// ficam na versão deles; a auditoria; duas organizações, quem é restrito a outro cliente e o banco direto.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { pedido, prepararAmbiente, UUID } from "./ambiente.mts";

const amb = await prepararAmbiente("roteiro_cliente");
const { getBanco, schema, codigoPg, PG } = amb.banco;
const { criarSessao } = await import("../src/lib/auth/sessao");
const { criarRoteiro, salvarRoteiro, salvarVersao, ligarRoteiro, obterRoteiro } = await import("../src/lib/criacao/roteiro/servidor");
const cli = await import("../src/lib/criacao/roteiro/cliente");
const { getRoteiro, postRoteiro } = await import("../src/lib/criacao/roteiro/rota");
const link = await import("../src/lib/revisao/link");
const { rotaComentar, rotaEnviar } = await import("../src/lib/revisao/rotas");
const { roteiroDoCliente, blocosDoCliente, semNotaDeFala } = await import("../src/lib/revisao/roteiro");
const { hashToken } = await import("../src/lib/auth/cripto");
const eq = await import("../src/lib/revisao/equipe");

const ANA = UUID(); // admin na A
const GIL = UUID(); // gestão na A
const EVA = UUID(); // equipe na A
const LEO = UUID(); // leitura na A
const RUI = UUID(); // equipe na A, restrito ao cliente "Outro"
const BIA = UUID(); // admin na B
let orgA: string;
let orgB: string;
let aurora: string;
let outro: string;
const A = () => ({ sub: ANA, orgId: orgA });
const GESTAO = () => ({ sub: GIL, orgId: orgA });
const EQUIPE = () => ({ sub: EVA, orgId: orgA });
const LEITURA = () => ({ sub: LEO, orgId: orgA });
const RESTRITO = () => ({ sub: RUI, orgId: orgA });
const B = () => ({ sub: BIA, orgId: orgB });
const sessoes: Record<string, string> = {};

const semCookies = { get: () => undefined };
let ipN = 0;
const novoIp = () => `198.51.100.${++ipN}`;

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e as unknown,
  );

/** O roteiro de teste: cada tipo de bloco, uma fala com nota de quem fala, uma dica vazia e uma pessoa com id. */
const CONTEUDO = {
  v: 1,
  formato: "16:9",
  wpm: 150,
  pessoas: [{ id: "p-loc", nome: "Lia", papel: "locutor" }],
  cenas: [
    {
      id: "c1",
      titulo: "Abertura",
      intExt: "EXT",
      local: "Fazenda",
      periodo: "dia",
      blocos: [
        { id: "b-plano", tipo: "plano", tamanho: "PG", movimento: "DRONE-SEGREDO" },
        { id: "b-acao", tipo: "acao", texto: "O sol nasce sobre o cafezal." },
        { id: "b-fala", tipo: "fala", quem: "p-loc", modo: "off", texto: "Tudo começa **cedo**. ((RESPIRAR-FUNDO)) [pausa]" },
        { id: "b-letra", tipo: "lettering", estilo: "titulo", texto: "Café Serra · 1962" },
        { id: "b-audio", tipo: "audio", audio: "trilha", texto: "Violão" },
        { id: "b-obs", tipo: "observacao", texto: "CHAMADA-AS-5H" },
        { id: "b-nota", tipo: "nota", texto: "NOTA-INTERNA-DRONE" },
        { id: "b-vazio", tipo: "acao", texto: "", dica: "DICA-DO-MODELO" },
      ],
    },
  ],
};

let roteiro: string;
let semCard: string;
let token: string;

async function cardNovo(ctx: { sub: string; orgId: string }, id: string, cliente: string, coluna = "fazendo") {
  await getBanco().asUser(ctx, (tx) => tx.execute(sql`select maestro.card_criar(${id}, ${JSON.stringify({ tema: `Filme ${id}`, coluna, cliente })}::jsonb)`));
}

const colunaDe = async (id: string) =>
  (
    (await getBanco().asSystem("teste", (tx) => tx.execute(sql`select coluna from maestro.cards where org_id = ${orgA} and id = ${id}`))) as unknown as {
      coluna: string;
    }[]
  )[0]?.coluna;

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    const [a] = await tx
      .insert(schema.organizations)
      .values({ zroOrgId: UUID(), name: "Produtora A", zroProducts: ["maestro"] })
      .returning({ id: schema.organizations.id });
    const [b] = await tx
      .insert(schema.organizations)
      .values({ zroOrgId: UUID(), name: "Produtora B", zroProducts: ["maestro"] })
      .returning({ id: schema.organizations.id });
    orgA = a.id;
    orgB = b.id;
    await tx.insert(schema.members).values([
      { orgId: orgA, zroSub: ANA, role: "admin", displayName: "Ana" },
      { orgId: orgA, zroSub: GIL, role: "gestor", displayName: "Gil" },
      { orgId: orgA, zroSub: EVA, role: "equipe", displayName: "Eva" },
      { orgId: orgA, zroSub: LEO, role: "leitura", displayName: "Leo" },
      { orgId: orgA, zroSub: RUI, role: "equipe", displayName: "Rui" },
      { orgId: orgB, zroSub: BIA, role: "admin", displayName: "Bia" },
    ]);
    const [c1] = await tx.insert(schema.clients).values({ orgId: orgA, name: "Café Aurora" }).returning({ id: schema.clients.id });
    const [c2] = await tx.insert(schema.clients).values({ orgId: orgA, name: "Outro" }).returning({ id: schema.clients.id });
    aurora = c1.id;
    outro = c2.id;
  });
  await getBanco().asSystem("restrito", async (tx) => {
    await tx.execute(sql`insert into maestro.acesso_restrito (org_id, zro_sub) values (${orgA}, ${RUI})`);
    await tx.execute(sql`insert into maestro.acesso_clientes (org_id, zro_sub, cliente_id) values (${orgA}, ${RUI}, ${outro})`);
  });
  await cardNovo(A(), "rot-0001", aurora);
  await cardNovo(B(), "rot-b001", aurora);
  roteiro = ok(await criarRoteiro(A(), { titulo: "Institucional Aurora", conteudo: CONTEUDO, cardId: "rot-0001" })).id;
  semCard = ok(await criarRoteiro(A(), { titulo: "Sem card", conteudo: CONTEUDO })).id;
  ok(await salvarVersao(A(), roteiro));
  ok(await salvarVersao(A(), semCard));
  for (const [k, sub, org] of [
    ["ana", ANA, orgA],
    ["gil", GIL, orgA],
    ["eva", EVA, orgA],
    ["leo", LEO, orgA],
    ["bia", BIA, orgB],
  ] as const)
    sessoes[k] = (await criarSessao({ orgId: org, sub, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null })).token;
});
after(() => amb.fechar());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const postar = async (quem: string, id: string, corpo: Record<string, unknown>) => {
  const r = await postRoteiro(pedido(`/api/criacao/roteiros/${id}`, { cookies: { mae_sessao: sessoes[quem] }, corpo }), id);
  return { status: r.status, d: (await r.json()) as Json };
};
const ler = async (quem: string, id: string, q: string) => {
  const r = await getRoteiro(pedido(`/api/criacao/roteiros/${id}${q}`, { cookies: { mae_sessao: sessoes[quem] } }), id);
  return { status: r.status, d: (await r.json()) as Json };
};
const comentar = async (corpo: Record<string, unknown>, ip = novoIp()) => {
  const r = await rotaComentar(pedido("/api/link/comentar", { corpo: { token, ...corpo }, ip }));
  return { status: r.status, d: (await r.json()) as Json };
};
const decidir = async (corpo: Record<string, unknown>, ip = novoIp()) => {
  const r = await rotaEnviar(
    pedido("/api/link/enviar", { corpo: { token, nome: "Marina Lopes", aceite: true, ...corpo }, ip, headers: { "user-agent": "teste" } }),
  );
  return { status: r.status, d: (await r.json()) as Json };
};
async function peca() {
  const r = await link.abrirLink(token, semCookies, novoIp());
  assert.equal(r.estado, "ok");
  if (r.estado !== "ok") throw new Error("link");
  return { dados: r.dados, peca: r.dados.pecas.find((p) => p.card === "rot-0001")! };
}

describe("a vista do cliente (puro)", () => {
  test("só a vista Literário: sem nota, plano, observação, dica, ids de pessoa nem a nota de quem fala", () => {
    const v = roteiroDoCliente({ n: 3, titulo: "Institucional", duracaoSeg: 42, conteudo: CONTEUDO })!;
    assert.equal(v.n, 3);
    assert.equal(v.duracaoSeg, 42);
    assert.deepEqual([...blocosDoCliente(v)].sort(), ["b-acao", "b-audio", "b-fala", "b-letra"]);
    const texto = JSON.stringify(v);
    for (const segredo of ["DRONE-SEGREDO", "CHAMADA-AS-5H", "NOTA-INTERNA-DRONE", "DICA-DO-MODELO", "RESPIRAR-FUNDO", "p-loc", "b-nota", "b-obs", "b-plano"])
      assert.ok(!texto.includes(segredo), `não vaza ${segredo}`);
    const fala = v.cenas[0].linhas.find((l) => l.tipo === "fala")!;
    assert.equal(fala.tipo === "fala" && fala.nome, "LIA (OFF)");
    assert.equal(fala.tipo === "fala" && fala.texto, "Tudo começa **cedo**. [pausa]");
    assert.equal(v.cenas[0].cabecalho, "1. EXT. FAZENDA – DIA");
  });

  test("forma que não abre dá null; nota de fala some com o espaço", () => {
    assert.equal(roteiroDoCliente(null), null);
    assert.equal(roteiroDoCliente({ n: 1, conteudo: "x" }), null);
    assert.equal(semNotaDeFala("Oi ((baixo)) gente"), "Oi gente");
  });
});

describe("mandar ao cliente", () => {
  test("equipe e leitura não mandam; sem card não vai; outra organização não acha", async () => {
    for (const ctx of [EQUIPE(), LEITURA()]) {
      const r = await cli.enviarAoCliente(ctx, roteiro, 1);
      assert.equal(!r.ok && r.erro, "sem_permissao");
    }
    const sem = await cli.enviarAoCliente(A(), semCard, 1);
    assert.equal(!sem.ok && sem.erro, "sem_card");
    const b = await cli.enviarAoCliente(B(), roteiro, 1);
    assert.equal(!b.ok && b.erro, "nao_existe");
    const versaoQueNaoHa = await cli.enviarAoCliente(A(), roteiro, 9);
    assert.equal(!versaoQueNaoHa.ok && versaoQueNaoHa.erro, "nao_existe");
    // nada foi gravado no caminho
    const [{ n }] = (await getBanco().asSystem("teste", (tx) => tx.execute(sql`select count(*)::int as n from maestro.versoes`))) as unknown as { n: number }[];
    assert.equal(n, 0);
  });

  test("a rota: equipe e leitura 403; o que está no card antes de mandar; 'cliente' nunca se anota à mão", async () => {
    assert.equal((await postar("eva", roteiro, { op: "cliente", n: 1 })).status, 403);
    assert.equal((await postar("leo", roteiro, { op: "cliente", n: 1 })).status, 403);
    assert.equal((await ler("eva", roteiro, "?para-cliente=1")).status, 403);
    assert.equal((await postar("ana", roteiro, { op: "enviado", n: 1, destino: "cliente", formato: "link" })).status, 400);
    const e = await ler("ana", roteiro, "?para-cliente=1");
    assert.equal(e.status, 200);
    assert.deepEqual(e.d.card, { id: "rot-0001", tema: "Filme rot-0001" });
    assert.equal(e.d.lote, null);
    assert.equal(e.d.enviada, null);
    assert.deepEqual(e.d.cliente, { id: aurora, nome: "Café Aurora" });
    const sem = await ler("ana", semCard, "?para-cliente=1");
    assert.equal(sem.d.card, null);
    assert.equal((await ler("bia", roteiro, "?para-cliente=1")).status, 404);
  });

  test("administração manda: a versão vira peça do card, nasce o lote do cliente e o link; o roteiro fica com o cliente", async () => {
    const r = await postar("ana", roteiro, { op: "cliente", n: 1 });
    assert.equal(r.status, 200, JSON.stringify(r.d));
    assert.match(r.d.url, /^http:\/\/localhost:3000\/a\/[A-Za-z0-9_-]{43}$/);
    assert.equal(r.d.novo, true);
    assert.equal(r.d.loteNovo, true);
    token = r.d.url.split("/a/")[1];
    const [v] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select fonte, url, n, roteiro_versao_id is not null as tem from maestro.versoes where org_id = ${orgA} and card_id = 'rot-0001'`),
    )) as unknown as { fonte: string; url: string | null; n: number; tem: boolean }[];
    assert.deepEqual(v, { fonte: "roteiro", url: null, n: 1, tem: true });
    assert.equal((await obterRoteiro(A(), roteiro))!.estado, "com_cliente");
    const lotes = await eq.listarLotes(A());
    assert.equal(lotes.length, 1);
    assert.equal(lotes[0].titulo, "Institucional Aurora");
    assert.equal(lotes[0].cliente.id, aurora);
    assert.ok(lotes[0].link);
    // de novo: a mesma peça, o mesmo link (nada duplica)
    const de = ok(await cli.enviarAoCliente(GESTAO(), roteiro, 1));
    assert.equal(de.novo, false);
    assert.equal(de.token, token);
    assert.equal(de.loteNovo, false);
    const [{ n }] = (await getBanco().asSystem("teste", (tx) => tx.execute(sql`select count(*)::int as n from maestro.versoes`))) as unknown as { n: number }[];
    assert.equal(n, 1);
    const e = await ler("ana", roteiro, "?para-cliente=1");
    assert.equal(e.d.enviada, 1);
    assert.equal(e.d.lote.link, true);
  });

  test("a versão de roteiro no card: sem URL só quando é roteiro; maestro_app não escreve direto", async () => {
    const [rv] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select id from maestro.roteiro_versoes where roteiro_id = ${roteiro} and n = 1`),
    )) as unknown as {
      id: string;
    }[];
    const comUrl = await erroDe(
      getBanco().asSystem("teste", (tx) =>
        tx.execute(
          sql`insert into maestro.versoes (org_id, card_id, n, fonte, url, roteiro_versao_id) values (${orgA}, 'rot-0001', 50, 'roteiro', 'https://x.exemplo.com/a', ${rv.id})`,
        ),
      ),
    );
    assert.equal(codigoPg(comUrl), PG.checagem);
    const videoSemUrl = await erroDe(
      getBanco().asSystem("teste", (tx) =>
        tx.execute(sql`insert into maestro.versoes (org_id, card_id, n, fonte, url) values (${orgA}, 'rot-0001', 51, 'mp4', null)`),
      ),
    );
    assert.equal(codigoPg(videoSemUrl), PG.checagem);
    const direto = await erroDe(
      getBanco().asUser(A(), (tx) =>
        tx.execute(sql`insert into maestro.versoes (org_id, card_id, n, fonte, roteiro_versao_id) values (${orgA}, 'rot-0001', 52, 'roteiro', ${rv.id})`),
      ),
    );
    assert.equal(codigoPg(direto), PG.semPrivilegio);
    // as funções internas não abrem para maestro_app
    for (const q of [sql`select maestro.roteiro_bloco_do_cliente('{}'::jsonb, 'x')`, sql`select maestro.approvals_roteiro()`]) {
      const e = await erroDe(getBanco().asUser(A(), (tx) => tx.execute(q)));
      assert.equal(codigoPg(e), PG.semPrivilegio);
    }
  });
});

describe("o cliente no /a", () => {
  test("o roteiro chega na vista do cliente, sem nada interno nem de outra organização", async () => {
    const { dados, peca: p } = await peca();
    assert.equal(dados.cliente, "Café Aurora");
    const v = p.versoes[0];
    assert.equal(v.fonte, "roteiro");
    assert.equal(v.url, "");
    assert.equal(v.roteiro?.n, 1);
    assert.equal(v.roteiro?.titulo, "Institucional Aurora");
    assert.deepEqual([...blocosDoCliente(v.roteiro!)].sort(), ["b-acao", "b-audio", "b-fala", "b-letra"]);
    const texto = JSON.stringify(dados);
    for (const segredo of [
      "DRONE-SEGREDO",
      "CHAMADA-AS-5H",
      "NOTA-INTERNA-DRONE",
      "DICA-DO-MODELO",
      "RESPIRAR-FUNDO",
      "p-loc",
      roteiro,
      semCard,
      orgA,
      orgB,
      ANA,
      aurora,
      token,
      hashToken(token),
      '"conteudo"',
      "Sem card",
    ])
      assert.ok(!texto.includes(segredo), `não vaza ${segredo}`);
  });

  test("comentar por bloco: só no que o cliente vê, idempotente; nota, observação, plano e bloco que não existe, não", async () => {
    const { peca: p } = await peca();
    const versao = p.versoes[0].id;
    const um = await comentar({ card: "rot-0001", versao, bloco: "b-fala", texto: "Trocar 'cedo' por 'antes do sol'", nome: "Marina", idem: "rot-cli-0001" });
    assert.equal(um.status, 200, JSON.stringify(um.d));
    assert.equal(um.d.comentario.bloco, "b-fala");
    assert.equal(um.d.comentario.t, null);
    const de = await comentar({ card: "rot-0001", versao, bloco: "b-fala", texto: "Trocar 'cedo' por 'antes do sol'", nome: "Marina", idem: "rot-cli-0001" });
    assert.equal(de.d.comentario.id, um.d.comentario.id, "a mesma chave é o mesmo comentário");
    for (const bloco of ["b-nota", "b-obs", "b-plano", "naoexiste", "../x"]) {
      const r = await comentar({ card: "rot-0001", versao, bloco, texto: "x", idem: `rot-cli-${bloco.replace(/\W/g, "")}-9` });
      assert.equal(r.status, 400, bloco);
      if (bloco !== "../x") assert.equal(r.d.erro, "bloco", bloco);
    }
    // tempo e pino não entram em comentário de roteiro
    const t = await comentar({ card: "rot-0001", versao, bloco: "b-acao", texto: "Mais luz", t: 4000, x: 10, y: 20, idem: "rot-cli-0002" });
    assert.equal(t.status, 200);
    assert.deepEqual([t.d.comentario.t, t.d.comentario.x], [null, null]);
    const { peca: depois } = await peca();
    assert.deepEqual(
      depois.versoes[0].comentarios.map((c) => [c.bloco, c.nome]),
      [
        ["b-fala", "Marina"],
        ["b-acao", "Cliente"],
      ],
    );
  });

  test("token errado ou morto: a mesma resposta neutra; de outro site, 403", async () => {
    const { peca: p } = await peca();
    const r = await rotaComentar(
      pedido("/api/link/comentar", {
        corpo: { token: "x".repeat(43), card: "rot-0001", versao: p.versoes[0].id, bloco: "b-acao", texto: "oi", idem: "rot-cli-0003" },
        ip: novoIp(),
      }),
    );
    assert.equal(r.status, 404);
    const curto = await rotaEnviar(pedido("/api/link/enviar", { corpo: { token: "curto", nome: "X", aceite: true, decisoes: [] }, ip: novoIp() }));
    assert.equal(curto.status, 404);
    const fora = await rotaComentar(
      pedido("/api/link/comentar", {
        corpo: { token, card: "rot-0001", versao: p.versoes[0].id, texto: "oi", idem: "rot-cli-0004" },
        origin: "https://outro.exemplo",
      }),
    );
    assert.equal(fora.status, 403);
  });

  test("pedir ajuste: os comentários por bloco bastam; o roteiro fica com ajustes pedidos e a decisão entra na auditoria", async () => {
    const { peca: p } = await peca();
    const r = await decidir({ decisoes: [{ card: "rot-0001", versao: p.versoes[0].id, decisao: "ajuste" }] });
    assert.equal(r.status, 200, JSON.stringify(r.d));
    assert.deepEqual(r.d.decisoes, [{ card: "rot-0001", decisao: "ajuste", repetida: false }]);
    assert.equal((await obterRoteiro(A(), roteiro))!.estado, "ajuste");
    assert.equal(await colunaDe("rot-0001"), "fazendo", "card fora de Revisão/Em aprovação não anda");
    const [a] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select metadata from maestro.audit_log where action = 'roteiro.decisao' and target_id = ${roteiro}`),
    )) as unknown as { metadata: Record<string, unknown> }[];
    assert.deepEqual(a.metadata, { n: 1, decisao: "ajuste", nome: "Marina Lopes", volta: 1, card: "rot-0001", nota: false });
  });

  test("limite: comentar 60/h por link", async () => {
    const th = hashToken(token);
    await getBanco().asSystem("teste", (tx) => tx.insert(schema.rateLimitAttempts).values(Array.from({ length: 60 }, () => ({ key: `link-comentar:${th}` }))));
    const { peca: p } = await peca();
    const r = await comentar({ card: "rot-0001", versao: p.versoes[0].id, bloco: "b-acao", texto: "mais um", idem: "rot-cli-0099" });
    assert.equal(r.status, 429);
    await getBanco().asSystem("teste", (tx) => tx.execute(sql`delete from maestro.rate_limit_attempts where key = ${`link-comentar:${th}`}`));
  });
});

describe("o editor e a versão nova", () => {
  test("os comentários do cliente aparecem com o bloco e a versão; resolver só quem edita", async () => {
    const r = await ler("eva", roteiro, "?cliente=1");
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.d.comentarios.map((c: Json) => [c.bloco, c.n, c.autor, c.nome, c.resolvido]),
      [
        ["b-fala", 1, "cliente", "Marina", false],
        ["b-acao", 1, "cliente", "Cliente", false],
      ],
    );
    assert.deepEqual(
      r.d.decisoes.map((d: Json) => [d.n, d.decisao, d.nome]),
      [[1, "ajuste", "Marina Lopes"]],
    );
    const id = r.d.comentarios[1].id;
    assert.equal((await postar("leo", roteiro, { op: "resolver", id, resolvido: true })).status, 403);
    assert.equal((await postar("eva", roteiro, { op: "resolver", id, resolvido: true })).status, 200);
    assert.equal((await postar("eva", semCard, { op: "resolver", id, resolvido: true })).status, 404, "o comentário é de outro roteiro");
    const de = await ler("ana", roteiro, "?cliente=1");
    assert.equal(de.d.comentarios[1].resolvido, true);
    // outra organização e quem é restrito a outro cliente não veem nada
    assert.equal((await ler("bia", roteiro, "?cliente=1")).d.comentarios.length, 0);
    assert.deepEqual(await cli.clienteDoRoteiro(RESTRITO(), roteiro), { comentarios: [], decisoes: [] });
    const [{ n }] = (await getBanco().asUser(RESTRITO(), (tx) =>
      tx.execute(sql`select count(*)::int as n from maestro.versoes where fonte = 'roteiro'`),
    )) as unknown as { n: number }[];
    assert.equal(n, 0);
  });

  test("versão nova: a peça troca, o cliente decide de novo, os comentários antigos ficam na v1; aprovar", async () => {
    const atual = (await obterRoteiro(A(), roteiro))!;
    const conteudo = structuredClone(CONTEUDO);
    conteudo.cenas[0].blocos[2].texto = "Tudo começa **antes do sol**. [pausa]";
    ok(await salvarRoteiro(A(), roteiro, { rev: atual.rev, conteudo }));
    assert.equal(ok(await salvarVersao(EQUIPE(), roteiro)).n, 2);
    const r = ok(await cli.enviarAoCliente(A(), roteiro, 2));
    assert.equal(r.novo, true);
    assert.equal(r.token, token, "o mesmo link do lote");
    assert.equal((await obterRoteiro(A(), roteiro))!.estado, "com_cliente");
    const { peca: p } = await peca();
    assert.equal(p.volta, 2);
    assert.deepEqual(
      p.versoes.map((v) => [v.n, v.roteiro?.n]),
      [
        [2, 2],
        [1, 1],
      ],
    );
    assert.equal(p.versoes[0].comentarios.length, 0);
    assert.equal(p.versoes[1].comentarios.length, 2, "os comentários da v1 ficam na v1");
    // decidir pela versão velha não vale
    const velha = await decidir({ decisoes: [{ card: "rot-0001", versao: p.versoes[1].id, decisao: "aprovado" }] });
    assert.equal(velha.status, 409);
    const aprovar = await decidir({ decisoes: [{ card: "rot-0001", versao: p.versoes[0].id, decisao: "aprovado" }] });
    assert.equal(aprovar.status, 200, JSON.stringify(aprovar.d));
    assert.equal((await obterRoteiro(A(), roteiro))!.estado, "aprovado");
    const e = await ler("ana", roteiro, "?cliente=1");
    assert.deepEqual(
      e.d.decisoes.map((d: Json) => [d.n, d.decisao]),
      [
        [2, "aprovado"],
        [1, "ajuste"],
      ],
    );
    assert.ok(e.d.comentarios.every((c: Json) => c.n === 1));
    const acoes = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select action, metadata from maestro.audit_log where org_id = ${orgA} and target_id in (${roteiro}, 'rot-0001') order by created_at, id`),
    )) as unknown as { action: string; metadata: Record<string, unknown> }[];
    const enviados = acoes.filter((x) => x.action === "roteiro.enviado").map((x) => [x.metadata.n, x.metadata.destino]);
    assert.deepEqual(enviados, [
      [1, "cliente"],
      [2, "cliente"],
    ]);
    for (const a of ["versao.criar", "link.comentar", "link.decidir", "roteiro.decisao", "roteiro.versao"])
      assert.ok(
        acoes.some((x) => x.action === a),
        a,
      );
  });

  test("a ficha do card mostra a versão de roteiro abrindo o editor", async () => {
    const v = await eq.versoesDoCard(A(), "rot-0001");
    assert.deepEqual(
      v.map((x) => [x.n, x.fonte, x.roteiroN, x.url]),
      [
        [2, "roteiro", 2, `/app/criacao/roteiros/${roteiro}`],
        [1, "roteiro", 1, `/app/criacao/roteiros/${roteiro}`],
      ],
    );
    const lote = (await eq.listarLotes(A()))[0];
    const l = await eq.carregarLote(A(), lote.id);
    assert.deepEqual(l!.pecas[0].versoes[0].doRoteiro, { id: roteiro, n: 2 });
    assert.equal(l!.pecas[0].versoes[0].stream, null);
  });

  test("card que já está num lote com link: a versão nova entra nele e o card em Revisão volta para Em aprovação", async () => {
    await cardNovo(A(), "rot-0002", aurora, "revisao");
    const lote = ok(await eq.criarLote(A(), { clienteId: aurora, titulo: "Semana 45", cards: ["rot-0002"] }));
    const t = ok(await eq.gerarLink(A(), lote.id)).token;
    assert.equal(await colunaDe("rot-0002"), "aprovacao");
    await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`update maestro.cards set dados = dados || '{"coluna":"revisao"}'::jsonb where org_id = ${orgA} and id = 'rot-0002'`),
    );
    const outroRot = ok(await criarRoteiro(A(), { titulo: "Reels", conteudo: CONTEUDO, cardId: "rot-0002" })).id;
    ok(await salvarVersao(A(), outroRot));
    const r = ok(await cli.enviarAoCliente(A(), outroRot, 1));
    assert.equal(r.loteId, lote.id);
    assert.equal(r.token, t);
    assert.equal(r.loteNovo, false);
    assert.equal(await colunaDe("rot-0002"), "aprovacao");
    // ligar a um card de outro cliente e mandar sem lote: sem cliente no card, pede o cliente
    await cardNovo(A(), "rot-0003", "");
    ok(await ligarRoteiro(A(), outroRot, { cardId: "rot-0003" }));
    const semCliente = await cli.enviarAoCliente(A(), outroRot, 1);
    assert.equal(!semCliente.ok && semCliente.erro, "sem_cliente");
    const comCliente = ok(await cli.enviarAoCliente(A(), outroRot, 1, { clienteId: outro }));
    assert.equal(comCliente.loteNovo, true);
  });
});
