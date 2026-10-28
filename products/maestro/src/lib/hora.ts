/**
 * A hora do dia da luz ambiente (C1 · Aurora). Puro: o cliente usa o relógio de quem vê; o servidor só usa o fuso do
 * Brasil como padrão da saudação (a tela corrige depois de montar, sem erro de hidratação).
 */

/** O tom da luz: manhã (5–12), tarde (12–17), fim de tarde (17–19) e noite (19–5). */
export type Luz = "manha" | "tarde" | "fim" | "noite";

export function luzDaHora(hora: number): Luz {
  if (hora >= 5 && hora < 12) return "manha";
  if (hora >= 12 && hora < 17) return "tarde";
  if (hora >= 17 && hora < 19) return "fim";
  return "noite";
}

/** O nome curto do período, como no relógio da cápsula ("Manhã · 10:42"). */
export function periodoDaHora(hora: number): string {
  if (hora >= 5 && hora < 12) return "Manhã";
  if (hora >= 12 && hora < 18) return "Tarde";
  if (hora >= 18) return "Noite";
  return "Madrugada";
}

/** A saudação do Hoje: bom dia (5–12), boa tarde (12–18), boa noite (18–5). */
export function saudacaoDaHora(hora: number): string {
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** "Manhã · 10:42". */
export function rotuloDoRelogio(hora: number, minuto: number): string {
  return `${periodoDaHora(hora)} · ${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

/** A hora agora no fuso do Brasil (padrão do servidor). */
export function horaNoBrasil(agora = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(agora);
  return Number(h) % 24;
}
