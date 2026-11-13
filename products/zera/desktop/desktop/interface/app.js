// ZERA · as telas: Discos → Varrendo → Mapa / Limpar, a cesta e a folha de revisão.
// Fala com o app só por window.zera (preload.cjs). Nomes vindos do disco entram sempre como texto (textContent),
// nunca como HTML.
'use strict'

;(() => {
  const z = window.zera
  const $ = (id) => document.getElementById(id)
  const reduzir = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  const esperar = (ms) => new Promise((r) => setTimeout(r, reduzir() ? 0 : ms))

  /** Cria um elemento. props: class, text, on<evento>, atributos; filhos: nós ou texto. */
  function h(tag, props = {}, ...filhos) {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue
      if (k === 'class') el.className = v
      else if (k === 'text') el.textContent = v
      else if (k === 'style') Object.assign(el.style, v)
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
      else el.setAttribute(k, v === true ? '' : v)
    }
    for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) el.append(f.nodeType ? f : String(f))
    return el
  }

  const est = {
    plataforma: 'darwin',
    tema: 'claro',
    tela: null,
    aba: 'mapa',
    disco: null,
    raiz: null,
    quando: null,
    conferindo: false,
    atual: 0,
    pasta: null,
    sel: null,
    tipo: null,
    cesta: new Map(),
    sugestoes: null,
    dups: null,
    semAcesso: [],
    prog: null,
  }

  const GRUPOS = {
    'cache-edicao': { titulo: 'Caches de edição', dica: 'Premiere, DaVinci, Final Cut e Lightroom refazem sozinhos.', icone: 'filme' },
    caches: { titulo: 'Caches de apps', dica: 'Cada app recria o que precisar.', icone: 'caixa' },
    dev: { titulo: 'Dependências de código', dica: 'node_modules e DerivedData voltam no próximo build.', icone: 'codigo' },
    proxies: { titulo: 'Proxies e mídia otimizada', dica: 'Refaz a partir do original, mas leva tempo.', icone: 'camadas' },
    backups: { titulo: 'Backups de iPhone e iPad', dica: 'Confira se não é o único backup.', icone: 'celular' },
    instaladores: { titulo: 'Instaladores', dica: 'Arquivos .dmg, .pkg e .exe já usados.', icone: 'instalador' },
    downloads: { titulo: 'Downloads parados', dica: 'Sem mudança há mais de 3 meses.', icone: 'baixados' },
    esquecidos: { titulo: 'Grandes e esquecidos', dica: 'Mais de 1 GB, parados há 6 meses.', icone: 'relogio' },
    duplicados: { titulo: 'Repetidos', dica: 'Cópias idênticas, conferidas byte a byte.', icone: 'copias' },
    lixeira: { titulo: 'No Lixo', dica: 'Só volta ao disco quando você esvaziar.', icone: 'lixo' },
  }
  const SELO = { volta: 'Volta sozinho', confira: 'Confira antes', lixo: 'No Lixo' }

  // ---------- utilidades ----------

  const sep = () => (est.plataforma === 'win32' ? '\\' : '/')

  function juntar(base, rel) {
    if (!rel) return base
    return base.endsWith(sep()) ? base + rel : base + sep() + rel
  }

  /** Caminho relativo (à raiz) da pasta aberta. */
  function relAtual() {
    if (!est.pasta) return ''
    return est.pasta.trilha
      .slice(1)
      .map((t) => t.n)
      .join(sep())
  }

  function nomeDaRaiz() {
    return est.disco ? est.disco.nome : ''
  }

  let toastTimer = null
  function toast(texto) {
    const t = $('toast')
    t.textContent = texto
    t.classList.add('visivel')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.classList.remove('visivel'), 2600)
  }

  function corDoTipo(k) {
    return `var(--k${k})`
  }

  function dominante(pt) {
    let m = 5
    let b = 0
    ;(pt || []).forEach((x, i) => {
      if (x > b) {
        b = x
        m = i
      }
    })
    return m
  }

  // ---------- telas ----------

  function mostrarTela(nome) {
    est.tela = nome
    for (const t of ['inicio', 'varrendo', 'mapa', 'limpar']) $('tela-' + t).hidden = t !== nome
    const comAbas = nome === 'mapa' || nome === 'limpar'
    $('abas').hidden = !comAbas
    $('abas').dataset.aba = nome === 'limpar' ? 'limpar' : 'mapa'
    for (const b of $('abas').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.aba === nome))
    $('trilha').hidden = nome !== 'mapa'
    $('btn-revarrer').hidden = !comAbas
    atualizarFrescor()
    atualizarCesta(false)
  }

  function atualizarFrescor() {
    const f = $('frescor')
    const visivel = (est.tela === 'mapa' || est.tela === 'limpar') && (est.conferindo || (est.quando && Date.now() / 1000 - est.quando > 90))
    f.hidden = !visivel
    f.replaceChildren()
    if (!visivel) return
    if (est.conferindo) f.append(h('span', { class: 'gira' }), 'Conferindo…')
    else f.append('Visto ' + Z.fmt.relativo(est.quando))
  }
  setInterval(atualizarFrescor, 60_000)

  // ---------- 1. discos ----------

  async function telaInicio() {
    mostrarTela('inicio')
    const lista = await z.discos()
    const caixa = $('discos')
    caixa.replaceChildren()
    lista.forEach((d, i) => {
      const uso = d.total ? d.usado / d.total : 0
      const R = 46
      const volta = 2 * Math.PI * R
      const medidor = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      medidor.setAttribute('viewBox', '0 0 112 112')
      medidor.setAttribute('class', 'medidor')
      medidor.setAttribute('aria-hidden', 'true')
      medidor.innerHTML = `<circle class="trilho" cx="56" cy="56" r="${R}"/><circle class="uso" cx="56" cy="56" r="${R}" transform="rotate(-90 56 56)" stroke-dasharray="0 ${volta}"/><text x="56" y="56"></text>`
      medidor.querySelector('text').textContent = d.total ? Math.round(uso * 100) + '%' : ''
      const botao = h('span', { class: 'vidro vidro--pequeno' + (i === 0 ? ' vidro--tinta' : ''), text: d.cache ? 'Abrir' : 'Varrer' })
      const cartao = h(
        'button',
        { class: 'disco', style: { animationDelay: i * 70 + 'ms' }, onclick: () => abrirDisco(d) },
        medidor,
        h('span', { class: 'disco-nome', text: d.nome }),
        h('span', { class: 'disco-livre', text: d.total ? `${Z.fmt.bytes(d.livre)} livres de ${Z.fmt.bytes(d.total)}` : 'Pasta' }),
        h('span', { class: 'disco-visto', text: d.cache ? 'Visto ' + Z.fmt.relativo(d.cache) : '' }),
        botao,
      )
      caixa.append(cartao)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => medidor.querySelector('.uso').setAttribute('stroke-dasharray', `${uso * volta} ${volta}`)),
      )
    })
  }

  async function escolherPasta() {
    const c = await z.escolherPasta()
    if (!c) return
    const nome = c.split(/[\\/]/).filter(Boolean).pop() || c
    abrirDisco({ caminho: c, nome, total: 0, usado: 0, livre: 0, pasta: true }, { forcar: true })
  }

  async function abrirDisco(d, { forcar = false } = {}) {
    est.disco = d
    est.cesta.clear()
    est.sugestoes = null
    est.dups = null
    est.tipo = null
    if (d.cache && !forcar) {
      const r = await z.carregar(d.caminho)
      if (r.ok) {
        est.raiz = r.raiz
        est.quando = r.quando
        est.aba = 'mapa'
        mostrarTela('mapa')
        await irPara(0, 'nova')
        conferirPorTras()
        return
      }
    }
    await varrerComTela(d)
  }

  // ---------- 2. varrendo ----------

  const PROG_R = 170
  const PROG_VOLTA = 1000

  function circuloProgresso(classe) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    c.setAttribute('cx', 200)
    c.setAttribute('cy', 200)
    c.setAttribute('r', PROG_R)
    c.setAttribute('pathLength', PROG_VOLTA)
    c.setAttribute('class', classe)
    c.style.strokeDasharray = `0 ${PROG_VOLTA}`
    return c
  }

  async function varrerComTela(d) {
    mostrarTela('varrendo')
    $('varrendo-nome').textContent = d.nome
    $('progresso-bytes').textContent = Z.fmt.bytes(0)
    $('progresso-de').textContent = d.usado ? 'de ' + Z.fmt.bytes(d.usado) : ''
    $('progresso-arquivos').textContent = ''
    $('progresso-atual').textContent = ''
    const g = $('progresso-fatias')
    g.replaceChildren()
    const frente = circuloProgresso('frente')
    g.append(frente)
    est.prog = { total: d.usado || (est.raiz && d.caminho === est.disco?.caminho ? est.raiz.b : 0), soma: 0, bytes: 0, frente, ativo: true }
    const r = await z.varrer(d.caminho)
    est.prog.ativo = false
    if (!r.ok) {
      if (r.erro !== 'cancelado') toast(r.erro === 'motor_parou' ? 'O motor não abriu. Instale o ZERA de novo.' : 'Não deu para varrer esta pasta.')
      telaInicio()
      return
    }
    // fecha o anel antes de trocar de tela
    est.prog.total = Math.max(est.prog.soma, r.raiz.b)
    for (const c of g.querySelectorAll('.fatia')) {
      const f = c._f
      c.style.strokeDasharray = `${Math.max(0, (f.b / est.prog.total) * PROG_VOLTA - 2)} ${PROG_VOLTA}`
      c.style.strokeDashoffset = String(-(f.ini / est.prog.total) * PROG_VOLTA)
    }
    frente.style.strokeDasharray = `0 ${PROG_VOLTA}`
    $('progresso-bytes').textContent = Z.fmt.bytes(r.raiz.b)
    $('progresso-arquivos').textContent = Z.fmt.num(r.raiz.a) + ' arquivos em ' + (r.ms < 1000 ? r.ms + ' ms' : (r.ms / 1000).toFixed(1).replace('.', ',') + ' s')
    est.raiz = r.raiz
    est.quando = Math.floor(Date.now() / 1000)
    est.semAcesso = r.sem_acesso || []
    await esperar(700)
    est.aba = 'mapa'
    mostrarTela('mapa')
    mostrarAvisoDeAcesso()
    await irPara(0, 'nova')
  }

  function progresso(m) {
    const p = est.prog
    if (!p || !p.ativo || est.tela !== 'varrendo') return
    p.bytes = m.b
    const total = p.total > 0 ? Math.max(p.total, m.b * 1.02) : Math.max(m.b * 1.25, 1)
    $('progresso-bytes').textContent = Z.fmt.bytes(m.b)
    $('progresso-arquivos').textContent = Z.fmt.num(m.arquivos) + ' arquivos'
    if (m.atual) $('progresso-atual').textContent = m.atual
    const ini = p.soma / total
    const fim = Math.min(0.995, m.b / total)
    p.frente.style.strokeDashoffset = String(-ini * PROG_VOLTA)
    p.frente.style.strokeDasharray = `${Math.max(0, (fim - ini) * PROG_VOLTA)} ${PROG_VOLTA}`
  }

  /**
   * Uma pasta (até o 3º nível) terminou de ser varrida e vira fatia na hora. Como as de dentro terminam antes das de
   * fora, cada uma entra só com o que as de dentro ainda não mostraram. Fatia pequena demais não entra: fica para a
   * pasta de cima.
   */
  function parcial(m) {
    const p = est.prog
    if (!p || !p.ativo || est.tela !== 'varrendo') return
    p.pendentes = p.pendentes || new Map()
    let ja = 0
    for (const [k, v] of p.pendentes) {
      if (k.startsWith(m.rel + '/')) {
        ja += v
        p.pendentes.delete(k)
      }
    }
    const b = m.b - ja
    const total = p.total > 0 ? Math.max(p.total, p.bytes * 1.02, p.soma + b) : Math.max(p.bytes * 1.25, p.soma + b, 1)
    if (b <= 0 || (m.nivel > 1 && b / total < 0.004)) {
      // pequena: devolve o que tirou das de dentro, para a pasta de cima contar tudo
      if (ja) p.pendentes.set(m.rel + '/\u0000', ja)
      return
    }
    p.pendentes.set(m.rel, m.b)
    const c = circuloProgresso('fatia')
    c._f = { b, ini: p.soma }
    c.style.stroke = corDoTipo(dominante(m.pt))
    c.style.strokeDashoffset = String(-(p.soma / total) * PROG_VOLTA)
    $('progresso-fatias').insertBefore(c, p.frente)
    p.soma += b
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        c.style.strokeDasharray = `${Math.max(0, (b / total) * PROG_VOLTA - 2)} ${PROG_VOLTA}`
      }),
    )
  }

  /** Abriu pela varredura guardada: confere de verdade por trás, sem tirar a pessoa do mapa. */
  async function conferirPorTras() {
    if (!est.disco) return
    est.conferindo = true
    atualizarFrescor()
    const disco = est.disco
    const caminhoAtual = juntar(disco.caminho, relAtual())
    const r = await z.varrer(disco.caminho)
    est.conferindo = false
    if (est.disco !== disco) return
    if (r.ok) {
      est.raiz = r.raiz
      est.quando = Math.floor(Date.now() / 1000)
      est.semAcesso = r.sem_acesso || []
      est.sugestoes = null
      est.dups = null
      await reencontrarCesta()
      const a = await z.achar(caminhoAtual)
      await irPara(a.ok ? a.no : 0, false)
      if (est.tela === 'limpar') telaLimpar()
      mostrarAvisoDeAcesso()
    }
    atualizarFrescor()
  }

  // ---------- 3. mapa ----------

  const anel = new Z.Anel($('anel'), {
    aoPassar: (f) => mostrarCentro(f),
    aoClicar: (f) => {
      if (f.outros) return toast(`${Z.fmt.num(f.o)} itens pequenos · ${Z.fmt.bytes(f.b)}`)
      if (f.p) return irPara(f.id, 'dentro')
      selecionar(f.id, true)
    },
  })

  function mostrarCentro(f) {
    const no = est.pasta && est.pasta.no
    if (!no) return
    if (f) {
      $('centro-nome').textContent = f.outros ? `${Z.fmt.num(f.o)} itens pequenos` : f.n
      $('centro-bytes').textContent = Z.fmt.bytes(f.b)
      $('centro-mais').textContent = Z.fmt.pct(f.b, no.b) + ' desta pasta'
    } else {
      $('centro-nome').textContent = est.atual === 0 ? nomeDaRaiz() : no.n
      $('centro-bytes').textContent = Z.fmt.bytes(no.b)
      $('centro-mais').textContent = Z.fmt.num(no.a) + ' arquivos'
    }
  }

  async function irPara(id, animar = 'dentro') {
    const [p, a] = await Promise.all([z.abrir(id), z.anel(id, 4)])
    if (!p.ok || !a.ok) {
      if (id !== 0) return irPara(0, false)
      return
    }
    est.atual = id
    est.pasta = p.pasta
    est.sel = null
    est.tipo = null
    desenharTrilha()
    mostrarCentro(null)
    $('centro').classList.toggle('pode-voltar', id !== 0)
    desenharLista()
    await anel.desenhar(a.anel, animar)
  }

  function voltar() {
    if (!est.pasta || est.atual === 0) return
    const t = est.pasta.trilha
    irPara(t[t.length - 2].id, 'fora')
  }

  function desenharTrilha() {
    const nav = $('trilha')
    nav.replaceChildren()
    est.pasta.trilha.forEach((t, i) => {
      if (i > 0) nav.append(h('span', { class: 'sep' }, Z.icone('seta')))
      nav.append(h('button', { text: i === 0 ? nomeDaRaiz() : t.n, title: t.n, onclick: () => t.id !== est.atual && irPara(t.id, 'fora') }))
    })
    for (const s of nav.querySelectorAll('.sep svg')) {
      s.setAttribute('width', 12)
      s.setAttribute('height', 12)
    }
  }

  function desenharLista() {
    const { no, filhos, resto } = est.pasta
    $('lista-titulo').textContent = est.atual === 0 ? nomeDaRaiz() : no.n
    $('lista-sub').textContent = `${Z.fmt.bytes(no.b)} · ${Z.fmt.num(no.a)} arquivos`

    const tipos = $('tipos')
    tipos.replaceChildren()
    tipos.classList.remove('filtrando')
    ;(no.pt || [])
      .map((b, k) => ({ b, k }))
      .filter((x) => x.b > 0)
      .sort((a, b) => b.b - a.b)
      .forEach(({ b, k }) => {
        tipos.append(
          h(
            'button',
            { class: 'tipo', 'aria-pressed': 'false', onclick: (e) => filtrarTipo(k, e.currentTarget) },
            h('span', { class: 'ponto', style: { background: corDoTipo(k) } }),
            Z.TIPOS[k] + ' ',
            h('strong', { text: Z.fmt.bytes(b) }),
          ),
        )
      })

    const lista = $('lista')
    lista.replaceChildren()
    if (!filhos.length) lista.append(h('li', { class: 'item-resto', text: 'Pasta vazia.' }))
    const maior = Math.max(1, ...filhos.map((f) => f.b))
    filhos.forEach((f, i) => {
      const rel = juntar(relAtual(), f.n).replace(/^[\\/]/, '')
      const marca = h('input', {
        type: 'checkbox',
        class: 'marca',
        title: 'Pôr na cesta',
        'aria-label': 'Pôr ' + f.n + ' na cesta',
        onclick: (e) => {
          e.stopPropagation()
          alternarCesta({ id: f.id, n: f.n, b: f.b, rel }, e.currentTarget.checked)
        },
      })
      marca.checked = est.cesta.has(f.id)
      const mostrar = h('button', { class: 'icone-btn mostrar', title: 'Mostrar no ' + (est.plataforma === 'win32' ? 'Explorer' : 'Finder'), onclick: (e) => (e.stopPropagation(), z.mostrar(f.id)) }, Z.icone('lupa'))
      const li = h(
        'li',
        {
          class: 'item',
          'data-id': f.id,
          style: { animationDelay: Math.min(i, 16) * 16 + 'ms' },
          onclick: () => (f.p ? irPara(f.id, 'dentro') : selecionar(f.id, false)),
          ondblclick: () => !f.p && z.mostrar(f.id),
          onmouseenter: () => mostrarCentro(anel.destacarId(f.id) || { ...f, outros: false }),
          onmouseleave: () => {
            anel.marcar([])
            mostrarCentro(null)
          },
        },
        marca,
        h(
          'div',
          { class: 'item-nome' },
          h('span', {}, h('i', { class: 'ponto', style: { background: corDoTipo(f.k) } }), h('em', { text: f.n }), f.p ? Z.icone('seta') : null),
          h('div', { class: 'barrinha' }, h('i', { style: { width: Math.max(0.5, (f.b / maior) * 100) + '%', background: corDoTipo(f.k), animationDelay: Math.min(i, 16) * 16 + 'ms' } })),
        ),
        h('span', { class: 'item-bytes', text: Z.fmt.bytes(f.b) }),
        mostrar,
      )
      const seta = li.querySelector('.item-nome svg')
      if (seta) seta.classList.add('seta')
      lista.append(li)
    })
    if (resto.qtd) lista.append(h('li', { class: 'item-resto', text: `+ ${Z.fmt.num(resto.qtd)} itens menores · ${Z.fmt.bytes(resto.b)}` }))
  }

  function filtrarTipo(k, botao) {
    const ligar = est.tipo !== k
    est.tipo = ligar ? k : null
    for (const b of $('tipos').querySelectorAll('.tipo')) b.setAttribute('aria-pressed', 'false')
    $('tipos').classList.toggle('filtrando', ligar)
    if (ligar) botao.setAttribute('aria-pressed', 'true')
    anel.destacarTipo(est.tipo)
  }

  function selecionar(id, rolar) {
    est.sel = id
    for (const li of $('lista').querySelectorAll('.item')) li.classList.toggle('selecionado', Number(li.dataset.id) === id)
    const li = $('lista').querySelector(`.item[data-id="${id}"]`)
    if (li && rolar) {
      li.scrollIntoView({ block: 'nearest', behavior: reduzir() ? 'auto' : 'smooth' })
      li.classList.remove('pisca')
      void li.offsetWidth
      li.classList.add('pisca')
    }
  }

  function moverSelecao(passo) {
    const itens = [...$('lista').querySelectorAll('.item')]
    if (!itens.length) return
    let i = itens.findIndex((li) => Number(li.dataset.id) === est.sel)
    i = Math.max(0, Math.min(itens.length - 1, i < 0 ? 0 : i + passo))
    selecionar(Number(itens[i].dataset.id), true)
    mostrarCentro(anel.destacarId(est.sel))
  }

  function mostrarAvisoDeAcesso() {
    const n = est.semAcesso.length
    $('aviso-acesso').hidden = !n
    if (!n) return
    const mac = est.plataforma === 'darwin'
    $('aviso-acesso-texto').textContent = mac
      ? `${n === 50 ? 'Mais de 50' : n} pastas não abriram. Dê acesso total ao disco para ver tudo.`
      : `${n === 50 ? 'Mais de 50' : n} pastas sem permissão ficaram de fora.`
    $('btn-acesso').hidden = !mac
  }

  // ---------- cesta ----------

  function alternarCesta(item, ligar) {
    if (ligar) est.cesta.set(item.id, item)
    else est.cesta.delete(item.id)
    atualizarCesta(true)
  }

  function totalDaCesta() {
    // item dentro de outro da cesta não soma de novo
    const itens = [...est.cesta.values()].sort((a, b) => a.rel.length - b.rel.length)
    const fica = []
    for (const it of itens) if (!fica.some((f) => it.rel === f.rel || it.rel.startsWith(f.rel + sep()))) fica.push(it)
    return { qtd: fica.length, b: fica.reduce((s, i) => s + i.b, 0) }
  }

  function atualizarCesta(pular) {
    const c = $('cesta')
    const { qtd, b } = totalDaCesta()
    const visivel = qtd > 0 && (est.tela === 'mapa' || est.tela === 'limpar')
    const estava = !c.hidden
    c.hidden = !visivel
    if (!visivel) return
    $('cesta-total').textContent = Z.fmt.bytes(b)
    $('cesta-qtd').textContent = qtd === 1 ? 'em 1 item' : `em ${Z.fmt.num(qtd)} itens`
    if (pular && estava) {
      c.classList.remove('pulo')
      void c.offsetWidth
      c.classList.add('pulo')
    }
  }

  /** Depois de uma varredura nova os ids mudam: acha cada item da cesta pelo caminho. */
  async function reencontrarCesta() {
    const antes = [...est.cesta.values()]
    est.cesta.clear()
    for (const it of antes) {
      const r = await z.achar(juntar(est.disco.caminho, it.rel))
      if (r.ok) est.cesta.set(r.no, { ...it, id: r.no })
    }
    atualizarCesta(false)
  }

  // ---------- folha (diálogo) ----------

  const folha = $('folha')

  function abrirFolha(...conteudo) {
    $('folha-corpo').replaceChildren(...conteudo.filter(Boolean))
    if (!folha.open) folha.showModal()
  }

  async function fecharFolha() {
    if (!folha.open) return
    folha.classList.add('fechando')
    await esperar(200)
    folha.classList.remove('fechando')
    folha.close()
  }

  folha.addEventListener('cancel', (e) => {
    e.preventDefault()
    if (folha.dataset.trava !== '1') fecharFolha()
  })
  folha.addEventListener('click', (e) => {
    if (e.target === folha && folha.dataset.trava !== '1') fecharFolha()
  })

  function topoFolha(fino, forte, texto) {
    return h('div', { class: 'folha-topo' }, h('h2', {}, h('span', { class: 'fino', text: fino }), forte ? ' ' + forte : ''), texto ? h('p', { text: texto }) : null)
  }

  function espera(texto, comBarra) {
    const barra = comBarra ? h('div', { class: 'barra-progresso' }, h('i', { style: { transform: 'scaleX(0)' } })) : null
    return h('div', { class: 'espera' }, h('div', { class: 'gira' }), h('span', { text: texto }), barra)
  }

  /** Onde o item está: a pasta, relativa à raiz varrida. */
  function ondeEsta(c) {
    let rel = c || ''
    if (est.disco && rel.startsWith(est.disco.caminho)) rel = rel.slice(est.disco.caminho.length)
    const partes = rel.split(/[\\/]/).filter(Boolean)
    partes.pop()
    return partes.length ? partes.join(' › ') : nomeDaRaiz()
  }

  function linhaDeItem(it, { marca, extra, direita } = {}) {
    const onde = ondeEsta(it.c)
    return h(
      'li',
      { class: 'linha' },
      marca || h('span'),
      h('div', { class: 'linha-texto' }, h('b', { text: it.n }, extra || null), h('small', { text: onde, title: it.c || '' })),
      h('span', { class: 'linha-bytes', text: Z.fmt.bytes(it.b) }),
      direita || h('button', { class: 'icone-btn', title: 'Mostrar', onclick: () => z.mostrar(it.id) }, Z.icone('lupa')),
    )
  }

  /** Revisão da cesta: o app confere cada item e devolve a lista que pode sair. */
  async function revisarCesta() {
    if (!est.cesta.size) return
    folha.dataset.trava = '0'
    abrirFolha(espera('Conferindo…'))
    const r = await z.previa([...est.cesta.keys()])
    if (!r.ok) return fecharFolha()
    const lista = h('ul', { class: 'folha-lista' })
    for (const it of r.itens) {
      const nome = it.c.split(/[\\/]/).pop()
      const tirar = h(
        'button',
        {
          class: 'icone-btn',
          title: 'Tirar da cesta',
          onclick: () => {
            est.cesta.delete(it.id)
            atualizarCesta(false)
            sincronizarMarcas()
            est.cesta.size ? revisarCesta() : fecharFolha()
          },
        },
        Z.icone('fechar'),
      )
      lista.append(linhaDeItem({ ...it, n: nome }, { extra: it.nuvem ? h('span', { class: 'etiqueta', text: 'sai da nuvem também' }) : null, direita: tirar }))
    }
    const bloqueados = r.bloqueados.length
      ? h('p', { class: 'bloqueados', text: 'Ficam: ' + r.bloqueados.map((b) => `${b.c.split(/[\\/]/).pop() || b.c} (${b.motivo.toLowerCase()})`).join(', ') + '.' })
      : null
    const mover = h('button', { class: 'vidro vidro--tinta', disabled: !r.itens.length, onclick: () => moverParaLixo(r) }, 'Mover para o Lixo')
    abrirFolha(
      topoFolha('Tirar', Z.fmt.bytes(r.total) + '?', 'Vai tudo para o Lixo. Dá para recuperar até você esvaziar.'),
      lista,
      bloqueados,
      h('div', { class: 'folha-pe' }, h('span', { class: 'nota', text: r.itens.length === 1 ? '1 item' : Z.fmt.num(r.itens.length) + ' itens' }), h('button', { class: 'vidro', onclick: fecharFolha }, 'Voltar'), mover),
    )
    mover.focus()
  }

  async function moverParaLixo(previa) {
    folha.dataset.trava = '1'
    abrirFolha(espera('Movendo para o Lixo…'))
    const r = await z.moverParaLixo(previa.token)
    folha.dataset.trava = '0'
    if (!r.ok) {
      toast('A revisão venceu. Revise de novo.')
      return fecharFolha()
    }
    const falhou = new Set(r.falhas.map((f) => f.c))
    for (const it of previa.itens) if (!falhou.has(it.c)) est.cesta.delete(it.id)
    for (const [id, it] of est.cesta) if (previa.itens.some((p) => it.rel.startsWith(p.c.slice(est.disco.caminho.length).replace(/^[\\/]/, '') + sep()) && !falhou.has(p.c))) est.cesta.delete(id)
    est.raiz = r.raiz
    est.sugestoes = null
    est.dups = null

    const numero = h('strong', { text: Z.fmt.bytes(reduzir() ? r.liberado : 0) })
    const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    check.setAttribute('viewBox', '0 0 92 92')
    check.setAttribute('class', 'check')
    check.innerHTML = '<circle cx="46" cy="46" r="42" transform="rotate(-90 46 46)"/><path d="M28 47l12 12 24-26"/>'
    const falhas = r.falhas.length ? h('p', { text: `${r.falhas.length === 1 ? '1 item não saiu' : r.falhas.length + ' itens não saíram'} (em uso ou sem permissão).` }) : null
    abrirFolha(
      h(
        'div',
        { class: 'resultado' },
        check,
        numero,
        h('p', { text: `${r.movidos === 1 ? '1 item foi' : Z.fmt.num(r.movidos) + ' itens foram'} para o Lixo. Esvazie o Lixo para o espaço voltar ao disco.` }),
        falhas,
        h('div', { class: 'acoes' }, h('button', { class: 'vidro', onclick: () => z.abrirLixo() }, 'Abrir o Lixo'), h('button', { class: 'vidro vidro--tinta', onclick: fecharFolha }, 'Feito')),
      ),
    )
    contar(numero, r.liberado)
    atualizarCesta(false)
    const a = await z.achar(juntar(est.disco.caminho, relAtual()))
    await irPara(a.ok ? a.no : 0, false)
    if (est.tela === 'limpar') telaLimpar()
  }

  /** O número sobe até o valor (0,9 s, desacelerando). */
  function contar(el, alvo) {
    if (reduzir()) return (el.textContent = Z.fmt.bytes(alvo))
    const t0 = performance.now()
    const passo = (t) => {
      const x = Math.min(1, (t - t0) / 900)
      el.textContent = Z.fmt.bytes(alvo * (1 - Math.pow(1 - x, 3)))
      if (x < 1) requestAnimationFrame(passo)
    }
    requestAnimationFrame(passo)
  }

  function sincronizarMarcas() {
    for (const li of $('lista').querySelectorAll('.item')) {
      const m = li.querySelector('.marca')
      if (m) m.checked = est.cesta.has(Number(li.dataset.id))
    }
  }

  // ---------- 4. limpar ----------

  async function telaLimpar() {
    est.aba = 'limpar'
    mostrarTela('limpar')
    if (!est.sugestoes) {
      $('limpar-titulo').replaceChildren(h('span', { class: 'fino', text: 'Procurando…' }))
      $('limpar-apoio').textContent = ''
      $('cartoes').replaceChildren()
      const r = await z.sugestoes()
      if (!r.ok) return
      est.sugestoes = r.grupos
    }
    const grupos = est.sugestoes.filter((g) => g.qtd > 0)
    const total = grupos.filter((g) => g.seguranca !== 'lixo').reduce((s, g) => s + g.b, 0) + (est.dups ? est.dups.desperdicio : 0)
    $('limpar-titulo').replaceChildren(...(total > 0 ? [h('span', { class: 'fino', text: 'Dá para liberar' }), ' ' + Z.fmt.bytes(total)] : [h('span', { class: 'fino', text: 'Tudo' }), ' em ordem.']))
    $('limpar-apoio').textContent = total > 0 ? 'Comece pelo que volta sozinho.' : 'Nada óbvio para tirar. Procure repetidos ou explore o mapa.'

    const ordem = { volta: 0, confira: 1, lixo: 3 }
    const cartoes = grupos
      .filter((g) => g.seguranca !== 'lixo')
      .sort((a, b) => ordem[a.seguranca] - ordem[b.seguranca] || b.b - a.b)
      .map((g) => cartao(g.id, g.seguranca, Z.fmt.bytes(g.b), `${Z.fmt.num(g.qtd)} ${g.qtd === 1 ? 'item' : 'itens'}`, () => folhaGrupo(g)))
    cartoes.push(
      est.dups
        ? cartao('duplicados', 'confira', Z.fmt.bytes(est.dups.desperdicio), `${Z.fmt.num(est.dups.qtd)} ${est.dups.qtd === 1 ? 'grupo' : 'grupos'}`, folhaDuplicados)
        : cartao('duplicados', 'confira', 'Procurar', '', folhaDuplicados, true),
    )
    const lixo = grupos.find((g) => g.seguranca === 'lixo')
    if (lixo) cartoes.push(cartao('lixeira', 'lixo', Z.fmt.bytes(lixo.b), '', () => folhaGrupo(lixo)))
    cartoes.forEach((c, i) => (c.style.animationDelay = i * 50 + 'ms'))
    $('cartoes').replaceChildren(...cartoes)
  }

  function cartao(id, seguranca, valor, qtd, abrir, procurar) {
    const g = GRUPOS[id]
    return h(
      'button',
      { class: 'cartao' + (procurar ? ' cartao-procurar' : ''), onclick: abrir },
      h('span', { class: 'cartao-icone' }, Z.icone(g.icone)),
      h('h3', { text: g.titulo }),
      h('p', { text: g.dica }),
      h('span', { class: 'cartao-bytes', text: procurar ? 'Procurar repetidos →' : valor }),
      h('span', { class: 'selo selo--' + seguranca }, h('i', { class: 'ponto' }), SELO[seguranca] + (qtd ? ' · ' + qtd : '')),
    )
  }

  function folhaGrupo(g) {
    const info = GRUPOS[g.id]
    folha.dataset.trava = '0'
    const lixo = g.seguranca === 'lixo'
    const marcas = []
    const lista = h('ul', { class: 'folha-lista' })
    const nota = h('span', { class: 'nota' })
    const botao = h('button', { class: 'vidro vidro--tinta' }, 'Pôr na cesta')
    const contarSel = () => {
      const sel = marcas.filter((m) => m.el.checked)
      const b = sel.reduce((s, m) => s + m.it.b, 0)
      nota.textContent = sel.length ? `${Z.fmt.num(sel.length)} ${sel.length === 1 ? 'item' : 'itens'} · ${Z.fmt.bytes(b)}` : 'Nada marcado'
      botao.disabled = !sel.length
    }
    for (const it of g.itens) {
      const m = lixo ? null : h('input', { type: 'checkbox', class: 'marca', 'aria-label': it.n, onchange: contarSel })
      if (m) {
        m.checked = est.cesta.has(it.id) || g.seguranca === 'volta'
        marcas.push({ el: m, it })
      }
      const quando = it.m ? h('span', { class: 'etiqueta', text: Z.fmt.relativo(it.m) }) : null
      lista.append(linhaDeItem(it, { marca: m, extra: quando }))
    }
    botao.addEventListener('click', () => {
      for (const { el, it } of marcas) alternarCesta({ id: it.id, n: it.n, b: it.b, rel: it.c }, el.checked)
      sincronizarMarcas()
      const n = marcas.filter((m) => m.el.checked).length
      fecharFolha()
      if (n) toast(`${n === 1 ? '1 item' : Z.fmt.num(n) + ' itens'} na cesta`)
    })
    const mais = g.qtd > g.itens.length ? `Mostrando os ${Z.fmt.num(g.itens.length)} maiores de ${Z.fmt.num(g.qtd)}.` : info.dica
    abrirFolha(
      topoFolha(info.titulo, Z.fmt.bytes(g.b), mais),
      lista,
      lixo
        ? h('div', { class: 'folha-pe' }, h('button', { class: 'vidro', onclick: fecharFolha }, 'Fechar'), h('button', { class: 'vidro vidro--tinta', onclick: () => z.abrirLixo() }, 'Abrir o Lixo'))
        : h('div', { class: 'folha-pe' }, nota, h('button', { class: 'vidro', onclick: fecharFolha }, 'Fechar'), botao),
    )
    if (!lixo) contarSel()
  }

  let procurandoDup = false
  async function folhaDuplicados() {
    folha.dataset.trava = '0'
    if (!est.dups) {
      if (procurandoDup) return
      procurandoDup = true
      const cancelar = h('button', { class: 'vidro vidro--pequeno', onclick: () => z.parar() }, 'Parar')
      const caixa = espera('Comparando arquivos…', true)
      caixa.append(cancelar)
      abrirFolha(caixa)
      const r = await z.duplicados()
      procurandoDup = false
      if (!r.ok) {
        if (r.erro === 'ocupado') toast('Espere a conferência terminar.')
        return fecharFolha()
      }
      est.dups = r
      if (est.tela === 'limpar') telaLimpar()
    }
    const d = est.dups
    if (!d.grupos.length) {
      return abrirFolha(
        topoFolha('Nenhum', 'repetido.', 'Nenhum arquivo acima de 1 MB aparece duas vezes.'),
        h('div', { class: 'folha-pe' }, h('button', { class: 'vidro vidro--tinta', onclick: fecharFolha }, 'Feito')),
      )
    }
    const lista = h('ul', { class: 'folha-lista' })
    const marcas = []
    for (const g of d.grupos) {
      const [fica, ...outros] = g.itens
      lista.append(h('li', { class: 'grupo-dup', text: `${fica.n} · ${g.itens.length} cópias de ${Z.fmt.bytes(g.tamanho)}` }))
      lista.append(linhaDeItem(fica, { marca: h('span', { class: 'fica', text: 'Fica' }) }))
      for (const it of outros) {
        const m = h('input', { type: 'checkbox', class: 'marca', 'aria-label': it.c })
        m.checked = true
        marcas.push({ el: m, it })
        lista.append(linhaDeItem(it, { marca: m }))
      }
    }
    const botao = h('button', { class: 'vidro vidro--tinta' }, 'Pôr na cesta')
    botao.addEventListener('click', () => {
      for (const { el, it } of marcas) alternarCesta({ id: it.id, n: it.n, b: it.b, rel: it.c }, el.checked)
      sincronizarMarcas()
      fecharFolha()
      toast('Cópias na cesta')
    })
    const mac = est.plataforma === 'darwin' ? ' No Mac, cópias feitas pelo Finder podem não ocupar espaço extra.' : ''
    abrirFolha(
      topoFolha('Repetidos', Z.fmt.bytes(d.desperdicio), 'Fica o original de cada grupo; as cópias vão marcadas.' + mac),
      lista,
      h('div', { class: 'folha-pe' }, h('span', { class: 'nota', text: `${Z.fmt.num(d.qtd)} ${d.qtd === 1 ? 'grupo' : 'grupos'}` }), h('button', { class: 'vidro', onclick: fecharFolha }, 'Fechar'), botao),
    )
  }

  function progressoDup(m) {
    const i = folha.querySelector('.barra-progresso i')
    if (i && m.total) i.style.transform = `scaleX(${Math.min(1, m.lidos / m.total)})`
  }

  // ---------- eventos do app ----------

  z.aoEvento((m) => {
    if (m.t === 'progresso') progresso(m)
    else if (m.t === 'parcial') parcial(m)
    else if (m.t === 'duplicados') progressoDup(m)
    else if (m.t === 'atualizado') {
      // o vigia viu o disco mudar: corrige a vista sem animar
      est.raiz = m.raiz
      est.sugestoes = null
      if (est.tela === 'mapa') irPara(est.atual, false)
      else if (est.tela === 'limpar') telaLimpar()
    } else if (m.t === 'motor-parou') toast('O motor parou. Varra de novo.')
    else if (m.t === 'menu') menu(m.c)
  })

  function menu(c) {
    const temDisco = est.raiz && (est.tela === 'mapa' || est.tela === 'limpar')
    if (c === 'varrer' && est.disco && est.tela !== 'varrendo') varrerComTela(est.disco)
    else if (c === 'pasta') escolherPasta()
    else if (c === 'discos' && est.tela !== 'varrendo') telaInicio()
    else if (c === 'mapa' && temDisco) mostrarTela('mapa')
    else if (c === 'limpar' && temDisco) telaLimpar()
    else if (c === 'cesta' && temDisco) revisarCesta()
    else if (c === 'tema') z.info().then((i) => aplicarTema(i.tema))
  }

  function aplicarTema(tema) {
    est.tema = tema
    document.documentElement.dataset.tema = tema
    $('btn-tema').replaceChildren(Z.icone(tema === 'escuro' ? 'sol' : 'lua'))
    $('btn-tema').title = tema === 'escuro' ? 'Usar o tema claro' : 'Usar o tema escuro'
  }

  // ---------- botões e teclado ----------

  $('btn-pasta').addEventListener('click', escolherPasta)
  $('btn-parar').addEventListener('click', () => z.parar())
  $('btn-revarrer').append(Z.icone('revarrer'))
  $('btn-revarrer').addEventListener('click', () => est.disco && varrerComTela(est.disco))
  $('btn-tema').addEventListener('click', async () => aplicarTema(await z.tema(est.tema === 'escuro' ? 'claro' : 'escuro')))
  $('btn-revisar').addEventListener('click', revisarCesta)
  $('cesta-icone').append(Z.icone('cesta'))
  $('centro').addEventListener('click', voltar)
  $('btn-acesso').addEventListener('click', () => z.abrirPermissoes())
  $('btn-acesso-fechar').append(Z.icone('fechar'))
  $('btn-acesso-fechar').addEventListener('click', () => ($('aviso-acesso').hidden = true))
  for (const b of $('abas').querySelectorAll('button')) {
    b.addEventListener('click', () => (b.dataset.aba === 'limpar' ? telaLimpar() : (mostrarTela('mapa'), (est.aba = 'mapa'))))
  }

  document.addEventListener('keydown', (e) => {
    if (folha.open) return
    if (est.tela !== 'mapa') return
    if (e.target instanceof HTMLInputElement && e.key !== ' ') return
    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault()
      voltar()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      moverSelecao(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter' && est.sel !== null) {
      const f = est.pasta.filhos.find((x) => x.id === est.sel)
      if (f && f.p) irPara(f.id, 'dentro')
      else if (f) z.mostrar(f.id)
    } else if (e.key === ' ' && est.sel !== null) {
      e.preventDefault()
      const li = $('lista').querySelector(`.item[data-id="${est.sel}"] .marca`)
      if (li) li.click()
    }
  })

  // ---------- começo ----------

  ;(async () => {
    const info = await z.info()
    est.plataforma = info.plataforma
    document.documentElement.dataset.plataforma = info.plataforma
    Z.fmt.base = info.plataforma === 'win32' ? 1024 : 1000
    aplicarTema(info.tema)
    await telaInicio()
    document.documentElement.dataset.pronto = '1'
    z.pronto()
  })()
})()
