/**
 * Trocar de conta na entrada pela Absolute ZRO (pedido do titular, 31/10/2026):
 * - "Entrar nessa conta" (lib/zro/outra-conta.ts): a Absolute ZRO que acabou de entrar já tem outra conta SOBEDESCE; com
 *   o selo do callback (cifrado, 5 min, preso à sessão), o POST troca a sessão para ela. Sem selo, vencido, adulterado,
 *   de outra sessão, reapresentado ou sem Origin: nada muda.
 * - "Usar outra conta": `trocar=1` vira `prompt=login` na ida para a Absolute ZRO (ela pede a conta de novo).
 * - /entrar: Absolute ZRO principal; Google e e-mail e senha como secundários, nessa ordem.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { cookiesDe, pedido, prepararAmbiente, SITE } from "./ambiente.mjs";
import { iniciarZroFalsa, type PessoaZro } from "./zro-falso.mjs";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENTE = { clientId: "sobedesce-web", clientSecret: "zk_segredo_de_teste" };
let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let zro: Awaited<ReturnType<typeof iniciarZroFalsa>>;
let rotaEntrar: typeof import("../src/app/api/zro/entrar/route");
let rotaVolta: typeof import("../src/app/api/zro/callback/route");
let rotaTrocar: typeof import("../src/app/api/zro/trocar-conta/route");
let contas: typeof import("../src/lib/auth/contas");
let sessao: typeof import("../src/lib/auth/sessao");
let ligar: typeof import("../src/lib/zro/ligar");
let outra: typeof import("../src/lib/zro/outra-conta");

before(async () => {
  amb = await prepararAmbiente();
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  rotaEntrar = await import("../src/app/api/zro/entrar/route");
  rotaVolta = await import("../src/app/api/zro/callback/route");
  rotaTrocar = await import("../src/app/api/zro/trocar-conta/route");
  contas = await import("../src/lib/auth/contas");
  sessao = await import("../src/lib/auth/sessao");
  ligar = await import("../src/lib/zro/ligar");
  outra = await import("../src/lib/zro/outra-conta");
});

after(async () => {
  await zro?.fechar();
  await amb?.fechar();
});

let n = 0;
async function contaAntiga() {
  n++;
  const c = await contas.criarConta({ nome: `Antiga ${n}`, email: `troca${n}@exemplo.com`, senha: "senha antiga boa!", ip: `8.8.8.${n}` });
  assert.ok(c.ok);
  return c;
}

/** Navegador: /api/zro/entrar → Absolute ZRO falsa → /api/zro/callback. Devolve a resposta final e o destino. */
async function fluxo(o: { pessoa: PessoaZro; sessao?: string; caminho: string }) {
  zro.estado.proximo = { pessoa: { produtos: ["sobedesce"], ...o.pessoa }, negar: false, adulterar: null };
  const ida = await rotaEntrar.GET(pedido(o.caminho, { cookies: { sd_sessao: o.sessao } }));
  assert.equal(ida.status, 302);
  const z = await fetch(ida.headers.get("location")!, { redirect: "manual" });
  const volta = z.headers.get("location")!.replace(SITE, "");
  const res = await rotaVolta.GET(pedido(volta, { cookies: { sd_zro: cookiesDe(ida).get("sd_zro"), sd_sessao: o.sessao } }));
  assert.equal(res.status, 303);
  const destino = new URL(res.headers.get("location")!, SITE);
  return { ida, res, cookies: cookiesDe(res), destino: destino.origin === SITE ? destino.pathname + destino.search : destino.href };
}

/**
 * O caso do titular: a conta "dona" já está ligada à Absolute ZRO `sub`; a pessoa está numa conta antiga sem vínculo e,
 * ao ligar, a Absolute ZRO usa a sessão de lá (a mesma `sub`) → zro_outra_conta, com o selo.
 */
async function cenario(sub: string, volta = "/conta") {
  const pessoa: PessoaZro = { sub, email: `${sub}@exemplo.com`, nome: "Dona" };
  const dona = await contaAntiga();
  await fluxo({ pessoa, sessao: dona.token, caminho: ligar.caminhoLigarZro("/conta") });
  const antiga = await contaAntiga();
  const r = await fluxo({ pessoa, sessao: antiga.token, caminho: ligar.caminhoLigarZro(volta) });
  assert.equal(r.destino, `${volta}${volta.includes("?") ? "&" : "?"}erro=zro_outra_conta`);
  const selo = r.cookies.get(outra.COOKIE_OUTRA_CONTA);
  assert.ok(selo, "o callback guarda o selo");
  return { pessoa, dona, antiga, selo, setCookie: r.res.headers.getSetCookie().find((l) => l.startsWith(`${outra.COOKIE_OUTRA_CONTA}=`))! };
}

const trocar = (cookies: Record<string, string | undefined>, origin?: string | null) =>
  rotaTrocar.POST(pedido(ligar.CAMINHO_TROCAR_CONTA, { method: "POST", cookies, origin }));

describe("Entrar nessa conta", () => {
  test("com selo válido: encerra a sessão antiga e abre a da conta ligada àquela Absolute ZRO", async () => {
    const { dona, antiga, selo, setCookie } = await cenario("zro-titular");
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Max-Age=300/);
    assert.doesNotMatch(selo!, /zro-titular/, "o selo é cifrado: o sub não aparece");

    const res = await trocar({ sd_sessao: antiga.token, sd_zro_outra: selo });
    assert.equal(res.status, 303);
    assert.equal(new URL(res.headers.get("location")!, SITE).pathname, "/conta");
    const c = cookiesDe(res);
    assert.equal(c.get(outra.COOKIE_OUTRA_CONTA), "", "o selo é apagado");
    const nova = await sessao.autenticar({ cookie: c.get("sd_sessao") });
    assert.equal(nova?.usuario.id, dona.usuario.id, "agora na conta da Absolute ZRO");
    assert.equal(nova?.ligadoZro, true);
    assert.equal(await sessao.autenticar({ cookie: antiga.token }), null, "a sessão antiga foi encerrada");
    const a = await sessao.autenticar({ cookie: dona.token });
    assert.equal(a?.usuario.id, dona.usuario.id, "as outras sessões da dona continuam");

    // Reapresentar o mesmo selo não serve: a sessão a que ele estava preso já não existe.
    const deNovo = new URL((await trocar({ sd_sessao: antiga.token, sd_zro_outra: selo })).headers.get("location")!);
    assert.equal(deNovo.pathname + deNovo.search, "/entrar?erro=zro_expirou");
  });

  test("a volta do selo vale: quem estava em /z volta para /z; no celular, /app/", async () => {
    const z = await cenario("zro-volta-z", "/z");
    const r = await trocar({ sd_sessao: z.antiga.token, sd_zro_outra: z.selo });
    assert.equal(new URL(r.headers.get("location")!).pathname, "/z");
    const app = await cenario("zro-volta-app", "/app/");
    const r2 = await trocar({ sd_sessao: app.antiga.token, sd_zro_outra: app.selo });
    assert.equal(new URL(r2.headers.get("location")!).pathname, "/app/");
  });

  test("selo vencido: nada muda", async () => {
    const { antiga, dona } = await cenario("zro-vencido");
    const s = await sessao.autenticar({ cookie: antiga.token });
    const velho = outra.selarOutraConta({ zroSub: "zro-vencido", email: "x@exemplo.com", sessao: s!.sessao.id, volta: "/conta" }, Date.now() - 301_000);
    assert.equal(outra.abrirOutraConta(velho), null);
    const res = await trocar({ sd_sessao: antiga.token, sd_zro_outra: velho });
    assert.equal(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search, "/conta?erro=zro_expirou");
    assert.equal(cookiesDe(res).has("sd_sessao"), false, "nenhuma sessão nova");
    assert.equal((await sessao.autenticar({ cookie: antiga.token }))?.usuario.id, antiga.usuario.id, "continua na conta de antes");
    assert.notEqual(antiga.usuario.id, dona.usuario.id);
  });

  test("selo adulterado, de outro cookie ou forjado com outro sub: nada muda", async () => {
    const { antiga, selo } = await cenario("zro-adulterado");
    const partes = selo!.split(".");
    const meio = partes[2];
    partes[2] = (meio[0] === "A" ? "B" : "A") + meio.slice(1);
    const adulterado = partes.join(".");
    // O cookie do login (sd_zro) tem outra chave de contexto: não abre como selo.
    const doLogin = cookiesDe(await rotaEntrar.GET(pedido(ligar.caminhoLigarZro("/conta"), { cookies: { sd_sessao: antiga.token } }))).get("sd_zro");
    for (const v of [adulterado, doLogin, "v1.abc.def.ghi", "qualquer-coisa"]) {
      assert.equal(outra.abrirOutraConta(v), null);
      const res = await trocar({ sd_sessao: antiga.token, sd_zro_outra: v });
      assert.equal(new URL(res.headers.get("location")!).search, "?erro=zro_expirou");
      assert.equal(cookiesDe(res).has("sd_sessao"), false);
    }
    assert.equal((await sessao.autenticar({ cookie: antiga.token }))?.usuario.id, antiga.usuario.id);
  });

  test("sem selo: nada muda (logado volta com o recado; sem sessão vai para /entrar)", async () => {
    const c = await contaAntiga();
    const res = await trocar({ sd_sessao: c.token });
    assert.equal(new URL(res.headers.get("location")!).search, "?erro=zro_expirou");
    assert.equal((await sessao.autenticar({ cookie: c.token }))?.usuario.id, c.usuario.id);
    const fora = await trocar({});
    assert.equal(new URL(fora.headers.get("location")!).pathname, "/entrar");
  });

  test("o selo é preso à sessão que pediu a ligação: outra sessão (mesmo de outra conta) não usa", async () => {
    const { selo } = await cenario("zro-preso");
    const intrusa = await contaAntiga();
    const res = await trocar({ sd_sessao: intrusa.token, sd_zro_outra: selo });
    assert.equal(new URL(res.headers.get("location")!).search, "?erro=zro_expirou");
    assert.equal(cookiesDe(res).has("sd_sessao"), false);
    assert.equal((await sessao.autenticar({ cookie: intrusa.token }))?.usuario.id, intrusa.usuario.id);
    const semSessao = await trocar({ sd_zro_outra: selo });
    assert.equal(new URL(semSessao.headers.get("location")!).pathname, "/entrar");
  });

  test("CSRF: sem Origin ou de outro site, recusa (403) sem trocar nada; o corpo não escolhe conta", async () => {
    const { antiga, selo } = await cenario("zro-csrf");
    for (const origin of [null, "null", "https://evil.example"]) {
      const res = await trocar({ sd_sessao: antiga.token, sd_zro_outra: selo }, origin);
      assert.equal(res.status, 403);
    }
    assert.equal((await sessao.autenticar({ cookie: antiga.token }))?.usuario.id, antiga.usuario.id);
    // Um zroSub mandado pelo formulário é ignorado: sem selo, nada muda.
    const forjado = await rotaTrocar.POST(
      new Request(new URL("/api/zro/trocar-conta", SITE), {
        method: "POST",
        headers: { host: "localhost:3000", origin: SITE, cookie: `sd_sessao=${antiga.token}`, "content-type": "application/x-www-form-urlencoded" },
        body: "zroSub=zro-csrf",
      }),
    );
    assert.equal(new URL(forjado.headers.get("location")!).search, "?erro=zro_expirou");
  });

  test("a tela só mostra o botão com o selo da própria sessão", async () => {
    const { antiga, selo, pessoa } = await cenario("zro-tela");
    const s = await sessao.autenticar({ cookie: antiga.token });
    assert.deepEqual(outra.outraContaParaTela(selo, s!.sessao.id), { email: pessoa.email });
    assert.equal(outra.outraContaParaTela(selo, "outra-sessao"), null);
    assert.equal(outra.outraContaParaTela(undefined, s!.sessao.id), null);
  });

  test("Absolute ZRO desligada da outra conta nesse meio-tempo: nada muda", async () => {
    const { antiga, selo, dona } = await cenario("zro-desligada");
    const { db, schema } = amb.banco;
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.contasZro).where(eq(schema.contasZro.usuarioId, dona.usuario.id));
    const res = await trocar({ sd_sessao: antiga.token, sd_zro_outra: selo });
    assert.equal(new URL(res.headers.get("location")!).search, "?erro=zro_expirou");
    assert.equal((await sessao.autenticar({ cookie: antiga.token }))?.usuario.id, antiga.usuario.id);
  });
});

describe("Usar outra conta (prompt=login)", () => {
  test("trocar=1 pede prompt=login, no entrar e no ligar; sem ele, nenhum prompt; criar continua create", async () => {
    const pessoa: PessoaZro = { sub: "zro-prompt", email: "prompt@exemplo.com", nome: "P" };
    const entrar = await fluxo({ pessoa, caminho: "/api/zro/entrar?modo=entrar&volta=%2Fconta&trocar=1" });
    assert.equal(zro.estado.ultimoPrompt, "login");
    assert.equal(new URL(entrar.ida.headers.get("location")!).searchParams.get("prompt"), "login");
    assert.ok(entrar.cookies.get("sd_sessao"), "entra como sempre depois de escolher a conta");

    const c = await contaAntiga();
    await fluxo({ pessoa: { sub: "zro-prompt-2", email: "prompt2@exemplo.com", nome: "P" }, sessao: c.token, caminho: ligar.caminhoLigarZro("/conta", true) });
    assert.equal(zro.estado.ultimoPrompt, "login");
    assert.equal(ligar.caminhoLigarZro("/conta", true), "/api/zro/entrar?modo=vincular&volta=%2Fconta&trocar=1");

    await fluxo({ pessoa, caminho: "/api/zro/entrar?modo=entrar&volta=%2Fconta" });
    assert.equal(zro.estado.ultimoPrompt, null);
    const criar = await rotaEntrar.GET(pedido("/api/zro/entrar?modo=criar&trocar=1"));
    assert.equal(new URL(criar.headers.get("location")!).searchParams.get("prompt"), "create");
  });

  test("a Absolute ZRO de antes do Set recusa o escopo: o refazer não pede a conta de novo", async () => {
    zro.estado.recusarEscopoSet = true;
    try {
      zro.estado.proximo = { pessoa: { sub: "zro-prompt-set", email: "set@exemplo.com", nome: "S", produtos: ["sobedesce"] }, negar: false, adulterar: null };
      const ida = await rotaEntrar.GET(pedido("/api/zro/entrar?modo=entrar&volta=%2Fconta&trocar=1"));
      const z = await fetch(ida.headers.get("location")!, { redirect: "manual" });
      const res = await rotaVolta.GET(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { sd_zro: cookiesDe(ida).get("sd_zro") } }));
      const refazer = new URL(res.headers.get("location")!);
      assert.equal(refazer.pathname, "/api/zro/entrar");
      assert.equal(refazer.searchParams.get("trocar"), null, "a pessoa já escolheu a conta na primeira ida");
    } finally {
      zro.estado.recusarEscopoSet = false;
    }
  });
});

describe("as telas", () => {
  const rodar = (script: string, ...args: string[]) =>
    execFileSync(process.execPath, ["--import", "tsx", path.join(raiz, "tests", script), ...args], { cwd: raiz, encoding: "utf8" });

  test("/entrar: Absolute ZRO principal, Usar outra conta, depois Google e e-mail e senha (secundários)", () => {
    const html = rodar("opcoes-entrar-render.mts", "/conta");
    const zroI = html.indexOf(">Entrar com Absolute ZRO<");
    const outraI = html.indexOf(">Usar outra conta<");
    const googleI = html.indexOf(">Entrar com Google<");
    const senhaI = html.indexOf(">Entrar com e-mail e senha<");
    for (const i of [zroI, outraI, googleI, senhaI]) assert.ok(i > 0, html);
    assert.ok(zroI < outraI && outraI < googleI && googleI < senhaI, "a ordem pedida");
    assert.match(html, /<a href="\/api\/zro\/entrar\?modo=entrar&amp;volta=%2Fconta" class="[^"]*bg-primary /, "a principal é a Absolute ZRO");
    assert.match(html, /<a href="\/api\/google\/conectar\?modo=entrar&amp;volta=%2Fconta" class="[^"]*bg-surface /, "Google, secundário");
    assert.match(html, /href="\/api\/zro\/entrar\?modo=entrar&amp;volta=%2Fconta&amp;trocar=1"/);
    assert.equal((html.match(/bg-primary /g) ?? []).length, 1, "uma ação principal só");
    assert.match(html, /<details[^>]*data-entrada="senha"[^>]*>[\s\S]*data-formulario-senha/, "e-mail e senha continuam ali");
    assert.doesNotMatch(html, /<details[^>]*open/, "recolhido até o toque");
    assert.match(rodar("opcoes-entrar-render.mts", "/z", "1"), /<details[^>]*open/, "aberto com erro de senha");
  });

  test("erro com selo: Entrar nessa conta vira a ação principal (POST sem campos) e Usar outra conta fica", () => {
    const html = rodar("ligar-zro-render.mts", "/conta", "zro_outra_conta", "1", "dona@exemplo.com");
    assert.match(html, /role="alert"[\s\S]*já está ligada a outra conta SOBEDESCE/);
    assert.match(html, /<form [^>]*action="\/api\/zro\/trocar-conta" method="post">[\s\S]*<button type="submit" class="[^"]*bg-primary [^"]*">Entrar nessa conta<\/button>/);
    assert.match(html, /dona@exemplo\.com/);
    assert.doesNotMatch(html, /<input/, "o formulário não manda conta nenhuma");
    assert.doesNotMatch(html, />Continuar com Absolute ZRO</, "sem o caminho que cairia no mesmo erro");
    assert.match(html, /trocar=1"[^>]*>Usar outra conta</);
    assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /!/);
  });

  test("erro sem selo (venceu): sem Entrar nessa conta; Continuar e Usar outra conta", () => {
    const html = rodar("ligar-zro-render.mts", "/conta", "zro_outra_conta", "1");
    assert.doesNotMatch(html, /trocar-conta/);
    assert.match(html, />Continuar com Absolute ZRO</);
    assert.match(html, />Usar outra conta</);
  });
});
