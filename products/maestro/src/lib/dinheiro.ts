/**
 * Dinheiro e datas de calendário das telas da produtora (orçamentos, financeiro, freelas, inventário, agenda).
 * Dinheiro sempre em centavos (inteiro); datas em "AAAA-MM-DD". Puro: roda no servidor e no navegador.
 */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_CURTO = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** 123456 → "R$ 1.234,56" (espaço comum, não o fino do Intl, para o texto ser igual em todo lugar). */
export const brl = (centavos: number) => BRL.format((Number(centavos) || 0) / 100).replace(/\s/g, " ");

/** 123456 → "R$ 1.235" (gráficos e números grandes). */
export const brlCurto = (centavos: number) => BRL_CURTO.format(Math.round((Number(centavos) || 0) / 100)).replace(/\s/g, " ");

/** 123456 → "1.234,56" (valor de campo). */
export function centavosParaCampo(centavos: number | null | undefined): string {
  if (centavos == null) return "";
  return ((Number(centavos) || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * "1.234,56", "1234.56", "R$ 1.234", "1234" → centavos. Vazio = null; ilegível = NaN.
 * Ponto seguido de 3 dígitos é milhar ("1.500" = 1500); vírgula é decimal.
 */
export function lerReais(texto: unknown): number | null {
  if (texto === null || texto === undefined) return null;
  let t = String(texto)
    .replace(/[R$\s]/g, "")
    .trim();
  if (!t) return null;
  const negativo = t.startsWith("-");
  t = t.replace(/^-/, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const v = Math.round(Number(t) * 100);
  return negativo ? -v : v;
}

/** "1,5" ou "1.5" → 1.5. Vazio = null; ilegível = NaN. */
export function lerNumero(texto: unknown): number | null {
  if (texto === null || texto === undefined) return null;
  const t = String(texto).replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** 1.5 → "1,5" */
export const numeroBr = (n: number, casas = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

/** 0.4432 → "44%" */
export const porcento = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/* ───────────── datas ───────────── */

const D2 = (n: number) => String(n).padStart(2, "0");

/** Hoje no fuso do Brasil (o servidor roda em UTC). */
export function hojeBr(agora = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
  return p;
}

const utc = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const deUtc = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${D2(d.getUTCMonth() + 1)}-${D2(d.getUTCDate())}`;
};

export const somarDias = (s: string, n: number) => deUtc(utc(s) + n * 86_400_000);
export const diasEntre = (de: string, ate: string) => Math.round((utc(ate) - utc(de)) / 86_400_000);
export const ehData = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && deUtc(utc(v)) === v;
export const ehMes = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function somarMeses(mes: string, n: number): string {
  const d = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${D2(d.getUTCMonth() + 1)}`;
}

export function limitesDoMes(mes: string) {
  const ultimo = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${D2(ultimo)}` };
}

/** Dia N dentro do mês (31 em fevereiro vira o último dia). */
export function diaNoMes(mes: string, dia: number): string {
  const { fim } = limitesDoMes(mes);
  return `${mes}-${D2(Math.min(Math.max(1, Math.round(dia) || 1), +fim.slice(8, 10)))}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" → "outubro de 2026" */
export const mesPorExtenso = (mes: string) => `${MESES[+mes.slice(5, 7) - 1]} de ${mes.slice(0, 4)}`;
/** "2026-10" → "out" */
export const mesCurto = (mes: string) => MESES_CURTOS[+mes.slice(5, 7) - 1];
/** "2026-10-28" → "28 de outubro de 2026" */
export const dataPorExtenso = (s: string) => `${+s.slice(8, 10)} de ${MESES[+s.slice(5, 7) - 1]} de ${s.slice(0, 4)}`;
/** "2026-10-28" → "28/10" */
export const dataCurta = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");
/** "2026-10-28" → "28/10/2026" */
export const dataBr = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** "2026-10-28" → "qua" */
export const diaDaSemana = (s: string) => SEMANA[new Date(utc(s)).getUTCDay()];
