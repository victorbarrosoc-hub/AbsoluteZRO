/**
 * "Gerar versões com o Relay" (docs/integration-contracts/relay.md, "Maestro → Relay"): as rotas relay.converter,
 * relay.pedido e relay.cancelar pela ponte do HUB, e a fila `pedidos_proxy` tipo "relay" que o computador da conta
 * pega (src/engine/pedidos-relay.js). Contra a Absolute ZRO e o Google falsos. Confere: o pedido assinado da ação
 * certa; o contrato estrito; idempotência por `ref:preset`; a pasta conferida no mesmo Drive; o estado só para a
 * frente (andamento que só cresce, "pronto" só com o MD5, finais que ninguém reabre, computador sumido vira erro e
 * nunca nova conversão sozinha); cancelar; e o isolamento entre pessoas (ninguém vê nem cancela o pedido de outra).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { CONTA_ANA, CONTA_BETO, pedido, prepararAmbiente } from "./ambiente.mjs";
import { iniciarZroFalsa } from "./zro-falso.mjs";

const CLIENTE = { clientId: "sobedesce-web", clientSecret: "zk_segredo_de_teste" };
let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let zro: Awaited<ReturnType<typeof iniciarZroFalsa>>;
let contas: typeof import("../src/lib/auth/contas");
let sessao: typeof import("../src/lib/auth/sessao");
let cripto: typeof import("../src/lib/google/cripto");
let filaLib: typeof import("../src/lib/proxies/pedidos");
type Rota = { POST: (req: Request) => Promise<Response> };
const rotas: Record<string, Rota> = {};
let rLista: typeof import("../src/app/api/proxies/pedidos/route");
let rPedido: typeof import("../src/app/api/proxies/pedidos/[id]/route");
let rPegar: typeof import("../src/app/api/proxies/pedidos/[id]/pegar/route");
const CAMINHOS: Record<string, string> = {
  "relay.converter": "/api/zro/relay/converter",
  "relay.pedido": "/api/zro/relay/pedido",
  "relay.cancelar": "/api/zro/relay/cancelar",
};

type Pessoa = { id: string; sub: string; cookie: string; mac: string; macId: string; pc: string };
let ana: Pessoa;
let beto: Pessoa;
let semProduto: Pessoa;
let pasta = "";
let entregas = "";
let video = "";
let audio = "";
let doBeto = "";
const corpo = async (res: Response) => (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as any;

let ip = 0;
async function novaPessoa(nome: string, email: string, sub: string, produtos = "sobedesce maestro"): Promise<Pessoa> {
  const r = await contas.criarConta({ nome, email, senha: "uma senha comprida", ip: `10.9.0.${++ip}` });
  assert.ok(r.ok);
  await amb.banco.db.insert(amb.banco.schema.contasZro).values({ usuarioId: r.usuario.id, zroSub: sub, email, produtos });
  const mac = await sessao.criarSessao(r.usuario.id, "dispositivo", { nome: `Mac de ${nome}`, plataforma: "mac" });
  const pc = await sessao.criarSessao(r.usuario.id, "dispositivo", { nome: `PC de ${nome}`, plataforma: "windows" });
  return { id: r.usuario.id, sub, cookie: r.token, mac: mac.token, macId: mac.id, pc: pc.token };
}

async function ligarDrive(p: Pessoa, id: string, conta: typeof CONTA_ANA) {
  await amb.banco.db.insert(amb.banco.schema.contasGoogle).values({
    id,
    usuarioId: p.id,
    googleSub: conta.sub,
    email: conta.email,
    nome: conta.name,
    refreshTokenEnc: cripto.selar(amb.google.emitirRefresh(conta), `contas_google.refresh:${id}`),
    escopos: "https://www.googleapis.com/auth/drive",
  });
}

const chamar = (acao: string, sub: string, c: Record<string, unknown> = {}, token?: string) =>
  rotas[acao].POST(pedido(CAMINHOS[acao], { corpo: c, bearer: token ?? zro.pedido({ sub, aud: CLIENTE.clientId, acao }), origin: null }));
const listar = (bearer: string) => rLista.GET(pedido("/api/proxies/pedidos?status=pendente&tipo=relay", { bearer }));
const pegar = (bearer: string, id: string) => rPegar.POST(pedido(`/api/proxies/pedidos/${id}/pegar`, { bearer, method: "POST" }), ctx({ id }));
const mudar = (id: string, b: Record<string, unknown>, quem: { bearer?: string; cookie?: string }) =>
  rPedido.PATCH(
    pedido(`/api/proxies/pedidos/${id}`, quem.bearer ? { bearer: quem.bearer, method: "PATCH", corpo: b } : { cookies: { sd_sessao: quem.cookie }, method: "PATCH", corpo: b }),
    ctx({ id }),
  );
const ler = async (sub: string, ids: string[]) => corpo(await chamar("relay.pedido", sub, { ids }));
const md5 = "0123456789abcdef0123456789abcdef";

before(async () => {
  amb = await prepararAmbiente();
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  contas = await import("../src/lib/auth/contas");
  sessao = await import("../src/lib/auth/sessao");
  cripto = await import("../src/lib/google/cripto");
  filaLib = await import("../src/lib/proxies/pedidos");
  rotas["relay.converter"] = await import("../src/app/api/zro/relay/converter/route");
  rotas["relay.pedido"] = await import("../src/app/api/zro/relay/pedido/route");
  rotas["relay.cancelar"] = await import("../src/app/api/zro/relay/cancelar/route");
  rLista = await import("../src/app/api/proxies/pedidos/route");
  rPedido = await import("../src/app/api/proxies/pedidos/[id]/route");
  rPegar = await import("../src/app/api/proxies/pedidos/[id]/pegar/route");
  ana = await novaPessoa("Ana Relay", "ana@relay.com", "zro-ana-relay");
  beto = await novaPessoa("Beto Relay", "beto@relay.com", "zro-beto-relay");
  semProduto = await novaPessoa("Caio", "caio@relay.com", "zro-caio-relay", "maestro");
  await ligarDrive(ana, "g-ana-r", CONTA_ANA);
  await ligarDrive(beto, "g-beto-r", CONTA_BETO);
  const g = amb.google;
  const PASTA = "application/vnd.google-apps.folder";
  pasta = g.adicionarArquivo(CONTA_ANA.sub, { name: "Aurora", mimeType: PASTA, parents: ["root"] }).id;
  entregas = g.adicionarArquivo(CONTA_ANA.sub, { name: "05 Entregas", mimeType: PASTA, parents: [pasta] }).id;
  video = g.adicionarArquivo(CONTA_ANA.sub, { name: "Master.mov", mimeType: "video/quicktime", parents: [pasta], size: "734003200" }).id;
  audio = g.adicionarArquivo(CONTA_ANA.sub, { name: "Trilha.wav", mimeType: "audio/wav", parents: [pasta], size: "1048576" }).id;
  doBeto = g.adicionarArquivo(CONTA_BETO.sub, { name: "Do Beto.mp4", mimeType: "video/mp4", parents: ["root"], size: "1048576" }).id;
});

after(async () => {
  await zro?.fechar();
  await amb?.fechar();
});

describe("o pedido do HUB", () => {
  test("pedido de outra ação ou reapresentado é 401; sem o SOBEDESCE liberado, 403", async () => {
    const outra = zro.pedido({ sub: ana.sub, aud: CLIENTE.clientId, acao: "relay.pedido" });
    assert.equal((await chamar("relay.converter", ana.sub, { arquivoId: video, presets: ["whatsapp"], ref: "v0" }, outra)).status, 401);
    const t = zro.pedido({ sub: ana.sub, aud: CLIENTE.clientId, acao: "relay.pedido" });
    assert.equal((await chamar("relay.pedido", ana.sub, { ids: ["x1"] }, t)).status, 200);
    assert.equal((await chamar("relay.pedido", ana.sub, { ids: ["x1"] }, t)).status, 401, "jti de uso único");
    for (const acao of Object.keys(CAMINHOS)) {
      const r = await chamar(acao, semProduto.sub, { arquivoId: video, presets: ["whatsapp"], ref: "v0", ids: ["x"], id: "x" });
      assert.equal(r.status, 403, acao);
      assert.equal((await corpo(r)).erro, "sem_acesso_zro");
    }
  });

  test("contrato estrito: preset desconhecido, Tamanho exato, mais de 8, ref longa e campo a mais são 400", async () => {
    const base = { arquivoId: video, presets: ["youtube-1080"], ref: "v1" };
    for (const ruim of [
      { ...base, presets: ["nao-existe"] },
      { ...base, presets: ["tamanho"] },
      { ...base, presets: [] },
      { ...base, presets: Array(9).fill("youtube-1080") },
      { ...base, ref: "x".repeat(121) },
      { ...base, ref: "" },
      { ...base, extra: 1 },
      { ...base, arquivoId: "../x" },
      { ...base, pastaId: "a b" },
    ]) {
      const r = await chamar("relay.converter", ana.sub, ruim);
      assert.equal(r.status, 400, JSON.stringify(ruim).slice(0, 80));
      assert.equal((await corpo(r)).erro, "entrada");
    }
    assert.equal((await chamar("relay.pedido", ana.sub, { ids: Array(51).fill("a") })).status, 400);
    assert.equal((await chamar("relay.pedido", ana.sub, { ids: ["a"], outro: 1 })).status, 400);
    assert.equal((await chamar("relay.cancelar", ana.sub, {})).status, 400);
  });

  test("arquivo e pasta conferidos no Drive da pessoa: sumido, pasta de arquivo e áudio com preset de vídeo", async () => {
    assert.equal((await chamar("relay.converter", ana.sub, { arquivoId: "naoexiste123", presets: ["whatsapp"], ref: "v1" })).status, 404);
    assert.equal((await chamar("relay.converter", ana.sub, { arquivoId: doBeto, presets: ["whatsapp"], ref: "v1" })).status, 404, "arquivo do Drive de outra pessoa");
    const deArquivo = await chamar("relay.converter", ana.sub, { arquivoId: video, presets: ["whatsapp"], ref: "v1", pastaId: audio });
    assert.equal(deArquivo.status, 400);
    assert.equal((await corpo(deArquivo)).erro, "pasta");
    const soAudio = await chamar("relay.converter", ana.sub, { arquivoId: audio, presets: ["whatsapp"], ref: "a1" });
    assert.equal(soAudio.status, 400);
    assert.equal((await corpo(soAudio)).erro, "formato_incompativel");
    assert.equal((await chamar("relay.converter", ana.sub, { arquivoId: audio, presets: ["mp3"], ref: "a1" })).status, 202);
    assert.equal((await chamar("relay.converter", ana.sub, { arquivoId: video, presets: ["whatsapp"], ref: "v1", conta: "g-beto-r" })).status, 404, "conta de outra pessoa");
  });
});

describe("a fila", () => {
  let ids: Record<string, string> = {};

  test("converter: um pedido por preset, na pasta pedida, idempotente por ref:preset (até ao mesmo tempo)", async () => {
    const r = await chamar("relay.converter", ana.sub, { arquivoId: video, presets: ["youtube-1080", "whatsapp", "whatsapp"], ref: "versao-1", pastaId: entregas });
    assert.equal(r.status, 202);
    const b = await corpo(r);
    assert.deepEqual(
      b.pedidos.map((p: { preset: string; ref: string; status: string }) => [p.preset, p.ref, p.status]),
      [
        ["youtube-1080", "versao-1", "pendente"],
        ["whatsapp", "versao-1", "pendente"],
      ],
    );
    ids = Object.fromEntries(b.pedidos.map((p: { preset: string; id: string }) => [p.preset, p.id]));
    const [x, y] = await Promise.all([
      chamar("relay.converter", ana.sub, { arquivoId: video, presets: ["whatsapp", "reels"], ref: "versao-1", pastaId: entregas }),
      chamar("relay.converter", ana.sub, { arquivoId: video, presets: ["reels", "whatsapp"], ref: "versao-1", pastaId: entregas }),
    ]);
    const bx = await corpo(x);
    const by = await corpo(y);
    assert.equal(bx.pedidos[0].id, ids.whatsapp, "a mesma chave devolve o mesmo pedido");
    assert.equal(bx.pedidos[1].id, by.pedidos[0].id, "dois pedidos iguais ao mesmo tempo: um só na fila");
    ids.reels = bx.pedidos[1].id;
    const { db, schema } = amb.banco;
    const linhas = await db.select().from(schema.pedidosProxy).where(eq(schema.pedidosProxy.usuarioId, ana.id));
    const daVersao = linhas.filter((l) => l.chave?.startsWith("versao-1:"));
    assert.equal(daVersao.length, 3);
    for (const l of daVersao) {
      assert.equal(l.tipo, "relay");
      assert.equal(l.fileId, video);
      assert.equal(l.contaGoogleId, "g-ana-r");
      assert.deepEqual(l.ajustes, { preset: l.chave!.split(":")[1], pastaId: entregas, ref: "versao-1" });
    }
    // sem pastaId: a pasta do original
    const semPasta = await corpo(await chamar("relay.converter", ana.sub, { arquivoId: video, presets: ["vimeo"], ref: "versao-2" }));
    const [l2] = await db.select().from(schema.pedidosProxy).where(eq(schema.pedidosProxy.id, semPasta.pedidos[0].id));
    assert.equal((l2.ajustes as { pastaId: string }).pastaId, pasta);
    // auditado (converter), sem uma linha por consulta (pedido)
    await ler(ana.sub, [ids.whatsapp]);
    const aud = await db.select().from(schema.auditoriaZro).where(eq(schema.auditoriaZro.usuarioId, ana.id));
    assert.ok(aud.some((a) => a.acao === "relay.converter" && a.alvo === video && a.resultado === "202"));
    assert.equal(aud.some((a) => a.acao === "relay.pedido"), false);
  });

  test("relay.pedido: no formato do contrato, com o computador; sem o pedido de outra pessoa", async () => {
    const b = await ler(ana.sub, [ids["youtube-1080"], "nao-existe"]);
    assert.equal(b.pedidos.length, 1);
    const [p] = b.pedidos;
    assert.deepEqual(Object.keys(p).sort(), ["atualizado_em", "criado_em", "id", "preset", "ref", "status"]);
    assert.equal(p.status, "pendente");
    assert.deepEqual(b.computador, { aberto_agora: false, usado_ha_pouco: true });
    // Beto pede a mesma ref: outra fila, outro pedido; e não vê nem cancela os da Ana
    const deBeto = await corpo(await chamar("relay.converter", beto.sub, { arquivoId: doBeto, presets: ["whatsapp"], ref: "versao-1" }));
    assert.notEqual(deBeto.pedidos[0].id, ids.whatsapp);
    assert.deepEqual((await ler(beto.sub, [ids.whatsapp])).pedidos, []);
    assert.equal((await chamar("relay.cancelar", beto.sub, { id: ids.whatsapp })).status, 404);
    // e o computador do Beto não pega o da Ana
    assert.equal((await pegar(beto.mac, ids.whatsapp)).status, 404);
    const lista = await corpo(await listar(beto.mac));
    assert.equal(lista.pedidos.some((x: { id: string }) => x.id === ids.whatsapp), false);
  });

  test("o computador: pega de uma vez só, andamento que só cresce, pronto só com o MD5", async () => {
    const lista = await corpo(await listar(ana.mac));
    const p = lista.pedidos.find((x: { id: string }) => x.id === ids["youtube-1080"]);
    assert.deepEqual(p.ajustes, { preset: "youtube-1080", pastaId: entregas, ref: "versao-1" });
    assert.equal((await pegar(ana.mac, p.id)).status, 200);
    assert.equal((await pegar(ana.pc, p.id)).status, 409, "outro computador da conta não leva");
    assert.equal((await mudar(p.id, { status: "gerando", frac: 0.4 }, { bearer: ana.mac })).status, 200);
    await mudar(p.id, { status: "gerando", frac: 0.2 }, { bearer: ana.mac });
    let [lido] = (await ler(ana.sub, [p.id])).pedidos;
    assert.equal(lido.status, "convertendo");
    assert.ok(Math.abs(lido.frac - 0.4) < 1e-6, "atrasado não volta o andamento");
    assert.equal((await mudar(p.id, { status: "gerando" }, { bearer: ana.pc })).status, 409, "só quem pegou");
    assert.equal((await mudar(p.id, { status: "pronto" }, { bearer: ana.mac })).status, 400, "pronto sem o arquivo");
    assert.equal((await mudar(p.id, { status: "pronto", saida: { arquivoId: "out1", nome: "x", tamanho: 1, md5: "nada", pastaId: entregas } }, { bearer: ana.mac })).status, 400);
    const saida = { arquivoId: "outYT1080", nome: "Master (YouTube 1080p).mp4", tamanho: 52_428_800, md5, pastaId: entregas };
    assert.equal((await mudar(p.id, { status: "pronto", saida }, { bearer: ana.mac })).status, 200);
    [lido] = (await ler(ana.sub, [p.id])).pedidos;
    assert.equal(lido.status, "pronto");
    assert.deepEqual(lido.resultado, saida);
    assert.equal(lido.frac, undefined);
    // final: ninguém reabre (nem o dono pelo celular), e pedir de novo devolve o pronto
    assert.equal((await mudar(p.id, { status: "pendente" }, { cookie: ana.cookie })).status, 409);
    assert.equal((await mudar(p.id, { status: "erro" }, { bearer: ana.mac })).status, 409);
    const de2 = await corpo(await chamar("relay.converter", ana.sub, { arquivoId: video, presets: ["youtube-1080"], ref: "versao-1", pastaId: entregas }));
    assert.deepEqual(de2.pedidos, [{ id: p.id, preset: "youtube-1080", ref: "versao-1", status: "pronto" }]);
  });

  test("cancelar: pendente e convertendo viram cancelado; o computador para; terminado não muda", async () => {
    const c1 = await corpo(await chamar("relay.cancelar", ana.sub, { id: ids.reels }));
    assert.deepEqual(c1, { cancelado: true, ja_terminado: false });
    assert.deepEqual(await corpo(await chamar("relay.cancelar", ana.sub, { id: ids.reels })), { cancelado: false, ja_terminado: true });
    assert.equal((await ler(ana.sub, [ids.reels])).pedidos[0].status, "cancelado");
    assert.equal((await pegar(ana.mac, ids.reels)).status, 409, "cancelado não se pega");
    // convertendo: cancela e o sinal de vida do computador recebe 409 (ele para antes de subir)
    assert.equal((await pegar(ana.mac, ids.whatsapp)).status, 200);
    assert.deepEqual(await corpo(await chamar("relay.cancelar", ana.sub, { id: ids.whatsapp })), { cancelado: true, ja_terminado: false });
    assert.equal((await mudar(ids.whatsapp, { status: "gerando", frac: 0.9 }, { bearer: ana.mac })).status, 409);
    assert.equal((await mudar(ids.whatsapp, { status: "pronto", saida: { arquivoId: "o", nome: "o.mp4", tamanho: 1, md5, pastaId: entregas } }, { bearer: ana.mac })).status, 409);
    assert.equal((await ler(ana.sub, [ids.whatsapp])).pedidos[0].status, "cancelado");
    assert.equal((await chamar("relay.cancelar", ana.sub, { id: "naoexiste" })).status, 404);
    // pedir de novo depois de cancelado: outro pedido
    const novo = await corpo(await chamar("relay.converter", ana.sub, { arquivoId: video, presets: ["reels"], ref: "versao-1", pastaId: entregas }));
    assert.notEqual(novo.pedidos[0].id, ids.reels);
    assert.equal(novo.pedidos[0].status, "pendente");
    ids.reels2 = novo.pedidos[0].id;
  });

  test("computador que some no meio: o pedido vira erro (nunca volta para a fila nem vai para outro computador)", async () => {
    assert.equal((await pegar(ana.mac, ids.reels2)).status, 200);
    const { db, schema } = amb.banco;
    await db
      .update(schema.pedidosProxy)
      .set({ atualizadoEm: new Date(Date.now() - filaLib.PRAZO_GERANDO_MS - 60_000) })
      .where(eq(schema.pedidosProxy.id, ids.reels2));
    assert.equal((await pegar(ana.pc, ids.reels2)).status, 409, "outro computador não pega o preso");
    const [p] = (await ler(ana.sub, [ids.reels2])).pedidos;
    assert.equal(p.status, "erro");
    assert.equal(p.erro, filaLib.MSG_RELAY_PAROU);
    assert.equal((await mudar(ids.reels2, { status: "pendente" }, { cookie: ana.cookie })).status, 409, "o dono não põe de volta na fila");
  });

  test("o celular não cria pedido do Relay pela fila comum", async () => {
    const r = await rLista.POST(pedido("/api/proxies/pedidos", { cookies: { sd_sessao: ana.cookie }, corpo: { contaGoogleId: "g-ana-r", tipo: "relay", itens: [{ fileId: video }] } }));
    assert.equal(r.status, 400);
  });
});
