// Frames de uma pasta ou de um cartão (docs/FRAMES.md, "Pasta ou cartão"): um frame por clipe, o melhor de cada um.
// Os brutos de uma diária são muitos clipes curtos, então em vez de assistir cada um inteiro o app pula para alguns
// pontos (busca rápida do ffmpeg), mede cada quadro em pequeno, já com a cor (medidas.js, as mesmas regras do filme) e
// fica com o mais nítido e bem exposto, longe do começo e do fim (claquete, câmera ligando e parando).
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { PROXY_DIRS, isRawName, isVideoName } from '../media/previa.js'
import { LARGURA } from './analise.js'
import { etiquetas, nota } from './escolha.js'
import { medir } from './medidas.js'

export const CLIPES_MAX = 400
const PONTOS = 7 // quantos quadros medir em cada clipe
const MARGEM = 0.08 // fração do clipe que fica de fora no começo e no fim

// Pastas que não são brutos: proxy da câmera (inclui a SUB da Sony), miniaturas e o que o próprio app gera.
const PULAR = new Set([...PROXY_DIRS, 'sub', 'thmbnl', 'thumbnail', 'thumbnails', 'frames'])

/**
 * Os clipes de vídeo de uma pasta (com as subpastas), na ordem do nome ("C0002" antes de "C0010").
 * @returns {Promise<{ clipes: { rel: string, caminho: string }[], ignorados: { raw: number, demais: number } }>}
 */
export async function listarClipes(raiz, { max = CLIPES_MAX } = {}) {
  const clipes = []
  const ignorados = { raw: 0, demais: 0 }
  const andar = async (dir, rel) => {
    const itens = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const it of itens) {
      if (it.name.startsWith('.') || it.name.startsWith('$')) continue
      const r = rel ? `${rel}/${it.name}` : it.name
      // link simbólico: vale o que ele aponta (um arquivo; pasta por link não entra, para não andar em círculo)
      if (it.isSymbolicLink()) {
        const st = await fs.stat(path.join(dir, it.name)).catch(() => null)
        if (!st?.isFile()) continue
        if (isVideoName(it.name)) clipes.length < max ? clipes.push({ rel: r, caminho: path.join(dir, it.name) }) : ignorados.demais++
        else if (isRawName(it.name)) ignorados.raw++
        continue
      }
      if (it.isDirectory()) {
        if (PULAR.has(it.name.toLowerCase()) || / — Frames( e Takes)?$/.test(it.name)) continue
        await andar(path.join(dir, it.name), r)
      } else if (it.isFile()) {
        if (isVideoName(it.name)) clipes.length < max ? clipes.push({ rel: r, caminho: path.join(dir, it.name) }) : ignorados.demais++
        else if (isRawName(it.name)) ignorados.raw++
      }
    }
  }
  await andar(raiz, '')
  clipes.sort((a, b) => a.rel.localeCompare(b.rel, 'pt-BR', { numeric: true }))
  return { clipes, ignorados }
}

/** Um quadro pequeno em `t` (busca rápida), com a cor, medido. */
function medirEm(ffmpeg, arquivo, t, { w, h, cor, signal }) {
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', arquivo, '-map', '0:v:0', '-frames:v', '1', '-an', '-sn', '-dn', '-vf', `${cor ? `${cor},` : ''}scale=${w}:${h}:flags=area,format=rgb24`, '-f', 'rawvideo', '-']
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const partes = []
    let erro = ''
    const parar = () => p.kill('SIGKILL')
    signal?.addEventListener('abort', parar, { once: true })
    p.stdout.on('data', (d) => partes.push(d))
    p.stderr.on('data', (d) => (erro = (erro + d).slice(-1000)))
    p.on('error', reject)
    p.on('close', () => {
      signal?.removeEventListener('abort', parar)
      if (signal?.aborted) return reject(Object.assign(new Error('parado'), { name: 'AbortError' }))
      const buf = Buffer.concat(partes)
      if (buf.length < w * h * 3) return resolve(null) // depois do fim, ou o quadro não decodificou
      const m = medir(buf.subarray(0, w * h * 3), w, h)
      delete m.y
      resolve({ t, ...m, dif: 0 })
    })
  })
}

/**
 * Mede `PONTOS` quadros do clipe e ordena pela nota (o primeiro é o escolhido). Nenhum serve (tudo escuro, chapado)?
 * Fica o de mais contraste, para o clipe não sumir da diária.
 * @returns {Promise<{ escolhido, candidatos, amostras, tags }>}
 */
export async function melhorQuadro(ffmpeg, arquivo, { info, cor = null, signal } = {}) {
  const dur = info.durationS
  const vw = info.video.width || 1920
  const vh = info.video.height || 1080
  const rot = Math.abs(info.rotation || 0) % 180 === 90
  const [ow, oh] = rot ? [vh, vw] : [vw, vh]
  const w = LARGURA
  const h = Math.max(8, Math.round((w * oh) / ow / 2) * 2)
  const ini = dur > 2 ? Math.max(0.3, dur * MARGEM) : 0
  const fim = dur > 2 ? Math.min(dur - 0.3, dur * (1 - MARGEM)) : Math.max(0, dur - 0.05)
  const ts = Array.from({ length: PONTOS }, (_, i) => ini + ((fim - ini) * (i + 0.5)) / PONTOS)
  const amostras = []
  for (const t of ts) {
    const a = await medirEm(ffmpeg, arquivo, t, { w, h, cor, signal })
    if (a) amostras.push(a)
  }
  if (!amostras.length) return null
  const ref = [...amostras.map((a) => a.nitidez)].sort((x, y) => x - y)[Math.floor(amostras.length * 0.75)] || 1
  const comNota = amostras.map((a) => ({ t: +a.t.toFixed(3), nota: +nota(a, ref, 2).toFixed(3), hash: a.hash, desvio: a.desvio }))
  comNota.sort((x, y) => y.nota - x.nota || y.desvio - x.desvio)
  // a etiqueta de movimento precisa de quadros seguidos: aqui fica só luz e cor
  const tags = etiquetas(amostras, { de: 0, ate: amostras.length - 1 }).slice(0, 2)
  const [escolhido, ...resto] = comNota.map(({ desvio, ...x }) => x)
  return { escolhido, candidatos: resto, amostras: amostras.length, tags }
}
