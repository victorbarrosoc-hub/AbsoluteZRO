// Leitura de RAW: DNG fabricado (ida e volta bit a bit), leitor próprio de DNG (sem compressão, empacotado, JPEG
// lossless), opcodes, e o LibRaw sobre o mesmo dado. Com as amostras CC0 em .amostras: os 12 arquivos da pesquisa.

import test from 'node:test'
import assert from 'node:assert/strict'

import { criarNegativo, corEm, pretoEm } from '../src/raw/negativo.js'
import { lerDng, lerTagsDng, escreverDng, decodificarJpegSemPerdas, ErroRaw } from '../src/raw/dng.js'
import { lerOpcodes, escreverOpcodes, aplicarOpcodes } from '../src/raw/opcodes.js'
import { criarLeitor, abrirRaw, usarLibRaw } from '../src/raw/libraw.js'
import {
  fabricarNegativo,
  jpegFalso,
  montarTiff,
  codificarJpegSemPerdas,
  acaso,
  juntar,
  carregarLibRaw,
  precisaDoLibRaw,
  precisaDeAmostras,
  lerAmostra,
  AMOSTRAS,
} from './apoio-raw.js'

const iguais = (a, b) => a.length === b.length && Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength))
const perto = (a, b, tol, nome) => assert.ok(Math.abs(a - b) <= tol, `${nome}: ${a} deveria estar a ${tol} de ${b}`)
const listaPerto = (a, b, tol, nome) => {
  assert.equal(a.length, b.length, nome)
  a.forEach((v, i) => perto(v, b[i], tol, `${nome}[${i}]`))
}

/** Negativo com tudo o que o contrato e o DNG carregam, para a ida e volta. */
function negativoCompleto() {
  const n = fabricarNegativo({
    largura: 320,
    altura: 240,
    esquerda: 13,
    topo: 5,
    cfa: 'GRBG',
    preto: 600,
    pretoPadrao: { linhas: 2, colunas: 2, valores: Float32Array.of(0, 0.5, -0.25, 1) },
    corte: 15000,
    declarado: 16000,
    semente: 11,
    exposicaoBase: 0.35,
  })
  n.cor = {
    origem: 'dng',
    matrizes: [
      {
        kelvin: 2850,
        xyzParaCamera: [0.9962, -0.4568, -0.1468, -0.4629, 1.4161, 0.2815, -0.0258, 0.0995, 0.7301],
        cameraParaXyzD50: [0.7868, 0.0092, 0.1683, 0.2291, 0.8615, -0.0906, 0.0027, -0.4752, 1.2976],
      },
      {
        kelvin: 6500,
        xyzParaCamera: [0.7368, -0.2173, -0.0873, -0.4603, 1.2249, 0.1974, -0.0821, 0.1363, 0.473],
        cameraParaXyzD50: [0.7637, 0.0805, 0.1201, 0.2649, 0.9179, -0.1828, 0.0137, -0.2456, 1.057],
      },
    ],
    neutroComoFotografado: [0.5, 1, 0.625],
  }
  n.wb = { comoFotografado: [2, 1, 1.6] }
  n.perfilRuido = [
    { escala: 1.25e-5, deslocamento: 1.5e-7 },
    { escala: 7.5e-6, deslocamento: 5e-8 },
    { escala: 1.3e-5, deslocamento: 1.25e-7 },
  ]
  n.recorte = { x: 8, y: 6, largura: 300, altura: 224 }
  n.exif = { data: '2026-11-13T09:41:07', subsegundo: 0.37, iso: 400, tempo: 1 / 250, abertura: 2.8, focal: 35, lente: 'ZRO 35mm f/1.4', orientacao: 1 }
  n.previa = { jpeg: jpegFalso({ largura: 320, altura: 214 }), largura: 320, altura: 214 }
  n.opcodes = {
    lista2: [
      {
        id: 9,
        nome: 'GainMap',
        versao: '1.3.0.0',
        opcional: false,
        area: { topo: 0, esquerda: 0, base: 240, direita: 320 },
        plano: 0,
        planos: 1,
        passoLinha: 2,
        passoColuna: 2,
        pontosV: 2,
        pontosH: 3,
        espacoV: 1,
        espacoH: 0.5,
        origemV: 0,
        origemH: 0,
        planosDoMapa: 1,
        ganhos: Float32Array.of(1, 1.5, 2, 1.25, 1.75, 2.25),
      },
    ],
  }
  return criarNegativo(n)
}

test('DNG fabricado: escrever e ler de volta devolve o mesmo negativo, bit a bit', () => {
  const n = negativoCompleto()
  const bytes = escreverDng(n)
  const lido = lerDng(bytes)

  assert.equal(lido.tipo, 'raw')
  assert.equal(lido.formato, 'dng')
  assert.equal(lido.fabricante, 'ZRO')
  assert.equal(lido.modelo, 'Sintetica')
  assert.equal(lido.sensor.largura, n.sensor.largura)
  assert.equal(lido.sensor.altura, n.sensor.altura)
  assert.ok(iguais(lido.sensor.dados, n.sensor.dados), 'mosaico idêntico')
  assert.deepEqual(lido.area, n.area)
  assert.deepEqual(lido.cfa, n.cfa)
  // o preto pode voltar repartido de outro jeito entre porCanal e padrão: o que vale é o preto de cada sensel
  for (let l = 0; l < 8; l++) for (let c = 0; c < 8; c++) perto(pretoEm(lido, l, c), pretoEm(n, l, c), 1e-4, `preto em ${l},${c}`)
  assert.deepEqual(lido.branco.declarado, [16000, 16000, 16000])
  assert.equal(lido.cor.origem, 'dng')
  assert.equal(lido.cor.matrizes.length, 2)
  lido.cor.matrizes.forEach((m, i) => {
    assert.equal(m.kelvin, n.cor.matrizes[i].kelvin)
    listaPerto(m.xyzParaCamera, n.cor.matrizes[i].xyzParaCamera, 1e-6, 'xyzParaCamera')
    listaPerto(m.cameraParaXyzD50, n.cor.matrizes[i].cameraParaXyzD50, 1e-6, 'cameraParaXyzD50')
    assert.equal(m.calibracao, undefined)
  })
  listaPerto(lido.cor.neutroComoFotografado, [0.5, 1, 0.625], 1e-9, 'neutro')
  listaPerto(lido.wb.comoFotografado, [2, 1, 1.6], 1e-9, 'wb')
  perto(lido.exposicaoBase, 0.35, 1e-9, 'exposição base')
  assert.deepEqual(lido.perfilRuido, n.perfilRuido)
  assert.deepEqual(lido.recorte, n.recorte)
  assert.deepEqual(lido.exif, n.exif)
  assert.ok(iguais(lido.previa.jpeg, n.previa.jpeg), 'prévia idêntica')
  assert.equal(lido.previa.largura, 320)
  assert.equal(lido.previa.altura, 214)
  const mapa = lido.opcodes.lista2[0]
  assert.equal(mapa.nome, 'GainMap')
  assert.equal(mapa.aplicavel, true)
  assert.deepEqual([...mapa.ganhos], [1, 1.5, 2, 1.25, 1.75, 2.25])
  assert.deepEqual(mapa.area, { topo: 0, esquerda: 0, base: 240, direita: 320 })

  // lerTagsDng: os mesmos campos de cor, sem decodificar o mosaico
  const tags = lerTagsDng(bytes)
  assert.equal(tags.versao, '1.4.0.0')
  assert.equal(tags.linear, false)
  assert.equal(tags.compressao, 1)
  assert.deepEqual(tags.cor, lido.cor)
  assert.deepEqual(tags.mosaico.area, n.area)
  assert.deepEqual(tags.recorte, n.recorte)
})

test('DNG fabricado: X-Trans (6×6), um iluminante só, sem campos opcionais', () => {
  const n = criarNegativo(fabricarNegativo({ largura: 126, altura: 96, topo: 6, cfa: 'XTRANS', preto: 1022, semente: 5 }))
  const lido = lerDng(escreverDng(n))
  assert.equal(lido.cfa.tipo, 'xtrans')
  assert.deepEqual(lido.cfa, n.cfa)
  assert.ok(iguais(lido.sensor.dados, n.sensor.dados))
  assert.deepEqual(lido.preto, { porCanal: [1022, 1022, 1022] })
  assert.equal(lido.cor.matrizes.length, 1)
  assert.equal(lido.cor.matrizes[0].kelvin, 6500)
  assert.equal(lido.perfilRuido, undefined)
  assert.equal(lido.recorte, undefined)
  assert.equal(lido.previa, undefined)
  assert.equal(lido.exposicaoBase, 0)
  for (let l = 0; l < 12; l++) for (let c = 0; c < 12; c++) assert.equal(corEm(lido, l, c), corEm(n, l, c))
})

// Tags mínimas de um DNG CFA para o montador de TIFF dos testes
const tagsDeDng = ({ largura, altura, bits, compressao, extra = [] }) => [
  [0x00fe, 4, 0],
  [0x0100, 4, largura],
  [0x0101, 4, altura],
  [0x0102, 3, bits],
  [0x0103, 3, compressao],
  [0x0106, 3, 32803],
  [0x0115, 3, 1],
  [0x828d, 3, [2, 2]],
  [0x828e, 1, Uint8Array.of(0, 1, 1, 2)],
  [0xc612, 1, Uint8Array.of(1, 4, 0, 0)],
  [0xc61a, 5, [[64, 1]]],
  [0xc61d, 4, (1 << bits) - 1],
  [0xc621, 10, [8000, -2000, -1000, -4000, 12000, 2000, -1000, 2000, 6000].map((v) => [v, 10000])],
  [0xc65a, 3, 21],
  [
    0xc628,
    5,
    [
      [1, 2],
      [1, 1],
      [2, 3],
    ],
  ],
  ...extra,
]

test('leitor próprio de DNG: 12 bits empacotados, big-endian, em duas tiras', () => {
  const largura = 37 // ímpar de propósito: cada linha termina em meio byte e a seguinte começa em byte inteiro
  const altura = 20
  const rng = acaso(3)
  const dados = Uint16Array.from({ length: largura * altura }, () => Math.floor(rng.u() * 4096))
  const porLinha = Math.ceil((largura * 12) / 8)
  const empacotar = (y0, y1) => {
    const b = new Uint8Array((y1 - y0) * porLinha)
    for (let y = y0; y < y1; y++) {
      let acumulado = 0
      let tem = 0
      let q = (y - y0) * porLinha
      for (let x = 0; x < largura; x++) {
        acumulado = (acumulado << 12) | dados[y * largura + x]
        tem += 12
        while (tem >= 8) {
          b[q++] = (acumulado >> (tem - 8)) & 255
          tem -= 8
        }
      }
      if (tem) b[q] = (acumulado << (8 - tem)) & 255
    }
    return b
  }
  const { bytes } = montarTiff({
    le: false,
    blocos: [
      {
        nome: 'ifd0',
        ifd: tagsDeDng({
          largura,
          altura,
          bits: 12,
          compressao: 1,
          extra: [
            [0x0111, 4, [{ pos: 't1' }, { pos: 't2' }]],
            [0x0116, 4, 12],
            [0x0117, 4, [{ tam: 't1' }, { tam: 't2' }]],
          ],
        }),
      },
      { nome: 't1', bytes: empacotar(0, 12) },
      { nome: 't2', bytes: empacotar(12, 20) },
    ],
  })
  const n = lerDng(bytes)
  assert.ok(iguais(n.sensor.dados, dados))
  assert.deepEqual(n.branco.declarado, [4095, 4095, 4095])
  assert.deepEqual(n.preto, { porCanal: [64, 64, 64] })
  listaPerto(n.wb.comoFotografado, [2, 1, 1.5], 1e-12, 'wb pelo AsShotNeutral')
  assert.equal(n.cor.matrizes[0].kelvin, 6500)
  listaPerto(n.cor.matrizes[0].xyzParaCamera, [0.8, -0.2, -0.1, -0.4, 1.2, 0.2, -0.1, 0.2, 0.6], 1e-12, 'matriz')
})

test('JPEG lossless: preditores 1 a 7, um e dois componentes, com e sem intervalo de reinício', () => {
  const rng = acaso(21)
  for (const componentes of [1, 2]) {
    for (let preditor = 1; preditor <= 7; preditor++) {
      for (const linhasPorIntervalo of [0, 3]) {
        const colunas = 23
        const linhas = 11
        const bits = preditor % 2 ? 14 : 16
        // imagem com rampa, ruído e saltos grandes (inclusive a diferença de 32768, que tem categoria própria)
        const a = Uint16Array.from({ length: colunas * linhas * componentes }, (_, i) => {
          if (bits === 16 && i % 37 === 5) return i % 2 ? 0 : 32768
          return Math.min((1 << bits) - 1, Math.floor(i * 3 + rng.u() * 900))
        })
        const jpeg = codificarJpegSemPerdas(a, { colunas, linhas, componentes, bits, preditor, linhasPorIntervalo })
        const d = decodificarJpegSemPerdas(juntar([[1, 2, 3], jpeg]), 3, jpeg.length)
        assert.equal(d.colunas, colunas)
        assert.equal(d.linhas, linhas)
        assert.equal(d.componentes, componentes)
        assert.equal(d.preditor, preditor)
        assert.ok(iguais(d.dados, a), `preditor ${preditor}, ${componentes} componente(s), reinício ${linhasPorIntervalo}`)
      }
    }
  }
  assert.throws(
    () => decodificarJpegSemPerdas(jpegFalso({ largura: 8, altura: 8 })),
    (e) => e instanceof ErroRaw && e.codigo === 'sem-suporte',
  )
  assert.throws(
    () => decodificarJpegSemPerdas(Uint8Array.of(1, 2, 3, 4, 5)),
    (e) => e instanceof ErroRaw && e.codigo === 'corrompido',
  )
})

test('leitor próprio de DNG: blocos em JPEG lossless (quadro de 2 componentes) e tabela de linearização', () => {
  const largura = 100
  const altura = 80
  const lb = 64
  const ab = 48
  const rng = acaso(8)
  const dados = Uint16Array.from({ length: largura * altura }, (_, i) => Math.floor(((i % largura) * 30 + rng.u() * 200) % 4096))
  const blocos = []
  for (let by = 0; by < 2; by++) {
    for (let bx = 0; bx < 2; bx++) {
      const bloco = new Uint16Array(lb * ab) // o que passa da imagem fica em zero, como nos arquivos reais
      for (let y = 0; y < ab && by * ab + y < altura; y++)
        for (let x = 0; x < lb && bx * lb + x < largura; x++) bloco[y * lb + x] = dados[(by * ab + y) * largura + bx * lb + x]
      blocos.push(codificarJpegSemPerdas(bloco, { colunas: lb / 2, linhas: ab, componentes: 2, bits: 12, preditor: 1 + ((by * 2 + bx) % 7) }))
    }
  }
  const curva = Array.from({ length: 4096 }, (_, v) => Math.min(65535, v * 5 + 7))
  const { bytes } = montarTiff({
    blocos: [
      {
        nome: 'ifd0',
        ifd: tagsDeDng({
          largura,
          altura,
          bits: 16,
          compressao: 7,
          extra: [
            [0x0142, 4, lb],
            [0x0143, 4, ab],
            [0x0144, 4, blocos.map((_, i) => ({ pos: `b${i}` }))],
            [0x0145, 4, blocos.map((_, i) => ({ tam: `b${i}` }))],
            [0xc618, 3, curva],
            [0xc68d, 4, [2, 4, 78, 98]],
          ],
        }),
      },
      ...blocos.map((b, i) => ({ nome: `b${i}`, bytes: b })),
    ],
  })
  const n = lerDng(bytes)
  assert.ok(
    iguais(
      n.sensor.dados,
      Uint16Array.from(dados, (v) => curva[v]),
    ),
    'mosaico = curva[dado]',
  )
  assert.deepEqual(n.area, { x: 4, y: 2, largura: 94, altura: 76 })
})

test('leitor próprio de DNG: recusa com motivo o que não é DNG ou não tem mosaico', () => {
  const recusa = (bytes, codigo, trecho) =>
    assert.throws(
      () => lerDng(bytes),
      (e) => e instanceof ErroRaw && e.codigo === codigo && e.message.includes(trecho),
      `esperava ${codigo} com "${trecho}"`,
    )
  recusa(jpegFalso({ largura: 64, altura: 48 }), 'nao-e-raw', 'JPEG')
  recusa(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12), 'nao-e-raw', 'TIFF')
  recusa(
    montarTiff({
      blocos: [
        {
          nome: 'ifd0',
          ifd: [
            [0x0100, 4, 10],
            [0x0101, 4, 10],
          ],
        },
      ],
    }).bytes,
    'nao-e-raw',
    'DNGVersion',
  )
  const comum = [
    [0x00fe, 4, 0],
    [0x0100, 4, 16],
    [0x0101, 4, 16],
    [0x0115, 3, 3],
    [0xc612, 1, Uint8Array.of(1, 4, 0, 0)],
    [0x0111, 4, { pos: 'd' }],
    [0x0117, 4, { tam: 'd' }],
  ]
  const dado = { nome: 'd', bytes: new Uint8Array(64) }
  const linear = montarTiff({ blocos: [{ nome: 'ifd0', ifd: [...comum, [0x0102, 3, [8, 8, 8]], [0x0103, 3, 34892], [0x0106, 3, 34892]] }, dado] }).bytes
  recusa(linear, 'sem-suporte', 'LinearRaw')
  assert.equal(lerTagsDng(linear).linear, true)
  const deflate = montarTiff({
    blocos: [
      { nome: 'ifd0', ifd: [...tagsDeDng({ largura: 16, altura: 16, bits: 16, compressao: 8 }), [0x0111, 4, { pos: 'd' }], [0x0117, 4, { tam: 'd' }]] },
      dado,
    ],
  }).bytes
  recusa(deflate, 'sem-suporte', 'Deflate')
  const truncado = escreverDng(criarNegativo(fabricarNegativo({ largura: 64, altura: 48 })))
  recusa(truncado.subarray(0, truncado.length - 100), 'corrompido', 'truncado')
})

test('opcodes: ler, escrever e aplicar GainMap e FixVignetteRadial; os demais ficam listados como não aplicados', () => {
  const mapa = {
    id: 9,
    area: { topo: 1, esquerda: 0, base: 40, direita: 60 },
    plano: 0,
    planos: 1,
    passoLinha: 2,
    passoColuna: 2,
    pontosV: 3,
    pontosH: 4,
    espacoV: 0.5,
    espacoH: 1 / 3,
    origemV: 0,
    origemH: 0,
    planosDoMapa: 1,
    ganhos: Float32Array.of(1, 2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 6), // ganho = 1 + 3·h/W' + 2·v/H' (um plano inclinado)
  }
  const vinheta = { id: 3, k: [0.5, 0.25, 0, 0, 0], centro: { x: 0.5, y: 0.5 } }
  const torcao = { id: 1, opcional: true, bruto: new Uint8Array(20) }
  const lista = lerOpcodes(escreverOpcodes([mapa, vinheta, torcao]))
  assert.deepEqual(
    lista.map((o) => o.nome),
    ['GainMap', 'FixVignetteRadial', 'WarpRectilinear'],
  )
  assert.deepEqual(
    lista.map((o) => o.aplicavel),
    [true, true, false],
  )
  assert.equal(lista[2].opcional, true)
  assert.deepEqual([...lista[0].ganhos], [...mapa.ganhos])
  assert.deepEqual(lista[1].k, vinheta.k)
  assert.ok(iguais(escreverOpcodes(lista), escreverOpcodes([mapa, vinheta, torcao])), 'ler e escrever fecham')

  const largura = 60
  const altura = 40
  const entrada = new Float32Array(largura * altura).fill(1)
  const copia = Float32Array.from(entrada)
  const r = aplicarOpcodes(entrada, { largura, altura }, lista)
  assert.deepEqual([...entrada], [...copia], 'função pura: a entrada não muda')
  assert.deepEqual(r.aplicados, ['GainMap', 'FixVignetteRadial'])
  assert.deepEqual(r.naoAplicados, [{ nome: 'WarpRectilinear', motivo: 'opcode não coberto por este leitor', opcional: true }])
  // conta à mão: mapa bilinear no centro do pixel e vinheta radial normalizada pelo canto mais distante
  const longe = 30 ** 2 + 20 ** 2
  for (const [y, x] of [
    [1, 0],
    [1, 58],
    [39, 0],
    [39, 58],
    [21, 30],
    [7, 44],
    [0, 0],
    [2, 1],
  ]) {
    const noMapa = y >= 1 && (y - 1) % 2 === 0 && x % 2 === 0
    const ganho = noMapa ? 1 + (3 * (x + 0.5)) / largura + (2 * (y + 0.5)) / altura : 1
    const r2 = ((x + 0.5 - 30) ** 2 + (y + 0.5 - 20) ** 2) / longe
    perto(r.dados[y * largura + x], ganho * (1 + 0.5 * r2 + 0.25 * r2 * r2), 1e-5, `ganho em ${y},${x}`)
  }
  // área ativa dentro de um vetor maior: as coordenadas dos opcodes contam da área
  const maior = new Float32Array(70 * 50).fill(1)
  const s = aplicarOpcodes(maior, { largura: 70, altura: 50, area: { x: 6, y: 4, largura, altura } }, [lista[1]])
  const r2 = (0.5 ** 2 + 1.5 ** 2) / longe
  perto(s.dados[(4 + 21) * 70 + 6 + 30], 1 + 0.5 * r2 + 0.25 * r2 * r2, 1e-6, 'vinheta contada da área ativa')
  assert.equal(s.dados[0], 1, 'fora da área ativa nada muda')
  // aplicar no lugar é escolha explícita
  const noLugar = aplicarOpcodes(maior, { largura: 70, altura: 50 }, [lista[1]], { destino: maior })
  assert.equal(noLugar.dados, maior)
})

test('LibRaw abre o DNG fabricado: mesmo mosaico, mesmas margens, e o negativo sai igual ao do leitor próprio', async (t) => {
  const LibRaw = await carregarLibRaw()
  if (!precisaDoLibRaw(t, LibRaw)) return
  const n = negativoCompleto()
  const bytes = escreverDng(n)
  const leitor = criarLeitor(LibRaw)
  const pelaLibRaw = await leitor.ler(bytes, { nome: 'fabricado.dng' })
  const proprio = lerDng(bytes)
  assert.ok(iguais(pelaLibRaw.sensor.dados, n.sensor.dados), 'mosaico do LibRaw = o fabricado')
  for (const campo of ['area', 'cfa', 'preto', 'cor', 'wb', 'exposicaoBase', 'perfilRuido', 'recorte', 'exif', 'fabricante', 'modelo']) {
    assert.deepEqual(pelaLibRaw[campo], proprio[campo], campo)
  }
  assert.deepEqual(pelaLibRaw.branco, { declarado: [16000, 16000, 16000], maximo: 16000 })
  assert.equal(pelaLibRaw.formato, 'dng')
  assert.ok(iguais(pelaLibRaw.previa.jpeg, n.previa.jpeg))
  // vista de um buffer maior (o caso do arquivo lido em pedaços) e o atalho do contrato
  const folgado = new Uint8Array(bytes.length + 64)
  folgado.set(bytes, 32)
  usarLibRaw(LibRaw)
  const deNovo = await abrirRaw(folgado.subarray(32, 32 + bytes.length), { nome: 'fabricado.dng' })
  assert.ok(iguais(deNovo.sensor.dados, n.sensor.dados))
  await assert.rejects(
    leitor.ler(jpegFalso({ largura: 64, altura: 48 }), { nome: 'foto.dng' }),
    (e) => e instanceof ErroRaw && e.codigo === 'nao-e-raw' && e.message.includes('JPEG'),
  )
  await assert.rejects(leitor.ler(new Uint8Array(4096).fill(7), { nome: 'lixo.cr2' }), (e) => e instanceof ErroRaw && e.codigo === 'nao-e-raw')
})

test('revelarLinear: espaço de câmera, linear, sem equilíbrio na saída, 1,0 = branco − preto', async (t) => {
  const LibRaw = await carregarLibRaw()
  if (!precisaDoLibRaw(t, LibRaw)) return
  // campo liso: cada canal com um nível conhecido acima do preto
  const niveis = [2000, 6000, 3000]
  const n = criarNegativo(
    fabricarNegativo({ largura: 96, altura: 64, preto: 500, corte: 16000, declarado: 16000, ganho: 0.001, leitura: 0, sinal: (u, v, c) => niveis[c] }),
  )
  const leitor = criarLeitor(LibRaw)
  for (const wb of ['camera', 'nenhum', [3, 1, 2]]) {
    for (const qualidade of ['rapida', 'alta']) {
      const r = await leitor.revelarLinear(escreverDng(n), { wb, qualidade })
      assert.equal(r.largura, 96)
      assert.equal(r.altura, 64)
      assert.equal(r.dados.length, 96 * 64 * 3)
      assert.equal(r.orientacao, 1)
      assert.equal(r.girada, 1)
      assert.equal(r.maximo, 16000)
      const i = (32 * 96 + 48) * 3
      for (let c = 0; c < 3; c++) perto(r.dados[i + c], niveis[c] / 15500, 2e-3, `canal ${c}, wb ${wb}, ${qualidade}`)
    }
  }
  const metade = await leitor.revelarLinear(escreverDng(n), { metade: true })
  assert.equal(metade.largura, 48)
  assert.equal(metade.altura, 32)
  perto(metade.dados[(16 * 48 + 24) * 3 + 1], 6000 / 15500, 2e-3, 'metade')
  // foto em pé: o LibRaw já gira a saída; o negativo não é girado e leva a orientação
  n.exif.orientacao = 6
  const emPe = escreverDng(n)
  const girada = await leitor.revelarLinear(emPe)
  assert.deepEqual([girada.largura, girada.altura, girada.girada, girada.orientacao], [64, 96, 6, 1])
  const negativo = await leitor.ler(emPe)
  assert.equal(negativo.exif.orientacao, 6)
  assert.equal(negativo.sensor.largura, 96)
})

// ---------------------------------------------------------------------------------------------------- amostras

// O que a pesquisa mediu em cada arquivo: sensor, área ativa, mosaico, preto e branco declarados
const ESPERADO = {
  'canon_30d.cr2': { sensor: [3596, 2360], area: [74, 12, 3522, 2348], cfa: '0112', preto: 128, branco: 4095, origem: 'libraw' },
  'canon_5d3.dng': { sensor: [1920, 818], area: [0, 0, 1920, 818], cfa: '0112', preto: 2145, branco: 16200, origem: 'dng' },
  'canon_r6.cr3': { sensor: [3584, 2386], area: [156, 108, 3407, 2271], cfa: '0112', preto: 512, branco: 14008, origem: 'libraw' },
  'fuji_xt30ii.raf': {
    sensor: [6384, 4182],
    area: [0, 6, 6246, 4170],
    cfa: '110112112110201021112110110112021201',
    preto: 1022,
    branco: 16383,
    origem: 'libraw',
  },
  'iphone_xs.dng': { sensor: [4032, 3024], area: [0, 0, 4032, 3024], cfa: '0112', preto: 528, branco: 4095, origem: 'dng' },
  'nikon_d70s.nef': { sensor: [3040, 2014], area: [0, 0, 3039, 2014], cfa: '2110', preto: 0, branco: 3827, origem: 'libraw' },
  'pana_lx7.rw2': { sensor: [1904, 1384], area: [0, 0, 1840, 1384], cfa: '1021', preto: 142, branco: 4079, origem: 'libraw' },
  'pixel6pro.dng': { sensor: [4080, 3072], area: [0, 0, 4080, 3072], cfa: '1201', preto: 1023, branco: 16368, origem: 'dng' },
  'ricoh_gr.dng': { sensor: [4960, 3280], area: [0, 0, 4944, 3280], cfa: '0112', preto: 0, branco: 4095, origem: 'dng' },
  'sony_a7s.arw': { sensor: [2816, 1872], area: [0, 0, 2784, 1872], cfa: '0112', preto: 512, branco: 15360, origem: 'libraw' },
}

test('amostras: os 12 arquivos abrem (ou são recusados com motivo) e o mosaico do leitor próprio é o do LibRaw', { timeout: 120000 }, async (t) => {
  if (!precisaDeAmostras(t)) return
  const LibRaw = await carregarLibRaw()
  if (!precisaDoLibRaw(t, LibRaw)) return
  const leitor = criarLeitor(LibRaw)
  const tempos = []
  let comparados = 0
  for (const nome of AMOSTRAS) {
    const bytes = await lerAmostra(nome)
    if (nome === 'samsung_g973.dng') {
      await assert.rejects(leitor.ler(bytes, { nome }), (e) => e instanceof ErroRaw && e.codigo === 'nao-e-raw' && /JPEG/.test(e.message))
      continue
    }
    if (nome === 'adobe_5d3_lossy.dng') {
      await assert.rejects(leitor.ler(bytes, { nome }), (e) => e instanceof ErroRaw && e.codigo === 'sem-suporte' && /LinearRaw/.test(e.message))
      assert.equal(lerTagsDng(bytes).cor.matrizes.length, 2, 'as tags de cor do DNG com perdas ainda saem')
      continue
    }
    const t0 = performance.now()
    const n = await leitor.ler(bytes, { nome })
    tempos.push(`${nome} ${Math.round(performance.now() - t0)} ms`)
    const e = ESPERADO[nome]
    assert.deepEqual([n.sensor.largura, n.sensor.altura], e.sensor, `${nome}: sensor`)
    assert.deepEqual([n.area.x, n.area.y, n.area.largura, n.area.altura], e.area, `${nome}: área ativa`)
    assert.equal([...n.cfa.padrao].join(''), e.cfa, `${nome}: mosaico`)
    assert.equal(n.cfa.tipo, e.cfa.length === 36 ? 'xtrans' : 'bayer')
    perto(n.preto.porCanal[1], e.preto, 0.6, `${nome}: preto declarado`)
    assert.equal(n.branco.declarado[1], e.branco, `${nome}: branco declarado`)
    assert.equal(n.cor.origem, e.origem)
    assert.equal(n.cor.matrizes.length, e.origem === 'dng' ? 2 : 1, `${nome}: matrizes`)
    assert.equal(n.formato, nome.split('.').pop())
    assert.ok(
      n.wb.comoFotografado.every((v) => v > 0.5 && v < 4),
      `${nome}: WB`,
    )
    assert.match(n.exif.data, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/)
    assert.ok(n.exif.iso > 0 && n.exif.tempo > 0)
    if (nome !== 'canon_5d3.dng') assert.ok(n.previa.jpeg.length > 50000 && n.previa.largura >= 640, `${nome}: prévia`)
    if (nome.endsWith('.dng')) {
      const proprio = lerDng(bytes)
      assert.ok(iguais(proprio.sensor.dados, n.sensor.dados), `${nome}: mosaico do leitor próprio = LibRaw`)
      assert.deepEqual(proprio.cor, n.cor)
      comparados++
    }
  }
  assert.equal(comparados, 4, 'os 4 DNG de mosaico foram comparados bit a bit')
  t.diagnostic(tempos.join(' · '))

  // o que só o DNG traz
  const pixel = lerDng(await lerAmostra('pixel6pro.dng'))
  assert.deepEqual(
    pixel.cor.matrizes.map((m) => m.kelvin),
    [2850, 6500],
  )
  perto(pixel.exposicaoBase, 0.72, 1e-9, 'BaselineExposure do Pixel')
  perto(pixel.perfilRuido[1].escala, 7.703e-6, 1e-8, 'NoiseProfile (verde)')
  assert.deepEqual(pixel.recorte, { x: 8, y: 8, largura: 4064, altura: 3056 })
  assert.deepEqual(
    pixel.opcodes.lista2.map((o) => o.nome),
    ['GainMap', 'GainMap', 'GainMap', 'GainMap'],
  )
  assert.deepEqual(
    pixel.opcodes.lista3.map((o) => [o.nome, o.aplicavel]),
    [['WarpRectilinear', false]],
  )
  const iphone = lerDng(await lerAmostra('iphone_xs.dng'))
  listaPerto(iphone.opcodes.lista3[0].k, [1.5123, 4.1917, -9.2382, 8.7176, -2.7503], 1e-4, 'vinheta radial do iPhone XS')
  const ricoh = lerTagsDng(await lerAmostra('ricoh_gr.dng'))
  perto(ricoh.exposicaoBase, -0.2, 1e-9, 'BaselineExposure da Ricoh GR')
  listaPerto(ricoh.cor.matrizes[0].xyzParaCamera.slice(0, 3), [0.5533, -0.1912, 0.0107], 1e-4, 'ColorMatrix1 da Ricoh GR')
  const canon = lerTagsDng(await lerAmostra('canon_5d3.dng'))
  assert.ok(
    canon.cor.matrizes.every((m) => m.cameraParaXyzD50.length === 9),
    'ForwardMatrix nos dois iluminantes',
  )

  // GainMap do Pixel num mosaico liso: clareia as bordas (até 4,7×) e quase não mexe no centro
  const { largura, altura } = pixel.sensor
  const liso = new Float32Array(largura * altura).fill(1)
  const t1 = performance.now()
  const corrigido = aplicarOpcodes(liso, { largura, altura }, pixel.opcodes.lista2)
  t.diagnostic(`4 GainMap em ${((largura * altura) / 1e6).toFixed(1)} MP: ${Math.round(performance.now() - t1)} ms`)
  assert.deepEqual(corrigido.aplicados, ['GainMap', 'GainMap', 'GainMap', 'GainMap'])
  const centro = corrigido.dados[(altura >> 1) * largura + (largura >> 1)]
  assert.ok(centro >= 1 && centro < 1.1, `centro ${centro}`)
  assert.ok(corrigido.dados[0] > 2.5 && corrigido.dados[0] < 4.7, `canto ${corrigido.dados[0]}`)
  let menor = Infinity
  for (let i = 0; i < corrigido.dados.length; i += 97) menor = Math.min(menor, corrigido.dados[i])
  assert.ok(menor >= 1, 'todo sensel recebeu ganho de algum dos quatro mapas')
})

test('amostras: revelarLinear confere com o mosaico (X-Trans na metade da resolução e Bayer inteiro)', { timeout: 180000 }, async (t) => {
  if (!precisaDeAmostras(t)) return
  const LibRaw = await carregarLibRaw()
  if (!precisaDoLibRaw(t, LibRaw)) return
  const leitor = criarLeitor(LibRaw)
  for (const [nome, opcoes] of [
    ['canon_r6.cr3', { qualidade: 'rapida' }],
    ['fuji_xt30ii.raf', { metade: true }],
  ]) {
    const bytes = await lerAmostra(nome)
    const n = await leitor.ler(bytes, { nome })
    // média por canal do mosaico normalizado (preto subtraído, negativos em zero, dividido por maximo − preto)
    const soma = [0, 0, 0]
    const conta = [0, 0, 0]
    const menorPreto = Math.min(...n.preto.porCanal)
    for (let y = 0; y < n.area.altura; y += 3) {
      for (let x = 0; x < n.area.largura; x++) {
        const l = n.area.y + y
        const c = n.area.x + x
        const k = corEm(n, l, c)
        soma[k] += Math.min(1, Math.max(0, (n.sensor.dados[l * n.sensor.largura + c] - pretoEm(n, l, c)) / (n.branco.maximo - menorPreto)))
        conta[k]++
      }
    }
    const t0 = performance.now()
    const r = await leitor.revelarLinear(bytes, { nome, ...opcoes })
    t.diagnostic(`${nome} ${JSON.stringify(opcoes)}: ${r.largura}×${r.altura} em ${Math.round(performance.now() - t0)} ms`)
    const media = [0, 0, 0]
    for (let i = 0; i < r.dados.length; i += 3) for (let k = 0; k < 3; k++) media[k] += r.dados[i + k]
    for (let k = 0; k < 3; k++) perto(media[k] / (r.dados.length / 3), soma[k] / conta[k], 0.004, `${nome}: média do canal ${k}`)
  }
})
