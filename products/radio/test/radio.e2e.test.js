// O rádio de ponta a ponta no Chromium, com três pessoas (modo local, Postgres de verdade, microfone falso do
// Chromium, que toca um bipe): Ana (Direção) cria a diária, Bia entra pelo código e fica na Direção, Caio entra e fica
// na Câmera. Confere que a voz chega de verdade (nível do áudio recebido), que o canal da Equipe só chega a quem tem a
// mesma função, que o Geral chega a todos e que o aviso de set aparece na tela dos outros.
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
  await page.waitForSelector('#tela-diarias:not([hidden])')
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
  await ana.page.fill('#criar-nome', 'Comercial')
  await ana.page.click('#criar button')
  await ana.page.waitForSelector('#tela-radio:not([hidden])')
  const codigo = (await ana.page.textContent('#codigo')).trim()
  assert.match(codigo, /^[A-Z2-9]{6}$/)
  // quem criou já está na Direção: não pergunta o setor
  assert.equal(await ana.page.isVisible('#setor-folha'), false)

  const bia = await pessoa('Bia')
  await bia.page.goto(`${base}/?d=${codigo}`) // o link do QR
  await bia.page.waitForSelector('#setor-folha[open]')
  await bia.page.click('#setores [data-canal="direcao"]')
  const caio = await pessoa('Caio')
  await caio.page.fill('#entrar-codigo', codigo.toLowerCase())
  await caio.page.click('#entrar button')
  await caio.page.waitForSelector('#setor-folha[open]')
  await caio.page.click('#setores [data-canal="camera"]')

  for (const p of [bia, caio]) await p.page.waitForFunction(() => !document.getElementById('setor-folha').open)
  for (const p of [ana, bia, caio]) await p.page.click('#ligar-btn')
  // o seu setor vem logo depois do Geral, marcado "Seu"
  assert.deepEqual(await caio.page.$$eval('.faixa', (fs) => fs.slice(0, 2).map((f) => f.dataset.canal)), ['geral', 'camera'])
  assert.equal(await caio.page.getAttribute('[data-ouvir="camera"]', 'aria-pressed'), 'true')
  assert.equal(await caio.page.getAttribute('[data-ouvir="direcao"]', 'aria-pressed'), 'false')

  // todos ligados com todos
  for (const p of [ana, bia, caio]) await p.page.waitForFunction(() => document.querySelectorAll('#pessoas li[data-estado="ligado"]').length === 3, null, { timeout: 30000 })
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
  await bia.page.waitForSelector('.faixa[data-canal="direcao"].is-no-ar')
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

  // aviso de set: Ana manda Ação, os outros veem; Caio (Câmera) não tem os botões
  assert.equal(await caio.page.isHidden('#avisos'), true)
  await ana.page.click('[data-aviso="acao"]')
  for (const p of [bia, caio]) {
    await p.page.waitForSelector('#aviso-tela:not([hidden])', { timeout: 5000 })
    assert.equal((await p.page.textContent('#aviso-texto')).trim(), 'Ação')
  }

  for (const p of [ana, bia, caio]) assert.deepEqual(p.erros, [])
})
