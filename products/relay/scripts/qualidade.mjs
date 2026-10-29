// Laboratório de qualidade do Relay (interno: não vai para o site): o mesmo master convertido pelo Relay (navegador e
// computador) e por ajustes x264 de referência do mercado, medido contra o original em SSIM, PSNR e tamanho.
//
//   node scripts/qualidade.mjs <pasta com os masters .mov> [--so=foto,movimento] [--presets=youtube-1080]
//
// Os masters não vão para o Git (centenas de MB). Para gerar os mesmos do relatório (docs/QUALIDADE.md), veja lá.
// Precisa do ffmpeg com libx264 e do Chromium do Playwright.

import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { servir } from './servir.mjs'
import { preset } from '../src/presets.js'
import { planejar } from '../src/plano.js'
import { argsFfmpeg } from '../src/ffmpeg.js'

const sh = promisify(execFile)
const [pasta = '.', ...resto] = process.argv.slice(2)
const so = resto.find((a) => a.startsWith('--so='))?.slice(5).split(',')
const presetsLab = (resto.find((a) => a.startsWith('--presets='))?.slice(10) ?? 'youtube-1080').split(',')
const saidas = join(pasta, 'saidas')
await mkdir(saidas, { recursive: true })

/** O que o ffprobe diz do arquivo, no formato do plano. */
async function origemDe(arquivo) {
  const { stdout } = await sh('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', arquivo])
  const j = JSON.parse(stdout)
  const v = j.streams.find((s) => s.codec_type === 'video')
  const a = j.streams.find((s) => s.codec_type === 'audio')
  const [n, d] = (v?.avg_frame_rate ?? '30/1').split('/').map(Number)
  return {
    largura: v?.width,
    altura: v?.height,
    fps: n / d,
    duracao: Number(j.format.duration),
    temVideo: Boolean(v),
    temAudio: Boolean(a),
    canais: a?.channels,
    taxa: a ? Number(a.sample_rate) : null,
    cor: v ? { primaries: v.color_primaries ?? 'bt709', transfer: v.color_transfer ?? 'bt709', matrix: v.color_space ?? 'bt709', fullRange: v.color_range === 'pc' } : null,
  }
}

/** SSIM (Y) e PSNR (média) da saída contra o master, no tamanho da saída (o master reduzido em Lanczos). */
async function medir(saida, master) {
  const { stdout } = await sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', saida])
  const [w, h] = stdout.trim().split(',').map(Number)
  const filtro = `[1:v]scale=${w}:${h}:flags=lanczos+accurate_rnd:in_color_matrix=bt709:out_color_matrix=bt709,format=yuv420p[ref];[0:v]format=yuv420p[s];[s]split[s1][s2];[ref]split[r1][r2];[s1][r1]ssim;[s2][r2]psnr`
  const r = await sh('ffmpeg', ['-hide_banner', '-nostats', '-i', saida, '-i', master, '-lavfi', filtro, '-f', 'null', '-'], { maxBuffer: 1 << 26 }).catch((e) => e)
  const log = String(r.stderr)
  const ssim = Number(/SSIM Y:([\d.]+)/.exec(log)?.[1])
  const ssimTodos = Number(/All:([\d.]+)/.exec(log)?.[1])
  const psnr = Number(/PSNR y:([\d.inf]+)/.exec(log)?.[1])
  const bytes = (await stat(saida)).size
  return { ssimY: ssim, ssim: ssimTodos, psnrY: psnr, bytes, w, h }
}

const tempo = async (fn) => {
  const t = performance.now()
  await fn()
  return (performance.now() - t) / 1000
}

// Ajustes x264 de referência do mercado, com escala swscale Lanczos de arredondamento preciso e AAC 160k.
const REFERENCIA = [
  { id: 'ref-rapida', nome: 'Referência x264 rápida (fast, RF 22)', args: ['-preset', 'fast', '-crf', '22'] },
  { id: 'ref-alta', nome: 'Referência x264 alta (slow, RF 20)', args: ['-preset', 'slow', '-crf', '20'] },
  { id: 'ref-maxima', nome: 'Referência x264 máxima (veryslow, RF 18)', args: ['-preset', 'veryslow', '-crf', '18'] },
]

async function referencia(master, o, h) {
  const out = join(saidas, `${o}-${h.id}.mp4`)
  const seg = await tempo(() =>
    sh('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', master, '-vf', 'scale=-2:1080:flags=lanczos+accurate_rnd:in_color_matrix=bt709:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', ...h.args, '-profile:v', 'high', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out]),
  )
  return { nome: h.nome, arquivo: out, segundos: seg }
}

/** A referência no MESMO tamanho do arquivo do Relay (bitrate médio, 2 passadas, x264 fast): qualidade por byte. */
async function referenciaMesmoTamanho(master, o, rotulo, arquivoRelay) {
  const { stdout } = await sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=bit_rate,width,height', '-of', 'csv=p=0', arquivoRelay])
  const [w, h, bps] = stdout.trim().split(',').map(Number)
  const out = join(saidas, `${o}-ref-igual-${rotulo}.mp4`)
  const log = join(saidas, `ref-${o}-${rotulo}`)
  const comum = ['-hide_banner', '-v', 'error', '-y', '-i', master, '-vf', `scale=${w}:${h}:flags=lanczos+accurate_rnd:in_color_matrix=bt709:out_color_matrix=bt709,format=yuv420p`, '-c:v', 'libx264', '-preset', 'fast', '-b:v', String(bps), '-passlogfile', log, '-profile:v', 'high']
  const seg = await tempo(async () => {
    await sh('ffmpeg', [...comum, '-pass', '1', '-an', '-f', 'null', '/dev/null'])
    await sh('ffmpeg', [...comum, '-pass', '2', '-an', out])
  })
  return { nome: `Referência x264 no mesmo tamanho (${rotulo})`, arquivo: out, segundos: seg }
}

async function relayComputador(master, o, p) {
  const origem = await origemDe(master)
  const plano = planejar(origem, preset(p), { motor: 'computador' })
  const out = join(saidas, `${o}-${p}-computador.mp4`)
  const passes = argsFfmpeg(plano, { input: master, output: out, origem, encoder: 'libx264', log: join(saidas, `${o}-${p}`) })
  const seg = await tempo(async () => {
    for (const a of passes) await sh('ffmpeg', a, { maxBuffer: 1 << 26 })
  })
  return { nome: `Relay ${preset(p).nome} · computador`, arquivo: out, segundos: seg }
}

const masters = (await readdir(pasta)).filter((f) => /\.mov$/i.test(f) && (!so || so.includes(f.replace(/\.mov$/i, ''))))
const servidor = await servir({
  porta: 8097,
  extra: async (req, res) => {
    if (req.url === '/lab') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' })
      res.end(await readFile(new URL('./lab-pagina.html', import.meta.url)))
      return true
    }
    if (req.url === '/scripts-lab/lab.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' })
      res.end(await readFile(new URL('./lab.js', import.meta.url)))
      return true
    }
    if (req.url.startsWith('/lab-arquivo/')) {
      const nome = decodeURIComponent(req.url.slice(13))
      res.writeHead(200, { 'Content-Type': 'video/quicktime', 'Cross-Origin-Resource-Policy': 'same-origin' })
      res.end(await readFile(join(pasta, nome)))
      return true
    }
    if (req.url.startsWith('/lab-saida/') && req.method === 'POST') {
      const partes = []
      for await (const c of req) partes.push(c)
      await writeFile(join(saidas, decodeURIComponent(req.url.slice(11))), Buffer.concat(partes))
      res.writeHead(204)
      res.end()
      return true
    }
    return false
  },
})
const navegador = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
const pagina = await navegador.newPage()
pagina.on('console', (m) => m.type() === 'warning' && console.log('  [navegador]', m.text()))
await pagina.goto('http://127.0.0.1:8097/lab')
await pagina.waitForFunction(() => window.labPronto, null, { timeout: 30_000 })

const linhas = []
for (const m of masters) {
  const master = join(pasta, m)
  const o = m.replace(/\.mov$/i, '')
  const testes = []
  for (const h of REFERENCIA) testes.push(await referencia(master, o, h))
  for (const p of presetsLab) {
    const comp = await relayComputador(master, o, p)
    testes.push(comp, await referenciaMesmoTamanho(master, o, `${p}-computador`, comp.arquivo))
    for (const escala of ['canvas', 'gpu']) {
      const r = await pagina.evaluate(([nome, p, escala]) => window.labConverter(nome, p, { escala, sufixo: `-${escala}` }), [m, p, escala])
      const arquivo = join(saidas, r.nome)
      testes.push({ nome: `Relay ${preset(p).nome} · navegador (${r.codec}, ${r.escala})`, arquivo, segundos: r.segundos })
      if (escala === 'gpu') testes.push(await referenciaMesmoTamanho(master, o, `${p}-navegador`, arquivo))
    }
  }
  for (const t of testes) {
    const med = await medir(t.arquivo, master)
    linhas.push({ master: o, ...t, ...med })
    console.log(`${o.padEnd(10)} ${t.nome.padEnd(58)} SSIM ${med.ssimY.toFixed(4)}  PSNR ${String(med.psnrY).padEnd(6)}  ${(med.bytes / 1e6).toFixed(1).padStart(6)} MB  ${t.segundos.toFixed(1)} s`)
  }
}
await navegador.close()
servidor.close()
await writeFile(join(saidas, 'resultado.json'), JSON.stringify(linhas, null, 2))
