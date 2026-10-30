// Laboratório da Z (ADR 0033), modo voz: (1) com a escuta ao vivo recusada pela ElevenLabs (401 no token, como em
// produção), mãos livres segue por frase (VAD daqui + Scribe v2 pelo HUB) com uma nota calma, e o erro da transcrição
// recusada nomeia a permissão; (2) no celular (375, 393 e 430 px, e deitado) nada passa da largura e os controles ficam
// na tela, no Chromium e no WebKit. ElevenLabs e Claude falsos (tests/fixtures/z-lab-falso.ts): nada sai da máquina.
// Fotos (opcional): ZLAB_FOTOS=<pasta> tira claro/escuro a 393 px (parada, ouvindo, nota por frase).
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium, expect, test, webkit, type Browser, type Locator, type Page } from '@playwright/test'
import postgres from 'postgres'
import { servidorFalso } from '../fixtures/z-lab-falso'
import { criarConta } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const PORTA = Number(process.env.E2E_ZLAB_PORT || 3296)
const FOTOS = process.env.ZLAB_FOTOS || ''
const NOTA = 'Escuta ao vivo indisponível: usando transcrição por frase'

/** O microfone falso do Chromium toca este WAV em laço: 1,5 s de silêncio, 1,2 s de "fala" (tom), 2,5 s de silêncio. */
function wavDeFala(): string {
  const taxa = 16_000
  const partes: [number, boolean][] = [
    [1.5, false],
    [1.2, true],
    [2.5, false],
  ]
  const n = Math.round(partes.reduce((s, [d]) => s + d, 0) * taxa)
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + n * 2, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(taxa, 24)
  b.writeUInt32LE(taxa * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(n * 2, 40)
  let i = 0
  for (const [d, fala] of partes)
    for (let k = 0; k < Math.round(d * taxa); k++, i++) {
      const v = fala ? Math.sin((k / taxa) * 2 * Math.PI * 220) * (0.6 + 0.4 * Math.sin((k / taxa) * 2 * Math.PI * 3)) * 9000 : 0
      b.writeInt16LE(Math.round(v), 44 + i * 2)
    }
  const arquivo = path.join(os.tmpdir(), `zlab-fala-e2e-${process.pid}.wav`)
  fs.writeFileSync(arquivo, b)
  return arquivo
}

const CHROMIUM = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']

const falso = servidorFalso(PORTA)
test.beforeAll(async () => falso.abrir())
test.afterAll(async () => {
  await falso.fechar()
  // O teto é do laboratório todo: volta a "sem teto" para os outros testes (z-lab.spec.ts começa bloqueado).
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`update zro.z_lab_config set teto_diario_usd = null`
  await sql.end()
})

// Cada teste abre o próprio navegador (o Playwright não troca de navegador nem de argumentos dentro de um arquivo).
let aberto: Browser | null = null
test.afterEach(async () => {
  await aberto?.close()
  aberto = null
})
async function navegar(qual: 'chromium' | 'webkit', baseURL: string, args: string[] = CHROMIUM): Promise<Page> {
  aberto = qual === 'chromium' ? await chromium.launch({ args }) : await webkit.launch()
  const ctx = await aberto.newContext({
    baseURL,
    viewport: { width: 393, height: 852 },
    permissions: ['microphone'],
  })
  return ctx.newPage()
}

async function adminComTeto(page: Page, baseURL: string) {
  const email = `zvoz-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  await page.goto('/criar-conta')
  await criarConta(page, { nome: 'Titular Voz', email, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill('Org Titular Voz')
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`update zro.users set platform_role = 'admin', email_verified_at = coalesce(email_verified_at, now()) where email = ${email}`
  await sql.end()
  expect((await page.request.put('/api/v1/admin/z-lab/teto', { headers: { Origin: baseURL }, data: { teto: 5 } })).status()).toBe(200)
}

async function abrirVoz(page: Page) {
  await page.goto('/admin/laboratorio')
  await page.getByRole('button', { name: 'Conversar por voz' }).first().click()
  const voz = page.getByRole('dialog', { name: 'Conversa por voz com a Z' })
  await expect(voz).toBeVisible()
  return voz
}

async function foto(page: Page, nome: string) {
  if (!FOTOS) return
  fs.mkdirSync(FOTOS, { recursive: true })
  const antes = page.viewportSize()!
  const tema = await page.evaluate(() => document.documentElement.dataset.theme ?? '')
  await page.setViewportSize({ width: 393, height: 852 })
  for (const t of ['light', 'dark']) {
    await page.evaluate((x) => (document.documentElement.dataset.theme = x), t)
    await page.waitForTimeout(250)
    await page.screenshot({ path: path.join(FOTOS, `${nome}-${t === 'light' ? 'claro' : 'escuro'}-393.png`) })
  }
  await page.evaluate((x) => (document.documentElement.dataset.theme = x), tema)
  await page.setViewportSize(antes)
}

/** Nada passa da largura (nem a página nem o diálogo) e cada controle fica inteiro dentro da tela. */
async function cabe(page: Page, voz: Locator, rotulo: string, opcoes: { naAltura?: boolean } = {}) {
  const { width: vw, height: vh } = page.viewportSize()!
  const larguras = await page.evaluate(() => {
    const d = document.querySelector('dialog.zl-voz') as HTMLElement
    return { pagina: document.documentElement.scrollWidth, dialogo: d.scrollWidth, dialogoVisivel: d.clientWidth }
  })
  expect(larguras.pagina, `${rotulo}: a página rola de lado`).toBeLessThanOrEqual(vw)
  expect(larguras.dialogo, `${rotulo}: o diálogo rola de lado`).toBeLessThanOrEqual(larguras.dialogoVisivel)
  const chaves: [string, Locator, boolean][] = [
    ['modelo', voz.locator('.zl-voz__topo select'), false],
    ['voz', voz.locator('.zl-voz__nome'), false],
    ['fechar', voz.getByRole('button', { name: 'Encerrar a conversa por voz' }), false],
    ['anel', voz.locator('.zl-voz__palco'), false],
    ['fase', voz.locator('.zl-voz__fase'), false],
    ['nota', voz.locator('.zl-voz__nota'), false],
    ['ouvido', voz.locator('.zl-voz__ouvido'), false],
    ['falado', voz.locator('.zl-voz__falado'), false],
    ['erro', voz.locator('.zl-voz__erro'), false],
    ['tempos', voz.locator('.zl-voz__tempos'), false],
    ['modos', voz.locator('.zl-voz__modos'), true],
    ['microfone', voz.locator('.zl-voz__falar'), true],
    ['encerrar', voz.getByRole('button', { name: 'Encerrar', exact: true }), true],
  ]
  for (const [nome, l, embaixo] of chaves) {
    if (!(await l.count())) continue
    const c = await l.first().boundingBox()
    if (!c) continue
    expect(c.x, `${rotulo}: ${nome} sai pela esquerda`).toBeGreaterThanOrEqual(-0.5)
    expect(c.x + c.width, `${rotulo}: ${nome} sai pela direita (${Math.round(c.x + c.width)} > ${vw})`).toBeLessThanOrEqual(vw + 0.5)
    if (embaixo && opcoes.naAltura !== false)
      expect(c.y + c.height, `${rotulo}: ${nome} fica abaixo da tela (${Math.round(c.y + c.height)} > ${vh})`).toBeLessThanOrEqual(vh + 0.5)
  }
  // O anel no centro.
  const anel = (await voz.locator('.zl-voz__palco').boundingBox())!
  expect(Math.abs(anel.x + anel.width / 2 - vw / 2), `${rotulo}: anel fora do centro`).toBeLessThanOrEqual(2)
}

const TELAS = [
  { width: 375, height: 667 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
]

async function emTodasAsTelas(page: Page, voz: Locator, estado: string) {
  const antes = page.viewportSize()!
  for (const t of TELAS) {
    await page.setViewportSize(t)
    await page.waitForTimeout(120)
    await cabe(page, voz, `${estado} ${t.width}px`)
  }
  // Deitado: nada de lado e o Encerrar alcançável.
  await page.setViewportSize({ width: 852, height: 393 })
  await page.waitForTimeout(120)
  await cabe(page, voz, `${estado} deitado`)
  await page.setViewportSize(antes)
}

test.describe('Chromium', () => {
  test('escuta ao vivo recusada (401 no token): mãos livres segue por frase, sem erro, com custo e tempos', async ({ baseURL }) => {
    test.setTimeout(120_000)
    const page = await navegar('chromium', baseURL!, [...CHROMIUM, `--use-file-for-fake-audio-capture=${wavDeFala()}`])
    await adminComTeto(page, baseURL!)
    falso.recusar('token')
    try {
      const desde = falso.registro.length
      const voz = await abrirVoz(page)
      await expect(voz.locator('.zl-voz__nota')).toHaveText(NOTA, { timeout: 15_000 })
      await expect(voz.locator('.zl-voz__fase')).toHaveText('Ouvindo')
      await expect(voz.locator('.zl-voz__erro')).toHaveCount(0)
      // A frase do microfone vai para a transcrição do HUB (português) e a Z responde falando.
      await expect(voz.locator('.zl-voz__ouvido')).toHaveText('Me conta uma novidade.', { timeout: 20_000 })
      await expect(voz.locator('.zl-voz__falado')).toContainText('Pode falar comigo.', { timeout: 20_000 })
      await expect(voz.locator('.zl-voz__tempos dd').nth(0)).not.toHaveText('—')
      await expect(voz.locator('.zl-voz__tempos dd').nth(2)).not.toHaveText('—', { timeout: 10_000 })
      const novos = falso.registro.slice(desde)
      expect(novos.some((r) => r.caminho === 'POST /eleven/v1/single-use-token/realtime_scribe')).toBe(true)
      expect(novos.some((r) => r.caminho === 'ws:abriu')).toBe(false)
      expect(novos.some((r) => r.caminho === 'POST /eleven/v1/speech-to-text')).toBe(true)
      await expect(voz.locator('.zl-voz__erro')).toHaveCount(0)
      await foto(page, 'voz-nota-por-frase')
      await emTodasAsTelas(page, voz, 'por frase')

      // A transcrição também recusada: o erro diz qual permissão ligar.
      falso.recusar('transcricao')
      await expect(voz.locator('.zl-voz__erro')).toContainText('Speech to Text (401, falta speech_to_text)', { timeout: 20_000 })
      await emTodasAsTelas(page, voz, 'erro da transcrição')
      await voz.getByRole('button', { name: 'Encerrar', exact: true }).click()
      await expect(voz).toHaveCount(0)
    } finally {
      falso.recusar('token', false)
      falso.recusar('transcricao', false)
    }
    // A transcrição por frase entrou no gasto do dia (segundos de transcrição).
    const estado = (await (await page.request.get('/api/v1/admin/z-lab')).json()) as { gasto: { porServico: Record<string, number> } }
    expect(estado.gasto.porServico.transcricao).toBeGreaterThan(0)
  })
})

for (const navegador of ['chromium', 'webkit'] as const) {
  test.describe(`celular no ${navegador}`, () => {
    test('modo voz cabe em 375, 393 e 430 px (e deitado): parada, ouvindo e erro', async ({ baseURL }) => {
      test.setTimeout(150_000)
      const page = await navegar(navegador, baseURL!)
      await adminComTeto(page, baseURL!)
      // A voz de nome comprido e o modelo de nota comprida: o pior caso do topo.
      await page.route('**/api/v1/admin/z-lab/vozes', (r) =>
        r.fulfill({
          json: { vozes: [{ id: 'vozClaraE2E01', nome: 'Bella - Professional, Bright, Warm and Friendly', feminina: true, ptBr: true }] },
        }),
      )
      const voz = await abrirVoz(page)
      await voz.locator('.zl-voz__topo select').selectOption({ label: 'Haiku 5.5 · O mais rápido, bom para voz' })
      await expect(voz.locator('.zl-voz__nome')).toHaveText(/^Bella/)

      // Ouvindo (mãos livres): o microfone chega à escuta ao vivo (falsa), que devolve o parcial.
      await expect(voz.locator('.zl-voz__ouvido')).toContainText('Oi Z', { timeout: 20_000 })
      await expect(voz.locator('.zl-voz__erro')).toHaveCount(0)
      await foto(page, `voz-ouvindo-${navegador}`)
      await emTodasAsTelas(page, voz, 'ouvindo')

      // Parada (segure para falar).
      await voz.getByRole('radio', { name: 'Segure para falar' }).click()
      await expect(voz.locator('.zl-voz__fase')).toHaveText('Pronta')
      await foto(page, `voz-parada-${navegador}`)
      await emTodasAsTelas(page, voz, 'parada')

      // Erro: a escuta não abre (mensagem longa da ElevenLabs).
      await page.route('**/api/v1/admin/z-lab/escuta', (r) =>
        r.fulfill({
          status: 502,
          json: {
            error: 'upstream_unavailable',
            message:
              'A ElevenLabs recusou a chave para Speech to Text (401, falta speech_to_text). Ligue essa permissão na chave ou confira ELEVENLABS_API_KEY.',
          },
        }),
      )
      await voz.getByRole('radio', { name: 'Mãos livres' }).click()
      await expect(voz.locator('.zl-voz__erro')).toContainText('ELEVENLABS_API_KEY')
      await expect(voz.locator('.zl-voz__fase')).toHaveText('Parou')
      await emTodasAsTelas(page, voz, 'erro')
    })
  })
}
