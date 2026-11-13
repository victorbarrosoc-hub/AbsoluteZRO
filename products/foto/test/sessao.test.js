// A sessão de revelação (app/motor/sessao.js + motor-worker.js) no Chromium de verdade, servida com os cabeçalhos de
// produção: abrir um DNG fabricado (escreverDng) e um JPEG desenhado; a prévia embutida aparece antes da base; ajustar
// muda os pixels; histograma e automático respondem; exportarPixels devolve o tamanho cheio e bate com revelar do JS;
// sem placa de verdade a sessão cai para o JS e diz isso; contexto perdido não deixa tela preta; zoom de 100% pede a
// base cheia.
//
// FOTO_MEDIR=1 roda também as medidas de tempo (DNG fabricado de 24 MP e, se as amostras existirem, um ARW real).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { abrirFoto } from '../src/abrir.js'
import { escreverDng } from '../src/raw/dng.js'
import { revelarEmBytes } from '../src/motor/revelar.js'
import { cena, fotografar } from './apoio-motor.js'
import { EXIGIR, desenharJpegs } from './apoio-tela.js'
import { abrirPagina, deBase64, semChromium } from './apoio-gpu.js'
import { caminhoDaAmostra } from './apoio-raw.js'

const pular = semChromium && !EXIGIR ? semChromium : false
const MEDIR = process.env.FOTO_MEDIR === '1'

/** DNG fabricado: a cena sintética fotografada por uma câmera conhecida, com a JPEG `previa` embutida. */
function dngDe(imagem, previa, { largura, altura } = {}) {
  const { negativo } = fotografar(imagem, { margem: { x: 0, y: 0, direita: 0, baixo: 0 }, origem: 'dng' })
  negativo.formato = 'dng'
  negativo.fabricante = 'ZRO'
  negativo.modelo = 'Sintetica'
  negativo.exif = { ...negativo.exif, orientacao: 1, iso: 400, tempo: 1 / 250, abertura: 2.8, focal: 50 }
  if (previa) negativo.previa = { jpeg: new Uint8Array(previa), largura, altura }
  return Buffer.from(escreverDng(negativo))
}

// Cena grande sem custo de 16 amostras por pixel: a sintética pequena ampliada por bilinear, mais uma trama fina.
function cenaGrande(largura, altura) {
  const p = cena(41, 600, 400)
  const dados = new Float32Array(largura * altura * 3)
  for (let y = 0; y < altura; y++) {
    const fy = (y / altura) * 399
    const y0 = Math.floor(fy)
    const ty = fy - y0
    const y1 = Math.min(399, y0 + 1)
    for (let x = 0; x < largura; x++) {
      const fx = (x / largura) * 599
      const x0 = Math.floor(fx)
      const tx = fx - x0
      const x1 = Math.min(599, x0 + 1)
      const fino = 1 + 0.08 * Math.sin(x * 0.9) * Math.sin(y * 1.1)
      for (let c = 0; c < 3; c++) {
        const v =
          (p.dados[(y0 * 600 + x0) * 3 + c] * (1 - tx) + p.dados[(y0 * 600 + x1) * 3 + c] * tx) * (1 - ty) +
          (p.dados[(y1 * 600 + x0) * 3 + c] * (1 - tx) + p.dados[(y1 * 600 + x1) * 3 + c] * tx) * ty
        dados[(y * largura + x) * 3 + c] = v * fino
      }
    }
  }
  return { largura, altura, dados }
}

// O código que a página roda: monta o visor, cria a sessão e guarda os eventos.
const MONTAR = async ({ motor, largura = 900, altura = 600 }) => {
  const { criarSessao } = await import('/app/motor/sessao.js')
  document.body.style.margin = '0'
  const caixa = document.createElement('div')
  caixa.style.cssText = `width:${largura}px;height:${altura}px;display:flex;align-items:center;justify-content:center`
  const canvas = document.createElement('canvas')
  caixa.append(canvas)
  document.body.append(caixa)
  window.__eventos = []
  window.__t0 = performance.now()
  window.__s = criarSessao({ canvas, motor, guardarQuadro: true, aoMudar: (e) => window.__eventos.push({ ...e, t: performance.now() - window.__t0 }) })
  window.__canvas = canvas
  window.__quadro = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
  window.__media = () => {
    const { dados } = window.__s.lerTela()
    let soma = 0
    let n = 0
    for (let i = 0; i < dados.length; i += 4) {
      soma += dados[i] + dados[i + 1] + dados[i + 2]
      n += 3
    }
    return soma / n
  }
  window.__b64 = (t) => {
    let s = ''
    const u = new Uint8Array(t.buffer, t.byteOffset, t.byteLength)
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  }
  return window.__s.estado()
}

// abre o arquivo servido em /teste/<nome> pelo roteamento do Playwright
const ABRIR = async (nome) => {
  window.__t0 = performance.now()
  window.__eventos = []
  const blob = await (await fetch(`/teste/${nome}`)).blob()
  const info = await window.__s.abrir(new File([blob], nome, { lastModified: 1 }))
  await window.__quadro()
  return { info, eventos: window.__eventos.slice(), media: window.__media() }
}

async function servirArquivo(pagina, nome, corpo) {
  await pagina.route(`**/teste/${nome}`, (rota) => rota.fulfill({ status: 200, body: corpo, contentType: 'application/octet-stream' }))
}

const AJUSTES_EXPORTAR = { luz: { exposicao: 0.3, contraste: 20, sombras: 30 }, cor: { saturacao: 20, vibracao: 10 } }

const NA_PLACA = 'sessão na placa: DNG fabricado abre em dois tempos, ajusta, mede, exporta igual ao JS e pede a base cheia no zoom'
test(NA_PLACA, { skip: pular, timeout: 300000 }, async () => {
  const s = await abrirPagina()
  try {
    const [previa] = await desenharJpegs(s.navegador, { quantas: 1, largura: 600, altura: 400 })
    const dng = dngDe(cena(5, 1200, 800), previa, { largura: 600, altura: 400 })
    await servirArquivo(s.pagina, 'IMG_0001.DNG', dng)
    const estado = await s.pagina.evaluate(MONTAR, { motor: 'gpu' })
    assert.equal(estado.motor, 'gpu')
    const r = await s.pagina.evaluate(ABRIR, 'IMG_0001.DNG')
    // dois tempos: a prévia embutida antes da base
    const tipos = r.eventos.map((e) => e.tipo)
    assert.ok(tipos.indexOf('previa') >= 0 && tipos.indexOf('previa') < tipos.indexOf('base'), `ordem: ${tipos}`)
    assert.equal(r.info.largura, 1200)
    assert.equal(r.info.altura, 800)
    assert.equal(r.info.origem, 'raw')
    assert.ok(r.media > 20, `a tela não está preta (média ${r.media.toFixed(1)})`)
    // ajustar muda os pixels (e só o último pedido vale)
    const depois = await s.pagina.evaluate(async () => {
      for (const ev of [0.2, 0.5, 1]) window.__s.ajustar({ luz: { exposicao: ev } })
      await window.__quadro()
      return window.__media()
    })
    assert.ok(depois > r.media + 15, `exposição +1 clareou: ${r.media.toFixed(1)} → ${depois.toFixed(1)}`)
    // histograma e automático
    const medidas = await s.pagina.evaluate(async () => {
      const h = await window.__s.histograma()
      const a = await window.__s.auto()
      return { pixels: h.tela.pixels, casas: h.tela.casas, cena: h.cena.pixels, a }
    })
    assert.ok(medidas.pixels > 1000 && medidas.casas === 256 && medidas.cena > 1000)
    assert.equal(typeof medidas.a.exposicao, 'number')
    assert.ok(Array.isArray(medidas.a.porque) && medidas.a.porque.length > 0)
    // exportar na placa (forçado, mesmo em software) e no JS do worker: os dois batem com revelar do JS no Node
    const ex = await s.pagina.evaluate(async (ajustes) => {
      const progresso = []
      const gpu = await window.__s.exportarPixels(ajustes, { motor: 'gpu', aoProgredir: (p) => progresso.push(p) })
      const js = await window.__s.exportarPixels(ajustes, { motor: 'js', bits: 16 })
      return { gpu: { ...gpu, dados: window.__b64(gpu.dados) }, js: { ...js, dados: window.__b64(js.dados) }, progresso }
    }, AJUSTES_EXPORTAR)
    assert.equal(ex.gpu.motor, 'gpu')
    assert.equal(ex.gpu.largura, 1200)
    assert.equal(ex.gpu.altura, 800)
    assert.equal(ex.progresso.at(-1), 1)
    const aberta = await abrirFoto(new Uint8Array(dng), { demosaico: 'qualidade', reduzir: 1 })
    const ref8 = revelarEmBytes(aberta.base, AJUSTES_EXPORTAR, { bits: 8 })
    const g8 = deBase64(ex.gpu.dados, Uint8Array)
    let pior = 0
    for (let i = 0; i < g8.length; i++) pior = Math.max(pior, Math.abs(g8[i] - ref8.dados[i]))
    assert.ok(pior <= 1, `exportação na placa × revelar do JS: pior ${pior}/255`)
    const ref16 = revelarEmBytes(aberta.base, AJUSTES_EXPORTAR, { bits: 16 })
    const j16 = deBase64(ex.js.dados, Uint16Array)
    assert.equal(ex.js.motor, 'js')
    assert.equal(j16.length, ref16.dados.length)
    let difJs = 0
    for (let i = 0; i < j16.length; i++) difJs = Math.max(difJs, Math.abs(j16[i] - ref16.dados[i]))
    assert.equal(difJs, 0, 'a exportação no worker é o revelar do JS, bit a bit')
    // zoom de 100%: a sessão pede a base cheia e desenha a janela dela
    const zoom = await s.pagina.evaluate(async () => {
      window.__eventos = []
      window.__s.ver({ zoom: 1, x: 0.3, y: 0.6, avisos: true })
      for (let i = 0; i < 200 && !window.__eventos.some((e) => e.tipo === 'quadro' && e.nivel === 'cheia'); i++) await new Promise((ok) => setTimeout(ok, 50))
      await window.__quadro()
      return { eventos: window.__eventos.map((e) => `${e.tipo}:${e.nivel ?? ''}`), largura: window.__canvas.width, media: window.__media() }
    })
    assert.ok(zoom.eventos.includes('quadro:cheia'), `desenhou a janela cheia: ${zoom.eventos}`)
    assert.equal(zoom.largura, 900)
    assert.ok(zoom.media > 20)
    // comparar e avisos não quebram
    await s.pagina.evaluate(async () => {
      window.__s.ver({ zoom: 'encaixar', comparar: { posicao: 0.4 }, avisos: true })
      await window.__quadro()
    })
    assert.deepEqual(s.olho.erros, [])
    assert.deepEqual(s.olho.ruins, [])
  } finally {
    await s.fechar()
  }
})

test('sessão sem placa de verdade: cai para o JS do worker, diz isso e o JPEG exporta igual ao JS', { skip: pular, timeout: 240000 }, async () => {
  const s = await abrirPagina()
  try {
    const [jpeg] = await desenharJpegs(s.navegador, { quantas: 1, largura: 1200, altura: 800 })
    await servirArquivo(s.pagina, 'IMG_0002.JPG', jpeg)
    const estado = await s.pagina.evaluate(MONTAR, { motor: 'auto' })
    const software = /swiftshader|llvmpipe|software/i.test(estado.renderizador)
    if (software) {
      assert.equal(estado.motor, 'js', 'renderizador de software: a prévia sai do JS')
      assert.ok(estado.avisos.some((a) => /software/.test(a)), `aviso: ${estado.avisos}`)
    }
    const r = await s.pagina.evaluate(ABRIR, 'IMG_0002.JPG')
    assert.equal(r.info.origem, 'imagem')
    assert.equal(r.info.largura, 1200)
    assert.ok(r.eventos.some((e) => e.tipo === 'previa'), 'o próprio JPEG é a primeira imagem')
    assert.ok(r.media > 20)
    const depois = await s.pagina.evaluate(async () => {
      window.__s.ajustar({ luz: { exposicao: -1 } })
      for (let i = 0; i < 100; i++) {
        await new Promise((ok) => setTimeout(ok, 30))
        if (window.__eventos.filter((e) => e.tipo === 'quadro').length >= 2) break
      }
      await window.__quadro()
      return window.__media()
    })
    assert.ok(depois < r.media - 10, `exposição −1 escureceu: ${r.media.toFixed(1)} → ${depois.toFixed(1)}`)
    const h = await s.pagina.evaluate(async () => (await window.__s.histograma()).tela.pixels)
    assert.ok(h > 1000)
    const ex = await s.pagina.evaluate(async (ajustes) => {
      const r = await window.__s.exportarPixels(ajustes, {})
      return { ...r, dados: window.__b64(r.dados) }
    }, AJUSTES_EXPORTAR)
    assert.equal(ex.largura, 1200)
    if (software) assert.equal(ex.motor, 'js')
    const aberta = await abrirFoto(new Uint8Array(jpeg), { reduzir: 1 })
    const ref = revelarEmBytes(aberta.base, AJUSTES_EXPORTAR, { bits: 8 })
    const d = deBase64(ex.dados, Uint8Array)
    let pior = 0
    for (let i = 0; i < d.length; i++) pior = Math.max(pior, Math.abs(d[i] - ref.dados[i]))
    assert.ok(pior <= 1, `JPEG exportado × revelar do JS: pior ${pior}/255`)
    // cancelar a exportação
    const cancelada = await s.pagina.evaluate(async () => {
      const c = new AbortController()
      const p = window.__s.exportarPixels({ presenca: { clareza: 50 } }, { sinal: c.signal })
      c.abort()
      try {
        await p
        return 'terminou'
      } catch (e) {
        return e.name
      }
    })
    assert.equal(cancelada, 'AbortError')
    assert.deepEqual(s.olho.erros, [])
  } finally {
    await s.fechar()
  }
})

test('sessão: contexto perdido não deixa tela preta (cai para o JS) e a placa volta quando restaurada', { skip: pular, timeout: 180000 }, async () => {
  const s = await abrirPagina()
  try {
    const [previa] = await desenharJpegs(s.navegador, { quantas: 1, largura: 300, altura: 200 })
    await servirArquivo(s.pagina, 'IMG_0003.DNG', dngDe(cena(8, 480, 320), previa, { largura: 300, altura: 200 }))
    await s.pagina.evaluate(MONTAR, { motor: 'gpu', largura: 480, altura: 320 })
    await s.pagina.evaluate(ABRIR, 'IMG_0003.DNG')
    const r = await s.pagina.evaluate(async () => {
      const ext = window.__canvas.getContext('webgl2').getExtension('WEBGL_lose_context')
      ext.loseContext()
      for (let i = 0; i < 100 && window.__s.estado().motor !== 'js'; i++) await new Promise((ok) => setTimeout(ok, 20))
      window.__s.ajustar({ luz: { exposicao: 0.5 } })
      for (let i = 0; i < 200 && !window.__eventos.some((e) => e.tipo === 'quadro' && e.motor === 'js'); i++) await new Promise((ok) => setTimeout(ok, 30))
      const auxiliar = !!document.querySelector('canvas[data-motor="js"]')
      const perdido = { estado: window.__s.estado(), media: window.__media(), auxiliar, escondido: window.__canvas.hidden }
      ext.restoreContext()
      for (let i = 0; i < 200 && window.__s.estado().motor !== 'gpu'; i++) await new Promise((ok) => setTimeout(ok, 20))
      await window.__quadro()
      return { perdido, voltou: window.__s.estado().motor, media: window.__media(), auxiliar: !!document.querySelector('canvas[data-motor="js"]') }
    })
    assert.equal(r.perdido.estado.motor, 'js')
    assert.ok(r.perdido.estado.avisos.some((a) => /parou/.test(a)))
    assert.ok(r.perdido.auxiliar && r.perdido.escondido, 'um canvas 2D toma o lugar do WebGL')
    assert.ok(r.perdido.media > 20, `não ficou preta: ${r.perdido.media}`)
    assert.equal(r.voltou, 'gpu')
    assert.equal(r.auxiliar, false)
    assert.ok(r.media > 20)
  } finally {
    await s.fechar()
  }
})

// ─────────── medidas (FOTO_MEDIR=1) ───────────

async function medirArrasto(pagina, ajustesDe, quadros = 30) {
  return pagina.evaluate(
    async ({ quadros, fonte }) => {
      const ajustesDe = new Function('i', `return (${fonte})(i)`)
      // espera o quadro anterior assentar
      await window.__quadro()
      window.__eventos = []
      const t0 = performance.now()
      for (let i = 0; i < quadros; i++) {
        window.__s.ajustar(ajustesDe(i))
        await new Promise((ok) => requestAnimationFrame(ok))
      }
      // no modo JS os quadros chegam do worker: espera o último
      for (let i = 0; i < 400 && window.__eventos.filter((e) => e.tipo === 'quadro').length < 1; i++) await new Promise((ok) => setTimeout(ok, 25))
      const ms = performance.now() - t0
      const qs = window.__eventos.filter((e) => e.tipo === 'quadro')
      return { quadros: qs.length, segundos: ms / 1000, qps: qs.length / (ms / 1000), msPorQuadro: qs.reduce((s, e) => s + e.ms, 0) / Math.max(1, qs.length) }
    },
    { quadros, fonte: ajustesDe.toString() },
  )
}

const PULAR_MEDIDAS = !MEDIR ? 'só com FOTO_MEDIR=1' : pular
test('medidas: 24 MP fabricado (e ARW real, se houver) — abrir, arrastar, exportar', { skip: PULAR_MEDIDAS, timeout: 1800000 }, async () => {
  const linhas = []
  const s = await abrirPagina()
  try {
    const [previa] = await desenharJpegs(s.navegador, { quantas: 1, largura: 1616, altura: 1080 })
    const grande = dngDe(cenaGrande(6000, 4000), previa, { largura: 1616, altura: 1080 })
    linhas.push(`DNG fabricado 6000×4000: ${(grande.length / 1e6).toFixed(1)} MB`)
    await servirArquivo(s.pagina, 'GRANDE.DNG', grande)
    const arw = caminhoDaAmostra('sony_a7s.arw')
    if (existsSync(arw)) await servirArquivo(s.pagina, 'REAL.ARW', readFileSync(arw))
    // um ARW do titular (só números no relatório; o arquivo nunca sai da máquina)
    const doTitular = [caminhoDaAmostra('titular/sequencia'), caminhoDaAmostra('titular/variedade/raw-e-jpg-camera')]
      .filter((p) => existsSync(p))
      .flatMap((p) => readdirSync(p).filter((n) => /\.arw$/i.test(n)).map((n) => join(p, n)))
    const titular = doTitular.slice(0, 1).concat(doTitular.filter((p) => /raw-e-jpg/.test(p)).slice(0, 1))
    for (const [i, p] of titular.entries()) await servirArquivo(s.pagina, `TITULAR${i}.ARW`, readFileSync(p))
    for (const motor of ['gpu', 'js']) {
      await s.pagina.reload()
      await s.pagina.evaluate(MONTAR, { motor, largura: 1440, altura: 900 })
      const r = await s.pagina.evaluate(ABRIR, 'GRANDE.DNG')
      const ev = (t) => r.eventos.find((e) => e.tipo === t)?.t
      const reduzir = r.eventos.find((e) => e.tipo === 'base')?.reduzir
      linhas.push(`[${motor}] 24 MP: prévia embutida em ${ev('previa')?.toFixed(0)} ms; base reduzida (÷${reduzir}) em ${ev('base')?.toFixed(0)} ms`)
      const semViz = await medirArrasto(s.pagina, (i) => ({ luz: { exposicao: (i % 10) / 10, contraste: i } }))
      linhas.push(`[${motor}] arrastar exposição: ${semViz.qps.toFixed(1)} qps (${semViz.msPorQuadro.toFixed(0)} ms por quadro)`)
      const comViz = await medirArrasto(s.pagina, (i) => ({
        luz: { exposicao: (i % 10) / 10 },
        presenca: { clareza: 40, textura: 30 },
        detalhe: { nitidez: 60 },
      }))
      linhas.push(`[${motor}] arrastar com clareza, textura e nitidez: ${comViz.qps.toFixed(1)} qps (${comViz.msPorQuadro.toFixed(0)} ms por quadro)`)
      const ex = await s.pagina.evaluate(
        async ({ motor }) => {
          const t0 = performance.now()
          const r = await window.__s.exportarPixels({ luz: { exposicao: 0.3, contraste: 15 }, cor: { vibracao: 20 } }, { motor })
          return { ms: performance.now() - t0, largura: r.largura, altura: r.altura, motor: r.motor }
        },
        { motor },
      )
      linhas.push(`[${motor}] exportarPixels ${ex.largura}×${ex.altura} (motor ${ex.motor}), luz e cor: ${(ex.ms / 1000).toFixed(1)} s`)
      for (let i = 0; i < titular.length; i++) {
        const a = await s.pagina.evaluate(ABRIR, `TITULAR${i}.ARW`).catch((e) => ({ erro: e.message }))
        if (a.erro) {
          linhas.push(`[${motor}] ARW do titular ${i + 1}: não abriu (${a.erro.split('\n')[0]})`)
          continue
        }
        const t = (tp) => a.eventos.find((e) => e.tipo === tp)
        const tam = `${a.info.largura}×${a.info.altura}`
        linhas.push(`[${motor}] ARW do titular ${i + 1}: prévia em ${t('previa')?.t.toFixed(0)} ms; base reduzida (÷${t('base')?.reduzir}) em ${t('base')?.t.toFixed(0)} ms; ${tam}`)
      }
      if (existsSync(arw)) {
        const a = await s.pagina.evaluate(ABRIR, 'REAL.ARW')
        const t = (tp) => a.eventos.find((e) => e.tipo === tp)?.t
        const tam = `${a.info.largura}×${a.info.altura}`
        linhas.push(`[${motor}] ARW real (A7S): prévia em ${t('previa')?.toFixed(0)} ms; base reduzida em ${t('base')?.toFixed(0)} ms; ${tam}`)
      }
    }
    const info = await s.pagina.evaluate(() => window.__s.estado().renderizador)
    console.log(`# renderizador: ${info}\n# ${linhas.join('\n# ')}`)
  } finally {
    await s.fechar()
  }
})
