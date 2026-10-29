// Pessoas da Absolute ZRO (ADR 0029 do HUB, drizzle/0022): o @ que vem no login (preferred_username), a busca e o
// convite pela API do HUB (escopo zro.pessoas; sem o escopo, "entre de novo"), nenhum e-mail aceito do HUB, o freela
// achado pelo @ (ligado pelo zro_sub, um por organização, isolado entre organizações, leitura não adiciona) e a função
// na produtora (só administração). Contra o HUB falso (tests/ponte-falsa.mts).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente, UUID } from "./ambiente.mts";
import { iniciarPonteFalsa } from "./ponte-falsa.mts";

const amb = await prepararAmbiente("pessoas_zro");
const ponte = await iniciarPonteFalsa();
process.env.MAESTRO_PONTE_URL = ponte.url;
const { getBanco, schema } = amb.banco;
const { criarSessao, autenticar } = await import("../src/lib/auth/sessao");
const zp = await import("../src/lib/zro/pessoas");
const daZro = await import("../src/lib/freelas/da-zro");
const pessoas = await import("../src/lib/pessoas");
const { perfilDeClaims } = await import("../src/lib/zro/oidc");
const { entrarNaOrganizacao } = await import("../src/lib/zro/contas");

const ANA = UUID();
const GIL = UUID();
const LEO = UUID();
const OUTRA = UUID();
let org: string;
let org2: string;
const COMPLETO = "openid email profile org offline_access zro.ia maestro.projects zro.agenda zro.pessoas";
const SEM = "openid email profile org offline_access zro.ia maestro.projects zro.agenda";

async function sessao(sub: string, orgId: string, escopo = COMPLETO) {
  const { token } = await criarSessao({
    orgId,
    sub,
    produtos: ["maestro"],
    release: { maestro: "allowed" },
    tokens: { at: `at-${sub}`, rt: "rt-teste", atExp: Math.floor(Date.now() / 1000) + 24 * 3600, escopo },
  });
  return (await autenticar(token))!;
}

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    const [o] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora Pessoas" }).returning({ id: schema.organizations.id });
    const [o2] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Outra Produtora" }).returning({ id: schema.organizations.id });
    org = o.id;
    org2 = o2.id;
    await tx.insert(schema.members).values([
      { orgId: org, zroSub: ANA, role: "admin", displayName: "Ana" },
      { orgId: org, zroSub: GIL, role: "gestor", displayName: "Gil" },
      { orgId: org, zroSub: LEO, role: "leitura", displayName: "Leo" },
      { orgId: org2, zroSub: OUTRA, role: "admin", displayName: "Outra" },
    ]);
  });
});
after(async () => {
  await ponte.fechar();
  await amb.fechar();
});

describe("o @ no login", () => {
  test("preferred_username vira o @ do membro; formato estranho é ignorado", async () => {
    const base = { sub: UUID(), email: "x@y.test", zro_org: { id: UUID(), name: "Org do Login", role: "editor" }, zro_products: ["maestro"] };
    assert.equal(perfilDeClaims({ ...base, preferred_username: "carla.drone" }).arroba, "carla.drone");
    assert.equal(perfilDeClaims({ ...base, preferred_username: "Carla Drone!" }).arroba, null);
    const p = perfilDeClaims({ ...base, preferred_username: "lia.som" });
    const e = (await entrarNaOrganizacao(p))!;
    const [m] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select zro_arroba from maestro.members where org_id = ${e.orgId} and zro_sub = ${p.sub}`),
    )) as unknown as { zro_arroba: string }[];
    assert.equal(m.zro_arroba, "lia.som");
  });
});

describe("API de pessoas do HUB", () => {
  test("busca por @ e nome só traz visíveis, sem e-mail, e confere o formato", async () => {
    const s = await sessao(ANA, org);
    const r = await zp.buscarPessoas(s.id, "@carla");
    assert.ok(r.ok);
    assert.deepEqual(
      r.pessoas.map((p) => p.arroba),
      ["carla.drone"],
    );
    const porNome = await zp.buscarPessoas(s.id, "luana");
    assert.ok(porNome.ok && porNome.pessoas[0].funcoes.some((f) => f.nome === "Microfonista"));
    const escondida = await zp.buscarPessoas(s.id, "@oculta");
    assert.ok(escondida.ok && escondida.pessoas.length === 0);
    assert.deepEqual(await zp.buscarPessoas(s.id, "c"), { ok: true, pessoas: [] });
    // O que vier a mais do HUB é jogado fora (e-mail, telefone).
    const p = zp.pessoaDoHub({ id: UUID(), arroba: "ok.ok", nome: "X", email: "x@y.z", telefone: "84999999999", funcoes: [] })!;
    assert.equal(JSON.stringify(p).includes("@y.z"), false);
    assert.equal(JSON.stringify(p).includes("8499"), false);
    assert.equal(zp.pessoaDoHub({ id: "nao-uuid", arroba: "ok.ok" }), null);
  });

  test("sem o escopo zro.pessoas na sessão: pede para entrar de novo, sem chamar o HUB", async () => {
    const s = await sessao(GIL, org, SEM);
    const r = await zp.buscarPessoas(s.id, "@carla");
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.estado, "reconectar_zro");
  });

  test("convite pelo @ vai com o papel traduzido; repetido é conflito; escondido não acha", async () => {
    const s = await sessao(ANA, org);
    const r = await zp.convidarPessoa(s.id, "@rafa.edita", "gestor");
    assert.ok(r.ok);
    assert.deepEqual(ponte.estado.pessoasZro.convites.at(-1), { arroba: "rafa.edita", papel: "manager" });
    const de = await zp.convidarPessoa(s.id, "rafa.edita", "equipe");
    assert.equal(!de.ok && de.estado, "conflito");
    const esc = await zp.convidarPessoa(s.id, "oculta.pessoa", "equipe");
    assert.equal(!esc.ok && esc.estado, "nao_achou");
    assert.equal((await zp.pessoaPorArroba(s.id, "@oculta.pessoa")).ok, false);
  });
});

describe("freela achado pelo @", () => {
  test("entra ligado ao perfil (zro_sub + @), com funções do Maestro; de novo não duplica", async () => {
    assert.deepEqual(
      daZro.funcoesDoPerfil([
        { chave: "camera", nome: "Câmera" },
        { chave: "drone", nome: "Drone" },
        { chave: "direcao", nome: "Direção" },
        { chave: "outra", nome: "steadicam" },
      ]),
      ["captacao-camera", "drone", "Direção", "Steadicam"],
    );
    const s = await sessao(GIL, org);
    const p = await zp.pessoaPorArroba(s.id, "carla.drone");
    assert.ok(p.ok);
    const r = await daZro.adicionarFreelaDaZro({ sub: GIL, orgId: org }, p.pessoa);
    assert.ok(r.ok && r.novo);
    const de = await daZro.adicionarFreelaDaZro({ sub: GIL, orgId: org }, p.pessoa);
    assert.ok(de.ok && !de.novo && de.id === (r.ok ? r.id : ""));
    const [f] = (await getBanco().asUser({ sub: GIL, orgId: org }, (tx) =>
      tx.execute(sql`select nome, cidade, funcoes, zro_sub::text, zro_arroba, email from maestro.freelas where id = ${r.ok ? r.id : ""}`),
    )) as unknown as Record<string, unknown>[];
    assert.deepEqual(f, {
      nome: "Carla Nunes",
      cidade: "Natal",
      funcoes: ["captacao-camera", "drone"],
      zro_sub: p.pessoa.id,
      zro_arroba: "carla.drone",
      email: null,
    });
    // Outra organização: o mesmo perfil vira outro freela, e uma não vê o da outra.
    const r2 = await daZro.adicionarFreelaDaZro({ sub: OUTRA, orgId: org2 }, p.pessoa);
    assert.ok(r2.ok && r2.novo);
    const vistos = (await getBanco().asUser({ sub: OUTRA, orgId: org2 }, (tx) => tx.execute(sql`select id from maestro.freelas`))) as unknown as {
      id: string;
    }[];
    assert.deepEqual(
      vistos.map((x) => x.id),
      [r2.ok ? r2.id : ""],
    );
    // Leitura não adiciona.
    const s2 = await sessao(LEO, org);
    const lu = await zp.pessoaPorArroba(s2.id, "lu.som");
    assert.ok(lu.ok);
    const neg = await daZro.adicionarFreelaDaZro({ sub: LEO, orgId: org }, lu.pessoa);
    assert.equal(neg.ok, false);
  });
});

describe("função na produtora", () => {
  test("só administração muda; não mexe no papel", async () => {
    assert.equal((await pessoas.salvarFuncaoNaProdutora({ sub: ANA, orgId: org }, GIL, "Editor")).ok, true);
    const neg = await pessoas.salvarFuncaoNaProdutora({ sub: GIL, orgId: org }, ANA, "Sócio");
    assert.equal(neg.ok, false);
    const lista = await pessoas.listarPessoas({ sub: ANA, orgId: org });
    const gil = lista.find((p) => p.sub === GIL)!;
    assert.equal(gil.funcao, "Editor");
    assert.equal(gil.papel, "gestor");
    assert.equal(lista.find((p) => p.sub === ANA)!.funcao, null);
    assert.equal((await pessoas.salvarFuncaoNaProdutora({ sub: ANA, orgId: org }, GIL, "x".repeat(41))).ok, false);
    // de outra organização, nada muda
    assert.equal((await pessoas.salvarFuncaoNaProdutora({ sub: OUTRA, orgId: org2 }, GIL, "Invasor")).ok, false);
  });
});
