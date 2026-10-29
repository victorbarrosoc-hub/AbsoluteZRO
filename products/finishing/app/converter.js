// Revela · conversor no navegador. Lê o arquivo com o Mediabunny (ProRes pelo decodificador
// WASM), converte com WebCodecs (hardware quando o aparelho deixa) e grava MP4 marcado BT.709. Nada sai do aparelho.

import './conta.js'
import './menu.js'
import * as MB from '../vendor/mediabunny.min.mjs'
import { registerProresDecoder } from '../vendor/mediabunny-prores.min.mjs'
import { assar } from '../src/cor/cube.js'
import { ENTRADAS, criarCst } from '../src/cor/espacos.js'
import { criarAplicadorLut } from './lut-gpu.js'
import { criarEscalaGpu } from './escala-gpu.js'
import { DESTINOS_CONVERSAO, LIMITE_MEMORIA, RESOLUCOES, nomeSaida, planejar, tamanhoLegivel } from '../src/conversao/plano.js'
import { ICONES, NOME_CURTO, escalonar, glifo, icones, svg } from './visual.js'
import { avisarPendencias } from './baloes.js'
import { pendenciasConverter } from '../src/pendencias.js'

registerProresDecoder()
// reduzir o quadro na placa de vídeo (app/escala-gpu.js); para comparar, ?escala=canvas fica no caminho do Mediabunny
// e ?escala=gpu usa a placa mesmo quando o WebGL é de software (testes)
const escala = new URLSearchParams(location.search).get('escala')
let escalouNaGpu = false
if (escala !== 'canvas')
  MB.registerVideoSampleTransformer(criarEscalaGpu(MB.VideoSample, { aoUsar: () => (escalouNaGpu = true), forcar: escala === 'gpu' }))
icones()
escalonar()

// o painel desta ferramenta: as abas trocam de painel sem recarregar (app/navegar.js), então tudo é procurado aqui dentro
const raiz = document.querySelector('main')
const $ = (id) => raiz.querySelector(`#${id}`)
const fila = []
let pasta = null // pasta escolhida para salvar direto no disco (computador)
let rodando = false

const NOMES_CODEC = { prores: 'ProRes', avc: 'H.264', hevc: 'HEVC', vp9: 'VP9', av1: 'AV1', vp8: 'VP8' }
const NOMES_RESOLUCAO = { original: 'Original', 2160: '4K', 1080: '1080p', 720: '720p' }
const duracaoLegivel = (s) => {
  if (s < 1) return 'menos de 1 s'
  const total = Math.round(s)
  const m = Math.floor(total / 60)
  const ss = total % 60
  return m ? `${m} min ${String(ss).padStart(2, '0')} s` : `${ss} s`
}
const nomeAudio = (c) => ({ aac: 'AAC', opus: 'Opus' })[c] ?? String(c).toUpperCase()
const avisar = (t) => ($('estado').textContent = t)
const no = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  n.append(...filhos.filter((f) => f != null))
  return n
}
const ficha = (texto, extra = '') => no('span', { className: `ficha ${extra}`.trim(), textContent: texto })

// ─────────── opções ───────────

$('destinos').append(
  ...DESTINOS_CONVERSAO.map((d, i) =>
    no(
      'label',
      { className: 'cartao', title: d.nome },
      no('input', { type: 'radio', name: 'destino', value: d.id, checked: i === 0 }),
      svg(glifo(d)),
      no('span', { textContent: NOME_CURTO[d.id] ?? d.nome }),
    ),
  ),
)
$('resolucoes').append(
  ...RESOLUCOES.map((r, i) =>
    no('label', { title: r.nome }, no('input', { type: 'radio', name: 'resolucao', value: String(r.id), checked: i === 0 }), NOMES_RESOLUCAO[r.id]),
  ),
)
// Arquivo em log: o CST da Revela leva ao Rec.709 no caminho (mesmas curvas da tela de CST)
$('cst').append(...ENTRADAS.map((e) => no('option', { value: e.id, textContent: e.nome })))
const marcado = (nome) => raiz.querySelector(`input[name=${nome}]:checked`).value
const destinoAtual = () => DESTINOS_CONVERSAO.find((d) => d.id === marcado('destino'))
const resolucaoAtual = () => (marcado('resolucao') === 'original' ? 'original' : Number(marcado('resolucao')))
const atualizar = () => fila.forEach((i) => i.estado === 'pronto' && mostrar(i))
$('destinos').addEventListener('change', () => {
  // vertical já tem tamanho
  $('resolucoes').setAttribute('aria-disabled', String(Boolean(destinoAtual().video.altura)))
  atualizar()
})
$('resolucoes').addEventListener('change', atualizar)
if ('showDirectoryPicker' in window) $('opcao-pasta').hidden = false

async function capacidades() {
  const [avc, hevc, aac] = await Promise.all([MB.canEncodeVideo('avc'), MB.canEncodeVideo('hevc'), MB.canEncodeAudio('aac')])
  $('aparelho').replaceChildren(
    ...[
      ['avc', 'H.264', avc],
      ['hevc', 'HEVC', hevc],
      ['aac', 'AAC', aac],
    ].map(([id, nome, ok]) => {
      const f = ficha(nome)
      Object.assign(f.dataset, { codec: id, ok: String(ok) })
      f.title = `${nome}: ${ok ? 'este aparelho codifica' : 'este aparelho não codifica'}`
      return f
    }),
  )
}
capacidades()

// ─────────── fila ───────────

async function adicionar(arquivos) {
  if (arquivos.length) $('caixa-arquivos').classList.add('compacta')
  $('caixa-arquivos').querySelector('.soltar-titulo').textContent = 'Adicionar vídeos'
  for (const arquivo of arquivos) {
    const item = { id: crypto.randomUUID(), arquivo, estado: 'lendo', info: null, avisos: [] }
    fila.push(item)
    desenhar(item)
    try {
      item.info = await ler(arquivo, item)
      item.estado = item.info.decodifica ? 'pronto' : 'erro'
      if (!item.info.decodifica) item.erro = `Este navegador não lê ${NOMES_CODEC[item.info.codec] ?? item.info.codec}.`
    } catch (e) {
      item.estado = 'erro'
      item.erro = 'Não abre como vídeo.'
      console.warn(e)
    }
    mostrar(item)
  }
  $('converter').disabled = !fila.some((i) => i.estado === 'pronto')
}

const REC709 = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false }

/**
 * A cor de cada quadro. O decodificador de ProRes lê a do cabeçalho do quadro, que pode faltar (aí o navegador assume
 * BT.601, de SD) ou contradizer o contêiner. A do contêiner manda, como no QuickTime; sem nenhuma, Rec.709.
 */
async function comCor(amostra, conteiner) {
  const atual = amostra.colorSpace
  const cor = conteiner?.matrix ? conteiner : atual?.matrix ? null : REC709
  const igual = (k) => atual?.[k] === cor[k]
  if (!cor || (igual('primaries') && igual('transfer') && igual('matrix') && Boolean(atual.fullRange) === Boolean(cor.fullRange))) return amostra
  const dados = new Uint8Array(amostra.allocationSize())
  const layout = await amostra.copyTo(dados)
  const nova = new MB.VideoSample(dados, {
    format: amostra.format,
    codedWidth: amostra.codedWidth,
    codedHeight: amostra.codedHeight,
    timestamp: amostra.timestamp,
    duration: amostra.duration,
    layout,
    colorSpace: cor,
  })
  amostra.close()
  return nova
}

async function ler(arquivo, item) {
  const input = new MB.Input({ source: new MB.BlobSource(arquivo), formats: MB.ALL_FORMATS })
  const video = await input.getPrimaryVideoTrack()
  if (!video) throw new Error('sem vídeo')
  const audio = await input.getPrimaryAudioTrack()
  const [largura, altura, duracao, cor, estat, decodifica] = await Promise.all([
    video.getDisplayWidth(),
    video.getDisplayHeight(),
    video.computeDuration(),
    video.getColorSpace(),
    video.computePacketStats(120),
    video.canDecode(),
  ])
  if (decodifica) await miniatura(video, duracao, cor, item).catch((e) => console.warn('miniatura', e))
  input.dispose?.()
  return {
    codec: video.codec,
    largura,
    altura,
    duracao,
    fps: Math.round(estat.averagePacketRate * 1000) / 1000,
    cor,
    temAudio: Boolean(audio),
    audio: audio?.codec ?? null,
    decodifica,
  }
}

/** Um quadro do começo do vídeo, com a cor certa, na miniatura do item. */
async function miniatura(video, duracao, cor, item) {
  const inicio = await video.getFirstTimestamp()
  const amostra = await new MB.VideoSampleSink(video).getSample(inicio + Math.min(1, duracao * 0.1))
  if (!amostra) return
  const certa = await comCor(amostra, cor)
  const tela = $(`item-${item.id}`)?.querySelector('canvas')
  if (tela) {
    tela.width = 224
    tela.height = 126
    certa.drawWithFit(tela.getContext('2d'), { fit: 'contain' })
  }
  certa.close()
}

function desenhar(item) {
  const li = no(
    'li',
    { className: 'item', id: `item-${item.id}` },
    no('div', { className: 'miniatura' }, no('canvas', { width: 224, height: 126 }), no('span', { className: 'selo-ok' }, svg(ICONES.ok))),
    no(
      'div',
      { className: 'item-corpo' },
      no(
        'div',
        { className: 'item-topo' },
        no('strong', { className: 'item-nome', textContent: item.arquivo.name, title: item.arquivo.name }),
        no('span', { className: 'item-estado' }),
      ),
      no('div', { className: 'fichas item-info' }),
      no('ul', { className: 'item-avisos' }),
      no('div', { className: 'barra', hidden: true }, no('div', { className: 'barra-cheia' })),
    ),
    no('div', { className: 'item-acoes' }),
  )
  $('fila').append(li)
  mostrar(item)
}

function mostrar(item) {
  const li = $(`item-${item.id}`)
  if (!li) return
  const estados = { lendo: 'Lendo…', pronto: 'Na fila', convertendo: 'Começando…', feito: 'Pronto', erro: 'Erro', cancelado: 'Cancelado' }
  li.dataset.estado = item.estado
  li.querySelector('.item-estado').textContent = estados[item.estado]
  const info = item.info
  const fichas = []
  if (item.erro) fichas.push(no('p', { className: 'item-erro', textContent: item.erro }))
  else if (info) {
    fichas.push(
      ficha(NOMES_CODEC[info.codec] ?? info.codec),
      ficha(`${info.largura}×${info.altura}`),
      ficha(`${info.fps.toLocaleString('pt-BR')} fps`),
      ficha(duracaoLegivel(info.duracao)),
    )
    if (!info.temAudio) fichas.push(ficha('sem áudio'))
  }
  if (info && item.estado === 'pronto') {
    const plano = planejar(info, destinoAtual(), { resolucao: resolucaoAtual() })
    const saida = ficha(`${plano.video.largura}×${plano.video.altura} · ~${tamanhoLegivel(plano.tamanhoEstimado)}`, 'ficha--saida')
    saida.prepend(svg(ICONES.converter))
    saida.title = 'Saída'
    fichas.push(saida)
    item.avisos = [...plano.avisos]
    if (!(pasta || $('salvar-pasta').checked) && plano.tamanhoEstimado > LIMITE_MEMORIA) item.avisos.push('Grande para a memória: salve numa pasta.')
  }
  if (item.estado === 'feito' && item.resumo) fichas.splice(0, fichas.length, ...item.resumo.map((t) => ficha(t)))
  li.querySelector('.item-info').replaceChildren(...fichas)
  li.querySelector('.item-avisos').replaceChildren(...item.avisos.map((t) => no('li', {}, svg(ICONES.aviso), no('span', { textContent: t }))))
  if (item.estado !== 'convertendo') li.querySelector('.barra').hidden = true

  const acoes = li.querySelector('.item-acoes')
  acoes.replaceChildren()
  if (item.estado === 'convertendo') {
    const b = no('button', { type: 'button', className: 'vidro vidro--icone', title: 'Cancelar' }, svg(ICONES.x))
    b.onclick = () => item.conversao?.cancel()
    acoes.append(b)
  }
  if (item.estado === 'feito' && item.url) {
    const a = no('a', { className: 'vidro vidro--tinta', href: item.url, download: item.nomeSaida, title: item.nomeSaida }, svg(ICONES.baixar), 'Baixar')
    a.setAttribute('aria-label', `Baixar ${item.nomeSaida}`)
    // baixou: o vídeo deixa de esperar a pessoa (o balão da aba desconta)
    a.addEventListener('click', () => {
      item.baixado = true
      contar()
    })
    acoes.append(a)
  }
  contar()
}

/** O balão da aba Converter: vídeos esperando o botão Converter e prontos para baixar (src/pendencias.js). */
const contar = () => avisarPendencias('converter', pendenciasConverter(fila, { rodando }))

function progresso(item, valor, inicio) {
  const li = $(`item-${item.id}`)
  const barra = li.querySelector('.barra')
  barra.hidden = false
  barra.querySelector('.barra-cheia').style.width = `${Math.round(valor * 100)}%`
  const gasto = (performance.now() - inicio) / 1000
  const resta = valor > 0.02 ? (gasto / valor) * (1 - valor) : null
  li.querySelector('.item-estado').textContent = `${Math.round(valor * 100)}%${resta != null ? ` · falta ${duracaoLegivel(resta)}` : ''}`
}

// ─────────── conversão ───────────

async function converter(item) {
  const d = destinoAtual()
  const plano = planejar(item.info, d, { resolucao: resolucaoAtual() })
  item.estado = 'convertendo'
  item.nomeSaida = nomeSaida(item.arquivo.name, d)
  mostrar(item)

  const vcodec = (await MB.canEncodeVideo(plano.video.codec, { width: plano.video.largura, height: plano.video.altura }))
    ? plano.video.codec
    : await MB.getFirstEncodableVideoCodec(['avc', 'hevc'], { width: plano.video.largura, height: plano.video.altura })
  if (!vcodec) throw new Error('Este aparelho não codifica H.264 nem HEVC neste tamanho.')
  const acodec = plano.audio ? await MB.getFirstEncodableAudioCodec(plano.audio.codecs) : null
  if (plano.audio && acodec !== plano.audio.codecs[0])
    item.avisos.push(`Áudio em ${nomeAudio(acodec)}: este navegador não gera ${nomeAudio(plano.audio.codecs[0])}.`)
  if (vcodec !== plano.video.codec) item.avisos.push(`Vídeo em ${NOMES_CODEC[vcodec]}: este aparelho não gera ${NOMES_CODEC[plano.video.codec]}.`)

  let target
  let gravavel = null
  if (pasta) {
    const arquivo = await pasta.getFileHandle(item.nomeSaida, { create: true })
    gravavel = await arquivo.createWritable()
    target = new MB.StreamTarget(gravavel, { chunked: true })
  } else target = new MB.BufferTarget()

  const input = new MB.Input({ source: new MB.BlobSource(item.arquivo), formats: MB.ALL_FORMATS })
  const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: pasta ? false : 'in-memory' }), target })
  const corOrigem = item.info.cor?.matrix ? item.info.cor : plano.cor
  const cstId = $('cst').value
  const gpu = cstId ? criarAplicadorLut(assar(criarCst(cstId, 'rec709').aplicar, 65)) : null
  if (cstId) item.avisos.push(`Log ${ENTRADAS.find((e) => e.id === cstId).nome} → Rec.709.`)
  // com o CST, cada quadro passa pela LUT na GPU e volta como RGBA marcado BT.709
  const processar = async (amostra) => {
    const certa = await comCor(amostra, item.info.cor)
    if (!gpu) return certa
    const quadro = certa.toVideoFrame()
    const largura = certa.displayWidth
    const altura = certa.displayHeight
    const rgba = gpu.aplicar(quadro, largura, altura, !corOrigem.fullRange)
    quadro.close()
    const nova = new MB.VideoSample(rgba, {
      format: 'RGBA',
      codedWidth: largura,
      codedHeight: altura,
      timestamp: certa.timestamp,
      duration: certa.duration,
      colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'rgb', fullRange: true },
    })
    certa.close()
    return nova
  }

  const conversao = await MB.Conversion.init({
    input,
    output,
    tracks: 'primary',
    video: {
      codec: vcodec,
      width: plano.video.largura,
      height: plano.video.altura,
      fit: 'contain',
      quality: new MB.Quality({ bitrate: plano.video.bitrate }),
      forceTranscode: true,
      hardwareAcceleration: 'no-preference', // o navegador usa o hardware quando existe; exigir hardware falha onde não há
      process: processar,
    },
    audio: acodec
      ? { codec: acodec, quality: new MB.Quality({ bitrate: plano.audio.bitrate }), sampleRate: plano.audio.taxa, forceTranscode: true }
      : { discard: true },
  })
  if (!conversao.isValid) throw new Error('Não deu para montar a conversão: ' + conversao.discardedTracks.map((t) => t.reason).join(', '))
  item.conversao = conversao
  mostrar(item)
  const inicio = performance.now()
  escalouNaGpu = false
  conversao.onProgress = (v) => progresso(item, v, inicio)
  await conversao.execute()

  const segundos = (performance.now() - inicio) / 1000
  if (target instanceof MB.BufferTarget) {
    const blob = new Blob([target.buffer], { type: 'video/mp4' })
    item.url = URL.createObjectURL(blob)
    item.bytes = blob.size
  } else item.bytes = null
  item.resumo = [
    `${NOMES_CODEC[vcodec]}${acodec ? ' + ' + nomeAudio(acodec) : ''}`,
    'BT.709',
    `${(item.info.duracao / segundos).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× tempo real`,
    item.bytes ? tamanhoLegivel(item.bytes) : 'salvo na pasta',
  ]
  item.estado = 'feito'
  $(`item-${item.id}`).dataset.escala = escalouNaGpu ? 'gpu' : 'nenhuma'
  mostrar(item)
}

$('converter').addEventListener('click', async () => {
  if (rodando) return
  rodando = true
  contar()
  $('converter').disabled = true
  try {
    if ($('salvar-pasta').checked && 'showDirectoryPicker' in window && !pasta) pasta = await window.showDirectoryPicker({ mode: 'readwrite' })
  } catch {
    pasta = null // cancelou a escolha: monta na memória
  }
  for (const item of fila.filter((i) => i.estado === 'pronto')) {
    try {
      await converter(item)
    } catch (e) {
      item.estado = e instanceof MB.ConversionCanceledError ? 'cancelado' : 'erro'
      item.erro = item.estado === 'erro' ? e.message : null
      mostrar(item)
    }
  }
  rodando = false
  contar()
  $('converter').disabled = !fila.some((i) => i.estado === 'pronto')
  avisar('')
})

const caixa = $('caixa-arquivos')
$('arquivos').addEventListener('change', (e) => adicionar([...e.target.files]))
caixa.addEventListener('dragover', (e) => {
  e.preventDefault()
  caixa.classList.add('soltando')
})
caixa.addEventListener('dragleave', () => caixa.classList.remove('soltando'))
caixa.addEventListener('drop', (e) => {
  e.preventDefault()
  caixa.classList.remove('soltando')
  adicionar([...e.dataTransfer.files])
})
