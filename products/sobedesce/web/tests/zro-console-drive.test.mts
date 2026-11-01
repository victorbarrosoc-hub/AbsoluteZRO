/**
 * Console da Absolute ZRO › Apps › SOBEDESCE (titular, 31/10/2026): o Acesso total ao Drive é ligado e desligado pelo
 * HUB, servidor a servidor, com o pedido assinado (zro-pedido+jwt). Recusa sem token, com outra ação, de outro público
 * ou reapresentado; lê vagas e pessoas; liga, desliga (sem devolver vaga), trava no limite (409) e grava a auditoria.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { pedido, prepararAmbiente } from "./ambiente.mjs";
import { iniciarZroFalsa } from "./zro-falso.mjs";

const CLIENTE = { clientId: "sobedesce-web", clientSecret: "zk_segredo_de_teste" };
const ADMIN_HUB = "hub-admin-1";
let amb: Awaited<ReturnType<typeof prepararAmbiente>>;
let zro: Awaited<ReturnType<typeof iniciarZroFalsa>>;
let contas: typeof import("../src/lib/auth/contas");
let rLer: typeof import("../src/app/api/zro/console/drive/route");
let rMudar: typeof import("../src/app/api/zro/console/drive/acesso/route");
let drizzle: typeof import("drizzle-orm");

const jwt = (acao: string, o: { aud?: string } = {}) => zro.pedido({ sub: ADMIN_HUB, aud: CLIENTE.clientId, acao, ...o });
const ler = (token?: string) => rLer.POST(pedido("/api/zro/console/drive", { corpo: {}, bearer: token, origin: null }));
const mudar = (token: string | undefined, corpo: unknown) => rMudar.POST(pedido("/api/zro/console/drive/acesso", { corpo, bearer: token, origin: null }));

let n = 0;
async function pessoa(nome: string) {
  const c = await contas.criarConta({ nome, email: `${nome.toLowerCase()}${++n}@console.com`, senha: `senha de ${nome}!!`, ip: `10.8.0.${n}` });
  assert.ok(c.ok);
  return c.usuario.id as string;
}
async function ligado(id: string) {
  const { db, schema } = amb.banco;
  const [u] = await db.select().from(schema.usuarios).where(drizzle.eq(schema.usuarios.id, id));
  return u.driveAcessoTotal;
}

before(async () => {
  amb = await prepararAmbiente();
  zro = await iniciarZroFalsa(CLIENTE);
  Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret });
  contas = await import("../src/lib/auth/contas");
  rLer = await import("../src/app/api/zro/console/drive/route");
  rMudar = await import("../src/app/api/zro/console/drive/acesso/route");
  drizzle = await import("drizzle-orm");
});

after(async () => {
  await amb?.fechar();
  await zro?.fechar();
});

describe("console do Drive: só pedido assinado pela Absolute ZRO", () => {
  test("sem token, com outra ação, de outro público ou reapresentado: 401 e nada muda", async () => {
    const alvo = await pessoa("Nina");
    assert.equal((await ler()).status, 401);
    assert.equal((await ler(await jwt("console.drive.acesso"))).status, 401, "a chave de mudar não serve para ler");
    assert.equal((await mudar(await jwt("console.drive.ler"), { usuarioId: alvo, ligar: true })).status, 401, "a de ler não serve para mudar");
    assert.equal((await mudar(await jwt("console.drive.acesso", { aud: "outro-app" }), { usuarioId: alvo, ligar: true })).status, 401);
    const uma = await jwt("console.drive.acesso");
    assert.equal((await mudar(uma, { usuarioId: alvo, ligar: false })).status, 200);
    assert.equal((await mudar(uma, { usuarioId: alvo, ligar: true })).status, 401, "uso único");
    assert.equal(await ligado(alvo), false);
  });

  test("entrada errada: 400; conta que não existe: 404", async () => {
    assert.equal((await mudar(await jwt("console.drive.acesso"), { usuarioId: "../x", ligar: true })).status, 400);
    assert.equal((await mudar(await jwt("console.drive.acesso"), { usuarioId: "abc", ligar: "sim" })).status, 400);
    assert.equal((await mudar(await jwt("console.drive.acesso"), { usuarioId: "nao-existe-123", ligar: true })).status, 404);
  });
});

describe("console do Drive: ler e mudar", () => {
  test("lê vagas e pessoas, liga, desliga sem devolver vaga e grava a auditoria", async () => {
    const { db, schema } = amb.banco;
    await db.delete(schema.vagasDrive);
    await db.update(schema.usuarios).set({ driveAcessoTotal: false });
    const alvo = await pessoa("Otto");

    const antes = await (await ler(await jwt("console.drive.ler"))).json();
    assert.equal(antes.vagas.limite, 90);
    const p = antes.pessoas.find((x: { id: string }) => x.id === alvo);
    assert.ok(p);
    assert.equal(p.acessoTotal, false);
    assert.equal(p.usouVaga, false);
    assert.ok(!("refreshTokenEnc" in p) && !("senha" in p), "só o que o console mostra");

    const r = await mudar(await jwt("console.drive.acesso"), { usuarioId: alvo, ligar: true });
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.equal(corpo.acessoTotal, true);
    assert.equal(corpo.vagas.liberadasSemUso, 1);
    assert.equal(await ligado(alvo), true);

    // Usou a vaga (conectou o Drive inteiro) e depois desligou: a vaga continua usada.
    await db.insert(schema.vagasDrive).values({ googleSub: `g-${alvo}`, email: "otto@exemplo.com", usuarioId: alvo });
    const d = await (await mudar(await jwt("console.drive.acesso"), { usuarioId: alvo, ligar: false })).json();
    assert.equal(d.acessoTotal, false);
    assert.equal(d.vagas.usadas, 1);
    assert.equal(d.vagas.livres, 89);

    const aud = await db.select().from(schema.auditoriaZro).where(drizzle.eq(schema.auditoriaZro.alvo, alvo));
    assert.deepEqual(aud.map((a) => [a.zroSub, a.acao, a.resultado]).sort(), [
      [ADMIN_HUB, "console.drive.acesso", "desligado"],
      [ADMIN_HUB, "console.drive.acesso", "ligado"],
    ]);
  });

  test("no limite: 409 sem_vaga e a pessoa continua sem acesso total", async () => {
    const { db, schema } = amb.banco;
    await db.delete(schema.vagasDrive);
    await db.update(schema.usuarios).set({ driveAcessoTotal: false });
    await db.insert(schema.vagasDrive).values(Array.from({ length: 90 }, (_, i) => ({ googleSub: `cheio-${i}`, email: `c${i}@exemplo.com`, usuarioId: null })));
    const alvo = await pessoa("Pia");
    const r = await mudar(await jwt("console.drive.acesso"), { usuarioId: alvo, ligar: true });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).erro, "sem_vaga");
    assert.equal(await ligado(alvo), false);
    await db.delete(schema.vagasDrive);
  });
});
