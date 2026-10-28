/**
 * A Z lê as transferências (28/10/2026, Fase 1, só leitura): POST /api/zro/transferencias com o mesmo pedido do HUB
 * das rotas do Drive (zro-pedido+jwt, 60 s, jti de uso único, ação transferencias.ler). Devolve o último retrato de
 * cada computador da conta certa, com o horário do relato, sem caminho local, token nem id de sessão.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { pedido, prepararAmbiente } from "./ambiente.mjs";
import { iniciarZroFalsa } from "./zro-falso.mjs";

const CLIENTE = { clientId: "sobedesce-web", clientSecret: "zk_segredo_de_teste" };
let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let zro: Awaited<ReturnType<typeof iniciarZroFalsa>>;
let contas: typeof import("../src/lib/auth/contas");
let sessao: typeof import("../src/lib/auth/sessao");
let rStatus: typeof import("../src/app/api/dispositivos/status/route");
let rTransf: typeof import("../src/app/api/zro/transferencias/route");
let lib: typeof import("../src/lib/zro/transferencias-da-z");

type Pessoa = { id: string; sub: string; mac: string; macId: string };
let ana: Pessoa;
let beto: Pessoa;
let semComputador: Pessoa;
const corpo = async (res: Response) => (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let ip = 0;
async function novaPessoa(nome: string, email: string, sub: string, produtos = "sobedesce", computador = true): Promise<Pessoa> {
  const r = await contas.criarConta({ nome, email, senha: "uma senha comprida", ip: `10.8.0.${++ip}` });
  assert.ok(r.ok);
  await amb.banco.db.insert(amb.banco.schema.contasZro).values({ usuarioId: r.usuario.id, zroSub: sub, email, produtos });
  if (!computador) return { id: r.usuario.id, sub, mac: "", macId: "" };
  const mac = await sessao.criarSessao(r.usuario.id, "dispositivo", { nome: `MacBook de ${nome}`, plataforma: "mac" });
  return { id: r.usuario.id, sub, mac: mac.token, macId: mac.id };
}

const jwt = (sub: string, acao = "transferencias.ler", o: { aud?: string; mudar?: Record<string, unknown>; typ?: string; assinarErrado?: boolean } = {}) =>
  zro.pedido({ sub, aud: CLIENTE.clientId, acao, ...o });
const ler = (token: string | null) => rTransf.POST(pedido("/api/zro/transferencias", { corpo: {}, bearer: token ?? undefined, origin: null }));

const LOTE = {
  id: "b1", titulo: 'Pasta "Diária 03"', direcao: "desce", destino: "/Users/ana/Projetos/Cliente X/Diária 03", arquivos: 8, bytes: 18e9, feitoBytes: 6e9,
  andando: 2, esperando: 0, naFila: 4, pausados: 0, concluidos: 1, cancelados: 0, erros: 1, conferidos: 1, divergentes: 0,
  velocidade: 19e6, eta: 900, criadoEm: Date.now() - 60_000, terminouEm: null,
};
function retrato(extra: Record<string, unknown> = {}) {
  return {
    v: 1,
    estado: "baixando",
    rodada: "r1",
    geral: { feitoBytes: 6e9, totalBytes: 18e9, feitos: 1, total: 8, erros: 1, velocidade: 19e6, eta: 900, sobe: { arquivos: 0, velocidade: 0 }, desce: { arquivos: 8, velocidade: 19e6 }, fora: 1 },
    itens: [
      { id: "t1", nome: "A001.braw", direcao: "desce", feito: 1e9, total: 2e9, velocidade: 9e6, estado: "baixando", destino: "Diária 03", lote: "b1" },
      { id: "t2", nome: "A002.braw", direcao: "desce", feito: 2e9, total: 2e9, velocidade: 0, estado: "conferindo", destino: "C:\\Users\\ana\\Diária 03", lote: "b1" },
    ],
    terminados: [
      { nome: "A000.braw", direcao: "desce", total: 1e9, terminouEm: Date.now() - 30_000, ok: true, lote: "b1" },
      { nome: "B000.braw", direcao: "desce", total: 1e9, terminouEm: Date.now() - 20_000, ok: false, erro: "ENOSPC: sem espaço em /Volumes/SSD/Diária 03/B000.braw", lote: "b1" },
    ],
    lotes: [LOTE],
    ...extra,
  };
}

before(async () => {
  amb = await prepararAmbiente();
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  contas = await import("../src/lib/auth/contas");
  sessao = await import("../src/lib/auth/sessao");
  rStatus = await import("../src/app/api/dispositivos/status/route");
  rTransf = await import("../src/app/api/zro/transferencias/route");
  lib = await import("../src/lib/zro/transferencias-da-z");
  ana = await novaPessoa("Ana", "ana@ztransf.com", "zro-ana-t");
  beto = await novaPessoa("Beto", "beto@ztransf.com", "zro-beto-t");
  semComputador = await novaPessoa("Caio", "caio@ztransf.com", "zro-caio-t", "sobedesce", false);
  assert.equal((await rStatus.POST(pedido("/api/dispositivos/status", { bearer: ana.mac, corpo: retrato() }))).status, 200);
  assert.equal(
    (await rStatus.POST(pedido("/api/dispositivos/status", { bearer: beto.mac, corpo: retrato({ itens: [], lotes: [], terminados: [], estado: "concluido" }) }))).status,
    200,
  );
});

after(async () => {
  await zro?.fechar();
  await amb?.fechar();
});

describe("o pedido do HUB", () => {
  test("sem token, token ruim ou de outra ação é 401", async () => {
    const agora = Math.floor(Date.now() / 1000);
    const ruins: (string | null)[] = [
      null,
      jwt(ana.sub, "transferencias.ler", { typ: "JWT" }),
      jwt(ana.sub, "transferencias.ler", { mudar: { iat: agora - 600, exp: agora - 540 } }),
      jwt(ana.sub, "transferencias.ler", { mudar: { exp: agora + 3600 } }),
      jwt(ana.sub, "transferencias.ler", { aud: "outro-app" }),
      jwt(ana.sub, "transferencias.ler", { assinarErrado: true }),
      jwt(ana.sub, "drive.buscar"), // pedido de outra rota não vale aqui
    ];
    for (const t of ruins) {
      const r = await ler(t);
      assert.equal(r.status, 401, String(t).slice(0, 40));
      assert.equal((await corpo(r)).erro, "nao_autorizado");
    }
  });

  test("o mesmo jti não vale duas vezes", async () => {
    const t = jwt(ana.sub);
    assert.equal((await ler(t)).status, 200);
    assert.equal((await ler(t)).status, 401);
  });

  test("conta sem vínculo é 404; sem o SOBEDESCE liberado é 403", async () => {
    assert.equal((await corpo(await ler(jwt("zro-ninguem")))).erro, "sem_vinculo");
    const fechada = await novaPessoa("Duda", "duda@ztransf.com", "zro-duda-t", "nossom", false);
    assert.equal((await ler(jwt(fechada.sub))).status, 403);
  });
});

describe("o retrato", () => {
  test("cada conta vê só os próprios computadores", async () => {
    const a = await corpo(await ler(jwt(ana.sub)));
    const b = await corpo(await ler(jwt(beto.sub)));
    assert.deepEqual(a.computadores.map((c: { nome: string }) => c.nome), ["MacBook de Ana"]);
    assert.deepEqual(b.computadores.map((c: { nome: string }) => c.nome), ["MacBook de Beto"]);
    assert.equal(b.computadores[0].estado, "concluido");
    assert.doesNotMatch(JSON.stringify(b), /A001|Diária/);
  });

  test("contagens, conferências, lotes e horário do relato", async () => {
    const r = await corpo(await ler(jwt(ana.sub)));
    assert.equal(r.fonte, "SOBEDESCE");
    assert.ok(Date.parse(r.lido_em));
    const c = r.computadores[0];
    assert.equal(c.ligado, true);
    assert.ok(Math.abs(Date.parse(c.relatado_em) - Date.now()) < 60_000);
    assert.deepEqual(c.rodada, { ativas: 3, concluidas: 1, falhas: 1, total: 8, bytes_feitos: 6e9, bytes_total: 18e9 });
    assert.deepEqual(c.conferencias, { em_andamento: 1, conferidas: 1, divergentes: 0, informado: true });
    assert.deepEqual(c.estimativa, { velocidade_bps: 19e6, faltam_s: 900 });
    assert.equal(c.lotes[0].pasta, "Diária 03");
    assert.equal(c.terminados.ok, 1);
    assert.equal(c.terminados.falhas_recentes[0].nome, "B000.braw");
    assert.match(c.terminados.falhas_recentes[0].motivo, /^ENOSPC: sem espaço em …$/);
  });

  test("sem caminho local, token nem id de sessão", async () => {
    const texto = JSON.stringify(await corpo(await ler(jwt(ana.sub))));
    assert.doesNotMatch(texto, /\/Users|\/Volumes|C:\\\\|Projetos|sdd_|sd_sessao/);
    assert.ok(!texto.includes(ana.macId));
    assert.ok(!texto.includes(ana.mac));
  });

  test("sem computador com notícia: lista vazia (a Z diz que não sabe)", async () => {
    const r = await corpo(await ler(jwt(semComputador.sub)));
    assert.deepEqual(r.computadores, []);
  });

  test("semCaminho e soNomeDaPasta", () => {
    assert.equal(lib.semCaminho("ENOENT: open '/home/x/a b.mov' falhou"), "ENOENT: open '…' falhou");
    assert.equal(lib.semCaminho("falhou em /home/x/a b.mov"), "falhou em …");
    assert.equal(lib.semCaminho("rede \\\\srv\\pasta\\a.mov"), "rede …");
    assert.equal(lib.semCaminho("D:\\Clientes\\a.mov"), "…");
    assert.equal(lib.semCaminho("Sobe/desce 1/2 ok"), "Sobe/desce 1/2 ok");
    assert.equal(lib.soNomeDaPasta("D:\\Clientes\\X\\Diária 01"), "Diária 01");
    assert.equal(lib.soNomeDaPasta(null), null);
  });
});
