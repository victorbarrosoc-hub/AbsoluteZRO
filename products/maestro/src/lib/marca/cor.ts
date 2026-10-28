/**
 * A cor de destaque da produtora (plano v2 §8): só superfície, filete e marcador, nunca texto corrido. Por isso a
 * conferência é a de objeto gráfico da WCAG 2.1 (1.4.11): contraste de pelo menos 3:1 com o papel branco, onde ela
 * aparece (timbrado, páginas do cliente, que são claras). Puro: a tela e o servidor fazem a mesma conta.
 */

export const COR = /^#[0-9a-f]{6}$/;
export const CONTRASTE_MINIMO = 3;

/** "#AbC" ou "abcdef" viram "#aabbcc"; o resto, null. */
export function normalizarCor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let t = v.trim().toLowerCase();
  if (!t.startsWith("#")) t = `#${t}`;
  if (/^#[0-9a-f]{3}$/.test(t)) t = `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  return COR.test(t) ? t : null;
}

function luminancia(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores (1 a 21). */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

export type ConferenciaCor = { ok: true; cor: string; contraste: number } | { ok: false; mensagem: string };

/** Confere a cor para o papel branco. Vazio = sem cor (vale o latão do Maestro). */
export function conferirCor(v: unknown): ConferenciaCor | { ok: true; cor: null; contraste: null } {
  if (v == null || (typeof v === "string" && !v.trim())) return { ok: true, cor: null, contraste: null };
  const cor = normalizarCor(v);
  if (!cor) return { ok: false, mensagem: "Use o código da cor, como #1f6feb." };
  const c = contraste(cor, "#ffffff");
  if (c < CONTRASTE_MINIMO) return { ok: false, mensagem: "Clara demais para o papel branco. Escolha um tom mais escuro." };
  return { ok: true, cor, contraste: Math.round(c * 100) / 100 };
}

/** Texto que fica legível sobre a cor (grafite ou branco). */
export function textoSobre(cor: string): "#ffffff" | "#1d1d1f" {
  return contraste(cor, "#ffffff") >= contraste(cor, "#1d1d1f") ? "#ffffff" : "#1d1d1f";
}
