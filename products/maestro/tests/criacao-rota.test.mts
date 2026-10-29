// Criação · a rota do editor do Roteiro (/api/criacao/roteiros/<id>, fase F2): sessão e Origin, papéis (leitura só lê;
// estado só administração e gestão), o poll pelo `rev`, a gravação com `rev` e o 409 que traz o atual (e a tela junta
// por id e grava de novo), versões (salvar, listar, ler) e restaurar, ligar e lixeira; outra organização não vê nada.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import type { PessoaZro } from "./zro-falso.mts";

const amb = await prepararAmbiente("criacao_rota");
const { zro } = amb;
const rotas = await import("../src/lib/zro/rotas");
const { getRoteiro, postRoteiro } = await import("../src/lib/criacao/roteiro/rota");
const { criarRoteiro } = await import("../src/lib/criacao/roteiro/servidor");
const { juntarRoteiros } = await import("../src/lib/criacao/roteiro/juntar");
const { mudarBloco, mudarCena } = await import("../src/lib/criacao/roteiro/editar");

const ORG_A = { id: UUID(), name: "Produtora A", role: "owner" };
const ORG_B = { id: UUID(), name: "Produtora B", role: "owner" };
const ANA: PessoaZro = { sub: UUID(), email: "ana@a.exemplo", nome: "Ana", org: ORG_A, produtos: ["maestro"] };
const EDU: PessoaZro = { sub: UUID(), email: "edu@a.exemplo", nome: "Edu", org: { ...ORG_A, role: "editor" }, produtos: ["maestro"] };
const LEO: PessoaZro = { sub: UUID(), email: "leo@a.exemplo", nome: "Leo", org: { ...ORG_A, role: "viewer" }, produtos: ["maestro"] };
const BIA: PessoaZro = { sub: UUID(), email: "bia@b.exemplo", nome: "Bia", org: ORG_B, produtos: ["maestro"] };

after(() => amb.fechar());

async function entrar(pessoa: PessoaZro): Promise<string> {
  Object.assign(zro.estado.proximo, { pessoa, adulterar: null, negar: false });
  const ida = await rotas.entrar(pedido("/api/zro/entrar"));
  const z = await fetch(new URL(ida.headers.get("location")!), { redirect: "manual" });
  const volta = await rotas.callback(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida).get("mae_zro") } }));
  return cookiesDe(volta).get("mae_sessao")!;
}

type Corpo = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const ler = async (s: string | undefined, id: string, query = "") => {
  const r = await getRoteiro(pedido(`/api/criacao/roteiros/${id}${query}`, { cookies: { mae_sessao: s } }), id);
  return { status: r.status, d: (await r.json()) as Json };
};
const gravar = async (s: string | undefined, id: string, corpo: Corpo, origin?: string | null) => {
  const r = await postRoteiro(pedido(`/api/criacao/roteiros/${id}`, { cookies: { mae_sessao: s }, corpo, origin }), id);
  return { status: r.status, d: (await r.json()) as Json };
};

let ana: string, edu: string, leo: string, bia: string;
let id: string;

before(async () => {
  ana = await entrar(ANA);
  edu = await entrar(EDU);
  leo = await entrar(LEO);
  bia = await entrar(BIA);
  const [o] = await amb.banco.getBanco().sql`select id from maestro.organizations where zro_org_id = ${ORG_A.id}`;
  const r = await criarRoteiro({ sub: ANA.sub, orgId: o.id }, { titulo: "Institucional", modelo: "institucional" });
  assert.ok(r.ok);
  id = r.id;
});

describe("rota do Roteiro", () => {
  test("sem sessão 401; de outra origem 403; outra organização não acha", async () => {
    assert.equal((await ler(undefined, id)).status, 401);
    assert.equal((await gravar(undefined, id, { op: "salvar", rev: 1, titulo: "x" })).status, 401);
    assert.equal((await gravar(ana, id, { op: "salvar", rev: 1, titulo: "x" }, "https://outro.exemplo")).status, 403);
    assert.equal((await ler(bia, id)).status, 404);
    assert.equal((await gravar(bia, id, { op: "salvar", rev: 1, titulo: "x" })).status, 404);
  });

  test("poll pelo rev: igual não traz o conteúdo; diferente traz", async () => {
    const um = await ler(ana, id);
    assert.equal(um.status, 200);
    assert.equal(um.d.mudou, true);
    assert.equal(um.d.roteiro.titulo, "Institucional");
    const dois = await ler(ana, id, `?rev=${um.d.roteiro.rev}`);
    assert.deepEqual(Object.keys(dois.d).sort(), ["estado", "mudou", "rev", "versaoAtual"]);
    assert.equal(dois.d.mudou, false);
  });

  test("leitura só lê: gravar, versão e estado são 403", async () => {
    assert.equal((await ler(leo, id)).status, 200);
    assert.equal((await gravar(leo, id, { op: "salvar", rev: 1, titulo: "x" })).status, 403);
    assert.equal((await gravar(leo, id, { op: "versao" })).status, 403);
    assert.equal((await gravar(edu, id, { op: "estado", estado: "aprovado" })).status, 403, "equipe não muda o estado");
    assert.equal((await gravar(ana, id, { op: "estado", estado: "com_cliente" })).status, 200);
    assert.equal((await ler(edu, id)).d.roteiro.estado, "com_cliente");
  });

  test("gravar com rev; o rev velho volta 409 com o atual, e a junção grava as duas mudanças", async () => {
    const { d } = await ler(ana, id);
    const base = d.roteiro;
    const cena1 = base.conteudo.cenas[0];
    const cena2 = base.conteudo.cenas[1];
    // a Ana muda o título da cena 1
    const daAna = mudarCena(base.conteudo, cena1.id, { titulo: "Abertura no estúdio" });
    const ok = await gravar(ana, id, { op: "salvar", rev: base.rev, conteudo: daAna });
    assert.equal(ok.status, 200);
    assert.equal(ok.d.rev, base.rev + 1);
    // o Edu, com o rev de antes, escreve num bloco da cena 2
    const bloco = cena2.blocos[0];
    const doEdu = mudarBloco(base.conteudo, bloco.id, { texto: "Quem somos, em uma frase." });
    const c = await gravar(edu, id, { op: "salvar", rev: base.rev, conteudo: doEdu });
    assert.equal(c.status, 409);
    assert.equal(c.d.erro, "conflito");
    assert.equal(c.d.atual.rev, base.rev + 1);
    const junto = juntarRoteiros(base.conteudo, doEdu, c.d.atual.conteudo);
    assert.deepEqual(junto.conflitos, []);
    const de_novo = await gravar(edu, id, { op: "salvar", rev: c.d.atual.rev, conteudo: junto.roteiro });
    assert.equal(de_novo.status, 200);
    const fim = (await ler(ana, id)).d.roteiro;
    assert.equal(fim.conteudo.cenas[0].titulo, "Abertura no estúdio");
    assert.equal(fim.conteudo.cenas[1].blocos[0].texto, "Quem somos, em uma frase.");
    assert.ok(fim.duracaoSeg > 0, "o total estimado é recalculado no servidor");
  });

  test("conteúdo fora dos limites é 400 e nada muda", async () => {
    const { d } = await ler(ana, id);
    const enorme = { ...d.roteiro.conteudo, cenas: Array.from({ length: 301 }, (_, i) => ({ id: `c${i}`, titulo: "", blocos: [] })) };
    const r = await gravar(ana, id, { op: "salvar", rev: d.roteiro.rev, conteudo: enorme });
    assert.equal(r.status, 400);
    assert.equal((await ler(ana, id)).d.roteiro.rev, d.roteiro.rev);
  });

  test("versões: salvar congela o gravado, lista, lê; restaurar volta o rascunho e a versão não muda", async () => {
    const v1 = await gravar(edu, id, { op: "versao", nota: "Primeira leitura" });
    assert.equal(v1.status, 200);
    assert.equal(v1.d.versao.n, 1);
    assert.equal(v1.d.versoes.length, 1);
    const { d } = await ler(ana, id);
    const mudado = mudarCena(d.roteiro.conteudo, d.roteiro.conteudo.cenas[0].id, { titulo: "Depois da v1" });
    const g = await gravar(ana, id, { op: "salvar", rev: d.roteiro.rev, conteudo: mudado });
    assert.equal(g.status, 200);
    const lista = await ler(ana, id, "?versoes=1");
    assert.equal(lista.d.versoes[0].nota, "Primeira leitura");
    const umaVersao = await ler(ana, id, "?versao=1");
    assert.equal(umaVersao.d.versao.conteudo.cenas[0].titulo, "Abertura no estúdio");
    assert.equal((await ler(ana, id, "?versao=9")).status, 404);
    // restaurar com o rev velho é conflito; com o atual volta
    assert.equal((await gravar(ana, id, { op: "restaurar", n: 1, rev: d.roteiro.rev })).status, 409);
    const r = await gravar(ana, id, { op: "restaurar", n: 1, rev: g.d.rev });
    assert.equal(r.status, 200);
    assert.equal(r.d.roteiro.conteudo.cenas[0].titulo, "Abertura no estúdio");
    assert.equal((await ler(ana, id, "?versao=1")).d.versao.sha256, umaVersao.d.versao.sha256);
  });

  test("ligar a projeto inexistente é recusado; lixeira tira da rota", async () => {
    assert.equal((await gravar(ana, id, { op: "ligar", projetoId: UUID(), cardId: null })).status, 400);
    assert.equal((await gravar(ana, id, { op: "desconhecida" })).status, 400);
    assert.equal((await gravar(edu, id, { op: "lixeira", apagar: true })).status, 200);
    assert.equal((await ler(ana, id)).status, 404);
    assert.equal((await gravar(ana, id, { op: "lixeira", apagar: false })).status, 200);
    assert.equal((await ler(ana, id)).status, 200);
  });
});
