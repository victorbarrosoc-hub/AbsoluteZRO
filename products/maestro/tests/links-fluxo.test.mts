// Criação · exportar e compartilhar o Fluxo (fase F6, drizzle/0032): o puro (Markdown e JSON com e sem imagens pelo
// link, validade, PIN, nomes, zip), o banco (RLS com duas organizações e papéis, hashes fora do alcance, revogar para
// sempre, até 10 links, validade, auditoria, títulos só do que quem criou alcançava) e as rotas (links da equipe, o
// pacote .zip e o que quem abre de fora usa: .md, .json, imagem e PIN, com vencido, revogado, PIN errado, limite e
// cabeçalhos de fora da busca).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import sharp from "sharp";
import { sql } from "drizzle-orm";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import type { PessoaZro } from "./zro-falso.mts";

const amb = await prepararAmbiente("links_fluxo");
const { zro } = amb;
const { getBanco, codigoPg, mensagemPg, PG } = amb.banco;
const rotas = await import("../src/lib/zro/rotas");
const cp = await import("../src/lib/criacao/fluxo/compartilhar");
const ex = await import("../src/lib/criacao/fluxo/exportar");
const fx = await import("../src/lib/criacao/fluxo/servidor");
const lk = await import("../src/lib/criacao/fluxo/link");
const lr = await import("../src/lib/criacao/fluxo/link-rota");
const zip = await import("../src/lib/zip");
const rt = await import("../src/lib/criacao/roteiro/servidor");
const { lerOps } = await import("../src/lib/criacao/fluxo/modelo");
const { hashToken } = await import("../src/lib/auth/cripto");

const ORG_A = { id: UUID(), name: "Produtora A", role: "owner" };
const ORG_B = { id: UUID(), name: "Produtora B", role: "owner" };
const LIA: PessoaZro = { sub: UUID(), email: "lia@a.exemplo", nome: "Lia", org: ORG_A, produtos: ["maestro"] };
const GIL: PessoaZro = { sub: UUID(), email: "gil@a.exemplo", nome: "Gil", org: { ...ORG_A, role: "manager" }, produtos: ["maestro"] };
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

const ok = <T extends { ok: boolean }>(r: T) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e,
  );
const png = (cor: string, w = 120, h = 80) =>
  sharp({ create: { width: w, height: h, channels: 3, background: cor } })
    .png()
    .toBuffer();
const sem = () => ({ get: () => undefined });
const opsDe = (lista: unknown[]) => {
  const l = lerOps(lista);
  assert.ok(l.ok, JSON.stringify(l));
  return l.ops;
};
let ipN = 0;
/** Um IP novo por teste (o limite por IP não vaza de um teste para outro). */
const ip = () => `10.9.${Math.floor(++ipN / 250)}.${ipN % 250}`;

let lia: string, gil: string, rui: string, vic: string, bia: string;
let orgA: string, orgB: string;
const ctx = {
  lia: { sub: LIA.sub, orgId: "" },
  gil: { sub: GIL.sub, orgId: "" },
  rui: { sub: RUI.sub, orgId: "" },
  vic: { sub: VIC.sub, orgId: "" },
  bia: { sub: BIA.sub, orgId: "" },
};
let fluxo: string;
let fluxoB: string;
let img: { id: string; sha256: string };
let roteiro: string;
const NOS = { secao: UUID(), nota: UUID(), imagem: UUID(), link: UUID(), roteiro: UUID(), card: UUID() };

before(async () => {
  lia = await entrar(LIA);
  gil = await entrar(GIL);
  rui = await entrar(RUI);
  vic = await entrar(VIC);
  bia = await entrar(BIA);
  const orgs = (await getBanco().sql`select id, zro_org_id from maestro.organizations`) as { id: string; zro_org_id: string }[];
  orgA = orgs.find((o) => o.zro_org_id === ORG_A.id)!.id;
  orgB = orgs.find((o) => o.zro_org_id === ORG_B.id)!.id;
  for (const k of ["lia", "gil", "rui", "vic"] as const) ctx[k].orgId = orgA;
  ctx.bia.orgId = orgB;
  await getBanco().asSystem("semente dos links", (tx) =>
    tx.execute(
      sql`insert into maestro.cards (org_id, id, dados) values (${orgA}, 'card-aurora', ${JSON.stringify({ tema: "Gravação da cafeteria", coluna: "fazendo", prazo: "2026-11-12", briefing: "SEGREDO DO BRIEFING" })}::jsonb)`,
    ),
  );
  roteiro = ok(await rt.criarRoteiro(ctx.lia, { titulo: "Institucional" })).id;
  fluxo = ok(await fx.criarFluxo(ctx.rui, { titulo: "Verão Café Aurora" })).id;
  fluxoB = ok(await fx.criarFluxo(ctx.bia, { titulo: "Da B" })).id;
  img = ok(await fx.enviarImagem(ctx.rui, fluxo, await png("#e07050"))).imagem;
  const l = lerOps([
    { op: "criar_no", id: NOS.secao, tipo: "secao", x: 0, y: 0, w: 640, h: 400, z: 1, dados: { nome: "Clima e luz", cor: "pessego" } },
    {
      op: "criar_no",
      id: NOS.imagem,
      tipo: "imagem",
      x: 20,
      y: 60,
      w: 240,
      h: 180,
      z: 2,
      secaoId: NOS.secao,
      imagemId: img.id,
      dados: { legenda: "Fim de tarde, contraluz" },
    },
    { op: "criar_no", id: NOS.nota, tipo: "nota", x: 300, y: 60, w: 200, h: 120, z: 3, secaoId: NOS.secao, dados: { texto: "Paleta quente, nada de azul." } },
    { op: "criar_no", id: NOS.link, tipo: "link", x: 20, y: 500, w: 240, h: 90, z: 4, dados: { url: "https://vimeo.com/76979871", titulo: "Ritmo" } },
    { op: "criar_no", id: NOS.roteiro, tipo: "roteiro", x: 400, y: 500, w: 240, h: 80, z: 5, roteiroId: roteiro },
    { op: "criar_no", id: NOS.card, tipo: "card", x: 700, y: 500, w: 240, h: 80, z: 6, cardId: "card-aurora" },
    { op: "criar_ligacao", de: NOS.nota, para: NOS.roteiro, rotulo: "gancho" },
  ]);
  assert.ok(l.ok);
  ok(await fx.aplicarOps(ctx.rui, fluxo, l.ops));
});

// ───────────── puro ─────────────

describe("exportar: o puro", () => {
  test("validade, PIN, vencimento, nomes e o link para a IA", () => {
    assert.deepEqual(
      [undefined, "", 1, 7, "30", 30, 0, 31, 2.5, "7d", -1].map((v) => cp.diasDoLink(v)),
      [7, 7, 1, 7, 30, 30, null, null, null, null, null],
    );
    assert.deepEqual(
      [undefined, null, "", "  ", "1234", " 12345678 ", "123", "123456789", "12a4", 1234].map((v) => cp.pinDoLink(v)),
      [null, null, null, null, "1234", "12345678", undefined, undefined, undefined, undefined],
    );
    const agora = new Date("2026-10-29T15:00:00Z");
    assert.equal(cp.vencimento("2026-10-29T20:00:00Z", agora), "Vence hoje");
    assert.equal(cp.vencimento("2026-10-30T20:00:00Z", agora), "Vence amanhã");
    assert.equal(cp.vencimento("2026-11-05T15:00:00Z", agora), "Vence em 7 dias");
    assert.equal(cp.vencimento("2026-10-29T14:00:00Z", agora), "Vencido");
    assert.equal(cp.slug("Fim de tarde, contraluz!"), "fim-de-tarde-contraluz");
    assert.equal(cp.slug("   ", "imagem"), "imagem");
    assert.equal(cp.slug("Ação · Café"), "acao-cafe");
    const token = "a".repeat(43);
    assert.ok(cp.ehTokenFluxo(token) && !cp.ehTokenFluxo(`${token}.md`) && !cp.ehTokenFluxo("x"));
    assert.equal(cp.caminhoImagemPeloLink(token, { id: "i1", sha256: "s" }), `/f/${token}/i/i1/s.webp`);
    assert.equal(cp.enderecoDoLink("https://m.exemplo/", token), `https://m.exemplo/f/${token}`);
    const base = { url: "u", visitas: 0, vistoEm: null, permissao: "ver" as const };
    const links = [
      { ...base, id: "a", token: "ta", temPin: false, expira: "2026-11-01T00:00:00Z", criadoEm: "2026-10-20T00:00:00Z" },
      { ...base, id: "b", token: "tb", temPin: true, expira: "2026-11-01T00:00:00Z", criadoEm: "2026-10-28T00:00:00Z" },
      { ...base, id: "c", token: "tc", temPin: false, expira: "2026-10-29T00:00:00Z", criadoEm: "2026-10-28T12:00:00Z" },
      { ...base, id: "d", token: "td", temPin: false, expira: "2026-11-01T00:00:00Z", criadoEm: "2026-10-27T00:00:00Z" },
    ];
    assert.equal(cp.linkParaIa(links, agora)?.id, "d", "o mais novo vivo e sem PIN");
    assert.equal(cp.linkParaIa([links[1], links[2]], agora), null);
  });

  test("Markdown e JSON: sem link, imagem sem endereço; com link, pelo token; referência só com título", async () => {
    const d = (await fx.dadosParaExportar(ctx.rui, fluxo))!;
    const agora = new Date("2026-10-29T15:00:00Z");
    const md = ex.fluxoParaMarkdown(d, { agora });
    assert.match(md, /^# Fluxo: Verão Café Aurora\n> Do Maestro, 29\/10\/2026 · 5 itens\n\n## Clima e luz\n/);
    assert.match(md, /- Imagem: "Fim de tarde, contraluz" \(não incluída\)/);
    assert.match(md, /> Crie um link para incluir as imagens\.\n$/);
    assert.ok(!md.includes("/api/criacao/img"), "nunca o endereço interno");
    const token = "b".repeat(43);
    const comLink = ex.fluxoParaMarkdown(d, { agora, urlImagem: cp.urlImagemPeloLink("https://maestro.exemplo", token) });
    assert.ok(comLink.includes(`- Imagem: "Fim de tarde, contraluz" (https://maestro.exemplo/f/${token}/i/${img.id}/${img.sha256}.webp)`));
    assert.ok(!comLink.includes("Crie um link"));
    assert.match(comLink, /- Link: Ritmo, vimeo\.com \(https:\/\/vimeo\.com\/76979871\)/);
    assert.match(comLink, /- Roteiro: "Institucional" \(rascunho, 0:00\)/);
    assert.match(comLink, /- Card: "Gravação da cafeteria" \(fazendo|Fazendo/);
    const j = ex.fluxoParaJson(d, { agora });
    assert.equal(j.formato, "maestro.fluxo/1");
    assert.equal(j.nos.find((n) => n.tipo === "imagem")!.imagem!.url, null);
    const jl = ex.fluxoParaJson(d, { agora, urlImagem: cp.urlImagemPeloLink("https://maestro.exemplo", token) });
    assert.equal(jl.nos.find((n) => n.tipo === "imagem")!.imagem!.url, `https://maestro.exemplo/f/${token}/i/${img.id}/${img.sha256}.webp`);
    // só o título (o que o link mostra): sem versão, coluna, prazo
    const soTitulo = {
      ...d,
      refs: {
        [NOS.roteiro]: { tipo: "roteiro" as const, estado: "titulo" as const, titulo: "Institucional" },
        [NOS.card]: { tipo: "card" as const, estado: "sem_acesso" as const },
      },
    };
    const mdT = ex.fluxoParaMarkdown(soTitulo, { agora });
    assert.match(mdT, /- Roteiro: "Institucional"\n/);
    assert.match(mdT, /- Card: \(sem acesso\)/);
    assert.match(mdT, /- "Paleta quente, nada de azul\." → Roteiro "Institucional" · gancho/);
    const jT = ex.fluxoParaJson(soTitulo, { agora });
    assert.deepEqual(jT.nos.find((n) => n.tipo === "roteiro")!.ref, { estado: "ok", titulo: "Institucional" });
  });

  test("nomes das imagens no pacote e o zip (CRC, deflate, UTF-8)", () => {
    assert.equal(zip.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
    const arquivos = [
      { nome: "fluxo.md", dados: new TextEncoder().encode("# Fluxo\n".repeat(200)), comprimir: true },
      { nome: "imagens/01-ação.webp", dados: new Uint8Array([1, 2, 3, 4, 5]) },
    ];
    const z = zip.zipInteiro(arquivos, new Date("2026-10-29T12:00:00Z"));
    assert.ok(z.length < 1600 + 5, "o texto repetido foi comprimido");
    const lido = zip.lerZip(z);
    assert.deepEqual([...lido.keys()], ["fluxo.md", "imagens/01-ação.webp"]);
    assert.equal(lido.get("fluxo.md")!.toString(), "# Fluxo\n".repeat(200));
    assert.deepEqual([...lido.get("imagens/01-ação.webp")!], [1, 2, 3, 4, 5]);
    const ruim = Buffer.from(z);
    ruim[ruim.indexOf(Buffer.from([1, 2, 3, 4, 5]))] = 9;
    assert.throws(() => zip.lerZip(ruim), /CRC/);
  });

  test("prova do PIN: assinada, presa ao link e com validade", () => {
    const th = hashToken("c".repeat(43));
    const agora = Date.now();
    const valor = `${agora + 60_000}.x`;
    assert.equal(lk.provaConfere(valor, th), false, "assinatura falsa");
    assert.equal(lk.provaConfere(undefined, th), false);
    assert.equal(lk.provaConfere("abc", th), false);
  });
});

// ───────────── banco ─────────────

describe("links no banco", () => {
  test("RLS e políticas; os hashes fora do alcance do app; só administração e gestão", async () => {
    const [t] = (await getBanco().sql`
      select c.relrowsecurity as rls,
             array(select p.policyname::text from pg_policies p where p.schemaname = 'maestro' and p.tablename = 'fluxo_links' order by 1) as politicas
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'maestro' and c.relname = 'fluxo_links'`) as {
      rls: boolean;
      politicas: string[];
    }[];
    assert.equal(t.rls, true);
    assert.deepEqual(t.politicas, [
      "fluxo_links_cliente",
      "fluxo_links_escrita",
      "fluxo_links_leitura",
      "fluxo_links_mudanca",
      "fluxo_links_org",
      "fluxo_links_remocao",
    ]);
    const l = ok(await lk.criarLinkFluxo(ctx.gil, fluxo, { dias: 7 })).link;
    assert.match(l.url!, new RegExp(`^${SITE}/f/[A-Za-z0-9_-]{43}$`));
    assert.equal(l.temPin, false);
    // equipe e leitura não criam nem veem
    assert.equal((await lk.criarLinkFluxo(ctx.rui, fluxo)).ok, false);
    assert.deepEqual(await lk.listarLinksFluxo(ctx.rui, fluxo), []);
    assert.deepEqual(await lk.listarLinksFluxo(ctx.vic, fluxo), []);
    // a outra organização e a forjada não veem, não criam e não revogam
    assert.deepEqual(await lk.listarLinksFluxo(ctx.bia, fluxo), []);
    assert.equal((await lk.criarLinkFluxo(ctx.bia, fluxo)).ok, false);
    assert.equal((await lk.revogarLinkFluxo(ctx.bia, l.id)).ok, false);
    assert.deepEqual(await lk.listarLinksFluxo({ sub: LIA.sub, orgId: orgB }, fluxo), []);
    // hash do token e do PIN: nem a administração lê pela tabela
    for (const col of ["token_hash", "pin_hash", "refs_cards"]) {
      const e = await erroDe(getBanco().asUser(ctx.lia, (tx) => tx.execute(sql.raw(`select ${col} from maestro.fluxo_links`))));
      assert.equal(codigoPg(e), PG.semPrivilegio, col);
    }
    // só revogar muda; apagar, nunca
    for (const q of [sql`update maestro.fluxo_links set expira_em = now() + interval '20 days'`, sql`delete from maestro.fluxo_links`]) {
      const e = await erroDe(getBanco().asUser(ctx.lia, (tx) => tx.execute(q)));
      assert.equal(codigoPg(e), PG.semPrivilegio);
    }
    // a listagem leva o token aberto (para copiar) e o de agora
    const lista = await lk.listarLinksFluxo(ctx.lia, fluxo);
    assert.equal(lista.length, 1);
    assert.equal(lista[0].url, l.url);
    // revogar é para sempre (e idempotente)
    ok(await lk.revogarLinkFluxo(ctx.lia, l.id));
    ok(await lk.revogarLinkFluxo(ctx.lia, l.id));
    const volta = await erroDe(getBanco().asUser(ctx.lia, (tx) => tx.execute(sql`update maestro.fluxo_links set revogado_em = null where id = ${l.id}`)));
    assert.equal(mensagemPg(volta), "fluxo_link:revogado");
    assert.deepEqual(await lk.listarLinksFluxo(ctx.lia, fluxo), []);
    // auditoria: criou e revogou, sem o token
    const aud = (await getBanco().sql`select action, metadata from maestro.audit_log where org_id = ${orgA} and action like 'fluxo.link_%' order by id`) as {
      action: string;
      metadata: Record<string, unknown>;
    }[];
    assert.deepEqual(
      aud.map((a) => a.action),
      ["fluxo.link_criou", "fluxo.link_revogou"],
    );
    assert.ok(!JSON.stringify(aud).includes(l.token!));
  });

  test("validade de 1 a 30 dias, PIN de 4 a 8 números, até 10 vivos por fluxo, fluxo na lixeira não cria", async () => {
    assert.equal((await lk.criarLinkFluxo(ctx.lia, fluxo, { dias: 31 })).ok, false);
    assert.equal((await lk.criarLinkFluxo(ctx.lia, fluxo, { dias: 0 })).ok, false);
    assert.equal((await lk.criarLinkFluxo(ctx.lia, fluxo, { pin: "12" })).ok, false);
    // o banco confere de novo a validade
    const e = await erroDe(
      getBanco().asUser(ctx.lia, (tx) =>
        tx.execute(sql`
          insert into maestro.fluxo_links (org_id, fluxo_id, token_hash, token_enc, expira_em)
          values (${orgA}, ${fluxo}, ${"0".repeat(64)}, ${"x".repeat(20)}, now() + interval '40 days')`),
      ),
    );
    assert.equal(mensagemPg(e), "fluxo_link:validade");
    const criados = [];
    for (let i = 0; i < 10; i++) criados.push(ok(await lk.criarLinkFluxo(ctx.lia, fluxo, { dias: 1 + i })).link);
    const onze = await lk.criarLinkFluxo(ctx.lia, fluxo);
    assert.equal(onze.ok ? "ok" : onze.erro, "limite");
    for (const l of criados) ok(await lk.revogarLinkFluxo(ctx.gil, l.id));
    const outro = ok(await fx.criarFluxo(ctx.rui, { titulo: "Na lixeira" })).id;
    ok(await fx.lixeiraFluxo(ctx.rui, outro, true));
    const lix = await lk.criarLinkFluxo(ctx.lia, outro);
    assert.equal(lix.ok ? "ok" : lix.erro, "nao_existe");
  });
});

// ───────────── quem abre de fora ─────────────

describe("o link aberto de fora", () => {
  let token: string;
  let linkId: string;

  test("abre só de leitura; referência só com o título (do que existia ao criar); nada de id interno", async () => {
    const l = ok(await lk.criarLinkFluxo(ctx.lia, fluxo, { dias: 7 })).link;
    token = l.token!;
    linkId = l.id;
    // um card que entra no fluxo DEPOIS do link: no link, sem título
    await getBanco().asSystem("card novo", (tx) =>
      tx.execute(
        sql`insert into maestro.cards (org_id, id, dados) values (${orgA}, 'card-depois', '{"tema":"Card que entrou depois","coluna":"pauta"}'::jsonb)`,
      ),
    );
    const depois = UUID();
    ok(await fx.aplicarOps(ctx.rui, fluxo, opsDe([{ op: "criar_no", id: depois, tipo: "card", x: 0, y: 900, cardId: "card-depois" }])));
    const r = await lk.abrirFluxoPublico(token, sem(), ip(), { contar: true });
    assert.equal(r.estado, "ok");
    if (r.estado !== "ok") return;
    const d = r.dados;
    assert.equal(d.titulo, "Verão Café Aurora");
    assert.equal(d.marca.nome, "Produtora A");
    assert.deepEqual(d.refs[NOS.roteiro], { tipo: "roteiro", estado: "titulo", titulo: "Institucional" });
    assert.deepEqual(d.refs[NOS.card], { tipo: "card", estado: "titulo", titulo: "Gravação da cafeteria" });
    assert.deepEqual(d.refs[depois], { tipo: "card", estado: "sem_acesso" });
    const tudo = JSON.stringify(d);
    for (const segredo of ["SEGREDO DO BRIEFING", roteiro, "card-aurora", "/api/criacao/img", "fazendo", "2026-11-12"])
      assert.ok(!tudo.includes(segredo), segredo);
    const im = d.nos.find((n) => n.tipo === "imagem")!;
    assert.equal(im.imagem!.url, `/f/${token}/i/${img.id}/${img.sha256}.webp`);
    assert.equal(d.ligacoes.length, 1);
    // a visita conta
    const [v] = (await getBanco().sql`select visitas, visto_em is not null as visto from maestro.fluxo_links where id = ${linkId}`) as {
      visitas: number;
      visto: boolean;
    }[];
    assert.deepEqual([v.visitas, v.visto], [1, true]);
  });

  test("rotas .md e .json: conteúdo com imagens pelo token e cabeçalhos de fora da busca", async () => {
    const md = await lr.getArquivoPublico(pedido(`/f/${token}.md`, { ip: ip() }), token, "md");
    assert.equal(md.status, 200);
    assert.equal(md.headers.get("content-type"), "text/markdown; charset=utf-8");
    assert.equal(md.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    assert.equal(md.headers.get("referrer-policy"), "no-referrer");
    assert.equal(md.headers.get("cache-control"), "private, no-store");
    const t = await md.text();
    assert.ok(t.includes(`(${SITE}/f/${token}/i/${img.id}/${img.sha256}.webp)`), t);
    assert.match(t, /- Roteiro: "Institucional"\n/);
    assert.ok(!t.includes("Crie um link"));
    const js = await lr.getArquivoPublico(pedido(`/f/${token}.json`, { ip: ip() }), token, "json");
    assert.equal(js.status, 200);
    assert.equal(js.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    const j = await js.json();
    assert.equal(j.formato, "maestro.fluxo/1");
    assert.equal(j.nos.find((n: { tipo: string }) => n.tipo === "imagem").imagem.url, `${SITE}/f/${token}/i/${img.id}/${img.sha256}.webp`);
  });

  test("imagem pelo token: só a do fluxo, com sha certo, de nó vivo; cabeçalhos", async () => {
    const pedir = (t: string, id: string, arquivo: string, mini = false) =>
      lr.getImagemPublica(pedido(`/f/${t}/i/${id}/${arquivo}${mini ? "?mini=1" : ""}`, { ip: ip() }), Promise.resolve({ token: t, id, arquivo }));
    const r = await pedir(token, img.id, `${img.sha256}.webp`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/webp");
    assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    assert.equal(r.headers.get("content-security-policy"), "default-src 'none'; sandbox");
    assert.equal(
      Buffer.from(await r.arrayBuffer())
        .subarray(8, 12)
        .toString(),
      "WEBP",
    );
    assert.equal((await pedir(token, img.id, img.sha256, true)).status, 200, "miniatura, sem a extensão também");
    assert.equal((await pedir(token, img.id, `${"0".repeat(64)}.webp`)).status, 404);
    assert.equal((await pedir(token, UUID(), `${img.sha256}.webp`)).status, 404);
    // a imagem de outro fluxo (da mesma produtora) não sai por este token
    const outro = ok(await fx.criarFluxo(ctx.rui, { titulo: "Outro" })).id;
    const i2 = ok(await fx.enviarImagem(ctx.rui, outro, await png("#3070e0"))).imagem;
    ok(await fx.aplicarOps(ctx.rui, outro, opsDe([{ op: "criar_no", tipo: "imagem", x: 0, y: 0, imagemId: i2.id, dados: { legenda: "" } }])));
    assert.equal((await pedir(token, i2.id, `${i2.sha256}.webp`)).status, 404);
    // apagou o nó: a imagem sai do link
    ok(await fx.aplicarOps(ctx.rui, fluxo, opsDe([{ op: "apagar_no", id: NOS.imagem }])));
    assert.equal((await pedir(token, img.id, `${img.sha256}.webp`)).status, 404);
    ok(await fx.aplicarOps(ctx.rui, fluxo, opsDe([{ op: "restaurar_no", id: NOS.imagem }])));
    assert.equal((await pedir(token, img.id, `${img.sha256}.webp`)).status, 200);
  });

  test("fluxo na lixeira, link vencido ou revogado: a mesma resposta neutra, e as imagens param", async () => {
    const neutro = async (t: string) => {
      const r = await lr.getArquivoPublico(pedido(`/f/${t}.md`, { ip: ip() }), t, "md");
      return [r.status, (await r.text()).trim()];
    };
    ok(await fx.lixeiraFluxo(ctx.rui, fluxo, true));
    assert.deepEqual(await neutro(token), [404, "Este link não está mais ativo."]);
    ok(await fx.lixeiraFluxo(ctx.rui, fluxo, false));
    assert.equal((await neutro(token))[0], 200);
    // vencido
    const v = ok(await lk.criarLinkFluxo(ctx.lia, fluxo, { dias: 1 })).link;
    await getBanco().asSystem("vencer", (tx) =>
      tx.execute(sql`update maestro.fluxo_links set criado_em = now() - interval '3 days', expira_em = now() - interval '1 minute' where id = ${v.id}`),
    );
    assert.deepEqual(await neutro(v.token!), [404, "Este link não está mais ativo."]);
    assert.deepEqual(
      (await lk.listarLinksFluxo(ctx.lia, fluxo)).map((l) => l.id),
      [linkId],
      "vencido some da lista",
    );
    // revogado
    ok(await lk.revogarLinkFluxo(ctx.lia, linkId));
    assert.deepEqual(await neutro(token), [404, "Este link não está mais ativo."]);
    const im = await lr.getImagemPublica(pedido(`/f/${token}/i/x`, { ip: ip() }), Promise.resolve({ token, id: img.id, arquivo: `${img.sha256}.webp` }));
    assert.equal(im.status, 404);
    assert.equal((await neutro("nao-e-token"))[0], 404);
    assert.equal((await neutro("d".repeat(43)))[0], 404);
  });

  test("PIN: pede antes, errado conta, 5 por IP em 15 min; certo dá o cookie (path /f) que abre página, arquivos e imagens", async () => {
    const l = ok(await lk.criarLinkFluxo(ctx.gil, fluxo, { dias: 7, pin: "4321" })).link;
    assert.equal(l.temPin, true);
    const t = l.token!;
    const meuIp = ip();
    assert.equal((await lk.abrirFluxoPublico(t, sem(), meuIp)).estado, "pin");
    const md = await lr.getArquivoPublico(pedido(`/f/${t}.md`, { ip: meuIp }), t, "md");
    assert.equal(md.status, 401);
    const imSem = await lr.getImagemPublica(pedido(`/f/${t}/i/x`, { ip: meuIp }), Promise.resolve({ token: t, id: img.id, arquivo: `${img.sha256}.webp` }));
    assert.equal(imSem.status, 404, "sem a prova, nem a imagem");
    const pin = (p: string, o: { ip?: string; origin?: string | null } = {}) =>
      lr.postPinPublico(pedido(`/f/${t}/pin`, { corpo: { pin: p }, ip: o.ip ?? meuIp, origin: o.origin }), Promise.resolve({ token: t }));
    assert.equal((await pin("4321", { origin: "https://outro.exemplo" })).status, 403);
    const errado = await pin("0000");
    assert.equal(errado.status, 401);
    assert.equal((await errado.json()).mensagem, "PIN errado.");
    for (let i = 0; i < 4; i++) assert.equal((await pin("1111")).status, 401);
    assert.equal((await pin("4321")).status, 429, "5 erradas: espera, mesmo com o certo");
    const certo = await pin("4321", { ip: ip() });
    assert.equal(certo.status, 200);
    const sc = certo.headers.get("set-cookie")!;
    assert.match(sc, new RegExp(`^${lk.nomeCookiePinFluxo(t)}=`));
    assert.match(sc, /Path=\/f;/);
    assert.match(sc, /HttpOnly/);
    assert.equal(certo.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    const valor = cookiesDe(certo).get(lk.nomeCookiePinFluxo(t))!;
    assert.ok(lk.provaConfere(valor, hashToken(t)));
    assert.equal(lk.provaConfere(valor, hashToken("e".repeat(43))), false, "a prova é deste link");
    const cookies = { [lk.nomeCookiePinFluxo(t)]: valor };
    assert.equal((await lk.abrirFluxoPublico(t, { get: (n) => cookies[n] }, ip())).estado, "ok");
    assert.equal((await lr.getArquivoPublico(pedido(`/f/${t}.json`, { ip: ip(), cookies }), t, "json")).status, 200);
    const im = await lr.getImagemPublica(
      pedido(`/f/${t}/i/x`, { ip: ip(), cookies }),
      Promise.resolve({ token: t, id: img.id, arquivo: `${img.sha256}.webp` }),
    );
    assert.equal(im.status, 200);
    ok(await lk.revogarLinkFluxo(ctx.gil, l.id));
    assert.equal((await lk.abrirFluxoPublico(t, { get: (n) => cookies[n] }, ip())).estado, "morto", "revogado: a prova não serve");
  });

  test("limite: tentar tokens não compensa (30 mortos por IP e o IP para); 120 aberturas por link", async () => {
    const l = ok(await lk.criarLinkFluxo(ctx.lia, fluxo, { dias: 2 })).link;
    const meuIp = ip();
    for (let i = 0; i < 30; i++) assert.equal((await lk.abrirFluxoPublico(`${"z".repeat(42)}${i % 10}`, sem(), meuIp)).estado, "morto");
    assert.equal((await lk.abrirFluxoPublico(l.token!, sem(), meuIp)).estado, "limite", "o IP que tentou tokens espera");
    const r = await lr.getArquivoPublico(pedido(`/f/${l.token}.md`, { ip: meuIp }), l.token!, "md");
    assert.equal(r.status, 429);
    assert.equal((await lk.abrirFluxoPublico(l.token!, sem(), ip())).estado, "ok", "outro IP abre");
    // por link: 120 aberturas por hora
    await getBanco().asSystem("encher", (tx) =>
      tx.execute(sql`insert into maestro.rate_limit_attempts (key) select ${`fluxo-abrir:${hashToken(l.token!)}`} from generate_series(1, 120)`),
    );
    assert.equal((await lk.abrirFluxoPublico(l.token!, sem(), ip())).estado, "limite");
  });
});

// ───────────── rotas da equipe ─────────────

describe("rotas da equipe", () => {
  const links = (s: string | undefined, q = `?fluxo=${fluxo}`) => lr.getLinks(pedido(`/api/criacao/fluxo/links${q}`, { cookies: { mae_sessao: s } }));
  const gravar = (s: string | undefined, corpo: Record<string, unknown>, origin?: string | null) =>
    lr.postLinks(pedido("/api/criacao/fluxo/links", { cookies: { mae_sessao: s }, corpo, origin }));

  test("links: sessão, origem e papel; criar, listar e revogar", async () => {
    assert.equal((await links(undefined)).status, 401);
    assert.equal((await links(rui)).status, 403);
    assert.equal((await links(vic)).status, 403);
    assert.equal((await gravar(rui, { op: "criar", fluxo })).status, 403);
    assert.equal((await gravar(lia, { op: "criar", fluxo }, "https://outro.exemplo")).status, 403);
    assert.equal((await gravar(lia, { op: "criar", fluxo, dias: 45 })).status, 422);
    assert.equal((await gravar(lia, { op: "criar", fluxo, pin: "12ab" })).status, 422);
    assert.equal((await gravar(bia, { op: "criar", fluxo })).status, 404, "fluxo de outra organização");
    assert.equal((await gravar(lia, { op: "voar" })).status, 400);
    const c = await gravar(gil, { op: "criar", fluxo, dias: 30, pin: "" });
    assert.equal(c.status, 201);
    const { link } = await c.json();
    assert.equal(link.temPin, false);
    const dias = Math.round((new Date(link.expira).getTime() - Date.now()) / 86_400_000);
    assert.equal(dias, 30);
    const l = await (await links(lia)).json();
    assert.ok(l.links.some((x: { id: string }) => x.id === link.id));
    assert.deepEqual((await (await links(bia)).json()).links, []);
    assert.equal((await gravar(lia, { op: "revogar", id: link.id })).status, 200);
    assert.equal((await gravar(lia, { op: "revogar", id: UUID() })).status, 404);
    assert.ok(!(await (await links(lia)).json()).links.some((x: { id: string }) => x.id === link.id));
  });

  test("pacote .zip: sessão e alcance; fluxo.md, fluxo.json e as imagens com os nomes do Markdown", async () => {
    const pacote = (s: string | undefined, id = fluxo) => lr.getPacote(pedido(`/api/criacao/fluxo/pacote?id=${id}`, { cookies: { mae_sessao: s } }));
    assert.equal((await pacote(undefined)).status, 401);
    assert.equal((await pacote(bia)).status, 404, "fluxo de outra organização");
    assert.equal((await pacote(lia, fluxoB)).status, 404);
    assert.equal((await pacote(vic, "nao-e-id")).status, 404);
    const r = await pacote(vic);
    assert.equal(r.status, 200, "quem só lê também baixa (não precisa de link)");
    assert.equal(r.headers.get("content-type"), "application/zip");
    assert.match(r.headers.get("content-disposition")!, /attachment; filename="fluxo-verao-cafe-aurora\.zip"/);
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    const z = zip.lerZip(new Uint8Array(await r.arrayBuffer()));
    const nomeImg = "imagens/01-fim-de-tarde-contraluz.webp";
    assert.deepEqual([...z.keys()], ["fluxo.md", "fluxo.json", nomeImg]);
    const md = z.get("fluxo.md")!.toString();
    assert.ok(md.includes(`- Imagem: "Fim de tarde, contraluz" (${nomeImg})`), md);
    assert.ok(!md.includes("/f/") && !md.includes("/api/"), "imagem sem endereço: o pacote anda sozinho");
    const j = JSON.parse(z.get("fluxo.json")!.toString());
    assert.equal(j.nos.find((n: { tipo: string }) => n.tipo === "imagem").imagem.url, nomeImg);
    assert.equal(z.get(nomeImg)!.subarray(8, 12).toString(), "WEBP");
    const [b] = (await getBanco().sql`select encode(sha256(webp), 'hex') as h from maestro.fluxo_imagens where id = ${img.id}`) as { h: string }[];
    assert.equal(b.h, img.sha256);
  });
});

// ───────────── permissão do link e comentários (drizzle/0039) ─────────────

describe("permissão do link: Só ver, Ver e comentar, Editar", () => {
  let f2: string;
  const N2 = { secao: UUID(), nota: UUID(), imagem: UUID() };
  const NOS_B = { nota: UUID() };
  const criar = async (permissao?: string, pin?: string) => ok(await lk.criarLinkFluxo(ctx.gil, f2, { permissao, pin })).link;
  const comentar = (token: string, corpo: Record<string, unknown>, o: { ip?: string; cookies?: { get(n: string): string | undefined } } = {}) =>
    lk.comentarPeloLink(token, o.cookies ?? sem(), o.ip ?? ip(), { idem: `idem${Math.random().toString(36).slice(2, 12)}`, ...corpo });

  before(async () => {
    f2 = ok(await fx.criarFluxo(ctx.rui, { titulo: "Teaser do verão" })).id;
    ok(
      await fx.aplicarOps(
        ctx.rui,
        f2,
        opsDe([
          { op: "criar_no", id: N2.secao, tipo: "secao", x: 0, y: 0, w: 640, h: 400, z: 1, dados: { nome: "Abertura", cor: "pessego" } },
          { op: "criar_no", id: N2.nota, tipo: "nota", x: 20, y: 60, w: 200, h: 120, z: 2, secaoId: N2.secao, dados: { texto: "Abre no rosto." } },
        ]),
      ),
    );
    ok(
      await fx.aplicarOps(ctx.bia, fluxoB, opsDe([{ op: "criar_no", id: NOS_B.nota, tipo: "nota", x: 0, y: 0, w: 200, h: 120, z: 1, dados: { texto: "B" } }])),
    );
  });

  test("o puro: permissão, nome e texto limpos", () => {
    assert.deepEqual(
      [undefined, null, "", "ver", "comentar", "editar", "admin", 1].map((v) => cp.permissaoDoLink(v)),
      ["ver", "ver", "ver", "ver", "comentar", "editar", null, null],
    );
    assert.equal(cp.nomeDoComentario("  Ana \u200b  Souza\n "), "Ana Souza");
    assert.equal(cp.nomeDoComentario("\u0000\u202e"), null);
    assert.equal(cp.nomeDoComentario("x".repeat(80))?.length, 60);
    assert.equal(cp.nomeDoComentario(12), null);
    assert.equal(cp.textoDoComentario("  Gostei\r\n\r\n\r\n\r\nda luz\u0007  "), "Gostei\n\nda luz");
    assert.equal(cp.textoDoComentario("x".repeat(1001)), null, "maior não corta: recusa");
    assert.equal(cp.textoDoComentario("   \n "), null);
    assert.equal(cp.textoDoComentario("<script>alert(1)</script>"), "<script>alert(1)</script>", "o texto sai como texto (React escapa)");
  });

  test("no banco: padrão ver; escolhida ao criar; inválida recusada; não muda depois; auditada", async () => {
    const v = await criar();
    assert.equal(v.permissao, "ver");
    const c = await criar("comentar");
    assert.equal(c.permissao, "comentar");
    const e = ok(await lk.criarLinkFluxo(ctx.lia, f2, { permissao: "editar" })).link;
    assert.equal(e.permissao, "editar");
    assert.equal((await lk.criarLinkFluxo(ctx.gil, f2, { permissao: "dono" })).ok, false);
    assert.ok((await lk.listarLinksFluxo(ctx.gil, f2)).some((l) => l.id === c.id && l.permissao === "comentar"));
    // maestro_app só muda revogado_em: a permissão é fixa
    const err = await erroDe(getBanco().asUser(ctx.lia, (tx) => tx.execute(sql`update maestro.fluxo_links set permissao = 'editar' where id = ${v.id}`)));
    assert.equal(codigoPg(err), PG.semPrivilegio);
    const err2 = await erroDe(getBanco().asSystem("teste", (tx) => tx.execute(sql`update maestro.fluxo_links set permissao = 'editar' where id = ${v.id}`)));
    assert.equal(mensagemPg(err2), "fluxo_link:permissao", "nem pelo sistema");
    const [a] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select metadata from maestro.audit_log where action = 'fluxo.link_criou' and metadata ->> 'link' = ${c.id}`),
    )) as unknown as { metadata: { permissao: string } }[];
    assert.equal(a.metadata.permissao, "comentar");
    for (const l of [v, c, e]) ok(await lk.revogarLinkFluxo(ctx.lia, l.id));
  });

  test("Ver e comentar: só o nome; nó do fluxo ou o fluxo todo; idempotente; quem abre vê os comentários", async () => {
    const l = await criar("comentar");
    const aberto = await lk.abrirFluxoPublico(l.token!, sem(), ip());
    assert.equal(aberto.estado, "ok");
    if (aberto.estado !== "ok") return;
    assert.equal(aberto.dados.permissao, "comentar");
    assert.deepEqual(aberto.dados.comentarios, []);
    const um = await comentar(l.token!, { nome: "  Ana  \u200bSouza ", texto: "Gostei\r\n\r\n\r\nda luz", no: N2.nota, idem: "idem-ana-0001" });
    assert.ok(um.ok, JSON.stringify(um));
    if (!um.ok) return;
    assert.equal(um.comentario.nome, "Ana Souza");
    assert.equal(um.comentario.texto, "Gostei\n\nda luz");
    assert.equal(um.comentario.no, N2.nota);
    const de = await comentar(l.token!, { nome: "Ana Souza", texto: "Outro texto", no: N2.nota, idem: "idem-ana-0001" });
    assert.ok(de.ok && de.comentario.id === um.comentario.id, "a mesma chave devolve o mesmo comentário");
    const geral = await comentar(l.token!, { nome: "Bruno", texto: "No geral, ótimo." });
    assert.ok(geral.ok && geral.comentario.no === null);
    // forma recusada antes do banco e no banco
    const invisivel = await comentar(l.token!, { nome: " \u200b ", texto: "x" });
    assert.ok(!invisivel.ok && invisivel.erro === "nome", "só invisível não é nome");
    const sem_nome = await comentar(l.token!, { nome: "", texto: "x" });
    assert.ok(!sem_nome.ok && sem_nome.erro === "nome" && sem_nome.status === 400);
    const grande = await comentar(l.token!, { nome: "Ana", texto: "x".repeat(1001) });
    assert.ok(!grande.ok && grande.erro === "texto");
    for (const no of [NOS_B.nota, N2.secao, UUID(), "../x", 12]) {
      const r = await comentar(l.token!, { nome: "Ana", texto: "x", no });
      assert.ok(!r.ok && r.erro === "no", `nó ${String(no)}`);
    }
    const sem_idem = await lk.comentarPeloLink(l.token!, sem(), ip(), { nome: "Ana", texto: "x" });
    assert.ok(!sem_idem.ok && sem_idem.erro === "formato");
    // quem abre vê os comentários vivos, em ordem
    const de_novo = await lk.abrirFluxoPublico(l.token!, sem(), ip());
    assert.ok(de_novo.estado === "ok");
    if (de_novo.estado === "ok")
      assert.deepEqual(
        de_novo.dados.comentarios.map((c) => [c.nome, c.no]),
        [
          ["Ana Souza", N2.nota],
          ["Bruno", null],
        ],
      );
    // auditado, sem IP
    const aud = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select metadata from maestro.audit_log where action = 'fluxo.link_comentou' and metadata ->> 'link' = ${l.id}`),
    )) as unknown as { metadata: Record<string, unknown> }[];
    assert.equal(aud.length, 2);
    assert.ok(!JSON.stringify(aud).includes("10.9."), "nada de IP");
    // o .json e o .md continuam sem os comentários
    const js = await lr.getArquivoPublico(pedido(`/f/${l.token}.json`, { ip: ip() }), l.token!, "json");
    assert.ok(!(await js.text()).includes("Gostei"));
  });

  test("Só ver e Editar não recebem comentário; revogado, vencido e PIN também não", async () => {
    for (const p of ["ver", "editar"]) {
      const l = await criar(p);
      const r = await comentar(l.token!, { nome: "Ana", texto: "x" });
      assert.ok(!r.ok && r.erro === "permissao" && r.status === 403, p);
      const a = await lk.abrirFluxoPublico(l.token!, sem(), ip());
      assert.ok(a.estado === "ok" && a.dados.comentarios.length === 0);
      ok(await lk.revogarLinkFluxo(ctx.lia, l.id));
    }
    const rev = await criar("comentar");
    assert.ok((await comentar(rev.token!, { nome: "Ana", texto: "antes" })).ok);
    ok(await lk.revogarLinkFluxo(ctx.lia, rev.id));
    const r1 = await comentar(rev.token!, { nome: "Ana", texto: "depois" });
    assert.ok(!r1.ok && r1.erro === "morto" && r1.status === 404, "revogado");
    const venc = await criar("comentar");
    await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`update maestro.fluxo_links set criado_em = now() - interval '3 days', expira_em = now() - interval '1 day' where id = ${venc.id}`),
    );
    const r2 = await comentar(venc.token!, { nome: "Ana", texto: "x" });
    assert.ok(!r2.ok && r2.erro === "morto", "vencido");
    const comPin = await criar("comentar", "4321");
    const r3 = await comentar(comPin.token!, { nome: "Ana", texto: "x" });
    assert.ok(!r3.ok && r3.erro === "pin" && r3.status === 401);
    const p = await lk.conferirPinFluxo(comPin.token!, "4321", ip());
    assert.ok(p.ok);
    if (p.ok) {
      const r4 = await comentar(
        comPin.token!,
        { nome: "Ana", texto: "com PIN" },
        { cookies: { get: (n: string) => (n === p.cookie.nome ? p.cookie.valor : undefined) } },
      );
      assert.ok(r4.ok, JSON.stringify(r4));
    }
    ok(await lk.revogarLinkFluxo(ctx.lia, comPin.id));
    assert.ok(!(await comentar("x".repeat(43), { nome: "Ana", texto: "x" })).ok, "token desconhecido");
  });

  test("limite: 20 a cada 15 min por link e IP (outro IP segue)", async () => {
    const l = await criar("comentar");
    const meu = ip();
    for (let i = 0; i < 20; i++) assert.ok((await comentar(l.token!, { nome: "Ana", texto: `n${i}` }, { ip: meu })).ok, `comentário ${i}`);
    const r = await comentar(l.token!, { nome: "Ana", texto: "um a mais" }, { ip: meu });
    assert.ok(!r.ok && r.erro === "limite" && r.status === 429);
    assert.ok((await comentar(l.token!, { nome: "Bia", texto: "de outro lugar" })).ok);
    ok(await lk.revogarLinkFluxo(ctx.lia, l.id));
  });

  test("a equipe lê e apaga (quem edita); outra organização não vê; ninguém escreve pela tabela", async () => {
    const l = await criar("comentar");
    const c = await comentar(l.token!, { nome: "Cliente", texto: "Trocar a trilha.", no: N2.nota });
    assert.ok(c.ok);
    if (!c.ok) return;
    for (const k of ["lia", "gil", "rui", "vic"] as const)
      assert.ok(
        (await lk.comentariosDoFluxo(ctx[k], f2)).some((x) => x.id === c.comentario.id && x.no === N2.nota),
        `${k} lê`,
      );
    assert.deepEqual(await lk.comentariosDoFluxo(ctx.bia, f2), [], "outra organização não vê");
    const deB = (await getBanco().asUser(ctx.bia, (tx) => tx.execute(sql`select count(*)::int as n from maestro.fluxo_comentarios`))) as unknown as {
      n: number;
    }[];
    assert.equal(deB[0].n, 0);
    // pela tabela, ninguém insere nem muda texto
    const ins = await erroDe(
      getBanco().asUser(ctx.lia, (tx) =>
        tx.execute(
          sql`insert into maestro.fluxo_comentarios (org_id, fluxo_id, link_id, nome, texto, idem_key) values (${orgA}, ${f2}, ${l.id}, 'X', 'Y', 'idem-forjado-01')`,
        ),
      ),
    );
    assert.equal(codigoPg(ins), PG.semPrivilegio);
    const upd = await erroDe(
      getBanco().asUser(ctx.lia, (tx) => tx.execute(sql`update maestro.fluxo_comentarios set texto = 'outro' where id = ${c.comentario.id}`)),
    );
    assert.equal(codigoPg(upd), PG.semPrivilegio);
    // quem só lê não apaga; outra organização também não
    assert.equal((await lk.apagarComentarioFluxo(ctx.vic, c.comentario.id)).ok, false);
    assert.equal((await lk.apagarComentarioFluxo(ctx.bia, c.comentario.id)).ok, false);
    // quem edita apaga, uma vez; auditado; some para quem abre
    ok(await lk.apagarComentarioFluxo(ctx.rui, c.comentario.id));
    assert.equal((await lk.apagarComentarioFluxo(ctx.rui, c.comentario.id)).ok, false);
    assert.ok(!(await lk.comentariosDoFluxo(ctx.lia, f2)).some((x) => x.id === c.comentario.id));
    const [a] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select actor_sub from maestro.audit_log where action = 'fluxo.comentario_apagou' and metadata ->> 'comentario' = ${c.comentario.id}`),
    )) as unknown as { actor_sub: string }[];
    assert.equal(a.actor_sub, RUI.sub);
    const ab = await lk.abrirFluxoPublico(l.token!, sem(), ip());
    assert.ok(ab.estado === "ok" && !ab.dados.comentarios.some((x) => x.id === c.comentario.id));
    // voltar não volta
    const volta = await erroDe(
      getBanco().asSystem("teste", (tx) => tx.execute(sql`update maestro.fluxo_comentarios set apagado_em = null where id = ${c.comentario.id}`)),
    );
    assert.equal(mensagemPg(volta), "fluxo_comentario:apagado");
    ok(await lk.revogarLinkFluxo(ctx.lia, l.id));
  });

  test("Editar: só quem é da produtora do link e edita a Criação; o resto lê", async () => {
    const l = await criar("editar");
    const quem = (orgId: string, podeEditar = true, temAcesso = true) => ({ orgId, podeEditar, temAcesso });
    assert.equal(await lk.fluxoParaEditar(l.token!, sem(), quem(orgA)), f2);
    assert.equal(await lk.fluxoParaEditar(l.token!, sem(), quem(orgB)), null, "de outra produtora");
    assert.equal(await lk.fluxoParaEditar(l.token!, sem(), quem(orgA, false)), null, "papel que só lê");
    assert.equal(await lk.fluxoParaEditar(l.token!, sem(), quem(orgA, true, false)), null, "sem o Maestro");
    assert.equal(await lk.fluxoParaEditar(l.token!, sem(), null), null, "sem conta");
    const c = await criar("comentar");
    assert.equal(await lk.fluxoParaEditar(c.token!, sem(), quem(orgA)), null, "link que não é Editar");
    const p = await criar("editar", "9876");
    assert.equal(await lk.fluxoParaEditar(p.token!, sem(), quem(orgA)), null, "PIN antes");
    for (const x of [l, c, p]) ok(await lk.revogarLinkFluxo(ctx.lia, x.id));
    assert.equal(await lk.fluxoParaEditar(l.token!, sem(), quem(orgA)), null, "revogado");
  });

  test("rotas: comentar de fora (Origin, cabeçalhos) e a equipe lê e apaga com o papel", async () => {
    const l = await criar("comentar");
    const enviar = (corpo: unknown, origin?: string | null) =>
      lr.postComentarPublico(pedido(`/f/${l.token}/comentar`, { corpo, origin, ip: ip() }), Promise.resolve({ token: l.token! }));
    assert.equal((await enviar({ nome: "Ana", texto: "x", idem: "idem-rota-0001" }, "https://outro.exemplo")).status, 403);
    const r = await enviar({ nome: "Ana", texto: "Pela rota", idem: "idem-rota-0001" });
    assert.equal(r.status, 201);
    assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    assert.equal(r.headers.get("referrer-policy"), "no-referrer");
    const { comentario } = await r.json();
    assert.equal(comentario.nome, "Ana");
    assert.equal((await enviar({ nome: "", texto: "x", idem: "idem-rota-0002" })).status, 400);
    const ler = (s: string | undefined) => lr.getComentarios(pedido(`/api/criacao/fluxo/comentarios?fluxo=${f2}`, { cookies: { mae_sessao: s } }));
    const apagar = (s: string | undefined, id: string, origin?: string | null) =>
      lr.postComentarios(pedido("/api/criacao/fluxo/comentarios", { cookies: { mae_sessao: s }, corpo: { op: "apagar", id }, origin }));
    assert.equal((await ler(undefined)).status, 401);
    assert.ok(((await (await ler(vic)).json()).comentarios as { id: string }[]).some((x) => x.id === comentario.id));
    assert.deepEqual((await (await ler(bia)).json()).comentarios, []);
    assert.equal((await apagar(vic, comentario.id)).status, 403);
    assert.equal((await apagar(rui, comentario.id, "https://outro.exemplo")).status, 403);
    assert.equal((await apagar(rui, comentario.id)).status, 200);
    assert.equal((await apagar(rui, comentario.id)).status, 404);
    ok(await lk.revogarLinkFluxo(ctx.lia, l.id));
  });
});
