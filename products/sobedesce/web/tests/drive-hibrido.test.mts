/**
 * Drive híbrido (titular, 31/10/2026): o escopo sai do modo antes de ir ao Google (acesso total = `drive`, os outros
 * `drive.file`, entrar nunca pede Drive), contador de vagas e trava no limite, vaga não volta, callback com escopo
 * diferente do pedido, a regra do navegar/comparar no modo Arquivos escolhidos (app do celular) e o Acesso total decidido no console da Absolute ZRO.
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
    assert.equal(outra.pedido.get("scope"), `${BASICOS} ${DRIVE_FILE}`, "vaga usada: nunca pede o inteiro de novo");
    assert.equal(outra.pedido.get("include_granted_scopes"), "true", "o `drive` já dado volta somado");
    assert.equal(outra.destino, "/conta?google=ok");
    assert.equal((await drivesDe(p.token))[0].modo, "total", "reconectar continua no acesso total");
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
    const proximo = await vagas.pedidoParaConectar(a.id);
    assert.equal(proximo.escopo, `${BASICOS} ${DRIVE_FILE}`, "sem vaga para outra conta Google: drive.file");
    assert.equal(proximo.somarConcedidos, true, "o Drive que já usou vaga volta com o inteiro");
    assert.equal((await vagas.pedidoParaConectar(b.id)).modo, "total", "B tem a vaga reservada");
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

  test("pediu drive.file e veio o inteiro (escopo trocado na URL do Google): recusa, revoga, não guarda nem dá vaga", async () => {
    await zerarVagas();
    const p = await pessoa("Hugo");
    const antes = amb.google.contadores.revogacoes;
    const r = await conectarDrive(p.token, conta("hugo"), `${BASICOS} ${DRIVE}`);
    assert.equal(r.pedido.get("scope"), `${BASICOS} ${DRIVE_FILE}`);
    assert.equal(r.destino, "/conta?erro=google_erro");
    assert.equal(amb.google.contadores.revogacoes, antes + 1, "a concessão volta para o Google");
    assert.equal((await drivesDe(p.token)).length, 0, "nenhum token guardado");
    assert.equal(await vagas.vagasUsadasPor(p.id), 0, "a pessoa não ganha vaga");
    assert.equal((await vagas.resumoVagas()).usadas, 1, "o Google contou: o contador também, sem dono");
  });

  test("acesso total com a vaga usada: conta Google nova pede drive.file e não gasta outra vaga (M1)", async () => {
    await zerarVagas();
    const p = await pessoa("Jade");
    await ligarDireto(p.id);
    const primeira = conta("jade");
    await conectarDrive(p.token, primeira);
    assert.equal(await vagas.vagasUsadasPor(p.id), 1);
    assert.ok((await vagas.resumoVagas()).livres > 0, "ainda há vaga livre no projeto, mesmo assim não gasta");

    const segunda = conta("jade-2");
    const nova = await conectarDrive(p.token, segunda);
    assert.equal(nova.pedido.get("scope"), `${BASICOS} ${DRIVE_FILE}`);
    assert.equal(nova.destino, "/conta?google=ok");
    assert.equal(await vagas.vagasUsadasPor(p.id), 1, "uma vaga por pessoa");
    assert.equal((await vagas.resumoVagas()).usadas, 1);

    // Trocando o escopo na URL do Google para o inteiro numa terceira conta: recusado e revogado.
    const antes = amb.google.contadores.revogacoes;
    const trocada = await conectarDrive(p.token, conta("jade-3"), `${BASICOS} ${DRIVE}`);
    assert.equal(trocada.destino, "/conta?erro=google_erro");
    assert.equal(amb.google.contadores.revogacoes, antes + 1);
    assert.equal(await vagas.vagasUsadasPor(p.id), 1, "nem com o escopo trocado");

    // A conta que usou a vaga continua no Drive inteiro, inclusive ao reconectar.
    const modos = Object.fromEntries((await drivesDe(p.token)).map((d) => [d.email, d.modo]));
    assert.deepEqual(modos, { [primeira.email]: "total", [segunda.email]: "arquivos" });
    const de1 = await conectarDrive(p.token, primeira);
    assert.equal(de1.destino, "/conta?google=ok");
    assert.equal((await drivesDe(p.token)).find((d) => d.email === primeira.email)?.modo, "total");
  });

  test("a concessão do Drive inteiro sumiu no Google: reconectar pede o inteiro de novo só para a conta da vaga (08/11/2026)", async () => {
    await zerarVagas();
    const p = await pessoa("Kika");
    await ligarDireto(p.id);
    const g = conta("kika");
    await conectarDrive(p.token, g);
    assert.equal(await vagas.vagasUsadasPor(p.id), 1);

    // Reconectar com a concessão antiga perdida: o pedido é drive.file + include_granted_scopes e o Google devolve só drive.file.
    const r1 = await conectarDrive(p.token, g, `${BASICOS} ${DRIVE_FILE}`);
    assert.equal(r1.pedido.get("scope"), `${BASICOS} ${DRIVE_FILE}`);
    const segunda = new URL(r1.destino, SITE);
    assert.equal(segunda.pathname, "/api/google/conectar", "não cai calado em Arquivos escolhidos");
    assert.equal(segunda.searchParams.get("inteiro"), g.sub);

    // O segundo pedido: o Drive inteiro, com a conta da vaga já escolhida no Google.
    amb.google.proximo.conta = g;
    amb.google.proximo.escopo = null;
    const ida = await conectar.GET(pedido(r1.destino, { cookies: { sd_sessao: p.token } }));
    assert.equal(ida.status, 302);
    const u = new URL(ida.headers.get("location")!);
    assert.equal(u.searchParams.get("scope"), `${BASICOS} ${DRIVE}`);
    assert.equal(u.searchParams.get("login_hint"), g.email);
    const google = await fetch(u, { redirect: "manual" });
    const res = await callback.GET(pedido(google.headers.get("location")!.replace(SITE, ""), { cookies: { sd_google: cookiesDe(ida).get("sd_google"), sd_sessao: p.token } }));
    const fim = new URL(res.headers.get("location")!, SITE);
    assert.equal(fim.pathname + fim.search, "/conta?google=ok");
    assert.equal((await drivesDe(p.token)).find((d) => d.email === g.email)?.modo, "total");
    assert.equal((await vagas.resumoVagas()).usadas, 1, "a mesma conta Google não gasta outra vaga");

    // Desmarcou a caixinha também no segundo pedido: conecta em Arquivos escolhidos, diz isso e não pede uma terceira vez.
    const r2 = await conectarDrive(p.token, g, `${BASICOS} ${DRIVE_FILE}`);
    amb.google.proximo.escopo = `${BASICOS} ${DRIVE_FILE}`;
    const ida2 = await conectar.GET(pedido(r2.destino, { cookies: { sd_sessao: p.token } }));
    const google2 = await fetch(new URL(ida2.headers.get("location")!), { redirect: "manual" });
    const res2 = await callback.GET(pedido(google2.headers.get("location")!.replace(SITE, ""), { cookies: { sd_google: cookiesDe(ida2).get("sd_google"), sd_sessao: p.token } }));
    const fim2 = new URL(res2.headers.get("location")!, SITE);
    assert.equal(fim2.pathname + fim2.search, "/conta?google=escolhidos");
  });

  test("o segundo pedido só vale para a conta da vaga: outra conta Google ou sem acesso total, nada de Drive inteiro", async () => {
    await zerarVagas();
    const p = await pessoa("Lia");
    await ligarDireto(p.id);
    const g = conta("lia");
    await conectarDrive(p.token, g);
    // Conta Google nova da mesma pessoa, voltando com drive.file: fica em Arquivos escolhidos (M1), sem segundo pedido.
    const outra = await conectarDrive(p.token, conta("lia-2"), `${BASICOS} ${DRIVE_FILE}`);
    assert.equal(outra.destino, "/conta?google=ok");
    // ?inteiro= com um sub que não é a vaga: o pedido continua drive.file.
    amb.google.proximo.conta = g;
    const forjado = await conectar.GET(pedido("/api/google/conectar?modo=vincular&inteiro=sub-de-outra-pessoa", { cookies: { sd_sessao: p.token } }));
    assert.equal(new URL(forjado.headers.get("location")!).searchParams.get("scope"), `${BASICOS} ${DRIVE_FILE}`);
    // Desligado no console: nem a conta da vaga ganha o segundo pedido.
    await ligarDireto(p.id, false);
    const desligado = await conectar.GET(pedido(`/api/google/conectar?modo=vincular&inteiro=${g.sub}`, { cookies: { sd_sessao: p.token } }));
    const q = new URL(desligado.headers.get("location")!).searchParams;
    assert.equal(q.get("scope"), `${BASICOS} ${DRIVE_FILE}`);
    assert.equal(q.get("login_hint"), null);
  });

  test("drive recusado numa conta Google que já está conectada aqui não revoga: derrubaria o Drive salvo (08/11/2026)", async () => {
    await zerarVagas();
    const p = await pessoa("Mel");
    const g = conta("mel");
    await conectarDrive(p.token, g);
    const [d] = await drivesDe(p.token);
    assert.equal(d.modo, "arquivos");
    const antes = amb.google.contadores.revogacoes;
    // O mesmo Google volta com o `drive` sem ter pedido (escopo trocado na URL): recusa, mas não revoga a concessão.
    const r = await conectarDrive(p.token, g, `${BASICOS} ${DRIVE}`);
    assert.equal(r.destino, "/conta?erro=google_erro");
    assert.equal(amb.google.contadores.revogacoes, antes, "revogar derrubaria a concessão inteira, e o Drive salvo junto");
    const token = await googleContas.tokenDeAcesso(p.id, d.id, { renovar: true });
    assert.ok(token.accessToken, "o Drive salvo continua renovando");
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
    assert.deepEqual(await sem.json(), { pronto: false, problemas: ["chave_falta"] });
    Object.assign(process.env, { GOOGLE_PICKER_API_KEY: "AIzaSyTeste-chave-publica-do-picker", GOOGLE_APP_ID: "123456789012" });
    try {
      const com = await (await picker.GET(pedido("/api/drive/picker", { cookies: { sd_sessao: p.token } }))).json();
      assert.deepEqual(com, { pronto: true, clientId: process.env.GOOGLE_CLIENT_ID, apiKey: "AIzaSyTeste-chave-publica-do-picker", appId: "123456789012" });
    } finally {
      delete process.env.GOOGLE_PICKER_API_KEY;
      delete process.env.GOOGLE_APP_ID;
    }
  });

  test("Picker: diz qual variável falhou (sem o valor) e tira o App ID do client ID quando ele veio errado (08/11/2026)", async () => {
    const { diagnosticoPicker } = await import("../src/lib/google/config");
    const cliente = "123456789012-abcdef.apps.googleusercontent.com";
    const chave = "AIzaSyTeste-chave-publica-do-picker";
    // ID do projeto (nome) em vez do número: usa o número do client ID e diz o que estava errado.
    const nome = diagnosticoPicker({ GOOGLE_CLIENT_ID: cliente, GOOGLE_PICKER_API_KEY: chave, GOOGLE_APP_ID: "sobedesce-476012" });
    assert.deepEqual(nome.config, { clientId: cliente, apiKey: chave, appId: "123456789012" });
    assert.deepEqual(nome.problemas, ["app_id_formato"]);
    // Colado com aspas e espaços: vale igual, sem problema.
    const aspas = diagnosticoPicker({ GOOGLE_CLIENT_ID: cliente, GOOGLE_PICKER_API_KEY: ` "${chave}" `, GOOGLE_APP_ID: "'123456789012'\n" });
    assert.deepEqual(aspas, { config: { clientId: cliente, apiKey: chave, appId: "123456789012" }, problemas: [], appIdDoClientId: false });
    // Número de outro projeto: o Picker só funciona com o do client ID.
    assert.deepEqual(diagnosticoPicker({ GOOGLE_CLIENT_ID: cliente, GOOGLE_PICKER_API_KEY: chave, GOOGLE_APP_ID: "999999999999" }).problemas, ["app_id_outro_projeto"]);
    // Sem App ID: o do client ID.
    assert.equal(diagnosticoPicker({ GOOGLE_CLIENT_ID: cliente, GOOGLE_PICKER_API_KEY: chave }).config?.appId, "123456789012");
    // Chave errada: desligado, e diz qual.
    const ruim = diagnosticoPicker({ GOOGLE_CLIENT_ID: cliente, GOOGLE_PICKER_API_KEY: "chave com espaço", GOOGLE_APP_ID: "123456789012" });
    assert.equal(ruim.config, null);
    assert.deepEqual(ruim.problemas, ["chave_formato"]);
    assert.deepEqual(diagnosticoPicker({}).problemas, ["client_id_falta", "chave_falta"]);
    // A resposta diz o motivo, nunca o valor.
    const p = await pessoa("Nina");
    Object.assign(process.env, { GOOGLE_PICKER_API_KEY: "chave com espaço" });
    try {
      const r = await (await picker.GET(pedido("/api/drive/picker", { cookies: { sd_sessao: p.token } }))).json();
      assert.deepEqual(r, { pronto: false, problemas: ["chave_formato"] });
    } finally {
      delete process.env.GOOGLE_PICKER_API_KEY;
    }
  });
});

describe("admin: o Acesso total mudou para o console da Absolute ZRO", () => {
  test("o /admin daqui só mostra o estado; não há mais ação para ligar", () => {
    const acoes = readFileSync(new URL("../src/app/(conta)/acoes.ts", import.meta.url), "utf8");
    assert.doesNotMatch(acoes, /acaoAcessoTotal|trocarAcessoTotal/);
    const ficha = readFileSync(new URL("../src/components/admin/acesso-total.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(ficha, /use client|<form|<button/);
    assert.match(ficha, /absolutezro\.com\/admin\/apps\/sobedesce/);
  });
});
