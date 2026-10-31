/**
 * Contas antigas sem vínculo com a Absolute ZRO (lib/zro/ligar.ts, decisão do titular de 29/10/2026): ninguém sai da
 * conta; as telas pedem uma vez "Agora sua conta é Absolute ZRO" e o botão usa o vincular de sempre. A API (o motor do
 * computador e o celular) segue funcionando sem vínculo. Ligou agora → Conexões da central. Erros com recado claro.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { CONTA_ANA, cookiesDe, pedido, prepararAmbiente, SITE } from "./ambiente.mjs";
import { iniciarZroFalsa, type PessoaZro } from "./zro-falso.mjs";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENTE = { clientId: "sobedesce-web", clientSecret: "zk_segredo_de_teste" };
let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let zro: Awaited<ReturnType<typeof iniciarZroFalsa>>;
let rotaEntrar: typeof import("../src/app/api/zro/entrar/route");
let rotaVolta: typeof import("../src/app/api/zro/callback/route");
let rotaEu: typeof import("../src/app/api/eu/route");
let rotaDrives: typeof import("../src/app/api/drive/contas/route");
let rotaToken: typeof import("../src/app/api/drive/token/route");
let rotaStatus: typeof import("../src/app/api/dispositivos/status/route");
let rotaTransf: typeof import("../src/app/api/transferencias/route");
let contas: typeof import("../src/lib/auth/contas");
let sessao: typeof import("../src/lib/auth/sessao");
let ligar: typeof import("../src/lib/zro/ligar");
let zroContas: typeof import("../src/lib/zro/contas");

before(async () => {
  amb = await prepararAmbiente();
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  rotaEntrar = await import("../src/app/api/zro/entrar/route");
  rotaVolta = await import("../src/app/api/zro/callback/route");
  rotaEu = await import("../src/app/api/eu/route");
  rotaDrives = await import("../src/app/api/drive/contas/route");
  rotaToken = await import("../src/app/api/drive/token/route");
  rotaStatus = await import("../src/app/api/dispositivos/status/route");
  rotaTransf = await import("../src/app/api/transferencias/route");
  contas = await import("../src/lib/auth/contas");
  sessao = await import("../src/lib/auth/sessao");
  ligar = await import("../src/lib/zro/ligar");
  zroContas = await import("../src/lib/zro/contas");
});

after(async () => {
  await zro?.fechar();
  await amb?.fechar();
});

let n = 0;
/** Conta antiga (e-mail e senha), com um Google Drive conectado e um computador. */
async function contaAntiga() {
  n++;
  const c = await contas.criarConta({ nome: `Antiga ${n}`, email: `antiga${n}@exemplo.com`, senha: "senha antiga boa!", ip: `9.9.9.${n}` });
  assert.ok(c.ok);
  const { db, schema } = amb.banco;
  const cripto = await import("../src/lib/google/cripto");
  const id = `g-antiga-${n}`;
  await db.insert(schema.contasGoogle).values({
    id,
    usuarioId: c.usuario.id,
    googleSub: `${CONTA_ANA.sub}-${n}`,
    email: `drive${n}@exemplo.com`,
    nome: "Drive",
    refreshTokenEnc: cripto.selar(amb.google.emitirRefresh({ ...CONTA_ANA, sub: `${CONTA_ANA.sub}-${n}` }), `contas_google.refresh:${id}`),
    escopos: "https://www.googleapis.com/auth/drive",
  });
  // Drive conectado com o `drive` inteiro antes do modo híbrido: a migração 0018 deixou a conta com acesso total.
  const { eq } = await import("drizzle-orm");
  await db.update(schema.usuarios).set({ driveAcessoTotal: true }).where(eq(schema.usuarios.id, c.usuario.id));
  const pc =await sessao.criarSessao(c.usuario.id, "dispositivo", { nome: "MacBook", plataforma: "mac" });
  return { ...c, driveId: id, bearer: pc.token };
}

/** Navegador: /api/zro/entrar → Absolute ZRO falsa → /api/zro/callback. Devolve o destino (absoluto se for de fora). */
async function fluxo(o: { pessoa: PessoaZro; sessao: string; volta?: string; negar?: boolean }) {
  // A organização da pessoa tem a SOBEDESCE (zro_products), salvo quando o teste diz outra coisa.
  zro.estado.proximo = { pessoa: { produtos: ["sobedesce"], ...o.pessoa }, negar: Boolean(o.negar), adulterar: null };
  const caminho = ligar.caminhoLigarZro(o.volta ?? "/conta");
  const ida = await rotaEntrar.GET(pedido(caminho, { cookies: { sd_sessao: o.sessao } }));
  assert.equal(ida.status, 302);
  const z = await fetch(ida.headers.get("location")!, { redirect: "manual" });
  const volta = z.headers.get("location")!.replace(SITE, "");
  const res = await rotaVolta.GET(pedido(volta, { cookies: { sd_zro: cookiesDe(ida).get("sd_zro"), sd_sessao: o.sessao } }));
  assert.equal(res.status, 303);
  const destino = new URL(res.headers.get("location")!, SITE);
  return destino.origin === SITE ? destino.pathname + destino.search : destino.href;
}

const json = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function status() {
  return {
    v: 1,
    estado: "enviando",
    rodada: "r1",
    geral: { feitoBytes: 1e9, totalBytes: 4e9, feitos: 1, total: 4, erros: 0, velocidade: 90e6, eta: 30, sobe: { arquivos: 4, velocidade: 90e6 }, desce: { arquivos: 0, velocidade: 0 } },
    itens: [{ id: "t1", nome: "A001.braw", direcao: "sobe", feito: 1e9, total: 2e9, velocidade: 90e6, estado: "enviando" }],
    terminados: [],
  };
}

describe("conta antiga sem vínculo", () => {
  test("a tela de ligar aparece (site, celular e computador pelo /api/eu), sem bloquear nada", async () => {
    const c = await contaAntiga();
    const a = await sessao.autenticar({ cookie: c.token });
    assert.equal(a?.ligadoZro, false);
    assert.equal(a?.liberado, true);
    assert.equal(ligar.precisaLigarZro(a), true);

    for (const p of [{ cookies: { sd_sessao: c.token } }, { bearer: c.bearer }]) {
      const eu = await rotaEu.GET(pedido("/api/eu", p));
      assert.equal(eu.status, 200);
      const corpo = await json(eu);
      assert.deepEqual(corpo.zro, { ligada: false, pedir: true, ligar: "/api/zro/entrar?modo=vincular&volta=%2Fconta" });
      assert.equal(corpo.contas.length, 1);
    }
  });

  test("o motor do computador e o celular seguem: Drives, token do Drive, andamento e transferências sem 403", async () => {
    const c = await contaAntiga();
    assert.equal((await rotaDrives.GET(pedido("/api/drive/contas", { bearer: c.bearer }))).status, 200);
    const t = await rotaToken.POST(pedido("/api/drive/token", { bearer: c.bearer, corpo: { conta: c.driveId } }));
    assert.equal(t.status, 200);
    assert.ok((await json(t)).accessToken);
    const tc = await rotaToken.POST(pedido("/api/drive/token", { cookies: { sd_sessao: c.token }, corpo: { conta: c.driveId } }));
    assert.equal(tc.status, 200, "o celular (cookie) também pega o token");
    assert.equal((await rotaStatus.POST(pedido("/api/dispositivos/status", { bearer: c.bearer, corpo: status() }))).status, 200);
    const tr = await rotaTransf.GET(pedido("/api/transferencias", { cookies: { sd_sessao: c.token } }));
    assert.equal(tr.status, 200);
    assert.equal((await json(tr)).computadores.length, 1);
  });

  test("ligar: volta para as Conexões da central; depois a tela some em todo lugar e o computador continua", async () => {
    const c = await contaAntiga();
    const destino = await fluxo({ pessoa: { sub: "zro-ligar-1", email: "nova.zro@exemplo.com", nome: "Antiga" }, sessao: c.token });
    assert.equal(destino, `${zro.url}/conexoes`);
    const a = await sessao.autenticar({ cookie: c.token });
    assert.equal(a?.ligadoZro, true);
    assert.equal(ligar.precisaLigarZro(a), false);
    assert.equal((await zroContas.contaZroDe(c.usuario.id))?.email, "nova.zro@exemplo.com");
    const eu = await json(await rotaEu.GET(pedido("/api/eu", { bearer: c.bearer })));
    assert.equal(eu.zro.ligada, true);
    assert.equal(eu.zro.pedir, false);
    assert.equal((await rotaDrives.GET(pedido("/api/drive/contas", { bearer: c.bearer }))).status, 200, "a sessão do computador não caiu");

    // Religar (a conta já ligada) fica em Sua conta, como sempre.
    const de = await fluxo({ pessoa: { sub: "zro-ligar-1", email: "nova.zro@exemplo.com", nome: "Antiga" }, sessao: c.token });
    assert.equal(de, "/conta?zro=ok");
  });

  test("ZRO_CONEXOES_URL troca o endereço das Conexões", async () => {
    const c = await contaAntiga();
    process.env.ZRO_CONEXOES_URL = "https://central.exemplo.com/conexoes?de=sobedesce";
    try {
      const destino = await fluxo({ pessoa: { sub: "zro-ligar-env", email: "env@exemplo.com", nome: "Env" }, sessao: c.token, volta: "/z" });
      assert.equal(destino, "https://central.exemplo.com/conexoes?de=sobedesce");
    } finally {
      delete process.env.ZRO_CONEXOES_URL;
    }
  });
});

describe("casos de borda", () => {
  test("Absolute ZRO já ligada a outra conta SOBEDESCE: recado na própria tela e nada muda", async () => {
    const dona = await contaAntiga();
    assert.equal(await fluxo({ pessoa: { sub: "zro-dona", email: "dona@exemplo.com", nome: "Dona" }, sessao: dona.token }), `${zro.url}/conexoes`);
    const outra = await contaAntiga();
    const destino = await fluxo({ pessoa: { sub: "zro-dona", email: "dona@exemplo.com", nome: "Dona" }, sessao: outra.token });
    assert.equal(destino, "/conta?erro=zro_outra_conta");
    assert.equal((await sessao.autenticar({ cookie: outra.token }))?.ligadoZro, false, "a tela continua pedindo");
  });

  test("e-mail ainda não confirmado na Absolute ZRO: não liga", async () => {
    const c = await contaAntiga();
    const destino = await fluxo({ pessoa: { sub: "zro-sem-conf", email: "semconf@exemplo.com", nome: "S", verificado: false }, sessao: c.token, volta: "/z" });
    assert.equal(destino, "/z?erro=zro_email_nao_verificado");
    assert.equal(await zroContas.contaZroDe(c.usuario.id), null);
  });

  test("cancelou na Absolute ZRO: volta calma, sem ligar", async () => {
    const c = await contaAntiga();
    const destino = await fluxo({ pessoa: { sub: "zro-cancela", email: "cancela@exemplo.com", nome: "C" }, sessao: c.token, negar: true, volta: "/app/" });
    assert.equal(destino, "/app/?erro=zro_recusado");
    assert.equal(await zroContas.contaZroDe(c.usuario.id), null);
  });

  test("organização sem a SOBEDESCE em zro_products: liga, mas fica no site com o aviso de acesso", async () => {
    const c = await contaAntiga();
    const destino = await fluxo({ pessoa: { sub: "zro-sem-produto", email: "semprod@exemplo.com", nome: "P", produtos: ["synquei"] }, sessao: c.token });
    assert.equal(destino, "/conta?zro=ok", "não vai para as Conexões: /conta mostra Acesso ainda não liberado");
    const a = await sessao.autenticar({ cookie: c.token });
    assert.equal(a?.ligadoZro, true);
    assert.equal(a?.liberado, false);
  });

  test("sem a Absolute ZRO configurada no servidor, a tela não aparece", async () => {
    const c = await contaAntiga();
    const guardado = process.env.ZRO_CLIENT_ID;
    delete process.env.ZRO_CLIENT_ID;
    try {
      assert.equal(ligar.precisaLigarZro(await sessao.autenticar({ cookie: c.token })), false);
      assert.equal((await json(await rotaEu.GET(pedido("/api/eu", { bearer: c.bearer })))).zro.pedir, false);
    } finally {
      process.env.ZRO_CLIENT_ID = guardado;
    }
  });
});

describe("a tela", () => {
  const render = (...args: string[]) => execFileSync(process.execPath, ["--import", "tsx", path.join(raiz, "tests", "ligar-zro-render.mts"), ...args], { cwd: raiz, encoding: "utf8" });

  test("símbolo, título, um botão para o vincular de sempre, Usar outra conta discreto e a linha pequena", () => {
    const html = render("/conta", "-", "1");
    assert.match(html, /<h1[^>]*>Agora sua conta é Absolute ZRO<\/h1>/);
    assert.match(html, /<a href="\/api\/zro\/entrar\?modo=vincular&amp;volta=%2Fconta"[^>]*>Continuar com Absolute ZRO<\/a>/);
    assert.match(html, /<a href="\/api\/zro\/entrar\?modo=vincular&amp;volta=%2Fconta&amp;trocar=1"[^>]*data-usar-outra-conta[^>]*>Usar outra conta<\/a>/);
    assert.match(html, /Seu Google Drive continua conectado\./);
    assert.match(html, /<svg[^>]*viewBox="0 0 100 100"/, "o símbolo flat da Absolute ZRO");
    assert.equal((html.match(/<a /g) ?? []).length, 2, "uma ação principal e o Usar outra conta");
    assert.ok(html.indexOf("Continuar com Absolute ZRO") < html.indexOf("Usar outra conta"), "a principal vem antes");
    assert.doesNotMatch(html, /trocar-conta/, "sem o erro, nada de Entrar nessa conta");
    assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /!/, "sem exclamação no texto");
  });

  test("sem Drive, a linha muda; com erro, o recado aparece", () => {
    const html = render("/z", "zro_outra_conta", "0");
    assert.match(html, /volta=%2Fz/);
    assert.match(html, /Nada muda nos seus arquivos\./);
    assert.match(html, /role="alert"[\s\S]*já está ligada a outra conta SOBEDESCE/);
    assert.match(render("/conta", "zro_recusado", "1"), /role="status"[\s\S]*nada foi conectado/);
  });
});
