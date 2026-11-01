/**
 * Coleções que voltam sozinhas (docs/REFERENCIAS.md §2.1): o Drive desconectado na migração levou as linhas de
 * `colecoes` em cascata, mas as pastas "SOBEDESCE Referências/<nome>" ficaram. A raiz antiga (do cliente OAuth antigo,
 * sem a marca que este app enxerga) é achada pelo nome e reaproveitada; abrir Referências e reconectar o Drive trazem
 * as coleções de volta, sem duplicar; nome já usado e pasta tirada da plataforma ficam de fora; drive.file não acha nada.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { cookiesDe, pedido, prepararAmbiente, SITE, type Pedido } from "./ambiente.mjs";
import type { ArquivoFalso, ContaFalsa } from "./google-falso.mjs";

const PASTA = "application/vnd.google-apps.folder";
const DRIVE = "https://www.googleapis.com/auth/drive";
const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";

let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let contas: typeof import("../src/lib/auth/contas");
let cripto: typeof import("../src/lib/google/cripto");
let colecoesLib: typeof import("../src/lib/referencias/colecoes");
let rotas: typeof import("../src/lib/google/rotas");
let conectar: typeof import("../src/app/api/google/conectar/route");
let rColecoes: typeof import("../src/app/api/referencias/colecoes/route");
let rColecao: typeof import("../src/app/api/referencias/colecoes/[id]/route");
let drizzle: typeof import("drizzle-orm");

type Pessoa = { id: string; cookie: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const corpo = async (res: Response) => (await res.json()) as Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as any;
const comCookie = (p: Pessoa, extra: Pedido = {}): Pedido => ({ cookies: { sd_sessao: p.cookie }, ...extra });

let ip = 1;
async function novaPessoa(nome: string, email: string): Promise<Pessoa> {
  const r = await contas.criarConta({ nome, email, senha: "uma senha comprida", ip: `10.9.0.${ip++}` });
  assert.ok(r.ok);
  return { id: r.usuario.id, cookie: r.token };
}

/** Liga o Drive sem o consentimento (como o titular depois da migração: conta Google nova, mesmo Drive). */
async function ligarDrive(p: Pessoa, conta: ContaFalsa, id: string, escopo = DRIVE) {
  const { db, schema } = amb.banco;
  const refresh = amb.google.emitirRefresh(conta, `openid email profile ${escopo}`);
  await db.insert(schema.contasGoogle).values({
    id,
    usuarioId: p.id,
    googleSub: conta.sub,
    email: conta.email,
    nome: conta.name,
    refreshTokenEnc: cripto.selar(refresh, `contas_google.refresh:${id}`),
    escopos: `openid email profile ${escopo}`,
  });
}

/** O que o SOBEDESCE antigo deixou: a raiz e as coleções, criadas por outro cliente OAuth (marca invisível daqui). */
function driveAntigo(sub: string, nomes: string[], quando = "2026-03-01T10:00:00.000Z") {
  const raiz = amb.google.adicionarArquivo(sub, { name: "SOBEDESCE Referências", mimeType: PASTA, parents: ["root"], foraDoApp: true, createdTime: quando });
  const pastas = nomes.map((name, i) =>
    amb.google.adicionarArquivo(sub, { name, mimeType: PASTA, parents: [raiz.id], foraDoApp: true, createdTime: `2026-04-0${i + 1}T10:00:00.000Z` }),
  );
  return { raiz, pastas };
}

const raizesNoDrive = (sub: string) => [...amb.google.driveDe(sub).values()].filter((f) => f.name === "SOBEDESCE Referências" && f.mimeType === PASTA && !f.trashed);
const listar = async (p: Pessoa) => corpo(await rColecoes.GET(pedido("/api/referencias/colecoes", comCookie(p))));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nomes = (l: Record<string, any>) => (l.colecoes as { nome: string }[]).map((c) => c.nome).sort();

before(async () => {
  amb = await prepararAmbiente();
  contas = await import("../src/lib/auth/contas");
  cripto = await import("../src/lib/google/cripto");
  colecoesLib = await import("../src/lib/referencias/colecoes");
  rotas = await import("../src/lib/google/rotas");
  conectar = await import("../src/app/api/google/conectar/route");
  rColecoes = await import("../src/app/api/referencias/colecoes/route");
  rColecao = await import("../src/app/api/referencias/colecoes/[id]/route");
  drizzle = await import("drizzle-orm");
});

after(async () => {
  await amb?.fechar();
});

describe("raiz antiga", () => {
  test("sem a marca deste app: achada pelo nome (a mais antiga, só a minha), reaproveitada e marcada", async () => {
    const quem = await novaPessoa("Raiz", "raiz@exemplo.com");
    const g: ContaFalsa = { sub: "r-1", email: "raiz.drive@exemplo.com", name: "Raiz" };
    const alheia = amb.google.adicionarArquivo(g.sub, { name: "SOBEDESCE Referências", mimeType: PASTA, parents: ["root"], deOutraPessoa: true, createdTime: "2025-01-01T00:00:00.000Z" });
    const { raiz } = driveAntigo(g.sub, [], "2026-02-01T00:00:00.000Z");
    amb.google.adicionarArquivo(g.sub, { name: "SOBEDESCE Referências", mimeType: PASTA, parents: ["root"], foraDoApp: true, createdTime: "2026-05-01T00:00:00.000Z" });
    await ligarDrive(quem, g, "gr-1");
    const nova = await rColecoes.POST(pedido("/api/referencias/colecoes", comCookie(quem, { corpo: { nome: "Primeira" } })));
    assert.equal(nova.status, 201);
    const { colecao } = await corpo(nova);
    assert.deepEqual(amb.google.driveDe(g.sub).get(colecao.driveFolderId)!.parents, [raiz.id], "a coleção nova entra na raiz antiga");
    assert.equal(raizesNoDrive(g.sub).length, 3, "nenhuma raiz nova");
    assert.equal(amb.google.driveDe(g.sub).get(raiz.id)!.appProperties?.sobedesce, "referencias", "ganhou a marca deste app");
    assert.equal(alheia.appProperties, undefined, "a pasta de outra pessoa não é tocada");
    const [linha] = await amb.banco.db.select().from(amb.banco.schema.contasGoogle).where(drizzle.eq(amb.banco.schema.contasGoogle.id, "gr-1"));
    assert.equal(linha.referenciasPastaId, raiz.id);
  });

  test("sem raiz nenhuma: cria uma (como antes)", async () => {
    const quem = await novaPessoa("Vazio", "vazio@exemplo.com");
    const g: ContaFalsa = { sub: "r-2", email: "vazio.drive@exemplo.com", name: "Vazio" };
    await ligarDrive(quem, g, "gr-2");
    assert.equal((await rColecoes.POST(pedido("/api/referencias/colecoes", comCookie(quem, { corpo: { nome: "Clipes" } })))).status, 201);
    const raizes = raizesNoDrive(g.sub);
    assert.equal(raizes.length, 1);
    assert.deepEqual(raizes[0].parents, ["root"]);
    assert.equal(raizes[0].appProperties?.sobedesce, "referencias");
  });
});

describe("recuperar coleções", () => {
  let titular: Pessoa;
  const g: ContaFalsa = { sub: "t-1", email: "contato@dissesim.exemplo", name: "Titular" };
  let antigo: { raiz: ArquivoFalso; pastas: ArquivoFalso[] };
  let video: ArquivoFalso;

  before(async () => {
    titular = await novaPessoa("Titular", "zro.contato@exemplo.com");
    antigo = driveAntigo(g.sub, ["Clipes", "Fotografia", "Luz/sombra", "Na lixeira", "Já tenho"]);
    antigo.pastas[3].trashed = true;
    video = amb.google.adicionarArquivo(g.sub, { name: "plano.mp4", mimeType: "video/mp4", parents: [antigo.pastas[0].id], foraDoApp: true, description: "https://www.instagram.com/reel/C1/" });
    amb.google.adicionarArquivo(g.sub, { name: "solto.txt", mimeType: "text/plain", parents: [antigo.raiz.id], foraDoApp: true });
    const alheia = amb.google.adicionarArquivo(g.sub, { name: "SOBEDESCE Referências", mimeType: PASTA, parents: ["root"], deOutraPessoa: true });
    amb.google.adicionarArquivo(g.sub, { name: "De outra pessoa", mimeType: PASTA, parents: [alheia.id], deOutraPessoa: true });
    await ligarDrive(titular, g, "gt-1");
    // Uma coleção com o nome "Já tenho" já existe, em outra pasta: a antiga com esse nome fica de fora.
    await amb.banco.db.insert(amb.banco.schema.colecoes).values({ id: "ja-tenho", usuarioId: titular.id, contaGoogleId: "gt-1", driveFolderId: "outra-pasta", nome: "Já tenho", nomeChave: "ja tenho" });
  });

  test("abrir Referências traz de volta as coleções que estão no Drive", async () => {
    const l = await listar(titular);
    assert.equal(l.ok, true);
    assert.deepEqual(nomes(l), ["Clipes", "Fotografia", "Já tenho"]);
    const clipes = l.colecoes.find((c: { nome: string }) => c.nome === "Clipes");
    assert.equal(clipes.driveFolderId, antigo.pastas[0].id, "a coleção aponta para a pasta antiga (os arquivos estão nela)");
    assert.equal(clipes.contaGoogleId, "gt-1");
    assert.equal(clipes.link, null);
    assert.equal(clipes.criadoEm, "2026-04-01T10:00:00.000Z", "a data é a da pasta");
    assert.ok(amb.google.driveDe(g.sub).get(video.id), "nada muda nos arquivos");
    assert.deepEqual(l.raiz, { contaGoogleId: "gt-1", driveFolderId: antigo.raiz.id }, "a raiz antiga vira a raiz deste Drive");
    assert.equal(raizesNoDrive(g.sub).length, 2, "nenhuma raiz nova (a outra é de outra pessoa)");
  });

  test("de novo: não duplica; dentro de 10 min a lista nem vai ao Drive", async () => {
    const antes = amb.google.contadoresDrive.list;
    assert.deepEqual(nomes(await listar(titular)), ["Clipes", "Fotografia", "Já tenho"]);
    assert.equal(amb.google.contadoresDrive.list, antes, "conferido há pouco");
    const r = await colecoesLib.recuperarColecoes(titular.id, { forcar: true });
    assert.deepEqual(r, { contas: 1, criadas: 0, falhas: 0 });
    const linhas = await amb.banco.db.select().from(amb.banco.schema.colecoes).where(drizzle.eq(amb.banco.schema.colecoes.usuarioId, titular.id));
    assert.equal(linhas.length, 3);
  });

  test("passados 10 min, abrir de novo confere o Drive outra vez", async () => {
    amb.google.adicionarArquivo(g.sub, { name: "Achada depois", mimeType: PASTA, parents: [antigo.raiz.id], foraDoApp: true });
    const { db, schema } = amb.banco;
    await db.update(schema.contasGoogle).set({ referenciasConferidasEm: new Date(Date.now() - 11 * 60_000) }).where(drizzle.eq(schema.contasGoogle.id, "gt-1"));
    assert.deepEqual(nomes(await listar(titular)), ["Achada depois", "Clipes", "Fotografia", "Já tenho"]);
  });

  test("tirada só da plataforma não volta; criar com o mesmo nome aproveita a pasta e ela volta a valer", async () => {
    const l = await listar(titular);
    const foto = l.colecoes.find((c: { nome: string }) => c.nome === "Fotografia");
    const del = await rColecao.DELETE(pedido(`/api/referencias/colecoes/${foto.id}`, comCookie(titular, { method: "DELETE" })), ctx({ id: foto.id }));
    assert.equal(del.status, 200);
    assert.equal((await colecoesLib.recuperarColecoes(titular.id, { forcar: true })).criadas, 0);
    assert.ok(!nomes(await listar(titular)).includes("Fotografia"));
    const outra = await corpo(await rColecoes.POST(pedido("/api/referencias/colecoes", comCookie(titular, { corpo: { nome: "Fotografia" } }))));
    assert.equal(outra.colecao.driveFolderId, antigo.pastas[1].id, "mesma pasta");
    const [linha] = await amb.banco.db.select().from(amb.banco.schema.contasGoogle).where(drizzle.eq(amb.banco.schema.contasGoogle.id, "gt-1"));
    assert.deepEqual(linha.referenciasIgnoradas, []);
  });

  test("Drive com erro: fica no log e o próximo Drive segue", async () => {
    const quem = await novaPessoa("Dois Drives", "dois@exemplo.com");
    const bom: ContaFalsa = { sub: "d-2", email: "bom@exemplo.com", name: "Bom" };
    driveAntigo(bom.sub, ["Do Drive bom"]);
    const { db, schema } = amb.banco;
    // O primeiro Drive tem um refresh que não abre (chave trocada): a conta dele dá erro.
    await db.insert(schema.contasGoogle).values({ id: "gd-1", usuarioId: quem.id, googleSub: "d-1", email: "ruim@exemplo.com", refreshTokenEnc: "x", criadoEm: new Date(Date.now() - 60_000) });
    await ligarDrive(quem, bom, "gd-2");
    const r = await colecoesLib.recuperarColecoes(quem.id);
    assert.equal(r.contas, 2);
    assert.equal(r.criadas, 1);
    assert.equal(r.falhas, 1);
  });

  test("drive.file: as pastas do app antigo não aparecem, e nada quebra", async () => {
    const quem = await novaPessoa("Arquivos", "arquivos@exemplo.com");
    const g2: ContaFalsa = { sub: "f-1", email: "arquivos.drive@exemplo.com", name: "Arquivos" };
    driveAntigo(g2.sub, ["Invisível"]);
    await ligarDrive(quem, g2, "gf-1", DRIVE_FILE);
    assert.deepEqual(await colecoesLib.recuperarColecoes(quem.id), { contas: 1, criadas: 0, falhas: 0 });
    assert.deepEqual((await listar(quem)).colecoes, []);
  });
});

describe("reconectar o Drive", () => {
  test("o callback do Google traz as coleções antigas, sem segurar o redirect", async () => {
    const quem = await novaPessoa("Religou", "religou@exemplo.com");
    const g: ContaFalsa = { sub: "c-1", email: "religou.drive@exemplo.com", name: "Religou" };
    driveAntigo(g.sub, ["Clipes antigos", "Making of"]);
    const { db, schema } = amb.banco;
    // Acesso total (ligado pelo admin), como o Drive do titular.
    await db.update(schema.usuarios).set({ driveAcessoTotal: true }).where(drizzle.eq(schema.usuarios.id, quem.id));

    amb.google.proximo.conta = g;
    amb.google.proximo.negar = false;
    amb.google.proximo.escopo = null;
    const ida = await conectar.GET(pedido("/api/google/conectar?modo=vincular", comCookie(quem)));
    assert.equal(ida.status, 302);
    assert.equal(new URL(ida.headers.get("location")!).searchParams.get("scope"), `openid email profile ${DRIVE}`);
    const google = await fetch(ida.headers.get("location")!, { redirect: "manual" });
    const volta = google.headers.get("location")!;
    const tarefas: Promise<unknown>[] = [];
    const res = await rotas.callback(pedido(volta.replace(SITE, ""), { cookies: { sd_google: cookiesDe(ida).get("sd_google"), sd_sessao: quem.cookie } }), (t) => {
      tarefas.push(t());
    });
    assert.equal(res.status, 303);
    assert.match(res.headers.get("location")!, /google=ok/);
    assert.equal(tarefas.length, 1, "a conferência vai para depois da resposta");
    await Promise.all(tarefas);
    const linhas = await db.select().from(schema.colecoes).where(drizzle.eq(schema.colecoes.usuarioId, quem.id));
    assert.deepEqual(linhas.map((l) => l.nome).sort(), ["Clipes antigos", "Making of"]);
  });
});
