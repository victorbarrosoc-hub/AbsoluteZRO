// Criação F8 · "Para o TPeasy" direto pela Absolute ZRO (src/lib/criacao/roteiro/tpeasy.ts e a rota do editor), contra
// o HUB de mentira (tests/ponte-falsa.mts, que confere o corpo pelo contrato publicado zro.app-entrega.entrada.v1).
// Confere: o gate (admin e gestão + TPeasy no plano; sem ele nada vai ao HUB e a folha diz por quê), o texto montado no
// servidor da versão salva (o mesmo `saidaTpeasy` do .txt), a idempotência (a mesma versão de novo = "reenviada", nada
// duplica; versão nova = outra entrega no mesmo item), para quem (você ou quem da equipe usa o TPeasy), a auditoria sem o
// texto, o "enviado" à mão recusado para `direto`, outra organização sem acesso e o HUB sem o TPeasy no plano (403).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { pedido, prepararAmbiente, UUID } from "./ambiente.mts";
import { iniciarPonteFalsa } from "./ponte-falsa.mts";

const amb = await prepararAmbiente("criacao_tpeasy");
const ponte = await iniciarPonteFalsa();
process.env.MAESTRO_PONTE_URL = ponte.url;
const { getBanco, schema } = amb.banco;
const { criarSessao } = await import("../src/lib/auth/sessao");
const { getRoteiro, postRoteiro } = await import("../src/lib/criacao/roteiro/rota");
const { criarRoteiro, salvarRoteiro, salvarVersao, obterVersao, obterRoteiro } = await import("../src/lib/criacao/roteiro/servidor");
const { saidaTpeasy } = await import("../src/lib/criacao/roteiro/saidas");
const { idNoTpeasy } = await import("../src/lib/criacao/roteiro/vistas/teleprompter");
const { podeMandarParaTpeasy } = await import("../src/lib/criacao/permissoes");
const { itensEnviar } = await import("../src/components/criacao/roteiro/enviar");

const ANA = UUID();
const GIL = UUID();
const EDU = UUID();
const BIA = UUID();
const DANI = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3aa1";
let org: string;
let org2: string;
let id: string;
const ESCOPO = "openid email profile org offline_access zro.ia maestro.projects zro.agenda zro.pessoas zro.set";

async function sessao(sub: string, orgId: string, produtos = ["maestro", "tpeasy"]) {
  const { token } = await criarSessao({
    orgId,
    sub,
    produtos,
    release: { maestro: "released", tpeasy: "released" },
    tokens: { at: `at-${sub}`, rt: "rt-teste", atExp: Math.floor(Date.now() / 1000) + 24 * 3600, escopo: ESCOPO },
  });
  return token;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const ler = async (s: string, query: string, rid = id) => {
  const r = await getRoteiro(pedido(`/api/criacao/roteiros/${rid}${query}`, { cookies: { mae_sessao: s } }), rid);
  return { status: r.status, d: (await r.json()) as Json };
};
const mandar = async (s: string, corpo: Record<string, unknown>, rid = id) => {
  const r = await postRoteiro(pedido(`/api/criacao/roteiros/${rid}`, { cookies: { mae_sessao: s }, corpo }), rid);
  return { status: r.status, d: (await r.json()) as Json };
};
const auditoria = async () =>
  (await getBanco().sql`select metadata from maestro.audit_log where action = 'roteiro.enviado' and target_id = ${id} order by created_at`) as unknown as {
    metadata: Record<string, unknown>;
  }[];

let ana: string, gil: string, edu: string, bia: string, semTp: string;

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    const [o] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Café Filmes" }).returning({ id: schema.organizations.id });
    const [o2] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Outra Produtora" }).returning({ id: schema.organizations.id });
    org = o.id;
    org2 = o2.id;
    await tx.insert(schema.members).values([
      { orgId: org, zroSub: ANA, role: "admin", displayName: "Ana" },
      { orgId: org, zroSub: GIL, role: "gestor", displayName: "Gil" },
      { orgId: org, zroSub: EDU, role: "equipe", displayName: "Edu" },
      { orgId: org2, zroSub: BIA, role: "admin", displayName: "Bia" },
    ]);
  });
  ana = await sessao(ANA, org);
  gil = await sessao(GIL, org);
  edu = await sessao(EDU, org);
  bia = await sessao(BIA, org2);
  semTp = await sessao(ANA, org, ["maestro"]);
  const r = await criarRoteiro({ sub: ANA, orgId: org }, { titulo: "Café Aurora", modelo: "institucional" });
  assert.ok(r.ok);
  id = r.id;
  // o modelo só tem dica: põe falas de verdade (duas pessoas) e salva a v1
  const atual = (await obterRoteiro({ sub: ANA, orgId: org }, id))!;
  const conteudo = structuredClone(atual.conteudo);
  conteudo.pessoas = [
    { id: "p-ana", nome: "Antônio", papel: "apresentador" },
    { id: "p-bea", nome: "Bea", papel: "locutor" },
  ];
  conteudo.cenas[0].blocos = [
    { id: "b1", tipo: "fala", quem: "p-ana", modo: "on", texto: "O café chega antes do sol. [pausa]" },
    { id: "b2", tipo: "lettering", estilo: "gc", texto: "GC: Café Aurora" },
    { id: "b3", tipo: "fala", quem: "p-bea", modo: "off", texto: "**Todo dia**, na mesma xícara. ((sorrir))" },
  ];
  const g = await salvarRoteiro({ sub: ANA, orgId: org }, id, { rev: atual.rev, conteudo });
  assert.ok(g.ok, JSON.stringify(g));
  assert.ok((await salvarVersao({ sub: ANA, orgId: org }, id, null)).ok);
});
after(async () => {
  await ponte.fechar();
  await amb.fechar();
});

describe("Para o TPeasy direto (F8)", () => {
  test("o gate: admin e gestão com o TPeasy no plano; sem o TPeasy a folha diz por quê e nada vai ao HUB", async () => {
    const acesso = (papel: "admin" | "gestor" | "equipe" | "leitura", produtos: string[]) =>
      podeMandarParaTpeasy({ papel, produtos, release: { maestro: "released", tpeasy: "released" } });
    assert.equal(acesso("admin", ["maestro", "tpeasy"]), true);
    assert.equal(acesso("gestor", ["maestro", "tpeasy"]), true);
    assert.equal(acesso("equipe", ["maestro", "tpeasy"]), false);
    assert.equal(acesso("admin", ["maestro"]), false);
    assert.equal(podeMandarParaTpeasy({ papel: "admin", produtos: ["maestro", "tpeasy"], release: { tpeasy: "closed" } }), false);
    assert.match(itensEnviar(false, true).find((i) => i.k === "tpeasy")!.apoio, /Direto no app/);
    assert.equal(itensEnviar(false, false).find((i) => i.k === "tpeasy")!.titulo, "Para o TPeasy");

    const antes = ponte.estado.entregas.lista.length;
    const sem = await ler(semTp, "?tpeasy=1");
    assert.equal(sem.status, 200);
    assert.deepEqual(sem.d, { pode: false, motivo: "O plano da produtora não tem o TPeasy.", destinatarios: [], enviados: [] });
    const r = await mandar(semTp, { op: "tpeasy", n: 1 });
    assert.equal(r.status, 403);
    assert.equal(r.d.erro, "sem_tpeasy");
    assert.equal((await mandar(edu, { op: "tpeasy", n: 1 })).status, 403, "equipe não envia");
    assert.equal((await ler(edu, "?tpeasy=1")).status, 403);
    assert.equal(ponte.estado.entregas.lista.length, antes);
  });

  test("manda a versão salva: o texto é o da vista Teleprompter (montado no servidor), com título, link e meta", async () => {
    const r = await mandar(ana, { op: "tpeasy", n: 1, pessoa: "p-ana" });
    assert.equal(r.status, 201, JSON.stringify(r.d));
    assert.equal(r.d.envio.situacao, "nova");
    assert.equal(r.d.envio.item, idNoTpeasy(id, "p-ana"));
    assert.equal(r.d.envio.para.eu, true);
    const e = ponte.estado.entregas.lista.at(-1)!;
    const v = (await obterVersao({ sub: ANA, orgId: org }, id, 1))!;
    const esperado = saidaTpeasy({ roteiroId: id, titulo: v.titulo, n: 1, sha256: v.sha256, criadoEm: v.criadoEm, conteudo: v.conteudo }, "p-ana");
    assert.equal(e.corpo, esperado.texto);
    assert.equal(e.titulo, "Café Aurora · Antônio");
    assert.match(e.corpo, /O café chega antes do sol\. \[pausa\]/);
    assert.doesNotMatch(e.corpo, /GC|xícara/, "só as falas da pessoa escolhida");
    assert.match(e.link!, new RegExp(`/app/criacao/roteiros/${id}$`));
    assert.deepEqual(ponte.estado.entregas.recusados, [], "o corpo bate com o contrato publicado");

    // a folha vê o estado (Enviado · v1) e para quem dá
    const st = await ler(ana, "?tpeasy=1");
    assert.equal(st.d.pode, true);
    assert.deepEqual(
      st.d.destinatarios.map((d: Json) => d.eu),
      [true],
    );
    assert.equal(st.d.enviados[0].versao, 1);
    assert.equal(st.d.enviados[0].recebida_em, null);
  });

  test("idempotência: a mesma versão de novo é reenviada (nada duplica); versão nova é outra entrega no mesmo item", async () => {
    const n0 = ponte.estado.entregas.lista.length;
    const de = await mandar(ana, { op: "tpeasy", n: 1, pessoa: "p-ana" });
    assert.equal(de.status, 200);
    assert.equal(de.d.envio.situacao, "reenviada");
    assert.equal(ponte.estado.entregas.lista.length, n0);
    // v2 com uma fala nova: outra entrega, o mesmo item (o TPeasy atualiza o mesmo roteiro)
    const atual = (await obterRoteiro({ sub: ANA, orgId: org }, id))!;
    const conteudo = structuredClone(atual.conteudo);
    conteudo.cenas[0].blocos.push({ id: "b4", tipo: "fala", quem: "p-ana", modo: "on", texto: "E o dia começa." });
    assert.ok((await salvarRoteiro({ sub: ANA, orgId: org }, id, { rev: atual.rev, conteudo })).ok);
    assert.ok((await salvarVersao({ sub: GIL, orgId: org }, id, null)).ok);
    const v2 = await mandar(gil, { op: "tpeasy", n: 2, pessoa: "p-ana" });
    assert.equal(v2.status, 201);
    assert.equal(ponte.estado.entregas.lista.length, n0 + 1);
    const [a, b] = ponte.estado.entregas.lista.slice(-2);
    assert.equal(a!.item, b!.item);
    assert.match(b!.corpo, /E o dia começa\./);
    // todas as falas: outro item
    assert.equal((await mandar(ana, { op: "tpeasy", n: 2 })).d.envio.item, idNoTpeasy(id, null));
  });

  test("para alguém da equipe que usa o TPeasy; quem não usa é recusado pelo HUB", async () => {
    ponte.estado.entregas.equipe = [{ id: DANI, nome: "Dani Souza" }];
    const st = await ler(ana, "?tpeasy=1");
    assert.deepEqual(
      st.d.destinatarios.map((d: Json) => d.nome),
      ["Você", "Dani Souza"],
    );
    const r = await mandar(ana, { op: "tpeasy", n: 2, pessoa: "p-bea", para: DANI });
    assert.equal(r.status, 201);
    assert.deepEqual(r.d.envio.para, { id: DANI, nome: "Dani Souza", eu: false });
    const fora = await mandar(ana, { op: "tpeasy", n: 2, pessoa: "p-bea", para: UUID() });
    assert.equal(fora.status, 404);
    assert.equal(fora.d.mensagem, "Essa pessoa não usa o TPeasy na sua organização.");
    assert.equal((await mandar(ana, { op: "tpeasy", n: 2, para: "nao-e-id" })).status, 400);
  });

  test("auditoria do que saiu (com a entrega e o sha256 da versão, nunca o texto); 'enviado' à mão não aceita direto", async () => {
    const log = (await auditoria()).filter((x) => x.metadata.formato === "direto");
    assert.ok(log.length >= 4);
    const v1 = (await obterVersao({ sub: ANA, orgId: org }, id, 1))!;
    assert.equal(log[0]!.metadata.sha256, v1.sha256);
    assert.equal(log[0]!.metadata.destino, "tpeasy");
    assert.equal(log[0]!.metadata.situacao, "nova");
    assert.equal(log[1]!.metadata.situacao, "reenviada");
    assert.match(String(log[0]!.metadata.entrega), /^[0-9a-f-]{36}$/);
    assert.doesNotMatch(JSON.stringify(log), /café chega/);
    const env = await ler(ana, "?envios=1");
    assert.equal(env.d.envios[0].formato, "direto");
    const r = await mandar(ana, { op: "enviado", n: 1, destino: "tpeasy", formato: "direto" });
    assert.equal(r.status, 400);
  });

  test("versão que não existe, pessoa sem fala, outra organização e o HUB sem o TPeasy no plano", async () => {
    assert.equal((await mandar(ana, { op: "tpeasy", n: 99 })).status, 404);
    assert.equal((await mandar(bia, { op: "tpeasy", n: 1 })).status, 404, "outra organização não acha a versão");
    ponte.estado.entregas.negar = true;
    try {
      const r = await mandar(ana, { op: "tpeasy", n: 1 });
      assert.equal(r.status, 403);
      assert.equal(r.d.mensagem, "O plano da produtora não tem o TPeasy.");
      const st = await ler(ana, "?tpeasy=1");
      assert.equal(st.d.pode, false);
      assert.equal(st.d.motivo, "O plano da produtora não tem o TPeasy.");
    } finally {
      ponte.estado.entregas.negar = false;
    }
  });

  test("sem o token da Absolute ZRO (login antigo): pede para entrar de novo, sem quebrar", async () => {
    const { token } = await criarSessao({
      orgId: org,
      sub: ANA,
      produtos: ["maestro", "tpeasy"],
      release: { maestro: "released", tpeasy: "released" },
      tokens: null,
    });
    const r = await mandar(token, { op: "tpeasy", n: 1 });
    assert.equal(r.status, 401);
    assert.equal(r.d.erro, "reconectar_zro");
    const st = await ler(token, "?tpeasy=1");
    assert.equal(st.d.pode, false);
    assert.equal(st.d.motivo, "Entre de novo com a Absolute ZRO.");
  });
});
