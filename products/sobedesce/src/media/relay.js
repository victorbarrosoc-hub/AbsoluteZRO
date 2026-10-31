// "Converter com o Relay" (botão direito num vídeo da tela Drive): o vídeo que está no Drive vira a versão de um
// destino do Relay (YouTube, Reels, WhatsApp, MP3…) e sobe AO LADO do original. O original nunca muda. Quem decide
// tamanho, cadência, bitrate, cor e áudio é o Relay (src/relay/, cópia conferida por teste de products/relay); aqui só
// executa, com o ffmpeg do app (o mesmo motor e a mesma vaga da prévia leve: uma conversão por vez no app inteiro).
//
// Qualidade (products/relay/docs/QUALIDADE.md): o x264 do app em qualidade constante; o codificador
// de hardware só entra se o ffmpeg não tiver o x264.
//
//   original na fila (o envio que subiu ele) ou baixado do Drive ──▶ ffmpeg -i (lê) ──▶ planejar (Relay)
//     ──▶ ffmpeg (1 ou 2 passadas, marcado BT.709 1-1-1) ──▶ sobe na mesma pasta ──▶ confere o MD5 do Drive
import { createReadStream } from 'node:fs'
import fsp from 'node:fs/promises'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { abortError } from '../util/backoff.js'
import { parseProbe, runTool, timeoutFor } from './previa.js'
import { originaisLocais } from './previa-lote.js'
import { PRESETS } from '../relay/presets.js'
import { presetPersonalizado } from '../relay/personalizado.js'
import { extensao, nomeSaida, planejar } from '../relay/plano.js'
import { argsFfmpeg } from '../relay/ffmpeg.js'

/** Marca (appProperties.sobedesce) do arquivo que o Relay gerou. */
export const RELAY_MARCA = 'relay'

/** Os destinos que dá para gerar daqui: todos os presets do Relay, menos o de tamanho escolhido na hora. */
export const DESTINOS_RELAY = PRESETS.filter(p => !p.ajustavel)
/** Um destino: o id de um preset do Relay ou a ficha de um preset da pessoa (vinda do link do site do Relay). */
export const destinoRelay = d => {
  if (typeof d === 'string') return DESTINOS_RELAY.find(p => p.id === d) ?? null
  if (d && typeof d === 'object') {
    try {
      return presetPersonalizado(d)
    } catch {
      return null
    }
  }
  return null
}

const AUDIO = /\.(wav|aiff?|flac|mp3|m4a|aac|ogg|opus|caf)$/i
const VIDEO = /\.(mov|mp4|m4v|mxf|mkv|avi|webm|mts|m2ts|braw|r3d|3gp|mpg|mpeg|wmv|flv|dv)$/i
/** Arquivo que o Relay converte (pelo nome). */
export const convertivel = nome => VIDEO.test(nome) || AUDIO.test(nome)

const STALL_MS = 5 * 60_000
const PROBE_TIMEOUT_MS = 60_000
const MB = 1024 * 1024

// Nomes do ffmpeg → os que o plano usa (os do WebCodecs).
const TRANSFER = { smpte2084: 'pq', 'arib-std-b67': 'hlg' }

/**
 * Lê a saída do `ffmpeg -i` no formato que o plano do Relay espera:
 * { largura, altura, fps, duracao, temVideo, temAudio, canais, taxa, cor: { primaries, transfer, matrix, fullRange } | null }.
 * null se não há vídeo nem áudio. Largura e altura são as da tela (pixel não quadrado e celular deitado corrigidos).
 */
export function origemDoProbe(text, info = parseProbe(text)) {
  const linhas = String(text ?? '').split(/\r?\n/)
  const linhaAudio = linhas.find(l => /Stream #\d+:\d+.*?: Audio: /.test(l)) || ''
  const canais = /(\d+) channels/.exec(linhaAudio)?.[1]
  const audio = info?.audio
    ? {
        temAudio: true,
        taxa: Number(/(\d+) Hz/.exec(linhaAudio)?.[1]) || 48000,
        canais: canais ? Number(canais) : /\bmono\b/.test(linhaAudio) ? 1 : /\b5\.1\b/.test(linhaAudio) ? 6 : /\b7\.1\b/.test(linhaAudio) ? 8 : 2,
      }
    : { temAudio: false }
  const v = info?.video
  if (!v?.width || !v?.height) return info?.audio ? { temVideo: false, duracao: info.durationS || 0, ...audio, cor: null } : null
  const linha = linhas.find(l => /Stream #\d+:\d+.*?: Video: /.test(l) && !/attached pic/.test(l)) || ''
  const fps = Number((/([\d.]+) fps/.exec(linha) || [])[1]) || Number((/([\d.]+) tbr/.exec(linha) || [])[1]) || 30
  let largura = v.sar && v.sar[0] !== v.sar[1] ? Math.round((v.width * v.sar[0]) / v.sar[1]) : v.width
  let altura = v.height
  if (Math.abs(info.rotation) === 90 || Math.abs(info.rotation) === 270) [largura, altura] = [altura, largura]
  // "yuv422p10le(tv, bt709, progressive)" = as três iguais; "yuv420p10le(tv, bt2020nc/bt2020/smpte2084)" = matriz/primárias/transferência
  const c = /\((tv|pc), ([\w-]+)(?:\/([\w-]+)\/([\w-]+))?/.exec(linha)
  const cor = c && c[2] !== 'progressive' ? { matrix: c[2], primaries: c[3] ?? c[2], transfer: TRANSFER[c[4] ?? c[2]] ?? (c[4] ?? c[2]), fullRange: c[1] === 'pc' } : null
  return { temVideo: true, largura, altura, fps, duracao: info.durationS || 0, ...audio, cor }
}

/**
 * Tentativas de codificador: o x264 primeiro (a melhor qualidade medida), o de hardware só se não houver x264.
 * HEVC: libx265 se o ffmpeg tiver; senão o de hardware equivalente.
 */
export function tentativasRelay(motor, plano, platform = process.platform) {
  const nomes = motor?.encoders ?? []
  const hw = motor?.encoder?.hardware ? motor.encoder.nome : null
  if (!plano.video) return [{ encoder: 'libx264', hwDecode: false }]
  if (plano.video.codec === 'hevc') {
    if (nomes.includes('libx265')) return [{ encoder: 'libx265', hwDecode: false }]
    const h = hw?.replace('h264_', 'hevc_')
    return h ? [{ encoder: h, hwDecode: false }] : [{ encoder: 'libx265', hwDecode: false }]
  }
  const out = []
  if (nomes.includes('libx264') || motor?.encoder?.nome === 'libx264') out.push({ encoder: 'libx264', hwDecode: false })
  if (hw) {
    if (platform === 'darwin') out.push({ encoder: hw, hwDecode: true })
    out.push({ encoder: hw, hwDecode: false })
  }
  return out.length ? out : [{ encoder: 'libx264', hwDecode: false }]
}

const ultimaLinha = t => String(t || '').trim().split(/\r?\n/).filter(Boolean).pop()?.slice(0, 300) || ''

/** Converte tentando os codificadores na ordem. Devolve o codificador usado; lança Error com motivo curto, ou AbortError. */
export async function transcodificarRelay(motor, { input, output, plano, origem, signal, onProgress, tmpDir, log = () => {} }) {
  const dur = origem?.duracao || 0
  let ultimo = null
  for (const t of tentativasRelay(motor, plano)) {
    await fsp.rm(output, { force: true })
    const passes = argsFfmpeg(plano, { input, output, origem, encoder: t.encoder, hwDecode: t.hwDecode, log: path.join(tmpDir ?? path.dirname(output), 'passe') })
    let falhou = null
    for (let i = 0; i < passes.length && !falhou; i++) {
      let buf = ''
      const r = await runTool(motor.ffmpeg.path, passes[i], {
        signal,
        timeoutMs: timeoutFor(dur) * passes.length,
        stallMs: STALL_MS,
        onStdout: s => {
          buf += s
          const linhas = buf.split('\n')
          buf = linhas.pop()
          for (const l of linhas) {
            const m = /^out_time_(?:us|ms)=(\d+)/.exec(l.trim())
            if (m && dur > 0) onProgress?.(Math.min(0.999, (i + Number(m[1]) / 1e6 / dur) / passes.length))
          }
        },
      })
      if (r.aborted) throw abortError(signal)
      if (r.code !== 0 || r.timedOut || r.stalled || r.error)
        falhou = r.timedOut ? 'tempo esgotado' : r.stalled ? 'o conversor travou' : r.error ? `não consegui rodar o ffmpeg (${r.error.code || r.error.message})` : `${t.encoder}: ${ultimaLinha(r.stderr) || `saiu com ${r.code}`}`
      if (falhou && (r.timedOut || r.stalled || r.error)) {
        log(`relay: ${falhou}`)
        throw new Error(falhou)
      }
    }
    if (!falhou) return t.encoder
    ultimo = falhou
    log(`relay: ${ultimo}`)
  }
  throw new Error(ultimo || 'nenhum codificador funcionou')
}

/** O original deste vídeo neste computador (o envio que subiu ele, ainda com o mesmo tamanho), ou null. */
export async function originalLocal(manager, accountId, item) {
  const p = originaisLocais(manager, accountId).get(item.id)
  if (!p) return null
  const st = await fsp.stat(p).catch(() => null)
  return st?.isFile() && st.size === item.size ? p : null
}

/** MD5 (hex) de um arquivo local, para conferir com o que o Drive guardou. */
export async function md5Arquivo(file, signal) {
  const hash = crypto.createHash('md5')
  for await (const chunk of createReadStream(file, { highWaterMark: 4 * MB, signal })) hash.update(chunk)
  return hash.digest('hex')
}

/**
 * Converte um arquivo do Drive para um destino do Relay e sobe ao lado dele.
 * @param {object} o
 * @param {import('./previa-fila.js').GeradorPrevias} o.gerador motor, vaga, download e envio (os da prévia leve)
 * @param {object} o.drive DriveClient da conta
 * @param {object} o.item DriveItem do original (id, name, size, parents, driveId)
 * @param {string} o.destino id do preset do Relay
 * @param {string|null} [o.localPath] o original neste computador (envio da fila, mesmo tamanho); sem ele, baixa
 * @param {(fase: 'esperando'|'baixando'|'analisando'|'convertendo'|'enviando'|'conferindo', frac?: number) => void} [o.onFase]
 * @param {string|null} [o.parentId] a pasta do Drive onde a versão sobe (o Maestro manda a de entregas); sem ela, a do original
 * @param {() => Promise<void>} [o.antesDeSubir] chamada logo antes de subir (o pedido do Maestro confere se não foi
 *   cancelado; lançar aqui para tudo e nada sobe)
 * @param {string|null} [o.pedido] id do pedido da fila (vai nas appProperties do arquivo novo)
 * @returns {Promise<{ fileId, nome, size, encoder, destino, avisos: string[], conferido: boolean, md5: string, pastaId: string|null }>}
 */
export async function converterComRelay({ gerador, drive, item, destino, localPath = null, signal, onFase, parentId = null, antesDeSubir = null, pedido = null, tmpRoot = os.tmpdir(), log = () => {} }) {
  const p = destinoRelay(destino)
  if (!p) throw Object.assign(new Error('Destino desconhecido.'), { status: 400 })
  const motor = await gerador.motor()
  if (!motor?.ffmpeg?.path) throw Object.assign(new Error(motor?.aviso || 'Este computador não tem o ffmpeg para converter.'), { status: 409 })
  onFase?.('esperando')
  return gerador.emVaga(async () => {
    let baixado = null
    let dir = null
    try {
      // A pasta de destino (outra que a do original): existe e é pasta, e em qual drive está, antes de baixar e converter.
      const pasta = parentId || item.parents?.[0] || null
      let driveId = item.driveId ?? null
      if (parentId && parentId !== item.parents?.[0]) {
        const alvo = await drive.getItem(parentId, { signal })
        if (!alvo?.isFolder) throw new Error('a pasta de destino não é mais uma pasta do Drive')
        driveId = alvo.driveId ?? null
      }
      let input = localPath
      if (!input) {
        baixado = await gerador.baixarOriginal(drive, item, { signal, onFase })
        input = baixado.path
      }
      onFase?.('analisando')
      const r = await runTool(motor.ffmpeg.path, ['-hide_banner', '-nostdin', '-i', input], { timeoutMs: PROBE_TIMEOUT_MS, signal })
      if (r.aborted) throw abortError(signal)
      const origem = origemDoProbe(r.stderr)
      if (!origem) throw new Error('o ffmpeg não abriu este arquivo como vídeo nem áudio')
      const plano = planejar(origem, p, { motor: 'computador' })

      dir = await fsp.mkdtemp(path.join(tmpRoot, 'sobedesce-relay-'))
      const output = path.join(dir, `saida.${extensao(plano.formato)}`)
      onFase?.('convertendo', 0)
      const encoder = await transcodificarRelay(motor, { input, output, plano, origem, signal, tmpDir: dir, onProgress: f => onFase?.('convertendo', f), log })
      const st = await fsp.stat(output)
      if (st.size < 1024) throw new Error('o convertido saiu vazio')

      await antesDeSubir?.()
      onFase?.('enviando', 0)
      const nome = nomeSaida(item.name, p)
      const fileId = await gerador.subirArquivo(drive, {
        localPath: output,
        name: nome,
        parentId: pasta,
        driveId,
        appProperties: { sobedesce: RELAY_MARCA, original: item.id, destino: p.id, ...(pedido ? { pedido } : {}) },
        signal,
        onFrac: f => onFase?.('enviando', f),
      })
      onFase?.('conferindo')
      const [md5, noDrive] = await Promise.all([md5Arquivo(output, signal), drive.getItem(fileId, { signal })])
      if (noDrive.md5 && noDrive.md5 !== md5) throw new Error('o arquivo no Drive não bateu com o convertido (MD5 diferente)')
      log(`relay: "${item.name}" → ${noDrive.name || nome} (${p.id}, ${encoder})`)
      return { fileId, nome: noDrive.name || nome, size: st.size, encoder, destino: p.id, avisos: plano.avisos, conferido: Boolean(noDrive.md5), md5, pastaId: pasta }
    } finally {
      await baixado?.limpar()
      if (dir) await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }, signal)
}

/** Caminho livre ao lado do original: "<nome> (<destino>).mp4", ou "… 2.mp4", "… 3.mp4" se já existir. Nunca grava por cima. */
export async function caminhoLivre(pasta, nome) {
  const ext = path.extname(nome)
  const base = nome.slice(0, nome.length - ext.length)
  for (let i = 1; i < 1000; i++) {
    const p = path.join(pasta, i === 1 ? nome : `${base} ${i}${ext}`)
    const existe = await fsp.stat(p).then(() => true, () => false)
    if (!existe) return p
  }
  throw new Error('não achei um nome livre ao lado do original')
}

/**
 * "Máxima qualidade" (o site do Relay manda para cá): um arquivo DESTE computador vira a versão de um destino com o
 * x264 e fica na MESMA PASTA do original, com nome novo. Escreve em "<saída>.sobedesce-parcial" e só renomeia no fim:
 * nada pela metade com nome de pronto, nada por cima. O original nunca muda.
 * @returns {Promise<{ caminho, nome, size, encoder, destino, avisos }>}
 */
export async function converterLocal({ gerador, caminho, destino, signal, onFase, log = () => {} }) {
  const p = destinoRelay(destino)
  if (!p) throw Object.assign(new Error('Destino desconhecido.'), { status: 400 })
  const st = await fsp.stat(caminho).catch(() => null)
  if (!st?.isFile()) throw Object.assign(new Error('O arquivo não está mais aqui.'), { status: 404 })
  const motor = await gerador.motor()
  if (!motor?.ffmpeg?.path) throw Object.assign(new Error(motor?.aviso || 'Este computador não tem o ffmpeg para converter.'), { status: 409 })
  onFase?.('esperando')
  return gerador.emVaga(async () => {
    let parcial = null
    let dir = null
    try {
      onFase?.('analisando')
      const r = await runTool(motor.ffmpeg.path, ['-hide_banner', '-nostdin', '-i', caminho], { timeoutMs: PROBE_TIMEOUT_MS, signal })
      if (r.aborted) throw abortError(signal)
      const origem = origemDoProbe(r.stderr)
      if (!origem) throw new Error('o ffmpeg não abriu este arquivo como vídeo nem áudio')
      const plano = planejar(origem, p, { motor: 'computador' })
      const final = await caminhoLivre(path.dirname(caminho), nomeSaida(path.basename(caminho), p))
      parcial = `${final}.sobedesce-parcial`
      dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sobedesce-relay-')) // log das duas passadas
      onFase?.('convertendo', 0)
      // o ffmpeg escolhe o contêiner pela extensão: grava num nome com a extensão certa dentro da pasta temporária e
      // traz para o lado do original como parcial antes de renomear (cópia se for outro disco)
      const saida = path.join(dir, `saida.${extensao(plano.formato)}`)
      const encoder = await transcodificarRelay(motor, { input: caminho, output: saida, plano, origem, signal, tmpDir: dir, onProgress: f => onFase?.('convertendo', f), log })
      const tam = (await fsp.stat(saida)).size
      if (tam < 1024) throw new Error('o convertido saiu vazio')
      onFase?.('conferindo')
      await fsp.rename(saida, parcial).catch(() => fsp.copyFile(saida, parcial))
      await fsp.rename(parcial, final)
      parcial = null
      log(`relay: "${caminho}" → ${final} (${p.id}, ${encoder})`)
      return { caminho: final, nome: path.basename(final), size: tam, encoder, destino: p.id, avisos: plano.avisos }
    } finally {
      if (parcial) await fsp.rm(parcial, { force: true }).catch(() => {})
      if (dir) await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }, signal)
}
