/**
 * O Quasar como IA (titular, 01/11/2026: "o símbolo da quasar como se fosse uma IA, estilo a Z"; depois: "mais limpo,
 * pode deixar a parte do meio vazada, dá movimento de ondas à parte das ondas e um brilho de feixe de luz horizontal").
 * A Coroa sonora vazada: só o anel, com a onda do lado da luz correndo pela borda, e o clarão às 3 horas (a pose da
 * logo) com um feixe horizontal que atravessa a borda. O clarão e o feixe nunca giram: só brilham mais e menos
 * (titular). Pensando, a onda cresce e acelera e o brilho pulsa; falando, a onda pulsa como voz. A cadência é a do
 * cinema, 23,976 quadros por segundo, como o Z.
 *
 * Tudo é desenhado num canvas, um quadro por vez, fora do React e sem mexer em `d` de SVG. Quem chama decide quando
 * animar (aba visível, na tela e sem "reduzir movimento"); parado, `estatico()` deixa a pose da logo.
 */

export type EstadoQuasar = 'idle' | 'thinking' | 'listening' | 'speaking' | 'error';

type Ritmo = {
  /** Altura da onda na borda (1 = a da logo). */
  amp: number;
  /** Velocidade da onda correndo pela borda, em rad/s. */
  onda: number;
  /** Força do halo, do clarão e do feixe. */
  brilho: number;
};

const VOLTA = Math.PI * 2;
export const RITMOS: Record<EstadoQuasar, Ritmo> = {
  idle: { amp: 1, onda: 1.6, brilho: 1 },
  thinking: { amp: 1.7, onda: 4.8, brilho: 1.3 },
  listening: { amp: 1.25, onda: 2.4, brilho: 1.12 },
  speaking: { amp: 1.8, onda: 3.4, brilho: 1.3 },
  error: { amp: 0.35, onda: 0.6, brilho: 0.55 },
};
/** Quadros por segundo, como o Z do HUB (pedido do titular). */
export const QUADROS_POR_SEGUNDO = 23.976;
/** A chegada: a onda cresce e o clarão acende em 1,4 s. */
export const MOV_QUASAR = { entrada: 1.4 } as const;
/** Quantas ondas cabem numa volta da borda. */
const ONDAS = 30;

const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const limita = (x: number) => Math.min(1, Math.max(0, x));

/** Raio do anel para um canvas de w × h: cabe na altura e deixa espaço para o feixe à direita. */
export const raioQuasar = (w: number, h: number) => Math.min(h * 0.33, w * 0.27);

export class MotorQuasar {
  /** Relógio do motor, em segundos. */
  t = 0;
  /** Onde a onda está na borda (corre com o tempo). */
  fase = 0.6;
  /** 0 → 1 na chegada: a onda cresce e o clarão acende. */
  entrada = 0;
  private ritmo: Ritmo = { ...RITMOS.idle };
  private alvo: EstadoQuasar = 'idle';

  get estado() {
    return this.alvo;
  }

  get amp() {
    return this.ritmo.amp;
  }

  mudar(estado: EstadoQuasar) {
    this.alvo = estado;
  }

  /** A pose da logo, sem movimento (reduzir movimento). */
  estatico() {
    this.t = 0;
    this.fase = 0.6;
    this.entrada = 1;
    this.ritmo = { ...RITMOS[this.alvo] };
  }

  passo(dt: number) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.t += dt;
    this.entrada = limita(this.entrada + dt / MOV_QUASAR.entrada);
    const alvo = RITMOS[this.alvo];
    const k = 1 - Math.exp(-dt * 3);
    const r = this.ritmo;
    r.amp += (alvo.amp - r.amp) * k;
    r.onda += (alvo.onda - r.onda) * k;
    r.brilho += (alvo.brilho - r.brilho) * k;
    this.fase += r.onda * dt;
  }

  /** Altura da onda neste instante, com a respiração do repouso e o pulso da fala. */
  private ampAgora() {
    const t = this.t;
    let a = this.ritmo.amp * (0.84 + 0.16 * Math.sin(t * 1.3));
    if (this.alvo === 'speaking')
      a *= 0.75 + 0.45 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1));
    if (this.alvo === 'listening') a *= 0.9 + 0.12 * Math.sin(t * 5.1);
    return a * suave(this.entrada);
  }

  desenhar(ctx: CanvasRenderingContext2D, w: number, h: number, claro: boolean) {
    const cx = w / 2;
    const cy = h / 2;
    const R = raioQuasar(w, h);
    const brilho = this.ritmo.brilho;
    const acende = suave(this.entrada);
    const amp = this.ampAgora();
    const t = this.t;
    ctx.clearRect(0, 0, w, h);

    // o anel de luz em volta (o meio fica vazado)
    const halo = ctx.createRadialGradient(cx, cy, R * 0.75, cx, cy, R * 1.9);
    halo.addColorStop(0, 'rgba(70,130,255,0)');
    halo.addColorStop(
      0.18,
      claro ? `rgba(47,107,255,${0.1 * brilho})` : `rgba(80,140,255,${0.22 * brilho})`,
    );
    halo.addColorStop(1, 'rgba(47,107,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    const fx = cx + R * 1.02;
    const fy = cy;
    const lado = ctx.createRadialGradient(fx, fy, 0, fx, fy, R * 1.1);
    lado.addColorStop(0, `rgba(150,190,255,${(claro ? 0.2 : 0.28) * brilho * acende})`);
    lado.addColorStop(1, 'rgba(150,190,255,0)');
    ctx.fillStyle = lado;
    ctx.fillRect(0, 0, w, h);

    // a borda: a onda corre do lado da luz e respira; do outro lado, quase lisa
    ctx.beginPath();
    const pontos = 360;
    for (let i = 0; i <= pontos; i++) {
      const a = (i / pontos) * VOLTA;
      const env = Math.pow(Math.max(0, Math.cos(a)), 1.25);
      const onda =
        Math.sin(a * ONDAS - this.fase) * 0.8 + Math.sin(a * ONDAS * 0.5 + this.fase * 0.6) * 0.2;
      const r = R + R * 0.075 * amp * (env * onda + 0.08 * Math.sin(a * 4 + this.fase * 0.5));
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.corDaBorda(ctx, cx, cy, claro);
    ctx.globalAlpha = 0.16 * brilho;
    ctx.lineWidth = R * 0.1;
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = R * 0.035;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1.3, R * 0.016);
    ctx.stroke();

    // o feixe horizontal atravessando a borda no clarão: fica parado, só aumenta e diminui o brilho
    const pulso = (0.82 + 0.18 * Math.sin(t * 2.1)) * brilho * acende;
    const esq = Math.min(R * 1.25, fx - cx + R * 0.6);
    const dir = Math.min(R * 1.6, w - fx - 2);
    const cor = claro ? '120,160,255' : '255,255,255';
    // faixa larga e suave
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(1, 0.06);
    const faixa = ctx.createRadialGradient(0, 0, 0, 0, 0, dir);
    faixa.addColorStop(0, `rgba(190,215,255,${0.55 * pulso})`);
    faixa.addColorStop(0.5, `rgba(120,165,255,${0.18 * pulso})`);
    faixa.addColorStop(1, 'rgba(120,165,255,0)');
    ctx.fillStyle = faixa;
    ctx.beginPath();
    ctx.arc(0, 0, dir, 0, VOLTA);
    ctx.fill();
    ctx.restore();
    // o traço fino
    const traco = ctx.createLinearGradient(fx - esq, fy, fx + dir, fy);
    const meio = esq / (esq + dir);
    traco.addColorStop(0, `rgba(${cor},0)`);
    traco.addColorStop(meio * 0.55, `rgba(${cor},${0.35 * pulso})`);
    traco.addColorStop(meio, `rgba(255,255,255,${Math.min(1, pulso)})`);
    traco.addColorStop(meio + (1 - meio) * 0.45, `rgba(${cor},${0.35 * pulso})`);
    traco.addColorStop(1, `rgba(${cor},0)`);
    ctx.strokeStyle = traco;
    ctx.lineWidth = Math.max(1, R * 0.011);
    ctx.beginPath();
    ctx.moveTo(fx - esq, fy);
    ctx.lineTo(fx + dir, fy);
    ctx.stroke();
    // o clarão
    const flare = ctx.createRadialGradient(fx, fy, 0, fx, fy, R * 0.36);
    flare.addColorStop(0, `rgba(255,255,255,${Math.min(1, pulso)})`);
    flare.addColorStop(0.14, `rgba(220,235,255,${0.85 * pulso})`);
    flare.addColorStop(0.42, `rgba(111,157,255,${0.36 * pulso})`);
    flare.addColorStop(1, 'rgba(47,107,255,0)');
    ctx.fillStyle = flare;
    ctx.beginPath();
    ctx.arc(fx, fy, R * 0.36, 0, VOLTA);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, pulso)})`;
    ctx.beginPath();
    ctx.arc(fx, fy, Math.max(1.6, R * 0.028), 0, VOLTA);
    ctx.fill();
  }

  private corDaBorda(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    claro: boolean,
  ): CanvasGradient | string {
    if (typeof ctx.createConicGradient !== 'function') return claro ? '#3b74f0' : '#8fb2ec';
    // começa às 9 horas (o lado escuro) e passa pelo clarão às 3
    const g = ctx.createConicGradient(Math.PI, cx, cy);
    const fundo = claro ? '#6f93e0' : '#c9dafa';
    g.addColorStop(0, fundo);
    g.addColorStop(0.3, claro ? '#2f6bff' : '#6f98ec');
    g.addColorStop(0.45, claro ? '#7fa7ff' : '#b9d2ff');
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(0.55, claro ? '#7fa7ff' : '#b9d2ff');
    g.addColorStop(0.7, claro ? '#2f6bff' : '#6f98ec');
    g.addColorStop(1, fundo);
    return g;
  }
}
