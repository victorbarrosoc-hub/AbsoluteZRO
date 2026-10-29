// Drive pelo SOBEDESCE (plano v2 §4.1 e §5, fases 7–10): a ponte do HUB (pedido assinado → o próprio Maestro chama o
// SOBEDESCE), a aba Arquivos só com o SOBEDESCE no plano (403 sem ele, sem nem pedir ao HUB), o token curto que nunca é
// guardado, a estrutura do projeto no Drive, o "qualquer pessoa com o link" ligado ao gerar o link do cliente e
// desligado ao revogar, fechar ou vencer (agendamento com a credencial do Maestro) e as cópias de packages/drive-web.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { CLIENTE, pedido, prepararAmbiente, UUID } from "./ambiente.mts";
import { iniciarPonteFalsa } from "./ponte-falsa.mts";

const amb = await prepararAmbiente("drive_sd");
const ponte = await iniciarPonteFalsa({ cliente: CLIENTE });
process.env.MAESTRO_PONTE_URL = ponte.url;
const { getBanco, schema } = amb.banco;
const { criarSessao, autenticar, COOKIE_SESSAO } = await import("../src/lib/auth/sessao");
const eq = await import("../src/lib/revisao/equipe");
const arquivos = await import("../src/lib/sobedesce/arquivos");
const revisao = await import("../src/lib/sobedesce/revisao");
const ponteLib = await import("../src/lib/sobedesce/ponte");
const rToken = await import("../src/app/api/arquivos/token/route");
const rCron = await import("../src/app/api/cron/revisao/route");

const ANA = UUID();
const EVA = UUID();
let org: string;
let cliente: string;
let projeto: string;
let cookieCom = "";
let cookieSem = "";
type S = NonNullable<Awaited<ReturnType<typeof autenticar>>>;
let ana: S;
let anaSem: S;
let eva: S;

const ESCOPO = "openid email profile org offline_access zro.ia maestro.projects";
async function sessao(sub: string, produtos: string[]) {
  const { token } = await criarSessao({
    orgId: org,
    sub,
    produtos,
    release: { maestro: "allowed" },
    tokens: { at: `at-${sub}`, rt: "rt-teste", atExp: Math.floor(Date.now() / 1000) + 3600, escopo: ESCOPO },
  });
  return { token, s: (await autenticar(token))! };
}

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    const [o] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora Drive" }).returning({ id: schema.organizations.id });
    org = o.id;
    await tx.insert(schema.members).values([
      { orgId: org, zroSub: ANA, role: "admin", displayName: "Ana" },
      { orgId: org, zroSub: EVA, role: "admin", displayName: "Eva" },
    ]);
    const [c] = await tx.insert(schema.clients).values({ orgId: org, name: "Café Aurora" }).returning({ id: schema.clients.id });
    cliente = c.id;
    const [p] = await tx
      .insert(schema.projects)
      .values({ orgId: org, clientId: cliente, code: "MAE-2026-001", title: "Lançamento" })
      .returning({ id: schema.projects.id });
    projeto = p.id;
  });
  const a = await sessao(ANA, ["maestro", "sobedesce"]);
  const b = await sessao(ANA, ["maestro"]);
  const e = await sessao(EVA, ["maestro", "sobedesce"]);
  cookieCom = a.token;
  cookieSem = b.token;
  ana = a.s;
  anaSem = b.s;
  eva = e.s;
  await getBanco().asUser({ sub: ANA, orgId: org }, (tx) =>
    tx.execute(sql`select maestro.card_criar('reelDrive', ${JSON.stringify({ tema: "Reel do Drive", coluna: "revisao", cliente })}::jsonb)`),
  );
});
after(async () => {
  await ponte.fechar();
  await amb.fechar();
});

const token = (cookie: string | null, corpo: unknown = {}) =>
  rToken.POST(pedido("/api/arquivos/token", { corpo, cookies: cookie ? { [COOKIE_SESSAO]: cookie } : {} }));

describe("Arquivos: só com o SOBEDESCE no plano", () => {
  test("o token curto do Drive vem pela ponte do HUB e não é guardado", async () => {
    const r = await token(cookieCom);
    assert.equal(r.status, 200);
    const b = (await r.json()) as Record<string, unknown>;
    assert.match(String(b.token), /^ya29\.falso-/);
    assert.equal(b.api, "https://www.googleapis.com/drive/v3");
    assert.deepEqual(b.conta, { id: "g-equipe", email: "equipe@produtora.test" });
    assert.equal(r.headers.get("cache-control"), "no-store");
    const p = ponte.estado.pedidos.at(-1)!;
    assert.deepEqual([p.acao, p.jeito, p.autorizacao], ["drive.token", "pessoa", `Bearer at-${ANA}`]);
    const guardado = await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select count(*)::int as n from maestro.audit_log where metadata::text like '%ya29%'`),
    );
    assert.equal((guardado as unknown as { n: number }[])[0].n, 0);
  });

  test("sem o SOBEDESCE: 403 e nem pede ao HUB; sem sessão 401; outra origem 403", async () => {
    const antes = ponte.estado.pedidos.length;
    const r = await token(cookieSem);
    assert.equal(r.status, 403);
    assert.equal(((await r.json()) as { erro: string }).erro, "sem_sobedesce");
    assert.equal(ponte.estado.pedidos.length, antes);
    assert.equal((await token(null)).status, 401);
    const fora = await rToken.POST(pedido("/api/arquivos/token", { corpo: {}, cookies: { [COOKIE_SESSAO]: cookieCom }, origin: "https://outro.site" }));
    assert.equal(fora.status, 403);
    assert.equal((await arquivos.criarEstrutura(anaSem, projeto)).ok, false);
  });

  test("o HUB nega (SOBEDESCE fora do plano lá): a resposta é o mesmo 403 honesto", async () => {
    ponte.estado.negar = true;
    try {
      const r = await token(cookieCom);
      assert.equal(r.status, 403);
    } finally {
      ponte.estado.negar = false;
    }
  });

  test("sem Drive conectado no SOBEDESCE: o erro diz onde conectar", async () => {
    ponte.estado.semDrive = true;
    try {
      const r = await token(cookieCom);
      assert.equal(r.status, 409);
      const b = (await r.json()) as { erro: string; mensagem: string };
      assert.equal(b.erro, "sem_drive");
      assert.match(b.mensagem, /SOBEDESCE/);
    } finally {
      ponte.estado.semDrive = false;
    }
  });

  test("Estrutura por projeto: Maestro/<Cliente>/<código título>/5 pastas, idempotente, e liga a pasta", async () => {
    const r1 = await arquivos.criarEstrutura(ana, projeto);
    assert.ok(r1.ok);
    assert.equal(r1.dados.criadas, 8);
    const chamada = ponte.estado.chamadas.at(-1)!;
    assert.deepEqual(chamada.corpo, { cliente: "Café Aurora", projeto: "MAE-2026-001 Lançamento" });
    const r2 = await arquivos.criarEstrutura(ana, projeto);
    assert.ok(r2.ok);
    assert.equal(r2.dados.criadas, 0);
    assert.equal(r2.dados.pasta.id, r1.dados.pasta.id);
    const [p] = await arquivos.projetosComPasta(ana);
    assert.deepEqual(p.pasta, { id: r1.dados.pasta.id, nome: "MAE-2026-001 Lançamento" });
    assert.equal((await arquivos.ligarPasta(ana, projeto, { id: "../x", nome: "x" })).ok, false);
    assert.ok((await arquivos.ligarPasta(ana, projeto, null)).ok);
  });
});

async function compartilhamento(n: number) {
  const [v] = (await getBanco().asSystem("teste", (tx) =>
    tx.execute(sql`select compartilhamento from maestro.versoes where org_id = ${org} and card_id = 'reelDrive' and n = ${n}`),
  )) as unknown as { compartilhamento: Record<string, unknown> | null }[];
  return v.compartilhamento;
}

describe("revisão: o Drive para o cliente enquanto o link vale", () => {
  let lote = "";
  test("gerar o link liga 'qualquer pessoa com o link' na versão do Drive e guarda para desfazer", async () => {
    const ctx = { sub: ANA, orgId: org };
    lote = ((await eq.criarLote(ctx, { clienteId: cliente, titulo: "Semana 44", cards: ["reelDrive"] })) as { id: string }).id;
    assert.ok((await eq.novaVersao(ctx, "reelDrive", "https://drive.google.com/file/d/vid-manifesto123/view", "Corte 1")).ok);
    assert.ok((await eq.gerarLink(ctx, lote, {})).ok);
    const r = await revisao.compartilharLote(ana, lote);
    assert.deepEqual(r, { ligados: 1, falhas: 0, pulado: false });
    assert.equal(ponte.estado.publicos.get("vid-manifesto123")?.length, 1);
    const c = await compartilhamento(1);
    assert.equal(c?.sub, ANA);
    assert.ok(c?.permissao_id);
    // De novo (link trocado): não liga duas vezes.
    await revisao.compartilharLote(ana, lote);
    assert.equal(ponte.estado.publicos.get("vid-manifesto123")?.length, 1);
    assert.deepEqual(await revisao.compartilharLote(anaSem, lote), { ligados: 0, falhas: 0, pulado: true });
  });

  test("versão nova num card com o link ativo também é compartilhada", async () => {
    const ctx = { sub: ANA, orgId: org };
    assert.ok((await eq.novaVersao(ctx, "reelDrive", "https://drive.google.com/file/d/vid-teaser12345/view")).ok);
    assert.equal((await revisao.compartilharVersaoSeComLink(ana, "reelDrive")).ligados, 1);
    assert.ok((await compartilhamento(2))?.permissao_id);
  });

  test("revogar desfaz pela própria pessoa; o de outra pessoa vai pela credencial do Maestro", async () => {
    // A versão 2 foi "ligada" pela Eva (o Drive é dela): quem desliga é ela, sem a sessão dela.
    await getBanco().asSystem("teste", (tx) =>
      tx.execute(
        sql`update maestro.versoes set compartilhamento = jsonb_set(compartilhamento, '{sub}', to_jsonb(${EVA}::text)) where org_id = ${org} and card_id = 'reelDrive' and n = 2`,
      ),
    );
    assert.ok((await eq.revogarLink({ sub: ANA, orgId: org }, lote)).ok);
    const r = await revisao.recolherLote(ana, lote);
    assert.deepEqual(r, { recolhidos: 2, falhas: 0 });
    assert.equal(ponte.estado.publicos.get("vid-manifesto123")?.length, 0);
    assert.equal(ponte.estado.publicos.get("vid-teaser12345")?.length, 0);
    assert.ok((await compartilhamento(1))?.recolhido_em);
    const recolhas = ponte.estado.pedidos.filter((p) => p.acao === "drive.recolher_revisao");
    assert.deepEqual(recolhas.map((p) => `${p.jeito}:${p.sub ?? "-"}`).sort(), ["app:" + EVA, "pessoa:-"]);
    void eva;
  });

  test("link vencido: o agendamento desliga sozinho (só com o CRON_SECRET)", async () => {
    const ctx = { sub: ANA, orgId: org };
    assert.ok((await eq.gerarLink(ctx, lote, {})).ok);
    // Já recolhido antes: compartilhar de novo.
    await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`update maestro.versoes set compartilhamento = null where org_id = ${org} and card_id = 'reelDrive'`),
    );
    assert.equal((await revisao.compartilharLote(ana, lote)).ligados, 2);
    await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`update maestro.approval_links set expires_at = now() - interval '1 minute' where lote_id = ${lote}::uuid`),
    );
    assert.equal((await rCron.GET(pedido("/api/cron/revisao"))).status, 503);
    process.env.CRON_SECRET = "segredo-do-cron-de-teste";
    assert.equal((await rCron.GET(pedido("/api/cron/revisao", { headers: { authorization: "Bearer errado" } }))).status, 401);
    const r = await rCron.GET(pedido("/api/cron/revisao", { headers: { authorization: "Bearer segredo-do-cron-de-teste" } }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { recolhidos: 2, falhas: 0 });
    assert.equal(ponte.estado.publicos.get("vid-manifesto123")?.length, 0);
    assert.ok(ponte.estado.pedidos.filter((p) => p.jeito === "app").every((p) => p.acao === "drive.recolher_revisao"));
    // Nada mais a recolher.
    assert.deepEqual(await revisao.varrerCompartilhamentos(), { recolhidos: 0, falhas: 0 });
  });
});

describe("a ponte", () => {
  test("só aceita a url do SOBEDESCE em https (http só em loopback de teste) e só em /api/zro/drive/", () => {
    assert.ok(ponteLib.urlConfere("https://sobedesce.com/api/zro/drive/listar"));
    assert.ok(ponteLib.urlConfere(`${ponte.url}/api/zro/drive/token`));
    assert.equal(ponteLib.urlConfere("https://sobedesce.com/api/outra"), null);
    assert.equal(ponteLib.urlConfere("https://sobedesce.com/api/zro/drive/listar?x=1"), null);
    assert.equal(ponteLib.urlConfere("http://sobedesce.com/api/zro/drive/listar"), null);
    assert.equal(ponteLib.urlConfere("https://u:s@sobedesce.com/api/zro/drive/listar"), null);
  });
});

describe("packages/drive-web no Maestro", () => {
  const pacote = (f: string) => new URL(`../../../packages/drive-web/src/${f}`, import.meta.url);
  const temPacote = existsSync(pacote("nucleo.js"));
  test("as cópias são idênticas às do pacote", { skip: !temPacote && "fora do monorepo" }, () => {
    for (const f of ["format.js", "format.d.ts", "nucleo.js", "nucleo.d.ts", "stream-pagina.js", "stream-pagina.d.ts"])
      assert.equal(readFileSync(new URL(`../src/lib/drive-web/${f}`, import.meta.url), "utf8"), readFileSync(pacote(f), "utf8"), f);
    assert.equal(readFileSync(new URL("../public/drive-sw.js", import.meta.url), "utf8"), readFileSync(pacote("sw.js"), "utf8"), "drive-sw.js");
  });
});
