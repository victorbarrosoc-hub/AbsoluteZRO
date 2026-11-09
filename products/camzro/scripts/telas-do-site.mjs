// CAMZRO · as telas de verdade da página inicial (app/site/*.webp) e a imagem de compartilhar (app/marca/og.png).
// O app roda num Chromium com a câmera falsa filmando um take de verdade (a praia do Coverr que o AEON já usa,
// products/ai-edit/marca/home/cenas/onda.mp4; licença em LEIAME.md de lá) convertido na hora para .y4m numa pasta
// temporária. Mudou a interface: `node scripts/telas-do-site.mjs` (precisa do ffmpeg e do Chromium do Playwright).

import { chromium, devices } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const SAIDA = join(RAIZ, 'app/site')
const TAKE = fileURLToPath(new URL('../../ai-edit/marca/home/cenas/onda.mp4', import.meta.url))
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

/** PNG → WebP (qualidade 82) com o ffmpeg; devolve o tamanho em KB. */
function webp(png, nome) {
  const destino = join(SAIDA, `${nome}.webp`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '82', destino])
  return Math.round(readFileSync(destino).length / 1024)
}

async function abrir(opcoes) {
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], colorScheme: 'light', ...opcoes })
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${PORTA}/`)
  await page.evaluate(() => localStorage.clear())
  await page.click('#abrir')
  await page.waitForFunction(() => document.getElementById('chip-formato').textContent.includes('·'))
  await page.waitForTimeout(1500)
  return { ctx, page }
}
const folha = (page, nome) => page.evaluate(async (n) => (await import('/app/paineis.js')).abrirFolha(n), nome)
const fecharFolha = (page) => page.evaluate(async () => (await import('/app/paineis.js')).fecharFolha())
const ferramenta = (page, f) => page.click(`[data-ferramenta="${f}"]`)
const claquete = (page, c) =>
  page.evaluate(async (k) => {
    const app = await import('/app/app.js')
    app.definir('claquete', { ...app.A.claquete, ...k })
  }, c)

const feitas = []
async function foto(page, nome, opcoes = {}) {
  const png = join(tmp, `${nome}.png`)
  await page.screenshot({ path: png, ...opcoes })
  feitas.push(`${nome}.webp ${webp(png, nome)} KB`)
}

try {
  // computador (16:10): o herói e o "aparelhos", com guia 2,39, forma de onda e os medidores
  {
    const { ctx, page } = await abrir({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })
    await claquete(page, { projeto: 'Maré', cena: '12', plano: 'B', take: 3 })
    await page.evaluate(async () => (await import('/app/app.js')).definir('monitor.guia', '2.39'))
    await ferramenta(page, 'scopes')
    await ferramenta(page, 'scopes') // forma de onda
    await page.waitForTimeout(1200)
    await foto(page, 'computador')
    // falsa cor
    await page.evaluate(async () => (await import('/app/app.js')).definir('monitor.scopes', ''))
    await ferramenta(page, 'falsaCorLigada')
    await page.waitForTimeout(800)
    await foto(page, 'falsa-cor')
    await ferramenta(page, 'falsaCorLigada')
    // foco: peaking
    await ferramenta(page, 'pico')
    await page.evaluate(async () => (await import('/app/app.js')).definir('monitor.picoSensibilidade', 0.85))
    await page.waitForTimeout(800)
    await foto(page, 'foco')
    await ferramenta(page, 'pico')
    // scopes: vectorscope
    await page.evaluate(async () => (await import('/app/app.js')).definir('monitor.scopes', 'vetor'))
    await page.waitForTimeout(1000)
    await foto(page, 'vectorscope')
    await page.evaluate(async () => (await import('/app/app.js')).definir('monitor.scopes', ''))
    // obturador com anti-flicker
    await page.evaluate(async () => (await import('/app/app.js')).definir('formato.cadencia', '24'))
    await page.waitForTimeout(1500)
    await folha(page, 'obturador')
    await page.waitForTimeout(500)
    await foto(page, 'obturador')
    await fecharFolha(page)
    // claquete com o roteiro do Maestro
    await folha(page, 'claquete')
    await page.setInputFiles('#arquivo-roteiro', fileURLToPath(new URL('../../../docs/integration-contracts/exemplos/maestro.roteiro.v1.json', import.meta.url)))
    await page.waitForTimeout(800)
    await foto(page, 'claquete')
    await fecharFolha(page)
    // grava dois takes e mostra os clipes
    for (let i = 0; i < 2; i++) {
      await page.click('#gravar')
      await page.waitForTimeout(1600)
      await page.click('#gravar')
      await page.waitForFunction(() => !document.getElementById('cam').classList.contains('fechando') && !document.getElementById('cam').classList.contains('gravando'), null, { timeout: 30000 })
    }
    await page.evaluate(async () => (await import('/app/biblioteca.js')).marcarBom())
    await folha(page, 'biblioteca')
    await page.waitForTimeout(800)
    await foto(page, 'clipes')
    await fecharFolha(page)
    // gravando: o ponto vermelho e o timecode correndo
    await page.click('#gravar')
    await page.waitForTimeout(1300)
    await foto(page, 'gravando')
    await page.click('#gravar')
    await page.waitForTimeout(1500)
    await ctx.close()
  }
  // celular em pé (iPhone): visor em cima, controles embaixo
  {
    const { ctx, page } = await abrir({ ...devices['iPhone 15 Pro'] })
    await claquete(page, { cena: '12', plano: 'B', take: 3 })
    await ferramenta(page, 'guias')
    await page.waitForTimeout(800)
    await foto(page, 'celular')
    await ctx.close()
  }
  // imagem de compartilhar (1200 × 630): a tela do computador sobre o claro, com o nome
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const fonte = readFileSync(join(RAIZ, 'fontes/figtree-latin-wght-normal.woff2')).toString('base64')
    const tela = readFileSync(join(SAIDA, 'computador.webp')).toString('base64')
    await page.setContent(`<!doctype html><style>@font-face{font-family:F;src:url(data:font/woff2;base64,${fonte}) format('woff2');font-weight:300 900}
      body{margin:0;width:1200px;height:630px;background:#f5f5f7;font-family:F;color:#1d1d1f;display:grid;grid-template-columns:430px 1fr;align-items:center;overflow:hidden}
      .t{padding:0 0 0 72px}.t h1{margin:0;font-size:92px;letter-spacing:-.03em;line-height:1}.t h1 span{font-weight:300}.t h1 b{font-weight:800}
      .t p{margin:18px 0 0;font-size:30px;color:#6e6e73;font-weight:500}
      .m{margin-left:10px;border-radius:22px;background:#1d1d1f;padding:12px;width:860px;box-shadow:0 40px 80px -30px rgba(0,0,0,.4)}.m img{display:block;width:100%;border-radius:12px}</style>
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
