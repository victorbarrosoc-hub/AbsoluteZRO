/**
 * "Entrar com Absolute ZRO" contra a Absolute ZRO falsa: cria conta nova (e-mail confirmado), entra de novo na mesma
 * conta, não toma conta pelo e-mail, liga e desliga em Sua conta, recusa token adulterado (assinatura, nonce, público,
 * emissor), state errado e volta externo. O Drive continua à parte.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { cookiesDe, pedido, prepararAmbiente, SITE } from "./ambiente.mjs";
import { iniciarZroFalsa, type PessoaZro } from "./zro-falso.mjs";

const CLIENTE = { clientId: "sobedesce-web", clientSecret: "zk_segredo_de_teste" };
let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let zro: Awaited<ReturnType<typeof iniciarZroFalsa>>;
let rotaEntrar: typeof import("../src/app/api/zro/entrar/route");
let rotaVolta: typeof import("../src/app/api/zro/callback/route");
let contas: typeof import("../src/lib/auth/contas");
let sessao: typeof import("../src/lib/auth/sessao");
let zroContas: typeof import("../src/lib/zro/contas");
let rotaEu: typeof import("../src/app/api/eu/route");
let rotaDrives: typeof import("../src/app/api/drive/contas/route");

const PRODUTORA: PessoaZro = { sub: "zro-111", email: "lia@produtora.com", nome: "Lia Produtora", org: "Produtora Lia", produtos: ["sobedesce", "synquei"] };

before(async () => {
  amb = await prepararAmbiente();
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  rotaEntrar = await import("../src/app/api/zro/entrar/route");
  rotaVolta = await import("../src/app/api/zro/callback/route");
  contas = await import("../src/lib/auth/contas");
  sessao = await import("../src/lib/auth/sessao");
  zroContas = await import("../src/lib/zro/contas");
  rotaEu = await import("../src/app/api/eu/route");
  rotaDrives = await import("../src/app/api/drive/contas/route");
});

after(async () => {
  await zro?.fechar();
  await amb?.fechar();
});

/** Navegador: /api/zro/entrar → Absolute ZRO falsa → /api/zro/callback. Devolve o destino e os cookies da volta. */
async function fluxo(o: { modo?: "entrar" | "criar" | "vincular"; pessoa: PessoaZro | null; sessao?: string; volta?: string; negar?: boolean; adulterar?: "nonce" | "aud" | "assinatura" | "emissor"; trocarState?: boolean }) {
  zro.estado.proximo = { pessoa: o.pessoa, negar: Boolean(o.negar), adulterar: o.adulterar ?? null };
  const q = new URLSearchParams({ modo: o.modo ?? "entrar" });
  if (o.volta) q.set("volta", o.volta);
  const ida = await rotaEntrar.GET(pedido(`/api/zro/entrar?${q}`, { cookies: { sd_sessao: o.sessao } }));
  const destinoIda = ida.headers.get("location") ?? "";
  if (ida.status !== 302) return { ida, destino: destinoIda.replace(SITE, ""), cookies: new Map<string, string>() };
  const u = new URL(destinoIda);
  assert.equal(u.origin, zro.url);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("redirect_uri"), `${SITE}/api/zro/callback`);
  assert.ok(u.searchParams.get("nonce"));
  const cookie = cookiesDe(ida).get("sd_zro");
  assert.ok(cookie);
  assert.match(ida.headers.getSetCookie()[0], /HttpOnly/);
  assert.match(ida.headers.getSetCookie()[0], /Path=\/api\/zro/);
  const z = await fetch(destinoIda, { redirect: "manual" });
  let volta = z.headers.get("location")!.replace(SITE, "");
  if (o.trocarState) volta = volta.replace(/state=[^&]+/, "state=outro");
  const res = await rotaVolta.GET(pedido(volta, { cookies: { sd_zro: cookie, sd_sessao: o.sessao } }));
  assert.equal(res.status, 303);
  assert.equal(cookiesDe(res).get("sd_zro"), "", "o cookie da ida é apagado na volta");
  const destino = new URL(res.headers.get("location")!, SITE);
  return { ida, res, destino: destino.pathname + destino.search, cookies: cookiesDe(res) };
}

describe("entrar", () => {
  test("primeira vez: cria a conta SOBEDESCE sem senha, ligada à Absolute ZRO", async () => {
    const r = await fluxo({ pessoa: PRODUTORA });
    assert.equal(r.destino, "/conta?zro=ok");
    const token = r.cookies.get("sd_sessao");
    assert.ok(token);
    const a = await sessao.autenticar({ cookie: token });
    assert.equal(a?.usuario.email, "lia@produtora.com");
    assert.equal(a?.usuario.nome, "Lia Produtora");
    const ligada = await zroContas.contaZroDe(a!.usuario.id);
    assert.deepEqual(ligada?.produtos, ["sobedesce", "synquei"]);
    assert.equal(ligada?.organizacao, "Produtora Lia");
    // Sem senha: e-mail e senha não abrem a conta até a pessoa criar uma.
    const tenta = await contas.entrarComSenha({ email: "lia@produtora.com", senha: "qualquer coisa", ip: "1.1.1.1" });
    assert.equal(tenta.ok, false);
  });

  test("segunda vez: entra na mesma conta (não cria outra)", async () => {
    const r = await fluxo({ pessoa: PRODUTORA, volta: "/conta#drives" });
    assert.equal(r.destino, "/conta");
    const { db, schema } = amb.banco;
    const linhas = await db.select().from(schema.usuarios);
    assert.equal(linhas.filter((l) => l.email === "lia@produtora.com").length, 1);
  });

  test("e-mail que já tem conta SOBEDESCE: não liga sozinho (sem tomar conta pelo e-mail)", async () => {
    const c = await contas.criarConta({ nome: "Rui", email: "rui@exemplo.com", senha: "senha do rui!", ip: "2.2.2.2" });
    assert.ok(c.ok);
    const r = await fluxo({ pessoa: { sub: "zro-rui", email: "rui@exemplo.com", nome: "Rui" } });
    assert.equal(r.destino, "/entrar?erro=zro_email_em_uso");
    assert.equal(r.cookies.get("sd_sessao"), undefined);
    assert.equal(await zroContas.contaZroDe(c.usuario.id), null);
  });

  test("e-mail não confirmado na Absolute ZRO: não cria conta", async () => {
    const r = await fluxo({ pessoa: { sub: "zro-sem", email: "sem@exemplo.com", nome: "Sem", verificado: false } });
    assert.equal(r.destino, "/entrar?erro=zro_email_nao_verificado");
  });

  test("recusar na Absolute ZRO volta com aviso calmo", async () => {
    const r = await fluxo({ pessoa: PRODUTORA, negar: true });
    assert.equal(r.destino, "/entrar?erro=zro_recusado");
  });
});

describe("token adulterado ou fora de ordem", () => {
  for (const adulterar of ["assinatura", "nonce", "aud", "emissor"] as const) {
    test(`id_token com ${adulterar} errado é recusado`, async () => {
      const r = await fluxo({ pessoa: { sub: `zro-${adulterar}`, email: `${adulterar}@exemplo.com`, nome: "X" }, adulterar });
      assert.equal(r.destino, "/entrar?erro=zro_erro");
      assert.equal(r.cookies.get("sd_sessao"), undefined);
    });
  }

  test("state trocado: nada é trocado nem criado", async () => {
    const antes = zro.estado.trocas;
    const r = await fluxo({ pessoa: { sub: "zro-state", email: "state@exemplo.com", nome: "S" }, trocarState: true });
    assert.equal(r.destino, "/entrar?erro=zro_expirou");
    assert.equal(zro.estado.trocas, antes, "o código nem foi usado");
  });

  test("sem volta pedida, quem entra cai na conta (a tarefa), nunca na Z", async () => {
    const r = await fluxo({ pessoa: PRODUTORA });
    assert.equal(r.destino, "/conta");
  });

  test("volta externo é ignorado", async () => {
    const r = await fluxo({ pessoa: PRODUTORA, volta: "https://evil.com/roubar" });
    assert.equal(r.destino, "/conta", "volta padrão: a conta, a tela de entrada (a Z não)");
  });

  test("volta sem o cookie da ida: pede para tentar de novo", async () => {
    const res = await rotaVolta.GET(pedido("/api/zro/callback?code=zc_x&state=y"));
    assert.equal(new URL(res.headers.get("location")!, SITE).pathname + new URL(res.headers.get("location")!, SITE).search, "/entrar?erro=zro_expirou");
  });
});

describe("Sua conta", () => {
  test("liga a Absolute ZRO à conta com senha; depois entra por ela; desliga e segue com senha", async () => {
    const c = await contas.criarConta({ nome: "Bia", email: "bia@exemplo.com", senha: "senha da bia!", ip: "3.3.3.3" });
    assert.ok(c.ok);
    const bia: PessoaZro = { sub: "zro-bia", email: "bia.zro@exemplo.com", nome: "Bia" };
    const v = await fluxo({ modo: "vincular", pessoa: bia, sessao: c.token });
    // Ligou agora, mas sem a SOBEDESCE em zro_products: fica em Sua conta (com a SOBEDESCE, vai para as Conexões,
    // tests/zro-ligar.test.mts).
    assert.equal(v.destino, "/conta?zro=ok");
    const e = await fluxo({ pessoa: bia });
    const a = await sessao.autenticar({ cookie: e.cookies.get("sd_sessao") });
    assert.equal(a?.usuario.id, c.usuario.id);
    assert.deepEqual(await zroContas.desligarZro(c.usuario.id), { ok: true });
    const depois = await contas.entrarComSenha({ email: "bia@exemplo.com", senha: "senha da bia!", ip: "3.3.3.3" });
    assert.equal(depois.ok, true);
  });

  test("a mesma Absolute ZRO não liga em duas contas SOBEDESCE", async () => {
    const c = await contas.criarConta({ nome: "Duda", email: "duda@exemplo.com", senha: "senha da duda!", ip: "4.4.4.4" });
    assert.ok(c.ok);
    const r = await fluxo({ modo: "vincular", pessoa: PRODUTORA, sessao: c.token });
    assert.equal(r.destino, "/conta?erro=zro_outra_conta");
  });

  test("conta criada pela Absolute ZRO e sem senha não desliga (ficaria sem como entrar)", async () => {
    const r = await fluxo({ pessoa: PRODUTORA });
    const a = await sessao.autenticar({ cookie: r.cookies.get("sd_sessao") });
    assert.deepEqual(await zroContas.desligarZro(a!.usuario.id), { ok: false, erro: "zro_unico_login" });
  });
});

describe("criar conta", () => {
  test("Criar conta abre a Absolute ZRO em criar conta (prompt=create) e volta já logada", async () => {
    const nova: PessoaZro = { sub: "zro-nova", email: "nova@produtora.com", nome: "Nova Pessoa", produtos: ["sobedesce"] };
    const r = await fluxo({ modo: "criar", pessoa: nova });
    assert.equal(zro.estado.ultimoPrompt, "create");
    assert.equal(new URL(r.ida.headers.get("location")!).searchParams.get("prompt"), "create");
    assert.equal(r.destino, "/conta?zro=ok");
    const a = await sessao.autenticar({ cookie: r.cookies.get("sd_sessao") });
    assert.equal(a?.usuario.email, "nova@produtora.com");
    assert.equal(a?.liberado, true);
  });

  test("Entrar não pede prompt=create", async () => {
    await fluxo({ pessoa: PRODUTORA });
    assert.equal(zro.estado.ultimoPrompt, null);
  });
});

describe("direito de uso (zro_products)", () => {
  const SEM: PessoaZro = { sub: "zro-sem-produto", email: "caio@outra.com", nome: "Caio", org: "Outra", produtos: ["synquei"] };

  test("SOBEDESCE fora de zro_products: entra, mas as funções ficam bloqueadas; liberou, atualiza e usa", async () => {
    const r = await fluxo({ modo: "criar", pessoa: SEM });
    const token = r.cookies.get("sd_sessao");
    assert.ok(token, "a pessoa entra");
    const a = await sessao.autenticar({ cookie: token });
    assert.equal(a?.liberado, false);

    const eu = await rotaEu.GET(pedido("/api/eu", { cookies: { sd_sessao: token } }));
    assert.equal(eu.status, 403);
    const corpo = await eu.json();
    assert.equal(corpo.erro, "sem_acesso_zro");
    assert.match(corpo.mensagem, /Sua conta Absolute ZRO ainda não tem acesso ao SOBEDESCE\./);
    assert.match(corpo.mensagem, /absolutezro\.com\/ferramentas/);
    assert.equal((await rotaDrives.GET(pedido("/api/drive/contas", { cookies: { sd_sessao: token } }))).status, 403);

    // O admin da Absolute ZRO libera; "Já liberaram? Atualizar" religa e traz a lista nova.
    const v = await fluxo({ modo: "vincular", pessoa: { ...SEM, produtos: ["synquei", "sobedesce"] }, sessao: token });
    assert.equal(v.destino, "/conta?zro=ok");
    assert.equal((await sessao.autenticar({ cookie: token }))?.liberado, true);
    assert.equal((await rotaEu.GET(pedido("/api/eu", { cookies: { sd_sessao: token } }))).status, 200);
    assert.equal((await rotaDrives.GET(pedido("/api/drive/contas", { cookies: { sd_sessao: token } }))).status, 200);

    // Tirou de novo: o próximo login pela Absolute ZRO grava e bloqueia outra vez.
    const de = await fluxo({ pessoa: SEM });
    assert.equal((await sessao.autenticar({ cookie: de.cookies.get("sd_sessao") }))?.liberado, false);
    assert.equal((await sessao.autenticar({ cookie: token }))?.liberado, false, "vale para todas as sessões da conta");
  });

  test("conta antiga sem vínculo com a Absolute ZRO segue como sempre", async () => {
    const c = await contas.criarConta({ nome: "Antiga", email: "antiga@exemplo.com", senha: "senha da antiga!", ip: "5.5.5.5" });
    assert.ok(c.ok);
    assert.equal((await sessao.autenticar({ cookie: c.token }))?.liberado, true);
    assert.equal((await rotaEu.GET(pedido("/api/eu", { cookies: { sd_sessao: c.token } }))).status, 200);
  });
});
