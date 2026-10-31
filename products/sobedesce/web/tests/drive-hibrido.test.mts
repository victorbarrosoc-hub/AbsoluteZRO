/**
 * Drive híbrido (titular, 31/10/2026): o escopo sai do modo antes de ir ao Google (acesso total = `drive`, os outros
 * `drive.file`, entrar nunca pede Drive), contador de vagas e trava no limite, vaga não volta, callback com escopo
 * diferente do pedido, a regra do navegar/comparar no modo Arquivos escolhidos (app do celular) e o botão só para admin.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { cookiesDe, pedido, prepararAmbiente, SITE } from "./ambiente.mjs";
import type { ContaFalsa } from "./google-falso.mjs";

const BASICOS = "openid email profile";
const DRIVE = "https://www.googleapis.com/auth/drive";
const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";

let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let contas: typeof import("../src/lib/auth/contas");
let conectar: typeof import("../src/app/api/google/conectar/route");
let callback: typeof import("../src/app/api/google/callback/route");
let eu: typeof import("../src/app/api/eu/route");
let picker: typeof import("../src/app/api/drive/picker/route");
let vagas: typeof import("../src/lib/google/vagas");
let googleContas: typeof import("../src/lib/google/contas");
let admin: typeof import("../src/lib/admin");
let drizzle: typeof import("drizzle-orm");

let n = 0;
const conta = (nome: string): ContaFalsa => ({ sub: `sub-${nome}-${++n}`, email: `${nome}${n}@exemplo.com`, name: nome });

before(async () => {
  amb = await prepararAmbiente();
  contas = await import("../src/lib/auth/contas");
  conectar = await import("../src/app/api/google/conectar/route");
  callback = await import("../src/app/api/google/callback/route");
  eu = await import("../src/app/api/eu/route");
  picker = await import("../src/app/api/drive/picker/route");
  vagas = await import("../src/lib/google/vagas");
  googleContas = await import("../src/lib/google/contas");
  admin = await import("../src/lib/admin");
  drizzle = await import("drizzle-orm");
});

after(async () => {
  await amb?.fechar();
});

async function pessoa(nome: string) {
  const c = await contas.criarConta({ nome, email: `${nome.toLowerCase()}${++n}@pessoas.com`, senha: `senha de ${nome}!!`, ip: `9.9.8.${n % 250}` });
  assert.ok(c.ok);
  return { id: c.usuario.id, token: c.token };
}

async function ligarDireto(usuarioId: string, ligado = true) {
  const { db, schema } = amb.banco;
  await db.update(schema.usuarios).set({ driveAcessoTotal: ligado }).where(drizzle.eq(schema.usuarios.id, usuarioId));
}

/** /api/google/conectar → Google falso → callback. `devolve`: o escopo que o Google entrega (a caixinha desmarcada). */
async function conectarDrive(sessao: string, g: ContaFalsa, devolve?: string) {
  amb.google.proximo.conta = g;
  amb.google.proximo.negar = false;
  amb.google.proximo.escopo = devolve ?? null;
  const ida = await conectar.GET(pedido("/api/google/conectar?modo=vincular", { cookies: { sd_sessao: sessao } }));
  assert.equal(ida.status, 302);
  const u = new URL(ida.headers.get("location")!);
  const google = await fetch(u, { redirect: "manual" });
  const volta = google.headers.get("location")!;
  const res = await callback.GET(pedido(volta.replace(SITE, ""), { cookies: { sd_google: cookiesDe(ida).get("sd_google"), sd_sessao: sessao } }));
  const destino = new URL(res.headers.get("location")!, SITE);
  return { pedido: u.searchParams, destino: destino.pathname + destino.search };
}

async function drivesDe(sessao: string) {
  const r = await eu.GET(pedido("/api/eu", { cookies: { sd_sessao: sessao } }));
  return (await r.json()).contas as { id: string; email: string; modo: string; estado: string }[];
}

/** Cada grupo começa do zero: sem vagas usadas e ninguém com acesso total. */
async function zerarVagas() {
  const { db, schema } = amb.banco;
  await db.delete(schema.vagasDrive);
  await db.update(schema.usuarios).set({ driveAcessoTotal: false });
}

describe("escopo decidido antes de ir ao Google", () => {
  test("sem acesso total: drive.file, sem somar o que já foi concedido", async () => {
    await zerarVagas();
    const p = await pessoa("Lia");
    const r = await conectarDrive(p.token, conta("lia"));
    assert.equal(r.pedido.get("scope"), `${BASICOS} ${DRIVE_FILE}`);
    assert.equal(r.pedido.get("include_granted_scopes"), null, "um `drive` antigo não volta escondido");
    assert.equal(r.destino, "/conta?google=ok");
    const [d] = await drivesDe(p.token);
    assert.equal(d.modo, "arquivos");
    assert.equal((await vagas.resumoVagas()).usadas, 0, "drive.file não gasta vaga");
  });

  test("com acesso total: o Drive inteiro; reconectar respeita o modo", async () => {
    await zerarVagas();
    const p = await pessoa("Max");
    await ligarDireto(p.id);
    const g = conta("max");
    const r = await conectarDrive(p.token, g);
    assert.equal(r.pedido.get("scope"), `${BASICOS} ${DRIVE}`);
    assert.equal(r.pedido.get("include_granted_scopes"), "true");
    assert.equal(r.destino, "/conta?google=ok");
    assert.equal((await drivesDe(p.token))[0].modo, "total");
    const outra = await conectarDrive(p.token, g);
    assert.equal(outra.pedido.get("scope"), `${BASICOS} ${DRIVE}`, "reconectar continua no acesso total");
    assert.equal((await vagas.resumoVagas()).usadas, 1, "a mesma conta Google não gasta outra vaga");
  });

  test("Entrar com Google só pede quem é a pessoa (nunca gasta vaga)", async () => {
    const ida = await conectar.GET(pedido("/api/google/conectar?modo=entrar"));
    assert.equal(ida.status, 302);
    assert.equal(new URL(ida.headers.get("location")!).searchParams.get("scope"), BASICOS);
  });

  test("escolha pura: pedidoParaConectar e modoEfetivo", async () => {
    await zerarVagas();
    const p = await pessoa("Pura");
    assert.deepEqual(await vagas.pedidoParaConectar(p.id), { modo: "arquivos", escopo: `${BASICOS} ${DRIVE_FILE}`, somarConcedidos: false });
    await ligarDireto(p.id);
    assert.deepEqual(await vagas.pedidoParaConectar(p.id), { modo: "total", escopo: `${BASICOS} ${DRIVE}`, somarConcedidos: true });
    assert.equal(vagas.modoEfetivo(true, `${BASICOS} ${DRIVE}`), "total");
    assert.equal(vagas.modoEfetivo(false, `${BASICOS} ${DRIVE}`), "arquivos", "sem o acesso total ligado, nunca total");
    assert.equal(vagas.modoEfetivo(true, `${BASICOS} ${DRIVE_FILE}`), "arquivos");
    assert.equal(vagas.modoEfetivo(true, `${BASICOS} ${DRIVE}.readonly`), "arquivos", "igualdade exata, nunca substring");
  });
});

describe("vagas: contador e trava no limite", () => {
  test("liberar conta usadas + liberadas sem uso e para no limite", async () => {
    await zerarVagas();
    const [a, b, c] = [await pessoa("Ana"), await pessoa("Bia"), await pessoa("Caio")];
    const o = { limite: 2 };
    const ra = await vagas.trocarAcessoTotal(a.id, true, o);
    assert.ok(ra.ok);
    assert.deepEqual(ra.resumo, { limite: 2, usadas: 0, liberadasSemUso: 1, livres: 1 });
    const rb = await vagas.trocarAcessoTotal(b.id, true, o);
    assert.ok(rb.ok);
    assert.equal(rb.resumo.livres, 0);
    const rc = await vagas.trocarAcessoTotal(c.id, true, o);
    assert.equal(rc.ok, false);
    assert.equal(!rc.ok && rc.erro, "sem_vaga");
    const { db, schema } = amb.banco;
    const [linhaC] = await db.select().from(schema.usuarios).where(drizzle.eq(schema.usuarios.id, c.id));
    assert.equal(linhaC.driveAcessoTotal, false, "ninguém ganha sozinho");

    // A já conectou com `drive` (gastou a vaga), B ainda não: no limite, um Drive novo de A não gasta vaga a mais.
    await conectarDrive(a.token, conta("ana"));
    assert.deepEqual(await vagas.resumoVagas(db, 2), { limite: 2, usadas: 1, liberadasSemUso: 1, livres: 0 });
    const proximo = await vagas.pedidoParaConectar(a.id, 2);
    assert.equal(proximo.escopo, `${BASICOS} ${DRIVE_FILE}`, "sem vaga para outra conta Google: drive.file");
    assert.equal(proximo.somarConcedidos, true, "o Drive que já usou vaga volta com o inteiro");
    assert.equal((await vagas.pedidoParaConectar(b.id, 2)).modo, "total", "B tem a vaga reservada");
  });

  test("o limite padrão é 90 (folga sob os 100 do Google)", () => {
    assert.equal(vagas.LIMITE_VAGAS_DRIVE, 90);
  });
});

describe("vaga usada não volta", () => {
  test("desconectar, desligar e apagar a conta não devolvem a vaga; ligar de novo não gasta outra", async () => {
    await zerarVagas();
    const p = await pessoa("Duda");
    await ligarDireto(p.id);
    await conectarDrive(p.token, conta("duda"));
    assert.equal((await vagas.resumoVagas()).usadas, 1);
    const [d] = await drivesDe(p.token);

    // Desligar: revoga os Drives com o `drive` inteiro e pede para reconectar (já com drive.file).
    const antes = amb.google.contadores.revogacoes;
    const off = await vagas.trocarAcessoTotal(p.id, false, { revogar: googleContas.revogarRefresh });
    assert.ok(off.ok);
    assert.equal(off.resumo.usadas, 1, "desligar não devolve");
    assert.equal(amb.google.contadores.revogacoes, antes + 1);
    const [depois] = await drivesDe(p.token);
    assert.equal(depois.estado, "reconectar");
    assert.equal(depois.modo, "arquivos");

    // Ligar de novo no limite: a pessoa já usou a vaga dela, não gasta outra.
    const de1 = await vagas.trocarAcessoTotal(p.id, true, { limite: 1 });
    assert.ok(de1.ok, "ligar de novo cabe mesmo no limite");
    assert.equal(await vagas.vagasUsadasPor(p.id), 1);

    // Remover o Drive e até apagar a conta: a vaga continua usada.
    assert.deepEqual(await googleContas.removerConta(p.id, d.id), { ok: true });
    assert.equal((await vagas.resumoVagas()).usadas, 1);
    const { db, schema } = amb.banco;
    await db.delete(schema.usuarios).where(drizzle.eq(schema.usuarios.id, p.id));
    assert.equal((await vagas.resumoVagas()).usadas, 1, "nem apagando a conta");
  });

  test("a renovação pelo app de computador também grava a vaga de quem já tinha `drive`", async () => {
    await zerarVagas();
    const p = await pessoa("Eli");
    const g = conta("eli");
    const { db, schema } = amb.banco;
    const cripto = await import("../src/lib/google/cripto");
    const id = `g-eli-${n}`;
    await db.insert(schema.contasGoogle).values({
      id,
      usuarioId: p.id,
      googleSub: g.sub,
      email: g.email,
      refreshTokenEnc: cripto.selar(amb.google.emitirRefresh(g), `contas_google.refresh:${id}`),
      escopos: "",
    });
    await googleContas.tokenDeAcesso(p.id, id);
    assert.equal((await vagas.resumoVagas()).usadas, 1);
  });
});

describe("callback: o escopo que veio de fato", () => {
  test("pediu o inteiro, a caixinha veio desmarcada (sem Drive nenhum): avisa, não grava, não gasta", async () => {
    await zerarVagas();
    const p = await pessoa("Fred");
    await ligarDireto(p.id);
    const r = await conectarDrive(p.token, conta("fred"), BASICOS);
    assert.equal(r.destino, "/conta?erro=google_sem_drive");
    assert.equal((await drivesDe(p.token)).length, 0);
    assert.equal((await vagas.resumoVagas()).usadas, 0);
  });

  test("pediu o inteiro e voltou só drive.file: conecta em Arquivos escolhidos e diz isso", async () => {
    await zerarVagas();
    const p = await pessoa("Gil");
    await ligarDireto(p.id);
    const r = await conectarDrive(p.token, conta("gil"), `${BASICOS} ${DRIVE_FILE}`);
    assert.equal(r.destino, "/conta?google=escolhidos");
    const [d] = await drivesDe(p.token);
    assert.equal(d.modo, "arquivos");
    assert.equal((await vagas.resumoVagas()).usadas, 0, "sem `drive`, sem vaga");
  });

  test("pediu drive.file e veio o inteiro mesmo assim: a vaga conta, mas o modo segue o do admin", async () => {
    await zerarVagas();
    const p = await pessoa("Hugo");
    const r = await conectarDrive(p.token, conta("hugo"), `${BASICOS} ${DRIVE}`);
    assert.equal(r.destino, "/conta?google=ok");
    assert.equal((await vagas.resumoVagas()).usadas, 1, "o Google contou: aqui também conta");
    assert.equal((await drivesDe(p.token))[0].modo, "arquivos");
  });

  test("entrar com Google não troca o `drive` guardado por um token menor", async () => {
    await zerarVagas();
    const p = await pessoa("Iris");
    await ligarDireto(p.id);
    const g = conta("iris");
    await conectarDrive(p.token, g);
    const { db, schema } = amb.banco;
    await db.update(schema.contasGoogle).set({ loginPermitido: true }).where(drizzle.eq(schema.contasGoogle.googleSub, g.sub));
    amb.google.proximo.conta = g;
    amb.google.proximo.escopo = `${BASICOS} ${DRIVE_FILE}`;
    const ida = await conectar.GET(pedido("/api/google/conectar?modo=entrar"));
    const google = await fetch(ida.headers.get("location")!, { redirect: "manual" });
    const res = await callback.GET(pedido(google.headers.get("location")!.replace(SITE, ""), { cookies: { sd_google: cookiesDe(ida).get("sd_google") } }));
    assert.equal(res.status, 303);
    const [linha] = await db.select().from(schema.contasGoogle).where(drizzle.eq(schema.contasGoogle.googleSub, g.sub));
    assert.ok(linha.escopos.split(" ").includes(DRIVE), "continua com o Drive inteiro");
  });
});

describe("app do celular: navegar e comparar em Arquivos escolhidos", () => {
  test("lugar completo só nas pastas do SOBEDESCE; nas outras, desligado com Precisa de acesso total", async () => {
    const m = await import("../public/app/lib/modo-drive.js");
    assert.equal(m.modoDe({ modo: "arquivos" }), "arquivos");
    assert.equal(m.modoDe({}), "total", "servidor antigo: como antes");
    const nossa = { id: "p1", appProperties: { sobedesce: "pasta" } };
    const deFora = { id: "p2" };
    assert.equal(m.lugarCompleto("total", deFora), true);
    assert.equal(m.lugarCompleto("total", null), true);
    assert.equal(m.lugarCompleto("arquivos", nossa), true);
    assert.equal(m.lugarCompleto("arquivos", { id: "p3", sd: true }), true, "a marca copiada para a trilha");
    assert.equal(m.lugarCompleto("arquivos", deFora), false);
    assert.equal(m.lugarCompleto("arquivos", null), false, "a raiz do Meu Drive nunca é completa");
    assert.deepEqual(m.funcaoDaPasta("arquivos", deFora), { ligada: false, motivo: "Precisa de acesso total" });
    assert.deepEqual(m.funcaoDaPasta("arquivos", nossa), { ligada: true, motivo: null });
    assert.equal(m.vazioDoLugar("arquivos", deFora)?.titulo, "Precisa de acesso total", "nunca 'Pasta vazia'");
    assert.equal(m.vazioDoLugar("arquivos", nossa), null);
  });

  test("comparar nunca diz 'falta subir' do que só está invisível", async () => {
    const m = await import("../public/app/lib/modo-drive.js");
    assert.equal(m.situacaoDoLocal({ achouNoDrive: false, completo: true }), "falta_subir");
    assert.equal(m.situacaoDoLocal({ achouNoDrive: false, completo: false }), "nao_sei");
    assert.equal(m.situacaoDoLocal({ achouNoDrive: true, completo: false }), "no_drive");
  });

  test("as pastas que o app cria levam a marca; a aba Drive e a folha de destino usam o modo e o Picker", () => {
    const drive = readFileSync(new URL("../public/app/lib/drive.js", import.meta.url), "utf8");
    assert.match(drive, /appProperties: MARCA_PASTA/);
    const browser = readFileSync(new URL("../public/app/components/browser.js", import.meta.url), "utf8");
    assert.match(browser, /lugarCompleto\(modo, folder\)/);
    assert.match(browser, /Escolher do Drive/);
    assert.match(browser, /PRECISA_TOTAL/, "o tamanho da pasta some fora das pastas do SOBEDESCE");
    const folders = readFileSync(new URL("../public/app/components/folders.js", import.meta.url), "utf8");
    assert.match(folders, /escolherDoDrive\(\{ tipo: 'pasta'/);
    const cfg = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
    assert.match(cfg, /script-src 'self' 'wasm-unsafe-eval' https:\/\/absolutezro\.com https:\/\/apis\.google\.com/);
  });

  test("/api/drive/picker: só com sessão, e só diz pronto com as três variáveis", async () => {
    assert.equal((await picker.GET(pedido("/api/drive/picker"))).status, 401);
    const p = await pessoa("Juca");
    const sem = await picker.GET(pedido("/api/drive/picker", { cookies: { sd_sessao: p.token } }));
    assert.deepEqual(await sem.json(), { pronto: false });
    Object.assign(process.env, { GOOGLE_PICKER_API_KEY: "AIzaSyTeste-chave-publica-do-picker", GOOGLE_APP_ID: "123456789012" });
    try {
      const com = await (await picker.GET(pedido("/api/drive/picker", { cookies: { sd_sessao: p.token } }))).json();
      assert.deepEqual(com, { pronto: true, clientId: process.env.GOOGLE_CLIENT_ID, apiKey: "AIzaSyTeste-chave-publica-do-picker", appId: "123456789012" });
    } finally {
      delete process.env.GOOGLE_PICKER_API_KEY;
      delete process.env.GOOGLE_APP_ID;
    }
  });
});

describe("admin: só o admin liga o acesso total", () => {
  test("quem não é admin recebe recusado e nada muda; o admin liga", async () => {
    await zerarVagas();
    const alvo = await pessoa("Kim");
    const curioso = await pessoa("Leo");
    const r = await admin.acessoTotalPeloAdmin({ id: curioso.id }, alvo.id, true);
    assert.deepEqual(r, { ok: false, erro: "recusado" });
    const r2 = await admin.acessoTotalPeloAdmin({ id: alvo.id }, alvo.id, true);
    assert.deepEqual(r2, { ok: false, erro: "recusado" }, "nem a própria pessoa se libera");
    const { db, schema } = amb.banco;
    const [antes] = await db.select().from(schema.usuarios).where(drizzle.eq(schema.usuarios.id, alvo.id));
    assert.equal(antes.driveAcessoTotal, false);

    // Admin: e-mail de um Drive conectado e confirmado pelo Google (lib/admin.ts).
    const chefe = await pessoa("Chefe");
    const gChefe = conta("chefe");
    await conectarDrive(chefe.token, gChefe);
    const ok = await admin.acessoTotalPeloAdmin({ id: chefe.id }, alvo.id, true, { admins: [gChefe.email] });
    assert.ok(ok.ok);
    const [depois] = await db.select().from(schema.usuarios).where(drizzle.eq(schema.usuarios.id, alvo.id));
    assert.equal(depois.driveAcessoTotal, true);
  });

  test("a ação do botão passa pelo acessoTotalPeloAdmin (que confere o admin)", () => {
    const acoes = readFileSync(new URL("../src/app/(conta)/acoes.ts", import.meta.url), "utf8");
    const corpo = /export async function acaoAcessoTotal[\s\S]*?\n}\n/.exec(acoes)?.[0] ?? "";
    assert.match(corpo, /acessoTotalPeloAdmin\(atual\.usuario/);
    assert.doesNotMatch(corpo, /trocarAcessoTotal\(/, "nunca chama a troca direto");
  });
});
