// Entrega em peças: "Inteiro" ou "Em peças". Em peças, cada seção (de um marcador ao próximo) vira um arquivo à parte, em
// cada formato escolhido, com o nome do modelo e a margem pedida; e "Juntar em outra ordem" monta um projeto novo com
// as seções na ordem que a pessoa arrastar (o original fica intacto). As contas ficam em src/pecas.js; aqui só tela.
// A exportação em si (render de cada peça) fica no editor.js, junto do vídeo inteiro.

import { FORMATOS_PECA, juntarSecoes, MODELO_PADRAO, nomeDaPeca } from '../src/pecas.js'
import { secoes } from '../src/marcadores.js'
import { paraQuadros, paraSegundos, relogio } from '../src/tempo.js'

const el = (tag, cls, props = {}) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, props)
const guardado = (k, padrao) => {
  try {
    return localStorage.getItem(k) ?? padrao
  } catch {
    return padrao
  }
}
const guardar = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {}
}

export class PainelPecas {
  /** o: { projeto() → projeto atual, aviso(texto), criarProjeto(projeto novo) } */
  constructor(o) {
    this.o = o
    this.modo = 'inteiro'
    this.fora = new Set() // seções desmarcadas (ids de marcador)
    this.formatos = new Set(guardado('aeon.pecas.formatos', 'original').split(',').filter((f) => FORMATOS_PECA.some((x) => x.id === f)))
    if (!this.formatos.size) this.formatos.add('original')
    this.modo$ = document.getElementById('modoEntrega')
    this.caixa = document.getElementById('pecas')
    this.lista = document.getElementById('pecasLista')
    this.modelo = document.getElementById('pecasModelo')
    this.margem = document.getElementById('pecasMargem')
    this.modelo.value = guardado('aeon.pecas.modelo', MODELO_PADRAO)
    this.margem.value = guardado('aeon.pecas.margem', '0')
    this.modo$.onclick = (e) => {
      const b = e.target.closest('[data-modo]')
      if (b) this.mudarModo(b.dataset.modo)
    }
    document.getElementById('pecasFormatos').onclick = (e) => {
      const b = e.target.closest('[data-formato]')
      if (!b) return
      const f = b.dataset.formato
      if (this.formatos.has(f) && this.formatos.size > 1) this.formatos.delete(f)
      else this.formatos.add(f)
      guardar('aeon.pecas.formatos', [...this.formatos].join(','))
      this.desenhar()
    }
    this.lista.onchange = (e) => {
      const c = e.target.closest('input[type=checkbox]')
      if (!c) return
      if (c.checked) this.fora.delete(c.value)
      else this.fora.add(c.value)
      this.desenhar()
    }
    this.modelo.oninput = () => {
      guardar('aeon.pecas.modelo', this.modelo.value)
      this.desenhar()
    }
    this.margem.onchange = () => guardar('aeon.pecas.margem', this.margem.value)
    document.getElementById('pecasJuntar').onclick = () => this.juntar()
  }

  get ativo() {
    return this.modo === 'pecas'
  }

  mudarModo(modo) {
    this.modo = modo === 'pecas' ? 'pecas' : 'inteiro'
    for (const b of this.modo$.querySelectorAll('[data-modo]')) b.setAttribute('aria-checked', String(b.dataset.modo === this.modo))
    this.desenhar()
  }

  /** O que a exportação em peças precisa: { ids, formatos, modelo, margem (quadros) }. */
  opcoes() {
    const p = this.o.projeto()
    const ids = secoes(p)
      .map((s) => s.marcador.id)
      .filter((id) => !this.fora.has(id))
    return { ids, formatos: FORMATOS_PECA.map((f) => f.id).filter((f) => this.formatos.has(f)), modelo: this.modelo.value.trim() || MODELO_PADRAO, margem: paraQuadros(Number(this.margem.value) || 0, p.fps) }
  }

  desenhar() {
    const p = this.o.projeto()
    const ss = p ? secoes(p) : []
    // sem marcador não há peça: o seletor some e a entrega é o vídeo inteiro
    this.modo$.hidden = !ss.length
    if (!ss.length && this.modo === 'pecas') this.mudarModo('inteiro')
    this.caixa.hidden = this.modo !== 'pecas'
    if (this.modo !== 'pecas' || !p) return
    // formatos: o "original" diz a proporção do projeto; a mesma proporção repetida não aparece
    const fs = FORMATOS_PECA.filter((f) => f.id === 'original' || Math.abs(f.largura / f.altura - p.largura / p.altura) > 0.01)
    for (const f of [...this.formatos]) if (!fs.some((x) => x.id === f)) this.formatos.delete(f)
    if (!this.formatos.size) this.formatos.add('original')
    const proporcao = (l, a) => {
      const m = (x, y) => (y ? m(y, x % y) : x)
      const g = m(l, a)
      return `${l / g}:${a / g}`
    }
    document.getElementById('pecasFormatos').replaceChildren(
      ...fs.map((f) => {
        const b = el('button', 'pecas-formato', { type: 'button', title: f.dica })
        b.dataset.formato = f.id
        b.setAttribute('aria-pressed', String(this.formatos.has(f.id)))
        const l = f.largura || p.largura
        const a = f.altura || p.altura
        const i = el('i')
        i.style.setProperty('--ar', `${l}/${a}`)
        b.append(i, el('span', '', { textContent: f.id === 'original' ? `Original ${proporcao(l, a)}` : f.nome }))
        return b
      }),
    )
    const modelo = this.modelo.value.trim() || MODELO_PADRAO
    const primeiro = [...this.formatos][0]
    this.lista.replaceChildren(
      ...ss.map((s) => {
        const li = el('li', 'peca')
        const rotulo = el('label', 'peca-rotulo')
        const c = el('input', '', { type: 'checkbox', value: s.marcador.id, checked: !this.fora.has(s.marcador.id) })
        const cor = el('span', 'mk-cor')
        if (s.marcador.cor) cor.style.setProperty('--c', `var(--cor-${s.marcador.cor})`)
        else cor.classList.add('mk-cor--sem')
        const seg = paraSegundos(s.quadros, p.fps)
        const nome = nomeDaPeca(modelo, { n: s.n, nome: s.marcador.nome, projeto: p.nome, formato: primeiro, segundos: seg })
        rotulo.append(c, cor, el('span', 'peca-nome', { textContent: s.marcador.nome || `Parte ${s.n}`, title: `${nome}.mp4` }), el('span', 'peca-dur apoio', { textContent: relogio(seg) }))
        li.append(rotulo)
        return li
      }),
    )
    const n = ss.length - [...this.fora].filter((id) => ss.some((s) => s.marcador.id === id)).length
    const total = n * this.formatos.size
    const exemplo = ss.find((s) => !this.fora.has(s.marcador.id))
    const nomeEx = exemplo ? nomeDaPeca(modelo, { n: exemplo.n, nome: exemplo.marcador.nome, projeto: p.nome, formato: primeiro, segundos: paraSegundos(exemplo.quadros, p.fps) }) : ''
    document.getElementById('pecasResumo').textContent = total ? `${total} ${total === 1 ? 'peça' : 'peças'} · ${nomeEx}.mp4` : 'Escolha pelo menos uma seção.'
  }

  /** Folha "Juntar em outra ordem": arrastar (ou ↑↓) as seções e criar um projeto novo com elas. */
  juntar() {
    const p = this.o.projeto()
    let ordem = secoes(p).filter((s) => !this.fora.has(s.marcador.id))
    if (ordem.length < 2) return this.o.aviso('Escolha pelo menos duas seções para juntar.')
    const f = el('dialog', 'folha pecas-juntar')
    f.innerHTML = `<h2 class="titulo-p">Juntar em outra ordem</h2><p class="apoio">Arraste para mudar a ordem. O projeto de agora fica como está.</p><ol class="pecas-ordem" aria-label="Ordem das seções"></ol><label class="campo"><span>Nome do projeto novo</span><input type="text" maxlength="80" /></label><div class="acoes"><button type="button" class="glass-btn" value="cancelar">Cancelar</button><button type="button" class="glass-btn glass-btn--ink" value="criar">Criar projeto</button></div>`
    f.querySelector('input').value = `${p.nome} · nova ordem`
    const ol = f.querySelector('ol')
    const desenhar = () =>
      ol.replaceChildren(
        ...ordem.map((s, i) => {
          const li = el('li', 'pecas-ordem-item', { draggable: true })
          li.dataset.i = String(i)
          const sobe = el('button', 'icone-btn', { type: 'button', title: 'Subir', ariaLabel: `Subir ${s.marcador.nome}`, innerHTML: '<svg><use href="#i-voltar"/></svg>', disabled: i === 0 })
          const desce = el('button', 'icone-btn', { type: 'button', title: 'Descer', ariaLabel: `Descer ${s.marcador.nome}`, innerHTML: '<svg><use href="#i-avancar"/></svg>', disabled: i === ordem.length - 1 })
          sobe.onclick = () => trocar(i, i - 1)
          desce.onclick = () => trocar(i, i + 1)
          li.append(el('span', 'pecas-ordem-n', { textContent: String(i + 1) }), el('span', 'peca-nome', { textContent: s.marcador.nome || `Parte ${s.n}` }), el('span', 'peca-dur apoio', { textContent: relogio(paraSegundos(s.quadros, p.fps)) }), sobe, desce)
          return li
        }),
      )
    const trocar = (i, j) => {
      if (j < 0 || j >= ordem.length) return
      const o = ordem.slice()
      const [x] = o.splice(i, 1)
      o.splice(j, 0, x)
      ordem = o
      desenhar()
      ol.children[j]?.querySelector('button:not(:disabled)')?.focus()
    }
    let arrastando = null
    ol.addEventListener('dragstart', (e) => {
      arrastando = Number(e.target.closest('[data-i]')?.dataset.i)
      e.dataTransfer.effectAllowed = 'move'
    })
    ol.addEventListener('dragover', (e) => e.preventDefault())
    ol.addEventListener('drop', (e) => {
      e.preventDefault()
      const alvo = e.target.closest('[data-i]')
      if (alvo && Number.isInteger(arrastando)) trocar(arrastando, Number(alvo.dataset.i))
      arrastando = null
    })
    desenhar()
    f.addEventListener('close', () => f.remove())
    f.querySelector('[value="cancelar"]').onclick = () => f.close()
    f.querySelector('[value="criar"]').onclick = () => {
      const j = juntarSecoes(p, ordem.map((s) => s.marcador.id))
      const nome = f.querySelector('input').value.trim() || `${p.nome} · nova ordem`
      f.close()
      this.o.criarProjeto({ ...p, nome, linha: j.linha, marcadores: j.marcadores })
    }
    document.body.append(f)
    f.showModal()
  }
}
