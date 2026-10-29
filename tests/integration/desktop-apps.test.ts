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

const TODOS = new Set(APPS_DESKTOP.map((a) => a.id))

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
    const c = await catalogoDesktop(TODOS, { fetch: f, env: {} })
    expect(c.apps.map((a) => a.id)).toEqual(['sobedesce', 'synquei', 'nossom', 'maestro'])
    expect(c.apps.every((a) => a.mac === null && a.windows === null)).toBe(true)
  })
})

describe('gate de lançamento (ADR 0023)', () => {
  it('produto fora dos liberados não entra no catálogo nem tem endereço (404)', async () => {
    const { f } = github({
      [SOBE]: { assets: [asset('SOBEDESCE-0.1.0-b1005-windows-setup.exe')] },
      'https://api.github.com/repos/victorbarrosoc-hub/nossom/releases/tags/desktop-v0.2.2': { assets: [asset('NOSSOM-0.2.2-win-x64.exe')] },
    })
    const lancados = new Set(['sobedesce', 'synquei'])
    const c = await catalogoDesktop(lancados, { fetch: f, env: {} })
    expect(c.apps.map((a) => a.id)).toEqual(['sobedesce', 'synquei'])
    expect(await enderecoDoArquivo(lancados, 'nossom', 'NOSSOM-0.2.2-win-x64.exe', { fetch: f, env: {} })).toBeNull()
    expect(await enderecoDoArquivo(new Set(), 'sobedesce', 'SOBEDESCE-0.1.0-b1005-windows-setup.exe', { fetch: f, env: {} })).toBeNull()
  })
})

describe('endereço do download', () => {
  it('com token: só arquivo reconhecido, redireciona para o endereço assinado', async () => {
    const { f, chamadas } = github({ [SOBE]: { assets: [asset('SOBEDESCE-0.1.0-b1005-windows-setup.exe')] } })
    const d = { fetch: f, env: { GITHUB_TOKEN: 'github_pat_teste ' } }
    expect(await enderecoDoArquivo(TODOS, 'sobedesce', 'SOBEDESCE-0.1.0-b1005-windows-setup.exe', d)).toBe(
      'https://objects.githubusercontent.com/assinado/SOBEDESCE-0.1.0-b1005-windows-setup.exe',
    )
    expect(await enderecoDoArquivo(TODOS, 'sobedesce', 'versao.json', d)).toBeNull()
    expect(await enderecoDoArquivo(TODOS, 'sobedesce', '../../etc/passwd', d)).toBeNull()
    expect(await enderecoDoArquivo(TODOS, 'outro', 'SOBEDESCE-0.1.0-b1005-windows-setup.exe', d)).toBeNull()
    expect(chamadas.filter((c) => c.includes('/releases/assets/'))).toHaveLength(1)
  })

  it('sem token: link público do Release', async () => {
    const { f } = github({ [SOBE]: { assets: [asset('SOBEDESCE-0.1.0-b1005-mac-universal.dmg')] } })
    expect(await enderecoDoArquivo(TODOS, 'sobedesce', 'SOBEDESCE-0.1.0-b1005-mac-universal.dmg', { fetch: f, env: {} })).toBe(
      'https://github.com/x/y/releases/download/t/SOBEDESCE-0.1.0-b1005-mac-universal.dmg',
    )
  })
})

describe('Maestro para computador', () => {
  const MAE = 'https://api.github.com/repos/victorbarrosoc-hub/AbsoluteZRO/releases/tags/maestro-versao-de-teste'
  const release = () =>
    github({
      [MAE]: {
        assets: [
          asset('Maestro-0.1.0-b6-mac-universal.dmg', sha('a')),
          asset('Maestro-0.1.0-b7-mac-universal.dmg', sha('b')),
          asset('Maestro-0.1.0-b7-windows-setup.exe', sha('c')),
          asset('Maestro-sha256-b7-mac.json'),
          asset('versao.json'),
        ],
      },
    })
  const d = (f: typeof fetch) => ({ fetch: f, env: { GITHUB_TOKEN: 'github_pat_teste' } })
  const assinado = (n: string) => `https://objects.githubusercontent.com/assinado/${n}`

  it('fechado (canal download/desktop sem o Maestro): fora do catálogo e nenhum arquivo, nem o versao.json', async () => {
    const { f, chamadas } = release()
    const lancados = new Set(['sobedesce', 'synquei'])
    expect((await catalogoDesktop(lancados, d(f))).apps.map((a) => a.id)).not.toContain('maestro')
    for (const nome of ['mac', 'windows', 'versao.json', 'Maestro-0.1.0-b7-mac-universal.dmg'])
      expect(await enderecoDoArquivo(lancados, 'maestro', nome, d(f)), nome).toBeNull()
    expect(chamadas.filter((u) => u.includes('maestro'))).toEqual([]) // nem pergunta ao GitHub pelo Maestro
  })

  it('liberado: entra no catálogo com Maestro.app e Maestro.exe, o build mais novo e o SHA-256', async () => {
    const { f } = release()
    const c = await catalogoDesktop(new Set(['maestro']), d(f))
    expect(c.apps).toHaveLength(1)
    expect(c.apps[0]!.mac).toEqual({
      bundle: 'Maestro.app',
      arquivos: [{ arquivo: 'Maestro-0.1.0-b7-mac-universal.dmg', sha256: 'b'.repeat(64), tamanho: 1000, versao: '0.1.0', build: 7, arch: 'universal' }],
    })
    expect(c.apps[0]!.windows).toMatchObject({ exe: 'Maestro.exe', nomeNoSistema: 'Maestro', arquivo: { build: 7, sha256: 'c'.repeat(64) } })
  })

  it('liberado: mac/windows levam ao instalador mais novo; versao.json e o arquivo exato do build também', async () => {
    const { f } = release()
    const L = new Set(['maestro'])
    expect(await enderecoDoArquivo(L, 'maestro', 'mac', d(f))).toBe(assinado('Maestro-0.1.0-b7-mac-universal.dmg'))
    expect(await enderecoDoArquivo(L, 'maestro', 'windows', d(f))).toBe(assinado('Maestro-0.1.0-b7-windows-setup.exe'))
    expect(await enderecoDoArquivo(L, 'maestro', 'versao.json', d(f))).toBe(assinado('versao.json'))
    expect(await enderecoDoArquivo(L, 'maestro', 'Maestro-0.1.0-b6-mac-universal.dmg', d(f))).toBe(assinado('Maestro-0.1.0-b6-mac-universal.dmg'))
    // o que o catálogo não reconhece continua fora
    expect(await enderecoDoArquivo(L, 'maestro', 'Maestro-sha256-b7-mac.json', d(f))).toBeNull()
    expect(await enderecoDoArquivo(L, 'maestro', 'linux', d(f))).toBeNull()
  })

  it('sem instalador publicado ainda: mac/windows dão 404 (null), nunca um arquivo qualquer', async () => {
    const { f } = github({ [MAE]: { assets: [asset('versao.json')] } })
    expect(await enderecoDoArquivo(new Set(['maestro']), 'maestro', 'mac', d(f))).toBeNull()
  })

  it('o versao.json só vale para quem publica o aviso no Release', async () => {
    expect(APPS_DESKTOP.filter((a) => a.versaoJson).map((a) => a.id)).toEqual(['maestro'])
  })
})
