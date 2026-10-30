// Laboratório da Z (/admin/laboratorio, ADR 0033), com o Claude e a ElevenLabs falsos de tests/fixtures/z-lab-falso.ts
// (nenhuma chamada sai da máquina): 404 e 403 para quem não é admin, teto do dia, conversa em streaming, anexos, ditado,
// comparação, conversa por voz (escuta ao vivo, resposta falada, legendas e tempos), Configurar com versões, voz e Voice
// Design, publicação travada, teto que bloqueia e o gasto nos Custos.
// Fotos (opcional): ZLAB_FOTOS=<pasta> tira claro/escuro × computador/393 px nos pontos principais.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import postgres from 'postgres'
import { docx } from '../fixtures/zip'
import { servidorFalso } from '../fixtures/z-lab-falso'
import { criarConta } from './conversa'

const DB = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/zro_e2e_test'
const PORTA = Number(process.env.E2E_ZLAB_PORT || 3296)
const FOTOS = process.env.ZLAB_FOTOS || ''

test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
})

const falso = servidorFalso(PORTA)
test.beforeAll(async () => falso.abrir())
test.afterAll(async () => falso.fechar())

async function conta(page: Page, nome: string) {
  const email = `zlab-${randomUUID().slice(0, 8)}@teste.absolutezro.local`
  await page.goto('/criar-conta')
  await criarConta(page, { nome, email, senha: 'senha-e2e-segura-1' })
  await page.waitForURL('**/boas-vindas')
  await page.getByLabel('Nome').fill(`Org ${nome}`)
  await page.getByRole('button', { name: 'Criar e continuar' }).click()
  await page.waitForURL('**/inicio')
  return email
}

async function papel(email: string, role: 'admin' | 'support') {
  const sql = postgres(DB, { max: 1, onnotice: () => {} })
  await sql`update zro.users set platform_role = ${role}, email_verified_at = coalesce(email_verified_at, now()) where email = ${email}`
  await sql.end()
}

/** 1 s de um tom em WAV (PCM 16 bits mono 16 kHz): o navegador decodifica e manda para a transcrição. */
function wav() {
  const n = 16_000
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + n * 2, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(16_000, 24)
  b.writeUInt32LE(32_000, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / 16_000) * 2 * Math.PI * 220) * 8000), 44 + i * 2)
  return b
}

async function foto(page: Page, nome: string) {
  if (!FOTOS) return
  fs.mkdirSync(FOTOS, { recursive: true })
  const antes = page.viewportSize()!
  const tema = await page.evaluate(() => document.documentElement.dataset.theme ?? '')
  for (const [larg, alt, sufixo] of [
    [1440, 900, 'computador'],
    [393, 852, '393'],
  ] as const) {
    await page.setViewportSize({ width: larg, height: alt })
    for (const t of ['light', 'dark']) {
      await page.evaluate((x) => (document.documentElement.dataset.theme = x), t)
      await page.waitForTimeout(250)
      await page.screenshot({ path: path.join(FOTOS, `${nome}-${t === 'light' ? 'claro' : 'escuro'}-${sufixo}.png`) })
    }
  }
  await page.evaluate((x) => (document.documentElement.dataset.theme = x), tema)
  await page.setViewportSize(antes)
}

const ROTAS: [string, string, unknown?][] = [
  ['GET', '/api/v1/admin/z-lab'],
  ['PUT', '/api/v1/admin/z-lab/rascunho', {}],
  ['POST', '/api/v1/admin/z-lab/versoes', { nota: 'x' }],
  ['GET', '/api/v1/admin/z-lab/versoes/1'],
  ['POST', '/api/v1/admin/z-lab/versoes/1/restaurar', {}],
  ['POST', '/api/v1/admin/z-lab/versoes/1/publicar', { confirmar: 'publicar' }],
  ['POST', '/api/v1/admin/z-lab/publicacao/padrao', { confirmar: 'padrao' }],
  ['PUT', '/api/v1/admin/z-lab/teto', { teto: 100 }],
  ['POST', '/api/v1/admin/z-lab/conhecimento', { titulo: 'x', texto: 'y' }],
  ['DELETE', `/api/v1/admin/z-lab/conhecimento/${randomUUID()}`],
  ['PUT', '/api/v1/admin/z-lab/recursos/voz', { ligado: true, planos: [], confirmar: true }],
  ['GET', '/api/v1/admin/z-lab/vozes'],
  ['POST', '/api/v1/admin/z-lab/vozes', { amostra: 'gerada_e2e_1', nome: 'Z', descricao: 'mulher brasileira', confirmar: true }],
  ['POST', '/api/v1/admin/z-lab/vozes/design', { descricao: 'mulher brasileira', texto: 'x'.repeat(120), chave: 'chave-1234' }],
  ['POST', '/api/v1/admin/z-lab/mensagens', { versao: 'rascunho', historico: [{ papel: 'user', texto: 'oi' }] }],
  [
    'POST',
    '/api/v1/admin/z-lab/fala',
    { texto: 'Oi', voz: 'vozClaraE2E01', modelo: 'eleven_flash_v2_5', velocidade: 1, estabilidade: 0.5, chave: 'chave-1234' },
  ],
  ['POST', '/api/v1/admin/z-lab/transcricao?chave=chave-1234'],
  ['POST', '/api/v1/admin/z-lab/escuta', {}],
  ['POST', '/api/v1/admin/z-lab/escuta/fim', { sessao: randomUUID(), segundos: 1 }],
  ['POST', '/api/v1/admin/z-lab/anexos'],
  ['DELETE', '/api/v1/admin/z-lab/anexos/file_e2e000001'],
]

test('o laboratório não existe para quem não é admin da plataforma (nem para o suporte)', async ({ page, baseURL }) => {
  const email = await conta(page, 'Cliente Lab')
  for (const p of ['/admin/laboratorio', '/admin/laboratorio/configurar']) expect((await page.goto(p))?.status(), p).toBe(404)
  const origem = { Origin: baseURL! }
  for (const [metodo, rota, corpo] of ROTAS) {
    const r = await page.request.fetch(rota, { method: metodo, headers: origem, ...(corpo !== undefined ? { data: corpo } : {}) })
    expect(r.status(), `${metodo} ${rota}`).toBe(403)
  }
  // Suporte vê o console, mas não o laboratório.
  await papel(email, 'support')
  await page.goto('/admin')
  await expect(page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: 'Laboratório da Z' })).toHaveCount(0)
  expect((await page.goto('/admin/laboratorio'))?.status()).toBe(404)
  expect((await page.request.get('/api/v1/admin/z-lab')).status()).toBe(403)
  // Nada foi chamado lá fora.
  expect(falso.registro.filter((r) => !r.caminho.startsWith('ws:'))).toHaveLength(0)
})

test('admin testa a Z nova: teto, conversa, anexos, ditado, comparar, voz, Configurar e o gasto nos Custos', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const email = await conta(page, 'Titular Lab')
  await papel(email, 'admin')

  await page.goto('/admin')
  const nav = page.getByRole('navigation', { name: 'Console' })
  await nav.getByRole('link', { name: 'Laboratório da Z' }).click()
  await page.waitForURL('**/admin/laboratorio')
  const resposta = await page.request.get('/admin/laboratorio')
  expect(resposta.headers()['permissions-policy']).toContain('microphone=(self)')
  await expect(page.getByRole('heading', { level: 1, name: 'Laboratório da Z' })).toBeVisible()

  // Sem teto, nada que custa roda.
  await expect(page.getByRole('button', { name: 'Conversar por voz' }).first()).toBeDisabled()
  expect(
    (
      await page.request.post('/api/v1/admin/z-lab/mensagens', {
        headers: { Origin: baseURL! },
        data: { versao: 'rascunho', historico: [{ papel: 'user', texto: 'oi' }] },
      })
    ).status(),
  ).toBe(403)
  await foto(page, '01-inicio-sem-teto')
  await page.getByLabel('Teto por dia (US$)').fill('5')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('de US$ 5,00 hoje')).toBeVisible()

  // Conversa por texto, em streaming, com a personalidade do rascunho (feminina).
  const campo = page.getByLabel('Mensagem para a Z')
  await campo.fill('Oi, Z')
  await campo.press('Enter')
  const z = page.locator('.zl-msg--z').last()
  await expect(z).toContainText('Oi! Estou pronta.')
  await expect(z.locator('.zl-msg__meta')).toContainText('US$')
  await expect(z.locator('.zl-msg__meta')).toContainText('1ª palavra')
  await foto(page, '02-conversa')

  // Ditado: o microfone (falso) escreve no campo para editar antes de enviar.
  await page.getByRole('button', { name: 'Ditar' }).click()
  await expect(page.getByRole('button', { name: 'Parar o ditado' })).toBeVisible()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Parar o ditado' }).click()
  await expect(campo).toHaveValue('Me conta uma novidade.')
  await campo.fill('')

  // Anexos: Word vira texto no servidor; imagem vai para os arquivos (falsos) da Anthropic.
  await page.locator('.zl-compositor input[type=file]').setInputFiles([
    {
      name: 'planos.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from(docx('Plano Estúdio: R$ 99 por mês.')),
    },
    { name: 'tela.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]) },
    { name: 'fala.wav', mimeType: 'audio/wav', buffer: wav() },
  ])
  await expect(page.locator('.zl-compositor .zl-anexo[data-estado=pronto]')).toHaveCount(3)
  await campo.fill('Resuma os anexos')
  await page.getByRole('button', { name: 'Enviar' }).click()
  const comAnexo = page.locator('.zl-msg--z').last()
  await expect(comAnexo).toContainText('Li o anexo: Conteúdo: planos.docx.')
  await expect(comAnexo).toContainText('Vi a imagem.')
  await expect(comAnexo).toContainText('Li o anexo: Transcrição do áudio: fala.wav.')
  const mensagens = falso.registro.filter((r) => r.caminho === 'POST /anthropic/v1/messages')
  const ultima = mensagens.at(-1)!.corpo as { messages: { role: string; content: unknown }[]; system: { text: string }[] }
  expect(JSON.stringify(ultima.messages)).toContain('Plano Estúdio: R$ 99 por mês.')
  expect(JSON.stringify(ultima.messages)).toContain('"file_id":"file_e2e')
  expect(ultima.system[0]!.text).toContain('fiquei curiosa')
  await foto(page, '03-anexo-respondido')

  // Comparar: a mesma pergunta para o rascunho e para o padrão de hoje, lado a lado.
  await page.getByRole('button', { name: 'Nova conversa' }).click()
  await expect.poll(() => falso.registro.filter((r) => r.caminho.startsWith('DELETE /anthropic/v1/files/')).length).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Comparar' }).click()
  await campo.fill('Quem é você?')
  await campo.press('Enter')
  const colunas = page.locator('.zl-turno').last().locator('.zl-msg--z')
  await expect(colunas).toHaveCount(2)
  await expect(colunas.nth(0)).toContainText('Estou pronta')
  await expect(colunas.nth(1)).toContainText('Z de hoje')
  await page.getByRole('button', { name: 'Comparar' }).click()

  // Voz: saudação falada, escuta ao vivo (WebSocket), a Z responde e fala; legendas e tempos aparecem.
  await page.getByRole('button', { name: 'Nova conversa' }).click()
  await page.getByRole('button', { name: 'Conversar por voz' }).first().click()
  const voz = page.getByRole('dialog', { name: 'Conversa por voz com a Z' })
  await expect(voz).toBeVisible()
  await expect(voz.locator('.zl-voz__nome')).toHaveText('Clara')
  await expect.poll(() => falso.registro.some((r) => r.caminho === 'ws:abriu'), { timeout: 15_000 }).toBe(true)
  const abriu = falso.registro.find((r) => r.caminho === 'ws:abriu')!.corpo as Record<string, string>
  expect(abriu).toMatchObject({ model_id: 'scribe_v2_realtime', commit_strategy: 'vad', language_code: 'pt', audio_format: 'pcm_16000' })
  await expect(voz.locator('.zl-voz__falado')).toContainText('Pode falar comigo.', { timeout: 20_000 })
  await expect(voz.locator('.zl-voz__ouvido')).toHaveText('Oi Z, tudo bem?')
  await expect(voz.locator('.zl-voz__tempos dd').nth(1)).not.toHaveText('—')
  await expect(voz.locator('.zl-voz__tempos dd').nth(2)).not.toHaveText('—', { timeout: 10_000 })
  const falas = falso.registro.filter((r) => /\/text-to-speech\/vozClaraE2E01\/stream$/.test(r.caminho))
  expect(falas.length).toBeGreaterThanOrEqual(2) // saudação + resposta
  expect(falas[0]!.corpo as { model_id: string; language_code: string }).toMatchObject({ model_id: 'eleven_flash_v2_5', language_code: 'pt' })
  const pedidoDeVoz = falso.registro.filter((r) => r.caminho === 'POST /anthropic/v1/messages').at(-1)!.corpo as {
    messages: { role: string; content: unknown }[]
  }
  expect(JSON.stringify(pedidoDeVoz.messages)).toContain('falada em voz alta')
  await foto(page, '04-voz-ao-vivo')
  await voz.getByRole('button', { name: 'Encerrar', exact: true }).click()
  await expect(voz).toHaveCount(0)
  await expect(page.locator('.zl-msg--eu').last()).toContainText('Oi Z, tudo bem?')

  // Configurar: personalidade, versão, diferenças, voz e Voice Design.
  await page.getByRole('link', { name: 'Configurar' }).click()
  await page.waitForURL('**/configurar')
  await expect(page.getByRole('heading', { name: 'Personalidade' })).toBeVisible()
  await foto(page, '05-configurar')
  await page.getByLabel('Quem a Z é').fill('Seu nome é Z. Você é uma mulher, calorosa e direta.')
  await page.getByRole('button', { name: 'Salvar rascunho' }).click()
  await expect(page.getByText('Rascunho salvo. O Testar já usa.')).toBeVisible()
  await page.getByRole('button', { name: 'Salvar versão' }).click()
  await page.getByLabel('O que mudou').fill('Primeira Z do laboratório')
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar versão' }).click()
  await expect(page.getByText('Versão 1 salva.')).toBeVisible()
  const linha = page.locator('.zl-versoes li').first()
  await expect(linha).toContainText('Primeira Z do laboratório')
  await expect(linha.getByRole('button', { name: 'Publicar' })).toBeDisabled()
  expect((await page.request.post('/api/v1/admin/z-lab/versoes/1/publicar', { headers: { Origin: baseURL! }, data: { confirmar: 'publicar' } })).status()).toBe(
    403,
  )

  await page.getByRole('button', { name: 'Escolher' }).click()
  const folha = page.getByRole('dialog', { name: 'Voz da Z' })
  await expect(folha.getByText('Clara')).toBeVisible()
  await expect(folha.getByText('John')).toHaveCount(0)
  await folha.getByRole('button', { name: 'Usar' }).click()
  await expect(page.locator('#voz-t .adm-card__aside')).toHaveText('Clara')

  await page.getByRole('button', { name: 'Criar uma voz' }).click()
  const criar = page.getByRole('dialog', { name: 'Criar uma voz' })
  await expect(criar.getByLabel('Como ela soa')).toHaveValue(/mulher brasileira, voz calorosa/)
  await criar.getByRole('button', { name: 'Gerar 3 amostras' }).click()
  await expect(criar.getByText('Amostra 3')).toBeVisible()
  await expect(criar.getByRole('button', { name: 'Salvar e usar' })).toBeDisabled()
  await criar.getByLabel('Salvar na minha conta da ElevenLabs').check()
  await criar.getByRole('button', { name: 'Salvar e usar' }).click()
  await expect(page.locator('#voz-t .adm-card__aside')).toHaveText('Z')
  expect(falso.registro.some((r) => r.caminho === 'POST /eleven/v1/text-to-voice')).toBe(true)
  await page.getByRole('button', { name: 'Salvar rascunho' }).click()
  await expect(page.getByText('Rascunho salvo. O Testar já usa.')).toBeVisible()

  await linha.getByRole('button', { name: 'Diferenças' }).click()
  const dif = page.getByRole('dialog', { name: 'Versão 1 × rascunho' })
  await expect(dif.getByText('Voz', { exact: true })).toBeVisible()
  await foto(page, '06-configurar-diferencas')
  await dif.getByRole('button', { name: 'Fechar' }).click()
  await page.locator('#versoes').scrollIntoViewIfNeeded()
  await foto(page, '07-configurar-versoes')

  // Teto que bloqueia: com teto zero, a próxima chamada paga para antes de gastar.
  await page.request.put('/api/v1/admin/z-lab/teto', { headers: { Origin: baseURL! }, data: { teto: 0 } })
  const bloqueado = await page.request.post('/api/v1/admin/z-lab/mensagens', {
    headers: { Origin: baseURL! },
    data: { versao: 'rascunho', historico: [{ papel: 'user', texto: 'oi' }] },
  })
  expect(bloqueado.status()).toBe(429)
  expect((await bloqueado.json()).error).toBe('quota_exceeded')

  // Acessibilidade das duas telas (estado final, sem animação de entrada).
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const p of ['/admin/laboratorio', '/admin/laboratorio/configurar']) {
    await page.goto(p)
    await page.waitForLoadState('networkidle')
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const resumo = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} · ${v.nodes[0]?.target.join(' ')}`)
    expect(resumo, `${p}\n${resumo.join('\n')}`).toEqual([])
  }

  // O gasto aparece nos Custos.
  await page.goto('/admin/custos')
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: /Laboratório da Z/ }) })
  await expect(card).toContainText('Este mês')
  await expect(card).toContainText(/Claude US\$/)
})
