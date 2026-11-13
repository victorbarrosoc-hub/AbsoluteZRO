// A receita cumprida de ponta a ponta (`gerarSaida`): imagem de tela → arquivo com perfil, EXIF e XMP, nas quatro
// predefinições de saída; e o mesmo código rodando dentro do Chromium, com o codificador do navegador.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { curvaDe, matrizEntre } from '../src/motor/cor/espacos.js'
import { mulV } from '../src/motor/cor/matriz.js'
import { paraBytes } from '../src/motor/tela.js'
import { lerExif } from '../src/raw/exif.js'
import { TIPOS_MIME, gerarSaida, receitaDaPredefinicao } from '../src/exportar/fila.js'
import { espacoDoPerfil } from '../src/exportar/icc.js'
import { extrairDoJpeg, lerSegmentosJpeg } from '../src/exportar/jpeg.js'
import { lerPng } from '../src/exportar/png.js'
import { lerBlocoTiff, lerTiff, valorDe } from '../src/exportar/tiff.js'
import { lerSidecarXmp } from '../src/exportar/xmp.js'
import { abrirChromium, base64, cenaDeTeste, comparar8, decodificarJpeg, paraRgb16, paraRgb8, semChromium } from './apoio-exportar.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const CENA = cenaDeTeste(600, 400, 17)
const CONTEXTO = {
  exif: {
    fabricante: 'Fabricante',
    modelo: 'Modelo',
    data: '2026-08-09T10:11:12',
    iso: 320,
    tempo: 1 / 500,
    abertura: 1.8,
    focal: 85,
    lente: 'Lente 85mm',
    orientacao: 8,
  },
  foto: { estrelas: 4, cor: 'verde', marca: 'escolhida' },
  software: 'Programa de teste',
  autor: 'Autora de Teste',
  direitos: '(c) Autora de Teste',
  local: { latitude: -22.9, longitude: -43.2 },
  quando: '2026-11-13T12:00:00',
}
// máscara de marca-d'água: um retângulo cheio (quem desenha o texto é a tela; aqui interessa o caminho)
const MASCARA = { largura: 120, altura: 30, dados: new Float32Array(120 * 30).fill(1) }
const semAlfa = (rgba) => Uint8Array.from({ length: (rgba.length / 4) * 3 }, (_, i) => rgba[((i / 3) | 0) * 4 + (i % 3)])

test('Entrega: JPEG em Display P3, tamanho cheio, com perfil P3, EXIF sem local e XMP com as decisões', async () => {
  const saida = await gerarSaida(CENA, receitaDaPredefinicao('entrega'), CONTEXTO)
  assert.deepEqual([saida.tipo, saida.extensao, saida.largura, saida.altura], ['image/jpeg', 'jpg', 600, 400])
  assert.deepEqual(saida.receita, receitaDaPredefinicao('entrega'))
  const { icc, exif, xmp } = extrairDoJpeg(saida.bytes)
  assert.equal(espacoDoPerfil(icc), 'p3', 'o perfil embutido é Display P3')
  // EXIF: o do contrato, com a orientação em 1 e sem GPS (a receita é "sem local", e o local foi entregue)
  assert.deepEqual(lerExif(saida.bytes), {
    orientacao: 1,
    tempo: 1 / 500,
    abertura: 1.8,
    iso: 320,
    focal: 85,
    lente: 'Lente 85mm',
    data: '2026-08-09T10:11:12',
  })
  const { diretorio } = lerBlocoTiff(exif)
  assert.equal(diretorio.filhos[0x8825], undefined, 'sem GPS')
  assert.equal(valorDe(diretorio, 0x0131), 'Programa de teste')
  assert.equal(valorDe(diretorio, 0x013b), 'Autora de Teste')
  assert.equal(valorDe(diretorio.filhos[0x8769], 0xa001), 0xffff)
  assert.deepEqual([valorDe(diretorio.filhos[0x8769], 0xa002), valorDe(diretorio.filhos[0x8769], 0xa003)], [600, 400])
  // XMP: nota, etiqueta e bandeira
  const lido = lerSidecarXmp(xmp)
  assert.deepEqual([lido.estrelas, lido.cor, lido.marca], [4, 'verde', 'escolhida'])
  assert.ok(xmp.includes('Programa de teste') && xmp.includes('Autora de Teste'))
  // a imagem: qualidade 92 vai com croma inteira e erro pequeno contra os pixels de entrada
  const d = decodificarJpeg(saida.bytes)
  assert.deepEqual(d.amostragem, [
    [1, 1],
    [1, 1],
    [1, 1],
  ])
  const erro = comparar8(d.rgb, paraRgb8(CENA))
  assert.ok(erro.psnr > 38, `PSNR ${erro.psnr.toFixed(2)} dB`)
  // um perfil só, um EXIF só, um XMP só
  const marcas = lerSegmentosJpeg(saida.bytes).map((s) => s.marcador)
  assert.deepEqual([marcas.filter((m) => m === 0xe1).length, marcas.filter((m) => m === 0xe2).length], [2, 1])
})

test('Instagram: reduz para o lado pedido em sRGB, com nitidez de tela e só os direitos nos metadados', async () => {
  const receita = { ...receitaDaPredefinicao('instagram'), tamanho: { tipo: 'lado', px: 300 } }
  const saida = await gerarSaida(CENA, receita, CONTEXTO)
  assert.deepEqual([saida.largura, saida.altura], [300, 200])
  const d = decodificarJpeg(saida.bytes)
  assert.deepEqual([d.largura, d.altura], [300, 200])
  const { icc, exif, xmp } = extrairDoJpeg(saida.bytes)
  assert.equal(espacoDoPerfil(icc), 'srgb')
  assert.deepEqual(lerExif(saida.bytes), { orientacao: 1 }, 'nada de câmera, data ou exposição')
  const { diretorio } = lerBlocoTiff(exif)
  assert.equal(valorDe(diretorio, 0x8298), '(c) Autora de Teste')
  assert.equal(valorDe(diretorio, 0x0131), undefined)
  assert.equal(valorDe(diretorio.filhos[0x8769], 0xa001), 1, 'ColorSpace = sRGB')
  assert.ok(xmp.includes('(c) Autora de Teste') && !xmp.includes('Rating') && !xmp.includes('Programa de teste'))
  // a nitidez de saída está lá: a mesma receita sem nitidez dá uma imagem menos contrastada no detalhe
  const semNitidez = decodificarJpeg((await gerarSaida(CENA, { ...receita, nitidez: null }, CONTEXTO)).bytes)
  const detalhe = (rgb) => {
    let s = 0
    for (let i = 3; i < rgb.length; i++) s += Math.abs(rgb[i] - rgb[i - 3])
    return s
  }
  assert.ok(detalhe(d.rgb) > detalhe(semNitidez.rgb) * 1.02)
})

test('Prova do cliente: sem máscara não sai; com máscara sai com a marca nos pixels e nenhum metadado', async () => {
  const receita = { ...receitaDaPredefinicao('prova'), tamanho: { tipo: 'lado', px: 320 } }
  await assert.rejects(gerarSaida(CENA, receita, CONTEXTO), /marca-d'água/)
  const saida = await gerarSaida(CENA, receita, { ...CONTEXTO, mascara: MASCARA })
  assert.deepEqual([saida.largura, saida.altura], [320, 213])
  // nenhum APP1 (nem EXIF nem XMP); o perfil fica, porque é cor
  const marcas = lerSegmentosJpeg(saida.bytes).map((s) => s.marcador)
  assert.ok(!marcas.includes(0xe1), 'sem EXIF e sem XMP')
  const dentro = extrairDoJpeg(saida.bytes)
  assert.deepEqual([dentro.exif, dentro.xmp], [null, null])
  assert.equal(espacoDoPerfil(dentro.icc), 'srgb')
  for (const texto of ['Autora', 'Fabricante', 'Programa', 'Lente']) assert.ok(!Buffer.from(saida.bytes).includes(texto), `"${texto}" não aparece no arquivo`)
  // qualidade 80: croma pela metade
  const d = decodificarJpeg(saida.bytes)
  assert.deepEqual(d.amostragem[0], [2, 2])
  // a marca está nos pixels: contra a mesma saída sem marca, uma parte grande da imagem clareou
  const semMarca = decodificarJpeg((await gerarSaida(CENA, { ...receita, marcaDagua: null }, CONTEXTO)).bytes)
  let clareou = 0
  for (let i = 0; i < d.rgb.length; i += 3)
    if (d.rgb[i] + d.rgb[i + 1] + d.rgb[i + 2] - (semMarca.rgb[i] + semMarca.rgb[i + 1] + semMarca.rgb[i + 2]) > 40) clareou++
  const fracao = clareou / (320 * 213)
  assert.ok(fracao > 0.05 && fracao < 0.5, `marca em ${(fracao * 100).toFixed(1)}% da imagem`)
})

test('Impressão: TIFF de 16 bits em Adobe RGB, tamanho cheio, pixels exatos', async () => {
  const saida = await gerarSaida(CENA, receitaDaPredefinicao('impressao'), CONTEXTO)
  assert.deepEqual([saida.tipo, saida.extensao], ['image/tiff', 'tif'])
  const lido = await lerTiff(saida.bytes)
  assert.deepEqual([lido.largura, lido.altura, lido.bits, lido.canais, lido.compressao, lido.orientacao], [600, 400, 16, 3, 'nenhuma', 1])
  assert.equal(espacoDoPerfil(lido.icc), 'adobe')
  assert.deepEqual(lido.dados, paraRgb16(CENA), 'os 16 bits de cada amostra')
  assert.equal(lerExif(saida.bytes).iso, 320)
  assert.equal(lido.gps, null)
  assert.equal(lerSidecarXmp(lido.xmp).estrelas, 4)
  // sem as tags que só valem para JPEG
  assert.equal(valorDe(lido.exif, 0x9101), undefined)
  // com Deflate: os mesmos pixels num arquivo menor
  const comprimido = await gerarSaida(CENA, { ...receitaDaPredefinicao('impressao'), compressao: 'deflate' }, CONTEXTO)
  const lidoDeNovo = await lerTiff(comprimido.bytes)
  assert.equal(lidoDeNovo.compressao, 'deflate')
  assert.deepEqual(lidoDeNovo.dados, lido.dados)
  assert.ok(comprimido.bytes.length < saida.bytes.length)
})

test('PNG: 16 bits exato; 8 bits com pontilhado (erro de até um nível, sem viés); "todos" leva o local', async () => {
  const p16 = await lerPng((await gerarSaida(CENA, { formato: 'png', bits: 16, espaco: 'rec2020' }, CONTEXTO)).bytes)
  assert.deepEqual([p16.bits, espacoDoPerfil(p16.icc), p16.nomeDoPerfil], [16, 'rec2020', 'Rec.2020'])
  assert.deepEqual(p16.dados, paraRgb16(CENA))
  const saida = await gerarSaida(CENA, { formato: 'png', espaco: 'prophoto', metadados: 'todos' }, CONTEXTO)
  assert.equal(saida.tipo, 'image/png')
  const p8 = await lerPng(saida.bytes)
  assert.equal(espacoDoPerfil(p8.icc), 'prophoto')
  let soma = 0
  for (let i = 0; i < p8.dados.length; i++) {
    const d = p8.dados[i] - CENA.dados[i] * 255
    assert.ok(Math.abs(d) <= 1.5, `pontilhado de no máximo um nível (veio ${d})`)
    soma += d
  }
  assert.ok(Math.abs(soma / p8.dados.length) < 0.01, 'o pontilhado não clareia nem escurece a foto')
  // é o mesmo pontilhado do motor: mesmos bytes que paraBytes
  assert.deepEqual(p8.dados, semAlfa(paraBytes(CENA, { bits: 8, pontilhado: true })))
  // metadados "todos": agora o local entra
  const gps = lerBlocoTiff(p8.exif).diretorio.filhos[0x8825]
  assert.equal(valorDe(gps, 1), 'S')
  assert.equal(valorDe(gps, 3), 'W')
  assert.equal(lerExif(p8.exif).lente, 'Lente 85mm')
})

test('gerarSaida: codificador de fora (o canvas do navegador), WebP só com ele, entrada intacta', async () => {
  const copia = CENA.dados.slice()
  const pedidos = []
  const falso = async (pedido) => {
    pedidos.push({ ...pedido, rgba: pedido.rgba.length })
    const { codificarJpeg } = await import('../src/exportar/jpeg.js')
    return codificarJpeg({ largura: pedido.largura, altura: pedido.altura, rgb8: pedido.rgba, qualidade: pedido.qualidade })
  }
  const saida = await gerarSaida(CENA, { formato: 'jpeg', qualidade: 77, espaco: 'p3', tamanho: 200 }, { ...CONTEXTO, codificar: falso })
  assert.deepEqual(pedidos, [{ formato: 'jpeg', largura: 200, altura: 133, rgba: 200 * 133 * 4, qualidade: 77 }])
  assert.equal(espacoDoPerfil(extrairDoJpeg(saida.bytes).icc), 'p3', 'o perfil entra depois, em cima do que o codificador devolveu')
  assert.equal(lerExif(saida.bytes).iso, 320)
  // de 90 para cima o codificador de fora não é chamado: o canvas não faz croma inteira, e a receita pede
  const alta = await gerarSaida(CENA, { formato: 'jpeg', qualidade: 92, tamanho: 200 }, { ...CONTEXTO, codificar: falso })
  assert.equal(pedidos.length, 1)
  assert.deepEqual(decodificarJpeg(alta.bytes).amostragem[0], [1, 1])

  await assert.rejects(gerarSaida(CENA, { formato: 'webp' }, CONTEXTO), /WebP/)
  const webp = await gerarSaida(CENA, { formato: 'webp', espaco: 'p3', qualidade: 80 }, { ...CONTEXTO, codificar: async () => Uint8Array.of(1, 2, 3) })
  assert.deepEqual([webp.tipo, webp.extensao, webp.receita.espaco, Array.from(webp.bytes)], ['image/webp', 'webp', 'srgb', [1, 2, 3]])
  assert.deepEqual(Object.keys(TIPOS_MIME), ['jpeg', 'tiff', 'png', 'webp'])
  assert.deepEqual(CENA.dados, copia, 'a imagem de entrada não é tocada')
  // sem contexto nenhum também sai (só a imagem e o perfil)
  const nua = await gerarSaida(CENA, { tamanho: 100 })
  const dentro = extrairDoJpeg(nua.bytes)
  assert.equal(espacoDoPerfil(dentro.icc), 'srgb')
  assert.deepEqual(lerExif(nua.bytes), { orientacao: 1 })
})

test('Chromium: o núcleo de exportação roda igual no navegador, e a foto em P3 abre com a cor certa', { skip: semChromium, timeout: 300000 }, async () => {
  const cena = cenaDeTeste(240, 160, 23)
  const navegador = await abrirChromium()
  try {
    const pagina = await navegador.newPage()
    const erros = []
    pagina.on('pageerror', (e) => erros.push(String(e)))
    // um site de mentira que serve só o núcleo (src/), como o gate serve em produção
    await pagina.route('https://foto.teste/**', async (rota) => {
      const caminho = new URL(rota.request().url()).pathname
      if (caminho === '/') return rota.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>teste</title>' })
      const arquivo = normalize(join(RAIZ, caminho))
      if (!arquivo.startsWith(join(RAIZ, 'src'))) return rota.fulfill({ status: 404, body: '' })
      return rota.fulfill({ contentType: 'text/javascript; charset=utf-8', body: await readFile(arquivo) })
    })
    await pagina.goto('https://foto.teste/')
    const doNavegador = await pagina.evaluate(
      async ({ b64, largura, altura, contexto }) => {
        const { gerarSaida, receitaDaPredefinicao } = await import('/src/exportar/fila.js')
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const imagem = { largura, altura, dados: new Float32Array(bytes.buffer) }
        // o codificador do navegador: canvas em Display P3 → JPEG
        const canvas = async ({ formato, largura, altura, rgba, qualidade }) => {
          const quadro = new OffscreenCanvas(largura, altura)
          const ctx = quadro.getContext('2d', { colorSpace: 'display-p3' })
          ctx.putImageData(new ImageData(rgba, largura, altura, { colorSpace: 'display-p3' }), 0, 0)
          const blob = await quadro.convertToBlob({ type: `image/${formato}`, quality: qualidade / 100 })
          return new Uint8Array(await blob.arrayBuffer())
        }
        const texto = (u8) => {
          let s = ''
          for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192))
          return btoa(s)
        }
        const abrir = async (u8, tipo, tela) => {
          const bmp = await createImageBitmap(new Blob([u8], { type: tipo }))
          const quadro = new OffscreenCanvas(bmp.width, bmp.height)
          const ctx = quadro.getContext('2d', { colorSpace: tela })
          ctx.drawImage(bmp, 0, 0)
          return Array.from(ctx.getImageData(0, 0, bmp.width, bmp.height, { colorSpace: tela }).data)
        }
        const entrega = receitaDaPredefinicao('entrega')
        const proprio = await gerarSaida(imagem, entrega, contexto)
        const comCanvas = await gerarSaida(imagem, { ...entrega, qualidade: 80 }, { ...contexto, codificar: canvas })
        const png = await gerarSaida(imagem, { formato: 'png', bits: 16, espaco: 'p3' }, contexto)
        const tiff = await gerarSaida(imagem, { formato: 'tiff', bits: 16, espaco: 'adobe', compressao: 'deflate' }, contexto)
        // cor lisa em P3, lida numa tela sRGB: o navegador converte pelo perfil que embutimos
        const lisa = { largura: 16, altura: 16, dados: new Float32Array(16 * 16 * 3) }
        for (let i = 0; i < lisa.dados.length; i += 3) lisa.dados.set(contexto.corLisa, i)
        const pngLiso = await gerarSaida(lisa, { formato: 'png', bits: 16, espaco: 'p3' }, {})
        return {
          proprio: texto(proprio.bytes),
          comCanvas: texto(comCanvas.bytes),
          png: texto(png.bytes),
          tiff: texto(tiff.bytes),
          proprioAberto: await abrir(proprio.bytes, 'image/jpeg', 'display-p3'),
          canvasAberto: await abrir(comCanvas.bytes, 'image/jpeg', 'display-p3'),
          pngAberto: await abrir(png.bytes, 'image/png', 'display-p3'),
          lisoEmSrgb: (await abrir(pngLiso.bytes, 'image/png', 'srgb')).slice(0, 3),
          lisoEmP3: (await abrir(pngLiso.bytes, 'image/png', 'display-p3')).slice(0, 3),
        }
      },
      {
        b64: base64(new Uint8Array(cena.dados.buffer)),
        largura: cena.largura,
        altura: cena.altura,
        // uma cor de dentro do sRGB, escrita em códigos de Display P3
        contexto: { ...CONTEXTO, corLisa: mulV(matrizEntre('srgb', 'p3'), [0.5, 0.3, 0.2]).map((v) => curvaDe('p3').codificar(v)) },
      },
    )
    assert.deepEqual(erros, [], 'nenhum erro na página')
    const bytes = (b64) => new Uint8Array(Buffer.from(b64, 'base64'))
    const rgb8 = paraRgb8(cena)

    // 1. o codificador próprio dá os MESMOS bytes no navegador e no Node
    const noNode = await gerarSaida(cena, receitaDaPredefinicao('entrega'), CONTEXTO)
    assert.deepEqual(bytes(doNavegador.proprio), noNode.bytes, 'JPEG do navegador idêntico ao do Node')
    assert.ok(comparar8(semAlfa(doNavegador.proprioAberto), rgb8).psnr > 38, 'e o navegador abre o que escrevemos')

    // 2. com o codificador do canvas: a imagem é a do navegador, os metadados são os nossos, sem nada em dobro
    const comCanvas = bytes(doNavegador.comCanvas)
    const dentro = extrairDoJpeg(comCanvas)
    assert.equal(espacoDoPerfil(dentro.icc), 'p3')
    assert.equal(lerExif(comCanvas).iso, 320)
    assert.equal(lerSidecarXmp(dentro.xmp).estrelas, 4)
    const marcas = lerSegmentosJpeg(comCanvas).map((s) => s.marcador)
    assert.deepEqual([marcas.filter((m) => m === 0xe1).length, marcas.filter((m) => m === 0xe2).length], [2, 1], 'um EXIF, um XMP, um perfil')
    // (qualidade 80 em 4:2:0: nesta cena de bordas duras de cor isso dá perto de 29 dB, no canvas e no nosso)
    const doCanvas = comparar8(semAlfa(doNavegador.canvasAberto), rgb8)
    assert.ok(doCanvas.psnr > 27.5, `a foto codificada pelo canvas volta em P3 (${doCanvas.psnr.toFixed(2)} dB)`)
    assert.notDeepEqual(comCanvas, bytes(doNavegador.proprio), 'é mesmo outro codificador')

    // 3. PNG e TIFF de 16 bits escritos no navegador (com a compressão dele) e lidos aqui: pixels exatos
    assert.deepEqual((await lerPng(bytes(doNavegador.png))).dados, paraRgb16(cena))
    const tiff = await lerTiff(bytes(doNavegador.tiff))
    assert.deepEqual([tiff.compressao, espacoDoPerfil(tiff.icc)], ['deflate', 'adobe'])
    assert.deepEqual(tiff.dados, paraRgb16(cena))
    assert.ok(comparar8(semAlfa(doNavegador.pngAberto), rgb8).maior <= 1, 'PNG em P3 numa tela P3: os mesmos códigos')

    // 4. Display P3 → sRGB pelo navegador dá a cor que a conta diz
    const esperado = [0.5, 0.3, 0.2].map((v) => Math.round(curvaDe('srgb').codificar(v) * 255))
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(doNavegador.lisoEmSrgb[c] - esperado[c]) <= 1, `sRGB: ${doNavegador.lisoEmSrgb} × ${esperado}`)
    const emP3 = mulV(matrizEntre('srgb', 'p3'), [0.5, 0.3, 0.2]).map((v) => Math.round(curvaDe('p3').codificar(v) * 255))
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(doNavegador.lisoEmP3[c] - emP3[c]) <= 1, `P3: ${doNavegador.lisoEmP3} × ${emP3}`)
  } finally {
    await navegador.close()
  }
})
