// Prévia embutida e EXIF em JS puro: arquivos mínimos fabricados em cada formato (DNG, CR2, NEF, ARW/PEF, RW2, ORF,
// RAF, CR3, JPEG, TIFF), leitura parcial e, com as amostras CC0, as medidas da pesquisa e a miniatura do LibRaw.

import test from 'node:test'
import assert from 'node:assert/strict'

import { extrairPrevia, extrairPreviaDe, listarPrevias, cabecalhoJpeg } from '../src/raw/previa.js'
import { lerExif, lerCamera, criarFonte } from '../src/raw/exif.js'
import {
  jpegFalso,
  montarTiff,
  montarCr3,
  codificarJpegSemPerdas,
  juntar,
  acaso,
  carregarLibRaw,
  precisaDoLibRaw,
  precisaDeAmostras,
  lerAmostra,
  AMOSTRAS,
} from './apoio-raw.js'

const iguais = (a, b) => a.length === b.length && Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength))
const medidas = (r) => (r && r.jpeg ? [r.largura, r.altura] : r)
const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0))

// EXIF de teste: as tags do IFD Exif, com valores que os testes conferem um a um
const EXIF = [
  [0x829a, 5, [[1, 250]]],
  [0x829d, 5, [[28, 10]]],
  [0x8827, 3, 400],
  [0x9003, 2, '2026:11:13 09:41:07'],
  [0x9291, 2, '37'],
  [0x920a, 5, [[35, 1]]],
  [0xa434, 2, 'ZRO 35mm f/1.4'],
]
const ESPERADO = { data: '2026-11-13T09:41:07', subsegundo: 0.37, iso: 400, tempo: 1 / 250, abertura: 2.8, focal: 35, lente: 'ZRO 35mm f/1.4' }

const sensorSemPerdas = () =>
  codificarJpegSemPerdas(
    Uint16Array.from({ length: 64 * 32 }, (_, i) => i % 4096),
    { colunas: 32, linhas: 32, componentes: 2, bits: 12 },
  )

test('DNG: a maior prévia entre o IFD0 e os SubIFDs; o mosaico em JPEG lossless não é prévia', () => {
  const pequena = jpegFalso({ largura: 256, altura: 171, semente: 1 })
  const media = jpegFalso({ largura: 1024, altura: 683, corpo: 20000, semente: 2 })
  const grande = jpegFalso({ largura: 4000, altura: 3000, corpo: 90000, semente: 3 })
  const strip = (nome, l, a) => [
    [0x00fe, 4, 1],
    [0x0100, 4, l],
    [0x0101, 4, a],
    [0x0103, 3, 7],
    [0x0106, 3, 6],
    [0x0111, 4, { pos: nome }],
    [0x0117, 4, { tam: nome }],
  ]
  const { bytes } = montarTiff({
    blocos: [
      {
        nome: 'ifd0',
        ifd: [
          ...strip('pequena', 256, 171),
          [0x010f, 2, 'ZRO'],
          [0x0110, 2, 'Camera Um'],
          [0x0112, 3, 6],
          [0x014a, 4, [{ pos: 'cru' }, { pos: 'sub1' }, { pos: 'sub2' }]],
          [0x8769, 4, { pos: 'exif' }],
          [0xc612, 1, Uint8Array.of(1, 4, 0, 0)],
        ],
      },
      { nome: 'exif', ifd: EXIF },
      {
        nome: 'cru',
        ifd: [
          [0x00fe, 4, 0],
          [0x0100, 4, 64],
          [0x0101, 4, 32],
          [0x0103, 3, 7],
          [0x0106, 3, 32803],
          [0x0111, 4, { pos: 'sensor' }],
          [0x0117, 4, { tam: 'sensor' }],
          [0x828e, 1, Uint8Array.of(0, 1, 1, 2)],
        ],
      },
      { nome: 'sub1', ifd: strip('media', 1024, 683) },
      { nome: 'sub2', ifd: strip('grande', 4000, 3000) },
      { nome: 'pequena', bytes: pequena },
      { nome: 'media', bytes: media },
      { nome: 'sensor', bytes: juntar([sensorSemPerdas(), new Uint8Array(200000)]) },
      { nome: 'grande', bytes: grande },
    ],
  })
  const r = extrairPrevia(bytes)
  assert.deepEqual(medidas(r), [4000, 3000])
  assert.ok(iguais(r.jpeg, grande))
  assert.equal(r.jpeg.buffer, bytes.buffer, 'vista sobre o arquivo, sem cópia')
  assert.deepEqual(
    listarPrevias(bytes).map((c) => [c.largura, c.altura]),
    [
      [4000, 3000],
      [1024, 683],
      [256, 171],
    ],
  )
  assert.deepEqual(medidas(extrairPrevia(bytes, { lado: 1000 })), [1024, 683], 'a menor que tem pelo menos 1000 px')
  assert.deepEqual(medidas(extrairPrevia(bytes, { lado: 5000 })), [4000, 3000], 'nenhuma chega: fica a maior')
  assert.deepEqual(lerExif(bytes), { ...ESPERADO, orientacao: 6 })
  assert.deepEqual(lerCamera(bytes), { fabricante: 'ZRO', modelo: 'Camera Um' })
})

test('CR2: tira JPEG do IFD0 e miniatura do IFD1; RGB sem compressão e fatias lossless ficam de fora', () => {
  const inteira = jpegFalso({ largura: 1728, altura: 1152, corpo: 30000, semente: 4 })
  const miniatura = jpegFalso({ largura: 160, altura: 120, corpo: 900, semente: 5 })
  const { bytes } = montarTiff({
    blocos: [
      {
        nome: 'ifd0',
        ifd: [
          [0x0100, 4, 1728],
          [0x0101, 4, 1152],
          [0x0103, 3, 6],
          [0x010f, 2, 'Canon'],
          [0x0110, 2, 'Canon EOS Teste'],
          [0x0111, 4, { pos: 'inteira' }],
          [0x0117, 4, { tam: 'inteira' }],
          [0x8769, 4, { pos: 'exif' }],
        ],
        proximo: 'ifd1',
      },
      { nome: 'exif', ifd: EXIF },
      {
        nome: 'ifd1',
        ifd: [
          [0x0201, 4, { pos: 'miniatura' }],
          [0x0202, 4, { tam: 'miniatura' }],
        ],
        proximo: 'ifd2',
      },
      {
        nome: 'ifd2',
        ifd: [
          [0x0100, 4, 96],
          [0x0101, 4, 64],
          [0x0103, 3, 6],
          [0x0106, 3, 2],
          [0x0111, 4, { pos: 'rgb' }],
          [0x0115, 3, 3],
          [0x0117, 4, { tam: 'rgb' }],
        ],
        proximo: 'ifd3',
      },
      {
        nome: 'ifd3',
        ifd: [
          [0x0103, 3, 6],
          [0x0111, 4, { pos: 'sensor' }],
          [0x0117, 4, { tam: 'sensor' }],
          [0xc640, 3, [1, 2, 3]],
        ],
      },
      { nome: 'miniatura', bytes: miniatura },
      { nome: 'inteira', bytes: inteira },
      { nome: 'rgb', bytes: new Uint8Array(96 * 64 * 3).fill(0x80) },
      { nome: 'sensor', bytes: juntar([sensorSemPerdas(), new Uint8Array(60000)]) },
    ],
  })
  assert.deepEqual(
    listarPrevias(bytes).map((c) => [c.largura, c.altura]),
    [
      [1728, 1152],
      [160, 120],
    ],
  )
  assert.ok(iguais(extrairPrevia(bytes).jpeg, inteira))
})

/** Marcas do fabricante embutidas no IFD Exif: o valor da tag 0x927C é o próprio bloco (tipo 7). */
const comMarcas = (marcas, extras = []) => [...extras, [0x927c, 7, marcas]]

test('CR2 e Canon: a lente vem das marcas do fabricante (tag 0x0095)', () => {
  // as marcas da Canon são um diretório com posições contadas do começo do arquivo: monta em duas voltas para
  // saber onde o bloco vai cair
  const montar = (posDasMarcas) => {
    const texto = 'EF24-70mm f/2.8L II USM'
    const marcas = new Uint8Array(2 + 12 + 4 + texto.length + 1)
    const v = new DataView(marcas.buffer)
    v.setUint16(0, 1, true)
    v.setUint16(2, 0x0095, true)
    v.setUint16(4, 2, true)
    v.setUint32(6, texto.length + 1, true)
    v.setUint32(10, posDasMarcas + 18, true)
    marcas.set(ascii(texto), 18)
    return montarTiff({
      blocos: [
        {
          nome: 'ifd0',
          ifd: [
            [0x010f, 2, 'Canon'],
            [0x0110, 2, 'Canon EOS Teste'],
            [0x8769, 4, { pos: 'exif' }],
          ],
        },
        {
          nome: 'exif',
          ifd: comMarcas(
            marcas,
            EXIF.filter(([tag]) => tag !== 0xa434),
          ),
        },
      ],
    })
  }
  const primeira = montar(0)
  // posição do valor da tag 0x927C: depois do diretório Exif e dos valores externos das tags menores
  const v = new DataView(primeira.bytes.buffer)
  const exif = primeira.pos.exif
  const n = v.getUint16(exif, true)
  let posDasMarcas = 0
  for (let i = 0; i < n; i++) if (v.getUint16(exif + 2 + i * 12, true) === 0x927c) posDasMarcas = v.getUint32(exif + 2 + i * 12 + 8, true)
  const { bytes } = montar(posDasMarcas)
  assert.deepEqual(lerExif(bytes), { ...ESPERADO, lente: 'EF24-70mm f/2.8L II USM', orientacao: 1 })
})

test('NEF: prévia no SubIFD e nas marcas da Nikon (PreviewIFD); ISO e lente também vêm das marcas', () => {
  const inteira = jpegFalso({ largura: 3008, altura: 2000, corpo: 40000, semente: 6 })
  const menor = jpegFalso({ largura: 570, altura: 375, corpo: 9000, semente: 7 })
  // marcas da Nikon: 'Nikon\0' + versão + bloco TIFF próprio (big-endian), com posições contadas dele
  const interno = montarTiff({
    le: false,
    blocos: [
      {
        nome: 'ifd',
        ifd: [
          [0x0002, 3, [0, 200]],
          [0x0011, 4, { pos: 'previa' }],
          [
            0x0084,
            5,
            [
              [18, 1],
              [70, 1],
              [35, 10],
              [45, 10],
            ],
          ],
        ],
      },
      {
        nome: 'previa',
        ifd: [
          [0x0103, 3, 6],
          [0x0201, 4, { pos: 'jpeg' }],
          [0x0202, 4, { tam: 'jpeg' }],
        ],
      },
      { nome: 'jpeg', bytes: menor },
    ],
  }).bytes
  const marcas = juntar([ascii('Nikon\0'), [2, 0x10, 0, 0], interno])
  const { bytes } = montarTiff({
    le: false,
    blocos: [
      {
        nome: 'ifd0',
        ifd: [
          [0x00fe, 4, 1],
          [0x0100, 4, 160],
          [0x0101, 4, 120],
          [0x0103, 3, 1],
          [0x0106, 3, 2],
          [0x010f, 2, 'NIKON CORPORATION'],
          [0x0110, 2, 'NIKON D70s'],
          [0x0111, 4, { pos: 'rgb' }],
          [0x0112, 3, 8],
          [0x0115, 3, 3],
          [0x0117, 4, { tam: 'rgb' }],
          [0x014a, 4, [{ pos: 'sub0' }, { pos: 'sub1' }]],
          [0x8769, 4, { pos: 'exif' }],
        ],
      },
      // sem ISO nem lente no Exif comum, como na D70s
      {
        nome: 'exif',
        ifd: comMarcas(
          marcas,
          EXIF.filter(([tag]) => tag !== 0x8827 && tag !== 0xa434),
        ),
      },
      {
        nome: 'sub0',
        ifd: [
          [0x00fe, 4, 1],
          [0x0103, 3, 6],
          [0x0201, 4, { pos: 'inteira' }],
          [0x0202, 4, { tam: 'inteira' }],
        ],
      },
      {
        nome: 'sub1',
        ifd: [
          [0x00fe, 4, 0],
          [0x0100, 4, 3040],
          [0x0101, 4, 2014],
          [0x0103, 3, 34713],
          [0x0106, 3, 32803],
          [0x0111, 4, { pos: 'sensor' }],
          [0x0117, 4, { tam: 'sensor' }],
          [0x828e, 1, Uint8Array.of(2, 1, 1, 0)],
        ],
      },
      { nome: 'rgb', bytes: new Uint8Array(160 * 120 * 3) },
      { nome: 'inteira', bytes: inteira },
      { nome: 'sensor', bytes: new Uint8Array(50000).fill(0x5a) },
    ],
  })
  assert.deepEqual(
    listarPrevias(bytes).map((c) => [c.largura, c.altura]),
    [
      [3008, 2000],
      [570, 375],
    ],
  )
  assert.ok(iguais(extrairPrevia(bytes).jpeg, inteira))
  assert.deepEqual(lerExif(bytes), { ...ESPERADO, iso: 200, lente: '18-70mm f/3.5-4.5', orientacao: 8 })
})

/** ARW/PEF de teste: prévia média no IFD0, miniatura no IFD1 e a do tamanho inteiro num IFD2 lá no fim do arquivo. */
function arquivoComPreviaNoFim() {
  const media = jpegFalso({ largura: 1616, altura: 1080, corpo: 30000, semente: 8 })
  const miniatura = jpegFalso({ largura: 160, altura: 120, corpo: 900, semente: 9 })
  const inteira = jpegFalso({ largura: 6000, altura: 4000, corpo: 400000, semente: 10 })
  const rng = acaso(77)
  const sensor = Uint8Array.from({ length: 1500000 }, () => Math.floor(rng.u() * 256)) // com FF D8 ao acaso lá dentro
  const { bytes, pos } = montarTiff({
    blocos: [
      {
        nome: 'ifd0',
        ifd: [
          [0x00fe, 4, 1],
          [0x0103, 3, 6],
          [0x010f, 2, 'SONY'],
          [0x0110, 2, 'ILCE-Teste'],
          [0x014a, 4, { pos: 'cru' }],
          [0x0201, 4, { pos: 'media' }],
          [0x0202, 4, { tam: 'media' }],
          [0x8769, 4, { pos: 'exif' }],
        ],
        proximo: 'ifd1',
      },
      { nome: 'exif', ifd: [...EXIF.filter(([tag]) => tag !== 0xa434), [0xa434, 2, '----']] },
      {
        nome: 'ifd1',
        ifd: [
          [0x00fe, 4, 1],
          [0x0201, 4, { pos: 'miniatura' }],
          [0x0202, 4, { tam: 'miniatura' }],
        ],
        proximo: 'ifd2',
      },
      {
        nome: 'cru',
        ifd: [
          [0x00fe, 4, 0],
          [0x0100, 4, 6048],
          [0x0101, 4, 4024],
          [0x0103, 3, 32767],
          [0x0106, 3, 32803],
          [0x0111, 4, { pos: 'sensor' }],
          [0x0117, 4, { tam: 'sensor' }],
          [0x828e, 1, Uint8Array.of(0, 1, 1, 2)],
        ],
      },
      { nome: 'miniatura', bytes: miniatura },
      { nome: 'media', bytes: media },
      { nome: 'sensor', bytes: sensor },
      {
        nome: 'ifd2',
        ifd: [
          [0x00fe, 4, 1],
          [0x0100, 4, 6000],
          [0x0101, 4, 4000],
          [0x0103, 3, 7],
          [0x0106, 3, 6],
          [0x0201, 4, { pos: 'inteira' }],
          [0x0202, 4, { tam: 'inteira' }],
        ],
      },
      { nome: 'inteira', bytes: inteira },
    ],
  })
  return { bytes, pos, media, inteira }
}

test('ARW e PEF: cadeia de diretórios com a prévia grande no fim do arquivo', () => {
  const { bytes, media, inteira } = arquivoComPreviaNoFim()
  assert.deepEqual(
    listarPrevias(bytes).map((c) => [c.largura, c.altura]),
    [
      [6000, 4000],
      [1616, 1080],
      [160, 120],
    ],
  )
  assert.ok(iguais(extrairPrevia(bytes).jpeg, inteira))
  assert.ok(iguais(extrairPrevia(bytes, { lado: 1024 }).jpeg, media))
  const exif = lerExif(bytes)
  assert.equal(exif.lente, undefined, "lente '----' da Sony não é lente")
  assert.equal(exif.iso, 400)
})

test('leitura parcial: só o começo do arquivo, e o pedido exato do que falta', async () => {
  const { bytes, pos, media, inteira } = arquivoComPreviaNoFim()
  const total = bytes.length
  const cabeca = bytes.slice(0, 64 * 1024) // cópia: prova que nada é lido além dela

  // 1) com a prévia média já na cabeça e lado = 1024, resolve sem pedir mais nada
  const r1 = extrairPrevia(cabeca, { total, lado: 1024 })
  assert.ok(iguais(r1.jpeg, media))

  // 2) a maior: primeiro falta o diretório do fim (estrutura), depois o JPEG exato
  const p1 = extrairPrevia(cabeca, { total })
  assert.equal(p1.jpeg, null)
  assert.equal(p1.precisa.inicio, pos.ifd2)
  assert.ok(p1.precisa.fim <= total && p1.precisa.fim - p1.precisa.inicio <= 65536)
  const t1 = { inicio: p1.precisa.inicio, dados: bytes.slice(p1.precisa.inicio, p1.precisa.fim) }
  const p2 = extrairPrevia(cabeca, { total, trechos: [t1] })
  assert.deepEqual(p2, { jpeg: null, precisa: { inicio: pos.inteira, fim: pos.inteira + inteira.length }, largura: 6000, altura: 4000 })
  const t2 = { inicio: p2.precisa.inicio, dados: bytes.slice(p2.precisa.inicio, p2.precisa.fim) }
  const p3 = extrairPrevia(cabeca, { total, trechos: [t1, t2] })
  assert.deepEqual(medidas(p3), [6000, 4000])
  assert.ok(iguais(p3.jpeg, inteira))
  assert.equal(p3.jpeg.buffer, t2.dados.buffer, 'o resultado é o próprio trecho lido')

  // 3) o mesmo com o leitor assíncrono (é o que a tela usa com arquivo.slice)
  const leituras = []
  const ler = async (a, b) => {
    leituras.push([a, b])
    return bytes.slice(a, b)
  }
  const r = await extrairPreviaDe(ler, total, { cabeca: 64 * 1024 })
  assert.ok(iguais(r.jpeg, inteira))
  assert.equal(leituras.length, 3)
  assert.equal(r.lidos, 64 * 1024 + (p1.precisa.fim - p1.precisa.inicio) + inteira.length)
  assert.ok(r.lidos < total / 3, 'menos de um terço do arquivo lido')
  leituras.length = 0
  const rapida = await extrairPreviaDe(ler, total, { cabeca: 64 * 1024, lado: 1024 })
  assert.ok(iguais(rapida.jpeg, media))
  assert.deepEqual(leituras, [[0, 64 * 1024]])

  // 4) o EXIF sai do começo do arquivo e não lança quando falta pedaço
  assert.deepEqual(lerExif(cabeca, { total }), lerExif(bytes))
  for (const corte of [0, 3, 9, 40, 200, 1000]) assert.deepEqual(typeof lerExif(bytes.subarray(0, corte)).orientacao, 'number')
  assert.equal(extrairPrevia(bytes.subarray(0, 5)), null)
})

test('RW2: JpgFromRaw (tag 0x2E) com o enchimento aparado; ISO no IFD0 e o resto no EXIF do JPEG embutido', () => {
  const interno = montarTiff({
    blocos: [
      {
        nome: 'ifd0',
        ifd: [
          [0x0112, 3, 3],
          [0x8769, 4, { pos: 'exif' }],
        ],
      },
      { nome: 'exif', ifd: EXIF.filter(([tag]) => tag !== 0x8827) },
    ],
  }).bytes
  const jpeg = jpegFalso({ largura: 1920, altura: 1440, corpo: 20000, exif: interno, semente: 12 })
  const comEnchimento = juntar([jpeg, new Uint8Array(512 - (jpeg.length % 512)).fill(0x67)])
  const { bytes } = montarTiff({
    magia: 0x55,
    blocos: [
      {
        nome: 'ifd0',
        ifd: [
          [0x0002, 3, 1920],
          [0x0017, 3, 80],
          [0x002e, 7, comEnchimento],
          [0x010f, 2, 'Panasonic'],
          [0x0110, 2, 'DMC-Teste'],
          [0x0112, 3, 1],
          [0x0118, 4, { pos: 'sensor' }],
        ],
      },
      { nome: 'sensor', bytes: new Uint8Array(30000) },
    ],
  })
  const r = extrairPrevia(bytes)
  assert.deepEqual(medidas(r), [1920, 1440])
  assert.ok(iguais(r.jpeg, jpeg), 'sem o enchimento depois do FF D9')
  assert.deepEqual(lerExif(bytes), { ...ESPERADO, iso: 80, orientacao: 1 })
  assert.deepEqual(lerCamera(bytes), { fabricante: 'Panasonic', modelo: 'DMC-Teste' })
})

test('ORF: prévia nas marcas da Olympus (CameraSettings → PreviewImageStart/Length)', () => {
  const jpeg = jpegFalso({ largura: 1600, altura: 1200, corpo: 25000, semente: 13 })
  // marcas da Olympus: 'OLYMPUS\0' + 'II' + versão, diretório em +12, posições contadas do começo das marcas
  const marcas = montarTiff({
    cabecalho: juntar([ascii('OLYMPUS\0II'), [3, 0]]),
    blocos: [
      {
        nome: 'ifd',
        ifd: [
          [0x0100, 7, Uint8Array.of(0xff, 0xd8, 0xff, 0xdb, 0, 0)],
          [0x2010, 13, { pos: 'equip' }],
          [0x2020, 13, { pos: 'ajustes' }],
        ],
      },
      { nome: 'equip', ifd: [[0x0000, 7, Uint8Array.of(48, 49, 48, 48)]] },
      {
        nome: 'ajustes',
        ifd: [
          [0x0100, 4, 1],
          [0x0101, 4, { pos: 'jpeg' }],
          [0x0102, 4, { tam: 'jpeg' }],
        ],
      },
      { nome: 'jpeg', bytes: jpeg },
    ],
  }).bytes
  const { bytes } = montarTiff({
    magia: 0x4f52,
    blocos: [
      {
        nome: 'ifd0',
        ifd: [
          [0x0100, 4, 3720],
          [0x0101, 4, 2800],
          [0x0102, 3, 16],
          [0x0103, 3, 1],
          [0x0106, 3, 1],
          [0x010f, 2, 'OLYMPUS IMAGING CORP.'],
          [0x0110, 2, 'E-Teste'],
          [0x0111, 4, { pos: 'sensor' }],
          [0x0117, 4, { tam: 'sensor' }],
          [0x8769, 4, { pos: 'exif' }],
        ],
      },
      { nome: 'exif', ifd: comMarcas(marcas, EXIF) },
      { nome: 'sensor', bytes: new Uint8Array(40000) },
    ],
  })
  const r = extrairPrevia(bytes)
  assert.deepEqual(medidas(r), [1600, 1200])
  assert.ok(iguais(r.jpeg, jpeg))
  assert.deepEqual(lerExif(bytes), { ...ESPERADO, orientacao: 1 })
})

test('RAF: posição da prévia no cabeçalho; o EXIF mora no JPEG embutido', () => {
  const interno = montarTiff({
    le: false,
    blocos: [
      {
        nome: 'ifd0',
        ifd: [
          [0x010f, 2, 'FUJIFILM'],
          [0x0110, 2, 'X-Teste'],
          [0x0112, 3, 6],
          [0x8769, 4, { pos: 'exif' }],
        ],
      },
      { nome: 'exif', ifd: EXIF },
    ],
  }).bytes
  const jpeg = jpegFalso({ largura: 4416, altura: 2944, corpo: 50000, exif: interno, semente: 14 })
  const cabecalho = new Uint8Array(148)
  cabecalho.set(ascii('FUJIFILMCCD-RAW 0201FF129502'))
  cabecalho.set(ascii('X-Teste'), 28)
  const v = new DataView(cabecalho.buffer)
  v.setUint32(84, 148)
  v.setUint32(88, jpeg.length)
  v.setUint32(100, 148 + jpeg.length)
  const bytes = juntar([cabecalho, jpeg, new Uint8Array(70000).fill(0x11)])
  const r = extrairPrevia(bytes)
  assert.deepEqual(medidas(r), [4416, 2944])
  assert.ok(iguais(r.jpeg, jpeg))
  assert.deepEqual(lerExif(bytes), { ...ESPERADO, orientacao: 6 })
  assert.deepEqual(lerCamera(bytes), { fabricante: 'FUJIFILM', modelo: 'X-Teste' })
  // leitura parcial: a cabeça não traz o JPEG inteiro → pede exatamente ele
  assert.deepEqual(extrairPrevia(bytes.subarray(0, 4096), { total: bytes.length }), {
    jpeg: null,
    precisa: { inicio: 148, fim: 148 + jpeg.length },
    largura: 4416,
    altura: 2944,
  })
})

test('CR3: THMB, PRVW e a trilha JPEG do tamanho inteiro; EXIF nos blocos CMT1 e CMT2', async () => {
  const miniatura = jpegFalso({ largura: 160, altura: 120, corpo: 900, semente: 15 })
  const previa = jpegFalso({ largura: 1620, altura: 1080, corpo: 30000, semente: 16 })
  const inteira = jpegFalso({ largura: 5472, altura: 3648, corpo: 300000, semente: 17 })
  const cmt1 = montarTiff({
    blocos: [
      {
        nome: 'ifd0',
        ifd: [
          [0x010f, 2, 'Canon'],
          [0x0110, 2, 'Canon EOS R Teste'],
          [0x0112, 3, 8],
        ],
      },
    ],
  }).bytes
  const cmt2 = montarTiff({ blocos: [{ nome: 'ifd0', ifd: EXIF }] }).bytes
  const bytes = montarCr3({
    cmt1,
    cmt2,
    miniatura: { largura: 160, altura: 120, jpeg: miniatura },
    previa: { largura: 1620, altura: 1080, jpeg: previa },
    inteira: { largura: 5472, altura: 3648, jpeg: inteira },
    sensor: { largura: 5568, altura: 3708, dados: new Uint8Array(500000).fill(0x33) },
  })
  assert.deepEqual(
    listarPrevias(bytes).map((c) => [c.largura, c.altura]),
    [
      [5472, 3648],
      [1620, 1080],
      [160, 120],
    ],
  )
  assert.ok(iguais(extrairPrevia(bytes).jpeg, inteira))
  assert.ok(iguais(extrairPrevia(bytes, { lado: 1024 }).jpeg, previa))
  assert.deepEqual(lerExif(bytes), { ...ESPERADO, orientacao: 8 })
  assert.deepEqual(lerCamera(bytes), { fabricante: 'Canon', modelo: 'Canon EOS R Teste' })

  // leitura parcial: com 64 KB na mão a PRVW já veio inteira; a do tamanho inteiro pede só o pedaço dela em `mdat`
  const total = bytes.length
  const leituras = []
  const ler = async (a, b) => {
    leituras.push([a, b])
    return bytes.slice(a, b)
  }
  const rapida = await extrairPreviaDe(ler, total, { cabeca: 64 * 1024, lado: 1024 })
  assert.ok(iguais(rapida.jpeg, previa))
  assert.equal(leituras.length, 1)
  const maior = await extrairPreviaDe(ler, total, { cabeca: 64 * 1024 })
  assert.ok(iguais(maior.jpeg, inteira))
  assert.equal(maior.lidos, 64 * 1024 + inteira.length)
  assert.deepEqual(lerExif(bytes.subarray(0, 4096), { total }), { ...ESPERADO, orientacao: 8 }, 'EXIF só com o começo (moov)')
})

test('só JPEG que o navegador abre vale como prévia: lossless (SOF3) e 12 bits ficam de fora', () => {
  const montar = (jpeg) =>
    montarTiff({
      blocos: [
        {
          nome: 'ifd0',
          ifd: [
            [0x0201, 4, { pos: 'a' }],
            [0x0202, 4, { tam: 'a' }],
          ],
          proximo: 'ifd1',
        },
        {
          nome: 'ifd1',
          ifd: [
            [0x0201, 4, { pos: 'b' }],
            [0x0202, 4, { tam: 'b' }],
          ],
        },
        { nome: 'a', bytes: jpeg },
        { nome: 'b', bytes: jpegFalso({ largura: 320, altura: 240, corpo: 9000, processo: 2 }) },
      ],
    }).bytes
  // a candidata maior não é decodificável: vale a progressiva (SOF2) menor
  assert.deepEqual(medidas(extrairPrevia(montar(juntar([sensorSemPerdas(), new Uint8Array(40000)])))), [320, 240])
  assert.deepEqual(medidas(extrairPrevia(montar(jpegFalso({ largura: 4000, altura: 3000, corpo: 40000, bits: 12, processo: 1 })))), [320, 240])
  assert.deepEqual(medidas(extrairPrevia(montar(jpegFalso({ largura: 4000, altura: 3000, corpo: 40000, canais: 4 })))), [320, 240])
  assert.deepEqual(medidas(extrairPrevia(montar(new Uint8Array(40000).fill(0xab)))), [320, 240])

  const fonte = criarFonte(jpegFalso({ largura: 800, altura: 600, processo: 2 }))
  assert.deepEqual(cabecalhoJpeg(fonte, 0), { processo: 2, bits: 8, altura: 600, largura: 800, canais: 3 })
  assert.equal(cabecalhoJpeg(criarFonte(Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)), 0), null)
})

test('formato desconhecido: com o arquivo inteiro, a varredura acha o maior JPEG; JPEG e lixo devolvem null', () => {
  const rng = acaso(5)
  const lixo = (n) => Uint8Array.from({ length: n }, () => Math.floor(rng.u() * 256))
  const menor = jpegFalso({ largura: 640, altura: 480, corpo: 9000, semente: 20 })
  const maior = jpegFalso({ largura: 3000, altura: 2000, corpo: 60000, semente: 21 })
  const bytes = juntar([ascii('FORMATO-NOVO'), lixo(5000), menor, lixo(20000), sensorSemPerdas(), maior, lixo(3000)])
  const r = extrairPrevia(bytes)
  assert.deepEqual(medidas(r), [3000, 2000])
  assert.ok(iguais(r.jpeg, maior))
  assert.equal(extrairPrevia(bytes.subarray(0, 20000), { total: bytes.length }), null, 'sem o arquivo inteiro não há varredura')
  assert.equal(extrairPrevia(maior), null, 'um JPEG não tem prévia de RAW')
  assert.equal(extrairPrevia(lixo(4000)), null)
  assert.equal(extrairPrevia(new Uint8Array(0)), null)
  assert.deepEqual(listarPrevias(lixo(4000)), [])
})

test('lerExif: JPEG e TIFF comuns, nas duas ordens de bytes, com os caminhos alternativos de cada campo', () => {
  for (const le of [true, false]) {
    const tiff = montarTiff({
      le,
      blocos: [
        {
          nome: 'ifd0',
          ifd: [
            [0x010f, 2, 'Marca'],
            [0x0110, 2, 'Modelo X'],
            [0x0112, 3, 3],
            [0x0132, 2, '2026:01:02 03:04:05'],
            [0x8769, 4, { pos: 'exif' }],
          ],
        },
        { nome: 'exif', ifd: EXIF },
      ],
    }).bytes
    assert.deepEqual(lerExif(tiff), { ...ESPERADO, orientacao: 3 }, `TIFF ${le ? 'II' : 'MM'}`)
    assert.deepEqual(lerExif(jpegFalso({ largura: 64, altura: 48, exif: tiff })), { ...ESPERADO, orientacao: 3 }, `JPEG ${le ? 'II' : 'MM'}`)
    assert.deepEqual(lerExif(tiff.buffer), { ...ESPERADO, orientacao: 3 }, 'aceita ArrayBuffer')
  }
  // sem tempo e abertura diretos: valores APEX (Tv = 8 → 1/256 s; Av = 5 → f/5,66); ISO que não coube no campo curto;
  // sem DateTimeOriginal: vale a data do IFD0; lente só pela especificação (prime)
  const alternativo = montarTiff({
    blocos: [
      {
        nome: 'ifd0',
        ifd: [
          [0x0132, 2, '2026:01:02 03:04:05'],
          [0x8769, 4, { pos: 'exif' }],
        ],
      },
      {
        nome: 'exif',
        ifd: [
          [0x8827, 3, 65535],
          [0x8833, 4, 102400],
          [0x9201, 10, [[8, 1]]],
          [0x9202, 5, [[5, 1]]],
          [0x9290, 2, '5'],
          [
            0xa432,
            5,
            [
              [50, 1],
              [50, 1],
              [18, 10],
              [18, 10],
            ],
          ],
        ],
      },
    ],
  }).bytes
  const e = lerExif(alternativo)
  assert.equal(e.data, '2026-01-02T03:04:05')
  assert.equal(e.subsegundo, 0.5, 'a data veio do IFD0 (DateTime): a fração é a dela (SubSecTime)')
  assert.equal(e.iso, 102400)
  assert.equal(e.tempo, 1 / 256)
  assert.ok(Math.abs(e.abertura - 5.657) < 0.001)
  assert.equal(e.lente, '50mm f/1.8')
  assert.equal(e.orientacao, 1)
  // TIFF/EP: as tags de exposição no próprio IFD0 (NEF e DNG antigos)
  const tiffEp = montarTiff({ blocos: [{ nome: 'ifd0', ifd: [...EXIF, [0x0112, 3, 1]] }] }).bytes
  assert.deepEqual(lerExif(tiffEp), { ...ESPERADO, orientacao: 1 })
  // data zerada e valores impossíveis não entram
  const ruim = montarTiff({
    blocos: [
      {
        nome: 'ifd0',
        ifd: [
          [0x0112, 3, 42],
          [0x8769, 4, { pos: 'exif' }],
        ],
      },
      {
        nome: 'exif',
        ifd: [
          [0x829a, 5, [[1, 0]]],
          [0x829d, 5, [[0, 1]]],
          [0x9003, 2, '0000:00:00 00:00:00'],
        ],
      },
    ],
  }).bytes
  assert.deepEqual(lerExif(ruim), { orientacao: 1 })
  // nunca lança
  assert.deepEqual(lerExif(new Uint8Array(0)), { orientacao: 1 })
  assert.deepEqual(lerExif(Uint8Array.of(0x49, 0x49, 42, 0, 0xff, 0xff, 0xff, 0x7f, 1, 2, 3, 4, 5)), { orientacao: 1 })
  assert.deepEqual(lerCamera(new Uint8Array(40)), { fabricante: '', modelo: '' })
})

// ---------------------------------------------------------------------------------------------------- amostras

// Medidas da maior prévia de cada amostra (pesquisa) e o que o EXIF tem de dizer
const PREVIAS = {
  'adobe_5d3_lossy.dng': [5760, 3840],
  'canon_30d.cr2': [1728, 1152],
  'canon_5d3.dng': null, // Magic Lantern: sem prévia
  'canon_r6.cr3': [3408, 2272],
  'fuji_xt30ii.raf': [4416, 2944],
  'iphone_xs.dng': [852, 640],
  'nikon_d70s.nef': [3008, 2000],
  'pana_lx7.rw2': [1920, 1440],
  'pixel6pro.dng': [680, 512],
  'ricoh_gr.dng': [640, 424],
  'samsung_g973.dng': null, // é um JPEG com nome de DNG
  'sony_a7s.arw': [1616, 1080],
}

test('amostras: a maior prévia de cada arquivo, em menos de 20 ms, inteira ou lendo só um pedaço', { timeout: 120000 }, async (t) => {
  if (!precisaDeAmostras(t)) return
  const tempos = []
  for (const nome of AMOSTRAS) {
    const bytes = await lerAmostra(nome)
    let melhor = Infinity
    let r
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      r = extrairPrevia(bytes)
      lerExif(bytes)
      melhor = Math.min(melhor, performance.now() - t0)
    }
    tempos.push(`${nome} ${melhor.toFixed(2)} ms`)
    assert.ok(melhor < 20, `${nome}: prévia + EXIF em ${melhor.toFixed(1)} ms`)
    assert.deepEqual(medidas(r), PREVIAS[nome], nome)
    if (r) {
      assert.deepEqual([r.jpeg[0], r.jpeg[1], r.jpeg[r.jpeg.length - 2], r.jpeg[r.jpeg.length - 1]], [0xff, 0xd8, 0xff, 0xd9], `${nome}: JPEG inteiro`)
      // lendo só os primeiros 512 KB (e o que o leitor pedir): o mesmo JPEG, sem ler o arquivo todo
      const lida = await extrairPreviaDe(async (a, b) => bytes.slice(a, b), bytes.length)
      assert.ok(iguais(lida.jpeg, r.jpeg), `${nome}: leitura parcial`)
      assert.ok(lida.lidos <= r.jpeg.length + 512 * 1024 + 65536, `${nome}: leu ${lida.lidos} de ${bytes.length}`)
    } else {
      assert.equal(await extrairPreviaDe(async (a, b) => bytes.slice(a, b), bytes.length), null)
    }
  }
  t.diagnostic(tempos.join(' · '))
  // CR3: as três prévias que a pesquisa listou
  const r6 = await lerAmostra('canon_r6.cr3')
  assert.deepEqual(
    listarPrevias(r6).map((c) => [c.largura, c.altura]),
    [
      [3408, 2272],
      [1620, 1080],
      [160, 120],
    ],
  )
  assert.deepEqual(medidas(extrairPrevia(r6.subarray(0, 512 * 1024), { total: r6.length, lado: 1024 })), [1620, 1080], 'a de 1620 px cabe nos primeiros 512 KB')
})

test('amostras: o EXIF de cada câmera', async (t) => {
  if (!precisaDeAmostras(t)) return
  const exif = async (nome) => lerExif(await lerAmostra(nome))
  assert.deepEqual(await exif('canon_r6.cr3'), {
    orientacao: 1,
    tempo: 0.25,
    abertura: 25,
    iso: 100,
    focal: 200,
    lente: 'RF70-200mm F2.8 L IS USM',
    data: '2021-05-12T12:21:21',
    subsegundo: 0.92,
  })
  assert.deepEqual(await exif('canon_30d.cr2'), { orientacao: 1, tempo: 0.02, abertura: 8, iso: 100, focal: 35, data: '2017-10-09T12:19:11' })
  // D70s: sem ISO nem lente no EXIF comum; os dois vêm das marcas da Nikon (a lente, pela especificação de focal e abertura)
  assert.deepEqual(await exif('nikon_d70s.nef'), {
    orientacao: 1,
    tempo: 0.005,
    abertura: 8,
    focal: 35,
    iso: 200,
    data: '2010-03-03T07:46:08',
    subsegundo: 0.1,
    lente: '18-250mm f/3.5-6.3',
  })
  assert.deepEqual(await exif('pana_lx7.rw2'), { orientacao: 1, tempo: 0.0025, abertura: 4, focal: 17.7, iso: 80, data: '2023-11-18T09:49:15' })
  const fuji = await exif('fuji_xt30ii.raf')
  assert.deepEqual([fuji.iso, fuji.abertura, fuji.focal, fuji.lente, fuji.data], [160, 4, 55, 'XF18-55mmF2.8-4 R LM OIS', '2021-12-31T13:47:38'])
  const sony = await exif('sony_a7s.arw')
  assert.deepEqual([sony.iso, sony.tempo, sony.lente, sony.data], [400, 0.004, undefined, '2017-07-13T16:58:28'])
  const iphone = await exif('iphone_xs.dng')
  assert.deepEqual([iphone.iso, iphone.abertura, iphone.lente, iphone.subsegundo], [25, 1.8, 'iPhone XS back camera 4.25mm f/1.8', 0.504])
  // o "DNG" da Samsung é um JPEG: o EXIF dele sai como de qualquer JPEG
  const samsung = await exif('samsung_g973.dng')
  assert.deepEqual([samsung.iso, samsung.abertura, samsung.data], [500, 2.4, '2020-04-02T18:19:31'])
  for (const nome of AMOSTRAS) {
    const bytes = await lerAmostra(nome)
    assert.deepEqual(lerExif(bytes.subarray(0, 262144), { total: bytes.length }), lerExif(bytes), `${nome}: EXIF só com os primeiros 256 KB`)
    assert.ok(lerCamera(bytes).modelo.length > 1, `${nome}: modelo`)
  }
})

test('amostras: a prévia própria é a miniatura do LibRaw', { timeout: 120000 }, async (t) => {
  if (!precisaDeAmostras(t)) return
  const LibRaw = await carregarLibRaw()
  if (!precisaDoLibRaw(t, LibRaw)) return
  let comparadas = 0
  for (const nome of ['canon_30d.cr2', 'canon_r6.cr3', 'fuji_xt30ii.raf', 'nikon_d70s.nef', 'sony_a7s.arw', 'pana_lx7.rw2']) {
    const bytes = await lerAmostra(nome)
    const propria = extrairPrevia(bytes)
    const lr = new LibRaw()
    try {
      await lr.waitUntilReady()
      lr.open(bytes.buffer)
      lr.unpackThumb()
      const miniatura = lr.dcrawMakeMemThumb()
      assert.equal(miniatura.type_, 'LIBRAW_IMAGE_JPEG')
      const dele = miniatura.data
      // o LibRaw às vezes põe um cabeçalho EXIF próprio na frente: o que tem de bater é o JPEG a partir daí
      const cauda = propria.jpeg.subarray(2)
      assert.ok(
        dele.length >= propria.jpeg.length - 2 && dele.length <= propria.jpeg.length + 4096,
        `${nome}: ${dele.length} contra ${propria.jpeg.length} bytes`,
      )
      assert.ok(
        Buffer.from(dele.buffer, dele.byteOffset, dele.length).includes(Buffer.from(cauda.buffer, cauda.byteOffset, cauda.length)),
        `${nome}: mesmos bytes de imagem`,
      )
      const cab = cabecalhoJpeg(criarFonte(dele), 0)
      assert.deepEqual([cab.largura, cab.altura], [propria.largura, propria.altura], `${nome}: mesmas medidas`)
      comparadas++
    } finally {
      lr.dispose()
    }
  }
  assert.equal(comparadas, 6)
})
