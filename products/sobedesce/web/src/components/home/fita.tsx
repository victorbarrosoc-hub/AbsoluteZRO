/**
 * A fita do topo da home: um feixe de linhas finas que sobe em violeta da esquerda, passa por trás do palco e desce
 * em azul na direita (o nome desenhado). Calculada aqui, no servidor, sem JavaScript no navegador; a entrada é só CSS
 * (`.sd-fita`, desenha da esquerda para a direita) e some com "reduzir movimento". Sem brilho: linha sólida.
 */

const W = 1600;
const H = 700;
const FIOS = 34;
const PONTOS = 80;

/** Centro da fita (0 em cima, 1 embaixo): baixo nas pontas, alto no meio. */
const centro = (u: number) => 0.92 - 0.72 * Math.pow(Math.sin(Math.PI * u), 1.4);
/** Meia largura: fina nas pontas, larga no meio. */
const largura = (u: number) => 0.035 + 0.06 * Math.sin(Math.PI * u);

function suave(pts: [number, number][]): string {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Cada fio é a mesma curva com a torção deslocada: juntos, parecem uma fita de seda que vira. */
export function fiosDaFita(): { d: string; opacidade: number }[] {
  const fios: { d: string; opacidade: number }[] = [];
  for (let i = 0; i < FIOS; i++) {
    const t = i / (FIOS - 1);
    const pts: [number, number][] = [];
    for (let k = 0; k <= PONTOS; k++) {
      const u = k / PONTOS;
      const y = centro(u) + largura(u) * Math.sin(u * Math.PI * 2.6 + 0.4 + t * Math.PI * 0.95);
      pts.push([u * W, y * H]);
    }
    fios.push({ d: suave(pts), opacidade: Number((0.2 + 0.65 * Math.sin(t * Math.PI)).toFixed(2)) });
  }
  return fios;
}

const FIOS_PRONTOS = fiosDaFita();

export function Fita({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <linearGradient id="sd-fita-cor" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
          <stop offset="0" style={{ stopColor: "var(--color-up)" }} />
          <stop offset="0.38" style={{ stopColor: "var(--color-up)" }} />
          <stop offset="0.62" style={{ stopColor: "var(--color-down)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-down)" }} />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#sd-fita-cor)" strokeWidth="1.1" strokeLinecap="round">
        {FIOS_PRONTOS.map((f, i) => (
          <path key={i} d={f.d} strokeOpacity={f.opacidade} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}
