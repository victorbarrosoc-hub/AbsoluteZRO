// Revela · conversor no navegador (o "Handbrake" da Revela). Lê o arquivo com o Mediabunny (ProRes pelo decodificador
// WASM), converte com WebCodecs (hardware quando o aparelho deixa) e grava MP4 marcado BT.709. Nada sai do aparelho.

import * as MB from '../vendor/mediabunny.min.mjs'
import { registerProresDecoder } from '../vendor/mediabunny-prores.min.mjs'
import { DESTINOS_CONVERSAO, LIMITE_MEMORIA, RESOLUCOES, nomeSaida, planejar, tamanhoLegivel } from '../src/conversao/plano.js'

registerProresDecoder()

const $ = (id) => document.getElementById(id)
const fila = []
let pasta = null // pasta escolhida para salvar direto no disco (computador)
let rodando = false

const NOMES_CODEC = { prores: 'ProRes', avc: 'H.264', hevc: 'HEVC', vp9: 'VP9', av1: 'AV1', vp8: 'VP8' }
const duracaoLegivel = (s) => {
  if (s < 1) return 'menos de 1 s'
  const total = Math.round(s)
  const m = Math.floor(total / 60)
  const ss = total % 60
  return m ? `${m} min ${String(ss).padStart(2, '0')} s` : `${ss} s`
}
const avisar = (t) => ($('estado').textContent = t)

// ─────────── opções ───────────

for (const d of DESTINOS_CONVERSAO) $('destino').append(new Option(d.nome, d.id))
for (const r of RESOLUCOES) $('resolucao').append(new Option(r.nome, String(r.id)))
const destinoAtual = () => DESTINOS_CONVERSAO.find((d) => d.id === $('destino').value)
const resolucaoAtual = () => ($('resolucao').value === 'original' ? 'original' : Number($('resolucao').value))
$('destino').addEventListener('change', () => {
  $('resolucao').disabled = Boolean(destinoAtual().video.altura) // vertical já tem tamanho
  for (const item of fila) if (item.estado === 'pronto') mostrar(item)
})
$('resolucao').addEventListener('change', () => fila.forEach((i) => i.estado === 'pronto' && mostrar(i)))
if ('showDirectoryPicker' in window) $('opcao-pasta').hidden = false

async function capacidades() {
  const sim = (ok) => (ok ? 'sim' : 'não')
  const [avc, hevc, aac] = await Promise.all([MB.canEncodeVideo('avc'), MB.canEncodeVideo('hevc'), MB.canEncodeAudio('aac')])
  $('aparelho').textContent =
    `Neste aparelho: H.264 ${sim(avc)} · HEVC ${sim(hevc)} · AAC ${sim(aac)}${crossOriginIsolated ? ' · ProRes em várias linhas' : ''}.`
}
capacidades()

// ─────────── fila ───────────

async function adicionar(arquivos) {
  for (const arquivo of arquivos) {
    const item = { id: crypto.randomUUID(), arquivo, estado: 'lendo', info: null, avisos: [] }
    fila.push(item)
    desenhar(item)
    try {
      item.info = await ler(arquivo)
      item.estado = item.info.decodifica ? 'pronto' : 'erro'
      if (!item.info.decodifica) item.erro = `Este navegador não consegue ler ${NOMES_CODEC[item.info.codec] ?? item.info.codec}.`
    } catch (e) {
      item.estado = 'erro'
      item.erro = 'Não deu para abrir este arquivo como vídeo.'
      console.warn(e)
    }
    mostrar(item)
  }
  $('converter').disabled = !fila.some((i) => i.estado === 'pronto')
}

async function ler(arquivo) {
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

function desenhar(item) {
  const li = document.createElement('li')
  li.className = 'item'
  li.id = `item-${item.id}`
  li.innerHTML = `<div class="item-topo"><strong class="item-nome"></strong><span class="item-estado"></span></div>
    <p class="item-info"></p><ul class="item-avisos"></ul>
    <div class="barra" hidden><div class="barra-cheia"></div></div>
    <div class="item-acoes"></div>`
  li.querySelector('.item-nome').textContent = item.arquivo.name
  $('fila').append(li)
  mostrar(item)
}

function mostrar(item) {
  const li = $(`item-${item.id}`)
  if (!li) return
  const estados = { lendo: 'Lendo…', pronto: 'Pronto para converter', convertendo: 'Convertendo…', feito: 'Pronto', erro: 'Erro', cancelado: 'Cancelado' }
  li.dataset.estado = item.estado
  li.querySelector('.item-estado').textContent = estados[item.estado]
  const info = item.info
  const partes = info
    ? [
        NOMES_CODEC[info.codec] ?? info.codec,
        `${info.largura}×${info.altura}`,
        `${info.fps.toLocaleString('pt-BR')} fps`,
        duracaoLegivel(info.duracao),
        info.cor?.primaries ? `cor ${info.cor.primaries}` : 'cor sem marcação',
        info.temAudio ? `áudio ${info.audio}` : 'sem áudio',
      ]
    : []
  let plano = null
  if (info && item.estado === 'pronto') {
    plano = planejar(info, destinoAtual(), { resolucao: resolucaoAtual() })
    partes.push(`→ ${plano.video.largura}×${plano.video.altura} · ~${tamanhoLegivel(plano.tamanhoEstimado)}`)
    item.avisos = [...plano.avisos]
    if (!(pasta || $('salvar-pasta').checked) && plano.tamanhoEstimado > LIMITE_MEMORIA)
      item.avisos.push('Arquivo grande para montar na memória do aparelho. No computador, salve direto numa pasta.')
  }
  li.querySelector('.item-info').textContent = item.erro ?? partes.join(' · ')
  li.querySelector('.item-avisos').replaceChildren(
    ...item.avisos.map((t) => {
      const a = document.createElement('li')
      a.textContent = t
      return a
    }),
  )
  const acoes = li.querySelector('.item-acoes')
  acoes.replaceChildren()
  if (item.estado === 'convertendo') {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'botao-secundario', textContent: 'Cancelar' })
    b.onclick = () => item.conversao?.cancel()
    acoes.append(b)
  }
  if (item.estado === 'feito' && item.url) {
    const a = Object.assign(document.createElement('a'), {
      className: 'botao',
      href: item.url,
      download: item.nomeSaida,
      textContent: `Baixar ${item.nomeSaida}`,
    })
    acoes.append(a)
  }
  if (item.estado === 'feito' && item.resumo) {
    const p = Object.assign(document.createElement('p'), { className: 'dica', textContent: item.resumo })
    acoes.append(p)
  }
}

function progresso(item, valor, inicio) {
  const li = $(`item-${item.id}`)
  const barra = li.querySelector('.barra')
  barra.hidden = false
  barra.querySelector('.barra-cheia').style.width = `${Math.round(valor * 100)}%`
  const gasto = (performance.now() - inicio) / 1000
  const resta = valor > 0.02 ? (gasto / valor) * (1 - valor) : null
  const quadros = valor * item.info.duracao * item.info.fps
  li.querySelector('.item-estado').textContent =
    `${Math.round(valor * 100)}% · ${Math.round(quadros / Math.max(gasto, 0.1))} fps${resta != null ? ` · falta ${duracaoLegivel(resta)}` : ''}`
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
    item.avisos.push(`Este navegador não codifica ${plano.audio.codecs[0].toUpperCase()}: o áudio sai em ${String(acodec).toUpperCase()}.`)
  if (vcodec !== plano.video.codec) item.avisos.push(`Este aparelho não codifica ${NOMES_CODEC[plano.video.codec]}: sai em ${NOMES_CODEC[vcodec]}.`)

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
      // o decodificador de ProRes entrega quadros sem a cor; sem ela o navegador assume BT.601 (SD)
      process: async (amostra) => {
        if (amostra.colorSpace?.matrix) return amostra
        const dados = new Uint8Array(amostra.allocationSize())
        const layout = await amostra.copyTo(dados)
        const nova = new MB.VideoSample(dados, {
          format: amostra.format,
          codedWidth: amostra.codedWidth,
          codedHeight: amostra.codedHeight,
          timestamp: amostra.timestamp,
          duration: amostra.duration,
          layout,
          colorSpace: corOrigem,
        })
        amostra.close()
        return nova
      },
    },
    audio: acodec
      ? { codec: acodec, quality: new MB.Quality({ bitrate: plano.audio.bitrate }), sampleRate: plano.audio.taxa, forceTranscode: true }
      : { discard: true },
  })
  if (!conversao.isValid) throw new Error('Não deu para montar a conversão: ' + conversao.discardedTracks.map((t) => t.reason).join(', '))
  item.conversao = conversao
  mostrar(item)
  const inicio = performance.now()
  conversao.onProgress = (v) => progresso(item, v, inicio)
  await conversao.execute()

  const segundos = (performance.now() - inicio) / 1000
  if (target instanceof MB.BufferTarget) {
    const blob = new Blob([target.buffer], { type: 'video/mp4' })
    item.url = URL.createObjectURL(blob)
    item.bytes = blob.size
  } else item.bytes = null
  item.resumo = `${NOMES_CODEC[vcodec]}${acodec ? ' + ' + acodec.toUpperCase() : ''} · BT.709 · ${duracaoLegivel(segundos)} (${(item.info.duracao / segundos).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× o tempo real)${item.bytes ? ' · ' + tamanhoLegivel(item.bytes) : ' · salvo na pasta'}`
  item.estado = 'feito'
  mostrar(item)
}

$('converter').addEventListener('click', async () => {
  if (rodando) return
  rodando = true
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
  $('converter').disabled = !fila.some((i) => i.estado === 'pronto')
  avisar(fila.some((i) => i.estado === 'feito') ? 'Conversão terminada.' : '')
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
