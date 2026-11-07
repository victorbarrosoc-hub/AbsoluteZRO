// RADION · as telas de verdade da página inicial (raiz CLAUDE.md: a credibilidade vem do produto real). Sobe o app em
// modo local com um Postgres de teste, monta uma diária com gente fictícia e fotografa o computador e o celular, no
// claro e no escuro, em app/site/. Rode `node scripts/telas-do-site.mjs` depois de mudar a interface.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { chromium } from 'playwright'
import { subirPostgres } from '../test/banco-apoio.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = join(RAIZ, 'app/site')
const pg = await subirPostgres()
const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
await admin.unsafe(`create role radio login password 'teste'; create role radio_app nologin; grant radio_app to radio with admin option; create schema radio authorization radio;`)
await admin.end()
const url = pg.url.replace('postgres://postgres@', 'postgres://radio:teste@')
Object.assign(process.env, { RADIO_DATABASE_URL: url, RADIO_LOCAL: '1' })
delete process.env.ZRO_CLIENT_ID
delete process.env.ZRO_CLIENT_SECRET
await (await import('./migrar.mjs')).migrar(url)
execFileSync(process.execPath, [join(RAIZ, 'publicar.mjs')], { stdio: 'pipe' })
const { servir } = await import('./servir.mjs')
const srv = await servir({ porta: 0 })
const base = `http://localhost:${srv.address().port}`
const nav = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'] })
async function pessoa(nome, viewport = { width: 1440, height: 900 }) {
  const ctx = await nav.newContext({ permissions: ['microphone'], viewport, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(base)
  await page.fill('#local-nome', nome)
  await page.click('#local button')
  await page.waitForSelector('#pg-inicio:not([hidden])')
  return page
}
try {
  const ana = await pessoa('Ana Lima')
  await ana.click('.item[data-ir="diarias"]')
  await ana.fill('#criar-nome', 'Comercial Verão')
  await ana.click('#criar button')
  await ana.waitForSelector('#noar:not([hidden])')
  const codigo = (await ana.textContent('#codigo')).trim()
  const equipe = []
  for (const [n, f] of [['Caio Mendes', 'luz'], ['Lia Prado', 'som'], ['Rui Alves', 'camera'], ['Nina Reis', 'arte']]) {
    const p = await pessoa(n, n === 'Rui Alves' ? { width: 390, height: 844 } : undefined)
    await p.goto(`${base}/?d=${codigo}`)
    await p.waitForSelector('#setor-folha[open]')
    await p.click(`#setores [data-canal="${f}"]`)
    await p.click('#ligar-btn')
    equipe.push(p)
  }
  await ana.click('#ligar-btn')
  await ana.click('.item[data-ir="setores"]')
  await ana.waitForTimeout(2500)
  await ana.selectOption('select[aria-label="Responsável da Luz"]', { label: 'Caio Mendes' })
  await ana.click('.item[data-ir="noar"]')
  await ana.waitForTimeout(3000)
  await ana.screenshot({ path: join(SAIDA, 'computador-claro.png') })
  await ana.click('#tema')
  await ana.waitForTimeout(500)
  await ana.screenshot({ path: join(SAIDA, 'computador-escuro.png') })
  const rui = equipe[2]
  await rui.waitForTimeout(1500)
  await rui.screenshot({ path: join(SAIDA, 'celular-claro.png') })
  await rui.evaluate(() => (document.documentElement.dataset.tema = 'escuro'))
  await rui.waitForTimeout(500)
  await rui.screenshot({ path: join(SAIDA, 'celular-escuro.png') })
} finally {
  await nav.close()
  await new Promise((ok) => srv.close(ok))
  await (await import('../api/_banco.js')).fecharBanco()
  await pg.fechar()
}
console.log('app/site: telas prontas')
