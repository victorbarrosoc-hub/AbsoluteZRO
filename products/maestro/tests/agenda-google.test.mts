// Google Agenda pelas Conexões da Absolute ZRO (drizzle/0021, ADR 0026 do HUB): o desenho de cada item como evento,
// a caixa de saída (gatilhos enfileiram na mesma transação, a fila sai depois e é idempotente pelo hash), o acesso por
// cliente (o que a pessoa não vê não vai), falha do HUB que nunca desfaz o salvar e o "Ocupado no Google". Contra o HUB
// falso (tests/ponte-falsa.mts).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { prepararAmbiente, UUID } from "./ambiente.mts";
import { iniciarPonteFalsa } from "./ponte-falsa.mts";

const amb = await prepararAmbiente("agenda_google");
const ponte = await iniciarPonteFalsa();
process.env.MAESTRO_PONTE_URL = ponte.url;
const { getBanco, schema } = amb.banco;
const { criarSessao, autenticar } = await import("../src/lib/auth/sessao");
const g = await import("../src/lib/agenda/google");
const sinc = await import("../src/lib/agenda/sincronia");
const agenda = await import("../src/lib/agenda/servidor");
const pessoas = await import("../src/lib/pessoas");
const rotaOcupado = await import("../src/app/api/agenda/google/ocupado/route");

const ANA = UUID();
const GIL = UUID();
const EVA = UUID();
let org: string;
let clienteSim: string;
let clienteNao: string;
let freela: string;
type S = NonNullable<Awaited<ReturnType<typeof autenticar>>>;
const ses: Record<string, S> = {};
const cookie: Record<string, string> = {};
const BASE = "https://maestro.teste";
const ESCOPO = "openid email profile org offline_access zro.ia maestro.projects zro.agenda";

async function sessao(sub: string, escopo = ESCOPO) {
  const { token } = await criarSessao({
    orgId: org,
    sub,
    produtos: ["maestro"],
    release: { maestro: "allowed" },
    tokens: { at: `at-${sub}`, rt: "rt-teste", atExp: Math.floor(Date.now() / 1000) + 24 * 3600, escopo },
  });
  return { token, s: (await autenticar(token))! };
}
const ctx = (sub: string) => ({ sub, orgId: org });
const fila = async (sub: string) =>
  (
    (await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`select ref, tentativas, proxima_em, erro from maestro.agenda_google_fila where zro_sub = ${sub} order by ref`),
    )) as unknown as { ref: string; tentativas: number; proxima_em: string; erro: string | null }[]
  ).map((x) => ({ ...x, tentativas: Number(x.tentativas) }));
const rodar = (s: S, agora = Date.now()) => sinc.esvaziarFila({ id: s.id, sub: s.sub, orgId: s.orgId }, { base: BASE, agora });

before(async () => {
  await getBanco().asSystem("semente", async (tx) => {
    const [o] = await tx.insert(schema.organizations).values({ zroOrgId: UUID(), name: "Produtora Agenda" }).returning({ id: schema.organizations.id });
    org = o.id;
    await tx.insert(schema.members).values([
      { orgId: org, zroSub: ANA, role: "admin", displayName: "Ana" },
      { orgId: org, zroSub: GIL, role: "gestor", displayName: "Gil" },
      { orgId: org, zroSub: EVA, role: "equipe", displayName: "Eva" },
    ]);
    const um = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { id: string }[])[0].id;
    clienteSim = await um(sql`insert into maestro.clients (org_id, name) values (${org}, 'Cliente Sim') returning id`);
    clienteNao = await um(sql`insert into maestro.clients (org_id, name) values (${org}, 'Cliente Não') returning id`);
    freela = await um(sql`insert into maestro.freelas (org_id, nome) values (${org}, 'Rui') returning id`);
  });
  for (const [k, sub] of [
    ["ana", ANA],
    ["gil", GIL],
    ["eva", EVA],
  ] as const) {
    const r = await sessao(sub);
    ses[k] = r.s;
    cookie[k] = r.token;
  }
  // Eva só vê o Cliente Sim.
  assert.equal((await pessoas.salvarAcesso(ctx(ANA), EVA, true, [clienteSim])).ok, true);
});
after(async () => {
  await ponte.fechar();
  await amb.fechar();
});

describe("desenho do evento", () => {
  test("diária com hora: título com o tipo, hora de Brasília, lugar, projeto e equipe; ocupa", () => {
    const i = g.eventoDoMaestro(
      {
        id: "e1",
        tipo: "diaria",
        titulo: "Campanha",
        data: "2026-11-03",
        dataFim: null,
        horaIni: "08:00",
        horaFim: "18:30",
        local: "Estúdio 2",
        projeto: "Verão",
        equipe: [{ nome: "Rui", funcao: "camera" }],
      },
      BASE,
    );
    assert.equal(i.ref, "evento-e1");
    assert.equal(i.tipo, "diaria");
    assert.deepEqual(i.corpo, {
      titulo: "Diária: Campanha",
      fuso: "America/Sao_Paulo",
      ocupa: true,
      link: `${BASE}/app/agenda/e1`,
      inicio: "2026-11-03T08:00:00-03:00",
      fim: "2026-11-03T18:30:00-03:00",
      local: "Estúdio 2",
      descricao: "Projeto: Verão\nEquipe: Rui (camera)",
    });
  });

  test("sem hora vira dia inteiro (fim inclusivo); entrega não ocupa; sem hora de fim, uma hora", () => {
    const dia = g.eventoDoMaestro(
      {
        id: "e2",
        tipo: "entrega",
        titulo: "Corte final",
        data: "2026-11-05",
        dataFim: "2026-11-06",
        horaIni: null,
        horaFim: null,
        local: null,
        projeto: null,
        equipe: [],
      },
      BASE,
    );
    assert.equal(dia.corpo.dia, "2026-11-05");
    assert.equal(dia.corpo.ate_dia, "2026-11-06");
    assert.equal(dia.corpo.ocupa, false);
    assert.equal(dia.corpo.inicio, undefined);
    const umaHora = g.eventoDoMaestro(
      {
        id: "e3",
        tipo: "reuniao",
        titulo: "Briefing",
        data: "2026-11-05",
        dataFim: null,
        horaIni: "14:00",
        horaFim: null,
        local: null,
        projeto: null,
        equipe: [],
      },
      BASE,
    );
    assert.equal(umaHora.corpo.fim, "2026-11-05T15:00:00-03:00");
    assert.equal(umaHora.corpo.titulo, "Reunião: Briefing");
  });

  test("prazo de card: dia inteiro, livre, com cliente e link para o Quadro", () => {
    const p = g.prazoDoCard({ id: "abc_1", tema: "Reels", prazo: "2026-11-09T18:00", cliente: "Café" }, BASE);
    assert.deepEqual(p, {
      ref: "card-abc_1",
      tipo: "prazo",
      corpo: {
        titulo: "Prazo: Reels",
        dia: "2026-11-09",
        ate_dia: "2026-11-09",
        descricao: "Cliente: Café",
        fuso: "America/Sao_Paulo",
        ocupa: false,
        link: `${BASE}/app/quadro?card=abc_1`,
      },
    });
  });

  test("hash estável pela ordem das chaves; hora local com o deslocamento do dia", () => {
    const a = g.hashDoCorpo({ titulo: "t", fuso: "America/Sao_Paulo", ocupa: true, link: "x", dia: "2026-01-01" });
    const b = g.hashDoCorpo({ dia: "2026-01-01", link: "x", ocupa: true, fuso: "America/Sao_Paulo", titulo: "t" });
    assert.equal(a, b);
    assert.notEqual(a, g.hashDoCorpo({ dia: "2026-01-02", link: "x", ocupa: true, fuso: "America/Sao_Paulo", titulo: "t" }));
    assert.equal(g.horaLocal("2026-11-03", "08:00"), "2026-11-03T08:00:00-03:00");
    assert.equal(g.horaLocal("2026-07-01", "10:00", "Europe/Lisbon"), "2026-07-01T10:00:00+01:00");
  });
});

describe("caixa de saída", () => {
  let ev: string;

  test("sem ninguém ligado, salvar não enfileira nada; ligar põe na fila o que a pessoa vê", async () => {
    const r = await agenda.salvarEvento(ctx(ANA), {
      tipo: "diaria",
      titulo: "Gravação",
      data: "2026-11-10",
      dataFim: null,
      horaIni: "09:00",
      horaFim: "17:00",
      local: "Rua A",
      notas: "segredo interno",
      cor: null,
      projetoId: null,
    });
    assert.equal(r.ok, true);
    ev = (r as { id: string }).id;
    assert.deepEqual(await fila(ANA), []);
    await getBanco().asSystem("teste", (tx) =>
      tx.execute(sql`insert into maestro.cards (org_id, id, dados) values (${org}, 'k-prazo1', ${JSON.stringify({ tema: "Reels", coluna: "fazendo", prazo: "2026-11-12", cliente: clienteNao })}::jsonb),
                                                                         (${org}, 'demo-k1', ${JSON.stringify({ tema: "Demo", coluna: "fazendo", prazo: "2026-11-12" })}::jsonb)`),
    );
    assert.equal((await sinc.salvarPrefs(ctx(ANA), { ligado: true, tipos: ["diaria", "prazo"] }, "2026-11-01")).ok, true);
    assert.deepEqual(
      (await fila(ANA)).map((x) => x.ref),
      ["card-k-prazo1", `evento-${ev}`],
    );
  });

  test("esvazia: PUT idempotente por ref, sem as notas; de novo sem mudança não chama o HUB", async () => {
    const r = await rodar(ses.ana);
    assert.equal(r.enviados, 2);
    assert.equal(r.parou, null);
    assert.deepEqual(await fila(ANA), []);
    const corpo = ponte.estado.agenda.eventos.get(`evento-${ev}`)!;
    assert.equal(corpo.titulo, "Diária: Gravação");
    assert.equal(corpo.local, "Rua A");
    assert.ok(!JSON.stringify(corpo).includes("segredo interno"));
    assert.equal(ponte.estado.agenda.eventos.get("card-k-prazo1")!.titulo, "Prazo: Reels");
    const chamadas = ponte.estado.agenda.chamadas.length;
    await sinc.sincronizarTudo(ctx(ANA), "2026-11-01");
    const r2 = await rodar(ses.ana);
    assert.equal(r2.enviados, 0);
    assert.equal(r2.iguais, 2);
    assert.equal(ponte.estado.agenda.chamadas.length, chamadas);
  });

  test("mudar a hora, escalar alguém e apagar: o gatilho enfileira e a fila atualiza e apaga o mesmo evento", async () => {
    const e = (await agenda.obterEvento(ctx(ANA), ev))!;
    await agenda.salvarEvento(ctx(ANA), { ...e, notas: null, cor: null, projetoId: null, horaIni: "10:00", horaFim: "12:00" }, ev);
    assert.deepEqual(
      (await fila(ANA)).map((x) => x.ref),
      [`evento-${ev}`],
    );
    await rodar(ses.ana);
    assert.equal(ponte.estado.agenda.eventos.get(`evento-${ev}`)!.inicio, "2026-11-10T10:00:00-03:00");
    // Só mudar as notas não chama ninguém.
    await agenda.salvarEvento(ctx(ANA), { ...e, notas: "outra nota", cor: null, projetoId: null, horaIni: "10:00", horaFim: "12:00" }, ev);
    assert.deepEqual(await fila(ANA), []);
    assert.equal((await agenda.escalarNaDiaria(ctx(ANA), ev, freela, "camera", 0)).ok, true);
    await rodar(ses.ana);
    assert.match(String(ponte.estado.agenda.eventos.get(`evento-${ev}`)!.descricao), /Equipe: Rui/);
    assert.equal((await agenda.removerEvento(ctx(ANA), ev)).ok, true);
    const r = await rodar(ses.ana);
    assert.equal(r.apagados, 1);
    assert.equal(ponte.estado.agenda.eventos.has(`evento-${ev}`), false);
    const enviados = (await getBanco().asSystem("t", (tx) =>
      tx.execute(sql`select ref from maestro.agenda_google_enviados where zro_sub = ${ANA}`),
    )) as unknown as { ref: string }[];
    assert.deepEqual(
      enviados.map((x) => x.ref),
      ["card-k-prazo1"],
    );
  });

  test("acesso por cliente: Eva (restrita ao Cliente Sim) não manda o prazo do Cliente Não", async () => {
    ponte.estado.agenda.eventos.clear();
    assert.equal((await sinc.salvarPrefs(ctx(EVA), { ligado: true, tipos: ["prazo"] }, "2026-11-01")).ok, true);
    await getBanco().asSystem("teste", (tx) =>
      tx.execute(
        sql`insert into maestro.cards (org_id, id, dados) values (${org}, 'k-prazo2', ${JSON.stringify({ tema: "Do Sim", coluna: "fazendo", prazo: "2026-11-13", cliente: clienteSim })}::jsonb)`,
      ),
    );
    // O gatilho enfileirou para as duas que estão ligadas (Ana e Eva), mesmo sem ver.
    assert.ok((await fila(EVA)).some((x) => x.ref === "card-k-prazo2"));
    await rodar(ses.eva);
    assert.deepEqual([...ponte.estado.agenda.eventos.keys()], ["card-k-prazo2"]);
    assert.deepEqual(await fila(EVA), []);
  });

  test("cada um vê só a própria fila e escolha (RLS)", async () => {
    const vistas = (await getBanco().asUser(ctx(GIL), (tx) => tx.execute(sql`select count(*)::int as n from maestro.agenda_google_fila`))) as unknown as {
      n: number;
    }[];
    assert.equal(vistas[0].n, 0);
    const prefs = (await getBanco().asUser(ctx(GIL), (tx) => tx.execute(sql`select count(*)::int as n from maestro.agenda_google`))) as unknown as {
      n: number;
    }[];
    assert.equal(prefs[0].n, 0);
    await assert.rejects(
      getBanco().asUser(ctx(GIL), (tx) => tx.execute(sql`insert into maestro.agenda_google_fila (org_id, zro_sub, ref) values (${org}, ${ANA}, 'card-xxxx')`)),
    );
  });

  test("HUB fora do ar: salvar segue valendo, a fila guarda tentativas e espera; volta e envia", async () => {
    await rodar(ses.ana);
    ponte.estado.agenda.falhar = true;
    try {
      const r = await agenda.salvarEvento(ctx(ANA), {
        tipo: "diaria",
        titulo: "Com HUB fora",
        data: "2026-11-20",
        dataFim: null,
        horaIni: null,
        horaFim: null,
        local: null,
        notas: null,
        cor: null,
        projetoId: null,
      });
      assert.equal(r.ok, true);
      const agora = Date.now();
      const rodada = await rodar(ses.ana, agora);
      assert.equal(rodada.falhas, 1);
      const [f] = await fila(ANA);
      assert.equal(f.tentativas, 1);
      assert.ok(new Date(f.proxima_em).getTime() > agora);
      assert.equal((await sinc.lerPrefs(ctx(ANA))).estado, "erro");
      // Antes da hora não tenta de novo.
      assert.equal((await rodar(ses.ana, agora)).falhas, 0);
    } finally {
      ponte.estado.agenda.falhar = false;
    }
    const r = await rodar(ses.ana, Date.now() + 10 * 60_000);
    assert.equal(r.enviados, 1);
    assert.deepEqual(await fila(ANA), []);
    assert.equal((await sinc.lerPrefs(ctx(ANA))).estado, "ok");
  });

  test("sem conexão ou app desligado: para a rodada, guarda o estado e não conta tentativa", async () => {
    ponte.estado.agenda.conectada = false;
    try {
      await sinc.sincronizarTudo(ctx(ANA), "2026-11-01");
      await getBanco().asSystem("t", (tx) => tx.execute(sql`delete from maestro.agenda_google_enviados where zro_sub = ${ANA}`));
      const r = await rodar(ses.ana);
      assert.equal(r.parou, "sem_conexao");
      assert.ok((await fila(ANA)).every((x) => x.tentativas === 0));
      assert.equal((await sinc.lerPrefs(ctx(ANA))).estado, "sem_conexao");
    } finally {
      ponte.estado.agenda.conectada = true;
    }
  });

  test("sessão sem o escopo zro.agenda (login antigo): pede para entrar de novo, sem chamar o HUB", async () => {
    const velho = await sessao(GIL, "openid email profile org offline_access zro.ia maestro.projects");
    assert.equal((await sinc.salvarPrefs(ctx(GIL), { ligado: true, tipos: ["diaria"] }, "2026-11-01")).ok, true);
    const antes = ponte.estado.agenda.chamadas.length;
    const r = await rodar(velho.s);
    assert.equal(r.parou, "reconectar_zro");
    assert.equal(ponte.estado.agenda.chamadas.length, antes);
    assert.equal((await g.estadoDaConexao(velho.s.id)).estado, "reconectar_zro");
  });

  test("desligar tira do Google o que foi", async () => {
    await getBanco().asSystem("t", (tx) => tx.execute(sql`delete from maestro.agenda_google_fila where zro_sub = ${ANA}`));
    await sinc.sincronizarTudo(ctx(ANA), "2026-11-01");
    await rodar(ses.ana, Date.now() + 60 * 60_000);
    assert.ok(ponte.estado.agenda.eventos.has("card-k-prazo1"));
    assert.equal((await sinc.salvarPrefs(ctx(ANA), { ligado: false, tipos: ["diaria", "prazo"] }, "2026-11-01")).ok, true);
    await rodar(ses.ana, Date.now() + 60 * 60_000);
    assert.equal(ponte.estado.agenda.eventos.has("card-k-prazo1"), false);
  });
});

describe("ocupado no Google", () => {
  test("a rota devolve os blocos do dia; sem conexão, o estado com o link de Conexões", async () => {
    ponte.estado.agenda.ocupado = [{ inicio: "2026-11-21T12:00:00.000Z", fim: "2026-11-21T14:00:00.000Z" }];
    const req = (q: string) => new Request(`http://localhost:3000/api/agenda/google/ocupado?${q}`, { headers: { cookie: `mae_sessao=${cookie.ana}` } });
    const r = await rotaOcupado.GET(req("de=2026-11-21&ate=2026-11-21"));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { estado: "ok", ocupado: ponte.estado.agenda.ocupado, conectar: "" });
    assert.equal((await rotaOcupado.GET(req("de=2026-11-21&ate=2027-01-30"))).status, 400);
    ponte.estado.agenda.conectada = false;
    try {
      const sem = (await (await rotaOcupado.GET(req("de=2026-11-21&ate=2026-11-21"))).json()) as { estado: string; conectar: string };
      assert.equal(sem.estado, "sem_conexao");
      assert.match(sem.conectar, /\/conexoes$/);
      assert.equal((await g.estadoDaConexao(ses.ana.id)).estado, "sem_conexao");
    } finally {
      ponte.estado.agenda.conectada = true;
    }
    assert.deepEqual(await g.estadoDaConexao(ses.ana.id), { estado: "ok", conta: "equipe@produtora.test", conectar: `${ponte.url}/conexoes` });
    const semCookie = await rotaOcupado.GET(new Request("http://localhost:3000/api/agenda/google/ocupado?de=2026-11-21"));
    assert.equal(semCookie.status, 401);
  });
});
