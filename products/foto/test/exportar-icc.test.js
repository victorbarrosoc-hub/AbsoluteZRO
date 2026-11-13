// Perfis ICC gerados por código: cabeçalho, tabela de tags, primárias contra os valores publicados (em D50, por
// Bradford), curvas contra as do motor e, no Chromium, a prova de que um gerenciador de cor de verdade os entende.

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { CURVAS, ESPACOS, curvaDe, matrizEntre } from '../src/motor/cor/espacos.js'
import { mulV } from '../src/motor/cor/matriz.js'
import { D50_PCS, avaliarCurva, curvaDoPerfil, descricaoDoPerfil, espacoDoPerfil, lerIcc, matrizDoPerfil, md5, perfilIcc } from '../src/exportar/icc.js'
import { escreverPng } from '../src/exportar/png.js'
import { EXIGIR, abrirChromium, base64, semChromium, sorteio } from './apoio-exportar.js'

const TODOS = ['srgb', 'p3', 'adobe', 'rec2020', 'prophoto']
const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: esperado ${b}, veio ${a} (tolerância ${tol})`)
const u32 = (b, p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0
const ascii = (b, p, n = 4) => String.fromCharCode(...b.subarray(p, p + n))

// Colunas da matriz (rXYZ, gXYZ, bXYZ) como estão nos perfis que os donos dos padrões distribuem, em s15Fixed16:
//   sRGB       "sRGB IEC61966-2.1" (o perfil clássico da HP, o mais copiado do mundo)
//   Display P3 "Display P3" da Apple
//   Adobe RGB  "AdobeRGB1998.icc" da Adobe
//   ProPhoto   "ProPhoto.icm" (ROMM RGB) da Kodak
// Para o BT.2020 não há um perfil de referência único; os números são os de uso corrente (primárias da recomendação,
// D65 → D50 por Bradford) com quatro casas.
// A tolerância cobre a diferença de D50 entre perfis: o da HP e o da Kodak usam Z = 0,8251/0,8252; o PCS do ICC (e a
// Apple, a Adobe e nós) usa 0,8249.
const PUBLICADOS = {
  srgb: {
    colunas: [
      [0.436066, 0.222488, 0.013916],
      [0.385147, 0.716873, 0.097076],
      [0.143066, 0.060608, 0.714096],
    ],
    tol: 3e-4,
  },
  p3: {
    colunas: [
      [0.515121, 0.241196, -0.001053],
      [0.291977, 0.692245, 0.041885],
      [0.157104, 0.066574, 0.784073],
    ],
    tol: 2e-5,
  },
  adobe: {
    colunas: [
      [0.609741, 0.311111, 0.01947],
      [0.205276, 0.625671, 0.060867],
      [0.149185, 0.063217, 0.744568],
    ],
    tol: 3e-5,
  },
  prophoto: {
    colunas: [
      [0.797675, 0.28804, 0],
      [0.135192, 0.711874, 0],
      [0.031338, 0.000086, 0.82521],
    ],
    tol: 4e-4,
  },
  rec2020: {
    colunas: [
      [0.6735, 0.279, -0.0019],
      [0.1657, 0.6753, 0.03],
      [0.1251, 0.0456, 0.7972],
    ],
    tol: 4e-4,
  },
}

// A matriz de adaptação D65 → D50 (Bradford) como está na tag `chad` dos perfis sRGB e Display P3 publicados
const CHAD_PUBLICADA = [1.047882, 0.022919, -0.050201, 0.029587, 0.990479, -0.017059, -0.009232, 0.015076, 0.751678]

test('ICC: cabeçalho de perfil 4.3 de monitor RGB, com o D50 do PCS e a assinatura', () => {
  for (const espaco of TODOS) {
    const b = perfilIcc(espaco)
    assert.equal(u32(b, 0), b.length, `${espaco}: o tamanho declarado é o do arquivo`)
    assert.equal(b.length % 4, 0, `${espaco}: tamanho múltiplo de 4`)
    assert.equal(u32(b, 8), 0x04300000, `${espaco}: versão 4.3.0.0`)
    assert.equal(ascii(b, 12), 'mntr')
    assert.equal(ascii(b, 16), 'RGB ')
    assert.equal(ascii(b, 20), 'XYZ ')
    assert.equal(ascii(b, 36), 'acsp')
    assert.equal(u32(b, 64), 0, 'intenção perceptiva')
    // ICC.1:2010, 7.2.16: 0,9642; 1,0; 0,8249 em s15Fixed16 são exatamente estes bytes
    assert.deepEqual([u32(b, 68), u32(b, 72), u32(b, 76)], [0x0000f6d6, 0x00010000, 0x0000d32d], `${espaco}: iluminante do PCS`)
    for (let i = 100; i < 128; i++) assert.equal(b[i], 0, 'bytes reservados em zero')
    const mes = (b[26] << 8) | b[27]
    const dia = (b[28] << 8) | b[29]
    assert.ok(mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31, 'data de criação válida')
  }
})

test('ICC: o identificador é o MD5 do perfil com os campos da regra em zero', () => {
  for (const espaco of TODOS) {
    const b = perfilIcc(espaco)
    const zerado = b.slice()
    zerado.fill(0, 44, 48)
    zerado.fill(0, 64, 68)
    zerado.fill(0, 84, 100)
    assert.equal(Buffer.from(b.subarray(84, 100)).toString('hex'), createHash('md5').update(zerado).digest('hex'), espaco)
  }
})

test('MD5 próprio confere com o do Node em tamanhos que cruzam os blocos', () => {
  const r = sorteio(11)
  for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 4097]) {
    const bytes = Uint8Array.from({ length: n }, () => Math.floor(r() * 256))
    assert.equal(Buffer.from(md5(bytes)).toString('hex'), createHash('md5').update(bytes).digest('hex'), `${n} bytes`)
  }
})

test('ICC: tabela de tags completa, alinhada, dentro do perfil e com as três curvas no mesmo elemento', () => {
  for (const espaco of TODOS) {
    const b = perfilIcc(espaco)
    const perfil = lerIcc(b)
    const obrigatorias = ['desc', 'cprt', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC']
    for (const tag of obrigatorias) assert.ok(perfil.tags[tag], `${espaco}: falta ${tag}`)
    // chad é obrigatória quando o branco do aparelho não é D50 (ICC.1:2010, 9.2.12); o ROMM já é D50
    assert.equal(Boolean(perfil.tags.chad), espaco !== 'prophoto', `${espaco}: chad`)
    const quantas = u32(b, 128)
    assert.equal(quantas, Object.keys(perfil.tags).length)
    for (const [nome, tag] of Object.entries(perfil.tags)) {
      assert.equal(tag.onde % 4, 0, `${espaco}.${nome}: começa em múltiplo de 4`)
      assert.ok(tag.onde >= 132 + quantas * 12 && tag.onde + tag.tamanho <= b.length, `${espaco}.${nome}: dentro do perfil`)
      assert.deepEqual(Array.from(b.subarray(tag.onde + 4, tag.onde + 8)), [0, 0, 0, 0], `${espaco}.${nome}: reservado em zero`)
    }
    assert.equal(perfil.tags.rTRC.onde, perfil.tags.gTRC.onde)
    assert.equal(perfil.tags.rTRC.onde, perfil.tags.bTRC.onde)
    for (const tag of ['rXYZ', 'gXYZ', 'bXYZ', 'wtpt']) assert.equal(perfil.tags[tag].tipo, 'XYZ ')
    assert.equal(perfil.tags.rTRC.tipo, 'para')
    assert.equal(perfil.tags.desc.tipo, 'mluc')
    assert.equal(perfil.tags.cprt.tipo, 'mluc')
    assert.equal(perfil.tags.desc.texto, descricaoDoPerfil(espaco))
    assert.ok(perfil.tags.cprt.texto.length > 0)
    assert.equal(perfil.versao, '4.3')
  }
  assert.equal(lerIcc(perfilIcc('p3')).tags.desc.texto, 'Display P3')
  assert.equal(lerIcc(perfilIcc('srgb')).tags.desc.texto, 'sRGB')
})

test('ICC: primárias iguais às dos perfis publicados (D50 por Bradford); Display P3 bate bit a bit com o da Apple', () => {
  for (const espaco of TODOS) {
    const { tags } = lerIcc(perfilIcc(espaco))
    const { colunas, tol } = PUBLICADOS[espaco]
    ;['rXYZ', 'gXYZ', 'bXYZ'].forEach((tag, c) => {
      for (let i = 0; i < 3; i++) perto(tags[tag].xyz[i], colunas[c][i], tol, `${espaco}.${tag}[${i}]`)
    })
  }
  // o caminho do titular: os nove números do Display P3 são exatamente os inteiros s15Fixed16 do perfil da Apple
  const p3 = lerIcc(perfilIcc('p3')).tags
  const inteiros = [p3.rXYZ, p3.gXYZ, p3.bXYZ].flatMap((t) => t.xyz.map((v) => Math.round(v * 65536)))
  assert.deepEqual(
    inteiros,
    PUBLICADOS.p3.colunas.flat().map((v) => Math.round(v * 65536)),
  )
})

test('ICC: as primárias somam o branco do PCS, wtpt é D50 e chad é a Bradford publicada', () => {
  for (const espaco of TODOS) {
    const { tags } = lerIcc(perfilIcc(espaco))
    for (let i = 0; i < 3; i++) {
      // três arredondamentos de 1/65536 no pior caso
      perto(tags.rXYZ.xyz[i] + tags.gXYZ.xyz[i] + tags.bXYZ.xyz[i], D50_PCS[i], 2.5 / 65536, `${espaco}: soma das primárias [${i}]`)
      perto(tags.wtpt.xyz[i], D50_PCS[i], 0.5 / 65536, `${espaco}: wtpt[${i}]`)
    }
    if (tags.chad) tags.chad.valores.forEach((v, i) => perto(v, CHAD_PUBLICADA[i], 1e-4, `${espaco}: chad[${i}]`))
  }
})

test('ICC: a matriz confere com uma conta independente (primárias → XYZ → Bradford) feita aqui no teste', () => {
  // refaz a conta sem usar nada de src/: resolve o sistema das primárias por Cramer e adapta por Bradford
  const det = (m) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
  const resolver = (m, v) => {
    const d = det(m)
    return [0, 1, 2].map((c) => det(m.map((x, i) => (i % 3 === c ? v[(i / 3) | 0] : x))) / d)
  }
  const xyz = ([x, y]) => [x / y, 1, (1 - x - y) / y]
  const vezes = (m, v) => [0, 1, 2].map((l) => m[l * 3] * v[0] + m[l * 3 + 1] * v[1] + m[l * 3 + 2] * v[2])
  const BRADFORD = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296]
  for (const espaco of TODOS) {
    const { primarias: p, branco } = ESPACOS[espaco]
    const P = [xyz([p[0], p[1]]), xyz([p[2], p[3]]), xyz([p[4], p[5]])]
    const M = [P[0][0], P[1][0], P[2][0], P[0][1], P[1][1], P[2][1], P[0][2], P[1][2], P[2][2]]
    const S = resolver(M, xyz(branco))
    const conesDe = vezes(BRADFORD, xyz(branco))
    const conesPara = vezes(BRADFORD, [0.9642, 1, 0.8249])
    const nossa = matrizDoPerfil(espaco)
    for (let c = 0; c < 3; c++) {
      const cones = vezes(
        BRADFORD,
        P[c].map((v) => v * S[c]),
      ).map((v, i) => (v * conesPara[i]) / conesDe[i])
      const adaptado = resolver(BRADFORD, cones)
      for (let l = 0; l < 3; l++) perto(nossa[l * 3 + c], adaptado[l], 1e-12, `${espaco}: coluna ${c}, linha ${l}`)
    }
  }
})

test('ICC: a curva paramétrica do perfil é a curva do motor, ponto a ponto', () => {
  for (const espaco of TODOS) {
    const { curva } = lerIcc(perfilIcc(espaco)).tags.rTRC
    const motor = curvaDe(espaco)
    let pior = 0
    for (let i = 0; i <= 2000; i++) {
      const x = i / 2000
      pior = Math.max(pior, Math.abs(avaliarCurva(curva, x) - motor.decodificar(x)))
    }
    // o que sobra é o arredondamento dos parâmetros a 1/65536
    assert.ok(pior < 6e-5, `${espaco}: a curva do perfil se afasta ${pior} da do motor`)
    // antes de arredondar, a forma paramétrica é a mesma função (a menos do degrau de 1e-7 no joelho do sRGB)
    let exato = 0
    for (let i = 0; i <= 2000; i++) exato = Math.max(exato, Math.abs(avaliarCurva(curvaDoPerfil(espaco), i / 2000) - motor.decodificar(i / 2000)))
    assert.ok(exato < 1e-7, `${espaco}: forma paramétrica ${exato}`)
  }
  // sRGB: tipo 3 com os números da IEC 61966-2-1; Adobe: gama puro 563/256, exato em ponto fixo
  const srgb = lerIcc(perfilIcc('srgb')).tags.rTRC.curva
  assert.equal(srgb.tipo, 3)
  ;[2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045].forEach((v, i) => perto(srgb.parametros[i], v, 0.5 / 65536, `sRGB parâmetro ${i}`))
  assert.deepEqual(lerIcc(perfilIcc('adobe')).tags.rTRC.curva, { tipo: 0, parametros: [563 / 256] })
  assert.equal(lerIcc(perfilIcc('p3')).tags.rTRC.curva.tipo, 3)
  // o BT.2020 sai da curva do motor: α e β da recomendação
  const r2020 = curvaDoPerfil('rec2020').parametros
  perto(1 / r2020[1], 1.09929682680944, 1e-12, 'α do BT.2020')
  perto(r2020[4] / 4.5, 0.018053968510807, 1e-12, 'β do BT.2020')
  assert.equal(CURVAS.rec2020.codificar(0.018053968510807 * 0.5), 4.5 * 0.018053968510807 * 0.5)
})

test('ICC: mesmos bytes a cada chamada, cópia independente, espaço desconhecido lança', () => {
  for (const espaco of TODOS) {
    const a = perfilIcc(espaco)
    const b = perfilIcc(espaco)
    assert.deepEqual(a, b)
    a.fill(0)
    assert.deepEqual(perfilIcc(espaco), b, 'estragar a cópia não estraga o próximo')
    assert.ok(b.length < 1024, `${espaco}: perfil enxuto (${b.length} bytes)`)
  }
  assert.throws(() => perfilIcc('cmyk'), /desconhecido/)
  assert.throws(() => lerIcc(new Uint8Array(200)), /acsp/)
})

test('ICC: espacoDoPerfil reconhece cada perfil pelos números, não pelo nome', () => {
  for (const espaco of TODOS) assert.equal(espacoDoPerfil(perfilIcc(espaco)), espaco)
  assert.equal(espacoDoPerfil(new Uint8Array(300)), null)
  assert.equal(espacoDoPerfil(null), null)
  // trocar a descrição não engana: continua P3
  const p3 = perfilIcc('p3')
  const { onde } = lerIcc(p3).tags.desc
  p3[onde + 29] = 0x58
  assert.equal(espacoDoPerfil(p3), 'p3')
})

test('Chromium é exigido no CI', { skip: !EXIGIR }, () => {
  assert.equal(semChromium, false, 'FOTO_EXIGIR=1 e o Playwright não está instalado')
})

test('Chromium: o gerenciador de cor do navegador lê os cinco perfis e chega à mesma cor em sRGB', { skip: semChromium, timeout: 240000 }, async () => {
  // Uma cor de dentro do sRGB, escrita em cada espaço com o perfil embutido. Se o perfil estiver certo (primárias,
  // curva e chad), o navegador converte todas para o mesmo sRGB. Sem perfil, os códigos passam direto.
  const linear = [0.5, 0.3, 0.2]
  const esperado = linear.map((v) => Math.round(curvaDe('srgb').codificar(v) * 255))
  const navegador = await abrirChromium()
  try {
    const pagina = await navegador.newPage()
    await pagina.goto('about:blank')
    const abrir = (bytes, tela) =>
      pagina.evaluate(
        async ({ b64, tela }) => {
          const dados = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
          const bmp = await createImageBitmap(new Blob([dados], { type: 'image/png' }))
          const quadro = new OffscreenCanvas(bmp.width, bmp.height)
          const ctx = quadro.getContext('2d', { colorSpace: tela })
          ctx.drawImage(bmp, 0, 0)
          return Array.from(ctx.getImageData(2, 2, 1, 1, { colorSpace: tela }).data)
        },
        { b64: base64(bytes), tela },
      )
    for (const espaco of TODOS) {
      const codigo = mulV(matrizEntre('srgb', espaco), linear).map((v) => curvaDe(espaco).codificar(v))
      const dados = new Uint16Array(8 * 8 * 3)
      for (let i = 0; i < dados.length; i++) dados[i] = Math.round(codigo[i % 3] * 65535)
      const comPerfil = await abrir(await escreverPng({ largura: 8, altura: 8, dados, bits: 16, icc: perfilIcc(espaco) }), 'srgb')
      for (let c = 0; c < 3; c++) perto(comPerfil[c], esperado[c], 1, `${espaco}: canal ${c} em sRGB`)
      if (espaco !== 'srgb') {
        const semPerfil = await abrir(await escreverPng({ largura: 8, altura: 8, dados, bits: 16 }), 'srgb')
        const distancia = Math.max(...[0, 1, 2].map((c) => Math.abs(semPerfil[c] - esperado[c])))
        assert.ok(distancia >= 3, `${espaco}: sem perfil a cor tem de sair diferente (prova de que o teste enxerga o perfil)`)
      }
    }
    // Display P3 numa tela P3: os códigos passam intactos; numa tela sRGB, o vermelho de fora do gamut encosta no limite
    const p3 = new Uint8Array(8 * 8 * 3)
    for (let i = 0; i < p3.length; i += 3) p3.set([255, 30, 10], i)
    const png = await escreverPng({ largura: 8, altura: 8, dados: p3, icc: perfilIcc('p3') })
    assert.deepEqual((await abrir(png, 'display-p3')).slice(0, 3), [255, 30, 10])
    assert.deepEqual((await abrir(png, 'srgb')).slice(0, 3), [255, 0, 0])
  } finally {
    await navegador.close()
  }
})
