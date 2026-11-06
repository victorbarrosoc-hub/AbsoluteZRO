// O passo "Espelho em São Paulo" dos workflows de app de computador (scripts/espelho-apps.mjs, ADR 0043): assinatura
// S3 v4 (os exemplos da documentação da AWS), a pasta pública, a limpeza dos builds antigos e o passo inteiro com um S3
// falso: sem secrets pula sem mexer em nada; SHA-256 errado no Release para antes de gravar `espelho` no versao.json.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assinar, configuracao, enderecoS3, espelhar, instaladoresDoVersao, lerLista, pastaPublica, sobras, tipoDe } from '../../scripts/espelho-apps.mjs'
import { pastaDoEspelho } from '../../apps/hub-web/lib/espelho'

// a chave de exemplo da documentação da AWS (não é de ninguém), montada em pedaços para o scan-secrets não confundir
const CHAVE = ['AK', 'IAIOSFODNN7EXAMPLE'].join('')
const SEGREDO = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
const VAZIO = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const DIA = new Date('2013-05-24T00:00:00Z')
const assinatura = (h: Record<string, string>) => /Signature=([0-9a-f]{64})$/.exec(h.authorization!)![1]

describe('assinatura S3 v4', () => {
  it('bate com os exemplos da AWS (GET com Range e listagem com query)', () => {
    const get = assinar({
      metodo: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      cabecalhos: { Range: 'bytes=0-9' },
      hashCorpo: VAZIO,
      chave: CHAVE,
      segredo: SEGREDO,
      regiao: 'us-east-1',
      agora: DIA,
    })
    expect(assinatura(get)).toBe('f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41')
    expect(get.authorization).toContain(`Credential=${CHAVE}/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,`)
    expect(get).not.toHaveProperty('host')
    const lista = assinar({
      metodo: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J',
      chave: CHAVE,
      segredo: SEGREDO,
      regiao: 'us-east-1',
      agora: DIA,
    })
    expect(assinatura(lista)).toBe('34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7')
  })
})

describe('configuração e pasta pública', () => {
  it('sem qualquer um dos três secrets: desligado', () => {
    expect(configuracao({})).toBeNull()
    expect(configuracao({ SUPABASE_STORAGE_S3_ENDPOINT: 'https://x', SUPABASE_STORAGE_S3_ACCESS_KEY_ID: 'a' })).toBeNull()
    expect(
      configuracao({ SUPABASE_STORAGE_S3_ENDPOINT: 'https://x/ ', SUPABASE_STORAGE_S3_ACCESS_KEY_ID: 'a', SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY: 'b' }),
    ).toEqual({ endpoint: 'https://x', chave: 'a', segredo: 'b', regiao: 'sa-east-1', bucket: 'apps' })
  })

  it('a pasta sai do endpoint S3 do projeto e tem exatamente a forma que o HUB aceita', () => {
    const p = pastaPublica('https://abcdefghijklmnopqrst.storage.supabase.co/storage/v1/s3', 'hub-desktop')
    expect(p).toBe('https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/apps/hub-desktop')
    expect(pastaDoEspelho(p)).toBe(p)
    expect(pastaPublica('https://abcdefghijklmnopqrst.supabase.co/storage/v1/s3', 't')).toContain('/apps/t')
    expect(pastaPublica('https://s3.amazonaws.com', 't')).toBeNull()
    expect(pastaPublica('http://abcdefghijklmnopqrst.storage.supabase.co/storage/v1/s3', 't')).toBeNull()
    expect(pastaPublica('https://abcdefghijklmnopqrst.storage.supabase.co/storage/v1/s3', '../x')).toBeNull()
  })

  it('versao.json: os dois instaladores com nome e SHA-256 conferidos; listagem e sobras', () => {
    expect(
      instaladoresDoVersao({ arquivoMac: 'A-1-b2-mac-universal.dmg', sha256Mac: 'A'.repeat(64), arquivoWindows: 'A.exe', sha256Windows: 'b'.repeat(64) }),
    ).toEqual([
      { nome: 'A-1-b2-mac-universal.dmg', sha256: 'a'.repeat(64) },
      { nome: 'A.exe', sha256: 'b'.repeat(64) },
    ])
    expect(() => instaladoresDoVersao({ arquivoMac: '../x.dmg', sha256Mac: 'a'.repeat(64) })).toThrow()
    expect(() => instaladoresDoVersao({ arquivoMac: 'x.dmg', sha256Mac: 'curto' })).toThrow()
    expect(() => instaladoresDoVersao({})).toThrow()
    expect(
      lerLista('<r><Contents><Key>t/a&amp;b.dmg</Key></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>tok</NextContinuationToken></r>'),
    ).toEqual({
      chaves: ['t/a&b.dmg'],
      proxima: 'tok',
    })
    expect(sobras(['t/velho.dmg', 't/novo.dmg', 't/versao.json', 'outra/x.dmg'], 't', ['novo.dmg', 'versao.json'])).toEqual(['t/velho.dmg'])
    expect(tipoDe('a.dmg')).toBe('application/x-apple-diskimage')
    expect(tipoDe('a.exe')).toBe('application/vnd.microsoft.portable-executable')
    expect(tipoDe('versao.json')).toBe('application/json')
    const c = configuracao({
      SUPABASE_STORAGE_S3_ENDPOINT: 'https://e/storage/v1/s3',
      SUPABASE_STORAGE_S3_ACCESS_KEY_ID: 'a',
      SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY: 'b',
    })!
    expect(enderecoS3(c, 'hub-desktop/A.dmg')).toBe('https://e/storage/v1/s3/apps/hub-desktop/A.dmg')
  })
})

describe('o passo inteiro, com um S3 falso', () => {
  const ENV = {
    SUPABASE_STORAGE_S3_ENDPOINT: 'https://abcdefghijklmnopqrst.storage.supabase.co/storage/v1/s3',
    SUPABASE_STORAGE_S3_ACCESS_KEY_ID: 'chave-falsa',
    SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY: 'segredo-falso',
  }
  const MAC = Buffer.from('dmg do build 9')
  const WIN = Buffer.from('exe do build 9')
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

  function montar(v: Record<string, unknown>) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'espelho-ci-'))
    const arquivo = path.join(dir, 'versao.json')
    fs.writeFileSync(arquivo, JSON.stringify(v))
    const pedidos: { metodo: string; url: string; tipo: string | null; cache: string | null; auth: string; corpo: string | null }[] = []
    const f = (async (input: string | URL | Request, init?: RequestInit) => {
      const h = init?.headers as Record<string, string>
      pedidos.push({
        metodo: init?.method ?? 'GET',
        url: String(input),
        tipo: h['content-type'] ?? null,
        cache: h['cache-control'] ?? null,
        auth: h.authorization ?? '',
        corpo: init?.body ? Buffer.from(init.body as Buffer).toString() : null,
      })
      if (init?.method === 'GET')
        return new Response(
          '<ListBucketResult><Contents><Key>t/X-1-b8-mac.dmg</Key></Contents><Contents><Key>t/X-1-b9-mac.dmg</Key></Contents><Contents><Key>t/versao.json</Key></Contents><IsTruncated>false</IsTruncated></ListBucketResult>',
        )
      return new Response(null, { status: 200 })
    }) as typeof fetch
    const baixarDoRelease = (_tag: string, nome: string, pasta: string) => fs.writeFileSync(path.join(pasta, nome), nome.endsWith('.dmg') ? MAC : WIN)
    return { arquivo, pedidos, f, baixarDoRelease }
  }
  const VERSAO = { build: 9, versao: '1.0.0', arquivoMac: 'X-1-b9-mac.dmg', sha256Mac: sha(MAC), arquivoWindows: 'X-1-b9-win.exe', sha256Windows: sha(WIN) }

  it('sem secrets: pula, nenhum pedido e o versao.json fica igual', async () => {
    const m = montar(VERSAO)
    expect(await espelhar({ tag: 't', versaoJson: m.arquivo, env: {}, f: m.f, baixarDoRelease: m.baixarDoRelease })).toEqual({ pulado: true })
    expect(m.pedidos).toEqual([])
    expect(JSON.parse(fs.readFileSync(m.arquivo, 'utf8'))).toEqual(VERSAO)
  })

  it('sobe os dois instaladores e o versao.json com `espelho`, apaga o build antigo', async () => {
    const m = montar(VERSAO)
    const r = await espelhar({ tag: 't', versaoJson: m.arquivo, env: ENV, f: m.f, baixarDoRelease: m.baixarDoRelease })
    const pasta = 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/apps/t'
    expect(r).toEqual({ pasta, arquivos: ['X-1-b9-mac.dmg', 'X-1-b9-win.exe'], apagados: ['t/X-1-b8-mac.dmg'] })
    const base = `${ENV.SUPABASE_STORAGE_S3_ENDPOINT}/apps/t`
    expect(m.pedidos.map((p) => `${p.metodo} ${p.url.replace(ENV.SUPABASE_STORAGE_S3_ENDPOINT, '')}`)).toEqual([
      'PUT /apps/t/X-1-b9-mac.dmg',
      'PUT /apps/t/X-1-b9-win.exe',
      'PUT /apps/t/versao.json',
      'GET /apps?list-type=2&prefix=t%2F',
      'DELETE /apps/t/X-1-b8-mac.dmg',
    ])
    expect(m.pedidos[0]).toMatchObject({ url: `${base}/X-1-b9-mac.dmg`, tipo: 'application/x-apple-diskimage', cache: 'public, max-age=31536000, immutable' })
    expect(m.pedidos[2]).toMatchObject({ tipo: 'application/json', cache: 'public, max-age=60' })
    expect(m.pedidos.every((p) => p.auth.startsWith('AWS4-HMAC-SHA256 Credential=chave-falsa/') && p.auth.includes('/sa-east-1/s3/aws4_request'))).toBe(true)
    // o versao.json ganhou só o campo `espelho`; os outros ficam
    const v = JSON.parse(fs.readFileSync(m.arquivo, 'utf8'))
    expect(v).toEqual({ ...VERSAO, espelho: pasta })
    expect(JSON.parse(m.pedidos[2]!.corpo!)).toEqual(v)
  })

  it('SHA-256 do Release diferente do versao.json: para antes de subir e não grava `espelho`', async () => {
    const m = montar({ ...VERSAO, sha256Windows: 'f'.repeat(64) })
    await expect(espelhar({ tag: 't', versaoJson: m.arquivo, env: ENV, f: m.f, baixarDoRelease: m.baixarDoRelease })).rejects.toThrow(/não bate/)
    expect(JSON.parse(fs.readFileSync(m.arquivo, 'utf8')).espelho).toBeUndefined()
    expect(m.pedidos.map((p) => p.url)).toEqual([`${ENV.SUPABASE_STORAGE_S3_ENDPOINT}/apps/t/X-1-b9-mac.dmg`])
  })

  it('endpoint que não é do Supabase: falha (o HUB não aceitaria a pasta)', async () => {
    const m = montar(VERSAO)
    await expect(
      espelhar({
        tag: 't',
        versaoJson: m.arquivo,
        env: { ...ENV, SUPABASE_STORAGE_S3_ENDPOINT: 'https://s3.amazonaws.com' },
        f: m.f,
        baixarDoRelease: m.baixarDoRelease,
      }),
    ).rejects.toThrow(/endpoint/)
    expect(m.pedidos).toEqual([])
  })
})
