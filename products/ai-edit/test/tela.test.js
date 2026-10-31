// Telas no Chromium de verdade, com os mesmos cabeçalhos do app de desktop (CSP, isolamento entre origens):
// autoteste (gravar → ler → silêncio → cortes → exportar → render), o caminho inteiro de quem usa (importar →
// analisar → revisar e desfazer → editar com cor, etiqueta, Inspector, marcador e Histórico → corrigir palavra →
// exportar e renderizar → autosave em Seus universos → reabrir), o projeto novo com formato e o Whisper
// de verdade carregando no navegador. A transcrição do caminho de uso é falsa (um worker trocado pela rota), para o
// teste não depender de fala gravada; a de verdade tem o teste próprio no fim (precisa de internet uma vez).
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { CABECALHOS_SITE, servir } from '../scripts/servidor.mjs'
import { simularZ } from './z-falso.js'
import { simularSet } from './set-falso.js'
import { FAMILIA } from '../src/familia.js'

const { chromium } = createRequire(import.meta.url)('playwright')
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
  // a família de src/familia.js (7 hoje; 8 com o Maestro no lançamento, MAESTRO_NA_FAMILIA)
  assert.equal(await pagina.locator('#trilhoApps .familia-app').count(), FAMILIA.length)
  await pagina.context().route('https://sobedesce.vercel.app/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }))
  const [aba] = await Promise.all([pagina.context().waitForEvent('page'), pagina.locator('#trilhoApps .familia-app', { hasText: 'SOBEDESCE' }).click()])
  assert.match(aba.url(), /^https:\/\/sobedesce\.vercel\.app/)
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

test('página inicial fechada ao público: a Z "Chegando ao AEON", Conhecer o projeto é âncora e nada leva ao editor', async () => {
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
    assert.ok(hrefs.includes('#produto'), 'Conhecer o projeto é âncora')
    // no celular a barra esconde o atalho; no HTML são três (barra, abertura e fim), todos âncora
    assert.deepEqual(await pagina.$$eval('a', (as) => as.filter((a) => a.textContent.trim() === 'Conhecer o projeto').map((a) => a.getAttribute('href'))), ['#produto', '#produto', '#produto'])
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

test('em-desenvolvimento.html: símbolo, marca do AEON, título, uma linha e Voltar ao HUB, nos dois temas e no celular', async () => {
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
    await pagina.locator('.fechado-produto [data-marca="nome"] svg').waitFor()
    assert.equal(await pagina.locator('.fechado-zro svg').count(), 1)
    assert.equal(await pagina.getByRole('heading', { level: 1 }).innerText(), 'Em desenvolvimento.')
    assert.equal(await pagina.locator('.fechado p').count(), 1)
    const botao = pagina.getByRole('link', { name: 'Voltar ao HUB' })
    assert.equal(await botao.getAttribute('href'), 'https://absolutezro.com/inicio')
    assert.ok(await botao.evaluate((b) => b.classList.contains('glass-btn--ink')))
    // Figtree fino × pesado, só na cor do texto (nada azul, nada em degradê)
    await pagina.evaluate(() => document.fonts.ready)
    assert.ok(await pagina.evaluate(() => document.fonts.check('300 40px Figtree') && document.fonts.check('800 40px Figtree')))
    const pesos = await pagina.evaluate(() => [getComputedStyle(document.querySelector('.fechado .fino')).fontWeight, getComputedStyle(document.querySelector('.fechado .forte')).fontWeight])
    assert.deepEqual(pesos, ['300', '800'])
    // o escuro é o ambiente do AEON (site/tema.js); o claro vem da escolha guardada
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(0, 0, 0)')
    await pagina.evaluate(() => localStorage.setItem('zro-tema', 'light'))
    await pagina.reload()
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(245, 245, 247)')
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.querySelector('h1')).color), 'rgb(29, 29, 31)')
    await pagina.evaluate(() => localStorage.removeItem('zro-tema'))
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
