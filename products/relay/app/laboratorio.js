// Relay · laboratório de aparelhos (interno, só em prévia e local): mede o codificador de vídeo DESTE aparelho (Mac,
// iPhone, Windows) contra a referência x264 medida no laboratório (app/laboratorio-referencia.js), no mesmo bitrate.
//
// Nada para baixar: as cenas são geradas aqui (src/cenas.js), codificadas pelo aparelho com o Mediabunny/WebCodecs,
// decodificadas de volta e comparadas com o mesmo quadro gerado de novo (src/ssim.js, a mesma conta da referência).

import { MB } from './motor.js'
import { ALTURA, CENAS, FPS, LARGURA, QUADROS, quadro } from '../src/cenas.js'
import { referenciaNoBitrate, ssimY } from '../src/ssim.js'
import { MEDIDO_EM, REFERENCIA } from './laboratorio-referencia.js'
import { icones } from './icones.js'

const RAPIDO = new URLSearchParams(location.search).has('rapido') // teste automático: uma cena, um bitrate
const ALVOS = RAPIDO ? [16000] : [6000, 16000] // kbit/s: o que o Relay usa no 1080p (16) e um aperto que separa codificadores (6)
const CENAS_TESTE = RAPIDO ? CENAS.slice(0, 1) : CENAS
const COR = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false }
const $ = (id) => document.getElementById(id)
const fmt = (n, c = 4) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  n.append(...filhos.filter((f) => f != null))
  return n
}
const espera = () => new Promise((r) => setTimeout(r, 0))

async function hardware(codecStr) {
  try {
    const r = await VideoEncoder.isConfigSupported({ codec: codecStr, width: LARGURA, height: ALTURA, bitrate: 16e6, framerate: FPS, hardwareAcceleration: 'prefer-hardware' })
    return Boolean(r.supported)
  } catch {
    return false
  }
}

/** Codifica uma cena no aparelho. Devolve { buffer, segundos }. */
async function codificar(cena, kbps, aoAndar) {
  const target = new MB.BufferTarget()
  const output = new MB.Output({ format: new MB.Mp4OutputFormat(), target })
  const fonte = new MB.VideoSampleSource({
    codec: 'avc',
    quality: new MB.Quality({ bitrate: kbps * 1000, bitrateMode: 'variable' }),
    keyFrameInterval: 2,
    latencyMode: 'quality',
    hardwareAcceleration: 'no-preference',
  })
  output.addVideoTrack(fonte, { frameRate: FPS })
  await output.start()
  const buf = new Uint8Array((LARGURA * ALTURA * 3) / 2)
  const inicio = performance.now()
  for (let i = 0; i < QUADROS; i++) {
    quadro(cena, i, buf)
    const amostra = new MB.VideoSample(buf, { format: 'I420', codedWidth: LARGURA, codedHeight: ALTURA, timestamp: i / FPS, duration: 1 / FPS, colorSpace: COR })
    await fonte.add(amostra)
    amostra.close()
    aoAndar((i + 1) / QUADROS / 2)
    if (i % 6 === 0) await espera()
  }
  await output.finalize()
  return { buffer: target.buffer, segundos: (performance.now() - inicio) / 1000 }
}

/** Decodifica e mede o SSIM (Y) de um quadro a cada três contra o quadro gerado de novo. */
async function medir(cena, buffer, aoAndar) {
  const input = new MB.Input({ source: new MB.BlobSource(new Blob([buffer])), formats: MB.ALL_FORMATS })
  const faixa = await input.getPrimaryVideoTrack()
  const ref = new Uint8Array((LARGURA * ALTURA * 3) / 2)
  let soma = 0
  let n = 0
  let formato = null
  for await (const amostra of new MB.VideoSampleSink(faixa).samples()) {
    const i = Math.round(amostra.timestamp * FPS)
    if (i % 3 === 0) {
      formato = amostra.format
      if (!/^(I420|NV12|I420A|I422|I444)$/.test(amostra.format ?? '')) {
        amostra.close()
        throw new Error(`O aparelho decodificou em ${amostra.format}: sem o plano Y para medir.`)
      }
      const dados = new Uint8Array(amostra.allocationSize())
      const layout = await amostra.copyTo(dados)
      quadro(cena, i, ref)
      soma += ssimY(ref, dados.subarray(layout[0].offset), LARGURA, ALTURA, LARGURA, layout[0].stride)
      n++
      aoAndar(0.5 + (i / QUADROS) * 0.5)
      await espera()
    }
    amostra.close()
  }
  input.dispose?.()
  return { ssim: soma / n, formato }
}

async function rodar() {
  $('comecar').disabled = true
  $('resultado').hidden = true
  let trava = null
  try {
    trava = await navigator.wakeLock?.request('screen')
  } catch {
    // sem trava de tela: a pessoa deixa aberta
  }
  const aparelho = {
    navegador: navigator.userAgent,
    avcHardware: await hardware('avc1.640028'),
    hevc: await MB.canEncodeVideo('hevc', { width: LARGURA, height: ALTURA }),
    aac: await MB.canEncodeAudio('aac'),
  }
  const linhas = []
  const total = CENAS_TESTE.length * ALVOS.length
  let feitos = 0
  const corpo = $('tabela').querySelector('tbody')
  corpo.replaceChildren()
  for (const c of CENAS_TESTE)
    for (const kbps of ALVOS) {
      $('estado').textContent = `${c.nome} · ${kbps / 1000} Mbit/s`
      const andar = (f) => $('progresso').style.setProperty('--curso', String((feitos + f) / total))
      try {
        const { buffer, segundos } = await codificar(c.id, kbps, andar)
        const real = Math.round((buffer.byteLength * 8) / (QUADROS / FPS) / 1000)
        const { ssim } = await medir(c.id, buffer, andar)
        const referencia = referenciaNoBitrate(REFERENCIA[c.id], real)
        const l = { cena: c.id, alvo: kbps, real, ssim: Math.round(ssim * 1e5) / 1e5, referencia: Math.round(referencia * 1e5) / 1e5, fps: Math.round((QUADROS / segundos) * 10) / 10 }
        linhas.push(l)
        const dif = l.ssim - l.referencia
        corpo.append(
          el(
            'tr',
            {},
            el('td', { textContent: c.nome }),
            el('td', { textContent: `${kbps / 1000} → ${fmt(real / 1000, 1)} Mbit/s` }),
            el('td', { textContent: fmt(l.ssim) }),
            el('td', { textContent: fmt(l.referencia) }),
            el('td', { className: dif >= 0 ? 'ganha' : 'perde', textContent: `${dif >= 0 ? '+' : ''}${fmt(dif)}` }),
            el('td', { textContent: `${fmt(l.fps, 0)} q/s` }),
          ),
        )
      } catch (e) {
        linhas.push({ cena: c.id, alvo: kbps, erro: String(e?.message ?? e) })
        corpo.append(el('tr', {}, el('td', { textContent: c.nome }), el('td', { colSpan: 5, className: 'perde', textContent: String(e?.message ?? e) })))
      }
      feitos++
    }
  const validas = linhas.filter((l) => !l.erro)
  const media = validas.length ? validas.reduce((s, l) => s + (l.ssim - l.referencia), 0) / validas.length : null
  $('estado').textContent = media == null ? 'Não deu para medir neste aparelho.' : media >= 0 ? `Este aparelho fica ${fmt(media)} acima da referência, em média.` : `Este aparelho fica ${fmt(-media)} abaixo da referência, em média.`
  $('progresso').style.setProperty('--curso', '1')
  const relatorio = { relay: 'laboratorio', versao: 1, referencia: MEDIDO_EM, quando: new Date().toISOString(), aparelho, linhas }
  $('json').value = JSON.stringify(relatorio, null, 2)
  $('resultado').hidden = false
  $('comecar').disabled = false
  $('comecar').textContent = 'Medir de novo'
  window.labResultado = relatorio
  trava?.release?.()
}

$('comecar').addEventListener('click', () => rodar().catch((e) => ($('estado').textContent = `Parou: ${e?.message ?? e}`)))
$('copiar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('json').value)
    $('copiar').textContent = 'Copiado'
  } catch {
    $('json').select()
  }
})
icones()
window.labPronto = true
