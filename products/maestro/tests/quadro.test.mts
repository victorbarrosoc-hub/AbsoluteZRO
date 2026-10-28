// O Quadro pela rota /api/quadro (Etapa 1): sessão e acesso no servidor, papel, criar, mover entre colunas, conflito
// por campo, lápide e restaurar, "o que mudou desde", vínculos só da mesma organização, outra organização não vê nada.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import type { PessoaZro } from "./zro-falso.mts";

const amb = await prepararAmbiente("quadro");
const { zro } = amb;
const rotas = await import("../src/lib/zro/rotas");
const { getQuadro, postQuadro } = await import("../src/lib/quadro/rota");
const { criarCliente } = await import("../src/lib/crm/clientes");
const { proximoPasso, ordemEntre, passaFiltro, FILTRO_VAZIO } = await import("../src/lib/quadro/metodo");

const ORG_A = { id: UUID(), name: "Produtora A", role: "owner" };
const ORG_B = { id: UUID(), name: "Produtora B", role: "owner" };
const LIA: PessoaZro = { sub: UUID(), email: "lia@a.exemplo", nome: "Lia", org: ORG_A, produtos: ["maestro"] };
const RUI: PessoaZro = { sub: UUID(), email: "rui@a.exemplo", nome: "Rui", org: { ...ORG_A, role: "editor" }, produtos: ["maestro"] };
const VIC: PessoaZro = { sub: UUID(), email: "vic@a.exemplo", nome: "Vic", org: { ...ORG_A, role: "viewer" }, produtos: ["maestro"] };
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
const ler = (s: string | undefined, query = "") => getQuadro(pedido(`/api/quadro${query}`, { cookies: { mae_sessao: s } }));
const gravar = (s: string | undefined, corpo: Corpo, origin?: string | null) =>
  postQuadro(pedido("/api/quadro", { cookies: { mae_sessao: s }, corpo, origin }));

let lia: string, rui: string, vic: string, bia: string;
let orgA: string;
let clienteA: string;

before(async () => {
  lia = await entrar(LIA);
  rui = await entrar(RUI);
  vic = await entrar(VIC);
  bia = await entrar(BIA);
  const [o] = await amb.banco.getBanco().sql`select id from maestro.organizations where zro_org_id = ${ORG_A.id}`;
  orgA = o.id;
  const c = await criarCliente(
    { sub: LIA.sub, orgId: orgA },
    { nome: "Padaria Aurora", empresa: null, contato: null, whatsapp: null, email: null, observacoes: null, status: "ativo" },
  );
  assert.ok(c.ok);
  clienteA = c.id;
});

describe("rota do Quadro", () => {
  test("sem sessão 401; de outra origem 403", async () => {
    assert.equal((await ler(undefined)).status, 401);
    assert.equal((await gravar(undefined, { op: "criar", id: "card0001", dados: { tema: "x" } })).status, 401);
    assert.equal((await gravar(lia, { op: "criar", id: "card0001", dados: { tema: "x" } }, "https://outro.exemplo")).status, 403);
  });

  test("carrega pessoas, clientes e quem pode escrever", async () => {
    const r = await ler(lia);
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.podeEscrever, true);
    assert.equal(d.eu, LIA.sub);
    assert.deepEqual(
      d.clientes.map((c: { nome: string }) => c.nome),
      ["Padaria Aurora"],
    );
    assert.ok(d.pessoas.some((p: { sub: string }) => p.sub === RUI.sub));
    assert.ok(typeof d.cursor === "string");
  });

  test("equipe cria com cliente, responsável, prazo e prioridade; nasce na Pauta", async () => {
    const r = await gravar(rui, {
      op: "criar",
      id: "cardQ0001",
      dados: { tema: "  Reel   de lançamento ", cliente: clienteA, resp: LIA.sub, prazo: "2026-11-03", prioridade: "alta" },
    });
    assert.equal(r.status, 200);
    const { card } = await r.json();
    assert.equal(card.dados.tema, "Reel de lançamento");
    assert.equal(card.dados.coluna, "pauta");
    assert.equal(card.dados.criadoPor, RUI.sub);
    assert.equal(card.versao, 1);
  });

  test("move entre as colunas e a ordem; campo inválido e coluna fora do método são recusados", async () => {
    const r = await gravar(lia, { op: "mudar", id: "cardQ0001", campos: { coluna: "fazendo", ordem: 2.5 }, base: { coluna: 1 } });
    assert.equal(r.status, 200);
    const { card } = await r.json();
    assert.equal(card.dados.coluna, "fazendo");
    assert.equal(card.versoes.coluna, 2);
    assert.ok(card.dados.colunaEm > 0);
    for (const campos of [{ coluna: "publicado" }, { prazo: "amanhã" }, { prioridade: "máxima" }, { apagadoEm: "x" }, { tema: "" }]) {
      const e = await gravar(lia, { op: "mudar", id: "cardQ0001", campos });
      assert.equal(e.status, 400, JSON.stringify(campos));
    }
  });

  test("conflito por campo: base velha no mesmo campo recusa e devolve o card atual; outro campo passa", async () => {
    // Rui viu a coluna na versão 1 (antes da Lia mover): tentar mover de novo com essa base é conflito.
    const r = await gravar(rui, { op: "mudar", id: "cardQ0001", campos: { coluna: "revisao" }, base: { coluna: 1 } });
    assert.equal(r.status, 409);
    const d = await r.json();
    assert.equal(d.erro, "conflito");
    assert.equal(d.campo, "coluna");
    assert.equal(d.card.dados.coluna, "fazendo", "o card atual vem junto");
    // Mudar outro campo com a base certa daquele campo passa.
    const ok = await gravar(rui, { op: "mudar", id: "cardQ0001", campos: { tema: "Reel de lançamento v2" }, base: { tema: 1 } });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).card.dados.coluna, "fazendo", "não desfaz a mudança da Lia");
  });

  test("leitura não escreve (403), mas lê", async () => {
    assert.equal((await gravar(vic, { op: "mudar", id: "cardQ0001", campos: { coluna: "pauta" } })).status, 403);
    assert.equal((await gravar(vic, { op: "criar", id: "cardV0001", dados: { tema: "x" } })).status, 403);
    const d = await (await ler(vic)).json();
    assert.equal(d.podeEscrever, false);
    assert.equal(d.cards.length, 1);
  });

  test("outra organização: não vê o card nem alcança o cliente, o card ou a pessoa da A", async () => {
    const d = await (await ler(bia)).json();
    assert.equal(d.cards.length, 0);
    assert.equal(d.clientes.length, 0);
    assert.equal((await gravar(bia, { op: "mudar", id: "cardQ0001", campos: { tema: "invasão" } })).status, 404);
    assert.equal((await gravar(bia, { op: "criar", id: "cardB0001", dados: { tema: "x", cliente: clienteA } })).status, 400);
    assert.equal((await gravar(bia, { op: "criar", id: "cardB0002", dados: { tema: "x", resp: LIA.sub } })).status, 400);
  });

  test("apagar é lápide (sai da lista, aparece no 'desde'); restaurar volta", async () => {
    const antes = (await (await ler(lia)).json()).cursor as string;
    assert.equal((await gravar(lia, { op: "apagar", id: "cardQ0001" })).status, 200);
    assert.equal((await (await ler(lia)).json()).cards.length, 0);
    const desde = await (await ler(lia, `?desde=${encodeURIComponent(antes)}`)).json();
    assert.equal(desde.cards.length, 1);
    assert.ok(desde.cards[0].dados.apagadoEm);
    assert.equal((await gravar(lia, { op: "restaurar", id: "cardQ0001" })).status, 200);
    assert.equal((await (await ler(lia)).json()).cards.length, 1);
  });

  test("número repetido não sobrescreve", async () => {
    const r = await gravar(lia, { op: "criar", id: "cardQ0001", dados: { tema: "outro" } });
    assert.equal(r.status, 409);
  });
});

describe("método", () => {
  test("próximo passo de cada coluna", () => {
    assert.equal(proximoPasso({ coluna: "pauta" })?.principal.acao, "atribuir");
    assert.deepEqual(proximoPasso({ coluna: "pauta", resp: "x" })?.principal, { acao: "mover", para: "afazer", rotulo: "Para a fazer" });
    assert.equal(proximoPasso({ coluna: "aprovacao" })?.outro?.rotulo, "Pediu ajuste");
    assert.equal(proximoPasso({ coluna: "entregue" }), null);
  });
  test("ordem entre vizinhos e filtros", () => {
    assert.equal(ordemEntre({ ordem: 1 }, { ordem: 2 }), 1.5);
    assert.equal(ordemEntre(null, { ordem: 2 }), 1);
    assert.equal(ordemEntre({ ordem: 2 }, null), 3);
    const c = { id: "c1", versao: 1, versoes: {}, dados: { tema: "Reel de Lançamento", coluna: "pauta" as const, resp: "eu", cliente: "k1" } };
    assert.ok(passaFiltro(c, { ...FILTRO_VAZIO, busca: "lancamento" }, "eu"));
    assert.ok(passaFiltro(c, { ...FILTRO_VAZIO, resp: "meus" }, "eu"));
    assert.ok(!passaFiltro(c, { ...FILTRO_VAZIO, resp: "ninguem" }, "eu"));
    assert.ok(!passaFiltro(c, { ...FILTRO_VAZIO, cliente: "k2" }, "eu"));
    assert.ok(passaFiltro(c, { ...FILTRO_VAZIO, busca: "padaria" }, "eu", () => "Padaria Aurora"));
  });
});
