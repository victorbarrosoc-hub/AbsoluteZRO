// O equipamento do próprio freela (drizzle/0013): cadastro no perfil, filtro no banco, o que ele leva na escala com o
// aluguel somado ao mesmo "a pagar", itens do Carro do Freela só leitura, a conta pura da sincronização (pelo `sub`,
// idempotente, desativa o que sumiu) e duas organizações sem se ver.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente, UUID } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("freela_equip");
const { getBanco, codigoPg, PG } = amb.banco;
const q = await import("../src/lib/freelas/equipamentos");
const { listarFreelas, salvarEscala } = await import("../src/lib/freelas/servidor");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
const ids: Record<string, string> = {};
const SUB = UUID();

const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e,
  );

before(async () => {
  o = await duasOrganizacoes();
  await getBanco().asSystem("semente", async (tx) => {
    const um = async (x: ReturnType<typeof sql>) => ((await tx.execute(x)) as unknown as { id: string }[])[0].id;
    ids.rafa = await um(sql`insert into maestro.freelas (org_id, nome, funcoes, zro_sub) values (${o.orgA}, 'Rafa', '{captacao-camera}', ${SUB}) returning id`);
    ids.lia = await um(sql`insert into maestro.freelas (org_id, nome, funcoes) values (${o.orgA}, 'Lia', '{edicao}') returning id`);
    ids.freelaB = await um(sql`insert into maestro.freelas (org_id, nome) values (${o.orgB}, 'Freela B') returning id`);
  });
});
after(() => amb.fechar());

describe("kit do freela", () => {
  test("validação", () => {
    const r = q.validarEquipFreela({ categoria: "x", modelo: "", quantidade: "0", diaria: "abc" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual(Object.keys(r.erros).sort(), ["categoria", "diaria", "modelo", "quantidade"]);
    const ok = q.validarEquipFreela({ categoria: "camera", marca: "Sony", modelo: " FX6 ", quantidade: "1", diaria: "350,00" });
    assert.ok(ok.ok && ok.entrada.modelo === "FX6" && ok.entrada.diariaCents === 35000);
  });

  test("equipe cadastra; leitura não; a B não vê nem aponta para o freela da A", async () => {
    const e = { categoria: "camera" as const, marca: "Sony", modelo: "FX6", quantidade: 1, observacao: null, diariaCents: 35000, ativo: true };
    const r = await q.salvarEquipFreela(o.equipe, ids.rafa, e);
    assert.ok(r.ok);
    if (r.ok) ids.fx6 = r.id;
    const lente = await q.salvarEquipFreela(o.equipe, ids.rafa, { ...e, categoria: "lente", modelo: "24-70mm", diariaCents: 10000 });
    assert.ok(lente.ok);
    if (lente.ok) ids.lente = lente.id;
    // A equipe não tem "Diárias e cachês" (drizzle/0027): o item entra sem a diária do aluguel e ela não vê nenhuma.
    assert.deepEqual(
      (await q.listarEquipDoFreela(o.gestor, ids.rafa)).map((x) => x.diariaCents),
      [null, null],
    );
    // A gestão põe a diária; a equipe muda outra coisa e a diária fica (gatilho freela_equipamentos_guarda_area).
    assert.ok((await q.salvarEquipFreela(o.gestor, ids.rafa, e, ids.fx6)).ok);
    assert.ok((await q.salvarEquipFreela(o.gestor, ids.rafa, { ...e, categoria: "lente", modelo: "24-70mm", diariaCents: 10000 }, ids.lente)).ok);
    assert.ok((await q.salvarEquipFreela(o.equipe, ids.rafa, { ...e, observacao: "com baterias", diariaCents: null }, ids.fx6)).ok);
    const kitGestao = await q.listarEquipDoFreela(o.gestor, ids.rafa);
    assert.deepEqual(kitGestao.map((x) => x.diariaCents).sort(), [10000, 35000]);
    assert.deepEqual(
      (await q.listarEquipDoFreela(o.equipe, ids.rafa)).map((x) => x.diariaCents),
      [null, null],
      "a equipe não recebe a diária do kit",
    );
    assert.equal((await q.salvarEquipFreela(o.leitura, ids.rafa, e)).ok, false);
    assert.equal((await q.listarEquipDoFreela(o.b, ids.rafa)).length, 0);
    assert.equal((await q.listarEquipDoFreela(o.forjado, ids.rafa)).length, 0);
    const fk = await erroDe(
      getBanco().asUser(o.b, (tx) => tx.execute(sql`insert into maestro.freela_equipamentos (org_id, freela_id, modelo) values (${o.orgB}, ${ids.rafa}, 'x')`)),
    );
    assert.equal(codigoPg(fk), PG.chaveEstrangeira, "chave composta");
    const rls = await erroDe(
      getBanco().asUser(o.admin, (tx) =>
        tx.execute(sql`insert into maestro.freela_equipamentos (org_id, freela_id, modelo) values (${o.orgB}, ${ids.freelaB}, 'x')`),
      ),
    );
    assert.equal(codigoPg(rls), PG.rls);
  });

  test("filtro do banco: tem equipamento e por categoria", async () => {
    const com = await listarFreelas(o.admin, { equip: "sim" });
    assert.deepEqual(
      com.map((f) => f.nome),
      ["Rafa"],
    );
    assert.deepEqual(
      (await listarFreelas(o.admin, { equip: "lente" })).map((f) => f.nome),
      ["Rafa"],
    );
    assert.equal((await listarFreelas(o.admin, { equip: "drone" })).length, 0);
    assert.equal((await listarFreelas(o.admin)).find((f) => f.nome === "Rafa")?.equipamentos, 2);
  });
});

describe("na escala", () => {
  test("marca o que leva; o aluguel (diária × dias) soma ao mesmo a pagar; só itens do freela", async () => {
    const e = await salvarEscala(o.gestor, {
      projetoId: null,
      eventoId: null,
      freelaId: ids.rafa,
      funcao: "captacao-camera",
      inicio: "2026-11-10",
      fim: "2026-11-11",
      diariaCents: 90000,
      valorCents: null,
      notas: null,
    });
    assert.ok(e.ok);
    if (!e.ok) return;
    ids.escala = e.id;
    const r = await q.marcarEquipNaEscala(o.equipe, e.id, [ids.fx6, ids.lente]);
    assert.ok(r.ok && r.aluguelCents === (35000 + 10000) * 2);
    const [l] = (await getBanco().asUser(o.admin, (tx) =>
      tx.execute(sql`select valor_cents::int as v, descricao from maestro.lancamentos where escala_id = ${e.id}`),
    )) as unknown as { v: number; descricao: string }[];
    assert.equal(l.v, 90000 * 2 + 90000, "diárias + aluguel");
    assert.match(l.descricao, /\+ equipamento/);
    const lista = await q.equipamentosDasEscalas(o.equipe, [e.id]);
    assert.deepEqual(lista[0].marcados.sort(), [ids.fx6, ids.lente].sort());
    // Tirar a lente: o a pagar acompanha.
    assert.ok((await q.marcarEquipNaEscala(o.equipe, e.id, [ids.fx6])).ok);
    const [l2] = (await getBanco().asUser(o.admin, (tx) =>
      tx.execute(sql`select valor_cents::int as v from maestro.lancamentos where escala_id = ${e.id}`),
    )) as unknown as {
      v: number;
    }[];
    assert.equal(l2.v, 180000 + 70000);
    // Item de outro freela: recusado e nada muda.
    const lia = await q.salvarEquipFreela(o.admin, ids.lia, {
      categoria: "audio",
      marca: null,
      modelo: "Zoom F6",
      quantidade: 1,
      observacao: null,
      diariaCents: 5000,
      ativo: true,
    });
    assert.ok(lia.ok);
    if (!lia.ok) return;
    const ruim = await q.marcarEquipNaEscala(o.equipe, e.id, [lia.id]);
    assert.ok(!ruim.ok);
    assert.deepEqual((await q.equipamentosDasEscalas(o.equipe, [e.id]))[0].marcados, [ids.fx6]);
    const direto = await erroDe(
      getBanco().asUser(o.admin, (tx) =>
        tx.execute(sql`insert into maestro.escala_equipamentos (org_id, escala_id, equipamento_id) values (${o.orgA}, ${e.id}, ${lia.id})`),
      ),
    );
    assert.equal(codigoPg(direto), PG.checagem, "o banco confere o dono");
  });
});

describe("Carro do Freela (pronto, desligado)", () => {
  const item = (id: string, extra: Partial<import("../src/lib/freelas/equipamentos").ItemInventario> = {}) => ({
    id,
    categoria: "camera" as const,
    marca: "Sony",
    modelo: "FX3",
    quantidade: 1,
    observacao: null,
    diaria_cents: 30000,
    ativo: true,
    atualizado_em: "2026-10-28T12:00:00Z",
    ...extra,
  });
  const inv = (itens: ReturnType<typeof item>[], sub = SUB) => ({
    contract: "freela.inventario/1" as const,
    sub,
    itens,
    atualizado_em: "2026-10-28T12:00:00Z",
  });

  test("a conta pura: só o sub certo; insere, atualiza, desativa e repete sem mudar", () => {
    const f = { id: "f1", zroSub: SUB };
    assert.deepEqual(q.aplicarInventarioDoCarro(f, [], inv([item("a")], UUID())), { ok: false, motivo: "sub" });
    assert.deepEqual(q.aplicarInventarioDoCarro({ id: "f1", zroSub: null }, [], inv([item("a")])), { ok: false, motivo: "sub" });
    const p1 = q.aplicarInventarioDoCarro(f, [], inv([item("a"), item("b", { modelo: "Mini 4", categoria: "drone" })]));
    assert.ok(p1.ok && p1.inserir.length === 2 && !p1.atualizar.length && !p1.desativar.length);
    const existentes = [
      {
        id: "e-a",
        freelaId: "f1",
        categoria: "camera",
        marca: "Sony",
        modelo: "FX3",
        quantidade: 1,
        observacao: null,
        diariaCents: 30000,
        ativo: true,
        origem: "carro-do-freela",
        origemId: "a",
        sincronizadoEm: null,
      },
      {
        id: "e-b",
        freelaId: "f1",
        categoria: "drone",
        marca: "Sony",
        modelo: "Mini 4",
        quantidade: 1,
        observacao: null,
        diariaCents: 30000,
        ativo: true,
        origem: "carro-do-freela",
        origemId: "b",
        sincronizadoEm: null,
      },
      {
        id: "e-local",
        freelaId: "f1",
        categoria: "luz",
        marca: null,
        modelo: "Amaran",
        quantidade: 1,
        observacao: null,
        diariaCents: null,
        ativo: true,
        origem: "maestro",
        origemId: null,
        sincronizadoEm: null,
      },
    ] as import("../src/lib/freelas/equipamentos").EquipFreela[];
    const igual = q.aplicarInventarioDoCarro(f, existentes, inv([item("a"), item("b", { modelo: "Mini 4", categoria: "drone" })]));
    assert.deepEqual(igual, { ok: true, inserir: [], atualizar: [], desativar: [] }, "idempotente");
    const p2 = q.aplicarInventarioDoCarro(f, existentes, inv([item("a", { quantidade: 2 })]));
    assert.ok(p2.ok);
    if (!p2.ok) return;
    assert.deepEqual(
      p2.atualizar.map((x) => [x.equipId, x.quantidade]),
      [["e-a", 2]],
    );
    assert.deepEqual(p2.desativar, ["e-b"], "o que sumiu desativa; o item local fica");
  });

  test("grava pela porta de sistema e o item do Carro fica só leitura para a equipe", async () => {
    const r1 = await q.sincronizarInventarioDoCarro(inv([item("cam-1"), item("drone-1", { categoria: "drone", modelo: "Mini 4 Pro" })]));
    assert.deepEqual(r1, { freelas: 1, inseridos: 2, atualizados: 0, desativados: 0 });
    const r2 = await q.sincronizarInventarioDoCarro(inv([item("cam-1"), item("drone-1", { categoria: "drone", modelo: "Mini 4 Pro" })]));
    assert.deepEqual(r2, { freelas: 1, inseridos: 0, atualizados: 0, desativados: 0 }, "de novo, nada muda");
    const r3 = await q.sincronizarInventarioDoCarro(inv([item("cam-1")]));
    assert.equal(r3.desativados, 1);
    const kit = await q.listarEquipDoFreela(o.admin, ids.rafa);
    const doCarro = kit.find((k) => k.origemId === "cam-1")!;
    assert.equal(doCarro.origem, "carro-do-freela");
    assert.equal(kit.find((k) => k.origemId === "drone-1")?.ativo, false);
    assert.ok(
      kit.some((k) => k.id === ids.fx6 && k.origem === "maestro"),
      "o item local continua",
    );
    const mudar = await q.salvarEquipFreela(
      o.admin,
      ids.rafa,
      { categoria: "camera", marca: "x", modelo: "y", quantidade: 1, observacao: null, diariaCents: null, ativo: true },
      doCarro.id,
    );
    assert.ok(!mudar.ok && mudar.erro === "so_leitura");
    assert.equal((await q.removerEquipFreela(o.admin, doCarro.id)).ok, false);
    const direto = await erroDe(
      getBanco().asUser(o.admin, (tx) => tx.execute(sql`update maestro.freela_equipamentos set modelo = 'z' where id = ${doCarro.id}`)),
    );
    assert.equal(codigoPg(direto), PG.semPrivilegio, "o banco também barra");
    const forjar = await erroDe(
      getBanco().asUser(o.admin, (tx) =>
        tx.execute(
          sql`insert into maestro.freela_equipamentos (org_id, freela_id, modelo, origem, origem_id) values (${o.orgA}, ${ids.rafa}, 'x', 'carro-do-freela', 'x')`,
        ),
      ),
    );
    assert.equal(codigoPg(forjar), PG.semPrivilegio);
    assert.deepEqual(
      await q.sincronizarInventarioDoCarro(inv([item("x")], UUID())),
      { freelas: 0, inseridos: 0, atualizados: 0, desativados: 0 },
      "sub de ninguém",
    );
  });
});
