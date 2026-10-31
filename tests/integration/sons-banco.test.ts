// O banco de sons da pessoa no Drive (Sonoplasta do AEON, fase 2b): o HUB lista a pasta e passa o arquivo pelo
// SOBEDESCE com o pedido assinado. Só áudio, até 25 MB, token do Drive só no HUB (pedido uma vez e reaproveitado),
// erros do SOBEDESCE viram frases com o código. SOBEDESCE e Google falsos, sem rede.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Authenticated } from '@zro/auth'
import { setIssuer } from '@zro/auth'
import { baixarDoBanco, listarBanco, SOM_MAX_BYTES, type BancoConfig } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'

let db: Database
const PESSOA = { user: { id: 'pessoa-banco' } } as unknown as Authenticated
const PASTA = '1AbCdEfGhIjKlMnOp'
const SOM = '1WhooshDoBancoXyz'
const SD = 'https://sd.teste'
const GOOGLE = 'https://google.teste/drive/v3'

beforeAll(() => {
  db = testDatabase()
  setIssuer('https://hub.teste.absolutezro.local')
})
afterAll(async () => {
  await db.close()
})

type Pedido = { url: string; corpo: Record<string, unknown> | null; auth: string | null; acao: string | null }
/** SOBEDESCE e Google falsos: respondem por trecho da URL e guardam os pedidos (com a ação do JWT). */
function falso(rotas: Record<string, (p: Pedido) => Response>) {
  const pedidos: Pedido[] = []
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    const auth = new Headers(init?.headers).get('authorization')
    const jwt = auth?.startsWith('Bearer ') && auth.split('.').length === 3 ? JSON.parse(Buffer.from(auth.split('.')[1]!, 'base64url').toString()) : null
    const p: Pedido = { url: u, corpo: init?.body ? JSON.parse(String(init.body)) : null, auth, acao: jwt?.zro_pedido ?? null }
    pedidos.push(p)
    const chave = Object.keys(rotas).find((k) => u.includes(k))
    return chave ? rotas[chave]!(p) : new Response('{}', { status: 404 })
  }) as typeof fetch
  return { cfg: { base: SD, clientId: 'sobedesce-web', google: GOOGLE, fetch: f } satisfies BancoConfig, pedidos }
}

const listagem = () =>
  Response.json({
    conta: { id: 'c1', email: 'pessoa@exemplo.com' },
    pasta: { id: PASTA, nome: 'Meus SFX' },
    itens: [
      { id: '1PastaWhooshesAbc', nome: 'Whooshes', tipo: 'application/vnd.google-apps.folder', pasta: true },
      { id: SOM, nome: 'Whoosh grave.wav', tipo: 'audio/wav', pasta: false, tamanho: 120000 },
      { id: '1VideoQueNaoEhSom', nome: 'bastidor.mp4', tipo: 'video/mp4', pasta: false, tamanho: 9 },
      { id: '1SemMimeMasEhSom1', nome: 'clique.aiff', tipo: 'application/octet-stream', pasta: false },
      { id: 'x', nome: 'id curto', tipo: 'audio/wav', pasta: false },
    ],
    proxima: 'pag2',
  })

describe('banco de sons no Drive (HUB → SOBEDESCE)', () => {
  it('lista a pasta: subpastas e só áudios, com o pedido assinado e sem o e-mail da conta', async () => {
    const { cfg, pedidos } = falso({ '/api/zro/drive/listar': listagem })
    const r = await listarBanco(db, PESSOA, { pasta: PASTA, q: '  whoosh  ', conta: 'c1' }, cfg)
    expect(pedidos[0]).toMatchObject({ url: `${SD}/api/zro/drive/listar`, acao: 'drive.listar', corpo: { pasta: PASTA, busca: 'whoosh', conta: 'c1' } })
    expect(r).toEqual({
      pasta: { id: PASTA, nome: 'Meus SFX' },
      conta: 'c1',
      pastas: [{ id: '1PastaWhooshesAbc', nome: 'Whooshes' }],
      sons: [
        { id: SOM, origem: 'banco', titulo: 'Whoosh grave', nome: 'Whoosh grave.wav', formato: 'wav', bytes: 120000, conta: 'c1' },
        { id: '1SemMimeMasEhSom1', origem: 'banco', titulo: 'clique', nome: 'clique.aiff', formato: 'aiff', bytes: null, conta: 'c1' },
      ],
      proxima: 'pag2',
    })
    expect(JSON.stringify(r)).not.toContain('@')
  })

  it('sem conta, pasta inválida ou busca longa: recusa antes de pedir', async () => {
    const { cfg, pedidos } = falso({})
    await expect(listarBanco(db, null, { pasta: PASTA }, cfg)).rejects.toMatchObject({ status: 401 })
    await expect(listarBanco(db, PESSOA, { pasta: 'https://evil' }, cfg)).rejects.toMatchObject({ status: 422 })
    await expect(listarBanco(db, PESSOA, { pasta: PASTA, q: 'x'.repeat(81) }, cfg)).rejects.toMatchObject({ status: 422 })
    expect(pedidos.length).toBe(0)
  })

  it('erros do SOBEDESCE viram frase com o código e o link de onde resolver', async () => {
    const casos: [number, string, number][] = [
      [409, 'sem_drive', 409],
      [409, 'reconectar_drive', 409],
      [404, 'sem_vinculo', 409],
      [403, 'sem_acesso_zro', 403],
      [404, 'nao_achou', 404],
      [429, 'devagar', 429],
      [502, 'drive_indisponivel', 503],
    ]
    for (const [status, erro, esperado] of casos) {
      const { cfg } = falso({ '/api/zro/drive/listar': () => Response.json({ erro }, { status }) })
      await expect(listarBanco(db, PESSOA, { pasta: PASTA }, cfg)).rejects.toMatchObject({ status: esperado, details: expect.objectContaining({ erro }) })
    }
    const { cfg } = falso({ '/api/zro/drive/listar': () => Response.json({ erro: 'sem_drive' }, { status: 409 }) })
    await expect(listarBanco(db, PESSOA, { pasta: PASTA }, cfg)).rejects.toMatchObject({ details: { link: `${SD}/conta` } })
  })

  it('arquivo: o token do Drive fica no HUB, pedido uma vez; confere áudio e devolve os bytes', async () => {
    const audio = new Uint8Array([9, 8, 7])
    const { cfg, pedidos } = falso({
      '/api/zro/drive/token': () => Response.json({ access_token: 'ya29.curto', expira_em: new Date(Date.now() + 3_600_000).toISOString() }),
      [`/files/${SOM}?fields=`]: () => Response.json({ id: SOM, name: 'Whoosh grave.wav', mimeType: 'audio/wav', size: '3' }),
      [`/files/${SOM}?alt=media`]: () => new Response(audio, { headers: { 'Content-Type': 'audio/wav' } }),
    })
    const outra = { ...PESSOA, user: { id: 'pessoa-token' } } as unknown as Authenticated
    const r = await baixarDoBanco(db, outra, SOM, { conta: 'c1' }, cfg)
    expect(r.headers.get('content-type')).toBe('audio/wav')
    expect(r.headers.get('x-zro-som-id')).toBe(SOM)
    expect(decodeURIComponent(r.headers.get('x-zro-som-titulo')!)).toBe('Whoosh grave')
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(audio)
    await (await baixarDoBanco(db, outra, SOM, { conta: 'c1' }, cfg)).arrayBuffer()
    expect(pedidos.filter((p) => p.acao === 'drive.token').map((p) => p.corpo)).toEqual([{ conta: 'c1' }])
    expect(pedidos.filter((p) => p.url.startsWith(GOOGLE)).every((p) => p.auth === 'Bearer ya29.curto' && p.url.includes('supportsAllDrives=true'))).toBe(true)
    // o token nunca sai na resposta
    expect([...r.headers.values()].join(' ')).not.toContain('ya29')
  })

  it('arquivo: não é som, grande demais, apagado ou sem acesso; token recusado pede outro uma vez', async () => {
    const token = () => Response.json({ access_token: 'ya29.x', expira_em: new Date(Date.now() + 3_600_000).toISOString() })
    const meta = (m: Record<string, unknown>) => () => Response.json({ id: SOM, name: 'a.wav', mimeType: 'audio/wav', size: '3', ...m })
    const pessoa = (id: string) => ({ user: { id } }) as unknown as Authenticated
    const video = falso({ '/api/zro/drive/token': token, '?fields=': meta({ mimeType: 'video/mp4', name: 'a.mp4' }) })
    await expect(baixarDoBanco(db, pessoa('p-video'), SOM, {}, video.cfg)).rejects.toMatchObject({ status: 422 })
    const grande = falso({ '/api/zro/drive/token': token, '?fields=': meta({ size: String(SOM_MAX_BYTES + 1) }) })
    await expect(baixarDoBanco(db, pessoa('p-grande'), SOM, {}, grande.cfg)).rejects.toMatchObject({ status: 422 })
    const lixo = falso({ '/api/zro/drive/token': token, '?fields=': meta({ trashed: true }) })
    await expect(baixarDoBanco(db, pessoa('p-lixo'), SOM, {}, lixo.cfg)).rejects.toMatchObject({ status: 404 })
    const sem = falso({ '/api/zro/drive/token': token, '?fields=': () => new Response('{}', { status: 403 }) })
    await expect(baixarDoBanco(db, pessoa('p-sem'), SOM, {}, sem.cfg)).rejects.toMatchObject({ status: 404 })
    await expect(baixarDoBanco(db, pessoa('p-sem'), '../x', {}, sem.cfg)).rejects.toMatchObject({ status: 422 })

    let vezes = 0
    const revogado = falso({
      '/api/zro/drive/token': token,
      '?fields=': () => (++vezes === 1 ? new Response('{}', { status: 401 }) : Response.json({ id: SOM, name: 'a.wav', mimeType: 'audio/wav', size: '1' })),
      '?alt=media': () => new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/wav' } }),
    })
    const r = await baixarDoBanco(db, pessoa('p-revogado'), SOM, {}, revogado.cfg)
    expect(r.status).toBe(200)
    expect(revogado.pedidos.filter((p) => p.acao === 'drive.token').length).toBe(2)
  })
})
