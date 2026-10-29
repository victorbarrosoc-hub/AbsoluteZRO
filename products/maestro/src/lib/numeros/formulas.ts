/**
 * Números do negócio (estudo MakersHub §4.3): as contas, puras. O servidor (`servidor.ts`) soma no banco e chama
 * estas funções; os testes conferem cada fórmula. Dinheiro sempre em centavos; taxa em 0–1 (null = sem base, "—").
 *
 * - Faturado: entradas com vencimento no período (o que foi cobrado), recebido: baixas de entrada no período.
 * - Ticket médio: total dos orçamentos aprovados no período ÷ quantos.
 * - Conversão: pedidos que chegaram no período e já têm orçamento aprovado ÷ pedidos que chegaram no período.
 * - Taxa de ganho: ganhos ÷ (ganhos + perdidos), pelos pedidos que fecharam no período.
 * - Margem: (entradas − saídas) ÷ entradas, pelos lançamentos ligados ao projeto (ou ao cliente).
 */
import { ehMes, limitesDoMes, somarMeses } from "@/lib/dinheiro";

export type TipoPeriodo = "mes" | "tri" | "ano";
export type Periodo = { tipo: TipoPeriodo; de: string; ate: string; mes: string; rotulo: string };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** O período a partir do mês de referência: o mês, os 3 meses até ele ou o ano dele. */
export function periodoDe(tipo: unknown, mesRef: unknown, hoje: string): Periodo {
  const mes = ehMes(mesRef) ? mesRef : hoje.slice(0, 7);
  const t: TipoPeriodo = tipo === "tri" || tipo === "ano" ? tipo : "mes";
  if (t === "ano") return { tipo: t, de: `${mes.slice(0, 4)}-01-01`, ate: `${mes.slice(0, 4)}-12-31`, mes, rotulo: mes.slice(0, 4) };
  if (t === "tri") {
    const ini = somarMeses(mes, -2);
    return {
      tipo: t,
      de: limitesDoMes(ini).inicio,
      ate: limitesDoMes(mes).fim,
      mes,
      rotulo: `${MESES[+ini.slice(5, 7) - 1]}–${MESES[+mes.slice(5, 7) - 1]} ${mes.slice(0, 4)}`,
    };
  }
  return { tipo: t, de: limitesDoMes(mes).inicio, ate: limitesDoMes(mes).fim, mes, rotulo: `${MESES[+mes.slice(5, 7) - 1]} ${mes.slice(0, 4)}` };
}

/** Os meses (AAAA-MM) do período, em ordem. */
export function mesesDoPeriodo(p: Periodo): string[] {
  const fim = p.ate.slice(0, 7);
  const out: string[] = [];
  for (let m = p.de.slice(0, 7); m <= fim && out.length < 12; m = somarMeses(m, 1)) out.push(m);
  return out;
}

export function taxa(parte: number, todo: number): number | null {
  if (!(todo > 0)) return null;
  return Math.max(0, Math.min(1, parte / todo));
}

export function ticketMedio(valores: number[]): number | null {
  const v = valores.filter((x) => Number.isFinite(x) && x > 0);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/** Margem de contribuição: (entradas − saídas) ÷ entradas. Sem entrada, sem margem. */
export function margem(entradas: number, saidas: number): number | null {
  if (!(entradas > 0)) return null;
  return (entradas - saidas) / entradas;
}

/** A meta proporcional ao período (mês = a meta do mês; tri e ano = soma das metas dos meses que têm meta). */
export function metaDoPeriodo(metas: Record<string, number>, meses: string[]): number | null {
  const v = meses.map((m) => metas[m]).filter((x): x is number => typeof x === "number" && x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
}

/** Progresso da meta (pode passar de 1: bateu a meta). */
export function progressoMeta(faturado: number, meta: number | null): number | null {
  if (!meta || meta <= 0) return null;
  return Math.max(0, faturado / meta);
}

/** Onde o mês deveria estar hoje (fração do mês corrida), para comparar com o progresso. 1 para meses passados. */
export function ritmoEsperado(mes: string, hoje: string): number {
  const atual = hoje.slice(0, 7);
  if (mes < atual) return 1;
  if (mes > atual) return 0;
  const { fim } = limitesDoMes(mes);
  return +hoje.slice(8, 10) / +fim.slice(8, 10);
}

/** Agrupa e ordena do maior para o menor, juntando o que passa de `max` em "Outros". */
export function topo<T extends { valor: number; nome: string }>(itens: T[], max: number): (T | { nome: string; valor: number; outros: true })[] {
  const ord = [...itens].sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"));
  if (ord.length <= max) return ord;
  const resto = ord.slice(max - 1).reduce((t, x) => t + x.valor, 0);
  return [...ord.slice(0, max - 1), { nome: "Outros", valor: resto, outros: true as const }];
}
