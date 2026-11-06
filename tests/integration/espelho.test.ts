// Espelho dos instaladores em São Paulo (ADR 0043): o HUB só redireciona para o bucket público `apps` do Supabase
// quando o versao.json traz a pasta com a forma exata e o arquivo responde ao HEAD com o tamanho certo; senão, o GitHub.
// A central 1.4.3 (só aceita o GitHub) continua recebendo o GitHub no nome exato do arquivo.
import { beforeEach, describe, expect, it } from 'vitest'
import { APPS_DESKTOP, enderecoDoArquivo, limparCacheApps, type Asset } from '../../apps/hub-web/lib/desktop-apps'
import { ehDoEspelho, estaNoEspelho, limparCacheEspelho, origemPedida, pastaDoEspelho, urlNoEspelho } from '../../apps/hub-web/lib/espelho'
import { limparCache, respostaInstalador, respostaVersao, type ReleaseAsset } from '../../apps/hub-web/lib/hub-desktop-release'

const REF = 'abcdefghijklmnopqrst'
const pasta = (tag: string) => `https://${REF}.supabase.co/storage/v1/object/public/apps/${tag}`

beforeEach(() => {
  limparCacheEspelho()
  limparCacheApps()
  limparCache()
})

describe('forma do espelho (a lista do que o HUB aceita)', () => {
  it('só a pasta do bucket apps num projeto Supabase, em https', () => {
    expect(pastaDoEspelho(pasta('hub-desktop'))).toBe(pasta('hub-desktop'))
    expect(pastaDoEspelho(`${pasta('hub-desktop')}/`)).toBe(pasta('hub-desktop'))
    for (const ruim of [
      `http://${REF}.supabase.co/storage/v1/object/public/apps/hub-desktop`,
      `https://${REF}.supabase.co.evil.com/storage/v1/object/public/apps/hub-desktop`,
      `https://evil.com/storage/v1/object/public/apps/hub-desktop`,
      `https://curto.supabase.co/storage/v1/object/public/apps/hub-desktop`,
      `https://${REF}.supabase.co/storage/v1/object/public/outro/hub-desktop`,
      `https://${REF}.supabase.co/storage/v1/object/sign/apps/hub-desktop`,
      `https://${REF}.supabase.co:444/storage/v1/object/public/apps/hub-desktop`,
      `https://${REF}.supabase.co/storage/v1/object/public/apps/../x`,
      `https://${REF}.supabase.co/storage/v1/object/public/apps/a/b`,
      42,
      null,
    ])
      expect(pastaDoEspelho(ruim), String(ruim)).toBeNull()
    expect(urlNoEspelho(pasta('t'), 'A-1.0.0-b2-mac-universal.dmg')).toBe(`${pasta('t')}/A-1.0.0-b2-mac-universal.dmg`)
    expect(urlNoEspelho(pasta('t'), '../segredo')).toBeNull()
    expect(urlNoEspelho('https://evil.com/x', 'a.dmg')).toBeNull()
    expect(ehDoEspelho(`${pasta('t')}/a.dmg`)).toBe(true)
    expect(ehDoEspelho(`https://u:p@${REF}.supabase.co/storage/v1/object/public/apps/t/a.dmg`)).toBe(false)
    expect(origemPedida('espelho')).toBe('espelho')
    expect(origemPedida('github')).toBe('github')
    expect(origemPedida('outro')).toBeNull()
  })

  it('HEAD: 200 com o tamanho certo vale; outro tamanho, 404 ou rede fora não; a resposta fica guardada', async () => {
    const url = `${pasta('t')}/a.dmg`
    let pedidos = 0
    const head = (status: number, tamanho: number | null, falhar = false) =>
      (async (_u: string | URL | Request, init?: RequestInit) => {
        pedidos++
        expect(init?.method).toBe('HEAD')
        if (falhar) throw new TypeError('fetch failed')
        return new Response(null, { status, headers: tamanho == null ? {} : { 'content-length': String(tamanho) } })
      }) as typeof fetch
    expect(await estaNoEspelho(url, 1000, { fetch: head(200, 1000) })).toBe(true)
    expect(await estaNoEspelho(url, 1000, { fetch: head(200, 1000) })).toBe(true)
    expect(pedidos).toBe(1) // guardado
    limparCacheEspelho()
    expect(await estaNoEspelho(url, 1000, { fetch: head(200, 999) })).toBe(false)
    limparCacheEspelho()
    expect(await estaNoEspelho(url, 1000, { fetch: head(404, null) })).toBe(false)
    limparCacheEspelho()
    expect(await estaNoEspelho(url, 1000, { fetch: head(200, null, true) })).toBe(false)
    // "não" dura 1 minuto: depois pergunta de novo
    limparCacheEspelho()
    let agora = 0
    expect(await estaNoEspelho(url, null, { fetch: head(404, null), agora: () => agora })).toBe(false)
    agora = 61_000
    expect(await estaNoEspelho(url, null, { fetch: head(200, 5), agora: () => agora })).toBe(true)
    // endereço fora do espelho nem é perguntado
    pedidos = 0
    expect(await estaNoEspelho('https://evil.com/a.dmg', null, { fetch: head(200, 1) })).toBe(false)
    expect(pedidos).toBe(0)
  })
})

// ───────── /baixar/hub (a própria central) ─────────

const API = 'https://api.github.com/repos/victorbarrosoc-hub/AbsoluteZRO'
const TOKEN = 'github_pat_teste_falso'
const hubAsset = (id: number, name: string, size = 1000): ReleaseAsset => ({
  name,
  url: `${API}/releases/assets/${id}`,
  browser_download_url: `https://github.com/victorbarrosoc-hub/AbsoluteZRO/releases/download/hub-desktop/${name}`,
  size,
})
const MAC = 'AbsoluteZRO-1.4.4-b90-mac-universal.dmg'
const WIN = 'AbsoluteZRO-1.4.4-b90-windows-setup.exe'

function hubGithub({ espelho = pasta('hub-desktop') as unknown, noEspelho = true, tamanhoNoEspelho = 1000 } = {}) {
  const heads: string[] = []
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'HEAD') {
      heads.push(url)
      return noEspelho && ehDoEspelho(url)
        ? new Response(null, { status: 200, headers: { 'content-length': String(tamanhoNoEspelho) } })
        : new Response(null, { status: 404 })
    }
    if (url === `${API}/releases/tags/hub-desktop`) return Response.json({ assets: [hubAsset(1, MAC), hubAsset(2, WIN), hubAsset(3, 'versao.json')] })
    const m = /\/releases\/assets\/(\d+)$/.exec(url)
    if (m) return new Response(null, { status: 302, headers: { location: `https://objects.githubusercontent.com/assinado/${m[1]}` } })
    if (url === 'https://objects.githubusercontent.com/assinado/3')
      return Response.json({
        build: 90,
        versao: '1.4.4',
        arquivoMac: MAC,
        sha256Mac: 'a'.repeat(64),
        arquivoWindows: WIN,
        sha256Windows: 'b'.repeat(64),
        espelho,
      })
    return new Response('?', { status: 500 })
  }) as typeof fetch
  return { f, heads, d: { fetch: f, env: { GITHUB_TOKEN: TOKEN, HUB_DESKTOP_PUBLICO: '1' } } }
}
const pedido = (c: string) => new URL(c, 'https://absolutezro.com')

describe('/baixar/hub com espelho', () => {
  it('com o arquivo no espelho: manda para São Paulo (inclusive ?build=, que a central 1.4.3 usa para se atualizar)', async () => {
    const g = hubGithub()
    const mac = await respostaInstalador('mac', pedido('/baixar/hub/mac'), g.d)
    expect(mac.status).toBe(302)
    expect(mac.headers.get('location')).toBe(`${pasta('hub-desktop')}/${MAC}`)
    const build = await respostaInstalador('windows', pedido('/baixar/hub/windows?build=90'), g.d)
    expect(build.headers.get('location')).toBe(`${pasta('hub-desktop')}/${WIN}`)
    // o versao.json do HUB repassa a pasta (a central ignora o que não conhece)
    expect((await (await respostaVersao(g.d)).json()).espelho).toBe(pasta('hub-desktop'))
  })

  it('?origem=github, arquivo fora do espelho, tamanho diferente ou pasta estranha: o GitHub de sempre', async () => {
    const gh = 'https://objects.githubusercontent.com/assinado/1'
    const forcado = hubGithub()
    expect((await respostaInstalador('mac', pedido('/baixar/hub/mac?build=90&origem=github'), forcado.d)).headers.get('location')).toBe(gh)
    expect(forcado.heads).toEqual([])
    expect((await respostaInstalador('mac', pedido('/baixar/hub/mac'), hubGithub({ noEspelho: false }).d)).headers.get('location')).toBe(gh)
    limparCacheEspelho()
    expect((await respostaInstalador('mac', pedido('/baixar/hub/mac'), hubGithub({ tamanhoNoEspelho: 7 }).d)).headers.get('location')).toBe(gh)
    limparCache()
    const estranho = hubGithub({ espelho: 'https://evil.com/storage/v1/object/public/apps/hub-desktop' })
    expect((await respostaInstalador('mac', pedido('/baixar/hub/mac'), estranho.d)).headers.get('location')).toBe(gh)
    expect(estranho.heads).toEqual([])
    limparCache()
    expect((await respostaInstalador('mac', pedido('/baixar/hub/mac'), hubGithub({ espelho: undefined }).d)).headers.get('location')).toBe(gh)
  })
})

// ───────── /baixar/app/<id>/<arquivo> (as ferramentas) ─────────

const SYN = 'https://api.github.com/repos/victorbarrosoc-hub/AbsoluteZRO/releases/tags/synquei-app-desktop'
const DMG = 'Synquei-1.2.0-b40-mac-universal.dmg'
const asset = (name: string): Asset => ({
  name,
  url: `https://api.github.com/repos/x/y/releases/assets/${name}`,
  browser_download_url: `https://github.com/x/y/releases/download/t/${name}`,
  size: 1000,
  digest: `sha256:${'a'.repeat(64)}`,
})

function synquei({ espelho = pasta('synquei-app-desktop'), noEspelho = true } = {}) {
  const heads: string[] = []
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = String(input)
    if (init?.method === 'HEAD') {
      heads.push(u)
      return new Response(null, { status: noEspelho ? 200 : 404, headers: { 'content-length': '1000' } })
    }
    if (u === SYN) return Response.json({ assets: [asset(DMG), asset('Synquei-1.2.0-b40-windows-setup.exe'), asset('versao.json')] })
    if (u.startsWith('https://api.github.com/repos/x/y/releases/assets/'))
      return new Response(null, { status: 302, headers: { location: `https://objects.githubusercontent.com/assinado/${u.split('/').pop()}` } })
    if (u === 'https://objects.githubusercontent.com/assinado/versao.json') return Response.json({ build: 40, arquivoMac: DMG, espelho })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return { heads, d: { fetch: f, env: { GITHUB_TOKEN: 'github_pat_teste' } } }
}
const TODOS = new Set(APPS_DESKTOP.map((a) => a.id))
const gh = (n: string) => `https://objects.githubusercontent.com/assinado/${n}`

describe('/baixar/app com espelho', () => {
  it('nome exato sem origem: o GitHub (a central 1.4.3 recusa outro destino)', async () => {
    const s = synquei()
    expect(await enderecoDoArquivo(TODOS, 'synquei', DMG, s.d)).toBe(gh(DMG))
    expect(s.heads).toEqual([])
  })

  it('?origem=espelho (central 1.4.4) e os botões mac/windows: o espelho, quando ele tem o arquivo', async () => {
    const s = synquei()
    expect(await enderecoDoArquivo(TODOS, 'synquei', DMG, s.d, 'espelho')).toBe(`${pasta('synquei-app-desktop')}/${DMG}`)
    expect(await enderecoDoArquivo(TODOS, 'synquei', 'mac', s.d)).toBe(`${pasta('synquei-app-desktop')}/${DMG}`)
    expect(await enderecoDoArquivo(TODOS, 'synquei', 'mac', s.d, 'github')).toBe(gh(DMG))
    // o versao.json nunca vai para o espelho (o aviso de versão dos apps lê pelo GitHub, como antes)
    expect(await enderecoDoArquivo(TODOS, 'synquei', 'versao.json', s.d, 'espelho')).toBeNull() // o Synquei não serve versao.json por aqui
  })

  it('espelho sem o arquivo ou pasta fora da forma: o GitHub; o gate e o nome continuam conferidos antes', async () => {
    expect(await enderecoDoArquivo(TODOS, 'synquei', DMG, synquei({ noEspelho: false }).d, 'espelho')).toBe(gh(DMG))
    limparCacheApps()
    const estranho = synquei({ espelho: 'https://evil.com/x' })
    expect(await enderecoDoArquivo(TODOS, 'synquei', DMG, estranho.d, 'espelho')).toBe(gh(DMG))
    expect(estranho.heads).toEqual([])
    expect(await enderecoDoArquivo(new Set(), 'synquei', DMG, synquei().d, 'espelho')).toBeNull()
    expect(await enderecoDoArquivo(TODOS, 'synquei', '../../etc/passwd', synquei().d, 'espelho')).toBeNull()
  })
})
