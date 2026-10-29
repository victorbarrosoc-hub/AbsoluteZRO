// Colunas do Quadro por organização (drizzle/0024): as 8 de sistema semeadas (organização nova e as que já existiam),
// duas organizações isoladas, só administração e gestão mudam (no banco e na rota), renomear/recolorir/reordenar não
// mexem no que o produto automatiza (a aprovação do cliente leva a Aprovado/Revisão pelo papel), arquivar leva os
// cards para outra coluna pelo card_mudar (histórico só de inclusão), sistema não arquiva, e o resto da casa (Hoje,
// lote) entende coluna da produtora como "em produção".
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";
import type { PessoaZro } from "./zro-falso.mts";

const amb = await prepararAmbiente("colunas");
const { getBanco } = amb.banco;
const cs = await import("../src/lib/quadro/colunas-servidor");
const col = await import("../src/lib/quadro/colunas");
const metodo = await import("../src/lib/quadro/metodo");
const { criarCard, mudarCard, apagarCard, carregarCards } = await import("../src/lib/quadro/servidor");
const { criarCliente } = await import("../src/lib/crm/clientes");
const eq = await import("../src/lib/revisao/equipe");
const link = await import("../src/lib/revisao/link");
const { resumoDoDia } = await import("../src/lib/hoje");
const rotas = await import("../src/lib/zro/rotas");
const { getQuadro, postQuadro } = await import("../src/lib/quadro/rota");

after(() => amb.fechar());

let s: Awaited<ReturnType<typeof duasOrganizacoes>>;
let clienteA: string;
const semCookies = { get: () => undefined };
let ipN = 0;
const novoIp = () => `198.51.100.${++ipN}`;

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const vivas = (l: { id: string; arquivada: boolean; ordem: number }[]) =>
  l
    .filter((c) => !c.arquivada)
    .sort((a, b) => a.ordem - b.ordem)
    .map((c) => c.id);
async function colunaDoCard(org: string, id: string): Promise<string> {
  const [r] = (await getBanco().asSystem("teste", (tx) =>
    tx.execute(sql`select coluna from maestro.cards where org_id = ${org} and id = ${id}`),
  )) as unknown as { coluna: string }[];
  return r.coluna;
}

before(async () => {
  s = await duasOrganizacoes();
  clienteA = ok(
    await criarCliente(s.admin, { nome: "Café Aurora", empresa: null, contato: null, whatsapp: null, email: null, observacoes: null, status: "ativo" }),
  ).id;
});

describe("as colunas de fábrica", () => {
  test("organização nova nasce com as 8 do método, iguais às de metodo.ts (nome, cor e ordem)", async () => {
    const l = await cs.carregarColunas(s.admin);
    assert.deepEqual(
      l.map((c) => [c.id, c.papel, c.nome, c.cor, c.ordem, c.arquivada]),
      metodo.COLUNAS.map((c, i) => [c.k, c.k, c.nome, c.cor, i + 1, false]),
    );
    assert.deepEqual(col.colunasPadrao(), l);
  });

  test("organizações que já existiam antes da 0024 ganham as 8 e nenhum card muda (backfill)", async () => {
    const base = new URL(amb.url);
    base.pathname = "/postgres";
    const admin = postgres(base.toString(), { max: 1, onnotice: () => {} });
    const db = "maestro_test_colunas_backfill";
    await admin.unsafe(`drop database if exists ${db} with (force)`);
    await admin.unsafe(`create database ${db}`);
    await admin.end();
    base.pathname = `/${db}`;
    const banco = postgres(base.toString(), { max: 1, onnotice: () => {} });
    const pasta = mkdtempSync(path.join(tmpdir(), "maestro-0023-"));
    try {
      // migra até a 0023 (journal cortado), cria uma organização com um card e só então aplica a 0024
      cpSync("./drizzle", pasta, { recursive: true });
      const j = JSON.parse(readFileSync(path.join(pasta, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
      writeFileSync(path.join(pasta, "meta/_journal.json"), JSON.stringify({ ...j, entries: j.entries.filter((e) => e.tag < "0024") }));
      const { migrarNoSchema } = await import("../src/lib/db/migrador");
      await migrarNoSchema(banco, pasta);
      const [o] = await banco`insert into maestro.organizations (zro_org_id, name) values (${UUID()}, 'Antiga') returning id`;
      await banco`insert into maestro.cards (org_id, id, dados) values (${o.id}, 'antigo01', ${banco.json({ tema: "Card antigo", coluna: "revisao" })})`;
      const aplicadas = await migrarNoSchema(banco, "./drizzle");
      assert.ok(aplicadas.includes("0024_colunas"));
      const l = await banco`select id, nome, ordem from maestro.colunas where org_id = ${o.id} order by ordem`;
      assert.deepEqual(
        l.map((c) => c.id),
        metodo.COLUNAS.map((c) => c.k),
      );
      const [k] = await banco`select dados ->> 'coluna' as coluna, versao from maestro.cards where org_id = ${o.id}`;
      assert.deepEqual({ ...k }, { coluna: "revisao", versao: 1 });
    } finally {
      await banco.end();
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});

describe("quem muda as colunas", () => {
  test("equipe e leitura leem, mas não mudam (403 no banco)", async () => {
    for (const ctx of [s.equipe, s.leitura]) {
      assert.equal((await cs.carregarColunas(ctx)).length, 8);
      for (const corpo of [
        { op: "coluna_mudar", id: "aprovado", nome: "Ok" },
        { op: "coluna_mudar", id: "pauta", cor: "rosa" },
        { op: "coluna_criar", nome: "Captação" },
        { op: "coluna_ordenar", ids: [...metodo.COLUNAS.map((c) => c.k)].reverse() },
        { op: "colunas_padrao" },
      ]) {
        const r = await cs.operarColuna(ctx, corpo);
        assert.equal(r.ok, false, JSON.stringify(corpo));
        if (!r.ok) assert.equal(r.status, 403);
      }
    }
  });

  test("maestro_app não escreve na tabela direto (só pelas funções)", async () => {
    for (const comando of [
      sql`update maestro.colunas set nome = 'X' where id = 'pauta'`,
      sql`insert into maestro.colunas (org_id, id, nome, cor) values (${s.orgA}, 'x-abcd1234', 'X', 'rosa')`,
      sql`delete from maestro.colunas where id = 'pauta'`,
    ]) {
      await assert.rejects(
        getBanco().asUser(s.admin, (tx) => tx.execute(comando)),
        (e: Error & { cause?: { code?: string } }) => (e.cause?.code ?? (e as { code?: string }).code) === "42501",
      );
    }
  });

  test("gestão renomeia, recolore e reordena; nome vazio ou longo e cor fora da paleta são recusados", async () => {
    const r = ok(await cs.operarColuna(s.gestor, { op: "coluna_mudar", id: "aprovado", nome: "  Pronto   pra  postar " }));
    assert.equal(r.colunas.find((c) => c.id === "aprovado")?.nome, "Pronto pra postar");
    ok(await cs.operarColuna(s.admin, { op: "coluna_mudar", id: "revisao", cor: "ameixa", nome: "Conferência" }));
    for (const corpo of [
      { op: "coluna_mudar", id: "pauta", nome: "   " },
      { op: "coluna_mudar", id: "pauta", nome: "x".repeat(31) },
      { op: "coluna_mudar", id: "pauta", cor: "azul-royal" },
      { op: "coluna_mudar", id: "pauta" },
      { op: "coluna_mudar", id: "Pauta; drop", nome: "x" },
    ]) {
      const e = await cs.operarColuna(s.admin, corpo);
      assert.equal(e.ok, false, JSON.stringify(corpo));
      if (!e.ok) assert.equal(e.status, 400);
    }
    // a 0024 confere de novo no banco (sem passar pela forma do servidor)
    await assert.rejects(getBanco().asUser(s.admin, (tx) => tx.execute(sql`select maestro.coluna_mudar('pauta', ${"   "}, null)`)));
    const nova = [...metodo.COLUNAS.map((c) => c.k)];
    nova.unshift(nova.splice(nova.indexOf("aprovado"), 1)[0]); // Aprovado primeiro
    const o = ok(await cs.operarColuna(s.admin, { op: "coluna_ordenar", ids: nova }));
    assert.deepEqual(vivas(o.colunas), nova);
    // ordem que não bate com as vivas (faltando, repetida, de outra lista) é recusada
    for (const ids of [nova.slice(1), [...nova.slice(1), "pauta"], [...nova.slice(1), "x-naoexiste"]]) {
      const e = await cs.operarColuna(s.admin, { op: "coluna_ordenar", ids });
      assert.equal(e.ok, false);
    }
  });

  test("a rota: leitura e equipe 403; admin muda e a próxima leitura (inclusive ?desde) traz as colunas", async () => {
    const ORG = { id: UUID(), name: "Produtora Rota", role: "owner" };
    const entrar = async (p: PessoaZro) => {
      Object.assign(amb.zro.estado.proximo, { pessoa: p, adulterar: null, negar: false });
      const ida = await rotas.entrar(pedido("/api/zro/entrar"));
      const z = await fetch(new URL(ida.headers.get("location")!), { redirect: "manual" });
      const volta = await rotas.callback(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida).get("mae_zro") } }));
      return cookiesDe(volta).get("mae_sessao")!;
    };
    const dona = await entrar({ sub: UUID(), email: "dona@rota.exemplo", nome: "Dona", org: ORG, produtos: ["maestro"] });
    const edi = await entrar({ sub: UUID(), email: "edi@rota.exemplo", nome: "Edi", org: { ...ORG, role: "editor" }, produtos: ["maestro"] });
    const ver = await entrar({ sub: UUID(), email: "ver@rota.exemplo", nome: "Ver", org: { ...ORG, role: "viewer" }, produtos: ["maestro"] });
    const gravar = (sessao: string, corpo: Record<string, unknown>) => postQuadro(pedido("/api/quadro", { cookies: { mae_sessao: sessao }, corpo }));
    assert.equal((await gravar(ver, { op: "coluna_mudar", id: "pauta", nome: "Ideias" })).status, 403);
    assert.equal((await gravar(edi, { op: "coluna_mudar", id: "pauta", nome: "Ideias" })).status, 403);
    const l0 = await (await getQuadro(pedido("/api/quadro", { cookies: { mae_sessao: edi } }))).json();
    assert.equal(l0.podeEditarColunas, false);
    assert.equal(l0.podeEscrever, true);
    const r = await gravar(dona, { op: "coluna_mudar", id: "pauta", nome: "Ideias" });
    assert.equal(r.status, 200);
    const l1 = await (await getQuadro(pedido("/api/quadro", { cookies: { mae_sessao: dona } }))).json();
    assert.equal(l1.podeEditarColunas, true);
    assert.equal(l1.colunas[0].nome, "Ideias");
    const d = await (await getQuadro(pedido(`/api/quadro?desde=${encodeURIComponent(l1.cursor)}`, { cookies: { mae_sessao: ver } }))).json();
    assert.equal(d.colunas.find((c: { id: string }) => c.id === "pauta").nome, "Ideias");
    // de outra origem não grava
    assert.equal(
      (await postQuadro(pedido("/api/quadro", { cookies: { mae_sessao: dona }, corpo: { op: "colunas_padrao" }, origin: "https://outro.exemplo" }))).status,
      403,
    );
  });
});

describe("duas organizações", () => {
  test("cada uma vê só as dela; a B não renomeia, arquiva nem usa coluna da A", async () => {
    const a = ok(await cs.operarColuna(s.admin, { op: "coluna_criar", nome: "Captação", cor: "ceu" }));
    const idA = a.colunas.find((c) => c.nome === "Captação")!.id;
    assert.match(idA, /^x-[a-z0-9]{12}$/);
    const daB = await cs.carregarColunas(s.b);
    assert.equal(daB.length, 8);
    assert.ok(!daB.some((c) => c.id === idA));
    assert.ok(daB.every((c) => metodo.ehPapel(c.id)));
    assert.equal(daB.find((c) => c.id === "aprovado")?.nome, "Aprovado", "o nome da A não vaza para a B");
    const r = await cs.operarColuna(s.b, { op: "coluna_mudar", id: idA, nome: "Roubada" });
    assert.equal(!r.ok && r.status, 404);
    const ar = await cs.operarColuna(s.b, { op: "coluna_arquivar", id: idA, destino: "pauta" });
    assert.equal(!ar.ok && ar.status, 404);
    // card da B não entra na coluna da A
    ok(await criarCard(s.b, "cardB001", { tema: "Da B" }));
    const m = await mudarCard(s.b, "cardB001", { coluna: idA });
    assert.equal(!m.ok && m.status, 409);
    assert.equal(await colunaDoCard(s.orgB, "cardB001"), "pauta");
    // forjar a organização na sessão não dá acesso
    assert.equal((await cs.carregarColunas(s.forjado)).length, 0);
  });
});

describe("arquivar e restaurar", () => {
  let cap: string;
  test("card entra na coluna nova; sistema não arquiva; arquivar leva os cards (os apagados também) e o histórico só cresce", async () => {
    cap = (await cs.carregarColunas(s.admin)).find((c) => c.nome === "Captação")!.id;
    ok(await criarCard(s.equipe, "capt0001", { tema: "Diária no estúdio", coluna: cap, cliente: clienteA }));
    ok(await criarCard(s.equipe, "capt0002", { tema: "Externa no parque", coluna: "pauta" }));
    ok(await mudarCard(s.equipe, "capt0002", { coluna: cap, ordem: 5 }));
    ok(await criarCard(s.equipe, "capt0003", { tema: "Apagado", coluna: cap }));
    ok(await apagarCard(s.equipe, "capt0003"));
    for (const id of metodo.COLUNAS.map((c) => c.k)) {
      const r = await cs.operarColuna(s.admin, { op: "coluna_arquivar", id, destino: cap });
      assert.equal(!r.ok && r.erro, "coluna_sistema", id);
    }
    // o check do banco também barra (sem passar pela função)
    const semFuncao = await getBanco()
      .asSystem("teste", (tx) => tx.execute(sql`update maestro.colunas set arquivada_em = now() where org_id = ${s.orgA} and id = 'aprovado'`))
      .then(
        () => null,
        (e) => e,
      );
    assert.ok(semFuncao, "coluna de sistema não arquiva nem por fora da função");
    const destinoRuim = await cs.operarColuna(s.admin, { op: "coluna_arquivar", id: cap, destino: cap });
    assert.equal(!destinoRuim.ok && destinoRuim.erro, "coluna_destino");
    assert.equal((await cs.operarColuna(s.equipe, { op: "coluna_arquivar", id: cap, destino: "fazendo" })).ok, false);

    const hAntes = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select n, operacao, campos from maestro.card_history where org_id = ${s.orgA} order by n`),
    )) as unknown as { n: number; operacao: string; campos: unknown }[];
    const r = ok(await cs.operarColuna(s.gestor, { op: "coluna_arquivar", id: cap, destino: "fazendo" }));
    assert.equal(r.movidos, 3);
    assert.ok(r.colunas.find((c) => c.id === cap)?.arquivada);
    assert.ok(!vivas(r.colunas).includes(cap));
    for (const id of ["capt0001", "capt0002", "capt0003"]) assert.equal(await colunaDoCard(s.orgA, id), "fazendo", id);
    const hDepois = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select n, operacao, campos from maestro.card_history where org_id = ${s.orgA} order by n`),
    )) as unknown as { n: number; operacao: string; campos: { coluna?: unknown[] } }[];
    assert.deepEqual([...hDepois.slice(0, hAntes.length)], [...hAntes], "o que já estava no histórico não muda");
    const novas = hDepois.slice(hAntes.length);
    assert.equal(novas.length, 3);
    assert.ok(novas.every((h) => h.operacao === "mudar" && JSON.stringify(h.campos.coluna) === JSON.stringify([cap, "fazendo"])));
    // a ordem de antes vale no destino (capt0001 sem ordem vai depois do capt0002 com ordem 5)
    const { cards } = await carregarCards(s.admin);
    const ordem = (id: string) => cards.find((c) => c.id === id)!.dados.ordem!;
    assert.ok(ordem("capt0002") < ordem("capt0001"));
    // coluna arquivada não recebe card (nem por criar nem por mover)
    assert.equal((await mudarCard(s.admin, "capt0001", { coluna: cap })).ok, false);
    const c = await criarCard(s.admin, "capt0009", { tema: "x", coluna: cap });
    assert.equal(!c.ok && c.erro, "coluna");
    // de novo: nada a fazer
    assert.equal(ok(await cs.operarColuna(s.admin, { op: "coluna_arquivar", id: cap, destino: "pauta" })).movidos, 0);
  });

  test("restaurar traz a coluna de volta no fim; restaurar o padrão volta nomes, cores e ordem do método", async () => {
    const r = ok(await cs.operarColuna(s.admin, { op: "coluna_restaurar", id: cap }));
    assert.equal(vivas(r.colunas).at(-1), cap);
    ok(await mudarCard(s.admin, "capt0001", { coluna: cap }));
    const p = ok(await cs.operarColuna(s.admin, { op: "colunas_padrao" }));
    assert.deepEqual(vivas(p.colunas), [...metodo.COLUNAS.map((c) => c.k), cap]);
    for (const c of metodo.COLUNAS) {
      const d = p.colunas.find((x) => x.id === c.k)!;
      assert.deepEqual([d.nome, d.cor], [c.nome, c.cor]);
    }
    assert.equal(p.colunas.find((c) => c.id === cap)?.nome, "Captação", "a da produtora fica como estava");
    assert.equal(await colunaDoCard(s.orgA, "capt0001"), cap, "nenhum card muda");
  });

  test("limite de colunas da produtora", async () => {
    const atuais = (await cs.carregarColunas(s.admin)).filter((c) => !c.papel).length;
    for (let i = atuais; i < col.LIMITE_COLUNAS_DA_PRODUTORA; i++) ok(await cs.operarColuna(s.admin, { op: "coluna_criar", nome: `Extra ${i}` }));
    const r = await cs.operarColuna(s.admin, { op: "coluna_criar", nome: "Uma a mais" });
    assert.equal(!r.ok && r.erro, "coluna_limite");
    // nova coluna numa posição: entra lá (e a ordem das outras se ajusta)
    const b = ok(await cs.operarColuna(s.b, { op: "coluna_criar", nome: "Color", cor: "rosa", posicao: 2 }));
    assert.equal(vivas(b.colunas)[1], b.colunas.find((c) => c.nome === "Color")!.id);
    assert.deepEqual(
      vivas(b.colunas).filter((id) => id !== b.colunas.find((c) => c.nome === "Color")!.id),
      metodo.COLUNAS.map((c) => c.k),
    );
  });
});

describe("as automações seguem o papel, não o nome", () => {
  test("renomeadas e reordenadas, o link leva Revisão → Em aprovação e a decisão leva a Aprovado ou Revisão", async () => {
    ok(await cs.operarColuna(s.admin, { op: "coluna_mudar", id: "revisao", nome: "Checagem", cor: "rosa" }));
    ok(await cs.operarColuna(s.admin, { op: "coluna_mudar", id: "aprovacao", nome: "Com o cliente" }));
    ok(await cs.operarColuna(s.admin, { op: "coluna_mudar", id: "aprovado", nome: "Liberado" }));
    const ordem = vivas(await cs.carregarColunas(s.admin)).reverse();
    ok(await cs.operarColuna(s.admin, { op: "coluna_ordenar", ids: ordem }));
    for (const id of ["auto0001", "auto0002"]) ok(await criarCard(s.admin, id, { tema: `Peça ${id}`, coluna: "revisao", cliente: clienteA }));
    const lote = ok(await eq.criarLote(s.admin, { clienteId: clienteA, titulo: "Semana 45", cards: ["auto0001", "auto0002"] })).id;
    const { token } = ok(await eq.gerarLink(s.admin, lote));
    assert.equal(await colunaDoCard(s.orgA, "auto0001"), "aprovacao");
    const r = await link.enviarDecisoes(token, semCookies, novoIp(), "teste", {
      nome: "Marina",
      aceite: true,
      decisoes: [
        { card: "auto0001", versao: null, decisao: "aprovado" },
        { card: "auto0002", versao: null, decisao: "ajuste", nota: "Trocar a trilha" },
      ],
    });
    assert.ok("ok" in r && r.ok, JSON.stringify(r));
    assert.equal(await colunaDoCard(s.orgA, "auto0001"), "aprovado");
    assert.equal(await colunaDoCard(s.orgA, "auto0002"), "revisao");
    const lido = await eq.carregarLote(s.admin, lote);
    assert.deepEqual(
      lido!.pecas.map((p) => [p.card, p.colunaNome]),
      [
        ["auto0001", "Liberado"],
        ["auto0002", "Checagem"],
      ],
    );
  });

  test("coluna da produtora conta como em produção: prazo, Hoje e o lote", async () => {
    const extra = (await cs.carregarColunas(s.admin)).find((c) => !c.papel && !c.arquivada)!;
    const ontem = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const hoje = new Date().toISOString().slice(0, 10);
    ok(await criarCard(s.admin, "prod0001", { tema: "Atrasado na coluna nova", coluna: extra.id, prazo: ontem, cliente: clienteA }));
    assert.equal(metodo.estadoPrazo({ coluna: extra.id, prazo: ontem }, hoje), "atrasado");
    assert.equal(metodo.estadoPrazo({ coluna: "aprovado", prazo: ontem }, hoje), "ok");
    assert.equal(metodo.proximoPasso({ coluna: extra.id })?.principal.acao, "mover");
    const r = await resumoDoDia(s.admin, false, hoje);
    const v = r.vencendo.find((k) => k.id === "prod0001");
    assert.ok(v, "aparece em Vencendo");
    assert.equal(v.cor, extra.cor);
    assert.ok(r.cards.atrasados >= 1);
    const disponiveis = await eq.cardsDisponiveis(s.admin);
    assert.equal(disponiveis.find((k) => k.id === "prod0001")?.colunaNome, extra.nome);
  });
});

describe("acesso por cliente", () => {
  test("quem só vê alguns clientes também lê as colunas (coluna não é de cliente)", async () => {
    await getBanco().asSystem("teste", async (tx) => {
      await tx.execute(sql`insert into maestro.acesso_restrito (org_id, zro_sub) values (${s.orgA}, ${s.equipe.sub})`);
    });
    const l = await cs.carregarColunas(s.equipe);
    assert.ok(l.length >= 8);
    assert.equal(l.find((c) => c.id === "aprovado")?.nome, "Liberado");
  });
});

describe("puro", () => {
  test("nome, ordem, forma do id e paleta", () => {
    assert.equal(col.nomeDeColuna("  Color   grading "), "Color grading");
    assert.equal(col.nomeDeColuna(""), undefined);
    assert.equal(col.nomeDeColuna("x".repeat(31)), undefined);
    assert.deepEqual(col.moverNaLista(["a", "b", "c", "d"], "a", 2), ["b", "c", "a", "d"]);
    assert.deepEqual(col.moverNaLista(["a", "b", "c"], "c", 0), ["c", "a", "b"]);
    assert.ok(metodo.ehColuna("x-ab12cd34ef56"));
    assert.ok(!metodo.ehColuna("x-AB"));
    assert.ok(!metodo.ehColuna("publicado"));
    assert.equal(metodo.valorDoCampo("coluna", "x-ab12cd34ef56"), "x-ab12cd34ef56");
    assert.equal(metodo.valorDoCampo("coluna", "x-'; drop"), undefined);
    assert.equal(col.CORES_COLUNA.length, Object.keys(col.TONS_COLUNA).length);
  });

  test("a paleta do CSS é a mesma do código e cada cor se distingue do fundo (claro e escuro)", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const luz = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contraste = (a: string, b: string) => {
      const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    for (const c of col.CORES_COLUNA) {
      assert.match(css, new RegExp(`\\[data-cor="${c.k}"\\] \\{\\s*--col: var\\(--cor-${c.k}\\);`), c.k);
      const t = col.TONS_COLUNA[c.k];
      // ponto e filete (nunca texto): visível sobre o cartão branco e sobre a coluna escura
      assert.ok(contraste(t.claro, "#ffffff") >= 2, `${c.k} no claro: ${contraste(t.claro, "#ffffff").toFixed(2)}`);
      assert.ok(contraste(t.escuro, "#1c1c22") >= 3, `${c.k} no escuro: ${contraste(t.escuro, "#1c1c22").toFixed(2)}`);
    }
    for (const k of ["rosa", "ceu", "ameixa", "grafite"] as const) {
      assert.ok(css.includes(`--cor-${k}: ${col.TONS_COLUNA[k].claro};`), k);
      assert.ok(css.includes(`--cor-${k}: ${col.TONS_COLUNA[k].escuro};`), k);
    }
  });
});
