// Aprender conversando no Laboratório da Z (ADR 0033 § Aprender conversando), com o Claude e a ElevenLabs falsos de
// tests/fixtures/z-lab-falso.ts (nada sai da máquina): o titular corrige a Z → cartão "Aprender" → Guardar por toque →
// a próxima resposta já segue; por voz, outra correção → cartão → "pode guardar" dito → guardado; Configurar ›
// Aprendizados mostra os dois com a origem; mover de seção; salvar versão congela os dois.
// Fotos (opcional): ZLAB_FOTOS=<pasta> tira claro/escuro × computador/393 px do cartão e da seção.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import postgres from 'postgres'
import { APRENDIZADOS_FALSOS, servidorFalso } from '../fixtures/z-lab-falso'
import { criarConta } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const PORTA = Number(process.env.E2E_ZLAB_PORT || 3296)
const FOTOS = process.env.ZLAB_FOTOS || ''

test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
})

const falso = servidorFalso(PORTA)
/** O laboratório é um só: começa e termina sem teto e sem aprendizados no rascunho (z-lab.spec.ts começa bloqueado). */
async function limpar() {
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`update zro.z_lab_config set teto_diario_usd = null`
  await sql`update zro.z_rascunho set config = config - 'aprendizados' where config is not null`
  await sql.end()
}
test.beforeAll(async () => {
  await falso.abrir()
  await limpar()
})
test.afterAll(async () => {
  await falso.fechar()
  await limpar()
})

/** Claro e escuro, em 1440 e 393 px, com o alvo na tela. */
async function foto(page: Page, nome: string, alvo?: Locator) {
  if (!FOTOS) return
  fs.mkdirSync(FOTOS, { recursive: true })
  const antes = page.viewportSize()!
  for (const [larg, alt, sufixo] of [
    [1440, 900, '1440'],
    [393, 852, '393'],
  ] as const) {
    await page.setViewportSize({ width: larg, height: alt })
    for (const t of ['light', 'dark']) {
      await page.evaluate((x) => (document.documentElement.dataset.theme = x), t)
      if (alvo) await alvo.scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
      await page.screenshot({ path: path.join(FOTOS, `${nome}-${t === 'light' ? 'claro' : 'escuro'}-${sufixo}.png`) })
    }
  }
  await page.evaluate(() => delete document.documentElement.dataset.theme)
  await page.setViewportSize(antes)
}

test('o titular corrige a Z, confirma por toque e por voz, e o que ela aprendeu vai para o rascunho e para a versão', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const email = `zlab-aprende-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  await page.goto('/criar-conta')
  await criarConta(page, { nome: 'Titular Aprende', email, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill('Org Titular Aprende')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`update zro.users set platform_role = 'admin', email_verified_at = coalesce(email_verified_at, now()) where email = ${email}`

  await page.goto('/admin/laboratorio')
  await page.getByLabel('Teto por dia (US$)').fill('5')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('de US$ 5,00 hoje')).toBeVisible()

  // Uma correção por texto: a Z entende, responde natural e propõe o aprendizado num cartão. Nada guardado ainda.
  const campo = page.getByLabel('Mensagem para a Z')
  await campo.fill('Z, não fala tão formal comigo.')
  await campo.press('Enter')
  await expect(page.locator('.zl-msg--z').last()).toContainText('Entendi, vou falar mais próxima.')
  const cartao = page.getByRole('group', { name: 'A Z quer aprender' })
  await expect(cartao).toContainText(APRENDIZADOS_FALSOS.tom)
  await expect(cartao.getByRole('button', { name: 'Guardar' })).toBeVisible()
  await expect(cartao.getByRole('button', { name: 'Ajustar' })).toBeVisible()
  await expect(cartao.getByRole('button', { name: 'Ignorar' })).toBeVisible()
  const pedidoDaZ = falso.registro.filter((r) => r.caminho === 'POST /anthropic/v1/messages').at(-2)!.corpo as { tools: { name: string; strict?: boolean }[] }
  expect(pedidoDaZ.tools.find((t) => t.name === 'propor_aprendizado')?.strict).toBe(true)
  const [antes] = await sql`select config -> 'aprendizados' as a from zro.z_rascunho`
  expect(antes?.a ?? []).toEqual([])
  await foto(page, '01-cartao-na-conversa', cartao)

  // Guardar por toque: vai para o rascunho e a próxima resposta já segue.
  await cartao.getByRole('button', { name: 'Guardar' }).click()
  const guardado = page.getByRole('group', { name: 'Aprendizado guardado' })
  await expect(guardado).toContainText('Aprendi')
  await expect(guardado.getByRole('link', { name: 'No rascunho' })).toBeVisible()
  await foto(page, '02-cartao-guardado', guardado)
  await campo.fill('Oi de novo')
  await campo.press('Enter')
  await expect(page.locator('.zl-msg--z').last()).toContainText('Fechou, sem formalidade!')
  const comAprendizado = falso.registro.filter((r) => r.caminho === 'POST /anthropic/v1/messages').at(-1)!.corpo as { system: { text: string }[] }
  expect(comAprendizado.system.map((s) => s.text).join('\n')).toContain(`Jeito de falar: ${APRENDIZADOS_FALSOS.tom}`)

  // Por voz: outra correção vira cartão na tela da voz; "pode guardar" dito guarda.
  falso.dizer('Lembra que a produtora se chama Lumen.')
  await page.getByRole('button', { name: 'Nova conversa' }).click()
  await page.getByRole('button', { name: 'Conversar por voz' }).first().click()
  const voz = page.getByRole('dialog', { name: 'Conversa por voz com a Z' })
  const cartaoNaVoz = voz.getByRole('group', { name: 'A Z quer aprender' })
  await expect(cartaoNaVoz).toContainText(APRENDIZADOS_FALSOS.fato, { timeout: 30_000 })
  await foto(page, '03-cartao-na-voz', cartaoNaVoz)
  falso.dizer('Pode guardar.')
  await expect(voz.getByRole('group', { name: 'Aprendizado guardado' })).toContainText(APRENDIZADOS_FALSOS.fato, { timeout: 30_000 })
  await expect(voz.locator('.zl-voz__falado')).toContainText('Pronto, guardei.', { timeout: 20_000 })
  await voz.getByRole('button', { name: 'Encerrar', exact: true }).click()
  await expect(voz).toHaveCount(0)
  const [log] = await sql`select metadata from zro.audit_logs where action = 'z_lab.aprendizado_salvo' and metadata ->> 'texto' = ${APRENDIZADOS_FALSOS.fato}`
  expect(log?.metadata).toMatchObject({ pela: 'voz', tipo: 'fato' })

  // Configurar › Aprendizados: os dois, por seção, com a origem.
  await page.getByRole('link', { name: 'Configurar' }).click()
  await page.waitForURL('**/configurar')
  const secao = page.locator('#aprendizados')
  await expect(secao.getByRole('heading', { name: 'Aprendizados' })).toBeVisible()
  await expect(secao.getByRole('region', { name: 'Personalidade' })).toContainText(APRENDIZADOS_FALSOS.tom)
  await expect(secao.getByRole('region', { name: 'Conhecimento' })).toContainText(APRENDIZADOS_FALSOS.fato)
  await expect(secao).toContainText('Aprendido nesta conversa por voz')
  await expect(secao).toContainText('Z, não fala tão formal comigo.')
  await foto(page, '04-configurar-aprendizados', secao)

  // Mover: o fato vai para Regras (e volta), auditado.
  await secao.getByRole('region', { name: 'Conhecimento' }).getByRole('button', { name: 'Editar' }).click()
  const folha = page.getByRole('dialog', { name: 'Aprendizado' })
  await folha.getByRole('radio', { name: 'Regras' }).click()
  await folha.getByRole('button', { name: 'Salvar' }).click()
  await expect(secao.getByRole('region', { name: 'Regras' })).toContainText(APRENDIZADOS_FALSOS.fato)
  await expect(secao.getByRole('region', { name: 'Conhecimento' })).toHaveCount(0)

  // Salvar versão: a versão 1 congela os dois; o Configurar não fica "sujo" com os aprendizados.
  await expect(page.getByText('Alterações não salvas')).toHaveCount(0)
  await page.getByRole('button', { name: 'Salvar versão' }).click()
  await page.getByLabel('O que mudou').fill('Aprendeu conversando')
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar versão' }).click()
  await expect(page.getByText(/Versão \d+ salva\./)).toBeVisible()
  const [v] = await sql`select numero from zro.z_versoes order by numero desc limit 1`
  const versao = await page.request.get(`/api/v1/admin/z-lab/versoes/${v!.numero}`)
  const { config } = (await versao.json()) as { config: { aprendizados: { texto: string; tipo: string }[] } }
  expect(config.aprendizados.map((a) => a.texto).sort()).toEqual([APRENDIZADOS_FALSOS.fato, APRENDIZADOS_FALSOS.tom].sort())

  // Acessibilidade da seção com os aprendizados (estado final, sem animação de entrada).
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const axe = await new AxeBuilder({ page }).include('#aprendizados').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(axe.violations.map((x) => `${x.id}: ${x.nodes[0]?.target.join(' ')}`)).toEqual([])

  // Os clientes não veem nada (publicação desligada): a função dos clientes segue nula.
  const [pub] = await sql`select zro.z_config_publicada() as c`
  expect(pub!.c).toBeNull()

  // Remover tira do rascunho (a versão continua igual).
  page.once('dialog', (d) => void d.accept())
  await secao.getByRole('region', { name: 'Regras' }).getByRole('button', { name: 'Remover' }).click()
  await expect(secao).not.toContainText(APRENDIZADOS_FALSOS.fato)
  const depois = await page.request.get(`/api/v1/admin/z-lab/versoes/${v!.numero}`)
  expect(((await depois.json()) as { config: typeof config }).config.aprendizados).toHaveLength(2)
  const acoes = (await sql`select action from zro.audit_logs where action like 'z_lab.aprendizado_%'`).map((r) => r.action as string)
  expect(acoes).toEqual(expect.arrayContaining(['z_lab.aprendizado_salvo', 'z_lab.aprendizado_movido', 'z_lab.aprendizado_removido']))
  expect((await page.request.post('/api/v1/admin/z-lab/aprendizados', { headers: { Origin: baseURL! }, data: {} })).status()).toBe(422)
  await sql.end()
})
