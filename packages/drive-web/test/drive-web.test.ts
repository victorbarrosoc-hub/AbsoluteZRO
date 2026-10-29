// packages/drive-web: o núcleo (tipos, filtros, consulta do Drive), o service worker do stream (rodado numa vm, com
// abas e um Google falsos: Range → 206, chave da aba, só mídia, CSP sandbox) e o endereço que a página monta.
import fs from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import * as nucleo from '../src/nucleo.js'
import { criarStream } from '../src/stream-pagina.js'

const SW = fs.readFileSync(new URL('../src/sw.js', import.meta.url), 'utf8')
const ORIGEM = 'https://maestro.teste'
const GOOGLE = 'https://www.googleapis.com/drive/v3'
const CHAVE = 'a'.repeat(32)
const VIDEO = Buffer.alloc(1000, 7)

type Aba = {
  id: string
  url: string
  focused: boolean
  visibilityState: string
  pedidos: Record<string, unknown>[]
  postMessage: (m: Record<string, unknown>, p: MessagePort[]) => void
}
function aba(chave = CHAVE): Aba {
  const a: Aba = {
    id: 'aba1',
    url: `${ORIGEM}/app/aprovacoes/x`,
    focused: true,
    visibilityState: 'visible',
    pedidos: [],
    postMessage(m, portas) {
      a.pedidos.push(m)
      const porta = portas[0]!
      setTimeout(() => porta.close(), 50)
      if (m.k !== chave) return porta.postMessage({ ok: false, reason: 'chave' })
      porta.postMessage({ ok: true, k: chave, token: `tok-${String(m.conta)}`, api: GOOGLE, expiresAt: Date.now() + 3600_000 })
    },
  }
  return a
}

function carregar(abas: Aba[]) {
  const ouvintes: Record<string, (e: unknown) => void> = {}
  const google: { url: URL; headers: Record<string, string> }[] = []
  const self = {
    location: new URL(`${ORIGEM}/drive-sw.js`),
    registration: { scope: `${ORIGEM}/app/` },
    addEventListener: (t: string, fn: (e: unknown) => void) => (ouvintes[t] = fn),
    skipWaiting: async () => {},
    clients: { get: async (id: string) => abas.find((a) => a.id === id) ?? null, matchAll: async () => abas, claim: async () => {} },
  }
  const fetchFalso = async (url: string, init: { headers?: Record<string, string> } = {}) => {
    const u = new URL(String(url))
    google.push({ url: u, headers: init.headers ?? {} })
    const tipo = u.pathname.endsWith('/pagina') ? 'text/html' : 'video/mp4'
    const r = /^bytes=(\d+)-(\d*)$/.exec(init.headers?.Range ?? '')
    if (r) {
      const ini = Number(r[1])
      const fim = r[2] === '' ? VIDEO.length - 1 : Math.min(Number(r[2]), VIDEO.length - 1)
      return new Response(VIDEO.subarray(ini, fim + 1), {
        status: 206,
        headers: { 'Content-Type': tipo, 'Content-Length': String(fim - ini + 1), 'Content-Range': `bytes ${ini}-${fim}/${VIDEO.length}` },
      })
    }
    return new Response(VIDEO, { status: 200, headers: { 'Content-Type': tipo, 'Content-Length': String(VIDEO.length) } })
  }
  vm.runInNewContext(SW, { self, URL, Response, Headers, MessageChannel, setTimeout, clearTimeout, fetch: fetchFalso, Map, Set, Number, String, Promise })
  const get = async (url: string, o: { mode?: string; destination?: string; range?: string } = {}) => {
    const caixa: { resposta: Promise<Response> | null } = { resposta: null }
    ouvintes.fetch!({
      request: {
        method: 'GET',
        url,
        mode: o.mode ?? 'no-cors',
        destination: o.destination ?? 'video',
        headers: new Headers(o.range ? { Range: o.range } : {}),
        signal: undefined,
      },
      clientId: 'aba1',
      respondWith: (p: Promise<Response>) => (caixa.resposta = p),
    })
    return caixa.resposta ? await caixa.resposta : null
  }
  return { get, google }
}

describe('núcleo do Drive', () => {
  it('tipos, filtros e a consulta da página', async () => {
    expect(nucleo.kindOf({ id: '1', name: 'a.mov', mimeType: 'video/quicktime' })).toBe('video')
    expect(nucleo.kindOf({ id: '2', name: 'p', mimeType: nucleo.FOLDER_MIME })).toBe('folder')
    expect(nucleo.categoryOf({ id: '3', name: 'x.braw', mimeType: 'application/octet-stream' })).toBe('video')
    expect(nucleo.sizedThumb('https://lh3.googleusercontent.com/x=s220', 480)).toBe('https://lh3.googleusercontent.com/x=s480')
    expect(nucleo.q("Rock'n \\ roll")).toBe("Rock\\'n \\\\ roll")
    const pedidos: Record<string, unknown>[] = []
    const l = nucleo.criarListador(async (_c: string, o: { query?: Record<string, unknown> }) => (pedidos.push(o.query ?? {}), { files: [] }))
    await l.listPage({ scope: 'mine', folder: { id: 'pasta1', name: 'P' } }, { sort: 'date' })
    expect(pedidos[0]).toMatchObject({ q: "trashed = false and 'pasta1' in parents", orderBy: 'folder,modifiedTime desc', supportsAllDrives: true })
  })
})

describe('service worker do stream', () => {
  it('Range vira 206 com o token da conta pedida e as proteções', async () => {
    const a = aba()
    const sw = carregar([a])
    const r = (await sw.get(`${ORIGEM}/app/stream/vid?s=1000&t=video/mp4&n=corte.mp4&c=g1&k=${CHAVE}`, { range: 'bytes=100-199' }))!
    expect(r.status).toBe(206)
    expect(r.headers.get('Content-Range')).toBe('bytes 100-199/1000')
    expect(r.headers.get('Content-Security-Policy')).toContain('sandbox')
    expect(r.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
    expect((await r.arrayBuffer()).byteLength).toBe(100)
    expect(sw.google[0]!.headers.Authorization).toBe('Bearer tok-g1')
    expect(sw.google[0]!.url.origin + '/drive/v3').toBe(GOOGLE)
    expect(a.pedidos[0]).toMatchObject({ type: 'zro-drive-token', k: CHAVE, conta: 'g1' })
  })

  it('outra chave, navegação numa aba ou tipo que não é mídia: nada de token nem página', async () => {
    const a = aba()
    const sw = carregar([a])
    expect((await sw.get(`${ORIGEM}/app/stream/vid?k=${'b'.repeat(32)}`))!.status).toBe(401)
    expect((await sw.get(`${ORIGEM}/app/stream/vid?k=${CHAVE}`, { mode: 'navigate', destination: 'document' }))!.status).toBe(403)
    expect((await sw.get(`${ORIGEM}/app/stream/vid?k=curta`))!.status).toBe(403)
    const html = (await sw.get(`${ORIGEM}/app/stream/pagina?k=${CHAVE}&t=text/html`))!
    expect(html.headers.get('Content-Type')).toBe('application/octet-stream')
    expect(html.headers.get('Content-Disposition')).toMatch(/^attachment/)
    expect(await sw.get(`${ORIGEM}/app/quadro`)).toBeNull()
    expect(await sw.get(`https://outro.site/app/stream/vid?k=${CHAVE}`)).toBeNull()
  })

  it('a página monta o endereço com a chave dela e a conta', () => {
    const s = criarStream({ escopo: '/app/', obterToken: async () => ({ token: 't', expiraEm: 0, api: GOOGLE }) })
    const u = new URL(s.url({ id: 'abc', name: 'Corte 1.mp4', mimeType: 'video/mp4', size: '10' }, 'g1'), ORIGEM)
    expect(u.pathname).toBe('/app/stream/abc')
    expect(Object.fromEntries(u.searchParams)).toEqual({ s: '10', t: 'video/mp4', n: 'Corte 1.mp4', c: 'g1', k: s.chave })
    expect(s.chave).toMatch(/^[0-9a-f]{32}$/)
  })
})
