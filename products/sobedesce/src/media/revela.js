// "Converter com a Revela" (botão direito num vídeo da tela Drive, ou pedido do celular): o master que está no Drive
// vira a versão de entrega de um destino (YouTube, Vimeo, Reels, TikTok) e sobe AO LADO do original. O original nunca
// muda. Quem decide codec, bitrate, tamanho e áudio é a Revela (src/revela/, cópia conferida por teste de
// products/finishing); aqui só executa, com o ffmpeg do app e o codificador de hardware da máquina (o mesmo motor e a
// mesma vaga da prévia leve: uma conversão por vez no app inteiro).
//
//   original na fila (o envio que subiu ele) ou baixado do Drive ──▶ ffmpeg -i (lê) ──▶ planejar (Revela)
//     ──▶ ffmpeg (H.264 + AAC, marcado BT.709 1-1-1) ──▶ sobe na mesma pasta ──▶ confere o MD5 do Drive
import { createReadStream } from 'node:fs'
import fsp from 'node:fs/promises'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { abortError } from '../util/backoff.js'
import { parseProbe, plano as tentativas, runTool, timeoutFor } from './previa.js'
import { originaisLocais } from './previa-lote.js'
import { DESTINOS_CONVERSAO, nomeSaida, planejar } from '../revela/conversao/plano.js'

/** Marca (appProperties.sobedesce) do arquivo que a Revela gerou. */
export const REVELA_MARCA = 'revela'

/** Os destinos que dá para gerar daqui (os mesmos do conversor da Revela). */
export const DESTINOS_REVELA = DESTINOS_CONVERSAO
export const destinoRevela = id => DESTINOS_CONVERSAO.find(d => d.id === id) ?? null

const STALL_MS = 5 * 60_000
const PROBE_TIMEOUT_MS = 60_000
const MB = 1024 * 1024

// Nomes do ffmpeg → os que o plano da Revela usa (os do WebCodecs).
const TRANSFER = { smpte2084: 'pq', 'arib-std-b67': 'hlg' }

/**
 * Lê a saída do `ffmpeg -i` no formato que o plano da Revela espera:
 * { largura, altura, fps, duracao, temAudio, cor: { primaries, transfer, matrix } | null }. null se não há vídeo.
 * Largura e altura são as que aparecem na tela (pixel não quadrado e celular deitado já corrigidos).
 */
export function origemDoProbe(text, info = parseProbe(text)) {
  const v = info?.video
  if (!v?.width || !v?.height) return null
  const linha = String(text ?? '').split(/\r?\n/).find(l => /Stream #\d+:\d+.*?: Video: /.test(l) && !/attached pic/.test(l)) || ''
  const fps = Number((/([\d.]+) fps/.exec(linha) || [])[1]) || Number((/([\d.]+) tbr/.exec(linha) || [])[1]) || 30
  let largura = v.sar && v.sar[0] !== v.sar[1] ? Math.round((v.width * v.sar[0]) / v.sar[1]) : v.width
  let altura = v.height
  if (Math.abs(info.rotation) === 90 || Math.abs(info.rotation) === 270) [largura, altura] = [altura, largura]
  // "yuv422p10le(tv, bt709, progressive)" = as três iguais; "yuv420p10le(tv, bt2020nc/bt2020/smpte2084)" = matriz/primárias/transferência
  const c = /\((?:tv|pc), ([\w-]+)(?:\/([\w-]+)\/([\w-]+))?/.exec(linha)
  const cor = c && c[1] !== 'progressive' ? { matrix: c[1], primaries: c[2] ?? c[1], transfer: TRANSFER[c[3] ?? c[1]] ?? (c[3] ?? c[1]) } : null
  return { largura, altura, fps, duracao: info.durationS || 0, temAudio: Boolean(info.audio), cor }
}

/** Formato de pixel que cada codificador aceita melhor (8 bits 4:2:0). */
const pixFor = encoder => (encoder === 'h264_qsv' || encoder === 'h264_mf' ? 'nv12' : 'yuv420p')

/** Codificador com o bitrate do destino: alvo da Revela, teto 1,5× e reserva 2×, perfil High. */
export function encoderArgsRevela(encoder, kbps) {
  const k = n => `${Math.round(n)}k`
  const vbr = ['-b:v', k(kbps), '-maxrate', k(kbps * 1.5), '-bufsize', k(kbps * 2)]
  switch (encoder) {
    case 'h264_videotoolbox':
      return ['-c:v', encoder, '-b:v', k(kbps), '-profile:v', 'high', '-allow_sw', '1', '-realtime', '0']
    case 'h264_nvenc':
      return ['-c:v', encoder, '-preset', 'p6', '-rc', 'vbr', ...vbr, '-profile:v', 'high']
    case 'h264_qsv':
      return ['-c:v', encoder, '-preset', 'slow', ...vbr, '-profile:v', 'high']
    case 'h264_amf':
      return ['-c:v', encoder, '-quality', 'quality', '-rc', 'vbr_peak', ...vbr, '-profile:v', 'high']
    case 'h264_mf':
      return ['-c:v', encoder, '-hw_encoding', '1', '-rate_control', 'u_vbr', '-b:v', k(kbps)]
    case 'libx264':
    default:
      return ['-c:v', 'libx264', '-preset', 'medium', ...vbr, '-profile:v', 'high']
  }
}

/**
 * Linha de comando (sem shell) para um destino da Revela. Imagem no tamanho do plano (pixels quadrados), matriz
 * BT.709 e faixa de TV, GOP de meio segundo (o que o YouTube pede), marcado 1-1-1; áudio AAC 48 kHz estéreo.
 */
export function argsRevela({ input, output, encoder = 'libx264', hwDecode = false, plano, fps = 30 }) {
  const v = plano.video
  const a = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats']
  if (hwDecode) a.push('-hwaccel', 'videotoolbox')
  a.push('-i', input, '-map', '0:v:0')
  if (plano.audio) a.push('-map', '0:a:0?')
  a.push('-dn', '-sn', '-map_chapters', '-1')
  a.push('-vf', `scale=${v.largura}:${v.altura}:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1,format=${pixFor(encoder)}`)
  a.push(...encoderArgsRevela(encoder, v.bitrate / 1000), '-g', String(Math.max(1, Math.round(fps / 2))))
  a.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv')
  if (plano.audio) a.push('-c:a', 'aac', '-b:a', `${Math.round(plano.audio.bitrate / 1000)}k`, '-ar', String(plano.audio.taxa || 48000), '-ac', '2')
  else a.push('-an')
  a.push('-movflags', '+faststart', '-f', 'mp4', output)
  return a
}

const ultimaLinha = t => String(t || '').trim().split(/\r?\n/).filter(Boolean).pop()?.slice(0, 300) || ''

/**
 * Converte tentando os codificadores do motor (hardware primeiro, libx264 por último), como a prévia leve.
 * Devolve o codificador usado; lança Error com motivo curto, ou AbortError.
 */
export async function transcodificarRevela(motor, { input, output, plano, origem, signal, onProgress, log = () => {} }) {
  const dur = origem?.duracao || 0
  let ultimo = null
  for (const t of tentativas(motor)) {
    await fsp.rm(output, { force: true })
    let buf = ''
    const r = await runTool(motor.ffmpeg.path, argsRevela({ input, output, plano, fps: origem?.fps, ...t }), {
      signal,
      timeoutMs: timeoutFor(dur),
      stallMs: STALL_MS,
      onStdout: s => {
        buf += s
        const linhas = buf.split('\n')
        buf = linhas.pop()
        for (const l of linhas) {
          const m = /^out_time_(?:us|ms)=(\d+)/.exec(l.trim())
          if (m && dur > 0) onProgress?.(Math.min(0.999, Number(m[1]) / 1e6 / dur))
        }
      },
    })
    if (r.aborted) throw abortError(signal)
    if (r.code === 0 && !r.timedOut && !r.stalled && !r.error) return t.encoder
    ultimo = r.timedOut ? 'tempo esgotado' : r.stalled ? 'o conversor travou' : r.error ? `não consegui rodar o ffmpeg (${r.error.code || r.error.message})` : `${t.encoder}: ${ultimaLinha(r.stderr) || `saiu com ${r.code}`}`
    log(`revela: ${ultimo}`)
    if (r.timedOut || r.stalled || r.error) break
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
 * Converte um vídeo do Drive para um destino da Revela e sobe ao lado dele.
 * @param {object} o
 * @param {import('./previa-fila.js').GeradorPrevias} o.gerador motor, vaga, download e envio (os da prévia leve)
 * @param {object} o.drive DriveClient da conta
 * @param {object} o.item DriveItem do original (id, name, size, parents, driveId)
 * @param {string} o.destino id do destino (youtube, vimeo, reels, tiktok)
 * @param {string|null} [o.localPath] o original neste computador (envio da fila, mesmo tamanho); sem ele, baixa
 * @param {(fase: 'esperando'|'baixando'|'analisando'|'convertendo'|'enviando'|'conferindo', frac?: number) => void} [o.onFase]
 * @returns {Promise<{ fileId, nome, size, encoder, destino, avisos: string[], conferido: boolean }>}
 */
export async function converterComRevela({ gerador, drive, item, destino, localPath = null, signal, onFase, tmpRoot = os.tmpdir(), log = () => {} }) {
  const d = destinoRevela(destino)
  if (!d) throw Object.assign(new Error('Destino desconhecido.'), { status: 400 })
  const motor = await gerador.motor()
  if (!motor?.ffmpeg?.path) throw Object.assign(new Error(motor?.aviso || 'Este computador não tem o ffmpeg para converter.'), { status: 409 })
  onFase?.('esperando')
  return gerador.emVaga(async () => {
    let baixado = null
    let dir = null
    try {
      let input = localPath
      if (!input) {
        baixado = await gerador.baixarOriginal(drive, item, { signal, onFase })
        input = baixado.path
      }
      onFase?.('analisando')
      const r = await runTool(motor.ffmpeg.path, ['-hide_banner', '-nostdin', '-i', input], { timeoutMs: PROBE_TIMEOUT_MS, signal })
      if (r.aborted) throw abortError(signal)
      const origem = origemDoProbe(r.stderr)
      if (!origem) throw new Error('o ffmpeg não abriu este arquivo como vídeo')
      const plano = planejar(origem, d)

      dir = await fsp.mkdtemp(path.join(tmpRoot, 'sobedesce-revela-'))
      const output = path.join(dir, 'saida.mp4')
      onFase?.('convertendo', 0)
      const encoder = await transcodificarRevela(motor, { input, output, plano, origem, signal, onProgress: f => onFase?.('convertendo', f), log })
      const st = await fsp.stat(output)
      if (st.size < 1024) throw new Error('o convertido saiu vazio')

      onFase?.('enviando', 0)
      const nome = nomeSaida(item.name, d)
      const fileId = await gerador.subirArquivo(drive, {
        localPath: output,
        name: nome,
        parentId: item.parents?.[0],
        driveId: item.driveId ?? null,
        appProperties: { sobedesce: REVELA_MARCA, original: item.id, destino: d.id },
        signal,
        onFrac: f => onFase?.('enviando', f),
      })
      onFase?.('conferindo')
      const [md5, noDrive] = await Promise.all([md5Arquivo(output, signal), drive.getItem(fileId, { signal })])
      if (noDrive.md5 && noDrive.md5 !== md5) throw new Error('o arquivo no Drive não bateu com o convertido (MD5 diferente)')
      log(`revela: "${item.name}" → ${noDrive.name || nome} (${d.id}, ${encoder})`)
      return { fileId, nome: noDrive.name || nome, size: st.size, encoder, destino: d.id, avisos: plano.avisos, conferido: Boolean(noDrive.md5) }
    } finally {
      await baixado?.limpar()
      if (dir) await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }, signal)
}
