// Revela Lab · a tela. A pessoa traz um frame (ou usa o exemplo), escolhe a base, liga "Analisar e corrigir" e mexe
// nos ajustes; a prévia refaz na hora (LUT 17³ enquanto arrasta, 33³ quando solta). Sai .cube no tamanho do editor,
// a receita .revela e o look em Meus looks. Tudo no navegador: o frame não sai do aparelho.

import './conta.js'
import './menu.js'
import { aplicar, assar, escreverCube } from '../src/cor/cube.js'
import { AJUSTES, AJUSTES_NEUTROS, COPIAS_LAB, ENTRADAS_LAB, GRUPOS, LUZES_LAB, NEGATIVOS_LAB, REVELACOES, paraCena, analisarFrame, baseDoLab, criarLab, escreverReceita, lerReceita } from '../src/cor/lab.js'
import { MAX_LOOKS, PREFIXO, empacotar } from '../src/cor/meuslooks.js'
import { cascata, escalonar, icones } from './visual.js'
import { criarTela, diParaLinear, linearParaDi } from '../src/cor/cena.js'
import { AJUSTES_TEXTURA, PRESETS_TEXTURA, TEXTURA_NEUTRA, aplicarTextura, texturaAtiva } from '../src/cor/textura.js'
import { autopilot, lerFabricante } from '../src/cor/autopilot.js'
import { NEGATIVOS } from '../src/cor/negativos.js'
import { desenharFicha, montarFicha, paletaDominante } from '../src/imagem/ficha.js'
import { escreverDctlLab } from '../src/cor/dctl-lab.js'

icones()
escalonar()

const raiz = document.querySelector('main')
const $ = (id) => raiz.querySelector(`#${id}`)
const LADO_PREVIA = 1280
const LADO_MINI = 300
const LADO_FICHA = 1920
const CHAVE_CAMERA = 'revela-camera'
const CHAVE_FICHA = 'revela-ficha'
const CHAVE_MEUS = 'revela-meus-looks'
const EDITORES = { resolve: 65, premiere: 33, fcp: 65, capcut: 33 }

let frame = null // { previa: ImageData, mini: ImageData, pixels: Float32Array }
let correcaoLida = null
let receita = { nome: 'Meu look', entrada: 'still', base: 'revela', copia: '', negativo: '', luzCopia: '', expandido: null, revelacao: null, textura: { ...TEXTURA_NEUTRA }, intensidade: 1, correcao: null, ajustes: { ...AJUSTES_NEUTROS } }
let grupo = 'revela'
let corrigirSozinho = true // "Analisar e corrigir" começa ligado: quem não é colorista já ganha o frame equilibrado
let camadas = null
let escolhida = false // a pessoa (ou a receita) já disse de onde vem o frame: o Autopilot respeita

const avisar = (t, erro = false) => {
  $('estado').textContent = t
  $('estado').classList.toggle('erro', erro)
}
const espera = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)))

// ─────────── frame ───────────

function desenhar(bm, lado) {
  const escala = Math.min(1, lado / Math.max(bm.width, bm.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bm.width * escala))
  c.height = Math.max(1, Math.round(bm.height * escala))
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bm, 0, 0, c.width, c.height)
  return ctx.getImageData(0, 0, c.width, c.height)
}

async function receber(arquivo, { entrada = null, frase = '' } = {}) {
  if (!arquivo) return
  if (!arquivo.type.startsWith('image/')) return avisar('Escolha uma imagem (um still do seu vídeo).', true)
  avisar('Abrindo o frame…')
  let bm
  try {
    bm = await createImageBitmap(arquivo, { colorSpaceConversion: 'none' }).catch(() => createImageBitmap(arquivo))
  } catch {
    return avisar('Não deu para abrir essa imagem.', true)
  }
  const previa = desenhar(bm, LADO_PREVIA)
  const mini = desenhar(bm, LADO_MINI)
  const pixels = new Float32Array(previa.width * previa.height * 3)
  for (let i = 0, j = 0; i < previa.data.length; i += 4, j += 3) {
    pixels[j] = previa.data[i] / 255
    pixels[j + 1] = previa.data[i + 1] / 255
    pixels[j + 2] = previa.data[i + 2] / 255
  }
  let fabricante = ''
  try {
    fabricante = lerFabricante(await arquivo.slice(0, 262144).arrayBuffer())
  } catch {
    // sem EXIF, sem pista
  }
  frame = { previa, mini, pixels, bm, nome: arquivo.name }
  if (entrada) {
    // o exemplo da Revela: a origem é conhecida
    receita.entrada = entrada
    $('entrada').value = entrada
    mostrarAutopilot(frase, false)
  } else pilotar(arquivo.name, fabricante)
  lerFrame()
  $('lab').hidden = false
  $('lab-entrada').classList.add('compacta')
  raiz.classList.add('com-frame')
  mostrarCorrecao()
  desenharBases()
  refazer()
  avisar('')
}

/** Lê o frame na luz da cena (pela entrada escolhida) e liga a correção automática, se ela estiver ligada. */
function lerFrame() {
  correcaoLida = analisarFrame(frame.pixels, { entrada: receita.entrada })
  if (receita.correcao || corrigirSozinho) receita.correcao = { exposicao: correcaoLida.exposicao, ganhos: correcaoLida.ganhos }
}

// de onde vem o frame: still já tratado ou o log de uma câmera
$('entrada').replaceChildren(...ENTRADAS_LAB.map((e) => Object.assign(document.createElement('option'), { value: e.id, textContent: e.nome })))
const nomeDaEntrada = () => ENTRADAS_LAB.find((e) => e.id === receita.entrada)?.nome ?? ''
function mostrarAutopilot(texto, pede) {
  $('autopilot-frase').textContent = texto
  $('autopilot').classList.toggle('pede', pede)
  $('entrada').closest('.campo-log').classList.toggle('pede', pede)
}
/** O Autopilot lê o frame que chegou: still ou log e, com pista, a câmera. Sem pista, pede (não chuta). */
function pilotar(nome, fabricante) {
  let ultima = ''
  try {
    ultima = localStorage.getItem(CHAVE_CAMERA) ?? ''
  } catch {
    // janela privada: sem lembrança
  }
  // a câmera que já está valendo nesta sessão também é lembrança
  if (!ultima && receita.entrada !== 'still') ultima = receita.entrada
  const a = autopilot({ pixels: frame.pixels, nome, fabricante, ultima })
  // a escolha da pessoa vale enquanto combinar com o frame (log com log, still com still)
  if (escolhida && a.log === (receita.entrada !== 'still')) return mostrarAutopilot(`${nomeDaEntrada()} · escolha sua`, false)
  if (a.entrada) {
    receita.entrada = a.entrada
    $('entrada').value = a.entrada
  }
  mostrarAutopilot(a.frase, a.entrada === null)
}
$('entrada').addEventListener('change', () => {
  receita.entrada = $('entrada').value
  escolhida = true
  if (receita.entrada !== 'still')
    try {
      localStorage.setItem(CHAVE_CAMERA, receita.entrada)
    } catch {
      // sem lembrança neste navegador
    }
  mostrarAutopilot(`${nomeDaEntrada()} · escolha sua`, false)
  if (!frame) return
  lerFrame()
  mostrarCorrecao()
  desenharBases()
  refazer()
})

$('arquivo-frame').addEventListener('change', (e) => receber(e.target.files[0]))
const caixa = $('caixa-frame')
caixa.addEventListener('dragover', (e) => {
  e.preventDefault()
  caixa.classList.add('soltando')
})
caixa.addEventListener('dragleave', () => caixa.classList.remove('soltando'))
caixa.addEventListener('drop', (e) => {
  e.preventDefault()
  caixa.classList.remove('soltando')
  receber(e.dataTransfer.files[0])
})
$('lab-exemplo').addEventListener('click', async () => {
  try {
    const r = await fetch('exemplos/material-vestido.jpg')
    await receber(new File([await r.blob()], 'material-vestido.jpg', { type: 'image/jpeg' }), { entrada: 'still', frase: 'Exemplo da Revela' })
  } catch {
    avisar('Não deu para abrir o exemplo agora.', true)
  }
})

// ─────────── prévia ───────────

function pintarCom(base, f, tamanho) {
  const lut = assar(f, tamanho)
  const out = new ImageData(base.width, base.height)
  const d = base.data
  for (let i = 0; i < d.length; i += 4) {
    const o = aplicar(lut, d[i] / 255, d[i + 1] / 255, d[i + 2] / 255)
    out.data[i] = Math.round(o[0] * 255)
    out.data[i + 1] = Math.round(o[1] * 255)
    out.data[i + 2] = Math.round(o[2] * 255)
    out.data[i + 3] = 255
  }
  const c = document.createElement('canvas')
  c.width = base.width
  c.height = base.height
  c.getContext('2d').putImageData(out, 0, 0)
  return c
}

const lookAtual = () => criarLab(receita)
const telaSdr = criarTela('rec709')

// com textura, a prévia faz o caminho do Resolve: frame → luz da cena → textura → look → tela
let cenaGuardada = null
function cenaDe(base) {
  if (cenaGuardada?.base === base && cenaGuardada.entrada === receita.entrada) return cenaGuardada.img
  const paraDi = paraCena(receita.entrada)
  const lut = assar((r, g, b) => paraDi(r, g, b).map(linearParaDi), 33)
  const d = base.data
  const img = new Float32Array((d.length / 4) * 3)
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    const o = aplicar(lut, d[i] / 255, d[i + 1] / 255, d[i + 2] / 255)
    img[j] = diParaLinear(o[0])
    img[j + 1] = diParaLinear(o[1])
    img[j + 2] = diParaLinear(o[2])
  }
  // só a prévia fica guardada: a ficha passa uma vez e o frame maior ocuparia memória à toa
  if (base === frame.previa) cenaGuardada = { base, entrada: receita.entrada, img }
  return img
}
function pintarComTextura(look, tamanho, base = frame.previa) {
  const { width: w, height: h } = base
  const tex = aplicarTextura(cenaDe(base), w, h, receita.textura, { negativo: look.motor.negativo ?? 'digital' })
  const lut = assar((r, g, b) => telaSdr.aplicar(look.motor.emCena([diParaLinear(r), diParaLinear(g), diParaLinear(b)])), tamanho)
  const out = new ImageData(w, h)
  for (let i = 0, j = 0; j < tex.length; i += 4, j += 3) {
    const o = aplicar(lut, linearParaDi(Math.max(0, tex[j])), linearParaDi(Math.max(0, tex[j + 1])), linearParaDi(Math.max(0, tex[j + 2])))
    out.data[i] = Math.round(o[0] * 255)
    out.data[i + 1] = Math.round(o[1] * 255)
    out.data[i + 2] = Math.round(o[2] * 255)
    out.data[i + 3] = 255
  }
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d').putImageData(out, 0, 0)
  return c
}

function refazer(rapido = false) {
  if (!frame) return
  const antes = document.createElement('canvas')
  antes.width = frame.previa.width
  antes.height = frame.previa.height
  antes.getContext('2d').putImageData(frame.previa, 0, 0)
  const look = lookAtual()
  const depois = texturaAtiva(receita.textura) ? pintarComTextura(look, rapido ? 17 : 33) : pintarCom(frame.previa, look.aplicar, rapido ? 17 : 33)
  camadas = { antes, depois }
  $('rotulo-depois').textContent = baseDoLab(receita.base)?.nome ?? 'Depois'
  pintar()
}

function pintar() {
  if (!camadas) return
  const tela = $('previa')
  const { width: w, height: h } = camadas.antes
  if (tela.width !== w || tela.height !== h) {
    tela.width = w
    tela.height = h
  }
  const x = Math.round((Number($('divisao').value) / 100) * w)
  const ctx = tela.getContext('2d')
  ctx.drawImage(camadas.depois, 0, 0)
  ctx.drawImage(camadas.antes, 0, 0, x, h, 0, 0, x, h)
  // a linha da divisão só existe quando há os dois lados (na tela toda é só o look, ou só o antes)
  if (x > 0 && x < w) {
    ctx.fillStyle = '#fff4e0'
    ctx.fillRect(x - 1, 0, 2, h)
  }
}
$('divisao').addEventListener('input', pintar)

// arrastar refaz no próximo quadro (LUT pequena); soltar refaz com a LUT da prévia
let agendado = 0
function agendar() {
  if (agendado) return
  agendado = requestAnimationFrame(() => {
    agendado = 0
    refazer(true)
  })
}

// ─────────── bases ───────────

function desenharGrupos() {
  $('grupos').replaceChildren(
    ...GRUPOS.map((g) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'lab-grupo'
      b.setAttribute('role', 'tab')
      b.setAttribute('aria-selected', String(g.id === grupo))
      b.textContent = g.nome
      b.addEventListener('click', () => {
        grupo = g.id
        desenharGrupos()
        desenharBases()
      })
      return b
    }),
  )
}

function desenharBases() {
  if (!frame) return
  const g = GRUPOS.find((x) => x.id === grupo)
  $('bases').replaceChildren(
    ...g.looks.map((l) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'look'
      b.dataset.look = l.id
      b.title = (l.frases ?? []).join(' ') || l.nome
      b.setAttribute('role', 'radio')
      b.setAttribute('aria-label', l.nome)
      b.setAttribute('aria-checked', String(l.id === receita.base))
      // miniatura com a correção e a base, sem os ajustes: compara as bases entre si
      const mini = pintarCom(frame.mini, criarLab({ base: l.id, entrada: receita.entrada, correcao: receita.correcao }).aplicar, 17)
      const nome = document.createElement('span')
      nome.className = 'look-nome'
      nome.textContent = l.nome
      b.append(mini, nome)
      b.addEventListener('click', () => escolherBase(l.id))
      return b
    }),
  )
  cascata($('bases'))
}

/** Troca a base do look (pelo painel ou pela barra sobre a imagem): a grade acompanha, mesmo se for de outro grupo. */
function escolherBase(id) {
  const base = baseDoLab(id)
  if (!base) return
  receita.base = id
  // a base traz a própria película: as escolhas de negativo e cópia voltam para "da base"
  Object.assign(receita, { copia: '', negativo: '', luzCopia: '', expandido: null, revelacao: null })
  mostrarFilme()
  const doGrupo = GRUPOS.find((g) => g.looks.includes(base)).id
  if (doGrupo !== grupo) {
    grupo = doGrupo
    desenharGrupos()
    desenharBases()
  } else for (const x of $('bases').querySelectorAll('.look')) x.setAttribute('aria-checked', String(x.dataset.look === id))
  refazer()
  trocouLook()
}

/** O frame acusa a troca de base com um fade curto (o canvas é o mesmo, então recomeça a animação). */
function trocouLook() {
  const c = $('previa')
  c.classList.remove('trocou-look')
  void c.offsetWidth
  c.classList.add('trocou-look')
}

// ─────────── correção e ajustes ───────────

function mostrarCorrecao() {
  $('corrigir').checked = !!receita.correcao
  $('leitura-correcao').textContent = receita.correcao && correcaoLida ? correcaoLida.leitura : ''
}
$('corrigir').addEventListener('change', () => {
  corrigirSozinho = false
  receita.correcao = $('corrigir').checked && correcaoLida ? { exposicao: correcaoLida.exposicao, ganhos: correcaoLida.ganhos } : null
  mostrarCorrecao()
  desenharBases()
  refazer()
})

const formatar = (v) => (v > 0 ? `+${v}` : String(v))
// na câmera se acerta a luz e o branco, como no set; contraste e cor já são o look
const DA_CAMERA = ['luz', 'temperatura', 'tint']
/** Acende o trilho do neutro até o valor (o neutro é o centro nos ajustes de dois lados). */
function acender(barra) {
  const min = Number(barra.min)
  const max = Number(barra.max)
  const pct = ((Number(barra.value) - min) / (max - min)) * 100
  const neutro = ((0 - min) / (max - min)) * 100
  barra.style.setProperty('--de', `${Math.min(pct, neutro)}%`)
  barra.style.setProperty('--ate', `${Math.max(pct, neutro)}%`)
}
function desenharAjustes() {
  const linhaDe = (a) => {
      const linha = document.createElement('div')
      linha.className = 'controle ajuste'
      linha.title = a.dica
      const rotulo = document.createElement('label')
      rotulo.htmlFor = `aj-${a.id}`
      rotulo.textContent = a.nome
      const valor = document.createElement('output')
      valor.htmlFor = `aj-${a.id}`
      const barra = document.createElement('input')
      Object.assign(barra, { type: 'range', id: `aj-${a.id}`, min: a.min, max: a.max, value: receita.ajustes[a.id] ?? 0 })
      if (a.min < 0) barra.classList.add('bipolar')
      valor.textContent = formatar(Number(barra.value))
      acender(barra)
      barra.addEventListener('input', () => {
        receita.ajustes[a.id] = Number(barra.value)
        valor.textContent = formatar(Number(barra.value))
        acender(barra)
        agendar()
      })
      barra.addEventListener('change', () => refazer())
      // duplo toque volta ao neutro, como nos painéis de cor
      barra.addEventListener('dblclick', () => {
        barra.value = 0
        receita.ajustes[a.id] = 0
        valor.textContent = '0'
        acender(barra)
        refazer()
      })
      linha.append(rotulo, valor, barra)
      return linha
  }
  $('ajustes-camera').replaceChildren(...AJUSTES.filter((a) => DA_CAMERA.includes(a.id)).map(linhaDe))
  $('ajustes').replaceChildren(...AJUSTES.filter((a) => !a.fino && !DA_CAMERA.includes(a.id)).map(linhaDe))
  $('ajustes-finos').replaceChildren(...AJUSTES.filter((a) => a.fino).map(linhaDe))
}
$('zerar').addEventListener('click', () => {
  receita.ajustes = { ...AJUSTES_NEUTROS }
  desenharAjustes()
  refazer()
})

// ─────────── textura ───────────

function desenharTextura() {
  const atual = PRESETS_TEXTURA.find((p) => Object.entries({ ...TEXTURA_NEUTRA, ...p.valores }).every(([k, v]) => receita.textura[k] === v))
  $('texturas').replaceChildren(
    ...PRESETS_TEXTURA.map((p) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'lab-grupo'
      b.setAttribute('role', 'radio')
      b.setAttribute('aria-checked', String(p === atual))
      b.textContent = p.nome
      b.addEventListener('click', () => {
        receita.textura = { ...TEXTURA_NEUTRA, ...p.valores }
        desenharTextura()
        refazer()
      })
      return b
    }),
  )
  const linhaDe = (a) => {
    const linha = document.createElement('div')
    linha.className = 'controle ajuste'
    linha.title = a.dica
    const rotulo = Object.assign(document.createElement('label'), { htmlFor: `tx-${a.id}`, textContent: a.nome })
    const valor = Object.assign(document.createElement('output'), { htmlFor: `tx-${a.id}` })
    const barra = document.createElement('input')
    Object.assign(barra, { type: 'range', id: `tx-${a.id}`, min: a.min, max: a.max, value: Math.round(receita.textura[a.id] / a.escala) })
    valor.textContent = barra.value
    acender(barra)
    barra.addEventListener('input', () => {
      receita.textura = { ...receita.textura, [a.id]: Number(barra.value) * a.escala }
      valor.textContent = barra.value
      acender(barra)
    })
    barra.addEventListener('change', () => {
      desenharTextura()
      refazer()
    })
    linha.append(rotulo, valor, barra)
    return linha
  }
  $('ajustes-textura').replaceChildren(...AJUSTES_TEXTURA.filter((a) => !a.fino).map(linhaDe))
  $('ajustes-textura-finos').replaceChildren(...AJUSTES_TEXTURA.filter((a) => a.fino).map(linhaDe))
}
desenharTextura()
const opcao = (value, textContent) => Object.assign(document.createElement('option'), { value, textContent })
$('copia').replaceChildren(...COPIAS_LAB.map((c) => opcao(c.id, c.nome)))
// negativos por fabricante, como nas fichas
const grupoNeg = (fab) => Object.assign(document.createElement('optgroup'), { label: fab })
const kodak = grupoNeg('Kodak')
const fuji = grupoNeg('Fujifilm')
for (const n of NEGATIVOS_LAB) (n.fabricante === 'Kodak' ? kodak : n.fabricante === 'Fujifilm' ? fuji : null)?.append(opcao(n.id, n.nome))
$('negativo').replaceChildren(...NEGATIVOS_LAB.filter((n) => !n.fabricante).map((n) => opcao(n.id, n.nome)), kodak, fuji)
$('luz-copia').replaceChildren(...LUZES_LAB.map((l) => opcao(l.id, l.nome)))
$('revelacao').replaceChildren(
  opcao('', 'Revelação da base'),
  ...REVELACOES.map((r) => opcao(String(r), r === 0 ? 'Revelação normal' : r < 0 ? `Puxar ${-r} stop` : `Forçar ${r} ${r > 1 ? 'stops' : 'stop'}`)),
)
const trocarFilme = () => {
  receita.copia = $('copia').value
  receita.negativo = $('negativo').value
  receita.luzCopia = $('luz-copia').value
  receita.revelacao = $('revelacao').value === '' ? null : Number($('revelacao').value)
  const uso = peliculaEmUso()
  $('qual-negativo').textContent = uso.negativo
  $('qual-copia').textContent = uso.copia
  refazer()
  trocouLook()
}
for (const id of ['copia', 'negativo', 'luz-copia', 'revelacao']) $(id).addEventListener('change', trocarFilme)

/** Fichas no lugar de uma lista: cada opção do <select> escondido vira um botão; o select continua sendo a verdade. */
function fichasDe(select, onde, curto) {
  const marcar = () => {
    for (const b of onde.children) b.setAttribute('aria-checked', String(b.dataset.valor === select.value))
  }
  onde.replaceChildren(
    ...[...select.options].map((o) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'lab-grupo'
      b.setAttribute('role', 'radio')
      b.dataset.valor = o.value
      b.textContent = curto(o.value)
      b.title = o.textContent
      b.addEventListener('click', () => {
        select.value = o.value
        select.dispatchEvent(new Event('change'))
        marcar()
      })
      return b
    }),
  )
  return marcar
}
const acenderCopias = fichasDe($('copia'), $('copias'), (v) => (v === '' ? 'Da base' : v === 'nenhuma' ? 'Sem' : v))
const acenderLuzes = fichasDe($('luz-copia'), $('luzes'), (v) => v || 'Da base')
const acenderRevelacoes = fichasDe($('revelacao'), $('revelacoes'), (v) => (v === '' ? 'Da base' : Number(v) > 0 ? `+${v}` : v === '0' ? 'Normal' : `−${-Number(v)}`))

// uma lata de filme para cada negativo: a cor do rótulo diz a luz (tungstênio azul, dia âmbar ou verde)
const curtoDe = (nome) => /(\d+[TD]?)\s*$/.exec(nome)?.[1] ?? nome
const familiaDe = (nome) => nome.replace(/\s*\d+[TD]?\s*$/, '')
function desenharLatas() {
  const lata = (valor, numero, familia, tipo, titulo) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'lata'
    b.dataset.valor = valor
    b.dataset.tipo = tipo
    b.title = titulo
    b.setAttribute('role', 'radio')
    b.setAttribute('aria-label', titulo)
    const tampa = document.createElement('span')
    tampa.className = 'lata-tampa'
    const rotulo = document.createElement('span')
    rotulo.className = 'lata-rotulo'
    rotulo.append(Object.assign(document.createElement('strong'), { textContent: numero }), Object.assign(document.createElement('small'), { textContent: familia }))
    tampa.append(rotulo)
    b.append(tampa)
    b.addEventListener('click', () => {
      $('negativo').value = valor
      $('negativo').dispatchEvent(new Event('change'))
      acenderLatas()
    })
    return b
  }
  $('latas').replaceChildren(
    lata('', 'Base', 'da base', 'base', 'O negativo da base'),
    lata('digital', 'Digital', 'sem filme', 'digital', 'Digital: a câmera, sem negativo'),
    ...NEGATIVOS.map((n) => lata(n.id, curtoDe(n.nome), familiaDe(n.nome), `${n.fabricante === 'Kodak' ? 'k' : 'f'}${n.luz}`, `${n.nome} · ${n.numero}. ${n.frase ?? ''}`.trim())),
  )
}
function acenderLatas() {
  for (const b of $('latas').children) {
    const acesa = b.dataset.valor === $('negativo').value
    b.setAttribute('aria-checked', String(acesa))
    // só a fileira anda (de lado): a página não pula até o painel quando a base muda
    if (acesa) {
      const fila = $('latas')
      const alvo = b.offsetLeft - (fila.clientWidth - b.offsetWidth) / 2
      if (b.offsetLeft < fila.scrollLeft || b.offsetLeft + b.offsetWidth > fila.scrollLeft + fila.clientWidth) fila.scrollLeft = Math.max(0, alvo)
    }
  }
}
desenharLatas()

/** O negativo e a cópia que estão valendo (os da base, quando a pessoa não trocou). */
function peliculaEmUso() {
  const p = baseDoLab(receita.base)
  const idNeg = receita.negativo || p?.negativoFicha || 'digital'
  const idCop = receita.copia || p?.copia || 'nenhuma'
  const neg = NEGATIVOS.find((n) => n.id === idNeg)
  const cop = COPIAS_LAB.find((c) => c.id === idCop)
  return { negativo: neg ? neg.nome : 'Digital', copia: idCop === 'nenhuma' || !cop ? 'Sem cópia' : cop.nome.replace(/^Cópia /, '') }
}
mostrarFilme()
$('expandido').addEventListener('change', () => {
  receita.expandido = $('expandido').checked
  refazer()
  trocouLook()
})
function mostrarFilme() {
  // o "da base" diz qual é a película da base
  const p = baseDoLab(receita.base)
  const neg = NEGATIVOS_LAB.find((n) => n.id === p?.negativoFicha)
  const cop = COPIAS_LAB.find((c) => c.id === p?.copia)
  $('negativo').options[0].textContent = `Negativo da base · ${neg ? neg.nome : 'digital'}`
  $('copia').options[0].textContent = `Cópia da base · ${cop ? cop.nome : 'sem cópia'}`
  $('copia').value = receita.copia ?? ''
  $('negativo').value = receita.negativo ?? ''
  $('luz-copia').value = receita.luzCopia ?? ''
  $('revelacao').value = receita.revelacao == null ? '' : String(receita.revelacao)
  $('expandido').checked = !!receita.expandido
  acenderLatas()
  acenderCopias()
  acenderLuzes()
  acenderRevelacoes()
  const uso = peliculaEmUso()
  $('qual-negativo').textContent = uso.negativo
  $('qual-copia').textContent = uso.copia
}

$('intensidade').addEventListener('input', () => {
  receita.intensidade = Number($('intensidade').value) / 100
  $('valor-intensidade').textContent = `${$('intensidade').value}%`
  agendar()
})
$('intensidade').addEventListener('change', () => refazer())

// ─────────── saída ───────────

const nome = () => $('nome-look').value.trim().replace(/\s+/g, ' ').slice(0, 40) || 'Meu look'
const arquivoBase = () =>
  nome()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'meu-look'

function baixarTexto(texto, arquivo) {
  // octet-stream: no iPhone, text/plain vira "arquivo.cube.txt"
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = arquivo
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

$('editor').addEventListener('change', () => {
  const t = String(EDITORES[$('editor').value] ?? 33)
  for (const r of raiz.querySelectorAll('input[name=tamanho]')) r.checked = r.value === t
})

$('baixar').addEventListener('click', async () => {
  const tamanho = Number(raiz.querySelector('input[name=tamanho]:checked').value)
  avisar(`Gerando a LUT de ${tamanho} pontos…`)
  await espera()
  const de = ENTRADAS_LAB.find((e) => e.id === receita.entrada)?.nome ?? 'Rec.709'
  const texto = escreverCube(assar(lookAtual().aplicar, tamanho), `Revela Lab - ${nome()}`, [
    `Revela Lab · ${nome()}`,
    `Entrada: ${receita.entrada === 'still' ? 'Rec.709 Gama 2.4 (material já tratado)' : de}`,
    'Saída: Rec.709 Gama 2.4 (BT.1886). Faixa full. Interpolação tetraédrica.',
  ])
  baixarTexto(texto, `revela-lab-${arquivoBase()}${receita.entrada === 'still' ? '' : `-${receita.entrada}`}-${tamanho}.cube`)
  avisar(`LUT de ${tamanho} pontos baixada. No Resolve: nó do grade › botão direito › LUT. Para finalizar em log, use o pacote profissional.`)
})

// o pacote profissional sai num worker (são 5 LUTs, 3 delas de 65 pontos, e o controle de qualidade)
let fabrica = null
$('baixar-pacote').addEventListener('click', () => {
  const botao = $('baixar-pacote')
  botao.disabled = true
  avisar('Montando o pacote: look em log, LUT do monitor, CDL e controle de qualidade…')
  fabrica ??= new Worker(new URL('./pacote-worker.js', import.meta.url), { type: 'module' })
  fabrica.onmessage = ({ data }) => {
    botao.disabled = false
    if (!data.ok) return avisar(`Não deu para montar o pacote: ${data.erro}`, true)
    const url = URL.createObjectURL(new Blob([data.zip], { type: 'application/zip' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.pasta}.zip`
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
    const qc = $('qc')
    qc.hidden = false
    qc.classList.toggle('reprovado', !data.qc.ok)
    qc.textContent = data.qc.ok ? 'Controle de qualidade: aprovado' : 'Controle de qualidade: reprovado (veja o relatório)'
    qc.title = data.qc.verificacoes.map((v) => `${v.ok ? '✓' : '✗'} ${v.nome}: ${v.valor}`).join('\n')
    avisar('Pacote baixado. O LEIA-ME diz a ordem: correção (CDL) → look (LMT) → saída do projeto.')
  }
  fabrica.onerror = () => {
    botao.disabled = false
    avisar('Não deu para montar o pacote neste navegador.', true)
  }
  fabrica.postMessage({ receita: { ...receita, nome: nome() } })
})

// o Lab como nó do Resolve: a mesma conta do look, com os controles dentro do DaVinci (a correção do frame fica de fora)
$('baixar-no').addEventListener('click', () => {
  baixarTexto(escreverDctlLab({ ...receita, nome: nome(), correcao: null }, { titulo: `Revela · ${nome()} · Lab` }), `Revela-Lab-${arquivoBase()}.dctl`)
  avisar('Nó baixado. No Resolve Studio: copie para a pasta de LUTs, reinicie e escolha em ResolveFX Color › DCTL. Linha do tempo em DaVinci Wide Gamut / Intermediate.')
})

$('baixar-receita').addEventListener('click', () => {
  baixarTexto(escreverReceita({ ...receita, nome: nome() }), `${arquivoBase()}.revela`)
  avisar('Receita baixada. Abra aqui no Lab para continuar de onde parou.')
})

$('salvar').addEventListener('click', () => {
  let lista = []
  try {
    lista = JSON.parse(localStorage.getItem(CHAVE_MEUS) ?? '[]')
    if (!Array.isArray(lista)) lista = []
  } catch {
    lista = []
  }
  lista = lista.filter((l) => l?.id?.startsWith(PREFIXO))
  if (lista.length >= MAX_LOOKS) return avisar(`Já tem ${MAX_LOOKS} looks salvos. Apague um na tela de LUT para salvar outro.`, true)
  // Meus looks vivem na tela de LUT, com frames Rec.709: o look entra pelo caminho do still
  lista.push(empacotar(criarLab({ ...receita, entrada: 'still' }).aplicar, nome()))
  try {
    localStorage.setItem(CHAVE_MEUS, JSON.stringify(lista))
    avisar(`"${nome()}" está em Meus looks, na tela de LUT.`)
  } catch {
    avisar('Este navegador não deixou salvar (janela privada ou sem espaço). Baixe a receita.', true)
  }
})

$('arquivo-receita').addEventListener('change', async (e) => {
  const arquivo = e.target.files[0]
  e.target.value = ''
  if (!arquivo) return
  try {
    const lida = lerReceita(await arquivo.text())
    // a correção da receita era do frame de quem salvou: aqui vale a leitura deste frame
    receita = { ...lida, correcao: lida.correcao && correcaoLida ? { exposicao: correcaoLida.exposicao, ganhos: correcaoLida.ganhos } : lida.correcao }
    $('entrada').value = receita.entrada
    escolhida = true
    mostrarAutopilot(`${nomeDaEntrada()} · da receita`, false)
    mostrarFilme()
    desenharTextura()
    $('nome-look').value = lida.nome
    $('intensidade').value = String(Math.round(receita.intensidade * 100))
    $('valor-intensidade').textContent = `${$('intensidade').value}%`
    grupo = GRUPOS.find((g) => g.looks.some((l) => l.id === receita.base))?.id ?? 'revela'
    desenharGrupos()
    desenharAjustes()
    mostrarCorrecao()
    desenharBases()
    refazer()
    avisar(frame ? `Receita "${lida.nome}" aberta.` : `Receita "${lida.nome}" aberta. Agora traga um frame.`)
  } catch (erro) {
    avisar(erro.message, true)
  }
})

// ─────────── mais imagem: a prévia na tela toda e os controles numa barra ───────────

// os ajustes que se mexe olhando a imagem; o resto continua no painel
const FERRAMENTAS = [
  { id: 'luz', nome: 'Luz' },
  { id: 'temperatura', nome: 'Temperatura', curto: 'Temp' },
  { id: 'contraste', nome: 'Contraste' },
  { id: 'cor', nome: 'Cor' },
  { id: 'intensidade', nome: 'Intensidade do look', curto: 'Look' },
]
let ferramenta = 'luz'
let divisaoGuardada = '50'
// a barra não guarda valor nenhum: mexe nos mesmos controles do painel
const alvoDaBarra = () => (ferramenta === 'intensidade' ? $('intensidade') : $(`aj-${ferramenta}`))

function mostrarBarra() {
  const alvo = alvoDaBarra()
  const barra = $('hud-barra')
  Object.assign(barra, { min: alvo.min, max: alvo.max })
  barra.value = alvo.value
  $('hud-nome').textContent = FERRAMENTAS.find((f) => f.id === ferramenta).nome
  $('hud-numero').textContent = ferramenta === 'intensidade' ? `${alvo.value}%` : formatar(Number(alvo.value))
  for (const b of $('hud-ferramentas').children) b.setAttribute('aria-checked', String(b.dataset.ferramenta === ferramenta))
  const uso = peliculaEmUso()
  $('hud-base').textContent = baseDoLab(receita.base)?.nome ?? ''
  $('hud-negativo').textContent = uso.negativo
  $('hud-copia').textContent = uso.copia
}
$('hud-ferramentas').replaceChildren(
  ...FERRAMENTAS.map((f) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.ferramenta = f.id
    b.textContent = f.curto ?? f.nome
    b.title = f.nome
    b.setAttribute('role', 'radio')
    b.addEventListener('click', () => {
      ferramenta = f.id
      mostrarBarra()
      $('hud-barra').focus({ preventScroll: true })
    })
    return b
  }),
)
$('hud-barra').addEventListener('input', () => {
  const alvo = alvoDaBarra()
  alvo.value = $('hud-barra').value
  alvo.dispatchEvent(new Event('input'))
  mostrarBarra()
})
$('hud-barra').addEventListener('change', () => alvoDaBarra().dispatchEvent(new Event('change')))
// duplo clique volta ao neutro, como no painel (a intensidade volta a 100%)
$('hud-barra').addEventListener('dblclick', () => {
  const alvo = alvoDaBarra()
  if (ferramenta === 'intensidade') {
    alvo.value = 100
    alvo.dispatchEvent(new Event('input'))
    alvo.dispatchEvent(new Event('change'))
  } else alvo.dispatchEvent(new Event('dblclick'))
  mostrarBarra()
})
// look, negativo e cópia: um passo para cada lado, dando a volta
const TODAS_AS_BASES = GRUPOS.flatMap((g) => g.looks)
function passo(qual, dir) {
  const girar = (lista, atual) => lista[(lista.indexOf(atual) + dir + lista.length) % lista.length]
  if (qual === 'base') escolherBase(girar(TODAS_AS_BASES.map((l) => l.id), receita.base))
  else {
    const lista = $(qual)
    lista.value = girar([...lista.options].map((o) => o.value), lista.value)
    lista.dispatchEvent(new Event('change'))
    mostrarFilme()
  }
  mostrarBarra()
}
for (const b of raiz.querySelectorAll('.hud-passo button')) b.addEventListener('click', () => passo(b.closest('.hud-passo').dataset.passo, Number(b.dataset.ir)))

function imagemCheia(liga) {
  if (liga === raiz.classList.contains('imagem-cheia')) return
  raiz.classList.toggle('imagem-cheia', liga)
  document.documentElement.classList.toggle('so-imagem', liga)
  $('hud').hidden = !liga
  if (liga) {
    // na tela toda só o look aparece; "Antes" fica num botão de segurar
    divisaoGuardada = $('divisao').value
    $('divisao').value = 0
    mostrarBarra()
    $('hud-barra').focus({ preventScroll: true })
  } else {
    $('divisao').value = divisaoGuardada
    $('hud-comparar').setAttribute('aria-pressed', 'false')
    $('imagem-cheia').focus({ preventScroll: true })
  }
  pintar()
}
$('imagem-cheia').addEventListener('click', () => imagemCheia(true))
$('hud-sair').addEventListener('click', () => imagemCheia(false))
addEventListener('keydown', (e) => e.key === 'Escape' && raiz.classList.contains('imagem-cheia') && !$('ficha').open && imagemCheia(false))
// "Antes": segurar mostra o frame sem o look; no teclado, liga e desliga
function comparar(liga) {
  $('hud-comparar').setAttribute('aria-pressed', String(liga))
  $('divisao').value = liga ? 100 : 0
  pintar()
}
$('hud-comparar').addEventListener('pointerdown', () => comparar(true))
for (const fim of ['pointerup', 'pointerleave', 'pointercancel']) $('hud-comparar').addEventListener(fim, () => comparar(false))
$('hud-comparar').addEventListener('click', (e) => e.detail === 0 && comparar($('hud-comparar').getAttribute('aria-pressed') !== 'true'))
// quem sai da aba do Lab com a imagem na tela toda volta ao painel
addEventListener('revela:pagina', (e) => e.detail !== 'lab' && imagemCheia(false))

// ─────────── ficha de apresentação ───────────

const CAMPOS_FICHA = ['titulo', 'direcao', 'fotografia', 'cor', 'ano', 'camera']
let quadroFicha = null // { canvas, paleta }: o quadro com o look, no tamanho da ficha
let marcaFicha = null

/** O quadro inteiro com o look (e a textura), maior que a prévia, e as cores dominantes dele. */
function revelarQuadro() {
  const base = desenhar(frame.bm, LADO_FICHA)
  const look = lookAtual()
  const canvas = texturaAtiva(receita.textura) ? pintarComTextura(look, 33, base) : pintarCom(base, look.aplicar, 33)
  const mini = document.createElement('canvas')
  const escala = Math.min(1, 256 / Math.max(canvas.width, canvas.height))
  mini.width = Math.max(1, Math.round(canvas.width * escala))
  mini.height = Math.max(1, Math.round(canvas.height * escala))
  const ctx = mini.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(canvas, 0, 0, mini.width, mini.height)
  return { canvas, paleta: paletaDominante(ctx.getImageData(0, 0, mini.width, mini.height).data, mini.width, mini.height, 5) }
}

function pintarFicha() {
  if (!quadroFicha) return
  const valor = (id) => $(`ficha-${id}`).value
  const uso = peliculaEmUso()
  const textura = PRESETS_TEXTURA.find((p) => Object.entries({ ...TEXTURA_NEUTRA, ...p.valores }).every(([k, v]) => receita.textura[k] === v))
  const plano = montarFicha({
    titulo: valor('titulo'),
    creditos: { direcao: valor('direcao'), fotografia: valor('fotografia'), cor: valor('cor'), ano: valor('ano') },
    tecnica: {
      copia: uso.copia,
      negativo: uso.negativo,
      look: baseDoLab(receita.base)?.nome ?? '',
      camera: valor('camera'),
      formato: `${frame.bm.width} × ${frame.bm.height}`,
      textura: !texturaAtiva(receita.textura) ? '' : (textura?.nome ?? 'Sob medida'),
    },
    paleta: quadroFicha.paleta,
    proporcao: quadroFicha.canvas.width / quadroFicha.canvas.height,
    formato: raiz.querySelector('input[name=ficha-formato]:checked').value,
    tema: raiz.querySelector('input[name=ficha-tema]:checked').value,
  })
  const tela = $('ficha-tela')
  tela.width = plano.w
  tela.height = plano.h
  desenharFicha(tela.getContext('2d'), plano, { imagem: quadroFicha.canvas, marca: marcaFicha })
}

$('abrir-ficha').addEventListener('click', async () => {
  if (!frame) return
  avisar('Revelando o quadro da ficha…')
  await espera()
  let guardado = {}
  try {
    guardado = JSON.parse(localStorage.getItem(CHAVE_FICHA) ?? '{}') ?? {}
  } catch {
    guardado = {}
  }
  for (const id of CAMPOS_FICHA) if (typeof guardado[id] === 'string' && !$(`ficha-${id}`).value) $(`ficha-${id}`).value = guardado[id].slice(0, 48)
  // a marca da câmera já sai do Autopilot; o modelo, a pessoa escreve
  if (!$('ficha-camera').value && receita.entrada !== 'still') $('ficha-camera').value = nomeDaEntrada().split(' · ')[0]
  if (!$('ficha-ano').value) $('ficha-ano').value = String(new Date().getFullYear())
  try {
    quadroFicha = revelarQuadro()
    marcaFicha ??= await new Promise((ok) => {
      const img = new Image()
      img.onload = () => ok(img)
      img.onerror = () => ok(null)
      img.src = 'marca/revela-icone.svg'
    })
    await document.fonts?.load("800 40px 'Figtree Variable'").catch(() => {})
  } catch {
    return avisar('Não deu para montar a ficha deste frame.', true)
  }
  avisar('')
  pintarFicha()
  $('ficha').showModal()
})
for (const id of CAMPOS_FICHA)
  $(`ficha-${id}`).addEventListener('input', () => {
    pintarFicha()
    try {
      localStorage.setItem(CHAVE_FICHA, JSON.stringify(Object.fromEntries(CAMPOS_FICHA.map((c) => [c, $(`ficha-${c}`).value]))))
    } catch {
      // sem lembrança neste navegador
    }
  })
for (const r of raiz.querySelectorAll('input[name=ficha-formato], input[name=ficha-tema]')) r.addEventListener('change', pintarFicha)
$('ficha').addEventListener('click', (e) => e.target === $('ficha') && $('ficha').close())
$('ficha').addEventListener('close', () => (quadroFicha = null))
$('ficha-baixar').addEventListener('click', () => {
  $('ficha-tela').toBlob((blob) => {
    if (!blob) return avisar('Não deu para gerar a imagem da ficha.', true)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ficha-${arquivoBase()}-${raiz.querySelector('input[name=ficha-formato]:checked').value}.png`
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }, 'image/png')
})

/** ?base=negativo-500t (vindo de Revela Looks) escolhe a base; ?exemplo abre o frame de exemplo. */
function aplicarPedido() {
  const pedido = new URLSearchParams(location.search)
  const base = baseDoLab(pedido.get('base') ?? '')
  if (base) {
    receita.base = base.id
    grupo = GRUPOS.find((g) => g.looks.includes(base)).id
    desenharGrupos()
    desenharBases()
    refazer()
  }
  if (pedido.has('exemplo') && !frame) $('lab-exemplo').click()
}

desenharGrupos()
desenharAjustes()
aplicarPedido()
// o painel do Lab fica guardado entre as abas: quem chega de novo por um link com ?base= escolhe de novo
addEventListener('revela:pagina', (e) => e.detail === 'lab' && aplicarPedido())
