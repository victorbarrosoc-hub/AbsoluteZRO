/* global HTMLElement, ResizeObserver, document, performance, devicePixelRatio, customElements, CustomEvent, TextDecoder, AbortController, requestAnimationFrame, cancelAnimationFrame, matchMedia, fetch, addEventListener, removeEventListener */
/*
 * <zro-ia> · a IA da Absolute ZRO dentro de qualquer plataforma do ecossistema (27/10/2026).
 * A mesma IA e o mesmo painel em todas: saudação com o Z (anel e estrela cromados, com o rastro e as correntes em volta), sugestões, o campo de conversa e "Conversas" (as desta
 * plataforma; o app Absolute ZRO mostra as de todas). Fala com a API da IA do HUB (/api/v1/ia), direto com o token do
 * login único (escopo zro.ia) ou por um repasse do próprio app (que acrescenta o token no servidor).
 *
 * Uso:
 *   <script type="module" src="https://absolutezro.com/ia/v1/zro-ia.js"></script>
 *   <zro-ia api="/api/zro/ia" sugestoes='["Limpar minha fala","Isolar voz da música"]' apoio="O que você quer fazer com seu áudio?"></zro-ia>
 *   // sem repasse: el.token = async () => accessToken   (api="https://absolutezro.com/api/v1/ia")
 *
 * Atributos: api (base da API, sem barra no fim), apoio (linha abaixo da saudação), sugestoes (JSON), tema
 * (claro|escuro|auto, padrão auto), nome (primeiro nome; sem ele, vem da conta).
 * Eventos: zro-ia:sem-login (401: o app pede login), zro-ia:resposta (detail: { conversa, creditos }).
 * Sem dependências, sem cookies de terceiros e respeita "reduzir movimento". O Z é movido por um laço de quadros (a
 * mesma conta de apps/hub-web/lib/ia/z/motor.ts e ar.ts: mudou lá, mude aqui); as imagens vêm de ../z/ ao lado deste arquivo.
 */
const MIDIA = new URL('../z/', import.meta.url).href
const CSS = `
:host{--ink:#1d1d1f;--mute:#6e6e73;--faint:#8e8e93;--line:rgb(0 0 0/.09);--line2:rgb(0 0 0/.16);--surf:#fff;--surf2:#f5f5f7;--surf3:#ececf0;--bg:transparent;--send:#1d1d1f;--sendInk:#fff;--ease:cubic-bezier(.2,.8,.2,1);display:block;position:relative;color:var(--ink);font:inherit;font-size:16px;line-height:1.45;-webkit-font-smoothing:antialiased;container-type:inline-size}
:host([data-escuro]){--ink:#f5f5f7;--mute:#aeaeb2;--faint:#8e8e93;--line:rgb(255 255 255/.1);--line2:rgb(255 255 255/.2);--surf:rgb(255 255 255/.06);--surf2:rgb(255 255 255/.08);--surf3:rgb(255 255 255/.12);--send:#f5f5f7;--sendInk:#1d1d1f}
*{box-sizing:border-box;margin:0}
button,textarea{font:inherit;color:inherit}
.raiz{display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:12px;min-height:var(--zro-ia-altura,560px);width:min(100%,760px);margin-inline:auto}
.barra{display:flex;justify-content:space-between;gap:8px}
.pilula{display:inline-flex;align-items:center;gap:8px;min-height:34px;padding:0 14px;border:1px solid var(--line);border-radius:999px;background:var(--surf);font-size:.86rem;cursor:pointer}
.pilula:hover{border-color:var(--line2)}
.pilula b{min-width:20px;padding:1px 6px;border-radius:999px;background:var(--surf3);color:var(--mute);font-size:.74rem;font-weight:500;text-align:center}
.corpo{display:grid;min-height:0}
.inicio{align-self:center;display:grid;justify-items:center;gap:10px;padding:clamp(12px,5vh,56px) 0 8px;text-align:center}
.estado{display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:3px 10px;border:1px solid var(--line);border-radius:999px;color:var(--faint);font-size:.74rem}
.estado i{width:6px;height:6px;border-radius:50%;background:currentColor}
h1{margin-top:8px;font-size:clamp(1.9rem,6cqi,2.9rem);line-height:1.05;letter-spacing:-.035em;font-weight:300}
h1 strong{font-weight:800}
.apoio{color:var(--faint);font-size:1.02rem}
.zs{--z-gl:118 128 146;--z-mb:multiply;--z-hk:.55;display:inline-grid;place-items:center;width:var(--z-tam,112px);height:var(--z-tam,112px);perspective:1100px;flex:none}
:host([data-escuro]) .zs{--z-gl:255 255 255;--z-mb:plus-lighter;--z-hk:1}
.zs[data-off]{opacity:.4;filter:grayscale(1)}
.z{position:relative;width:100%;aspect-ratio:1;will-change:transform}
.z img{display:block;width:100%;height:100%;user-select:none}
.z-anel{position:absolute;inset:0}
.z-porta{position:absolute;top:50%;left:50%;width:0;height:0}
.z-est{position:absolute;width:var(--z-est,0px);height:var(--z-est,0px);left:calc(var(--z-est,0px)/-2);top:calc(var(--z-est,0px)/-2)}
.z-est img{position:relative;filter:drop-shadow(0 0 calc(var(--z-est,0px)*.05) rgb(var(--z-gl)/calc(var(--z-o,.3)*.9)))}
.z-ref{position:absolute;inset:0;-webkit-mask:url(${MIDIA}estrela.webp) center/contain no-repeat;mask:url(${MIDIA}estrela.webp) center/contain no-repeat;background:linear-gradient(var(--z-luz,135deg),transparent 38%,#fff 50%,transparent 62%);background-size:250% 250%;background-position:var(--z-bp,50%) 50%;mix-blend-mode:screen;opacity:.25}
.z-halo{position:absolute;inset:-55%;opacity:calc(var(--z-o,.3)*var(--z-hk));background:radial-gradient(closest-side,rgb(var(--z-gl)/.5),rgb(var(--z-gl)/.16) 45%,transparent 75%)}
.z-raios{position:absolute;inset:-38%;opacity:var(--z-ra,0);filter:blur(.5px);mix-blend-mode:var(--z-mb);background:linear-gradient(90deg,transparent,rgb(var(--z-gl)/.95) 50%,transparent) center/100% 2px no-repeat,linear-gradient(0deg,transparent,rgb(var(--z-gl)/.8) 50%,transparent) center/2px 72% no-repeat}
.ar{position:absolute;top:-48px;left:0;width:100%;height:calc(100% + 96px);pointer-events:none;-webkit-mask-image:radial-gradient(closest-side,#000 55%,transparent);mask-image:radial-gradient(closest-side,#000 55%,transparent)}
.raiz{position:relative}
.barra .zs{align-self:center}
@media (prefers-reduced-motion:reduce){.ar{display:none}}
@media (prefers-reduced-motion:no-preference){
.msg{animation:entra .35s var(--ease) both}
.sug li{animation:entra .5s var(--ease) both;animation-delay:calc(.2s + var(--i)*.06s)}
.gav-painel{transition:translate .38s var(--ease)}.veu{transition:opacity .3s var(--ease)}}
@keyframes entra{from{opacity:0;translate:0 6px}}
.conversa{display:flex;flex-direction:column;gap:18px;padding:16px 2px 8px}
.msg{max-width:100%;overflow-wrap:anywhere;line-height:1.55}
.eu{align-self:flex-end;max-width:min(80%,560px);padding:10px 16px;border-radius:20px 20px 6px 20px;background:var(--surf3);white-space:pre-wrap}
.erro{color:var(--mute)}
.texto{display:grid;gap:10px}.texto ul,.texto ol{display:grid;gap:4px;padding-left:1.3em}.texto strong{font-weight:650}
.pensando{display:inline-flex;align-items:center;gap:10px;color:var(--faint);font-size:.92rem}
.base{position:sticky;bottom:0;display:grid;gap:10px;padding:10px 0 4px}
.sug{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:0;list-style:none}
.sug button{padding:8px 14px;border:1px solid var(--line);border-radius:999px;background:var(--surf);color:var(--mute);font-size:.86rem;cursor:pointer;transition:color .2s,border-color .2s,translate .2s}
.sug button:hover{color:var(--ink);border-color:var(--line2);translate:0 -1px}
@container (max-width:520px){.sug{flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;scrollbar-width:none}.sug button{white-space:nowrap}}
.campo{display:flex;align-items:flex-end;gap:8px;padding:8px 8px 8px 20px;border:1px solid var(--line2);border-radius:28px;background:var(--surf);box-shadow:0 12px 34px rgb(0 0 0/.07);transition:box-shadow .25s,border-color .25s}
.campo:focus-within{border-color:var(--faint);box-shadow:0 0 0 4px rgb(127 127 127/.12),0 12px 34px rgb(0 0 0/.08)}
.campo[data-off]{opacity:.7}
textarea{flex:1;min-height:40px;max-height:200px;padding:9px 0;border:0;outline:0;resize:none;background:transparent;font-size:1rem;line-height:1.4;field-sizing:content}
textarea::placeholder{color:var(--faint)}
.enviar{flex:none;display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:50%;background:var(--send);color:var(--sendInk);box-shadow:inset 0 1px 0 rgb(255 255 255/.35),0 6px 16px rgb(0 0 0/.18);cursor:pointer;transition:opacity .2s,scale .2s}
.enviar:disabled{opacity:.3;cursor:default}.enviar:not(:disabled):active{scale:.94}
.parar{width:12px;height:12px;border-radius:3px;background:currentColor}
.rodape{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:6px;color:var(--faint);font-size:.76rem;text-align:center}
.rodape i{width:6px;height:6px;border-radius:50%;background:var(--faint)}.rodape i[data-on]{background:var(--ink)}
.rodape{font-variant-numeric:tabular-nums}.rodape b{display:inline-flex;align-items:center;gap:6px;color:var(--ink);font-weight:700}
.uso{display:grid;justify-items:center;gap:7px;width:min(100%,360px);margin-inline:auto}
.trilho{width:100%;height:3px;border-radius:999px;background:var(--line);overflow:hidden}
.trilho i{display:block;height:100%;border-radius:inherit;background:var(--ink);transform-origin:left;transition:transform .8s var(--ease)}
.uso[data-alerta] .trilho i{background:#c9850a}
@media (prefers-reduced-motion:reduce){.trilho i{transition:none}}
.gav{position:fixed;inset:0;z-index:2147483000;pointer-events:none}.gav[data-on]{pointer-events:auto}
.veu{position:absolute;inset:0;border:0;background:rgb(0 0 0/.28);opacity:0}.gav[data-on] .veu{opacity:1}
.gav-painel{position:absolute;top:0;bottom:0;left:0;width:min(88vw,360px);display:flex;flex-direction:column;gap:10px;padding:max(18px,env(safe-area-inset-top)) 14px 18px;overflow-y:auto;background:var(--zro-ia-fundo-gaveta,#f5f5f7);border-right:1px solid var(--line);box-shadow:24px 0 60px rgb(0 0 0/.16);translate:-102% 0}
:host([data-escuro]) .gav-painel{background:var(--zro-ia-fundo-gaveta,#141416)}
.gav[data-on] .gav-painel{translate:0 0}
.gav-topo{display:flex;justify-content:space-between;align-items:center;padding:4px 4px 0}
.gav-titulo{font-size:.74rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.x{width:32px;height:32px;border:0;border-radius:50%;background:transparent;color:var(--mute);cursor:pointer}.x:hover{background:var(--surf3)}
.nova{display:flex;align-items:center;gap:8px;min-height:42px;padding:0 14px;border:1px solid var(--line);border-radius:14px;background:var(--surf);cursor:pointer}
.vazio{padding:18px 6px;color:var(--faint);font-size:.9rem}
.lista{display:grid;gap:2px;padding:0;list-style:none}
.lista li{display:flex;align-items:center;border-radius:10px}.lista li:hover,.lista li[data-on]{background:var(--surf2)}
.abrir{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;padding:9px 10px;border:0;background:transparent;font-size:.88rem;text-align:left;cursor:pointer}
.abrir span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.abrir time{flex:none;color:var(--faint);font-size:.74rem}
.apagar{flex:none;width:28px;height:28px;margin-right:4px;border:0;border-radius:50%;background:transparent;color:var(--faint);font-size:.72rem;cursor:pointer;opacity:0}
.lista li:hover .apagar,.apagar:focus-visible{opacity:1}@media (hover:none){.apagar{opacity:1}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.conta{color:var(--faint);font-size:.8rem;text-align:center;padding:4px}.conta a{color:inherit}
@media (prefers-reduced-motion:reduce){.gav-painel,.veu{transition:none}}
`

const SETA =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>'
const LISTA =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 4h14M5 9h10M5 14h14M5 19h8"/></svg>'
const MAIS =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/* ---------- o Z: anel e estrela movidos aqui (números aprovados pelo titular em 27/10/2026) ---------- */
const RAIO_Z = 0.4183
const ESTRELA_Z = (0.5 * RAIO_Z * 2) / 0.978
const MOV_Z = { volta: 3.2, giros: 0.75, pausa: 1, sentido: 1 }
const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const velocidade = (p) => (p < 0.5 ? 12 * p * p : 12 * (1 - p) * (1 - p)) / 3
const limita = (x) => Math.min(1, Math.max(0, x))
const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const vivos = new Set()
// 23,976 quadros por segundo, como no cinema: o movimento segue o relógio, só a cadência muda
const QUADRO_MS = 1000 / 23.976
let pedido = 0
let ultimo = 0
const laco = (agora) => {
  if (agora - ultimo >= QUADRO_MS - 1) {
    ultimo = agora - ((agora - ultimo) % QUADRO_MS)
    for (const a of vivos) a.quadro(agora)
  }
  pedido = vivos.size ? requestAnimationFrame(laco) : 0
}
const FAIXAS = 6
/** Um fio em poucas faixas de transparência (um caminho por faixa). */
const fio = (ctx, pts, cor, alfa, largura) => {
  const n = pts.length
  if (n < 2) return
  for (let f = 0; f < FAIXAS; f++) {
    const i0 = Math.floor(((n - 1) * f) / FAIXAS),
      i1 = Math.floor(((n - 1) * (f + 1)) / FAIXAS)
    if (i1 <= i0) continue
    const k = (f + 1) / FAIXAS
    ctx.strokeStyle = `rgba(${cor},${(alfa * k * k).toFixed(3)})`
    ctx.lineWidth = largura * (0.35 + 0.65 * k)
    ctx.beginPath()
    ctx.moveTo(pts[i0].x, pts[i0].y)
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
  }
}
const animar = (a) => {
  vivos.add(a)
  if (!pedido) pedido = requestAnimationFrame(laco)
}

class MotorZ {
  constructor() {
    this.cena = document.createElement('span')
    this.cena.className = 'zs'
    this.cena.setAttribute('aria-hidden', 'true')
    this.cena.innerHTML = `<span class="z"><img class="z-anel" src="${MIDIA}anel.webp" alt="" draggable="false"><span class="z-porta"><span class="z-est"><span class="z-halo"></span><img src="${MIDIA}estrela.webp" alt="" draggable="false"><span class="z-ref"></span><span class="z-raios"></span></span></span></span>`
    const q = (c) => this.cena.querySelector(c)
    Object.assign(this, { raiz: q('.z'), anel: q('.z-anel'), porta: q('.z-porta'), estrela: q('.z-est'), reflexo: q('.z-ref') })
    this.mov = 'parada'
    this.inicio = this.zero = performance.now()
    this.base = { giro: 0, anel: 0 }
    this.ult = { total: 0, anel: 0 }
  }
  ligar() {
    animar(this)
  }
  desligar() {
    vivos.delete(this)
  }
  tamanho(px) {
    this.cena.style.setProperty('--z-tam', `${px}px`)
  }
  mover(m) {
    if (m === this.mov) return
    this.base = { giro: this.ult.total % 360, anel: this.ult.anel % 360 }
    this.mov = m
    this.inicio = performance.now()
  }
  medidas() {
    const a = this.raiz.getBoundingClientRect(),
      e = this.porta.getBoundingClientRect()
    return { cx: a.left + a.width / 2, cy: a.top + a.height / 2, raio: RAIO_Z * this.raiz.clientWidth, ex: e.left, ey: e.top }
  }
  quadro(agora) {
    if (!this.cena.isConnected) return
    if (reduz()) return this.pose(0, 0, 0)
    const t = (agora - this.zero) / 1000
    const y = Math.sin(t * 0.9) * 1.6 + Math.sin(t * 0.37) * 0.8
    this.raiz.style.transform = `translateY(${y}%) rotateX(${Math.sin(t * 0.55) * 4.5}deg) rotateY(${Math.cos(t * 0.42) * 6}deg) scale(${1 + Math.sin(t * 0.7) * 0.008})`
    const d = (agora - this.inicio) / 1000
    const { volta, giros, pausa, sentido } = MOV_Z
    if (this.mov === 'pensando') {
      const ciclo = volta + pausa,
        n = Math.floor(d / ciclo),
        c = d - n * ciclo,
        p = c < volta ? suave(c / volta) : 1
      this.pose(sentido * 360 * (n + p), sentido * 360 * giros * (n + p), c < volta ? c / volta : 1)
      this.giraAnel(sentido * 90 * (n + 0.55 * (c / ciclo) + 0.45 * p))
    } else if (this.mov === 'parada') {
      const n = Math.floor(d / 6),
        c = d - n * 6,
        p = c < 2.4 ? suave(c / 2.4) : 1
      this.pose(0, sentido * 90 * (n + p), c < 2.4 ? c / 2.4 : 1)
      this.giraAnel(sentido * 45 * (n + 0.7 * (c / 6) + 0.3 * p))
    } else {
      const l = Math.min(1, d / volta),
        q = suave(l)
      this.pose(sentido * 360 * q, sentido * 360 * giros * q, l)
      this.giraAnel(sentido * 90 * q)
    }
  }
  pose(orbita, giro, p) {
    const total = orbita + giro + this.base.giro,
      v = velocidade(limita(p)),
      w = this.raiz.clientWidth,
      a = (orbita * Math.PI) / 180
    this.ult.total = total
    this.raiz.style.setProperty('--z-est', `${ESTRELA_Z * w}px`)
    this.porta.style.transform = `translate(${Math.cos(a) * RAIO_Z * w}px, ${Math.sin(a) * RAIO_Z * w}px)`
    this.estrela.style.transform = `rotate(${total}deg)`
    this.reflexo.style.setProperty('--z-luz', `${135 - total}deg`)
    this.reflexo.style.setProperty('--z-bp', `${120 - 140 * p}%`)
    this.reflexo.style.opacity = (0.25 + 0.75 * v).toFixed(3)
    this.estrela.style.setProperty('--z-o', (0.3 + 0.7 * v).toFixed(3))
    this.estrela.style.setProperty('--z-ra', Math.pow(limita((v - 0.35) / 0.65), 1.5).toFixed(3))
  }
  giraAnel(g) {
    const a = g + this.base.anel
    this.ult.anel = a
    this.anel.style.transform = `rotate(${a.toFixed(3)}deg)`
  }
}

/** O ar: rastro da estrela contornando o anel e correntes em espiral que se fecham no Z. */
const FORCA_AR = { calma: 0.22, ouvindo: 0.5, pensando: 1, respondendo: 0.6, pronta: 0.3, desligada: 0 }
class MotorAr {
  constructor(canvas, escuro) {
    Object.assign(this, {
      canvas,
      escuro,
      ctx: canvas.getContext('2d'),
      alvo: null,
      cena: 'calma',
      forca: 0,
      trilha: [],
      fios: [],
      antes: performance.now(),
      w: 0,
      h: 0,
    })
    this.obs = new ResizeObserver(() => this.medir())
    this.obs.observe(canvas)
  }
  medir() {
    const d = Math.min(2, devicePixelRatio || 1)
    this.w = this.canvas.clientWidth
    this.h = this.canvas.clientHeight
    this.canvas.width = Math.round(this.w * d)
    this.canvas.height = Math.round(this.h * d)
    this.ctx?.setTransform(d, 0, 0, d, 0, 0)
  }
  mirar(z) {
    if (z === this.alvo) return
    this.alvo = z
    this.trilha = []
    this.fios = []
  }
  quadro(agora) {
    const ctx = this.ctx,
      dt = Math.min(0.05, (agora - this.antes) / 1000)
    this.antes = agora
    if (!ctx || !this.canvas.isConnected) return
    ctx.clearRect(0, 0, this.w, this.h)
    const z = this.alvo
    if (!z || reduz() || !z.cena.isConnected || document.hidden) return
    const caixa = this.canvas.getBoundingClientRect(),
      m = z.medidas(),
      R = m.raio
    if (!R) return
    const cx = m.cx - caixa.left,
      cy = m.cy - caixa.top,
      escuro = this.escuro(),
      cor = escuro ? '255,255,255' : '58,64,78'
    ctx.lineCap = 'round'
    if (R > 24) {
      const a = Math.atan2(m.ey - m.cy, m.ex - m.cx),
        ult = this.trilha[this.trilha.length - 1]
      if (!ult || Math.abs(a - ult.a) > 0.004) this.trilha.push({ a, t: agora })
      this.trilha = this.trilha.filter((q) => agora - q.t < 1100)
      for (const [raio, peso] of [
        [1.24, 1],
        [0.76, 0.6],
      ])
        for (let f = 0; f < FAIXAS; f++) {
          const k = 1 - (f + 0.5) / FAIXAS
          ctx.strokeStyle = `rgba(${cor},${(0.9 * peso * k * k).toFixed(3)})`
          ctx.lineWidth = (0.6 + 3 * k * k) * peso
          ctx.beginPath()
          for (let i = 1; i < this.trilha.length; i++) {
            if (Math.min(FAIXAS - 1, Math.floor(((agora - this.trilha[i].t) / 1100) * FAIXAS)) !== f) continue
            const a0 = this.trilha[i - 1].a,
              a1 = this.trilha[i].a
            if (Math.abs(a1 - a0) > 1) continue
            ctx.moveTo(cx + Math.cos(a0) * R * raio, cy + Math.sin(a0) * R * raio)
            ctx.lineTo(cx + Math.cos(a1) * R * raio, cy + Math.sin(a1) * R * raio)
          }
          ctx.stroke()
        }
    }
    this.forca += (FORCA_AR[this.cena] - this.forca) * Math.min(1, dt * 1.8)
    const max = Math.hypot(this.w, this.h) * 0.62,
      base = Math.max(R, 40)
    const nascer = (longe) => ({
      a: Math.random() * Math.PI * 2,
      r: longe ? max * (0.75 + Math.random() * 0.25) : R * 1.4 + Math.random() * Math.max(0, max - R * 1.4),
      pts: [],
      vida: 0,
      ritmo: 0.7 + Math.random() * 0.6,
    })
    while (this.fios.length < 46) this.fios.push(nascer(false))
    for (const c of this.fios) {
      c.a += (0.18 + 0.95 * this.forca) * c.ritmo * Math.sqrt((base * 1.8) / Math.max(c.r, 1)) * dt
      c.r -= (10 + 70 * this.forca) * c.ritmo * dt
      c.vida += dt
      c.pts.push({ x: cx + Math.cos(c.a) * c.r, y: cy + Math.sin(c.a) * c.r })
      if (c.pts.length > 34) c.pts.shift()
      if (c.r < R * 1.12) Object.assign(c, nascer(true))
      const alfa = 0.42 * this.forca * limita((c.r - R * 1.12) / (base * 0.9)) * Math.min(1, c.vida / 0.8)
      if (this.forca > 0.01) fio(ctx, c.pts, cor, alfa, 1.2)
    }
  }
}

/** Abaixo do campo: o Z, o que resta de créditos no mês e um trilho fino que enche com o uso (alerta a partir de 80%). */
function uso(ligada, c) {
  const lim = c && c.limite != null ? c.limite : null
  const fr = lim ? Math.min(1, c.usados / lim) : 0
  const n = (x) => x.toLocaleString('pt-BR')
  const txt = !ligada
    ? 'desligado'
    : lim != null
      ? `${n(Math.max(0, lim - c.usados))} de ${n(lim)} créditos · renova ${RENOVA.format(new Date(c.renova_em))}`
      : 'Você confere antes de qualquer ação'
  const trilho =
    ligada && lim
      ? `<div class="trilho" role="meter" aria-label="Créditos de IA usados no mês" aria-valuemin="0" aria-valuemax="${lim}" aria-valuenow="${Math.min(c.usados, lim)}" aria-valuetext="${n(c.usados)} de ${n(lim)} usados"><i style="transform:scaleX(${fr})"></i></div>`
      : ''
  return `<div class="uso"${lim && fr >= 0.8 ? ' data-alerta' : ''}><p class="rodape"><b><i${ligada ? ' data-on' : ''}></i>Z</b><span>·</span>${txt}</p>${trilho}</div>`
}

/** Resposta da IA em blocos simples (parágrafo, lista, **negrito**), sempre escapada. */
function texto(t) {
  const out = []
  let lista = null
  let par = []
  const inl = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  const fp = () => {
    if (par.length) out.push(`<p>${inl(par.join(' '))}</p>`)
    par = []
  }
  const fl = () => {
    if (lista) out.push(`<${lista.o ? 'ol' : 'ul'}>${lista.i.map((x) => `<li>${inl(x)}</li>`).join('')}</${lista.o ? 'ol' : 'ul'}>`)
    lista = null
  }
  for (const linha of t.split('\n')) {
    const l = linha.trim()
    const m = /^(?:[-•*]\s+|(\d+)[.)]\s+)(.*)$/.exec(l)
    if (!l) {
      fp()
      fl()
    } else if (m) {
      fp()
      const o = !!m[1]
      if (lista && lista.o !== o) fl()
      lista ??= { o, i: [] }
      lista.i.push(m[2])
    } else if (/^#{1,4}\s+/.test(l)) {
      fp()
      fl()
      out.push(`<p><strong>${inl(l.replace(/^#{1,4}\s+/, ''))}</strong></p>`)
    } else {
      fl()
      par.push(l)
    }
  }
  fp()
  fl()
  return `<div class="texto">${out.join('')}</div>`
}

function saudacao() {
  const h = new Date().getHours()
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}
const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const DIA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
// o ciclo vira à 0h UTC do dia 1º: a renovação mostra a data do ciclo, não a do fuso de quem lê
const RENOVA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const quando = (iso) => {
  const d = new Date(iso)
  return new Date().toDateString() === d.toDateString() ? HORA.format(d) : DIA.format(d)
}

class ZroIa extends HTMLElement {
  constructor() {
    super()
    this.s = {
      ligada: true,
      nome: '',
      creditos: null,
      conversas: [],
      ativa: null,
      msgs: [],
      pensando: false,
      lendo: null,
      foco: false,
      gaveta: false,
      semLogin: false,
    }
    this.token = null
    this.root = this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.root.innerHTML = `<style>${CSS}</style><canvas class="ar" aria-hidden="true"></canvas><div class="raiz"></div>`
    this.$ = this.root.querySelector('.raiz')
    // o Z grande e o pequeno do "pensando" vivem fora do render: são recolocados no lugar a cada desenho, sem perder o giro
    this.z = new MotorZ()
    this.zp = new MotorZ()
    this.zp.tamanho(26)
    this.zp.mover('pensando')
    this.ar = new MotorAr(this.root.querySelector('.ar'), () => this.hasAttribute('data-escuro'))
    for (const a of [this.z, this.zp, this.ar]) animar(a)
    this.tema()
    this.mq = matchMedia('(prefers-color-scheme: dark)')
    this.mq.addEventListener?.('change', () => this.tema())
    this.render()
    this.carregar()
  }

  disconnectedCallback() {
    for (const a of [this.z, this.zp, this.ar]) vivos.delete(a)
    this.ar?.obs.disconnect()
    this.ctrl?.abort()
  }

  /** Cena do Z: o que ele faz agora (comanda o movimento e a força das correntes). */
  cena() {
    const s = this.s
    if (!s.ligada || s.semLogin) return 'desligada'
    if (s.pensando) return s.msgs[s.msgs.length - 1]?.texto ? 'respondendo' : 'pensando'
    return s.foco ? 'ouvindo' : 'calma'
  }

  /** Coloca o Z no estado e no lugar certos (no início, grande; em conversa, pequeno na barra). */
  posicionarZ() {
    const c = this.cena()
    this.z.mover(c === 'pensando' ? 'pensando' : c === 'respondendo' ? 'pronta' : 'parada')
    this.z.cena.toggleAttribute('data-off', c === 'desligada')
    this.ar.cena = c
    const lugar = this.$.querySelector('.lugar-z')
    if (lugar) {
      this.z.tamanho(lugar.dataset.tam)
      lugar.replaceWith(this.z.cena)
    }
    this.ar.mirar(lugar ? this.z : null)
    this.$.querySelector('.lugar-zp')?.replaceWith(this.zp.cena)
  }

  static get observedAttributes() {
    return ['tema']
  }
  attributeChangedCallback() {
    if (this.$) this.tema()
  }

  tema() {
    const t = this.getAttribute('tema') || 'auto'
    const escuro = t === 'escuro' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
    this.toggleAttribute('data-escuro', escuro)
  }

  get api() {
    return (this.getAttribute('api') || 'https://absolutezro.com/api/v1/ia').replace(/\/$/, '')
  }

  async req(caminho, init = {}) {
    const headers = { ...(init.headers || {}) }
    if (typeof this.token === 'function') {
      const t = await this.token()
      if (t) headers.Authorization = `Bearer ${t}`
    } else if (typeof this.token === 'string' && this.token) headers.Authorization = `Bearer ${this.token}`
    const r = await fetch(this.api + caminho, { ...init, headers, credentials: this.api.startsWith('/') ? 'same-origin' : 'omit', cache: 'no-store' })
    if (r.status === 401) {
      this.s.semLogin = true
      this.dispatchEvent(new CustomEvent('zro-ia:sem-login', { bubbles: true, composed: true }))
      this.render()
    }
    return r
  }

  async carregar() {
    try {
      const r = await this.req('/estado')
      if (r.ok) {
        const e = await r.json()
        this.s.ligada = e.ligada
        this.s.nome = this.getAttribute('nome') || e.nome || ''
        this.s.creditos = e.creditos
      }
      const c = await this.req('/conversas')
      if (c.ok) this.s.conversas = (await c.json()).conversas
    } catch {
      this.s.offline = true
    }
    this.render()
  }

  get sugestoes() {
    try {
      return JSON.parse(this.getAttribute('sugestoes') || '[]')
    } catch {
      return []
    }
  }
  get pode() {
    const c = this.s.creditos
    return this.s.ligada && !this.s.semLogin && !(c && (c.limite === null || c.usados >= c.limite))
  }

  render() {
    const s = this.s
    const em = s.msgs.length > 0
    const c = s.creditos
    const sem = c && (c.limite === null || c.usados >= c.limite)
    const ph = s.semLogin
      ? 'Entre com a conta Absolute ZRO para conversar'
      : !s.ligada
        ? 'A Z ainda não foi ligada'
        : sem
          ? 'Os créditos de IA deste mês acabaram'
          : em
            ? 'Continue…'
            : 'Pergunte à Z…'
    const valor = this.$.querySelector('textarea')?.value ?? ''
    const focado = this.root.activeElement?.tagName === 'TEXTAREA'
    this.$.innerHTML = `
      <div class="barra">
        <button type="button" class="pilula" data-a="gaveta" aria-expanded="${s.gaveta}">${LISTA} Conversas${s.conversas.length ? ` <b>${s.conversas.length}</b>` : ''}</button>
        ${em ? '<span class="lugar-z" data-tam="40"></span>' : ''}
        ${em ? `<button type="button" class="pilula" data-a="nova">${MAIS} Nova conversa</button>` : ''}
      </div>
      <div class="corpo">${
        em
          ? `<div class="conversa" aria-live="polite">${s.msgs.map((m) => (m.papel === 'user' ? `<p class="msg eu">${esc(m.texto)}</p>` : `<div class="msg${m.erro ? ' erro' : ''}">${m.texto ? texto(m.texto) : `<span class="pensando"><span class="lugar-zp"></span>${esc(s.lendo || 'Pensando…')}</span>`}</div>`)).join('')}<div class="fim"></div></div>`
          : `
        <div class="inicio"><span class="lugar-z" data-tam="120"></span>
          <p class="estado" aria-live="polite"><i></i> ${s.semLogin ? 'sem conta' : !s.ligada ? 'ainda não ligada' : s.foco ? 'ouvindo' : 'Z · IA da Absolute ZRO'}</p>
          <h1>${esc(saudacao())}${s.nome ? `, <strong>${esc(s.nome)}.</strong>` : '.'}</h1>
          <p class="apoio">${esc(s.ligada ? this.getAttribute('apoio') || 'O que você precisa hoje?' : 'A Z, a IA do ecossistema, chega em breve, a mesma em todas as plataformas.')}</p>
        </div>`
      }</div>
      <div class="base">
        ${!em && this.pode && this.sugestoes.length ? `<ul class="sug" aria-label="Sugestões">${this.sugestoes.map((t, i) => `<li style="--i:${i}"><button type="button" data-sug="${esc(t)}">${esc(t)}</button></li>`).join('')}</ul>` : ''}
        <form class="campo"${this.pode ? '' : ' data-off'}>
          <label class="sr" for="t">Mensagem para a Z</label>
          <textarea id="t" rows="1" maxlength="8000" placeholder="${esc(ph)}"${this.pode ? '' : ' disabled'}>${esc(valor)}</textarea>
          ${s.pensando ? '<button type="button" class="enviar" data-a="parar" aria-label="Parar a resposta"><span class="parar"></span></button>' : `<button type="submit" class="enviar" aria-label="Enviar"${valor.trim() && this.pode ? '' : ' disabled'}>${SETA}</button>`}
        </form>
        ${uso(s.ligada && !s.semLogin, c)}
      </div>
      <div class="gav"${s.gaveta ? ' data-on' : ''} aria-hidden="${!s.gaveta}">
        <button type="button" class="veu" data-a="fechar" tabindex="-1" aria-label="Fechar conversas"></button>
        <aside class="gav-painel" aria-label="Conversas">
          <div class="gav-topo"><p class="gav-titulo">Conversas</p><button type="button" class="x" data-a="fechar" aria-label="Fechar">✕</button></div>
          <button type="button" class="nova" data-a="nova">${MAIS} Nova conversa</button>
          ${s.conversas.length ? `<ul class="lista">${s.conversas.map((x) => `<li${x.id === s.ativa ? ' data-on' : ''}><button type="button" class="abrir" data-abrir="${x.id}"><span>${esc(x.titulo)}</span><time datetime="${x.atualizada}">${quando(x.atualizada)}</time></button><button type="button" class="apagar" data-apagar="${x.id}" aria-label="Apagar a conversa ${esc(x.titulo)}">✕</button></li>`).join('')}</ul>` : '<p class="vazio">As conversas desta plataforma ficam aqui. Todas aparecem também no app Absolute ZRO.</p>'}
          <p class="conta">Todas as conversas, de todas as plataformas: <a href="https://absolutezro.com/ia" target="_blank" rel="noopener">app Absolute ZRO</a></p>
        </aside>
      </div>`
    this.posicionarZ()
    this.ligar()
    const ta = this.$.querySelector('textarea')
    if (focado && ta && !ta.disabled) {
      ta.focus()
      ta.setSelectionRange(ta.value.length, ta.value.length)
    }
    this.$.querySelector('.fim')?.scrollIntoView({ block: 'end' })
  }

  ligar() {
    const $ = this.$
    $.querySelectorAll('[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.a
        if (a === 'gaveta') this.s.gaveta = true
        if (a === 'fechar') this.s.gaveta = false
        if (a === 'nova') {
          this.ctrl?.abort()
          Object.assign(this.s, { ativa: null, msgs: [], gaveta: false })
        }
        if (a === 'parar') return this.ctrl?.abort()
        this.render()
      }),
    )
    $.querySelectorAll('[data-sug]').forEach((b) => b.addEventListener('click', () => this.enviar(b.dataset.sug)))
    $.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => this.abrir(b.dataset.abrir)))
    $.querySelectorAll('[data-apagar]').forEach((b) => b.addEventListener('click', () => this.apagar(b.dataset.apagar)))
    const ta = $.querySelector('textarea')
    const envia = $.querySelector('button[type=submit]')
    ta?.addEventListener('input', () => {
      if (envia) envia.disabled = !ta.value.trim() || !this.pode
    })
    ta?.addEventListener('focus', () => {
      if (!this.s.foco) {
        this.s.foco = true
        this.orbeEstado()
      }
    })
    ta?.addEventListener('blur', () => {
      this.s.foco = false
      this.orbeEstado()
    })
    ta?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault()
        this.enviar(ta.value)
      }
    })
    $.querySelector('form')?.addEventListener('submit', (e) => {
      e.preventDefault()
      this.enviar(ta.value)
    })
    if (this.s.gaveta) {
      const k = (e) => {
        if (e.key === 'Escape') {
          this.s.gaveta = false
          removeEventListener('keydown', k)
          this.render()
        }
      }
      addEventListener('keydown', k, { once: true })
    }
  }

  /** Só troca o estado do Z (sem redesenhar, para não tirar o foco do campo). */
  orbeEstado() {
    const p = this.$.querySelector('.inicio .estado')
    if (!this.s.ligada || this.s.semLogin) return
    this.ar.cena = this.cena()
    if (p) p.innerHTML = `<i></i> ${this.s.foco ? 'ouvindo' : 'Z · IA da Absolute ZRO'}`
  }

  async abrir(id) {
    this.s.gaveta = false
    const r = await this.req(`/conversas/${encodeURIComponent(id)}`).catch(() => null)
    if (r?.ok) {
      const d = await r.json()
      this.s.ativa = id
      this.s.msgs = d.mensagens
    }
    this.render()
  }

  async apagar(id) {
    const r = await this.req(`/conversas/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)
    if (r && (r.ok || r.status === 404)) {
      this.s.conversas = this.s.conversas.filter((c) => c.id !== id)
      if (this.s.ativa === id) Object.assign(this.s, { ativa: null, msgs: [] })
      this.render()
    }
  }

  async enviar(p) {
    const t = String(p || '').trim()
    if (!t || this.s.pensando || !this.pode) return
    const ta = this.$.querySelector('textarea')
    if (ta) ta.value = ''
    const resp = { id: 'r' + Date.now(), papel: 'assistant', texto: '' }
    this.s.msgs.push({ id: 'p' + Date.now(), papel: 'user', texto: t }, resp)
    this.s.pensando = true
    this.render()
    this.ctrl = new AbortController()
    let quadro = 0
    const pintar = () => {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(() => this.render())
    }
    try {
      const r = await this.req('/mensagens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversa: this.s.ativa, texto: t }),
        signal: this.ctrl.signal,
      })
      if (!r.ok || !r.body) {
        const e = await r.json().catch(() => null)
        resp.texto = e?.message || 'A Z não respondeu. Tente de novo.'
        resp.erro = true
        return
      }
      const leitor = r.body.getReader()
      const dec = new TextDecoder()
      let resto = ''
      for (;;) {
        const { value, done } = await leitor.read()
        if (done) break
        resto += dec.decode(value, { stream: true })
        let n
        while ((n = resto.indexOf('\n')) >= 0) {
          const linha = resto.slice(0, n).trim()
          resto = resto.slice(n + 1)
          if (!linha) continue
          const ev = JSON.parse(linha)
          if (ev.tipo === 'conversa') this.s.ativa = ev.id
          else if (ev.tipo === 'lendo') {
            this.s.lendo = `Lendo ${ev.o_que || 'seus dados'}…`
            pintar()
          } else if (ev.tipo === 'texto') {
            this.s.lendo = null
            resp.texto += ev.t
            pintar()
          } else if (ev.tipo === 'fim') {
            if (ev.creditos && this.s.creditos) this.s.creditos.usados += ev.creditos
            this.dispatchEvent(new CustomEvent('zro-ia:resposta', { bubbles: true, composed: true, detail: { conversa: this.s.ativa, creditos: ev.creditos } }))
          } else if (ev.tipo === 'erro') {
            resp.texto = resp.texto ? `${resp.texto}\n\n${ev.mensagem}` : ev.mensagem
            resp.erro = true
          }
        }
      }
    } catch (e) {
      if (e?.name !== 'AbortError' && !resp.texto) {
        resp.texto = 'Sem conexão com a Z agora.'
        resp.erro = true
      }
    } finally {
      cancelAnimationFrame(quadro)
      Object.assign(this.s, { pensando: false, lendo: null })
      if (!resp.texto) this.s.msgs = this.s.msgs.filter((m) => m !== resp)
      this.render()
      const c = await this.req('/conversas').catch(() => null)
      if (c?.ok) {
        this.s.conversas = (await c.json()).conversas
        this.render()
      }
    }
  }
}

if (!customElements.get('zro-ia')) customElements.define('zro-ia', ZroIa)
export { ZroIa }
