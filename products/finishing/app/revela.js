// Revela · tela da referência → LUT. Tudo roda no navegador: as imagens não saem do computador de quem usa.
//
// Fluxo: duas imagens → análise (uma vez) → look → LUT 33³ para a prévia (refeita quando a intensidade muda) →
// LUT no tamanho escolhido para baixar.

import './conta.js'
import { aplicar, assar, escreverCube } from '../src/cor/cube.js'
import { oklabParaCodigo } from '../src/cor/oklab.js'
import { amostrar, analisar, criarLook, descrever, descreverSaturacao } from '../src/cor/referencia.js'
import { ICONES, escalonar, icones, svg } from './visual.js'

icones()
escalonar()

const LADO_ANALISE = 1600 // a análise amostra até 80 mil pixels; mais que isso só gasta memória
const LADO_PREVIA = 1280

const $ = (id) => document.getElementById(id)
const estado = $('estado')
const imagens = { referencia: null, material: null }
let analise = null // { ref, mat, nomeRef, previa: ImageData do material }
let look = null
let lutPrevia = null
let camadas = null // { antes, depois } em canvas fora da tela
let pares = [] // conta-gotas: [{ ref: [L, a, b], mat: [L, a, b] }]
let pegando = null // null | { etapa: 'ref' | 'mat', ref?: [L, a, b] }

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

// Exemplo pronto (fotos do Unsplash em exemplos/): uma rua no pôr do sol como referência, outra de dia como frame.
$('exemplo')?.addEventListener('click', async () => {
  const pegar = async (url, nome) => new File([await (await fetch(url)).blob()], nome, { type: 'image/jpeg' })
  try {
    await receber('referencia', await pegar('exemplos/referencia-rua-dourada.jpg', 'rua-dourada.jpg'))
    await receber('material', await pegar('exemplos/material-rua-dia.jpg', 'rua-de-dia.jpg'))
    $('resultado').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  } catch {
    avisar('Não deu para abrir o exemplo agora.', true)
  }
})

// ─────────── cálculo ───────────

const espera = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)))

async function calcular() {
  avisar('Lendo as duas imagens…')
  await espera()
  const refImg = paraPixels(desenhar(imagens.referencia.bm, LADO_ANALISE))
  const matImg = paraPixels(desenhar(imagens.material.bm, LADO_ANALISE))
  analise = {
    ref: analisar(refImg),
    mat: analisar(matImg),
    refImg,
    matImg,
    nomeRef: imagens.referencia.arquivo.name,
    previa: desenhar(imagens.material.bm, LADO_PREVIA),
  }
  pares = [] // imagens novas: os pares antigos não valem mais
  cancelarPegada()
  mostrarPares()
  await refazerLook()
}

async function refazerLook() {
  if (!analise) return
  avisar('Calculando o look…')
  await espera()
  look = criarLook(analise.ref, analise.mat, { tom: $('usar-tom').checked, cor: $('usar-cor').checked, pares })
  mostrarLeitura()
  refazerPrevia()
  $('resultado').hidden = false
  avisar(
    pares.length
      ? `Pronto, com ${pares.length} ${pares.length > 1 ? 'pares' : 'par'} de cor. Arraste sobre a imagem para comparar.`
      : 'Pronto. Arraste sobre a imagem para comparar.',
  )
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
  ctx.fillStyle = '#fff4e0' // linha da comparação em papel, da paleta da marca
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

// ─────────── conta-gotas ───────────

const corCss = (lab) => {
  const [r, g, b] = oklabParaCodigo(...lab).map((v) => Math.round(v * 255))
  return `rgb(${r}, ${g}, ${b})`
}

function mostrarPares() {
  const lista = $('pares')
  lista.replaceChildren(
    ...pares.map((p, i) => {
      const li = document.createElement('li')
      const amostra = (lab, nome) => {
        const s = document.createElement('span')
        s.className = 'amostra-cor'
        s.style.background = corCss(lab)
        s.title = nome
        return s
      }
      li.setAttribute('aria-label', `Par ${i + 1}: seu frame → referência`)
      const remover = document.createElement('button')
      remover.type = 'button'
      remover.append(svg(ICONES.x))
      remover.setAttribute('aria-label', `Remover par ${i + 1}`)
      remover.addEventListener('click', () => {
        pares.splice(i, 1)
        mostrarPares()
        refazerLook()
      })
      li.append(amostra(p.mat, 'Seu frame'), amostra(p.ref, 'Referência'), remover)
      return li
    }),
  )
  $('limpar-pares').hidden = !pares.length
  $('marcar-par').disabled = pares.length >= 3
}

function cancelarPegada() {
  pegando = null
  $('marcar-par').setAttribute('aria-pressed', 'false')
  $('caixa-referencia').classList.remove('pegando')
  document.querySelector('.palco').classList.remove('pegando')
}

/** Posição relativa (0–1) do clique dentro da imagem que aparece, descontando as faixas pretas do `contain`. */
function posicaoNaImagem(el, e) {
  const caixa = el.getBoundingClientRect()
  const largura = el.naturalWidth ?? el.width
  const altura = el.naturalHeight ?? el.height
  const escala = Math.min(caixa.width / largura, caixa.height / altura)
  const w = largura * escala
  const h = altura * escala
  const x = (e.clientX - caixa.left - (caixa.width - w) / 2) / w
  const y = (e.clientY - caixa.top - (caixa.height - h) / 2) / h
  return x < 0 || x > 1 || y < 0 || y > 1 ? null : [x, y]
}

$('marcar-par').addEventListener('click', () => {
  if (pegando) {
    cancelarPegada()
    return avisar('Conta-gotas cancelado.')
  }
  pegando = { etapa: 'ref' }
  $('marcar-par').setAttribute('aria-pressed', 'true')
  $('caixa-referencia').classList.add('pegando')
  avisar('Clique num ponto da referência (lá em cima).')
  $('caixa-referencia').scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

$('caixa-referencia')
  .querySelector('img')
  .addEventListener('click', (e) => {
    if (pegando?.etapa !== 'ref') return
    e.preventDefault() // a imagem fica dentro do rótulo do arquivo: não abrir a escolha de arquivo
    const pos = posicaoNaImagem(e.currentTarget, e)
    if (!pos) return
    pegando = { etapa: 'mat', ref: amostrar(analise.refImg, ...pos) }
    $('caixa-referencia').classList.remove('pegando')
    document.querySelector('.palco').classList.add('pegando')
    avisar('Agora clique na mesma coisa no seu frame (na comparação).')
  })

$('previa').addEventListener('click', (e) => {
  if (pegando?.etapa !== 'mat') return
  const caixa = e.currentTarget.getBoundingClientRect()
  const pos = [(e.clientX - caixa.left) / caixa.width, (e.clientY - caixa.top) / caixa.height]
  pares.push({ ref: pegando.ref, mat: amostrar(analise.matImg, ...pos) })
  cancelarPegada()
  mostrarPares()
  refazerLook()
})

$('limpar-pares').addEventListener('click', () => {
  pares = []
  mostrarPares()
  refazerLook()
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pegando) {
    cancelarPegada()
    avisar('Conta-gotas cancelado.')
  }
})

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
  const tamanho = Number(document.querySelector('input[name=tamanho]:checked').value)
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
  avisar(`LUT de ${tamanho} pontos baixada. No Resolve: botão direito no nó › LUT.`)
})
