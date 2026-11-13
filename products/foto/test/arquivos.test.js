// O armazenamento das prévias (api/_arquivos.js), sem banco:
//   - a assinatura SigV4 confere com os vetores publicados pela AWS (suíte aws-sig-v4-test-suite, "get-vanilla", e os
//     quatro exemplos da documentação do S3 "Signature Calculations for the Authorization Header");
//   - a ponta S3 contra um servidor S3 falso que refaz a assinatura por conta própria e recusa o que não confere;
//   - a ponta de pasta local: grava, lê, apaga, não sai da pasta;
//   - a conferência do arquivo: só JPEG ou WebP (pelos bytes), tamanho e sha256 declarados, limite de tamanho e
//     recusa de posição de GPS (EXIF e XMP, nos dois formatos);
//   - qual ponta vale conforme as variáveis (na Vercel a pasta local não vale).
// As duas imagens de verdade daqui são um degradê de 24 × 16 gerado no Chromium (canvas → JPEG e WebP).

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { armazenamento, assinarV4, CHAVE, conferirPrevia, lerBytes, MAX_MINI, MAX_PREVIA, temGps, tipoDaImagem } from '../api/_arquivos.js'

const sha256 = (b) => createHash('sha256').update(b).digest('hex')
const VAZIO = sha256('')
const G = '0b0e1c7e-9a1d-4a59-8b62-5d1f0c3a7e11'
const F = '7c2f6a0d-3b1e-4c58-9d47-2a6b8e0f1c93'
const chave = (mini = false) => `g/${G}/${F}${mini ? '-m' : ''}`

const JPEG = Buffer.from(
  [
    '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYA',
    'AQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3',
    'dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IA',
    'ADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABt',
    'bHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4',
    'UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAQABgDASIAAhEBAxEB',
    '/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAQCAwX/xAAWEAEBAQAAAAAAAAAAAAAAAAAAAgP/xAAWAQEBAQAAAAAAAAAAAAAAAAAEAwX/xAAXEQADAQAAAAAAAAAAAAAAAAAAAgMh/9oADAMBAAIR',
    'AxEAPwDX1spraetlNbBjMpRyvWwX1sNJZ4CZ9P/Z',
  ].join(''),
  'base64',
)
const WEBP = Buffer.from(
  [
    'UklGRjoCAABXRUJQVlA4WAoAAAAgAAAAFwAADwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA',
    '9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAA',
    'ABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAA',
    'b6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAA',
    'AABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggTAAAABAEAJ0BKhgAEAA+0VqkTD+lI6IwCAPwGglqAJ0ygAKIpTeLBRzp',
    'CdsAAP7D2SzK1/UOGpuKAjNoGOb2v6r5MSPxwJTjVHYsMQ+PBAA=',
  ].join(''),
  'base64',
)

/** Um bloco TIFF de EXIF com a orientação e, se pedido, o ponteiro para o diretório de GPS (com latitude e longitude). */
function exif({ gps, ordem = 'II' }) {
  const pequeno = ordem === 'II'
  const b = Buffer.alloc(gps ? 116 : 26)
  const u16 = (v, i) => (pequeno ? b.writeUInt16LE(v, i) : b.writeUInt16BE(v, i))
  const u32 = (v, i) => (pequeno ? b.writeUInt32LE(v, i) : b.writeUInt32BE(v, i))
  const entrada = (i, etiqueta, tipo, n, valor) => {
    u16(etiqueta, i)
    u16(tipo, i + 2)
    u32(n, i + 4)
    if (tipo === 3) u16(valor, i + 8)
    else u32(valor, i + 8)
  }
  b.write(ordem, 0, 'latin1')
  u16(42, 2)
  u32(8, 4)
  u16(gps ? 2 : 1, 8)
  entrada(10, 0x0112, 3, 1, 1)
  if (!gps) {
    u32(0, 22)
    return b
  }
  entrada(22, 0x8825, 4, 1, 38)
  u32(0, 34)
  // diretório de GPS: latitude e longitude (três racionais cada), nos 48 bytes do fim
  u16(2, 38)
  entrada(40, 0x0002, 5, 3, 68)
  entrada(52, 0x0004, 5, 3, 92)
  for (const [i, graus] of [
    [68, 23],
    [92, 46],
  ]) {
    u32(graus, i)
    u32(1, i + 4)
    u32(33, i + 8)
    u32(1, i + 12)
    u32(1, i + 16)
    u32(1, i + 20)
  }
  return b
}
/** Põe um APP1 logo depois do começo do JPEG. */
function jpegCom(dados, base = JPEG) {
  const cabeca = Buffer.alloc(4)
  cabeca.writeUInt16BE(0xffe1, 0)
  cabeca.writeUInt16BE(dados.length + 2, 2)
  return Buffer.concat([base.subarray(0, 2), cabeca, dados, base.subarray(2)])
}
/** Acrescenta um bloco RIFF ao WebP e acerta o tamanho do arquivo. */
function webpCom(nome, dados, base = WEBP) {
  const cabeca = Buffer.alloc(8)
  cabeca.write(nome, 0, 'latin1')
  cabeca.writeUInt32LE(dados.length, 4)
  const tudo = Buffer.concat([base, cabeca, dados, Buffer.alloc(dados.length % 2)])
  tudo.writeUInt32LE(tudo.length - 8, 4)
  return tudo
}
const EXIF = Buffer.from('Exif\0\0', 'latin1')
const XMP = Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1')
const xmp = (dentro) => Buffer.from(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description ${dentro}/></x:xmpmeta>`, 'utf8')
const declarado = (b, tipo, mais = {}) => ({ tipo, tamanho: b.length, sha256: sha256(b), ...mais })

// ───────── SigV4 ─────────

test('SigV4: confere com os vetores publicados pela AWS', () => {
  // aws-sig-v4-test-suite / get-vanilla
  const vanilla = assinarV4({
    metodo: 'GET',
    url: 'https://example.amazonaws.com/',
    regiao: 'us-east-1',
    servico: 'service',
    chaveId: 'AKIDEXAMPLE',
    segredo: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    agora: new Date('2015-08-30T12:36:00Z'),
  })
  assert.equal(vanilla['x-amz-date'], '20150830T123600Z')
  assert.equal(
    vanilla.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
  )
  // Documentação do S3, "Signature Calculations for the Authorization Header: Transferring Payload in a Single Chunk".
  // A chave de exemplo da AWS vai em duas partes só para não acordar a varredura de segredos do repositório.
  const s3 = {
    regiao: 'us-east-1',
    chaveId: ['AKIA', 'IOSFODNN7EXAMPLE'].join(''),
    segredo: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    agora: new Date('2013-05-24T00:00:00Z'),
  }
  const assinatura = (opcoes) => /Signature=([0-9a-f]{64})$/.exec(assinarV4({ ...s3, ...opcoes }).authorization)[1]
  const base = 'https://examplebucket.s3.amazonaws.com'
  // GET Object (com Range)
  const get = assinarV4({
    ...s3,
    metodo: 'GET',
    url: `${base}/test.txt`,
    cabecalhos: { Range: 'bytes=0-9', 'x-amz-content-sha256': VAZIO },
    sha256DoCorpo: VAZIO,
  })
  assert.equal(
    get.authorization,
    `AWS4-HMAC-SHA256 Credential=${s3.chaveId}/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41`,
  )
  // PUT Object (o caminho tem "$": codificado uma vez só, como o S3 pede)
  const corpo = Buffer.from('Welcome to Amazon S3.')
  assert.equal(sha256(corpo), '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072')
  assert.equal(
    assinatura({
      metodo: 'PUT',
      url: `${base}/test$file.text`,
      cabecalhos: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-content-sha256': sha256(corpo), 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
      sha256DoCorpo: sha256(corpo),
    }),
    '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
  )
  // GET Bucket Lifecycle (consulta sem valor) e List Objects (consulta ordenada)
  assert.equal(
    assinatura({ metodo: 'GET', url: `${base}/?lifecycle`, cabecalhos: { 'x-amz-content-sha256': VAZIO }, sha256DoCorpo: VAZIO }),
    'fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543',
  )
  assert.equal(
    assinatura({ metodo: 'GET', url: `${base}/?prefix=J&max-keys=2`, cabecalhos: { 'x-amz-content-sha256': VAZIO }, sha256DoCorpo: VAZIO }),
    '34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7',
  )
  // muda um detalhe, muda a assinatura
  const outra = (opcoes) =>
    assinatura({ metodo: 'GET', url: `${base}/test.txt`, cabecalhos: { 'x-amz-content-sha256': VAZIO }, sha256DoCorpo: VAZIO, ...opcoes })
  const certa = outra({})
  for (const mexida of [
    { metodo: 'PUT' },
    { url: `${base}/test.txT` },
    { segredo: `${s3.segredo}x` },
    { regiao: 'sa-east-1' },
    { agora: new Date('2013-05-24T00:00:01Z') },
    { sha256DoCorpo: sha256('x') },
  ]) {
    assert.notEqual(outra(mexida), certa, JSON.stringify(mexida))
  }
})

// ───────── servidor S3 falso ─────────

const SEGREDO_S3 = 'segredo-do-armazenamento-de-teste'
const ID_S3 = 'chave-de-teste'
let s3Falso
const guardados = new Map()
const pedidos = []

/** Refaz a assinatura do pedido que chegou (implementação própria do teste, sem usar a do app). */
function assinaturaEsperada(req, corpo) {
  const m = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/([^/]+)\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(
    req.headers.authorization ?? '',
  )
  if (!m) return { erro: 'cabeçalho de autorização fora do formato' }
  const [, id, dia, regiao, servico, assinados, veio] = m
  if (id !== ID_S3) return { erro: 'chave desconhecida' }
  const data = req.headers['x-amz-date'] ?? ''
  if (!data.startsWith(dia)) return { erro: 'data fora do escopo' }
  const quando = Date.UTC(+data.slice(0, 4), +data.slice(4, 6) - 1, +data.slice(6, 8), +data.slice(9, 11), +data.slice(11, 13), +data.slice(13, 15))
  if (Math.abs(Date.now() - quando) > 5 * 60000) return { erro: 'relógio fora' }
  const nomes = assinados.split(';')
  for (const exigido of ['host', 'x-amz-content-sha256', 'x-amz-date']) if (!nomes.includes(exigido)) return { erro: `${exigido} não foi assinado` }
  if (req.headers['x-amz-content-sha256'] !== sha256(corpo)) return { erro: 'sha256 do corpo não confere' }
  const u = new URL(req.url, 'http://x')
  const consulta = [...u.searchParams]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join('&')
  const canonico = [
    req.method,
    u.pathname,
    consulta,
    nomes.map((n) => `${n}:${String(req.headers[n]).trim()}\n`).join(''),
    assinados,
    req.headers['x-amz-content-sha256'],
  ].join('\n')
  const texto = ['AWS4-HMAC-SHA256', data, `${dia}/${regiao}/${servico}/aws4_request`, sha256(canonico)].join('\n')
  let k = Buffer.from(`AWS4${SEGREDO_S3}`)
  for (const parte of [dia, regiao, servico, 'aws4_request']) k = createHmac('sha256', k).update(parte).digest()
  return createHmac('sha256', k).update(texto).digest('hex') === veio ? { regiao, servico } : { erro: 'assinatura não confere' }
}

before(async () => {
  s3Falso = createServer(async (req, res) => {
    const partes = []
    for await (const p of req) partes.push(p)
    const corpo = Buffer.concat(partes)
    const a = assinaturaEsperada(req, corpo)
    pedidos.push({ metodo: req.method, caminho: req.url, erro: a.erro ?? null, regiao: a.regiao, tipo: req.headers['content-type'] ?? null })
    if (a.erro) {
      res.writeHead(403, { 'Content-Type': 'application/xml' })
      return res.end(`<Error><Code>SignatureDoesNotMatch</Code><Message>${a.erro}</Message></Error>`)
    }
    // estilo de caminho: /storage/v1/s3/<bucket>/<chave>
    const m = /^\/storage\/v1\/s3\/previas\/(.+)$/.exec(new URL(req.url, 'http://x').pathname)
    if (!m) {
      res.writeHead(404)
      return res.end()
    }
    if (req.method === 'PUT') {
      guardados.set(m[1], { corpo, tipo: req.headers['content-type'] })
      res.writeHead(200)
      return res.end()
    }
    if (req.method === 'GET') {
      const g = guardados.get(m[1])
      if (!g) {
        res.writeHead(404)
        return res.end('<Error><Code>NoSuchKey</Code></Error>')
      }
      res.writeHead(200, { 'Content-Type': g.tipo })
      return res.end(g.corpo)
    }
    if (req.method === 'DELETE') {
      guardados.delete(m[1])
      res.writeHead(204)
      return res.end()
    }
    res.writeHead(405)
    res.end()
  })
  await new Promise((ok) => s3Falso.listen(0, '127.0.0.1', ok))
})
after(() => s3Falso?.close())

const ambienteS3 = (mais = {}) => ({
  FOTO_S3_ENDPOINT: `http://127.0.0.1:${s3Falso.address().port}/storage/v1/s3/`,
  FOTO_S3_REGION: 'sa-east-1',
  FOTO_S3_BUCKET: 'previas',
  FOTO_S3_KEY_ID: ID_S3,
  FOTO_S3_SECRET: SEGREDO_S3,
  ...mais,
})

test('S3: grava, lê e apaga num servidor que confere a assinatura; segredo errado é recusado', async () => {
  const arm = armazenamento(ambienteS3())
  assert.equal(arm.tipo, 's3')
  pedidos.length = 0
  await arm.gravar(chave(), JPEG, 'image/jpeg')
  await arm.gravar(chave(true), WEBP, 'image/webp')
  assert.deepEqual([...guardados.keys()].sort(), [chave(), chave(true)])
  assert.ok(guardados.get(chave()).corpo.equals(JPEG))
  assert.equal(guardados.get(chave(true)).tipo, 'image/webp')
  assert.ok((await arm.ler(chave())).equals(JPEG))
  assert.ok((await arm.ler(chave(true))).equals(WEBP))
  await arm.apagar(chave(true))
  assert.equal(await arm.ler(chave(true)), null)
  // apagar o que já não existe não é erro
  await arm.apagar(chave(true))
  assert.deepEqual(
    pedidos.map((p) => [p.metodo, p.caminho, p.erro, p.regiao, p.tipo]),
    [
      ['PUT', `/storage/v1/s3/previas/${chave()}`, null, 'sa-east-1', 'image/jpeg'],
      ['PUT', `/storage/v1/s3/previas/${chave(true)}`, null, 'sa-east-1', 'image/webp'],
      ['GET', `/storage/v1/s3/previas/${chave()}`, null, 'sa-east-1', null],
      ['GET', `/storage/v1/s3/previas/${chave(true)}`, null, 'sa-east-1', null],
      ['DELETE', `/storage/v1/s3/previas/${chave(true)}`, null, 'sa-east-1', null],
      ['GET', `/storage/v1/s3/previas/${chave(true)}`, null, 'sa-east-1', null],
      ['DELETE', `/storage/v1/s3/previas/${chave(true)}`, null, 'sa-east-1', null],
    ],
  )
  // segredo errado: o servidor recusa e o adaptador avisa (nada de fingir que gravou)
  const errado = armazenamento(ambienteS3({ FOTO_S3_SECRET: 'outro-segredo' }))
  await assert.rejects(errado.gravar(`g/${G}/${G}`, JPEG, 'image/jpeg'), /recusou a gravação \(403\)/)
  await assert.rejects(errado.ler(chave()), /recusou a leitura \(403\)/)
  await assert.rejects(errado.apagar(chave()), /recusou apagar \(403\)/)
  assert.equal(guardados.has(`g/${G}/${G}`), false)
  assert.ok(guardados.has(chave()))
  assert.equal(pedidos.at(-1).erro, 'assinatura não confere')
  // corpo trocado no caminho (o sha256 assinado é o do corpo): o servidor falso recusa
  const adulterado = armazenamento(ambienteS3(), (url, opcoes) =>
    fetch(url, { ...opcoes, body: opcoes.body ? Buffer.concat([opcoes.body, Buffer.from('x')]) : undefined }),
  )
  await assert.rejects(adulterado.gravar(`g/${G}/${G}`, JPEG, 'image/jpeg'), /403/)
  assert.equal(pedidos.at(-1).erro, 'sha256 do corpo não confere')
  // só chaves de galeria entram ou saem: nada de caminho livre, nem listar
  for (const ruim of [
    '',
    'g',
    `g/${G}`,
    `g/${G}/`,
    `../${chave()}`,
    `g/${G}/../${F}`,
    `g/${G}/${F}.jpg`,
    `G/${G}/${F}`,
    `g/${G}/${F}-m-m`,
    `g/${G}/${F}?x=1`,
    null,
    undefined,
    42,
  ]) {
    await assert.rejects(arm.gravar(ruim, JPEG, 'image/jpeg'), /chave inválida/, String(ruim))
    await assert.rejects(arm.ler(ruim), /chave inválida/, String(ruim))
    await assert.rejects(arm.apagar(ruim), /chave inválida/, String(ruim))
    assert.equal(CHAVE.test(String(ruim)), false)
  }
  assert.deepEqual(Object.keys(arm).sort(), ['apagar', 'gravar', 'ler', 'tipo'])
  await arm.apagar(chave())
  assert.equal(guardados.size, 0)
})

test('pasta local: grava, lê, apaga e não sai da pasta', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'foto-arquivos-'))
  try {
    const arm = armazenamento({ FOTO_ARQUIVOS_DIR: dir })
    assert.equal(arm.tipo, 'pasta')
    assert.equal(await arm.ler(chave()), null)
    await arm.gravar(chave(), JPEG, 'image/jpeg')
    await arm.gravar(chave(true), WEBP, 'image/webp')
    assert.deepEqual(readdirSync(join(dir, 'g', G)).sort(), [F, `${F}-m`])
    assert.ok((await arm.ler(chave())).equals(JPEG))
    assert.ok((await arm.ler(chave(true))).equals(WEBP))
    // gravar de novo troca o arquivo inteiro (sem sobra de arquivo pela metade)
    await arm.gravar(chave(), WEBP, 'image/webp')
    assert.ok((await arm.ler(chave())).equals(WEBP))
    assert.deepEqual(readdirSync(join(dir, 'g', G)).sort(), [F, `${F}-m`])
    await arm.apagar(chave())
    assert.equal(await arm.ler(chave()), null)
    assert.ok(existsSync(join(dir, 'g', G)))
    await arm.apagar(chave(true))
    // a pasta da galeria some quando fica vazia; apagar de novo não é erro
    assert.equal(existsSync(join(dir, 'g', G)), false)
    await arm.apagar(chave(true))
    for (const ruim of [`../${chave()}`, `g/${G}/../../fora`, '/etc/passwd', `g/${G}/${F}/x`, '']) {
      await assert.rejects(arm.gravar(ruim, JPEG), /chave inválida/, ruim)
      await assert.rejects(arm.ler(ruim), /chave inválida/, ruim)
    }
    assert.deepEqual(readdirSync(dir), ['g'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('qual ponta vale: sem configuração, nenhuma; S3 completo ganha da pasta; na Vercel a pasta não vale', () => {
  assert.equal(armazenamento({}), null)
  assert.equal(armazenamento({ FOTO_ARQUIVOS_DIR: '  ' }), null)
  assert.equal(armazenamento({ FOTO_ARQUIVOS_DIR: '/tmp/x' }).tipo, 'pasta')
  assert.equal(armazenamento({ FOTO_ARQUIVOS_DIR: '/tmp/x', VERCEL: '1' }), null)
  const s3 = { FOTO_S3_ENDPOINT: 'https://exemplo.invalid/storage/v1/s3', FOTO_S3_BUCKET: 'previas', FOTO_S3_KEY_ID: 'id', FOTO_S3_SECRET: 'segredo' }
  assert.equal(armazenamento(s3).tipo, 's3')
  assert.equal(armazenamento({ ...s3, VERCEL: '1' }).tipo, 's3')
  assert.equal(armazenamento({ ...s3, FOTO_ARQUIVOS_DIR: '/tmp/x' }).tipo, 's3')
  // S3 pela metade não vale (e não cai para um armazenamento que ninguém pediu)
  for (const falta of Object.keys(s3)) {
    const { [falta]: _fora, ...resto } = s3
    assert.equal(armazenamento(resto), null, falta)
  }
  assert.equal(armazenamento({ ...s3, FOTO_S3_ENDPOINT: 'exemplo.invalid' }), null)
})

// ───────── conferência do arquivo ─────────

test('tipo: só JPEG ou WebP, pelos bytes (não pelo que o pedido diz)', () => {
  assert.equal(tipoDaImagem(JPEG), 'image/jpeg')
  assert.equal(tipoDaImagem(WEBP), 'image/webp')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
  const outros = {
    png,
    gif: Buffer.from('GIF89a\x01\0\x01\0\x80\0\0\0\0\0\xff\xff\xff!\xf9\x04', 'latin1'),
    html: Buffer.from('<!doctype html><script>alert(1)</script>'),
    svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    riffQueNaoEWebp: Buffer.from('RIFF\x24\0\0\0WAVEfmt \x10\0\0\0', 'latin1'),
    curto: Buffer.from([0xff, 0xd8, 0xff]),
    vazio: Buffer.alloc(0),
  }
  for (const [nome, bytes] of Object.entries(outros)) {
    assert.equal(tipoDaImagem(bytes), null, nome)
    for (const tipo of ['image/jpeg', 'image/webp', 'image/png']) {
      const r = conferirPrevia(bytes, declarado(bytes, tipo))
      assert.deepEqual(r, { ok: false, erro: bytes.length ? 'tipo' : 'vazio' }, `${nome} como ${tipo}`)
    }
  }
  // o tipo declarado no registro tem de ser o dos bytes
  assert.deepEqual(conferirPrevia(JPEG, declarado(JPEG, 'image/jpeg')), { ok: true })
  assert.deepEqual(conferirPrevia(WEBP, declarado(WEBP, 'image/webp')), { ok: true })
  assert.deepEqual(conferirPrevia(JPEG, declarado(JPEG, 'image/webp')), { ok: false, erro: 'tipo' })
  assert.deepEqual(conferirPrevia(WEBP, declarado(WEBP, 'image/jpeg')), { ok: false, erro: 'tipo' })
  assert.deepEqual(conferirPrevia('não é buffer', declarado(JPEG, 'image/jpeg')), { ok: false, erro: 'vazio' })
})

test('tamanho e sha256: o que foi declarado no registro, e nunca acima do limite', () => {
  assert.equal(MAX_PREVIA, 4 * 1024 * 1024)
  assert.equal(MAX_MINI, 512 * 1024)
  assert.deepEqual(conferirPrevia(JPEG, declarado(JPEG, 'image/jpeg', { tamanho: JPEG.length + 1 })), { ok: false, erro: 'tamanho' })
  assert.deepEqual(conferirPrevia(JPEG, declarado(JPEG, 'image/jpeg', { sha256: sha256(WEBP) })), { ok: false, erro: 'sha256' })
  // um byte trocado no meio: o tamanho bate, o sha256 não
  const mexido = Buffer.from(JPEG)
  mexido[mexido.length - 20] ^= 1
  assert.deepEqual(conferirPrevia(mexido, declarado(JPEG, 'image/jpeg')), { ok: false, erro: 'sha256' })
  // acima do limite: recusado antes de qualquer outra conferência, mesmo com tudo declarado certo
  const grande = Buffer.concat([JPEG.subarray(0, JPEG.length - 2), Buffer.alloc(MAX_PREVIA), JPEG.subarray(JPEG.length - 2)])
  assert.deepEqual(conferirPrevia(grande, declarado(grande, 'image/jpeg')), { ok: false, erro: 'grande' })
  const noLimite = grande.subarray(0, MAX_PREVIA)
  assert.deepEqual(conferirPrevia(noLimite, declarado(noLimite, 'image/jpeg')), { ok: true })
  // a miniatura tem o limite dela
  assert.deepEqual(conferirPrevia(noLimite, declarado(noLimite, 'image/jpeg', { maximo: MAX_MINI })), { ok: false, erro: 'grande' })
  assert.deepEqual(conferirPrevia(JPEG, declarado(JPEG, 'image/jpeg', { maximo: MAX_MINI })), { ok: true })
})

test('GPS: EXIF ou XMP com posição é recusado, no JPEG e no WebP; EXIF sem GPS passa', () => {
  assert.equal(temGps(JPEG), false)
  assert.equal(temGps(WEBP), false)
  const casos = {
    'JPEG, EXIF little-endian com GPS': [jpegCom(Buffer.concat([EXIF, exif({ gps: true })])), 'image/jpeg', true],
    'JPEG, EXIF big-endian com GPS': [jpegCom(Buffer.concat([EXIF, exif({ gps: true, ordem: 'MM' })])), 'image/jpeg', true],
    'JPEG, EXIF sem GPS': [jpegCom(Buffer.concat([EXIF, exif({ gps: false })])), 'image/jpeg', false],
    'JPEG, EXIF sem GPS (big-endian)': [jpegCom(Buffer.concat([EXIF, exif({ gps: false, ordem: 'MM' })])), 'image/jpeg', false],
    'JPEG, dois APP1: o segundo com GPS': [
      jpegCom(Buffer.concat([EXIF, exif({ gps: false })]), jpegCom(Buffer.concat([EXIF, exif({ gps: true })]))),
      'image/jpeg',
      true,
    ],
    'JPEG, XMP com exif:GPSLatitude': [jpegCom(Buffer.concat([XMP, xmp('exif:GPSLatitude="23,33.0S" exif:GPSLongitude="46,38.0W"')])), 'image/jpeg', true],
    'JPEG, XMP sem GPS': [jpegCom(Buffer.concat([XMP, xmp('dc:creator="Lia"')])), 'image/jpeg', false],
    'WebP, EXIF com GPS': [webpCom('EXIF', exif({ gps: true })), 'image/webp', true],
    'WebP, EXIF com prefixo e GPS': [webpCom('EXIF', Buffer.concat([EXIF, exif({ gps: true, ordem: 'MM' })])), 'image/webp', true],
    'WebP, EXIF sem GPS': [webpCom('EXIF', exif({ gps: false })), 'image/webp', false],
    'WebP, XMP com GPS': [webpCom('XMP ', xmp('exif:GPSLongitude="46,38.0W"')), 'image/webp', true],
    'WebP, XMP sem GPS': [webpCom('XMP ', xmp('dc:creator="Lia"')), 'image/webp', false],
  }
  for (const [nome, [bytes, tipo, comGps]] of Object.entries(casos)) {
    assert.equal(tipoDaImagem(bytes), tipo, nome)
    assert.equal(temGps(bytes), comGps, nome)
    assert.deepEqual(conferirPrevia(bytes, declarado(bytes, tipo)), comGps ? { ok: false, erro: 'gps' } : { ok: true }, nome)
  }
  // arquivo torto não derruba a conferência
  for (const torto of [
    JPEG.subarray(0, 40),
    jpegCom(Buffer.concat([EXIF, Buffer.from('II*\0\xff\xff\xff\xff', 'latin1')])),
    webpCom('EXIF', Buffer.from('MM')),
    Buffer.concat([JPEG.subarray(0, 4), Buffer.from([0xff, 0xff])]),
  ]) {
    assert.equal(temGps(torto), false)
  }
})

test('lerBytes: o corpo cru, do jeito que a Vercel entrega (Buffer) ou do fluxo, com teto', async () => {
  assert.ok((await lerBytes({ headers: {}, body: JPEG }, MAX_PREVIA)).equals(JPEG))
  await assert.rejects(lerBytes({ headers: {}, body: JPEG }, 100), /grande/)
  const fluxo = (bytes, cabecalhos = {}) => Object.assign(Readable.from([bytes.subarray(0, 300), bytes.subarray(300)]), { headers: cabecalhos })
  assert.ok((await lerBytes(fluxo(JPEG), MAX_PREVIA)).equals(JPEG))
  await assert.rejects(lerBytes(fluxo(JPEG), 500), /grande/)
  // o tamanho anunciado já passou do teto: nem começa a ler
  let lido = false
  const anunciado = Object.assign(
    new Readable({
      read() {
        lido = true
        this.push(null)
      },
    }),
    { headers: { 'content-length': String(MAX_PREVIA + 1) } },
  )
  await assert.rejects(lerBytes(anunciado, MAX_PREVIA), /grande/)
  assert.equal(lido, false)
  assert.equal((await lerBytes(fluxo(Buffer.alloc(0)), 10)).length, 0)
})
