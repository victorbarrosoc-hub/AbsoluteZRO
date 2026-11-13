// O worker de visão da decupagem (app/decupagem/visao-worker.js) no Chromium, pelo servidor local com os cabeçalhos
// de produção (vercel.json): MediaPipe vendorizado e os modelos de .modelos/, tudo servido da própria origem.
// Confere:
//   - as três camadas carregam sob a CSP de produção, sem erro de console e sem pedido para fora;
//   - uma imagem gerada (sem gente) dá zero rostos, e os rótulos vêm com o índice do ImageNet;
//   - modelo que não veio no build (ou que não baixa) deixa a camada 'indisponivel', com o motivo, e as outras rodam;
//   - a regra dos olhos ajustada na calibração com fotos reais (riso forte, olho apertado de sol).
// Sem .modelos/ (npm run modelos) ou sem Chromium, pula com a mensagem; com FOTO_EXIGIR=1, a falta vira falha.
// O caminho com rosto de verdade é provado fora da suíte (fotos de clientes não entram no repositório);
// aqui o rosto entra só fabricado (test/analise.test.js).

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { abrirChromium, EXIGIR, semChromium, subirApp, vigiar } from './apoio-tela.js'
import { estadoDosOlhos } from '../src/decupagem/rostos.js'
import { expressao, malhaDeRosto } from './apoio-decupagem.js'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const ESPERA = 120_000
const FICHA = JSON.parse(readFileSync(`${RAIZ}modelos.json`, 'utf8'))
const faltam = FICHA.modelos.map((m) => m.arquivo).filter((a) => !existsSync(`${RAIZ}.modelos/${a}`))
const temMediaPipe = existsSync(`${RAIZ}node_modules/@mediapipe/tasks-vision/vision_bundle.mjs`)
const pular = semChromium || (faltam.length ? `sem .modelos/ (${faltam.join(', ')}): rode npm run modelos` : false) || (!temMediaPipe && 'sem o MediaPipe em node_modules')

let app, navegador

before(async () => {
  if (pular) return
  app = await subirApp()
  navegador = await abrirChromium()
})
after(async () => {
  await navegador?.close()
  await app?.fechar()
})

test('modelos, MediaPipe e Chromium são exigidos no CI', { skip: !EXIGIR }, () => {
  assert.equal(pular, false, `FOTO_EXIGIR=1: ${pular}`)
})

/** Uma página do app (a casca, com a CSP de produção), com o olho no console e na rede. `rotas`: [[url, função]]. */
async function abrir(rotas = []) {
  const contexto = await navegador.newContext()
  contexto.setDefaultTimeout(ESPERA)
  const pagina = await contexto.newPage()
  for (const [url, f] of rotas) await contexto.route(url, f)
  const olho = vigiar(pagina, app.base)
  const resposta = await pagina.goto(`${app.base}/`)
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  return { contexto, pagina, olho, resposta }
}

/**
 * Roda no worker de visão: prepara as camadas e analisa uma imagem desenhada no canvas (faixas, círculos e um número:
 * nada de gente). Devolve o que o worker respondeu.
 */
function noWorker(pagina, { camadas } = {}) {
  return pagina.evaluate(async (camadas) => {
    const { criarPool } = await import('/app/trabalho/pool.js')
    const pool = criarPool(new URL('/app/decupagem/visao-worker.js', location.href), { tamanho: 1, nome: 'visao' })
    const preparo = await pool.pedir('preparar', { camadas })
    const tela = new OffscreenCanvas(960, 640)
    const c = tela.getContext('2d')
    const g = c.createLinearGradient(0, 0, 960, 640)
    g.addColorStop(0, '#5b8fd6')
    g.addColorStop(1, '#203040')
    c.fillStyle = g
    c.fillRect(0, 0, 960, 640)
    c.fillStyle = '#d8c070'
    c.fillRect(0, 430, 960, 210)
    c.fillStyle = 'rgb(255 250 230)'
    c.beginPath()
    c.arc(720, 160, 60, 0, Math.PI * 2)
    c.fill()
    c.font = '700 140px sans-serif'
    c.fillText('42', 90, 300)
    const previa = await tela.convertToBlob({ type: 'image/jpeg', quality: 0.86 })
    const r = await pool.pedir('analisar', { previa, camadas, cru: true })
    const estado = await pool.pedir('estado', {})
    pool.encerrar()
    return { preparo, r, estado }
  }, camadas)
}

test('as três camadas carregam sob a CSP de produção, sem erro de console nem pedido para fora', { skip: pular }, async () => {
  const { contexto, pagina, olho, resposta } = await abrir()
  try {
    const csp = resposta.headers()['content-security-policy']
    assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/, 'a casca sai com a CSP de produção')
    assert.match(csp, /worker-src 'self' blob:/)
    const { preparo, r } = await noWorker(pagina)
    assert.deepEqual(preparo.camadas, { rostos: 'pronta', objetos: 'pronta', rotulos: 'pronta' }, JSON.stringify(preparo.motivos))
    assert.deepEqual(preparo.motivos, {})
    assert.match(preparo.mediapipe, /^\d+\.\d+\.\d+$/)
    for (const c of ['rostos', 'objetos', 'rotulos']) assert.ok(preparo.tempos[c] > 0, `tempo de carga de ${c}`)
    // a imagem sem gente: zero rostos (e nenhuma detecção crua), objetos lidos, e os rótulos com o índice do ImageNet
    assert.deepEqual(r.camadas, ['rostos', 'objetos', 'rotulos'])
    assert.deepEqual(r.rostos, [])
    assert.deepEqual(r.deteccoes, [])
    assert.ok(Array.isArray(r.objetos))
    assert.ok(!r.objetos.some((o) => o.classe === 'person'), JSON.stringify(r.objetos))
    assert.ok(r.rotulos.length > 0 && r.rotulos.length <= 5)
    for (const x of r.rotulos) {
      assert.ok(Number.isInteger(x.indice) && x.indice >= 0 && x.indice < 1000, `índice ${x.indice}`)
      assert.equal(typeof x.nome, 'string')
      assert.ok(x.confianca >= 0 && x.confianca <= 1)
    }
    assert.deepEqual(r.quadro, { largura: 960, altura: 640 })
    // sem rosto de pé, a prévia foi tentada deitada (e não achou ninguém)
    assert.equal(r.giro, 0)
    assert.ok(r.tempos.giros > 0 && r.tempos.total > 0, JSON.stringify(r.tempos))
    await pagina.waitForTimeout(300)
    assert.deepEqual({ erros: olho.erros, falhas: olho.falhas, ruins: olho.ruins, fora: olho.fora }, { erros: [], falhas: [], ruins: [], fora: [] })
  } finally {
    await contexto.close()
  }
})

test("modelo que não veio no build fica 'indisponivel', com o motivo, e o resto roda", { skip: pular }, async () => {
  // a lista do build diz que o detector de objetos não veio; o classificador "veio", mas o arquivo não baixa
  const ficha = (rota) =>
    rota.fetch().then(async (r) => {
      const j = await r.json()
      for (const m of j.modelos) if (m.arquivo === 'efficientdet_lite0_int8.tflite') m.pronto = false
      return rota.fulfill({ response: r, json: j })
    })
  const { contexto, pagina } = await abrir([
    [`${app.base}/modelos.json`, ficha],
    [`${app.base}/modelos/efficientnet_lite0_int8.tflite`, (rota) => rota.fulfill({ status: 404, body: 'não' })],
  ])
  try {
    const { preparo, r, estado } = await noWorker(pagina)
    assert.equal(preparo.camadas.rostos, 'pronta')
    assert.equal(preparo.camadas.objetos, 'indisponivel')
    assert.equal(preparo.camadas.rotulos, 'indisponivel')
    assert.match(preparo.motivos.objetos, /não veio.*efficientdet_lite0_int8\.tflite/)
    assert.match(preparo.motivos.rotulos, /Não carregou.*404/)
    // só a camada que existe roda; a que não carregou não devolve nada (nem lista vazia: não foi lida)
    assert.deepEqual(r.camadas, ['rostos'])
    assert.deepEqual(r.rostos, [])
    assert.equal(r.objetos, undefined)
    assert.equal(r.rotulos, undefined)
    assert.equal(r.estado.objetos, 'indisponivel')
    assert.equal(estado.camadas.rotulos, 'indisponivel')
  } finally {
    await contexto.close()
  }
})

test("sem o MediaPipe no build, todas as camadas ficam 'indisponivel'", { skip: pular }, async () => {
  const semBiblioteca = (rota) =>
    rota.fetch().then(async (r) => {
      const j = await r.json()
      j.mediapipe = null
      return rota.fulfill({ response: r, json: j })
    })
  const { contexto, pagina } = await abrir([[`${app.base}/modelos.json`, semBiblioteca]])
  try {
    const { preparo, r } = await noWorker(pagina, { camadas: ['rostos', 'objetos'] })
    assert.deepEqual(preparo.camadas, { rostos: 'indisponivel', objetos: 'indisponivel', rotulos: 'parada' })
    assert.match(preparo.motivos.rostos, /biblioteca de visão/)
    assert.deepEqual(r.camadas, [])
    assert.equal(r.rostos, undefined)
  } finally {
    await contexto.close()
  }
})

test('olhos: a regra ajustada com fotos reais de evento (riso forte não é olho fechado; olho apertado de sol é aberto)', () => {
  const estado = (ear, bs) => estadoDosOlhos({ malha: malhaDeRosto({ ear: [ear, ear] }), blendshapes: expressao(bs) }).olhos
  // riso que espreme o olho (medidos: EAR 0,09 a 0,14 com sorriso 0,81 a 0,94): 'sorrindo', não 'fechados'
  assert.equal(estado(0.093, { piscada: 0.42, aperto: 0.37, sorriso: 0.85 }), 'sorrindo')
  assert.equal(estado(0.108, { piscada: 0.59, aperto: 0.32, sorriso: 0.93 }), 'sorrindo')
  // olho fechado de verdade (beijo, oração), com sorriso até 0,19, e o olhar para baixo com sorriso 0,75: fechados
  assert.equal(estado(0.108, { piscada: 0.55, aperto: 0.46, sorriso: 0.19 }), 'fechados')
  assert.equal(estado(0.031, { piscada: 0.61, aperto: 0.63, sorriso: 0.75 }), 'fechados')
  // apertado de sol, sem piscada (EAR 0,15 a 0,22, aperto 0,59 a 0,66, piscada até 0,30): aberto
  assert.equal(estado(0.158, { piscada: 0.28, aperto: 0.65, sorriso: 0.11 }), 'abertos')
  assert.equal(estado(0.217, { piscada: 0.18, aperto: 0.59, sorriso: 0.05 }), 'abertos')
  // com a pálpebra descendo (piscada ≥ 0,35) continua piscando
  assert.equal(estado(0.18, { piscada: 0.45, aperto: 0.6, sorriso: 0.1 }), 'parcial')
})
