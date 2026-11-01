// Aba Marcadores do painel da Edição: a lista que o editor de vídeo devia ter. Cada marcador com tempo, nome, nota e
// cor; buscar e filtrar por cor; teclado inteiro (↑↓ anda e leva o vídeo junto, Enter renomeia, 1–8 pinta, ⌫ apaga);
// a seleção pinta, anda no tempo, tira o trecho da linha ou apaga. Embaixo, o que os marcadores fazem: colar notas com
// tempo (revisão do cliente, capítulos, SRT, planilha), marcar os clipes, capítulos do YouTube conferidos, quadros nos
// marcadores e CSV. As contas ficam em src/marcadores.js; aqui só tela. Tudo passa pelo desfazer do editor (fazer).

import { CORES } from '../src/cores.js'
import { capitulosYoutube, conferir, deslocarMarcadores, editarMarcadores, importar, lerEntrada, marcarClipes, paraCsv, removerMarcadores, secoes, tirarSecoes } from '../src/marcadores.js'
import { paraQuadros, paraSegundos, relogio } from '../src/tempo.js'

const el = (tag, cls, props = {}) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, props)
const icone = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`
const semAcento = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
const duracaoCurta = (s) => (s < 60 ? `${Math.round(s)} s` : relogio(s))

export class PainelMarcadores {
  /**
   * sec: a seção da aba. o: { projeto() → projeto atual, fazer(novo, rótulo), irPara(segundos), agora() → segundos,
   * aviso(texto), quadros(ids) → exporta as imagens, baixar(nome, texto, tipo) }
   */
  constructor(sec, o) {
    this.sec = sec
    this.o = o
    this.sel = new Set()
    this.ancora = null
    this.busca = ''
    this.cores = new Set()
    this.editando = null
    this.#montar()
  }

  #montar() {
    const s = this.sec
    s.classList.add('mk')
    s.innerHTML = `
      <div class="mk-topo">
        <input type="search" class="mk-busca" placeholder="Buscar" aria-label="Buscar marcador" autocomplete="off" maxlength="60" />
        <div class="mk-filtro" role="group" aria-label="Filtrar por cor">${CORES.map((c) => `<button type="button" class="mk-ponto" data-cor="${c.id}" style="--c: var(--cor-${c.id})" aria-pressed="false" title="${c.nome}"></button>`).join('')}</div>
      </div>
      <button type="button" class="mk-conferir" hidden></button>
      <ol class="mk-lista" role="listbox" aria-label="Marcadores" aria-multiselectable="true" tabindex="0"></ol>
      <div class="mk-vazio" hidden>${icone('i-marcador')}<span class="apoio">M marca o ponto. Ou cole notas com tempo.</span></div>
      <div class="mk-sel" hidden role="toolbar" aria-label="Marcadores escolhidos">
        <div class="mk-pintar" role="group" aria-label="Cor">${CORES.map((c, i) => `<button type="button" class="mk-ponto" data-pintar="${c.id}" style="--c: var(--cor-${c.id})" title="${c.nome} (${i + 1})"></button>`).join('')}<button type="button" class="mk-ponto mk-ponto--sem" data-pintar="" title="Sem cor (0)"></button></div>
        <div class="mk-sel-acoes">
          <button type="button" class="icone-btn" data-andar="-1" title="1 s para trás (⇧: 1 quadro)" aria-label="Andar para trás">${icone('i-voltar')}</button>
          <button type="button" class="icone-btn" data-andar="1" title="1 s para a frente (⇧: 1 quadro)" aria-label="Andar para a frente">${icone('i-avancar')}</button>
          <button type="button" class="glass-btn mk-tirar" title="Tira da linha cada trecho até o próximo marcador">Tirar trecho</button>
          <button type="button" class="icone-btn" data-apagar title="Apagar (⌫)" aria-label="Apagar marcadores">${icone('i-lixo')}</button>
        </div>
      </div>
      <div class="mk-acoes" role="toolbar" aria-label="O que os marcadores fazem">
        <button type="button" class="glass-btn" data-fazer="colar" title="Notas com tempo, capítulos, SRT ou planilha">Colar notas</button>
        <button type="button" class="icone-btn" data-fazer="clipes" title="Um marcador em cada clipe (só nos etiquetados, se houver)" aria-label="Marcar os clipes">${icone('i-clipes')}</button>
        <button type="button" class="icone-btn" data-fazer="capitulos" title="Capítulos do YouTube" aria-label="Capítulos do YouTube">${icone('i-capitulos')}</button>
        <button type="button" class="icone-btn" data-fazer="quadros" title="Uma imagem em cada marcador (os escolhidos, ou todos)" aria-label="Imagens nos marcadores">${icone('i-foto')}</button>
        <button type="button" class="icone-btn" data-fazer="csv" title="Planilha (CSV)" aria-label="Baixar CSV">${icone('i-tabela')}</button>
      </div>`
    this.lista = s.querySelector('.mk-lista')
    this.barraSel = s.querySelector('.mk-sel')
    s.querySelector('.mk-busca').oninput = (e) => {
      this.busca = semAcento(e.target.value.trim())
      this.desenhar()
    }
    s.querySelector('.mk-filtro').onclick = (e) => {
      const b = e.target.closest('[data-cor]')
      if (!b) return
      if (this.cores.has(b.dataset.cor)) this.cores.delete(b.dataset.cor)
      else this.cores.add(b.dataset.cor)
      b.setAttribute('aria-pressed', String(this.cores.has(b.dataset.cor)))
      this.desenhar()
    }
    s.querySelector('.mk-pintar').onclick = (e) => {
      const b = e.target.closest('[data-pintar]')
      if (b) this.pintar(b.dataset.pintar || null)
    }
    this.barraSel.querySelectorAll('[data-andar]').forEach((b) => (b.onclick = (e) => this.andar(Number(b.dataset.andar), e.shiftKey)))
    this.barraSel.querySelector('.mk-tirar').onclick = () => this.tirar()
    this.barraSel.querySelector('[data-apagar]').onclick = () => this.apagar()
    s.querySelector('.mk-acoes').onclick = (e) => {
      const b = e.target.closest('[data-fazer]')
      if (b) this.fazer(b.dataset.fazer)
    }
    s.querySelector('.mk-conferir').onclick = () => {
      const p = this.o.projeto()
      const ids = conferir(p).flatMap((c) => c.ids)
      if (!ids.length) return
      this.sel = new Set(ids)
      this.desenhar()
    }
    this.lista.addEventListener('click', (e) => this.#clicar(e))
    this.lista.addEventListener('dblclick', (e) => {
      const li = e.target.closest('[data-id]')
      if (li) this.editar(li.dataset.id, e.target.closest('.mk-nota') ? 'nota' : 'nome')
    })
    this.lista.addEventListener('keydown', (e) => this.#tecla(e))
  }

  /** Os marcadores que a busca e o filtro de cor deixam ver, em ordem. */
  visiveis(p = this.o.projeto()) {
    return (p?.marcadores || []).filter((m) => (!this.cores.size || this.cores.has(m.cor)) && (!this.busca || semAcento(`${m.nome} ${m.nota || ''}`).includes(this.busca)))
  }

  desenhar() {
    const p = this.o.projeto()
    if (!p) return
    const todos = p.marcadores || []
    const ids = new Set(todos.map((m) => m.id))
    for (const id of [...this.sel]) if (!ids.has(id)) this.sel.delete(id)
    const dur = new Map(secoes(p).map((x) => [x.marcador.id, x.quadros]))
    const vis = this.visiveis(p)
    const atual = this.#atual(p)
    this.lista.replaceChildren(
      ...vis.map((m) => {
        const li = el('li', 'mk-item', { role: 'option' })
        li.dataset.id = m.id
        li.setAttribute('aria-selected', String(this.sel.has(m.id)))
        if (m.id === atual) li.dataset.agora = '1'
        const ponto = el('span', 'mk-cor')
        if (m.cor) ponto.style.setProperty('--c', `var(--cor-${m.cor})`)
        else ponto.classList.add('mk-cor--sem')
        const tempo = el('span', 'mk-tempo', { textContent: relogio(paraSegundos(m.q, p.fps)) })
        const texto = el('span', 'mk-texto')
        // nota que só continua o nome (nota longa colada): uma linha só, em duas linhas de altura
        const continua = m.nota && m.nome.endsWith('…') && m.nota.startsWith(m.nome.slice(0, -1))
        if (continua) texto.append(el('strong', 'mk-nome mk-nome--longo', { textContent: m.nota, title: m.nota }))
        else {
          texto.append(el('strong', 'mk-nome', { textContent: m.nome || 'Marcador' }))
          if (m.nota) texto.append(el('span', 'mk-nota apoio', { textContent: m.nota, title: m.nota }))
        }
        const d = dur.get(m.id)
        li.append(ponto, tempo, texto, el('span', 'mk-dur apoio', { textContent: d === undefined ? 'fora' : duracaoCurta(paraSegundos(d, p.fps)), title: d === undefined ? 'Depois do fim do vídeo' : 'Até o próximo marcador' }))
        return li
      }),
    )
    this.sec.querySelector('.mk-vazio').hidden = todos.length > 0
    this.lista.hidden = !todos.length
    // conferência: um aviso só, que escolhe os marcadores com problema
    const avisos = conferir(p).filter((c) => c.tipo !== 'repetido')
    const conf = this.sec.querySelector('.mk-conferir')
    conf.hidden = !avisos.length
    conf.textContent = avisos.map((c) => c.texto).join(' ')
    conf.title = 'Escolher esses marcadores'
    this.barraSel.hidden = !this.sel.size
    for (const b of this.barraSel.querySelectorAll('[data-pintar]')) {
      const cor = b.dataset.pintar || null
      b.setAttribute('aria-pressed', String(this.sel.size > 0 && todos.filter((m) => this.sel.has(m.id)).every((m) => (m.cor || null) === cor)))
    }
    if (this.editando) this.#abrirEdicao()
  }

  /** O marcador da seção que está tocando agora (destaque na lista). */
  #atual(p) {
    const q = paraQuadros(this.o.agora(), p.fps)
    let id = null
    for (const m of p.marcadores || []) if (m.q <= q) id = m.id
    return id
  }

  /** Marca a linha da seção atual sem redesenhar tudo (o tempo anda a cada quadro). */
  tempo() {
    const p = this.o.projeto()
    if (!p || this.lista.hidden) return
    const id = this.#atual(p)
    for (const li of this.lista.children) {
      if (li.dataset.id === id) li.dataset.agora = '1'
      else delete li.dataset.agora
    }
  }

  /** Escolhe um marcador (da linha do tempo ou de fora) e mostra na lista. */
  escolher(id, { ir = true } = {}) {
    this.sel = new Set([id])
    this.ancora = id
    this.desenhar()
    this.lista.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' })
    if (ir) this.#ir(id)
  }

  #ir(id) {
    const p = this.o.projeto()
    const m = p?.marcadores?.find((x) => x.id === id)
    if (m) this.o.irPara(paraSegundos(m.q, p.fps))
  }

  #clicar(e) {
    const li = e.target.closest('[data-id]')
    if (!li) return
    const id = li.dataset.id
    if (e.shiftKey && this.ancora) {
      const vis = this.visiveis().map((m) => m.id)
      const [a, b] = [vis.indexOf(this.ancora), vis.indexOf(id)].sort((x, y) => x - y)
      if (a >= 0) this.sel = new Set(vis.slice(a, b + 1))
    } else if (e.metaKey || e.ctrlKey) {
      if (this.sel.has(id)) this.sel.delete(id)
      else this.sel.add(id)
      this.ancora = id
    } else {
      this.sel = new Set([id])
      this.ancora = id
      this.#ir(id)
    }
    this.desenhar()
    this.lista.focus({ preventScroll: true })
  }

  #tecla(e) {
    if (this.editando) return
    const vis = this.visiveis().map((m) => m.id)
    if (!vis.length) return
    const k = e.key
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      const i = vis.indexOf(this.ancora)
      const j = Math.max(0, Math.min(vis.length - 1, i < 0 ? 0 : i + (k === 'ArrowDown' ? 1 : -1)))
      if (e.shiftKey && this.ancora) this.sel.add(vis[j])
      else this.sel = new Set([vis[j]])
      this.ancora = vis[j]
      this.#ir(vis[j])
      this.desenhar()
      this.lista.querySelector(`[data-id="${CSS.escape(vis[j])}"]`)?.scrollIntoView({ block: 'nearest' })
    } else if (k === 'Enter' && this.ancora) this.editar(this.ancora, e.altKey ? 'nota' : 'nome')
    else if ((k === 'Backspace' || k === 'Delete') && this.sel.size) this.apagar()
    else if (/^[0-8]$/.test(k) && this.sel.size) this.pintar(k === '0' ? null : CORES[Number(k) - 1].id)
    else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'a') {
      this.sel = new Set(vis)
      this.desenhar()
    } else if (k === 'Escape' && this.sel.size) {
      this.sel.clear()
      this.desenhar()
    } else return
    e.preventDefault()
    e.stopPropagation()
  }

  // ───────── edição na própria linha ─────────

  editar(id, campo = 'nome') {
    this.editando = { id, campo }
    this.sel = new Set([id])
    this.ancora = id
    this.desenhar()
  }

  #abrirEdicao() {
    const { id, campo } = this.editando
    const li = this.lista.querySelector(`[data-id="${CSS.escape(id)}"]`)
    const p = this.o.projeto()
    const m = p?.marcadores?.find((x) => x.id === id)
    if (!li || !m) {
      this.editando = null
      return
    }
    const texto = li.querySelector('.mk-texto')
    const campoEl = el('input', 'mk-editar', { type: 'text', value: (campo === 'nota' ? m.nota : m.nome) || '', maxLength: campo === 'nota' ? 500 : 60, placeholder: campo === 'nota' ? 'Nota' : 'Nome', ariaLabel: campo === 'nota' ? 'Nota do marcador' : 'Nome do marcador' })
    texto.replaceChildren(campoEl)
    campoEl.focus()
    campoEl.select()
    let feito = false
    const fim = (gravar) => {
      if (feito) return
      feito = true
      this.editando = null
      if (gravar) {
        const novo = editarMarcadores(this.o.projeto(), id, { [campo]: campoEl.value })
        if (novo !== this.o.projeto()) return this.o.fazer(novo, campo === 'nota' ? 'nota do marcador' : 'nome do marcador')
      }
      this.desenhar()
      this.lista.focus({ preventScroll: true })
    }
    campoEl.onkeydown = (ev) => {
      ev.stopPropagation()
      if (ev.key === 'Enter') {
        ev.preventDefault()
        fim(true)
      } else if (ev.key === 'Escape') {
        ev.preventDefault()
        fim(false)
      } else if (ev.key === 'Tab') {
        // Tab passa do nome para a nota (e volta)
        ev.preventDefault()
        const proximo = campo === 'nome' ? 'nota' : 'nome'
        feito = true
        const novo = editarMarcadores(this.o.projeto(), id, { [campo]: campoEl.value })
        this.editando = { id, campo: proximo }
        if (novo !== this.o.projeto()) this.o.fazer(novo, campo === 'nota' ? 'nota do marcador' : 'nome do marcador')
        else this.desenhar()
      }
    }
    campoEl.onblur = () => fim(true)
  }

  // ───────── seleção ─────────

  #ids() {
    const p = this.o.projeto()
    return (p?.marcadores || []).filter((m) => this.sel.has(m.id)).map((m) => m.id)
  }

  pintar(cor) {
    const ids = this.#ids()
    if (!ids.length) return
    const novo = editarMarcadores(this.o.projeto(), ids, { cor })
    if (novo !== this.o.projeto()) this.o.fazer(novo, ids.length > 1 ? `cor de ${ids.length} marcadores` : 'cor do marcador')
  }

  andar(sinal, quadro = false) {
    const ids = this.#ids()
    const p = this.o.projeto()
    if (!ids.length || !p) return
    const delta = sinal * (quadro ? 1 : Math.max(1, paraQuadros(1, p.fps)))
    const r = deslocarMarcadores(p, ids, delta)
    if (!r.movidos) return this.o.aviso('Não dá para andar: outro marcador ou a borda do vídeo está ali.')
    this.o.fazer(r.projeto, r.movidos > 1 ? `andar ${r.movidos} marcadores` : 'andar marcador')
  }

  tirar() {
    const ids = this.#ids()
    const p = this.o.projeto()
    if (!ids.length || !p) return
    const r = tirarSecoes(p, ids)
    if (!r.tirados) return this.o.aviso('Nada para tirar aqui.')
    this.sel.clear()
    this.o.fazer(r.projeto, ids.length > 1 ? `tirar ${ids.length} trechos` : 'tirar trecho')
    this.o.aviso(`${relogio(paraSegundos(r.tirados, p.fps))} a menos · ⌘Z desfaz.`)
  }

  apagar() {
    const ids = this.#ids()
    if (!ids.length) return
    this.sel.clear()
    this.o.fazer(removerMarcadores(this.o.projeto(), ids), ids.length > 1 ? `apagar ${ids.length} marcadores` : 'apagar marcador')
  }

  // ───────── o que os marcadores fazem ─────────

  fazer(o) {
    const p = this.o.projeto()
    if (!p) return
    if (o === 'colar') return this.colar()
    if (o === 'clipes') {
      const so = p.linha.clipes.some((c) => c.etiqueta)
      const r = marcarClipes(p, { soEtiquetados: so })
      if (!r.novos) return this.o.aviso('Os clipes já têm marcador.')
      this.o.fazer(r.projeto, `marcar ${r.novos} clipes`)
      return this.o.aviso(so ? `${r.novos} marcadores nos clipes etiquetados.` : `${r.novos} marcadores, um em cada clipe.`)
    }
    if (o === 'capitulos') return this.capitulos()
    if (o === 'quadros') {
      const ids = this.#ids()
      const alvo = ids.length ? ids : secoes(p).map((s) => s.marcador.id)
      if (!alvo.length) return this.o.aviso('Marque o vídeo primeiro (M).')
      return this.o.quadros(alvo)
    }
    if (o === 'csv') {
      if (!(p.marcadores || []).length) return this.o.aviso('Nenhum marcador ainda.')
      return this.o.baixar(`${p.nome || 'marcadores'} · marcadores.csv`, paraCsv(p), 'text/csv')
    }
  }

  /** Folha "Colar notas": texto ou arquivo, prévia do que entendeu e a cor dos novos. */
  colar() {
    const f = folha('Notas com tempo', 'mk-folha-colar')
    f.innerHTML += `
      <textarea class="mk-colar" rows="8" spellcheck="false" placeholder="00:12 Logo pequeno&#10;0:26 Corrigir a cor&#10;1:30 Pôr a lower third" aria-label="Notas com tempo"></textarea>
      <div class="mk-colar-linha">
        <div class="mk-pintar" role="radiogroup" aria-label="Cor dos novos">${CORES.map((c) => `<button type="button" class="mk-ponto" role="radio" data-cor="${c.id}" style="--c: var(--cor-${c.id})" aria-checked="${c.id === 'rosa'}" title="${c.nome}"></button>`).join('')}</div>
        <label class="link mk-arquivo">Abrir arquivo<input type="file" accept=".srt,.csv,.tsv,.txt,text/plain,text/csv" hidden /></label>
      </div>
      <p class="apoio mk-entendi" aria-live="polite">Revisão do cliente, capítulos, SRT ou planilha.</p>
      <div class="acoes"><button type="button" class="glass-btn" value="cancelar">Cancelar</button><button type="button" class="glass-btn glass-btn--ink" value="por" disabled>Pôr na linha</button></div>`
    const area = f.querySelector('textarea')
    const entendi = f.querySelector('.mk-entendi')
    const por = f.querySelector('[value="por"]')
    let cor = 'rosa'
    let nomeArquivo = ''
    let lido = { itens: [] }
    const ler = () => {
      const p = this.o.projeto()
      lido = lerEntrada(area.value, p.fps, nomeArquivo)
      const total = lido.itens.length
      por.disabled = !total
      const [um, varios] = { srt: ['legenda', 'legendas'], csv: ['linha da planilha', 'linhas da planilha'], notas: ['nota', 'notas'] }[lido.tipo] || ['', '']
      entendi.textContent = total ? `${total} ${total === 1 ? um : varios}.` : area.value.trim() ? 'Nenhum tempo encontrado no começo das linhas.' : 'Revisão do cliente, capítulos, SRT ou planilha.'
    }
    area.oninput = () => {
      nomeArquivo = ''
      ler()
    }
    f.querySelector('.mk-pintar').onclick = (e) => {
      const b = e.target.closest('[data-cor]')
      if (!b) return
      cor = b.dataset.cor
      for (const x of f.querySelectorAll('.mk-pintar [data-cor]')) x.setAttribute('aria-checked', String(x === b))
    }
    f.querySelector('input[type=file]').onchange = async (e) => {
      const a = e.target.files?.[0]
      if (!a) return
      nomeArquivo = a.name
      area.value = await a.text()
      ler()
    }
    f.querySelector('[value="cancelar"]').onclick = () => f.close()
    por.onclick = () => {
      const p = this.o.projeto()
      const r = importar(p, lido.itens, { cor })
      f.close()
      if (r.projeto !== p) this.o.fazer(r.projeto, `colar ${r.novos} notas`)
      const partes = [`${r.novos} ${r.novos === 1 ? 'marcador novo' : 'marcadores novos'}`]
      if (r.juntos) partes.push(`${r.juntos} somadas a marcadores que já estavam lá`)
      if (r.fora) partes.push(`${r.fora} depois do fim do vídeo ficaram de fora`)
      this.o.aviso(`${partes.join(' · ')}.`)
    }
    f.showModal()
    area.focus()
  }

  /** Folha dos capítulos do YouTube: o texto pronto para colar na descrição e o que as regras de lá recusariam. */
  capitulos() {
    const p = this.o.projeto()
    const c = capitulosYoutube(p)
    const f = folha('Capítulos do YouTube', 'mk-folha-capitulos')
    f.innerHTML += `
      <textarea class="mk-capitulos" rows="8" readonly spellcheck="false" aria-label="Capítulos"></textarea>
      <ul class="mk-problemas"></ul>
      <div class="acoes"><button type="button" class="glass-btn" value="fechar">Fechar</button><button type="button" class="glass-btn glass-btn--ink" value="copiar">Copiar</button></div>`
    f.querySelector('textarea').value = c.texto
    const lista = f.querySelector('.mk-problemas')
    lista.hidden = !c.problemas.length
    lista.replaceChildren(...c.problemas.map((t) => el('li', 'apoio', { textContent: t })))
    f.querySelector('[value="fechar"]').onclick = () => f.close()
    f.querySelector('[value="copiar"]').onclick = async () => {
      try {
        await navigator.clipboard.writeText(c.texto)
        this.o.aviso('Capítulos copiados. Cole na descrição do vídeo.')
      } catch {
        f.querySelector('textarea').select()
        this.o.aviso('Selecionado: ⌘C para copiar.')
      }
    }
    f.showModal()
  }
}

/** Uma folha (dialog) nova no fim do body, que some ao fechar. */
function folha(titulo, cls) {
  const f = el('dialog', `folha ${cls}`)
  f.innerHTML = `<h2 class="titulo-p">${titulo}</h2>`
  f.addEventListener('close', () => f.remove())
  document.body.append(f)
  return f
}
