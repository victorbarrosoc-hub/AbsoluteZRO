// Boas-vindas: escolher quais apps instalar (todos opcionais) e se o Absolute ZRO abre com o computador.
// Fala só com a ponte do preload-boas-vindas.cjs (window.zroBoasVindas); quem baixa, confere e instala é a central.
;(function () {
  const ponte = window.zroBoasVindas
  const lista = document.getElementById('lista')
  const sistema = document.getElementById('sistema')
  const instalar = document.getElementById('instalar')
  const depois = document.getElementById('depois')
  const estado = document.getElementById('estado')
  const escolhidos = new Set()
  const cartoes = new Map()
  let trabalhando = false
  let terminou = false

  const mb = (b) => (b > 0 ? `${Math.round(b / 1048576)} MB` : '')

  function icone(app) {
    const caixa = document.createElement('span')
    caixa.className = 'icone'
    const img = document.createElement('img')
    img.alt = ''
    img.src = `produtos/${app.id}.svg`
    img.addEventListener('error', () => {
      img.remove()
      caixa.textContent = app.nome.slice(0, 2)
    })
    caixa.append(img)
    return caixa
  }

  function atualizarBotao() {
    instalar.disabled = trabalhando || escolhidos.size === 0
  }

  function cartao(app) {
    const li = document.createElement('li')
    li.className = 'cartao'
    li.dataset.escolhido = 'nao'
    const textos = document.createElement('span')
    const nome = document.createElement('div')
    nome.className = 'nome'
    nome.textContent = app.nome
    const meta = document.createElement('div')
    meta.className = 'meta'
    meta.textContent = app.instalado ? 'Já instalado' : [app.versao ? `v${app.versao}` : '', mb(app.tamanho)].filter(Boolean).join(' · ')
    textos.append(nome, meta)
    let controle
    if (app.instalado) {
      li.dataset.feito = 'sim'
      controle = document.createElement('span')
      controle.className = 'feito'
      controle.textContent = '✓'
      controle.setAttribute('aria-label', 'Já instalado')
    } else {
      controle = document.createElement('input')
      controle.type = 'checkbox'
      controle.setAttribute('role', 'switch')
      controle.setAttribute('aria-label', `Instalar ${app.nome}`)
      controle.addEventListener('change', () => {
        if (controle.checked) escolhidos.add(app.id)
        else escolhidos.delete(app.id)
        li.dataset.escolhido = controle.checked ? 'sim' : 'nao'
        atualizarBotao()
      })
      li.addEventListener('click', (e) => {
        if (trabalhando || e.target === controle) return
        controle.checked = !controle.checked
        controle.dispatchEvent(new window.Event('change'))
      })
    }
    li.append(icone(app), textos, controle)
    cartoes.set(app.id, { li, meta, controle })
    return li
  }

  function progresso(ev) {
    const c = cartoes.get(ev.id)
    if (!c) return
    if (ev.fase === 'baixando') {
      let barra = c.li.querySelector('.barra')
      if (!barra) {
        barra = document.createElement('span')
        barra.className = 'barra'
        barra.append(document.createElement('span'))
        c.meta.after(barra)
      }
      const pct = ev.total ? Math.min(100, Math.round(((ev.recebido || 0) / ev.total) * 100)) : 4
      barra.firstChild.style.width = `${Math.max(4, pct)}%`
      c.meta.textContent = ev.total ? `Baixando · ${pct}%` : 'Baixando…'
    } else if (ev.fase === 'instalando') c.meta.textContent = 'Instalando…'
    else if (ev.fase === 'pronto') {
      c.meta.textContent = 'Instalado'
      c.li.querySelector('.barra')?.remove()
    } else if (ev.fase === 'erro') {
      c.meta.textContent = ev.mensagem || 'Não deu para instalar.'
      c.li.querySelector('.barra')?.remove()
    }
  }

  async function comecar() {
    if (!ponte || trabalhando || !escolhidos.size) return
    trabalhando = true
    atualizarBotao()
    depois.hidden = true
    sistema.disabled = true
    for (const [id, c] of cartoes) {
      c.li.dataset.trabalhando = 'sim'
      if (c.controle.tagName === 'INPUT') c.controle.disabled = true
      if (!escolhidos.has(id) && c.controle.tagName === 'INPUT') c.li.style.opacity = '0.45'
    }
    estado.textContent = 'Pode fechar: continua em segundo plano.'
    const r = await ponte.instalar([...escolhidos], sistema.checked)
    trabalhando = false
    terminou = true
    estado.textContent = r && r.ok ? '' : (r && r.erro) || 'Alguns apps não instalaram. Tente pela página Downloads.'
    instalar.textContent = 'Pronto'
    instalar.disabled = false
    instalar.focus()
  }

  instalar.addEventListener('click', () => (terminou ? ponte.fechar(sistema.checked) : comecar()))
  depois.addEventListener('click', () => ponte && ponte.fechar(sistema.checked))
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !trabalhando && ponte) ponte.fechar(sistema.checked)
  })

  if (!ponte) return
  ponte.aoProgresso(progresso)
  ponte.dados().then((d) => {
    if (!d) return
    if (d.abrirComSistema === null) sistema.closest('.opcao').hidden = true
    else sistema.checked = !!d.abrirComSistema
    for (const app of d.apps) lista.append(cartao(app))
    window.__zroBoasVindas = { pronto: true, apps: d.apps.length }
  })
})()
