#!/usr/bin/env node
// Prova medida (página e anúncio): o MESMO link do Drive baixado no navegador × no SOBEDESCE, com o tempo real de cada
// um. Nada é estimado: o tempo do navegador é o de um Chromium de verdade (Playwright) do clique até o arquivo inteiro
// no disco; o do SOBEDESCE é o que o próprio app gravou na transferência (startedAt → finishedAt, GET /api/state). O MD5
// dos dois arquivos tem de bater (é o mesmo arquivo), senão a prova não vale.
//
// Como usar (na mesma máquina e na mesma rede, um depois do outro):
//   1. No SOBEDESCE, baixe o arquivo do link (sem pausar). Deixe o app aberto.
//   2. node scripts/prova-velocidade.mjs --link "<link do Drive>" --nome "<nome do arquivo>" --sobedesce "<arquivo baixado pelo app>"
//      [--porta 4317] [--saida prova.json] [--pular-navegador --navegador-segundos N --navegador-arquivo <caminho>]
// Precisa do Playwright com o Chromium (npm i -D playwright && npx playwright install chromium). O link tem de abrir
// para "qualquer pessoa com o link" (o navegador entra sem conta).
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values: a } = parseArgs({
  options: {
    link: { type: 'string' },
    nome: { type: 'string' },
    sobedesce: { type: 'string' },
    porta: { type: 'string', default: process.env.SOBEDESCE_PORT || '4317' },
    saida: { type: 'string' },
    'pular-navegador': { type: 'boolean', default: false },
    'navegador-segundos': { type: 'string' },
    'navegador-arquivo': { type: 'string' },
  },
})

const sair = (msg) => {
  console.error(msg)
  process.exit(1)
}
if (!a.link || !a.nome || !a.sobedesce) sair('Faltou --link, --nome ou --sobedesce. Veja o começo deste arquivo.')

const md5 = (arquivo) =>
  new Promise((ok, erro) => {
    const h = crypto.createHash('md5')
    fs.createReadStream(arquivo).on('data', (c) => h.update(c)).on('error', erro).on('end', () => ok(h.digest('hex')))
  })

/** A transferência concluída do app com esse nome (a mais recente). */
async function doApp() {
  const r = await fetch(`http://127.0.0.1:${a.porta}/api/state`).catch(() => null)
  if (!r?.ok) sair(`O SOBEDESCE não respondeu na porta ${a.porta}. Abra o app (ou passe --porta).`)
  const st = await r.json()
  const t = (st.transfers || [])
    .filter((x) => x.type === 'download' && x.status === 'completed' && x.name === a.nome && x.startedAt && x.finishedAt)
    .sort((x, y) => y.finishedAt - x.finishedAt)[0]
  if (!t) sair(`Não achei "${a.nome}" concluído nas transferências do app.`)
  return { segundos: (t.finishedAt - t.startedAt) / 1000, bytes: t.size, conexoes: st.settings?.connectionsPerDownload ?? null }
}

/** O link aberto num Chromium de verdade, do clique ao arquivo inteiro (inclui o "Baixar assim mesmo" do Drive). */
async function doNavegador() {
  if (a['pular-navegador']) {
    if (!a['navegador-segundos'] || !a['navegador-arquivo']) sair('Com --pular-navegador, passe --navegador-segundos e --navegador-arquivo.')
    return { segundos: Number(a['navegador-segundos']), arquivo: a['navegador-arquivo'], como: 'medido à mão' }
  }
  let pw
  try {
    pw = await import('playwright')
  } catch {
    sair('Falta o Playwright: npm i -D playwright && npx playwright install chromium')
  }
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'prova-navegador-'))
  const browser = await pw.chromium.launch()
  try {
    const page = await (await browser.newContext({ acceptDownloads: true })).newPage()
    await page.goto(a.link, { waitUntil: 'domcontentloaded' })
    const botao = page.locator('a[aria-label^="Download"], a[aria-label^="Fazer download"], [role="button"][aria-label^="Download"], [role="button"][aria-label^="Fazer download"]').first()
    const espera = page.waitForEvent('download', { timeout: 0 })
    const t0 = performance.now()
    await botao.click()
    // arquivo grande: o Drive pede "Baixar assim mesmo" (não verificou vírus); o relógio já está andando, como para a pessoa
    const confirmar = page.locator('#uc-download-link, form#download-form [type="submit"]').first()
    const dl = await Promise.race([espera, confirmar.click({ timeout: 15_000 }).then(() => espera).catch(() => espera)])
    const arquivo = path.join(dir, dl.suggestedFilename())
    await dl.saveAs(arquivo)
    const segundos = (performance.now() - t0) / 1000
    return { segundos, arquivo, como: `Chromium ${browser.version()} (Playwright)` }
  } finally {
    await browser.close()
  }
}

const app = await doApp()
const nav = await doNavegador()
const [md5App, md5Nav, tam] = await Promise.all([md5(a.sobedesce), md5(nav.arquivo), fsp.stat(a.sobedesce).then((s) => s.size)])
if (md5App !== md5Nav) sair(`Os arquivos não são iguais (MD5 ${md5App} × ${md5Nav}). A prova não vale.`)
const mbps = (bytes, s) => Math.round((bytes / s / 1e6) * 10) / 10
const prova = {
  quando: new Date().toISOString(),
  arquivo: { nome: a.nome, bytes: tam, md5: md5App },
  maquina: { sistema: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model || null },
  navegador: { segundos: Math.round(nav.segundos * 10) / 10, mb_por_s: mbps(tam, nav.segundos), como: nav.como },
  sobedesce: { segundos: Math.round(app.segundos * 10) / 10, mb_por_s: mbps(tam, app.segundos), conexoes: app.conexoes },
  vezes_mais_rapido: Math.round((nav.segundos / app.segundos) * 10) / 10,
}
console.log(JSON.stringify(prova, null, 2))
if (a.saida) await fsp.writeFile(a.saida, JSON.stringify(prova, null, 2) + '\n')
