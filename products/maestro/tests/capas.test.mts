// Achar o job no Quadro (titular, 30/10/2026): o selo do link (a peça e o cliente, só o que o banco registra), a
// miniatura sem buscar nada no servidor, a cor do cliente, o realce da busca e a capa do card (drizzle/0035): imagem
// limpa e reencodada, uma por card, cota por produtora, papéis (leitura só vê), duas organizações, acesso por cliente,
// bytes só pela porta e a rota (Origin, sessão, 404 igual para o que não existe e o que está fora, cache privado).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import type { PessoaZro } from "./zro-falso.mts";

const amb = await prepararAmbiente("capas");
const { getBanco } = amb.banco;
const { zro } = amb;
const rotas = await import("../src/lib/zro/rotas");
const selos = await import("../src/lib/quadro/selos");
const { prepararCapa, COTA_CAPAS, CAPA_SAIDA_MAX } = await import("../src/lib/quadro/capa");
const srv = await import("../src/lib/quadro/servidor");
const { getQuadro, postCapa, deleteCapa, getCapa } = await import("../src/lib/quadro/rota");
const eq = await import("../src/lib/revisao/equipe");
const { hashToken } = await import("../src/lib/auth/cripto");
const { passaFiltro, FILTRO_VAZIO } = await import("../src/lib/quadro/metodo");

const ORG_A = { id: UUID(), name: "Produtora A", role: "owner" };
const ORG_B = { id: UUID(), name: "Produtora B", role: "owner" };
const LIA: PessoaZro = { sub: UUID(), email: "lia@a.exemplo", nome: "Lia", org: ORG_A, produtos: ["maestro"] };
const RUI: PessoaZro = { sub: UUID(), email: "rui@a.exemplo", nome: "Rui", org: { ...ORG_A, role: "editor" }, produtos: ["maestro"] };
const VIC: PessoaZro = { sub: UUID(), email: "vic@a.exemplo", nome: "Vic", org: { ...ORG_A, role: "viewer" }, produtos: ["maestro"] };
const BIA: PessoaZro = { sub: UUID(), email: "bia@b.exemplo", nome: "Bia", org: ORG_B, produtos: ["maestro"] };

after(() => amb.fechar());

async function entrar(pessoa: PessoaZro): Promise<string> {
  Object.assign(zro.estado.proximo, { pessoa, adulterar: null, negar: false });
  const ida = await rotas.entrar(pedido("/api/zro/entrar"));
  const z = await fetch(new URL(ida.headers.get("location")!), { redirect: "manual" });
  const volta = await rotas.callback(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida).get("mae_zro") } }));
  return cookiesDe(volta).get("mae_sessao")!;
}

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

const imagemDe = (cor: string, w = 1600, h = 900, formato: "png" | "jpeg" = "png") => {
  const s = sharp({ create: { width: w, height: h, channels: 3, background: cor } });
  return (formato === "png" ? s.png() : s.jpeg()).toBuffer();
};

function enviar(s: string | undefined, card: string, bytes: Uint8Array, origin: string | null = SITE) {
  const headers = new Headers({ host: "localhost:3000", "content-type": "image/png" });
  if (s) headers.set("cookie", `mae_sessao=${encodeURIComponent(s)}`);
  if (origin) headers.set("origin", origin);
  return postCapa(new Request(new URL(`/api/quadro/capa?card=${card}`, SITE), { method: "POST", headers, body: new Uint8Array(bytes) }));
}
const tirar = (s: string | undefined, card: string) => deleteCapa(pedido(`/api/quadro/capa?card=${card}`, { cookies: { mae_sessao: s }, method: "DELETE" }));
const ver = (s: string | undefined, card: string, sha: string) =>
  getCapa(pedido(`/api/quadro/capa/${card}/${sha}`, { cookies: { mae_sessao: s } }), Promise.resolve({ card, sha }));

/* ───────────── puro ───────────── */

describe("selos (puro)", () => {
  test("miniatura só do que o endereço já dá: YouTube, quadro da demonstração e https guardado", () => {
    assert.equal(selos.miniaturaDaPeca("c1", "youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
    assert.equal(selos.miniaturaDaPeca("demo-1", "mp4", "/demo/demo-corte-1.mp4"), "/demo/demo-corte-1.webp");
    assert.equal(selos.miniaturaDaPeca("c1", "mp4", "/demo/demo-corte-1.mp4"), undefined, "só card de demonstração");
    for (const [f, u] of [
      ["vimeo", "https://vimeo.com/76979871"],
      ["drive", "https://drive.google.com/file/d/abcdefghijk/view"],
      ["mp4", "https://cdn.exemplo.com/a.mp4"],
      ["link", "https://exemplo.com/x"],
    ])
      assert.equal(selos.miniaturaDaPeca("c1", f, u), undefined, f);
    assert.equal(selos.miniaturaDaPeca("c1", "link", "https://exemplo.com/x", "https://img.exemplo.com/t.jpg"), "https://img.exemplo.com/t.jpg");
    assert.equal(selos.miniaturaDaPeca("c1", "link", "https://exemplo.com/x", "javascript:alert(1)"), undefined);
  });

  test("estado com o cliente: decisão > aberto depois da versão > enviado; sem link nem decisão, nada", () => {
    const base = { decisao: null, decisaoEm: null, linkCriado: null, linkUsado: null, versaoEm: null } as const;
    assert.equal(selos.estadoDoCliente(base), undefined);
    assert.equal(selos.estadoDoCliente({ ...base, linkCriado: "2026-10-30T10:00:00Z" })?.estado, "enviado");
    assert.equal(selos.estadoDoCliente({ ...base, linkCriado: "2026-10-30T10:00:00Z", linkUsado: "2026-10-30T11:00:00Z" })?.estado, "aberto");
    // versão nova depois da abertura: o cliente ainda não viu esta
    assert.equal(
      selos.estadoDoCliente({ ...base, linkCriado: "2026-10-30T10:00:00Z", linkUsado: "2026-10-30T11:00:00Z", versaoEm: "2026-10-30T12:00:00Z" })?.estado,
      "enviado",
    );
    assert.equal(selos.estadoDoCliente({ ...base, linkCriado: "2026-10-30T10:00:00Z", decisao: "ajuste" })?.estado, "ajuste");
    assert.equal(selos.estadoDoCliente({ ...base, decisao: "aprovado", decisaoEm: "2026-10-30T13:00:00Z" })?.estado, "aprovado");
  });

  test("rótulo: um selo só, curto, com a frase inteira na dica", () => {
    assert.equal(selos.rotuloDoSelo(undefined), null);
    const peca = selos.rotuloDoSelo({ peca: { n: 2, fonte: "youtube" } });
    assert.deepEqual([peca?.curto, peca?.icone, peca?.tom], ["Com link", "link", "peca"]);
    assert.match(peca!.dica, /YouTube, versão 2/);
    assert.equal(selos.rotuloDoSelo({ peca: { n: 1, fonte: "mp4" }, cliente: { estado: "enviado" } })?.curto, "Link enviado");
    assert.equal(selos.rotuloDoSelo({ cliente: { estado: "aberto", em: "2026-10-30T14:05:00Z" } })?.dica, "O cliente abriu o link em 30/10 às 11:05");
    assert.equal(selos.rotuloDoSelo({ cliente: { estado: "aprovado" } })?.curto, "Aprovado");
    assert.equal(selos.rotuloDoSelo({ cliente: { estado: "ajuste" } })?.curto, "Pediu ajuste");
  });

  test("imagem do card: capa enviada > miniatura da peça > nenhuma", () => {
    const sha = "a".repeat(64);
    assert.deepEqual(selos.imagemDoCard("c1", { sha, l: 960, a: 540 }, { peca: { n: 1, fonte: "youtube", mini: "https://i.ytimg.com/x" } }), {
      src: `/api/quadro/capa/c1/${sha}`,
      origem: "capa",
    });
    assert.equal(selos.imagemDoCard("c1", null, { peca: { n: 1, fonte: "youtube", mini: "https://i.ytimg.com/x" } })?.origem, "peca");
    assert.equal(selos.imagemDoCard("c1", { sha: "x", l: 1, a: 1 }, undefined), null, "capa malformada não vira endereço");
    assert.equal(selos.imagemDoCard("c1", undefined, { cliente: { estado: "enviado" } }), null);
  });

  test("cor do cliente: a mesma para o mesmo id, da paleta fechada", () => {
    const id = "3f2a0c1e-0000-4000-8000-000000000001";
    assert.equal(selos.corDoCliente(id), selos.corDoCliente(id));
    assert.ok(selos.CORES_CLIENTE.includes(selos.corDoCliente(id)!));
    assert.equal(selos.corDoCliente(undefined), null);
    const usadas = new Set(Array.from({ length: 60 }, (_, i) => selos.corDoCliente(`cliente-${i}`)));
    assert.ok(usadas.size >= 6, "espalha pela paleta");
  });

  test("realce sem acento e sem caixa, nos índices do texto original", () => {
    const t = selos.termosDaBusca("  Café   SERRA ");
    assert.deepEqual(t, ["cafe", "serra"]);
    assert.deepEqual(selos.pedacosDoRealce("Café Serra Alta", t), [
      ["Café", true],
      [" ", false],
      ["Serra", true],
      [" Alta", false],
    ]);
    assert.deepEqual(selos.pedacosDoRealce("Reels", []), [["Reels", false]]);
    assert.deepEqual(selos.pedacosDoRealce("ação ação", ["acao"]), [
      ["ação", true],
      [" ", false],
      ["ação", true],
    ]);
  });

  test("a busca casa título, cliente e código do projeto", () => {
    const c = { id: "c1", versao: 1, versoes: {}, dados: { tema: "Teaser 15s", coluna: "fazendo", cliente: "cli", projeto: "prj" } };
    const nome = (id?: string) => (id === "cli" ? "Construtora Horizonte" : "");
    const codigo = (id?: string) => (id === "prj" ? "MAE-2026-014" : "");
    const f = (busca: string) => passaFiltro(c, { ...FILTRO_VAZIO, busca }, "eu", nome, codigo);
    assert.equal(f("teaser"), true);
    assert.equal(f("horizonte teaser"), true);
    assert.equal(f("2026-014"), true);
    assert.equal(f("aurora"), false);
  });
});

/* ───────────── a capa (imagem) ───────────── */

describe("prepararCapa", () => {
  test("PNG grande vira WebP ≤ 960 px e ≤ 160 KB, sem metadados; SVG e texto não entram", async () => {
    const p = await prepararCapa(await imagemDe("#c8962f", 3000, 2000));
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.ok(p.largura <= 960 && p.altura <= 960);
    assert.ok(p.webp.length <= CAPA_SAIDA_MAX);
    const meta = await sharp(p.webp).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.exif, undefined);
    assert.match(p.sha256, /^[0-9a-f]{64}$/);
    const comExif = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#123456" } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "segredo" } } })
      .toBuffer();
    const limpa = await prepararCapa(comExif);
    assert.equal(limpa.ok && (await sharp(limpa.webp).metadata()).exif, undefined);
    assert.equal((await prepararCapa(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).ok, false);
    assert.equal((await prepararCapa(Buffer.from("texto"))).ok, false);
    assert.equal((await prepararCapa(new Uint8Array())).ok, false);
  });
});

/* ───────────── banco e rota ───────────── */

let lia: string, rui: string, vic: string, bia: string;
let orgA: string, orgB: string;
let cli1: string, cli2: string;
const A = () => ({ sub: LIA.sub, orgId: orgA });
const EQ = () => ({ sub: RUI.sub, orgId: orgA });
const LE = () => ({ sub: VIC.sub, orgId: orgA });
const B = () => ({ sub: BIA.sub, orgId: orgB });

before(async () => {
  lia = await entrar(LIA);
  rui = await entrar(RUI);
  vic = await entrar(VIC);
  bia = await entrar(BIA);
  const banco = getBanco();
  const [a] = await banco.sql`select id from maestro.organizations where zro_org_id = ${ORG_A.id}`;
  const [b] = await banco.sql`select id from maestro.organizations where zro_org_id = ${ORG_B.id}`;
  orgA = a.id;
  orgB = b.id;
  await banco.asSystem("semente", async (tx) => {
    const [c1] = (await tx.execute(sql`insert into maestro.clients (org_id, name) values (${orgA}, 'Café Aurora') returning id`)) as unknown as {
      id: string;
    }[];
    const [c2] = (await tx.execute(sql`insert into maestro.clients (org_id, name) values (${orgA}, 'Livraria Lume') returning id`)) as unknown as {
      id: string;
    }[];
    cli1 = c1.id;
    cli2 = c2.id;
  });
  for (const [id, cliente, coluna] of [
    ["capa0001", cli1, "fazendo"],
    ["capa0002", cli2, "revisao"],
  ] as const)
    await getBanco().asUser(A(), (tx) => tx.execute(sql`select maestro.card_criar(${id}, ${JSON.stringify({ tema: `Peça ${id}`, coluna, cliente })}::jsonb)`));
  await getBanco().asUser(B(), (tx) => tx.execute(sql`select maestro.card_criar('capaB001', ${JSON.stringify({ tema: "Da B", coluna: "pauta" })}::jsonb)`));
});

describe("capa do card no banco e na rota", () => {
  let sha = "";

  test("a cota do banco é a mesma da tela", async () => {
    const [r] = await getBanco().sql`select maestro.card_capas_cota(${orgA}) as n`;
    assert.equal(Number(r.n), COTA_CAPAS);
  });

  test("equipe põe a capa: bytes limpos no banco, referência no card (a versão sobe)", async () => {
    const antes = (await srv.carregarCards(EQ())).cards.find((c) => c.id === "capa0001")!;
    const r = await enviar(rui, "capa0001", await imagemDe("#e0607e"));
    assert.equal(r.status, 201);
    const { card } = await r.json();
    assert.equal(card.versao, antes.versao + 1);
    assert.match(card.dados.capa.sha, /^[0-9a-f]{64}$/);
    assert.deepEqual([card.dados.capa.l, card.dados.capa.a], [960, 540]);
    sha = card.dados.capa.sha;
    const img = await ver(vic, "capa0001", sha);
    assert.equal(img.status, 200, "leitura vê");
    assert.equal(img.headers.get("content-type"), "image/webp");
    assert.equal(img.headers.get("cache-control"), "private, max-age=31536000, immutable");
    assert.equal(img.headers.get("x-content-type-options"), "nosniff");
    const bytes = Buffer.from(await img.arrayBuffer());
    assert.equal((await sharp(bytes).metadata()).width, 960);
    // trocar mantém uma capa só por card
    const r2 = await enviar(lia, "capa0001", await imagemDe("#3e8ed0", 800, 800));
    assert.equal(r2.status, 201);
    const novo = (await r2.json()).card.dados.capa.sha;
    assert.notEqual(novo, sha);
    assert.equal((await ver(lia, "capa0001", sha)).status, 404, "a antiga saiu");
    sha = novo;
    const [n] = await getBanco().sql`select count(*)::int as n from maestro.card_capas where card_id = 'capa0001'`;
    assert.equal(n.n, 1);
  });

  test("leitura, outra origem, sem sessão e outra organização não põem; 404 igual fora do alcance", async () => {
    const png = await imagemDe("#30a46c", 200, 200);
    assert.equal((await enviar(vic, "capa0002", png)).status, 403);
    assert.equal((await enviar(rui, "capa0002", png, "https://outro.exemplo")).status, 403);
    assert.equal((await enviar(undefined, "capa0002", png)).status, 401);
    assert.equal((await enviar(bia, "capa0001", png)).status, 404, "o card da A não existe para a B");
    assert.equal((await ver(bia, "capa0001", sha)).status, 404);
    assert.equal((await ver(lia, "capa0001", "f".repeat(64))).status, 404);
    assert.equal((await ver(undefined, "capa0001", sha)).status, 401);
    const svg = await enviar(rui, "capa0002", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"));
    assert.equal(svg.status, 415);
    // o papel do banco também barra (sem passar pela rota)
    assert.equal((await srv.porCapa(LE(), "capa0002", png)).ok, false);
    assert.equal(await srv.lerCapa(B(), "capa0001", sha), null);
  });

  test("maestro_app não lê os bytes pela tabela, só pela porta", async () => {
    await assert.rejects(getBanco().asUser(A(), (tx) => tx.execute(sql`select webp from maestro.card_capas`)));
    const meta = await getBanco().asUser(A(), (tx) => tx.execute(sql`select card_id, sha256 from maestro.card_capas`));
    assert.equal(meta.length, 1);
    assert.equal((await getBanco().asUser(B(), (tx) => tx.execute(sql`select card_id from maestro.card_capas`))).length, 0);
  });

  test("acesso por cliente: a equipe restrita a outro cliente não vê nem põe", async () => {
    await getBanco().asSystem("teste", async (tx) => {
      await tx.execute(sql`insert into maestro.acesso_restrito (org_id, zro_sub) values (${orgA}, ${RUI.sub})`);
      await tx.execute(sql`insert into maestro.acesso_clientes (org_id, zro_sub, cliente_id) values (${orgA}, ${RUI.sub}, ${cli2})`);
    });
    assert.equal(await srv.lerCapa(EQ(), "capa0001", sha), null);
    assert.equal((await ver(rui, "capa0001", sha)).status, 404);
    assert.equal((await srv.porCapa(EQ(), "capa0001", await imagemDe("#000000", 100, 100))).ok, false);
    assert.equal(ok(await srv.porCapa(EQ(), "capa0002", await imagemDe("#ffffff", 100, 100))).card.dados.capa?.l, 100);
    await getBanco().asSystem("teste", (tx) => tx.execute(sql`delete from maestro.acesso_restrito where zro_sub = ${RUI.sub}`));
  });

  test("cota por produtora conferida no banco (413 claro)", async () => {
    await getBanco().sql.unsafe(
      `create or replace function maestro.card_capas_cota(p_org uuid) returns bigint language sql immutable set search_path = '' as $$ select 10::bigint $$`,
    );
    try {
      const r = await enviar(lia, "capa0002", await imagemDe("#9a62b8", 300, 300));
      assert.equal(r.status, 413);
      assert.equal((await r.json()).erro, "cota");
    } finally {
      await getBanco().sql.unsafe(
        `create or replace function maestro.card_capas_cota(p_org uuid) returns bigint language sql immutable set search_path = '' as $$ select 100::bigint * 1024 * 1024 $$`,
      );
    }
  });

  test("tirar: a referência sai do card e os bytes do banco; leitura não tira", async () => {
    assert.equal((await tirar(vic, "capa0001")).status, 403);
    const r = await tirar(rui, "capa0001");
    assert.equal(r.status, 200);
    assert.equal((await r.json()).card.dados.capa, undefined);
    assert.equal((await ver(lia, "capa0001", sha)).status, 404);
  });

  test("uma capa por card: a produtora guarda só as que estão nos cards", async () => {
    const [n] = await getBanco().sql`select count(*)::int as n from maestro.card_capas where org_id = ${orgA}`;
    assert.equal(n.n, 1, "a do capa0002");
    const [k] = await getBanco()
      .sql`select dados -> 'capa' ->> 'sha' as sha, (select sha256 from maestro.card_capas where card_id = 'capa0002') as banco from maestro.cards where id = 'capa0002'`;
    assert.equal(k.sha, k.banco, "a referência do card é a dos bytes");
  });
});

describe("selos no Quadro (como a pessoa)", () => {
  test("a peça com link, o link enviado, aberto, a decisão; o que mudou desde; a outra organização não vê", async () => {
    const quadro = async (s: string) =>
      (await (await getQuadro(pedido("/api/quadro", { cookies: { mae_sessao: s } }))).json()) as { selos: Record<string, unknown>; cursor: string };
    assert.equal((await quadro(lia)).selos.capa0002, undefined, "sem versão nem link, sem selo");
    ok(await eq.novaVersao(A(), "capa0002", "https://youtu.be/dQw4w9WgXcQ"));
    const s1 = (await srv.selosDoQuadro(LE())).capa0002;
    assert.deepEqual(s1, { peca: { n: 1, fonte: "youtube", mini: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" } });

    const { cursor } = await quadro(vic);
    const lote = ok(await eq.criarLote(A(), { clienteId: cli2, titulo: "Semana 44", cards: ["capa0002"] })).id;
    assert.equal((await srv.selosDoQuadro(A())).capa0002.cliente, undefined, "lote em rascunho não conta");
    const { token } = ok(await eq.gerarLink(A(), lote));
    const desde = await srv.selosDesde(LE(), cursor);
    assert.equal((desde.capa0002 as { cliente?: { estado: string } } | null)?.cliente?.estado, "enviado");

    const th = hashToken(token);
    await getBanco().asSystem("cliente abre", (tx) => tx.execute(sql`select maestro.link_abrir(${th}, true)`));
    assert.equal((await srv.selosDoQuadro(A())).capa0002.cliente?.estado, "aberto");

    const [v] = await getBanco().sql`select id from maestro.versoes where card_id = 'capa0002' and n = 1`;
    const [r] = await getBanco().asSystem(
      "cliente decide",
      async (tx) =>
        (await tx.execute(
          sql`select maestro.link_enviar(${th}, true, ${JSON.stringify({ nome: "Ana", aceite: true, decisoes: [{ card: "capa0002", versao: v.id, decisao: "ajuste", nota: "Logo maior." }] })}::jsonb) as r`,
        )) as unknown as { r: { ok?: boolean } }[],
    );
    assert.equal(r.r.ok, true);
    assert.equal((await srv.selosDoQuadro(A())).capa0002.cliente?.estado, "ajuste");

    // versão nova: a volta sobe; a decisão antiga não vale mais e o link volta a "enviado"
    ok(await eq.novaVersao(A(), "capa0002", "https://youtu.be/aqz-KE-bpKQ"));
    const s2 = (await srv.selosDoQuadro(A())).capa0002;
    assert.equal(s2.peca?.n, 2);
    assert.equal(s2.cliente?.estado, "enviado");

    ok(await eq.revogarLink(A(), lote));
    const s3 = (await srv.selosDoQuadro(A())).capa0002;
    assert.equal(s3.cliente, undefined, "link revogado sem decisão desta volta: só a peça");

    assert.deepEqual(await srv.selosDoQuadro(B()), {}, "a B não vê nada da A");
    const q = await quadro(bia);
    assert.deepEqual(q.selos, {});
  });
});
