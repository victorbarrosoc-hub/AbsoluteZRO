// Sons pelo HUB (Sonoplasta do AEON): a busca no Openverse com o filtro de licença e fonte, o formato da família, o
// arquivo só de host conhecido e com tamanho máximo, o token do app no Openverse e as falhas. Openverse falso, sem rede.
import { describe, expect, it } from 'vitest'
import type { Authenticated } from '@zro/auth'
import { baixarSom, buscarSons, hostPermitido, somDoOpenverse, SOM_MAX_BYTES, sonsConfigDoAmbiente, type SonsConfig } from '@zro/core'

const PESSOA = { user: { id: 'u1' } } as unknown as Authenticated
const ID = 'eab8a6e2-0ac8-4615-9e0d-ebde30523783'
const item = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  title: 'Deep Whoosh #1',
  creator: 'Kinoton',
  license: 'cc0',
  license_version: '1.0',
  license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  url: 'https://cdn.freesound.org/previews/351/351256_2247456-hq.mp3',
  foreign_landing_url: 'https://freesound.org/people/Kinoton/sounds/351256',
  duration: 3155,
  filetype: 'mp3',
  filesize: 69196,
  source: 'freesound',
  ...extra,
})

/** Openverse falso: guarda os pedidos e responde por caminho. */
function falso(rotas: Record<string, () => Response>) {
  const pedidos: { url: string; init?: RequestInit }[] = []
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    pedidos.push({ url: u, init })
    const chave = Object.keys(rotas).find((k) => u.includes(k))
    if (!chave) return new Response('nada', { status: 404 })
    return rotas[chave]!()
  }) as typeof fetch
  return { cfg: { base: 'https://api.openverse.test', fetch: f } satisfies SonsConfig, pedidos }
}

describe('sons pelo HUB (Openverse)', () => {
  it('só licenças comerciais sem SA/NC/ND e só fontes de efeito, no formato da família', () => {
    expect(somDoOpenverse(item())).toMatchObject({
      id: ID,
      origem: 'openverse',
      titulo: 'Deep Whoosh #1',
      autor: 'Kinoton',
      licenca: 'CC0 1.0',
      fonte: 'Freesound',
      duracao: 3.155,
      formato: 'mp3',
      bytes: 69196,
    })
    expect(somDoOpenverse(item({ license: 'by', license_version: '4.0' }))?.licenca).toBe('CC BY 4.0')
    expect(somDoOpenverse(item({ license: 'pdm', license_version: '1.0' }))?.licenca).toBe('Domínio público')
    for (const license of ['by-sa', 'by-nc', 'by-nd', 'sampling+']) expect(somDoOpenverse(item({ license }))).toBeNull()
    expect(somDoOpenverse(item({ source: 'jamendo' }))).toBeNull()
    expect(somDoOpenverse(item({ id: 'x' }))).toBeNull()
  })

  it('busca pede o filtro certo, sem token de app quando não há cadastro, e descarta o que não serve', async () => {
    const { cfg, pedidos } = falso({
      '/v1/audio/?': () => Response.json({ page_count: 3, results: [item(), item({ id: 'f1dc6045-7965-41de-87f8-4731d2583fd2', license: 'by-nc' })] }),
    })
    const r = await buscarSons(cfg, PESSOA, { q: '  whoosh   rápido ', pagina: '2' })
    expect(r).toMatchObject({ pagina: 2, paginas: 3 })
    expect(r.sons.map((s) => s.id)).toEqual([ID])
    const u = new URL(pedidos[0]!.url)
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      q: 'whoosh rápido',
      license: 'cc0,by,pdm',
      source: 'freesound,wikimedia_audio',
      length: 'shortest,short',
      page: '2',
      page_size: '20',
    })
    expect((pedidos[0]!.init?.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('com cadastro no Openverse, pede o token do app uma vez e usa nas buscas', async () => {
    const { cfg, pedidos } = falso({
      '/v1/auth_tokens/token/': () => Response.json({ access_token: 'tok-app', expires_in: 43200 }),
      '/v1/audio/?': () => Response.json({ page_count: 1, results: [] }),
    })
    const comApp = { ...cfg, clientId: 'cid', clientSecret: 'seg' }
    await buscarSons(comApp, PESSOA, { q: 'impacto' })
    await buscarSons(comApp, PESSOA, { q: 'clique' })
    expect(pedidos.filter((p) => p.url.includes('auth_tokens')).length).toBe(1)
    expect(pedidos.filter((p) => p.url.includes('/v1/audio/?')).map((p) => (p.init?.headers as Record<string, string>).Authorization)).toEqual([
      'Bearer tok-app',
      'Bearer tok-app',
    ])
  })

  it('sem conta, termo curto ou limite do Openverse: erros com o status certo', async () => {
    const { cfg } = falso({ '/v1/audio/?': () => new Response('{}', { status: 429 }) })
    await expect(buscarSons(cfg, null, { q: 'whoosh' })).rejects.toMatchObject({ status: 401 })
    await expect(buscarSons(cfg, PESSOA, { q: 'w' })).rejects.toMatchObject({ status: 422 })
    await expect(buscarSons(cfg, PESSOA, { q: 'whoosh' })).rejects.toMatchObject({ status: 429 })
    const fora = { base: 'https://api.openverse.test', fetch: (async () => Promise.reject(new Error('rede'))) as unknown as typeof fetch }
    await expect(buscarSons(fora, PESSOA, { q: 'whoosh' })).rejects.toMatchObject({ status: 503 })
  })

  it('arquivo: só host conhecido por https, só áudio, com metadados e limite de tamanho', async () => {
    expect(hostPermitido('https://cdn.freesound.org/a.mp3')).toBe(true)
    expect(hostPermitido('http://cdn.freesound.org/a.mp3')).toBe(false)
    expect(hostPermitido('https://169.254.169.254/latest')).toBe(false)
    expect(hostPermitido('https://user:x@upload.wikimedia.org/a.ogg')).toBe(false)

    const audio = new Uint8Array([1, 2, 3, 4])
    const { cfg, pedidos } = falso({
      [`/v1/audio/${ID}/`]: () => Response.json(item()),
      'cdn.freesound.org': () => new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '4' } }),
    })
    const r = await baixarSom(cfg, PESSOA, ID)
    expect(r.headers.get('content-type')).toBe('audio/mpeg')
    expect(r.headers.get('x-zro-som-id')).toBe(ID)
    expect(decodeURIComponent(r.headers.get('x-zro-som-licenca')!)).toBe('CC0 1.0')
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(audio)
    expect(pedidos.at(-1)?.init?.redirect).toBe('manual')

    const host = falso({ [`/v1/audio/${ID}/`]: () => Response.json(item({ url: 'https://evil.example/a.mp3' })) })
    await expect(baixarSom(host.cfg, PESSOA, ID)).rejects.toMatchObject({ status: 422 })
    const html = falso({
      [`/v1/audio/${ID}/`]: () => Response.json(item()),
      'cdn.freesound.org': () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    })
    await expect(baixarSom(html.cfg, PESSOA, ID)).rejects.toMatchObject({ status: 503 })
    const grande = falso({
      [`/v1/audio/${ID}/`]: () => Response.json(item()),
      'cdn.freesound.org': () => new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(SOM_MAX_BYTES + 1) } }),
    })
    await expect(baixarSom(grande.cfg, PESSOA, ID)).rejects.toMatchObject({ status: 422 })
    const nc = falso({ [`/v1/audio/${ID}/`]: () => Response.json(item({ license: 'by-nc' })) })
    await expect(baixarSom(nc.cfg, PESSOA, ID)).rejects.toMatchObject({ status: 404 })
    await expect(baixarSom(nc.cfg, PESSOA, '../etc')).rejects.toMatchObject({ status: 422 })
  })

  it('o ambiente: Openverse padrão e cadastro opcional', () => {
    expect(sonsConfigDoAmbiente({})).toEqual({ base: 'https://api.openverse.org', clientId: undefined, clientSecret: undefined })
    expect(sonsConfigDoAmbiente({ OPENVERSE_URL: 'https://x.test/', OPENVERSE_CLIENT_ID: ' a ', OPENVERSE_CLIENT_SECRET: 'b' })).toEqual({
      base: 'https://x.test',
      clientId: 'a',
      clientSecret: 'b',
    })
  })
})
