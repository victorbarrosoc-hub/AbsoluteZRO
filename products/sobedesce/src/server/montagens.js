// Rotas das Montagens (Estúdio › Montagens): fotos do computador em modelos prontos, montadas num <canvas> na tela.
// O motor só faz duas coisas: mostrar a foto que a pessoa escolheu (pela chave `k` da mídia, como as miniaturas) e
// gravar a montagem pronta (JPEG ou PNG) numa pasta do computador, sempre com nome novo (nunca grava por cima).
// TIFF e HEIC viram um JPEG de cache (o navegador não abre), feito pelo ffmpeg do motor.
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { expandHome } from '../local/fsbrowse.js'
import { miniatura } from '../frames/extracao.js'
import { sondar } from '../frames/analise.js'
import { detectarMotor, isVideoName } from '../media/previa.js'
import { ehRaw, jpegDoRaw } from '../media/raw-jpeg.js'
import { DURACOES, gerarMontagemVideo } from '../montagens/video.js'
import { safeLocalName, uniqueName } from '../util/paths.js'
import { lerCorpo, servir } from './frames.js'

export const FOTO_EXTS = ['.jpg', '.jpeg', '.png', '.webp']
export const FOTO_EXTS_CONVERTE = ['.tif', '.tiff', '.heic', '.heif']
const FOTO_MAX = 200 * 1024 * 1024
const MONTAGEM_MAX = 80 * 1024 * 1024
const FORMATO = /^\d{1,4}(?:[.,]\d{1,2})?x\d{1,4}(?:_\d{2})?$/
const BASE_ID = /^b[0-9a-f]{24}$/
const MAX_QUADROS = 12
const BASE_VIDA_MS = 6 * 60 * 60 * 1000

/** Nome do arquivo da montagem: "<nome>_<formato>.jpg", sem caracteres que o Windows recusa. */
export function nomeMontagem(nome, formato, ext) {
  const base =
    String(nome || '')
      .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Montagem'
  const f = FORMATO.test(formato || '') ? formato.replace(',', '.') : null
  return safeLocalName(`${base}${f ? `_${f}` : ''}.${ext}`, 'win32')
}

/**
 * @param {{ route, ctx, HttpProblem, baseHeaders }} o
 */
export function registerMontagens({ route, ctx, HttpProblem, baseHeaders }) {
  let motorP = null
  const motor = () => {
    if (ctx.manager?.previas?.motor) return ctx.manager.previas.motor()
    motorP ??= detectarMotor()
    return motorP
  }
  const cacheDir = path.join(ctx.paths?.root || path.dirname(ctx.paths?.settings || '.'), 'montagens-cache')

  const chave = (req, query) => {
    if (!ctx.media) throw new HttpProblem(404, 'Indisponível nesta versão.')
    ctx.media.check(req, query)
  }

  const caminhoLocal = async (raw, { pasta = false } = {}) => {
    if (typeof raw !== 'string' || !raw.trim() || raw.includes('\0') || raw.length > 4096) return null
    const p = expandHome(raw)
    if (!path.isAbsolute(p)) return null
    const st = await fsp.stat(p).catch(() => null)
    if (!st || (pasta ? !st.isDirectory() : !st.isFile())) return null
    return { p, st }
  }

  const pastaPadrao = () => path.join(ctx.settings.get().downloadDir || path.join(process.env.HOME || '.', 'Downloads'), 'Montagens')

  const tratar = (fn) => async (a) => {
    try {
      return await fn(a)
    } catch (err) {
      if (err instanceof HttpProblem) throw err
      if (err?.status) throw new HttpProblem(err.status, err.message)
      throw err
    }
  }

  // A foto escolhida, para o <img> da montagem.
  const foto = tratar(async ({ req, res, query }) => {
    chave(req, query)
    const c = await caminhoLocal(query.get('p'))
    if (!c) throw new HttpProblem(404, 'Não achei essa foto no computador. O disco está conectado?')
    const ext = path.extname(c.p).toLowerCase()
    if (c.st.size > FOTO_MAX) throw new HttpProblem(400, 'Essa foto passa de 200 MB.')
    if (FOTO_EXTS.includes(ext)) return servir(req, res, c.p, baseHeaders)
    // RAW (ARW, NEF, CR3…): a prévia JPEG que a câmera grava dentro do arquivo (src/media/raw-jpeg.js), em cache.
    if (ehRaw(c.p)) {
      const id = crypto.createHash('sha1').update(`raw\0${c.p}\0${c.st.size}\0${c.st.mtimeMs}`).digest('hex').slice(0, 24)
      const jpg = path.join(cacheDir, `${id}.jpg`)
      if (!(await fsp.stat(jpg).catch(() => null))) {
        const dados = await jpegDoRaw(c.p)
        if (!dados) throw new HttpProblem(415, 'Esse RAW não tem prévia para mostrar.')
        await fsp.mkdir(cacheDir, { recursive: true })
        const tmp = `${jpg}.${process.pid}.tmp`
        await fsp.writeFile(tmp, dados)
        await fsp.rename(tmp, jpg)
      }
      return servir(req, res, jpg, baseHeaders)
    }
    if (!FOTO_EXTS_CONVERTE.includes(ext)) throw new HttpProblem(415, 'Use fotos JPG, PNG, WebP, TIFF, HEIC ou RAW.')
    // TIFF/HEIC: um JPEG de cache por arquivo e versão (caminho, tamanho e data).
    const id = crypto.createHash('sha1').update(`${c.p}\0${c.st.size}\0${c.st.mtimeMs}`).digest('hex').slice(0, 24)
    const jpg = path.join(cacheDir, `${id}.jpg`)
    if (!(await fsp.stat(jpg).catch(() => null))) {
      await fsp.mkdir(cacheDir, { recursive: true })
      const m = await motor()
      if (!m?.ffmpeg?.path) throw new HttpProblem(415, 'Para abrir TIFF e HEIC, o SOBEDESCE precisa do ffmpeg. Exporte a foto em JPG.')
      const tmp = `${jpg}.${process.pid}.tmp.jpg`
      try {
        await miniatura({ ffmpeg: m.ffmpeg.path, entrada: c.p, destino: tmp, largura: 4096 })
        await fsp.rename(tmp, jpg)
      } catch {
        await fsp.rm(tmp, { force: true })
        throw new HttpProblem(415, 'Não consegui abrir essa foto. Exporte em JPG e tente de novo.')
      }
    }
    return servir(req, res, jpg, baseHeaders)
  })
  route('GET', '/api/montagens/foto', foto, { raw: true })
  route('HEAD', '/api/montagens/foto', foto, { raw: true })

  // A montagem pronta: o corpo é a imagem; nome, formato e pasta vão na query. Nunca grava por cima.
  route(
    'POST',
    '/api/montagens/salvar',
    tratar(async ({ req, query }) => {
      const ct = String(req.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase()
      const ext = ct === 'image/png' ? 'png' : ct === 'image/jpeg' ? 'jpg' : null
      if (!ext) throw new HttpProblem(415, 'A montagem precisa ser PNG ou JPEG.')
      if (Number(req.headers['content-length']) > MONTAGEM_MAX) throw new HttpProblem(413, 'A montagem é grande demais.')
      let pasta = pastaPadrao()
      if (query.get('pasta')) {
        const c = await caminhoLocal(query.get('pasta'), { pasta: true })
        if (!c) throw new HttpProblem(400, 'Não achei essa pasta no computador.')
        pasta = c.p
      }
      let dados
      try {
        dados = await lerCorpo(req, MONTAGEM_MAX)
      } catch (err) {
        throw new HttpProblem(err.status || 400, err.status === 413 ? 'A montagem é grande demais.' : err.message)
      }
      const sig = ext === 'png' ? dados.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) : dados[0] === 0xff && dados[1] === 0xd8
      if (!sig) throw new HttpProblem(400, 'Essa imagem veio quebrada.')
      await fsp.mkdir(pasta, { recursive: true })
      const nome = nomeMontagem(query.get('nome'), query.get('formato'), ext)
      // 'wx' não abre arquivo que já existe: se outro apareceu entre o readdir e a escrita, tenta o próximo nome.
      for (let i = 0; i < 5; i++) {
        const final = uniqueName(nome, await fsp.readdir(pasta).catch(() => []))
        const arquivo = path.join(pasta, final)
        try {
          await fsp.writeFile(arquivo, dados, { flag: 'wx' })
          return { arquivo, pasta, nome: final }
        } catch (err) {
          if (err.code !== 'EEXIST') throw err
        }
      }
      throw new HttpProblem(409, 'Não consegui um nome livre nessa pasta. Tente de novo.')
    }),
    { corpo: false },
  )

  // ── takes (vídeos) na montagem

  const videoLocal = async (raw) => {
    const c = await caminhoLocal(raw)
    if (!c) throw new HttpProblem(404, 'Não achei esse vídeo no computador. O disco está conectado?')
    if (!isVideoName(c.p)) throw new HttpProblem(415, 'Escolha um vídeo (MP4, MOV…).')
    return c
  }
  const ffmpeg = async () => {
    const m = await motor()
    if (!m?.ffmpeg?.path) throw new HttpProblem(409, 'Para usar vídeo na montagem, o SOBEDESCE precisa do ffmpeg.')
    return m
  }
  const infos = new Map() // caminho+versão → info
  const infoDe = async (c) => {
    const id = `${c.p}\0${c.st.size}\0${c.st.mtimeMs}`
    if (!infos.has(id)) {
      const m = await ffmpeg()
      const i = await sondar(m.ffmpeg.path, c.p).catch(() => null)
      if (!i) throw new HttpProblem(415, 'Não consegui ler esse vídeo.')
      const gira = Math.abs(i.rotation || 0) % 180 === 90
      const vw = i.video.width || 1920
      const vh = i.video.height || 1080
      infos.set(id, { duracao: i.durationS, largura: gira ? vh : vw, altura: gira ? vw : vh, fps: i.fps || 30, audio: !!i.audio })
      if (infos.size > 200) infos.delete(infos.keys().next().value)
    }
    return infos.get(id)
  }

  route(
    'GET',
    '/api/montagens/info',
    tratar(async ({ req, query }) => {
      chave(req, query)
      return { info: await infoDe(await videoLocal(query.get('p'))) }
    }),
  )

  // O vídeo para tocar na tela (Range, para pular no trecho). MXF, ProRes e outros que o navegador não toca ficam nos
  // quadros parados (/quadro).
  const video = tratar(async ({ req, res, query }) => {
    chave(req, query)
    const c = await videoLocal(query.get('p'))
    await servir(req, res, c.p, baseHeaders)
  })
  route('GET', '/api/montagens/video', video, { raw: true })
  route('HEAD', '/api/montagens/video', video, { raw: true })

  // Um quadro do vídeo no tempo `t` (s), em JPEG de `l` px de largura: a faixa da agulha e a prévia da montagem.
  route(
    'GET',
    '/api/montagens/quadro',
    tratar(async ({ req, res, query }) => {
      chave(req, query)
      const c = await videoLocal(query.get('p'))
      const t = Math.max(0, Number(query.get('t')) || 0)
      const l = [160, 640, 1280, 1920].includes(Number(query.get('l'))) ? Number(query.get('l')) : 640
      const id = crypto
        .createHash('sha1')
        .update(`${c.p}\0${c.st.size}\0${c.st.mtimeMs}\0${t.toFixed(2)}\0${l}`)
        .digest('hex')
        .slice(0, 24)
      const jpg = path.join(cacheDir, 'quadros', `${id}.jpg`)
      if (!(await fsp.stat(jpg).catch(() => null))) {
        const m = await ffmpeg()
        await fsp.mkdir(path.dirname(jpg), { recursive: true })
        const tmp = `${jpg}.${process.pid}.${Date.now()}.tmp.jpg`
        try {
          await miniatura({ ffmpeg: m.ffmpeg.path, entrada: c.p, destino: tmp, t, largura: l })
          await fsp.rename(tmp, jpg)
        } catch {
          await fsp.rm(tmp, { force: true })
          throw new HttpProblem(415, 'Não consegui tirar um quadro desse vídeo.')
        }
      }
      await servir(req, res, jpg, baseHeaders)
    }),
    { raw: true },
  )

  // A camada de cima da montagem em vídeo (fotos, fundo, espaço e cantos; buracos onde os vídeos tocam), em PNG.
  route(
    'POST',
    '/api/montagens/base',
    tratar(async ({ req }) => {
      const ct = String(req.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase()
      if (ct !== 'image/png') throw new HttpProblem(415, 'A camada precisa ser PNG.')
      let dados
      try {
        dados = await lerCorpo(req, MONTAGEM_MAX)
      } catch (err) {
        throw new HttpProblem(err.status || 400, err.status === 413 ? 'A montagem é grande demais.' : err.message)
      }
      if (!dados.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) throw new HttpProblem(400, 'Essa imagem veio quebrada.')
      const dir = path.join(cacheDir, 'bases')
      await fsp.mkdir(dir, { recursive: true })
      // as antigas (de outras vezes) saem
      for (const n of await fsp.readdir(dir).catch(() => [])) {
        const st = await fsp.stat(path.join(dir, n)).catch(() => null)
        if (st && Date.now() - st.mtimeMs > BASE_VIDA_MS) await fsp.rm(path.join(dir, n), { force: true })
      }
      const base = `b${crypto.randomBytes(12).toString('hex')}`
      await fsp.writeFile(path.join(dir, `${base}.png`), dados)
      return { base }
    }),
    { corpo: false },
  )

  let gerando = null
  route(
    'POST',
    '/api/montagens/video',
    tratar(async ({ body }) => {
      if (gerando) throw new HttpProblem(409, 'Já tem uma montagem em vídeo sendo salva. Espere ela terminar.')
      if (typeof body.base !== 'string' || !BASE_ID.test(body.base)) throw new HttpProblem(400, 'Pedido inválido.')
      const base = path.join(cacheDir, 'bases', `${body.base}.png`)
      if (!(await fsp.stat(base).catch(() => null))) throw new HttpProblem(400, 'A montagem expirou. Salve de novo.')
      const w = Math.round(Number(body.w))
      const h = Math.round(Number(body.h))
      if (!(w >= 200 && w <= 4096 && h >= 200 && h <= 4096)) throw new HttpProblem(400, 'Tamanho inválido.')
      const duracao = Number(body.duracao)
      if (!DURACOES.includes(duracao)) throw new HttpProblem(400, 'Escolha a duração (3, 5, 8 ou 15 s).')
      if (!Array.isArray(body.quadros) || !body.quadros.length || body.quadros.length > MAX_QUADROS)
        throw new HttpProblem(400, 'Ponha pelo menos um vídeo na montagem.')
      const fin = (v, min, max) => Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max
      const quadros = []
      for (const q of body.quadros) {
        const c = await videoLocal(q?.p)
        const info = await infoDe(c)
        if (!fin(q.x, 0, w) || !fin(q.y, 0, h) || !fin(q.w, 2, w) || !fin(q.h, 2, h)) throw new HttpProblem(400, 'Quadro fora da montagem.')
        if (!fin(q.sx, 0, info.largura) || !fin(q.sy, 0, info.altura) || !fin(q.sw, 2, info.largura + 1) || !fin(q.sh, 2, info.altura + 1))
          throw new HttpProblem(400, 'Enquadre inválido.')
        if (!fin(q.inicio, 0, info.duracao)) throw new HttpProblem(400, 'Trecho fora do vídeo.')
        quadros.push({
          p: c.p,
          inicio: Number(q.inicio),
          lento: q.lento === true,
          sx: Number(q.sx),
          sy: Number(q.sy),
          sw: Math.min(Number(q.sw), info.largura - Number(q.sx)),
          sh: Math.min(Number(q.sh), info.altura - Number(q.sy)),
          x: Number(q.x),
          y: Number(q.y),
          w: Number(q.w),
          h: Number(q.h),
          audio: info.audio,
        })
      }
      let som = null
      if (body.som != null) {
        som = Number(body.som)
        if (!Number.isInteger(som) || !quadros[som]) throw new HttpProblem(400, 'Pedido inválido.')
        if (!quadros[som].audio) som = null
      }
      let pasta = pastaPadrao()
      if (body.pasta) {
        const c = await caminhoLocal(body.pasta, { pasta: true })
        if (!c) throw new HttpProblem(400, 'Não achei essa pasta no computador.')
        pasta = c.p
      }
      await fsp.mkdir(pasta, { recursive: true })
      const m = await ffmpeg()
      const nome = nomeMontagem(body.nome, typeof body.formato === 'string' ? body.formato : '', 'mp4')
      // Gera com o nome de "pela metade" e só no fim ganha o nome final (link não grava por cima de quem já existe).
      const parcial = path.join(pasta, `.${crypto.randomBytes(6).toString('hex')}.sobedesce-parcial.mp4`)
      gerando = parcial
      try {
        await gerarMontagemVideo({
          ffmpeg: m.ffmpeg.path,
          encoder: m.encoder?.nome || 'libx264',
          w,
          h,
          fundo: body.fundo,
          duracao,
          base,
          quadros,
          som,
          destino: parcial,
          onProgress: (p) => ctx.hub?.send('montagem', { progresso: p }),
        })
        for (let i = 0; i < 5; i++) {
          const final = uniqueName(nome, await fsp.readdir(pasta).catch(() => []))
          const arquivo = path.join(pasta, final)
          try {
            await fsp.link(parcial, arquivo)
            return { arquivo, pasta, nome: final }
          } catch (err) {
            if (err.code !== 'EEXIST') throw err
          }
        }
        throw new HttpProblem(409, 'Não consegui um nome livre nessa pasta. Tente de novo.')
      } catch (err) {
        if (err instanceof HttpProblem) throw err
        ctx.log?.(`[montagens] ${err?.message || err}`)
        throw new HttpProblem(500, 'Não consegui gerar o vídeo da montagem. Tente outro trecho ou outro vídeo.')
      } finally {
        gerando = null
        await fsp.rm(parcial, { force: true })
        await fsp.rm(base, { force: true })
      }
    }),
  )

  route('GET', '/api/montagens/pasta', () => ({ pasta: pastaPadrao() }))
}
