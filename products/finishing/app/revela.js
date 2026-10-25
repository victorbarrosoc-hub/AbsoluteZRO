// Revela · tela da referência → LUT. Tudo roda no navegador: as imagens não saem do computador de quem usa.
//
// Fluxo: duas imagens → análise (uma vez) → look → LUT 33³ para a prévia (refeita quando a intensidade muda) →
// LUT no tamanho escolhido para baixar.

import { aplicar, assar, escreverCube } from '../src/cor/cube.js'
import { analisar, criarLook, descrever, descreverSaturacao } from '../src/cor/referencia.js'

const LADO_ANALISE = 1600 // a análise amostra até 80 mil pixels; mais que isso só gasta memória
const LADO_PREVIA = 1280

const $ = (id) => document.getElementById(id)
const estado = $('estado')
const imagens = { referencia: null, material: null }
let analise = null // { ref, mat, nomeRef, previa: ImageData do material }
let look = null
let lutPrevia = null
let camadas = null // { antes, depois } em canvas fora da tela

function avisar(texto, erro = false) {
  estado.textContent = texto
  estado.classList.toggle('erro', erro)
}

// ─────────── imagens ───────────

async function bitmap(arquivo) {
  // sem conversão de perfil: o que interessa é o código da imagem, como o Resolve exportou
  try {
    return await createImageBitmap(arquivo, { colorSpaceConversion: 'none' })
  } catch {
    return await createImageBitmap(arquivo)
  }
}

function desenhar(bm, lado) {
  const escala = Math.min(1, lado / Math.max(bm.width, bm.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bm.width * escala))
  c.height = Math.max(1, Math.round(bm.height * escala))
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bm, 0, 0, c.width, c.height)
  return ctx.getImageData(0, 0, c.width, c.height)
}

function paraPixels(dados) {
  const n = dados.width * dados.height
  const pixels = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    pixels[i * 3] = dados.data[i * 4] / 255
    pixels[i * 3 + 1] = dados.data[i * 4 + 1] / 255
    pixels[i * 3 + 2] = dados.data[i * 4 + 2] / 255
  }
  return { largura: dados.width, altura: dados.height, pixels }
}

async function receber(qual, arquivo) {
  if (!arquivo) return
  if (!arquivo.type.startsWith('image/')) return avisar('Esse arquivo não é uma imagem. Use PNG, JPEG ou WebP.', true)
  const caixa = $(qual === 'referencia' ? 'caixa-referencia' : 'caixa-material')
  try {
    const bm = await bitmap(arquivo)
    imagens[qual] = { arquivo, bm }
    const img = caixa.querySelector('img')
    if (img.src) URL.revokeObjectURL(img.src)
    img.src = URL.createObjectURL(arquivo)
    img.alt = qual === 'referencia' ? 'Referência escolhida' : 'Seu frame escolhido'
    img.hidden = false
    caixa.querySelector('.acao').textContent = `${arquivo.name} · trocar`
  } catch {
    return avisar('Não deu para abrir essa imagem neste navegador. Tente exportar em PNG.', true)
  }
  if (imagens.referencia && imagens.material) await calcular()
  else avisar(qual === 'referencia' ? 'Agora o seu frame.' : 'Agora a referência.')
}

for (const qual of ['referencia', 'material']) {
  const input = $(qual === 'referencia' ? 'arquivo-referencia' : 'arquivo-material')
  const caixa = $(qual === 'referencia' ? 'caixa-referencia' : 'caixa-material')
  input.addEventListener('change', () => receber(qual, input.files[0]))
  caixa.addEventListener('dragover', (e) => {
    e.preventDefault()
    caixa.classList.add('soltando')
  })
  caixa.addEventListener('dragleave', () => caixa.classList.remove('soltando'))
  caixa.addEventListener('drop', (e) => {
    e.preventDefault()
    caixa.classList.remove('soltando')
    receber(qual, e.dataTransfer.files[0])
  })
}

// ─────────── cálculo ───────────

const espera = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)))

async function calcular() {
  avisar('Lendo as duas imagens…')
  await espera()
  const ref = analisar(paraPixels(desenhar(imagens.referencia.bm, LADO_ANALISE)))
  const mat = analisar(paraPixels(desenhar(imagens.material.bm, LADO_ANALISE)))
  analise = { ref, mat, nomeRef: imagens.referencia.arquivo.name, previa: desenhar(imagens.material.bm, LADO_PREVIA) }
  await refazerLook()
}

async function refazerLook() {
  if (!analise) return
  avisar('Calculando o look…')
  await espera()
  look = criarLook(analise.ref, analise.mat, { tom: $('usar-tom').checked, cor: $('usar-cor').checked })
  mostrarLeitura()
  refazerPrevia()
  $('resultado').hidden = false
  avisar('Pronto. Arraste sobre a imagem para comparar.')
}

function intensidade() {
  return Number($('intensidade').value) / 100
}

function refazerPrevia() {
  const t = intensidade()
  lutPrevia = assar((r, g, b) => look.aplicar(r, g, b, t), 33)
  const { width: w, height: h, data } = analise.previa
  const depois = new ImageData(w, h)
  for (let i = 0; i < data.length; i += 4) {
    const o = aplicar(lutPrevia, data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
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
  camadas = { antes: camada(analise.previa), depois: camada(depois) }
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
  ctx.fillStyle = '#fff1dc' // linha da revelação, a mesma do símbolo
  ctx.fillRect(Math.max(0, x - 1), 0, 2, h)
}

function mostrarLeitura() {
  const { tom } = look.resumo
  const pct = (v) => `${Math.round(v * 100)}%`
  $('tom').textContent = $('usar-tom').checked
    ? `Preto em ${pct(tom.preto)}, cinza médio em ${pct(tom.cinza)}, branco em ${pct(tom.branco)} (luz percebida).`
    : 'Contraste desligado: a luz fica como está.'
  const lista = $('faixas')
  lista.replaceChildren(
    ...($('usar-cor').checked ? [descreverSaturacao(look.resumo), ...descrever(look.resumo)] : ['Cor desligada: as cores ficam como estão.']).map((frase) => {
      const li = document.createElement('li')
      li.textContent = frase
      return li
    }),
  )
}

// ─────────── controles ───────────

let agendado = 0
$('intensidade').addEventListener('input', () => {
  $('valor-intensidade').textContent = `${$('intensidade').value}%`
  cancelAnimationFrame(agendado)
  agendado = requestAnimationFrame(() => look && refazerPrevia())
})
$('divisao').addEventListener('input', pintar)
$('usar-tom').addEventListener('change', refazerLook)
$('usar-cor').addEventListener('change', refazerLook)

$('baixar').addEventListener('click', async () => {
  if (!look) return
  const botao = $('baixar')
  botao.disabled = true
  const tamanho = Number($('tamanho').value)
  avisar(`Gerando a LUT de ${tamanho} pontos…`)
  await espera()
  const t = intensidade()
  const lut = assar((r, g, b) => look.aplicar(r, g, b, t), tamanho)
  const base =
    analise.nomeRef
      .replace(/\.[^.]+$/, '')
      .replace(/[^\p{L}\p{N}_-]+/gu, '-')
      .slice(0, 60) || 'referencia'
  const texto = escreverCube(lut, `Revela - ${base} - ${Math.round(t * 100)}%`)
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `revela-${base}-${tamanho}.cube`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  botao.disabled = false
  avisar(`LUT de ${tamanho} pontos baixada. No Resolve: botão direito no nó › LUT, ou copie para a pasta de LUTs.`)
})
