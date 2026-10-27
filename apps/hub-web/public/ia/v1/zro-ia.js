/* global HTMLElement, customElements, CustomEvent, TextDecoder, AbortController, requestAnimationFrame, cancelAnimationFrame, matchMedia, fetch, addEventListener, removeEventListener */
/*
 * <zro-ia> · a IA da Absolute ZRO dentro de qualquer plataforma do ecossistema (27/10/2026).
 * A mesma IA e o mesmo painel em todas: saudação com o orbe, sugestões, o campo de conversa e "Conversas" (as desta
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
 * Sem dependências, sem cookies de terceiros, só CSS no movimento e respeita "reduzir movimento".
 */
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
.orbe{--tam:104px;position:relative;display:inline-grid;width:var(--tam);height:var(--tam)}
.orbe::before{content:'';position:absolute;inset:-30%;border-radius:50%;background:radial-gradient(circle,rgb(127 127 140/.16),transparent 62%);opacity:0;transition:opacity .5s var(--ease)}
.anel{position:absolute;inset:0}
.anel i{--r:calc(var(--tam)*.36);position:absolute;top:50%;left:50%;width:calc(var(--tam)*.11);height:calc(var(--tam)*.11);margin:calc(var(--tam)*-.055);border-radius:50%;background:currentColor;transform:rotate(calc(var(--k)*45deg)) translateX(var(--r));opacity:calc(.35 + var(--k)*.08);transition:opacity .4s var(--ease),transform .6s var(--ease)}
.orbe[data-e=ouvindo]::before,.orbe[data-e=pensando]::before{opacity:1}
.orbe[data-e=ouvindo] .anel i{--r:calc(var(--tam)*.4);opacity:.95}
.orbe[data-e=pensando] .anel i{--r:calc(var(--tam)*.3)}
.orbe[data-e=desligada]{opacity:.35}
@media (prefers-reduced-motion:no-preference){
.orbe[data-e=pronta] .anel{animation:gira 14s linear infinite}
.orbe[data-e=pronta] .anel i{animation:respira 3.2s var(--ease) infinite;animation-delay:calc(var(--k)*.4s)}
.orbe[data-e=ouvindo] .anel{animation:gira 6s linear infinite}
.orbe[data-e=pensando] .anel{animation:gira 1.4s cubic-bezier(.5,.1,.5,.9) infinite}
.orbe[data-e=pensando] .anel i{animation:pulsa .9s ease-in-out infinite;animation-delay:calc(var(--k)*.11s)}
.msg{animation:entra .35s var(--ease) both}
.sug li{animation:entra .5s var(--ease) both;animation-delay:calc(.2s + var(--i)*.06s)}
.gav-painel{transition:translate .38s var(--ease)}.veu{transition:opacity .3s var(--ease)}}
@keyframes gira{to{rotate:360deg}}@keyframes respira{50%{scale:.6}}@keyframes pulsa{50%{scale:1.45;opacity:1}}@keyframes entra{from{opacity:0;translate:0 6px}}
.conversa{display:flex;flex-direction:column;gap:18px;padding:16px 2px 8px}
.msg{max-width:100%;overflow-wrap:anywhere;line-height:1.55}
.eu{align-self:flex-end;max-width:min(80%,560px);padding:10px 16px;border-radius:20px 20px 6px 20px;background:var(--surf3);white-space:pre-wrap}
.erro{color:var(--mute)}
.texto{display:grid;gap:10px}.texto ul,.texto ol{display:grid;gap:4px;padding-left:1.3em}.texto strong{font-weight:650}
.pensando{display:inline-flex;align-items:center;gap:10px;color:var(--faint);font-size:.92rem}
.pensando .orbe{--tam:22px}
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
const orbe = (e, tam) =>
  `<span class="orbe" data-e="${e}"${tam ? ` style="--tam:${tam}px"` : ''} aria-hidden="true"><span class="anel">${Array.from({ length: 8 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</span></span>`

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
    this.root.innerHTML = `<style>${CSS}</style><div class="raiz"></div>`
    this.$ = this.root.querySelector('.raiz')
    this.tema()
    this.mq = matchMedia('(prefers-color-scheme: dark)')
    this.mq.addEventListener?.('change', () => this.tema())
    this.render()
    this.carregar()
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
    const estado = !s.ligada || s.semLogin ? 'desligada' : s.pensando ? 'pensando' : s.foco ? 'ouvindo' : 'pronta'
    const c = s.creditos
    const sem = c && (c.limite === null || c.usados >= c.limite)
    const ph = s.semLogin
      ? 'Entre com a conta Absolute ZRO para conversar'
      : !s.ligada
        ? 'A IA ainda não foi ligada'
        : sem
          ? 'Os créditos de IA deste mês acabaram'
          : em
            ? 'Continue…'
            : 'Pergunte ou peça algo…'
    const valor = this.$.querySelector('textarea')?.value ?? ''
    const focado = this.root.activeElement?.tagName === 'TEXTAREA'
    this.$.innerHTML = `
      <div class="barra">
        <button type="button" class="pilula" data-a="gaveta" aria-expanded="${s.gaveta}">${LISTA} Conversas${s.conversas.length ? ` <b>${s.conversas.length}</b>` : ''}</button>
        ${em ? `<button type="button" class="pilula" data-a="nova">${MAIS} Nova conversa</button>` : ''}
      </div>
      <div class="corpo">${
        em
          ? `<div class="conversa" aria-live="polite">${s.msgs.map((m) => (m.papel === 'user' ? `<p class="msg eu">${esc(m.texto)}</p>` : `<div class="msg${m.erro ? ' erro' : ''}">${m.texto ? texto(m.texto) : `<span class="pensando">${orbe('pensando', 22)}${esc(s.lendo || 'Pensando…')}</span>`}</div>`)).join('')}<div class="fim"></div></div>`
          : `
        <div class="inicio">${orbe(estado)}
          <p class="estado" aria-live="polite"><i></i> ${s.semLogin ? 'sem conta' : !s.ligada ? 'ainda não ligada' : s.foco ? 'ouvindo' : 'IA da Absolute ZRO'}</p>
          <h1>${esc(saudacao())}${s.nome ? `, <strong>${esc(s.nome)}.</strong>` : '.'}</h1>
          <p class="apoio">${esc(s.ligada ? this.getAttribute('apoio') || 'O que você precisa hoje?' : 'A IA do ecossistema chega em breve, a mesma em todas as plataformas.')}</p>
        </div>`
      }</div>
      <div class="base">
        ${!em && this.pode && this.sugestoes.length ? `<ul class="sug" aria-label="Sugestões">${this.sugestoes.map((t, i) => `<li style="--i:${i}"><button type="button" data-sug="${esc(t)}">${esc(t)}</button></li>`).join('')}</ul>` : ''}
        <form class="campo"${this.pode ? '' : ' data-off'}>
          <label class="sr" for="t">Mensagem para a IA</label>
          <textarea id="t" rows="1" maxlength="8000" placeholder="${esc(ph)}"${this.pode ? '' : ' disabled'}>${esc(valor)}</textarea>
          ${s.pensando ? '<button type="button" class="enviar" data-a="parar" aria-label="Parar a resposta"><span class="parar"></span></button>' : `<button type="submit" class="enviar" aria-label="Enviar"${valor.trim() && this.pode ? '' : ' disabled'}>${SETA}</button>`}
        </form>
        <p class="rodape"><i${s.ligada ? ' data-on' : ''}></i>${s.ligada ? 'IA da Absolute ZRO' : 'IA desligada'}<span>·</span>${c && c.limite != null ? `${Math.max(0, c.limite - c.usados).toLocaleString('pt-BR')} créditos de IA no mês` : 'Você confere antes de qualquer ação'}</p>
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

  /** Só troca o estado do orbe (sem redesenhar, para não tirar o foco do campo). */
  orbeEstado() {
    const o = this.$.querySelector('.inicio .orbe')
    const p = this.$.querySelector('.inicio .estado')
    if (!o || !this.s.ligada || this.s.semLogin) return
    o.dataset.e = this.s.foco ? 'ouvindo' : 'pronta'
    if (p) p.innerHTML = `<i></i> ${this.s.foco ? 'ouvindo' : 'IA da Absolute ZRO'}`
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
        resp.texto = e?.message || 'A IA não respondeu. Tente de novo.'
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
        resp.texto = 'Sem conexão com a IA agora.'
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
