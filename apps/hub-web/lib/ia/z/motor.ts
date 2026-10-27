/**
 * O Z, a IA do ecossistema: anel e estrela cromados em peças separadas, movidos aqui (fora do React, um quadro por vez
 * direto no estilo das peças). Números aprovados pelo titular em 27/10/2026: volta de 3,2 s, 0,75 de giro da estrela
 * por volta, ritmo suave (acelera e freia), sentido horário, pausa de 1 s na pose da logo. A estrela fica sempre por
 * cima do anel, centrada no tubo; o anel gira devagar no próprio eixo; o conjunto flutua. O brilho cresce com o giro e
 * os raios longos só aparecem no auge. Com "reduzir movimento" tudo fica parado na pose da logo.
 *
 * A mesma conta mora em public/ia/v1/zro-ia.js (o painel das plataformas não importa módulos do HUB): mudou aqui, mude lá.
 */

/** Raio da linha do meio do tubo, em fração do lado da imagem do anel. */
export const RAIO_Z = 0.4183
/** Lado da imagem da estrela em fração do lado do anel (cada ponta mede metade do raio; a figura ocupa 0,978 da imagem). */
export const ESTRELA_Z = (0.5 * RAIO_Z * 2) / 0.978
export const MOV_Z = { volta: 3.2, giros: 0.75, pausa: 1, sentido: 1 } as const

export type MovimentoZ = 'parada' | 'pensando' | 'pronta'

const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
/** Derivada do ritmo suave, de 0 a 1: quanto a estrela está girando agora. */
const velocidade = (p: number) => (p < 0.5 ? 12 * p * p : 12 * (1 - p) * (1 - p)) / 3
const limita = (x: number) => Math.min(1, Math.max(0, x))

export const reduzMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Um laço só para todos os Z e ventos da página; o navegador já pausa o requestAnimationFrame em aba oculta. */
type Animado = { quadro(agora: number): void }
const vivos = new Set<Animado>()
let pedido = 0
function laco(agora: number) {
  for (const a of vivos) a.quadro(agora)
  pedido = vivos.size ? requestAnimationFrame(laco) : 0
}
export function animar(a: Animado) {
  vivos.add(a)
  if (!pedido) pedido = requestAnimationFrame(laco)
  return () => void vivos.delete(a)
}

export class SimboloZ {
  readonly raiz: HTMLElement
  private anel: HTMLElement
  private porta: HTMLElement
  private estrela: HTMLElement
  private reflexo: HTMLElement
  private movimento: MovimentoZ = 'parada'
  private inicio = performance.now()
  private readonly zero = performance.now()
  private base = { giro: 0, anel: 0 }
  private ult = { total: 0, anel: 0 }
  private visivel = true
  private parar: () => void
  private observador?: IntersectionObserver

  constructor(raiz: HTMLElement) {
    this.raiz = raiz
    const peca = (c: string) => raiz.querySelector<HTMLElement>(c)!
    this.anel = peca('.z__anel')
    this.porta = peca('.z__porta')
    this.estrela = peca('.z__estrela')
    this.reflexo = peca('.z__reflexo')
    if (typeof IntersectionObserver === 'function') {
      this.observador = new IntersectionObserver(([e]) => (this.visivel = !!e?.isIntersecting))
      this.observador.observe(raiz)
    }
    this.parar = animar(this)
  }

  /** Troca o movimento sem salto: o giro novo parte de onde o anterior parou. */
  mover(m: MovimentoZ) {
    if (m === this.movimento) return
    this.base = { giro: this.ult.total % 360, anel: this.ult.anel % 360 }
    this.movimento = m
    this.inicio = performance.now()
  }

  /** Centro do anel e posição da estrela, em pixels da tela. */
  medidas() {
    const a = this.raiz.getBoundingClientRect()
    const e = this.porta.getBoundingClientRect()
    return { cx: a.left + a.width / 2, cy: a.top + a.height / 2, raio: RAIO_Z * this.raiz.clientWidth, ex: e.left, ey: e.top }
  }

  destruir() {
    this.parar()
    this.observador?.disconnect()
  }

  quadro(agora: number) {
    if (!this.visivel) return
    if (reduzMovimento()) return this.pose(0, 0, 0)
    this.flutua(agora)
    const t = (agora - this.inicio) / 1000
    const { volta, giros, pausa, sentido } = MOV_Z
    if (this.movimento === 'pensando') {
      const ciclo = volta + pausa,
        n = Math.floor(t / ciclo),
        c = t - n * ciclo
      const p = c < volta ? suave(c / volta) : 1
      this.pose(sentido * 360 * (n + p), sentido * 360 * giros * (n + p), c < volta ? c / volta : 1)
      this.giraAnel(sentido * 90 * (n + 0.55 * (c / ciclo) + 0.45 * p))
    } else if (this.movimento === 'parada') {
      // na pose da logo, um quarto de giro lento a cada 6 s
      const n = Math.floor(t / 6),
        c = t - n * 6,
        p = c < 2.4 ? suave(c / 2.4) : 1
      this.pose(0, sentido * 90 * (n + p), c < 2.4 ? c / 2.4 : 1)
      this.giraAnel(sentido * 45 * (n + 0.7 * (c / 6) + 0.3 * p))
    } else {
      // pronta: uma volta só e assenta na pose
      const l = Math.min(1, t / volta),
        q = suave(l)
      this.pose(sentido * 360 * q, sentido * 360 * giros * q, l)
      this.giraAnel(sentido * 90 * q)
    }
  }

  private pose(orbita: number, giro: number, p: number) {
    const total = orbita + giro + this.base.giro
    const v = velocidade(limita(p))
    this.ult.total = total
    const w = this.raiz.clientWidth,
      r = RAIO_Z * w,
      ang = (orbita * Math.PI) / 180
    this.raiz.style.setProperty('--z-est', `${ESTRELA_Z * w}px`)
    this.porta.style.transform = `translate(${Math.cos(ang) * r}px, ${Math.sin(ang) * r}px)`
    this.estrela.style.transform = `rotate(${total}deg)`
    // reflexo: passa uma vez pela estrela a cada movimento; brilho e halo crescem com a velocidade
    this.reflexo.style.setProperty('--z-luz', `${135 - total}deg`)
    this.reflexo.style.setProperty('--z-bp', `${120 - 140 * p}%`)
    this.reflexo.style.opacity = (0.25 + 0.75 * v).toFixed(3)
    this.estrela.style.setProperty('--z-o', (0.3 + 0.7 * v).toFixed(3))
    // raios longos só no auge do giro: parada eles somem, para não mudar a proporção da estrela
    this.estrela.style.setProperty('--z-ra', Math.pow(limita((v - 0.35) / 0.65), 1.5).toFixed(3))
  }

  private giraAnel(graus: number) {
    const a = graus + this.base.anel
    this.ult.anel = a
    this.anel.style.transform = `rotate(${a.toFixed(3)}deg)`
  }

  /** Sobe e desce, inclina e respira, em ondas lentas que nunca se repetem igual. */
  private flutua(agora: number) {
    const t = (agora - this.zero) / 1000
    const y = Math.sin(t * 0.9) * 1.6 + Math.sin(t * 0.37) * 0.8
    const rx = Math.sin(t * 0.55) * 4.5,
      ry = Math.cos(t * 0.42) * 6
    const sc = 1 + Math.sin(t * 0.7) * 0.008
    this.raiz.style.transform = `translateY(${y}%) rotateX(${rx}deg) rotateY(${ry}deg) scale(${sc})`
  }
}
