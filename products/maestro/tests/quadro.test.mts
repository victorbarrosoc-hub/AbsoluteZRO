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
const { proximoPasso, ordemEntre, passaFiltro, FILTRO_VAZIO, dadosDaCopia, linkDoCard, LIMITE_TEMA } = await import("../src/lib/quadro/metodo");
const { dicaDoCodigo } = await import("../src/lib/crm/codigo");

const ORG_A = { id: UUID(), name: "Produtora A", role: "owner" };
const ORG_B = { id: UUID(), name: "Produtora B", role: "owner" };
const LIA: PessoaZro = { sub: UUID(), email: "lia@a.exemplo", nome: "Lia", org: ORG_A, produtos: ["maestro"] };
const RUI: PessoaZro = { sub: UUID(), email: "rui@a.exemplo", nome: "Rui", org: { ...ORG_A, role: "editor" }, produtos: ["maestro"] };
const VIC: PessoaZro = { sub: UUID(), email: "vic@a.exemplo", nome: "Vic", org: { ...ORG_A, role: "viewer" }, produtos: ["maestro"] };
const BIA: PessoaZro = { sub: UUID(), email: "bia@b.exemplo", nome: "Bia", org: ORG_B, produtos: ["maestro"] };
// Com o SOBEDESCE no plano: as pastas do Drive no card.
const TEO: PessoaZro = { sub: UUID(), email: "teo@a.exemplo", nome: "Teo", org: { ...ORG_A, role: "editor" }, produtos: ["maestro", "sobedesce"] };

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

let lia: string, rui: string, vic: string, bia: string, teo: string;
let orgA: string;
let clienteA: string;

before(async () => {
  lia = await entrar(LIA);
  rui = await entrar(RUI);
  vic = await entrar(VIC);
  bia = await entrar(BIA);
  teo = await entrar(TEO);
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

  test("duplicar (titular, 03/11/2026): a cópia passa pela mesma rota, leva os campos e nada do histórico; leitura não duplica", async () => {
    const original = (await (await ler(lia)).json()).cards.find((c: { id: string }) => c.id === "cardQ0001");
    assert.ok(original);
    const copia = dadosDaCopia(original.dados, null);
    const r = await gravar(rui, { op: "criar", id: "cardQ0001c", dados: copia });
    assert.equal(r.status, 200);
    const { card } = await r.json();
    assert.equal(card.dados.tema, `${original.dados.tema} (cópia)`);
    for (const k of ["coluna", "cliente", "resp", "prazo", "prioridade"]) assert.deepEqual(card.dados[k], original.dados[k], k);
    assert.ok(card.dados.ordem > (original.dados.ordem ?? 0), "logo depois do original");
    assert.equal(card.dados.criadoPor, RUI.sub, "quem duplicou é quem criou a cópia");
    assert.equal(card.dados.capa, undefined);
    assert.equal(card.versao, 1, "nasce sem histórico");
    // quem só lê não duplica; outra organização não vê nem o original nem a cópia (o link do card não abre nada lá)
    assert.equal((await gravar(vic, { op: "criar", id: "cardV0002", dados: copia })).status, 403);
    const deB = await (await ler(bia)).json();
    assert.ok(!deB.cards.some((c: { id: string }) => c.id === "cardQ0001" || c.id === "cardQ0001c"));
    assert.equal((await gravar(lia, { op: "apagar", id: "cardQ0001c" })).status, 200);
  });
});

describe("método", () => {
  test("próximo passo de cada coluna", () => {
    assert.equal(proximoPasso({ coluna: "pauta" })?.principal.acao, "atribuir");
    assert.deepEqual(proximoPasso({ coluna: "pauta", resp: "x" })?.principal, { acao: "mover", para: "afazer", rotulo: "Para a fazer" });
    assert.equal(proximoPasso({ coluna: "aprovacao" })?.outro?.rotulo, "Pediu ajuste");
    assert.equal(proximoPasso({ coluna: "entregue" }), null);
  });
  test("a cópia do card: título com (cópia) dentro do limite, campos principais, entre o original e o seguinte", () => {
    const d = {
      tema: "Teaser",
      coluna: "fazendo" as const,
      ordem: 2,
      cliente: "k1",
      projeto: "p1",
      resp: "eu",
      prazo: "2026-11-10",
      prioridade: "alta" as const,
      briefing: "Luz da manhã.",
      tipo: "reels",
      previsto: 120,
      capa: { sha: "a".repeat(64), l: 960, a: 540 },
      criadoEm: 1,
      criadoPor: "outra",
      colunaEm: 1,
    };
    const c = dadosDaCopia(d, { ordem: 3 });
    assert.deepEqual(c, {
      tema: "Teaser (cópia)",
      coluna: "fazendo",
      ordem: 2.5,
      cliente: "k1",
      projeto: "p1",
      resp: "eu",
      prazo: "2026-11-10",
      prioridade: "alta",
      briefing: "Luz da manhã.",
      tipo: "reels",
      previsto: 120,
    });
    assert.equal(dadosDaCopia(d).ordem, 3, "último da coluna: logo depois");
    const longo = dadosDaCopia({ tema: "x".repeat(LIMITE_TEMA), coluna: "pauta" });
    assert.equal(longo.tema.length, LIMITE_TEMA);
    assert.ok(longo.tema.endsWith(" (cópia)"));
    assert.deepEqual(Object.keys(dadosDaCopia({ tema: "a", coluna: "pauta", briefing: "" })).sort(), ["coluna", "ordem", "tema"]);
  });

  test("o link do card é interno (o Quadro com a ficha); a dica do código do projeto", () => {
    assert.equal(linkDoCard("https://maestro.absolutezro.com/", "c1x_y-2"), "https://maestro.absolutezro.com/app/quadro?card=c1x_y-2");
    assert.equal(linkDoCard("http://localhost:3217", "a b"), "http://localhost:3217/app/quadro?card=a%20b");
    assert.equal(dicaDoCodigo("MAE-2026-001"), "Código do projeto: MAE (Maestro) + ano 2026 + nº 1 do ano");
    assert.equal(dicaDoCodigo("MAE-2026-0123"), "Código do projeto: MAE (Maestro) + ano 2026 + nº 123 do ano");
    assert.equal(dicaDoCodigo("ABC-1"), "Código do projeto");
    assert.equal(dicaDoCodigo(null), "Código do projeto");
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

describe("as pastas do Drive no card (Brutos e Entrega)", () => {
  const pastas = () => import("../src/lib/quadro/pastas");
  const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

  test("o link colado: as formas do Drive e só pasta", async () => {
    const { lerLinkDaPasta, enderecoDaPasta } = await pastas();
    const casos: [string, string | null][] = [
      [`https://drive.google.com/drive/folders/${ID}`, ID],
      [`https://drive.google.com/drive/folders/${ID}?usp=sharing`, ID],
      [`https://drive.google.com/drive/folders/${ID}/`, ID],
      [`https://drive.google.com/drive/u/1/folders/${ID}?usp=drive_link`, ID],
      [`https://drive.google.com/drive/mobile/folders/${ID}`, ID],
      [`drive.google.com/drive/folders/${ID}`, ID],
      [`  https://drive.google.com/drive/folders/${ID}  `, ID],
      [`http://drive.google.com/drive/folders/${ID}`, ID],
      [`https://drive.google.com/folderview?id=${ID}`, ID],
      [`https://drive.google.com/embeddedfolderview?id=${ID}#grid`, ID],
      ["https://drive.google.com/drive/folders/0AbCdEfGhIjKlMnOpQ", "0AbCdEfGhIjKlMnOpQ"],
      // arquivo, outro site, sem id, id estranho, credencial no endereço, Docs
      [`https://drive.google.com/file/d/${ID}/view`, null],
      [`https://drive.google.com/open?id=${ID}`, null],
      [`https://drive.google.com.exemplo.com/drive/folders/${ID}`, null],
      [`https://exemplo.com/drive/folders/${ID}`, null],
      [`https://docs.google.com/drive/folders/${ID}`, null],
      ["https://drive.google.com/drive/folders/", null],
      ["https://drive.google.com/drive/folders/abc", null],
      [`https://drive.google.com/drive/folders/${ID}%22onload`, null],
      [`https://eu:senha@drive.google.com/drive/folders/${ID}`, null],
      [`javascript:alert(1)//drive.google.com/drive/folders/${ID}`, null],
      [`https://drive.google.com/drive/my-drive`, null],
      ["", null],
    ];
    for (const [t, id] of casos) assert.equal(lerLinkDaPasta(t)?.id ?? null, id, t);
    // a resourcekey de pasta antiga vai junto; lixo nela fica de fora
    assert.deepEqual(lerLinkDaPasta(`https://drive.google.com/drive/folders/${ID}?resourcekey=0-AbC_d`), { id: ID, chave: "0-AbC_d" });
    assert.equal(lerLinkDaPasta(`https://drive.google.com/drive/folders/${ID}?resourcekey=a%20b`)?.chave, null);
    assert.equal(enderecoDaPasta(ID, "0-AbC_d"), `https://drive.google.com/drive/folders/${ID}?resourcekey=0-AbC_d`);
    assert.equal(lerLinkDaPasta(123), null);
  });

  test("o valor guardado: o endereço é sempre o montado do id; nome limpo; sugestão do projeto", async () => {
    const { lerPastaDoCard, pastaDoLink, sugestaoDasSubpastas } = await pastas();
    const { valorDoCampo } = await import("../src/lib/quadro/metodo");
    assert.deepEqual(lerPastaDoCard("pastaBrutos", { id: ID }), { id: ID, nome: "Brutos", url: `https://drive.google.com/drive/folders/${ID}` });
    assert.deepEqual(lerPastaDoCard("pastaEntrega", { id: ID, nome: "  05\n Entregas ", url: `https://drive.google.com/drive/u/0/folders/${ID}?usp=x` }), {
      id: ID,
      nome: "05 Entregas",
      url: `https://drive.google.com/drive/folders/${ID}`,
    });
    assert.equal(
      lerPastaDoCard("pastaBrutos", { id: ID, url: "https://drive.google.com/drive/folders/OutroIdDePasta1234" }),
      undefined,
      "id e link diferentes",
    );
    assert.equal(lerPastaDoCard("pastaBrutos", { id: "x" }), undefined);
    assert.equal(lerPastaDoCard("pastaBrutos", { id: ID, nome: 12 }), undefined);
    assert.equal(lerPastaDoCard("pastaBrutos", [ID]), undefined);
    assert.equal(valorDoCampo("pastaBrutos", null), null, "tirar");
    assert.equal(pastaDoLink("pastaEntrega", "https://youtu.be/x"), null);
    assert.equal(pastaDoLink("pastaEntrega", `https://drive.google.com/drive/folders/${ID}`)?.nome, "Entrega");
    assert.equal(lerPastaDoCard("pastaBrutos", { id: ID, nome: "x".repeat(300) })?.nome.length, 120);
    const s = sugestaoDasSubpastas([
      { id: "pastaBriefing0001", nome: "01 Briefing", pasta: true },
      { id: "arquivoBruto00001", nome: "02 Bruto", pasta: false },
      { id: "pastaBruto0000001", nome: "02 Bruto", pasta: true },
      { id: "pastaEntregas0001", nome: "05 Entregas", pasta: true },
    ]);
    assert.equal(s.pastaBrutos?.id, "pastaBruto0000001");
    assert.equal(s.pastaEntrega?.id, "pastaEntregas0001");
    assert.deepEqual(sugestaoDasSubpastas([{ id: "pastaOutra000001", nome: "Edição", pasta: true }]), {});
  });

  test("na rota: só com o SOBEDESCE no plano; o banco guarda o endereço montado; tirar e leitura", async () => {
    const id = "cardPasta01";
    assert.equal((await gravar(teo, { op: "criar", id, dados: { tema: "Com pastas" } })).status, 200);
    const pasta = { id: ID, nome: "02 Bruto", url: `https://drive.google.com/drive/u/2/folders/${ID}?usp=sharing` };
    // sem o SOBEDESCE no plano, nada de pasta (nem ao criar)
    const sem = await gravar(rui, { op: "mudar", id, campos: { pastaBrutos: pasta } });
    assert.equal(sem.status, 403);
    assert.equal((await sem.json()).erro, "sem_sobedesce");
    assert.equal((await gravar(rui, { op: "criar", id: "cardPasta02", dados: { tema: "x", pastaEntrega: pasta } })).status, 403);
    // com ele: grava, e o endereço é o montado do id
    const r = await gravar(teo, { op: "mudar", id, campos: { pastaBrutos: pasta } });
    assert.equal(r.status, 200);
    const { card } = await r.json();
    assert.deepEqual(card.dados.pastaBrutos, { id: ID, nome: "02 Bruto", url: `https://drive.google.com/drive/folders/${ID}` });
    // link que não é pasta: recusa o pedido
    assert.equal((await gravar(teo, { op: "mudar", id, campos: { pastaEntrega: { id: ID, url: `https://drive.google.com/file/d/${ID}/view` } } })).status, 400);
    // quem só lê não grava
    assert.equal((await gravar(vic, { op: "mudar", id, campos: { pastaBrutos: null } })).status, 403);
    // tirar
    const t = await gravar(teo, { op: "mudar", id, campos: { pastaBrutos: null } });
    assert.equal(t.status, 200);
    assert.equal((await t.json()).card.dados.pastaBrutos, undefined);
    // outra organização não vê o card
    assert.ok(!(await (await ler(bia)).json()).cards.some((c: { id: string }) => c.id === id));
  });
});
