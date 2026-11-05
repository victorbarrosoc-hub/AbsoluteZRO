// Servidor local do rádio: como a Vercel serve esta pasta (rewrites, cabeçalhos do vercel.json e as funções de api/),
// para desenvolver e para os testes no Chromium. `npm run dev` → http://localhost:8091 (modo local: sem login único,
// cada navegador escolhe um nome). Precisa de RADIO_DATABASE_URL apontando para um Postgres com as migrações.

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const PUBLICO = join(RAIZ, 'publico')
const TIPOS = { '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' }
const config = JSON.parse(await readFile(join(RAIZ, 'vercel.json'), 'utf8'))
const cabecalhos = Object.fromEntries(config.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]))

/** /, /entrar e /app/<f> como no vercel.json. */
export function reescrever(caminho) {
  if (caminho === '/') return '/api/pagina'
  if (caminho === '/entrar') return '/api/zro/entrar'
  const m = /^\/app\/(.+)$/.exec(caminho)
  if (m) return `/api/recurso?f=${encodeURIComponent(m[1])}`
  return null
}

async function funcao(caminho) {
  const nome = caminho.replace(/^\/api\//, '')
  if (!/^[a-z0-9/-]+$/.test(nome) || nome.split('/').some((p) => p.startsWith('_'))) return null
  const arquivo = join(RAIZ, 'api', `${nome}.js`)
  if (!(await stat(arquivo).catch(() => null))?.isFile()) return null
  return (await import(pathToFileURL(arquivo).href)).default
}

export function servir({ porta = 8091 } = {}) {
  const servidor = createServer(async (req, res) => {
    try {
      for (const [k, v] of Object.entries(cabecalhos)) res.setHeader(k, v)
      const u = new URL(req.url, 'http://x')
      const novo = reescrever(u.pathname)
      if (novo) {
        const n = new URL(novo, 'http://x')
        for (const [k, v] of u.searchParams) if (!n.searchParams.has(k)) n.searchParams.set(k, v)
        req.url = n.pathname + n.search
      }
      const caminho = new URL(req.url, 'http://x').pathname
      if (caminho.startsWith('/api/')) {
        const f = await funcao(caminho)
        if (f) return await f(req, res)
      } else {
        const alvo = normalize(join(PUBLICO, decodeURIComponent(caminho)))
        if (alvo.startsWith(PUBLICO) && (await stat(alvo).catch(() => null))?.isFile()) {
          res.writeHead(200, { 'Content-Type': TIPOS[extname(alvo)] ?? 'application/octet-stream' })
          return res.end(await readFile(alvo))
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Não encontrado')
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(String(e?.message ?? e))
    }
  })
  return new Promise((ok) => servidor.listen(porta, '127.0.0.1', () => ok(servidor)))
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const porta = Number(process.env.PORT) || 8091
  await servir({ porta })
  console.log(`rádio em http://localhost:${porta}`)
}
