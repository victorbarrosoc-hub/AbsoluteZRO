// Telas no Chromium de verdade, com os mesmos cabeçalhos do app de desktop (CSP, isolamento entre origens):
// autoteste (gravar → ler → silêncio → cortes → exportar → render), o caminho inteiro de quem usa (importar →
// analisar → revisar e desfazer → editar com cor, etiqueta, Inspector, marcador e Histórico → corrigir palavra →
// exportar e renderizar → autosave em Seus universos → reabrir), o projeto novo com formato e o Whisper
// de verdade carregando no navegador. A transcrição do caminho de uso é falsa (um worker trocado pela rota), para o
// teste não depender de fala gravada; a de verdade tem o teste próprio no fim (precisa de internet uma vez).
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CABECALHOS_SITE, servir } from '../scripts/servidor.mjs'
import { simularZ } from './z-falso.js'
import { simularSet } from './set-falso.js'
import { FAMILIA } from '../src/familia.js'

const { chromium } = createRequire(import.meta.url)('playwright')
/** stderr de um comando (o volumedetect do ffmpeg escreve lá) */
const estderr = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' }).stderr
let s
let navegador
let dir

before(async () => {
  // a CSP de produção (vercel.json): a do app de desktop é a mesma, sem a Z de absolutezro.com (lá ela vem de vendor/)
  s = await servir({ cabecalhos: CABECALHOS_SITE })
  navegador = await chromium.launch()
  dir = mkdtempSync(join(tmpdir(), 'aiedit-tela-'))
})
after(async () => {
  await navegador?.close()
  s?.servidor.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

// sessão da Absolute ZRO falsa: o AEON só abre com conta (api/zro/eu); sem ela vai para entrar.html
const PESSOA = { ok: true, pessoa: { nome: 'Lia Produtora', email: 'lia@produtora.com', produtos: ['ai-edit'] }, acesso: true }

async function abrir(opts = {}, { logado = true, z = {}, set = { desligado: true } } = {}) {
  const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...opts })
  const pedidosZ = await simularZ(pagina, z)
  // o Set: por padrão o widget não chega (a entrada não aparece); o teste do Set liga
  const pedidosSet = await simularSet(pagina, set)
  await pagina.route('**/api/zro/eu', (r) => (logado ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PESSOA) }) : r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' })))
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
  // o seletor de arquivo do Chrome abriria uma janela: sem ele, o vídeo vai para a memória e baixa no fim
  await pagina.addInitScript(() => {
    delete globalThis.showSaveFilePicker
  })
  const r = await pagina.goto(s.url + 'app/')
  assert.match(r.headers()['content-security-policy'], /default-src 'self'/)
  if (logado) await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  // o app abre na Mídia (a tarefa); a Z só abre pelo ícone da barra
  return { pagina, erros, pedidosZ, pedidosSet }
}

test('só com conta: sem sessão o editor vai para entrar.html; com sessão mostra a pessoa no menu', async () => {
  const { pagina } = await abrir({}, { logado: false })
  await pagina.waitForURL(/entrar\.html\?volta=%2Fapp%2F/)
  await pagina.locator('#fora:not([hidden])').waitFor()
  assert.equal(await pagina.getAttribute('#entrar', 'href'), '/api/zro/entrar?volta=%2Fapp%2F')
  assert.equal(await pagina.locator('text=sem conta').count(), 0)
  await pagina.close()
  const { pagina: dentro } = await abrir()
  assert.equal(await dentro.locator('.trilho-item', { hasText: 'Lia Produtora' }).count(), 1)
  await dentro.close()
})

test('primeira tela: a Mídia (a tarefa); a Z não é aba do dock nem abre sozinha', async () => {
  const { pagina, erros, pedidosZ } = await abrir()
  assert.equal(await pagina.evaluate(() => document.body.dataset.pagina), 'midia')
  assert.notEqual(await pagina.getAttribute('.dock [data-ir="midia"]', 'aria-current'), null)
  await pagina.locator('#escolher').waitFor()
  // o dock é só o editor, com a Mídia primeiro; a Z é um ícone discreto na barra
  assert.deepEqual(await pagina.locator('.dock button[data-ir]').evaluateAll((bs) => bs.map((b) => b.dataset.ir)), ['midia', 'revisar', 'edicao', 'entrega'])
  // o Set mora no fim do dock (escondido até o Set responder) e não é a entrada; a Z não está no dock
  assert.equal(await pagina.locator('.dock button').last().getAttribute('data-set'), '')
  assert.equal(await pagina.locator('.dock [data-ir="z"]').count(), 0)
  assert.equal(await pagina.locator('.barra #abrirZ').count(), 1)
  assert.equal(await pagina.getAttribute('#abrirZ', 'aria-current'), null)
  // nada da Z montou nem pediu nada ao abrir
  await pagina.waitForTimeout(300)
  assert.equal(await pagina.locator('#zPainel zro-ia').count(), 0)
  assert.deepEqual(pedidosZ, [])
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('/app/#z abre a Z direto (link direto continua valendo)', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } })
  await simularZ(pagina, {})
  await pagina.route('**/api/zro/eu', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PESSOA) }))
  await pagina.goto(s.url + 'app/#z')
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  assert.equal(await pagina.evaluate(() => document.body.dataset.pagina), 'z')
  await pagina.locator('#zPainel zro-ia').waitFor()
  await pagina.close()
})

test('a Z pelo ícone da barra: conversa pelo repasse e o editor segue a um toque', async () => {
  const { pagina, erros, pedidosZ } = await abrir()
  await pagina.click('#abrirZ')
  assert.notEqual(await pagina.getAttribute('#abrirZ', 'aria-current'), null)
  const z = pagina.locator('#zPainel zro-ia')
  await z.waitFor()
  assert.equal(await z.getAttribute('api'), '/api/zro/ia')
  assert.equal(await z.getAttribute('tema'), 'escuro', 'acompanha o tema do app')
  await pagina.locator('zro-ia h1', { hasText: 'Lia' }).waitFor()
  // sem botões: as quatro sugestões se escrevem sozinhas no campo (a lista fica na descrição acessível)
  assert.equal(await pagina.locator('zro-ia .sug, zro-ia [data-sug]').count(), 0)
  await pagina.locator('zro-ia .fantasma').waitFor({ state: 'attached' })
  assert.equal((await pagina.locator('zro-ia #zd').textContent()).split(';').length, 4)
  await pagina.locator('zro-ia textarea').fill('Como corto silêncios?')
  await pagina.keyboard.press('Enter')
  await pagina.locator('zro-ia .msg', { hasText: 'posso te ajudar com isso.' }).waitFor()
  const envio = pedidosZ.find((p) => p.caminho === '/mensagens')
  assert.deepEqual(JSON.parse(envio.corpo), { conversa: null, texto: 'Como corto silêncios?' })
  assert.ok(pedidosZ.every((p) => p.autorizacao === null), 'a página nunca manda token: o repasse põe')
  await pagina.click('#tema')
  assert.equal(await z.getAttribute('tema'), 'claro')
  await pagina.click('#tema')
  await pagina.click('.dock [data-ir="midia"]')
  await pagina.locator('#escolher').waitFor()
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('Set: a aba em comum no fim do dock aparece quando o Set responde e abre a folha com a cara do AEON', async () => {
  // sem o escopo (login de antes do Set: 401): nada aparece
  const sem = await abrir({}, { set: { logado: false } })
  await sem.pagina.waitForTimeout(400)
  assert.equal(await sem.pagina.locator('.dock [data-set]').isVisible(), false)
  await sem.pagina.close()
  for (const [tema, vp] of [
    ['dark', { width: 1440, height: 900 }],
    ['light', { width: 393, height: 852 }],
  ]) {
    const { pagina, erros, pedidosSet } = await abrir({ viewport: vp }, { set: { logado: true } })
    await pagina.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema)
    const entrada = pagina.locator('.dock [data-set]')
    await entrada.waitFor()
    assert.equal(await entrada.locator('[data-set-balao]').textContent(), '2')
    assert.equal(await entrada.getAttribute('aria-expanded'), 'false')
    await entrada.click()
    const painel = pagina.locator('zro-set-folha .folha[data-on] .painel')
    await painel.waitFor()
    assert.equal(await entrada.getAttribute('aria-expanded'), 'true')
    await pagina.locator('zro-set-folha .linha', { hasText: 'Rui Tavares' }).waitFor()
    assert.match(await pagina.locator('zro-set-folha .linha', { hasText: 'Rui Tavares' }).textContent(), /no Maestro/)
    // a identidade do AEON chega à folha (que mora no <body>): a tinta e a fonte do app
    const [tinta, doApp, fonte] = await pagina.evaluate(() => {
      const p = document.querySelector('zro-set-folha').shadowRoot.querySelector('.painel')
      const h = getComputedStyle(document.documentElement)
      return [getComputedStyle(p).color, h.getPropertyValue('--text-strong').trim(), getComputedStyle(p).fontFamily]
    })
    const rgb = await pagina.evaluate((c) => {
      const d = document.createElement('div')
      d.style.color = c
      document.body.append(d)
      const v = getComputedStyle(d).color
      d.remove()
      return v
    }, doApp)
    assert.equal(tinta, rgb, `tinta da folha no tema ${tema}`)
    assert.match(fonte, /Figtree/)
    // o widget só fala com o repasse do próprio site, sem token na página
    assert.ok(pedidosSet.length > 0 && pedidosSet.every((p) => p.autorizacao === null))
    // SET_FOTOS=<pasta>: as telas da entrega (a folha aberta)
    if (process.env.SET_FOTOS) await pagina.screenshot({ path: join(process.env.SET_FOTOS, `aeon-${vp.width > 600 ? 'desktop' : '393'}-${tema === 'dark' ? 'escuro' : 'claro'}.png`) })
    await pagina.keyboard.press('Escape')
    await painel.waitFor({ state: 'detached' })
    assert.equal(await entrada.getAttribute('aria-expanded'), 'false')
    assert.deepEqual(erros, [])
    await pagina.close()
  }
})

test('a Z sem o escopo dela: oferece entrar de novo (que já pede zro.ia)', async () => {
  const { pagina } = await abrir({}, { z: { logado: false } })
  await pagina.click('#abrirZ')
  const entrar = pagina.locator('#zPainel .z-aviso a')
  await entrar.waitFor()
  assert.equal(await entrar.getAttribute('href'), '/api/zro/entrar?volta=%2Fapp%2F')
  assert.match(await pagina.locator('#zPainel .z-aviso p').textContent(), /a Z/)
  await pagina.close()
})

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
  writeFileSync(join(dir, 'fala-2.mp4'), Buffer.from(bytes))
  // transcrição falsa: devolve as "palavras" do vídeo de teste (a de verdade tem teste próprio)
  const nomes = ['Bom', 'dia!', 'Tchau.']
  const falsas = palavras.map((w, i) => ({ texto: nomes[i] || 'palavra', ini: w.ini + 0.05, fim: w.fim - 0.05 }))
  await pagina.route('**/app/transcricao-worker.js', (rota) =>
    rota.fulfill({
      contentType: 'text/javascript',
      // a página é isolada (COEP): o worker trocado precisa dos mesmos cabeçalhos, senão o Chrome não o carrega
      headers: { 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' },
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

  // balão do dock: Revisar mostra quantas propostas esperam decisão (e só Revisar)
  const balao = pagina.locator('.dock [data-ir="revisar"] .balao')
  assert.equal(await balao.innerText(), String(n))
  assert.equal(await balao.getAttribute('aria-label'), `${n} pendências`)
  assert.match(await pagina.getAttribute('.dock [data-ir="revisar"]', 'title'), /propostas para aprovar ou recusar/)
  assert.equal(await pagina.locator('.dock [data-ir] .balao').count(), 1)

  // aprovar um, desfazer, aprovar todos (o balão acompanha ao vivo)
  const primeira = pagina.locator('.proposta').first()
  const id = await primeira.getAttribute('data-id')
  await primeira.locator('[data-acao="aprovar"]').click()
  await pagina.locator(`.proposta[data-id="${id}"].proposta-aprovada`).waitFor()
  assert.equal(await balao.innerText(), String(n - 1))
  await pagina.keyboard.press('Control+z')
  await pagina.locator(`.proposta[data-id="${id}"].proposta-pendente`).waitFor()
  assert.equal(await balao.innerText(), String(n))
  await pagina.click('#aprovarTodos')
  assert.equal(await pagina.locator('.proposta-pendente').count(), 0)
  assert.equal(await pagina.locator('.dock [data-ir] .balao').count(), 0)

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
  await pagina.mouse.click(caixa.x + caixa.width / 2, caixa.y - 10)
  await pagina.keyboard.press('b')
  assert.equal(await pagina.locator('.clipe').count(), clipes + 1)
  await pagina.keyboard.press('Control+z')
  assert.equal(await pagina.locator('.clipe').count(), clipes)

  // Inspector: opacidade e escala do clipe selecionado (prévia ao vivo, uma ação no desfazer)
  await pagina.locator('.clipe').nth(1).click()
  await pagina.locator('.insp-clipe:not([hidden])').waitFor()
  await pagina.locator('#inspector input[data-k="opacidade"]').fill('50')
  await pagina.locator('#inspector input[data-k="escala"]').fill('120')
  const aj = await pagina.evaluate(() => globalThis.__editor.h.atual.linha.clipes.find((c) => c.ajustes)?.ajustes)
  assert.deepEqual(aj, { opacidade: 0.5, escala: 1.2 })
  assert.equal(await pagina.locator('.insp-controle.mudado').count(), 2)

  // marcador no ponto (M) e na régua
  await pagina.mouse.click(caixa.x + 12, caixa.y - 10)
  await pagina.keyboard.press('m')
  await pagina.locator('.marcador').waitFor()

  // Histórico: volta um passo (o marcador some) e avança de novo
  await pagina.click('#abasPainel [data-aba="historico"]')
  const passos = pagina.locator('#historico button')
  const total = await passos.count()
  assert.ok(total >= 8, `passos: ${total}`)
  assert.equal(await passos.last().getAttribute('aria-current'), 'step')
  await passos.nth(total - 2).click()
  assert.equal(await pagina.locator('.marcador').count(), 0)
  assert.equal(await pagina.locator('#historico button.futuro').count(), 1)
  await pagina.locator('#historico button').last().click()
  await pagina.locator('.marcador').waitFor()

  // corrigir uma palavra da legenda (aba Texto; dois cliques, Enter)
  await pagina.click('#abasPainel [data-aba="texto"]')
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
  const srt = texto.slice(texto.indexOf('fala.srt'), texto.indexOf('Tchau.'))
  assert.match(srt, /\nBoa( dia!)?\r?\n/, 'a correção vai para o SRT')
  assert.doesNotMatch(srt, /Bom/)
  assert.ok(texto.includes('<label2>Mango</label2>'), 'a cor laranja vai como rótulo do Premiere')
  assert.ok(texto.includes('<adjust-blend amount="0.5"'), 'a opacidade vai para o Final Cut')
  assert.ok(texto.includes('<marker '), 'o marcador vai para o Final Cut')

  // autosave: Salvo na barra; Seus universos lista o projeto; reabrir pede o vídeo de novo (navegador) e religa pelo nome
  await pagina.locator('#salvo[data-estado="ok"]').waitFor()
  await pagina.locator('#menuBotao').click()
  await pagina.locator('.trilho-item', { hasText: 'Seus universos' }).click()
  await pagina.locator('.cartao-projeto', { hasText: 'fala' }).waitFor()
  assert.ok(await pagina.locator('.cartao-projeto img').count(), 'o cartão tem miniatura')
  await pagina.locator('.cartao-projeto .cartao-abrir').click()
  await pagina.locator('#nomeProjeto', { hasText: 'fala' }).waitFor()
  assert.equal(await pagina.evaluate(() => globalThis.__editor.h.atual.marcadores.length), 1)
  // reaberto no navegador, a mídia fica sem o arquivo: o balão de Mídia pede para escolher de novo
  const balaoMidia = pagina.locator('.dock [data-ir="midia"] .balao')
  assert.equal(await balaoMidia.innerText(), '1')
  assert.match(await pagina.getAttribute('.dock [data-ir="midia"]', 'title'), /1 mídia sem o arquivo/)
  await pagina.click('.dock [data-ir="midia"]')
  await pagina.setInputFiles('#arquivo', join(dir, 'fala.mp4'))
  await pagina.waitForFunction(() => globalThis.__editor.entradas.size === 1)
  await balaoMidia.waitFor({ state: 'detached' })
  assert.equal(await pagina.locator('.cartao-midia').count(), 1, 'o mesmo arquivo religa, não duplica')

  // tema claro no seletor
  await pagina.click('#tema')
  assert.equal(await pagina.evaluate(() => document.documentElement.dataset.theme), 'light')
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('efeitos sonoros: som do computador no ponto, arrastar, volume, desfazer, tirar, exportar e renderizar com o efeito', async () => {
  const { pagina, erros } = await abrir()
  const { bytes } = await pagina.evaluate(async () => {
    const { videoDeTeste } = await import('/app/autoteste.js')
    const v = await videoDeTeste()
    return { bytes: [...new Uint8Array(await v.arquivo.arrayBuffer())] }
  })
  writeFileSync(join(dir, 'cena.mp4'), Buffer.from(bytes))
  // um "whoosh" de 0,4 s gerado aqui (WAV PCM, 48 kHz, estéreo)
  const taxa = 48000
  const n = Math.round(0.4 * taxa)
  const wav = Buffer.alloc(44 + n * 4)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + n * 4, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(2, 22)
  wav.writeUInt32LE(taxa, 24)
  wav.writeUInt32LE(taxa * 4, 28)
  wav.writeUInt16LE(4, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(n * 4, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * 300 * i) / taxa) * 8000 * (1 - i / n))
    wav.writeInt16LE(v, 44 + i * 4)
    wav.writeInt16LE(v, 46 + i * 4)
  }
  writeFileSync(join(dir, 'whoosh.wav'), wav)

  await pagina.setInputFiles('#arquivo', join(dir, 'cena.mp4'))
  await pagina.locator('.cartao-midia').waitFor()
  await pagina.click('.dock [data-ir="edicao"]')
  await pagina.locator('.clipe').waitFor()

  // o botão de som (ou S) abre o seletor; o som entra no ponto, selecionado, com a origem no Inspector
  await pagina.setInputFiles('#arquivoSom', join(dir, 'whoosh.wav'))
  const efeito = pagina.locator('.efeito')
  await efeito.waitFor()
  assert.equal(await efeito.innerText(), 'whoosh')
  assert.ok(await efeito.evaluate((e) => e.classList.contains('selecionado')))
  assert.match(await pagina.locator('.insp-efeito').innerText(), /whoosh[\s\S]*Do seu computador[\s\S]*0 dB/)
  const estado = () => pagina.evaluate(() => globalThis.__editor.h.atual.efeitos.map((e) => ({ fonte: e.fonte, volume: e.volume })))
  assert.deepEqual(await estado(), [{ fonte: 0, volume: 0 }])

  // arrastar para a direita: o efeito se prende a outro quadro da imagem; desfazer volta
  const caixa = await efeito.boundingBox()
  await pagina.mouse.move(caixa.x + 5, caixa.y + caixa.height / 2)
  await pagina.mouse.down()
  await pagina.mouse.move(caixa.x + 165, caixa.y + caixa.height / 2, { steps: 8 })
  await pagina.mouse.up()
  await pagina.waitForFunction(() => globalThis.__editor.h.atual.efeitos[0].fonte > 0)
  await pagina.click('#desfazer')
  assert.deepEqual(await estado(), [{ fonte: 0, volume: 0 }])
  await pagina.click('#refazer')

  // volume no Inspector: soltar grava uma ação só
  await pagina.locator('#fxVolume').evaluate((i) => {
    i.value = '-6'
    i.dispatchEvent(new Event('input'))
    i.dispatchEvent(new Event('change'))
  })
  assert.equal((await estado())[0].volume, -6)
  assert.match(await pagina.locator('#historico').innerText(), /Volume do efeito/)

  // Entrega: a faixa de efeitos vai para o Final Cut e o vídeo final sai com o efeito misturado
  await pagina.click('.dock [data-ir="entrega"]')
  await pagina.check('#destinos input[value="video"]')
  const downloads = []
  pagina.on('download', (d) => downloads.push(d))
  await pagina.click('#exportar')
  await pagina.locator('#entregaFim:not([hidden])').waitFor({ timeout: 60_000 })
  const zip = readFileSync(await downloads.find((d) => d.suggestedFilename().endsWith('.zip')).path()).toString('latin1')
  assert.ok(zip.includes('audioRole="effects"'), 'efeito conectado no FCPXML')
  assert.ok(zip.includes('<adjust-volume amount="-6dB"/>'), 'com o volume')
  assert.ok(downloads.some((d) => d.suggestedFilename().endsWith('.mp4')), 'o vídeo final saiu')

  // tirar com Delete na Edição; desfazer traz de volta
  await pagina.click('.dock [data-ir="edicao"]')
  await efeito.click()
  await pagina.keyboard.press('Delete')
  await efeito.waitFor({ state: 'detached' })
  await pagina.click('#desfazer')
  await efeito.waitFor()
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('Sonoplasta: o corte vira momento, a busca acha o som livre, ouvir, colocar no corte, o banco no Drive, crédito e arquivo na entrega', async () => {
  const { pagina, erros } = await abrir()
  const { bytes } = await pagina.evaluate(async () => {
    const { videoDeTeste } = await import('/app/autoteste.js')
    const v = await videoDeTeste()
    return { bytes: [...new Uint8Array(await v.arquivo.arrayBuffer())] }
  })
  writeFileSync(join(dir, 'sono.mp4'), Buffer.from(bytes))
  // o banco de sons pela Absolute ZRO (falso): uma busca com um som CC BY e o arquivo (WAV curto)
  const taxa = 48000
  const n = Math.round(0.3 * taxa)
  const wav = Buffer.alloc(44 + n * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + n * 2, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(taxa, 24)
  wav.writeUInt32LE(taxa * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin(i / 8) * 6000), 44 + i * 2)
  const ID = 'eab8a6e2-0ac8-4615-9e0d-ebde30523783'
  const buscas = []
  await pagina.route('**/api/zro/sons/buscar?*', (r) => {
    buscas.push(new URL(r.request().url()).searchParams.get('q'))
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sons: [{ id: ID, origem: 'openverse', titulo: 'Whoosh Rápido', autor: 'Ana', licenca: 'CC BY 4.0', licencaUrl: 'https://creativecommons.org/licenses/by/4.0/', pagina: 'https://freesound.org/s/1', fonte: 'Freesound', duracao: 0.3, formato: 'wav', bytes: wav.length }], pagina: 1, paginas: 1 }) })
  })
  await pagina.route(`**/api/zro/sons/openverse/${ID}`, (r) => r.fulfill({ status: 200, body: wav, headers: { 'content-type': 'audio/wav', 'x-zro-som-id': ID, 'cross-origin-resource-policy': 'same-origin' } }))

  await pagina.setInputFiles('#arquivo', join(dir, 'sono.mp4'))
  await pagina.locator('.cartao-midia').waitFor()
  await pagina.click('.dock [data-ir="edicao"]')
  await pagina.locator('.clipe').waitFor()
  // um corte em 2 s (⇧→ anda 1 s; B divide)
  await pagina.keyboard.press('Shift+ArrowRight')
  await pagina.keyboard.press('Shift+ArrowRight')
  await pagina.keyboard.press('b')
  await pagina.locator('.clipe').nth(1).waitFor()

  // os sons da Absolute ZRO são o padrão da aba: o catálogo vem uma vez, com categorias e as versões de cada som
  const ZRO = { categorias: [{ nome: 'Whooshes e Transições', total: 1 }, { nome: 'Impactos', total: 1 }], sons: [
    { id: 'whoosh-curto', origem: 'zro', titulo: 'Whoosh curto', categoria: 'Whooshes e Transições', versoes: [{ id: 'whoosh-curto-v1', versao: 1, duracao: 0.3, bytes: wav.length, formato: 'wav', melhor: true }] },
    { id: 'boom-grave', origem: 'zro', titulo: 'Boom grave', categoria: 'Impactos', versoes: [
      { id: 'boom-grave-v2', versao: 2, duracao: 0.3, bytes: wav.length, formato: 'wav', melhor: true },
      { id: 'boom-grave-v1', versao: 1, duracao: 0.3, bytes: wav.length, formato: 'wav', melhor: false },
    ] },
  ] }
  let catalogos = 0
  await pagina.route('**/api/zro/sons/zro', (r) => {
    catalogos++
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ZRO) })
  })
  await pagina.route('**/api/zro/sons/zro/*', (r) => {
    const id = new URL(r.request().url()).pathname.split('/').pop()
    r.fulfill({ status: 200, body: wav, headers: { 'content-type': 'audio/wav', 'x-zro-som-id': id, 'cross-origin-resource-policy': 'same-origin' } })
  })
  await pagina.click('#abasPainel [data-aba="sons"]')
  await pagina.locator('.som-item', { hasText: 'Boom grave' }).waitFor()
  assert.equal(await pagina.locator('#sonsFonte [aria-pressed="true"]').innerText(), 'ZRO')
  assert.deepEqual(await pagina.locator('#sonsPastas button').allInnerTexts(), ['Todos', 'Whooshes e Transições', 'Impactos'])
  await pagina.click('#sonsFonte [data-fonte="livres"]')
  const momento = pagina.locator('.sons-momento', { hasText: 'Corte 1' })
  await momento.click()
  // o corte pede whoosh (preset) e a busca aparece com autor e licença
  await pagina.locator('.som-item').waitFor()
  assert.equal(buscas.at(-1), 'whoosh')
  assert.match(await pagina.locator('.som-item').innerText(), /Whoosh Rápido[\s\S]*Ana · CC BY 4\.0/)
  // em português: "impacto" vira "impact"
  await pagina.fill('#sonsTermo', 'impacto')
  await pagina.press('#sonsTermo', 'Enter')
  await pagina.waitForFunction(() => document.querySelector('.som-item'))
  assert.equal(buscas.at(-1), 'impact')

  // ouvir não coloca; Colocar põe no corte, no volume do preset, com o crédito na origem
  await pagina.locator('.som-ouvir').click()
  await pagina.locator('.som-colocar').click()
  await pagina.locator('.efeito').waitFor()
  const fx = await pagina.evaluate(() => {
    const p = globalThis.__editor.h.atual
    return { efeitos: p.efeitos.map((e) => ({ volume: e.volume, momento: e.momento })), som: p.sons[0], corte: p.linha.clipes[0].fim }
  })
  assert.deepEqual(fx.efeitos, [{ volume: -6, momento: 'corte' }])
  assert.equal(fx.som.origem.autor, 'Ana')
  assert.equal(fx.som.nome, 'Whoosh Rápido.wav')
  assert.equal(await pagina.locator('.efeito').evaluate((e) => Math.round(parseFloat(e.style.left))), await pagina.locator('.clipe').nth(1).evaluate((e) => Math.round(parseFloat(e.style.left))))
  assert.match(await pagina.locator('.insp-efeito').innerText(), /Ana · CC BY 4\.0/)
  // colocar o mesmo som de novo não baixa outra vez (um som, dois efeitos)
  await pagina.locator('.som-colocar').click()
  await pagina.waitForFunction(() => globalThis.__editor.h.atual.efeitos.length === 2)
  assert.equal(await pagina.evaluate(() => globalThis.__editor.h.atual.sons.length), 1)

  // Meu banco: o link da pasta do Drive, a subpasta, buscar nela e colocar um som da pessoa (sem crédito)
  const BANCO = '1AbCdEfGhIjKlMnOp'
  const SUB = '1PastaWhooshesAbc'
  const SOM = '1WhooshDoBancoXyz'
  const listagens = []
  await pagina.route('**/api/zro/sons/banco?*', (r) => {
    const u = new URL(r.request().url()).searchParams
    listagens.push({ pasta: u.get('pasta'), q: u.get('q') })
    const raiz = u.get('pasta') === BANCO
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pasta: { id: u.get('pasta'), nome: raiz ? 'Meus SFX' : 'Whooshes' }, conta: 'c1', pastas: raiz ? [{ id: SUB, nome: 'Whooshes' }] : [], sons: raiz ? [] : [{ id: SOM, origem: 'banco', titulo: 'Whoosh grave', nome: 'Whoosh grave.wav', formato: 'wav', bytes: wav.length, conta: 'c1' }], proxima: null }),
    })
  })
  await pagina.route(`**/api/zro/sons/banco/${SOM}?conta=c1`, (r) => r.fulfill({ status: 200, body: wav, headers: { 'content-type': 'audio/wav', 'x-zro-som-id': SOM, 'cross-origin-resource-policy': 'same-origin' } }))
  await pagina.click('#sonsFonte [data-fonte="banco"]')
  assert.equal(await pagina.locator('#sonsBancoForm').isVisible(), true)
  await pagina.fill('#sonsBancoLink', `https://drive.google.com/drive/u/0/folders/${BANCO}?usp=sharing`)
  await pagina.press('#sonsBancoLink', 'Enter')
  await pagina.locator('#sonsPasta [aria-current="true"]', { hasText: 'Meus SFX' }).waitFor()
  assert.match(await pagina.locator('#sonsLista').innerText(), /Nenhum som nesta pasta/)
  await pagina.locator('#sonsPastas button', { hasText: 'Whooshes' }).click()
  await pagina.locator('.som-item', { hasText: 'Whoosh grave' }).waitFor()
  assert.match(await pagina.locator('#sonsPasta').innerText(), /Meus SFX\s*›\s*Whooshes/)
  await pagina.fill('#sonsTermo', 'grave')
  await pagina.press('#sonsTermo', 'Enter')
  await pagina.waitForFunction(() => document.querySelector('.som-item'))
  assert.deepEqual(listagens.at(-1), { pasta: SUB, q: 'grave' })
  // a pasta fica guardada neste navegador
  assert.equal(await pagina.evaluate(() => JSON.parse(localStorage.getItem('aeon.sons.banco')).id), BANCO)
  await pagina.locator('.som-item .som-colocar').click()
  await pagina.waitForFunction(() => globalThis.__editor.h.atual.efeitos.length === 3)
  const doBanco = await pagina.evaluate(() => globalThis.__editor.h.atual.sons.find((x) => x.origem.tipo === 'banco'))
  assert.deepEqual(doBanco.origem, { tipo: 'banco', id: SOM, titulo: 'Whoosh grave', fonte: 'Meu banco no Drive', conta: 'c1' })
  assert.match(await pagina.locator('.insp-efeito').innerText(), /Do seu banco no Drive/)
  await pagina.click('#sonsFonte [data-fonte="livres"]')

  // ZRO de novo: o catálogo não desce outra vez; a categoria filtra, a busca acha em português, a melhor versão vem
  // marcada e a escolhida é a que entra (sem crédito)
  await pagina.click('#sonsFonte [data-fonte="zro"]')
  await pagina.locator('#sonsPastas button', { hasText: 'Impactos' }).click()
  await pagina.waitForFunction(() => document.querySelectorAll('.som-item').length === 1)
  assert.match(await pagina.locator('.som-item').innerText(), /Boom grave/)
  await pagina.fill('#sonsTermo', 'boom')
  await pagina.press('#sonsTermo', 'Enter')
  assert.deepEqual(await pagina.locator('.som-versoes [aria-pressed="true"]').allInnerTexts(), ['2'])
  await pagina.locator('.som-versoes button', { hasText: '1' }).click()
  await pagina.waitForFunction(() => document.querySelector('.som-item')?.dataset.id === 'boom-grave-v1')
  await pagina.locator('.som-item .som-colocar').click()
  await pagina.waitForFunction(() => globalThis.__editor.h.atual.efeitos.length === 4)
  const daZro = await pagina.evaluate(() => globalThis.__editor.h.atual.sons.find((x) => x.origem.tipo === 'zro'))
  assert.deepEqual(daZro.origem, { tipo: 'zro', id: 'boom-grave-v1', titulo: 'Boom grave 1', fonte: 'Absolute ZRO' })
  assert.match(await pagina.locator('.insp-efeito').innerText(), /Som original da Absolute ZRO/)
  assert.equal(catalogos, 1)
  await pagina.click('#sonsFonte [data-fonte="livres"]')

  // entrega: o arquivo do som vai junto, o XML aponta para ele e o crédito sai no CREDITOS.txt
  await pagina.click('.dock [data-ir="entrega"]')
  const downloads = []
  pagina.on('download', (d) => downloads.push(d))
  await pagina.click('#exportar')
  await pagina.locator('#entregaFim:not([hidden])').waitFor({ timeout: 60_000 })
  const zip = readFileSync(await downloads.find((d) => d.suggestedFilename().endsWith('.zip')).path()).toString('utf8')
  assert.ok(zip.includes('Efeito - Whoosh Rápido.wav'), 'o arquivo do som vai na entrega')
  assert.ok(zip.includes('src="Efeito%20-%20Whoosh%20R%C3%A1pido.wav"'), 'o FCPXML aponta para ele')
  assert.match(zip, /"Whoosh Rápido" por Ana · CC BY 4\.0 · https:\/\/freesound\.org\/s\/1/)
  assert.ok(zip.includes('Efeito - Whoosh grave.wav'), 'o som do banco também vai na entrega')
  assert.doesNotMatch(zip, /"Whoosh grave" (por|·)/, 'o som do banco da pessoa não pede crédito')
  assert.ok(zip.includes('Efeito - Boom grave 1.wav'), 'o som da ZRO também vai na entrega')
  assert.doesNotMatch(zip, /"Boom grave 1" (por|·)/, 'o som da Absolute ZRO não pede crédito')
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('projeto novo: nome, formato vertical e quadros; renomear pela barra', async () => {
  const { pagina, erros } = await abrir()
  await pagina.click('#novoProjeto')
  await pagina.fill('#novoNome', 'Reels de outubro')
  await pagina.locator('.formato', { hasText: '9:16' }).click()
  await pagina.selectOption('#novoFps', '25')
  await pagina.click('#novoCriar')
  await pagina.locator('#nomeProjeto', { hasText: 'Reels de outubro' }).waitFor()
  const p = await pagina.evaluate(() => globalThis.__editor.h.atual)
  assert.equal(p.largura, 1080)
  assert.equal(p.altura, 1920)
  assert.deepEqual(p.fps, { n: 25, d: 1 })
  await pagina.getByRole('heading', { name: /Solte o vídeo/ }).waitFor()
  assert.equal(await pagina.locator('#universos').isHidden(), true)
  await pagina.click('#nomeProjeto')
  await pagina.keyboard.type('Reels de novembro')
  await pagina.keyboard.press('Enter')
  assert.equal(await pagina.evaluate(() => globalThis.__editor.h.atual.nome), 'Reels de novembro')
  await pagina.locator('#salvo[data-estado="ok"]').waitFor()

  // tirar a mídia do projeto (o arquivo fica) e desfazer
  await pagina.setInputFiles('#arquivo', join(dir, 'fala.mp4'))
  await pagina.locator('.cartao-midia').waitFor()
  await pagina.locator('.cartao-midia').hover()
  await pagina.getByRole('button', { name: 'Tirar fala.mp4 do projeto' }).click()
  await pagina.getByRole('heading', { name: /Solte o vídeo/ }).waitFor()
  assert.equal(await pagina.evaluate(() => globalThis.__editor.h.atual.linha.clipes.length), 0)
  assert.match(await pagina.locator('#aviso').innerText(), /continua no computador/)
  await pagina.keyboard.press('Control+z')
  await pagina.locator('.cartao-midia').waitFor()
  assert.equal(await pagina.evaluate(() => globalThis.__editor.h.atual.midias.length), 1)

  // selecionar várias: duas mídias marcadas saem num passo só e o desfazer devolve as duas
  await pagina.setInputFiles('#arquivo', join(dir, 'fala-2.mp4'))
  await pagina.waitForFunction(() => globalThis.__editor.h.atual.midias.length === 2)
  await pagina.click('#selecionarMidia')
  assert.equal(await pagina.locator('#tirarSel').isDisabled(), true)
  await pagina.getByRole('checkbox', { name: 'fala.mp4' }).click()
  await pagina.getByRole('checkbox', { name: 'fala-2.mp4' }).click()
  assert.equal(await pagina.locator('#contaSel').innerText(), '2 marcadas')
  await pagina.click('#tirarSel')
  await pagina.getByRole('heading', { name: /Solte o vídeo/ }).waitFor()
  assert.equal(await pagina.evaluate(() => globalThis.__editor.h.atual.midias.length), 0)
  await pagina.keyboard.press('Control+z')
  await pagina.waitForFunction(() => globalThis.__editor.h.atual.midias.length === 2)
  assert.equal(await pagina.locator('#selecionarMidia').innerText(), 'Selecionar')
  assert.deepEqual(erros, [])
  await pagina.close()
})

// 1×1 PNG: a "foto" da conta servida como a Absolute ZRO serve (Cross-Origin-Resource-Policy: cross-origin, por causa
// do isolamento entre origens do app)
const FOTO_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

test('perfil único: foto e nome da conta Absolute ZRO no menu; editar leva à conta; sem foto, iniciais', async () => {
  const foto = 'https://absolutezro.com/api/v1/foto/b8a4a3c2-0f4e-4d55-9a51-1f3f0c6a2b10'
  const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } })
  await simularZ(pagina)
  // o app abre o Set da conta (presença do ecossistema): sem o repasse simulado, /api/zro/set daria 404 no console
  await simularSet(pagina)
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
  let pessoa = { ...PESSOA, conta: 'https://absolutezro.com/perfil?de=aeon', pessoa: { ...PESSOA.pessoa, nome: 'Lia Martins', foto } }
  await pagina.route('**/api/zro/eu', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pessoa) }))
  await pagina.route('https://absolutezro.com/api/v1/foto/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'cross-origin-resource-policy': 'cross-origin' }, body: FOTO_PNG }))
  await pagina.goto(s.url + 'app/')
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  // a CSP do app deixa a foto da conta carregar (img-src https://absolutezro.com)
  await pagina.locator('#trilho .trilho-conta .avatar--foto img').waitFor()
  assert.equal(await pagina.locator('#trilho .trilho-conta img').getAttribute('src'), foto)
  assert.equal(await pagina.locator('#trilho .trilho-conta img').evaluate((i) => i.naturalWidth), 1)
  assert.equal(await pagina.locator('.trilho-item', { hasText: 'Lia Martins' }).count(), 1)
  await pagina.locator('#menuBotao').click()
  await pagina.locator('#trilho [data-acao="conta"]').click()
  await pagina.locator('#trilhoConta:popover-open .avatar--foto img').waitFor()
  const editar = pagina.locator('#trilhoConta a', { hasText: 'Editar na conta Absolute ZRO' })
  assert.equal(await editar.getAttribute('href'), 'https://absolutezro.com/perfil?de=aeon', 'zro_conta')
  assert.equal(await editar.getAttribute('target'), '_blank', 'abre fora do app (no desktop, o navegador)')
  // o app não edita nome, foto nem e-mail: nada de campo para isso
  assert.equal(await pagina.locator('#trilhoConta input, #trilho input').count(), 0)

  // sem foto na conta (ou foto que não carrega): as iniciais
  pessoa = { ...PESSOA, pessoa: { ...PESSOA.pessoa, foto: null } }
  await pagina.reload()
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  assert.equal(await pagina.locator('#trilho .trilho-conta .avatar').innerText(), 'LP')
  assert.equal(await pagina.locator('#trilho .trilho-conta img').count(), 0)
  assert.deepEqual(erros, [])
  // foto trocada e o endereço velho já responde 404 (o navegador registra o 404; a tela fica nas iniciais)
  await pagina.unroute('https://absolutezro.com/api/v1/foto/**')
  await pagina.route('https://absolutezro.com/api/v1/foto/**', (r) => r.fulfill({ status: 404, headers: { 'cross-origin-resource-policy': 'cross-origin' }, body: '' }))
  pessoa = { ...PESSOA, pessoa: { ...PESSOA.pessoa, foto: `${foto}-velha` } }
  await pagina.reload()
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  assert.equal(await pagina.locator('#trilho .trilho-conta .avatar').innerText(), 'LP')
  assert.equal(await pagina.locator('#trilho .trilho-conta img').count(), 0)
  await pagina.close()

  // entrar.html (logado): a mesma foto e o mesmo caminho para editar
  const entrar = await navegador.newPage()
  pessoa = { ...PESSOA, conta: 'https://absolutezro.com/perfil', pessoa: { ...PESSOA.pessoa, foto } }
  await entrar.route('**/api/zro/eu', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pessoa) }))
  await entrar.route('https://absolutezro.com/api/v1/foto/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'cross-origin-resource-policy': 'cross-origin' }, body: FOTO_PNG }))
  await entrar.goto(s.url + 'entrar.html')
  await entrar.locator('#avatar.avatar--foto img').waitFor()
  assert.equal(await entrar.getByRole('link', { name: 'Editar na conta Absolute ZRO' }).getAttribute('href'), 'https://absolutezro.com/perfil')
  await entrar.close()
})

test('menu: cada item faz algo de verdade (projetos, conta, sair, apps da família)', async () => {
  const { pagina, erros } = await abrir()
  await pagina.locator('#menuBotao').click()
  const item = (acao) => pagina.locator(`#trilho [data-acao="${acao}"]`)

  // sem projeto: Seus universos é onde a pessoa está; Salvar cópia avisa em vez de calar
  assert.equal(await item('universos').getAttribute('aria-current'), 'page')
  assert.equal(await item('salvar').isDisabled(), true)
  await pagina.keyboard.press('Control+s')
  await pagina.locator('#aviso.visivel', { hasText: 'Abra ou crie um projeto' }).waitFor()

  // Abrir projeto… abre o seletor de arquivo de projeto
  const [seletor] = await Promise.all([pagina.waitForEvent('filechooser'), item('abrir').click()])
  assert.equal(await seletor.element().getAttribute('id'), 'arquivoProjeto')

  // Novo projeto pelo menu → projeto aberto, Salvar cópia liga e baixa o arquivo
  await item('novo').click()
  await pagina.fill('#novoNome', 'Do menu')
  await pagina.click('#novoCriar')
  await pagina.locator('#nomeProjeto', { hasText: 'Do menu' }).waitFor()
  assert.equal(await item('universos').getAttribute('aria-current'), null)
  assert.equal(await item('salvar').isDisabled(), false)
  const [baixado] = await Promise.all([pagina.waitForEvent('download'), item('salvar').click()])
  assert.match(baixado.suggestedFilename(), /^Do menu\./)

  // Seus universos fecha o projeto e mostra a lista com ele
  await item('universos').click()
  await pagina.locator('.cartao-projeto', { hasText: 'Do menu' }).waitFor()
  assert.equal(await item('universos').getAttribute('aria-current'), 'page')

  // links de fora só https com target=_blank: no app de computador o Electron só entrega esses ao navegador
  // (desktop/main.cjs › setWindowOpenHandler); um link interno com target=_blank morria em silêncio (era a conta)
  const fora = await pagina.$$eval('#trilho a[target="_blank"], .trilho-pop a[target="_blank"]', (as) => as.map((a) => a.href))
  assert.ok(fora.length >= 8, `links de fora: ${fora.length}`)
  for (const h of fora) assert.match(h, /^https:\/\//, h)

  // apps da família: uma linha no menu, a grade abre ao lado e cada app abre em aba nova
  assert.equal(await pagina.locator('#trilho .trilho-item').count(), 6, 'projeto (4) + apps + conta')
  await item('apps').click()
  await pagina.locator('#trilhoApps:popover-open').waitFor()
  // a família de src/familia.js (9 hoje, com o Maestro e o Relay; MAESTRO_NA_FAMILIA)
  assert.equal(await pagina.locator('#trilhoApps .familia-app').count(), FAMILIA.length)
  await pagina.context().route('https://sobedesce.absolutezro.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }))
  const [aba] = await Promise.all([pagina.context().waitForEvent('page'), pagina.locator('#trilhoApps .familia-app', { hasText: 'SOBEDESCE' }).click()])
  assert.match(aba.url(), /^https:\/\/sobedesce\.absolutezro\.com/)
  await aba.close()
  assert.equal(await pagina.locator('#trilhoApps:popover-open').count(), 0, 'a grade fecha depois de abrir um app')

  // conta: cartão com quem é; o menu leva à conta e sai de verdade (POST /api/zro/sair → entrar.html)
  await item('conta').click()
  await pagina.locator('#trilhoConta:popover-open', { hasText: 'lia@produtora.com' }).waitFor()
  assert.equal(await pagina.locator('#trilhoConta a', { hasText: 'Editar na conta Absolute ZRO' }).getAttribute('href'), 'https://absolutezro.com/perfil')
  let saiu = false
  await pagina.route('**/api/zro/sair', (r) => {
    saiu = r.request().method() === 'POST'
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await pagina.unroute('**/api/zro/eu')
  await pagina.route('**/api/zro/eu', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' }))
  await pagina.locator('#trilhoConta [data-acao="sair"]').click()
  await pagina.waitForURL(/entrar\.html/)
  assert.equal(saiu, true)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('velocidade: curva pronta no Inspector, selo no clipe, teclado, manter duração, desfazer, prévia e FCPXML', async () => {
  const { pagina, erros } = await abrir()
  await pagina.setInputFiles('#arquivo', join(dir, 'fala.mp4'))
  await pagina.locator('.cartao-midia').waitFor()
  await pagina.click('.dock [data-ir="edicao"]')
  await pagina.locator('.clipe').first().click()
  const vel = pagina.locator('.insp-velocidade')
  await vel.waitFor()
  const projeto = () => pagina.evaluate(() => globalThis.__editor.h.atual)
  const quadros = (await projeto()).linha.clipes[0].fim
  // Herói: rápido, câmera lenta no meio, rápido; o clipe ganha o selo e o resumo mostra o tempo novo
  await vel.getByRole('button', { name: 'Herói' }).click()
  let p = await projeto()
  assert.ok(p.linha.clipes[0].velocidade, 'curva no clipe')
  await pagina.locator('.clipe .clipe-vel', { hasText: /Rampa/ }).waitFor()
  assert.match(await vel.locator('.vel-resumo').innerText(), /^\d+,\d s → \d+,\d s$/)
  assert.equal(await vel.getByRole('button', { name: 'Herói' }).getAttribute('aria-pressed'), 'true')
  // teclado: seta para cima no segundo ponto aumenta a velocidade dele (uma ação no desfazer)
  const v0 = p.linha.clipes[0].velocidade.pontos[1][1]
  await vel.locator('.vel-ponto').nth(1).focus()
  await pagina.keyboard.press('ArrowUp')
  p = await projeto()
  assert.ok(p.linha.clipes[0].velocidade.pontos[1][1] > v0)
  // Manter duração: a mesma forma no tempo original do clipe
  await vel.getByRole('button', { name: 'Manter duração' }).click()
  const { saidaDoClipe } = await import('../src/velocidade.js')
  p = await projeto()
  assert.ok(Math.abs(saidaDoClipe(p.linha.clipes[0]) - quadros) <= 3, 'mesmo tempo na linha')
  // a prévia toca a rampa sem erro
  await pagina.keyboard.press('Space')
  await pagina.waitForTimeout(800)
  await pagina.keyboard.press('Space')
  // o Final Cut recebe os degraus com timeMap
  const fcp = await pagina.evaluate(async () => (await import('../src/exportar/fcpxml.js')).paraFcpxml(globalThis.__editor.h.atual))
  assert.match(fcp, /<timeMap>/)
  // 100% tira a curva; ⌘Z devolve
  await vel.getByRole('button', { name: '100%' }).click()
  assert.equal((await projeto()).linha.clipes[0].velocidade, undefined)
  assert.equal(await pagina.locator('.clipe .clipe-vel').first().isHidden(), true)
  await pagina.keyboard.press('Control+z')
  assert.ok((await projeto()).linha.clipes[0].velocidade)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('footage de verdade: um take de câmera (marca/home/cenas) com a curva Herói sai do render com os quadros da curva', async () => {
  const { pagina, erros } = await abrir()
  await pagina.setInputFiles('#arquivo', fileURLToPath(new URL('../marca/home/cenas/onda.mp4', import.meta.url)))
  await pagina.locator('.cartao-midia').waitFor()
  await pagina.click('.dock [data-ir="edicao"]')
  await pagina.locator('.clipe').first().click()
  await pagina.locator('.insp-velocidade').getByRole('button', { name: 'Herói' }).click()
  await pagina.locator('.vel-modos').getByRole('radio', { name: 'Quadro' }).click()
  const p = await pagina.evaluate(() => globalThis.__editor.h.atual)
  const { saidaDoClipe } = await import('../src/velocidade.js')
  const quadros = saidaDoClipe(p.linha.clipes[0])
  assert.ok(quadros > p.linha.clipes[0].fim, 'a câmera lenta do meio deixa o clipe mais longo')
  // só o vídeo final
  await pagina.click('.dock [data-ir="entrega"]')
  for (const d of ['xmeml', 'fcpxml', 'resolve']) await pagina.uncheck(`#destinos input[value="${d}"]`)
  await pagina.check('#destinos input[value="video"]')
  const [baixado] = await Promise.all([pagina.waitForEvent('download', { timeout: 120_000 }), pagina.click('#exportar')])
  const arquivo = join(dir, 'onda-heroi.mp4')
  await baixado.saveAs(arquivo)
  const sonda = ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width,height', '-of', 'json', arquivo]
  const [v] = JSON.parse(execFileSync('ffprobe', sonda).toString()).streams
  assert.equal(Number(v.nb_read_frames), quadros, 'um quadro do render para cada quadro da curva')
  assert.equal(`${v.width}×${v.height}`, '1280×720')
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('câmera lenta com fonte de 60 qps numa linha de 24 qps: cada quadro de saída é um quadro diferente (sem repetir)', async () => {
  // 24 qps primeiro (o projeto fica em 24), depois 60 qps; o padrão de teste do ffmpeg muda a cada quadro
  const gerar = (nome, taxa) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=640x360:rate=${taxa}`, '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(dir, nome)])
  gerar('base24.mp4', 24)
  gerar('alta60.mp4', 60)
  const { pagina, erros } = await abrir()
  await pagina.setInputFiles('#arquivo', [join(dir, 'base24.mp4'), join(dir, 'alta60.mp4')])
  await pagina.locator('.cartao-midia').nth(1).waitFor()
  await pagina.click('.dock [data-ir="edicao"]')
  await pagina.locator('.clipe').nth(1).click()
  await pagina.locator('.insp-velocidade').getByRole('button', { name: 'Câmera lenta' }).click()
  // só quadros reais (sem fluxo): a fonte tem quadro para cada instante pedido
  await pagina.locator('.vel-modos').getByRole('radio', { name: 'Quadro' }).click()
  const p = await pagina.evaluate(() => globalThis.__editor.h.atual)
  assert.equal(p.fps.n / p.fps.d, 24)
  assert.equal(p.linha.clipes[1].velocidade.modo, 'quadro')
  await pagina.click('.dock [data-ir="entrega"]')
  for (const d of ['xmeml', 'fcpxml', 'resolve']) await pagina.uncheck(`#destinos input[value="${d}"]`)
  await pagina.check('#destinos input[value="video"]')
  const [baixado] = await Promise.all([pagina.waitForEvent('download', { timeout: 120_000 }), pagina.click('#exportar')])
  const arquivo = join(dir, 'lenta.mp4')
  await baixado.saveAs(arquivo)
  // quadros em cinza 64×36; dois seguidos quase iguais = quadro repetido
  const bruto = execFileSync('ffmpeg', ['-v', 'error', '-i', arquivo, '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 64 << 20 })
  const T = 64 * 36
  const n = bruto.length / T
  assert.equal(n, 48 + 96, '2 s a 100% e 2 s a 50% (4 s) em 24 qps')
  const dif = (i) => {
    let s = 0
    for (let j = 0; j < T; j++) s += Math.abs(bruto[i * T + j] - bruto[(i - 1) * T + j])
    return s / T
  }
  const repetidos = []
  for (let i = 49; i < n; i++) if (dif(i) < 0.5) repetidos.push(i)
  assert.deepEqual(repetidos, [], 'na câmera lenta, nenhum quadro repetido')
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('fluxo óptico: 24 qps a 50% ganha um quadro novo entre cada par (o modelo de verdade, na CSP do site), sem repetir', async () => {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(dir, 'fluxo24.mp4')])
  const { pagina, erros } = await abrir()
  await pagina.setInputFiles('#arquivo', join(dir, 'fluxo24.mp4'))
  await pagina.locator('.cartao-midia').waitFor()
  await pagina.click('.dock [data-ir="edicao"]')
  await pagina.locator('.clipe').first().click()
  await pagina.locator('.insp-velocidade').getByRole('button', { name: 'Câmera lenta' }).click()
  // o padrão é o fluxo óptico
  assert.equal(await pagina.locator('.vel-modos').getByRole('radio', { name: 'Fluxo óptico' }).getAttribute('aria-checked'), 'true')
  await pagina.click('.dock [data-ir="entrega"]')
  for (const d of ['xmeml', 'fcpxml', 'resolve']) await pagina.uncheck(`#destinos input[value="${d}"]`)
  await pagina.check('#destinos input[value="video"]')
  const [baixado] = await Promise.all([pagina.waitForEvent('download', { timeout: 300_000 }), pagina.click('#exportar')])
  await pagina.locator('#entregaFim', { hasText: /\d+ quadros de câmera lenta por fluxo óptico/ }).waitFor({ timeout: 60_000 })
  const n = Number((await pagina.locator('#entregaFim').innerText()).match(/(\d+) quadros de câmera lenta por fluxo óptico/)[1])
  assert.ok(n >= 40 && n <= 48, `metade dos 96 quadros sai do fluxo (${n})`)
  const arquivo = join(dir, 'fluxo.mp4')
  await baixado.saveAs(arquivo)
  const bruto = execFileSync('ffmpeg', ['-v', 'error', '-i', arquivo, '-vf', 'scale=128:72,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 64 << 20 })
  const T = 128 * 72
  const q = bruto.length / T
  assert.equal(q, 96)
  const dif = (i, j) => {
    let s = 0
    for (let k = 0; k < T; k++) s += Math.abs(bruto[i * T + k] - bruto[j * T + k])
    return s / T
  }
  // nenhum quadro repetido (menos o último: depois do último quadro da câmera não há vizinho para o fluxo); e cada
  // quadro do meio fica mais perto dos vizinhos do que um vizinho do outro
  for (let i = 1; i < q - 1; i++) assert.ok(dif(i, i - 1) > 0.3, `quadro ${i} repetido`)
  for (let i = 1; i < q - 1; i += 2) assert.ok(dif(i, i - 1) < dif(i + 1, i - 1) && dif(i, i + 1) < dif(i + 1, i - 1), `quadro ${i} entre os vizinhos`)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('estabilizar: um take real tremido (o cavalo, com tremor de recorte) sai do render com o tremor medido bem menor', async () => {
  const take = fileURLToPath(new URL('../marca/home/cenas/cavalo.mp4', import.meta.url))
  const tremido = join(dir, 'tremido.mp4')
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', take, '-t', '4', '-an', '-vf', "crop=1180:664:x='50+30*sin(n*1.3)+18*sin(n*0.41)':y='28+18*cos(n*1.7)+9*sin(n*0.53)',scale=640:360", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', tremido])
  const { Analisador } = await import('../src/estabilizar/index.js')
  const { tremor } = await import('../src/estabilizar/trajetoria.js')
  // a medida é independente do app: lê o arquivo com o ffmpeg e mede o movimento quadro a quadro
  const medir = (arquivo) => {
    const bruto = execFileSync('ffmpeg', ['-v', 'error', '-i', arquivo, '-vf', 'scale=320:180,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 64 << 20 })
    const T = 320 * 180
    const an = new Analisador()
    const movs = []
    for (let i = 0; i < bruto.length / T; i++) movs.push(an.adicionar({ w: 320, h: 180, d: Float32Array.from(bruto.subarray(i * T, (i + 1) * T)) }))
    return tremor(movs, 50)
  }
  const { pagina, erros } = await abrir()
  await pagina.setInputFiles('#arquivo', tremido)
  await pagina.locator('.cartao-midia').waitFor()
  await pagina.click('.dock [data-ir="edicao"]')
  await pagina.locator('.clipe').first().click()
  const est = pagina.locator('.insp-estab')
  await est.getByRole('button', { name: 'Analisar e estabilizar' }).click()
  await est.locator('.estab-resumo', { hasText: /^Tremor −\d+% · recorte \d+%$/ }).waitFor({ timeout: 120_000 })
  const resumo = await est.locator('.estab-resumo').innerText()
  assert.ok(Number(resumo.match(/−(\d+)%/)[1]) >= 70, resumo)
  assert.equal(await est.getByRole('button', { name: 'Estabilizado' }).getAttribute('aria-pressed'), 'true')
  const p = await pagina.evaluate(() => globalThis.__editor.h.atual)
  assert.equal(p.midias[0].estabilidade.n, 200, 'a análise de cada quadro fica na mídia do projeto')
  assert.deepEqual(p.linha.clipes[0].estabilizar, { suavidade: 1, recorte: 1.2 })
  await pagina.click('.dock [data-ir="entrega"]')
  for (const d of ['xmeml', 'fcpxml', 'resolve']) await pagina.uncheck(`#destinos input[value="${d}"]`)
  await pagina.check('#destinos input[value="video"]')
  const [baixado] = await Promise.all([pagina.waitForEvent('download', { timeout: 120_000 }), pagina.click('#exportar')])
  const arquivo = join(dir, 'estabilizado.mp4')
  await baixado.saveAs(arquivo)
  const antes = medir(tremido)
  const depois = medir(arquivo)
  assert.ok(depois < antes * 0.35, `tremor no arquivo: ${antes.toFixed(1)} → ${depois.toFixed(1)} px`)
  assert.deepEqual(erros, [])
  await pagina.close()
})

/** Põe marcadores pela folha "Colar notas" da aba Marcadores (o caminho de quem cola a revisão do cliente). */
async function colarNotas(pagina, texto) {
  await pagina.locator('#abasPainel [data-aba="marcadores"]').click()
  await pagina.locator('.mk-acoes [data-fazer="colar"]').click()
  const folha = pagina.locator('dialog.mk-folha-colar')
  await folha.locator('textarea').fill(texto)
  await folha.locator('.mk-pintar [data-cor="azul"]').click()
  await folha.locator('[value="por"]').click()
  await folha.waitFor({ state: 'detached' })
}

test('marcadores: colar notas, M renomeia, cor pelo teclado, capítulos, tirar trecho, imagens e CSV', async () => {
  const { pagina, erros } = await abrir()
  await pagina.setInputFiles('#arquivo', fileURLToPath(new URL('../marca/home/cenas/onda.mp4', import.meta.url)))
  await pagina.locator('.cartao-midia').waitFor()
  await pagina.click('.dock [data-ir="edicao"]')
  await pagina.locator('.clipe').waitFor()
  const marcadores = () => pagina.evaluate(() => globalThis.__editor.h.atual.marcadores.map(({ q, nome, nota, cor }) => ({ q, nome, nota: nota || '', cor: cor || null })))

  // a revisão colada vira três marcadores azuis, na lista e na linha do tempo
  await colarNotas(pagina, 'Notas da revisão\n0:00 Abertura\n[0:02] Onda grande, deixar mais tempo\n0:05 - Final')
  const fps = await pagina.evaluate(() => globalThis.__editor.h.atual.fps)
  const q = (s) => Math.round((s * fps.n) / fps.d)
  assert.deepEqual(await marcadores(), [
    { q: 0, nome: 'Abertura', nota: '', cor: 'azul' },
    { q: q(2), nome: 'Onda grande, deixar mais tempo', nota: '', cor: 'azul' },
    { q: q(5), nome: 'Final', nota: '', cor: 'azul' },
  ])
  assert.equal(await pagina.locator('.mk-item').count(), 3)
  assert.equal(await pagina.locator('.trilha-marcas .marcador').count(), 3)
  assert.match(await pagina.locator('.mk-item').nth(1).innerText(), /0:02[\s\S]*Onda grande[\s\S]*3 s/)

  // M em cima de um marcador abre o nome dele: renomeia e grava no desfazer
  await pagina.locator('.mk-lista').press('Escape')
  await pagina.locator('body').press('m')
  const campo = pagina.locator('.mk-editar')
  await campo.waitFor()
  await campo.fill('Começo')
  await campo.press('Enter')
  assert.equal((await marcadores())[0].nome, 'Começo')
  assert.match(await pagina.locator('#historico').innerText(), /Nome do marcador/i)

  // ↓ escolhe o seguinte e leva o vídeo junto; 3 pinta de verde
  await pagina.locator('.mk-item').first().click()
  await pagina.locator('.mk-lista').press('ArrowDown')
  await pagina.locator('.mk-lista').press('3')
  assert.equal((await marcadores())[1].cor, 'verde')

  // capítulos do YouTube: o texto pronto e o aviso das regras de lá (cada um com 10 s)
  await pagina.locator('.mk-acoes [data-fazer="capitulos"]').click()
  const cap = pagina.locator('dialog.mk-folha-capitulos')
  assert.equal(await cap.locator('textarea').inputValue(), '0:00 Começo\n0:02 Onda grande, deixar mais tempo\n0:05 Final')
  assert.match(await cap.locator('.mk-problemas').innerText(), /menos de 10 s/)
  await cap.locator('[value="fechar"]').click()

  // tirar o trecho do segundo: 3 s a menos e o Final anda junto; desfazer volta
  const dur = () => pagina.evaluate(() => globalThis.__editor.h.atual.linha.clipes.reduce((n, c) => n + (c.fim - c.ini), 0))
  const antes = await dur()
  await pagina.locator('.mk-item').nth(1).click()
  await pagina.locator('.mk-tirar').click()
  assert.equal(antes - (await dur()), q(5) - q(2))
  assert.deepEqual(
    (await marcadores()).map((m) => [m.nome, m.q]),
    [
      ['Começo', 0],
      ['Final', q(2)],
    ],
  )
  await pagina.click('#desfazer')
  assert.equal(await dur(), antes)

  // imagens nos marcadores (um .zip com os PNG) e o CSV
  await pagina.locator('.mk-lista').press('Escape')
  const [imagens] = await Promise.all([pagina.waitForEvent('download', { timeout: 60_000 }), pagina.locator('.mk-acoes [data-fazer="quadros"]').click()])
  const zip = join(dir, 'imagens.zip')
  await imagens.saveAs(zip)
  const nomes = execFileSync('zipinfo', ['-1', zip]).toString().trim().split('\n')
  assert.deepEqual(nomes, ['01_Começo_0-00.png', '02_Onda grande, deixar mais tempo_0-02.png', '03_Final_0-05.png'])
  execFileSync('unzip', ['-o', '-q', zip, '-d', join(dir, 'imagens')])
  const [img] = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', join(dir, 'imagens', '02_Onda grande, deixar mais tempo_0-02.png')]).toString()).streams
  assert.equal(`${img.width}×${img.height}`, '1280×720')
  const [planilha] = await Promise.all([pagina.waitForEvent('download'), pagina.locator('.mk-acoes [data-fazer="csv"]').click()])
  const csv = readFileSync(await planilha.path(), 'utf8')
  assert.match(csv, /^Tempo,Nome,Nota,Cor,Duração\n00:00:00:00,Começo,,azul,00:00:02:00\n/)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('peças: duas seções em 16:9 e 9:16, nome pelo modelo, vídeo de cada uma e relatório; juntar em outra ordem', async () => {
  const { pagina, erros } = await abrir()
  // sem o seletor de pasta do Chrome (abriria uma janela): as peças saem num .zip
  await pagina.evaluate(() => delete globalThis.showDirectoryPicker)
  await pagina.setInputFiles('#arquivo', fileURLToPath(new URL('../marca/home/cenas/onda.mp4', import.meta.url)))
  await pagina.locator('.cartao-midia').waitFor()
  await pagina.click('.dock [data-ir="edicao"]')
  await pagina.locator('.clipe').waitFor()
  await colarNotas(pagina, '0:00 Chegada\n0:03 Onda\n0:06 Saída')

  await pagina.click('.dock [data-ir="entrega"]')
  await pagina.locator('#modoEntrega [data-modo="pecas"]').click()
  assert.deepEqual(await pagina.locator('.peca-nome').allInnerTexts(), ['Chegada', 'Onda', 'Saída'])
  await pagina.locator('.peca input[type=checkbox]').nth(2).uncheck()
  // o 16:9 é o do projeto (Original 16:9); o 9:16 entra junto
  assert.equal(await pagina.locator('.pecas-formato').first().innerText(), 'Original 16:9')
  await pagina.locator('.pecas-formato[data-formato="9x16"]').click()
  assert.equal(await pagina.locator('#pecasResumo').innerText(), '4 peças · 01_Chegada.mp4')
  assert.equal(await pagina.locator('.pecas-formato[data-formato="16x9"]').count(), 0, 'a mesma proporção do projeto não repete')
  for (const d of ['xmeml', 'fcpxml', 'resolve']) await pagina.uncheck(`#destinos input[value="${d}"]`)
  await pagina.check('#destinos input[value="xmeml"]')
  await pagina.check('#destinos input[value="video"]')
  const [baixado] = await Promise.all([pagina.waitForEvent('download', { timeout: 240_000 }), pagina.click('#exportar')])
  const zip = join(dir, 'pecas.zip')
  await baixado.saveAs(zip)
  await pagina.locator('#entregaFim:not([hidden])').waitFor()
  assert.match(await pagina.locator('#entregaFim').innerText(), /Pronto: 4 de 4 peças/)
  const nomes = execFileSync('zipinfo', ['-1', zip]).toString().trim().split('\n').sort()
  const base = 'onda · peças'
  for (const n of ['01_Chegada.mp4', '01_Chegada_9x16.mp4', '02_Onda.mp4', '02_Onda_9x16.mp4', 'entrega.csv', '01_Chegada/01_Chegada.xml', '02_Onda_9x16/02_Onda_9x16.xml']) assert.ok(nomes.includes(`${base}/${n}`), `${n} em ${nomes.join(', ')}`)
  const saida = join(dir, 'pecas')
  execFileSync('unzip', ['-o', '-q', zip, '-d', saida])
  const sonda = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', join(saida, base, f)]).toString())
  const v = sonda('02_Onda_9x16.mp4')
  assert.equal(`${v.streams[0].width}×${v.streams[0].height}`, '1080×1920')
  assert.ok(Math.abs(Number(v.format.duration) - 3) < 0.15, `duração ${v.format.duration}`)
  const h = sonda('01_Chegada.mp4')
  assert.equal(`${h.streams[0].width}×${h.streams[0].height}`, '1280×720')
  const rel = readFileSync(join(saida, base, 'entrega.csv'), 'utf8')
  assert.match(rel, /^Peça,Seção,Formato,Entrada,Saída,Duração,Arquivos,Situação\n01_Chegada,Chegada,Original,/)
  assert.equal((rel.match(/,pronto$/gm) || []).length, 4)
  // a peça vertical leva o XML com a sequência 9:16
  assert.match(readFileSync(join(saida, base, '02_Onda_9x16', '02_Onda_9x16.xml'), 'utf8'), /<width>1080<\/width>\s*<height>1920<\/height>/)

  // juntar em outra ordem: Onda antes de Chegada, num projeto novo (o de antes fica guardado)
  const antes = await pagina.evaluate(() => globalThis.__editor.h.atual.id)
  await pagina.locator('#pecasJuntar').click()
  const folha = pagina.locator('dialog.pecas-juntar')
  await folha.getByRole('button', { name: 'Descer Chegada' }).click()
  await folha.locator('[value="criar"]').click()
  await pagina.waitForFunction((id) => globalThis.__editor.h.atual.id !== id, antes)
  const novo = await pagina.evaluate(() => {
    const p = globalThis.__editor.h.atual
    return { id: p.id, nome: p.nome, clipes: p.linha.clipes.map((c) => [c.ini, c.fim]), marcadores: p.marcadores.map((m) => [m.nome, m.q]) }
  })
  assert.notEqual(novo.id, antes)
  assert.equal(novo.nome, 'onda · nova ordem')
  assert.equal(novo.marcadores[0][0], 'Onda')
  assert.equal(novo.marcadores[1][0], 'Chegada')
  // a Onda (3 s da origem em diante) vem primeiro, depois a Chegada (do começo)
  const q3 = await pagina.evaluate(() => Math.round((3 * globalThis.__editor.h.atual.fps.n) / globalThis.__editor.h.atual.fps.d))
  assert.deepEqual(novo.clipes[0][0], q3)
  assert.equal(novo.clipes.at(-1)[0], 0)
  assert.equal(await pagina.evaluate(() => document.body.dataset.pagina), 'edicao')
  assert.deepEqual(erros, [])
  await pagina.close()
})

/**
 * A NOSSOM falsa (quasar.absolutezro.com e o armazenamento dela): conta com franquia, preparar, receber o som em partes,
 * fila → separando → pronto, as cinco faixas (FLAC de verdade) e liberar. Responde com o CORS da origem do AEON, como
 * products/nossom/lib/server/irmaos.ts. Guarda o que recebeu para o teste conferir.
 */
async function simularNossom(pagina, faixas) {
  const r = { enviados: [], acoes: [], status: 0 }
  const tamanhos = faixas.map((b) => b.length)
  const pacote = Buffer.concat(faixas)
  const cors = (origem) => ({ 'access-control-allow-origin': origem, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'Content-Type', 'access-control-allow-methods': 'GET, POST, PUT', vary: 'Origin' })
  await pagina.route('https://quasar.absolutezro.com/**', async (rota) => {
    const q = rota.request()
    const origem = q.headers().origin || s.url.replace(/\/$/, '')
    const u = new URL(q.url())
    if (q.method() === 'OPTIONS') return rota.fulfill({ status: 204, headers: cors(origem) })
    const json = (corpo, status = 200) => rota.fulfill({ status, headers: { ...cors(origem), 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
    if (u.pathname === '/api/usage') return json({ allowed: true, unlimited: false, remainingSeconds: 3600, planName: 'Estúdio', used: 0, remaining: 3600, limit: 3600, resetAt: '2026-12-01' })
    if (u.pathname === '/api/audio/jobs' && q.method() === 'POST') {
      const corpo = q.postDataJSON()
      r.acoes.push(corpo.action === 'submit' ? `submit:${corpo.preset}` : corpo.action)
      if (corpo.action === 'prepare') return json({ id: '11111111-2222-4333-8444-555555555555', partBytes: 20 * 1024 * 1024, uploadUrls: ['https://teste.supabase.co/storage/v1/object/upload/sign/parte-0?token=x'] })
      if (corpo.action === 'submit') return json({ status: 'queued' })
      return json({ ok: true, status: 'cancelled' })
    }
    if (u.pathname === '/api/audio/jobs' && u.searchParams.get('id')) {
      r.status++
      if (r.status < 2) return json({ status: 'running' })
      return json({
        status: 'completed',
        report: { preset: 'stems-v1', sampleRate: 44100, channels: 2, gainDb: 0, stems: ['voz', 'bateria', 'baixo', 'guitarra', 'outros'].map((name, i) => ({ name, bytes: tamanhos[i] })), totalBytes: pacote.length, chunks: [{ index: 0, bytes: pacote.length }] },
        downloadUrls: ['https://teste.supabase.co/storage/v1/object/sign/pacote?token=y'],
      })
    }
    return json({ error: 'não esperado' }, 404)
  })
  await pagina.route('https://teste.supabase.co/**', async (rota) => {
    const q = rota.request()
    const origem = q.headers().origin || '*'
    if (q.method() === 'OPTIONS') return rota.fulfill({ status: 204, headers: cors(origem) })
    if (q.method() === 'PUT') {
      r.enviados.push(q.postDataBuffer())
      return rota.fulfill({ status: 200, headers: cors(origem), body: '{}' })
    }
    return rota.fulfill({ status: 200, headers: { ...cors(origem), 'content-type': 'application/octet-stream' }, body: pacote })
  })
  return r
}

test('voz e instrumental pelo Quasar (NOSSOM): separar o clipe, Só voz, prévia, vídeo final com a voz e as faixas na entrega', async () => {
  // a pessoa que a NOSSOM atende (o gate dela no HUB)
  const { pagina, erros } = await abrir()
  await pagina.route('**/api/zro/eu', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...PESSOA, irmaos: { nossom: true } }) }))
  await pagina.reload()
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  const { bytes } = await pagina.evaluate(async () => {
    const { videoDeTeste } = await import('/app/autoteste.js')
    const v = await videoDeTeste()
    return { bytes: [...new Uint8Array(await v.arquivo.arrayBuffer())] }
  })
  writeFileSync(join(dir, 'show.mp4'), Buffer.from(bytes))
  // as cinco faixas que a NOSSOM devolve: voz em 440 Hz e bateria em 3 kHz (o resto em silêncio), do tamanho do trecho
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', join(dir, 'show.mp4')]).toString())
  const dur = Number(info.format.duration)
  const flac = (nome, filtro) => {
    const f = join(dir, `${nome}.flac`)
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `${filtro}:sample_rate=44100:duration=${dur}`, '-ac', '2', '-c:a', 'flac', f])
    return readFileSync(f)
  }
  const faixas = [flac('voz', 'sine=frequency=440'), flac('bateria', 'sine=frequency=3000'), flac('baixo', 'anullsrc=channel_layout=stereo'), flac('guitarra', 'sine=frequency=3000'), flac('outros', 'sine=frequency=3000')]
  const nossom = await simularNossom(pagina, faixas)

  await pagina.setInputFiles('#arquivo', join(dir, 'show.mp4'))
  await pagina.locator('.cartao-midia').waitFor()
  await pagina.click('.dock [data-ir="edicao"]')
  await pagina.locator('.clipe').first().click()
  const sec = pagina.locator('.insp-faixas')
  await sec.waitFor()
  assert.match(await sec.innerText(), /Voz e instrumental[\s\S]*Separar[\s\S]*1 min do seu plano Quasar/)

  // separar: a folha diz o que sobe e quanto do plano usa; depois, as duas faixas no clipe
  await sec.getByRole('button', { name: 'Separar' }).click()
  const folha = pagina.locator('dialog.folha-pergunta')
  await folha.waitFor()
  assert.match(await folha.innerText(), /sobe para o Quasar[\s\S]*Usa 1 min do seu plano \(restam 60 min\)/)
  await folha.getByRole('button', { name: 'Separar' }).click()
  await pagina.waitForFunction(() => /Voz e instrumental prontos/.test(document.getElementById('aviso').textContent), null, { timeout: 60_000 })
  // a cópia da NOSSOM é liberada logo depois de guardar as faixas aqui
  for (let i = 0; i < 50 && !nossom.acoes.includes('release'); i++) await new Promise((r) => setTimeout(r, 100))
  assert.deepEqual(nossom.acoes, ['prepare', 'submit:stems-v1', 'release'])
  // o que subiu: um WAV estéreo de 16 bits a 44,1 kHz do trecho inteiro
  const wav = Buffer.concat(nossom.enviados)
  assert.equal(wav.toString('latin1', 0, 4), 'RIFF')
  assert.equal(wav.readUInt32LE(24), 44100)
  assert.ok(Math.abs((wav.length - 44) / (44100 * 4) - dur) < 0.05, `trecho de ${(wav.length - 44) / (44100 * 4)} s`)
  const estado = () => pagina.evaluate(() => ({ sep: globalThis.__editor.h.atual.separacoes, faixas: globalThis.__editor.h.atual.linha.clipes[0].faixas }))
  let e = await estado()
  assert.equal(e.sep.length, 1)
  assert.deepEqual({ voz: e.faixas.voz, instrumental: e.faixas.instrumental }, { voz: 0, instrumental: 0 })
  await sec.locator('.faixa').first().waitFor()
  assert.deepEqual(await sec.locator('.faixa-nome').allInnerTexts(), ['Voz', 'Instrumental'])

  // Só voz: o instrumental fica mudo (o M aceso); desfazer volta; S no instrumental faz o contrário
  await sec.getByRole('radio', { name: 'Só voz' }).click()
  e = await estado()
  assert.deepEqual({ voz: e.faixas.voz, instrumental: e.faixas.instrumental }, { voz: 0, instrumental: null })
  assert.equal(await sec.locator('.faixa[data-faixa="instrumental"] [data-mudo]').getAttribute('aria-pressed'), 'true')
  await pagina.click('#desfazer')
  await pagina.click('#refazer')
  // a prévia carrega as faixas do disco do navegador (a voz e o instrumental prontos para tocar)
  await pagina.waitForFunction(() => globalThis.__editor.h && document.querySelector('.insp-faixas .faixas-aviso')?.hidden !== false)

  // Entrega: o vídeo final sai com a voz (440 Hz) e sem o instrumental (3 kHz); o Premiere ganha o WAV da voz
  await pagina.click('.dock [data-ir="entrega"]')
  for (const d of ['fcpxml', 'resolve']) await pagina.uncheck(`#destinos input[value="${d}"]`)
  await pagina.check('#destinos input[value="video"]')
  const downloads = []
  pagina.on('download', (d) => downloads.push(d))
  await pagina.click('#exportar')
  await pagina.locator('#entregaFim:not([hidden])').waitFor({ timeout: 120_000 })
  const zipArq = join(dir, 'faixas.zip')
  await downloads.find((d) => d.suggestedFilename().endsWith('.zip')).saveAs(zipArq)
  const nomes = execFileSync('zipinfo', ['-1', zipArq]).toString()
  assert.match(nomes, /show - Voz 0s\.wav/)
  assert.doesNotMatch(nomes, /Instrumental/, 'o instrumental mudo não vai')
  const mp4 = join(dir, 'faixas.mp4')
  await downloads.find((d) => d.suggestedFilename().endsWith('.mp4')).saveAs(mp4)
  const medir = (f) => Number(/mean_volume: (-?[\d.]+) dB/.exec(estderr('ffmpeg', ['-v', 'info', '-i', mp4, '-af', `bandpass=f=${f}:width_type=h:w=150,volumedetect`, '-f', 'null', '-']))[1])
  const voz = medir(440)
  const instrumental = medir(3000)
  assert.ok(voz - instrumental > 25, `voz ${voz} dB, instrumental ${instrumental} dB`)
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

test('versão nova (app de desktop): a pílula da barra, Atualizar e o andamento; no navegador não aparece', async () => {
  const { pagina: web } = await abrir()
  assert.equal(await web.isHidden('#atualizacao'), true, 'no navegador não há atualizador')
  await web.close()

  const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } })
  await simularZ(pagina)
  await pagina.route('**/api/zro/eu', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PESSOA) }))
  // a ponte do desktop (desktop/preload.cjs › atualizacao) com um atualizador falso: só o pedaço da atualização
  await pagina.addInitScript(() => {
    const ouvintes = []
    let st = { nova: true, podeAtualizar: true, ultima: { build: 42 }, fase: null, recebido: 0, total: 0, erro: null }
    const mudar = (p) => {
      st = { ...st, ...p }
      for (const f of ouvintes) f(st)
    }
    globalThis.__atualizacao = { mudar, pedidos: [] }
    globalThis.aiEditDesktop = {
      atualizacao: {
        estado: async () => st,
        atualizar: async () => (globalThis.__atualizacao.pedidos.push('atualizar'), mudar({ fase: 'baixando', total: 100 * 1048576 }), st),
        depois: async () => (mudar({ nova: false }), st),
        baixar: async () => globalThis.__atualizacao.pedidos.push('baixar'),
        aoMudar: (f) => ouvintes.push(f),
      },
    }
  })
  await pagina.goto(s.url + 'app/')
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  await pagina.locator('#atualizacao:not([hidden])').waitFor()
  assert.equal(await pagina.textContent('.atualizacao-texto'), 'Versão nova')
  assert.equal(await pagina.textContent('.atualizacao-botao'), 'Atualizar')
  await pagina.click('.atualizacao-botao')
  await pagina.evaluate(() => globalThis.__atualizacao.mudar({ recebido: 42 * 1048576 }))
  assert.equal(await pagina.textContent('.atualizacao-texto'), 'Baixando 42%')
  assert.equal(await pagina.isHidden('.atualizacao-botao'), true)
  assert.equal(await pagina.getAttribute('.atualizacao-barra', 'aria-valuenow'), '42')
  // a barra não volta para trás (nada de salto)
  await pagina.evaluate(() => globalThis.__atualizacao.mudar({ recebido: 10 * 1048576 }))
  assert.equal(await pagina.getAttribute('.atualizacao-barra', 'aria-valuenow'), '42')
  if (process.env.AIEDIT_TELAS) await pagina.screenshot({ path: process.env.AIEDIT_TELAS + '/app-atualizando.png', clip: { x: 0, y: 0, width: 1440, height: 120 } })
  await pagina.evaluate(() => globalThis.__atualizacao.mudar({ fase: 'erro', erro: 'O download não terminou.', recebido: 0 }))
  assert.equal(await pagina.textContent('.atualizacao-botao'), 'Tentar de novo')
  await pagina.click('.atualizacao-depois')
  assert.equal(await pagina.isHidden('#atualizacao'), true)
  assert.deepEqual(await pagina.evaluate(() => globalThis.__atualizacao.pedidos), ['atualizar'])
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

test('página inicial fechada ao público: a Z "Chegando ao AEON", Testar ao vivo é âncora e nada leva ao editor', async () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const pagina = await navegador.newPage({ viewport })
    const erros = []
    pagina.on('pageerror', (e) => erros.push(e.message))
    // o 401 de /api/zro/eu (visitante sem conta) é esperado: o navegador o anota no console
    pagina.on('console', (m) => m.type() === 'error' && !/status of 401/.test(m.text()) && erros.push(m.text()))
    await pagina.route('**/api/zro/eu', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' }))
    await pagina.goto(s.url)
    const sec = pagina.locator('#z')
    assert.match(await sec.innerText(), /Chegando ao AEON/)
    assert.equal(await sec.getByRole('link', { name: 'Conversar com a Z' }).count(), 0)
    assert.equal(await sec.getByRole('link', { name: 'Conhecer a Z' }).getAttribute('href'), 'https://absolutezro.com/ia')
    // nenhum link do site leva ao editor, ao download ou ao instalador
    const hrefs = await pagina.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))
    assert.deepEqual(
      hrefs.filter((h) => /^app\/|\/app\/|baixar|instalar/.test(h)),
      [],
    )
    assert.ok(hrefs.includes('#produto'), 'Conhecer o AEON é âncora')
    // no celular a barra esconde o atalho; no HTML são quatro (barra, menu, abertura e fim), todos âncora para o teste ao vivo
    assert.deepEqual(await pagina.$$eval('a', (as) => as.filter((a) => a.textContent.trim() === 'Testar ao vivo').map((a) => a.getAttribute('href'))), ['#testar', '#testar', '#testar', '#testar'])
    // a seção entra com a rolagem (ao-rolar): o texto existe antes de aparecer
    assert.match(await pagina.locator('#em-desenvolvimento').textContent(), /Em desenvolvimento[\s\S]*Ainda sem download/)
    assert.equal(await pagina.locator('.fim').getByRole('link', { name: 'Voltar ao HUB' }).getAttribute('href'), 'https://absolutezro.com/inicio')
    // o caminho do ecossistema aponta para a apresentação, não para o editor
    assert.equal(await pagina.locator('#caminho a.eu').getAttribute('href'), '#produto')
    await pagina.evaluate(() => scrollTo(0, document.body.scrollHeight))
    const largura = await pagina.evaluate(() => document.documentElement.scrollWidth)
    assert.ok(largura <= viewport.width, `rolagem horizontal: ${largura}px`)
    assert.deepEqual(erros, [])
    await pagina.close()
  }
})

test('teste ao vivo: cortes, legenda, zoom e entrega reagem; Por dentro troca a tela; perguntas abrem uma por vez', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  pagina.on('console', (m) => m.type() === 'error' && !/status of 401/.test(m.text()) && erros.push(m.text()))
  await pagina.route('**/api/zro/eu', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' }))
  await pagina.goto(s.url)
  await pagina.locator('#testar').scrollIntoViewIfNeeded()
  const est = pagina.locator('#estudio')
  // o exemplo toca sozinho enquanto aparece
  const t0 = await pagina.locator('#visorTempo').innerText()
  await pagina.waitForFunction((t) => document.querySelector('#visorTempo').textContent !== t, t0)
  // velocidade (a aba que abre): Herói, a onda (take de câmera de verdade) na velocidade da curva, Bala muda a duração,
  // teclado no ponto
  assert.equal(await est.getByRole('tab', { name: 'Velocidade' }).getAttribute('aria-selected'), 'true')
  assert.equal(await est.getByRole('radio', { name: 'Herói' }).getAttribute('aria-checked'), 'true')
  const durHeroi = await pagina.locator('#rampaDuracao').innerText()
  await est.getByRole('radio', { name: 'Bala' }).click()
  assert.notEqual(await pagina.locator('#rampaDuracao').innerText(), durHeroi)
  await pagina.locator('.curva-ponto').nth(1).focus()
  const antes = await pagina.locator('#rampaDuracao').innerText()
  await pagina.keyboard.press('ArrowDown')
  assert.notEqual(await pagina.locator('#rampaDuracao').innerText(), antes, 'mais lento, mais longo')
  assert.equal(await est.getByRole('radio', { name: 'Bala' }).getAttribute('aria-checked'), 'false', 'curva própria')
  // o take: o Cavalo (50 qps) troca o vídeo e a duração de origem; a curva fica
  await est.getByRole('radio', { name: 'Cavalo' }).click()
  assert.equal(await est.getByRole('radio', { name: 'Cavalo' }).getAttribute('aria-checked'), 'true')
  await pagina.waitForFunction(() => /cenas\/cavalo\.mp4$/.test(document.querySelector('#visorVideo').currentSrc))
  await pagina.waitForFunction(() => document.querySelector('#rampaAntes').textContent === 'de 7,0 s')
  assert.equal(await est.getByRole('radio', { name: 'Bala' }).getAttribute('aria-checked'), 'false', 'a curva própria continua')
  // cortes: 0,45 s marca as duas pausas maiores; aprovar tira 1,7 s; desfazer devolve
  await est.getByRole('tab', { name: 'Cortes' }).click()
  assert.equal(await pagina.locator('#aprovarCortes').innerText(), 'Aprovar 2 cortes')
  assert.equal(await pagina.locator('.celula.pausa.marcada').count(), 2)
  await pagina.click('#aprovarCortes')
  await pagina.waitForFunction(() => document.querySelector('#duracaoAgora').textContent === '18,8 s')
  assert.equal(await pagina.locator('#duracaoGanho').innerText(), '−1,7 s')
  await pagina.locator('#limiar').fill('0.2')
  await pagina.waitForFunction(() => document.querySelector('#duracaoAgora').textContent === '17,9 s')
  // entrega: 6 clipes depois de tirar as 5 pausas, zoom de 122% no efeito Movimento do Premiere
  await est.getByRole('tab', { name: 'Entrega' }).click()
  await pagina.getByRole('radio', { name: /Premiere Pro/ }).click()
  const pacote = await pagina.locator('#pacote').innerText()
  assert.match(pacote, /Entrevista\.xml/)
  assert.match(pacote, /6 clipes na linha do tempo/)
  assert.match(pacote, /Zoom de 122% no efeito Movimento/)
  // zoom: sem zoom, a entrega não fala de zoom e a faixa roxa some
  await est.getByRole('tab', { name: 'Zoom' }).click()
  await pagina.getByRole('radio', { name: 'Sem zoom' }).click()
  assert.equal(await pagina.locator('#estudio.com-zoom').count(), 0)
  await est.getByRole('tab', { name: 'Entrega' }).click()
  assert.doesNotMatch(await pagina.locator('#pacote').innerText(), /Zoom/)
  // legenda: setas do teclado trocam o estilo
  await est.getByRole('tab', { name: 'Legenda' }).click()
  await pagina.getByRole('radio', { name: 'Destaque' }).focus()
  await pagina.keyboard.press('ArrowRight')
  assert.equal(await pagina.locator('#visorLegenda').getAttribute('data-estilo'), 'pop')
  // desfazer os cortes volta aos 20,5 s
  await est.getByRole('tab', { name: 'Cortes' }).click()
  await pagina.click('#desfazerCortes')
  await pagina.waitForFunction(() => document.querySelector('#duracaoAgora').textContent === '20,5 s')
  // além do tempo: a montagem feita no AEON toca ao aparecer; a linha mostra os cinco takes com a curva de cada um, a
  // cabeça anda com o vídeo e o número é a velocidade do quadro; o botão pausa
  await pagina.locator('#montagem').scrollIntoViewIfNeeded()
  await pagina.locator('.montagem-clipe').nth(4).waitFor()
  assert.deepEqual(await pagina.locator('.montagem-clipe span').allTextContents(), ['Vale', 'Herói', 'Bala', 'Arrancada', 'Montagem'])
  await pagina.waitForFunction(() => document.querySelector('#montagemVideo').currentTime > 0.5)
  assert.match(await pagina.locator('#montagemVel').innerText(), /^\d+%$/)
  assert.equal(await pagina.locator('.montagem-clipe.agora').count(), 1)
  await pagina.click('#montagemPlay')
  assert.equal(await pagina.getAttribute('#montagemPlay', 'aria-label'), 'Tocar')
  assert.equal(await pagina.evaluate(() => document.querySelector('#montagemVideo').paused), true)
  // Por dentro: a Velocidade com os takes de verdade; escolher a tela para de trocar sozinho
  await pagina.getByRole('tab', { name: /Velocidade Uma curva por take/ }).click()
  assert.equal(await pagina.locator('#tela-velocidade.ativa').count(), 1)
  await pagina.getByRole('tab', { name: /Entrega Para o seu editor/ }).click()
  assert.equal(await pagina.locator('#tela-entrega.ativa').count(), 1)
  assert.equal(await pagina.locator('#explorar.sozinho').count(), 0)
  // perguntas: uma aberta por vez
  await pagina.getByRole('button', { name: 'Preciso usar a IA?' }).click()
  await pagina.getByRole('button', { name: 'Funciona com o meu editor?' }).click()
  assert.equal(await pagina.locator('#faq [aria-expanded="true"]').count(), 1)
  assert.match(await pagina.locator('#r4').innerText(), /Premiere Pro \(\.xml\)/)
  await pagina.getByRole('button', { name: 'Tem speed ramp?' }).click()
  assert.match(await pagina.locator('#r7').innerText(), /10% a 800%/)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('em-desenvolvimento.html: a página neutra (titular, 01/11/2026), sem marca nem nome do AEON, no computador e no celular', async () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const pagina = await navegador.newPage({ viewport })
    const erros = []
    pagina.on('pageerror', (e) => erros.push(e.message))
    pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
    const r = await pagina.goto(s.url + 'em-desenvolvimento.html')
    assert.equal(r.status(), 200)
    assert.match(r.headers()['content-security-policy'], /default-src 'self'/)
    assert.equal(await pagina.title(), 'Absolute ZRO')
    assert.equal(await pagina.getByRole('heading', { level: 1 }).innerText(), 'Página indisponível.')
    assert.equal(await pagina.getByRole('link', { name: 'Ir para a Absolute ZRO' }).getAttribute('href'), 'https://absolutezro.com')
    assert.doesNotMatch(await pagina.locator('body').innerText(), /AEON|desenvolvimento/i)
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(245, 245, 247)')
    const largura = await pagina.evaluate(() => document.documentElement.scrollWidth)
    assert.ok(largura <= viewport.width, `rolagem horizontal: ${largura}px`)
    assert.deepEqual(erros, [])
    await pagina.close()
  }
})

test('entrar.html com a conta fechada pelo HUB (403): "Em desenvolvimento", Voltar ao HUB e Sair; o editor não abre', async () => {
  const pagina = await navegador.newPage()
  await pagina.route('**/api/zro/eu', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, fechado: true, hub: 'https://absolutezro.com/inicio', pagina: '/em-desenvolvimento.html' }) }))
  await pagina.goto(s.url + 'entrar.html')
  await pagina.locator('#fechado:not([hidden])').waitFor()
  assert.equal(await pagina.locator('#fechado').getByRole('link', { name: 'Voltar ao HUB' }).getAttribute('href'), 'https://absolutezro.com/inicio')
  assert.equal(await pagina.locator('#dentro').isHidden(), true)
  assert.equal(await pagina.locator('#fora').isHidden(), true)
  // o editor servido (como no app de computador ou no dev) manda para a página, sem montar nada
  await pagina.goto(s.url + 'app/')
  await pagina.waitForURL(/em-desenvolvimento\.html$/)
  await pagina.close()
})

/** A Higgsfield das Conexões, pelo HUB (o repasse /api/zro/higgsfield*), o envio e a CDN dela, de mentira. */
async function simularHiggsfield(pagina, { png, mp4, conectada = true }) {
  const r = { pedidos: [], enviados: [], baixados: [] }
  const h = { saldo: 120, usado: 0, pedidos: [] }
  const opcoes = (longo) => [
    { id: 'rapido', nome: 'Rápido', desc: 'Prévia ágil para testar a ideia', segundos: longo ? 10 : 5, creditos: longo ? 8 : 4 },
    { id: 'equilibrado', nome: 'Equilibrado', desc: 'Movimento de cinema, ótimo custo', segundos: longo ? 10 : 5, creditos: longo ? 20 : 10 },
    { id: 'maximo', nome: 'Máxima qualidade', desc: 'Mais detalhe, física e acabamento', segundos: longo ? 10 : 5, creditos: longo ? 44 : 22 },
  ]
  await pagina.route('**/api/zro/higgsfield**', async (rota) => {
    const q = rota.request()
    const u = new URL(q.url())
    const json = (corpo, status = 200) => rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) })
    r.pedidos.push({ metodo: q.method(), caminho: u.pathname, busca: u.search, corpo: q.method() === 'POST' ? q.postDataJSON() : null })
    if (!conectada) return json({ error: 'sem_conexao', message: 'Conecte a Higgsfield na sua conta Absolute ZRO.', details: { motivo: 'nenhuma', conectar: 'https://absolutezro.com/conexoes', provedor: 'higgsfield' } }, 409)
    if (u.pathname === '/api/zro/higgsfield') {
      return json({ conectada: true, conta: 'lia@higgsfield.test', plano: 'creator', saldo: h.saldo, usoMes: h.usado, usoApp: { mes: h.usado, pedidos: h.pedidos.length, total: h.usado }, usoApps: h.usado, imagens: [1, 2, 4].map((n) => ({ quantidade: n, creditos: 1.5 * n })), opcoes: opcoes(u.searchParams.get('duracao') === 'longo') })
    }
    if (q.method() === 'GET') {
      const x = h.pedidos.find((p) => p.id === u.searchParams.get('id'))
      x.leituras++
      const pronto = x.leituras >= 2
      return json({ estado: pronto ? 'pronto' : 'gerando', saida: x.saida, urls: pronto ? Array.from({ length: x.n }, (_, i) => `https://d1.cloudfront.net/aeon/${x.id}-${i}.${x.saida === 'video' ? 'mp4' : 'png'}`) : [], erro: null })
    }
    const d = q.postDataJSON()
    if (d.acao === 'envio') return json({ upload_url: 'https://upload.higgsfield.ai/aeon/ref.jpg?assinado=1', headers: { 'Content-Type': d.tipo }, ref: '0b9d7f3e-1c2a-4e5b-8f6a-7d8c9e0f1a2b' })
    const custo = d.acao === 'telas' ? 1.5 * d.quantidade : opcoes(d.duracao === 'longo').find((o) => o.id === d.opcao).creditos
    h.saldo -= custo
    h.usado += custo
    const id = `p${String(h.pedidos.length + 1).padStart(11, '0')}`
    h.pedidos.push({ id, saida: d.acao === 'telas' ? 'imagem' : 'video', n: d.acao === 'telas' ? d.quantidade : 1, leituras: 0 })
    return json({ id, estado: 'na_fila', creditos: custo })
  })
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, PUT', 'access-control-allow-headers': 'content-type' }
  await pagina.route('https://upload.higgsfield.ai/**', async (rota) => {
    const q = rota.request()
    if (q.method() === 'OPTIONS') return rota.fulfill({ status: 200, headers: cors })
    r.enviados.push({ tipo: q.headers()['content-type'], bytes: q.postDataBuffer() })
    return rota.fulfill({ status: 200, headers: cors, body: '' })
  })
  await pagina.route('https://d1.cloudfront.net/**', async (rota) => {
    const u = rota.request().url()
    r.baixados.push(u)
    const video = u.endsWith('.mp4')
    return rota.fulfill({ status: 200, headers: { ...cors, 'content-type': video ? 'video/mp4' : 'image/png' }, body: video ? mp4 : png })
  })
  return r
}

test('Criar com IA (Higgsfield): créditos, telas antes, a tela na Mídia, animar o quadro atual e pôr na linha', async () => {
  const { pagina, erros } = await abrir()
  const { bytes } = await pagina.evaluate(async () => {
    const { videoDeTeste } = await import('/app/autoteste.js')
    const v = await videoDeTeste()
    return { bytes: [...new Uint8Array(await v.arquivo.arrayBuffer())] }
  })
  const mp4 = Buffer.from(bytes)
  writeFileSync(join(dir, 'criar.mp4'), mp4)
  const pngArq = join(dir, 'tela.png')
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x3a6ea5:s=640x360', '-frames:v', '1', pngArq])
  const hf = await simularHiggsfield(pagina, { png: readFileSync(pngArq), mp4 })
  await pagina.setInputFiles('#arquivo', join(dir, 'criar.mp4'))
  await pagina.locator('.cartao-midia').waitFor()

  // a folha abre pela Mídia com os créditos: saldo, plano, o medidor do mês e o preço das três opções
  assert.equal(await pagina.locator('#criarIA').isVisible(), true)
  await pagina.click('#criarIA')
  const folha = pagina.locator('#folhaCriar')
  await folha.locator('[data-saldo]').filter({ hasText: '120' }).waitFor()
  assert.match(await folha.locator('[data-plano]').innerText(), /créditos · creator/)
  assert.match(await folha.locator('[data-uso]').innerText(), /0 usados no AEON este mês/)
  assert.deepEqual(await folha.locator('.criar-opcao .criar-preco').allInnerTexts(), ['4', '10', '22'])
  const painel = hf.pedidos.find((p) => p.caminho === '/api/zro/higgsfield')
  assert.equal(new URLSearchParams(painel.busca).get('proporcao'), '16:9')

  // passo 1: sem descrição não gera; 1 tela mostra o preço no botão; a tela chega e já fica escolhida
  const gerarTelas = folha.locator('[data-acao="telas"]')
  assert.equal(await gerarTelas.isDisabled(), true)
  await folha.locator('[data-prompt]').fill('Rua de neon à noite, chuva fina')
  await folha.locator('[data-qtd] [data-n="1"]').click()
  assert.equal(await gerarTelas.innerText(), 'Gerar 1 tela · 1,5')
  await gerarTelas.click()
  await folha.locator('.criar-tela img').waitFor()
  const telas = hf.pedidos.find((p) => p.corpo?.acao === 'telas')
  assert.deepEqual(telas.corpo, { acao: 'telas', prompt: 'Rua de neon à noite, chuva fina', quantidade: 1, proporcao: '16:9' })
  assert.equal(await folha.locator('.criar-tela').getAttribute('aria-checked'), 'true')
  // o saldo de agora volta da Higgsfield depois do pedido, e o uso do AEON sobe
  await folha.locator('[data-saldo]').filter({ hasText: '118,5' }).waitFor()
  assert.match(await folha.locator('[data-uso]').innerText(), /1,5 usados no AEON este mês/)

  // a tela vai para a Mídia como clipe parado de 5 s (não para a linha), guardada no disco do navegador
  const linhaAntes = await pagina.evaluate(() => globalThis.__editor.h.atual.linha.clipes.length)
  await folha.locator('[data-por="0"]').click()
  await pagina.waitForFunction(() => globalThis.__editor.h.atual.midias.length === 2, null, { timeout: 60_000 })
  const parada = await pagina.evaluate(async () => {
    const m = globalThis.__editor.h.atual.midias[1]
    const { ler } = await import('/app/criadas-disco.js')
    const b = await ler(m.id)
    return { nome: m.nome, duracao: m.duracao, temVideo: m.temVideo, temAudio: m.temAudio, origem: m.origem, largura: m.largura, guardado: b?.size || 0, linha: globalThis.__editor.h.atual.linha.clipes.length }
  })
  assert.equal(parada.nome, 'IA · Rua de neon à noite, chuva fina.mp4')
  assert.ok(Math.abs(parada.duracao - 5) < 0.1, `parada de ${parada.duracao} s`)
  assert.deepEqual([parada.temVideo, parada.temAudio, parada.largura, parada.origem.tipo, parada.origem.saida], [true, false, 640, 'higgsfield', 'imagem'])
  assert.ok(parada.guardado > 1000)
  assert.equal(parada.linha, linhaAntes)
  assert.equal(await folha.locator('[data-por="0"]').innerText(), 'Na Mídia')
  await folha.locator('[data-acao="fechar"]').click()

  // passo 2 pela Edição: o botão do player parte do quadro atual; o vídeo pergunta antes de gastar
  await pagina.click('.dock [data-ir="edicao"]')
  await pagina.click('#criarDoQuadro')
  await folha.locator('[data-saldo]').filter({ hasText: '118,5' }).waitFor()
  assert.equal(await folha.locator('[data-ref]').isChecked(), true)
  await folha.locator('[data-base-dica]').filter({ hasText: 'A partir do quadro atual' }).waitFor()
  const animar = folha.locator('[data-acao="animar"]')
  await folha.locator('[data-movimento]').fill('A câmera sobe devagar')
  await folha.locator('.criar-opcao[data-opcao="rapido"]').click()
  assert.equal(await animar.innerText(), 'Animar · 4')
  await animar.click()
  const pergunta = pagina.locator('dialog.folha-pergunta')
  await pergunta.waitFor()
  assert.match(await pergunta.innerText(), /Animar em Rápido\?[\s\S]*5 s de vídeo\. Usa 4 dos seus 118,5 créditos da Higgsfield\./)
  await pergunta.getByRole('button', { name: 'Animar' }).click()
  await pagina.waitForFunction(() => /O vídeo entrou na Mídia/.test(document.getElementById('aviso').textContent), null, { timeout: 60_000 })
  // o quadro subiu direto para o envio da Higgsfield, em JPEG; o pedido levou a referência dele
  assert.equal(hf.enviados.length, 1)
  assert.equal(hf.enviados[0].tipo, 'image/jpeg')
  assert.equal(hf.enviados[0].bytes.subarray(0, 2).toString('hex'), 'ffd8')
  const pedidoVideo = hf.pedidos.find((p) => p.corpo?.acao === 'animar')
  assert.deepEqual(pedidoVideo.corpo, { acao: 'animar', prompt: 'A câmera sobe devagar', opcao: 'rapido', duracao: 'curto', ref: '0b9d7f3e-1c2a-4e5b-8f6a-7d8c9e0f1a2b' })
  const video = await pagina.evaluate(() => globalThis.__editor.h.atual.midias[2])
  assert.deepEqual([video.nome, video.origem.saida, video.temVideo], ['IA · A câmera sobe devagar.mp4', 'video', true])

  // pôr na linha: entra no cursor, e o Desfazer devolve
  const antes = await pagina.evaluate(() => globalThis.__editor.h.atual.linha.clipes.map((c) => c.midia))
  await folha.locator('[data-feitos] button').filter({ hasText: 'Pôr na linha' }).click()
  const depois = await pagina.evaluate(() => globalThis.__editor.h.atual.linha.clipes.map((c) => c.midia))
  assert.equal(depois.length >= antes.length + 1, true)
  assert.ok(depois.includes(video.id))
  // nada fora da Higgsfield foi baixado
  assert.ok(hf.baixados.every((u) => u.startsWith('https://d1.cloudfront.net/aeon/')))
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('Criar com IA sem a Higgsfield nas Conexões: a folha diz para conectar na conta Absolute ZRO, sem gastar nada', async () => {
  const { pagina, erros } = await abrir()
  const { bytes } = await pagina.evaluate(async () => {
    const { videoDeTeste } = await import('/app/autoteste.js')
    const v = await videoDeTeste()
    return { bytes: [...new Uint8Array(await v.arquivo.arrayBuffer())] }
  })
  writeFileSync(join(dir, 'criar2.mp4'), Buffer.from(bytes))
  const hf = await simularHiggsfield(pagina, { png: Buffer.alloc(0), mp4: Buffer.alloc(0), conectada: false })
  await pagina.setInputFiles('#arquivo', join(dir, 'criar2.mp4'))
  await pagina.locator('.cartao-midia').waitFor()
  await pagina.click('#criarIA')
  const folha = pagina.locator('#folhaCriar')
  await folha.locator('.criar-aviso:not([hidden])').waitFor()
  assert.equal(await folha.locator('[data-aviso]').innerText(), 'Conecte a Higgsfield na sua conta Absolute ZRO.')
  const conectar = folha.locator('[data-acao="conectar"]')
  assert.equal(await conectar.innerText(), 'Conectar')
  assert.equal(await conectar.getAttribute('href'), 'https://absolutezro.com/conexoes')
  assert.equal(await folha.locator('.criar-corpo').isHidden(), true)
  assert.ok(hf.pedidos.every((p) => p.metodo === 'GET'))
  // "Já conectei" lê de novo
  const n = hf.pedidos.length
  await folha.locator('[data-acao="recarregar"]').click()
  await pagina.waitForFunction((k) => true, n)
  assert.ok(hf.pedidos.length >= n)
  assert.deepEqual(erros.filter((e) => !/409/.test(e)), [])
  await pagina.close()
})
