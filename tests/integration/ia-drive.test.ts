// A Z no Google Drive pelo SOBEDESCE: o pedido assinado pelo HUB (JWT curto, conferível pela JWKS) e a ferramenta
// contra um SOBEDESCE falso (sem rede de verdade): busca, pasta, versão pronta, pedido ao computador e falhas.
import { createPublicKey, verify, type JsonWebKey } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assinarPedidoDeApp, jwks, PEDIDO_TTL_S, PEDIDO_TYP, setIssuer, verifyJwt, loadSigner } from '@zro/auth'
import { confirmacaoClara, driveParaIa, linkDoSobedesce, tamanhoLegivel, tipoLegivel, type DriveConfig } from '@zro/core'
import type { Database } from '@zro/db'
import { testDatabase } from '@zro/db/testing'

let db: Database
const ISS = 'https://hub.teste.absolutezro.local'
const AUD = 'sobedesce-web'

type Pedido = { caminho: string; corpo: Record<string, unknown>; claims: Record<string, unknown> | null }
let servidor: http.Server
let cfg: DriveConfig
const pedidos: Pedido[] = []
/** Resposta do SOBEDESCE falso para o próximo pedido, por caminho. */
const respostas = new Map<string, { status: number; corpo: unknown }>()

/** Confere o JWT como o SOBEDESCE confere: JWKS, typ, iss, aud, vida curta. */
async function conferir(token: string): Promise<Record<string, unknown> | null> {
  const [c, d, a] = token.split('.')
  if (!c || !d || !a) return null
  const cab = JSON.parse(Buffer.from(c, 'base64url').toString()) as Record<string, unknown>
  const dados = JSON.parse(Buffer.from(d, 'base64url').toString()) as Record<string, unknown>
  const chave = (await jwks(db)).keys.find((k) => k.kid === cab.kid)
  if (!chave || cab.typ !== PEDIDO_TYP || cab.alg !== 'ES256') return null
  const ok = verify(
    'sha256',
    Buffer.from(`${c}.${d}`),
    { key: createPublicKey({ key: chave as JsonWebKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
    Buffer.from(a, 'base64url'),
  )
  if (!ok || dados.iss !== ISS || dados.aud !== AUD || (dados.exp as number) <= Date.now() / 1000) return null
  return dados
}

beforeAll(async () => {
  db = testDatabase()
  setIssuer(ISS)
  servidor = http.createServer(async (req, res) => {
    let texto = ''
    for await (const p of req) texto += p
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? ''
    const claims = await conferir(token)
    pedidos.push({ caminho: req.url ?? '', corpo: JSON.parse(texto || '{}') as Record<string, unknown>, claims })
    const r = claims ? (respostas.get(req.url ?? '') ?? { status: 404, corpo: { erro: 'nao_encontrado' } }) : { status: 401, corpo: { erro: 'nao_autorizado' } }
    res.writeHead(r.status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(r.corpo))
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  cfg = { base: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, clientId: AUD }
})
afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()))
  await db.close()
})

describe('pedido assinado pelo HUB', () => {
  it('confere na JWKS, tem aud e sub certos, typ próprio e vence em 60 s', async () => {
    const t = await assinarPedidoDeApp(db, { sub: 'pessoa-1', aud: AUD, acao: 'drive.buscar' })
    const c = await conferir(t)
    expect(c).toMatchObject({ iss: ISS, sub: 'pessoa-1', aud: AUD, zro_pedido: 'drive.buscar' })
    expect((c!.exp as number) - (c!.iat as number)).toBe(PEDIDO_TTL_S)
    expect(typeof c!.jti).toBe('string')
    const s = await loadSigner(db)
    // Não se passa por access token nem por id_token.
    expect(verifyJwt(s, t, { typ: 'at+jwt', issuer: ISS })).toBeNull()
    expect(verifyJwt(s, t, { typ: PEDIDO_TYP, issuer: ISS })).not.toBeNull()
    expect(verifyJwt(s, t, { typ: PEDIDO_TYP, issuer: ISS, now: Date.now() + (PEDIDO_TTL_S + 1) * 1000 })).toBeNull()
    const outro = await assinarPedidoDeApp(db, { sub: 'pessoa-1', aud: AUD, acao: 'drive.buscar' })
    expect(JSON.parse(Buffer.from(outro.split('.')[1]!, 'base64url').toString()).jti).not.toBe(c!.jti)
  })

  it('recusa assinar sem sub, aud ou ação', async () => {
    await expect(assinarPedidoDeApp(db, { sub: '', aud: AUD, acao: 'drive.buscar' })).rejects.toThrow()
    await expect(assinarPedidoDeApp(db, { sub: 'x', aud: '', acao: 'drive.buscar' })).rejects.toThrow()
  })
})

describe('ferramenta da Z contra o SOBEDESCE falso', () => {
  it('busca: manda o termo com o pedido assinado e devolve nome, tipo legível, tamanho e os links do SOBEDESCE', async () => {
    respostas.set('/api/zro/drive/buscar', {
      status: 200,
      corpo: {
        arquivos: [
          {
            id: 'v1',
            nome: 'primeiro.mov',
            tipo: 'video/quicktime',
            criado: '2026-10-01T10:00:00Z',
            tamanho: 734003200,
            video: { largura: 3840, altura: 2160, duracao_s: 75 },
            abrir_no_sobedesce: `${cfg.base}/app/#arquivo/v1`,
            baixar_pelo_sobedesce: `${cfg.base}/app/#baixar/v1`,
            // Links do site do Google (um SOBEDESCE antigo mandaria): nunca chegam à Z.
            link: 'https://drive.google.com/file/d/v1/view',
            link_download: 'https://drive.google.com/uc?id=v1&export=download',
          },
        ],
        incompleta: false,
      },
    })
    const r = await driveParaIa(db, 'pessoa-1', { tipo: 'buscar', termo: 'primeiro' }, cfg)
    expect(r.erro).toBe(false)
    const p = pedidos.at(-1)!
    expect(p.claims).toMatchObject({ sub: 'pessoa-1', zro_pedido: 'drive.buscar' })
    expect(p.corpo).toEqual({ termo: 'primeiro' })
    const j = JSON.parse(r.texto)
    expect(j.arquivos[0]).toEqual({
      nome: 'primeiro.mov',
      tipo: 'vídeo MOV',
      formato: 'video/quicktime',
      entrou_no_drive: '2026-10-01T10:00:00Z',
      tamanho: '734 MB',
      resolucao: '3840×2160',
      duracao: '1:15',
      abrir_no_sobedesce: `${cfg.base}/app/#arquivo/v1`,
      baixar_pelo_sobedesce: `${cfg.base}/app/#baixar/v1`,
      id: 'v1',
    })
    expect(r.texto).not.toMatch(/drive\.google\.com/)
  })

  it('pasta com várias opções e pasta listada na ordem pedida', async () => {
    respostas.set('/api/zro/drive/pasta', {
      status: 200,
      corpo: {
        escolher: [
          { id: 'a', nome: 'Motion' },
          { id: 'b', nome: 'Motion 2' },
        ],
      },
    })
    const r1 = await driveParaIa(db, 'pessoa-1', { tipo: 'pasta', pasta: 'Motion', ordem: 'mais_antigo' }, cfg)
    expect(JSON.parse(r1.texto).varias_pastas).toHaveLength(2)
    expect(pedidos.at(-1)!.claims!.zro_pedido).toBe('drive.pasta')
    expect(pedidos.at(-1)!.corpo).toEqual({ pasta: 'Motion', ordem: 'mais_antigo' })
    respostas.set('/api/zro/drive/pasta', { status: 200, corpo: { pasta: { id: 'a', nome: 'Motion' }, ordem: 'mais_antigo', arquivos: [], mais: false } })
    expect(JSON.parse((await driveParaIa(db, 'pessoa-1', { tipo: 'pasta', pasta: 'a', ordem: 'mais_antigo' }, cfg)).texto).vazia).toBe(true)
  })

  it('links do SOBEDESCE: arquivo tem Abrir (#arquivo) e Baixar (#baixar), pasta só Abrir (#drive); link estranho some', async () => {
    const sd = (rota: string, id: string) => `${cfg.base}/app/#${rota}/${id}`
    respostas.set('/api/zro/drive/buscar', {
      status: 200,
      corpo: {
        arquivos: [
          { id: 'v1', nome: 'a.mov', tipo: 'video/quicktime', abrir_no_sobedesce: sd('arquivo', 'v1'), baixar_pelo_sobedesce: sd('baixar', 'v1') },
          // Outra origem; com query.
          {
            id: 'v2',
            nome: 'b.mov',
            tipo: 'video/quicktime',
            abrir_no_sobedesce: 'https://golpe.example/app/#arquivo/v2',
            baixar_pelo_sobedesce: `${cfg.base}/app/#baixar/v2?x`,
          },
          // Outro caminho; a rota da pasta no lugar da de baixar.
          { id: 'v3', nome: 'c.mov', tipo: 'video/quicktime', abrir_no_sobedesce: `${cfg.base}/conta#arquivo/v3`, baixar_pelo_sobedesce: sd('drive', 'p1') },
          // Links de outro arquivo.
          { id: 'v4', nome: 'd.mov', tipo: 'video/quicktime', abrir_no_sobedesce: sd('arquivo', 'v1'), baixar_pelo_sobedesce: sd('baixar', 'v1') },
          // Pasta: nunca tem Baixar.
          {
            id: 'p1',
            nome: 'Motion',
            tipo: 'application/vnd.google-apps.folder',
            pasta: true,
            abrir_no_sobedesce: sd('drive', 'p1'),
            baixar_pelo_sobedesce: sd('baixar', 'p1'),
          },
        ],
      },
    })
    const b = JSON.parse((await driveParaIa(db, 'pessoa-1', { tipo: 'buscar', termo: 'mov' }, cfg)).texto)
    expect(b.arquivos.map((a: Record<string, unknown>) => [a.abrir_no_sobedesce, a.baixar_pelo_sobedesce])).toEqual([
      [sd('arquivo', 'v1'), sd('baixar', 'v1')],
      [undefined, undefined],
      [undefined, undefined],
      [undefined, undefined],
      [sd('drive', 'p1'), undefined],
    ])
    expect(linkDoSobedesce('https://sobedesce.com/app/#drive/abc_1-D', cfg.base, 'pasta')).toBe('https://sobedesce.com/app/#drive/abc_1-D')
    expect(linkDoSobedesce('https://sobedesce.com/app/#baixar/abc_1-D', cfg.base, 'baixar', 'abc_1-D')).toBe('https://sobedesce.com/app/#baixar/abc_1-D')
    expect(linkDoSobedesce('https://sobedesce.com/app/#baixar/abc_1-D', cfg.base, 'abrir', 'abc_1-D')).toBeUndefined()
    expect(linkDoSobedesce('https://sobedesce.com/app/#baixar/abc_1-D', cfg.base, 'baixar', 'outro')).toBeUndefined()
    expect(linkDoSobedesce('javascript:alert(1)', cfg.base, 'pasta')).toBeUndefined()
    expect(linkDoSobedesce('http://outro.example/app/#drive/abc', cfg.base, 'pasta')).toBeUndefined()
    expect(linkDoSobedesce('https://golpe.example/app/#drive/abc', cfg.base, 'pasta')).toBeUndefined()

    respostas.set('/api/zro/drive/pasta', {
      status: 200,
      corpo: {
        pasta: { id: 'p1', nome: 'Motion', abrir_no_sobedesce: sd('drive', 'p1') },
        ordem: 'nome',
        arquivos: [
          { id: 's1', nome: 'Brutos', tipo: 'application/vnd.google-apps.folder', pasta: true, abrir_no_sobedesce: sd('drive', 's1') },
          { id: 'v1', nome: 'a.mov', tipo: 'video/quicktime', abrir_no_sobedesce: sd('arquivo', 'v1'), baixar_pelo_sobedesce: sd('baixar', 'v1') },
        ],
        mais: false,
      },
    })
    const p = JSON.parse((await driveParaIa(db, 'pessoa-1', { tipo: 'pasta', pasta: 'p1', ordem: 'nome' }, cfg)).texto)
    expect(p.pasta).toEqual({ nome: 'Motion', abrir_no_sobedesce: sd('drive', 'p1') })
    expect(p.itens[0]).toMatchObject({ nome: 'Brutos', abrir_no_sobedesce: sd('drive', 's1') })
    expect(p.itens[0].baixar_pelo_sobedesce).toBeUndefined()
    expect(p.itens[1]).toMatchObject({ abrir_no_sobedesce: sd('arquivo', 'v1'), baixar_pelo_sobedesce: sd('baixar', 'v1') })
  })

  it('versão pronta: entrega o Abrir e o Baixar dela; sem versão: só orienta a oferecer, sem pedir nada', async () => {
    respostas.set('/api/zro/drive/versao', {
      status: 200,
      corpo: {
        original: { nome: 'a.mov', tipo: 'video/quicktime' },
        versoes: [
          {
            id: 'v7',
            nome: 'a (MP4 720p).mp4',
            tipo: 'video/mp4',
            abrir_no_sobedesce: `${cfg.base}/app/#arquivo/v7`,
            baixar_pelo_sobedesce: `${cfg.base}/app/#baixar/v7`,
          },
        ],
        o_proprio: false,
      },
    })
    const pronta = JSON.parse((await driveParaIa(db, 'p', { tipo: 'versao', arquivoId: 'v1', formato: 'mp4-720' }, cfg)).texto)
    expect(pronta.versao_pronta[0]).toMatchObject({ abrir_no_sobedesce: `${cfg.base}/app/#arquivo/v7`, baixar_pelo_sobedesce: `${cfg.base}/app/#baixar/v7` })
    expect(pronta.dica).toMatch(/Abrir e o Baixar/)
    respostas.set('/api/zro/drive/versao', {
      status: 200,
      corpo: {
        original: { nome: 'a.mov', tipo: 'video/quicktime', video: { largura: 3840, altura: 2160, duracao_s: 10 } },
        versoes: [],
        o_proprio: false,
        converte: true,
        computadores: [{ nome: 'Mac', aberto_agora: true }],
      },
    })
    const sem = JSON.parse((await driveParaIa(db, 'p', { tipo: 'versao', arquivoId: 'v1', formato: 'mp4-720' }, cfg)).texto)
    expect(sem.versao_pronta).toBeNull()
    expect(sem.original.resolucao).toBe('3840×2160')
    expect(sem.dica).toMatch(/pergunte/)
    expect(pedidos.filter((p) => p.caminho === '/api/zro/drive/computador')).toHaveLength(0)
  })

  it('pedido ao computador: conta o status e onde acompanhar; sem computador, diz que não pediu', async () => {
    respostas.set('/api/zro/drive/computador', {
      status: 201,
      corpo: {
        pedido: { id: 'x', status: 'pendente', novo: true },
        original: { nome: 'a.mov' },
        formato: 'MP4 720p',
        computadores: [{ nome: 'Mac', aberto_agora: false, usado_ha_pouco: false }],
        destino: 'Na mesma pasta',
        acompanhar: 'https://sobedesce.com/app/#referencias',
      },
    })
    const r = JSON.parse((await driveParaIa(db, 'p', { tipo: 'computador', arquivoId: 'v1', formato: 'mp4-720' }, cfg)).texto)
    expect(r).toMatchObject({ pedido_feito: true, formato: 'MP4 720p', acompanhar: 'https://sobedesce.com/app/#referencias' })
    expect(r.quando).toMatch(/espera/)
    expect(pedidos.at(-1)!.claims!.zro_pedido).toBe('drive.computador')
    respostas.set('/api/zro/drive/computador', { status: 409, corpo: { erro: 'sem_computador' } })
    const s = await driveParaIa(db, 'p', { tipo: 'computador', arquivoId: 'v1', formato: 'mp4-720' }, cfg)
    expect(s.erro).toBe(true)
    expect(s.texto).toMatch(/Não diga que pediu/)
  })

  it('falhas viram frases com o link de onde resolver; fora do ar não inventa', async () => {
    respostas.set('/api/zro/drive/buscar', { status: 409, corpo: { erro: 'sem_drive' } })
    const r = await driveParaIa(db, 'pessoa-1', { tipo: 'buscar', termo: 'x' }, cfg)
    expect(r.erro).toBe(true)
    expect(r.texto).toContain(`${cfg.base}/conta`)
    respostas.set('/api/zro/drive/buscar', { status: 404, corpo: { erro: 'sem_vinculo' } })
    expect((await driveParaIa(db, 'pessoa-1', { tipo: 'buscar', termo: 'x' }, cfg)).texto).toMatch(/ainda não entrou no SOBEDESCE/)
    const fora = await driveParaIa(db, 'pessoa-1', { tipo: 'buscar', termo: 'x' }, { ...cfg, base: 'http://127.0.0.1:1' })
    expect(fora.erro).toBe(true)
    expect(fora.texto).toMatch(/Não invente arquivo/)
  })

  it('tipo e tamanho legíveis', () => {
    expect(tipoLegivel('application/vnd.google-apps.folder')).toBe('pasta')
    expect(tipoLegivel('video/mp4')).toBe('vídeo MP4')
    expect(tipoLegivel(null)).toBe('arquivo')
    expect(tamanhoLegivel(2048)).toBe('2,0 KB')
    expect(tamanhoLegivel(null)).toBeNull()
  })
})

describe('confirmação para pedir ao computador', () => {
  const oferta = { papel: 'assistant' as const, texto: 'Não tem em MP4 720p. Quer que eu peça ao seu computador para converter?' }
  it('aceita um sim claro logo depois da oferta', () => {
    for (const sim of ['Sim', 'sim, pode', 'Pode sim!', 'Quero', 'ok', 'pode mandar para o celular'])
      expect(confirmacaoClara([oferta, { papel: 'user', texto: sim }]), sim).toBe(true)
  })
  it('recusa negação, dúvida, pergunta nova ou sem a oferta antes', () => {
    for (const nao of ['não', 'sim, mas espera', 'acho que não', 'Qual o tamanho dele?', 'isso não'])
      expect(confirmacaoClara([oferta, { papel: 'user', texto: nao }]), nao).toBe(false)
    expect(
      confirmacaoClara([
        { papel: 'assistant', texto: 'Achei o arquivo.' },
        { papel: 'user', texto: 'sim' },
      ]),
    ).toBe(false)
    expect(confirmacaoClara([{ papel: 'user', texto: 'sim' }])).toBe(false)
  })
})
