// Revela · CST: o log da câmera para o espaço de cor de saída, numa LUT para o Resolve. As fórmulas ficam em
// src/cor/espacos.js; aqui é só a escolha, a prévia num frame (opcional) e o .cube.

import './conta.js'
import { aplicar, assar, escreverCube } from '../src/cor/cube.js'
import { ENTRADAS, SAIDAS, criarCst } from '../src/cor/espacos.js'
import { escalonar, icones } from './visual.js'

icones()
escalonar()

const $ = (id) => document.getElementById(id)
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
  const tamanho = Number(document.querySelector('input[name=tamanho]:checked').value)
  avisar(`Gerando a LUT de ${tamanho} pontos…`)
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r)))
  const cst = atual()
  const texto = escreverCube(assar(cst.aplicar, tamanho), `Revela CST - ${cst.de.nome} para ${cst.para.nome}`)
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }))
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
