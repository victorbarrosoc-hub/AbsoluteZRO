// Relay · página inicial. Tudo o que ela mostra vem do próprio Relay: os destinos da lista de presets, os números do
// mesmo plano do conversor (src/plano.js) e as telas capturadas do app de verdade (scripts/telas-inicio.mjs), no tema
// escolhido. O movimento é em CSS (home.css); aqui só as revelações na rolagem, as abas e as duas demonstrações.

import { GRUPOS, PRESETS, preset as presetDoRelay } from '../src/presets.js'
import { icone, icones } from './icones.js'
import { montarSet } from './set.js'
import { lerConta, linkEntrar } from './conta.js'
import { RECURSOS } from './recursos.js'
import { caber, DEMO, demonstrar, ficha, LIMITES_MB, MASTER } from './vitrine.js'

const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  n.append(...filhos.filter((f) => f != null))
  return n
}
const $ = (s, raiz = document) => raiz.querySelector(s)
const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)]
const menosMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// ─────────── tema e telas de verdade ───────────

const tema = () => (window.relayTema?.atual() === 'escuro' ? 'escuro' : 'claro')
function pintarTelas() {
  for (const img of $$('img[data-tela]')) {
    const src = `app/inicio/telas/${img.dataset.tela}-${tema()}.webp`
    if (!img.getAttribute('src')?.endsWith(src)) img.setAttribute('src', src)
  }
}
const botaoTema = $('[data-tema-botao]')
const pintarTema = () => botaoTema?.replaceChildren(icone(tema() === 'escuro' ? 'sol' : 'lua'))
botaoTema?.addEventListener('click', () => {
  window.relayTema?.alternar()
  pintarTema()
})
new MutationObserver(pintarTelas).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] })
pintarTelas()

// ─────────── abas (Ferramentas e grupos de destinos): setas, Home e End, como as abas do sistema ───────────

function ligarAbas(lista) {
  const abas = $$('[role="tab"]', lista)
  const escolher = (aba, foco = false) => {
    for (const a of abas) {
      const sim = a === aba
      a.setAttribute('aria-selected', String(sim))
      a.tabIndex = sim ? 0 : -1
      const painel = document.getElementById(a.getAttribute('aria-controls'))
      if (!painel) continue
      painel.hidden = !sim
      if (sim) {
        painel.classList.remove('entrando')
        void painel.offsetWidth // recomeça a entrada
        painel.classList.add('entrando')
      }
    }
    if (foco) aba.focus()
    // no celular os segmentos rolam de lado: a aba escolhida fica à vista, sem mexer na rolagem da página
    lista.scrollTo?.({ left: aba.offsetLeft - (lista.clientWidth - aba.offsetWidth) / 2, behavior: menosMovimento() ? 'auto' : 'smooth' })
    lista.dispatchEvent(new CustomEvent('aba', { detail: aba }))
  }
  lista.addEventListener('click', (e) => {
    const aba = e.target.closest('[role="tab"]')
    if (aba) escolher(aba)
  })
  lista.addEventListener('keydown', (e) => {
    const i = abas.indexOf(document.activeElement)
    if (i < 0) return
    const alvo = { ArrowRight: abas[(i + 1) % abas.length], ArrowLeft: abas[(i - 1 + abas.length) % abas.length], Home: abas[0], End: abas.at(-1) }[e.key]
    if (!alvo) return
    e.preventDefault()
    escolher(alvo, true)
  })
  return escolher
}

// ─────────── destinos: todos, por grupo ───────────

for (const n of $$('[data-contar="destinos"]')) n.textContent = String(PRESETS.length)
for (const n of $$('[data-contar="grupos"]')) n.textContent = String(GRUPOS.length)

const abasDestinos = $('[data-destinos-abas]')
const grade = $('[data-destinos]')
if (abasDestinos && grade) {
  GRUPOS.forEach((g, i) => {
    const id = `grupo-${i}`
    const lista = PRESETS.filter((p) => p.grupo === g)
    const aba = el(
      'button',
      { type: 'button', role: 'tab', id: `aba-${id}`, tabIndex: i ? -1 : 0 },
      g,
      el('span', { className: 'conta-aba', textContent: String(lista.length) }),
    )
    aba.setAttribute('aria-controls', id)
    aba.setAttribute('aria-selected', String(!i))
    abasDestinos.append(aba)
    const painel = el(
      'ul',
      { id, role: 'tabpanel', className: 'grupo', hidden: i > 0 },
      ...lista.map((p) =>
        el(
          'li',
          {},
          el(
            'a',
            { className: 'destino cartao', href: `converter?preset=${p.id}` },
            el('span', { className: 'destino-icone' }, icone(p.icone)),
            el('strong', { textContent: p.nome }),
            el('small', { textContent: ficha(p) }),
          ),
        ),
      ),
    )
    painel.setAttribute('aria-labelledby', `aba-${id}`)
    grade.append(painel)
  })
  ligarAbas(abasDestinos)
}
const abasFerramentas = $('[data-abas="ferramentas"]')
if (abasFerramentas) ligarAbas(abasFerramentas)

// ─────────── experimente: o destino muda a tela; os números são os do conversor ───────────

const caixaDemo = $('[data-demo-destinos]')
if (caixaDemo) {
  let atual = 'reels'
  const preencher = $('[data-demo-preencher]')
  const linhaPreencher = $('[data-demo-preencher-linha]')
  const tela = $('[data-demo-tela]')
  const palco = tela.parentElement
  const botoes = DEMO.map((id) => {
    const p = presetDoRelay(id)
    const b = el(
      'button',
      { type: 'button', role: 'radio', className: 'demo-destino', tabIndex: -1 },
      el('span', { className: 'demo-destino-icone' }, icone(p.icone)),
      el('span', { textContent: p.nome }),
    )
    b.dataset.id = id
    b.addEventListener('click', () => escolher(id))
    return b
  })
  caixaDemo.append(...botoes)
  caixaDemo.addEventListener('keydown', (e) => {
    const i = DEMO.indexOf(atual)
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!passo) return
    e.preventDefault()
    escolher(DEMO[(i + passo + DEMO.length) % DEMO.length], true)
  })

  const ajustarTela = (proporcao) => {
    const largura = palco.clientWidth
    const altura = palco.clientHeight
    const r = proporcao ?? 1
    const w = Math.min(largura, altura * r) * (proporcao ? 1 : 0.6) // só áudio: o disco menor, no meio
    tela.style.width = `${Math.round(w)}px`
    tela.style.height = `${Math.round(w / r)}px`
  }

  let ultimo = null
  function escolher(id, foco = false) {
    atual = id
    const p = presetDoRelay(id)
    for (const b of botoes) {
      const sim = b.dataset.id === id
      b.setAttribute('aria-checked', String(sim))
      b.tabIndex = sim ? 0 : -1
      if (sim && foco) b.focus()
    }
    linhaPreencher.hidden = !p.video?.quadro
    const d = demonstrar(id, preencher.checked)
    ultimo = d
    tela.dataset.encaixe = d.encaixe ?? 'direto'
    tela.classList.toggle('demo-tela--audio', !d.proporcao)
    ajustarTela(d.proporcao)
    $('[data-demo-nome]').textContent = p.nome
    $('[data-demo-ficha]').replaceChildren(...d.linhas.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })]))
    $('[data-demo-link]').href = `converter?preset=${id}`
  }
  preencher.addEventListener('change', () => escolher(atual))
  new ResizeObserver(() => ultimo && ajustarTela(ultimo.proporcao)).observe(palco)
  escolher(atual)
}

// ─────────── cabe no limite: o mesmo plano do "Tamanho exato" ───────────

const faixaLimite = $('[data-limite]')
if (faixaLimite) {
  const pintar = () => {
    const r = caber(LIMITES_MB[Number(faixaLimite.value)])
    const tam = `${r.largura}×${r.altura}`
    const det = `${r.mbps.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Mbit/s · ~${r.tamanho}`
    $('[data-limite-mb]').textContent = `${r.mb} MB`
    $('[data-limite-tamanho]').textContent = tam
    $('[data-limite-detalhe]').textContent = det
    $('[data-limite-quadro]').style.setProperty('--fracao', String(r.largura / MASTER.largura))
    faixaLimite.setAttribute('aria-valuetext', `${r.mb} MB: ${tam}, ${det}`)
  }
  faixaLimite.addEventListener('input', pintar)
  pintar()
}

// ─────────── família: o Relay no centro, os apps em volta ───────────

const FAMILIA = [
  { nome: 'SOBEDESCE', img: 'marca/familia/sobedesce.svg', href: 'https://sobedesce.vercel.app', uso: 'Converter do Drive' },
  { nome: 'Revela', img: 'marca/familia/revela.svg', href: 'https://revela.absolutezro.com', uso: 'Exportar depois da cor' },
  { nome: 'AEON', img: 'marca/familia/aeon.svg', href: 'https://aeon.absolutezro.com', uso: 'Exportar a edição' },
  { nome: 'NOSSOM', img: 'marca/familia/nossom.svg', href: 'https://nossom-teal.vercel.app', uso: 'Exportar o áudio' },
  { nome: 'Synquei', img: 'marca/familia/synquei.svg', href: 'https://synquei.vercel.app', uso: 'Pronto para editar' },
  { nome: 'TPeasy', img: 'marca/familia/tpeasy.svg', href: 'https://tpeasy.vercel.app', uso: 'Gravação para a rede' },
  { nome: 'Carro do Freela', img: 'marca/familia/carro-do-freela.png', href: 'https://carrodofreela.com.br', uso: 'Reel do portfólio' },
]
const orbita = $('[data-familia]')
if (orbita)
  FAMILIA.forEach((a, i) =>
    orbita.append(
      el(
        'a',
        { className: 'orbita-app', href: a.href, title: `${a.nome}: ${a.uso}`, style: `--i:${i};--n:${FAMILIA.length}` },
        el('img', { src: a.img, alt: '', loading: 'lazy' }),
        el('span', { textContent: a.nome }),
      ),
    ),
  )

// a cor da Revela só aparece quando a Revela abre a cor no Relay (app/recursos.js)
if (RECURSOS.revela) for (const n of $$('[data-so-revela]')) n.hidden = false

// ─────────── revelar na rolagem (uma vez) e os números contando ───────────

function contar(dd) {
  const alvo = Number(dd.textContent)
  if (!(alvo > 1) || menosMovimento()) return
  const t0 = performance.now()
  const passo = (t) => {
    const k = Math.min(1, (t - t0) / 1200)
    dd.textContent = String(Math.round(alvo * (1 - (1 - k) ** 3)))
    if (k < 1) requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
}

const revelar = $$('[data-revelar]')
if ('IntersectionObserver' in window && !menosMovimento()) {
  // o que já está na tela aparece sem esperar; o resto, ao entrar
  for (const n of revelar) if (n.getBoundingClientRect().top < innerHeight) n.classList.add('visivel')
  document.documentElement.classList.add('revelando')
  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue
        e.target.classList.add('visivel')
        const dd = e.target.querySelector('dd')
        if (dd && e.target.closest('.numeros')) contar(dd)
        io.unobserve(e.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  )
  for (const n of revelar) if (!n.classList.contains('visivel')) io.observe(n)
}

icones()
pintarTema()

// o Set, a aba em comum do ecossistema: "Set" no fim das páginas do topo (app/set.js)
montarSet()

// com a conta: a segunda ação do topo da página leva ao painel (a foto da conta já está no topo); a seção da conta
// chama para entrar (fora) ou abre o painel (dentro); sem login neste endereço, fica sem botão
lerConta().then((c) => {
  const acao = $('[data-conta-acao]')
  if (acao && c.estado !== 'desligado') {
    acao.href = c.estado === 'dentro' ? '/painel' : linkEntrar('/')
    acao.textContent = c.estado === 'dentro' ? 'Abrir o painel' : 'Entrar com a Absolute ZRO'
    acao.hidden = false
  }
  const a = document.querySelector('[data-heroi-segunda]')
  if (c.estado !== 'dentro' || !a) return
  a.href = '/painel'
  a.textContent = 'Seu painel'
})
