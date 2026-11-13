// TIFF e PNG: ida e volta sem perder um bit, tags e pedaços no lugar certo, e a conferência por leitores que não são
// os nossos (o zlib do Node e, quando há, o Chromium).

import assert from 'node:assert/strict'
import { test } from 'node:test'
import zlib from 'node:zlib'

import { lerCamera, lerExif } from '../src/raw/exif.js'
import { montarExif } from '../src/exportar/exif-escrever.js'
import { espacoDoPerfil, perfilIcc } from '../src/exportar/icc.js'
import { adler32, comprimirZlib, crc32, descomprimirZlib, escreverPng, lerPng, zlibGuardado } from '../src/exportar/png.js'
import { TAG, TIPO, entradaDe, escreverTiff, lerBlocoTiff, lerTiff, montarBlocoTiff, valorDe } from '../src/exportar/tiff.js'
import { pacoteXmp } from '../src/exportar/xmp.js'
import { abrirChromium, base64, cenaDeTeste, paraRgb16, paraRgb8, semChromium, sorteio } from './apoio-exportar.js'

const CENA = cenaDeTeste(701, 613, 21) // 701 × 613 × 3 = 1,29 MB em 8 bits: passa de uma tira e não é múltiplo de nada
const RGB8 = paraRgb8(CENA)
const RGB16 = paraRgb16(CENA)
const EXIF = montarExif(
  { fabricante: 'Fabricante', modelo: 'Modelo X', data: '2026-05-06T07:08:09', iso: 200, tempo: 1 / 125, abertura: 4, focal: 50, lente: 'Lente 50mm' },
  { software: 'Programa de teste', autor: 'Autora', direitos: 'Direitos de teste', formato: 'tiff', espaco: 'adobe' },
)
const XMP = pacoteXmp({ estrelas: 5, cor: 'verde', marca: 'escolhida' })

const u16le = (b, p) => b[p] | (b[p + 1] << 8)
const u32le = (b, p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0

test('zlib: CRC-32 e Adler-32 nos vetores conhecidos e contra o Node', () => {
  const texto = (s) => new TextEncoder().encode(s)
  assert.equal(crc32(texto('123456789')), 0xcbf43926) // o vetor de conferência do CRC-32 (ISO 3309)
  assert.equal(adler32(texto('Wikipedia')), 0x11e60398) // o exemplo da RFC 1950 que todo mundo usa
  const r = sorteio(5)
  const bytes = Uint8Array.from({ length: 70001 }, () => Math.floor(r() * 256))
  assert.equal(crc32(bytes), zlib.crc32(bytes))
  assert.equal(crc32(bytes.subarray(1000), crc32(bytes.subarray(0, 1000))), zlib.crc32(bytes), 'a soma continua de um trecho para o outro')
})

test('zlib: o fluxo guardado (sem compressão) é zlib válido para o Node, inclusive vazio e acima de 64 KB', async () => {
  const r = sorteio(6)
  for (const n of [0, 1, 65535, 65536, 200000]) {
    const bytes = Uint8Array.from({ length: n }, () => Math.floor(r() * 256))
    const guardado = zlibGuardado(bytes)
    assert.deepEqual(new Uint8Array(zlib.inflateSync(guardado)), bytes, `${n} bytes`)
    assert.deepEqual(await descomprimirZlib(guardado), bytes)
    assert.deepEqual(new Uint8Array(zlib.inflateSync(await comprimirZlib(bytes))), bytes)
  }
})

for (const bits of [8, 16]) {
  for (const compressao of ['nenhuma', 'deflate']) {
    test(`TIFF ${bits} bits, ${compressao}: ida e volta idêntica, com perfil, XMP e EXIF nas tags certas`, async () => {
      const dados = bits === 8 ? RGB8 : RGB16
      const icc = perfilIcc('adobe')
      const arquivo = await escreverTiff({ largura: CENA.largura, altura: CENA.altura, dados, bits, icc, exif: EXIF, xmp: XMP, compressao })
      // cabeçalho: 'II', 42, primeiro diretório em 8 (TIFF 6.0, seção 2)
      assert.deepEqual(Array.from(arquivo.subarray(0, 8)), [0x49, 0x49, 42, 0, 8, 0, 0, 0])
      const lido = await lerTiff(arquivo)
      assert.equal(lido.largura, CENA.largura)
      assert.equal(lido.altura, CENA.altura)
      assert.equal(lido.bits, bits)
      assert.equal(lido.canais, 3)
      assert.equal(lido.compressao, compressao)
      assert.equal(lido.orientacao, 1)
      assert.equal(lido.ppi, 300)
      assert.ok(lido.dados instanceof (bits === 8 ? Uint8Array : Uint16Array))
      assert.deepEqual(lido.dados, dados instanceof Uint8Array ? dados : new Uint16Array(dados), 'pixels idênticos')

      // as tags do RGB baseline (seção 6), em ordem crescente, com os tipos da especificação
      const tags = lido.diretorio.entradas.map((e) => e.tag)
      assert.deepEqual(tags, [...tags].sort((a, b) => a - b), 'entradas em ordem crescente de tag')
      for (const tag of [256, 257, 258, 259, 262, 273, 277, 278, 279, 282, 283, 296]) assert.ok(tags.includes(tag), `falta a tag ${tag}`)
      assert.deepEqual(valorDe(lido.diretorio, TAG.bits, { todos: true }), [bits, bits, bits])
      assert.equal(valorDe(lido.diretorio, TAG.fotometria), 2)
      assert.equal(valorDe(lido.diretorio, TAG.compressao), compressao === 'deflate' ? 8 : 1)
      assert.equal(valorDe(lido.diretorio, TAG.preditor), compressao === 'deflate' ? 2 : undefined)
      assert.equal(valorDe(lido.diretorio, TAG.planos), 1)

      // perfil ICC: tag 34675, tipo INDEFINIDO, os mesmos bytes
      assert.equal(entradaDe(lido.diretorio, 34675).tipo, TIPO.INDEFINIDO)
      assert.deepEqual(lido.icc, icc)
      assert.equal(espacoDoPerfil(lido.icc), 'adobe')
      // XMP: tag 700, tipo BYTE
      assert.equal(entradaDe(lido.diretorio, 700).tipo, TIPO.BYTE)
      assert.equal(lido.xmp, XMP)
      // EXIF: ExifIFD (34665) apontando para um diretório; câmera, programa e direitos no diretório principal
      assert.equal(entradaDe(lido.diretorio, 34665).tipo, TIPO.LONG)
      assert.ok(lido.exif, 'ExifIFD presente')
      assert.equal(valorDe(lido.diretorio, TAG.fabricante), 'Fabricante')
      assert.equal(valorDe(lido.diretorio, TAG.programa), 'Programa de teste')
      assert.equal(valorDe(lido.diretorio, TAG.autor), 'Autora')
      assert.equal(valorDe(lido.diretorio, TAG.direitos), 'Direitos de teste')
      assert.equal(lido.gps, null, 'sem GPS')
      // o leitor de EXIF da biblioteca (o que a decupagem usa) lê o TIFF exportado
      assert.deepEqual(lerExif(arquivo), { orientacao: 1, tempo: 1 / 125, abertura: 4, iso: 200, focal: 50, lente: 'Lente 50mm', data: '2026-05-06T07:08:09' })
      assert.deepEqual(lerCamera(arquivo), { fabricante: 'Fabricante', modelo: 'Modelo X' })

      // tiras: mais de uma, em posição par, dentro do arquivo, sem se cruzar
      const posicoes = valorDe(lido.diretorio, TAG.tiras, { todos: true })
      const tamanhos = valorDe(lido.diretorio, TAG.bytesPorTira, { todos: true })
      assert.ok(posicoes.length > 1, 'a imagem ocupa mais de uma tira')
      assert.equal(posicoes.length, Math.ceil(CENA.altura / valorDe(lido.diretorio, TAG.linhasPorTira)))
      posicoes.forEach((p, i) => {
        assert.equal(p % 2, 0, 'tira em posição par')
        assert.ok(p + tamanhos[i] <= arquivo.length)
        if (i > 0) assert.ok(p >= posicoes[i - 1] + tamanhos[i - 1])
      })
      const cru = CENA.largura * CENA.altura * 3 * (bits / 8)
      if (compressao === 'nenhuma') assert.equal(tamanhos.reduce((s, t) => s + t, 0), cru)
      else assert.ok(arquivo.length < cru * 0.95, `Deflate encolhe (${arquivo.length} de ${cru})`)
    })
  }
}

test('TIFF 16 bits com Deflate: a predição é a diferença da palavra de 16 bits, conferida com o zlib do Node', async () => {
  const dados = RGB16
  const arquivo = await escreverTiff({ largura: CENA.largura, altura: CENA.altura, dados, bits: 16, compressao: 'deflate' })
  const { diretorio } = lerBlocoTiff(arquivo)
  const posicoes = valorDe(diretorio, TAG.tiras, { todos: true })
  const tamanhos = valorDe(diretorio, TAG.bytesPorTira, { todos: true })
  const linhasPorTira = valorDe(diretorio, TAG.linhasPorTira)
  // desfaz à mão a primeira e a última tira: inflar, ler palavras em ordem pequena, somar ao longo da linha por canal
  for (const t of [0, posicoes.length - 1]) {
    const cru = new Uint8Array(zlib.inflateSync(arquivo.subarray(posicoes[t], posicoes[t] + tamanhos[t])))
    const linhas = cru.length / (CENA.largura * 6)
    assert.ok(Number.isInteger(linhas) && linhas >= 1 && linhas <= linhasPorTira)
    for (const y of [0, linhas - 1]) {
      const anterior = [0, 0, 0]
      for (let x = 0; x < CENA.largura; x++) {
        for (let c = 0; c < 3; c++) {
          const diferenca = u16le(cru, (y * CENA.largura + x) * 6 + c * 2)
          anterior[c] = (anterior[c] + diferenca) & 0xffff
          assert.equal(anterior[c], dados[((t * linhasPorTira + y) * CENA.largura + x) * 3 + c])
        }
      }
    }
  }
  // sem a predição o mesmo arquivo fica maior: ela está fazendo o trabalho dela
  const semPredicao = RGB16.length * 2
  assert.ok(arquivo.length < semPredicao)
})

test('TIFF: aceita o RGBA de paraBytes (descarta o alfa), respeita a orientação e recusa entrada torta', async () => {
  const n = 40 * 30
  const rgba = new Uint8ClampedArray(n * 4)
  const r = sorteio(8)
  for (let i = 0; i < rgba.length; i++) rgba[i] = i % 4 === 3 ? 255 : Math.floor(r() * 256)
  for (const compressao of ['nenhuma', 'deflate']) {
    const lido = await lerTiff(await escreverTiff({ largura: 40, altura: 30, dados: rgba, bits: 8, orientacao: 6, compressao }))
    assert.equal(lido.canais, 3)
    assert.equal(lido.orientacao, 6)
    for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) assert.equal(lido.dados[p * 3 + c], rgba[p * 4 + c])
    assert.equal(lido.icc, null)
    assert.equal(lido.xmp, null)
    assert.equal(lido.exif, null)
  }
  assert.ok(rgba.every((v, i) => i % 4 !== 3 || v === 255), 'a entrada não foi tocada')
  await assert.rejects(escreverTiff({ largura: 40, altura: 30, dados: new Uint8Array(10), bits: 8 }), /amostras/)
  await assert.rejects(escreverTiff({ largura: 40, altura: 30, dados: new Uint8Array(n * 3), bits: 16 }), /Uint16Array/)
  await assert.rejects(escreverTiff({ largura: 40, altura: 30, dados: new Uint8Array(n * 4), bits: 8, canais: 4 }), /RGB/)
  await assert.rejects(escreverTiff({ largura: 40, altura: 30, dados: new Uint8Array(n * 3), compressao: 'lzw' }), /compressão/)
  await assert.rejects(escreverTiff({ largura: 0, altura: 30, dados: new Uint8Array(0) }), /inteiros positivos/)
})

test('TIFF: a predição não mexe nos dados de quem chamou', async () => {
  const copia8 = RGB8.slice()
  const copia16 = RGB16.slice()
  await escreverTiff({ largura: CENA.largura, altura: CENA.altura, dados: RGB8, bits: 8, compressao: 'deflate' })
  await escreverTiff({ largura: CENA.largura, altura: CENA.altura, dados: RGB16, bits: 16, compressao: 'deflate' })
  assert.deepEqual(RGB8, copia8)
  assert.deepEqual(RGB16, copia16)
})

test('TIFF: lê arquivo de ordem grande (MM) montado à mão', async () => {
  // 2 × 1 pixels RGB de 8 bits, sem compressão, diretório depois dos pixels
  const b = new Uint8Array(8 + 6 + 2 + 9 * 12 + 4 + 6)
  const v = new DataView(b.buffer)
  b.set([0x4d, 0x4d, 0, 42], 0)
  v.setUint32(4, 14)
  b.set([10, 20, 30, 40, 50, 60], 8)
  const entradas = [
    [256, 3, 1, 2],
    [257, 3, 1, 1],
    [258, 3, 3, 14 + 2 + 9 * 12 + 4], // três valores: ficam fora da entrada
    [259, 3, 1, 1],
    [262, 3, 1, 2],
    [273, 4, 1, 8],
    [277, 3, 1, 3],
    [278, 3, 1, 1],
    [279, 4, 1, 6],
  ]
  v.setUint16(14, entradas.length)
  entradas.forEach(([tag, tipo, n, valor], i) => {
    const p = 16 + i * 12
    v.setUint16(p, tag)
    v.setUint16(p + 2, tipo)
    v.setUint32(p + 4, n)
    if (tipo === 3 && n === 1) v.setUint16(p + 8, valor)
    else v.setUint32(p + 8, valor)
  })
  const fora = 14 + 2 + 9 * 12 + 4
  for (let i = 0; i < 3; i++) v.setUint16(fora + i * 2, 8)
  const lido = await lerTiff(b)
  assert.equal(lido.le, false)
  assert.deepEqual([lido.largura, lido.altura, lido.bits, lido.canais], [2, 1, 8, 3])
  assert.deepEqual(Array.from(lido.dados), [10, 20, 30, 40, 50, 60])
})

test('TIFF: diretório com valores de todos os tipos vai e volta, com os valores longos em posição par', () => {
  const bloco = montarBlocoTiff({
    entradas: [
      { tag: 0x010f, tipo: TIPO.ASCII, valores: 'Câmera Ção' }, // UTF-8, número ímpar de bytes com o zero
      { tag: 0x0112, tipo: TIPO.SHORT, valores: 1 },
      { tag: 0x011a, tipo: TIPO.RACIONAL, valores: [72, 1] },
      { tag: 0x0100, tipo: TIPO.LONG, valores: [1, 2, 3] },
      { tag: 0x9000, tipo: TIPO.INDEFINIDO, valores: [0x30, 0x32, 0x33, 0x32] },
      { tag: 0x9204, tipo: TIPO.SRACIONAL, valores: [[-1, 3]] },
      { tag: 0x8769, filho: { entradas: [{ tag: 0x829a, tipo: TIPO.RACIONAL, valores: [1, 250] }] } },
      { tag: 0x0131, tipo: TIPO.ASCII, valores: undefined }, // sem valor: não entra
    ],
  })
  assert.equal(bloco.length % 2, 0)
  const { diretorio } = lerBlocoTiff(bloco)
  assert.deepEqual(
    diretorio.entradas.map((e) => e.tag),
    [0x0100, 0x010f, 0x0112, 0x011a, 0x8769, 0x9000, 0x9204],
  )
  assert.equal(valorDe(diretorio, 0x010f), 'Câmera Ção')
  assert.deepEqual(valorDe(diretorio, 0x0100, { todos: true }), [1, 2, 3])
  assert.deepEqual(valorDe(diretorio, 0x011a), [72, 1])
  assert.deepEqual(valorDe(diretorio, 0x9204), [-1, 3])
  assert.deepEqual(Array.from(valorDe(diretorio, 0x9000)), [0x30, 0x32, 0x33, 0x32])
  assert.deepEqual(valorDe(diretorio.filhos[0x8769], 0x829a), [1, 250])
  // cada valor que não cabe em 4 bytes fica em posição par (seção 2)
  const n = u16le(bloco, 8)
  for (let i = 0; i < n; i++) {
    const p = 10 + i * 12
    const tamanho = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8][u16le(bloco, p + 2)] * u32le(bloco, p + 4)
    if (tamanho > 4) assert.equal(u32le(bloco, p + 8) % 2, 0)
  }
  assert.throws(() => montarBlocoTiff({ entradas: [{ tag: 1, tipo: TIPO.SHORT, valores: 1 }, { tag: 1, tipo: TIPO.SHORT, valores: 2 }] }), /repetida/)
  assert.throws(() => lerBlocoTiff(new Uint8Array(16)), /ordem de bytes/)
})

for (const bits of [8, 16]) {
  for (const compressao of ['auto', 'nenhuma']) {
    test(`PNG ${bits} bits, compressão ${compressao}: ida e volta idêntica, CRC certo, iCCP com o perfil`, async () => {
      const dados = bits === 8 ? RGB8 : RGB16
      const icc = perfilIcc('p3')
      const arquivo = await escreverPng({ largura: CENA.largura, altura: CENA.altura, dados, bits, icc, exif: EXIF, xmp: XMP, compressao })
      assert.deepEqual(Array.from(arquivo.subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

      // percorre os pedaços à mão: tamanho, tipo, CRC conferido com o do Node; junta o IDAT e infla com o zlib do Node
      const v = new DataView(arquivo.buffer, arquivo.byteOffset)
      const pedacos = []
      const idat = []
      let iccp = null
      for (let p = 8; p < arquivo.length; ) {
        const n = v.getUint32(p)
        const tipo = String.fromCharCode(...arquivo.subarray(p + 4, p + 8))
        assert.equal(v.getUint32(p + 8 + n), zlib.crc32(arquivo.subarray(p + 4, p + 8 + n)), `CRC do pedaço ${tipo}`)
        pedacos.push(tipo)
        if (tipo === 'IDAT') idat.push(arquivo.subarray(p + 8, p + 8 + n))
        if (tipo === 'iCCP') iccp = arquivo.subarray(p + 8, p + 8 + n)
        if (tipo === 'IHDR') {
          assert.deepEqual([v.getUint32(p + 8), v.getUint32(p + 12)], [CENA.largura, CENA.altura])
          assert.deepEqual(Array.from(arquivo.subarray(p + 16, p + 21)), [bits, 2, 0, 0, 0], 'bits, RGB, deflate, filtro 0, sem entrelaçar')
        }
        p += 12 + n
      }
      // ordem (PNG, 5.6): IHDR primeiro, iCCP antes do IDAT, IDATs seguidos, IEND por último
      assert.equal(pedacos[0], 'IHDR')
      assert.equal(pedacos.at(-1), 'IEND')
      assert.ok(pedacos.indexOf('iCCP') < pedacos.indexOf('IDAT'))
      const primeiro = pedacos.indexOf('IDAT')
      assert.ok(pedacos.slice(primeiro, primeiro + idat.length).every((t) => t === 'IDAT'), 'IDATs consecutivos')
      assert.ok(!pedacos.includes('sRGB') && !pedacos.includes('gAMA'), 'com iCCP não vai sRGB nem gAMA')

      // iCCP: nome em Latin-1, zero, método 0, perfil em zlib
      const zero = iccp.indexOf(0)
      assert.equal(String.fromCharCode(...iccp.subarray(0, zero)), 'Display P3')
      assert.equal(iccp[zero + 1], 0)
      assert.deepEqual(new Uint8Array(zlib.inflateSync(iccp.subarray(zero + 2))), icc)

      // o fluxo de imagem, inflado pelo Node, tem um byte de filtro por linha e, em 16 bits, o byte alto primeiro
      const fluxo = new Uint8Array(zlib.inflateSync(Buffer.concat(idat)))
      const passo = CENA.largura * 3 * (bits / 8)
      assert.equal(fluxo.length, (passo + 1) * CENA.altura)
      for (let y = 0; y < CENA.altura; y++) assert.ok(fluxo[y * (passo + 1)] <= 4, 'filtro de 0 a 4')
      if (compressao === 'nenhuma') {
        // sem compressão vai tudo com filtro 0: dá para ler as amostras direto
        assert.equal(fluxo[0], 0)
        if (bits === 16) assert.equal((fluxo[1] << 8) | fluxo[2], dados[0], 'byte alto primeiro')
        else assert.equal(fluxo[1], dados[0])
        assert.ok(arquivo.length > passo * CENA.altura)
      } else {
        assert.ok(arquivo.length < passo * CENA.altura * 0.95, 'a compressão encolhe')
        const usados = new Set()
        for (let y = 0; y < CENA.altura; y++) usados.add(fluxo[y * (passo + 1)])
        assert.ok(usados.size > 1, 'a escolha de filtro é por linha')
      }

      const lido = await lerPng(arquivo)
      assert.deepEqual([lido.largura, lido.altura, lido.bits, lido.canais], [CENA.largura, CENA.altura, bits, 3])
      assert.deepEqual(lido.dados, dados, 'pixels idênticos')
      assert.deepEqual(lido.icc, icc)
      assert.equal(lido.nomeDoPerfil, 'Display P3')
      assert.deepEqual(lido.exif, EXIF)
      assert.equal(lido.xmp, XMP)
      assert.equal(lerExif(lido.exif).iso, 200)
    })
  }
}

test('PNG: aceita RGBA de paraBytes, nome de perfil saneado, arquivo estragado é recusado', async () => {
  const n = 33 * 17
  const rgba = new Uint8ClampedArray(n * 4)
  const r = sorteio(9)
  for (let i = 0; i < rgba.length; i++) rgba[i] = i % 4 === 3 ? 255 : Math.floor(r() * 256)
  const arquivo = await escreverPng({ largura: 33, altura: 17, dados: rgba, icc: perfilIcc('srgb'), nomeDoPerfil: '  Perfil   com\u0001 espaços e ção  ' })
  const lido = await lerPng(arquivo)
  assert.equal(lido.canais, 3)
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) assert.equal(lido.dados[p * 3 + c], rgba[p * 4 + c])
  assert.equal(lido.nomeDoPerfil, 'Perfil com espaços e ção')
  assert.equal(lido.exif, null)
  assert.equal(lido.xmp, null)
  // sem perfil, sem iCCP
  assert.ok(!(await lerPng(await escreverPng({ largura: 33, altura: 17, dados: rgba }))).pedacos.includes('iCCP'))

  const estragado = arquivo.slice()
  estragado[estragado.length - 30] ^= 0xff
  await assert.rejects(lerPng(estragado), /CRC/)
  await assert.rejects(lerPng(arquivo.subarray(0, arquivo.length - 20)), /cortado|passa do fim/)
  await assert.rejects(lerPng(new Uint8Array(64)), /assinatura/)
  await assert.rejects(escreverPng({ largura: 33, altura: 17, dados: new Uint16Array(n * 3), bits: 8 }), /8 bits/)
  await assert.rejects(escreverPng({ largura: 33, altura: 17, dados: new Uint8Array(n * 3 + 1) }), /amostras/)
})

test('PNG: uma linha só, um pixel só e imagem lisa', async () => {
  for (const [largura, altura] of [
    [1, 1],
    [300, 1],
    [1, 300],
  ]) {
    const dados = new Uint16Array(largura * altura * 3).map((_, i) => (i * 7919) & 0xffff)
    const lido = await lerPng(await escreverPng({ largura, altura, dados, bits: 16 }))
    assert.deepEqual(lido.dados, dados, `${largura} × ${altura}`)
    const t = await lerTiff(await escreverTiff({ largura, altura, dados, bits: 16, compressao: 'deflate' }))
    assert.deepEqual(t.dados, dados, `TIFF ${largura} × ${altura}`)
  }
  const liso = new Uint8Array(200 * 200 * 3).fill(128)
  const arquivo = await escreverPng({ largura: 200, altura: 200, dados: liso })
  assert.ok(arquivo.length < 2000, `imagem lisa comprime muito (${arquivo.length} bytes)`)
  assert.deepEqual((await lerPng(arquivo)).dados, liso)
})

test('Chromium: PNG de 8 e 16 bits abrem, com os pixels certos numa tela Display P3', { skip: semChromium, timeout: 240000 }, async () => {
  const cena = cenaDeTeste(96, 64, 4)
  const rgb8 = paraRgb8(cena)
  const navegador = await abrirChromium()
  try {
    const pagina = await navegador.newPage()
    await pagina.goto('about:blank')
    const abrir = (bytes) =>
      pagina.evaluate(async (b64) => {
        const dados = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const bmp = await createImageBitmap(new Blob([dados], { type: 'image/png' }))
        const quadro = new OffscreenCanvas(bmp.width, bmp.height)
        const ctx = quadro.getContext('2d', { colorSpace: 'display-p3' })
        ctx.drawImage(bmp, 0, 0)
        return { largura: bmp.width, altura: bmp.height, rgba: Array.from(ctx.getImageData(0, 0, bmp.width, bmp.height, { colorSpace: 'display-p3' }).data) }
      }, base64(bytes))
    for (const [bits, compressao] of [
      [8, 'auto'],
      [8, 'nenhuma'],
      [16, 'auto'],
    ]) {
      const png = await escreverPng({ largura: 96, altura: 64, dados: bits === 8 ? rgb8 : paraRgb16(cena), bits, icc: perfilIcc('p3'), compressao })
      const aberto = await abrir(png)
      assert.deepEqual([aberto.largura, aberto.altura], [96, 64])
      let pior = 0
      for (let p = 0; p < 96 * 64; p++) for (let c = 0; c < 3; c++) pior = Math.max(pior, Math.abs(aberto.rgba[p * 4 + c] - rgb8[p * 3 + c]))
      // P3 em tela P3 é identidade; sobra o arredondamento de 16 para 8 bits e o da conversão do navegador
      assert.ok(pior <= 1, `PNG ${bits} bits (${compressao}): diferença máxima ${pior}`)
    }
  } finally {
    await navegador.close()
  }
})
