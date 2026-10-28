// Lista de espera da página inicial (drizzle/0004, lib/lista-espera.ts), no banco real: a porta estreita só insere,
// maestro_app não lê nem escreve a tabela (nem com organização e vínculo válidos), o mesmo e-mail não duplica, a
// armadilha não grava, o limite segura 5 por hora por IP e o IP não fica em claro.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente, UUID } from "./ambiente.mts";

const amb = await prepararAmbiente("espera");
const { getBanco, schema, codigoPg, PG } = amb.banco;
const espera = await import("../src/lib/lista-espera");

const ANA = UUID();
let orgA: string;

type Linha = { email: string; nome: string | null; ip_hash: string | null; consentimento_em: string | Date | null };
const linhas = () =>
  getBanco().asSystem("teste lê a lista", async (tx) => (await tx.execute(sql`select * from maestro.lista_espera order by created_at`)) as unknown as Linha[]);
const limparLimites = () => getBanco().asSystem("teste limpa limites", (tx) => tx.execute(sql`delete from maestro.rate_limit_attempts`));
const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e as unknown,
  );

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    const [a] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora A" }).returning({ id: schema.organizations.id });
    orgA = a.id;
    await tx.insert(schema.members).values({ orgId: orgA, zroSub: ANA, role: "admin" });
  });
});

after(() => amb.fechar());

describe("lista de espera", () => {
  test("entra com consentimento; o mesmo e-mail (outra caixa) responde igual e não duplica", async () => {
    await limparLimites();
    const r1 = await espera.entrarNaListaDeEspera({ email: "  Pessoa@Exemplo.COM ", nome: "  Ana   Lima ", consentimento: true, ip: "203.0.113.7" });
    assert.deepEqual(r1, { ok: true, novo: true });
    const r2 = await espera.entrarNaListaDeEspera({ email: "pessoa@exemplo.com", consentimento: true, ip: "203.0.113.8" });
    assert.deepEqual(r2, { ok: true, novo: false });
    const l = await linhas();
    assert.equal(l.length, 1);
    assert.equal(l[0].email, "pessoa@exemplo.com");
    assert.equal(l[0].nome, "Ana Lima");
    assert.ok(!Number.isNaN(new Date(String(l[0].consentimento_em)).getTime()));
    // O IP nunca fica em claro: só o HMAC com a chave do Maestro.
    assert.match(l[0].ip_hash ?? "", /^[0-9a-f]{64}$/);
    assert.ok(!(l[0].ip_hash ?? "").includes("203.0.113.7"));
  });

  test("sem consentimento ou com e-mail ruim não grava", async () => {
    await limparLimites();
    const antes = (await linhas()).length;
    const r1 = await espera.entrarNaListaDeEspera({ email: "outra@exemplo.com", consentimento: false, ip: "203.0.113.9" });
    assert.equal(r1.ok, false);
    assert.ok(!r1.ok && r1.erros?.consentimento);
    const r2 = await espera.entrarNaListaDeEspera({ email: "sem-arroba", consentimento: true, ip: "203.0.113.9" });
    assert.ok(!r2.ok && r2.erros?.email);
    const r3 = await espera.entrarNaListaDeEspera({ email: `${"a".repeat(250)}@x.com`, consentimento: true, ip: "203.0.113.9" });
    assert.ok(!r3.ok && r3.erros?.email);
    assert.equal((await linhas()).length, antes);
  });

  test("armadilha preenchida: responde como sucesso e não grava nem conta tentativa", async () => {
    await limparLimites();
    const antes = (await linhas()).length;
    const r = await espera.entrarNaListaDeEspera({ email: "robo@exemplo.com", consentimento: true, armadilha: "https://spam.example", ip: "198.51.100.1" });
    assert.equal(r.ok, true);
    assert.equal((await linhas()).length, antes);
    const [t] = (await getBanco().asSystem("teste", (tx) => tx.execute(sql`select count(*)::int as n from maestro.rate_limit_attempts`))) as unknown as {
      n: number;
    }[];
    assert.equal(t.n, 0);
  });

  test("limite: 5 envios por hora por IP; outro IP segue", async () => {
    await limparLimites();
    for (let i = 0; i < 5; i++) {
      const r = await espera.entrarNaListaDeEspera({ email: `lote${i}@exemplo.com`, consentimento: true, ip: "192.0.2.50" });
      assert.equal(r.ok, true, `envio ${i + 1}`);
    }
    const barrado = await espera.entrarNaListaDeEspera({ email: "lote6@exemplo.com", consentimento: true, ip: "192.0.2.50" });
    assert.equal(barrado.ok, false);
    assert.ok(!barrado.ok && /Muitas tentativas/.test(barrado.mensagem ?? ""));
    // Repetir o mesmo e-mail também conta (ninguém sonda a lista sem limite).
    const repetido = await espera.entrarNaListaDeEspera({ email: "lote0@exemplo.com", consentimento: true, ip: "192.0.2.50" });
    assert.equal(repetido.ok, false);
    const outro = await espera.entrarNaListaDeEspera({ email: "lote6@exemplo.com", consentimento: true, ip: "192.0.2.51" });
    assert.deepEqual(outro, { ok: true, novo: true });
    assert.equal((await linhas()).filter((l) => l.email === "lote6@exemplo.com").length, 1);
  });
});

describe("lista de espera: RLS e privilégios", () => {
  test("maestro_app, mesmo com organização e vínculo válidos, não lê, não insere, não muda e não apaga", async () => {
    const ctx = { sub: ANA, orgId: orgA };
    for (const comando of [
      sql`select * from maestro.lista_espera`,
      sql`insert into maestro.lista_espera (email, consentimento_em) values ('direto@exemplo.com', now())`,
      sql`update maestro.lista_espera set nome = 'x'`,
      sql`delete from maestro.lista_espera`,
    ]) {
      const e = await erroDe(getBanco().asUser(ctx, (tx) => tx.execute(comando)));
      assert.equal(codigoPg(e), PG.semPrivilegio, String(comando.queryChunks?.[0] ?? ""));
    }
  });

  test("a função recusa sem consentimento e com e-mail inválido, mesmo chamada direto", async () => {
    const ctx = { sub: ANA, orgId: orgA };
    const semConsentimento = await erroDe(
      getBanco().asUser(ctx, (tx) => tx.execute(sql`select maestro.lista_espera_entrar('x@exemplo.com', null, false, null)`)),
    );
    assert.equal(codigoPg(semConsentimento), "22023");
    const invalido = await erroDe(getBanco().asUser(ctx, (tx) => tx.execute(sql`select maestro.lista_espera_entrar('nada', null, true, null)`)));
    assert.equal(codigoPg(invalido), "22023");
    // IP fora do formato vira nulo (ninguém guarda IP em claro pela porta).
    await getBanco().asUser(ctx, (tx) => tx.execute(sql`select maestro.lista_espera_entrar('direto2@exemplo.com', null, true, '203.0.113.7')`));
    const l = (await linhas()).find((x) => x.email === "direto2@exemplo.com");
    assert.equal(l?.ip_hash, null);
  });

  test("RLS ligado na tabela", async () => {
    const [r] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select relrowsecurity as rls from pg_class where oid = 'maestro.lista_espera'::regclass`),
    )) as unknown as { rls: boolean }[];
    assert.equal(r.rls, true);
  });
});
