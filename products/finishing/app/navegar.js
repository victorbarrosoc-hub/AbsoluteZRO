// Revela · as abas do dock trocam só o painel central, como as páginas do DaVinci: o menu, o topo e o dock ficam
// parados e a marca do dock desliza até a aba nova. Cada ferramenta continua sendo uma página própria (link direto,
// recarregar, abrir em outra aba), mas aqui dentro a troca não recarrega: o painel novo vem uma vez (fetch), o módulo
// dele roda uma vez, e o painel de antes fica guardado com o que a pessoa estava fazendo (a conversão segue rodando).
//
// Cada módulo procura os elementos dentro do próprio <main> (ver `raiz` em revela.js, cst.js…), então os painéis
// guardados fora da página não se misturam. Sem fetch, sem history ou com erro: vai pelo link, como sempre.

const PAGINAS = ['lut', 'cst', 'entrega', 'converter']

/** Endereço → nome da ferramenta, ou null quando não é uma das abas (início, conta, outro site). */
export function paginaDe(href) {
  const u = new URL(href, location.href)
  if (u.origin !== location.origin) return null
  const nome = u.pathname.split('/').pop().replace(/\.html$/, '')
  return PAGINAS.includes(nome) ? nome : null
}

const dock = document.querySelector('.abas')
const aqui = paginaDe(location.href)
if (dock && aqui && 'fetch' in window && history.pushState) iniciar()

function iniciar() {
  // lut.html ou /lut: o endereço segue o jeito que a pessoa chegou (local × Vercel com cleanUrls)
  const limpo = !location.pathname.endsWith('.html')
  const endereco = (p) => (limpo ? p : `${p}.html`)

  const paineis = new Map()
  paineis.set(aqui, {
    main: document.querySelector('main'),
    titulo: document.title,
    canonico: document.querySelector('link[rel=canonical]')?.href,
    url: location.href,
    rolagem: 0,
    pronto: Promise.resolve(),
  })
  let atual = aqui

  // ── marca que desliza no dock ──
  const marca = document.createElement('span')
  marca.className = 'abas-marca'
  marca.ariaHidden = 'true'
  dock.prepend(marca)
  dock.classList.add('com-marca')
  const aba = (p) => dock.querySelector(`a[href^="${p}"]`)
  function moverMarca() {
    const a = aba(atual)
    if (!a) return
    marca.style.width = `${a.offsetWidth}px`
    marca.style.height = `${a.offsetHeight}px`
    marca.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`
  }
  moverMarca()
  // a primeira posição entra sem deslizar; depois, toda troca desliza
  requestAnimationFrame(() => dock.classList.add('marca-viva'))
  addEventListener('resize', moverMarca)
  document.fonts?.ready.then(moverMarca)

  async function buscar(p) {
    const r = await fetch(endereco(p), { credentials: 'same-origin' })
    if (!r.ok) throw new Error(`${r.status}`)
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html')
    const main = doc.querySelector('main')
    const src = doc.querySelector('script[type=module][src]')?.getAttribute('src')
    if (!main || !src) throw new Error('página sem painel')
    return {
      main: document.adoptNode(main),
      titulo: doc.title,
      canonico: doc.querySelector('link[rel=canonical]')?.href,
      modulo: new URL(src, r.url).href,
      url: new URL(endereco(p), location.href).href,
      rolagem: 0,
      pronto: null,
    }
  }
  // o mesmo pedido serve para o "passou o mouse" e para o clique
  const pedidos = new Map()
  const painel = (p) => paineis.get(p) ?? pedidos.get(p) ?? pedidos.set(p, buscar(p)).get(p)

  let destino = aqui
  async function ir(p, { empilhar = true, url } = {}) {
    destino = p
    if (p === atual) return
    let novo
    try {
      novo = await painel(p)
    } catch {
      location.href = url ?? endereco(p)
      return
    }
    if (destino !== p) return // outra aba foi clicada enquanto esta chegava
    pedidos.delete(p)
    paineis.set(p, novo)
    const antes = paineis.get(atual)
    antes.url = location.href
    antes.rolagem = scrollY

    antes.main.replaceWith(novo.main)
    atual = p
    document.title = novo.titulo
    const canon = document.querySelector('link[rel=canonical]')
    if (canon && novo.canonico) canon.href = novo.canonico
    if (empilhar) history.pushState({ revela: p }, '', url ?? novo.url)
    for (const a of dock.querySelectorAll('a')) {
      if (paginaDe(a.href) === p) a.setAttribute('aria-current', 'page')
      else a.removeAttribute('aria-current')
    }
    moverMarca()
    scrollTo(0, empilhar ? 0 : novo.rolagem)
    dispatchEvent(new CustomEvent('revela:pagina', { detail: p }))
    // o módulo do painel roda uma vez, já com o painel na página (ele procura os elementos no <main> de agora)
    novo.pronto ??= import(novo.modulo).catch(() => {
      location.href = novo.url
    })
  }

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = e.target.closest?.('a[href]')
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
    const p = paginaDe(a.href)
    if (!p) return
    e.preventDefault()
    ir(p, { url: a.hash ? a.href : undefined })
  })
  // adianta o painel quando o ponteiro chega na aba
  dock.addEventListener('pointerover', (e) => {
    const p = paginaDe(e.target.closest?.('a[href]')?.href ?? '')
    if (p && p !== atual && !paineis.has(p)) painel(p).catch(() => pedidos.delete(p))
  })
  addEventListener('popstate', () => {
    const p = paginaDe(location.href)
    if (p) ir(p, { empilhar: false })
    else location.reload()
  })
  history.replaceState({ revela: aqui }, '')
}
