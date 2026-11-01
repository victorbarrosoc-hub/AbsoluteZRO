/**
 * O Quasar como IA (titular, 01/11/2026: "o símbolo da quasar como se fosse uma IA, estilo a Z"). A Coroa sonora vira
 * presença: o eclipse escuro, a borda que vibra como onda e o clarão, que dá uma volta inteira pela borda e repousa na
 * pose da logo (às 3 horas), como a estrela do Z volta à pose dela. A onda corre pela borda o tempo todo, mais forte do
 * lado da luz, e anéis de som saem do eclipse. Pensando, o clarão gira sem pausa e a onda acelera; falando, a onda
 * pulsa como voz.
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
  /** Segundos entre um anel de som e o próximo (0 = sem anéis). */
  aneis: number;
  /** Força do halo e do clarão. */
  brilho: number;
  /** Giro contínuo do clarão em rad/s (0 = volta e pausa na pose da logo). */
  giro: number;
};

const VOLTA = Math.PI * 2;
export const RITMOS: Record<EstadoQuasar, Ritmo> = {
  idle: { amp: 1, onda: 1.5, aneis: 3.6, brilho: 1, giro: 0 },
  thinking: { amp: 1.6, onda: 4.6, aneis: 1.3, brilho: 1.3, giro: VOLTA / 1.6 },
  listening: { amp: 1.25, onda: 2.4, aneis: 2.2, brilho: 1.15, giro: 0 },
  speaking: { amp: 1.8, onda: 3.4, aneis: 1.1, brilho: 1.35, giro: 0 },
  error: { amp: 0.35, onda: 0.6, aneis: 0, brilho: 0.55, giro: 0 },
};
/** Uma volta do clarão em 5,2 s e 2,8 s de pausa na pose da logo. */
export const MOV_QUASAR = { volta: 5.2, pausa: 2.8, entrada: 1.4 } as const;
/** Raio do eclipse em fração do lado do canvas (sobra espaço para o halo e os anéis). */
export const RAIO_QUASAR = 0.215;
/** Quantas ondas cabem numa volta da borda. */
const ONDAS = 30;

const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const freia = (t: number) => 1 - Math.pow(1 - t, 3);
const limita = (x: number) => Math.min(1, Math.max(0, x));

type Orbita = {
  de: number;
  ate: number;
  inicio: number;
  dur: number;
  curva: (t: number) => number;
};

export class MotorQuasar {
  /** Relógio do motor, em segundos. */
  t = 0;
  /** Ângulo do clarão (0 = às 3 horas, sentido horário). */
  theta = 0;
  fase = 0.6;
  private vel = 0;
  private ritmo: Ritmo = { ...RITMOS.idle };
  private alvo: EstadoQuasar = 'idle';
  private orbita: Orbita | null = null;
  private repouso = 0;
  private aneisRelogio = 0;
  private aneisForca = 1;
  /** 0 → 1 na chegada: a onda cresce e o clarão acende. */
  entrada = 0;

  get estado() {
    return this.alvo;
  }

  mudar(estado: EstadoQuasar) {
    this.alvo = estado;
  }

  /** A pose da logo, sem movimento (reduzir movimento ou antes do primeiro quadro). */
  estatico() {
    this.theta = 0;
    this.fase = 0.6;
    this.vel = 0;
    this.orbita = null;
    this.entrada = 1;
    this.aneisForca = 0;
    this.ritmo = { ...RITMOS[this.alvo], giro: 0 };
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
    r.aneis = alvo.aneis || r.aneis;
    this.aneisForca += ((alvo.aneis ? 1 : 0) - this.aneisForca) * k;
    this.fase += r.onda * dt;
    if (r.aneis) this.aneisRelogio += dt / r.aneis;

    if (alvo.giro > 0) {
      // girando sem pausa: acelera até o giro do estado
      this.orbita = null;
      this.repouso = 0;
      this.vel += (alvo.giro - this.vel) * (1 - Math.exp(-dt * 4));
      this.theta += this.vel * dt;
      return;
    }
    if (this.orbita) {
      const o = this.orbita;
      const p = limita((this.t - o.inicio) / o.dur);
      const antes = this.theta;
      this.theta = o.de + (o.ate - o.de) * o.curva(p);
      this.vel = dt > 0 ? (this.theta - antes) / dt : 0;
      if (p >= 1) {
        this.theta = o.ate % VOLTA;
        this.orbita = null;
        this.repouso = 0;
        this.vel = 0;
      }
      return;
    }
    const resto = ((this.theta % VOLTA) + VOLTA) % VOLTA;
    if (resto > 1e-3 && VOLTA - resto > 1e-3) {
      // saiu de um giro fora da pose: termina a volta freando até a pose da logo
      const falta = VOLTA - resto;
      const dur = Math.min(3, Math.max(0.8, (3 * falta) / Math.max(this.vel, 1)));
      this.theta = resto;
      this.orbita = { de: resto, ate: VOLTA, inicio: this.t, dur, curva: freia };
      return;
    }
    this.theta = 0;
    this.vel = 0;
    this.repouso += dt;
    if (this.repouso >= MOV_QUASAR.pausa)
      this.orbita = { de: 0, ate: VOLTA, inicio: this.t, dur: MOV_QUASAR.volta, curva: suave };
  }

  /** Altura da onda neste instante, com a respiração do repouso e o pulso da fala. */
  private ampAgora() {
    const t = this.t;
    let a = this.ritmo.amp * (0.86 + 0.14 * Math.sin(t * 1.3));
    if (this.alvo === 'speaking')
      a *= 0.75 + 0.45 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1));
    if (this.alvo === 'listening') a *= 0.9 + 0.12 * Math.sin(t * 5.1);
    return a * suave(this.entrada);
  }

  desenhar(ctx: CanvasRenderingContext2D, w: number, h: number, claro: boolean) {
    const S = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = S * RAIO_QUASAR;
    const brilho = this.ritmo.brilho;
    const acende = suave(this.entrada);
    const amp = this.ampAgora();
    const theta = this.theta;
    ctx.clearRect(0, 0, w, h);

    // halo em volta do eclipse, mais forte do lado da luz
    const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 2.3);
    halo.addColorStop(
      0,
      claro ? `rgba(47,107,255,${0.16 * brilho})` : `rgba(70,130,255,${0.34 * brilho})`,
    );
    halo.addColorStop(
      0.45,
      claro ? `rgba(47,107,255,${0.05 * brilho})` : `rgba(60,110,230,${0.1 * brilho})`,
    );
    halo.addColorStop(1, 'rgba(47,107,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    const fx = cx + Math.cos(theta) * R * 1.03;
    const fy = cy + Math.sin(theta) * R * 1.03;
    const lado = ctx.createRadialGradient(fx, fy, 0, fx, fy, R * 1.25);
    lado.addColorStop(0, `rgba(150,190,255,${(claro ? 0.22 : 0.3) * brilho * acende})`);
    lado.addColorStop(1, 'rgba(150,190,255,0)');
    ctx.fillStyle = lado;
    ctx.fillRect(0, 0, w, h);

    // anéis de som saindo do eclipse
    if (this.aneisForca > 0.01) {
      ctx.lineWidth = Math.max(1, S / 360);
      for (let i = 0; i < 3; i++) {
        const q = (((this.aneisRelogio + i / 3) % 1) + 1) % 1;
        const a = (1 - q) * (1 - q) * 0.26 * this.aneisForca * acende;
        ctx.strokeStyle = claro ? `rgba(47,107,255,${a})` : `rgba(170,200,255,${a})`;
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1.08 + q * 1.15), 0, VOLTA);
        ctx.stroke();
      }
    }

    // o eclipse, iluminado de leve do lado do clarão
    const disco = ctx.createRadialGradient(
      cx + Math.cos(theta) * R * 0.45,
      cy + Math.sin(theta) * R * 0.45,
      R * 0.1,
      cx,
      cy,
      R,
    );
    disco.addColorStop(0, '#0d1528');
    disco.addColorStop(0.7, '#060a14');
    disco.addColorStop(1, '#03050a');
    ctx.fillStyle = disco;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.985, 0, VOLTA);
    ctx.fill();

    // a borda que vibra: onda correndo, mais alta perto do clarão
    ctx.beginPath();
    const pontos = 300;
    for (let i = 0; i <= pontos; i++) {
      const a = (i / pontos) * VOLTA;
      const env = Math.pow(Math.max(0, Math.cos(a - theta)), 1.3);
      const r =
        R * 1.02 +
        R *
          0.07 *
          amp *
          (env * Math.sin(a * ONDAS - this.fase) + 0.1 * Math.sin(a * 5 + this.fase * 0.7));
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    const cor = this.corDaBorda(ctx, cx, cy, theta, claro);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = cor;
    ctx.globalAlpha = 0.16 * brilho;
    ctx.lineWidth = R * 0.11;
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = R * 0.04;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1.2, R * 0.017);
    ctx.stroke();

    // o clarão, com o brilho de quatro pontas da família ZRO, bem discreto
    const pulso = (0.86 + 0.14 * Math.sin(this.t * 2.3)) * brilho * acende;
    const flare = ctx.createRadialGradient(fx, fy, 0, fx, fy, R * 0.42);
    flare.addColorStop(0, `rgba(255,255,255,${Math.min(1, pulso)})`);
    flare.addColorStop(0.14, `rgba(220,235,255,${0.85 * pulso})`);
    flare.addColorStop(0.4, `rgba(111,157,255,${0.4 * pulso})`);
    flare.addColorStop(1, 'rgba(47,107,255,0)');
    ctx.fillStyle = flare;
    ctx.beginPath();
    ctx.arc(fx, fy, R * 0.42, 0, VOLTA);
    ctx.fill();
    for (const [ang, comp, forca] of [
      [theta, 0.42, 0.9],
      [theta + Math.PI / 2, 0.22, 0.45],
    ] as const) {
      const dx = Math.cos(ang) * R * comp;
      const dy = Math.sin(ang) * R * comp;
      const raio = ctx.createLinearGradient(fx - dx, fy - dy, fx + dx, fy + dy);
      raio.addColorStop(0, 'rgba(255,255,255,0)');
      raio.addColorStop(0.5, `rgba(255,255,255,${Math.min(1, forca * pulso)})`);
      raio.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = raio;
      ctx.lineWidth = Math.max(1, R * 0.012);
      ctx.beginPath();
      ctx.moveTo(fx - dx, fy - dy);
      ctx.lineTo(fx + dx, fy + dy);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, pulso)})`;
    ctx.beginPath();
    ctx.arc(fx, fy, Math.max(1.4, R * 0.03), 0, VOLTA);
    ctx.fill();
  }

  private corDaBorda(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    theta: number,
    claro: boolean,
  ): CanvasGradient | string {
    if (typeof ctx.createConicGradient !== 'function') return claro ? '#3b74f0' : '#8fb2ec';
    const g = ctx.createConicGradient(theta - Math.PI, cx, cy);
    const fundo = claro ? '#24489c' : '#2a4f9e';
    g.addColorStop(0, fundo);
    g.addColorStop(0.3, claro ? '#2f6bff' : '#4f7fe0');
    g.addColorStop(0.45, claro ? '#7fa7ff' : '#b9d2ff');
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(0.55, claro ? '#7fa7ff' : '#b9d2ff');
    g.addColorStop(0.7, claro ? '#2f6bff' : '#4f7fe0');
    g.addColorStop(1, fundo);
    return g;
  }
}
