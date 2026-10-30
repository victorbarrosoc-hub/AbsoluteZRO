/**
 * Capturas do HUB para `produto-hub-{claro,escuro}.webp` (MacBook com o painel /app e iPhone com /inicio), feitas no
 * HUB local com uma conta de demonstração neutra. Os produtos aparecem como o gate de lançamento do banco diz (ADR
 * 0023). A foto vai para a página pública, que só divulga o que está no ar (titular, 30/10/2026): os cartões fechados
 * ("Em desenvolvimento") saem da tela antes da captura; nada é acrescentado. Nada é inventado na tela além da central
 * do app de computador, simulada com SOBEDESCE e Synquei instalados (no navegador ela não existe).
 *
 *   DATABASE_URL=postgres://…/banco-local HUB_URL=http://localhost:3300 npx tsx scripts/marca/aparelhos/capturar-hub.ts <pasta>
 *   python3 scripts/marca/aparelhos/produtos.py <pasta> hub && python3 scripts/marca/aparelhos/transparente.py
 *
 * Só roda contra banco e HUB locais (localhost), nunca produção.
 */
import { authenticate, SESSION_COOKIE, signIn, signUp } from '@zro/auth'
import { createOrganization, createProject, marcarAvisoDoPerfil } from '@zro/core'
import { createDatabase } from '@zro/db'
import { chromium } from '@playwright/test'

const url = process.env.DATABASE_URL ?? ''
const hub = process.env.HUB_URL ?? 'http://localhost:3300'
const pasta = process.argv[2]
const local = (u: string) => /@(localhost|127\.0\.0\.1)[:/]|^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(u)
if (!pasta || !local(url) || !local(hub)) {
  console.error('Uso: DATABASE_URL=<postgres local> HUB_URL=<http://localhost:…> tsx capturar-hub.ts <pasta>')
  process.exit(2)
}

const EMAIL = 'victor@demo.absolutezro.local'
const SENHA = 'demo-absolute-zro-capturas'
const db = createDatabase(url, { max: 2 })

async function entrar() {
  const [existe] = await db.sql`select id from zro.users where email = ${EMAIL}`
  if (!existe) await signUp(db, { email: EMAIL, password: SENHA, displayName: 'Victor' })
  await db.sql`update zro.users set email_verified_at = coalesce(email_verified_at, now()) where email = ${EMAIL}`
  let s = await signIn(db, { email: EMAIL, password: SENHA })
  let auth = (await authenticate(db, s.token))!
  if (!auth.session.activeOrgId) {
    await createOrganization(db, auth, { name: 'Aurora Filmes' })
    s = await signIn(db, { email: EMAIL, password: SENHA })
    auth = (await authenticate(db, s.token))!
  }
  const [projeto] = await db.sql`select id from zro.projects where org_id = ${auth.session.activeOrgId} and title = 'Clipe Aurora'`
  if (!projeto) await createProject(db, auth, { title: 'Clipe Aurora', type: 'clipe' })
  // o aviso único do perfil (0029) é de quem acabou de entrar, não da foto
  await marcarAvisoDoPerfil(db, auth)
  return s.token
}

// A central do app de computador (preload do Electron), com dois apps instalados e tudo em dia. Vai como texto: o tsx
// reescreve funções (nomes auxiliares) e o navegador não as conheceria.
const CENTRAL = `(() => {
  const lista = [['sobedesce', '0.1.0'], ['synquei', '1.0.0']].map(([id, versao]) => ({
    id, nome: id, disponivel: { versao, build: null, tamanho: 0 }, instalado: { versao }, atualizar: false, ocupado: false,
  }))
  const ok = (dados) => Promise.resolve({ ok: true, dados })
  window.zroDesktop = {
    isDesktop: true,
    plataforma: 'darwin',
    apps: {
      versao: 1,
      listar: () => ok(lista),
      instalar: () => ok(true),
      abrir: () => ok(true),
      remover: () => ok(true),
      cancelar: () => Promise.resolve({ ok: true }),
      aoProgresso: () => () => undefined,
    },
  }
})()`

// Tira os cartões do que não está no ar (selo "Em desenvolvimento" no painel, .app-tile--soon no início).
const SO_NO_AR = `(() => {
  for (const li of document.querySelectorAll('.painel__apps > li'))
    if (/Em desenvolvimento/.test(li.querySelector('.pcard__acoes')?.textContent ?? '')) li.remove()
  for (const t of document.querySelectorAll('.app-tile--soon')) (t.closest('li') ?? t).remove()
})()`

try {
  const token = await entrar()
  const browser = await chromium.launch()
  const host = new URL(hub).hostname
  for (const tema of ['light', 'dark'] as const) {
    const cookies = [
      { name: SESSION_COOKIE, value: token, domain: host, path: '/' },
      { name: 'zro_theme', value: tema, domain: host, path: '/' },
    ]
    const mac = await browser.newContext({ viewport: { width: 1440, height: 916 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
    await mac.addCookies(cookies)
    await mac.addInitScript({ content: CENTRAL })
    const p = await mac.newPage()
    await p.goto(`${hub}/app`, { waitUntil: 'networkidle' })
    await p.evaluate(SO_NO_AR)
    await p.waitForTimeout(800)
    await p.screenshot({ path: `${pasta}/hub-mac-${tema}.png` })
    await mac.close()

    const iph = await browser.newContext({
      viewport: { width: 390, height: 860 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    })
    await iph.addCookies(cookies)
    const q = await iph.newPage()
    await q.goto(`${hub}/inicio`, { waitUntil: 'networkidle' })
    await q.evaluate(SO_NO_AR)
    await q.waitForTimeout(800)
    await q.screenshot({ path: `${pasta}/hub-iph-${tema}.png` })
    await iph.close()
    console.log('capturado', tema)
  }
  await browser.close()
} finally {
  await db.close()
}
