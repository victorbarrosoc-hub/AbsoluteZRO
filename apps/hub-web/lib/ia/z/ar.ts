/**
 * O ar em volta do Z (aprovado pelo titular em 27/10/2026, "rastro + correntes"): um canvas atrás da tela da IA.
 * - Rastro: a estrela deixa um traço fino que contorna o anel por fora e por dentro e se desfaz em 1,1 s.
 * - Correntes: fios finos giram em espiral no sentido do Z e se fecham nele; leves em repouso, mais fortes ouvindo,
 *   no máximo pensando, desacelerando ao responder.
 * Pausa fora da tela e em aba oculta; com "reduzir movimento" não desenha nada. A cor segue o texto do palco
 * (grafite no claro, branco no escuro). Mesma conta em public/ia/v1/zro-ia.js.
 */
import { animar, reduzMovimento, type SimboloZ } from './motor'

export type CenaZ = 'calma' | 'ouvindo' | 'pensando' | 'respondendo' | 'pronta' | 'desligada'

const FORCA: Record<CenaZ, number> = { calma: 0.22, ouvindo: 0.5, pensando: 1, respondendo: 0.6, pronta: 0.3, desligada: 0 }
const VIDA_RASTRO = 1100
const FIOS = 46

type Ponto = { x: number; y: number }
type Corrente = { a: number; r: number; pts: Ponto[]; vida: number; ritmo: number }

export class ArZ {
  private ctx: CanvasRenderingContext2D | null
  private alvoZ: SimboloZ | null = null
  private cena: CenaZ = 'calma'
  private forca = 0
  private trilha: { a: number; t: number }[] = []
  private correntes: Corrente[] = []
  private w = 0
  private h = 0
  private antes = performance.now()
  private visivel = true
  private parar: () => void
  private obs: ResizeObserver
  private io?: IntersectionObserver

  constructor(
    private palco: HTMLElement,
    private canvas: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext('2d')
    this.obs = new ResizeObserver(() => this.medir())
    this.obs.observe(canvas)
    if (typeof IntersectionObserver === 'function') {
      this.io = new IntersectionObserver(([e]) => (this.visivel = !!e?.isIntersecting))
      this.io.observe(palco)
    }
    this.medir()
    this.parar = animar(this)
  }

  alvo(z: SimboloZ | null) {
    if (z === this.alvoZ) return
    this.alvoZ = z
    this.trilha = []
    this.correntes = []
  }

  mudar(c: CenaZ) {
    this.cena = c
  }

  destruir() {
    this.parar()
    this.obs.disconnect()
    this.io?.disconnect()
  }

  private medir() {
    const d = Math.min(2, devicePixelRatio || 1)
    this.w = this.canvas.clientWidth
    this.h = this.canvas.clientHeight
    this.canvas.width = Math.round(this.w * d)
    this.canvas.height = Math.round(this.h * d)
    this.ctx?.setTransform(d, 0, 0, d, 0, 0)
  }

  quadro(agora: number) {
    const ctx = this.ctx
    const dt = Math.min(0.05, (agora - this.antes) / 1000)
    this.antes = agora
    if (!ctx || !this.visivel) return
    ctx.clearRect(0, 0, this.w, this.h)
    const z = this.alvoZ
    if (!z || reduzMovimento() || !z.raiz.isConnected) return
    const caixa = this.canvas.getBoundingClientRect()
    const m = z.medidas()
    if (!m.raio) return
    const cx = m.cx - caixa.left,
      cy = m.cy - caixa.top,
      R = m.raio
    const estilo = getComputedStyle(this.palco)
    const escuro = estilo.colorScheme.includes('dark') || luz(estilo.color) > 0.5
    const cor = escuro ? '255,255,255' : '58,64,78'
    ctx.lineCap = 'round'
    ctx.shadowBlur = escuro ? 6 : 0
    ctx.shadowColor = 'rgba(255,255,255,.35)'

    // rastro: o anel cobre o caminho da estrela, então o traço corre por fora e por dentro do tubo (Z grande só)
    if (R > 24) {
      const a = Math.atan2(m.ey - m.cy, m.ex - m.cx)
      const ult = this.trilha[this.trilha.length - 1]
      if (!ult || Math.abs(a - ult.a) > 0.004) this.trilha.push({ a, t: agora })
      this.trilha = this.trilha.filter((q) => agora - q.t < VIDA_RASTRO)
      for (const [raio, peso] of [
        [1.24, 1],
        [0.76, 0.6],
      ] as const)
        for (let i = 1; i < this.trilha.length; i++) {
          const k = 1 - (agora - this.trilha[i]!.t) / VIDA_RASTRO,
            a0 = this.trilha[i - 1]!.a,
            a1 = this.trilha[i]!.a
          if (Math.abs(a1 - a0) > 1) continue
          ctx.strokeStyle = `rgba(${cor},${(0.9 * peso * k * k).toFixed(3)})`
          ctx.lineWidth = (0.6 + 3 * k * k) * peso
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(a0) * R * raio, cy + Math.sin(a0) * R * raio)
          ctx.lineTo(cx + Math.cos(a1) * R * raio, cy + Math.sin(a1) * R * raio)
          ctx.stroke()
        }
    }

    // correntes
    this.forca += (FORCA[this.cena] - this.forca) * Math.min(1, dt * 1.8)
    const max = Math.hypot(this.w, this.h) * 0.62
    const nascer = (longe: boolean): Corrente => ({
      a: Math.random() * Math.PI * 2,
      r: longe ? max * (0.75 + Math.random() * 0.25) : R * 1.4 + Math.random() * Math.max(0, max - R * 1.4),
      pts: [],
      vida: 0,
      ritmo: 0.7 + Math.random() * 0.6,
    })
    while (this.correntes.length < FIOS) this.correntes.push(nascer(false))
    const base = Math.max(R, 40)
    for (const c of this.correntes) {
      const giro = (0.18 + 0.95 * this.forca) * c.ritmo * Math.sqrt((base * 1.8) / Math.max(c.r, 1))
      c.a += giro * dt
      c.r -= (10 + 70 * this.forca) * c.ritmo * dt
      c.vida += dt
      c.pts.push({ x: cx + Math.cos(c.a) * c.r, y: cy + Math.sin(c.a) * c.r })
      if (c.pts.length > 34) c.pts.shift()
      if (c.r < R * 1.12) Object.assign(c, nascer(true))
      const perto = limita((c.r - R * 1.12) / (base * 0.9))
      if (this.forca > 0.01) fio(ctx, c.pts, cor, 0.42 * this.forca * perto * Math.min(1, c.vida / 0.8), 1.2)
    }
  }
}

const limita = (x: number) => Math.min(1, Math.max(0, x))

/** Luminância aproximada de uma cor rgb() do CSS, de 0 a 1. */
function luz(css: string) {
  const [r = 0, g = 0, b = 0] = (css.match(/[\d.]+/g) ?? []).map(Number)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Um fio a partir do histórico de pontos: fino e transparente na cauda, mais firme na cabeça. */
function fio(ctx: CanvasRenderingContext2D, pts: Ponto[], cor: string, alfa: number, largura: number) {
  for (let i = 1; i < pts.length; i++) {
    const k = i / (pts.length - 1)
    ctx.strokeStyle = `rgba(${cor},${(alfa * k * k).toFixed(3)})`
    ctx.lineWidth = largura * (0.35 + 0.65 * k)
    ctx.beginPath()
    ctx.moveTo(pts[i - 1]!.x, pts[i - 1]!.y)
    ctx.lineTo(pts[i]!.x, pts[i]!.y)
    ctx.stroke()
  }
}
