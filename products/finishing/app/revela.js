// Revela · tela da referência → LUT. Tudo roda no navegador: as imagens não saem do computador de quem usa.
//
// Fluxo: duas imagens → análise (uma vez) → look → LUT 33³ para a prévia (refeita quando a intensidade muda) →
// LUT no tamanho escolhido para baixar.

import './conta.js'
import './menu.js'
import { aplicar, assar, escreverCube } from '../src/cor/cube.js'
import { oklabParaCodigo } from '../src/cor/oklab.js'
import { clonarLut } from '../src/cor/clonar.js'
import { presetLightroom } from '../src/cor/lightroom.js'
import { LOOKS, criarRevelaLook } from '../src/cor/looks.js'
import { amostrar, analisar, criarLook, descrever, descreverSaturacao } from '../src/cor/referencia.js'
import { ICONES, escalonar, icones, svg } from './visual.js'

icones()
escalonar()

const LADO_ANALISE = 1600 // a análise amostra até 80 mil pixels; mais que isso só gasta memória
const LADO_PREVIA = 1280

// o painel desta ferramenta: as abas trocam de painel sem recarregar (app/navegar.js), então tudo é procurado aqui dentro
const raiz = document.querySelector('main')
const $ = (id) => raiz.querySelector(`#${id}`)
const estado = $('estado')
const imagens = { referencia: null, material: null }
let analise = null // { ref, mat, nomeRef, previa: ImageData do material }
let look = null
let lutPrevia = null
let camadas = null // { antes, depois } em canvas fora da tela
let pares = [] // conta-gotas: [{ ref: [L, a, b], mat: [L, a, b] }]
let pegando = null // null | { etapa: 'ref' | 'mat', ref?: [L, a, b] }
let preset = null // id do look da Revela (src/cor/looks.js) quando ele está no lugar da referência
let refPropria = null // a referência que a pessoa trouxe, guardada para voltar a ela pela grade de looks
let lookRefPropria = null // o look dessa referência sobre o frame atual (para a miniatura da grade)
let clone = false // Clonar LUT: a caixa da esquerda é o frame COM a cor, a da direita o mesmo frame SEM (src/cor/clonar.js)

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

function desenharEm(bm, largura, altura) {
  const c = document.createElement('canvas')
  c.width = largura
  c.height = altura
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bm, 0, 0, largura, altura)
  return ctx.getImageData(0, 0, largura, altura)
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
    if (qual === 'referencia') {
      usarPreset(null)
      if (!clone) refPropria = imagens.referencia
    }
    lookRefPropria = null
    const img = caixa.querySelector('img')
    if (img.src) URL.revokeObjectURL(img.src)
    img.src = URL.createObjectURL(arquivo)
    imagens[qual].url = img.src
    img.alt = qual === 'referencia' ? 'Referência escolhida' : 'Seu frame escolhido'
    img.hidden = false
    caixa.querySelector('.acao').textContent = `${arquivo.name} · trocar`
  } catch {
    return avisar('Não deu para abrir essa imagem neste navegador. Tente exportar em PNG.', true)
  }
  if (imagens.referencia && imagens.material) await calcular()
  // só o frame: ele já entra com o Revela Look e a grade mostra todos os looks nele
  else if (qual === 'material' && !clone) await escolherLook('revela')
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

// Revela Look: o look de película da plataforma entra no lugar da referência. Uma imagem nova na referência volta ao
// look por referência.
function usarPreset(id) {
  preset = id
  if (id) usarClone(false)
  $('usar-look').setAttribute('aria-pressed', String(id === 'revela'))
  $('titulo-leitura').textContent = id ? 'Leitura do look' : clone ? 'Leitura do clone' : 'Leitura da referência'
}

// Clonar LUT: as duas caixas viram "com a cor" e "sem a cor" do mesmo frame. A LUT sai do pixel a pixel.
function usarClone(ligar) {
  clone = ligar
  $('usar-clone').setAttribute('aria-pressed', String(ligar))
  $('caixa-referencia').querySelector('strong').textContent = ligar ? 'Com a cor' : 'Referência'
  $('caixa-material').querySelector('strong').textContent = ligar ? 'Sem a cor' : 'Seu frame'
  $('titulo-leitura').textContent = ligar ? 'Leitura do clone' : preset ? 'Leitura do look' : 'Leitura da referência'
}

$('usar-clone').addEventListener('click', async () => {
  const ligar = !clone
  if (ligar && preset) {
    // o Revela Look não é imagem: a caixa da esquerda volta a esperar o frame com a cor
    usarPreset(null)
    imagens.referencia = null
    const img = $('caixa-referencia').querySelector('img')
    img.hidden = true
    img.removeAttribute('src')
    $('caixa-referencia').querySelector('.acao').textContent = 'Escolher ou soltar'
  }
  usarClone(ligar)
  if (imagens.referencia && imagens.material) await calcular()
  else avisar(ligar ? 'O mesmo frame duas vezes: com a cor e sem a cor.' : 'Escolha a referência e o seu frame.')
})

/** Põe um look da Revela no lugar da referência (a referência da pessoa fica guardada para a grade). */
async function escolherLook(id) {
  const dados = LOOKS.find((l) => l.id === id)
  usarPreset(id)
  imagens.referencia = { arquivo: { name: dados.nome }, preset: id }
  const caixa = $('caixa-referencia')
  const img = caixa.querySelector('img')
  if (img.src.startsWith('blob:') && img.src !== refPropria?.url) URL.revokeObjectURL(img.src)
  // a miniatura do look no seu frame, quando a grade já existe; senão a imagem do Revela Look
  img.src = $('looks').querySelector(`[data-look="${id}"] canvas`)?.toDataURL('image/jpeg', 0.85) ?? 'exemplos/revela-look.jpg'
  img.alt = dados.nome
  img.hidden = false
  caixa.querySelector('.acao').textContent = `${dados.nome} · trocar`
  if (imagens.material) await calcular()
  else avisar('Agora o seu frame.')
}

async function voltarParaReferencia() {
  if (!refPropria) return
  usarPreset(null)
  imagens.referencia = refPropria
  const caixa = $('caixa-referencia')
  const img = caixa.querySelector('img')
  img.src = refPropria.url
  img.alt = 'Referência escolhida'
  caixa.querySelector('.acao').textContent = `${refPropria.arquivo.name} · trocar`
  await calcular()
}

$('usar-look').addEventListener('click', () => escolherLook('revela'))

// Exemplo pronto (frames da ZRO Filmes em exemplos/): o cavalo no pôr do sol como referência, o vestido achatado como frame.
$('exemplo')?.addEventListener('click', async () => {
  const pegar = async (url, nome) => new File([await (await fetch(url)).blob()], nome, { type: 'image/jpeg' })
  try {
    await receber('referencia', await pegar('exemplos/referencia-cavalo.jpg', 'referencia-cavalo.jpg'))
    await receber('material', await pegar('exemplos/material-vestido.jpg', 'material-vestido.jpg'))
    $('resultado').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  } catch {
    avisar('Não deu para abrir o exemplo agora.', true)
  }
})

// Vindo do "Testar agora" da página inicial: o exemplo já abre carregado
if (new URLSearchParams(location.search).has('exemplo')) $('exemplo')?.click()

// ─────────── cálculo ───────────

const espera = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)))

async function calcular() {
  avisar('Lendo as duas imagens…')
  await espera()
  const matImg = paraPixels(desenhar(imagens.material.bm, LADO_ANALISE))
  if (clone) {
    const a = imagens.material.bm
    const d = imagens.referencia.bm
    if (Math.abs(a.width / a.height - d.width / d.height) > 0.02) return avisar('As duas imagens precisam ser o mesmo frame, no mesmo enquadramento.', true)
    // o "com a cor" é desenhado exatamente no tamanho do "sem a cor": pixel com pixel
    const depois = paraPixels(desenharEm(d, matImg.largura, matImg.altura))
    analise = { clone: clonarLut(matImg, depois), matImg, nomeRef: 'clone', previa: desenhar(a, LADO_PREVIA) }
    pares = []
    cancelarPegada()
    $('looks').hidden = true
    return refazerLook()
  }
  const refImg = preset ? null : paraPixels(desenhar(imagens.referencia.bm, LADO_ANALISE))
  analise = {
    ref: preset ? null : analisar(refImg),
    mat: preset ? null : analisar(matImg),
    refImg,
    matImg,
    nomeRef: imagens.referencia.arquivo.name,
    previa: desenhar(imagens.material.bm, LADO_PREVIA),
  }
  pares = [] // imagens novas: os pares antigos não valem mais
  cancelarPegada()
  mostrarPares()
  await refazerLook()
  desenharLooks()
}

async function refazerLook() {
  if (!analise) return
  avisar('Calculando o look…')
  await espera()
  const usar = { tom: $('usar-tom').checked, cor: $('usar-cor').checked }
  look = analise.clone ?? (preset ? criarRevelaLook({ ...usar, look: preset }) : criarLook(analise.ref, analise.mat, { ...usar, pares }))
  raiz.querySelector('.rotulo-depois').textContent = preset ? look.nome : 'Depois'
  for (const b of $('looks').querySelectorAll('[data-look]'))
    b.setAttribute('aria-checked', String(b.dataset.look === (preset ?? (analise.clone ? '' : 'ref'))))
  mostrarPares()
  mostrarLeitura()
  refazerPrevia()
  $('resultado').hidden = false
  avisar(
    pares.length
      ? `Pronto, com ${pares.length} ${pares.length > 1 ? 'pares' : 'par'} de cor. Arraste sobre a imagem para comparar.`
      : 'Pronto. Arraste sobre a imagem para comparar.',
  )
}

// ─────────── grade de looks ───────────
// Todos os looks no mesmo frame, lado a lado: compara num olhar, sem ler nada. O nome fica no title e no rótulo do palco.

const LADO_MINI = 360

function miniatura(previa) {
  const escala = Math.min(1, LADO_MINI / previa.width)
  const c = document.createElement('canvas')
  c.width = Math.round(previa.width * escala)
  c.height = Math.round(previa.height * escala)
  const fonte = document.createElement('canvas')
  fonte.width = previa.width
  fonte.height = previa.height
  fonte.getContext('2d').putImageData(previa, 0, 0)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(fonte, 0, 0, c.width, c.height)
  return ctx.getImageData(0, 0, c.width, c.height)
}

function pintarMini(base, aplicarLook) {
  const lut = assar(aplicarLook, 17)
  const out = new ImageData(base.width, base.height)
  for (let i = 0; i < base.data.length; i += 4) {
    const o = aplicar(lut, base.data[i] / 255, base.data[i + 1] / 255, base.data[i + 2] / 255)
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

function botaoLook(id, nome, canvas, escolher) {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'look'
  b.dataset.look = id
  b.title = nome
  b.setAttribute('role', 'radio')
  b.setAttribute('aria-label', nome)
  b.setAttribute('aria-checked', 'false')
  b.append(canvas)
  b.addEventListener('click', escolher)
  return b
}

function desenharLooks() {
  if (!analise || analise.clone) return
  const base = miniatura(analise.previa)
  const botoes = LOOKS.map((l) =>
    botaoLook(l.id, l.nome, pintarMini(base, criarRevelaLook({ look: l.id }).aplicar), () => escolherLook(l.id)),
  )
  // a referência da pessoa entra primeiro: é a LUT que nasce do frame dela
  if (refPropria && imagens.material) {
    if (!lookRefPropria) {
      const refImg = refPropria === imagens.referencia ? analise.refImg : paraPixels(desenhar(refPropria.bm, LADO_ANALISE))
      lookRefPropria = criarLook(analise.ref ?? analisar(refImg), analise.mat ?? analisar(analise.matImg))
    }
    botoes.unshift(botaoLook('ref', 'Sua referência', pintarMini(base, lookRefPropria.aplicar), voltarParaReferencia))
  }
  $('looks').replaceChildren(...botoes)
  $('looks').hidden = false
  for (const b of botoes) b.setAttribute('aria-checked', String(b.dataset.look === (preset ?? 'ref')))
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
  if (look.preset === 'clone') {
    const { erro } = look.resumo
    $('tom').textContent = 'Feita do mesmo frame, com e sem a cor.'
    $('faixas').replaceChildren(
      ...[`No próprio frame, a LUT fica a ${(erro * 100).toFixed(1)}% do original com a cor.`, 'Cores que o frame não tem seguem a correção geral.'].map(
        (frase) => Object.assign(document.createElement('li'), { textContent: frase }),
      ),
    )
    return
  }
  const { tom } = look.resumo
  const pct = (v) => `${Math.round(v * 100)}%`
  $('tom').textContent = $('usar-tom').checked
    ? `Preto em ${pct(tom.preto)}, cinza médio em ${pct(tom.cinza)}, branco em ${pct(tom.branco)} (luz percebida).`
    : 'Contraste desligado: a luz fica como está.'
  const lista = $('faixas')
  const frases = look.preset ? look.resumo.frases : [descreverSaturacao(look.resumo), ...descrever(look.resumo)]
  lista.replaceChildren(
    ...($('usar-cor').checked ? frases : ['Cor desligada: as cores ficam como estão.']).map((frase) => {
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
  // o conta-gotas compara com uma referência: no Revela Look não há o que marcar
  $('marcar-par').disabled = Boolean(preset) || clone || pares.length >= 3
}

function cancelarPegada() {
  pegando = null
  $('marcar-par').setAttribute('aria-pressed', 'false')
  $('caixa-referencia').classList.remove('pegando')
  raiz.querySelector('.palco').classList.remove('pegando')
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
    raiz.querySelector('.palco').classList.add('pegando')
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

// Para qual editor: todos leem .cube; muda o tamanho que cada um aceita e onde se importa. 33 pontos é o que todo
// editor abre; 65 fica para o Resolve, que aguenta e ganha nos degradês.
const EDITORES = {
  resolve: { tamanho: null, dica: 'No Resolve: botão direito no nó › LUT.' },
  premiere: { tamanho: 33, dica: 'No Premiere: Lumetri › Criativo › Look › Procurar.' },
  fcp: { tamanho: 33, dica: 'No Final Cut: efeito LUT personalizada › Escolher LUT.' },
  capcut: { tamanho: 33, dica: 'No CapCut: Ajustar › LUT › Importar.' },
}
const CHAVE_EDITOR = 'revela-editor'
function mostrarEditor() {
  $('tamanhos').hidden = EDITORES[$('editor').value].tamanho !== null
}
try {
  const salvo = localStorage.getItem(CHAVE_EDITOR)
  if (EDITORES[salvo]) $('editor').value = salvo
} catch {
  // sem armazenamento: começa no Resolve
}
mostrarEditor()
$('editor').addEventListener('change', () => {
  mostrarEditor()
  try {
    localStorage.setItem(CHAVE_EDITOR, $('editor').value)
  } catch {
    // sem armazenamento: vale só nesta visita
  }
})

$('baixar').addEventListener('click', async () => {
  if (!look) return
  const botao = $('baixar')
  botao.disabled = true
  const editor = $('editor').value
  const tamanho = EDITORES[editor].tamanho ?? Number(raiz.querySelector('input[name=tamanho]:checked').value)
  avisar(`Gerando a LUT de ${tamanho} pontos…`)
  await espera()
  const t = intensidade()
  const lut = assar((r, g, b) => look.aplicar(r, g, b, t), tamanho)
  const base = nomeBase()
  const texto = escreverCube(lut, preset ? `${look.nome} - ${Math.round(t * 100)}%` : `Revela - ${base} - ${Math.round(t * 100)}%`)
  baixarTexto(texto, `revela-${base}-${tamanho}${editor === 'resolve' ? '' : `-${editor}`}.cube`)
  botao.disabled = false
  avisar(`LUT de ${tamanho} pontos baixada. ${EDITORES[editor].dica}`)
})

/** Nome do arquivo e do look, a partir do modo e da referência. */
function nomeBase() {
  if (preset) return preset === 'revela' ? 'look' : preset
  if (clone) return 'clone'
  return (
    analise.nomeRef
      .replace(/\.[^.]+$/, '')
      .replace(/[^\p{L}\p{N}_-]+/gu, '-')
      .slice(0, 60) || 'referencia'
  )
}

function baixarTexto(texto, nome) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// Preset para Lightroom: curvas e HSL que chegam perto do look (o Lightroom não aplica LUT em preset)
$('baixar-xmp').addEventListener('click', () => {
  if (!look) return
  const t = intensidade()
  const base = nomeBase()
  const nome = preset ? look.nome : clone ? 'Revela clone' : `Revela ${base}`
  baixarTexto(
    presetLightroom((r, g, b) => look.aplicar(r, g, b, t), nome),
    `revela-${base}.xmp`,
  )
  avisar('Preset baixado. No Lightroom: Predefinições › + › Importar.')
})
