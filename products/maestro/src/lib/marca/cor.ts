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

/** Fundo de referência do tema escuro (o mais escuro dos painéis): o acento precisa de 3:1 também ali. */
export const FUNDO_ESCURO = "#1a1c29";

function misturar(a: string, b: string, t: number): string {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${ca
    .map((x, i) =>
      Math.round(x + (cb[i] - x) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** O tom mais perto da cor que chega a `minimo` sobre `fundo`, clareando (fundo escuro) ou escurecendo (fundo claro). */
export function ajustarContraste(cor: string, fundo: string, minimo = CONTRASTE_MINIMO): string {
  if (contraste(cor, fundo) >= minimo) return cor;
  const alvo = contraste(fundo, "#ffffff") > contraste(fundo, "#000000") ? "#ffffff" : "#000000";
  for (let i = 1; i <= 20; i++) {
    const c = misturar(cor, alvo, i / 20);
    if (contraste(c, fundo) >= minimo) return c;
  }
  return alvo;
}

export type AcentosDaMarca = { claro: string; escuro: string; suaveClaro: string; suaveEscuro: string };

/**
 * A cor da produtora como `--acento` do app inteiro (marca própria): no claro, a cor conferida (≥ 3:1 no papel, a
 * mesma regra de Ajustes → Marca); no escuro, o tom mais perto que chega a 3:1 no fundo escuro. Cor ausente ou fora
 * do contraste = null (vale o latão do Maestro). Só superfície, traço e ícone: texto segue grafite/branco.
 */
export function acentosDaMarca(v: unknown): AcentosDaMarca | null {
  const c = conferirCor(v);
  if (!c.ok || !c.cor) return null;
  const escuro = ajustarContraste(c.cor, FUNDO_ESCURO);
  const rgba = (hex: string, a: number) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ")} / ${a})`;
  return { claro: c.cor, escuro, suaveClaro: rgba(c.cor, 0.16), suaveEscuro: rgba(escuro, 0.18) };
}

/** Texto que fica legível sobre a cor (grafite ou branco). */
export function textoSobre(cor: string): "#ffffff" | "#1d1d1f" {
  return contraste(cor, "#ffffff") >= contraste(cor, "#1d1d1f") ? "#ffffff" : "#1d1d1f";
}
