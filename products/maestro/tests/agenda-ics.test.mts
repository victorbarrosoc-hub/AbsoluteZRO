// Agenda por assinatura (.ics, drizzle/0017): o texto segue o RFC 5545 (CRLF, dobra em 75 octetos, escape de TEXT,
// dia inteiro com DTEND exclusivo, hora com TZID=America/Sao_Paulo e VTIMEZONE), o endereço guarda só o hash, troca e
// desliga, a porta só serve a quem segue ativo e com acesso, e o feed mostra só o que a pessoa vê (organização e
// acesso por cliente).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { pedido, prepararAmbiente, UUID } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";

const amb = await prepararAmbiente("agenda_ics");
const { getBanco, codigoPg } = amb.banco;
const ics = await import("../src/lib/agenda/ics");
const feed = await import("../src/lib/agenda/feed");
const rotas = await import("../src/lib/agenda/rotas");
const pessoas = await import("../src/lib/pessoas");
let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
const HOJE = "2026-11-10";
const ids: Record<string, string> = {};

/** Confere a forma RFC 5545 e devolve as linhas desdobradas. */
function conferirRfc(texto: string): string[] {
  assert.ok(texto.endsWith("\r\n"), "termina em CRLF");
  const fisicas = texto.slice(0, -2).split("\r\n");
  for (const l of fisicas) {
    assert.ok(!l.includes("\n") && !l.includes("\r"), "sem LF solto");
    assert.ok(Buffer.byteLength(l, "utf8") <= 75, `linha com mais de 75 octetos: ${l}`);
  }
  const linhas: string[] = [];
  for (const l of fisicas) {
    if (l.startsWith(" ")) linhas[linhas.length - 1] += l.slice(1);
    else linhas.push(l);
  }
  const pilha: string[] = [];
  for (const l of linhas) {
    assert.match(l, /^[A-Z][A-Z0-9-]*(;[A-Z0-9-]+=[^:;]+)*:/, `linha de conteúdo inválida: ${l}`);
    if (l.startsWith("BEGIN:")) pilha.push(l.slice(6));
    if (l.startsWith("END:")) assert.equal(pilha.pop(), l.slice(4));
  }
  assert.equal(pilha.length, 0, "BEGIN/END equilibrados");
  assert.equal(linhas[0], "BEGIN:VCALENDAR");
  assert.ok(linhas.includes("VERSION:2.0"));
  assert.ok(linhas.some((l) => l.startsWith("PRODID:")));
  return linhas;
}

describe("iCalendar puro", () => {
  test("escape de TEXT e dobra em UTF-8", () => {
    assert.equal(ics.escaparTexto("a;b,c\\d\ne\r\nf"), "a\\;b\\,c\\\\d\\ne\\nf");
    assert.equal(ics.escaparTexto("x\u0007y"), "xy");
    const longa = `SUMMARY:${"ação é ótima, ".repeat(12)}`;
    const dobrada = ics.dobrar(longa);
    for (const l of dobrada.split("\r\n")) assert.ok(Buffer.byteLength(l, "utf8") <= 75);
    assert.equal(
      dobrada
        .split("\r\n")
        .map((l, i) => (i ? l.slice(1) : l))
        .join(""),
      longa,
    );
  });

  test("dia inteiro, com hora, vários dias, fuso e carimbo", () => {
    const agora = new Date("2026-11-10T13:05:09Z");
    const t = ics.gerarIcs({
      nome: "Maestro · Produtora, Ltda",
      agora,
      itens: [
        { uid: "evento-1", titulo: "Diária: Café; Serra, Alta", data: "2026-11-12" },
        { uid: "evento-2", titulo: "Reunião", data: "2026-11-13", horaIni: "09:30", horaFim: "11:00", local: "Sala 2\nAndar 3" },
        { uid: "evento-3", titulo: "Viagem", data: "2026-11-14", dataFim: "2026-11-16" },
        { uid: "evento-4", titulo: "Sem fim", data: "2026-11-17", horaIni: "18:00" },
        { uid: "ruim", titulo: "Data ruim", data: "17/11/2026" },
      ],
    });
    const l = conferirRfc(t);
    assert.ok(l.includes("X-WR-CALNAME:Maestro · Produtora\\, Ltda"));
    assert.ok(l.includes("BEGIN:VTIMEZONE") && l.includes("TZID:America/Sao_Paulo") && l.includes("TZOFFSETTO:-0300"));
    assert.ok(l.includes("UID:evento-1@maestro.absolutezro.com"));
    assert.ok(l.includes("DTSTAMP:20261110T130509Z"));
    assert.ok(l.includes("DTSTART;VALUE=DATE:20261112") && l.includes("DTEND;VALUE=DATE:20261113"), "DTEND exclusivo");
    assert.ok(l.includes("SUMMARY:Diária: Café\\; Serra\\, Alta"));
    assert.ok(l.includes("DTSTART;TZID=America/Sao_Paulo:20261113T093000"));
    assert.ok(l.includes("DTEND;TZID=America/Sao_Paulo:20261113T110000"));
    assert.ok(l.includes("LOCATION:Sala 2\\nAndar 3"));
    assert.ok(l.includes("DTEND;VALUE=DATE:20261117"), "3 dias: 14 a 16, fim exclusivo 17");
    assert.ok(l.includes("DURATION:PT1H"));
    assert.equal(l.filter((x) => x === "BEGIN:VEVENT").length, 4, "data ruim fica de fora");
  });

  test("virada de mês e de ano no fim exclusivo", () => {
    assert.equal(ics.diaSeguinte("2026-12-31"), "2027-01-01");
    assert.equal(ics.diaSeguinte("2028-02-28"), "2028-02-29");
  });
});

describe("endereço e feed", () => {
  before(async () => {
    o = await duasOrganizacoes();
    await getBanco().asSystem("semente", async (tx) => {
      const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0].id;
      const A = o.orgA;
      const c1 = await um(sql`insert into maestro.clients (org_id, name) values (${A}, 'Café Serra') returning id`);
      const c2 = await um(sql`insert into maestro.clients (org_id, name) values (${A}, 'Moda Raiz') returning id`);
      ids.c1 = c1;
      const p1 = await um(
        sql`insert into maestro.projects (org_id, code, title, client_id) values (${A}, 'MAE-2026-001', 'Filme do café', ${c1}) returning id`,
      );
      const p2 = await um(sql`insert into maestro.projects (org_id, code, title, client_id) values (${A}, 'MAE-2026-002', 'Lookbook', ${c2}) returning id`);
      const f = await um(sql`insert into maestro.freelas (org_id, nome) values (${A}, 'Rafa Lima') returning id`);
      const ev = await um(
        sql`insert into maestro.eventos (org_id, titulo, data, hora_ini, hora_fim, local, projeto_id) values (${A}, 'Diária no café', '2026-11-12', '08:30', '18:00', 'Fazenda, Serra', ${p1}) returning id`,
      );
      await tx.execute(sql`insert into maestro.eventos (org_id, titulo, data, projeto_id) values (${A}, 'Diária do lookbook', '2026-11-13', ${p2})`);
      await tx.execute(
        sql`insert into maestro.escalas (org_id, projeto_id, evento_id, freela_id, funcao, inicio, fim) values (${A}, ${p1}, ${ev}, ${f}, 'camera', '2026-11-12', '2026-11-12')`,
      );
      await tx.execute(
        sql`insert into maestro.cards (org_id, id, dados) values (${A}, 'card-cafe', ${JSON.stringify({ tema: "Reels do café", coluna: "fazendo", prazo: "2026-11-11", cliente: c1 })}::jsonb)`,
      );
      await tx.execute(
        sql`insert into maestro.cards (org_id, id, dados) values (${A}, 'card-moda', ${JSON.stringify({ tema: "Reels da moda", coluna: "fazendo", prazo: "2026-11-11", cliente: c2 })}::jsonb)`,
      );
      const lote = await um(sql`insert into maestro.lotes (org_id, client_id, title, status) values (${A}, ${c1}, 'Lote de novembro', 'enviado') returning id`);
      await tx.execute(
        sql`insert into maestro.approval_links (org_id, client_id, kind, lote_id, token_hash, expires_at) values (${A}, ${c1}, 'lote', ${lote}, ${"c".repeat(64)}, now() + interval '5 days')`,
      );
      await tx.execute(
        sql`insert into maestro.pedidos (org_id, protocolo, nome, email, consentimento_em, proximo_contato, cliente_id) values (${A}, 'ICS00001', 'Joana', 'j@x.com', now(), '2026-11-10', ${c1})`,
      );
      await tx.execute(sql`insert into maestro.eventos (org_id, titulo, data) values (${o.orgB}, 'Evento da B', '2026-11-12')`);
      // O último login de cada um: Eva e Ana com acesso; Leo com o Maestro fechado.
      for (const [sub, org, release] of [
        [o.ANA, A, { maestro: "allowed" }],
        [o.equipe.sub, A, { maestro: "allowed" }],
        [o.leitura.sub, A, { maestro: "closed" }],
        [o.BIA, o.orgB, { maestro: "released" }],
      ] as const) {
        await tx.execute(sql`
          insert into maestro.sessions (org_id, zro_sub, token_hash, produtos, zro_release, expires_at)
          values (${org}, ${sub}, ${createHash("sha256").update(UUID()).digest("hex")}, '{maestro}', ${JSON.stringify(release)}::jsonb, now() + interval '1 day')`);
      }
    });
  });
  after(() => amb.fechar());

  test("gerar: o banco guarda só o hash; o feed responde com o calendário da pessoa", async () => {
    const r = await feed.gerarAssinatura(o.admin);
    assert.ok(r.ok);
    const token = r.ok ? r.token : "";
    assert.match(token, feed.TOKEN_AGENDA);
    ids.tokenAna = token;
    const [g] = (await getBanco().asSystem("teste", (tx) => tx.execute(sql`select token_hash from maestro.agenda_assinaturas`))) as unknown as {
      token_hash: string;
    }[];
    assert.equal(g.token_hash, createHash("sha256").update(token).digest("hex"));
    const f = await feed.feedDoToken(token, "1.1.1.1", HOJE);
    assert.equal(f.estado, "ok");
    const l = conferirRfc(f.estado === "ok" ? f.ics : "");
    const resumos = l.filter((x) => x.startsWith("SUMMARY:")).sort();
    assert.deepEqual(resumos, [
      "SUMMARY:Aprovação vence: Lote de novembro",
      "SUMMARY:Diária do lookbook",
      "SUMMARY:Diária no café",
      "SUMMARY:Escala: Rafa Lima (camera)",
      "SUMMARY:Prazo: Reels da moda",
      "SUMMARY:Prazo: Reels do café",
      "SUMMARY:Retornar: Joana",
    ]);
    assert.ok(l.includes("LOCATION:Fazenda\\, Serra"));
    assert.ok(l.includes("DTSTART;TZID=America/Sao_Paulo:20261112T083000"));
    assert.ok(!l.some((x) => x.includes("Evento da B")), "nada da outra organização");
  });

  test("a rota serve text/calendar privado; endereço desconhecido é 404", async () => {
    const ok = await rotas.rotaFeed(pedido(`/api/agenda/${ids.tokenAna}.ics`, { ip: "2.2.2.2" }), `${ids.tokenAna}.ics`);
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get("content-type") ?? "", /^text\/calendar/);
    assert.match(ok.headers.get("cache-control") ?? "", /private/);
    const nao = await rotas.rotaFeed(pedido("/api/agenda/x.ics", { ip: "2.2.2.2" }), `${"A".repeat(43)}.ics`);
    assert.equal(nao.status, 404);
    const sem = await rotas.rotaMinha(pedido("/api/agenda/minha"));
    assert.equal(sem.status, 401);
  });

  test("trocar derruba o anterior; desligar desliga", async () => {
    const r2 = await feed.gerarAssinatura(o.admin);
    assert.ok(r2.ok);
    assert.equal((await feed.feedDoToken(ids.tokenAna, "3.3.3.3", HOJE)).estado, "morto");
    assert.equal((await feed.feedDoToken(r2.ok ? r2.token : "", "3.3.3.3", HOJE)).estado, "ok");
    assert.equal((await feed.lerAssinatura(o.admin)).ativa, true);
    assert.equal((await feed.revogarAssinatura(o.admin)).ok, true);
    assert.equal((await feed.feedDoToken(r2.ok ? r2.token : "", "3.3.3.3", HOJE)).estado, "morto");
    assert.equal((await feed.lerAssinatura(o.admin)).ativa, false);
  });

  test("acesso por cliente vale no feed; sem acesso ao Maestro ou fora da organização, morto", async () => {
    assert.equal((await pessoas.salvarAcesso(o.gestor, o.equipe.sub, true, [ids.c1])).ok, true);
    const r = await feed.gerarAssinatura(o.equipe);
    const f = await feed.feedDoToken(r.ok ? r.token : "", "4.4.4.4", HOJE);
    assert.equal(f.estado, "ok");
    const t = f.estado === "ok" ? f.ics : "";
    assert.ok(t.includes("Reels do café") && t.includes("Diária no café"));
    assert.ok(!t.includes("moda") && !t.includes("lookbook"), "o cliente de fora não aparece");
    // Maestro fechado no último login
    const rl = await feed.gerarAssinatura(o.leitura);
    assert.equal((await feed.feedDoToken(rl.ok ? rl.token : "", "4.4.4.4", HOJE)).estado, "morto");
    // pessoa desativada
    await getBanco().asSystem("teste", (tx) => tx.execute(sql`update maestro.members set status = 'disabled' where zro_sub = ${o.equipe.sub}`));
    assert.equal((await feed.feedDoToken(r.ok ? r.token : "", "4.4.4.4", HOJE)).estado, "morto");
    await getBanco().asSystem("teste", (tx) => tx.execute(sql`update maestro.members set status = 'active' where zro_sub = ${o.equipe.sub}`));
  });

  test("cada um só vê e mexe no próprio endereço; a outra organização não vê nada", async () => {
    await feed.gerarAssinatura(o.b);
    const n = async (ctx: { sub: string; orgId: string }) =>
      ((await getBanco().asUser(ctx, (tx) => tx.execute(sql`select count(*)::int as n from maestro.agenda_assinaturas`))) as unknown as { n: number }[])[0].n;
    const subs = (await getBanco().asUser(o.admin, (tx) => tx.execute(sql`select distinct zro_sub from maestro.agenda_assinaturas`))) as unknown as {
      zro_sub: string;
    }[];
    assert.deepEqual(
      subs.map((x) => x.zro_sub),
      [o.ANA],
      "Ana vê só as linhas dela, nunca as da Eva",
    );
    assert.equal(await n(o.b), 1);
    assert.equal(await n(o.forjado), 0);
    const e = await getBanco()
      .asUser(o.admin, (tx) =>
        tx.execute(sql`insert into maestro.agenda_assinaturas (org_id, zro_sub, token_hash) values (${o.orgA}, ${o.equipe.sub}, ${"d".repeat(64)})`),
      )
      .then(
        () => null,
        (x) => x,
      );
    assert.equal(codigoPg(e), "42501", "não cria endereço em nome de outra pessoa");
    const mudou = await getBanco().asUser(o.admin, (tx) =>
      tx.execute(sql`update maestro.agenda_assinaturas set revogado_em = now() where zro_sub = ${o.equipe.sub} returning id`),
    );
    assert.equal(mudou.length, 0, "não desliga o endereço de outra pessoa");
  });
});
