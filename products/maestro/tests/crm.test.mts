// Clientes (CRM básico) e Projetos (Etapa 1), no banco real com o papel maestro_app: validação, busca, código
// MAE-AAAA-NNN, link_status pendente, isolamento entre organizações e papel de leitura que não escreve.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prepararAmbiente, UUID } from "./ambiente.mts";

const amb = await prepararAmbiente("crm");
const { getBanco, schema } = amb.banco;
const cli = await import("../src/lib/crm/clientes");
const proj = await import("../src/lib/crm/projetos");

const ANA = UUID();
const LEO = UUID();
const BIA = UUID();
let orgA: string;
let orgB: string;
const A = () => ({ sub: ANA, orgId: orgA });
const LEITURA = () => ({ sub: LEO, orgId: orgA });
const B = () => ({ sub: BIA, orgId: orgB });

const entrada = (f: Record<string, unknown>) => {
  const v = cli.validarCliente(f);
  if (!v.ok) throw new Error(JSON.stringify(v.erros));
  return v.entrada;
};
const entradaP = (f: Record<string, unknown>) => {
  const v = proj.validarProjeto(f);
  if (!v.ok) throw new Error(JSON.stringify(v.erros));
  return v.entrada;
};

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    const [a] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Agência A" }).returning({ id: schema.organizations.id });
    const [b] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Agência B" }).returning({ id: schema.organizations.id });
    orgA = a.id;
    orgB = b.id;
    await tx.insert(schema.members).values([
      { orgId: orgA, zroSub: ANA, role: "gestor" },
      { orgId: orgA, zroSub: LEO, role: "leitura" },
      { orgId: orgB, zroSub: BIA, role: "admin" },
    ]);
  });
});
after(() => amb.fechar());

describe("clientes", () => {
  test("validação: nome obrigatório, WhatsApp vira dígitos com DDI, e-mail e status conferidos", () => {
    const v = cli.validarCliente({ nome: "", whatsapp: "12", email: "x@", status: "vip" });
    assert.equal(v.ok, false);
    if (!v.ok) assert.deepEqual(Object.keys(v.erros).sort(), ["email", "nome", "status", "whatsapp"]);
    const e = entrada({ nome: " Padaria Aurora ", whatsapp: "(11) 91234-5678", email: "Contato@Aurora.Exemplo" });
    assert.equal(e.nome, "Padaria Aurora");
    assert.equal(e.whatsapp, "5511912345678");
    assert.equal(e.email, "contato@aurora.exemplo");
    assert.equal(e.status, "ativo");
    assert.equal(cli.normalizarWhatsapp("+351 912 345 678"), "351912345678");
    assert.equal(cli.whatsappLegivel("5511912345678"), "+55 11 91234-5678");
    assert.equal(cli.linkWhatsapp("5511912345678", "Oi, tudo bem?"), "https://wa.me/5511912345678?text=Oi%2C%20tudo%20bem%3F");
  });

  test("cria, lista com busca e status, abre a ficha, atualiza e remove", async () => {
    const a = await cli.criarCliente(A(), entrada({ nome: "Padaria Aurora", empresa: "Aurora Pães Ltda", contato: "Marta", whatsapp: "11912345678" }));
    const b = await cli.criarCliente(A(), entrada({ nome: "Studio Norte", status: "lead" }));
    assert.ok(a.ok && b.ok);
    assert.equal((await cli.listarClientes(A())).length, 2);
    assert.deepEqual(
      (await cli.listarClientes(A(), { busca: "aurora" })).map((c) => c.nome),
      ["Padaria Aurora"],
    );
    assert.deepEqual(
      (await cli.listarClientes(A(), { busca: "marta" })).map((c) => c.nome),
      ["Padaria Aurora"],
      "busca no contato",
    );
    assert.deepEqual(
      (await cli.listarClientes(A(), { busca: "91234" })).map((c) => c.nome),
      ["Padaria Aurora"],
      "busca no WhatsApp",
    );
    assert.deepEqual(
      (await cli.listarClientes(A(), { status: "lead" })).map((c) => c.nome),
      ["Studio Norte"],
    );
    assert.equal((await cli.listarClientes(A(), { busca: "100%_" })).length, 0, "curinga escapado");
    const ficha = await cli.obterCliente(A(), a.id);
    assert.equal(ficha?.empresa, "Aurora Pães Ltda");
    assert.equal((await cli.atualizarCliente(A(), b.id, entrada({ nome: "Studio Norte", status: "pausado" }))).ok, true);
    assert.equal((await cli.obterCliente(A(), b.id))?.status, "pausado");
    assert.equal((await cli.removerCliente(A(), b.id)).ok, true);
    assert.equal(await cli.obterCliente(A(), b.id), null);
    assert.equal((await cli.listarClientes(A())).length, 1);
  });

  test("outra organização não vê nem muda; leitura não cria nem muda", async () => {
    const [aurora] = await cli.listarClientes(A());
    assert.equal((await cli.listarClientes(B())).length, 0);
    assert.equal(await cli.obterCliente(B(), aurora.id), null);
    assert.equal((await cli.atualizarCliente(B(), aurora.id, entrada({ nome: "invasão" }))).ok, false);
    assert.equal((await cli.removerCliente(B(), aurora.id)).ok, false);
    const r = await cli.criarCliente(LEITURA(), entrada({ nome: "Novo" }));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.erro, "sem_permissao");
    assert.equal((await cli.atualizarCliente(LEITURA(), aurora.id, entrada({ nome: "Mudou" }))).ok, false);
    assert.equal((await cli.obterCliente(A(), aurora.id))?.nome, "Padaria Aurora");
    assert.equal((await cli.listarClientes(LEITURA())).length, 1, "leitura lê");
  });
});

describe("projetos", () => {
  test("código MAE-AAAA-NNN em sequência por organização; nasce com link_status pendente", async () => {
    const ano = new Date().getFullYear();
    const [aurora] = await cli.listarClientes(A());
    const p1 = await proj.criarProjeto(A(), entradaP({ titulo: "Campanha de inverno", cliente: aurora.id, prazo: "2026-12-10" }));
    const p2 = await proj.criarProjeto(A(), entradaP({ titulo: "Site novo" }));
    const p3 = await proj.criarProjeto(B(), entradaP({ titulo: "Da B" }));
    assert.ok(p1.ok && p2.ok && p3.ok);
    assert.equal(p1.codigo, `MAE-${ano}-001`);
    assert.equal(p2.codigo, `MAE-${ano}-002`);
    assert.equal(p3.codigo, `MAE-${ano}-001`, "cada organização tem a sua sequência");
    const f = await proj.obterProjeto(A(), p1.id);
    assert.equal(f?.linkStatus, "pending");
    assert.equal(f?.clienteNome, "Padaria Aurora");
    // Em paralelo, sem colisão.
    const varios = await Promise.all([1, 2, 3].map((i) => proj.criarProjeto(A(), entradaP({ titulo: `Paralelo ${i}` }))));
    const codigos = varios.map((v) => (v.ok ? v.codigo : "x")).sort();
    assert.deepEqual(codigos, [`MAE-${ano}-003`, `MAE-${ano}-004`, `MAE-${ano}-005`]);
  });

  test("validação, lista com filtros, atualizar e remover", async () => {
    const v = proj.validarProjeto({ titulo: "", inicio: "2026-02-30", prazo: "2026-01-01", status: "x" });
    assert.equal(v.ok, false);
    if (!v.ok) assert.deepEqual(Object.keys(v.erros).sort(), ["inicio", "status", "titulo"]);
    const v2 = proj.validarProjeto({ titulo: "x", inicio: "2026-03-01", prazo: "2026-01-01" });
    assert.equal(v2.ok, false);
    const lista = await proj.listarProjetos(A(), { busca: "inverno" });
    assert.equal(lista.length, 1);
    const id = lista[0].id;
    assert.equal((await proj.listarProjetos(A(), { cliente: lista[0].clienteId! })).length, 1);
    assert.equal((await proj.atualizarProjeto(A(), id, entradaP({ titulo: "Campanha de inverno", status: "done" }))).ok, true);
    assert.equal((await proj.listarProjetos(A(), { status: "done" })).length, 1);
    assert.equal((await proj.removerProjeto(A(), id)).ok, true);
    assert.equal(await proj.obterProjeto(A(), id), null);
  });

  test("cliente de outra organização não entra no projeto; outra organização não vê; leitura não cria", async () => {
    const [aurora] = await cli.listarClientes(A());
    const r = await proj.criarProjeto(B(), entradaP({ titulo: "x", cliente: aurora.id }));
    assert.equal(r.ok, false);
    const [umDaA] = await proj.listarProjetos(A());
    assert.equal(await proj.obterProjeto(B(), umDaA.id), null);
    assert.equal((await proj.atualizarProjeto(B(), umDaA.id, entradaP({ titulo: "invasão" }))).ok, false);
    const l = await proj.criarProjeto(LEITURA(), entradaP({ titulo: "x" }));
    assert.equal(l.ok, false);
    if (!l.ok) assert.equal(l.erro, "sem_permissao");
  });
});
