// Linha do tempo na tela: régua, clipes (V1), forma de onda (A1), efeitos sonoros (FX), legenda e zoom. Arrastar move o clipe (os outros
// abrem espaço com mola), as bordas aparam, ⌘/Ctrl + roda (ou pinça) aproxima em volta do ponteiro. Régua e forma de
// onda são canvases do tamanho da janela, redesenhados na rolagem: a linha pode ter horas sem passar do limite de canvas.
// Ímã: buscar na régua, aparar e arrastar efeito grudam nas bordas dos clipes, nos marcadores e no ponto (Alt solta o
// ímã). O efeito se arrasta sozinho (não empurra nada): ele se prende à imagem que estiver embaixo quando soltar.

import { posicoes, tamanho } from '../src/linha.js'
import { paraSegundos, relogio } from '../src/tempo.js'
import { JANELA_S } from '../src/analise/silencio.js'
import { CORES, corDoClipe, etiquetasDa } from '../src/cores.js'
import { efeitosNaLinha } from '../src/efeitos.js'

const MIN_ESCALA = 1
const MAX_ESCALA = 600
const el = (tag, cls, attrs = {}) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, attrs)
const reduzir = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const IMA_PX = 8

export class LinhaUI {
  constructor(raiz, { aoBuscar, aoAcao, aoSelecionar }) {
    this.raiz = raiz
    this.aoBuscar = aoBuscar
    this.aoAcao = aoAcao
    this.aoSelecionar = aoSelecionar
    this.escala = 20
    this.ajustada = false
    this.sel = null
    this.selFx = null
    this.dados = null
    this.t = 0

    const barra = el('div', 'linha-barra')
    this.btDividir = el('button', 'icone-btn', { title: 'Dividir no ponto (B)', ariaLabel: 'Dividir', innerHTML: '<svg><use href="#i-lamina"/></svg>' })
    this.btApagar = el('button', 'icone-btn', { title: 'Apagar o clipe (⌫)', ariaLabel: 'Apagar', innerHTML: '<svg><use href="#i-lixo"/></svg>', disabled: true })
    this.btMarcar = el('button', 'icone-btn', { title: 'Marcador no ponto (M)', ariaLabel: 'Marcador', innerHTML: '<svg><use href="#i-marcador"/></svg>' })
    this.btSom = el('button', 'icone-btn', { title: 'Efeito sonoro no ponto (S)', ariaLabel: 'Efeito sonoro', innerHTML: '<svg><use href="#i-som"/></svg>' })
    this.zoom = el('input', 'deslizar', { type: 'range', min: '0', max: '1000', value: '300', ariaLabel: 'Aproximar a linha do tempo', title: 'Aproximar (⌘ + roda)' })
    this.info = el('span', 'apoio linha-info')
    // cor e etiqueta do clipe selecionado (aparecem só com seleção)
    this.paleta = el('div', 'paleta', { hidden: true, role: 'group', ariaLabel: 'Cor do clipe' })
    for (const c of [{ id: '', nome: 'Sem cor' }, ...CORES]) {
      const b = el('button', c.id ? '' : 'sem-cor', { title: c.nome, ariaLabel: c.nome })
      if (c.id) b.dataset.cor = c.id
      b.onclick = () => this.sel && this.aoAcao('etiquetar', this.sel, { cor: c.id || null })
      this.paleta.append(b)
    }
    this.campoEtiqueta = el('input', 'etiqueta-campo', { type: 'text', placeholder: 'Etiqueta', maxLength: 40, title: 'Etiqueta do clipe (Enter grava)', ariaLabel: 'Etiqueta do clipe' })
    this.campoEtiqueta.onkeydown = (e) => {
      if (e.key === 'Enter') this.campoEtiqueta.blur()
      if (e.key === 'Escape') {
        this.campoEtiqueta.value = this.#clipeSel()?.etiqueta || ''
        this.campoEtiqueta.blur()
      }
    }
    this.campoEtiqueta.onchange = () => this.sel && this.aoAcao('etiquetar', this.sel, { etiqueta: this.campoEtiqueta.value })
    this.paleta.append(this.campoEtiqueta)
    this.filtro = el('div', 'filtro-etiquetas', { role: 'group', ariaLabel: 'Filtrar por etiqueta' })
    this.filtroAtivo = null
    barra.append(this.btDividir, this.btApagar, this.btMarcar, this.btSom, this.paleta, el('span', 'espaco'), this.filtro, this.info, this.zoom)
    this.btDividir.onclick = () => this.aoAcao('dividir')
    this.btApagar.onclick = () => (this.selFx ? this.aoAcao('tirarEfeito', this.selFx) : this.sel && this.aoAcao('remover', this.sel))
    this.btMarcar.onclick = () => this.aoAcao('marcar')
    this.btSom.onclick = () => this.aoAcao('som')
    this.zoom.oninput = () => this.#aproximar(this.#escalaDoDeslize(Number(this.zoom.value)), this.rolagem.clientWidth / 2)

    this.rolagem = el('div', 'linha-rolagem')
    this.conteudo = el('div', 'linha-conteudo')
    this.regua = el('canvas', 'regua')
    this.onda = el('canvas', 'onda')
    this.trilhaV = el('div', 'trilha trilha-v')
    this.trilhaFx = el('div', 'trilha trilha-fx', { role: 'group', ariaLabel: 'Efeitos sonoros' })
    this.trilhaL = el('div', 'trilha trilha-l')
    this.trilhaZ = el('div', 'trilha trilha-z')
    this.cabeca = el('div', 'cabeca')
    this.marcas = el('div', 'trilha-marcas')
    const fundoA = el('div', 'trilha trilha-a')
    this.conteudo.append(this.regua, this.trilhaV, fundoA, this.onda, this.trilhaFx, this.trilhaL, this.trilhaZ, this.marcas, this.cabeca)
    this.rolagem.append(this.conteudo)
    raiz.append(barra, this.rolagem)

    this.rolagem.addEventListener('scroll', () => this.#desenharCanvases(), { passive: true })
    new ResizeObserver(() => {
      if (!this.ajustada && this.dados) this.#ajustar()
      this.#layout()
    }).observe(this.rolagem)
    this.rolagem.addEventListener(
      'wheel',
      (e) => {
        if (!(e.ctrlKey || e.metaKey)) return
        e.preventDefault()
        const x = e.clientX - this.rolagem.getBoundingClientRect().left
        this.#aproximar(this.escala * Math.exp(-e.deltaY * 0.01), x)
      },
      { passive: false },
    )
    this.marcas.addEventListener('dblclick', (e) => {
      const m = e.target.closest('.marcador')
      if (m) this.aoAcao('desmarcar', m.dataset.id)
    })
    // clicar na régua ou num espaço vazio: vai até ali
    this.conteudo.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.clipe, .efeito')) return
      const buscar = (ev) => {
        const t = Math.max(0, this.#xParaT(ev.clientX))
        this.aoBuscar(ev.altKey ? t : this.#imantar(t, false))
      }
      buscar(e)
      const mover = (ev) => buscar(ev)
      const soltar = () => {
        removeEventListener('pointermove', mover)
        removeEventListener('pointerup', soltar)
      }
      addEventListener('pointermove', mover)
      addEventListener('pointerup', soltar)
    })
  }

  /** pontos do ímã, em segundos da linha: bordas dos clipes, marcadores e (se pedir) o ponto */
  #pontos(comPonto) {
    if (!this.dados) return []
    const { p } = this.dados
    const ts = [0]
    for (const { clipe, inicio } of posicoes(p.linha)) ts.push(paraSegundos(inicio + tamanho(clipe), p.fps))
    for (const m of p.marcadores || []) ts.push(paraSegundos(m.q, p.fps))
    if (comPonto) ts.push(this.t)
    return ts
  }
  #imantar(t, comPonto) {
    let melhor = t
    let dist = IMA_PX / this.escala
    for (const x of this.#pontos(comPonto)) {
      if (Math.abs(x - t) < dist) {
        dist = Math.abs(x - t)
        melhor = x
      }
    }
    return melhor
  }

  #escalaDoDeslize(v) {
    return MIN_ESCALA * (MAX_ESCALA / MIN_ESCALA) ** (v / 1000)
  }
  #deslizeDaEscala(e) {
    return Math.round((Math.log(e / MIN_ESCALA) / Math.log(MAX_ESCALA / MIN_ESCALA)) * 1000)
  }

  #xParaT(clientX) {
    const r = this.conteudo.getBoundingClientRect()
    return (clientX - r.left) / this.escala
  }

  /** zoom em volta do ponto x (px dentro da área visível), mantendo o mesmo instante embaixo do ponteiro */
  #aproximar(nova, x) {
    const e = Math.max(MIN_ESCALA, Math.min(MAX_ESCALA, nova))
    const t = (this.rolagem.scrollLeft + x) / this.escala
    this.escala = e
    this.ajustada = true
    this.zoom.value = String(this.#deslizeDaEscala(e))
    this.#layout(false)
    this.rolagem.scrollLeft = t * e - x
    this.#desenharCanvases()
  }

  #ajustar() {
    const d = this.duracao
    if (!d || !this.rolagem.clientWidth) return
    this.escala = Math.max(MIN_ESCALA, Math.min(MAX_ESCALA, (this.rolagem.clientWidth - 24) / d))
    this.zoom.value = String(this.#deslizeDaEscala(this.escala))
    this.ajustada = true
  }

  get duracao() {
    return this.dados ? paraSegundos(this.dados.p.linha.clipes.reduce((s, c) => s + tamanho(c), 0), this.dados.p.fps) : 0
  }

  /** p = projeto; dbs = Map(midia → envelope); blocos da legenda (tempo da linha); zooms (com qIni/qFim de origem) */
  mostrar(p, { dbs, blocos, zooms }) {
    const primeira = !this.dados
    this.dados = { p, dbs, blocos, zooms }
    if (this.sel && !p.linha.clipes.some((c) => c.id === this.sel)) this.selecionar(null)
    if (this.selFx && !(p.efeitos || []).some((x) => x.id === this.selFx)) this.selecionarEfeito(null)
    if (primeira) this.ajustada = false
    if (!this.ajustada) this.#ajustar()
    this.#layout(!primeira)
    this.info.textContent = `${p.linha.clipes.length} ${p.linha.clipes.length === 1 ? 'clipe' : 'clipes'} · ${relogio(this.duracao)}`
  }

  #clipeSel() {
    return this.dados?.p.linha.clipes.find((c) => c.id === this.sel) || null
  }

  #mostrarPaleta() {
    const c = this.#clipeSel()
    this.paleta.hidden = !c
    if (!c) return
    for (const b of this.paleta.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.cor || '') === (c.cor || '')))
    if (document.activeElement !== this.campoEtiqueta) this.campoEtiqueta.value = c.etiqueta || ''
  }

  #mostrarFiltro() {
    const es = etiquetasDa(this.dados.p.linha)
    if (this.filtroAtivo && !es.some((e) => e.etiqueta === this.filtroAtivo)) this.filtroAtivo = null
    this.filtro.replaceChildren(
      ...es.map((e) => {
        const b = el('button', '', { textContent: `${e.etiqueta} ${e.n}`, title: `Destacar os clipes "${e.etiqueta}"` })
        if (e.cor) b.dataset.cor = e.cor
        b.setAttribute('aria-pressed', String(e.etiqueta === this.filtroAtivo))
        b.onclick = () => {
          this.filtroAtivo = this.filtroAtivo === e.etiqueta ? null : e.etiqueta
          this.#layout(false)
        }
        return b
      }),
    )
  }

  selecionar(id) {
    this.sel = id
    if (id) this.selFx = null
    this.btApagar.disabled = !id && !this.selFx
    this.#mostrarPaleta()
    for (const c of this.trilhaV.children) c.classList.toggle('selecionado', c.dataset.id === id)
    for (const c of this.trilhaFx.children) c.classList.toggle('selecionado', c.dataset.id === this.selFx)
    this.aoSelecionar?.(id)
  }

  /** Efeito selecionado (o clipe sai da seleção: um ou outro). */
  selecionarEfeito(id) {
    this.selFx = id
    if (id) this.sel = null
    this.btApagar.disabled = !id && !this.sel
    this.btApagar.title = id ? 'Tirar o efeito (⌫)' : 'Apagar o clipe (⌫)'
    this.#mostrarPaleta()
    for (const c of this.trilhaV.children) c.classList.toggle('selecionado', c.dataset.id === this.sel)
    for (const c of this.trilhaFx.children) c.classList.toggle('selecionado', c.dataset.id === id)
    this.aoSelecionar?.(this.sel)
  }

  /** desenha clipes e marcas; animar = as mudanças de posição deslizam (mola) */
  #layout(animar = true) {
    if (!this.dados) return
    const { p, blocos, zooms } = this.dados
    const e = this.escala
    this.conteudo.style.width = `${Math.max(this.rolagem.clientWidth, this.duracao * e + 160)}px`
    const ps = posicoes(p.linha)
    const existentes = new Map([...this.trilhaV.children].map((c) => [c.dataset.id, c]))
    const nomes = new Map(p.midias.map((m) => [m.id, m.nome]))
    this.trilhaV.classList.toggle('sem-mola', !animar || reduzir())
    for (const { clipe, inicio } of ps) {
      let d = existentes.get(clipe.id)
      if (!d) {
        d = el('div', 'clipe')
        d.dataset.id = clipe.id
        d.append(el('span', 'clipe-nome', { innerHTML: '<span class="clipe-etiqueta"></span><span class="clipe-arquivo"></span>' }), el('i', 'borda borda-ini'), el('i', 'borda borda-fim'))
        this.#arrastavel(d)
        this.trilhaV.append(d)
        if (animar && !reduzir()) d.animate([{ opacity: 0, transform: 'scaleY(0.6)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' })
      }
      existentes.delete(clipe.id)
      d.style.left = `${paraSegundos(inicio, p.fps) * e}px`
      d.style.width = `${Math.max(2, paraSegundos(tamanho(clipe), p.fps) * e)}px`
      const et = d.querySelector('.clipe-etiqueta')
      et.textContent = clipe.etiqueta || ''
      et.hidden = !clipe.etiqueta
      d.querySelector('.clipe-arquivo').textContent = nomes.get(clipe.midia) || ''
      const cor = corDoClipe(p, clipe)
      if (cor) d.dataset.cor = cor
      else delete d.dataset.cor
      d.classList.toggle('selecionado', clipe.id === this.sel)
      d.classList.toggle('no-filtro', Boolean(this.filtroAtivo) && clipe.etiqueta === this.filtroAtivo)
      d.title = `${clipe.etiqueta ? `${clipe.etiqueta} · ` : ''}${nomes.get(clipe.midia)} · ${relogio(paraSegundos(clipe.ini, p.fps))}–${relogio(paraSegundos(clipe.fim, p.fps))}`
    }
    for (const d of existentes.values()) d.remove()
    this.conteudo.classList.toggle('filtrando', Boolean(this.filtroAtivo))
    this.#mostrarFiltro()
    this.#mostrarPaleta()
    // efeitos sonoros: cada um onde começa e com a duração do som (até o fim do vídeo)
    this.trilhaFx.replaceChildren(
      ...efeitosNaLinha(p).map(({ efeito, som, inicio, quadros }) => {
        const d = el('div', 'efeito', { textContent: som.nome.replace(/\.[^.]+$/, '') })
        d.dataset.id = efeito.id
        d.style.left = `${paraSegundos(inicio, p.fps) * e}px`
        d.style.width = `${Math.max(6, paraSegundos(quadros, p.fps) * e - 1)}px`
        d.title = `${som.nome} · ${relogio(paraSegundos(inicio, p.fps))}${efeito.volume ? ` · ${efeito.volume > 0 ? '+' : ''}${String(efeito.volume).replace('.', ',')} dB` : ''}`
        d.classList.toggle('selecionado', efeito.id === this.selFx)
        this.#efeitoArrastavel(d)
        return d
      }),
    )
    const corMidia = new Map(p.midias.map((m) => [m.id, m.cor]))
    // legenda e zoom: blocos simples (posição em tempo da linha)
    this.trilhaL.replaceChildren(
      ...blocos.map((b) => {
        const d = el('div', 'bloco-legenda', { textContent: b.palavras.map((w) => w.texto).join(' ') })
        const cor = corMidia.get(b.palavras[0]?.midia)
        if (cor) d.dataset.cor = cor
        d.style.left = `${b.ini * e}px`
        d.style.width = `${Math.max(2, (b.fim - b.ini) * e - 1)}px`
        return d
      }),
    )
    const marcas = []
    for (const { clipe, inicio } of ps)
      for (const z of zooms) {
        if (z.midia !== clipe.midia) continue
        const a = Math.max(z.qIni, clipe.ini)
        const b = Math.min(z.qFim, clipe.fim)
        if (b <= a) continue
        const d = el('div', 'bloco-zoom', { title: `Zoom ${Math.round(z.escala * 100)}%` })
        d.style.left = `${paraSegundos(inicio + a - clipe.ini, p.fps) * e}px`
        d.style.width = `${Math.max(2, paraSegundos(b - a, p.fps) * e)}px`
        marcas.push(d)
      }
    this.trilhaZ.replaceChildren(...marcas)
    this.marcas.replaceChildren(
      ...(p.marcadores || []).map((m) => {
        const d = el('button', 'marcador', { title: `${m.nome || 'Marcador'} · ${relogio(paraSegundos(m.q, p.fps))} (dois cliques apagam)`, ariaLabel: m.nome || 'Marcador' })
        d.dataset.id = m.id
        d.style.left = `${paraSegundos(m.q, p.fps) * e}px`
        return d
      }),
    )
    this.tempo(this.t)
    this.#desenharCanvases()
  }

  tempo(t) {
    this.t = t
    const x = t * this.escala
    this.cabeca.style.transform = `translateX(${x}px)`
    // seguindo o ponto ao tocar: rola quando ele sai da área visível
    const r = this.rolagem
    if (x < r.scrollLeft || x > r.scrollLeft + r.clientWidth - 40) r.scrollLeft = Math.max(0, x - r.clientWidth * 0.2)
  }

  #desenharCanvases() {
    if (!this.dados) return
    const { p, dbs } = this.dados
    const w = this.rolagem.clientWidth
    const dpr = Math.min(2, devicePixelRatio || 1)
    const x0 = this.rolagem.scrollLeft
    const cor = getComputedStyle(this.raiz)
    const texto = cor.getPropertyValue('--text-faint').trim() || '#888'
    const onda = cor.getPropertyValue('--produto').trim() || '#d4d5db'
    for (const c of [this.regua, this.onda]) {
      c.style.left = `${x0}px`
      c.width = Math.round(w * dpr)
      c.height = Math.round(c.clientHeight * dpr)
    }
    // régua: marca a cada 1, 5, 10, 30 s… conforme o zoom
    const g = this.regua.getContext('2d')
    g.scale(dpr, dpr)
    g.fillStyle = texto
    g.strokeStyle = texto
    g.font = '11px ui-monospace, "SF Mono", Menlo, monospace'
    const passo = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => s * this.escala >= 70) || 1200
    for (let t = Math.floor(x0 / this.escala / passo) * passo; t * this.escala < x0 + w; t += passo) {
      const x = t * this.escala - x0
      g.globalAlpha = 0.5
      g.fillRect(Math.round(x), 14, 1, 8)
      g.globalAlpha = 0.9
      g.fillText(relogio(t), x + 4, 12)
    }
    // forma de onda de cada clipe, a partir do envelope de energia da mídia
    const o = this.onda.getContext('2d')
    o.scale(dpr, dpr)
    o.fillStyle = onda
    o.globalAlpha = 0.7
    const h = this.onda.clientHeight
    for (const { clipe, inicio } of posicoes(p.linha)) {
      const db = dbs.get(clipe.midia)
      if (!db) continue
      const a = paraSegundos(inicio, p.fps) * this.escala - x0
      const b = a + paraSegundos(tamanho(clipe), p.fps) * this.escala
      if (b < 0 || a > w) continue
      const fonte0 = paraSegundos(clipe.ini, p.fps)
      for (let x = Math.max(0, Math.floor(a)); x < Math.min(w, b); x++) {
        const t0 = fonte0 + (x - a) / this.escala
        const j0 = Math.floor(t0 / JANELA_S)
        const j1 = Math.max(j0 + 1, Math.floor((t0 + 1 / this.escala) / JANELA_S))
        let m = -100
        for (let j = j0; j < j1 && j < db.length; j++) if (db[j] > m) m = db[j]
        const v = Math.max(0, Math.min(1, (m + 60) / 60))
        const alt = Math.max(1, v * (h - 6))
        o.fillRect(x, (h - alt) / 2, 1, alt)
      }
    }
  }

  /** arrastar o efeito: anda sozinho, com ímã; soltar prende na imagem que estiver embaixo. Clique só seleciona. */
  #efeitoArrastavel(d) {
    d.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const x0 = e.clientX
      const esquerda0 = d.offsetLeft
      let movendo = false
      let t = esquerda0 / this.escala
      d.setPointerCapture(e.pointerId)
      const mover = (ev) => {
        const dx = ev.clientX - x0
        if (!movendo && Math.abs(dx) < 4) return
        movendo = true
        d.classList.add('arrastando')
        t = Math.max(0, Math.min(this.duracao, (esquerda0 + dx) / this.escala))
        if (!ev.altKey) t = this.#imantar(t, true)
        d.style.left = `${t * this.escala}px`
      }
      const soltar = () => {
        d.removeEventListener('pointermove', mover)
        d.removeEventListener('pointerup', soltar)
        d.removeEventListener('pointercancel', soltar)
        d.classList.remove('arrastando')
        if (!movendo) return this.selecionarEfeito(d.dataset.id)
        this.selecionarEfeito(d.dataset.id)
        this.aoAcao('moverEfeito', d.dataset.id, t)
      }
      d.addEventListener('pointermove', mover)
      d.addEventListener('pointerup', soltar)
      d.addEventListener('pointercancel', soltar)
    })
  }

  /** arrastar o clipe (mover) e as bordas (aparar), com os outros abrindo espaço */
  #arrastavel(d) {
    d.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      const id = d.dataset.id
      const borda = e.target.closest('.borda')
      const x0 = e.clientX
      const { p } = this.dados
      const fps = p.fps.n / p.fps.d
      const clipes = p.linha.clipes
      const i0 = clipes.findIndex((c) => c.id === id)
      const midia = p.midias.find((m) => m.id === clipes[i0].midia)
      let movendo = false
      let alvo = i0
      let delta = 0
      d.setPointerCapture(e.pointerId)
      const largura0 = d.offsetWidth
      const esquerda0 = d.offsetLeft
      const mover = (ev) => {
        const dx = ev.clientX - x0
        if (!movendo && Math.abs(dx) < 4) return
        movendo = true
        if (borda) {
          // aparar: a mudança em quadros, limitada pela mídia e por 1 quadro de clipe
          const c = clipes[i0]
          const q = Math.round((dx / this.escala) * fps)
          const ini = borda.classList.contains('borda-ini')
          const limitar = (v) => (ini ? Math.max(-c.ini, Math.min(c.fim - c.ini - 1, v)) : Math.max(-(c.fim - c.ini - 1), Math.min(midia.quadros - c.fim, v)))
          delta = limitar(q)
          // ímã: a borda que anda na tela é a do fim do clipe (aparar empurra os seguintes)
          if (!ev.altKey) {
            const fim = (esquerda0 + largura0) / this.escala + ((ini ? -delta : delta) / fps)
            const alvoT = this.#imantar(fim, true)
            if (alvoT !== fim) delta = limitar(delta + Math.round((alvoT - fim) * fps) * (ini ? -1 : 1))
          }
          const px = (delta / fps) * this.escala
          if (borda.classList.contains('borda-ini')) d.style.width = `${largura0 - px}px`
          else d.style.width = `${largura0 + px}px`
          d.classList.add('aparando')
          return
        }
        d.classList.add('arrastando')
        d.style.left = `${esquerda0 + dx}px`
        // posição nova: quantos clipes (sem este) têm o meio antes do centro do arrastado
        const centro = esquerda0 + dx + largura0 / 2
        const outros = [...this.trilhaV.children].filter((x) => x !== d)
        alvo = outros.filter((x) => x.offsetLeft + x.offsetWidth / 2 < centro).length
        let acc = 0
        let k = 0
        for (const x of outros) {
          if (k === alvo) acc += largura0
          x.style.left = `${acc}px`
          acc += x.offsetWidth
          k++
        }
      }
      const soltar = () => {
        d.removeEventListener('pointermove', mover)
        d.removeEventListener('pointerup', soltar)
        d.removeEventListener('pointercancel', soltar)
        d.classList.remove('arrastando', 'aparando')
        if (!movendo) {
          this.selecionar(id)
          return
        }
        if (borda) {
          if (delta) this.aoAcao('aparar', id, borda.classList.contains('borda-ini') ? 'ini' : 'fim', delta)
          else this.#layout()
        } else if (alvo !== i0) this.aoAcao('mover', id, alvo)
        else this.#layout()
      }
      d.addEventListener('pointermove', mover)
      d.addEventListener('pointerup', soltar)
      d.addEventListener('pointercancel', soltar)
    })
  }
}
