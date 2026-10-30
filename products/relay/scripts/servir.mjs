// Servidor local do Relay: a pasta como a Vercel serve (URLs limpas e os mesmos cabeçalhos do vercel.json, CSP e
// isolamento de origem inclusos), para desenvolver e para os testes no Chromium. `npm run dev` → http://localhost:8090.

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

const config = JSON.parse(await readFile(join(RAIZ, 'vercel.json'), 'utf8'))
const cabecalhos = Object.fromEntries(config.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]))

/** Caminho do arquivo para a URL (URL limpa: /converter → converter.html, / → index.html), ou null se sair da pasta. */
export async function resolver(url, raiz = RAIZ) {
  let p = decodeURIComponent(new URL(url, 'http://x').pathname)
  if (p.endsWith('/')) p += 'index.html'
  const alvo = normalize(join(raiz, p))
  if (!alvo.startsWith(raiz) || /(^|\/)(node_modules|\.git|test|scripts)(\/|$)/.test(p)) return null
  for (const c of [alvo, `${alvo}.html`]) {
    const s = await stat(c).catch(() => null)
    if (s?.isFile()) return c
  }
  return null
}

/** O que o desenvolvimento liga (como as prévias da Vercel): app/recursos.js com tudo ligado. */
export const RECURSOS_DEV = { revela: true }

export function servir({ porta = 8090, raiz = RAIZ, extra = null, recursos = RECURSOS_DEV } = {}) {
  const servidor = createServer(async (req, res) => {
    try {
      if (extra && (await extra(req, res))) return
      if (new URL(req.url, 'http://x').pathname === '/app/recursos.js' && recursos) {
        res.writeHead(200, { ...cabecalhos, 'Content-Type': TIPOS['.js'], 'Cache-Control': 'no-cache' })
        return res.end(`export const RECURSOS = ${JSON.stringify(recursos)}\n`)
      }
      // a conta (só para o Set) mora nas funções da Vercel (api/); aqui o login não está ligado, como num site sem
      // ZRO_CLIENT_ID: o /eu diz isso e o topo não monta o Set (app/set.js)
      if (new URL(req.url, 'http://x').pathname === '/api/zro/eu') {
        res.writeHead(200, { ...cabecalhos, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        return res.end('{"ok":false,"configurado":false}')
      }
      const arquivo = await resolver(req.url, raiz)
      if (!arquivo) {
        res.writeHead(404, { ...cabecalhos, 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end('Não encontrado')
      }
      const corpo = await readFile(arquivo)
      res.writeHead(200, { ...cabecalhos, 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' })
      res.end(corpo)
    } catch (e) {
      res.writeHead(500)
      res.end(String(e?.message ?? e))
    }
  })
  return new Promise((ok) => servidor.listen(porta, '127.0.0.1', () => ok(servidor)))
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const porta = Number(process.env.PORT) || 8090
  await servir({ porta })
  console.log(`Relay em http://localhost:${porta}`)
}
