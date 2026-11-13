// JPEG: o codificador baseline próprio (conferido por um decodificador independente no apoio e pelo Chromium), a
// cirurgia de embutir perfil, EXIF e XMP, e a limpeza para a galeria do cliente.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lerExif } from '../src/raw/exif.js'
import { montarExif } from '../src/exportar/exif-escrever.js'
import { espacoDoPerfil, perfilIcc } from '../src/exportar/icc.js'
import {
  TABELAS_DE_HUFFMAN,
  ZIGUEZAGUE,
  codificarJpeg,
  embutirNoJpeg,
  extrairDoJpeg,
  lerSegmentosJpeg,
  limparJpeg,
  tabelaDeQuantizacao,
} from '../src/exportar/jpeg.js'
import { TIPO, lerBlocoTiff, montarBlocoTiff } from '../src/exportar/tiff.js'
import { pacoteXmp } from '../src/exportar/xmp.js'
import { abrirChromium, base64, cenaDeTeste, comparar8, decodificarJpeg, paraRgb8, semChromium, sorteio } from './apoio-exportar.js'

const CENA = cenaDeTeste(259, 173, 7) // nem múltiplo de 8 nem de 16: as bordas entram no teste
const RGB = paraRgb8(CENA)
const codificar = (qualidade, subamostragem = '444', rgb8 = RGB, largura = CENA.largura, altura = CENA.altura) =>
  codificarJpeg({ largura, altura, rgb8, qualidade, subamostragem })
const marcadores = (jpeg) => lerSegmentosJpeg(jpeg).map((s) => s.marcador)
const assinatura = (jpeg, s, n) => String.fromCharCode(...jpeg.subarray(s.dados[0], s.dados[0] + n))

// T.81, K.1 (tabela K.1, luminância): os 64 passos de exemplo, linha a linha
const K1 = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103,
  77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]

test('JPEG: tabelas de Huffman típicas coerentes (T.81, K.3) e ziguezague é a permutação da figura A.6', () => {
  for (const [nome, t] of Object.entries(TABELAS_DE_HUFFMAN)) {
    const total = t.bits.reduce((s, b) => s + b, 0)
    assert.equal(t.bits.length, 16, nome)
    assert.equal(total, t.valores.length, `${nome}: BITS soma o número de valores`)
    assert.equal(new Set(t.valores).size, t.valores.length, `${nome}: sem valor repetido`)
    // desigualdade de Kraft: os códigos cabem numa árvore binária (com folga: o código só de uns é proibido)
    assert.ok(t.bits.reduce((s, b, i) => s + b / 2 ** (i + 1), 0) < 1, `${nome}: códigos formam um prefixo válido`)
  }
  // DC: categorias 0 a 11. AC: toda combinação de corrida 0–15 com tamanho 1–10, mais fim de bloco (00) e 16 zeros (F0)
  for (const nome of ['dcLuz', 'dcCroma'])
    assert.deepEqual(
      [...TABELAS_DE_HUFFMAN[nome].valores].sort((a, b) => a - b),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    )
  const esperados = [0x00, 0xf0]
  for (let corrida = 0; corrida < 16; corrida++) for (let tamanho = 1; tamanho <= 10; tamanho++) esperados.push((corrida << 4) | tamanho)
  esperados.sort((a, b) => a - b)
  for (const nome of ['acLuz', 'acCroma'])
    assert.deepEqual(
      [...TABELAS_DE_HUFFMAN[nome].valores].sort((a, b) => a - b),
      esperados,
      nome,
    )

  assert.deepEqual(
    [...ZIGUEZAGUE].sort((a, b) => a - b),
    Array.from({ length: 64 }, (_, i) => i),
  )
  assert.deepEqual(ZIGUEZAGUE.slice(0, 16), [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5])
  assert.deepEqual(ZIGUEZAGUE.slice(-4), [47, 55, 62, 63])
})

test('JPEG: a escala de qualidade é a do libjpeg (50 = tabela da norma, 100 = tudo 1)', () => {
  assert.deepEqual(Array.from(tabelaDeQuantizacao(K1, 50)), K1)
  assert.ok(tabelaDeQuantizacao(K1, 100).every((v) => v === 1))
  // 75 → fator 50: (16·50 + 50)/100 = 8; 25 → fator 200: 32; 1 → fator 5000, preso em 255
  assert.equal(tabelaDeQuantizacao(K1, 75)[0], 8)
  assert.equal(tabelaDeQuantizacao(K1, 25)[0], 32)
  assert.ok(tabelaDeQuantizacao(K1, 1).every((v) => v === 255))
  assert.deepEqual(tabelaDeQuantizacao(K1, 500), tabelaDeQuantizacao(K1, 100), 'qualidade fora da faixa é presa')
  // a tabela que vai no arquivo é a escalada, em ziguezague
  const jpeg = codificar(75)
  const dqt = lerSegmentosJpeg(jpeg).find((s) => s.marcador === 0xdb)
  assert.equal(jpeg[dqt.dados[0]], 0, 'tabela 0, 8 bits')
  const esperada = tabelaDeQuantizacao(K1, 75)
  assert.deepEqual(
    Array.from(jpeg.subarray(dqt.dados[0] + 1, dqt.dados[0] + 65)),
    ZIGUEZAGUE.map((i) => esperada[i]),
  )
})

test('JPEG: estrutura baseline (SOI, JFIF, DQT, SOF0, DHT, SOS, EOI) e tamanho da imagem no SOF0', () => {
  for (const sub of ['444', '420']) {
    const jpeg = codificar(90, sub)
    assert.deepEqual(marcadores(jpeg), [0xd8, 0xe0, 0xdb, 0xdb, 0xc0, 0xc4, 0xc4, 0xc4, 0xc4, 0xda, 0xd9])
    const lista = lerSegmentosJpeg(jpeg)
    assert.equal(lista.resto, jpeg.length, 'nada depois do EOI')
    assert.equal(assinatura(jpeg, lista[1], 5), 'JFIF\0')
    const sof = lista.find((s) => s.marcador === 0xc0)
    const d = sof.dados[0]
    assert.equal(jpeg[d], 8, 'precisão de 8 bits')
    assert.equal((jpeg[d + 1] << 8) | jpeg[d + 2], CENA.altura)
    assert.equal((jpeg[d + 3] << 8) | jpeg[d + 4], CENA.largura)
    assert.equal(jpeg[d + 5], 3, 'três componentes')
    assert.equal(jpeg[d + 7], sub === '420' ? 0x22 : 0x11, 'fatores de amostragem da luz')
    assert.deepEqual([jpeg[d + 10], jpeg[d + 13]], [0x11, 0x11], 'croma 1×1')
    // nos dados comprimidos, todo FF é seguido de 00 (byte de enchimento) — não pode haver marcador solto
    const sos = lista.find((s) => s.marcador === 0xda)
    for (let i = sos.dados[1]; i < sos.fim - 1; i++) if (jpeg[i] === 0xff) assert.equal(jpeg[i + 1], 0, `FF sem enchimento em ${i}`)
  }
})

test('JPEG: o que foi codificado decodifica, com erro dentro do esperado para a qualidade', () => {
  // Limites medidos nesta cena (ruído, textura fina e bordas duras de cor) e conferidos com o libjpeg na mesma
  // qualidade: 4:4:4 q92 dá 40,0 dB (libjpeg 40,0); 4:2:0 q92 dá 29,6 dB (libjpeg 29,6: a borda de cor é o que custa).
  const casos = [
    { qualidade: 100, sub: '444', psnr: 49, medio: 0.6 },
    { qualidade: 92, sub: '444', psnr: 38.5, medio: 2.1 },
    { qualidade: 75, sub: '444', psnr: 33, medio: 3.6 },
    { qualidade: 50, sub: '444', psnr: 30, medio: 4.8 },
    { qualidade: 92, sub: '420', psnr: 28.5, medio: 4.0 },
    { qualidade: 75, sub: '420', psnr: 27.5, medio: 5.4 },
  ]
  for (const { qualidade, sub, psnr, medio } of casos) {
    const jpeg = codificar(qualidade, sub)
    const d = decodificarJpeg(jpeg)
    assert.deepEqual([d.largura, d.altura], [CENA.largura, CENA.altura])
    assert.deepEqual(
      d.amostragem,
      sub === '420'
        ? [
            [2, 2],
            [1, 1],
            [1, 1],
          ]
        : [
            [1, 1],
            [1, 1],
            [1, 1],
          ],
    )
    const erro = comparar8(d.rgb, RGB)
    assert.ok(erro.psnr >= psnr, `q${qualidade} ${sub}: PSNR ${erro.psnr.toFixed(2)} dB, esperado ≥ ${psnr}`)
    assert.ok(erro.medio <= medio, `q${qualidade} ${sub}: erro médio ${erro.medio.toFixed(2)}, esperado ≤ ${medio}`)
  }
})

test('JPEG: mais qualidade, menos erro e mais bytes; 4:2:0 é menor que 4:4:4', () => {
  let anterior = null
  for (const qualidade of [10, 30, 50, 70, 85, 95, 100]) {
    const jpeg = codificar(qualidade)
    const erro = comparar8(decodificarJpeg(jpeg).rgb, RGB).psnr
    if (anterior) {
      assert.ok(jpeg.length > anterior.bytes, `q${qualidade}: arquivo maior que o da qualidade anterior`)
      assert.ok(erro > anterior.erro, `q${qualidade}: erro menor que o da qualidade anterior`)
    }
    anterior = { bytes: jpeg.length, erro }
  }
  assert.ok(codificar(85, '420').length < codificar(85, '444').length)
})

test('JPEG: cor lisa sai exata, e a croma não vaza em 4:2:0', () => {
  for (const cor of [
    [128, 128, 128],
    [0, 0, 0],
    [255, 255, 255],
    [200, 40, 90],
    [10, 180, 240],
  ]) {
    for (const sub of ['444', '420']) {
      const rgb = new Uint8Array(50 * 37 * 3)
      for (let i = 0; i < rgb.length; i += 3) rgb.set(cor, i)
      const d = decodificarJpeg(codificar(95, sub, rgb, 50, 37))
      const erro = comparar8(d.rgb, rgb)
      assert.ok(erro.maior <= 2, `${cor} ${sub}: diferença máxima ${erro.maior}`)
    }
  }
})

test('JPEG: tamanhos de borda (1 × 1, 8 × 8, 17 × 9, 16 × 33) e entrada RGBA', () => {
  const r = sorteio(31)
  for (const [largura, altura] of [
    [1, 1],
    [8, 8],
    [17, 9],
    [16, 33],
    [7, 64],
  ]) {
    // degradê suave: o que interessa aqui é a borda do bloco, não a textura
    const rgb = new Uint8Array(largura * altura * 3)
    for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) rgb.set([40 + x * 5, 60 + y * 3, 200 - x * 2 - y], (y * largura + x) * 3)
    for (const sub of ['444', '420']) {
      const d = decodificarJpeg(codificar(95, sub, rgb, largura, altura))
      assert.deepEqual([d.largura, d.altura], [largura, altura])
      assert.ok(comparar8(d.rgb, rgb).medio < 2.5, `${largura} × ${altura} ${sub}: erro médio ${comparar8(d.rgb, rgb).medio}`)
    }
  }
  // RGBA (o que paraBytes entrega) dá exatamente o mesmo arquivo que RGB
  const rgba = new Uint8ClampedArray(CENA.largura * CENA.altura * 4)
  for (let p = 0; p < CENA.largura * CENA.altura; p++) {
    rgba.set(RGB.subarray(p * 3, p * 3 + 3), p * 4)
    rgba[p * 4 + 3] = Math.floor(r() * 256)
  }
  assert.deepEqual(codificar(90, '444', rgba), codificar(90))
  assert.throws(() => codificar(90, '444', new Uint8Array(10)), /amostras/)
  assert.throws(() => codificar(90, '411'), /subamostragem/)
  assert.throws(() => codificarJpeg({ largura: 70000, altura: 1, rgb8: new Uint8Array(210000) }), /65535/)
})

test('JPEG: mesma entrada, mesmos bytes', () => {
  assert.deepEqual(codificar(88, '420'), codificar(88, '420'))
})

const EXIF = montarExif(
  { fabricante: 'Fabricante', modelo: 'Modelo', data: '2026-01-02T03:04:05', iso: 100, tempo: 1 / 60, abertura: 5.6, focal: 85 },
  { software: 'Programa de teste', largura: CENA.largura, altura: CENA.altura, espaco: 'p3' },
)
const XMP = pacoteXmp({ estrelas: 4, marca: 'escolhida' })

test('embutirNoJpeg: EXIF, XMP e perfil entram na ordem certa e a imagem não muda', () => {
  const base = codificar(90)
  const icc = perfilIcc('p3')
  const jpeg = embutirNoJpeg(base, { icc, exif: EXIF, xmp: XMP })
  assert.deepEqual(marcadores(jpeg), [0xd8, 0xe0, 0xe1, 0xe1, 0xe2, 0xdb, 0xdb, 0xc0, 0xc4, 0xc4, 0xc4, 0xc4, 0xda, 0xd9])
  const lista = lerSegmentosJpeg(jpeg)
  assert.equal(assinatura(jpeg, lista[1], 5), 'JFIF\0')
  assert.equal(assinatura(jpeg, lista[2], 6), 'Exif\0\0')
  assert.equal(assinatura(jpeg, lista[3], 29), 'http://ns.adobe.com/xap/1.0/\0')
  assert.equal(assinatura(jpeg, lista[4], 12), 'ICC_PROFILE\0')
  assert.deepEqual([jpeg[lista[4].dados[0] + 12], jpeg[lista[4].dados[0] + 13]], [1, 1], 'pedaço 1 de 1')
  // cada segmento declara o próprio tamanho
  for (const s of lista.slice(1, -1)) assert.equal((jpeg[s.inicio + 2] << 8) | jpeg[s.inicio + 3], s.dados[1] - s.dados[0] + 2)

  const dentro = extrairDoJpeg(jpeg)
  assert.deepEqual(dentro.icc, icc)
  assert.equal(espacoDoPerfil(dentro.icc), 'p3')
  assert.deepEqual(dentro.exif, EXIF)
  assert.equal(dentro.xmp, XMP)
  assert.equal(lerExif(jpeg).iso, 100)
  // a imagem é a mesma, byte a byte, do SOF em diante, e decodifica igual
  const corte = (j) => j.subarray(lerSegmentosJpeg(j).find((s) => s.marcador === 0xdb).inicio)
  assert.deepEqual(corte(jpeg), corte(base))
  assert.deepEqual(decodificarJpeg(jpeg).rgb, decodificarJpeg(base).rgb)
  assert.deepEqual(extrairDoJpeg(base), { icc: null, exif: null, xmp: null })
})

test('embutirNoJpeg: substitui o que já existe (nunca duplica) e mantém o que não foi passado', () => {
  const base = embutirNoJpeg(codificar(90), { icc: perfilIcc('srgb'), exif: EXIF, xmp: XMP })
  // de novo, trocando só o perfil: continua um EXIF, um XMP e um ICC
  const trocado = embutirNoJpeg(base, { icc: perfilIcc('p3') })
  assert.deepEqual(marcadores(trocado), marcadores(base))
  assert.equal(espacoDoPerfil(extrairDoJpeg(trocado).icc), 'p3')
  assert.deepEqual(extrairDoJpeg(trocado).exif, EXIF)
  assert.equal(extrairDoJpeg(trocado).xmp, XMP)
  // trocando tudo três vezes seguidas o número de segmentos não cresce
  let atual = base
  for (let i = 0; i < 3; i++) atual = embutirNoJpeg(atual, { icc: perfilIcc('adobe'), exif: EXIF, xmp: pacoteXmp({ estrelas: i }) })
  assert.deepEqual(marcadores(atual), marcadores(base))
  assert.equal(extrairDoJpeg(atual).xmp, pacoteXmp({ estrelas: 2 }))
  // sem nada para embutir, a ordem é normalizada e o conteúdo fica
  assert.deepEqual(embutirNoJpeg(base), base)
  // comentário e outros segmentos de terceiros ficam onde estavam, depois dos metadados
  const comComentario = new Uint8Array(base.length + 9)
  comComentario.set(base.subarray(0, 2))
  comComentario.set([0xff, 0xfe, 0, 7, 0x6f, 0x6c, 0x61, 0x21, 0x21], 2)
  comComentario.set(base.subarray(2), 11)
  const depois = embutirNoJpeg(comComentario, { xmp: 'novo' })
  assert.deepEqual(marcadores(depois), [0xd8, 0xe0, 0xe1, 0xe1, 0xe2, 0xfe, 0xdb, 0xdb, 0xc0, 0xc4, 0xc4, 0xc4, 0xc4, 0xda, 0xd9])
  assert.equal(extrairDoJpeg(depois).xmp, 'novo')
})

test('embutirNoJpeg: perfil grande vai em pedaços de até 64 KB, numerados e na ordem; extrair remonta', () => {
  const r = sorteio(77)
  const grande = Uint8Array.from({ length: 150000 }, () => Math.floor(r() * 256))
  const jpeg = embutirNoJpeg(codificar(80), { icc: grande })
  const lista = lerSegmentosJpeg(jpeg)
  const pedacos = lista.filter((s) => s.marcador === 0xe2)
  assert.equal(pedacos.length, 3) // 150000 / 65519 → 3
  pedacos.forEach((s, i) => {
    assert.equal(assinatura(jpeg, s, 12), 'ICC_PROFILE\0')
    assert.deepEqual([jpeg[s.dados[0] + 12], jpeg[s.dados[0] + 13]], [i + 1, 3], 'número do pedaço e total')
    assert.ok(s.fim - s.inicio <= 65535 + 2, 'cada segmento cabe em 64 KB')
  })
  assert.equal(pedacos[0].dados[1] - pedacos[0].dados[0], 65533, 'o primeiro pedaço enche o segmento')
  // consecutivos e antes das tabelas
  const indices = pedacos.map((s) => lista.indexOf(s))
  assert.deepEqual(indices, [indices[0], indices[0] + 1, indices[0] + 2])
  assert.ok(indices[2] < lista.findIndex((s) => s.marcador === 0xdb))
  assert.deepEqual(extrairDoJpeg(jpeg).icc, grande)
  assert.deepEqual(decodificarJpeg(jpeg).rgb, decodificarJpeg(codificar(80)).rgb)
  // o que não cabe num segmento só é recusado com clareza
  assert.throws(() => embutirNoJpeg(codificar(80), { xmp: 'x'.repeat(70000) }), /64 KB/)
  assert.throws(() => embutirNoJpeg(codificar(80), { exif: new Uint8Array(100) }), /bloco TIFF/)
  assert.throws(() => embutirNoJpeg(new Uint8Array([1, 2, 3, 4])), /SOI/)
})

// Um JPEG "de câmera": JFIF com miniatura, EXIF com orientação 6, GPS e número de série, XMP, IPTC (APP13), MPF (APP2),
// comentário, perfil ICC e um rabo depois do EOI.
function jpegDeCamera() {
  const base = codificar(85)
  const exif = montarBlocoTiff({
    entradas: [
      { tag: 0x010f, tipo: TIPO.ASCII, valores: 'Fabricante' },
      { tag: 0x0112, tipo: TIPO.SHORT, valores: 6 },
      { tag: 0x8769, filho: { entradas: [{ tag: 0xa431, tipo: TIPO.ASCII, valores: 'SERIE-123456' }] } },
      {
        tag: 0x8825,
        filho: {
          entradas: [
            { tag: 1, tipo: TIPO.ASCII, valores: 'S' },
            {
              tag: 2,
              tipo: TIPO.RACIONAL,
              valores: [
                [23, 1],
                [33, 1],
                [0, 1],
              ],
            },
          ],
        },
      },
    ],
  })
  const seg = (m, bytes) => Uint8Array.of(0xff, m, (bytes.length + 2) >> 8, (bytes.length + 2) & 0xff, ...bytes)
  const texto = (s) => Array.from(s, (c) => c.charCodeAt(0))
  const corpo = base.subarray(lerSegmentosJpeg(base).find((s) => s.marcador === 0xdb).inicio)
  const partes = [
    Uint8Array.of(0xff, 0xd8),
    seg(0xe0, [...texto('JFIF\0'), 1, 2, 1, 0, 72, 0, 72, 1, 1, 9, 9, 9]), // miniatura de 1 × 1
    seg(0xe0, [...texto('JFXX\0'), 0x13, 1, 1, 7, 7, 7]),
    seg(0xe1, [...texto('Exif\0\0'), ...exif]),
    seg(0xe1, [...texto('http://ns.adobe.com/xap/1.0/\0'), ...texto('<x:xmpmeta>segredo</x:xmpmeta>')]),
    seg(0xe1, [...texto('http://ns.adobe.com/xmp/extension/\0'), ...texto('mais')]),
    seg(0xe2, [...texto('MPF\0'), 1, 2, 3, 4]),
    seg(0xed, [...texto('Photoshop 3.0\0'), ...texto('legenda com nome de cliente')]),
    seg(0xee, [...texto('Adobe'), 0, 100, 0, 0, 0, 0, 1]),
    seg(0xfe, texto('comentário')),
  ]
  const comPerfil = embutirNoJpeg(new Uint8Array([...partes.flatMap((p) => [...p]), ...corpo]), { icc: perfilIcc('p3') })
  const rabo = texto('SEGUNDA IMAGEM OU VIDEO')
  const saida = new Uint8Array(comPerfil.length + rabo.length)
  saida.set(comPerfil)
  saida.set(rabo, comPerfil.length)
  return saida
}

const contem = (bytes, texto) => {
  const alvo = Array.from(texto, (c) => c.charCodeAt(0))
  for (let i = 0; i <= bytes.length - alvo.length; i++) {
    let igual = true
    for (let k = 0; k < alvo.length && igual; k++) igual = bytes[i + k] === alvo[k]
    if (igual) return true
  }
  return false
}

test('limparJpeg: tira EXIF, GPS, XMP, IPTC, MPF, comentário, miniatura e o que vem depois do fim', () => {
  const sujo = jpegDeCamera()
  assert.equal(lerExif(sujo).orientacao, 6)
  for (const texto of ['SERIE-123456', 'segredo', 'legenda com nome de cliente', 'SEGUNDA IMAGEM', 'MPF', 'JFXX'])
    assert.ok(contem(sujo, texto), `o arquivo de partida tem "${texto}"`)

  const limpo = limparJpeg(sujo)
  for (const texto of [
    'SERIE-123456',
    'segredo',
    'mais',
    'legenda com nome de cliente',
    'SEGUNDA IMAGEM',
    'MPF',
    'JFXX',
    'Fabricante',
    'comentário',
    'xmp',
    'Photoshop',
  ]) {
    assert.ok(!contem(limpo, texto), `"${texto}" saiu`)
  }
  // fica: SOI, JFIF (sem miniatura), o EXIF só com a orientação, o perfil, o APP14 da Adobe e a imagem
  assert.deepEqual(marcadores(limpo), [0xd8, 0xe0, 0xe1, 0xe2, 0xee, 0xdb, 0xdb, 0xc0, 0xc4, 0xc4, 0xc4, 0xc4, 0xda, 0xd9])
  const lista = lerSegmentosJpeg(limpo)
  assert.equal(lista.resto, limpo.length, 'o arquivo acaba no EOI')
  const jfif = lista[1]
  assert.equal(jfif.dados[1] - jfif.dados[0], 14, 'JFIF sem miniatura')
  assert.deepEqual([limpo[jfif.dados[0] + 12], limpo[jfif.dados[0] + 13]], [0, 0])
  // o EXIF que sobra tem uma tag só: a orientação (senão a foto deitaria)
  const { exif, icc, xmp } = extrairDoJpeg(limpo)
  const { diretorio } = lerBlocoTiff(exif)
  assert.deepEqual(
    diretorio.entradas.map((e) => [e.tag, e.valores[0]]),
    [[0x0112, 6]],
  )
  assert.deepEqual(diretorio.filhos, {}, 'sem ExifIFD nem GPS')
  assert.deepEqual(lerExif(limpo), { orientacao: 6 })
  assert.equal(xmp, null)
  assert.equal(espacoDoPerfil(icc), 'p3', 'o perfil fica: sem ele a cor mudaria')
  // a imagem é a mesma
  assert.deepEqual(decodificarJpeg(limpo).rgb, decodificarJpeg(codificar(85)).rgb)
  // limpar de novo não muda mais nada
  assert.deepEqual(limparJpeg(limpo), limpo)
})

test('limparJpeg: opções (sem perfil, sem orientação) e arquivo que já está de pé não ganha EXIF', () => {
  const sujo = jpegDeCamera()
  const semPerfil = limparJpeg(sujo, { manterIcc: false })
  assert.equal(extrairDoJpeg(semPerfil).icc, null)
  assert.ok(!marcadores(semPerfil).includes(0xe2))
  const semGiro = limparJpeg(sujo, { manterOrientacao: false })
  assert.equal(extrairDoJpeg(semGiro).exif, null)
  assert.ok(!marcadores(semGiro).includes(0xe1))
  // exportação nossa: orientação 1 → nenhum APP1 sobra
  const nosso = embutirNoJpeg(codificar(90), { icc: perfilIcc('srgb'), exif: EXIF, xmp: XMP })
  const limpo = limparJpeg(nosso)
  assert.deepEqual(marcadores(limpo), [0xd8, 0xe0, 0xe2, 0xdb, 0xdb, 0xc0, 0xc4, 0xc4, 0xc4, 0xc4, 0xda, 0xd9])
  assert.deepEqual(lerExif(limpo), { orientacao: 1 })
  // EXIF estragado não derruba a limpeza
  const estragado = sujo.slice()
  const app1 = lerSegmentosJpeg(estragado).find((s) => s.marcador === 0xe1)
  estragado.fill(0xaa, app1.dados[0] + 6, app1.dados[1])
  assert.ok(!marcadores(limparJpeg(estragado)).includes(0xe1))
})

test('Chromium: o JPEG do codificador próprio abre, com o erro esperado, e o perfil P3 embutido vale', { skip: semChromium, timeout: 240000 }, async () => {
  const navegador = await abrirChromium()
  try {
    const pagina = await navegador.newPage()
    await pagina.goto('about:blank')
    const abrir = (bytes, tela) =>
      pagina.evaluate(
        async ({ b64, tela }) => {
          const dados = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
          const bmp = await createImageBitmap(new Blob([dados], { type: 'image/jpeg' }))
          const quadro = new OffscreenCanvas(bmp.width, bmp.height)
          const ctx = quadro.getContext('2d', { colorSpace: tela })
          ctx.drawImage(bmp, 0, 0)
          return { largura: bmp.width, altura: bmp.height, rgba: Array.from(ctx.getImageData(0, 0, bmp.width, bmp.height, { colorSpace: tela }).data) }
        },
        { b64: base64(bytes), tela },
      )
    const semAlfa = (rgba) => Uint8Array.from({ length: (rgba.length / 4) * 3 }, (_, i) => rgba[((i / 3) | 0) * 4 + (i % 3)])
    // P3 em tela P3: o navegador devolve os códigos do arquivo. Os limites são os do teste com o decodificador
    // próprio, com folga para a reconstrução de croma do navegador (que em 4:2:0 interpola em vez de repetir).
    for (const { qualidade, sub, psnr } of [
      { qualidade: 100, sub: '444', psnr: 47 },
      { qualidade: 92, sub: '444', psnr: 38 },
      { qualidade: 92, sub: '420', psnr: 28.5 },
      { qualidade: 60, sub: '420', psnr: 27 },
    ]) {
      const jpeg = embutirNoJpeg(codificar(qualidade, sub), { icc: perfilIcc('p3'), exif: EXIF, xmp: XMP })
      const aberto = await abrir(jpeg, 'display-p3')
      assert.deepEqual([aberto.largura, aberto.altura], [CENA.largura, CENA.altura])
      const erro = comparar8(semAlfa(aberto.rgba), RGB)
      assert.ok(erro.psnr >= psnr, `q${qualidade} ${sub} no Chromium: ${erro.psnr.toFixed(2)} dB, esperado ≥ ${psnr}`)
      // e o nosso decodificador concorda com o do navegador no 4:4:4 (os dois reconstroem o mesmo arquivo)
      if (sub === '444') {
        const entreOsDois = comparar8(semAlfa(aberto.rgba), decodificarJpeg(jpeg).rgb)
        assert.ok(entreOsDois.medio < 0.6 && entreOsDois.maior <= 3, `decodificadores divergem: médio ${entreOsDois.medio}, máximo ${entreOsDois.maior}`)
      }
    }
    // cor lisa em P3: numa tela sRGB o navegador converte pelo perfil; sem perfil, passa direto
    const liso = new Uint8Array(32 * 32 * 3)
    for (let i = 0; i < liso.length; i += 3) liso.set([200, 120, 60], i)
    const base = codificar(100, '444', liso, 32, 32)
    const comPerfil = (await abrir(embutirNoJpeg(base, { icc: perfilIcc('p3') }), 'srgb')).rgba.slice(0, 3)
    const semPerfil = (await abrir(base, 'srgb')).rgba.slice(0, 3)
    assert.ok(Math.abs(semPerfil[0] - 200) <= 1 && Math.abs(semPerfil[1] - 120) <= 1 && Math.abs(semPerfil[2] - 60) <= 1, `sem perfil: ${semPerfil}`)
    // P3 (200, 120, 60) → sRGB: mais saturado, o vermelho sobe e o azul desce
    assert.ok(comPerfil[0] > 205 && comPerfil[2] < 55, `com perfil P3 a cor é convertida: ${comPerfil}`)
  } finally {
    await navegador.close()
  }
})
