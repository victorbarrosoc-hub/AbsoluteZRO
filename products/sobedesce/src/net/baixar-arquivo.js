// Baixar um arquivo para o disco calculando o SHA-256 no caminho (modelos das Cenas, yt-dlp das Referências).
// Era parte do antigo src/updater.js; desde 01/11/2026 o app não se atualiza mais sozinho (quem atualiza é a central
// Absolute ZRO) e só este pedaço ficou.
import crypto from 'node:crypto'
import fs from 'node:fs'
import { fetch as undiciFetch } from 'undici'
import { dispatcherFor } from './http.js'

const MAX_BYTES = 2 * 1024 ** 3
const STALL_MS = 60_000

/**
 * Baixa `url` para `file`, calculando o SHA-256 no caminho. Segue redirecionamentos.
 * @returns {Promise<string>} o SHA-256 em hexadecimal
 */
export async function downloadTo(url, file, { fetch = (u, o) => undiciFetch(u, { ...o, dispatcher: dispatcherFor(u) }), onProgress = () => {}, stallMs = STALL_MS, maxBytes = MAX_BYTES } = {}) {
  const ac = new AbortController()
  let stall = setTimeout(() => ac.abort(new Error('o download parou de andar')), stallMs)
  const poke = () => {
    clearTimeout(stall)
    stall = setTimeout(() => ac.abort(new Error('o download parou de andar')), stallMs)
  }
  const out = fs.createWriteStream(file, { mode: 0o600 })
  const closed = new Promise((resolve, reject) => {
    out.on('close', resolve)
    out.on('error', reject)
  })
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ac.signal, headers: { accept: 'application/octet-stream' } })
    if (!res.ok || !res.body) throw new Error(`o site respondeu ${res.status}`)
    const total = Number(res.headers.get('content-length')) || 0
    if (total > maxBytes) throw new Error('o arquivo é grande demais')
    const hash = crypto.createHash('sha256')
    let got = 0
    onProgress(0, total)
    for await (const chunk of res.body) {
      poke()
      got += chunk.length
      if (got > maxBytes) throw new Error('o arquivo é grande demais')
      hash.update(chunk)
      if (!out.write(chunk)) await new Promise((r, j) => { out.once('drain', r); out.once('error', j) })
      onProgress(got, total)
    }
    if (total && got !== total) throw new Error('o download veio incompleto')
    out.end()
    await closed
    return hash.digest('hex')
  } catch (err) {
    out.destroy()
    await closed.catch(() => {})
    throw ac.signal.aborted && ac.signal.reason instanceof Error ? ac.signal.reason : err
  } finally {
    clearTimeout(stall)
  }
}
