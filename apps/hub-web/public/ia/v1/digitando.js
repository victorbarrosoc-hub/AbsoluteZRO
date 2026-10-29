/* global document, matchMedia, IntersectionObserver, HTMLTextAreaElement, HTMLInputElement, Event, clearTimeout */
/*
 * A sugestão que se escreve sozinha no campo da Z (pedido do titular, 29/10/2026). No lugar dos botões de sugestão, o
 * campo vazio digita uma ideia letra a letra, segura, apaga e escreve a próxima. Um módulo só para o painel das
 * plataformas (<zro-ia>, ao lado deste arquivo) e para o HUB (components/ia/painel-ia.tsx).
 *
 * `Digitando` é a conta pura (sem DOM, relógio injetável: os testes andam o tempo à mão); `ligarCampo` liga a conta a
 * um campo e a uma camada "fantasma" por cima dele (aria-hidden). O campo guarda o nome estável ("Pergunte à Z") e as
 * sugestões ficam numa descrição fixa (aria-describedby, sem região viva).
 *
 * Regras: começa só com o campo à vista (IntersectionObserver) e a aba aberta; para no foco ou quando a pessoa escreve
 * e volta no blur com o campo vazio. Focado e vazio, a sugestão fica inteira e parada: Tab ou → completa (nada é
 * enviado sozinho); Esc dispensa. No celular, tocar na sugestão completa. "Reduzir movimento": sem digitação, uma
 * sugestão inteira que troca a cada 4 s com um esmaecer.
 */

/** Tempos em ms: letra 35 a 55 (45 ± 10), segura 1,6 s, apaga a 20 por letra, respira e começa a próxima. */
export const RITMO = Object.freeze({ letra: 45, variacao: 10, pontuacao: 110, segura: 1600, apaga: 20, pausa: 420, inicio: 600, troca: 4000 })

const relogioPadrao = { agendar: (f, ms) => setTimeout(f, ms), cancelar: (id) => clearTimeout(id) }

/** Texto da descrição acessível: as sugestões, fixas (não é região viva) e o atalho. */
export function descricaoSugestoes(frases) {
  const l = (frases || []).filter(Boolean)
  if (!l.length) return ''
  const fim = /[.?!…]$/.test(l[l.length - 1]) ? '' : '.'
  return `Sugestões: ${l.join('; ')}${fim} Tab completa a sugestão.`
}

export class Digitando {
  /**
   * @param {{ frases?: string[], reduzido?: boolean, aoMudar?: (e: object) => void, relogio?: { agendar: Function, cancelar: Function }, sorte?: () => number, ritmo?: object }} [o]
   */
  constructor(o = {}) {
    this.ritmo = { ...RITMO, ...(o.ritmo || {}) }
    this.relogio = o.relogio || relogioPadrao
    this.sorte = o.sorte || Math.random
    this.aoMudar = o.aoMudar || (() => {})
    // condições: à vista, aba aberta, campo focado, campo com texto, dispensada (Esc), reduzir movimento
    this.c = { visivel: false, aba: true, foco: false, ocupado: false, dispensada: false, reduzido: !!o.reduzido }
    this.timer = null
    this.fase = 'inicio'
    this.lista = []
    this.frases = o.frases || []
  }

  get frases() {
    return this.lista
  }
  set frases(l) {
    this.lista = (Array.isArray(l) ? l : []).map((s) => String(s).trim()).filter(Boolean)
    this.i = 0
    this.n = 0
    this.fase = 'inicio'
    this.cancelar()
    this.avaliar()
  }

  /** A sugestão da vez, inteira. */
  get frase() {
    return this.lista[this.i] || ''
  }
  /** O que aparece no campo agora. */
  get texto() {
    if (!this.lista.length || this.c.ocupado || this.c.dispensada) return ''
    if (this.c.foco || this.c.reduzido) return this.frase
    return this.frase.slice(0, this.n)
  }
  /** Anda sozinho: à vista, aba aberta, sem foco e sem texto. */
  get rodando() {
    const c = this.c
    return this.lista.length > 0 && c.visivel && c.aba && !c.foco && !c.ocupado
  }

  definir(parcial) {
    const antes = this.c.foco
    Object.assign(this.c, parcial)
    if (!this.c.foco) this.c.dispensada = false
    // no foco a sugestão fica inteira e parada; ao sair, segura um pouco e segue de onde estava (apagando)
    // (depois de apagar, `i` já aponta a próxima: quem foca entre uma e outra vê a próxima inteira)
    if (this.c.foco && !antes && this.lista.length) {
      this.n = this.frase.length
      this.fase = 'segurando'
    }
    this.cancelar()
    this.avaliar()
  }

  /** Tab ou → com o campo focado e vazio: devolve o texto para completar (ou null, e a tecla segue o normal). */
  tecla(nome, vazio = true) {
    if ((nome !== 'Tab' && nome !== 'ArrowRight') || !vazio || !this.c.foco) return null
    return this.aceitar()
  }

  /** A sugestão inteira, se ela está à mostra. */
  aceitar() {
    const t = this.texto ? this.frase : ''
    return t || null
  }

  /** Esc: some até o próximo foco. */
  dispensar() {
    if (!this.texto) return false
    this.c.dispensada = true
    this.emitir()
    return true
  }

  parar() {
    this.cancelar()
    this.lista = []
    this.emitir()
  }

  cancelar() {
    if (this.timer != null) this.relogio.cancelar(this.timer)
    this.timer = null
  }

  agendar(ms) {
    this.cancelar()
    this.timer = this.relogio.agendar(() => {
      this.timer = null
      this.passo()
    }, ms)
  }

  avaliar() {
    this.emitir()
    if (!this.rodando || this.timer != null) return
    const r = this.ritmo
    if (this.c.reduzido) return this.agendar(r.troca)
    if (this.fase === 'inicio') return this.agendar(r.inicio)
    if (this.fase === 'segurando') return this.agendar(r.segura)
    if (this.fase === 'apagando') return this.agendar(r.apaga)
    if (this.fase === 'esperando') return this.agendar(r.pausa)
    this.agendar(this.atraso())
  }

  /** 35 a 55 ms por letra, um respiro depois de vírgula e ponto. */
  atraso() {
    const r = this.ritmo
    const anterior = this.frase[this.n - 1]
    const base = r.letra + (this.sorte() * 2 - 1) * r.variacao
    return Math.round(anterior && /[,.;:?!]/.test(anterior) ? base + r.pontuacao : base)
  }

  passo() {
    if (!this.rodando) return
    const r = this.ritmo
    if (this.c.reduzido) {
      this.i = (this.i + 1) % this.lista.length
      this.n = this.frase.length
      this.emitir(true)
      return this.agendar(r.troca)
    }
    const total = this.frase.length
    if (this.fase === 'inicio' || this.fase === 'esperando') {
      this.fase = 'escrevendo'
      this.n = 0
    }
    if (this.fase === 'escrevendo') {
      this.n = Math.min(total, this.n + 1)
      if (this.n >= total) {
        this.fase = 'segurando'
        this.emitir()
        return this.agendar(r.segura)
      }
      this.emitir()
      return this.agendar(this.atraso())
    }
    if (this.fase === 'segurando') {
      this.fase = 'apagando'
    }
    if (this.fase === 'apagando') {
      this.n = Math.max(0, this.n - 1)
      if (this.n === 0) {
        // a próxima já é "a da vez": quem focar agora vê a próxima inteira
        this.i = (this.i + 1) % this.lista.length
        this.fase = 'esperando'
        this.emitir()
        return this.agendar(r.pausa)
      }
      this.emitir()
      return this.agendar(r.apaga)
    }
  }

  emitir(troca = false) {
    const c = this.c
    this.aoMudar({
      texto: this.texto,
      frase: this.frase,
      fase: this.fase,
      foco: c.foco,
      // o cursor de mentira só enquanto anda sozinho; focado, o cursor é o do próprio campo
      cursor: this.lista.length > 0 && !c.foco && !c.ocupado && !c.reduzido,
      troca,
    })
  }
}

const valorNativo = (campo) => {
  const proto = typeof HTMLTextAreaElement !== 'undefined' && campo instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  return Object.getOwnPropertyDescriptor(proto, 'value')?.set
}

/** Completa o campo como se a pessoa tivesse digitado (o `input` avisa o React e o <zro-ia>); não envia. */
export function preencher(campo, texto) {
  const set = valorNativo(campo)
  if (set) set.call(campo, texto)
  else campo.value = texto
  campo.dispatchEvent(new Event('input', { bubbles: true }))
  campo.focus()
  campo.setSelectionRange?.(texto.length, texto.length)
}

/**
 * Liga o motor a um campo e à camada fantasma (um elemento vazio por cima do campo; o conteúdo é montado aqui).
 * Devolve a função que desliga. Pode ser chamada de novo com outro campo (o <zro-ia> redesenha): o motor continua de
 * onde estava.
 * @param {HTMLTextAreaElement | HTMLInputElement} campo
 * @param {HTMLElement} fantasma
 * @param {Digitando} motor
 */
export function ligarCampo(campo, fantasma, motor) {
  const doc = campo.ownerDocument || document
  fantasma.setAttribute('aria-hidden', 'true')
  fantasma.innerHTML = '<span class="zf-texto"></span><i class="zf-cursor"></i><kbd class="zf-tab">tab</kbd>'
  const txt = fantasma.querySelector('.zf-texto')
  let troca = null
  const pintar = (e) => {
    const pronto = () => {
      txt.textContent = e.texto
      fantasma.dataset.fase = e.fase
      fantasma.toggleAttribute('data-cursor', e.cursor)
      fantasma.toggleAttribute('data-foco', e.foco)
      fantasma.toggleAttribute('data-vazio', !e.texto && !e.cursor)
    }
    clearTimeout(troca)
    if (e.troca) {
      // reduzir movimento: some, troca o texto e volta (o CSS cuida do esmaecer)
      fantasma.setAttribute('data-trocando', '')
      troca = setTimeout(() => {
        pronto()
        fantasma.removeAttribute('data-trocando')
      }, 200)
    } else {
      fantasma.removeAttribute('data-trocando')
      pronto()
    }
  }
  motor.aoMudar = pintar

  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  const raiz = campo.getRootNode?.() || doc
  const focado = () => (raiz.activeElement ?? doc.activeElement) === campo
  const aoReduzir = () => motor.definir({ reduzido: !!mq?.matches })
  const aoAba = () => motor.definir({ aba: !doc.hidden })
  const aoFoco = () => motor.definir({ foco: true, ocupado: campo.value.length > 0 })
  const aoSair = () => motor.definir({ foco: false, ocupado: campo.value.length > 0 })
  const aoEscrever = () => motor.definir({ ocupado: campo.value.length > 0 })
  const aoTecla = (e) => {
    if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key === 'Escape') {
      if (motor.dispensar()) e.stopPropagation()
      return
    }
    const t = motor.tecla(e.key, campo.value.length === 0)
    if (!t) return
    e.preventDefault()
    preencher(campo, t)
  }
  // tocar na sugestão (dedo ou caneta) completa; com o mouse, só leva o foco ao campo (sem piscar o foco no caminho)
  const segura = (e) => e.preventDefault()
  const aoTocar = (e) => {
    const t = motor.aceitar()
    if (e.pointerType && e.pointerType !== 'mouse' && t && campo.value.length === 0) {
      e.preventDefault()
      preencher(campo, t)
    } else campo.focus()
  }
  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((es) => motor.definir({ visivel: es.some((x) => x.isIntersecting) }), { threshold: 0.5 })
      : null
  if (io) io.observe(campo)
  else motor.c.visivel = true

  mq?.addEventListener?.('change', aoReduzir)
  doc.addEventListener('visibilitychange', aoAba)
  campo.addEventListener('focus', aoFoco)
  campo.addEventListener('blur', aoSair)
  campo.addEventListener('input', aoEscrever)
  campo.addEventListener('keydown', aoTecla)
  txt.addEventListener('pointerdown', segura)
  txt.addEventListener('pointerup', aoTocar)
  motor.definir({ reduzido: !!mq?.matches, aba: !doc.hidden, foco: focado(), ocupado: campo.value.length > 0 })

  return () => {
    clearTimeout(troca)
    io?.disconnect()
    mq?.removeEventListener?.('change', aoReduzir)
    doc.removeEventListener('visibilitychange', aoAba)
    campo.removeEventListener('focus', aoFoco)
    campo.removeEventListener('blur', aoSair)
    campo.removeEventListener('input', aoEscrever)
    campo.removeEventListener('keydown', aoTecla)
    txt.removeEventListener('pointerdown', segura)
    txt.removeEventListener('pointerup', aoTocar)
    motor.cancelar()
    if (motor.aoMudar === pintar) motor.aoMudar = () => {}
  }
}
