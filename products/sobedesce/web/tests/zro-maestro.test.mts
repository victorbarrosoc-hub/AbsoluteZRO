/**
 * O Maestro no Drive pela ponte do HUB (Maestro v2, fases 7–10): as ações drive.listar, drive.miniatura,
 * drive.pasta.criar, drive.compartilhar_revisao, drive.recolher_revisao e drive.token, contra a Absolute ZRO e o Google
 * falsos. Confere: pedido de outra ação ou reapresentado é 401; sem o SOBEDESCE liberado é 403 (menos recolher); só
 * metadados e o link curto da miniatura; a árvore do projeto é idempotente e com nomes limpos; compartilhar liga uma
 * permissão `anyone` só quando não há e recolher apaga só ela; o token é o access token (nunca o refresh); auditoria.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { CONTA_ANA, pedido, prepararAmbiente } from "./ambiente.mjs";
import { iniciarZroFalsa } from "./zro-falso.mjs";

const CLIENTE = { clientId: "sobedesce-web", clientSecret: "zk_segredo_de_teste" };
let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let zro: Awaited<ReturnType<typeof iniciarZroFalsa>>;
let contas: typeof import("../src/lib/auth/contas");
let cripto: typeof import("../src/lib/google/cripto");
let maestro: typeof import("../src/lib/zro/drive-do-maestro");
type Rota = { POST: (req: Request) => Promise<Response> };
const rotas: Record<string, Rota> = {};
const CAMINHOS: Record<string, string> = {
  "drive.listar": "/api/zro/drive/listar",
  "drive.miniatura": "/api/zro/drive/miniatura",
  "drive.pasta.criar": "/api/zro/drive/pasta/criar",
  "drive.compartilhar_revisao": "/api/zro/drive/revisao/compartilhar",
  "drive.recolher_revisao": "/api/zro/drive/revisao/recolher",
  "drive.token": "/api/zro/drive/token",
};

type Pessoa = { id: string; sub: string };
let ana: Pessoa;
let semProduto: Pessoa;
let pasta = "";
let video = "";
const corpo = async (res: Response) => (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let ip = 0;
async function novaPessoa(nome: string, email: string, sub: string, produtos = "sobedesce maestro"): Promise<Pessoa> {
  const r = await contas.criarConta({ nome, email, senha: "uma senha comprida", ip: `10.8.0.${++ip}` });
  assert.ok(r.ok);
  await amb.banco.db.insert(amb.banco.schema.contasZro).values({ usuarioId: r.usuario.id, zroSub: sub, email, produtos });
  return { id: r.usuario.id, sub };
}

const jwt = (sub: string, acao: string, aud = CLIENTE.clientId) => zro.pedido({ sub, aud, acao });
const chamar = (acao: string, sub: string, c: Record<string, unknown> = {}, token?: string) =>
  rotas[acao].POST(pedido(CAMINHOS[acao], { corpo: c, bearer: token ?? jwt(sub, acao), origin: null }));

before(async () => {
  amb = await prepararAmbiente();
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  contas = await import("../src/lib/auth/contas");
  cripto = await import("../src/lib/google/cripto");
  maestro = await import("../src/lib/zro/drive-do-maestro");
  rotas["drive.listar"] = await import("../src/app/api/zro/drive/listar/route");
  rotas["drive.miniatura"] = await import("../src/app/api/zro/drive/miniatura/route");
  rotas["drive.pasta.criar"] = await import("../src/app/api/zro/drive/pasta/criar/route");
  rotas["drive.compartilhar_revisao"] = await import("../src/app/api/zro/drive/revisao/compartilhar/route");
  rotas["drive.recolher_revisao"] = await import("../src/app/api/zro/drive/revisao/recolher/route");
  rotas["drive.token"] = await import("../src/app/api/zro/drive/token/route");
  ana = await novaPessoa("Ana Maestro", "ana@maestro.com", "zro-ana-maestro");
  semProduto = await novaPessoa("Caio", "caio@maestro.com", "zro-caio-maestro", "maestro");
  const { db, schema } = amb.banco;
  const refresh = amb.google.emitirRefresh(CONTA_ANA);
  await db.insert(schema.contasGoogle).values({
    id: "g-ana-m",
    usuarioId: ana.id,
    googleSub: CONTA_ANA.sub,
    email: CONTA_ANA.email,
    nome: CONTA_ANA.name,
    refreshTokenEnc: cripto.selar(refresh, "contas_google.refresh:g-ana-m"),
    escopos: "https://www.googleapis.com/auth/drive",
  });
  const g = amb.google;
  pasta = g.adicionarArquivo(CONTA_ANA.sub, { name: "Clientes", mimeType: "application/vnd.google-apps.folder", parents: ["root"] }).id;
  video = g.adicionarArquivo(CONTA_ANA.sub, {
    name: "Corte 1.mp4",
    mimeType: "video/mp4",
    parents: [pasta],
    size: "1048576",
    thumbnailLink: "https://lh3.googleusercontent.com/drive-thumb/abc=s220",
    webContentLink: "https://drive.google.com/uc?id=x&export=download",
    description: "não sai",
    videoMediaMetadata: { durationMillis: "42000", width: 1920, height: 1080 },
  }).id;
});

after(async () => {
  await zro?.fechar();
  await amb?.fechar();
});

describe("o pedido do HUB para o Maestro", () => {
  test("pedido de outra ação, de outro público ou reapresentado é 401", async () => {
    assert.equal((await chamar("drive.listar", ana.sub, {}, jwt(ana.sub, "drive.token"))).status, 401);
    assert.equal((await chamar("drive.listar", ana.sub, {}, jwt(ana.sub, "drive.listar", "maestro-web"))).status, 401);
    const t = jwt(ana.sub, "drive.listar");
    assert.equal((await chamar("drive.listar", ana.sub, {}, t)).status, 200);
    assert.equal((await chamar("drive.listar", ana.sub, {}, t)).status, 401, "jti de uso único");
  });

  test("sem o SOBEDESCE liberado: 403 em tudo, menos recolher", async () => {
    for (const acao of ["drive.listar", "drive.miniatura", "drive.pasta.criar", "drive.compartilhar_revisao", "drive.token"]) {
      const r = await chamar(acao, semProduto.sub, { arquivoId: "x".repeat(12), cliente: "a", projeto: "b" });
      assert.equal(r.status, 403, acao);
      assert.equal((await corpo(r)).erro, "sem_acesso_zro");
    }
    const r = await chamar("drive.recolher_revisao", semProduto.sub, { arquivoId: "x".repeat(12), permissaoId: "p1" });
    assert.equal(r.status, 409, "passa do 403 e para no Drive não conectado");
  });
});

describe("as ações", () => {
  test("listar: só metadados, miniatura no tamanho da grade e link do SOBEDESCE", async () => {
    const r = await chamar("drive.listar", ana.sub, { pasta });
    assert.equal(r.status, 200);
    const b = await corpo(r);
    assert.deepEqual(b.conta, { id: "g-ana-m", email: CONTA_ANA.email });
    assert.equal(b.pasta.nome, "Clientes");
    assert.equal(b.itens.length, 1);
    const [i] = b.itens;
    assert.equal(i.miniatura, "https://lh3.googleusercontent.com/drive-thumb/abc=s400");
    assert.deepEqual(i.video, { largura: 1920, altura: 1080, duracao_ms: 42000 });
    assert.match(i.abrir_no_sobedesce, /\/app\/#arquivo\//);
    assert.equal(JSON.stringify(b).includes("não sai"), false);
    assert.equal(JSON.stringify(b).includes("webContentLink"), false);
    const raiz = await corpo(await chamar("drive.listar", ana.sub, {}));
    assert.ok(raiz.itens.some((x: { nome: string; pasta: boolean }) => x.nome === "Clientes" && x.pasta));
    assert.equal((await chamar("drive.listar", ana.sub, { pasta: "../x" })).status, 400);
    assert.equal((await chamar("drive.listar", ana.sub, { pasta: video })).status, 404, "arquivo não é pasta");
  });

  test("miniatura: o link curto do Google, sem byte nenhum", async () => {
    const r = await corpo(await chamar("drive.miniatura", ana.sub, { arquivoId: video, px: 800 }));
    assert.equal(r.url, "https://lh3.googleusercontent.com/drive-thumb/abc=s800");
    assert.ok(Date.parse(r.expira_em) > Date.now());
    assert.equal((await chamar("drive.miniatura", ana.sub, { arquivoId: pasta })).status, 404);
  });

  test("pasta.criar: Maestro/<Cliente>/<Projeto>/5 subpastas, idempotente e com nome limpo", async () => {
    const r1 = await chamar("drive.pasta.criar", ana.sub, { cliente: " Café / Pão ", projeto: "Lançamento\n2026" });
    assert.equal(r1.status, 201);
    const b1 = await corpo(r1);
    assert.equal(b1.criadas, 8);
    assert.equal(b1.pasta.nome, "Lançamento 2026");
    assert.deepEqual(
      b1.subpastas.map((s: { nome: string }) => s.nome),
      [...maestro.ESTRUTURA],
    );
    const r2 = await chamar("drive.pasta.criar", ana.sub, { cliente: "Café - Pão", projeto: "Lançamento 2026" });
    assert.equal(r2.status, 200);
    const b2 = await corpo(r2);
    assert.equal(b2.criadas, 0);
    assert.equal(b2.pasta.id, b1.pasta.id);
    const drive = amb.google.driveDe(CONTA_ANA.sub);
    const cliente = [...drive.values()].find((f) => f.name === "Café - Pão")!;
    assert.equal([...drive.values()].find((f) => f.id === cliente.parents[0])?.name, "Maestro");
    assert.equal((await chamar("drive.pasta.criar", ana.sub, { cliente: "  ", projeto: "x" })).status, 400);
    assert.equal(maestro.nomeDePasta(".."), null);
  });

  test("compartilhar liga 'qualquer pessoa' uma vez; recolher apaga só essa permissão", async () => {
    const r = await corpo(await chamar("drive.compartilhar_revisao", ana.sub, { arquivoId: video }));
    assert.equal(r.ja_publico, false);
    assert.ok(r.permissao_id);
    const f = amb.google.driveDe(CONTA_ANA.sub).get(video)!;
    assert.ok(f.permissoes!.some((p) => p.type === "anyone" && p.role === "reader"));
    const de2 = await corpo(await chamar("drive.compartilhar_revisao", ana.sub, { arquivoId: video }));
    assert.equal(de2.ja_publico, true);
    assert.equal(de2.permissao_id, null);
    assert.equal(f.permissoes!.filter((p) => p.type === "anyone").length, 1);
    // Recolher a permissão do dono: recusado, nada muda.
    const dono = f.permissoes!.find((p) => p.type === "user")!;
    assert.equal((await chamar("drive.recolher_revisao", ana.sub, { arquivoId: video, permissaoId: dono.id })).status, 400);
    assert.ok(f.permissoes!.some((p) => p.id === dono.id));
    const rec = await corpo(await chamar("drive.recolher_revisao", ana.sub, { arquivoId: video, permissaoId: r.permissao_id }));
    assert.deepEqual(rec, { recolhido: true, ja_nao_havia: false });
    assert.equal(f.permissoes!.some((p) => p.type === "anyone"), false);
    const de3 = await corpo(await chamar("drive.recolher_revisao", ana.sub, { arquivoId: video, permissaoId: r.permissao_id }));
    assert.deepEqual(de3, { recolhido: true, ja_nao_havia: true });
  });

  test("token: o access token curto da própria conta, nunca o refresh; auditado sem o token", async () => {
    const r = await chamar("drive.token", ana.sub, {});
    assert.equal(r.status, 200);
    const b = await corpo(r);
    assert.ok(amb.google.acessoValido(b.access_token));
    assert.equal(b.conta.id, "g-ana-m");
    assert.deepEqual(b.contas, [{ id: "g-ana-m", email: CONTA_ANA.email }]);
    assert.equal(JSON.stringify(b).includes("1//"), false);
    assert.equal((await chamar("drive.token", ana.sub, { conta: "outra" })).status, 404);
    const { db, schema } = amb.banco;
    const linhas = await db.select().from(schema.auditoriaZro);
    const tokens = linhas.filter((l) => l.acao === "drive.token" && l.usuarioId === ana.id);
    assert.ok(tokens.some((l) => l.resultado === "200" && l.alvo === "g-ana-m"));
    assert.equal(JSON.stringify(linhas).includes(b.access_token), false);
    assert.ok(linhas.some((l) => l.acao === "drive.compartilhar_revisao" && l.alvo === video));
  });
});
