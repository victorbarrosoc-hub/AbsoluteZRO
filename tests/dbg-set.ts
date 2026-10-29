import { chromium } from '@playwright/test'
import { authenticate, SESSION_COOKIE, signUp } from '@zro/auth'
import { createOrganization } from '@zro/core'
import { createDatabase } from '@zro/db'

const db = createDatabase('postgres://postgres@127.0.0.1:5537/zro_e2e_test', { max: 2 })
const m = Math.random().toString(36).slice(2, 8)
const r = await signUp(db, { email: `dbg-${m}@teste.absolutezro.local`, password: 'senha-e2e-segura-1', displayName: 'Dbg', arroba: `dbg.${m}` })
await db.sql`update zro.users set email_verified_at = now() where id = ${r.userId}`
const org = await createOrganization(db, (await authenticate(db, r.session.token))!, { name: 'Org dbg' })
const [pj] = await db.sql`insert into zro.projects (org_id, title, created_by) values (${org.id}, 'Filme Safra', ${r.userId}) returning id`
const b = await chromium.launch()
const ctx = await b.newContext({ baseURL: 'http://localhost:3240' })
await ctx.addCookies([{ name: SESSION_COOKIE, value: r.session.token, url: 'http://localhost:3240' }])
const page = await ctx.newPage()
page.on('console', (c) => console.log('console', c.text()))
page.on('response', (x) => x.url().includes('/api/v1/set') && console.log(x.request().method(), x.url(), x.status()))
await page.goto(`/projetos/${pj!.id}`)
await page.locator('[data-set-projeto]').click()
await page.waitForURL(/\/set\?projeto=/)
await page.waitForTimeout(3000)
console.log(await page.locator('zro-set[modo=pagina]').evaluate((e) => JSON.stringify({ s: { ...e.s, estado: null }, abrir: e.getAttribute('abrir') })))
console.log(await page.evaluate(() => location.href + ' ' + document.querySelectorAll('zro-set').length))
await page.goto(`/set?projeto=${pj!.id}`)
await page.waitForTimeout(3000)
console.log(await page.locator('zro-set[modo=pagina]').evaluate((e) => e.getAttribute('abrir') + ' ' + JSON.stringify(e.s.conv)))
await b.close()
await db.close()
