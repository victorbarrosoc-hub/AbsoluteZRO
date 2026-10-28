// "Entrar com Absolute ZRO" (api/zro/*) contra uma Absolute ZRO falsa: entra e vira membro da organização com o papel
// da tabela fixa, sem acesso cai em /sem-acesso, /eu relê o perfil e os produtos, sai, renova o token, e recusa
// state errado, nonce/aud/emissor/assinatura adulterados, cookie adulterado, volta para fora do site e sessão forjada.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import { ESCOPOS_BASICOS, ESCOPOS_COMPLETOS, type PessoaZro } from "./zro-falso.mts";

const amb = await prepararAmbiente("zro");
const { zro, banco } = amb;
const rotas = await import("../src/lib/zro/rotas");
const { schema } = banco;

const ORG_LIA = { id: UUID(), name: "Produtora Lia", role: "owner" };
const LIA: PessoaZro = { sub: UUID(), email: "Lia@Produtora.exemplo", nome: "Lia Produtora", org: ORG_LIA, produtos: ["maestro", "sobedesce"] };
const MAX: PessoaZro = { sub: UUID(), email: "max@produtora.exemplo", nome: "Max Editor", org: { ...ORG_LIA, role: "editor" }, produtos: ["maestro"] };

before(() => undefined);
after(() => amb.fechar());

/** Navegador: /api/zro/entrar → Absolute ZRO falsa → /api/zro/callback. */
async function fluxo({
  pessoa = LIA,
  volta,
  criar = false,
  adulterar = null,
  negar = false,
  trocarState = false,
  mexerNaIda = null,
}: {
  pessoa?: PessoaZro;
  volta?: string;
  criar?: boolean;
  adulterar?: null | "nonce" | "aud" | "assinatura" | "emissor";
  negar?: boolean;
  trocarState?: boolean;
  mexerNaIda?: null | ((c: string) => string);
} = {}) {
  Object.assign(zro.estado.proximo, { pessoa, adulterar, negar });
  const q = new URLSearchParams();
  if (volta !== undefined) q.set("volta", volta);
  if (criar) q.set("modo", "criar");
  const ida = await rotas.entrar(pedido(`/api/zro/entrar${q.size ? `?${q}` : ""}`));
  assert.equal(ida.status, 302);
  const u = new URL(ida.headers.get("location")!);
  assert.equal(u.origin, zro.url);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("redirect_uri"), `${SITE}/api/zro/callback`);
  assert.ok(u.searchParams.get("nonce"));
  const setCookie = ida.headers.getSetCookie()[0];
  for (const a of ["HttpOnly", "SameSite=Lax", "Path=/api/zro", "Max-Age=600"]) assert.ok(setCookie.includes(a), `cookie da ida com ${a}`);
  let maeZro = cookiesDe(ida).get("mae_zro")!;
  if (mexerNaIda) maeZro = mexerNaIda(maeZro);
  const z = await fetch(u, { redirect: "manual" });
  let vem = z.headers.get("location")!;
  if (trocarState) vem = vem.replace(/state=[^&]+/, "state=outro");
  const res = await rotas.callback(pedido(vem.replace(SITE, ""), { cookies: { mae_zro: maeZro } }));
  assert.equal(res.status, 303);
  const c = cookiesDe(res);
  assert.equal(c.get("mae_zro"), "", "o cookie da ida é apagado na volta");
  const destino = new URL(res.headers.get("location")!);
  return { res, destino: destino.pathname + destino.search, sessao: c.get("mae_sessao") };
}

const eu = (sessao: string | undefined) => rotas.eu(pedido("/api/zro/eu", { cookies: { mae_sessao: sessao } }));

/** Faz a releitura do perfil valer agora (o /eu relê no máximo uma vez por minuto). */
async function envelhecerPerfil(sessao: string) {
  const { hashToken } = await import("../src/lib/auth/cripto");
  await banco.getBanco().asSystem("teste", (tx) =>
    tx
      .update(schema.sessions)
      .set({ perfilLidoEm: new Date(Date.now() - 120_000) })
      .where(eq(schema.sessions.tokenHash, hashToken(sessao))),
  );
}

describe("entrar", () => {
  test("entra, vira membro admin da organização e /eu mostra a pessoa com acesso", async () => {
    const r = await fluxo({ volta: "/app/quadro" });
    assert.equal(r.destino, "/app/quadro");
    assert.ok(r.sessao);
    assert.equal(zro.estado.ultimoEscopo, ESCOPOS_COMPLETOS);
    assert.equal(zro.estado.ultimoPrompt, null, "entrar não pede cadastro");
    const cab = r.res.headers.getSetCookie().find((c) => c.startsWith("mae_sessao="))!;
    for (const a of ["HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${30 * 24 * 3600}`]) assert.ok(cab.includes(a), `sessão com ${a}`);
    assert.ok(!/zat_|zrt_|id_token/.test(r.sessao!), "nenhum token da Absolute ZRO no cookie");
    const e = await eu(r.sessao);
    assert.equal(e.status, 200);
    assert.equal(e.headers.get("cache-control"), "no-store");
    const j = await e.json();
    assert.equal(j.acesso, true);
    assert.deepEqual(j.pessoa, { nome: "Lia Produtora", email: "lia@produtora.exemplo", foto: null, conta: `${zro.url}/perfil` });
    assert.deepEqual(j.organizacao, { nome: "Produtora Lia", papel: "admin", papel_nome: "Administração", hub_role: "owner" });
    assert.deepEqual(j.produtos, ["maestro", "sobedesce"]);
    const [org] = await banco.getBanco().asSystem("teste", (tx) => tx.select().from(schema.organizations).where(eq(schema.organizations.zroOrgId, ORG_LIA.id)));
    assert.equal(org.name, "Produtora Lia");
    const [m] = await banco.getBanco().asSystem("teste", (tx) => tx.select().from(schema.members).where(eq(schema.members.zroSub, LIA.sub)));
    assert.equal(m.role, "admin");
    assert.equal(m.hubRole, "owner");
    const auditoria = await banco.getBanco().asSystem("teste", (tx) => tx.select().from(schema.auditLog).where(eq(schema.auditLog.orgId, org.id)));
    assert.ok(auditoria.some((a) => a.action === "membro.entrou"));
  });

  test("sem volta: cai na Z (primeira aba)", async () => {
    const r = await fluxo();
    assert.equal(r.destino, "/app/z");
  });

  test("Criar conta manda prompt=create e entra do mesmo jeito", async () => {
    const r = await fluxo({ criar: true, volta: "/app/z" });
    assert.equal(zro.estado.ultimoPrompt, "create");
    assert.equal(r.destino, "/app/z");
  });

  test("papel reaplicado a cada login pela tabela fixa (editor → equipe, depois manager → gestor)", async () => {
    await fluxo({ pessoa: MAX });
    let [m] = await banco.getBanco().asSystem("teste", (tx) => tx.select().from(schema.members).where(eq(schema.members.zroSub, MAX.sub)));
    assert.equal(m.role, "equipe");
    await fluxo({ pessoa: { ...MAX, org: { ...ORG_LIA, role: "manager" } } });
    [m] = await banco.getBanco().asSystem("teste", (tx) => tx.select().from(schema.members).where(eq(schema.members.zroSub, MAX.sub)));
    assert.equal(m.role, "gestor");
    assert.equal(m.hubRole, "manager");
    const membros = await banco.getBanco().asSystem("teste", (tx) => tx.select().from(schema.members).where(eq(schema.members.zroSub, MAX.sub)));
    assert.equal(membros.length, 1, "uma pessoa, um vínculo por organização");
  });

  test("sem organização na Absolute ZRO: não há onde entrar", async () => {
    const r = await fluxo({ pessoa: { ...LIA, sub: UUID(), org: null } });
    assert.equal(r.destino, "/entrar?erro=zro_sem_org");
    assert.equal(r.sessao, undefined);
  });

  test("volta para fora do site é recusada", async () => {
    for (const v of ["https://mal.exemplo/roubo", "//mal.exemplo/x", "/\\mal.exemplo", "javascript:alert(1)"]) {
      const r = await fluxo({ volta: v });
      assert.equal(r.destino, "/app/z", v);
    }
  });

  test("pessoa recusou na Absolute ZRO: volta sem sessão", async () => {
    const r = await fluxo({ negar: true, volta: "/app/clientes" });
    assert.equal(r.destino, "/entrar?erro=zro_recusado&volta=%2Fapp%2Fclientes");
    assert.equal(r.sessao, undefined);
  });

  test("Absolute ZRO sem os escopos extras: refaz só com os básicos e entra", async () => {
    zro.estado.recusarEscoposExtras = true;
    try {
      Object.assign(zro.estado.proximo, { pessoa: LIA, adulterar: null, negar: false });
      const ida = await rotas.entrar(pedido("/api/zro/entrar?volta=/app/z"));
      const u = new URL(ida.headers.get("location")!);
      const z = await fetch(u, { redirect: "manual" });
      const volta = await rotas.callback(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida).get("mae_zro") } }));
      assert.equal(volta.status, 303);
      const denovo = new URL(volta.headers.get("location")!);
      assert.equal(denovo.pathname, "/api/zro/entrar");
      assert.equal(denovo.searchParams.get("basico"), "1");
      const ida2 = await rotas.entrar(pedido(denovo.pathname + denovo.search));
      const u2 = new URL(ida2.headers.get("location")!);
      assert.equal(u2.searchParams.get("scope"), ESCOPOS_BASICOS);
      const z2 = await fetch(u2, { redirect: "manual" });
      const fim = await rotas.callback(pedido(z2.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida2).get("mae_zro") } }));
      assert.equal(new URL(fim.headers.get("location")!).pathname, "/app/z");
    } finally {
      zro.estado.recusarEscoposExtras = false;
    }
  });

  test("state errado, token adulterado e cookie mexido são recusados", async () => {
    const casos: Parameters<typeof fluxo>[0][] = [
      { trocarState: true },
      { adulterar: "nonce" },
      { adulterar: "aud" },
      { adulterar: "emissor" },
      { adulterar: "assinatura" },
      { mexerNaIda: (c) => c.slice(0, -4) + "AAAA" },
    ];
    for (const caso of casos) {
      const r = await fluxo(caso);
      assert.match(r.destino, /^\/entrar\?erro=zro_(expirou|erro)/, JSON.stringify(caso));
      assert.equal(r.sessao, undefined, JSON.stringify(caso));
    }
  });

  test("callback sem o cookie da ida", async () => {
    const r = await rotas.callback(pedido("/api/zro/callback?code=x&state=y"));
    assert.equal(r.status, 303);
    assert.equal(new URL(r.headers.get("location")!).search, "?erro=zro_expirou");
  });
});

describe("sem acesso", () => {
  test("organização sem o Maestro: a sessão nasce, cai em /sem-acesso e /eu diz acesso false", async () => {
    const semMaestro: PessoaZro = {
      sub: UUID(),
      email: "nina@outra.exemplo",
      nome: "Nina",
      org: { id: UUID(), name: "Outra Agência", role: "owner" },
      produtos: ["sobedesce"],
    };
    const r = await fluxo({ pessoa: semMaestro, volta: "/app/quadro" });
    assert.equal(r.destino, "/sem-acesso");
    assert.ok(r.sessao);
    const e = await eu(r.sessao);
    assert.equal(e.status, 200);
    const j = await e.json();
    assert.equal(j.acesso, false);
    assert.equal(j.ferramentas, "https://absolutezro.com/ferramentas");
    // O console da Absolute ZRO liberou o Maestro: o /eu relê e o acesso passa a valer, sem novo login.
    zro.contas.set(semMaestro.sub, { ...semMaestro, produtos: ["sobedesce", "maestro"] });
    await envelhecerPerfil(r.sessao!);
    const antes = zro.estado.userinfos;
    const e2 = await eu(r.sessao);
    assert.equal(zro.estado.userinfos, antes + 1, "releu o perfil");
    assert.equal((await e2.json()).acesso, true);
    // E o contrário também: tirou o produto, perde o acesso na próxima releitura.
    zro.contas.set(semMaestro.sub, { ...semMaestro, produtos: [] });
    await envelhecerPerfil(r.sessao!);
    assert.equal((await (await eu(r.sessao)).json()).acesso, false);
  });
});

describe("gate de lançamento (zro_release)", () => {
  test("closed ou sem a claim: sem acesso mesmo com o produto; o /eu relê e segue a claim nova", async () => {
    const fechada: PessoaZro = {
      sub: UUID(),
      email: "teo@gate.exemplo",
      nome: "Teo",
      org: { id: UUID(), name: "Agência do Gate", role: "owner" },
      produtos: ["maestro"],
      release: { maestro: "closed" },
    };
    const r = await fluxo({ pessoa: fechada, volta: "/app/quadro" });
    assert.equal(r.destino, "/sem-acesso");
    assert.equal((await (await eu(r.sessao)).json()).acesso, false);
    // Liberado só para esta conta enquanto fechado: entra na próxima releitura.
    zro.contas.set(fechada.sub, { ...fechada, release: { maestro: "allowed" } });
    await envelhecerPerfil(r.sessao!);
    assert.equal((await (await eu(r.sessao)).json()).acesso, true);
    // HUB sem a claim: fechado (deny-by-default).
    zro.contas.set(fechada.sub, { ...fechada, release: null });
    await envelhecerPerfil(r.sessao!);
    assert.equal((await (await eu(r.sessao)).json()).acesso, false);
    // Aberto ao público (teste aberto): volta.
    zro.contas.set(fechada.sub, { ...fechada, release: { maestro: "released" } });
    await envelhecerPerfil(r.sessao!);
    assert.equal((await (await eu(r.sessao)).json()).acesso, true);
  });
});

describe("perfil único e renovação", () => {
  test("nome e e-mail mudados na conta Absolute ZRO aparecem no /eu; dentro de um minuto não relê", async () => {
    const r = await fluxo();
    const FOTO = "https://absolutezro.com/api/v1/foto/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
    zro.contas.set(LIA.sub, { ...LIA, nome: "Lia P. Produtora", foto: FOTO });
    const antes = zro.estado.userinfos;
    assert.equal((await (await eu(r.sessao)).json()).pessoa.nome, "Lia Produtora", "acabou de entrar: não relê");
    assert.equal(zro.estado.userinfos, antes);
    await envelhecerPerfil(r.sessao!);
    const j = await (await eu(r.sessao)).json();
    assert.equal(j.pessoa.nome, "Lia P. Produtora");
    assert.equal(j.pessoa.foto, FOTO);
    zro.contas.set(LIA.sub, LIA);
  });

  test("access token vencido: renova com o refresh token (que roda) e segue", async () => {
    zro.estado.vidaAcesso = 0;
    try {
      const r = await fluxo();
      await envelhecerPerfil(r.sessao!);
      const antes = zro.estado.renovacoes;
      const e = await eu(r.sessao);
      assert.equal(e.status, 200);
      assert.equal(zro.estado.renovacoes, antes + 1);
    } finally {
      zro.estado.vidaAcesso = 600;
    }
  });

  test("Absolute ZRO recusou a renovação (acesso do app removido): a sessão acaba", async () => {
    zro.estado.vidaAcesso = 0;
    const r = await fluxo();
    zro.estado.vidaAcesso = 600;
    zro.estado.recusarRefresh = true;
    try {
      await envelhecerPerfil(r.sessao!);
      const e = await eu(r.sessao);
      assert.equal(e.status, 401);
      assert.equal(cookiesDe(e).get("mae_sessao"), "", "cookie apagado");
      assert.equal((await eu(r.sessao)).status, 401, "sessão encerrada de vez");
    } finally {
      zro.estado.recusarRefresh = false;
    }
  });

  test("Absolute ZRO fora do ar: vale a última cópia", async () => {
    const r = await fluxo();
    await envelhecerPerfil(r.sessao!);
    zro.estado.fora = true;
    try {
      const e = await eu(r.sessao);
      assert.equal(e.status, 200);
      assert.equal((await e.json()).acesso, true);
    } finally {
      zro.estado.fora = false;
    }
  });
});

describe("sair e sessão", () => {
  test("sair encerra a sessão, apaga o cookie e revoga o refresh token na Absolute ZRO", async () => {
    const r = await fluxo();
    const antes = zro.estado.revogados;
    const s = await rotas.sair(pedido("/api/zro/sair", { method: "POST", cookies: { mae_sessao: r.sessao } }));
    assert.equal(s.status, 303);
    assert.equal(new URL(s.headers.get("location")!).pathname, "/");
    assert.equal(cookiesDe(s).get("mae_sessao"), "");
    assert.equal(zro.estado.revogados, antes + 1);
    assert.equal((await eu(r.sessao)).status, 401);
  });

  test("sair por POST de outra origem é recusado", async () => {
    const r = await fluxo();
    const s = await rotas.sair(pedido("/api/zro/sair", { method: "POST", cookies: { mae_sessao: r.sessao }, origin: "https://mal.exemplo" }));
    assert.equal(s.status, 403);
    assert.equal((await eu(r.sessao)).status, 200, "a sessão continua");
  });

  test("rotas de dados negam sem sessão e com sessão forjada", async () => {
    assert.equal((await eu(undefined)).status, 401);
    assert.equal((await eu("sessao-inventada")).status, 401);
    const r = await fluxo();
    assert.equal((await eu(r.sessao!.slice(0, -2) + "zz")).status, 401);
  });

  test("sessão vencida não entra", async () => {
    const r = await fluxo();
    const { hashToken } = await import("../src/lib/auth/cripto");
    await banco.getBanco().asSystem("teste", (tx) =>
      tx
        .update(schema.sessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.sessions.tokenHash, hashToken(r.sessao!))),
    );
    assert.equal((await eu(r.sessao)).status, 401);
  });
});
