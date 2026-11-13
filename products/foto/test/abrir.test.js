// src/abrir.js (a porta única) e src/raw/sony.js (ARW da Sony já sem mosaico). Tudo fabricado com semente; os
// testes com arquivo real pulam com mensagem quando as amostras não estão (as CC0, com FOTO_EXIGIR_AMOSTRAS=1, viram
// falha; as do titular só existem na máquina dele).

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { abrirFoto, abrirImagem, conferirBase, ErroRaw } from '../src/abrir.js'
import { lerSonySemMosaico, ehSonySemMosaico } from '../src/raw/sony.js'
import { escreverDng } from '../src/raw/dng.js'
import { criarNegativo } from '../src/raw/negativo.js'
import { EXPOSICAO_DE_REFERENCIA, exposicaoDaCamera, prepararBase } from '../src/motor/base.js'
import { revelar } from '../src/motor/revelar.js'
import { neutro } from '../src/motor/ajustes.js'
import { autoExposicao } from '../src/motor/auto.js'
import { decodificarJpeg } from '../src/raw/jpeg.js'
import { codificarJpeg } from '../src/exportar/jpeg.js'
import { criarOklab } from '../src/motor/cor/oklab.js'
import { CURVAS } from '../src/motor/cor/espacos.js'
import { fabricarNegativo, acaso, carregarLibRaw, precisaDoLibRaw, precisaDeAmostras, lerAmostra, montarTiff } from './apoio-raw.js'
import { fabricarArwSemMosaico } from './apoio-abrir.js'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const titular = path.join(process.env.FOTO_AMOSTRAS || path.join(raiz, '.amostras'), 'titular')
// Os arquivos do titular nunca saem da máquina dele (não há de onde baixar): sem eles o teste só pula, mesmo no CI.
function precisaDoTitular(t, ...partes) {
  if (existsSync(path.join(titular, ...partes))) return true
  t.skip(`sem .amostras/titular/${partes.join('/')} (arquivos do titular, fora do git)`)
  return false
}

// RGB de câmera já equilibrado, liso (degradês e manchas largas), com o preto do dado em 1024
function rgbLiso(largura, altura, semente = 3) {
  const { u } = acaso(semente)
  const fases = Array.from({ length: 6 }, () => u() * Math.PI * 2)
  const rgb = new Uint16Array(largura * altura * 3)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const base = 1024 + 6000 * (0.5 + 0.4 * Math.sin(x / 23 + fases[0]) * Math.cos(y / 31 + fases[1]))
      const o = (y * largura + x) * 3
      rgb[o] = Math.round(base * (1 + 0.25 * Math.sin(x / 41 + fases[2])))
      rgb[o + 1] = Math.round(base)
      rgb[o + 2] = Math.round(base * (1 + 0.25 * Math.cos(y / 37 + fases[3])))
    }
  }
  return rgb
}

test('ARW da Sony sem mosaico (YCbCr 4:2:0 em blocos de JPEG sem perdas): luma exata, cor de volta, tags lidas', () => {
  const largura = 150
  const altura = 100
  const rgb = rgbLiso(largura, altura)
  const { bytes, Y } = fabricarArwSemMosaico({ largura, altura, rgb, bloco: 64, orientacao: 6 })
  assert.equal(ehSonySemMosaico(bytes), true)
  const s = lerSonySemMosaico(bytes)
  assert.equal(s.sensor.largura, largura)
  assert.equal(s.sensor.altura, altura)
  assert.equal(s.sensor.amostras, 3)
  assert.deepEqual(s.preto.porCanal, [1024, 1024, 1024])
  assert.deepEqual(s.branco.declarado, [18878, 18878, 18878])
  assert.deepEqual(s.recorte, { x: 2, y: 2, largura: largura - 4, altura: altura - 4 })
  assert.equal(s.wb.aplicado, true)
  assert.ok(Math.abs(s.wb.comoFotografado[0] - 2340 / 1024) < 1e-9 && Math.abs(s.wb.comoFotografado[2] - 1648 / 1024) < 1e-9)
  // a luma do arquivo volta exata (o RGB decodificado refaz o Y com erro só de arredondamento)
  let piorY = 0
  let piorCor = 0
  let somaCor = 0
  const d = s.sensor.dados
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const o = (y * largura + x) * 3
      const yy = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]
      piorY = Math.max(piorY, Math.abs(yy - Y[y * largura + x]))
      const erro = Math.max(Math.abs(d[o] - rgb[o]), Math.abs(d[o + 1] - rgb[o + 1]), Math.abs(d[o + 2] - rgb[o + 2]))
      somaCor += erro
      // no lugar da amostra de croma a cor volta exata (só arredondamento); entre elas, o bilinear num degradê liso
      if (!(x & 1) && !(y & 1)) piorCor = Math.max(piorCor, erro)
    }
  }
  assert.ok(piorY <= 1, `luma: pior ${piorY}`)
  assert.ok(piorCor <= 2, `cor no lugar do croma: pior ${piorCor} DN`)
  assert.ok(somaCor / (largura * altura) < 3, `cor média: ${(somaCor / (largura * altura)).toFixed(2)} DN`)
  // não é Sony sem mosaico: null, sem lançar
  assert.equal(lerSonySemMosaico(escreverDng(criarNegativo(fabricarNegativo({ largura: 32, altura: 24 })))), null)
  assert.equal(lerSonySemMosaico(new Uint8Array(100)), null)
})

test('ARW sem mosaico truncado: ErroRaw com motivo, nunca imagem vazia', () => {
  const rgb = rgbLiso(64, 64)
  const { bytes } = fabricarArwSemMosaico({ largura: 64, altura: 64, rgb, bloco: 32 })
  assert.throws(
    () => lerSonySemMosaico(bytes.subarray(0, bytes.length - 200)),
    (e) => e instanceof ErroRaw && e.codigo === 'corrompido',
  )
})

test('abrirFoto: DNG fabricado sem LibRaw (Latitude medida, redução, recorte do arquivo, orientação, opcodes)', async () => {
  const n = criarNegativo(fabricarNegativo({ largura: 240, altura: 160, semente: 5 }))
  n.exif.orientacao = 6
  n.recorte = { x: 8, y: 4, largura: 224, altura: 148 }
  // vinheta radial na lista 3 (ganho que só depende da posição): o canto clareia, o centro quase não muda
  n.opcodes = { lista3: [{ id: 3, k: [0.5, 0, 0, 0, 0], centro: { x: 0.5, y: 0.5 } }] }
  const bytes = escreverDng(n)
  const r = await abrirFoto(bytes, { nome: 'sintetico.dng' })
  assert.equal(r.origem, 'raw')
  assert.equal(r.base.origem, 'raw')
  assert.equal(r.base.orientacao, 6)
  assert.deepEqual([r.base.imagem.largura, r.base.imagem.altura], [224, 148])
  assert.ok(r.latitude && r.latitude.preto.length === 3)
  assert.equal(r.camera.fabricante, 'ZRO')
  assert.ok(Array.isArray(r.avisos) && r.avisos.length === 0, r.avisos.join(' / '))
  const sem = await abrirFoto(escreverDng({ ...n, opcodes: undefined }), { nome: 'sintetico.dng' })
  const lum = (b, x, y) => b.imagem.dados[(y * b.imagem.largura + x) * 3 + 1]
  const canto = lum(r.base, 2, 2) / lum(sem.base, 2, 2)
  const centro = lum(r.base, 112, 74) / lum(sem.base, 112, 74)
  assert.ok(canto > 1.3, `vinheta: canto ×${canto.toFixed(2)}`)
  assert.ok(Math.abs(centro - 1) < 0.02, `vinheta: centro ×${centro.toFixed(3)}`)
  const r2 = await abrirFoto(bytes, { nome: 'sintetico.dng', reduzir: 2 })
  assert.deepEqual([r2.base.imagem.largura, r2.base.imagem.altura], [112, 74])
  assert.equal(r2.base.demosaico, 'agrupado')
})

test('abrirFoto: o zero da exposição (BaselineExposure + referência; fabricante só fora do DNG) entra na base e na Latitude', async () => {
  const n = criarNegativo(fabricarNegativo({ largura: 64, altura: 48, semente: 3, exposicaoBase: 0.35 }))
  const r = await abrirFoto(escreverDng(n), { nome: 'zero.dng' })
  const ev = 0.35 + EXPOSICAO_DE_REFERENCIA
  assert.ok(Math.abs(r.base.exposicaoBase - ev) < 1e-9, `base: ${r.base.exposicaoBase}`)
  // a margem acima do cinza parte do mesmo zero: o branco da tela continua onde o sensor satura
  assert.ok(Math.abs(r.latitude.margem.acimaDoCinza - (Math.log2(1 / 0.18) + ev)) < 1e-9, `latitude: ${r.latitude.margem.acimaDoCinza}`)
  // o número do fabricante só vale para quem não declara (o DNG já traz o dele)
  assert.equal(exposicaoDaCamera({ fabricante: 'SONY', exposicaoBase: 0 }), EXPOSICAO_DE_REFERENCIA + 0.4)
  assert.equal(exposicaoDaCamera({ fabricante: 'SONY', exposicaoBase: 0.35 }, { dng: true }), EXPOSICAO_DE_REFERENCIA + 0.35)
  assert.equal(exposicaoDaCamera({ fabricante: 'Canon', exposicaoBase: 0 }), EXPOSICAO_DE_REFERENCIA)
})

test('abrirFoto: JPEG reduzido guarda a redução na base (a vizinhança mede na escala da foto cheia)', async () => {
  const largura = 64
  const altura = 48
  const rgb8 = new Uint8Array(largura * altura * 3)
  for (let i = 0; i < rgb8.length; i++) rgb8[i] = (i * 37) % 251
  const jpeg = codificarJpeg({ largura, altura, rgb8 })
  for (const reduzir of [1, 2, 4]) {
    const r = await abrirFoto(jpeg, { nome: 'foto.jpg', reduzir })
    assert.equal(r.origem, 'imagem')
    assert.equal(r.base.reduzir, reduzir)
    assert.deepEqual([r.base.imagem.largura, r.base.imagem.altura], [largura / reduzir, altura / reduzir])
  }
})

test('abrirFoto recusa com motivo: sem leitor para RAW de fabricante, PNG decodifica na tela, imagem toda preta', async () => {
  await assert.rejects(abrirFoto(Uint8Array.of(0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0), { nome: 'x.cr2' }), (e) => e instanceof ErroRaw && /leitor de RAW/.test(e.message))
  const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52)
  await assert.rejects(abrirFoto(png, { nome: 'a.png' }), (e) => e instanceof ErroRaw && e.decodificarNaTela === true)
  await assert.rejects(abrirFoto(new Uint8Array(4)), (e) => e instanceof ErroRaw && e.codigo === 'corrompido')
  // sensor todo no preto: abre, mas a conferência não deixa passar uma foto vazia
  const n = criarNegativo(fabricarNegativo({ largura: 64, altura: 48, sinal: () => 0, leitura: 0 }))
  await assert.rejects(abrirFoto(escreverDng(n), { nome: 'preto.dng' }), (e) => e instanceof ErroRaw && e.codigo === 'corrompido' && /toda preta/.test(e.message))
  // conferência direta: branca (tudo acima da saturação) e números inválidos
  const branca = { imagem: { largura: 8, altura: 8, dados: new Float32Array(192).fill(4) } }
  assert.throws(() => conferirBase(branca), (e) => e instanceof ErroRaw && /toda branca/.test(e.message))
  const nan = { imagem: { largura: 8, altura: 8, dados: new Float32Array(192).fill(NaN) } }
  assert.throws(() => conferirBase(nan), (e) => e instanceof ErroRaw && /inválidos/.test(e.message))
})

test('DNG em JPEG XL (ProRAW novo): recusa dizendo o que fazer', async () => {
  const ifd = [
    [0x00fe, 4, 0],
    [0x0100, 4, 16],
    [0x0101, 4, 16],
    [0x0102, 3, [16, 16, 16]],
    [0x0103, 3, 52546],
    [0x0106, 3, 34892],
    [0x0115, 3, 3],
    [0xc612, 1, Uint8Array.of(1, 7, 0, 0)],
    [0xc621, 10, [[1, 1], [0, 1], [0, 1], [0, 1], [1, 1], [0, 1], [0, 1], [0, 1], [1, 1]]],
    [0x0111, 4, { pos: 'd' }],
    [0x0117, 4, { tam: 'd' }],
  ]
  const bytes = montarTiff({ blocos: [{ nome: 'ifd0', ifd }, { nome: 'd', bytes: new Uint8Array(64) }] }).bytes
  await assert.rejects(abrirFoto(bytes, { nome: 'IMG_0001.DNG' }), (e) => e instanceof ErroRaw && e.codigo === 'sem-suporte' && /JPEG XL/.test(e.message) && /JPEG sem perdas/.test(e.message))
})

test('abrirImagem: foto já decodificada vira base, com a orientação do EXIF', () => {
  const dados = new Uint8ClampedArray(16 * 8 * 4).fill(128)
  const r = abrirImagem({ largura: 16, altura: 8, dados, canais: 4, espaco: 'p3', exif: { orientacao: 8 } })
  assert.equal(r.origem, 'imagem')
  assert.equal(r.latitude, null)
  assert.equal(r.base.orientacao, 8)
  assert.equal(r.base.espaco, 'p3')
  assert.deepEqual([r.base.imagem.largura, r.base.imagem.altura], [16, 8])
})

// ─────────── arquivos reais ───────────

const oklab = criarOklab('srgb')
const decodificar = CURVAS.srgb.decodificar
/** Média de L, a e b em Oklab de uma imagem de tela sRGB (float 0..1 ou bytes RGB). */
function mediaOklab(dados, n, bytes) {
  const o = [0, 0, 0]
  const s = [0, 0, 0]
  const passo = Math.max(1, Math.floor(n / 50000))
  let k = 0
  for (let p = 0; p < n; p += passo, k++) {
    const i = p * 3
    const c = (v) => decodificar(bytes ? v / 255 : Math.min(1, Math.max(0, v)))
    oklab.paraOklab(c(dados[i]), c(dados[i + 1]), c(dados[i + 2]), o)
    s[0] += o[0]
    s[1] += o[1]
    s[2] += o[2]
  }
  return s.map((v) => v / k)
}

/** Revelação neutra com a exposição automática (é o que a pessoa vê ao abrir) contra a prévia JPEG do arquivo. */
function compararComPrevia(r) {
  const aj = neutro()
  aj.luz.exposicao = autoExposicao(r.base).exposicao
  const tela = revelar(r.base, aj, { tela: 'srgb' })
  const rev = mediaOklab(tela.dados, tela.largura * tela.altura, false)
  const p = decodificarJpeg(r.previa.jpeg, { reduzir: 8 })
  const pre = mediaOklab(p.dados, p.largura * p.altura, true)
  return { dL: rev[0] - pre[0], dAb: Math.hypot(rev[1] - pre[1], rev[2] - pre[2]) }
}

test('Sony "sem perdas" M real: abre, revela com cor natural e o leitor próprio bate com o LibRaw', async (t) => {
  if (!precisaDoTitular(t, 'sequencia', 'DSC08455.ARW')) return
  const LibRaw = await carregarLibRaw()
  if (!precisaDoLibRaw(t, LibRaw)) return
  const { criarLeitor } = await import('../src/raw/libraw.js')
  const leitor = criarLeitor(LibRaw)
  const linhas = []
  for (const nome of ['DSC08455.ARW', 'DSC08485.ARW']) {
    const caminho = path.join(titular, 'sequencia', nome)
    if (!existsSync(caminho)) continue
    const bytes = new Uint8Array(await readFile(caminho))
    const t0 = performance.now()
    const r = await abrirFoto(bytes, { nome, leitor, reduzir: 4 })
    const ms = performance.now() - t0
    assert.equal(r.origem, 'raw')
    assert.equal(r.camera.modelo, 'ILCE-7M4')
    assert.equal(r.base.demosaico, 'agrupado')
    assert.deepEqual([r.base.imagem.largura, r.base.imagem.altura], [1152, 768])
    assert.deepEqual(r.latitude.preto, [1024, 1024, 1024])
    const c = compararComPrevia(r)
    assert.ok(c.dAb < 0.03, `${nome}: dominante de cor contra a prévia, Δab ${c.dAb.toFixed(3)}`)
    assert.ok(Math.abs(c.dL) < 0.1, `${nome}: luz contra a prévia, ΔL ${c.dL.toFixed(3)}`)
    linhas.push(`${nome}: ${ms.toFixed(0)} ms (reduzir 4), ΔL ${c.dL.toFixed(3)}, Δab ${c.dAb.toFixed(3)}`)

    // conferência independente: o RGB do LibRaw (croma repetido) contra o nosso no lugar das amostras de croma
    const proprio = lerSonySemMosaico(bytes)
    const lr = new LibRaw()
    await lr.waitUntilReady()
    lr.open(bytes.slice().buffer)
    lr.unpack()
    const c4 = lr.getColor4Image()
    const W = lr.getRawWidth()
    let pior = 0
    for (let y = 100; y < 3000; y += 202) {
      for (let x = 100; x < 4500; x += 302) {
        const o = (y * proprio.sensor.largura + x) * 3
        for (let k = 0; k < 3; k++) pior = Math.max(pior, Math.abs(proprio.sensor.dados[o + k] - c4[(y * W + x) * 4 + k]))
      }
    }
    lr.dispose()
    assert.ok(pior <= 2, `${nome}: diferença para o LibRaw ${pior} DN`)
  }
  t.diagnostic(linhas.join(' · '))
})

test('amostras CC0: todas abrem pela porta única (ou são recusadas com motivo) e a cor fica perto da prévia', async (t) => {
  if (!precisaDeAmostras(t)) return
  const LibRaw = await carregarLibRaw()
  if (!precisaDoLibRaw(t, LibRaw)) return
  const { criarLeitor } = await import('../src/raw/libraw.js')
  const leitor = criarLeitor(LibRaw)
  const linhas = []
  for (const nome of ['adobe_5d3_lossy.dng', 'canon_r6.cr3', 'nikon_d70s.nef', 'pixel6pro.dng', 'samsung_g973.dng', 'sony_a7s.arw', 'fuji_xt30ii.raf']) {
    const bytes = await lerAmostra(nome)
    const t0 = performance.now()
    const r = await abrirFoto(bytes, { nome, leitor, reduzir: 4 })
    const ms = performance.now() - t0
    if (nome === 'samsung_g973.dng') {
      // é um JPEG com nome de RAW: abre como foto pronta
      assert.equal(r.origem, 'imagem')
      assert.ok(r.avisos.some((a) => /nome de RAW/.test(a)))
      linhas.push(`${nome}: JPEG, ${ms.toFixed(0)} ms`)
      continue
    }
    if (nome === 'pixel6pro.dng') assert.ok(r.avisos.some((a) => /distorção da lente/.test(a)), 'o WarpRectilinear do Pixel é avisado')
    if (nome === 'adobe_5d3_lossy.dng') assert.equal(r.base.demosaico, 'agrupado')
    const c = compararComPrevia(r)
    assert.ok(c.dAb < 0.04, `${nome}: Δab ${c.dAb.toFixed(3)}`)
    assert.ok(Math.abs(c.dL) < 0.12, `${nome}: ΔL ${c.dL.toFixed(3)}`)
    linhas.push(`${nome}: ${ms.toFixed(0)} ms, ΔL ${c.dL.toFixed(3)}, Δab ${c.dAb.toFixed(3)}`)
  }
  t.diagnostic(linhas.join(' · '))
})

test('JPEG do Lightroom em Display P3: o espaço vem do perfil ICC', async (t) => {
  if (!precisaDoTitular(t, 'ensaio-lr', 'final')) return
  const { readdirSync } = await import('node:fs')
  const pasta = path.join(titular, 'ensaio-lr', 'final')
  const nome = readdirSync(pasta).find((f) => /\.jpe?g$/i.test(f))
  if (!nome) return t.skip('sem JPEG em ensaio-lr/final')
  const r = await abrirFoto(new Uint8Array(await readFile(path.join(pasta, nome))), { nome, reduzir: 4 })
  assert.equal(r.origem, 'imagem')
  assert.equal(r.base.espaco, 'p3')
})

test('base sem mosaico com o branco já aplicado no dado (YCbCr da Sony): o branco não é aplicado duas vezes', () => {
  // negativo linear fabricado em memória: RGB de câmera com o branco já aplicado, como o YCbCr da Sony
  const largura = 64
  const altura = 48
  const rgb = rgbLiso(largura, altura, 9)
  const n = criarNegativo({
    tipo: 'raw',
    sensor: { largura, altura, amostras: 3, dados: rgb },
    area: { x: 0, y: 0, largura, altura },
    cfa: { tipo: 'linear' },
    preto: { porCanal: [1024, 1024, 1024] },
    branco: { declarado: [18878, 18878, 18878] },
    wb: { comoFotografado: [2.285, 1, 1.609], aplicado: true },
    cor: { origem: 'libraw', matrizes: [{ kelvin: 6500, xyzParaCamera: [0.746, -0.2365, -0.0588, -0.5687, 1.3442, 0.2474, -0.0624, 0.1156, 0.6584] }] },
  })
  const b = prepararBase(n)
  assert.equal(b.demosaico, null)
  // pixel com R = G = B no dado equilibrado tem de sair neutro (o branco não foi aplicado duas vezes)
  const cinza = criarNegativo({ ...n, sensor: { largura: 2, altura: 2, amostras: 3, dados: new Uint16Array(12).fill(5000) }, area: { x: 0, y: 0, largura: 2, altura: 2 } })
  const bc = prepararBase(cinza)
  const [r, g, bb] = bc.imagem.dados
  assert.ok(Math.abs(r / g - 1) < 1e-3 && Math.abs(bb / g - 1) < 1e-3, `neutro: ${r.toFixed(4)} ${g.toFixed(4)} ${bb.toFixed(4)}`)
})
