// O RADION de ponta a ponta no Chromium, com três pessoas (modo local, Postgres de verdade, microfone falso do
// Chromium, que toca um bipe): Ana (dona, Direção) cria a diária, Bia entra pelo código e fica na Direção, Caio entra e
// fica na Câmera. Confere que a voz chega de verdade (nível do áudio recebido), que o canal de um setor só chega a quem
// o ouve, que o Geral chega a todos, que o aviso de set aparece na tela dos outros e o silêncio: Gravando cala o set
// (menos a Direção) até o Corta, e a dona silencia o Caio, que vê quem silenciou e pede a palavra.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import postgres from 'postgres'
import { semPostgres, subirPostgres } from './banco-apoio.js'

let chromium = null
try {
  ;({ chromium } = await import('playwright'))
} catch {
  chromium = null
}
const pular = semPostgres || (!chromium && 'sem Playwright')
let pg, servidor, navegador, base

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(`create role radio login password 'teste'; create role radio_app nologin; grant radio_app to radio with admin option; create schema radio authorization radio;`)
  await admin.end()
  const url = pg.url.replace('postgres://postgres@', 'postgres://radio:teste@')
  process.env.RADIO_DATABASE_URL = url
  process.env.RADIO_LOCAL = '1'
  delete process.env.ZRO_CLIENT_ID
  delete process.env.ZRO_CLIENT_SECRET
  await (await import('../scripts/migrar.mjs')).migrar(url)
  const { execFileSync } = await import('node:child_process')
  execFileSync(process.execPath, [new URL('../publicar.mjs', import.meta.url).pathname], { stdio: 'pipe' })
  const { servir } = await import('../scripts/servir.mjs')
  servidor = await servir({ porta: 0 })
  base = `http://localhost:${servidor.address().port}`
  navegador = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'],
  })
})
after(async () => {
  await navegador?.close()
  await new Promise((ok) => (servidor ? servidor.close(ok) : ok()))
  await (await import('../api/_banco.js')).fecharBanco()
  await pg?.fechar()
})

async function pessoa(nome) {
  const ctx = await navegador.newContext({ permissions: ['microphone'] })
  const page = await ctx.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  await page.goto(base)
  await page.fill('#local-nome', nome)
  await page.click('#local button')
  await page.waitForSelector('#pg-inicio:not([hidden])')
  return { page, erros }
}

/** Nível (RMS) do áudio que chega de outros aparelhos agora, somando todas as conexões. */
const nivel = (page) =>
  page.evaluate(async () => {
    const C = window.__medidor || (window.__medidor = new AudioContext())
    await C.resume()
    let maior = 0
    for (const a of document.querySelectorAll('audio')) {
      if (!a.srcObject) continue
      const fonte = C.createMediaStreamSource(a.srcObject)
      const an = C.createAnalyser()
      an.fftSize = 2048
      fonte.connect(an)
      await new Promise((ok) => setTimeout(ok, 350))
      const buf = new Float32Array(an.fftSize)
      an.getFloatTimeDomainData(buf)
      fonte.disconnect()
      maior = Math.max(maior, Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length))
    }
    return maior
  })

const esperarNivel = async (page, acima, ms = 6000) => {
  const fim = Date.now() + ms
  let n = 0
  while (Date.now() < fim) {
    n = await nivel(page)
    if (acima ? n > 0.005 : n < 0.001) return n
  }
  return n
}

test('três pessoas: setor, canal por faixa, segurar e travar o TALK, deixar de ouvir, Todos e aviso', { skip: pular, timeout: 120000 }, async () => {
  const ana = await pessoa('Ana')
  await ana.page.click('.item[data-ir="diarias"]')
  await ana.page.fill('#criar-nome', 'Comercial')
  await ana.page.click('#criar button')
  await ana.page.waitForSelector('#noar:not([hidden])')
  const codigo = (await ana.page.textContent('#codigo')).trim()
  assert.match(codigo, /^[A-Z2-9]{6}$/)
  // quem criou já está na Direção: não pergunta o setor
  assert.equal(await ana.page.isVisible('#setor-folha'), false)

  const bia = await pessoa('Bia')
  await bia.page.goto(`${base}/?d=${codigo}`) // o link do QR
  await bia.page.waitForSelector('#setor-folha[open]')
  await bia.page.click('#setores [data-canal="direcao"]')
  const caio = await pessoa('Caio')
  await caio.page.click('.item[data-ir="diarias"]')
  await caio.page.fill('#entrar-codigo', codigo.toLowerCase())
  await caio.page.click('#entrar button')
  await caio.page.waitForSelector('#setor-folha[open]')
  await caio.page.click('#setores [data-canal="camera"]')

  for (const p of [bia, caio]) await p.page.waitForFunction(() => !document.getElementById('setor-folha').open)
  for (const p of [ana, bia, caio]) await p.page.click('#ligar-btn')
  // o seu setor vem logo depois do Geral, marcado "Seu"
  assert.deepEqual(await caio.page.$$eval('.canal', (fs) => fs.slice(0, 2).map((f) => f.dataset.canal)), ['geral', 'camera'])
  // a equipe fala no próprio setor, não no Geral
  assert.equal(await caio.page.isDisabled('[data-alvo="geral"]'), true)
  assert.equal((await caio.page.textContent('#alvo-nome')).trim(), 'Câmera')
  assert.equal(await caio.page.getAttribute('[data-ouvir="camera"]', 'aria-pressed'), 'true')
  assert.equal(await caio.page.getAttribute('[data-ouvir="direcao"]', 'aria-pressed'), 'false')

  // todos ligados com todos
  for (const p of [ana, bia, caio]) await p.page.waitForFunction(() => document.querySelectorAll('#pessoas .pessoa[data-estado="ligado"]').length === 3, null, { timeout: 30000 })
  assert.ok((await esperarNivel(bia.page, false)) < 0.001)

  const caixa = await (await ana.page.$('#ptt')).boundingBox()
  const segurar = async () => {
    await ana.page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
    await ana.page.mouse.down()
    await ana.page.waitForTimeout(400) // segurou: push-to-talk
  }

  // Ana fala para a Direção (segurando): Bia ouve, Caio (Câmera) não
  await ana.page.click('[data-alvo="direcao"]')
  assert.equal((await ana.page.textContent('#alvo-nome')).trim(), 'Direção')
  await segurar()
  assert.equal(await ana.page.getAttribute('#ptt', 'data-estado'), 'ptt')
  await bia.page.waitForFunction(() => document.getElementById('no-ar').textContent.includes('Ana'))
  assert.match(await bia.page.textContent('#no-ar'), /Ana · Direção/)
  await bia.page.waitForSelector('.canal[data-canal="direcao"].is-no-ar')
  assert.ok((await esperarNivel(bia.page, true)) > 0.005, 'Bia ouve a Ana')
  assert.ok((await esperarNivel(caio.page, false, 2500)) < 0.001, 'Caio (Câmera) não recebe a fala da Direção')
  await ana.page.mouse.up()
  assert.equal(await ana.page.getAttribute('#ptt', 'data-estado'), 'mudo')
  await bia.page.waitForFunction(() => document.getElementById('no-ar').textContent === '')
  assert.ok((await esperarNivel(bia.page, false)) < 0.001, 'soltou: silêncio')

  // um toque trava o TALK aberto no Geral: Caio ouve sem ninguém segurar; outro toque fecha
  await ana.page.click('[data-alvo="geral"]')
  await ana.page.click('#ptt')
  assert.equal(await ana.page.getAttribute('#ptt', 'data-estado'), 'aberto')
  assert.ok((await esperarNivel(caio.page, true)) > 0.005, 'Caio ouve no Geral com o TALK aberto')
  await ana.page.click('#ptt')
  assert.equal(await ana.page.getAttribute('#ptt', 'data-estado'), 'mudo')
  assert.ok((await esperarNivel(caio.page, false)) < 0.001)

  // Caio deixa de ouvir o Geral: a fala do Geral não chega mais a ele
  await caio.page.click('[data-ouvir="geral"]')
  assert.equal(await caio.page.getAttribute('[data-ouvir="geral"]', 'aria-pressed'), 'false')
  await ana.page.waitForTimeout(500)
  await segurar()
  assert.ok((await esperarNivel(bia.page, true)) > 0.005, 'Bia ainda ouve o Geral')
  assert.ok((await esperarNivel(caio.page, false, 2500)) < 0.001, 'Caio não ouve o Geral desligado')
  await ana.page.mouse.up()

  // Todos (Direção): chega a todo mundo, inclusive a quem desligou o Geral
  assert.equal(await caio.page.isHidden('#todos'), true)
  await ana.page.click('#todos')
  assert.equal((await ana.page.textContent('#alvo-nome')).trim(), 'Todos')
  await segurar()
  assert.ok((await esperarNivel(caio.page, true)) > 0.005, 'Todos chega ao Caio')
  await ana.page.mouse.up()

  await ana.page.click('#todos')
  // aviso de set: Ana manda Gravando, os outros veem; Caio (Câmera) não tem os botões
  assert.equal(await caio.page.isHidden('#avisos'), true)
  await ana.page.click('#avisos [data-aviso="acao"]')
  for (const p of [bia, caio]) {
    await p.page.waitForSelector('#aviso-tela:not([hidden])', { timeout: 5000 })
    assert.equal((await p.page.textContent('#aviso-texto')).trim(), 'Gravando')
  }
  // Gravando silencia o set: Caio não fala; Bia (Direção) segue falando
  await caio.page.waitForSelector('#eu-calado:not([hidden])', { timeout: 5000 })
  assert.equal(await caio.page.isDisabled('#ptt'), true)
  await bia.page.waitForSelector('#silencio-set:not([hidden])')
  assert.equal(await bia.page.isDisabled('#ptt'), false)
  // Corta reativa
  await ana.page.click('#aviso-tela')
  await ana.page.click('#avisos [data-aviso="corta"]')
  await caio.page.waitForSelector('#eu-calado', { state: 'hidden', timeout: 5000 })
  assert.equal(await caio.page.isDisabled('#ptt'), false)

  // a dona silencia o Caio pela lista de quem está no ar; ele vê quem foi e pede a palavra
  for (const p of [ana, caio]) if (await p.page.isVisible('#aviso-tela')) await p.page.click('#aviso-tela')
  await ana.page.click('#pessoas .pessoa:has-text("Caio")')
  await ana.page.click('#menu-pessoa .tempos button:has-text("Até eu reativar")')
  await caio.page.waitForSelector('#eu-calado:not([hidden])', { timeout: 5000 })
  assert.match(await caio.page.textContent('#eu-calado-titulo'), /Ana silenciou você/)
  await caio.page.click('#pedir-palavra')
  await ana.page.waitForSelector('#pessoas .pessoa[data-mao="1"]', { timeout: 5000 })
  await ana.page.click('#pessoas .pessoa:has-text("Caio")')
  await ana.page.click('#menu-pessoa .acao:has-text("Dar a palavra")')
  await caio.page.waitForSelector('#eu-calado', { state: 'hidden', timeout: 5000 })
  // a Bia (Direção, sem ser dona) não silencia ninguém: o menu dela não tem a opção
  await bia.page.click('#pessoas .pessoa:has-text("Caio")')
  assert.equal(await bia.page.locator('#menu-pessoa .tempos').count(), 0)

  for (const p of [ana, bia, caio]) assert.deepEqual(p.erros, [])
})

// Android (titular, 07/11/2026: no Android o som saía no alto-falante de ligação): lá o microfone só fica aberto
// enquanto a pessoa fala. Ligar pede a permissão e fecha; segurar abre, a voz chega; soltar fecha de novo.
test('Android: o microfone abre só durante a fala (fora dela, o som segue no viva-voz)', { skip: pular, timeout: 90000 }, async () => {
  const ctx = await navegador.newContext({
    permissions: ['microphone'],
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  })
  // conta as trilhas do microfone que este aparelho abriu e quantas seguem vivas
  await ctx.addInitScript(() => {
    const pedir = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    window.__trilhas = []
    navigator.mediaDevices.getUserMedia = async (c) => {
      const m = await pedir(c)
      window.__trilhas.push(...m.getAudioTracks())
      return m
    }
  })
  const page = await ctx.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  await page.goto(base)
  await page.fill('#local-nome', 'Duda')
  await page.click('#local button')
  await page.waitForSelector('#pg-inicio:not([hidden])')
  const vivas = () => page.evaluate(() => window.__trilhas.filter((t) => t.readyState === 'live').length)

  await page.click('.item[data-ir="diarias"]')
  await page.fill('#criar-nome', 'Externa')
  await page.click('#criar button')
  await page.waitForSelector('#noar:not([hidden])')
  const codigo = (await page.textContent('#codigo')).trim()
  const edu = await pessoa('Edu')
  await edu.page.goto(`${base}/?d=${codigo}`)
  await edu.page.waitForSelector('#setor-folha[open]')
  await edu.page.click('#setores [data-canal="direcao"]')
  await edu.page.waitForFunction(() => !document.getElementById('setor-folha').open)

  await page.click('#ligar-btn')
  await edu.page.click('#ligar-btn')
  for (const p of [page, edu.page]) await p.waitForFunction(() => document.querySelectorAll('#pessoas .pessoa[data-estado="ligado"]').length === 2, null, { timeout: 30000 })
  // ligado e calado: a permissão foi dada, mas nenhum microfone aberto
  assert.equal((await page.evaluate(() => window.__trilhas.length)) >= 1, true)
  assert.equal(await vivas(), 0)

  await page.click('[data-alvo="direcao"]')
  const caixa = await (await page.$('#ptt')).boundingBox()
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(400)
  assert.equal(await page.getAttribute('#ptt', 'data-estado'), 'ptt')
  await page.waitForFunction(() => window.__trilhas.some((t) => t.readyState === 'live'))
  assert.ok((await esperarNivel(edu.page, true)) > 0.005, 'a voz do Android chega')

  await page.mouse.up()
  assert.equal(await page.getAttribute('#ptt', 'data-estado'), 'mudo')
  await page.waitForFunction(() => window.__trilhas.every((t) => t.readyState !== 'live'))
  assert.ok((await esperarNivel(edu.page, false)) < 0.001, 'soltou: a voz para')

  // um toque trava a fala aberta: o microfone abre; outro toque fecha
  await page.click('#ptt')
  await page.waitForFunction(() => window.__trilhas.some((t) => t.readyState === 'live'))
  await page.click('#ptt')
  await page.waitForFunction(() => window.__trilhas.every((t) => t.readyState !== 'live'))
  assert.deepEqual([...erros, ...edu.erros], [])
  await ctx.close()
})
