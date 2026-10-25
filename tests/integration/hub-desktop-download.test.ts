// /baixar/hub/*: o HUB lê o Release "hub-desktop" do GitHub e só redireciona (nada passa pela Vercel).
// GitHub falso: com token (link assinado), sem token (repositório privado = 404), Release ausente e fora do ar.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  disponibilidade,
  limparCache,
  respostaDiag,
  respostaInstalador,
  respostaVersao,
  type Deps,
  type ReleaseAsset,
} from '../../apps/hub-web/lib/hub-desktop-release'

const API = 'https://api.github.com/repos/victorbarrosoc-hub/AbsoluteZRO'
const TOKEN = 'github_pat_teste_falso'
const asset = (id: number, name: string): ReleaseAsset => ({
  name,
  url: `${API}/releases/assets/${id}`,
  browser_download_url: `https://github.com/victorbarrosoc-hub/AbsoluteZRO/releases/download/hub-desktop/${name}`,
})
const ASSETS = [
  asset(1, 'AbsoluteZRO-1.0.0-b7-mac-universal.dmg'),
  asset(2, 'AbsoluteZRO-1.0.0-b8-mac-universal.dmg'),
  asset(3, 'AbsoluteZRO-1.0.0-b8-windows-setup.exe'),
  asset(4, 'AbsoluteZRO-sha256-b8-mac.json'),
  asset(5, 'versao.json'),
]
const VERSAO = {
  build: 8,
  versao: '1.0.0',
  data: '2026-10-25T00:00:00.000Z',
  arquivoMac: 'AbsoluteZRO-1.0.0-b8-mac-universal.dmg',
  sha256Mac: 'a'.repeat(64),
  arquivoWindows: 'AbsoluteZRO-1.0.0-b8-windows-setup.exe',
  sha256Windows: 'B'.repeat(64),
}

type Pedido = { url: string; headers: Record<string, string>; redirect?: string }

/** GitHub falso. `release`: 'ok' | 'ausente' | 'fora'. Repositório privado: sem token, a API responde 404. */
function github({ release = 'ok', assets = ASSETS }: { release?: 'ok' | 'ausente' | 'fora'; assets?: ReleaseAsset[] } = {}) {
  const pedidos: Pedido[] = []
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    pedidos.push({ url, headers, redirect: init?.redirect })
    if (release === 'fora') throw new TypeError('fetch failed')
    const autorizado = headers.authorization === `Bearer ${TOKEN}`
    if (url === `${API}/releases/tags/hub-desktop`) {
      if (!autorizado || release === 'ausente') return new Response('{"message":"Not Found"}', { status: 404 })
      return Response.json({ tag_name: 'hub-desktop', assets })
    }
    const m = /\/releases\/assets\/(\d+)$/.exec(url)
    if (m) {
      if (!autorizado || headers.accept !== 'application/octet-stream' || init?.redirect !== 'manual') return new Response(null, { status: 404 })
      return new Response(null, { status: 302, headers: { location: `https://objects.githubusercontent.com/assinado/${m[1]}?X-Amz-Signature=x` } })
    }
    if (url === 'https://objects.githubusercontent.com/assinado/5?X-Amz-Signature=x') return Response.json(VERSAO)
    if (url.endsWith('/releases/download/hub-desktop/versao.json')) return new Response('Not Found', { status: 404 })
    return new Response('?', { status: 500 })
  }) as typeof fetch
  return { f, pedidos }
}

const deps = (g: ReturnType<typeof github>, token: string | undefined = TOKEN): Deps => ({ fetch: g.f, env: { GITHUB_TOKEN: token, HUB_DESKTOP_PUBLICO: '1' } })
const pedido = (caminho: string) => new URL(caminho, 'https://absolutezro.vercel.app')

beforeEach(() => limparCache())

describe('/baixar/hub com GITHUB_TOKEN', () => {
  it('mac e windows redirecionam para o link assinado do instalador que o versao.json aponta', async () => {
    const g = github()
    const mac = await respostaInstalador('mac', pedido('/baixar/hub/mac'), deps(g))
    expect(mac.status).toBe(302)
    expect(mac.headers.get('location')).toBe('https://objects.githubusercontent.com/assinado/2?X-Amz-Signature=x')
    expect(mac.headers.get('cache-control')).toBe('no-store')
    const win = await respostaInstalador('windows', pedido('/baixar/hub/windows'), deps(g))
    expect(win.headers.get('location')).toBe('https://objects.githubusercontent.com/assinado/3?X-Amz-Signature=x')
    // o arquivo não passa pela Vercel: o pedido do asset é só para pegar o redirecionamento
    const doAsset = g.pedidos.filter((p) => /assets\/\d+$/.test(p.url))
    expect(doAsset.every((p) => p.redirect === 'manual' && p.headers.accept === 'application/octet-stream')).toBe(true)
  })

  it('?build=N entrega aquele build exato; build inexistente dá 404', async () => {
    const g = github()
    const r = await respostaInstalador('mac', pedido('/baixar/hub/mac?build=7'), deps(g))
    expect(r.headers.get('location')).toContain('/assinado/1?')
    expect((await respostaInstalador('mac', pedido('/baixar/hub/mac?build=99'), deps(g))).status).toBe(404)
    // build que não é número é ignorado (vale o atual)
    expect((await respostaInstalador('mac', pedido('/baixar/hub/mac?build=7;x'), deps(g))).headers.get('location')).toContain('/assinado/2?')
  })

  it('versao devolve o versao.json conferido', async () => {
    const r = await respostaVersao(deps(github()))
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j).toMatchObject({ ok: true, build: 8, versao: '1.0.0', sha256Windows: 'b'.repeat(64), mac: '/baixar/hub/mac', windows: '/baixar/hub/windows' })
  })

  it('disponibilidade mostra os dois sistemas e a versão', async () => {
    expect(await disponibilidade(deps(github()))).toEqual({ mac: true, windows: true, versao: '1.0.0', build: 8 })
    limparCache()
    expect(await disponibilidade(deps(github({ assets: ASSETS.filter((a) => !a.name.endsWith('.exe')) })))).toMatchObject({ mac: true, windows: false })
  })

  it('diag não mostra o token', async () => {
    const r = await respostaDiag({ fetch: github().f, env: { GITHUB_TOKEN: ` ${TOKEN}\n` } })
    const texto = await r.text()
    expect(texto).not.toContain(TOKEN)
    expect(JSON.parse(texto)).toMatchObject({
      token: true,
      tipoToken: 'fino',
      espacoNasPontas: true,
      githubRelease: 200,
      mac: 2,
      windows: 1,
      versaoJson: true,
      linkAssinado: true,
    })
  })
})

describe('/baixar/hub antes de liberar (sem HUB_DESKTOP_PUBLICO)', () => {
  it('"Em breve" e o instalador volta para /baixar, mesmo com o Release no ar', async () => {
    const g = github()
    const fechado: Deps = { fetch: g.f, env: { GITHUB_TOKEN: TOKEN } }
    expect(await disponibilidade(fechado)).toEqual({ mac: false, windows: false, versao: null, build: null })
    const r = await respostaInstalador('mac', pedido('/baixar/hub/mac'), fechado)
    expect(r.headers.get('location')).toContain('/baixar?hub=indisponivel')
    expect(g.pedidos.some((p) => /assets\/\d+$/.test(p.url))).toBe(false)
    expect(await (await respostaDiag(fechado)).json()).toMatchObject({ publico: false })
  })
})

describe('/baixar/hub sem token ou sem Release', () => {
  it('sem token (repositório privado): volta para /baixar com aviso e versao dá 503', async () => {
    const g = github()
    const r = await respostaInstalador('mac', pedido('/baixar/hub/mac'), deps(g, ''))
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('https://absolutezro.vercel.app/baixar?hub=indisponivel#absolute-zro')
    expect(g.pedidos.every((p) => !p.headers.authorization)).toBe(true)
    expect((await respostaVersao(deps(g, ''))).status).toBe(503)
    expect(await disponibilidade(deps(g, ''))).toEqual({ mac: false, windows: false, versao: null, build: null })
    const diag = await (await respostaDiag(deps(g, ''))).json()
    expect(diag).toMatchObject({ token: false, githubRelease: 404 })
    expect(diag.motivo).toMatch(/sem GITHUB_TOKEN/)
  })

  it('Release ainda não existe: "Em breve", sem link quebrado', async () => {
    const g = github({ release: 'ausente' })
    expect(await disponibilidade(deps(g))).toEqual({ mac: false, windows: false, versao: null, build: null })
    const r = await respostaInstalador('windows', pedido('/baixar/hub/windows'), deps(g))
    expect(r.headers.get('location')).toContain('/baixar?hub=indisponivel')
    expect((await respostaVersao(deps(g))).status).toBe(503)
  })

  it('Release sem versao.json ainda: entrega o instalador de maior build', async () => {
    const g = github({ assets: ASSETS.filter((a) => a.name !== 'versao.json') })
    expect((await respostaInstalador('mac', pedido('/baixar/hub/mac'), deps(g))).headers.get('location')).toContain('/assinado/2?')
    expect((await respostaVersao(deps(g))).status).toBe(503)
  })

  it('GitHub fora do ar: volta para /baixar e não quebra a página', async () => {
    const g = github({ release: 'fora' })
    expect(await disponibilidade(deps(g))).toMatchObject({ mac: false, windows: false })
    expect((await respostaInstalador('mac', pedido('/baixar/hub/mac'), deps(g))).headers.get('location')).toContain('hub=indisponivel')
    expect((await respostaDiag(deps(g))).status).toBe(200)
  })
})
