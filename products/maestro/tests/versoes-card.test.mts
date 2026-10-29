// Versão colada na ficha do card (src/components/quadro/versoes.tsx): o mesmo caminho do lote (`novaVersao` →
// `maestro.versao_criar`) e a leitura `versoesDoCard`. A versão é do card: o lote que já tem o card mostra e sobe a volta,
// e o lote criado depois começa nela. Papéis, duas organizações e acesso por cliente.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente, UUID } from "./ambiente.mts";

const amb = await prepararAmbiente("versoes_card");
const { getBanco, schema } = amb.banco;
const eq = await import("../src/lib/revisao/equipe");

const ANA = UUID(); // admin na A
const EVA = UUID(); // equipe na A
const LEO = UUID(); // leitura na A
const BIA = UUID(); // admin na B
let orgA: string;
let orgB: string;
let clienteA: string;
let clienteA2: string;
let clienteB: string;
const A = () => ({ sub: ANA, orgId: orgA });
const EQUIPE = () => ({ sub: EVA, orgId: orgA });
const LEITURA = () => ({ sub: LEO, orgId: orgA });
const B = () => ({ sub: BIA, orgId: orgB });

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

async function card(ctx: { sub: string; orgId: string }, id: string, coluna: string, cliente: string) {
  await getBanco().asUser(ctx, (tx) => tx.execute(sql`select maestro.card_criar(${id}, ${JSON.stringify({ tema: `Peça ${id}`, coluna, cliente })}::jsonb)`));
}

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    const [a] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora A" }).returning({ id: schema.organizations.id });
    const [b] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora B" }).returning({ id: schema.organizations.id });
    orgA = a.id;
    orgB = b.id;
    await tx.insert(schema.members).values([
      { orgId: orgA, zroSub: ANA, role: "admin" },
      { orgId: orgA, zroSub: EVA, role: "equipe" },
      { orgId: orgA, zroSub: LEO, role: "leitura" },
      { orgId: orgB, zroSub: BIA, role: "admin" },
    ]);
    const [c1] = await tx.insert(schema.clients).values({ orgId: orgA, name: "Café Aurora" }).returning({ id: schema.clients.id });
    const [c2] = await tx.insert(schema.clients).values({ orgId: orgA, name: "Livraria Lume" }).returning({ id: schema.clients.id });
    const [cb] = await tx.insert(schema.clients).values({ orgId: orgB, name: "Cliente B" }).returning({ id: schema.clients.id });
    clienteA = c1.id;
    clienteA2 = c2.id;
    clienteB = cb.id;
  });
  await card(B(), "cardB001", "revisao", clienteB);
  await card(A(), "reel0001", "fazendo", clienteA);
  await card(A(), "post0002", "fazendo", clienteA2);
});
after(() => amb.fechar());

describe("versões na ficha do card", () => {
  let lote: string;

  test("colada no card, aparece na ficha (mais nova primeiro) e no lote que já tinha o card", async () => {
    lote = ok(await eq.criarLote(A(), { clienteId: clienteA, titulo: "Semana 44", cards: ["reel0001"] })).id;
    assert.deepEqual(await eq.versoesDoCard(EQUIPE(), "reel0001"), []);
    assert.equal(ok(await eq.novaVersao(EQUIPE(), "reel0001", "https://youtu.be/dQw4w9WgXcQ", "")).n, 1);
    assert.equal(ok(await eq.novaVersao(EQUIPE(), "reel0001", "https://cdn.exemplo.com/reel-v2.mp4", "Corte 2")).n, 2);
    const vs = await eq.versoesDoCard(EQUIPE(), "reel0001");
    assert.deepEqual(
      vs.map((v) => [v.n, v.fonte, v.titulo, v.url]),
      [
        [2, "mp4", "Corte 2", "https://cdn.exemplo.com/reel-v2.mp4"],
        [1, "youtube", null, "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
      ],
    );
    assert.ok(!Number.isNaN(Date.parse(vs[0].em)));
    const l = await eq.carregarLote(A(), lote);
    assert.ok(l);
    assert.deepEqual(
      l.pecas[0].versoes.map((v) => v.id),
      vs.map((v) => v.id),
    );
    assert.equal(l.pecas[0].volta, 2, "a volta do lote acompanha a versão nova");
  });

  test("lote criado depois começa na versão do card", async () => {
    const outro = ok(await eq.criarLote(A(), { clienteId: clienteA, titulo: "Semana 45", cards: ["reel0001"] })).id;
    const l = await eq.carregarLote(A(), outro);
    assert.equal(l?.pecas[0].volta, 2);
    assert.equal(l?.pecas[0].versoes.length, 2);
  });

  test("as mesmas regras do lote: link ruim e pasta do Drive recusados com a mesma mensagem", async () => {
    const http = await eq.novaVersao(EQUIPE(), "reel0001", "http://cdn.exemplo.com/x.mp4");
    assert.equal(http.ok, false);
    const pasta = await eq.novaVersao(EQUIPE(), "reel0001", "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp");
    assert.equal(pasta.ok, false);
    if (!pasta.ok) assert.equal(pasta.mensagem, "Esse link é de uma pasta. Cole o link do arquivo de vídeo.");
    assert.equal((await eq.versoesDoCard(A(), "reel0001")).length, 2);
  });

  test("leitura vê a lista e não adiciona", async () => {
    assert.equal((await eq.versoesDoCard(LEITURA(), "reel0001")).length, 2);
    const r = await eq.novaVersao(LEITURA(), "reel0001", "https://cdn.exemplo.com/x.mp4");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.erro, "sem_permissao");
  });

  test("duas organizações: a B não lê nem cola versão no card da A", async () => {
    assert.deepEqual(await eq.versoesDoCard(B(), "reel0001"), []);
    const r = await eq.novaVersao(B(), "reel0001", "https://cdn.exemplo.com/x.mp4");
    assert.equal(r.ok, false);
    assert.deepEqual(await eq.versoesDoCard(A(), "cardB001"), []);
    assert.equal((await eq.versoesDoCard(A(), "reel0001")).length, 2);
  });

  test("acesso por cliente: equipe restrita a outro cliente não vê nem cola", async () => {
    await getBanco().asSystem("teste", async (tx) => {
      await tx.execute(sql`insert into maestro.acesso_restrito (org_id, zro_sub) values (${orgA}, ${EVA})`);
      await tx.execute(sql`insert into maestro.acesso_clientes (org_id, zro_sub, cliente_id) values (${orgA}, ${EVA}, ${clienteA2})`);
    });
    assert.deepEqual(await eq.versoesDoCard(EQUIPE(), "reel0001"), []);
    assert.equal((await eq.novaVersao(EQUIPE(), "reel0001", "https://cdn.exemplo.com/x.mp4")).ok, false);
    assert.equal(ok(await eq.novaVersao(EQUIPE(), "post0002", "https://cdn.exemplo.com/post.mp4")).n, 1);
    assert.equal((await eq.versoesDoCard(EQUIPE(), "post0002")).length, 1);
  });

  test("id de card inválido não chega ao banco", async () => {
    assert.deepEqual(await eq.versoesDoCard(A(), "x"), []);
    assert.deepEqual(await eq.versoesDoCard(A(), "'; drop table maestro.versoes; --"), []);
  });
});
