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

test('três pessoas: voz chega, Equipe só para a mesma função, Geral para todos, aviso na tela', { skip: pular, timeout: 90000 }, async () => {
  const ana = await pessoa('Ana')
  await ana.page.fill('#criar-nome', 'Comercial')
  await ana.page.click('#criar button')
  await ana.page.waitForSelector('#tela-radio:not([hidden])')
  const codigo = (await ana.page.textContent('#codigo')).trim()
  assert.match(codigo, /^[A-Z2-9]{6}$/)

  const bia = await pessoa('Bia')
  await bia.page.goto(`${base}/?d=${codigo}`) // o link do QR
  await bia.page.waitForSelector('#tela-radio:not([hidden])')
  const caio = await pessoa('Caio')
  await caio.page.fill('#entrar-codigo', codigo.toLowerCase())
  await caio.page.click('#entrar button')
  await caio.page.waitForSelector('#tela-radio:not([hidden])')

  for (const p of [ana, bia, caio]) await p.page.click('#ligar-btn')
  await bia.page.click('#funcoes button:has-text("Direção")')
  await caio.page.click('#funcoes button:has-text("Câmera")')

  // todos ligados com todos
  for (const p of [ana, bia, caio]) await p.page.waitForFunction(() => document.querySelectorAll('#pessoas li[data-estado="ligado"]').length === 3, null, { timeout: 30000 })

  // ninguém falando: silêncio
  assert.ok((await esperarNivel(bia.page, false)) < 0.001)

  // Ana na Equipe (Direção): Bia ouve, Caio não
  await ana.page.click('.canais button[data-canal="equipe"]')
  const ptt = await ana.page.$('#ptt')
  const caixa = await ptt.boundingBox()
  await ana.page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await ana.page.mouse.down()
  await bia.page.waitForFunction(() => document.getElementById('no-ar').textContent.includes('Ana'))
  assert.match(await bia.page.textContent('#no-ar'), /Ana · Direção/)
  assert.ok((await esperarNivel(bia.page, true)) > 0.005, 'Bia ouve a Ana')
  assert.ok((await esperarNivel(caio.page, false, 2500)) < 0.001, 'Caio (Câmera) não recebe a fala da Equipe da Direção')
  await ana.page.mouse.up()
  await bia.page.waitForFunction(() => document.getElementById('no-ar').textContent === '')
  assert.ok((await esperarNivel(bia.page, false)) < 0.001, 'soltou: silêncio')

  // Ana no Geral: Caio ouve
  await ana.page.click('.canais button[data-canal="geral"]')
  await ana.page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await ana.page.mouse.down()
  assert.ok((await esperarNivel(caio.page, true)) > 0.005, 'Caio ouve no Geral')
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
