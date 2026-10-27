// Servidor estático de desenvolvimento e dos testes: os mesmos cabeçalhos do app de desktop (desktop/cabecalhos.json),
// com isolamento entre origens (o ONNX Runtime usa várias threads) e Range (o <video> e o Mediabunny pedem pedaços).
//   node scripts/servidor.mjs [porta]   → http://localhost:8080/app/

import { createReadStream, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
export const CABECALHOS = JSON.parse(readFileSync(new URL('../desktop/cabecalhos.json', import.meta.url), 'utf8'))
/** Os do site em produção (vercel.json, aeon.absolutezro.com): a mesma CSP com a Z de absolutezro.com. */
export const CABECALHOS_SITE = Object.fromEntries(
  JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
    .headers.find((h) => h.source === '/(.*)')
    .headers.map((h) => [h.key, h.value]),
)
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' }

/** extra(req, res) → true se tratou o pedido (os testes usam para respostas falsas). cabecalhos: os do app (padrão) ou CABECALHOS_SITE. */
export function servir({ raiz = RAIZ, porta = 0, extra, cabecalhos = CABECALHOS } = {}) {
  const s = createServer((req, res) => {
    if (extra && extra(req, res)) return
    const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
    const arq = join(raiz, rel.endsWith('/') ? rel + 'index.html' : rel)
    if (!arq.startsWith(raiz)) return res.writeHead(403).end()
    let st
    try {
      st = statSync(arq)
      if (!st.isFile()) throw new Error()
    } catch {
      return res.writeHead(404).end()
    }
    const base = { ...cabecalhos, 'content-type': TIPOS[extname(arq)] || 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'no-cache' }
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
    if (!m) {
      res.writeHead(200, { ...base, 'content-length': st.size })
      return createReadStream(arq).pipe(res)
    }
    const a = m[1] === '' ? Math.max(0, st.size - Number(m[2])) : Number(m[1])
    const b = m[1] === '' || m[2] === '' ? st.size - 1 : Math.min(Number(m[2]), st.size - 1)
    if (a >= st.size || b < a) return res.writeHead(416, { ...base, 'content-range': `bytes */${st.size}` }).end()
    res.writeHead(206, { ...base, 'content-length': b - a + 1, 'content-range': `bytes ${a}-${b}/${st.size}` })
    createReadStream(arq, { start: a, end: b }).pipe(res)
  })
  return new Promise((r) => s.listen(porta, '127.0.0.1', () => r({ servidor: s, url: `http://localhost:${s.address().port}/` })))
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const { url } = await servir({ porta: Number(process.argv[2]) || 8080 })
  console.log(`${url}app/`)
}
