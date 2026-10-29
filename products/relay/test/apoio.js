// Apoio dos testes no Chromium: arquivos gerados pelo ffmpeg, o servidor local com uma porta para entregar e receber
// arquivos, e medidas (ffprobe, SSIM) do que o navegador gravou.

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { servir } from '../scripts/servir.mjs'

export const temFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
})()

export const pasta = mkdtempSync(join(tmpdir(), 'relay-tela-'))
export const ff = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'pipe' })

export function sondar(arquivo) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', arquivo]).toString())
}

/** SSIM (todos os planos) de `a` contra `b`, com `b` passando antes pelo filtro `filtroB` (ex.: a redução de referência). */
export function medirSsim(a, b, filtroB = 'null') {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', a, '-i', b, '-lavfi', `[1:v]${filtroB},format=yuv420p[r];[0:v]format=yuv420p[s];[s][r]ssim`, '-f', 'null', '-'])
  return Number(/All:([\d.]+)/.exec(r.stderr.toString())?.[1])
}

/** Servidor do Relay + /teste-arquivo/<nome> (lê da pasta de teste) e POST /teste-saida/<nome> (grava nela). */
export async function abrir() {
  const servidor = await servir({
    porta: 0,
    extra: async (req, res) => {
      if (req.url.startsWith('/teste-arquivo/')) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cross-Origin-Resource-Policy': 'same-origin' })
        res.end(readFileSync(join(pasta, decodeURIComponent(req.url.slice(15)))))
        return true
      }
      if (req.url.startsWith('/teste-saida/') && req.method === 'POST') {
        const partes = []
        for await (const c of req) partes.push(c)
        writeFileSync(join(pasta, decodeURIComponent(req.url.slice(13))), Buffer.concat(partes))
        res.writeHead(204)
        res.end()
        return true
      }
      return false
    },
  })
  const base = `http://127.0.0.1:${servidor.address().port}`
  const navegador = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
  const erros = []
  const nova = async (caminho, opcoes = {}) => {
    const { antes, ...resto } = opcoes
    const p = await navegador.newPage(resto)
    if (antes) await p.addInitScript(antes)
    p.on('pageerror', (e) => erros.push(e.message))
    p.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
    await p.goto(base + caminho)
    return p
  }
  return { base, nova, erros, fechar: async () => (await navegador.close(), servidor.close()) }
}

/**
 * Converte no navegador com o motor do Relay (na página dada) e grava a saída na pasta de teste.
 * Devolve { caminho, ...resultado do motor sem o blob }.
 */
export async function converterNoNavegador(pagina, entrada, preset, opcoes = {}, escala = 'auto') {
  const r = await pagina.evaluate(
    async ([entrada, preset, opcoes, escala]) => {
      const m = await import('/app/motor.js')
      m.usarEscala(escala)
      const arquivo = new File([await (await fetch(`/teste-arquivo/${entrada}`)).blob()], entrada)
      const r = await m.converterArquivo(arquivo, preset, opcoes)
      const nome = `${entrada.replace(/\.[^.]+$/, '')}-${preset}.${r.extensao}`
      await fetch(`/teste-saida/${encodeURIComponent(nome)}`, { method: 'POST', body: r.blob })
      return { nome, bytes: r.bytes, avisos: r.avisos, escala: r.escala, codecVideo: r.codecVideo, codecAudio: r.codecAudio, audioWasm: r.audioWasm, plano: r.plano }
    },
    [entrada, preset, opcoes, escala],
  )
  return { ...r, caminho: join(pasta, r.nome) }
}
