// Central de apps do computador: catálogo a partir dos Releases (só arquivo com SHA-256) e endereço do download.
import { beforeEach, describe, expect, it } from 'vitest'
import { appNoCatalogo, APPS_DESKTOP, catalogoDesktop, enderecoDoArquivo, escolher, limparCacheApps, type Asset } from '../../apps/hub-web/lib/desktop-apps'

const sha = (c: string) => `sha256:${c.repeat(64)}`
const asset = (name: string, digest: string | null = sha('a'), size = 1000): Asset => ({
  name,
  url: `https://api.github.com/repos/x/y/releases/assets/${name}`,
  browser_download_url: `https://github.com/x/y/releases/download/t/${name}`,
  size,
  digest,
})

type Rota = Record<string, unknown>
function github(rotas: Rota) {
  const chamadas: string[] = []
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    chamadas.push(u)
    if (u.startsWith('https://api.github.com/repos/x/y/releases/assets/')) {
      return new Response(null, { status: 302, headers: { location: `https://objects.githubusercontent.com/assinado/${u.split('/').pop()}` } })
    }
    void init
    const corpo = rotas[u]
    return corpo === undefined ? new Response('{}', { status: 404 }) : Response.json(corpo)
  }) as typeof fetch
  return { f, chamadas }
}

const SOBE = 'https://api.github.com/repos/victorbarrosoc-hub/AbsoluteZRO/releases/tags/sobedesce-versao-de-teste'

beforeEach(() => limparCacheApps())

describe('escolha do arquivo', () => {
  it('pega a maior versão e, nela, o maior build; ignora arquivo sem SHA-256', () => {
    const re = APPS_DESKTOP[0]!.windows.re
    const lista = [
      asset('SOBEDESCE-0.1.0-b1005-windows-setup.exe'),
      asset('SOBEDESCE-0.1.0-b1010-windows-setup.exe', sha('b')),
      asset('SOBEDESCE-0.1.0-b1020-windows-setup.exe', null),
      asset('SOBEDESCE-0.0.9-b2000-windows-setup.exe'),
    ]
    expect(escolher(lista, re, 'x64')).toMatchObject({
      arquivo: 'SOBEDESCE-0.1.0-b1010-windows-setup.exe',
      build: 1010,
      versao: '0.1.0',
      sha256: 'b'.repeat(64),
    })
    expect(escolher([asset('SOBEDESCE-0.1.0-b1-windows-setup.exe', 'md5:abc')], re, 'x64')).toBeNull()
  })
})

describe('catálogo', () => {
  it('monta Mac e Windows a partir do Release, com tamanho e SHA-256', async () => {
    const { f } = github({
      [SOBE]: {
        assets: [asset('SOBEDESCE-0.1.0-b1005-mac-universal.dmg', sha('c'), 354), asset('SOBEDESCE-0.1.0-b1005-windows-setup.exe'), asset('versao.json')],
      },
    })
    const c = await appNoCatalogo(APPS_DESKTOP[0]!, { fetch: f, env: {} })
    expect(c.mac).toEqual({
      bundle: 'SOBEDESCE.app',
      arquivos: [{ arquivo: 'SOBEDESCE-0.1.0-b1005-mac-universal.dmg', sha256: 'c'.repeat(64), tamanho: 354, versao: '0.1.0', build: 1005, arch: 'universal' }],
    })
    expect(c.windows?.exe).toBe('SOBEDESCE.exe')
  })

  it('NOSSOM: usa o Release nossom-v* mais novo e, sem ele, o repositório antigo; Mac por arquitetura', async () => {
    const { f } = github({
      'https://api.github.com/repos/victorbarrosoc-hub/AbsoluteZRO/releases?per_page=30': [],
      'https://api.github.com/repos/victorbarrosoc-hub/nossom/releases/tags/desktop-v0.2.2': {
        assets: [asset('NOSSOM-0.2.2-mac-arm64.dmg'), asset('NOSSOM-0.2.2-mac-x64.dmg'), asset('NOSSOM-0.2.2-win-x64.exe')],
      },
    })
    const nossom = APPS_DESKTOP.find((a) => a.id === 'nossom')!
    const c = await appNoCatalogo(nossom, { fetch: f, env: {} })
    expect(c.mac?.arquivos.map((a) => a.arch)).toEqual(['arm64', 'x64'])
    expect(c.windows?.arquivo.versao).toBe('0.2.2')

    limparCacheApps()
    const novo = github({
      'https://api.github.com/repos/victorbarrosoc-hub/AbsoluteZRO/releases?per_page=30': [
        { tag_name: 'nossom-v0.3.0', assets: [asset('NOSSOM-0.3.0-win-x64.exe')] },
        { tag_name: 'nossom-v0.2.9', assets: [asset('NOSSOM-0.2.9-win-x64.exe')] },
        { tag_name: 'sobedesce-versao-de-teste', assets: [asset('NOSSOM-9.9.9-win-x64.exe')] },
        { tag_name: 'nossom-v1.0.0', draft: true, assets: [asset('NOSSOM-1.0.0-win-x64.exe')] },
      ],
    })
    const c2 = await appNoCatalogo(nossom, { fetch: novo.f, env: {} })
    expect(c2.windows?.arquivo.arquivo).toBe('NOSSOM-0.3.0-win-x64.exe')
  })

  it('GitHub fora do ar: a ferramenta fica sem instalador (nunca quebra o catálogo)', async () => {
    const f = (async () => {
      throw new Error('rede')
    }) as unknown as typeof fetch
    const c = await catalogoDesktop({ fetch: f, env: {} })
    expect(c.apps.map((a) => a.id)).toEqual(['sobedesce', 'synquei', 'nossom'])
    expect(c.apps.every((a) => a.mac === null && a.windows === null)).toBe(true)
  })
})

describe('endereço do download', () => {
  it('com token: só arquivo reconhecido, redireciona para o endereço assinado', async () => {
    const { f, chamadas } = github({ [SOBE]: { assets: [asset('SOBEDESCE-0.1.0-b1005-windows-setup.exe')] } })
    const d = { fetch: f, env: { GITHUB_TOKEN: 'github_pat_teste ' } }
    expect(await enderecoDoArquivo('sobedesce', 'SOBEDESCE-0.1.0-b1005-windows-setup.exe', d)).toBe(
      'https://objects.githubusercontent.com/assinado/SOBEDESCE-0.1.0-b1005-windows-setup.exe',
    )
    expect(await enderecoDoArquivo('sobedesce', 'versao.json', d)).toBeNull()
    expect(await enderecoDoArquivo('sobedesce', '../../etc/passwd', d)).toBeNull()
    expect(await enderecoDoArquivo('outro', 'SOBEDESCE-0.1.0-b1005-windows-setup.exe', d)).toBeNull()
    expect(chamadas.filter((c) => c.includes('/releases/assets/'))).toHaveLength(1)
  })

  it('sem token: link público do Release', async () => {
    const { f } = github({ [SOBE]: { assets: [asset('SOBEDESCE-0.1.0-b1005-mac-universal.dmg')] } })
    expect(await enderecoDoArquivo('sobedesce', 'SOBEDESCE-0.1.0-b1005-mac-universal.dmg', { fetch: f, env: {} })).toBe(
      'https://github.com/x/y/releases/download/t/SOBEDESCE-0.1.0-b1005-mac-universal.dmg',
    )
  })
})
