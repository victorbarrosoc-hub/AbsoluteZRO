// O cronômetro de tarefas e os tipos de vídeo (drizzle/0038): as contas puras, o banco como a pessoa (um rodando por
// pessoa, início do relógio do banco, cada um vê o seu e a gestão o do time, ninguém grava o tempo de outro, leitura
// não cronometra, outra organização e acesso por cliente não veem nada), Ajustar/Zerar/Desfazer, o parado, o
// Resumo da semana, o painel por tipo e a rota /api/tempo.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { cookiesDe, pedido, prepararAmbiente, SITE, UUID } from "./ambiente.mts";
import { duasOrganizacoes } from "./semente.mts";
import type { PessoaZro } from "./zro-falso.mts";

const amb = await prepararAmbiente("cronometro");
const { getBanco, codigoPg } = amb.banco;
const c = await import("../src/lib/tempo/calculo");
const tiposLib = await import("../src/lib/tempo/tipos");
const srv = await import("../src/lib/tempo/servidor");
const { getTempo, postTempo } = await import("../src/lib/tempo/rota");
const { mudarCard } = await import("../src/lib/quadro/servidor");
const pessoas = await import("../src/lib/pessoas");
const rotas = await import("../src/lib/zro/rotas");

let o: Awaited<ReturnType<typeof duasOrganizacoes>>;
const ids: Record<string, string> = {};
const erroDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e,
  );
const ver = (ctx: { sub: string; orgId: string }) =>
  getBanco().asUser(ctx, (tx) => tx.execute(sql`select zro_sub, card_id from maestro.tempo_registros where apagado_em is null`)) as unknown as Promise<
    { zro_sub: string; card_id: string }[]
  >;

before(async () => {
  o = await duasOrganizacoes();
  await getBanco().asSystem("semente do cronômetro", async (tx) => {
    const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0]?.id;
    ids.sim = await um(sql`insert into maestro.clients (org_id, name) values (${o.orgA}, 'Cliente Sim') returning id`);
    ids.nao = await um(sql`insert into maestro.clients (org_id, name) values (${o.orgA}, 'Cliente Não') returning id`);
    for (const [card, cli, tema] of [
      ["card-um", ids.sim, "Editar Monstro"],
      ["card-dois", ids.sim, "Reels da padaria"],
      ["card-nao", ids.nao, "Vídeo do outro cliente"],
    ] as const)
      await tx.execute(
        sql`insert into maestro.cards (org_id, id, dados) values (${o.orgA}, ${card}, ${JSON.stringify({ tema, coluna: "fazendo", cliente: cli })}::jsonb)`,
      );
    await tx.execute(sql`insert into maestro.cards (org_id, id, dados) values (${o.orgB}, 'card-b', '{"tema":"Da B","coluna":"fazendo"}'::jsonb)`);
  });
});
after(() => amb.fechar());

describe("contas puras", () => {
  test("relógio, durações e título da aba", () => {
    assert.equal(c.relogio(4267_000), "01:11:07");
    assert.equal(c.contagem(25 * 60_000), "25:00");
    assert.equal(c.contagem(1), "00:01");
    assert.equal(c.duracaoCurta(82 * 60_000), "1h 22min");
    assert.equal(c.duracaoCurta(38 * 60_000 + 5000), "38min");
    assert.equal(c.duracaoCurta(10_000), "<1min");
    assert.equal(c.duracaoCurta(0), "0min");
    assert.equal(c.duracaoFalada(130 * 60_000), "2h10");
    assert.equal(c.duracaoFalada(120 * 60_000), "2h");
    assert.equal(c.tituloDaAba(71 * 60_000 + 7000, "Editar Monstro"), "▶ 01:11 · Editar Monstro");
  });

  test("dia e semana no fuso do Brasil; sessão que passa da meia-noite se divide", () => {
    assert.equal(c.diaLocal(Date.parse("2026-11-02T02:30:00Z")), "2026-11-01");
    assert.equal(c.segundaDaSemana("2026-11-01"), "2026-10-26");
    assert.equal(c.segundaDaSemana("2026-10-26"), "2026-10-26");
    const m = c.porDia([{ inicio: "2026-11-02T02:00:00Z", fim: "2026-11-02T04:00:00Z" }], 0);
    assert.deepEqual(Object.fromEntries(m), { "2026-11-01": 3600_000, "2026-11-02": 3600_000 });
    // rodando conta até agora, e nunca mais que 24 h
    assert.equal(c.duracaoMs({ inicio: "2026-11-01T00:00:00Z", fim: null }, Date.parse("2026-11-03T00:00:00Z")), c.DIA);
  });

  test("quantis, painel por tipo e o típico (mediana com 3+ vídeos)", () => {
    assert.equal(c.quantil([1, 2, 3, 4], 0.5), 2.5);
    assert.equal(c.quantil([10], 0.75), 10);
    const H = 3600_000;
    const em = Date.parse("2026-10-20T15:00:00Z");
    const cards = [1, 2, 3, 4].map((i) => ({ id: `r${i}`, tema: "", coluna: "entregue", tipo: "reels", concluidoEm: em }));
    cards.push({ id: "f1", tema: "", coluna: "fazendo", tipo: "reels", concluidoEm: em }); // não concluído: fora
    const tempo = new Map([
      ["r1", 1 * H],
      ["r2", 2 * H],
      ["r3", 3 * H],
      ["r4", 4 * H],
      ["f1", 9 * H],
    ]);
    const [e] = c.estatisticasPorTipo(cards, tempo, { de: em - 7 * c.DIA, ate: em + c.DIA, granularidade: "semana" });
    assert.equal(e.videos, 4);
    assert.equal(e.mediaMs, 2.5 * H);
    assert.equal(e.medianaMs, 2.5 * H);
    assert.equal(e.p25Ms, 1.75 * H);
    assert.equal(e.p75Ms, 3.25 * H);
    assert.equal(e.totalMs, 10 * H);
    assert.ok(e.tendencia.some((p) => p.videos === 4));
    assert.equal(c.tipicoDoTipo(e), 2.5 * H);
    assert.equal(c.tipicoDoTipo({ ...e, videos: 2 }), null);
  });

  test("parado, Pomodoro, previsto e estimado × real", () => {
    assert.equal(c.paradoParaPerguntar({ inicio: 0, ultimaAtividade: 1000, agora: 1000 + 9 * 60_000, limiteMin: 10 }), null);
    assert.equal(c.paradoParaPerguntar({ inicio: 0, ultimaAtividade: 1000, agora: 1000 + 12 * 60_000, limiteMin: 10 }), 1000);
    assert.equal(c.paradoParaPerguntar({ inicio: 5000, ultimaAtividade: 1000, agora: 5000 + 12 * 60_000, limiteMin: 10 }), 5000);
    const p = c.lerPomodoro({ focoMin: 50, pausaMin: 99, ciclos: 4 });
    assert.deepEqual(p, { focoMin: 50, pausaMin: 5, longaMin: 15, ciclos: 4 });
    assert.equal(c.pausaDepois(4, p).tipo, "longa");
    assert.equal(c.pausaDepois(3, p).tipo, "pausa");
    assert.equal(c.entenderDuracao("1h30"), 90);
    assert.equal(c.entenderDuracao("2h"), 120);
    assert.equal(c.entenderDuracao("1,5h"), 90);
    assert.equal(c.entenderDuracao("45"), 45);
    assert.equal(c.entenderDuracao("1:07"), 65);
    assert.equal(c.entenderDuracao("abc"), null);
    assert.equal(c.lerPrevisto(7), undefined);
    assert.equal(c.lerPrevisto(90), 90);
    assert.deepEqual(c.andamento(45 * 60_000, 60), { fracao: 0.75, tom: "ok" });
    assert.equal(c.andamento(70 * 60_000, 60)?.tom, "passou");
    assert.equal(c.andamento(1, null), null);
  });
});

describe("tipos de vídeo", () => {
  test("toda organização nasce com os tipos de fábrica (os mesmos do TS)", async () => {
    const [d] = (await getBanco().sql`select array_agg(nome || ':' || cor order by ordem) as l from maestro.tipos_video_padrao_lista()`) as { l: string[] }[];
    assert.deepEqual(
      d.l,
      tiposLib.TIPOS_PADRAO.map((t) => `${t.nome}:${t.cor}`),
    );
    const a = await srv.listarTipos(o.equipe);
    const b = await srv.listarTipos(o.b);
    assert.equal(a.length, 6);
    assert.equal(b.length, 6);
    assert.ok(
      a.every((t) => !b.some((x) => x.id === t.id)),
      "cada organização com os seus",
    );
  });

  test("equipe cria e renomeia; nome repetido recusa; arquivar é de admin e gestão; leitura não muda", async () => {
    const r = await srv.operarTipo(o.equipe, "equipe", { op: "tipo_criar", nome: "  Vlog   de viagem ", cor: "ceu" });
    assert.ok(r.ok);
    const vlog = r.tipos.find((t) => t.nome === "Vlog de viagem")!;
    assert.equal(vlog.cor, "ceu");
    assert.equal((await srv.operarTipo(o.equipe, "equipe", { op: "tipo_criar", nome: "reels" })).ok, false);
    assert.ok((await srv.operarTipo(o.equipe, "equipe", { op: "tipo_mudar", id: vlog.id, nome: "Vlog" })).ok);
    const neg = await srv.operarTipo(o.equipe, "equipe", { op: "tipo_arquivar", id: vlog.id });
    assert.equal(neg.ok, false);
    assert.equal(!neg.ok && neg.status, 403);
    assert.equal((await srv.operarTipo(o.leitura, "leitura", { op: "tipo_criar", nome: "X" })).ok, false);
    const e = await erroDe(getBanco().asUser(o.leitura, (tx) => tx.execute(sql`insert into maestro.tipos_video (org_id, nome) values (${o.orgA}, 'Y')`)));
    assert.equal(codigoPg(e), "42501");
    const arq = await srv.operarTipo(o.gestor, "gestor", { op: "tipo_arquivar", id: vlog.id });
    assert.ok(arq.ok && arq.tipos.find((t) => t.id === vlog.id)?.arquivado);
    // de outra organização: não acha
    assert.equal((await srv.operarTipo(o.b, "admin", { op: "tipo_mudar", id: vlog.id, nome: "Invasor" })).ok, false);
    ids.vlog = vlog.id;
  });

  test("o card guarda o tipo (vivo, da mesma organização) e o previsto (5 em 5 min)", async () => {
    const [reels] = (await srv.listarTipos(o.equipe)).filter((t) => t.nome === "Reels");
    ids.reels = reels.id;
    const ok = await mudarCard(o.equipe, "card-um", { tipo: reels.id, previsto: 90 });
    assert.ok(ok.ok && ok.card.dados.tipo === reels.id && ok.card.dados.previsto === 90);
    const [daB] = await srv.listarTipos(o.b);
    assert.equal((await mudarCard(o.equipe, "card-um", { tipo: daB.id })).ok, false, "tipo de outra organização");
    assert.equal((await mudarCard(o.equipe, "card-um", { tipo: ids.vlog })).ok, false, "tipo arquivado");
    assert.equal((await mudarCard(o.equipe, "card-um", { previsto: 7 })).ok, false);
    assert.ok((await mudarCard(o.equipe, "card-um", { previsto: null })).ok);
  });
});

describe("cronômetro no banco", () => {
  test("iniciar, trocar de card fecha o anterior; o mesmo card de novo não muda nada", async () => {
    const a = await srv.iniciar(o.equipe, "card-um");
    assert.ok(a.ok);
    assert.equal(a.rodando.card, "card-um");
    assert.equal(a.rodando.fim, null);
    const igual = await srv.iniciar(o.equipe, "card-um");
    assert.ok(igual.ok && igual.rodando.id === a.rodando.id);
    await new Promise((r) => setTimeout(r, 2100));
    const b = await srv.iniciar(o.equipe, "card-dois", "pomodoro");
    assert.ok(b.ok);
    assert.equal(b.anterior?.id, a.rodando.id);
    assert.ok(b.anterior?.fim);
    assert.equal(b.rodando.modo, "pomodoro");
    const est = await srv.estado(o.equipe, "equipe");
    assert.equal(est.rodando?.card, "card-dois");
    assert.equal(est.hoje.length, 2);
    assert.ok(est.totais["card-um"] >= 2000);
    assert.equal(est.cards["card-dois"].tema, "Reels da padaria");
  });

  test("um rodando por pessoa (o índice barra o segundo) e o início é o do banco", async () => {
    const e = await erroDe(
      getBanco().asUser(o.equipe, (tx) =>
        tx.execute(sql`insert into maestro.tempo_registros (org_id, zro_sub, card_id, inicio) values (${o.orgA}, ${o.equipe.sub}, 'card-um', now())`),
      ),
    );
    assert.equal(codigoPg(e), "23505");
    await srv.pausar(o.equipe);
    const [r] = (await getBanco().asUser(o.equipe, (tx) =>
      tx.execute(
        sql`insert into maestro.tempo_registros (org_id, zro_sub, card_id, inicio) values (${o.orgA}, ${o.gestor.sub}, 'card-um', now() - interval '3 hours') returning zro_sub, inicio > now() - interval '1 minute' as agora`,
      ),
    )) as unknown as { zro_sub: string; agora: boolean }[];
    assert.equal(r.zro_sub, o.equipe.sub, "o dono é sempre quem grava");
    assert.equal(r.agora, true, "o início do cronômetro é o now() do banco");
    await srv.pausar(o.equipe);
  });

  test("cada um vê o seu; a gestão vê o time; ninguém grava no tempo do outro", async () => {
    const g = await srv.iniciar(o.gestor, "card-nao");
    assert.ok(g.ok);
    await srv.pausar(o.gestor);
    // dois toques seguidos (menos de 2 s) não ficam
    assert.equal((await ver(o.gestor)).filter((x) => x.zro_sub === o.gestor.sub).length, 0);
    assert.ok((await srv.adicionar(o.gestor, "card-nao", 20, "Reunião com o cliente")).ok);
    const daEva = await ver(o.equipe);
    assert.ok(daEva.length > 0 && daEva.every((x) => x.zro_sub === o.equipe.sub));
    const doGil = await ver(o.gestor);
    assert.ok(doGil.some((x) => x.zro_sub === o.equipe.sub) && doGil.some((x) => x.zro_sub === o.gestor.sub));
    assert.ok((await ver(o.admin)).length >= doGil.length);
    const mudou = (await getBanco().asUser(o.gestor, (tx) =>
      tx.execute(sql`update maestro.tempo_registros set motivo = 'mexi' where zro_sub = ${o.equipe.sub} returning id`),
    )) as unknown as unknown[];
    assert.equal(mudou.length, 0, "a gestão não muda o tempo da equipe");
    const e = await erroDe(getBanco().asUser(o.gestor, (tx) => tx.execute(sql`delete from maestro.tempo_registros`)));
    assert.equal(codigoPg(e), "42501", "ninguém apaga linha");
  });

  test("leitura não cronometra; outra organização e organização forjada não veem nada", async () => {
    const r = await srv.iniciar(o.leitura, "card-um");
    assert.equal(r.ok, false);
    assert.equal((await ver(o.b)).length, 0);
    assert.equal((await ver(o.forjado)).length, 0);
    const naB = await srv.iniciar(o.b, "card-um");
    assert.equal(naB.ok, false, "card da A pela B não existe");
    const e = await erroDe(
      getBanco().asUser(o.b, (tx) =>
        tx.execute(sql`insert into maestro.tempo_registros (org_id, zro_sub, card_id, inicio) values (${o.orgA}, ${o.b.sub}, 'card-um', now())`),
      ),
    );
    assert.ok(e, "org_id de outra organização recusa");
    // e o escopo do freela (sem organização) não lê nada
    const f = (await getBanco().asFreela(o.equipe.sub, (tx) => tx.execute(sql`select count(*)::int as n from maestro.tempo_registros`))) as unknown as {
      n: number;
    }[];
    assert.equal(f[0].n, 0);
  });

  test("Ajustar: tempo à mão com motivo, corrigir início/fim, nada no futuro nem passando de 24 h", async () => {
    assert.equal((await srv.adicionar(o.equipe, "card-um", 30, "")).ok, false, "sem motivo");
    const a = await srv.adicionar(o.equipe, "card-um", 30, "Esqueci de ligar");
    assert.ok(a.ok && a.registro.origem === "manual");
    assert.equal(Date.parse(a.registro.fim!) - Date.parse(a.registro.inicio), 30 * 60_000);
    const fim = new Date(Date.parse(a.registro.fim!) - 10 * 60_000).toISOString();
    const aj = await srv.ajustar(o.equipe, a.registro.id, undefined, fim, "Parei antes");
    assert.ok(aj.ok && aj.registro.fim === fim && aj.registro.motivo === "Parei antes");
    const fut = await srv.ajustar(o.equipe, a.registro.id, undefined, new Date(Date.now() + 3600_000).toISOString(), null);
    assert.equal(!fut.ok && fut.erro, "futuro");
    const longo = await srv.ajustar(o.equipe, a.registro.id, new Date(Date.now() - 30 * 3600_000).toISOString(), undefined, null);
    assert.equal(longo.ok, false);
    // a sessão de outra pessoa não se ajusta (some para quem tenta)
    const doGil = await srv.ajustar(o.gestor, a.registro.id, undefined, fim, null);
    assert.equal(!doGil.ok && doGil.status, 404);
  });

  test("Zerar leva todo o meu tempo do card; Desfazer volta (pausado); o dos outros fica", async () => {
    await srv.iniciar(o.equipe, "card-um");
    const antes = (await srv.sessoesDoCard(o.equipe, "card-um")).length;
    const z = await srv.zerar(o.equipe, "card-um");
    assert.ok(z.ok && z.ids.length === antes);
    assert.equal((await srv.sessoesDoCard(o.equipe, "card-um")).length, 0);
    assert.equal((await srv.estado(o.equipe, "equipe")).rodando, null, "o que rodava parou");
    const r = await srv.restaurar(o.equipe, z.ok ? z.ids : []);
    assert.ok(r.ok && r.ids.length === antes);
    const depois = await srv.sessoesDoCard(o.equipe, "card-um");
    assert.equal(depois.length, antes);
    assert.ok(
      depois.every((s) => s.fim),
      "nada reabre",
    );
    // a gestão não restaura o que é da equipe
    const z2 = await srv.zerar(o.equipe, "card-um");
    assert.ok(z2.ok);
    assert.equal(((await srv.restaurar(o.gestor, z2.ok ? z2.ids : [])) as { ids: string[] }).ids.length, 0);
    await srv.restaurar(o.equipe, z2.ok ? z2.ids : []);
  });

  test("parado: descartar fecha no último gesto e segue contando de agora", async () => {
    await getBanco().asUser(o.equipe, async (tx) => {
      await tx.execute(sql`update maestro.tempo_registros set fim = now() where zro_sub = maestro.current_sub() and fim is null`);
      await tx.execute(sql`insert into maestro.tempo_registros (org_id, zro_sub, card_id, inicio, fim, origem, motivo)
        values (${o.orgA}, ${o.equipe.sub}, 'card-dois', now() - interval '1 hour', now() - interval '59 minutes', 'manual', 'base')`);
    });
    const r = await srv.iniciar(o.equipe, "card-dois");
    assert.ok(r.ok);
    // simula a sessão começada 40 min atrás (o banco força o now() no insert; aqui o ajuste corrige o início)
    const aj = await srv.ajustar(o.equipe, r.rodando.id, new Date(Date.now() - 40 * 60_000).toISOString(), undefined, null);
    assert.ok(aj.ok);
    const desde = new Date(Date.now() - 15 * 60_000).toISOString();
    const d = await srv.descartarParado(o.equipe, desde, true);
    assert.ok(d.ok && d.rodando && d.rodando.card === "card-dois" && d.rodando.id !== r.rodando.id);
    const [velha] = (await srv.sessoesDoCard(o.equipe, "card-dois")).filter((s) => s.id === r.rodando.id);
    assert.equal(Math.round((Date.parse(velha.fim!) - Date.parse(velha.inicio)) / 60_000), 25);
    const parar = await srv.descartarParado(o.equipe, new Date().toISOString(), false);
    assert.ok(parar.ok && parar.rodando === null);
  });

  test("acesso por cliente: restrita ao Sim não vê nem cronometra o card do Não", async () => {
    assert.equal((await pessoas.salvarAcesso(o.admin, o.equipe.sub, true, [ids.sim])).ok, true);
    const vistos = await ver(o.equipe);
    assert.ok(vistos.every((x) => x.card_id !== "card-nao"));
    assert.equal((await srv.iniciar(o.equipe, "card-nao")).ok, false);
    assert.equal((await pessoas.salvarAcesso(o.admin, o.equipe.sub, false, [])).ok, true);
  });
});

describe("resumos", () => {
  before(async () => {
    // sessões fictícias da semana: Eva no card-um (Reels) e Gil no card-nao; card-um entregue
    await getBanco().asUser(o.admin, (tx) =>
      tx.execute(sql`select maestro.card_mudar('card-um', jsonb_build_object('coluna', 'entregue', 'colunaEm', (extract(epoch from now()) * 1000)::bigint))`),
    );
    await getBanco().asSystem("semente da semana", (tx) =>
      tx.execute(sql`insert into maestro.tempo_registros (org_id, zro_sub, card_id, inicio, fim, origem, motivo) values
        (${o.orgA}, ${o.equipe.sub}, 'card-um', now() - interval '3 hours', now() - interval '1 hour', 'manual', 'semente'),
        (${o.orgA}, ${o.gestor.sub}, 'card-nao', now() - interval '5 hours', now() - interval '4 hours', 'manual', 'semente')`),
    );
  });

  test("semana: a equipe só a dela; a gestão o time ou uma pessoa; a equipe não pede o time", async () => {
    const eu = await srv.semana(o.equipe, "equipe", {});
    assert.ok(eu.ok);
    assert.ok(eu.semana.totalMs >= 2 * 3600_000);
    assert.ok(eu.semana.porCliente.every((f) => f.id !== ids.nao));
    assert.equal(eu.semana.dias.length, 7);
    assert.ok(eu.semana.tarefas >= 1, "card-um entregue conta");
    assert.ok(eu.semana.porTipo.some((f) => f.id === ids.reels));
    const time = await srv.semana(o.gestor, "gestor", { quem: "time" });
    assert.ok(time.ok && time.semana.porCliente.some((f) => f.id === ids.nao));
    const soEva = await srv.semana(o.gestor, "gestor", { quem: o.equipe.sub });
    assert.ok(soEva.ok && soEva.semana.porCliente.every((f) => f.id !== ids.nao));
    const neg = await srv.semana(o.equipe, "equipe", { quem: "time" });
    assert.equal(!neg.ok && neg.status, 403);
  });

  test("painel por tipo: só concluídos, o tempo de quem vê, e o típico só com 3+ vídeos", async () => {
    const p = await srv.painelPorTipo(o.gestor, "gestor", { quem: "time", periodo: "30d" });
    assert.ok(p.ok);
    const reels = p.painel.tipos.find((t) => t.tipo === ids.reels);
    assert.ok(reels && reels.videos === 1);
    assert.equal(p.painel.tipicos[ids.reels], undefined, "1 vídeo não sugere");
    assert.equal(p.painel.granularidade, "semana");
    const daB = await srv.painelPorTipo(o.b, "admin", { quem: "time" });
    assert.ok(daB.ok && daB.painel.tipos.length === 0);
  });
});

describe("rota /api/tempo", () => {
  const ORG = { id: UUID(), name: "Produtora R", role: "owner" };
  const LIA: PessoaZro = { sub: UUID(), email: "lia@r.exemplo", nome: "Lia", org: ORG, produtos: ["maestro"] };
  const VIC: PessoaZro = { sub: UUID(), email: "vic@r.exemplo", nome: "Vic", org: { ...ORG, role: "viewer" }, produtos: ["maestro"] };
  async function entrar(p: PessoaZro): Promise<string> {
    Object.assign(amb.zro.estado.proximo, { pessoa: p, adulterar: null, negar: false });
    const ida = await rotas.entrar(pedido("/api/zro/entrar"));
    const z = await fetch(new URL(ida.headers.get("location")!), { redirect: "manual" });
    const volta = await rotas.callback(pedido(z.headers.get("location")!.replace(SITE, ""), { cookies: { mae_zro: cookiesDe(ida).get("mae_zro") } }));
    return cookiesDe(volta).get("mae_sessao")!;
  }
  let lia: string, vic: string;
  before(async () => {
    lia = await entrar(LIA);
    vic = await entrar(VIC);
    const [org] = await getBanco().sql`select id from maestro.organizations where zro_org_id = ${ORG.id}`;
    await getBanco().asUser({ sub: LIA.sub, orgId: org.id }, (tx) =>
      tx.execute(sql`select maestro.card_criar('card-rota', '{"tema":"Rota","coluna":"fazendo"}'::jsonb)`),
    );
  });
  const gravar = (s: string | undefined, corpo: unknown, origin?: string | null) =>
    postTempo(pedido("/api/tempo", { cookies: { mae_sessao: s }, corpo, origin }));

  test("sem sessão 401; outra origem 403; leitura não grava", async () => {
    assert.equal((await getTempo(pedido("/api/tempo"))).status, 401);
    assert.equal((await gravar(undefined, { op: "pausar" })).status, 401);
    assert.equal((await gravar(lia, { op: "pausar" }, "https://outro.exemplo")).status, 403);
    assert.equal((await gravar(vic, { op: "iniciar", card: "card-rota" })).status, 403);
    const d = await (await getTempo(pedido("/api/tempo", { cookies: { mae_sessao: vic } }))).json();
    assert.equal(d.pode, false);
  });

  test("iniciar → estado com o relógio do servidor; pausar; tipos pela mesma rota", async () => {
    const r = await gravar(lia, { op: "iniciar", card: "card-rota" });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.estado.rodando.card, "card-rota");
    assert.ok(Math.abs(Date.parse(d.estado.agora) - Date.now()) < 60_000);
    const g = await (await getTempo(pedido("/api/tempo", { cookies: { mae_sessao: lia } }))).json();
    assert.equal(g.rodando.card, "card-rota");
    assert.equal(g.pode, true);
    assert.equal((await gravar(lia, { op: "pausar" })).status, 200);
    assert.equal((await gravar(lia, { op: "voar" })).status, 400);
    const t = await gravar(lia, { op: "tipo_criar", nome: "Making of", cor: "oliva" });
    assert.equal(t.status, 200);
    assert.ok((await t.json()).tipos.some((x: { nome: string }) => x.nome === "Making of"));
    const s = await getTempo(pedido("/api/tempo?semana=", { cookies: { mae_sessao: lia } }));
    assert.equal(s.status, 200);
    assert.equal((await s.json()).semana.dias.length, 7);
    const p = await getTempo(pedido("/api/tempo?tipos=1&periodo=12m", { cookies: { mae_sessao: lia } }));
    assert.equal((await p.json()).granularidade, "mes");
  });
});
