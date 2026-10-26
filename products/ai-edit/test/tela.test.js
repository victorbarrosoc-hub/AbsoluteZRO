// Telas no Chromium de verdade, com os mesmos cabeçalhos do app de desktop (CSP, isolamento entre origens):
// autoteste (gravar → ler → silêncio → cortes → exportar → render), o caminho inteiro de quem usa (importar →
// analisar → revisar e desfazer → editar com cor e etiqueta → corrigir palavra → exportar e renderizar) e o Whisper
// de verdade carregando no navegador. A transcrição do caminho de uso é falsa (um worker trocado pela rota), para o
// teste não depender de fala gravada; a de verdade tem o teste próprio no fim (precisa de internet uma vez).
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { servir } from '../scripts/servidor.mjs'

const { chromium } = createRequire(import.meta.url)('playwright')
let s
let navegador
let dir

before(async () => {
  s = await servir()
  navegador = await chromium.launch()
  dir = mkdtempSync(join(tmpdir(), 'aiedit-tela-'))
})
after(async () => {
  await navegador?.close()
  s?.servidor.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

async function abrir(opts = {}) {
  const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...opts })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
  // o seletor de arquivo do Chrome abriria uma janela: sem ele, o vídeo vai para a memória e baixa no fim
  await pagina.addInitScript(() => {
    delete globalThis.showSaveFilePicker
  })
  const r = await pagina.goto(s.url + 'app/')
  assert.match(r.headers()['content-security-policy'], /default-src 'self'/)
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  return { pagina, erros }
}

test('autoteste: grava, lê, acha silêncio, corta, exporta e renderiza no navegador', async () => {
  const { pagina, erros } = await abrir()
  const r = await pagina.evaluate(() => import('/app/autoteste.js').then((m) => m.autoteste()))
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(r.isolado, true, 'isolamento entre origens (threads do ONNX)')
  assert.equal(r.render.video && r.render.audio, true)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('caminho de uso: importar, analisar, revisar, editar com cor e etiqueta, exportar e renderizar', async () => {
  const { pagina, erros } = await abrir()
  // vídeo de teste gerado pelo próprio app, salvo no disco para entrar pelo seletor de arquivo como um vídeo de verdade
  const { bytes, palavras } = await pagina.evaluate(async () => {
    const { videoDeTeste } = await import('/app/autoteste.js')
    const v = await videoDeTeste()
    return { bytes: [...new Uint8Array(await v.arquivo.arrayBuffer())], palavras: v.palavras }
  })
  writeFileSync(join(dir, 'fala.mp4'), Buffer.from(bytes))
  // transcrição falsa: devolve as "palavras" do vídeo de teste (a de verdade tem teste próprio)
  const nomes = ['Bom', 'dia!', 'Tchau.']
  const falsas = palavras.map((w, i) => ({ texto: nomes[i] || 'palavra', ini: w.ini + 0.05, fim: w.fim - 0.05 }))
  await pagina.route('**/app/transcricao-worker.js', (rota) =>
    rota.fulfill({
      contentType: 'text/javascript',
      body: `self.onmessage = ({ data }) => { self.postMessage({ tipo: 'dispositivo', dispositivo: 'wasm' }); self.postMessage({ tipo: 'parcial', feito: 1, total: 2, palavras: [] }); self.postMessage({ tipo: 'pronto', palavras: ${JSON.stringify(falsas)}, dispositivo: 'wasm', segundos: 0.1, carregou: 0 }) }`,
    }),
  )

  // Mídia: vazio → arquivo → cartão com fichas
  await pagina.getByRole('heading', { name: /Solte o vídeo/ }).waitFor()
  await pagina.setInputFiles('#arquivo', join(dir, 'fala.mp4'))
  await pagina.locator('.cartao-midia').waitFor()
  assert.match(await pagina.locator('.cartao-midia .fichas').innerText(), /0:06/)
  assert.ok(await pagina.locator('.cartao-midia').getAttribute('data-cor'), 'a mídia nasce com uma cor')

  // Analisar → Revisar com as propostas coloridas por tipo
  await pagina.click('#analisar')
  await pagina.waitForFunction(() => document.body.dataset.pagina === 'revisar')
  const n = await pagina.locator('.proposta').count()
  assert.ok(n >= 3, `propostas: ${n}`)
  assert.equal(await pagina.locator('.proposta[data-cor="laranja"]').count() >= 2, true, 'silêncios em laranja')
  assert.ok((await pagina.locator('.proposta[data-cor="roxo"]').count()) >= 1, 'zoom (frase com "!") em roxo')

  // aprovar um, desfazer, aprovar todos
  const primeira = pagina.locator('.proposta').first()
  const id = await primeira.getAttribute('data-id')
  await primeira.locator('[data-acao="aprovar"]').click()
  await pagina.locator(`.proposta[data-id="${id}"].proposta-aprovada`).waitFor()
  await pagina.keyboard.press('Control+z')
  await pagina.locator(`.proposta[data-id="${id}"].proposta-pendente`).waitFor()
  await pagina.click('#aprovarTodos')
  assert.equal(await pagina.locator('.proposta-pendente').count(), 0)

  // Edição: clipes depois dos cortes, cor e etiqueta, filtro, dividir e desfazer
  await pagina.click('.dock [data-ir="edicao"]')
  await pagina.locator('.clipe').first().waitFor()
  const clipes = await pagina.locator('.clipe').count()
  assert.ok(clipes >= 3, `clipes: ${clipes}`)
  await pagina.locator('.clipe').nth(1).click()
  await pagina.click('.paleta [data-cor="laranja"]')
  await pagina.fill('.etiqueta-campo', 'Gancho')
  await pagina.press('.etiqueta-campo', 'Enter')
  await pagina.locator('.clipe').nth(1).locator('.clipe-etiqueta', { hasText: 'Gancho' }).waitFor()
  assert.equal(await pagina.locator('.clipe').nth(1).getAttribute('data-cor'), 'laranja')
  await pagina.locator('.filtro-etiquetas button', { hasText: 'Gancho' }).click()
  assert.equal(await pagina.locator('.linha-conteudo.filtrando').count(), 1)
  // dividir no ponto (B) e desfazer
  const caixa = await pagina.locator('.clipe').first().boundingBox()
  await pagina.mouse.click(caixa.x + caixa.width / 2, caixa.y - 30)
  await pagina.keyboard.press('b')
  assert.equal(await pagina.locator('.clipe').count(), clipes + 1)
  await pagina.keyboard.press('Control+z')
  assert.equal(await pagina.locator('.clipe').count(), clipes)

  // corrigir uma palavra da legenda (dois cliques, Enter)
  const palavra = pagina.locator('.palavra', { hasText: 'Bom' })
  await palavra.dblclick()
  await pagina.keyboard.type('Boa')
  await pagina.keyboard.press('Enter')
  await pagina.locator('.palavra', { hasText: 'Boa' }).waitFor()

  // Entrega: linha do tempo (zip) e vídeo final (download)
  await pagina.click('.dock [data-ir="entrega"]')
  await pagina.check('#destinos input[value="video"]')
  const downloads = []
  pagina.on('download', (d) => downloads.push(d))
  await pagina.click('#exportar')
  await pagina.locator('#entregaFim:not([hidden])').waitFor({ timeout: 60_000 })
  assert.match(await pagina.locator('#entregaFim').innerText(), /arquivos para o seu editor e vídeo de 0:0\d/)
  const nomes2 = downloads.map((d) => d.suggestedFilename()).sort()
  assert.deepEqual(nomes2, ['fala.mp4', 'fala.zip'])
  const zip = readFileSync(await downloads.find((d) => d.suggestedFilename() === 'fala.zip').path())
  const texto = zip.toString('latin1')
  for (const f of ['fala.xml', 'fala.fcpxml', 'fala.edl', 'fala.srt', 'zro-timeline-ref.json']) assert.ok(texto.includes(f), f)
  assert.ok(texto.includes('Boa dia!'), 'a correção vai para o SRT')
  assert.ok(texto.includes('<label2>Mango</label2>'), 'a cor laranja vai como rótulo do Premiere')

  // tema claro no seletor
  await pagina.click('#tema')
  assert.equal(await pagina.evaluate(() => document.documentElement.dataset.theme), 'light')
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('reduzir movimento: páginas trocam sem deslize', async () => {
  const { pagina } = await abrir({ reducedMotion: 'reduce' })
  await pagina.click('.dock [data-ir="entrega"]')
  const t = await pagina.evaluate(() => getComputedStyle(document.querySelector('.pagina[data-pagina="entrega"]')).transitionDuration)
  assert.match(t, /^0s/)
  await pagina.close()
})

test('Whisper de verdade carrega no navegador e transcreve (modelo Rápido, precisa de internet uma vez)', { skip: process.env.AIEDIT_SEM_REDE === '1' }, async () => {
  const { pagina } = await abrir()
  const r = await pagina.evaluate(async () => {
    const taxa = 16000
    const pcm = new Float32Array(taxa * 3)
    for (let i = 0; i < pcm.length; i++) pcm[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / taxa) * Math.sin((Math.PI * i) / pcm.length)
    const w = new Worker('/app/transcricao-worker.js', { type: 'module' })
    return new Promise((ok) => {
      w.onmessage = ({ data }) => (data.tipo === 'pronto' || data.tipo === 'erro') && ok(data)
      w.postMessage({ tipo: 'transcrever', pcm, taxa, trechos: [{ ini: 0, fim: 3 }], modelo: 'rapido', idioma: 'pt', dispositivo: 'wasm' })
    })
  })
  assert.equal(r.tipo, 'pronto', r.mensagem)
  assert.ok(Array.isArray(r.palavras))
  await pagina.close()
})
