// Servidor local do app: como a Vercel serve esta pasta. Primeiro o que existe (publico/ e as funções de api/), depois
// os rewrites, sempre com os cabeçalhos do vercel.json (CSP, COOP, cache), lidos do próprio arquivo: mudou lá, muda
// aqui. Para desenvolver e para os testes no Chromium. `npm run dev` → http://localhost:8094 (modo local: sem login
// único). O que não existe é 404 com a página neutra (publico/404.html), como no ar.

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
export const PORTA = 8094
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

/** `source` do vercel.json (`/app/:f*`, `/api/(.*)`) como expressão regular com grupos nomeados. */
export function padrao(source) {
  return new RegExp(`^${source.replace(/:([A-Za-z_]\w*)\*/g, '(?<$1>.*)').replace(/:([A-Za-z_]\w*)/g, '(?<$1>[^/]+)')}$`)
}

/** Aplica os rewrites do vercel.json a um caminho. Devolve o destino (com a consulta) ou null. */
export function reescrever(caminho, rewrites) {
  for (const r of rewrites) {
    const m = padrao(r.source).exec(caminho)
    if (!m) continue
    return r.destination.replace(/:([A-Za-z_]\w*)\*?/g, (_, nome) => encodeURIComponent(m.groups?.[nome] ?? ''))
  }
  return null
}

/** Os cabeçalhos do vercel.json que valem para um caminho (o pedido original, antes do rewrite). */
export function cabecalhosDe(caminho, regras) {
  const saida = {}
  for (const r of regras) if (padrao(r.source).test(caminho)) for (const h of r.headers) saida[h.key] = h.value
  return saida
}

async function funcao(caminho) {
  const nome = caminho.replace(/^\/api\//, '')
  if (!/^[a-z0-9/-]+$/.test(nome) || nome.split('/').some((p) => !p || p.startsWith('_'))) return null
  const arquivo = join(RAIZ, 'api', `${nome}.js`)
  if (!(await stat(arquivo).catch(() => null))?.isFile()) return null
  const f = (await import(pathToFileURL(arquivo).href)).default
  return typeof f === 'function' ? f : null
}

async function estatico(publico, caminho) {
  let rel
  try {
    rel = decodeURIComponent(caminho)
  } catch {
    return null
  }
  if (rel.includes('\0')) return null
  const alvo = normalize(join(publico, rel))
  if (alvo !== publico && !alvo.startsWith(publico + sep)) return null
  return (await stat(alvo).catch(() => null))?.isFile() ? alvo : null
}

/**
 * Sobe o servidor. `publico`: a pasta montada pelo publicar.mjs (os testes usam uma temporária). `config`: o
 * vercel.json já lido (os testes passam um alterado para provar que os cabeçalhos valem).
 */
export async function servir({ porta = PORTA, publico = join(RAIZ, 'publico'), config = null } = {}) {
  config ??= JSON.parse(await readFile(join(RAIZ, 'vercel.json'), 'utf8'))
  const pasta = normalize(publico).replace(/[/\\]+$/, '')
  const servidor = createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x')
      for (const [k, v] of Object.entries(cabecalhosDe(u.pathname, config.headers ?? []))) res.setHeader(k, v)
      const enviar = async (arquivo, status = 200) => {
        res.writeHead(status, { 'Content-Type': TIPOS[extname(arquivo).toLowerCase()] ?? 'application/octet-stream' })
        res.end(req.method === 'HEAD' ? undefined : await readFile(arquivo))
      }
      // 1. o que existe: arquivo de publico/ ou função de api/
      if (!u.pathname.startsWith('/api/')) {
        const arquivo = await estatico(pasta, u.pathname)
        if (arquivo) return await enviar(arquivo)
      }
      let f = u.pathname.startsWith('/api/') ? await funcao(u.pathname) : null
      // 2. os rewrites (a consulta do pedido segue junto, sem passar por cima da do destino)
      if (!f) {
        const novo = reescrever(u.pathname, config.rewrites ?? [])
        if (novo) {
          const n = new URL(novo, 'http://x')
          for (const [k, v] of u.searchParams) if (!n.searchParams.has(k)) n.searchParams.set(k, v)
          f = n.pathname.startsWith('/api/') ? await funcao(n.pathname) : null
          if (f) req.url = n.pathname + n.search
        }
      }
      if (f) return await f(req, res)
      // 3. nada: o 404 neutro
      const neutra = await estatico(pasta, '/404.html')
      if (neutra) return await enviar(neutra, 404)
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Não encontrado')
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(String(e?.message ?? e))
    }
  })
  return new Promise((ok) => servidor.listen(porta, '127.0.0.1', () => ok(servidor)))
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const porta = Number(process.env.PORT) || PORTA
  await servir({ porta })
  console.log(`app em http://localhost:${porta}`)
}
