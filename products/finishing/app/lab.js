// Revela Lab · a tela. A pessoa traz um frame (ou usa o exemplo), escolhe a base, liga "Analisar e corrigir" e mexe
// nos ajustes; a prévia refaz na hora (LUT 17³ enquanto arrasta, 33³ quando solta). Sai .cube no tamanho do editor,
// a receita .revela e o look em Meus looks. Tudo no navegador: o frame não sai do aparelho.

import './conta.js'
import './menu.js'
import { aplicar, assar, escreverCube } from '../src/cor/cube.js'
import { AJUSTES, AJUSTES_NEUTROS, GRUPOS, analisarFrame, baseDoLab, criarLab, escreverReceita, lerReceita } from '../src/cor/lab.js'
import { MAX_LOOKS, PREFIXO, empacotar } from '../src/cor/meuslooks.js'
import { escalonar, icones } from './visual.js'

icones()
escalonar()

const raiz = document.querySelector('main')
const $ = (id) => raiz.querySelector(`#${id}`)
const LADO_PREVIA = 1280
const LADO_MINI = 300
const CHAVE_MEUS = 'revela-meus-looks'
const EDITORES = { resolve: 65, premiere: 33, fcp: 65, capcut: 33 }

let frame = null // { previa: ImageData, mini: ImageData, pixels: Float32Array }
let correcaoLida = null
let receita = { nome: 'Meu look', base: 'revela', intensidade: 1, correcao: null, ajustes: { ...AJUSTES_NEUTROS } }
let grupo = 'revela'
let corrigirSozinho = true // "Analisar e corrigir" começa ligado: quem não é colorista já ganha o frame equilibrado
let camadas = null

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

async function receber(arquivo) {
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
  frame = { previa, mini, pixels }
  correcaoLida = analisarFrame(pixels)
  if (receita.correcao || corrigirSozinho) receita.correcao = { exposicao: correcaoLida.exposicao, branco: correcaoLida.branco }
  $('lab').hidden = false
  $('lab-entrada').classList.add('compacta')
  mostrarCorrecao()
  desenharBases()
  refazer()
  avisar('')
}

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
    await receber(new File([await r.blob()], 'material-vestido.jpg', { type: 'image/jpeg' }))
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

function refazer(rapido = false) {
  if (!frame) return
  const antes = document.createElement('canvas')
  antes.width = frame.previa.width
  antes.height = frame.previa.height
  antes.getContext('2d').putImageData(frame.previa, 0, 0)
  camadas = { antes, depois: pintarCom(frame.previa, lookAtual().aplicar, rapido ? 17 : 33) }
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
  ctx.fillStyle = '#fff4e0'
  ctx.fillRect(x - 1, 0, 2, h)
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
      const mini = pintarCom(frame.mini, criarLab({ base: l.id, correcao: receita.correcao }).aplicar, 17)
      const nome = document.createElement('span')
      nome.className = 'look-nome'
      nome.textContent = l.nome
      b.append(mini, nome)
      b.addEventListener('click', () => {
        receita.base = l.id
        for (const x of $('bases').querySelectorAll('.look')) x.setAttribute('aria-checked', String(x === b))
        refazer()
      })
      return b
    }),
  )
}

// ─────────── correção e ajustes ───────────

function mostrarCorrecao() {
  $('corrigir').checked = !!receita.correcao
  $('leitura-correcao').textContent = receita.correcao && correcaoLida ? correcaoLida.leitura : ''
}
$('corrigir').addEventListener('change', () => {
  corrigirSozinho = false
  receita.correcao = $('corrigir').checked && correcaoLida ? { exposicao: correcaoLida.exposicao, branco: correcaoLida.branco } : null
  mostrarCorrecao()
  desenharBases()
  refazer()
})

const formatar = (v) => (v > 0 ? `+${v}` : String(v))
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
  $('ajustes').replaceChildren(
    ...AJUSTES.map((a) => {
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
    }),
  )
}
$('zerar').addEventListener('click', () => {
  receita.ajustes = { ...AJUSTES_NEUTROS }
  desenharAjustes()
  refazer()
})
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
  const texto = escreverCube(assar(lookAtual().aplicar, tamanho), `Revela Lab - ${nome()}`)
  baixarTexto(texto, `revela-lab-${arquivoBase()}-${tamanho}.cube`)
  avisar(`LUT de ${tamanho} pontos baixada. No Resolve: nó do grade › botão direito › LUT.`)
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
  lista.push(empacotar(lookAtual().aplicar, nome()))
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
    receita = { ...lida, correcao: lida.correcao && correcaoLida ? { exposicao: correcaoLida.exposicao, branco: correcaoLida.branco } : lida.correcao }
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

desenharGrupos()
desenharAjustes()
if (new URLSearchParams(location.search).has('exemplo')) $('lab-exemplo').click()
