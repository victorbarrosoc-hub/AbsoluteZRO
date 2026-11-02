// Worker da edição automática: escuta a música (batida, compassos e partes) e depois cada tomada (sincronia com a
// música pelo som e as medidas de imagem para a nota). Tudo na máquina, fora da tela; a barra anda pelo que foi medido
// (segundos de som lidos, quadros olhados). O som da música fica aqui entre um pedido e outro, para o acerto fino.

import { MB, abrirInput } from './midia.js'
import { medir } from '../src/musica/sinal.js'
import { alinhar, refinar, tipoDaTomada } from '../src/musica/sincronia.js'
import { batidaDa } from '../src/musica/ritmo.js'
import { energiaDosCompassos, partesDa } from '../src/musica/estrutura.js'
import { medirQuadro } from '../src/musica/nota.js'

const TAXA = 16000
let cancelado = false
let musica = null

/**
 * O som da mídia em mono na taxa pedida, como app/midia.js › extrairAudio, mas pelas amostras cruas (AudioSample): no
 * worker não existe AudioBuffer (é do Web Audio, só na página).
 */
async function extrairAudio(e, { taxa, aoProgresso }) {
  const input = abrirInput(e)
  try {
    const audio = await input.getPrimaryAudioTrack()
    if (!audio || !(await audio.canDecode())) return { pcm: new Float32Array(0), duracao: 0 }
    const total = await input.computeDuration()
    const saida = new Float32Array(Math.ceil(total * taxa) + taxa)
    let n = 0
    let fase = 0
    let soma = 0
    let cont = 0
    let ultimo = 0
    const canal = new Float32Array(1)
    for await (const a of new MB.AudioSampleSink(audio).samples()) {
      parar()
      const passo = a.sampleRate / taxa
      const nc = a.numberOfChannels
      const nf = a.numberOfFrames
      let planos = canal
      if (planos.length < nf * nc) planos = new Float32Array(nf * nc)
      for (let c = 0; c < nc; c++) a.copyTo(planos.subarray(c * nf, (c + 1) * nf), { planeIndex: c, format: 'f32-planar' })
      const alvo = Math.max(0, Math.round(a.timestamp * taxa))
      if (alvo > n + 1) n = Math.min(saida.length, alvo)
      for (let i = 0; i < nf; i++) {
        let v = 0
        for (let c = 0; c < nc; c++) v += planos[c * nf + i]
        soma += v / nc
        cont++
        fase += 1
        if (fase >= passo) {
          fase -= passo
          if (n < saida.length) saida[n++] = soma / cont
          soma = 0
          cont = 0
        }
      }
      if (aoProgresso && a.timestamp - ultimo > 2) {
        ultimo = a.timestamp
        aoProgresso(a.timestamp + a.duration, total)
      }
      a.close()
    }
    aoProgresso?.(total, total)
    return { pcm: saida.subarray(0, Math.min(n, Math.round(total * taxa))), duracao: total }
  } finally {
    input.dispose?.()
  }
}

const parar = () => {
  if (cancelado) throw new DOMException('cancelado', 'AbortError')
}

async function ouvirMusica({ entrada, preset }) {
  const { pcm, duracao } = await extrairAudio(entrada, {
    taxa: TAXA,
    aoProgresso: (lido, total) => self.postMessage({ tipo: 'andamento', fase: 'musica', feito: lido, total }),
  })
  parar()
  if (!pcm.length) throw new Error('Essa música não tem som que dê para ler.')
  const med = medir(pcm, TAXA)
  const batida = batidaDa(med)
  const partes = partesDa(med, batida.compassos, duracao, preset.secoes)
  musica = { pcm, med }
  return { duracao, bpm: batida.bpm, batidas: batida.batidas, compassos: batida.compassos, partes, energias: energiaDosCompassos(med, batida.compassos, duracao) }
}

/** Medidas de imagem da tomada a n quadros por segundo, em miniatura (sem guardar os quadros). */
async function olhar(entrada, preset, aoAndar) {
  const input = abrirInput(entrada)
  try {
    const v = await input.getPrimaryVideoTrack()
    if (!v || !(await v.canDecode())) return null
    const [ini, dur] = await Promise.all([v.getFirstTimestamp(), input.computeDuration()])
    const { largura: w, altura: h, amostras_por_s: hz } = preset.analise
    const n = Math.max(1, Math.floor(dur * hz))
    const tempos = Array.from({ length: n }, (_, i) => ini + (i + 0.5) / hz)
    const sink = new MB.CanvasSink(v, { width: w, height: h, fit: 'fill', poolSize: 2 })
    const medidas = []
    let anterior = null
    for await (const r of sink.canvasesAtTimestamps(tempos)) {
      parar()
      if (!r) {
        medidas.push({ nitidez: 0, luz: 0, estouro: 1, movimento: 0 })
        continue
      }
      const ctx = r.canvas.getContext('2d', { willReadFrequently: true })
      const m = medirQuadro(ctx.getImageData(0, 0, w, h).data, w, h, anterior)
      anterior = m.cinza
      medidas.push({ nitidez: Math.round(m.nitidez * 10) / 10, luz: Math.round(m.luz * 1000) / 1000, estouro: Math.round(m.estouro * 1000) / 1000, movimento: Math.round(m.movimento * 1000) / 1000 })
      if (medidas.length % 8 === 0) aoAndar(medidas.length, n)
    }
    return { hz, medidas }
  } finally {
    input.dispose?.()
  }
}

async function ouvirTomada({ id, entrada, temAudio, temVideo, sincronizar, preset }) {
  let sincronia = null
  if (temAudio && sincronizar && musica) {
    const { pcm } = await extrairAudio(entrada, { taxa: TAXA, aoProgresso: (lido, total) => self.postMessage({ tipo: 'andamento', fase: 'som', id, feito: lido, total }) })
    parar()
    const r = pcm.length ? alinhar(musica.med, medir(pcm, TAXA), { sobreposicaoMinS: preset.sincronia.sobreposicao_min_s }) : null
    if (r) {
      const tipo = tipoDaTomada(r, preset.sincronia)
      const inicio = tipo === 'performance' ? refinar(musica.pcm, pcm, TAXA, r.inicio, { buscaMs: preset.sincronia.busca_fina_ms }) : r.inicio
      sincronia = { tipo, inicio: Math.round(inicio * 1000) / 1000, ncc: Math.round(r.ncc * 1000) / 1000, destaque: Math.round(r.destaque * 10) / 10, ambigua: r.ambigua }
    }
  }
  const imagem = temVideo ? await olhar(entrada, preset, (feito, total) => self.postMessage({ tipo: 'andamento', fase: 'imagem', id, feito, total })) : null
  return { id, sincronia, imagem }
}

self.onmessage = async ({ data }) => {
  if (data.tipo === 'cancelar') {
    cancelado = true
    return
  }
  cancelado = false
  try {
    if (data.tipo === 'musica') self.postMessage({ tipo: 'musica-pronta', analise: await ouvirMusica(data) })
    else if (data.tipo === 'tomada') self.postMessage({ tipo: 'tomada-pronta', ...(await ouvirTomada(data)) })
    else if (data.tipo === 'esquecer') musica = null
  } catch (err) {
    self.postMessage({ tipo: 'erro', mensagem: err?.name === 'AbortError' ? 'cancelado' : err?.message || String(err) })
  }
}
