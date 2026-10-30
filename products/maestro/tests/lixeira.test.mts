// Criação · apagar e a lixeira (titular, 30/10/2026: "uma opção fácil de excluir o projeto"), roteiros e fluxos iguais:
// o que é puro (o pedido de cada ação, a linha do aviso, o que sai de vez, as contas do deslizar e os papéis) e o que
// passa pelas rotas: mandar para a lixeira e restaurar (quem edita), apagar de vez só da lixeira e só administração e
// gestão, roteiro com versão salva fica guardado, auditoria, outra organização não alcança e o link vivo do fluxo na
// lista (que o aviso usa).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import type { PessoaZro } from "./zro-falso.mts";

const amb = await prepararAmbiente("lixeira");
const { zro } = amb;
const { sql } = await import("drizzle-orm");
const rotas = await import("../src/lib/zro/rotas");
const { postRoteiro } = await import("../src/lib/criacao/roteiro/rota");
const { postFluxo } = await import("../src/lib/criacao/fluxo/rota");
const rt = await import("../src/lib/criacao/roteiro/servidor");
const fx = await import("../src/lib/criacao/fluxo/servidor");
const lk = await import("../src/lib/criacao/fluxo/link");
const lx = await import("../src/lib/criacao/lixeira");
const dz = await import("../src/components/criacao/deslizar");
const pm = await import("../src/lib/criacao/permissoes");

const ORG_A = { id: UUID(), name: "Produtora A", role: "owner" };
const ORG_B = { id: UUID(), name: "Produtora B", role: "owner" };
const ANA: PessoaZro = { sub: UUID(), email: "ana@a.exemplo", nome: "Ana", org: ORG_A, produtos: ["maestro"] };
const GIL: PessoaZro = { sub: UUID(), email: "gil@a.exemplo", nome: "Gil", org: { ...ORG_A, role: "manager" }, produtos: ["maestro"] };
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
/** A ação da lista, pelo mesmo pedido que a tela faz (`pedidoDaLixeira`). */
async function acao(s: string, tipo: "roteiro" | "fluxo", id: string, a: "apagar" | "restaurar" | "de_vez") {
  const { url, corpo } = lx.pedidoDaLixeira(tipo, id, a);
  const r =
    tipo === "roteiro"
      ? await postRoteiro(pedido(url, { cookies: { mae_sessao: s }, corpo: corpo as Corpo }), id)
      : await postFluxo(pedido(url, { cookies: { mae_sessao: s }, corpo: corpo as Corpo }));
  return { status: r.status, d: (await r.json()) as { erro?: string; mensagem?: string } };
}

let ana: string, gil: string, edu: string, leo: string, bia: string;
let orgA: string;
const ctxDe = (p: PessoaZro) => ({ sub: p.sub, orgId: orgA });

before(async () => {
  ana = await entrar(ANA);
  gil = await entrar(GIL);
  edu = await entrar(EDU);
  leo = await entrar(LEO);
  bia = await entrar(BIA);
  const [o] = await amb.banco.getBanco().sql`select id from maestro.organizations where zro_org_id = ${ORG_A.id}`;
  orgA = o.id;
});

describe("lixeira: o que é puro", () => {
  test("o pedido de cada ação vai à rota do tipo", () => {
    assert.deepEqual(lx.pedidoDaLixeira("roteiro", "r1", "apagar"), { url: "/api/criacao/roteiros/r1", corpo: { op: "lixeira", apagar: true } });
    assert.deepEqual(lx.pedidoDaLixeira("roteiro", "r1", "restaurar"), { url: "/api/criacao/roteiros/r1", corpo: { op: "lixeira", apagar: false } });
    assert.deepEqual(lx.pedidoDaLixeira("roteiro", "r1", "de_vez"), { url: "/api/criacao/roteiros/r1", corpo: { op: "apagar_de_vez" } });
    assert.deepEqual(lx.pedidoDaLixeira("fluxo", "f1", "apagar"), { url: "/api/criacao/fluxo", corpo: { op: "lixeira", id: "f1" } });
    assert.deepEqual(lx.pedidoDaLixeira("fluxo", "f1", "restaurar"), { url: "/api/criacao/fluxo", corpo: { op: "restaurar", id: "f1" } });
    assert.deepEqual(lx.pedidoDaLixeira("fluxo", "f1", "de_vez"), { url: "/api/criacao/fluxo", corpo: { op: "apagar_de_vez", id: "f1" } });
    assert.equal(lx.listaDepoisDeApagar("roteiro", "r1"), "/app/criacao?apagou=r1");
    assert.equal(lx.listaDepoisDeApagar("fluxo", "f1"), "/app/criacao/fluxos?apagou=f1");
  });

  test("o aviso diz numa linha o que muda (card, link) e nada quando não há", () => {
    assert.equal(lx.avisoAoApagar({ card: null, links: 0 }), null);
    assert.equal(lx.avisoAoApagar({ card: "Gravação", links: 0 }), "Sai do card até voltar da lixeira.");
    assert.equal(lx.avisoAoApagar({ card: null, links: 1 }), "O link para de abrir.");
    assert.equal(lx.avisoAoApagar({ card: null, links: 3 }), "Os links param de abrir.");
    assert.equal(lx.avisoAoApagar({ card: "Gravação", links: 2 }), "Sai do card e os links param de abrir.");
    for (const t of [lx.avisoAoApagar({ card: "x", links: 1 })!, lx.POR_QUE_FICA]) assert.ok(t.length <= 44 && !t.includes("\n"), t);
  });

  test("sai de vez: fluxo sempre; roteiro só sem versão salva", () => {
    assert.equal(lx.saiDeVez({ tipo: "fluxo", versoes: 0 }), true);
    assert.equal(lx.saiDeVez({ tipo: "roteiro", versoes: 0 }), true);
    assert.equal(lx.saiDeVez({ tipo: "roteiro", versoes: 2 }), false);
  });

  test("deslizar: elástico para a direita, para no fim, arma depois de 55%, solta pelo lugar e pela velocidade", () => {
    assert.ok(dz.deslocamento(200, 360).x > 0 && dz.deslocamento(200, 360).x < 24, "para a direita só um elástico curto");
    assert.deepEqual(dz.deslocamento(-60, 360), { x: -60, armado: false });
    assert.deepEqual(dz.deslocamento(-200, 360), { x: -200, armado: true });
    assert.equal(dz.deslocamento(-900, 360).x, -360, "não passa da largura");
    assert.equal(dz.aoSoltar(-200, 360), "apagar");
    assert.equal(dz.aoSoltar(-60, 360), "abrir");
    assert.equal(dz.aoSoltar(-30, 360), "fechar");
    assert.equal(dz.aoSoltar(-20, 360, -1), "abrir", "jogou para a esquerda");
    assert.equal(dz.aoSoltar(-80, 360, 1), "fechar", "jogou para a direita");
    assert.equal(dz.intencao(3, 4, false), "toque");
    assert.equal(dz.intencao(-20, 4, false), "deslizar");
    assert.equal(dz.intencao(20, 4, false), "rolar", "fechado, para a direita é do Safari");
    assert.equal(dz.intencao(20, 4, true), "deslizar", "aberto, para a direita fecha");
    assert.equal(dz.intencao(-6, 30, false), "rolar");
  });

  test("papéis: lixeira e restaurar = quem edita; apagar de vez = administração e gestão", () => {
    assert.deepEqual((["admin", "gestor", "equipe", "leitura"] as const).filter(pm.podeEditarCriacao), ["admin", "gestor", "equipe"]);
    assert.deepEqual((["admin", "gestor", "equipe", "leitura"] as const).filter(pm.podeApagarDeVezCriacao), ["admin", "gestor"]);
  });
});

describe("lixeira: roteiros pela rota", () => {
  test("equipe manda para a lixeira e restaura; leitura e outra organização não", async () => {
    const r = await rt.criarRoteiro(ctxDe(EDU), { titulo: "Reels da cafeteria", modelo: "reels" });
    assert.ok(r.ok);
    assert.equal((await acao(leo, "roteiro", r.id, "apagar")).status, 403, "leitura não apaga");
    assert.equal((await acao(bia, "roteiro", r.id, "apagar")).status, 404, "outra organização não acha");
    assert.equal((await acao(edu, "roteiro", r.id, "apagar")).status, 200);
    assert.equal(
      (await rt.listarRoteiros(ctxDe(ANA))).some((x) => x.id === r.id),
      false,
      "sai da lista",
    );
    assert.equal(
      (await rt.listarRoteiros(ctxDe(ANA), { lixeira: true })).some((x) => x.id === r.id),
      true,
      "vai para a lixeira",
    );
    assert.equal((await acao(edu, "roteiro", r.id, "apagar")).status, 200, "de novo não quebra (Desfazer e duplo toque)");
    assert.equal((await acao(leo, "roteiro", r.id, "restaurar")).status, 403);
    assert.equal((await acao(edu, "roteiro", r.id, "restaurar")).status, 200);
    assert.equal(
      (await rt.listarRoteiros(ctxDe(ANA))).some((x) => x.id === r.id),
      true,
      "volta para a lista",
    );
  });

  test("apagar de vez: só da lixeira, só administração e gestão, com auditoria", async () => {
    const r = await rt.criarRoteiro(ctxDe(EDU), { titulo: "Rascunho solto" });
    assert.ok(r.ok);
    const fora = await acao(ana, "roteiro", r.id, "de_vez");
    assert.equal(fora.status, 409);
    assert.equal(fora.d.erro, "fora_da_lixeira");
    assert.equal((await acao(edu, "roteiro", r.id, "apagar")).status, 200);
    assert.equal((await acao(edu, "roteiro", r.id, "de_vez")).status, 403, "equipe não apaga de vez");
    assert.equal((await acao(leo, "roteiro", r.id, "de_vez")).status, 403);
    assert.equal((await acao(bia, "roteiro", r.id, "de_vez")).status, 404, "administração de outra organização não acha");
    assert.equal(lx.saiDeVez({ tipo: "roteiro", versoes: 0 }), true);
    assert.equal((await acao(gil, "roteiro", r.id, "de_vez")).status, 200, "gestão apaga de vez");
    assert.equal(await rt.obterRoteiro(ctxDe(ANA), r.id), null);
    assert.equal((await acao(gil, "roteiro", r.id, "de_vez")).status, 404, "já não existe");
    const [a] = await amb.banco.getBanco().sql`select actor_sub, metadata from maestro.audit_log where action = 'roteiro.apagou' and target_id = ${r.id}`;
    assert.equal(a.actor_sub, GIL.sub);
    assert.equal(a.metadata.titulo, "Rascunho solto");
  });

  test("roteiro com versão salva não sai de vez (fica guardado na lixeira) e restaura com as versões", async () => {
    const r = await rt.criarRoteiro(ctxDe(EDU), { titulo: "Institucional", modelo: "institucional" });
    assert.ok(r.ok);
    assert.ok((await rt.salvarVersao(ctxDe(EDU), r.id)).ok);
    assert.equal((await acao(edu, "roteiro", r.id, "apagar")).status, 200);
    const [na] = (await rt.listarRoteiros(ctxDe(ANA), { lixeira: true })).filter((x) => x.id === r.id);
    assert.equal(lx.saiDeVez({ tipo: "roteiro", versoes: na.versaoAtual }), false, "a tela nem oferece");
    const deVez = await acao(ana, "roteiro", r.id, "de_vez");
    assert.equal(deVez.status, 409);
    assert.equal(deVez.d.erro, "tem_versao");
    // nem pelo banco direto (as versões são registro imutável)
    await assert.rejects(amb.banco.getBanco().asUser(ctxDe(ANA), (tx) => tx.execute(sql`delete from maestro.roteiros where id = ${r.id}`)));
    assert.equal((await acao(edu, "roteiro", r.id, "restaurar")).status, 200);
    assert.equal((await rt.listarVersoes(ctxDe(ANA), r.id)).length, 1, "a versão continua lá");
  });
});

describe("lixeira: fluxos pela rota", () => {
  test("lixeira e restaurar (quem edita), apagar de vez (administração e gestão), link vivo na lista", async () => {
    const f = await fx.criarFluxo(ctxDe(EDU), { titulo: "Ideias do clipe" });
    assert.ok(f.ok);
    const vivo = await lk.criarLinkFluxo(ctxDe(ANA), f.id, { dias: 7 });
    assert.ok(vivo.ok);
    const daAna = (await fx.listarFluxos(ctxDe(ANA))).find((x) => x.id === f.id);
    assert.equal(daAna?.linksVivos, 1, "administração vê o link vivo (o aviso diz que para de abrir)");
    assert.equal(lx.avisoAoApagar({ card: daAna!.card, links: daAna!.linksVivos }), "O link para de abrir.");
    assert.equal((await fx.listarFluxos(ctxDe(EDU))).find((x) => x.id === f.id)?.linksVivos, 0, "equipe não lê os links (RLS)");
    assert.ok((await lk.revogarLinkFluxo(ctxDe(ANA), vivo.link.id)).ok);
    assert.equal((await fx.listarFluxos(ctxDe(ANA))).find((x) => x.id === f.id)?.linksVivos, 0, "revogado não conta");

    assert.equal((await acao(leo, "fluxo", f.id, "apagar")).status, 403);
    assert.equal((await acao(edu, "fluxo", f.id, "apagar")).status, 200);
    assert.equal(
      (await fx.listarFluxos(ctxDe(ANA))).some((x) => x.id === f.id),
      false,
    );
    assert.equal((await acao(edu, "fluxo", f.id, "restaurar")).status, 200);
    assert.equal(
      (await fx.listarFluxos(ctxDe(ANA))).some((x) => x.id === f.id),
      true,
    );
    assert.equal((await acao(ana, "fluxo", f.id, "de_vez")).status, 409, "só da lixeira");
    assert.equal((await acao(edu, "fluxo", f.id, "apagar")).status, 200);
    assert.equal((await acao(edu, "fluxo", f.id, "de_vez")).status, 403, "equipe não apaga de vez");
    assert.equal((await acao(bia, "fluxo", f.id, "de_vez")).status, 404);
    assert.equal((await acao(gil, "fluxo", f.id, "de_vez")).status, 200);
    assert.equal(await fx.obterFluxo(ctxDe(ANA), f.id), null);
  });
});
