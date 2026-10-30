// As rotas do Fluxo (/api/criacao/fluxo e /api/criacao/img): sessão e acesso no servidor (401/403), Origin nas
// gravações, papel (leitura só lê; apagar de vez só administração e gestão), operações com o índice do erro, o que
// mudou desde, e a imagem: envio com limite de tamanho e tipo, leitura só com sessão, organização e alcance certos
// (404 igual para o que não existe e o que está fora), cabeçalhos de cache privado e nosniff.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import sharp from "sharp";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import type { PessoaZro } from "./zro-falso.mts";

const amb = await prepararAmbiente("fluxo_rota");
const { zro } = amb;
const rotas = await import("../src/lib/zro/rotas");
const { getFluxo, postFluxo, postImagem, getImagem } = await import("../src/lib/criacao/fluxo/rota");
const { criarCliente } = await import("../src/lib/crm/clientes");
const pessoas = await import("../src/lib/pessoas");

const ORG_A = { id: UUID(), name: "Produtora A", role: "owner" };
const ORG_B = { id: UUID(), name: "Produtora B", role: "owner" };
const LIA: PessoaZro = { sub: UUID(), email: "lia@a.exemplo", nome: "Lia", org: ORG_A, produtos: ["maestro"] };
const RUI: PessoaZro = { sub: UUID(), email: "rui@a.exemplo", nome: "Rui", org: { ...ORG_A, role: "editor" }, produtos: ["maestro"] };
const VIC: PessoaZro = { sub: UUID(), email: "vic@a.exemplo", nome: "Vic", org: { ...ORG_A, role: "viewer" }, produtos: ["maestro"] };
const BIA: PessoaZro = { sub: UUID(), email: "bia@b.exemplo", nome: "Bia", org: ORG_B, produtos: ["maestro"] };
const SEM: PessoaZro = { sub: UUID(), email: "sem@a.exemplo", nome: "Sem", org: { ...ORG_A, role: "editor" }, produtos: [] };

after(() => amb.fechar());

async function entrar(pessoa: PessoaZro): Promise<string> {
  Object.assign(zro.estado.proximo, { pessoa, adulterar: null, negar: false });
  const ida = await rotas.entrar(pedido("/api/zro/entrar"));
  const z = await fetch(new URL(ida.headers.get("location")!), { redirect: "manual" });
  const volta = await rotas.callback(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida).get("mae_zro") } }));
  return cookiesDe(volta).get("mae_sessao")!;
}

const ler = (s: string | undefined, query = "") => getFluxo(pedido(`/api/criacao/fluxo${query}`, { cookies: { mae_sessao: s } }));
const gravar = (s: string | undefined, corpo: Record<string, unknown>, origin?: string | null) =>
  postFluxo(pedido("/api/criacao/fluxo", { cookies: { mae_sessao: s }, corpo, origin }));
function enviar(s: string | undefined, fluxo: string, bytes: Uint8Array, extras: Record<string, string> = {}, origin: string | null = SITE) {
  const headers = new Headers({ host: "localhost:3000", "content-type": "image/png", ...extras });
  if (s) headers.set("cookie", `mae_sessao=${encodeURIComponent(s)}`);
  if (origin) headers.set("origin", origin);
  return postImagem(new Request(new URL(`/api/criacao/img?fluxo=${fluxo}`, SITE), { method: "POST", headers, body: new Uint8Array(bytes) }));
}
const imagem = (s: string | undefined, id: string, sha: string, mini = false) =>
  getImagem(pedido(`/api/criacao/img/${id}/${sha}${mini ? "?mini=1" : ""}`, { cookies: { mae_sessao: s } }), Promise.resolve({ id, sha }));
const png = (cor: string) =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: cor } })
    .png()
    .toBuffer();

let lia: string, rui: string, vic: string, bia: string, sem: string;
let orgA: string;
let cliente: string;
let fluxo: string;
let img: { id: string; sha256: string; url: string; miniUrl: string };

before(async () => {
  lia = await entrar(LIA);
  rui = await entrar(RUI);
  vic = await entrar(VIC);
  bia = await entrar(BIA);
  sem = await entrar(SEM);
  const [o] = await amb.banco.getBanco().sql`select id from maestro.organizations where zro_org_id = ${ORG_A.id}`;
  orgA = o.id;
  const c = await criarCliente(
    { sub: LIA.sub, orgId: orgA },
    { nome: "Café Aurora", empresa: null, contato: null, whatsapp: null, email: null, observacoes: null, status: "ativo" },
  );
  assert.ok(c.ok);
  cliente = c.id;
});

describe("rota do fluxo", () => {
  test("sem sessão 401; sem o Maestro 403; outra origem 403; leitura não grava", async () => {
    assert.equal((await ler(undefined)).status, 401);
    assert.equal((await gravar(undefined, { op: "criar", titulo: "x" })).status, 401);
    assert.equal((await ler(sem)).status, 403);
    assert.equal((await gravar(rui, { op: "criar", titulo: "x" }, "https://outro.exemplo")).status, 403);
    const r = await gravar(vic, { op: "criar", titulo: "x" });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).erro, "sem_permissao");
    assert.equal((await gravar(rui, { op: "explodir" })).status, 400);
  });

  test("criar, operações, carregar e o que mudou", async () => {
    const c = await gravar(rui, { op: "criar", titulo: "Verão" });
    assert.equal(c.status, 201);
    fluxo = (await c.json()).id;
    const nota = UUID();
    const r = await gravar(rui, {
      op: "ops",
      id: fluxo,
      ops: [
        { op: "criar_no", id: nota, tipo: "nota", x: 10, y: 20, dados: { texto: "Paleta quente" } },
        { op: "criar_no", tipo: "link", x: 300, y: 20, dados: { url: "https://vimeo.com/76979871", titulo: "Ritmo" } },
      ],
    });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.resultados.length, 2);
    assert.equal(d.resultados[1].no.dados.link.embed, "https://player.vimeo.com/video/76979871");
    const ruim = await gravar(rui, {
      op: "ops",
      id: fluxo,
      ops: [
        { op: "mudar_no", id: nota, x: 1 },
        { op: "criar_no", tipo: "video" },
      ],
    });
    assert.equal(ruim.status, 400);
    assert.deepEqual(await ruim.json(), { erro: "formato", mensagem: "Tipo de item desconhecido.", indice: 1 });
    const conflito = await gravar(lia, { op: "ops", id: fluxo, ops: [{ op: "mudar_no", id: nota, rev: 9, dados: { texto: "x" } }] });
    assert.equal(conflito.status, 200, "conflito por item vem no resultado");
    assert.equal((await conflito.json()).resultados[0].erro, "conflito");

    const tudo = await ler(vic, `?id=${fluxo}`);
    assert.equal(tudo.status, 200);
    const t = await tudo.json();
    assert.deepEqual([t.nos.length, t.podeEditar, t.podeEnviar, t.eu], [2, false, false, VIC.sub]);
    const desde = await ler(vic, `?id=${fluxo}&desde=${encodeURIComponent(t.cursor)}`);
    assert.equal(desde.status, 200);
    assert.ok(Array.isArray((await desde.json()).nos));
    assert.equal((await ler(vic, `?id=${fluxo}&desde=ontem`)).status, 400);
    assert.equal((await ler(bia, `?id=${fluxo}`)).status, 404, "a outra organização não acha");
    const lista = await (await ler(lia)).json();
    assert.deepEqual([lista.fluxos.length, lista.fluxos[0].itens, lista.podeEnviar], [1, 2, true]);
    assert.equal(lista.uso.limite, 200 * 1024 * 1024);
    assert.deepEqual((await (await ler(bia)).json()).fluxos, []);
  });

  test("título com conflito (409 com o atual), lixeira, apagar de vez só administração e gestão", async () => {
    assert.equal((await gravar(rui, { op: "titulo", id: fluxo, rev: 1, titulo: "Verão · Café" })).status, 200);
    const velho = await gravar(lia, { op: "titulo", id: fluxo, rev: 1, titulo: "Outro" });
    assert.equal(velho.status, 409);
    assert.equal((await velho.json()).atual.titulo, "Verão · Café");
    const outro = (await (await gravar(rui, { op: "criar", titulo: "Rascunho" })).json()).id;
    assert.equal((await gravar(rui, { op: "lixeira", id: outro })).status, 200);
    assert.equal((await gravar(rui, { op: "apagar_de_vez", id: outro })).status, 403);
    assert.equal((await gravar(lia, { op: "apagar_de_vez", id: fluxo })).status, 409, "fora da lixeira");
    assert.equal((await gravar(lia, { op: "apagar_de_vez", id: outro })).status, 200);
    assert.equal((await gravar(bia, { op: "lixeira", id: fluxo })).status, 404);
  });
});

describe("rota da imagem", () => {
  test("envio: tamanho, tipo, origem, papel", async () => {
    assert.equal((await enviar(undefined, fluxo, await png("#c96"))).status, 401);
    assert.equal((await enviar(rui, fluxo, await png("#c96"), {}, "https://outro.exemplo")).status, 403);
    assert.equal((await enviar(vic, fluxo, await png("#c96"))).status, 403);
    assert.equal((await enviar(rui, fluxo, new Uint8Array(0))).status, 400);
    const grande = await enviar(rui, fluxo, new Uint8Array(12 * 1024 * 1024 + 1));
    assert.equal(grande.status, 413);
    const svg = await enviar(rui, fluxo, new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    assert.equal(svg.status, 415);
    assert.equal((await enviar(bia, fluxo, await png("#c96"))).status, 404, "fluxo de outra organização");
    const r = await enviar(rui, fluxo, await png("#c96"));
    assert.equal(r.status, 201);
    img = (await r.json()).imagem;
    assert.match(img.url, /^\/api\/criacao\/img\/[0-9a-f-]{36}\/[0-9a-f]{64}$/);
    assert.equal((await enviar(rui, fluxo, await png("#c96"))).status, 200, "a mesma: reaproveita");
  });

  test("leitura: só com sessão, organização e alcance; cabeçalhos de imagem privada", async () => {
    assert.equal((await imagem(undefined, img.id, img.sha256)).status, 401);
    const r = await imagem(vic, img.id, img.sha256);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/webp");
    assert.equal(r.headers.get("cache-control"), "private, max-age=31536000, immutable");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("content-security-policy"), "default-src 'none'; sandbox");
    assert.equal(r.headers.get("cross-origin-resource-policy"), "same-origin");
    const corpo = Buffer.from(await r.arrayBuffer());
    assert.equal(corpo.subarray(8, 12).toString(), "WEBP");
    assert.equal(Number(r.headers.get("content-length")), corpo.length);
    const mini = await imagem(vic, img.id, img.sha256, true);
    assert.equal(mini.status, 200);
    const [mg, mm] = await Promise.all([sharp(corpo).metadata(), sharp(Buffer.from(await mini.arrayBuffer())).metadata()]);
    assert.deepEqual([mg.width, mm.width], [900, 320]);
    // 404 igual: sha errado, id inexistente, outra organização, quem é restrito a outro cliente
    for (const [s, id, sha] of [
      [vic, img.id, "0".repeat(64)],
      [vic, UUID(), img.sha256],
      [vic, "nao-e-id", img.sha256],
      [bia, img.id, img.sha256],
    ] as const) {
      const n = await imagem(s, id, sha);
      assert.equal(n.status, 404, `${id}/${sha}`);
      assert.equal(n.headers.get("cache-control"), "no-store");
    }
    assert.ok((await pessoas.salvarAcesso({ sub: LIA.sub, orgId: orgA }, VIC.sub, true, [cliente])).ok);
    try {
      assert.equal((await imagem(vic, img.id, img.sha256)).status, 404, "fluxo sem vínculo: fora do alcance de quem é restrito");
      assert.equal((await ler(vic, `?id=${fluxo}`)).status, 404);
    } finally {
      assert.ok((await pessoas.salvarAcesso({ sub: LIA.sub, orgId: orgA }, VIC.sub, false, [])).ok);
    }
    assert.equal((await imagem(vic, img.id, img.sha256)).status, 200);
  });
});
