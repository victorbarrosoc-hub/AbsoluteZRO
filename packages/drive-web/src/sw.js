// Service worker do Drive (packages/drive-web), o mesmo desenho do /app/stream/ do SOBEDESCE (web/public/app/sw.js).
// Só uma tarefa: <stream>/<id>?s=<tamanho>&t=<tipo>&n=<nome>&c=<conta>&k=<chave> busca o arquivo no Google com o token
// da conta e devolve em streaming, repassando o Range (o Safari só toca vídeo com 206). Nada é guardado: o token vem
// da página (postMessage com MessageChannel, src/stream-pagina.js) e fica só na memória deste SW, que some quando ele
// dorme. Tudo o mais passa direto (sem cache, sem respondWith).
//
// Segurança (o arquivo é de quem subiu): só atende pedido de mídia (<video>, <audio>, <img>, <track>) ou fetch da
// página, nunca a abertura do endereço numa aba; o tipo só passa se for vídeo, áudio ou imagem (sem SVG), o resto vira
// application/octet-stream + attachment; toda resposta leva CSP sandbox, CORP same-origin e nosniff; e o endereço
// precisa da chave `k` da aba que o gerou (a página só entrega o token para a chave dela).
//
// Script clássico (sem import): o Maestro serve uma cópia idêntica em products/maestro/public/drive-sw.js, registrada
// com escopo /app/ (o stream fica em /app/stream/). products/maestro/tests/drive-web.test.mts confere a cópia.
const GOOGLE_API = 'https://www.googleapis.com/drive/v3'
const LOOPBACK = new Set(['127.0.0.1', 'localhost'])
const SCOPE = new URL(self.registration ? self.registration.scope : './', self.location).pathname
const STREAM = SCOPE + 'stream/'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(STREAM)) return
  event.respondWith(stream(event, url))
})

const toks = new Map() // chave da aba + conta → { value, api, expiresAt } — só em memória
const MAX_TOKS = 16
const KEY_RE = /^[0-9a-f]{32}$/
const CONTA_RE = /^[A-Za-z0-9_-]{0,64}$/
const MEDIA_DEST = new Set(['video', 'audio', 'image', 'track', ''])
const GUARD = {
  'Content-Security-Policy': "sandbox; default-src 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
}

/** A página só pode apontar para o Google (ou, servido em 127.0.0.1, para um Drive falso em loopback). */
function allowedApi(api) {
  if (api === GOOGLE_API) return true
  try {
    const u = new URL(api)
    return LOOPBACK.has(self.location.hostname) && u.protocol === 'http:' && LOOPBACK.has(u.hostname)
  } catch {
    return false
  }
}

async function pages(event) {
  const out = []
  if (event.clientId) {
    const c = await self.clients.get(event.clientId)
    if (c) return [c]
  }
  const all = await self.clients.matchAll({ type: 'window' })
  all.sort((a, b) => Number(b.focused) - Number(a.focused) || Number(b.visibilityState === 'visible') - Number(a.visibilityState === 'visible'))
  for (const c of all) if (!out.some((o) => o.id === c.id) && new URL(c.url).pathname.startsWith(SCOPE)) out.push(c)
  return out
}

function ask(client, k, conta, stale) {
  return new Promise((resolve) => {
    const ch = new MessageChannel()
    const t = setTimeout(() => resolve(null), 20_000)
    ch.port1.onmessage = (e) => {
      clearTimeout(t)
      resolve(e.data)
    }
    client.postMessage({ type: 'zro-drive-token', k, conta, stale: stale || null }, [ch.port2])
  })
}

async function token(event, k, conta, stale) {
  const id = `${k}:${conta}`
  const cached = toks.get(id)
  if (!stale && cached && cached.expiresAt - Date.now() > 60_000) return cached
  toks.delete(id)
  for (const c of await pages(event)) {
    const r = await ask(c, k, conta, stale)
    if (!r) continue
    if (r.ok) {
      if (r.k !== k || !r.token || !allowedApi(r.api)) continue
      const t = { value: String(r.token), api: r.api, expiresAt: Number(r.expiresAt) || Date.now() + 10 * 60_000 }
      toks.set(id, t)
      if (toks.size > MAX_TOKS) toks.delete(toks.keys().next().value)
      return t
    }
    if (r.reason === 'chave') continue
    return { error: r.reason || 'erro' }
  }
  return { error: 'sem-pagina' }
}

/** "bytes=a-b" | "bytes=a-" | "bytes=-n" → { start, end } dentro de size, ou null. */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim())
  if (!m || (m[1] === '' && m[2] === '') || size == null) return null
  let start
  let end
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  return start <= end ? { start, end } : null
}

function disposition(kind, name) {
  const ascii =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7e]|["\\%;]/g, '_') || 'arquivo'
  const utf = encodeURIComponent(name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${utf}`
}

function mediaType(type) {
  const base = String(type || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (!/^(video|audio|image)\/[a-z0-9][a-z0-9.+-]*$/.test(base)) return null
  if (base.includes('svg') || base.includes('xml')) return null
  return base
}

function fail(status, message) {
  return new Response(message, { status, headers: { ...GUARD, 'Content-Type': 'text/plain; charset=utf-8' } })
}

async function stream(event, url) {
  let id
  try {
    id = decodeURIComponent(url.pathname.slice(STREAM.length))
  } catch {
    id = ''
  }
  const req = event.request
  const p = url.searchParams
  if (req.mode === 'navigate' || !MEDIA_DEST.has(req.destination)) return fail(403, 'Abra o arquivo pelo app.')
  const k = p.get('k') || ''
  const conta = p.get('c') || ''
  if (!KEY_RE.test(k) || !CONTA_RE.test(conta)) return fail(403, 'Abra o arquivo pelo app.')
  if (!id || /[/?#]/.test(id)) return fail(404, 'Arquivo não encontrado.')
  const size = p.has('s') && /^\d+$/.test(p.get('s')) ? Number(p.get('s')) : null
  const type = p.get('t') || 'application/octet-stream'
  const name = p.get('n') || 'arquivo'
  const range = req.headers.get('Range')

  let stale = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = await token(event, k, conta, stale)
    if (t.error) return fail(t.error === 'reconectar' ? 409 : 401, t.error === 'reconectar' ? 'Reconecte o Google Drive.' : 'Abra o app para continuar.')
    const headers = { Authorization: `Bearer ${t.value}` }
    if (range) headers.Range = range
    let up
    try {
      up = await fetch(`${t.api}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
        headers,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: req.signal,
      })
    } catch {
      return fail(504, 'Sem conexão com o Google.')
    }
    if (up.status === 401 && attempt === 0) {
      stale = t.value
      continue
    }
    if (!up.ok) {
      const h = { ...GUARD }
      const cr = up.headers.get('Content-Range')
      if (up.status === 416) h['Content-Range'] = cr || (size != null ? `bytes */${size}` : 'bytes */*')
      return new Response(null, { status: up.status, headers: h })
    }
    const h = new Headers(GUARD)
    const media = mediaType(up.headers.get('Content-Type') || type)
    h.set('Content-Type', media || 'application/octet-stream')
    h.set('Accept-Ranges', 'bytes')
    const len = up.headers.get('Content-Length')
    if (len) h.set('Content-Length', len)
    if (up.status === 206) {
      let cr = up.headers.get('Content-Range')
      if (!cr) {
        const r = parseRange(range, size)
        if (r) {
          const end = len ? Math.min(r.end, r.start + Number(len) - 1) : r.end
          cr = `bytes ${r.start}-${end}/${size}`
          if (!len) h.set('Content-Length', String(end - r.start + 1))
        }
      }
      if (cr) h.set('Content-Range', cr)
    } else if (!len && size != null) {
      h.set('Content-Length', String(size))
    }
    h.set('Content-Disposition', disposition(media ? 'inline' : 'attachment', name))
    return new Response(up.body, { status: up.status, statusText: up.status === 206 ? 'Partial Content' : 'OK', headers: h })
  }
  return fail(401, 'O Google recusou o acesso.')
}
