// Arquivar (Cartões, 09/11/2026): economizar espaço com o que já foi entregue. A pasta escolhida (um cartão, uma diária,
// um projeto) ganha uma irmã "<nome> · arquivo" com:
//   - RAW (ARW, NEF, CR3…) → DNG pelo Adobe DNG Converter (gratuito, instalado à parte). Quatro níveis: Máxima (sem
//     perda), Alta (com perda leve), Equilibrado (lado maior até 4096 px) e Econômico (até 2560 px).
//   - Vídeo → H.265 (MP4) pelo ffmpeg do app, nos mesmos quatro níveis, com a LUT de câmera opcional (LOG → Rec.709, a
//     mesma das prévias: src/cor/lut.js). "Testar 8 s" mostra o tamanho antes de converter tudo.
//   - O resto (XML, áudio, JPG) vai copiado igual.
// Nada toca o original: o arquivo novo é gravado com nome provisório e só ganha o nome final inteiro; o que já existe no
// destino não é gravado por cima (fica como está e conta como "já estava").
import fsp from 'node:fs/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { scanLocal } from '../local/scan.js'
import { expandHome } from '../local/fsbrowse.js'
import { SISTEMA } from '../discos/planejar.js'
import { deixaNoCartao } from '../backup/imprevistos.js'
import { ehRaw } from '../media/raw-jpeg.js'
import { detectarMotor, isVideoName, runTool } from '../media/previa.js'
import { sondar } from '../frames/analise.js'
import { filtroCor } from '../frames/extracao.js'
import { PERFIS, cube, ehPerfil } from '../cor/lut.js'

export const NIVEIS = ['maxima', 'alta', 'equilibrado', 'economico']
export const NIVEL_NOME = { manter: 'Manter como está', maxima: 'Máxima', alta: 'Alta', equilibrado: 'Equilibrado', economico: 'Econômico' }
export const TESTE_S = 8
const PARCIAL = '.sobedesce-parcial'

export class ArquivarError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const nivelDe = (v) => (v === 'manter' || NIVEIS.includes(v) ? v : 'manter')

/** A pasta irmã onde o arquivo vai: "<pasta> · arquivo". */
export const pastaDoArquivo = (origem) => path.join(path.dirname(origem), `${path.basename(origem)} · arquivo`)

/** Onde procurar o Adobe DNG Converter (ou SOBEDESCE_DNG). */
export function candidatosDng({ env = process.env, platform = process.platform } = {}) {
  const l = []
  if (env.SOBEDESCE_DNG) l.push(env.SOBEDESCE_DNG)
  if (platform === 'darwin') l.push('/Applications/Adobe DNG Converter.app/Contents/MacOS/Adobe DNG Converter')
  if (platform === 'win32') {
    for (const pf of [env.ProgramFiles, env['ProgramFiles(x86)'], 'C:\\Program Files'])
      if (pf) l.push(path.win32.join(pf, 'Adobe', 'Adobe DNG Converter', 'Adobe DNG Converter.exe'))
  }
  return [...new Set(l)]
}

export async function acharDng(opts) {
  for (const c of candidatosDng(opts))
    if (
      await fsp.access(c, fs.constants.X_OK).then(
        () => true,
        () => false,
      )
    )
      return c
  return null
}

/** Argumentos do Adobe DNG Converter: um RAW → DNG em `pasta` (nome = o do RAW com .dng). */
export function argsDng(nivel, entrada, pasta) {
  const n = { maxima: ['-c'], alta: ['-lossy'], equilibrado: ['-lossy', '-side', '4096'], economico: ['-lossy', '-side', '2560'] }[nivel]
  if (!n) throw new ArquivarError(400, 'Nível de foto inválido.')
  return [...n, '-p1', '-d', pasta, entrada]
}

/** O codificador de vídeo: H.265 no Mac pela placa, senão libx265; sem H.265, H.264. */
export async function codificadorVideo(ffmpeg, { platform = process.platform, run = runTool } = {}) {
  const r = await run(ffmpeg, ['-hide_banner', '-encoders'], { timeoutMs: 20_000, lowPriority: false })
  const tem = (n) => new RegExp(`\\s${n}\\s`).test(r.stdout || '')
  if (platform === 'darwin' && tem('hevc_videotoolbox')) return 'hevc_videotoolbox'
  if (tem('libx265')) return 'libx265'
  return 'libx264'
}

const QUALIDADE = {
  // [crf libx265, crf libx264, qualidade da placa (0–100), lado maior]
  maxima: [20, 18, 70, null],
  alta: [23, 21, 60, null],
  equilibrado: [26, 24, 50, null],
  economico: [28, 26, 42, 1920],
}

/** Argumentos do ffmpeg para um vídeo: H.265 (ou H.264), áudio AAC, LUT opcional, só `duracao` s se pedido. */
export function argsVideo({ entrada, saida, nivel, encoder, lut = null, inicio = 0, duracao = null }) {
  const q = QUALIDADE[nivel]
  if (!q) throw new ArquivarError(400, 'Nível de vídeo inválido.')
  const filtros = []
  const cor = filtroCor(lut ? { lut } : null)
  if (cor) filtros.push(cor, 'scale=out_color_matrix=bt709:out_range=tv')
  if (q[3]) filtros.push(`scale='if(gt(iw,ih),min(${q[3]},iw),-2)':'if(gt(iw,ih),-2,min(${q[3]},ih))'`)
  filtros.push('format=yuv420p')
  const v =
    encoder === 'hevc_videotoolbox'
      ? ['-c:v', 'hevc_videotoolbox', '-q:v', String(q[2]), '-tag:v', 'hvc1']
      : encoder === 'libx265'
        ? ['-c:v', 'libx265', '-crf', String(q[0]), '-preset', 'medium', '-tag:v', 'hvc1', '-x265-params', 'log-level=error']
        : ['-c:v', 'libx264', '-crf', String(q[1]), '-preset', 'medium']
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    ...(inicio ? ['-ss', String(inicio)] : []),
    '-i',
    entrada,
    ...(duracao ? ['-t', String(duracao)] : []),
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    filtros.join(','),
    ...v,
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-map_metadata',
    '0',
    '-movflags',
    '+faststart',
    saida,
  ]
}

/** O que tem na pasta: RAW, vídeos e o resto (proxies e restos do sistema ficam de fora). */
export async function lerPasta(origem, { signal } = {}) {
  const lido = await scanLocal(origem, { signal })
  const out = { raw: [], videos: [], outros: [], bytes: { raw: 0, videos: 0, outros: 0 } }
  for (const f of lido.files) {
    if (SISTEMA.test(f.relPath) || deixaNoCartao(f.relPath) || f.relPath.endsWith(PARCIAL)) continue
    const tipo = ehRaw(f.relPath) ? 'raw' : isVideoName(f.relPath) ? 'videos' : 'outros'
    out[tipo].push({ rel: f.relPath, caminho: f.path, tamanho: f.size })
    out.bytes[tipo] += f.size
  }
  return out
}

/**
 * Um arquivo pronto em `tmp` vai para `final` sem passar por cima de nada: link + apagar o provisório. Disco que não
 * aceita link (exFAT, FAT, rede): confere que o nome está livre e renomeia.
 */
async function finalizar(tmp, final) {
  try {
    await fsp.link(tmp, final)
    await fsp.rm(tmp, { force: true })
    return true
  } catch (err) {
    if (err.code === 'EEXIST') {
      await fsp.rm(tmp, { force: true })
      return false
    }
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EINVAL'].includes(err.code)) {
      await fsp.rm(tmp, { force: true })
      throw err
    }
    if (await existe(final)) {
      await fsp.rm(tmp, { force: true })
      return false
    }
    await fsp.rename(tmp, final)
    return true
  }
}

export class Arquivador {
  /** @param {{ cacheDir: string, motor?: () => Promise<object>, dng?: () => Promise<string|null>, log?: Function, onChange?: Function }} o */
  constructor({
    cacheDir = path.join(os.tmpdir(), 'sobedesce-arquivar'),
    motor = () => detectarMotor(),
    dng = () => acharDng(),
    log = () => {},
    onChange = () => {},
  } = {}) {
    this.cacheDir = cacheDir
    this.motorFn = motor
    this.dngFn = dng
    this.log = log
    this.onChange = onChange
    this.job = null
    this.ultimo = null
    this.encoder = null
  }

  async #ferramentas() {
    const [m, dng] = await Promise.all([Promise.resolve(this.motorFn()).catch(() => null), Promise.resolve(this.dngFn()).catch(() => null)])
    const ffmpeg = m?.ffmpeg?.path || null
    if (ffmpeg && !this.encoder) this.encoder = await codificadorVideo(ffmpeg).catch(() => 'libx264')
    return { ffmpeg, dng, encoder: ffmpeg ? this.encoder : null }
  }

  async #origem(raw) {
    if (typeof raw !== 'string' || !raw.trim() || raw.includes('\0')) throw new ArquivarError(400, 'Escolha uma pasta.')
    const p = expandHome(raw)
    if (!path.isAbsolute(p)) throw new ArquivarError(400, 'Escolha uma pasta.')
    const st = await fsp.stat(p).catch(() => null)
    if (!st?.isDirectory()) throw new ArquivarError(404, 'Não achei essa pasta. O disco está conectado?')
    if (path.basename(p).endsWith(' · arquivo')) throw new ArquivarError(400, 'Essa já é uma pasta de arquivo.')
    return p
  }

  async #lut(perfil) {
    if (!perfil || perfil === 'rec709') return null
    if (!ehPerfil(perfil)) throw new ArquivarError(400, 'LUT inválida.')
    await fsp.mkdir(this.cacheDir, { recursive: true })
    const arq = path.join(this.cacheDir, `lut-${perfil}.cube`)
    if (!(await fsp.stat(arq).catch(() => null))) {
      await fsp.writeFile(`${arq}.tmp`, cube(perfil))
      await fsp.rename(`${arq}.tmp`, arq)
    }
    return arq
  }

  estado() {
    const j = this.job
    return {
      job: j
        ? {
            origem: j.origem,
            destino: j.destino,
            fase: j.fase,
            feitos: j.feitos,
            total: j.total,
            atual: j.atual,
            bytesAntes: j.bytesAntes,
            bytesDepois: j.bytesDepois,
            ja: j.ja,
            erros: j.erros.slice(0, 50),
          }
        : null,
      ultimo: this.ultimo,
      niveis: NIVEIS.map((id) => ({ id, nome: NIVEL_NOME[id] })),
      perfis: Object.entries(PERFIS).map(([id, p]) => ({ id, nome: p.nome })),
    }
  }

  /** O que a pasta tem e o que dá para fazer com ela (ferramentas encontradas). */
  async planejar(raw) {
    const origem = await this.#origem(raw)
    const l = await lerPasta(origem)
    const f = await this.#ferramentas()
    return {
      origem,
      destino: pastaDoArquivo(origem),
      raw: l.raw.length,
      videos: l.videos.length,
      outros: l.outros.length,
      bytes: l.bytes,
      dng: !!f.dng,
      video: !!f.ffmpeg,
      encoder: f.encoder,
    }
  }

  /** "Testar 8 s": converte 8 s do maior vídeo e diz quanto a pasta de vídeos ficaria. */
  async testar({ origem: raw, nivel, perfil = null }) {
    const origem = await this.#origem(raw)
    if (!NIVEIS.includes(nivel)) throw new ArquivarError(400, 'Escolha o nível do vídeo.')
    const f = await this.#ferramentas()
    if (!f.ffmpeg) throw new ArquivarError(409, 'Para compactar vídeo, o SOBEDESCE precisa do ffmpeg.')
    const l = await lerPasta(origem)
    const v = l.videos.slice().sort((a, b) => b.tamanho - a.tamanho)[0]
    if (!v) throw new ArquivarError(404, 'Essa pasta não tem vídeo.')
    const info = await sondar(f.ffmpeg, v.caminho)
    const dur = Math.min(TESTE_S, info.durationS)
    const inicio = info.durationS > TESTE_S * 3 ? Math.round(info.durationS / 3) : 0
    await fsp.mkdir(this.cacheDir, { recursive: true })
    const saida = path.join(this.cacheDir, `teste-${crypto.randomBytes(4).toString('hex')}.mp4`)
    const r = await runTool(f.ffmpeg, argsVideo({ entrada: v.caminho, saida, nivel, encoder: f.encoder, lut: await this.#lut(perfil), inicio, duracao: dur }), {
      timeoutMs: 5 * 60_000,
    })
    const st = await fsp.stat(saida).catch(() => null)
    if (r.code !== 0 || !st?.size) throw new ArquivarError(422, 'O teste não deu certo com esse vídeo.')
    const razao = st.size / dur / (v.tamanho / info.durationS)
    return {
      arquivo: saida,
      rel: v.rel,
      segundos: dur,
      antesPorSeg: Math.round(v.tamanho / info.durationS),
      depoisPorSeg: Math.round(st.size / dur),
      razao,
      estimativaVideos: Math.round(l.bytes.videos * Math.min(1, razao)),
    }
  }

  /** Converte e copia tudo para "<pasta> · arquivo". Um trabalho por vez; o progresso sai em estado(). */
  async iniciar({ origem: raw, nivelFoto = 'manter', nivelVideo = 'manter', perfil = null }) {
    if (this.job) throw new ArquivarError(409, 'Já tem um arquivo sendo feito.')
    const origem = await this.#origem(raw)
    const nf = nivelDe(nivelFoto)
    const nv = nivelDe(nivelVideo)
    const f = await this.#ferramentas()
    if (nf !== 'manter' && !f.dng) throw new ArquivarError(409, 'Para converter RAW em DNG, instale o Adobe DNG Converter (gratuito) e tente de novo.')
    if (nv !== 'manter' && !f.ffmpeg) throw new ArquivarError(409, 'Para compactar vídeo, o SOBEDESCE precisa do ffmpeg.')
    const lut = nv !== 'manter' ? await this.#lut(perfil) : null
    const l = await lerPasta(origem)
    const itens = [
      ...l.raw.map((x) => ({ ...x, tipo: 'raw' })),
      ...l.videos.map((x) => ({ ...x, tipo: 'video' })),
      ...l.outros.map((x) => ({ ...x, tipo: 'outro' })),
    ]
    const destino = pastaDoArquivo(origem)
    const ac = new AbortController()
    const job = (this.job = {
      origem,
      destino,
      fase: 'arquivando',
      feitos: 0,
      total: itens.length,
      atual: null,
      bytesAntes: 0,
      bytesDepois: 0,
      ja: 0,
      erros: [],
      ac,
    })
    this.onChange()
    this.rodando = this.#rodar(job, itens, { nf, nv, lut, f }).finally(() => {
      this.ultimo = {
        origem,
        destino,
        feitos: job.feitos,
        total: job.total,
        bytesAntes: job.bytesAntes,
        bytesDepois: job.bytesDepois,
        ja: job.ja,
        erros: job.erros.slice(0, 50),
        cancelado: ac.signal.aborted,
        terminouEm: new Date().toISOString(),
      }
      this.job = null
      this.onChange()
    })
    return this.estado()
  }

  cancelar() {
    this.job?.ac.abort()
    return this.estado()
  }

  async #rodar(job, itens, { nf, nv, lut, f }) {
    const signal = job.ac.signal
    for (const it of itens) {
      if (signal.aborted) break
      job.atual = it.rel
      this.onChange()
      const pasta = path.join(
        job.destino,
        ...path
          .dirname(it.rel)
          .split('/')
          .filter((p) => p && p !== '.'),
      )
      try {
        await fsp.mkdir(pasta, { recursive: true })
        const base = path.basename(it.rel)
        let final
        let feito = false
        if (it.tipo === 'raw' && nf !== 'manter') {
          final = path.join(pasta, base.replace(/\.[^.]+$/, '.dng'))
          if (await existe(final)) job.ja++
          else {
            // o conversor grava com o nome dele numa pasta provisória; depois o DNG vai para o lugar sem passar por cima
            const tmpDir = await fsp.mkdtemp(path.join(pasta, `.sobedesce-dng-`))
            try {
              const r = await runTool(f.dng, argsDng(nf, it.caminho, tmpDir), { timeoutMs: 10 * 60_000, signal })
              const gerado = (await fsp.readdir(tmpDir)).find((n) => /\.dng$/i.test(n))
              if (r.code !== 0 || !gerado) throw new Error('o DNG Converter não converteu')
              feito = await finalizar(path.join(tmpDir, gerado), final)
              if (!feito) job.ja++
            } finally {
              await fsp.rm(tmpDir, { recursive: true, force: true })
            }
          }
        } else if (it.tipo === 'video' && nv !== 'manter') {
          final = path.join(pasta, base.replace(/\.[^.]+$/, '.mp4'))
          if (await existe(final)) job.ja++
          else {
            const tmp = `${final}${PARCIAL}.mp4`
            const r = await runTool(f.ffmpeg, argsVideo({ entrada: it.caminho, saida: tmp, nivel: nv, encoder: f.encoder, lut }), {
              timeoutMs: 6 * 3600_000,
              stallMs: 5 * 60_000,
              signal,
            })
            if (r.code !== 0 || !(await existe(tmp))) {
              await fsp.rm(tmp, { force: true })
              throw new Error('o ffmpeg não converteu este vídeo')
            }
            feito = await finalizar(tmp, final)
            if (!feito) job.ja++
          }
        } else {
          final = path.join(pasta, base)
          if (await existe(final)) job.ja++
          else {
            const tmp = `${final}${PARCIAL}`
            await fsp.copyFile(it.caminho, tmp)
            feito = await finalizar(tmp, final)
            if (!feito) job.ja++
          }
        }
        if (feito) {
          job.bytesAntes += it.tamanho
          job.bytesDepois += (await fsp.stat(final)).size
        }
      } catch (err) {
        if (signal.aborted) break
        job.erros.push({ rel: it.rel, erro: err?.message || 'falhou' })
        this.log('arquivar:', it.rel, err?.message)
      }
      job.feitos++
      this.onChange()
    }
    job.atual = null
  }
}

const existe = (p) =>
  fsp.stat(p).then(
    () => true,
    () => false,
  )
