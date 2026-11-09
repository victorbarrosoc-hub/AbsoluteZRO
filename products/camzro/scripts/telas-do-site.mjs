// CAMZRO · as telas de verdade da página inicial (app/site/*.webp) e a imagem de compartilhar (app/marca/og.png).
// O app roda num Chromium com a câmera falsa filmando um take de verdade (a praia do Coverr que o AEON já usa,
// products/ai-edit/marca/home/cenas/onda.mp4, só leitura; licença em LEIAME.md de lá) convertido na hora para .y4m
// numa pasta temporária. Mudou a interface: `node scripts/telas-do-site.mjs` (precisa do ffmpeg e do Chromium do
// Playwright). Nada aqui é montagem: cada imagem é o app na tela, com as ferramentas ligadas de verdade.

import { chromium, devices } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const SAIDA = join(RAIZ, 'app/site')
const TAKE = fileURLToPath(new URL('../../ai-edit/marca/home/cenas/onda.mp4', import.meta.url))
const ROTEIRO = fileURLToPath(new URL('../../../docs/integration-contracts/exemplos/maestro.roteiro.v1.json', import.meta.url))
mkdirSync(SAIDA, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'camzro-telas-'))
const y4m = join(tmp, 'take.y4m')
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '0.5', '-i', TAKE, '-t', '4', '-vf', 'fps=24,scale=1280:720', '-pix_fmt', 'yuv420p', y4m])

process.env.CAMZRO_LOCAL = '1'
delete process.env.ZRO_CLIENT_ID
delete process.env.ZRO_CLIENT_SECRET
const { servir } = await import('./servir.mjs')
const PORTA = 8193
const srv = await servir({ porta: PORTA })
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`, '--autoplay-policy=no-user-gesture-required'] })

/** PNG → WebP (qualidade 80) com o ffmpeg; devolve o tamanho em KB. */
function webp(png, nome) {
  const destino = join(SAIDA, `${nome}.webp`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '80', destino])
  return Math.round(readFileSync(destino).length / 1024)
}

const app = (page, f, ...args) => page.evaluate(async ([fn, a]) => (await import('/app/app.js'))[fn](...a), [f, args])
const definir = (page, caminho, valor) => app(page, 'definir', caminho, valor)
const folha = (page, nome) => page.evaluate(async (n) => (await import('/app/paineis.js')).abrirFolha(n), nome)
const fecharFolha = (page) => page.evaluate(async () => (await import('/app/paineis.js')).fecharFolha())
const ferramenta = (page, f) => page.click(`[data-ferramenta="${f}"]`)
const claquete = (page, c) =>
  page.evaluate(async (k) => {
    const a = await import('/app/app.js')
    a.definir('claquete', { ...a.A.claquete, ...k })
  }, c)
const pronto = (page) => page.waitForFunction(() => !document.getElementById('cam').hidden && document.getElementById('chip-formato').textContent.includes('·'), null, { timeout: 20000 })
const parou = (page) => page.waitForFunction(() => !document.getElementById('cam').classList.contains('fechando') && !document.getElementById('cam').classList.contains('gravando'), null, { timeout: 30000 })

/** Abre o app em 24 fps (a câmera falsa entrega 24: sem o aviso de cadência), com a claquete de um set de verdade. */
async function abrir(opcoes, { limpar = true } = {}) {
  const ctx = opcoes.ctx || (await browser.newContext({ permissions: ['camera', 'microphone'], colorScheme: 'light', ...opcoes }))
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${PORTA}/`)
  if (limpar) {
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('camzro.ajustes.v1', JSON.stringify({ formato: { cadencia: '24' }, monitor: { guia: '2.39' }, claquete: { projeto: 'Maré', cena: '12', plano: 'B', take: 3 } }))
    })
    await page.reload()
  }
  await page.click('#abrir')
  await pronto(page)
  await page.waitForTimeout(2200) // o medidor de áudio e o relógio do set já mostram valores
  return { ctx, page }
}

const feitas = []
async function foto(page, nome, opcoes = {}) {
  const png = join(tmp, `${nome}.png`)
  await page.screenshot({ path: png, ...opcoes })
  feitas.push(`${nome}.webp ${webp(png, nome)} KB`)
}
async function gravar(page, ms) {
  await page.click('#gravar')
  await page.waitForFunction(() => document.getElementById('cam').classList.contains('gravando'))
  await page.waitForTimeout(ms)
}
async function parar(page) {
  await page.click('#gravar')
  await parou(page)
}

const COMPUTADOR = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 / 3 } // sai em 1920 × 1200

try {
  // computador (16:10): o herói e as ferramentas do monitor, com guia 2,39
  {
    const { ctx, page } = await abrir(COMPUTADOR)
    // forma de onda
    await ferramenta(page, 'scopes')
    await ferramenta(page, 'scopes')
    await page.waitForTimeout(1200)
    await foto(page, 'computador')
    await definir(page, 'monitor.scopes', '')
    // falsa cor (escala ARRI, com a legenda)
    await ferramenta(page, 'falsaCorLigada')
    await page.waitForTimeout(800)
    await foto(page, 'falsa-cor')
    await ferramenta(page, 'falsaCorLigada')
    // foco: peaking
    await ferramenta(page, 'pico')
    await definir(page, 'monitor.picoSensibilidade', 0.85)
    await page.waitForTimeout(800)
    await foto(page, 'foco')
    await ferramenta(page, 'pico')
    // vectorscope
    await definir(page, 'monitor.scopes', 'vetor')
    await page.waitForTimeout(1000)
    await foto(page, 'vectorscope')
    await definir(page, 'monitor.scopes', '')
    // claquete com o roteiro do Maestro
    await folha(page, 'claquete')
    await page.setInputFiles('#arquivo-roteiro', ROTEIRO)
    await page.waitForTimeout(800)
    await foto(page, 'claquete')
    await fecharFolha(page)
    // gravando: o ponto vermelho, o timecode correndo e o medidor (um take antes, para a miniatura aparecer)
    await gravar(page, 1600)
    await parar(page)
    await gravar(page, 2600)
    await foto(page, 'gravando')
    await parar(page)
    await ctx.close()
  }
  // o app cai no meio do take e, na volta, o take está lá (o mesmo caminho do teste de ponta a ponta)
  {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], colorScheme: 'light', ...COMPUTADOR })
    const { page } = await abrir({ ctx })
    await gravar(page, 4200)
    await page.close({ runBeforeUnload: false }) // como o telefone matando o app
    const { page: volta } = await abrir({ ctx }, { limpar: false })
    await volta.waitForFunction(() => /recuperad/.test(document.getElementById('aviso')?.textContent || ''), null, { timeout: 30000 })
    await folha(volta, 'biblioteca')
    await volta.waitForSelector('.clipe')
    await volta.waitForTimeout(400)
    await foto(volta, 'recuperado')
    await ctx.close()
  }
  // celular deitado (iPhone), como se filma cinema: a mesma tela do computador, na mão
  {
    const { ctx, page } = await abrir({ ...devices['iPhone 15 Pro landscape'] })
    await ferramenta(page, 'falsaCorLigada')
    await page.waitForTimeout(800)
    await foto(page, 'celular-deitado')
    // claquete na tela (o número grande, o timecode do set): no celular deitado ela enche a tela
    await ferramenta(page, 'falsaCorLigada')
    await app(page, 'abrirSlate')
    await page.waitForTimeout(600)
    await foto(page, 'slate')
    await page.click('[data-acao="fechar-slate"]')
    await ctx.close()
  }
  // imagem de compartilhar (1200 × 630): a tela gravando sobre o claro, com o nome
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const fonte = readFileSync(join(RAIZ, 'fontes/figtree-latin-wght-normal.woff2')).toString('base64')
    const tela = readFileSync(join(SAIDA, 'gravando.webp')).toString('base64')
    await page.setContent(`<!doctype html><style>@font-face{font-family:F;src:url(data:font/woff2;base64,${fonte}) format('woff2');font-weight:300 900}
      body{margin:0;width:1200px;height:630px;background:#f5f5f7;font-family:F;color:#1d1d1f;position:relative;overflow:hidden}
      .t{position:absolute;left:72px;top:150px}.t h1{margin:0;font-size:84px;letter-spacing:-.035em;line-height:1}.t h1 span{font-weight:300}.t h1 b{font-weight:800}
      .t p{margin:16px 0 0;font-size:28px;color:#6e6e73;font-weight:500}
      .m{position:absolute;left:470px;top:62px;width:820px;border-radius:22px;background:#1d1d1f;padding:12px;box-shadow:0 40px 80px -30px rgba(0,0,0,.4)}.m img{display:block;width:100%;border-radius:12px}</style>
      <div class="t"><h1><span>CAM</span><b>ZRO</b></h1><p>A câmera do set.</p></div><div class="m"><img src="data:image/webp;base64,${tela}"></div>`)
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(RAIZ, 'app/marca/og.png') })
    feitas.push('marca/og.png')
    await ctx.close()
  }
} finally {
  await browser.close()
  srv.close()
  rmSync(tmp, { recursive: true, force: true })
}
console.log(feitas.join('\n'))
writeFileSync(join(SAIDA, 'LEIAME.md'), `# Telas da página inicial\n\nGeradas por \`node scripts/telas-do-site.mjs\`: o próprio CAMZRO no Chromium, filmando um take de verdade do Coverr\n(\`products/ai-edit/marca/home/cenas/onda.mp4\`, licença no LEIAME.md de lá: uso comercial sem custo, sem pessoas\nreconhecíveis). Não edite à mão: rode o script de novo.\n`)
