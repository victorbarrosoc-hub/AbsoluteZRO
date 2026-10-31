/**
 * As contas do canvas do Fluxo (fase F5), puras: a vista (deslocamento + zoom), tela ↔ mundo, zoom em torno de um
 * ponto, enquadrar tudo, caixas, laço, a seção sob um ponto e o desenho da ligação entre dois nós. Rodam no navegador
 * (o canvas mexe no DOM direto com elas, sem render do React por quadro) e nos testes.
 */

/** A vista: o mundo é desenhado em `tela = mundo × z + (x, y)`. */
export type Vista = { x: number; y: number; z: number };
export type Ponto = { x: number; y: number };
export type Caixa = { x: number; y: number; w: number; h: number };

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
/** O passo da grade de pontos no mundo (px a 100%). */
export const GRADE = 24;

export const limitarZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(z) ? z : 1));

export const telaParaMundo = (v: Vista, p: Ponto): Ponto => ({ x: (p.x - v.x) / v.z, y: (p.y - v.y) / v.z });
export const mundoParaTela = (v: Vista, p: Ponto): Ponto => ({ x: p.x * v.z + v.x, y: p.y * v.z + v.y });

/** Zoom para `z` mantendo o ponto da tela `p` no mesmo lugar do mundo (cursor, meio da pinça). */
export function zoomEm(v: Vista, z: number, p: Ponto): Vista {
  const nz = limitarZoom(z);
  const m = telaParaMundo(v, p);
  return { x: p.x - m.x * nz, y: p.y - m.y * nz, z: nz };
}

/** A caixa que cobre todas (null se não há nenhuma). */
export function caixaDe(cs: readonly Caixa[]): Caixa | null {
  if (!cs.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cs) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x + c.w);
    y1 = Math.max(y1, c.y + c.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * A vista que mostra a caixa inteira numa área `largura × altura`, com margem e com o topo livre (`topo`, a cabeça da
 * tela) e o pé livre (`pe`, a barra). Nunca passa de 100% (fluxo pequeno não fica gigante).
 */
export function enquadrar(c: Caixa | null, largura: number, altura: number, o: { margem?: number; topo?: number; pe?: number } = {}): Vista {
  const margem = o.margem ?? 48;
  const topo = o.topo ?? 0;
  const pe = o.pe ?? 0;
  const aw = Math.max(1, largura - margem * 2);
  const ah = Math.max(1, altura - topo - pe - margem * 2);
  if (!c) return { x: largura / 2, y: topo + (altura - topo - pe) / 2, z: 1 };
  const z = limitarZoom(Math.min(1, aw / Math.max(1, c.w), ah / Math.max(1, c.h)));
  return {
    x: margem + (aw - c.w * z) / 2 - c.x * z,
    y: topo + margem + (ah - c.h * z) / 2 - c.y * z,
    z,
  };
}

export const intersecta = (a: Caixa, b: Caixa) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const contem = (c: Caixa, p: Ponto) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h;
export const centro = (c: Caixa): Ponto => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

/** O retângulo do laço (de a até b, em qualquer direção). */
export function retangulo(a: Ponto, b: Ponto): Caixa {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/**
 * A seção que recebe um item cujo centro está em `p`: a de cima (maior z; empate, a menor, que é a mais específica).
 * `secoes` = caixas com id e z. null = fora de todas.
 */
export function secaoNoPonto(secoes: readonly (Caixa & { id: string; z: number })[], p: Ponto, ignorar?: ReadonlySet<string>): string | null {
  let melhor: (Caixa & { id: string; z: number }) | null = null;
  for (const s of secoes) {
    if (ignorar?.has(s.id) || !contem(s, p)) continue;
    if (!melhor || s.z > melhor.z || (s.z === melhor.z && s.w * s.h < melhor.w * melhor.h)) melhor = s;
  }
  return melhor?.id ?? null;
}

/** O ponto da borda da caixa na direção de `alvo` (onde a linha encosta). */
export function bordaNaDirecao(c: Caixa, alvo: Ponto): Ponto & { lado: "e" | "d" | "c" | "b" } {
  const m = centro(c);
  const dx = alvo.x - m.x;
  const dy = alvo.y - m.y;
  if (dx === 0 && dy === 0) return { x: c.x + c.w, y: m.y, lado: "d" };
  // proporção da caixa: decide se sai pela lateral ou por cima/baixo
  if (Math.abs(dx) * c.h >= Math.abs(dy) * c.w) return dx >= 0 ? { x: c.x + c.w, y: m.y, lado: "d" } : { x: c.x, y: m.y, lado: "e" };
  return dy >= 0 ? { x: m.x, y: c.y + c.h, lado: "b" } : { x: m.x, y: c.y, lado: "c" };
}

const SAIDA: Record<"e" | "d" | "c" | "b", Ponto> = { e: { x: -1, y: 0 }, d: { x: 1, y: 0 }, c: { x: 0, y: -1 }, b: { x: 0, y: 1 } };

/**
 * A ligação de `a` para `b`: uma curva que sai da borda de `a` virada para `b` e chega na de `b`, mais o meio (onde
 * fica o rótulo) e o ângulo da ponta (a seta). `b` pode ser um ponto (a ligação sendo puxada).
 */
export function caminhoLigacao(a: Caixa, b: Caixa | Ponto): { d: string; meio: Ponto; angulo: number; fim: Ponto } {
  const cb = "w" in b ? centro(b) : b;
  const pa = bordaNaDirecao(a, cb);
  const pb = "w" in b ? bordaNaDirecao(b, centro(a)) : { ...b, lado: null };
  const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  const k = Math.min(160, Math.max(24, dist * 0.4));
  const sa = SAIDA[pa.lado];
  const c1 = { x: pa.x + sa.x * k, y: pa.y + sa.y * k };
  const sb = pb.lado ? SAIDA[pb.lado] : { x: 0, y: 0 };
  const c2 = pb.lado ? { x: pb.x + sb.x * k, y: pb.y + sb.y * k } : { x: (c1.x + pb.x) / 2, y: (c1.y + pb.y) / 2 };
  const r = (n: number) => Math.round(n * 10) / 10;
  const d = `M${r(pa.x)} ${r(pa.y)} C${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(pb.x)} ${r(pb.y)}`;
  // o meio da cúbica (t = 0,5) e a tangente no fim
  const meio = { x: (pa.x + 3 * c1.x + 3 * c2.x + pb.x) / 8, y: (pa.y + 3 * c1.y + 3 * c2.y + pb.y) / 8 };
  const angulo = Math.atan2(pb.y - c2.y, pb.x - c2.x);
  return { d, meio, angulo, fim: { x: pb.x, y: pb.y } };
}

/** A seta na ponta (triângulo pequeno), em coordenadas do mundo. */
export function pontaDaSeta(fim: Ponto, angulo: number, tam = 9): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  const a1 = angulo + Math.PI - 0.42;
  const a2 = angulo + Math.PI + 0.42;
  return `M${r(fim.x)} ${r(fim.y)} L${r(fim.x + Math.cos(a1) * tam)} ${r(fim.y + Math.sin(a1) * tam)} L${r(fim.x + Math.cos(a2) * tam)} ${r(fim.y + Math.sin(a2) * tam)} Z`;
}

/** Arredonda para a grade (soltar alinhado). */
export const naGrade = (n: number, passo = 4) => Math.round(n / passo) * passo;

/**
 * Um lugar livre perto de `p` para uma caixa `w × h` (o que nasce ao colar ou pela barra não cai em cima de outro
 * item): o centro, se está livre; senão a casa mais perto numa grade do tamanho da caixa, em anéis. Devolve o canto.
 */
export function lugarLivre(p: Ponto, w: number, h: number, ocupados: readonly Caixa[], folga = 24): Ponto {
  const x0 = Math.round(p.x - w / 2);
  const y0 = Math.round(p.y - h / 2);
  const livreEm = (x: number, y: number) => !ocupados.some((o) => intersecta({ x: x - 8, y: y - 8, w: w + 16, h: h + 16 }, o));
  if (livreEm(x0, y0)) return { x: x0, y: y0 };
  const px = w + folga;
  const py = h + folga;
  for (let r = 1; r <= 8; r++) {
    const casas: Ponto[] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) casas.push({ x: dx, y: dy });
    casas.sort((a, b) => Math.hypot(a.x * px, a.y * py) - Math.hypot(b.x * px, b.y * py) || a.y - b.y || a.x - b.x);
    for (const c of casas) {
      const x = x0 + c.x * px;
      const y = y0 + c.y * py;
      if (livreEm(x, y)) return { x, y };
    }
  }
  return { x: x0, y: y0 };
}
