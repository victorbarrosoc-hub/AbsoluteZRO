// Telas no iPhone sem zoom sozinho (relato do titular, 01/11/2026, Safari e app da Tela de Início): no Console > Pessoas
// a página ficava mais larga que a tela (abas, chips, "Planilha" e a lista estouravam à direita) e o Safari ampliava e
// reduzia a página sozinho. Aqui, logado como admin da plataforma e como conta comum, cada tela do HUB e do console em
// 375, 393 e 430 px (WebKit, como o Safari, e Chromium como celular) não pode rolar de lado, e todo campo visível tem
// fonte de pelo menos 16 px (abaixo disso o Safari amplia ao tocar e não volta). Com SHOTS_DIR, guarda as capturas
// em 393 px no tema claro.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import postgres from 'postgres'
import { criarConta } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const PASS = 'senha-e2e-segura-1'
const SHOTS = process.env.SHOTS_DIR
const TAMANHOS = [
  { width: 375, height: 812 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
] as const
const NAVEGADORES = ['webkit', 'chromium'] as const

const PUBLICAS = ['/', '/planos', '/baixar', '/termos', '/privacidade', '/entrar', '/criar-conta', '/esqueci-a-senha']
const HUB = [
  '/inicio',
  '/set',
  '/projetos',
  '/projetos/novo',
  '/ciclo',
  '/ferramentas',
  '/downloads',
  '/arquivos',
  '/atividades',
  '/ia',
  '/equipe',
  '/assinatura',
  '/perfil',
  '/perfil/profissional',
  '/perfil/seguranca',
  '/perfil/plano',
  '/perfil/acessos',
  '/perfil/excluir',
  '/conexoes',
]
const CONSOLE = [
  '/admin',
  '/admin/agora',
  '/admin/pessoas',
  '/admin/pessoas?seg=ecossistema',
  '/admin/planos',
  '/admin/custos',
  '/admin/correio',
  '/admin/laboratorio',
  '/admin/laboratorio/configurar',
  '/admin/lancamento',
  '/admin/apps',
  '/admin/apps/sobedesce',
  '/admin/denuncias',
  '/admin/papeis',
  '/admin/teste-drive',
]

/** Conta nova com organização própria e e-mail confirmado; `admin` vira admin da plataforma direto no banco. */
async function conta(browser: Browser, baseURL: string, nome: string, email: string, admin = false) {
  const ctx = await browser.newContext({ baseURL })
  const page = await ctx.newPage()
  await page.goto('/criar-conta')
  await criarConta(page, { nome, email, senha: PASS })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill(`Org de ${nome}`)
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`update zro.users set email_verified_at = coalesce(email_verified_at, now()) ${admin ? sql`, platform_role = 'admin'` : sql``} where email = ${email}`
  const [u] = await sql`select u.id, p.arroba from zro.users u left join zro.perfis p on p.user_id = u.id where u.email = ${email}`
  await sql.end()
  // um projeto para abrir a tela do projeto
  const criado = await page.request.post('/api/v1/projects', { headers: { origin: new URL(baseURL).origin }, data: { title: `Projeto de ${nome}` } })
  expect(criado.status()).toBe(201)
  const projeto = (await criado.json()).id as string
  const estado = await ctx.storageState()
  await ctx.close()
  return { estado, id: u!.id as string, arroba: u!.arroba as string, projeto }
}

/** O que passa da borda direita (ou esquerda) da tela e os campos com fonte menor que 16 px. */
async function achados(page: Page, vw: number) {
  // A largura pedida, não innerWidth: no celular, uma página larga demais amplia a área de layout (é o zoom sozinho).
  return page.evaluate((vw) => {
    const doc = document.documentElement
    const largo = Math.max(doc.scrollWidth, window.innerWidth)
    const largura = largo > vw ? [`página mais larga que a tela: ${largo} > ${vw}`] : []
    const nome = (el: Element) => {
      const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
      return `${el.tagName.toLowerCase()}${c ? `.${c}` : ''} "${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`
    }
    // Só o elemento mais externo que passa da tela, fora de faixas que rolam por dentro e de caixas menores que a tela
    // que recortam de propósito. Um recorte na largura da página inteira (rede de segurança) não esconde o estouro.
    const fora: string[] = []
    const dentroDeFaixa = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX
        if (ox === 'auto' || ox === 'scroll') return true
        if ((ox === 'hidden' || ox === 'clip') && a.getBoundingClientRect().width < vw - 1) return true
      }
      return false
    }
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      if (r.right <= vw + 1 && r.left >= -1) continue
      if (el.closest('.zro-sr-only, .zro-skip, [hidden], dialog:not([open])')) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.position === 'fixed') continue
      if (dentroDeFaixa(el)) continue
      const pai = el.parentElement
      if (pai) {
        const rp = pai.getBoundingClientRect()
        if ((rp.right > vw + 1 || rp.left < -1) && !dentroDeFaixa(pai) && pai !== document.body) continue
      }
      fora.push(`${nome(el)} (${Math.round(r.left)}–${Math.round(r.right)} de ${vw})`)
    }
    const campos: string[] = []
    for (const el of Array.from(document.querySelectorAll('input, select, textarea'))) {
      const i = el as HTMLInputElement
      if (['hidden', 'checkbox', 'radio', 'range', 'file', 'submit', 'button', 'color'].includes(i.type)) continue
      const r = i.getBoundingClientRect()
      if (r.width < 2 || r.height < 2 || getComputedStyle(i).visibility === 'hidden') continue
      const px = parseFloat(getComputedStyle(i).fontSize)
      if (px < 16) campos.push(`${nome(i)}[${i.name || i.id || i.type}] ${px}px`)
    }
    return { largura, fora: fora.slice(0, 8), campos }
  }, vw)
}

async function percorrer(context: BrowserContext, caminhos: string[], onde: string, foto?: string) {
  const page = await context.newPage()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const problemas: string[] = []
  for (const caminho of caminhos) {
    const r = await page.goto(caminho)
    expect(r?.status(), `${onde} ${caminho}`).toBeLessThan(400)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(150)
    const a = await achados(page, page.viewportSize()!.width)
    for (const p of [...a.largura, ...a.fora.map((f) => `fora da tela: ${f}`), ...a.campos.map((c) => `campo < 16px: ${c}`)]) {
      problemas.push(`${onde} ${caminho}: ${p}`)
    }
    if (foto) {
      fs.mkdirSync(foto, { recursive: true })
      const arquivo = caminho.replace(/^\//, '').replace(/[/?=&]+/g, '-') || 'inicio-site'
      // a tela como o iPhone mostra (barras fixas no lugar) e a página inteira
      await page.screenshot({ path: path.join(foto, `${arquivo}.png`) })
      await page.screenshot({ path: path.join(foto, `${arquivo}-inteira.png`), fullPage: true })
    }
  }
  await page.close()
  return problemas
}

test('iPhone: nenhuma tela do HUB e do console rola de lado nem tem campo que dá zoom', async ({ browser, playwright, baseURL }) => {
  test.setTimeout(900_000)
  const m = randomUUID().slice(0, 6)
  const admin = await conta(browser, baseURL!, 'Admin do iPhone', `iphone-admin-${m}@teste.absolutezro.local`, true)
  const comum = await conta(browser, baseURL!, 'Pessoa do iPhone', `iphone-comum-${m}@teste.absolutezro.local`)
  // e-mail comprido na lista de pessoas: não pode empurrar a página
  await conta(
    browser,
    baseURL!,
    'Maria Aparecida de Albuquerque Figueiredo Nascimento',
    `maria.aparecida.albuquerque.figueiredo.${m}@produtora-exemplo.absolutezro.local`,
  )
  const ficha = `/admin/pessoas/${comum.id}`
  const doComum = [`/projetos/${comum.projeto}`, `/projetos/${comum.projeto}/midias`, `/pessoas/${comum.arroba}`]

  const problemas: string[] = []
  for (const navegador of NAVEGADORES) {
    const nav = await playwright[navegador].launch()
    try {
      for (const tamanho of TAMANHOS) {
        const onde = `${navegador} ${tamanho.width}px`
        const opcoes = { baseURL, viewport: tamanho, hasTouch: true, isMobile: navegador === 'chromium', colorScheme: 'light' as const }
        const foto = SHOTS && navegador === 'webkit' && tamanho.width === 393 ? SHOTS : undefined
        const anonimo = await nav.newContext(opcoes)
        problemas.push(...(await percorrer(anonimo, PUBLICAS, `${onde} anônimo`, foto && path.join(foto, 'publico'))))
        await anonimo.close()
        const ctxComum = await nav.newContext({ ...opcoes, storageState: comum.estado })
        problemas.push(...(await percorrer(ctxComum, [...HUB, ...doComum], `${onde} comum`, foto && path.join(foto, 'hub'))))
        await ctxComum.close()
        const ctxAdmin = await nav.newContext({ ...opcoes, storageState: admin.estado })
        problemas.push(
          ...(await percorrer(ctxAdmin, [...CONSOLE, ficha, '/inicio', '/ferramentas', '/set'], `${onde} admin`, foto && path.join(foto, 'console'))),
        )
        await ctxAdmin.close()
      }
    } finally {
      await nav.close()
    }
  }
  expect(problemas, problemas.join('\n')).toEqual([])
})
