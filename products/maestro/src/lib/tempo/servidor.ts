/**
 * O cronômetro de tarefas no banco (drizzle/0038), sempre como a pessoa (`asUser`, maestro_app, RLS): cada um vê e
 * grava o próprio tempo; administração e gestão leem o do time; acesso por cliente segue o card. O início de cada
 * sessão é o `now()` do banco (o gatilho `tempo_registros_guarda` força), então o mesmo número aparece em qualquer
 * aparelho. Um rodando por pessoa: iniciar outro fecha o anterior na mesma transação (o índice `tempo_um_rodando`
 * barra a corrida de dois aparelhos; quem perde tenta de novo uma vez).
 */
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, mensagemPg, PG, type Contexto, type Tx } from "@/lib/db/client";
import type { Papel } from "@/lib/papeis";
import { ehCorColuna } from "@/lib/quadro/colunas";
import {
  DIA,
  MIN,
  diaLocal,
  estatisticasPorTipo,
  inicioDoDia,
  porCard,
  resumoDaSemana,
  segundaDaSemana,
  tipicoDoTipo,
  type CardConcluido,
  type CardDoTempo,
  type EstatisticaTipo,
  type Granularidade,
  type Modo,
  type Registro,
  type Semana,
} from "./calculo";
import { MAX_TIPOS, corDoTipo, nomeDoTipo, type TipoVideo } from "./tipos";

export type Falha = { ok: false; status: number; erro: string; mensagem: string };
export type Res<T extends object = object> = ({ ok: true } & T) | Falha;
const falha = (status: number, erro: string, mensagem: string): Falha => ({ ok: false, status, erro, mensagem });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_CARD = /^[A-Za-z0-9_-]{4,64}$/;
/** Sessão mais curta que isso (dois toques seguidos) não fica: some sozinha. */
const MINIMO_MS = 2000;

/** Quem cronometra: quem escreve no Quadro (leitura não; o banco confere de novo). */
export const podeCronometrar = (papel: Papel) => papel !== "leitura";
/** Quem vê o tempo do time (quem gerencia os projetos): administração e gestão (a política `tempo_registros_quem_ve`). */
export const podeVerTempoDoTime = (papel: Papel) => papel === "admin" || papel === "gestor";

type Linha = {
  id: string;
  zro_sub: string;
  card_id: string;
  inicio: Date | string;
  fim: Date | string | null;
  origem: Registro["origem"];
  modo: Modo;
  motivo: string | null;
};
const iso = (v: Date | string) => new Date(v).toISOString();
const paraRegistro = (l: Linha): Registro => ({
  id: l.id,
  sub: l.zro_sub,
  card: l.card_id,
  inicio: iso(l.inicio),
  fim: l.fim ? iso(l.fim) : null,
  origem: l.origem,
  modo: l.modo,
  motivo: l.motivo,
});
const COLUNAS = sql.raw("id, zro_sub, card_id, inicio, fim, origem, modo, motivo");

function traduzir(e: unknown): Falha {
  const codigo = codigoPg(e);
  const msg = mensagemPg(e);
  if (codigo === PG.semPrivilegio) return falha(403, "sem_permissao", "Seu papel nesta organização não cronometra.");
  if (codigo === "P0002" || codigo === PG.chaveEstrangeira) return falha(404, "nao_existe", "Esse card não existe mais.");
  if (codigo === PG.regra && msg === "tempo:futuro") return falha(400, "futuro", "O tempo não pode ficar no futuro.");
  if (codigo === PG.regra && msg.startsWith("tempo:")) return falha(400, "formato", "Esse ajuste não vale.");
  if (codigo === PG.checagem) return falha(400, "formato", "Confira o início e o fim (até 24 h por vez).");
  if (codigo === PG.unicidade) return falha(409, "rodando", "Já tem um cronômetro rodando.");
  throw e;
}

async function tentar<T extends object>(fn: () => Promise<Res<T>>): Promise<Res<T>> {
  try {
    return await fn();
  } catch (e) {
    return traduzir(e);
  }
}

/* ───────────── o estado (pílula e painel) ───────────── */

export type Estado = {
  /** O relógio do servidor (ISO): a tela calcula o desvio do dela. */
  agora: string;
  rodando: Registro | null;
  /** As minhas sessões de hoje (e a que roda). */
  hoje: Registro[];
  /** O tempo fechado de cada card que a pessoa vê (o dela; administração e gestão, o do time). ms. */
  totais: Record<string, number>;
  /** Os cards das minhas sessões de hoje (título, coluna, cliente) para a lista sem depender do Quadro. */
  cards: Record<string, CardDoTempo>;
  /** O nome dos clientes desses cards. */
  clientes: Record<string, string>;
  time: boolean;
};

/** Lista de ids de card como array do Postgres (os ids têm o formato do banco: letras, números, _ e -). */
const textoArray = (ids: string[]) =>
  `{${ids
    .filter((i) => ID_CARD.test(i))
    .map((i) => `"${i}"`)
    .join(",")}}`;

async function cardsPorId(tx: Tx, ids: string[]): Promise<Record<string, CardDoTempo>> {
  if (!ids.length) return {};
  const linhas = (await tx.execute(sql`
    select id, coalesce(dados ->> 'tema', '') as tema, coluna, cliente, projeto, dados ->> 'tipo' as tipo,
           (dados ->> 'previsto')::int as previsto
      from maestro.cards where id = any(${textoArray(ids)}::text[])`)) as unknown as CardDoTempo[];
  return Object.fromEntries(linhas.map((c) => [c.id, c]));
}

export async function estado(ctx: Contexto, papel: Papel): Promise<Estado> {
  const hoje0 = new Date(inicioDoDia(diaLocal(Date.now()))).toISOString();
  return getBanco().asUser(ctx, async (tx) => {
    const [{ agora }] = (await tx.execute(sql`select now() as agora`)) as unknown as { agora: Date }[];
    const meus = (
      (await tx.execute(sql`
        select ${COLUNAS} from maestro.tempo_registros
         where zro_sub = maestro.current_sub() and apagado_em is null and (fim is null or fim >= ${hoje0}::timestamptz)
         order by inicio`)) as unknown as Linha[]
    ).map(paraRegistro);
    const totais = (await tx.execute(sql`
      select t.card_id as card, round(sum(extract(epoch from (t.fim - t.inicio)) * 1000))::bigint as ms
        from maestro.tempo_registros t join maestro.cards c on c.org_id = t.org_id and c.id = t.card_id
       where t.apagado_em is null and t.fim is not null and c.apagado_em is null
       group by t.card_id`)) as unknown as { card: string; ms: string | number }[];
    const ids = [...new Set(meus.map((r) => r.card))].filter((i) => ID_CARD.test(i));
    const cards = await cardsPorId(tx, ids);
    const doCliente = [...new Set(Object.values(cards).map((x) => x.cliente))].filter((x): x is string => !!x && UUID.test(x));
    const clientes = doCliente.length
      ? ((await tx.execute(sql`select id, name as nome from maestro.clients where id = any(${`{${doCliente.join(",")}}`}::uuid[])`)) as unknown as {
          id: string;
          nome: string;
        }[])
      : [];
    return {
      agora: iso(agora),
      rodando: meus.find((r) => !r.fim) ?? null,
      hoje: meus,
      totais: Object.fromEntries(totais.map((x) => [x.card, Number(x.ms)])),
      cards,
      clientes: Object.fromEntries(clientes.map((x) => [x.id, x.nome])),
      time: podeVerTempoDoTime(papel),
    };
  });
}

/* ───────────── iniciar, pausar, parado ───────────── */

/** Fecha o que roda (até 24 h); sessão de 2 s some. Devolve o que estava rodando. */
async function fecharRodando(tx: Tx, ate?: string): Promise<Registro | null> {
  const fim = ate ? sql`least(greatest(${ate}::timestamptz, inicio), now())` : sql`now()`;
  const [l] = (await tx.execute(sql`
    update maestro.tempo_registros set fim = least(${fim}, inicio + interval '24 hours')
     where zro_sub = maestro.current_sub() and fim is null and apagado_em is null
     returning ${COLUNAS}`)) as unknown as Linha[];
  if (!l) return null;
  const r = paraRegistro(l);
  if (Date.parse(r.fim!) - Date.parse(r.inicio) < MINIMO_MS) {
    await tx.execute(sql`update maestro.tempo_registros set apagado_em = now() where id = ${r.id}`);
  }
  return r;
}

async function abrir(tx: Tx, card: string, modo: Modo): Promise<Registro> {
  const [l] = (await tx.execute(sql`
    insert into maestro.tempo_registros (org_id, zro_sub, card_id, inicio, modo)
    values (maestro.current_org_id(), maestro.current_sub(), ${card}, now(), ${modo})
    returning ${COLUNAS}`)) as unknown as Linha[];
  return paraRegistro(l);
}

const ehModo = (v: unknown): v is Modo => v === "livre" || v === "pomodoro";

/** Começa (ou troca para) o card. O mesmo card no mesmo modo já rodando = nada muda. */
export async function iniciar(ctx: Contexto, card: unknown, modo: unknown = "livre"): Promise<Res<{ rodando: Registro; anterior: Registro | null }>> {
  if (typeof card !== "string" || !ID_CARD.test(card)) return falha(400, "formato", "Card inválido.");
  if (!ehModo(modo)) return falha(400, "formato", "Modo inválido.");
  const uma = () =>
    getBanco().asUser(ctx, async (tx) => {
      const [atual] = (await tx.execute(
        sql`select ${COLUNAS} from maestro.tempo_registros where zro_sub = maestro.current_sub() and fim is null and apagado_em is null for update`,
      )) as unknown as Linha[];
      if (atual && atual.card_id === card && atual.modo === modo) return { ok: true as const, rodando: paraRegistro(atual), anterior: null };
      const anterior = await fecharRodando(tx);
      return { ok: true as const, rodando: await abrir(tx, card, modo), anterior };
    });
  return tentar(async () => {
    try {
      return await uma();
    } catch (e) {
      // outro aparelho abriu ao mesmo tempo: na segunda vez o "for update" já vê o dele
      if (codigoPg(e) === PG.unicidade) return await uma();
      throw e;
    }
  });
}

export async function pausar(ctx: Contexto): Promise<Res<{ parado: Registro | null }>> {
  return tentar(() => getBanco().asUser(ctx, async (tx) => ({ ok: true as const, parado: await fecharRodando(tx) })));
}

/**
 * "Descartar N min parado" (estilo Toggl): a sessão fecha em `desde` (o último gesto) e, com `continuar`, uma nova
 * começa agora no mesmo card. Sem nada rodando, nada muda.
 */
export async function descartarParado(ctx: Contexto, desde: unknown, continuar: unknown): Promise<Res<{ rodando: Registro | null }>> {
  if (typeof desde !== "string" || Number.isNaN(Date.parse(desde))) return falha(400, "formato", "Hora inválida.");
  return tentar<{ rodando: Registro | null }>(() =>
    getBanco().asUser(ctx, async (tx) => {
      const fechado = await fecharRodando(tx, new Date(desde).toISOString());
      if (!fechado || continuar !== true) return { ok: true as const, rodando: null };
      return { ok: true as const, rodando: (await abrir(tx, fechado.card, fechado.modo)) as Registro | null };
    }),
  );
}

/* ───────────── Ajustar e Zerar ───────────── */

const motivoOk = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s.length >= 1 && s.length <= 200 ? s : undefined;
};

/** Tempo posto à mão (esqueceu de ligar): `minutos` terminando em `fim` (padrão agora), com motivo. */
export async function adicionar(ctx: Contexto, card: unknown, minutos: unknown, motivo: unknown, fim?: unknown): Promise<Res<{ registro: Registro }>> {
  if (typeof card !== "string" || !ID_CARD.test(card)) return falha(400, "formato", "Card inválido.");
  if (typeof minutos !== "number" || !Number.isInteger(minutos) || minutos < 1 || minutos > 24 * 60) return falha(400, "formato", "De 1 min a 24 h.");
  const m = motivoOk(motivo);
  if (!m) return falha(400, "motivo", "Diga o motivo.");
  const ate = fim === undefined || fim === null ? null : typeof fim === "string" && !Number.isNaN(Date.parse(fim)) ? new Date(fim).toISOString() : "x";
  if (ate === "x") return falha(400, "formato", "Hora inválida.");
  return tentar(() =>
    getBanco().asUser(ctx, async (tx) => {
      const fimSql = ate ? sql`${ate}::timestamptz` : sql`now()`;
      const [l] = (await tx.execute(sql`
        insert into maestro.tempo_registros (org_id, zro_sub, card_id, inicio, fim, origem, motivo)
        values (maestro.current_org_id(), maestro.current_sub(), ${card}, ${fimSql} - make_interval(mins => ${minutos}), ${fimSql}, 'manual', ${m})
        returning ${COLUNAS}`)) as unknown as Linha[];
      return { ok: true as const, registro: paraRegistro(l) };
    }),
  );
}

/** Corrige o início e/ou o fim de uma sessão minha (a que roda: só o início). */
export async function ajustar(ctx: Contexto, id: unknown, inicio: unknown, fim: unknown, motivo: unknown): Promise<Res<{ registro: Registro }>> {
  if (typeof id !== "string" || !UUID.test(id)) return falha(400, "formato", "Sessão inválida.");
  const data = (v: unknown) => (v === undefined ? undefined : typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  const ini = data(inicio);
  const fi = data(fim);
  if (ini === null || fi === null || (ini === undefined && fi === undefined)) return falha(400, "formato", "Hora inválida.");
  const m = motivo === undefined || motivo === null || motivo === "" ? null : motivoOk(motivo);
  if (m === undefined) return falha(400, "motivo", "Motivo até 200 letras.");
  return tentar(() =>
    getBanco().asUser(ctx, async (tx) => {
      const [atual] = (await tx.execute(
        sql`select ${COLUNAS} from maestro.tempo_registros where id = ${id} and zro_sub = maestro.current_sub() and apagado_em is null for update`,
      )) as unknown as Linha[];
      if (!atual) return falha(404, "nao_existe", "Essa sessão não existe mais.");
      if (!atual.fim && fi !== undefined) return falha(400, "rodando", "Pause antes de mudar o fim.");
      const [l] = (await tx.execute(sql`
        update maestro.tempo_registros
           set inicio = coalesce(${ini ?? null}::timestamptz, inicio), fim = coalesce(${fi ?? null}::timestamptz, fim),
               motivo = coalesce(${m}, motivo)
         where id = ${id} returning ${COLUNAS}`)) as unknown as Linha[];
      if (!l) return falha(404, "nao_existe", "Essa sessão não existe mais.");
      return { ok: true as const, registro: paraRegistro(l) };
    }),
  );
}

/** Tira uma sessão minha (vira lápide: o Desfazer volta). */
export async function apagarSessao(ctx: Contexto, id: unknown): Promise<Res<{ ids: string[] }>> {
  if (typeof id !== "string" || !UUID.test(id)) return falha(400, "formato", "Sessão inválida.");
  return tentar(() =>
    getBanco().asUser(ctx, async (tx) => {
      const r = (await tx.execute(sql`
        update maestro.tempo_registros set apagado_em = now(), fim = coalesce(fim, now())
         where id = ${id} and zro_sub = maestro.current_sub() and apagado_em is null returning id`)) as unknown as { id: string }[];
      return { ok: true as const, ids: r.map((x) => x.id) };
    }),
  );
}

/** "Zerar": todo o MEU tempo neste card vira lápide (o que roda para junto). Devolve os ids para o Desfazer. */
export async function zerar(ctx: Contexto, card: unknown): Promise<Res<{ ids: string[] }>> {
  if (typeof card !== "string" || !ID_CARD.test(card)) return falha(400, "formato", "Card inválido.");
  return tentar(() =>
    getBanco().asUser(ctx, async (tx) => {
      const r = (await tx.execute(sql`
        update maestro.tempo_registros set apagado_em = now(), fim = coalesce(fim, least(now(), inicio + interval '24 hours'))
         where card_id = ${card} and zro_sub = maestro.current_sub() and apagado_em is null returning id`)) as unknown as { id: string }[];
      return { ok: true as const, ids: r.map((x) => x.id) };
    }),
  );
}

/** Desfazer o Zerar (ou o apagar): as lápides voltam. Nunca reabre: o que rodava volta pausado. */
export async function restaurar(ctx: Contexto, ids: unknown): Promise<Res<{ ids: string[] }>> {
  if (!Array.isArray(ids) || ids.length > 500 || !ids.every((i) => typeof i === "string" && UUID.test(i))) return falha(400, "formato", "Pedido inválido.");
  if (!ids.length) return { ok: true, ids: [] };
  return tentar(() =>
    getBanco().asUser(ctx, async (tx) => {
      const r = (await tx.execute(sql`
        update maestro.tempo_registros set apagado_em = null
         where id = any(${`{${(ids as string[]).join(",")}}`}::uuid[]) and zro_sub = maestro.current_sub() and apagado_em is not null
         returning id`)) as unknown as { id: string }[];
      return { ok: true as const, ids: r.map((x) => x.id) };
    }),
  );
}

/** As minhas sessões de um card (Ajustar), as mais novas primeiro. */
export async function sessoesDoCard(ctx: Contexto, card: string): Promise<Registro[]> {
  if (!ID_CARD.test(card)) return [];
  return getBanco().asUser(ctx, async (tx) =>
    (
      (await tx.execute(sql`
        select ${COLUNAS} from maestro.tempo_registros
         where card_id = ${card} and zro_sub = maestro.current_sub() and apagado_em is null
         order by inicio desc limit 60`)) as unknown as Linha[]
    ).map(paraRegistro),
  );
}

/* ───────────── o Resumo da semana e o painel por tipo ───────────── */

export type Nomes = {
  clientes: Record<string, string>;
  projetos: Record<string, string>;
  tipos: Record<string, { nome: string; cor: string }>;
  pessoas: Record<string, string>;
  cards: Record<string, { tema: string; cliente: string | null }>;
};

async function nomes(tx: Tx): Promise<Omit<Nomes, "cards">> {
  type L = { id: string; nome: string; cor?: string }[];
  const c = (await tx.execute(sql`select id, name as nome from maestro.clients`)) as unknown as L;
  const p = (await tx.execute(sql`select id, code || ' · ' || title as nome from maestro.projects`)) as unknown as L;
  const t = (await tx.execute(sql`select id, nome, cor from maestro.tipos_video`)) as unknown as L;
  const m = (await tx.execute(
    sql`select zro_sub as id, coalesce(nullif(display_name, ''), email, 'Pessoa') as nome from maestro.members where status = 'active'`,
  )) as unknown as L;
  return {
    clientes: Object.fromEntries(c.map((x) => [x.id, x.nome])),
    projetos: Object.fromEntries(p.map((x) => [x.id, x.nome])),
    tipos: Object.fromEntries(t.map((x) => [x.id, { nome: x.nome, cor: x.cor ?? "pedra" }])),
    pessoas: Object.fromEntries(m.map((x) => [x.id, x.nome])),
  };
}

/** Quem: `eu`, `time` (só administração e gestão) ou o sub de uma pessoa (idem). */
export type Quem = "eu" | "time" | string;
function quemPermitido(quem: unknown, papel: Papel): Quem | null {
  if (quem === undefined || quem === null || quem === "" || quem === "eu") return "eu";
  if (!podeVerTempoDoTime(papel)) return null;
  if (quem === "time") return "time";
  return typeof quem === "string" && UUID.test(quem) ? quem.toLowerCase() : null;
}
const filtroQuem = (quem: Quem) => (quem === "eu" ? sql`and t.zro_sub = maestro.current_sub()` : quem === "time" ? sql`` : sql`and t.zro_sub = ${quem}::uuid`);

async function registrosEntre(tx: Tx, quem: Quem, de: string, ate: string, cliente?: string | null): Promise<Registro[]> {
  const doCliente = cliente ? sql`and c.cliente = ${cliente}` : sql``;
  return (
    (await tx.execute(sql`
      select t.id, t.zro_sub, t.card_id, t.inicio, t.fim, t.origem, t.modo, t.motivo
        from maestro.tempo_registros t join maestro.cards c on c.org_id = t.org_id and c.id = t.card_id
       where t.apagado_em is null and c.apagado_em is null
         and t.inicio < ${ate}::timestamptz and coalesce(t.fim, now()) > ${de}::timestamptz
         ${filtroQuem(quem)} ${doCliente}`)) as unknown as Linha[]
  ).map(paraRegistro);
}

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function semana(
  ctx: Contexto,
  papel: Papel,
  o: { dia?: unknown; quem?: unknown },
): Promise<Res<{ semana: Semana; nomes: Nomes; quem: Quem; agora: string }>> {
  const quem = quemPermitido(o.quem, papel);
  if (!quem) return falha(403, "sem_permissao", "Só administração e gestão veem o tempo do time.");
  const dia = typeof o.dia === "string" && DIA_ISO.test(o.dia) ? o.dia : diaLocal(Date.now());
  const segunda = segundaDaSemana(dia);
  const de = new Date(inicioDoDia(segunda)).toISOString();
  const ate = new Date(inicioDoDia(segunda) + 7 * DIA).toISOString();
  return tentar(() =>
    getBanco().asUser(ctx, async (tx) => {
      const [{ agora }] = (await tx.execute(sql`select now() as agora`)) as unknown as { agora: Date }[];
      const regs = await registrosEntre(tx, quem, de, ate);
      const cards = await cardsPorId(tx, [...new Set(regs.map((r) => r.card))]);
      const s = resumoDaSemana(regs, new Map(Object.entries(cards)), segunda, new Date(agora).getTime());
      const n = await nomes(tx);
      return {
        ok: true as const,
        semana: s,
        quem,
        agora: iso(agora),
        nomes: { ...n, cards: Object.fromEntries(Object.values(cards).map((c) => [c.id, { tema: c.tema, cliente: c.cliente ?? null }])) },
      };
    }),
  );
}

export const PERIODOS = { "30d": 30, "90d": 90, "12m": 365, tudo: 3650 } as const;
export type Periodo = keyof typeof PERIODOS;
const ehPeriodo = (v: unknown): v is Periodo => typeof v === "string" && Object.hasOwn(PERIODOS, v);

export type PainelTipos = {
  periodo: Periodo;
  granularidade: Granularidade;
  quem: Quem;
  cliente: string | null;
  tipos: EstatisticaTipo[];
  nomes: Omit<Nomes, "cards">;
  /** O típico (mediana arredondada a 5 min) de cada tipo com 3+ vídeos: a sugestão do previsto. ms. */
  tipicos: Record<string, number>;
};

/**
 * Quanto cada tipo de vídeo leva: só cards concluídos (Aprovado, Agendado, Entregue) dentro do período pela hora em
 * que entraram na coluna; o tempo de cada card é o que a pessoa vê (o dela; a gestão, o do time ou de uma pessoa).
 */
export async function painelPorTipo(
  ctx: Contexto,
  papel: Papel,
  o: { periodo?: unknown; quem?: unknown; cliente?: unknown },
): Promise<Res<{ painel: PainelTipos }>> {
  const quem = quemPermitido(o.quem, papel);
  if (!quem) return falha(403, "sem_permissao", "Só administração e gestão veem o tempo do time.");
  const periodo: Periodo = ehPeriodo(o.periodo) ? o.periodo : "90d";
  const cliente = typeof o.cliente === "string" && UUID.test(o.cliente) ? o.cliente.toLowerCase() : null;
  const granularidade: Granularidade = PERIODOS[periodo] <= 90 ? "semana" : "mes";
  return tentar(() =>
    getBanco().asUser(ctx, async (tx) => {
      const [{ agora }] = (await tx.execute(sql`select now() as agora`)) as unknown as { agora: Date }[];
      const fim = new Date(agora).getTime();
      const de = inicioDoDia(diaLocal(fim - (PERIODOS[periodo] - 1) * DIA));
      const ate = fim + MIN;
      const doCliente = cliente ? sql`and c.cliente = ${cliente}` : sql``;
      const concluidos = (await tx.execute(sql`
        select c.id, coalesce(c.dados ->> 'tema', '') as tema, c.coluna, c.cliente, c.projeto, c.dados ->> 'tipo' as tipo,
               (c.dados ->> 'previsto')::int as previsto,
               coalesce((c.dados ->> 'colunaEm')::bigint, (extract(epoch from c.updated_at) * 1000)::bigint) as "concluidoEm"
          from maestro.cards c
         where c.apagado_em is null and c.coluna in ('aprovado', 'agendado', 'entregue') ${doCliente}`)) as unknown as (CardConcluido & {
        concluidoEm: string | number;
      })[];
      const lista = concluidos.map((c) => ({ ...c, concluidoEm: Number(c.concluidoEm) }));
      const ids = lista.filter((c) => c.concluidoEm >= de && c.concluidoEm < ate).map((c) => c.id);
      const regs = ids.length
        ? (
            (await tx.execute(sql`
              select t.id, t.zro_sub, t.card_id, t.inicio, t.fim, t.origem, t.modo, t.motivo
                from maestro.tempo_registros t
               where t.apagado_em is null and t.card_id = any(${textoArray(ids)}::text[]) ${filtroQuem(quem)}`)) as unknown as Linha[]
          ).map(paraRegistro)
        : [];
      const tempo = porCard(regs, fim);
      const tipos = estatisticasPorTipo(lista, tempo, { de, ate, granularidade });
      const tipicos: Record<string, number> = {};
      for (const e of tipos) {
        const v = tipicoDoTipo(e);
        if (e.tipo && v) tipicos[e.tipo] = v;
      }
      return { ok: true as const, painel: { periodo, granularidade, quem, cliente, tipos, nomes: await nomes(tx), tipicos } };
    }),
  );
}

/** O típico de cada tipo para a sugestão do previsto (últimos 12 meses, o que a pessoa vê). */
export async function tipicos(ctx: Contexto, papel: Papel): Promise<Record<string, number>> {
  const r = await painelPorTipo(ctx, papel, { periodo: "12m", quem: podeVerTempoDoTime(papel) ? "time" : "eu" });
  return r.ok ? r.painel.tipicos : {};
}

/* ───────────── a lista de tipos ───────────── */

export async function listarTipos(ctx: Contexto): Promise<TipoVideo[]> {
  return getBanco().asUser(ctx, async (tx) =>
    [
      ...((await tx.execute(
        sql`select id, nome, cor, ordem, arquivado_em is not null as arquivado from maestro.tipos_video order by ordem, lower(nome)`,
      )) as unknown as TipoVideo[]),
    ].map((t) => ({ ...t, ordem: Number(t.ordem) })),
  );
}

function traduzirTipo(e: unknown): Falha {
  if (codigoPg(e) === PG.unicidade) return falha(409, "nome_existe", "Já existe um tipo com esse nome.");
  if (codigoPg(e) === PG.semPrivilegio) return falha(403, "sem_permissao", mensagemPg(e) || "Seu papel não muda os tipos.");
  return traduzir(e);
}

export async function operarTipo(ctx: Contexto, papel: Papel, corpo: Record<string, unknown>): Promise<Res<{ tipos: TipoVideo[] }>> {
  if (!podeCronometrar(papel)) return falha(403, "sem_permissao", "Seu papel só lê.");
  try {
    await getBanco().asUser(ctx, async (tx) => {
      switch (corpo.op) {
        case "tipo_criar": {
          const nome = nomeDoTipo(corpo.nome);
          const cor = corDoTipo(corpo.cor) ?? "pedra";
          if (!nome) throw falha(400, "formato", "Nome de 1 a 40 letras.");
          const [{ n, ordem }] = (await tx.execute(
            sql`select count(*)::int as n, coalesce(max(ordem), 0) + 1 as ordem from maestro.tipos_video where arquivado_em is null`,
          )) as unknown as { n: number; ordem: number }[];
          if (n >= MAX_TIPOS) throw falha(400, "limite", `Até ${MAX_TIPOS} tipos.`);
          await tx.execute(sql`insert into maestro.tipos_video (org_id, nome, cor, ordem) values (maestro.current_org_id(), ${nome}, ${cor}, ${ordem})`);
          return;
        }
        case "tipo_mudar": {
          if (typeof corpo.id !== "string" || !UUID.test(corpo.id)) throw falha(400, "formato", "Tipo inválido.");
          const nome = corpo.nome === undefined ? undefined : nomeDoTipo(corpo.nome);
          const cor = corpo.cor === undefined ? undefined : corDoTipo(corpo.cor);
          if (nome === undefined && cor === undefined) throw falha(400, "formato", "Nada para mudar.");
          if (cor !== undefined && !ehCorColuna(cor)) throw falha(400, "formato", "Cor inválida.");
          const r = await tx.execute(
            sql`update maestro.tipos_video set nome = coalesce(${nome ?? null}, nome), cor = coalesce(${cor ?? null}, cor) where id = ${corpo.id} returning id`,
          );
          if (!r.length) throw falha(404, "nao_existe", "Esse tipo não existe mais.");
          return;
        }
        case "tipo_arquivar":
        case "tipo_restaurar": {
          if (typeof corpo.id !== "string" || !UUID.test(corpo.id)) throw falha(400, "formato", "Tipo inválido.");
          const r = await tx.execute(
            corpo.op === "tipo_arquivar"
              ? sql`update maestro.tipos_video set arquivado_em = now() where id = ${corpo.id} and arquivado_em is null returning id`
              : sql`update maestro.tipos_video set arquivado_em = null where id = ${corpo.id} and arquivado_em is not null returning id`,
          );
          if (!r.length) throw falha(404, "nao_existe", "Esse tipo não existe mais.");
          return;
        }
        default:
          throw falha(400, "formato", "Operação desconhecida.");
      }
    });
  } catch (e) {
    if ((e as Falha)?.ok === false) return e as Falha;
    return traduzirTipo(e);
  }
  return { ok: true, tipos: await listarTipos(ctx) };
}

export const OPS_DE_TIPO = new Set(["tipo_criar", "tipo_mudar", "tipo_arquivar", "tipo_restaurar"]);
