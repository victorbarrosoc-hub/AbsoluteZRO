// Rotas das Montagens (Estúdio › Montagens): fotos do computador em modelos prontos, montadas num <canvas> na tela.
// O motor só faz duas coisas: mostrar a foto que a pessoa escolheu (pela chave `k` da mídia, como as miniaturas) e
// gravar a montagem pronta (JPEG ou PNG) numa pasta do computador, sempre com nome novo (nunca grava por cima).
// TIFF e HEIC viram um JPEG de cache (o navegador não abre), feito pelo ffmpeg do motor.
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { expandHome } from '../local/fsbrowse.js'
import { miniatura } from '../frames/extracao.js'
import { detectarMotor } from '../media/previa.js'
import { safeLocalName, uniqueName } from '../util/paths.js'
import { lerCorpo, servir } from './frames.js'

export const FOTO_EXTS = ['.jpg', '.jpeg', '.png', '.webp']
export const FOTO_EXTS_CONVERTE = ['.tif', '.tiff', '.heic', '.heif']
const FOTO_MAX = 200 * 1024 * 1024
const MONTAGEM_MAX = 80 * 1024 * 1024
const FORMATO = /^\d{1,2}(?:[.,]\d{1,2})?x\d{1,2}$/

/** Nome do arquivo da montagem: "<nome>_<formato>.jpg", sem caracteres que o Windows recusa. */
export function nomeMontagem(nome, formato, ext) {
  const base = String(nome || '').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Montagem'
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
    if (!FOTO_EXTS_CONVERTE.includes(ext)) throw new HttpProblem(415, 'Use fotos JPG, PNG, WebP, TIFF ou HEIC.')
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
  route('POST', '/api/montagens/salvar', tratar(async ({ req, query }) => {
    const ct = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
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
  }), { corpo: false })

  route('GET', '/api/montagens/pasta', () => ({ pasta: pastaPadrao() }))
}
