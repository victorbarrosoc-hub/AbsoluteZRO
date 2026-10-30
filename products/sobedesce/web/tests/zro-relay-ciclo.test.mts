/**
 * O ciclo inteiro de "Gerar versões com o Relay" do lado do SOBEDESCE (docs/integration-contracts/relay.md, "Maestro →
 * Relay"): o Maestro (aqui, quem chama com o pedido assinado do HUB de mentira e confere cada corpo e cada resposta
 * contra o contrato publicado em docs/integration-contracts/schemas/sobedesce.relay-*.json) → as rotas
 * /api/zro/relay/* de verdade → a fila `pedidos_proxy` → o executor de verdade do app de computador
 * (src/engine/pedidos-relay.js e os trabalhos do Relay de src/server/relay.js, falando com as rotas /api/proxies/* de
 * verdade com o Bearer do computador) → o acompanhamento. Só a conversão em si é de mentira aqui (o ffmpeg e o Drive
 * de verdade estão em test/pedidos-relay.test.js do app de computador).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { z } from "zod";
import { CONTA_ANA, pedido, prepararAmbiente } from "./ambiente.mjs";
import { iniciarZroFalsa } from "./zro-falso.mjs";
import { PedidosRelay } from "../../src/engine/pedidos-relay.js";
import { RelayJobs } from "../../src/server/relay.js";

const CLIENTE = { clientId: "sobedesce-web", clientSecret: "zk_segredo_de_teste" };
const SCHEMAS = new URL("../../../../docs/integration-contracts/schemas/", import.meta.url);
const contrato = (nome: string) => z.fromJSONSchema(JSON.parse(readFileSync(fileURLToPath(new URL(`sobedesce.relay-${nome}.v1.schema.json`, SCHEMAS)), "utf8")));
const C = {
  converterEntrada: contrato("converter.entrada"),
  converterResposta: contrato("converter.resposta"),
  pedidoEntrada: contrato("pedido.entrada"),
  pedidoResposta: contrato("pedido.resposta"),
  cancelarEntrada: contrato("cancelar.entrada"),
  cancelarResposta: contrato("cancelar.resposta"),
};

let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let zro: Awaited<ReturnType<typeof iniciarZroFalsa>>;
type Rota = { POST: (req: Request) => Promise<Response> };
const rotas: Record<string, Rota> = {};
let rLista: typeof import("../src/app/api/proxies/pedidos/route");
let rPedido: typeof import("../src/app/api/proxies/pedidos/[id]/route");
let rPegar: typeof import("../src/app/api/proxies/pedidos/[id]/pegar/route");
let usuarioId = "";
let macToken = "";
let macId = "";
let entregas = "";
let video = "";
const SUB = "zro-ana-ciclo";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Qualquer = any;

/** O Maestro: confere o corpo pelo contrato, pede com o JWT do HUB e confere a resposta 2xx pelo contrato. */
async function maestro(acao: "converter" | "pedido" | "cancelar", corpo: Record<string, unknown>) {
  C[`${acao}Entrada`].parse(corpo);
  const nome = `relay.${acao}`;
  const r = await rotas[nome].POST(pedido(`/api/zro/relay/${acao}`, { corpo, bearer: zro.pedido({ sub: SUB, aud: CLIENTE.clientId, acao: nome }), origin: null }));
  const b = (await r.json()) as Qualquer;
  if (r.ok) C[`${acao}Resposta`].parse(b);
  return { status: r.status, b };
}

/** O cliente da conta SOBEDESCE do app de computador, falando com as rotas de verdade (erro = HttpError com o status). */
function nuvemDoComputador() {
  const params = (id: string) => ({ params: Promise.resolve({ id }) }) as Qualquer;
  return {
    signedIn: true,
    async request(method: string, caminho: string, { body, expect = [200] }: { body?: unknown; expect?: number[] } = {}) {
      const id = decodeURIComponent(caminho.split("?")[0].split("/")[4] ?? "");
      const req = pedido(caminho, { bearer: macToken, method, ...(body !== undefined && method !== "GET" ? { corpo: body } : {}) });
      const res =
        method === "GET"
          ? await rLista.GET(req)
          : caminho.endsWith("/pegar")
            ? await rPegar.POST(req, params(id))
            : method === "PATCH"
              ? await rPedido.PATCH(req, params(id))
              : new Response(null, { status: 405 });
      const data = await res.json().catch(() => null);
      if (!expect.includes(res.status)) throw Object.assign(new Error(`HTTP ${res.status}`), { name: "HttpError", status: res.status, body: data });
      return { status: res.status, data };
    },
  };
}

/**
 * O conversor de mentira (no lugar do ffmpeg e do Drive): anda até 60%, espera `soltar` e então sobe (depois da
 * conferência de cancelamento do executor). Conta quantos arquivos "subiram".
 */
function conversor() {
  const estado = { subidos: [] as string[], soltar: new Map<string, () => void>() };
  const converter = async (o: Qualquer) => {
    o.onFase("baixando", 1);
    o.onFase("convertendo", 0.6);
    await new Promise<void>((r) => estado.soltar.set(o.destino, r));
    await o.antesDeSubir();
    o.onFase("enviando", 0.5);
    estado.subidos.push(o.destino);
    return { fileId: `out-${o.destino}`, nome: `Master (${o.destino}).mp4`, size: 4_194_304, conferido: true, md5: "a".repeat(32), pastaId: o.parentId };
  };
  return { estado, converter };
}

before(async () => {
  amb = await prepararAmbiente();
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  const contas = await import("../src/lib/auth/contas");
  const sessao = await import("../src/lib/auth/sessao");
  const cripto = await import("../src/lib/google/cripto");
  rotas["relay.converter"] = await import("../src/app/api/zro/relay/converter/route");
  rotas["relay.pedido"] = await import("../src/app/api/zro/relay/pedido/route");
  rotas["relay.cancelar"] = await import("../src/app/api/zro/relay/cancelar/route");
  rLista = await import("../src/app/api/proxies/pedidos/route");
  rPedido = await import("../src/app/api/proxies/pedidos/[id]/route");
  rPegar = await import("../src/app/api/proxies/pedidos/[id]/pegar/route");
  const r = await contas.criarConta({ nome: "Ana Ciclo", email: "ana@ciclo.com", senha: "uma senha comprida", ip: "10.9.9.1" });
  assert.ok(r.ok);
  usuarioId = r.usuario.id;
  const { db, schema } = amb.banco;
  await db.insert(schema.contasZro).values({ usuarioId, zroSub: SUB, email: "ana@ciclo.com", produtos: "sobedesce maestro" });
  const mac = await sessao.criarSessao(usuarioId, "dispositivo", { nome: "MacBook da Ana", plataforma: "mac" });
  macToken = mac.token;
  macId = mac.id;
  await db.insert(schema.contasGoogle).values({
    id: "g-ana-c",
    usuarioId,
    googleSub: CONTA_ANA.sub,
    email: CONTA_ANA.email,
    nome: CONTA_ANA.name,
    refreshTokenEnc: cripto.selar(amb.google.emitirRefresh(CONTA_ANA), "contas_google.refresh:g-ana-c"),
    escopos: "https://www.googleapis.com/auth/drive",
  });
  const PASTA = "application/vnd.google-apps.folder";
  const projeto = amb.google.adicionarArquivo(CONTA_ANA.sub, { name: "Aurora", mimeType: PASTA, parents: ["root"] }).id;
  entregas = amb.google.adicionarArquivo(CONTA_ANA.sub, { name: "05 Entregas", mimeType: PASTA, parents: [projeto] }).id;
  video = amb.google.adicionarArquivo(CONTA_ANA.sub, { name: "Master.mov", mimeType: "video/quicktime", parents: [projeto], size: "734003200" }).id;
});

after(async () => {
  await zro?.fechar();
  await amb?.fechar();
});

describe("Maestro → HUB → SOBEDESCE → computador → acompanhamento", () => {
  test("duas versões: uma fica pronta com o MD5, a outra é cancelada no meio e nada sobe; pedir de novo não duplica", async () => {
    const pedidoDaVersao = { arquivoId: video, presets: ["youtube-1080", "whatsapp"], pastaId: entregas, ref: "8a1f-versao-3" };
    const c = await maestro("converter", pedidoDaVersao);
    assert.equal(c.status, 202);
    const ids = Object.fromEntries(c.b.pedidos.map((p: Qualquer) => [p.preset, p.id])) as Record<string, string>;

    // computador fechado: o pedido espera e o Maestro diz isso sem prometer prazo
    let a = await maestro("pedido", { ids: Object.values(ids) });
    assert.deepEqual(
      a.b.pedidos.map((p: Qualquer) => p.status),
      ["pendente", "pendente"],
    );
    assert.equal(a.b.computador.aberto_agora, false);

    // o app abre (manda notícia) e o executor pega
    const { db, schema } = amb.banco;
    await db.insert(schema.dispositivoStatus).values({ sessaoId: macId, usuarioId, snapshot: {} as Qualquer });
    const { estado, converter } = conversor();
    const jobs = new RelayJobs({ manager: { previas: { emVaga: () => {}, motor: async () => ({ ffmpeg: { path: "/ffmpeg" } }) }, driveFor: () => ({ getItem: async (id: string) => ({ id, name: "Master.mov", size: 734003200, parents: ["p"], isFolder: false }) }), records: new Map() }, hub: { send: () => {} }, log: () => {} } as Qualquer, { converter } as Qualquer);
    const executor = new PedidosRelay({ cloud: nuvemDoComputador(), relay: () => jobs, pollMs: 60_000, vidaMs: 60_000, andamentoMs: 0, log: () => {} } as Qualquer);
    const rodada = executor.consultar();
    while (!estado.soltar.size) await sleep(5);
    // um por vez: o primeiro que o executor pegou é o que vai ser cancelado
    const [primeiro] = [...estado.soltar.keys()];
    const segundo = primeiro === "whatsapp" ? "youtube-1080" : "whatsapp";

    // convertendo, com o andamento; o outro ainda na fila
    a = await maestro("pedido", { ids: Object.values(ids) });
    const lido = Object.fromEntries(a.b.pedidos.map((p: Qualquer) => [p.preset, p]));
    assert.equal(a.b.computador.aberto_agora, true);
    assert.equal(lido[primeiro].status, "convertendo");
    assert.ok(lido[primeiro].frac > 0.5 && lido[primeiro].frac < 1, `andamento ${lido[primeiro].frac}`);
    assert.equal(lido[segundo].status, "pendente");

    // o Maestro cancela no meio: o executor confere antes de subir e para
    const k = await maestro("cancelar", { id: ids[primeiro] });
    assert.deepEqual(k.b, { cancelado: true, ja_terminado: false });
    estado.soltar.get(primeiro)!();
    while (!estado.soltar.has(segundo)) await sleep(5);
    estado.soltar.get(segundo)!();
    await rodada;
    await executor.close();
    assert.deepEqual(estado.subidos, [segundo], "o cancelado não subiu");

    a = await maestro("pedido", { ids: Object.values(ids) });
    const porPreset = Object.fromEntries(a.b.pedidos.map((p: Qualquer) => [p.preset, p]));
    assert.equal(porPreset[primeiro].status, "cancelado");
    assert.equal(porPreset[segundo].status, "pronto");
    assert.deepEqual(porPreset[segundo].resultado, { arquivoId: `out-${segundo}`, nome: `Master (${segundo}).mp4`, tamanho: 4_194_304, md5: "a".repeat(32), pastaId: entregas });

    // resposta repetida ou atrasada não desfaz nada: cancelar o pronto não muda; pedir de novo devolve o pronto e
    // cria só o cancelado de novo (cancelado é final para aquele pedido)
    assert.deepEqual((await maestro("cancelar", { id: ids[segundo] })).b, { cancelado: false, ja_terminado: true });
    const de2 = await maestro("converter", pedidoDaVersao);
    const novo = Object.fromEntries(de2.b.pedidos.map((p: Qualquer) => [p.preset, p]));
    assert.equal(novo[segundo].id, ids[segundo]);
    assert.equal(novo[segundo].status, "pronto");
    assert.notEqual(novo[primeiro].id, ids[primeiro]);
    assert.equal(novo[primeiro].status, "pendente");
  });
});
