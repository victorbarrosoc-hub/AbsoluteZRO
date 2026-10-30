// O freela entra no banco pela conta Absolute ZRO (drizzle/0036): o @ no cadastro (perfil relido no HUB, ligado pelo
// zro_sub, a mesma conta não entra duas vezes, desligar), o convite do avulso (idempotente, um aberto por freela, 7 dias,
// revogável, só quem escreve, duas organizações, hash ilegível), a porta estreita (só o primeiro nome e a marca saem;
// aceitar liga uma vez, mesma conta = ok, outra conta = morto, vencido e revogado = morto, conta em outro freela), a rota
// pública (Origin, sem identidade = 401) e a volta do login do convite (só a identidade, sem sessão nem organização no
// Maestro, escopos básicos, refresh token devolvido). Contra a Absolute ZRO e o HUB falsos.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import { iniciarPonteFalsa } from "./ponte-falsa.mts";
import type { PessoaZro as PessoaFalsa } from "./zro-falso.mts";

const amb = await prepararAmbiente("freela_convite");
const ponte = await iniciarPonteFalsa();
process.env.MAESTRO_PONTE_URL = ponte.url;
const { getBanco, schema, codigoPg, PG } = amb.banco;
const cv = await import("../src/lib/freelas/convite-servidor");
const puro = await import("../src/lib/freelas/convite");
const fr = await import("../src/lib/freelas/servidor");
const zp = await import("../src/lib/zro/pessoas");
const idt = await import("../src/lib/zro/identidade");
const rotas = await import("../src/lib/zro/rotas");
const publico = await import("../src/lib/publico/rotas");
const { criarSessao, autenticar } = await import("../src/lib/auth/sessao");

const ANA = UUID(); // admin
const TEO = UUID(); // equipe
const LEO = UUID(); // leitura
const BIA = UUID(); // admin da outra produtora
const CARLA = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a01"; // @carla.drone no HUB falso
let org: string;
let org2: string;
const ctx = (sub: string, o = org) => ({ sub, orgId: o });
const IP = "203.0.113.9";

const erroDe = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  assert.fail("devia falhar");
};
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.ok(r.ok, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const tokenDe = (url: string) => url.split("/convite/")[1];
const entrada = (nome: string) => {
  const v = fr.validarFreela({ nome, whatsapp: "11 98888-7777", email: "freela@exemplo.com" });
  assert.ok(v.ok);
  return v.entrada;
};
async function novoFreela(nome: string, o = org, sub = ANA) {
  return ok(await fr.salvarFreela(ctx(sub, o), entrada(nome))).id;
}
async function linha(freela: string) {
  const [f] = (await getBanco().asSystem("teste", (tx) =>
    tx.execute(sql`select zro_sub, zro_arroba from maestro.freelas where id = ${freela}`),
  )) as unknown as { zro_sub: string | null; zro_arroba: string | null }[];
  return f;
}
async function sessaoCom(sub: string, o = org) {
  const { token } = await criarSessao({
    orgId: o,
    sub,
    produtos: ["maestro"],
    release: { maestro: "allowed" },
    tokens: { at: `at-${sub}`, rt: "rt-teste", atExp: Math.floor(Date.now() / 1000) + 3600, escopo: "openid zro.pessoas" },
  });
  return (await autenticar(token))!;
}

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    const [o] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora Convite" }).returning({ id: schema.organizations.id });
    const [o2] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Outra" }).returning({ id: schema.organizations.id });
    org = o.id;
    org2 = o2.id;
    await tx.insert(schema.members).values([
      { orgId: org, zroSub: ANA, role: "admin", displayName: "Ana" },
      { orgId: org, zroSub: TEO, role: "equipe", displayName: "Téo" },
      { orgId: org, zroSub: LEO, role: "leitura", displayName: "Leo" },
      { orgId: org2, zroSub: BIA, role: "admin", displayName: "Bia" },
    ]);
  });
});
after(async () => {
  await ponte.fechar();
  await amb.fechar();
});

describe("o puro", () => {
  test("endereço, caminho e a mensagem do WhatsApp com o link", () => {
    const t = "a".repeat(43);
    assert.equal(puro.enderecoDoConvite("https://maestro.absolutezro.com/", t), `https://maestro.absolutezro.com/convite/${t}`);
    assert.ok(puro.ehCaminhoDeConvite(`/convite/${t}`));
    assert.ok(!puro.ehCaminhoDeConvite(`/convite/${t}/x`));
    assert.ok(!puro.ehTokenConvite("curto"));
    const texto = puro.textoDoConvite("Oi, {nome}! Aqui é da {produtora}.", "Carla Nunes", "Lumen", "https://m/convite/x");
    assert.equal(texto, "Oi, Carla! Aqui é da Lumen.\n\nEntre no nosso banco de freelas com a sua conta Absolute ZRO: https://m/convite/x");
    assert.equal(puro.linkDoWhatsapp("5511988887777", "oi e"), "https://wa.me/5511988887777?text=oi%20e");
    assert.equal(puro.linkDoWhatsapp(null, "oi"), null);
  });
});

describe("o @ no cadastro", () => {
  test("liga pela conta do perfil relido no HUB; a mesma conta não entra em dois freelas; desligar", async () => {
    const s = await sessaoCom(ANA);
    const p = await zp.pessoaPorArroba(s.id, "@carla.drone");
    assert.ok(p.ok);
    const id = ok(await fr.salvarFreela(ctx(ANA), entrada("Carla N."), undefined, false, { pessoa: p.pessoa })).id;
    assert.deepEqual(await linha(id), { zro_sub: CARLA, zro_arroba: "carla.drone" });
    // outro freela com a mesma conta: recusa e nada do salvar fica
    const r = await fr.salvarFreela(ctx(ANA), entrada("Carla de novo"), undefined, false, { pessoa: p.pessoa });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.erros!.zro_arroba, /@carla\.drone já está no banco como Carla N\./);
    const [{ n }] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select count(*)::int as n from maestro.freelas where nome = 'Carla de novo'`),
    )) as unknown as { n: number }[];
    assert.equal(n, 0);
    // salvar de novo sem mudar a conta não duplica; desligar tira o vínculo
    ok(await fr.salvarFreela(ctx(ANA), entrada("Carla N."), id, false, { pessoa: p.pessoa }));
    ok(await fr.salvarFreela(ctx(ANA), entrada("Carla N."), id, false, { desligar: true }));
    assert.deepEqual(await linha(id), { zro_sub: null, zro_arroba: null });
    // escondido e inexistente: a mesma resposta do HUB
    const a = await zp.pessoaPorArroba(s.id, "oculta.pessoa");
    const b = await zp.pessoaPorArroba(s.id, "ninguem.aqui");
    assert.deepEqual(a, b);
  });
});

describe("o convite (equipe)", () => {
  test("idempotente, um aberto por freela, 7 dias, hash ilegível, só revogar muda", async () => {
    const f = await novoFreela("Rafa Avulso");
    const a = ok(await cv.convidarFreela(ctx(ANA), f, SITE));
    const b = ok(await cv.convidarFreela(ctx(TEO), f, SITE));
    assert.equal(a.novo, true);
    assert.equal(b.novo, false);
    assert.equal(a.url, b.url, "duas vezes = o mesmo link");
    assert.ok(a.url.startsWith(`${SITE}/convite/`));
    const dias = (Date.parse(a.expira) - Date.now()) / 86_400_000;
    assert.ok(dias > 6.9 && dias <= 7.01, `${dias}`);
    // em paralelo: um só aberto
    const f2 = await novoFreela("Paralelo");
    const juntos = await Promise.all([cv.convidarFreela(ctx(ANA), f2, SITE), cv.convidarFreela(ctx(ANA), f2, SITE)]);
    assert.equal(ok(juntos[0]).url, ok(juntos[1]).url);
    const [{ n }] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select count(*)::int as n from maestro.freela_convites where freela_id = ${f2}`),
    )) as unknown as { n: number }[];
    assert.equal(n, 1);
    // a ficha: estado e link só para quem escreve
    assert.deepEqual(await cv.contaDoFreela(ctx(ANA), f, SITE, true), { estado: "convidado", expira: a.expira, url: a.url });
    assert.deepEqual(await cv.contaDoFreela(ctx(LEO), f, SITE, false), { estado: "convidado", expira: a.expira, url: null });
    // o hash não se lê; aceite, validade e apagar não mudam pelo app
    assert.equal(
      codigoPg(await erroDe(getBanco().asUser(ctx(ANA), (tx) => tx.execute(sql`select token_hash from maestro.freela_convites`)))),
      PG.semPrivilegio,
    );
    for (const q of [
      sql`update maestro.freela_convites set aceito_em = now(), aceito_sub = ${ANA}::uuid`,
      sql`update maestro.freela_convites set expira_em = now() + interval '20 days'`,
      sql`delete from maestro.freela_convites`,
    ])
      assert.equal(codigoPg(await erroDe(getBanco().asUser(ctx(ANA), (tx) => tx.execute(q)))), PG.semPrivilegio);
    // revogar é para sempre; depois, outro convite = outro link
    ok(await cv.revogarConvite(ctx(ANA), f));
    assert.deepEqual(await cv.contaDoFreela(ctx(ANA), f, SITE, true), { estado: "sem_conta" });
    assert.equal((await cv.abrirConvite(tokenDe(a.url), IP)).estado, "morto");
    const volta = await erroDe(
      getBanco().asUser(ctx(ANA), (tx) => tx.execute(sql`update maestro.freela_convites set revogado_em = null where freela_id = ${f}`)),
    );
    assert.match(String((volta as Error).message) + String((volta as { cause?: Error }).cause?.message ?? ""), /freela_convite:revogado/);
    const c = ok(await cv.convidarFreela(ctx(ANA), f, SITE));
    assert.notEqual(c.url, a.url);
    // auditoria: criou e revogou, sem o token
    const log = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select action, metadata::text as m from maestro.audit_log where target_id = ${f} order by created_at`),
    )) as unknown as { action: string; m: string }[];
    assert.deepEqual(
      log.map((l) => l.action),
      ["freela.convite_criou", "freela.convite_revogou", "freela.convite_criou"],
    );
    assert.ok(!log.some((l) => l.m.includes(tokenDe(a.url))));
  });

  test("leitura não convida; a outra organização não vê nem revoga; freela já ligado não recebe convite", async () => {
    const f = await novoFreela("Só Leitura Vê");
    assert.equal((await cv.convidarFreela(ctx(LEO), f, SITE)).ok, false);
    ok(await cv.convidarFreela(ctx(ANA), f, SITE));
    assert.equal(await cv.contaDoFreela(ctx(BIA, org2), f, SITE, true), null);
    assert.equal((await cv.convidarFreela(ctx(BIA, org2), f, SITE)).ok, false);
    assert.equal((await cv.revogarConvite(ctx(BIA, org2), f)).ok, false);
    const vistos = (await getBanco().asUser(ctx(BIA, org2), (tx) => tx.execute(sql`select id from maestro.freela_convites`))) as unknown[];
    assert.equal(vistos.length, 0);
    // forjar a organização na sessão não passa (não é membro)
    assert.equal(await cv.contaDoFreela(ctx(BIA, org), f, SITE, true), null);
    const s = await sessaoCom(ANA);
    const p = await zp.pessoaPorArroba(s.id, "rafa.edita");
    assert.ok(p.ok);
    const ligado = ok(await fr.salvarFreela(ctx(ANA), entrada("Rafa Ligado"), undefined, false, { pessoa: p.pessoa })).id;
    const r = await cv.convidarFreela(ctx(ANA), ligado, SITE);
    assert.equal(r.ok ? "" : r.erro, "ja_ligado");
    assert.deepEqual(await cv.contaDoFreela(ctx(ANA), ligado, SITE, true), { estado: "conectado", arroba: "rafa.edita" });
    // ligar pelo @ revoga o convite aberto
    const p2 = await zp.pessoaPorArroba(s.id, "lu.som");
    assert.ok(p2.ok);
    ok(await fr.salvarFreela(ctx(ANA), entrada("Só Leitura Vê"), f, false, { pessoa: p2.pessoa }));
    const [{ abertos }] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select count(*)::int as abertos from maestro.freela_convites where freela_id = ${f} and revogado_em is null and aceito_em is null`),
    )) as unknown as { abertos: number }[];
    assert.equal(abertos, 0);
  });
});

describe("quem recebe (porta estreita)", () => {
  test("abrir mostra só o primeiro nome e a marca; aceitar liga uma vez; outra conta não usa o mesmo", async () => {
    const f = await novoFreela("Maria Avulsa Souza");
    const { url } = ok(await cv.convidarFreela(ctx(ANA), f, SITE));
    const t = tokenDe(url);
    const a = await cv.abrirConvite(t, IP);
    assert.equal(a.estado, "ok");
    if (a.estado !== "ok") return;
    assert.equal(a.convite.nome, "Maria");
    assert.equal(a.convite.estado, "aberto");
    assert.equal(a.convite.marca.nome, "Produtora Convite");
    const texto = JSON.stringify(a);
    for (const segredo of ["freela@exemplo.com", "5511988887777", "Souza", f]) assert.ok(!texto.includes(segredo), segredo);
    // sem identidade, não aceita
    const sem = await cv.aceitarConvite(t, null, IP);
    assert.equal(sem.ok ? "" : sem.erro, "sem_conta");
    const MARIA = UUID();
    const r = await cv.aceitarConvite(t, { sub: MARIA, arroba: "maria.som", nome: "Maria", foto: null }, IP);
    assert.deepEqual(r, { ok: true, arroba: "maria.som" });
    assert.deepEqual(await linha(f), { zro_sub: MARIA, zro_arroba: "maria.som" });
    assert.deepEqual(await cv.contaDoFreela(ctx(ANA), f, SITE, true), { estado: "conectado", arroba: "maria.som" });
    // a mesma conta de novo: ok (idempotente); outra conta: morto
    assert.deepEqual(await cv.aceitarConvite(t, { sub: MARIA, arroba: "maria.som", nome: null, foto: null }, IP), { ok: true, arroba: "maria.som" });
    const outra = await cv.aceitarConvite(t, { sub: UUID(), arroba: "intruso", nome: null, foto: null }, IP);
    assert.equal(outra.ok ? "" : outra.erro, "morto");
    const aberto = await cv.abrirConvite(t, IP);
    assert.equal(aberto.estado === "ok" ? aberto.convite.aceitoSub : null, MARIA);
    // aceito não se revoga pelo app
    assert.equal((await cv.revogarConvite(ctx(ANA), f)).ok, false);
    const log = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select actor_sub from maestro.audit_log where target_id = ${f} and action = 'freela.convite_aceito'`),
    )) as unknown as { actor_sub: string }[];
    assert.deepEqual(
      log.map((l) => l.actor_sub),
      [MARIA],
    );
  });

  test("vencido, desconhecido e a conta que já está em outro freela", async () => {
    const f = await novoFreela("Vencido");
    const { url } = ok(await cv.convidarFreela(ctx(ANA), f, SITE));
    await getBanco().asSystem("teste: vence", (tx) =>
      tx.execute(sql`update maestro.freela_convites set criado_em = now() - interval '8 days', expira_em = now() - interval '1 day' where freela_id = ${f}`),
    );
    assert.equal((await cv.abrirConvite(tokenDe(url), IP)).estado, "morto");
    const v = await cv.aceitarConvite(tokenDe(url), { sub: UUID(), arroba: null, nome: null, foto: null }, IP);
    assert.equal(v.ok ? "" : v.erro, "morto");
    // o vencido não segura a vaga: convidar de novo cria outro
    const novo = ok(await cv.convidarFreela(ctx(ANA), f, SITE));
    assert.equal(novo.novo, true);
    assert.equal((await cv.abrirConvite("x".repeat(43), IP)).estado, "morto");
    // a conta já está em outro freela da produtora: recusa e o convite fica aberto
    const SUB = UUID();
    const g = await novoFreela("Primeiro");
    const { url: u1 } = ok(await cv.convidarFreela(ctx(ANA), g, SITE));
    ok(await cv.aceitarConvite(tokenDe(u1), { sub: SUB, arroba: null, nome: null, foto: null }, IP));
    const r = await cv.aceitarConvite(tokenDe(novo.url), { sub: SUB, arroba: null, nome: null, foto: null }, IP);
    assert.equal(r.ok ? "" : r.erro, "conta_em_outro");
    assert.equal((await cv.abrirConvite(tokenDe(novo.url), IP)).estado, "ok");
    // a mesma pessoa pode ser freela de outra produtora (isolado por organização)
    const h = await novoFreela("Na Outra", org2, BIA);
    const { url: u2 } = ok(await cv.convidarFreela(ctx(BIA, org2), h, SITE));
    ok(await cv.aceitarConvite(tokenDe(u2), { sub: SUB, arroba: null, nome: null, foto: null }, IP));
  });

  test("rota pública: Origin conferido; quem aceita vem do cookie do convite, nunca do corpo", async () => {
    const f = await novoFreela("Rota Pública");
    const { url } = ok(await cv.convidarFreela(ctx(ANA), f, SITE));
    const token = tokenDe(url);
    const fora = await publico.rotaConvite(pedido("/api/publico/convite", { corpo: { token }, origin: "https://evil.example" }));
    assert.equal(fora.status, 403);
    const sem = await publico.rotaConvite(pedido("/api/publico/convite", { corpo: { token, sub: UUID() } }));
    assert.equal(sem.status, 401);
    const SUB = UUID();
    const cookie = idt.selarIdentidade({ sub: SUB, arroba: "rota.pub", nome: "Rota", foto: null });
    const r = await publico.rotaConvite(pedido("/api/publico/convite", { corpo: { token, sub: UUID() }, cookies: { mae_conv: cookie } }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, arroba: "rota.pub" });
    assert.deepEqual(await linha(f), { zro_sub: SUB, zro_arroba: "rota.pub" });
    // cookie vencido ou adulterado não vale
    assert.equal(idt.abrirIdentidade(idt.selarIdentidade({ sub: SUB, arroba: null, nome: null, foto: null }, Date.now() - 31 * 60_000)), null);
    assert.equal(idt.abrirIdentidade(`${cookie.slice(0, -4)}AAAA`), null);
  });
});

describe("a volta do login do convite", () => {
  test("só a identidade: sem sessão nem organização no Maestro, escopos básicos e o refresh token devolvido", async () => {
    const f = await novoFreela("Pelo Login");
    const { url } = ok(await cv.convidarFreela(ctx(ANA), f, SITE));
    const volta = `/convite/${tokenDe(url)}`;
    const NOVA: PessoaFalsa = { sub: UUID(), email: "nova@exemplo.com", nome: "Nova Freela", arroba: "nova.freela", org: null, produtos: [] };
    Object.assign(amb.zro.estado.proximo, { pessoa: NOVA, adulterar: null, negar: false });
    const revogadosAntes = amb.zro.estado.revogados;
    const ida = await rotas.entrar(pedido(`/api/zro/entrar?${new URLSearchParams({ modo: "criar", volta })}`));
    assert.equal(ida.status, 302);
    const u = new URL(ida.headers.get("location")!);
    assert.equal(u.searchParams.get("scope"), "openid email profile org offline_access");
    assert.equal(u.searchParams.get("prompt"), "create");
    const z = await fetch(u, { redirect: "manual" });
    const res = await rotas.callback(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida).get("mae_zro") } }));
    assert.equal(res.status, 303);
    assert.equal(new URL(res.headers.get("location")!).pathname, volta);
    const c = cookiesDe(res);
    assert.equal(c.get("mae_sessao"), undefined, "nenhuma sessão no Maestro");
    const quem = idt.abrirIdentidade(c.get("mae_conv"));
    assert.deepEqual(quem, { sub: NOVA.sub, arroba: "nova.freela", nome: "Nova Freela", foto: null });
    assert.equal(amb.zro.estado.revogados, revogadosAntes + 1, "o refresh token volta para a Absolute ZRO");
    const [{ n }] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select count(*)::int as n from maestro.members where zro_sub = ${NOVA.sub}`),
    )) as unknown as { n: number }[];
    assert.equal(n, 0, "nem membro nem organização");
    // e aceita com essa identidade
    const r = await publico.rotaConvite(pedido("/api/publico/convite", { corpo: { token: tokenDe(url) }, cookies: { mae_conv: c.get("mae_conv") } }));
    assert.equal(r.status, 200);
    assert.deepEqual(await linha(f), { zro_sub: NOVA.sub, zro_arroba: "nova.freela" });
  });

  test("quem já tem sessão no Maestro usa a dela (com o @ do membro)", async () => {
    await getBanco().asSystem("teste", (tx) => tx.execute(sql`update maestro.members set zro_arroba = 'teo.equipe' where zro_sub = ${TEO}`));
    const { token } = await criarSessao({ orgId: org, sub: TEO, produtos: ["maestro"], release: { maestro: "allowed" }, tokens: null });
    const quem = await idt.identidadeDosCookies((n) => (n === "mae_sessao" ? token : undefined));
    assert.deepEqual(quem, { sub: TEO, arroba: "teo.equipe", nome: "Téo", foto: null });
    assert.equal(await idt.identidadeDosCookies(() => undefined), null);
  });
});
