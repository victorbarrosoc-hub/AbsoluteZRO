// Revisão e aprovação do cliente (drizzle/0005, src/lib/revisao): duas organizações, papéis, a porta estreita do link
// (hash, validade, revogação, lote fechado, PIN, limites), idempotência da decisão e o Quadro andando com a decisão.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente, UUID } from "./ambiente.mts";

const amb = await prepararAmbiente("revisao");
const { getBanco, schema, codigoPg, PG } = amb.banco;
const eq = await import("../src/lib/revisao/equipe");
const link = await import("../src/lib/revisao/link");
const { hashToken } = await import("../src/lib/auth/cripto");

const ANA = UUID(); // admin na A
const EVA = UUID(); // equipe na A
const LEO = UUID(); // leitura na A
const BIA = UUID(); // admin na B
let orgA: string;
let orgB: string;
let clienteA: string;
let clienteB: string;
const A = () => ({ sub: ANA, orgId: orgA });
const EQUIPE = () => ({ sub: EVA, orgId: orgA });
const LEITURA = () => ({ sub: LEO, orgId: orgA });
const B = () => ({ sub: BIA, orgId: orgB });

const semCookies = { get: () => undefined };
const cookiesCom = (nome: string, valor: string) => ({ get: (n: string) => (n === nome ? valor : undefined) });
let ipN = 0;
const novoIp = () => `203.0.113.${++ipN}`;

const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e as unknown,
  );

async function card(ctx: { sub: string; orgId: string }, id: string, coluna: string, cliente: string) {
  await getBanco().asUser(ctx, (tx) => tx.execute(sql`select maestro.card_criar(${id}, ${JSON.stringify({ tema: `Peça ${id}`, coluna, cliente })}::jsonb)`));
}

async function colunaDe(id: string): Promise<{ coluna: string; ajuste: boolean }> {
  const [r] = (await getBanco().asSystem("teste", (tx) =>
    tx.execute(sql`select coluna, coalesce((dados ->> 'ajustePedido')::boolean, false) as ajuste from maestro.cards where org_id = ${orgA} and id = ${id}`),
  )) as unknown as { coluna: string; ajuste: boolean }[];
  return r;
}

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    const [a] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora A" }).returning({ id: schema.organizations.id });
    const [b] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora B" }).returning({ id: schema.organizations.id });
    orgA = a.id;
    orgB = b.id;
    await tx.insert(schema.members).values([
      { orgId: orgA, zroSub: ANA, role: "admin", displayName: "Ana", email: "ana@produtora-a.invalid" },
      { orgId: orgA, zroSub: EVA, role: "equipe", displayName: "Eva", email: "eva@produtora-a.invalid" },
      { orgId: orgA, zroSub: LEO, role: "leitura" },
      { orgId: orgB, zroSub: BIA, role: "admin" },
    ]);
    const [ca] = await tx
      .insert(schema.clients)
      .values({ orgId: orgA, name: "Café Aurora", email: "contato@aurora.invalid" })
      .returning({ id: schema.clients.id });
    const [cb] = await tx.insert(schema.clients).values({ orgId: orgB, name: "Cliente B" }).returning({ id: schema.clients.id });
    clienteA = ca.id;
    clienteB = cb.id;
  });
  await card(A(), "reel0001", "revisao", clienteA);
  await card(A(), "post0002", "revisao", clienteA);
  await card(A(), "story003", "fazendo", clienteA);
  await card(B(), "cardB001", "revisao", clienteB);
});
after(() => amb.fechar());

let loteA: string;
let token: string;
let v1: string;

describe("equipe: lote, versões e papéis", () => {
  test("cria o lote com as peças e a versão por link (equipe pode; leitura não)", async () => {
    loteA = ok(await eq.criarLote(A(), { clienteId: clienteA, titulo: "Semana 44", cards: ["reel0001", "post0002", "naoexiste"] })).id;
    const n = ok(await eq.novaVersao(EQUIPE(), "reel0001", "https://cdn.exemplo.com/reel-v1.mp4", "Corte 1")).n;
    assert.equal(n, 1);
    const ruim = await eq.novaVersao(EQUIPE(), "reel0001", "http://cdn.exemplo.com/x.mp4");
    assert.equal(ruim.ok, false);
    const leitura = await eq.novaVersao(LEITURA(), "reel0001", "https://cdn.exemplo.com/x.mp4");
    assert.equal(leitura.ok, false);
    if (!leitura.ok) assert.equal(leitura.erro, "sem_permissao");
    const lote = await eq.carregarLote(A(), loteA);
    assert.ok(lote);
    assert.deepEqual(
      lote.pecas.map((p) => p.card),
      ["reel0001", "post0002"],
    );
    v1 = lote.pecas[0].versoes[0].id;
    assert.equal(lote.pecas[0].versoes[0].fonte, "mp4");
  });

  test("maestro_app não escreve versão nem comentário direto; só pelas funções", async () => {
    const e1 = await erroDe(
      getBanco().asUser(A(), (tx) =>
        tx.execute(sql`insert into maestro.versoes (org_id, card_id, n, fonte, url) values (${orgA}, 'reel0001', 9, 'mp4', 'https://x.exemplo.com/a.mp4')`),
      ),
    );
    assert.equal(codigoPg(e1), PG.semPrivilegio);
    const e2 = await erroDe(getBanco().asUser(A(), (tx) => tx.execute(sql`update maestro.comentarios set texto = 'x'`)));
    assert.equal(codigoPg(e2), PG.semPrivilegio);
    const e3 = await erroDe(getBanco().asUser(A(), (tx) => tx.execute(sql`delete from maestro.versoes`)));
    assert.equal(codigoPg(e3), PG.semPrivilegio);
  });

  test("duas organizações: a B não vê nem alcança o lote, as versões e os comentários da A", async () => {
    assert.equal(await eq.carregarLote(B(), loteA), null);
    assert.equal((await eq.listarLotes(B())).length, 0);
    const outra = await eq.novaVersao(B(), "reel0001", "https://cdn.exemplo.com/invasao.mp4");
    assert.equal(outra.ok, false, "card da A não existe na B");
    const c = await eq.comentarComoEquipe(B(), v1, { texto: "invasão", idem: "invasao-0001" });
    assert.equal(c.ok, false);
    for (const t of ["versoes", "comentarios"]) {
      const r = await getBanco().asUser(B(), (tx) => tx.execute(sql.raw(`select count(*)::int as n from maestro.${t}`)));
      assert.equal((r[0] as { n: number }).n, 0, t);
    }
    // Organização forjada (Bia não é membro da A) também não vê nada.
    const forj = await getBanco().asUser({ sub: BIA, orgId: orgA }, (tx) => tx.execute(sql`select count(*)::int as n from maestro.versoes`));
    assert.equal((forj[0] as { n: number }).n, 0);
  });

  test("comentário da equipe: idempotente, resolve e reabre; o texto nunca muda", async () => {
    const c1 = ok(await eq.comentarComoEquipe(EQUIPE(), v1, { texto: "Cor do logo", t: 4200, idem: "equipe-0001" }));
    const c2 = ok(await eq.comentarComoEquipe(EQUIPE(), v1, { texto: "Cor do logo", t: 4200, idem: "equipe-0001" }));
    assert.equal(c1.id, c2.id);
    ok(await eq.resolverComentario(EQUIPE(), c1.id, true));
    const lote = await eq.carregarLote(A(), loteA);
    const c = lote!.pecas[0].versoes[0].comentarios.find((x) => x.id === c1.id)!;
    assert.equal(c.resolvido, true);
    assert.equal(c.nome, "Eva");
    ok(await eq.resolverComentario(EQUIPE(), c1.id, false));
    const e = await erroDe(getBanco().asSystem("teste", (tx) => tx.execute(sql`update maestro.comentarios set texto = 'outro' where id = ${c1.id}`)));
    assert.equal(codigoPg(e), PG.semPrivilegio, "nem o dono muda o texto");
    const d = await erroDe(getBanco().asSystem("teste", (tx) => tx.execute(sql`delete from maestro.comentarios where id = ${c1.id}`)));
    assert.equal(codigoPg(d), PG.semPrivilegio);
  });
});

describe("link do cliente", () => {
  test("só admin e gestão geram; o banco guarda só o hash; os cards em Revisão vão para Em aprovação", async () => {
    const equipe = await eq.gerarLink(EQUIPE(), loteA);
    assert.equal(equipe.ok, false);
    token = ok(await eq.gerarLink(A(), loteA, { dias: 30 })).token;
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const [l] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select token_hash, token_enc, expires_at from maestro.approval_links where lote_id = ${loteA} and revoked_at is null`),
    )) as unknown as { token_hash: string; token_enc: string; expires_at: Date }[];
    assert.equal(l.token_hash, hashToken(token));
    assert.ok(!l.token_enc.includes(token), "o token não fica em claro");
    const dias = (new Date(l.expires_at).getTime() - Date.now()) / 86_400_000;
    assert.ok(dias > 29.9 && dias <= 30.01);
    assert.equal(await eq.tokenDoLink(A(), loteA), token, "a equipe copia o mesmo link de novo");
    assert.equal((await colunaDe("reel0001")).coluna, "aprovacao");
    assert.equal((await colunaDe("post0002")).coluna, "aprovacao");
  });

  test("abre o lote sem vazar e-mail, sub, id de organização nem o token", async () => {
    const r = await link.abrirLink(token, semCookies, novoIp());
    assert.equal(r.estado, "ok");
    if (r.estado !== "ok") return;
    assert.equal(r.dados.produtora, "Produtora A");
    assert.equal(r.dados.cliente, "Café Aurora");
    assert.equal(r.dados.pecas.length, 2);
    const reel = r.dados.pecas[0];
    assert.equal(reel.versoes[0].url, "https://cdn.exemplo.com/reel-v1.mp4");
    assert.equal(reel.versoes[0].comentarios[0].autor, "equipe");
    assert.equal(reel.versoes[0].comentarios[0].nome, null, "o nome da pessoa da equipe não vai ao cliente");
    const texto = JSON.stringify(r.dados);
    for (const segredo of [token, hashToken(token), orgA, ANA, EVA, "@", clienteA, loteA]) assert.ok(!texto.includes(segredo), `não vaza ${segredo}`);
  });

  test("a porta estreita: sem organização, maestro_app não lê tabela nenhuma", async () => {
    const r = await link.comoLink(async (tx) => {
      const n: Record<string, number> = {};
      for (const t of ["versoes", "comentarios", "lotes", "cards", "approval_links", "clients"])
        n[t] = ((await tx.execute(sql.raw(`select count(*)::int as n from maestro.${t}`)))[0] as { n: number }).n;
      return n;
    });
    assert.deepEqual(r, { versoes: 0, comentarios: 0, lotes: 0, cards: 0, approval_links: 0, clients: 0 });
    const e = await erroDe(link.comoLink((tx) => tx.execute(sql`select maestro.link_vivo(${hashToken(token)})`)));
    assert.equal(codigoPg(e), PG.semPrivilegio, "a função interna não é aberta");
  });

  test("comentário do cliente: tempo, pino, idempotente; a peça e a versão têm de ser do lote", async () => {
    const dados = { card: "reel0001", versao: v1, texto: "Música alta aqui", t: 12_000, x: 40, y: 60, nome: "Marina", idem: "cliente-0001" };
    const c1 = ok(await link.comentarComoCliente(token, semCookies, novoIp(), dados));
    const c2 = ok(await link.comentarComoCliente(token, semCookies, novoIp(), dados));
    assert.equal(c1.comentario.id, c2.comentario.id);
    assert.equal(c1.comentario.x, 40);
    const alheio = await link.comentarComoCliente(token, semCookies, novoIp(), { ...dados, card: "story003", idem: "cliente-0002" });
    assert.equal(alheio.ok, false, "card fora do lote");
    const outra = await link.comentarComoCliente(token, semCookies, novoIp(), { ...dados, versao: UUID(), idem: "cliente-0003" });
    assert.equal(outra.ok, false);
    const lote = await eq.carregarLote(A(), loteA);
    assert.ok(lote!.pecas[0].versoes[0].comentarios.some((c) => c.autor === "cliente" && c.nome === "Marina" && c.t === 12_000));
  });

  test("enviar: nome e aceite obrigatórios; ajuste pede o quê; decisão vale uma vez e move o card", async () => {
    const ip = novoIp();
    const base = { nome: "Marina Lopes", aceite: true };
    const semAceite = await link.enviarDecisoes(token, semCookies, ip, "teste", {
      ...base,
      aceite: false,
      decisoes: [{ card: "post0002", versao: null, decisao: "aprovado" }],
    });
    assert.equal(!semAceite.ok && semAceite.erro, "aceite");
    const semNome = await link.enviarDecisoes(token, semCookies, ip, "teste", {
      ...base,
      nome: " ",
      decisoes: [{ card: "post0002", versao: null, decisao: "aprovado" }],
    });
    assert.equal(!semNome.ok && semNome.erro, "nome");
    const ajusteVazio = await link.enviarDecisoes(token, semCookies, ip, "teste", {
      ...base,
      decisoes: [{ card: "post0002", versao: null, decisao: "ajuste" }],
    });
    assert.equal(!ajusteVazio.ok && ajusteVazio.erro, "ajuste_sem_nota");
    const versaoVelha = await link.enviarDecisoes(token, semCookies, ip, "teste", {
      ...base,
      decisoes: [{ card: "reel0001", versao: UUID(), decisao: "aprovado" }],
    });
    assert.equal(!versaoVelha.ok && versaoVelha.erro, "versao_nova");

    const r = ok(
      await link.enviarDecisoes(token, semCookies, ip, "teste", {
        ...base,
        decisoes: [
          { card: "reel0001", versao: v1, decisao: "ajuste" },
          { card: "post0002", versao: null, decisao: "aprovado", nota: "Perfeito" },
        ],
      }),
    );
    assert.deepEqual(
      r.decisoes.map((d) => [d.card, d.decisao, d.repetida]),
      [
        ["reel0001", "ajuste", false],
        ["post0002", "aprovado", false],
      ],
    );
    assert.match(r.termo.hash ?? "", /^[0-9a-f]{64}$/);
    assert.deepEqual(await colunaDe("reel0001"), { coluna: "revisao", ajuste: true });
    assert.deepEqual(await colunaDe("post0002"), { coluna: "aprovado", ajuste: false });
    // De novo (fila do aparelho, clique duplo): nada muda e a decisão é a mesma.
    const rep = ok(
      await link.enviarDecisoes(token, semCookies, ip, "teste", {
        ...base,
        decisoes: [{ card: "post0002", versao: null, decisao: "ajuste", nota: "mudei de ideia" }],
      }),
    );
    assert.deepEqual(rep.decisoes, [{ card: "post0002", decisao: "aprovado", repetida: true }]);
    const [{ n }] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select count(*)::int as n from maestro.approvals where lote_id = ${loteA}`),
    )) as unknown as { n: number }[];
    assert.equal(n, 2);
    const hist = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select operacao from maestro.card_history where org_id = ${orgA} and card_id = 'post0002' order by n`),
    )) as unknown as { operacao: string }[];
    assert.equal(hist.at(-1)?.operacao, "decisao");
    const lote = await eq.carregarLote(A(), loteA);
    assert.equal(lote!.termo?.nome, "Marina Lopes");
  });

  test("versão nova: a volta sobe, o card volta para Em aprovação e o cliente decide de novo", async () => {
    ok(await eq.novaVersao(EQUIPE(), "reel0001", "https://youtu.be/dQw4w9WgXcQ"));
    assert.deepEqual(await colunaDe("reel0001"), { coluna: "aprovacao", ajuste: false });
    const r = await link.abrirLink(token, semCookies, novoIp());
    assert.equal(r.estado, "ok");
    if (r.estado !== "ok") return;
    const reel = r.dados.pecas[0];
    assert.equal(reel.volta, 2);
    assert.deepEqual(
      reel.versoes.map((v) => [v.n, v.fonte]),
      [
        [2, "youtube"],
        [1, "mp4"],
      ],
      "Agora e Antes",
    );
    assert.ok(reel.versoes[1].comentarios.length >= 2, "os comentários da volta anterior seguem lá");
    const ok2 = ok(
      await link.enviarDecisoes(token, semCookies, novoIp(), null, {
        nome: "Marina Lopes",
        aceite: true,
        decisoes: [{ card: "reel0001", versao: reel.versoes[0].id, decisao: "aprovado" }],
      }),
    );
    assert.equal(ok2.decisoes[0].repetida, false);
    assert.equal((await colunaDe("reel0001")).coluna, "aprovado");
  });

  test("revogado, vencido, lote fechado e token desconhecido dão a mesma resposta neutra", async () => {
    assert.equal((await link.abrirLink("x".repeat(43), semCookies, novoIp())).estado, "morto");
    assert.equal((await link.abrirLink("curto", semCookies, novoIp())).estado, "morto");
    // revogar
    ok(await eq.revogarLink(A(), loteA));
    assert.equal((await link.abrirLink(token, semCookies, novoIp())).estado, "morto");
    const c = await link.comentarComoCliente(token, semCookies, novoIp(), { card: "reel0001", versao: v1, texto: "depois", idem: "cliente-0009" });
    assert.equal(!c.ok && c.erro, "link");
    // novo link, vencido à força
    const t2 = ok(await eq.gerarLink(A(), loteA)).token;
    assert.equal((await link.abrirLink(t2, semCookies, novoIp())).estado, "ok");
    await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`update maestro.approval_links set expires_at = now() - interval '1 second' where token_hash = ${hashToken(t2)}`),
    );
    assert.equal((await link.abrirLink(t2, semCookies, novoIp())).estado, "morto");
    // lote fechado
    const t3 = ok(await eq.gerarLink(A(), loteA)).token;
    ok(await eq.fecharLote(A(), loteA));
    assert.equal((await link.abrirLink(t3, semCookies, novoIp())).estado, "morto");
    const auditoria = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select distinct action from maestro.audit_log where org_id = ${orgA} order by 1`),
    )) as unknown as { action: string }[];
    for (const a of ["link.abrir", "link.comentar", "link.criar", "link.decidir", "link.revogar", "lote.criar", "lote.fechar", "versao.criar"])
      assert.ok(
        auditoria.some((x) => x.action === a),
        a,
      );
  });
});

describe("PIN e limites", () => {
  let lotePin: string;
  let tPin: string;

  before(async () => {
    lotePin = ok(await eq.criarLote(A(), { clienteId: clienteA, titulo: "Com PIN", cards: ["story003"] })).id;
    tPin = ok(await eq.gerarLink(A(), lotePin, { pin: "4821", dias: 7 })).token;
  });

  test("com PIN: abre só a tela do PIN; errou 5 vezes, espera; acertou, o cookie abre", async () => {
    const ip = novoIp();
    assert.equal((await link.abrirLink(tPin, semCookies, ip)).estado, "pin");
    const e = await link.comentarComoCliente(tPin, semCookies, ip, { card: "story003", versao: UUID(), texto: "x", idem: "pinpin-0001" });
    assert.equal(!e.ok && e.erro, "pin", "sem a prova, nada passa");
    const errado = await link.conferirPin(tPin, "0000", ip);
    assert.equal(!errado.ok && errado.erro, "pin");
    for (let i = 0; i < 4; i++) await link.conferirPin(tPin, "1111", ip);
    const bloqueado = await link.conferirPin(tPin, "4821", ip);
    assert.equal(!bloqueado.ok && bloqueado.erro, "limite", "5 erros em 15 min por link e IP");
    const certo = await link.conferirPin(tPin, "4821", novoIp());
    assert.equal(certo.ok, true);
    if (!certo.ok) return;
    assert.equal(certo.cookie.nome, link.nomeCookiePin(tPin));
    assert.equal((await link.abrirLink(tPin, cookiesCom(certo.cookie.nome, certo.cookie.valor), novoIp())).estado, "ok");
    // A prova é do link e da versão do PIN: adulterada não vale.
    const adulterada = certo.cookie.valor.replace(/\.(\d+)\./, ".2.");
    assert.equal((await link.abrirLink(tPin, cookiesCom(certo.cookie.nome, adulterada), novoIp())).estado, "pin");
    // O PIN no banco é scrypt, nunca o número.
    const [l] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select pin_hash from maestro.approval_links where token_hash = ${hashToken(tPin)}`),
    )) as unknown as {
      pin_hash: string;
    }[];
    assert.match(l.pin_hash, /^s1\$/);
    assert.ok(!l.pin_hash.includes("4821"));
    assert.equal(link.pinConfere("4821", l.pin_hash), true);
  });

  test("PIN inválido na equipe é recusado", async () => {
    const r = await eq.gerarLink(A(), lotePin, { pin: "12" });
    assert.equal(!r.ok && r.erro, "pin");
  });

  test("abrir: 120/h por link; links mortos: 30/h por IP", async () => {
    const th = hashToken(tPin);
    await getBanco().asSystem("teste", (tx) => tx.insert(schema.rateLimitAttempts).values(Array.from({ length: 120 }, () => ({ key: `link-abrir:${th}` }))));
    assert.equal((await link.abrirLink(tPin, semCookies, novoIp())).estado, "limite");
    const ip = novoIp();
    for (let i = 0; i < 30; i++) await link.abrirLink(`${"z".repeat(40)}${String(i).padStart(3, "0")}`, semCookies, ip);
    assert.equal((await link.abrirLink(token, semCookies, ip)).estado, "limite", "quem testa tokens fica parado");
  });

  test("o IP nunca é guardado: só o HMAC do dia", async () => {
    const linhas = (await getBanco().asSystem("teste", (tx) => tx.execute(sql`select key from maestro.rate_limit_attempts`))) as unknown as { key: string }[];
    assert.ok(linhas.length > 0);
    for (const l of linhas) assert.ok(!l.key.includes("203.0.113"), l.key);
    const [a] = (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select ip_hash from maestro.approvals where ip_hash is not null limit 1`),
    )) as unknown as { ip_hash: string }[];
    assert.match(a.ip_hash, /^[0-9a-f]{64}$/);
  });
});
