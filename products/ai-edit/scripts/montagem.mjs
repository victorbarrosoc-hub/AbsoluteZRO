// A montagem da página inicial, editada no próprio AEON com footage de verdade em 50 e 60 qps (marca/home/cenas, Coverr,
// licença livre; ver marca/home/cenas/LEIAME.md). Serve também de teste de ponta a ponta com material real: o editor no
// Chromium cria um projeto 16:9 em 24 qps, importa os takes, apara pelas bordas da linha do tempo, põe uma curva pronta
// de velocidade em cada clipe (Inspector; a câmera lenta usa os quadros reais da câmera e o fluxo óptico onde faltar),
// exporta o pacote (Premiere, Final Cut, EDL; xmllint) e renderiza o vídeo final pelo render do app. A duração do vídeo
// tem de bater, quadro a quadro, com a soma dos degraus (src/velocidade.js).
// Saída: marca/home/cenas/montagem.mp4 (o render em 1080p, reduzido para 720p e recomprimido para a web), montagem.jpg, montagem.json (clipes e
// a velocidade de cada quadro, para a linha do tempo da página) e marca/home/app-velocidade.jpg (a tela do Por dentro).
//   node scripts/montagem.mjs   (depois do npm run vendor; precisa de ffmpeg, ffprobe e xmllint)
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { servir } from './servidor.mjs'
import { CURVAS, avaliar, origemNoClipe, saidaDoClipe } from '../src/velocidade.js'

// o céu, o mar, a terra e a noite: o take, o trecho que fica (segundos do take) e a curva pronta do Inspector
const PLANO = [
  { take: 'pelicano', de: 0.3, ate: 5.5, curva: 'vale' },
  { take: 'onda', de: 1.5, ate: 6.5, curva: 'heroi' },
  { take: 'cavalo', de: 0, ate: 3.6, curva: 'bala' },
  { take: 'carro', de: 0.5, ate: 5.5, curva: 'arrancada' },
  { take: 'farois', de: 0, ate: 3, curva: 'montagem' },
]
const HEROI = PLANO.findIndex((x) => x.curva === 'heroi')
const cenas = new URL('../marca/home/cenas/', import.meta.url)
const arq = (n) => fileURLToPath(new URL(n, cenas))
const dir = mkdtempSync(join(tmpdir(), 'aeon-montagem-'))
const s = await servir()
const nav = await chromium.launch()
const pagina = await nav.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1600 / 1440, acceptDownloads: true })
const erros = []
pagina.on('pageerror', (e) => erros.push(e.message))
await pagina.route('**/api/zro/eu', (r) =>
  r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, pessoa: { nome: 'Sua conta', email: 'voce@absolutezro.com', produtos: ['ai-edit'] }, acesso: true }),
  }),
)
// o seletor de arquivo do Chrome abriria uma janela: sem ele, o vídeo vai para a memória e baixa no fim
await pagina.addInitScript(() => delete globalThis.showSaveFilePicker)
await pagina.goto(s.url + 'app/')
await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
const projeto = () => pagina.evaluate(() => globalThis.__editor.h.atual)

// projeto novo em 24 qps (cinema): os takes de 50 e 60 qps dão câmera lenta com quadro real até 40–48%
await pagina.click('#novoProjeto')
await pagina.fill('#novoNome', 'Além do tempo')
await pagina.selectOption('#novoFps', '24')
await pagina.click('#novoCriar')
await pagina.locator('#nomeProjeto', { hasText: 'Além do tempo' }).waitFor()
await pagina.setInputFiles(
  '#arquivo',
  PLANO.map((x) => arq(`${x.take}.mp4`)),
)
await pagina.waitForFunction((n) => document.querySelectorAll('.cartao-mini canvas').length === n, PLANO.length)
await pagina.click('.dock [data-ir="edicao"]')
await pagina
  .locator('.clipe')
  .nth(PLANO.length - 1)
  .waitFor()
const fps = await pagina.evaluate(() => globalThis.__editor.h.atual.fps.n / globalThis.__editor.h.atual.fps.d)
assert.equal(fps, 24)

// a linha do tempo anda com mola (e se ajusta à tela): medir só depois que os clipes param
async function parada() {
  let antes = ''
  for (let k = 0; k < 40; k++) {
    const agora = await pagina.evaluate(() =>
      JSON.stringify([...document.querySelectorAll('.clipe')].map((d) => d.getBoundingClientRect()).map((r) => [r.x, r.width].map(Math.round))),
    )
    if (agora === antes) return
    antes = agora
    await pagina.waitForTimeout(150)
  }
}

// aparar pelas bordas, com Alt (sem ímã): o quanto anda na tela vira quadros pela escala da linha do tempo
async function aparar(i, borda, segundos) {
  if (!segundos) return
  await parada()
  const clipe = pagina.locator('.clipe').nth(i)
  const { linha } = await projeto()
  const c = linha.clipes[i]
  const caixa = await clipe.boundingBox()
  const escala = caixa.width / ((c.fim - c.ini) / fps)
  const b = await clipe.locator(`.borda-${borda}`).boundingBox()
  const x = b.x + b.width / 2
  const y = b.y + b.height / 2
  await pagina.mouse.move(x, y)
  await pagina.keyboard.down('Alt')
  await pagina.mouse.down()
  const dx = (borda === 'ini' ? 1 : -1) * segundos * escala
  for (let k = 1; k <= 8; k++) await pagina.mouse.move(x + (dx * k) / 8, y)
  await pagina.mouse.up()
  await pagina.keyboard.up('Alt')
  await pagina.waitForFunction(([i, f]) => globalThis.__editor.h.atual.linha.clipes[i][f.k] !== f.v, [i, { k: borda, v: c[borda] }])
}
for (let i = 0; i < PLANO.length; i++) {
  const { de, ate } = PLANO[i]
  const total = (await projeto()).midias[i].duracao
  await aparar(i, 'ini', de)
  await aparar(i, 'fim', total - ate)
}
// uma curva pronta por clipe, pelo Inspector
for (let i = 0; i < PLANO.length; i++) {
  await pagina.locator('.clipe').nth(i).click()
  const nome = CURVAS.find((c) => c.id === PLANO[i].curva).nome
  await pagina.locator('.insp-velocidade').getByRole('button', { name: nome, exact: true }).click()
  await pagina.waitForFunction((i) => globalThis.__editor.h.atual.linha.clipes[i].velocidade, i)
}
const p = await projeto()
const quadros = p.linha.clipes.reduce((s, c) => s + saidaDoClipe(c), 0)
for (const [i, c] of p.linha.clipes.entries()) {
  const quer = PLANO[i]
  assert.ok(Math.abs(c.ini / fps - quer.de) <= 2 / fps && Math.abs(c.fim / fps - quer.ate) <= 2 / fps, `${quer.take}: aparado em ${c.ini}–${c.fim}`)
}

// a tela do Por dentro: a onda selecionada, a curva Herói no Inspector e a cabeça na crista
await parada()
await pagina.locator('.clipe').nth(HEROI).click()
await pagina.locator('.insp-velocidade').scrollIntoViewIfNeeded()
const inicioOnda = p.linha.clipes.slice(0, HEROI).reduce((s, c) => s + saidaDoClipe(c), 0) + Math.round(saidaDoClipe(p.linha.clipes[HEROI]) * 0.55)
const regua = await pagina.locator('.clipe').first().boundingBox()
const escala = regua.width / (saidaDoClipe(p.linha.clipes[0]) / fps)
await pagina.mouse.click(regua.x + (inicioOnda / fps) * escala, regua.y - 10)
await pagina.evaluate(() => document.getElementById('aviso')?.classList.remove('visivel'))
await pagina.waitForFunction(() => document.querySelector('#salvo')?.dataset.estado === 'ok', null, { timeout: 5000 }).catch(() => {})
await pagina.waitForTimeout(900)
writeFileSync(new URL('../marca/home/app-velocidade.jpg', import.meta.url), await pagina.screenshot({ type: 'jpeg', quality: 85 }))

// Entrega: o pacote para os editores (xmllint) e o vídeo final, pelo render do app
await pagina.click('.dock [data-ir="entrega"]')
for (const v of ['xmeml', 'fcpxml', 'resolve', 'video']) await pagina.check(`#destinos input[value="${v}"]`)
const baixados = []
pagina.on('download', (d) => baixados.push(d))
const t0 = Date.now()
await pagina.click('#exportar')
await pagina.locator('#entregaFim:not([hidden])', { hasText: 'Pronto' }).waitFor({ timeout: 900_000 })
const quadrosFluxo = Number((await pagina.locator('#entregaFim').innerText()).match(/(\d+) quadros de câmera lenta por fluxo óptico/)?.[1] || 0)
const segundosRender = (Date.now() - t0) / 1000
while (baixados.length < 2 && Date.now() - t0 < 920_000) await pagina.waitForTimeout(200)
// (o Chromium sem tela troca nome com acento por "download": aqui cada arquivo se reconhece pelo conteúdo)
assert.equal(baixados.length, 2, 'vídeo e pacote baixados')
const bruto = join(dir, 'render.mp4')
const pacote = join(dir, 'pacote.zip')
for (const [k, d] of baixados.entries()) {
  const tmp = join(dir, `b${k}`)
  await d.saveAs(tmp)
  const zipado = readFileSync(tmp).subarray(0, 2).toString() === 'PK'
  writeFileSync(zipado ? pacote : bruto, readFileSync(tmp))
}
execFileSync('python3', ['-I', '-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', pacote, join(dir, 'pacote')])
const xmls = execFileSync('python3', ['-I', '-c', 'import glob,sys; print("\\n".join(glob.glob(sys.argv[1]+"/**/*.*ml",recursive=True)))', join(dir, 'pacote')])
  .toString()
  .trim()
  .split('\n')
for (const x of xmls) execFileSync('xmllint', ['--noout', x])
const fcp = readFileSync(
  xmls.find((x) => x.endsWith('.fcpxml')),
  'utf8',
)
const prem = readFileSync(
  xmls.find((x) => x.endsWith('.xml')),
  'utf8',
)
assert.ok((fcp.match(/<timeMap>/g) || []).length > PLANO.length, 'Final Cut com a rampa em degraus')
assert.ok((prem.match(/<effectid>timeremap<\/effectid>/g) || []).length > PLANO.length, 'Premiere com Time Remap')

// a duração do render bate com os degraus, quadro a quadro
const probe = JSON.parse(
  execFileSync('ffprobe', [
    '-v',
    'error',
    '-count_frames',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=nb_read_frames,width,height,codec_name',
    '-of',
    'json',
    bruto,
  ]).toString(),
).streams[0]
assert.equal(Number(probe.nb_read_frames), quadros, `quadros do render (${probe.nb_read_frames}) = soma dos degraus (${quadros})`)
assert.equal(`${probe.width}×${probe.height}`, '1920×1080')
assert.deepEqual(erros, [])

// para a página: o render recomprimido (mesmos quadros), o pôster na crista da onda e os dados da linha do tempo
const destino = arq('montagem.mp4')
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-y',
  '-i',
  bruto,
  '-an',
  '-vf',
  'scale=1280:720:flags=lanczos',
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '27',
  '-profile:v',
  'high',
  '-pix_fmt',
  'yuv420p',
  '-g',
  String(fps),
  '-movflags',
  '+faststart',
  '-map_metadata',
  '-1',
  destino,
])
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(inicioOnda / fps), '-i', destino, '-frames:v', '1', '-q:v', '4', arq('montagem.jpg')])
// a velocidade de cada quadro da saída, pela curva (a página mostra o número e a cabeça anda nos clipes)
let o = 0
const vel = []
const dados = {
  fps,
  duracao: quadros / fps,
  poster: inicioOnda / fps, // o quadro do montagem.jpg (a crista da onda)
  fluxo: quadrosFluxo, // quadros da câmera lenta que saíram do fluxo óptico (o resto é quadro real da câmera)
  clipes: p.linha.clipes.map((c, i) => {
    const saida = saidaDoClipe(c)
    for (let k = 0; k < saida; k++) vel.push(Math.round(avaliar(c.velocidade.pontos, (origemNoClipe(c, k) - c.ini) / (c.fim - c.ini)) * 100))
    const r = {
      take: PLANO[i].take,
      curva: CURVAS.find((x) => x.id === PLANO[i].curva).nome,
      ini: o / fps,
      fim: (o + saida) / fps,
      pontos: c.velocidade.pontos,
    }
    o += saida
    return r
  }),
  vel,
}
const arred = (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)
writeFileSync(arq('montagem.json'), JSON.stringify(dados, arred) + '\n')
console.log(
  `ok · ${PLANO.length} takes, ${quadros} quadros (${(quadros / fps).toFixed(2)} s) = render ${probe.codec_name} ${probe.width}×${probe.height} em ${segundosRender.toFixed(1)} s, ${quadrosFluxo} quadros por fluxo óptico · ${xmls.length} XML válidos`,
)

await nav.close()
s.servidor.close()
rmSync(dir, { recursive: true, force: true })
