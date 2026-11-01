/**
 * O cronômetro de tarefas (drizzle/0038), as contas. Puro: roda no navegador (o mini-cronômetro, o painel), no
 * servidor (o Resumo da semana, o painel por tipo) e nos testes.
 *
 * O tempo corre a partir do `inicio` que o BANCO gravou (relógio do servidor), nunca do relógio da aba: a tela guarda a
 * diferença entre o relógio do servidor e o dela (`desvio`) e desenha `agora + desvio - inicio`. Dias e semanas no fuso
 * do Brasil (UTC-3 fixo: sem horário de verão desde 2019, como em src/lib/agenda/ics.ts).
 */

export const MIN = 60_000;
export const HORA = 60 * MIN;
export const DIA = 24 * HORA;
/** Uma sessão tem até 24 h (o mesmo check `tempo_ate_24h` do banco). */
export const MAX_SESSAO_MS = DIA;
/** UTC-3 (America/Sao_Paulo sem horário de verão). */
const FUSO_MS = -3 * HORA;

export type Origem = "cronometro" | "manual";
export type Modo = "livre" | "pomodoro";

/** Uma sessão como a tela e as contas recebem (horas em ISO). */
export type Registro = {
  id: string;
  sub: string;
  card: string;
  inicio: string;
  fim: string | null;
  origem: Origem;
  modo: Modo;
  motivo: string | null;
};

const t = (iso: string) => Date.parse(iso);

/** Quanto a sessão durou (rodando: até `agora`), entre 0 e 24 h. */
export function duracaoMs(r: Pick<Registro, "inicio" | "fim">, agora: number): number {
  const fim = r.fim ? t(r.fim) : agora;
  return Math.min(MAX_SESSAO_MS, Math.max(0, fim - t(r.inicio)));
}

const D2 = (n: number) => String(n).padStart(2, "0");

/** "01:11:07" (o cronômetro grande e a pílula). */
export function relogio(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${D2(Math.floor(s / 3600))}:${D2(Math.floor((s % 3600) / 60))}:${D2(s % 60)}`;
}

/** "25:00" (contagem do Pomodoro: minutos e segundos; arredonda para cima, como o Relógio da Apple). */
export function contagem(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${D2(Math.floor(s / 60))}:${D2(s % 60)}`;
}

/** "1h 22min", "38min", "<1min" (Concluídas, Semana, selo do card). */
export function duracaoCurta(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / MIN);
  if (m < 1) return ms > 0 ? "<1min" : "0min";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}min`;
  return r ? `${h}h ${r}min` : `${h}h`;
}

/** "2h10" (as médias do painel por tipo e a sugestão do previsto: o jeito de falar de duração). */
export function duracaoFalada(ms: number): string {
  const m = Math.round(Math.max(0, ms) / MIN);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}min`;
  return r ? `${h}h${D2(r)}` : `${h}h`;
}

/** O título da aba enquanto roda: "▶ 01:11 · Editar Monstro" (horas e minutos). */
export function tituloDaAba(ms: number, tema: string): string {
  const m = Math.floor(Math.max(0, ms) / MIN);
  return `▶ ${D2(Math.floor(m / 60))}:${D2(m % 60)} · ${tema}`;
}

/* ───────────── dias e semanas no fuso do Brasil ───────────── */

/** O dia (aaaa-mm-dd) de um instante no fuso do Brasil. */
export function diaLocal(ms: number): string {
  return new Date(ms + FUSO_MS).toISOString().slice(0, 10);
}

/** O instante em que um dia (aaaa-mm-dd) começa no fuso do Brasil. */
export function inicioDoDia(dia: string): number {
  return Date.parse(`${dia}T00:00:00.000Z`) - FUSO_MS;
}

export function somarDias(dia: string, n: number): string {
  return diaLocal(inicioDoDia(dia) + n * DIA + 12 * HORA);
}

/** A segunda-feira da semana de um dia. */
export function segundaDaSemana(dia: string): string {
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return somarDias(dia, -((semana + 6) % 7));
}

export const NOMES_DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

/**
 * Quanto de cada sessão caiu em cada dia (a sessão que passa da meia-noite se divide). Só o que cai em [de, ate).
 * Devolve dia → ms.
 */
export function porDia(regs: Pick<Registro, "inicio" | "fim">[], agora: number, de?: number, ate?: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of regs) {
    let a = t(r.inicio);
    let b = a + duracaoMs(r, agora);
    if (de !== undefined) a = Math.max(a, de);
    if (ate !== undefined) b = Math.min(b, ate);
    while (a < b) {
      const dia = diaLocal(a);
      const fimDoDia = inicioDoDia(dia) + DIA;
      const corte = Math.min(b, fimDoDia);
      out.set(dia, (out.get(dia) ?? 0) + (corte - a));
      a = corte;
    }
  }
  return out;
}

/** Tempo de cada card (soma das sessões; rodando conta até agora). */
export function porCard(regs: Registro[], agora: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of regs) out.set(r.card, (out.get(r.card) ?? 0) + duracaoMs(r, agora));
  return out;
}

/* ───────────── o Resumo da semana ───────────── */

export type CardDoTempo = {
  id: string;
  tema: string;
  coluna: string;
  cliente?: string | null;
  projeto?: string | null;
  tipo?: string | null;
  previsto?: number | null;
};

export type Fatia = { id: string | null; ms: number };

export type Semana = {
  segunda: string;
  dias: { dia: string; ms: number }[];
  totalMs: number;
  diasDeTrabalho: number;
  tarefas: number;
  porCliente: Fatia[];
  porProjeto: Fatia[];
  porTipo: Fatia[];
  top: { card: string; ms: number }[];
  /** Os cards de cada dia (o seletor de dias da lista "Tarefas"), o mais longo primeiro. */
  cardsPorDia: Record<string, { card: string; ms: number }[]>;
};

const fatias = (m: Map<string | null, number>): Fatia[] =>
  [...m.entries()].map(([id, ms]) => ({ id, ms })).sort((a, b) => b.ms - a.ms || String(a.id).localeCompare(String(b.id)));

/** A semana (segunda a domingo) das sessões dadas, já filtradas por quem vê. */
export function resumoDaSemana(regs: Registro[], cards: Map<string, CardDoTempo>, segunda: string, agora: number): Semana {
  const de = inicioDoDia(segunda);
  const ate = de + 7 * DIA;
  const dias = porDia(regs, agora, de, ate);
  const porCardSemana = new Map<string, number>();
  const diaCard = new Map<string, Map<string, number>>();
  for (const r of regs) {
    const ms = porDia([r], agora, de, ate);
    const soma = [...ms.values()].reduce((a, b) => a + b, 0);
    if (soma > 0) porCardSemana.set(r.card, (porCardSemana.get(r.card) ?? 0) + soma);
    for (const [dia, v] of ms) {
      if (!diaCard.has(dia)) diaCard.set(dia, new Map());
      const m = diaCard.get(dia)!;
      m.set(r.card, (m.get(r.card) ?? 0) + v);
    }
  }
  const cli = new Map<string | null, number>();
  const prj = new Map<string | null, number>();
  const tip = new Map<string | null, number>();
  for (const [id, ms] of porCardSemana) {
    const c = cards.get(id);
    cli.set(c?.cliente ?? null, (cli.get(c?.cliente ?? null) ?? 0) + ms);
    prj.set(c?.projeto ?? null, (prj.get(c?.projeto ?? null) ?? 0) + ms);
    tip.set(c?.tipo ?? null, (tip.get(c?.tipo ?? null) ?? 0) + ms);
  }
  const lista = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i)).map((dia) => ({ dia, ms: dias.get(dia) ?? 0 }));
  return {
    segunda,
    dias: lista,
    totalMs: lista.reduce((a, d) => a + d.ms, 0),
    diasDeTrabalho: lista.filter((d) => d.ms >= MIN).length,
    tarefas: [...porCardSemana.keys()].filter((id) => {
      const c = cards.get(id);
      return !!c && concluido(c.coluna);
    }).length,
    porCliente: fatias(cli),
    porProjeto: fatias(prj),
    porTipo: fatias(tip),
    top: [...porCardSemana.entries()]
      .map(([card, ms]) => ({ card, ms }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 8),
    cardsPorDia: Object.fromEntries(
      [...diaCard.entries()].map(([dia, m]) => [dia, [...m.entries()].map(([card, ms]) => ({ card, ms })).sort((a, b) => b.ms - a.ms)]),
    ),
  };
}

/** O card saiu da mão de quem edita (foi para revisão, para o cliente ou adiante): entra em "Concluídas". */
export const saiuDaMao = (coluna: string | null | undefined) => !!coluna && ["revisao", "aprovacao", "aprovado", "agendado", "entregue"].includes(coluna);

/** Vídeo concluído: o card saiu da produção e o cliente já aprovou (Aprovado, Agendado ou Entregue). */
export const COLUNAS_CONCLUIDAS = ["aprovado", "agendado", "entregue"] as const;
export const concluido = (coluna: string | null | undefined) => !!coluna && (COLUNAS_CONCLUIDAS as readonly string[]).includes(coluna);

/* ───────────── o painel por tipo de vídeo ───────────── */

/** Quantil por interpolação linear (o mesmo do R tipo 7 e do NumPy padrão). Lista já ordenada. */
export function quantil(ordenada: number[], q: number): number {
  if (!ordenada.length) return 0;
  const pos = (ordenada.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  const prox = ordenada[base + 1];
  return prox === undefined ? ordenada[base] : ordenada[base] + resto * (prox - ordenada[base]);
}

export type CardConcluido = CardDoTempo & { concluidoEm: number };

export type EstatisticaTipo = {
  tipo: string | null;
  videos: number;
  totalMs: number;
  mediaMs: number;
  medianaMs: number;
  p25Ms: number;
  p75Ms: number;
  /** A média por período (semana ou mês), do mais antigo ao mais novo; `null` = nenhum vídeo naquele período. */
  tendencia: { periodo: string; mediaMs: number | null; videos: number }[];
};

export type Granularidade = "semana" | "mes";

/** O período (segunda da semana ou aaaa-mm) de um instante. */
export function periodoDe(ms: number, g: Granularidade): string {
  const dia = diaLocal(ms);
  return g === "mes" ? dia.slice(0, 7) : segundaDaSemana(dia);
}

/** Os períodos de `de` até `ate`, em ordem. */
export function periodos(de: number, ate: number, g: Granularidade): string[] {
  const out: string[] = [];
  let p = periodoDe(de, g);
  const ultimo = periodoDe(ate, g);
  for (let i = 0; i < 400 && p <= ultimo; i++) {
    out.push(p);
    if (g === "semana") p = somarDias(p, 7);
    else {
      const [a, m] = p.split("-").map(Number);
      p = m === 12 ? `${a + 1}-01` : `${a}-${D2(m + 1)}`;
    }
  }
  return out;
}

/**
 * Por tipo: só vídeos concluídos com tempo (> 1 min) no período. `tempo` = ms de cada card, já filtrado por quem vê
 * e pela pessoa escolhida. Ordem: mais vídeos primeiro.
 */
export function estatisticasPorTipo(
  cards: CardConcluido[],
  tempo: Map<string, number>,
  o: { de: number; ate: number; granularidade: Granularidade },
): EstatisticaTipo[] {
  const grupos = new Map<string | null, { ms: number; em: number }[]>();
  for (const c of cards) {
    const ms = tempo.get(c.id) ?? 0;
    if (ms < MIN || !concluido(c.coluna) || c.concluidoEm < o.de || c.concluidoEm >= o.ate) continue;
    const k = c.tipo ?? null;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push({ ms, em: c.concluidoEm });
  }
  const lista = periodos(o.de, o.ate - 1, o.granularidade);
  return [...grupos.entries()]
    .map(([tipo, vs]) => {
      const ord = vs.map((v) => v.ms).sort((a, b) => a - b);
      const total = ord.reduce((a, b) => a + b, 0);
      const porPeriodo = new Map<string, number[]>();
      for (const v of vs) {
        const p = periodoDe(v.em, o.granularidade);
        if (!porPeriodo.has(p)) porPeriodo.set(p, []);
        porPeriodo.get(p)!.push(v.ms);
      }
      return {
        tipo,
        videos: ord.length,
        totalMs: total,
        mediaMs: total / ord.length,
        medianaMs: quantil(ord, 0.5),
        p25Ms: quantil(ord, 0.25),
        p75Ms: quantil(ord, 0.75),
        tendencia: lista.map((periodo) => {
          const l = porPeriodo.get(periodo) ?? [];
          return { periodo, videos: l.length, mediaMs: l.length ? l.reduce((a, b) => a + b, 0) / l.length : null };
        }),
      };
    })
    .sort((a, b) => b.videos - a.videos || b.totalMs - a.totalMs);
}

/** O tempo típico de um tipo para sugerir o previsto: a mediana, com pelo menos 3 vídeos (menos que isso não diz nada). */
export const MIN_VIDEOS_PARA_SUGERIR = 3;
export function tipicoDoTipo(e: EstatisticaTipo | undefined): number | null {
  if (!e || e.videos < MIN_VIDEOS_PARA_SUGERIR) return null;
  return Math.round(e.medianaMs / (5 * MIN)) * 5 * MIN || 5 * MIN;
}

/* ───────────── ociosidade ───────────── */

/** Parado depois de quanto tempo (mouse, teclado e toque parados, ou o computador dormiu) a tela pergunta. */
export const OCIOSO_PADRAO_MIN = 10;

/**
 * Ao voltar: houve um parado que vale perguntar? `ultimaAtividade` = último gesto (ou o último segundo em que o relógio
 * da aba andou, para pegar o computador dormindo). Só pergunta com o cronômetro rodando desde antes do parado.
 */
export function paradoParaPerguntar(o: { inicio: number; ultimaAtividade: number; agora: number; limiteMin: number }): number | null {
  const desde = Math.max(o.inicio, o.ultimaAtividade);
  const parado = o.agora - desde;
  return parado >= o.limiteMin * MIN ? desde : null;
}

/* ───────────── Pomodoro ───────────── */

export type ConfigPomodoro = { focoMin: number; pausaMin: number; longaMin: number; ciclos: number };
export const POMODORO_PADRAO: ConfigPomodoro = { focoMin: 25, pausaMin: 5, longaMin: 15, ciclos: 4 };

/** Confere a configuração (vinda do localStorage): fora dos limites, o padrão daquele campo. */
export function lerPomodoro(v: unknown): ConfigPomodoro {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const n = (k: keyof ConfigPomodoro, min: number, max: number) => {
    const x = o[k];
    return typeof x === "number" && Number.isInteger(x) && x >= min && x <= max ? x : POMODORO_PADRAO[k];
  };
  return { focoMin: n("focoMin", 5, 120), pausaMin: n("pausaMin", 1, 30), longaMin: n("longaMin", 5, 60), ciclos: n("ciclos", 2, 8) };
}

/** A pausa depois do foco número `feitos` (1, 2, …): a longa a cada `ciclos`. */
export function pausaDepois(feitos: number, c: ConfigPomodoro): { tipo: "pausa" | "longa"; ms: number } {
  return feitos > 0 && feitos % c.ciclos === 0 ? { tipo: "longa", ms: c.longaMin * MIN } : { tipo: "pausa", ms: c.pausaMin * MIN };
}

/* ───────────── previsto ───────────── */

/** Previsto do card em minutos (o campo `previsto` de dados): 5 min a 200 h, múltiplo de 5. */
export const PREVISTO_MAX_MIN = 200 * 60;
export function lerPrevisto(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 5 || v > PREVISTO_MAX_MIN || v % 5) return undefined;
  return v;
}

/** "1h30", "45" ou "2h" digitado → minutos (arredonda para 5). null = não entendi. */
export function entenderDuracao(txt: string): number | null {
  const s = txt.trim().toLowerCase().replace(/\s+/g, "").replace(",", ".");
  if (!s) return null;
  let min: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,3})(?::|h)(\d{1,2})(?:min|m)?$/))) min = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = s.match(/^(\d{1,3}(?:\.\d+)?)h$/))) min = Math.round(Number(m[1]) * 60);
  else if ((m = s.match(/^(\d{1,5})(?:min|m)?$/))) min = Number(m[1]);
  if (min === null || !Number.isFinite(min)) return null;
  const arred = Math.round(min / 5) * 5;
  return arred >= 5 && arred <= PREVISTO_MAX_MIN ? arred : null;
}

/** Estimado × real: quanto do previsto já foi (0–∞) e o tom (dentro, perto, passou). */
export function andamento(realMs: number, previstoMin: number | null | undefined): { fracao: number; tom: "ok" | "perto" | "passou" } | null {
  if (!previstoMin) return null;
  const fracao = realMs / (previstoMin * MIN);
  return { fracao, tom: fracao > 1 ? "passou" : fracao >= 0.8 ? "perto" : "ok" };
}
