/**
 * As contas do "deslizar para apagar" dos cartões da Criação (como no Mail e nas Notas do iPhone), sem DOM: a tela
 * (`lixeira.tsx`) só aplica o `transform` que sai daqui. Deslizar para a esquerda mostra o "Apagar" vermelho; passar
 * de 55% da largura arma o apagar direto (soltar apaga); para a direita, nada além de um elástico curto.
 */

/** Quanto o cartão fica aberto mostrando o "Apagar". */
export const ABERTO_PX = 92;
/** Fração da largura que arma o apagar direto. */
export const ARMA = 0.55;
/** Segurar o dedo parado por este tempo abre a folha do cartão. */
export const SEGURAR_MS = 450;
/** Até aqui o dedo ainda é um toque (nem rolar, nem deslizar). */
export const FOLGA_PX = 8;

/** Elástico: passa do limite cada vez mais devagar. */
const elastico = (alem: number, escala: number) => (escala * alem) / (alem + escala);

/** Onde o cartão fica com o dedo em `x` (negativo = para a esquerda), numa linha de `largura` px. */
export function deslocamento(x: number, largura: number): { x: number; armado: boolean } {
  if (x > 0) return { x: Math.round(elastico(x, 24)), armado: false };
  const max = Math.max(ABERTO_PX + 1, largura);
  const dentro = Math.max(x, -max);
  return { x: Math.round(dentro), armado: -dentro >= largura * ARMA };
}

/** Ao soltar: apaga (passou do ponto), fica aberto (passou da metade do "Apagar" ou jogou para a esquerda) ou fecha. */
export function aoSoltar(x: number, largura: number, velocidade = 0): "apagar" | "abrir" | "fechar" {
  if (-x >= largura * ARMA) return "apagar";
  if (velocidade < -0.5 && x < -12) return "abrir";
  if (velocidade > 0.5) return "fechar";
  return -x >= ABERTO_PX / 2 ? "abrir" : "fechar";
}

/** O primeiro movimento decide: de lado = deslizar; de pé = a página rola; parado = ainda é toque (ou segurar). */
export function intencao(dx: number, dy: number, aberto: boolean): "toque" | "deslizar" | "rolar" {
  if (Math.abs(dx) < FOLGA_PX && Math.abs(dy) < FOLGA_PX) return "toque";
  if (Math.abs(dx) > Math.abs(dy) && (dx < 0 || aberto)) return "deslizar";
  return "rolar";
}
