// Revela · CST: o log da câmera para o espaço de cor de saída, numa LUT para o Resolve. As fórmulas ficam em
// src/cor/espacos.js; aqui é só a escolha, a prévia num frame (opcional) e o .cube.

import './conta.js'
import './menu.js'
import { aplicar, assar, escreverCube } from '../src/cor/cube.js'
import { ENTRADAS, SAIDAS, criarCst } from '../src/cor/espacos.js'
import { lerRelatorioSynquei, scriptPorClipe } from '../src/cor/porclipe.js'
import { escalonar, icones } from './visual.js'
import { avisarPendencias } from './baloes.js'
import { pendenciasCst } from '../src/pendencias.js'

icones()
escalonar()

// o painel desta ferramenta: as abas trocam de painel sem recarregar (app/navegar.js), então tudo é procurado aqui dentro
const raiz = document.querySelector('main')
const $ = (id) => raiz.querySelector(`#${id}`)
const LADO_PREVIA = 1280

for (const [id, lista, padrao] of [
  ['entrada', ENTRADAS, 'sony-slog3-cine'],
  ['saida', SAIDAS, 'rec709'],
]) {
  $(id).replaceChildren(...lista.map((e) => Object.assign(document.createElement('option'), { value: e.id, textContent: e.nome })))
  $(id).value = padrao
}

let frame = null // ImageData do still, na escala da prévia
let camadas = null

const atual = () => criarCst($('entrada').value, $('saida').value, { tom: $('deitar').checked ? 'suave' : 'nenhum' })

function avisar(texto, erro = false) {
  $('estado').textContent = texto
  $('estado').classList.toggle('erro', erro)
}

function refazer() {
  if (!frame) return
  const lut = assar(atual().aplicar, 33)
  const { width: w, height: h, data } = frame
  const depois = new ImageData(w, h)
  for (let i = 0; i < data.length; i += 4) {
    const o = aplicar(lut, data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
    depois.data[i] = Math.round(o[0] * 255)
    depois.data[i + 1] = Math.round(o[1] * 255)
    depois.data[i + 2] = Math.round(o[2] * 255)
    depois.data[i + 3] = 255
  }
  const camada = (dados) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d').putImageData(dados, 0, 0)
    return c
  }
  camadas = { antes: camada(frame), depois: camada(depois) }
  pintar()
}

function pintar() {
  if (!camadas) return
  const tela = $('previa')
  const { width: w, height: h } = camadas.antes
  tela.width = w
  tela.height = h
  const x = Math.round((Number($('divisao').value) / 100) * w)
  const ctx = tela.getContext('2d')
  ctx.drawImage(camadas.depois, 0, 0)
  ctx.drawImage(camadas.antes, 0, 0, x, h, 0, 0, x, h)
  ctx.fillStyle = '#fff4e0'
  ctx.fillRect(Math.max(0, x - 1), 0, 2, h)
}

async function receber(arquivo) {
  if (!arquivo) return
  if (!arquivo.type.startsWith('image/')) return avisar('Esse arquivo não é uma imagem. Use PNG, JPEG ou TIFF exportado em PNG.', true)
  try {
    let bm
    try {
      bm = await createImageBitmap(arquivo, { colorSpaceConversion: 'none' })
    } catch {
      bm = await createImageBitmap(arquivo)
    }
    const escala = Math.min(1, LADO_PREVIA / Math.max(bm.width, bm.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bm.width * escala))
    c.height = Math.max(1, Math.round(bm.height * escala))
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bm, 0, 0, c.width, c.height)
    frame = ctx.getImageData(0, 0, c.width, c.height)
  } catch {
    return avisar('Não deu para abrir essa imagem neste navegador. Tente exportar em PNG.', true)
  }
  $('caixa-frame').querySelector('.soltar-titulo').textContent = arquivo.name
  $('previa-cst').hidden = false
  refazer()
  avisar('Arraste sobre a imagem para comparar.')
}

$('frame').addEventListener('change', () => receber($('frame').files[0]))
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

for (const id of ['entrada', 'saida', 'deitar']) $(id).addEventListener('change', refazer)
$('divisao').addEventListener('input', pintar)

$('baixar').addEventListener('click', async () => {
  const botao = $('baixar')
  botao.disabled = true
  const tamanho = Number(raiz.querySelector('input[name=tamanho]:checked').value)
  avisar(`Gerando a LUT de ${tamanho} pontos…`)
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r)))
  const cst = atual()
  const texto = escreverCube(assar(cst.aplicar, tamanho), `Revela CST - ${cst.de.nome} para ${cst.para.nome}`)
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `revela-cst-${$('entrada').value}-para-${$('saida').value}-${tamanho}.cube`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  botao.disabled = false
  avisar(`LUT de ${tamanho} pontos baixada. No Resolve: primeiro nó, botão direito › LUT.`)
})

// ─────────── por clipe, a partir do relatório do Synquei ───────────
// O relatório diz a câmera de cada arquivo; a pessoa confirma o log de cada câmera; sai um script do Resolve que põe
// a LUT de CST no nó 1 de cada clipe (src/cor/porclipe.js).

let aparelhos = []

function baixarArquivo(texto, nome) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function mostrarCameras() {
  $('lista-cameras').replaceChildren(
    ...aparelhos.map((ap, i) => {
      const li = document.createElement('li')
      const nome = Object.assign(document.createElement('span'), { className: 'camera-nome', textContent: ap.nome })
      const qtd = Object.assign(document.createElement('span'), { className: 'ficha', textContent: String(ap.arquivos.length) })
      qtd.title = `${ap.arquivos.length} clipe(s)`
      const sel = document.createElement('select')
      sel.setAttribute('aria-label', `Log de ${ap.nome}`)
      sel.append(
        Object.assign(document.createElement('option'), { value: '', textContent: 'Sem log' }),
        ...ENTRADAS.map((e) => Object.assign(document.createElement('option'), { value: e.id, textContent: e.nome })),
      )
      sel.value = ap.entrada
      sel.addEventListener('change', () => {
        aparelhos[i].entrada = sel.value
        aparelhos[i].decidido = true // até "Sem log", escolhido pela pessoa, é decisão
        contar()
        $('baixar-script').disabled = !aparelhos.some((a) => a.entrada)
      })
      li.append(nome, qtd, sel)
      return li
    }),
  )
  $('cameras').hidden = false
  $('baixar-script').disabled = !aparelhos.some((a) => a.entrada)
  contar()
}

/** O balão da aba CST: câmeras do relatório sem log escolhido que a pessoa ainda não conferiu (src/pendencias.js). */
const contar = () => avisarPendencias('cst', pendenciasCst(aparelhos))

async function receberRelatorio(arquivo) {
  if (!arquivo) return
  try {
    const { aparelhos: lidos } = lerRelatorioSynquei(await arquivo.text())
    if (!lidos.length) return avisar('O relatório não tem clipes de vídeo.', true)
    aparelhos = lidos.map((a) => ({ ...a, entrada: a.sugestao }))
  } catch (e) {
    return avisar(e.message, true)
  }
  $('caixa-relatorio').querySelector('.soltar-titulo').textContent = arquivo.name
  mostrarCameras()
  const sem = aparelhos.filter((a) => !a.entrada).length
  avisar(sem ? `Confira o log de cada câmera. ${sem} sem log escolhido.` : 'Confira o log de cada câmera.')
}

$('relatorio').addEventListener('change', () => receberRelatorio($('relatorio').files[0]))
const caixaRel = $('caixa-relatorio')
caixaRel.addEventListener('dragover', (e) => {
  e.preventDefault()
  caixaRel.classList.add('soltando')
})
caixaRel.addEventListener('dragleave', () => caixaRel.classList.remove('soltando'))
caixaRel.addEventListener('drop', (e) => {
  e.preventDefault()
  caixaRel.classList.remove('soltando')
  receberRelatorio(e.dataTransfer.files[0])
})

/** .cube comprimido (deflate/zlib) em base64, para ir dentro do script. */
async function comprimir(texto) {
  const fluxo = new Blob([texto]).stream().pipeThrough(new CompressionStream('deflate'))
  const bytes = new Uint8Array(await new Response(fluxo).arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

$('baixar-script').addEventListener('click', async () => {
  const botao = $('baixar-script')
  botao.disabled = true
  avisar('Gerando as LUTs de cada câmera…')
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r)))
  const saida = SAIDAS.find((s) => s.id === $('saida').value)
  const tom = $('deitar').checked ? 'suave' : 'nenhum'
  const grupos = []
  const feitas = new Map()
  for (const ap of aparelhos.filter((a) => a.entrada)) {
    if (!feitas.has(ap.entrada)) {
      const cst = criarCst(ap.entrada, saida.id, { tom })
      feitas.set(ap.entrada, await comprimir(escreverCube(assar(cst.aplicar, 33), `Revela CST - ${cst.de.nome} para ${cst.para.nome}`)))
    }
    grupos.push({ entrada: ap.entrada, arquivos: ap.arquivos, lut: feitas.get(ap.entrada) })
  }
  baixarArquivo(scriptPorClipe(grupos, saida.nome), 'revela-cst-por-clipe.py')
  botao.disabled = false
  const n = grupos.reduce((s, g) => s + g.arquivos.length, 0)
  avisar(`Script baixado: CST em ${n} clipe(s). No Resolve: Workspace › Scripts.`)
})
