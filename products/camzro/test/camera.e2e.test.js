// A câmera de ponta a ponta num Chromium de verdade, com a câmera e o microfone falsos do navegador:
// abre, grava, para, e confere o ARQUIVO (contêiner, codec, cadência constante, áudio PCM 24 bits, duração, ficha),
// a biblioteca e os exports. E o teste que importa num set: o app cai no meio do take e o take volta.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const PORTA = 8192
let srv
let browser

before(async () => {
  process.env.CAMZRO_LOCAL = '1'
  delete process.env.ZRO_CLIENT_ID
  delete process.env.ZRO_CLIENT_SECRET
  const { servir } = await import('../scripts/servir.mjs')
  srv = await servir({ porta: PORTA })
  browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
})
after(async () => {
  await browser?.close()
  srv?.close()
})

async function abrir(contexto) {
  const page = await contexto.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push(e.message))
  await page.goto(`http://localhost:${PORTA}/`)
  await page.click('#abrir')
  await page.waitForFunction(() => !document.getElementById('cam').hidden && document.getElementById('chip-formato').textContent.includes('·'), null, { timeout: 15000 })
  return { page, erros }
}

/** Lê um arquivo do armazém do site e devolve a ficha (Mediabunny dentro da página). */
const fichaNoNavegador = (page, nome) =>
  page.evaluate(async (n) => {
    const MB = await import('/app/vendor/mediabunny.min.mjs')
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('clipes')
    const f = await (await dir.getFileHandle(n)).getFile()
    const entrada = new MB.Input({ source: new MB.BlobSource(f), formats: MB.ALL_FORMATS })
    const v = await entrada.getPrimaryVideoTrack()
    const a = await entrada.getPrimaryAudioTrack()
    const st = await v.computePacketStats()
    return { formato: (await entrada.getFormat()).name, tamanho: f.size, duracao: await entrada.computeDuration(), video: v.codec, quadros: st.packetCount, fps: st.averagePacketRate, audio: a?.codec, taxa: a?.sampleRate, canais: a?.numberOfChannels }
  }, nome)

const listar = (page) =>
  page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('clipes')
    const o = []
    for await (const [n] of dir.entries()) o.push(n)
    return o.sort()
  })

test('grava um take: MOV H.264, cadência constante, PCM 24 bits, ficha e claquete', async () => {
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] })
  const { page, erros } = await abrir(ctx)
  // claquete: cena 12, plano B
  await page.click('#claquete')
  await page.fill('[data-campo="claquete.cena"]', '12')
  await page.press('[data-campo="claquete.cena"]', 'Tab')
  await page.fill('[data-campo="claquete.plano"]', 'B')
  await page.press('[data-campo="claquete.plano"]', 'Tab')
  await page.click('#folha [data-acao="fechar-folha"]')
  await page.click('#gravar')
  await page.waitForFunction(() => document.getElementById('cam').classList.contains('gravando'))
  await page.waitForTimeout(2600)
  await page.click('#gravar')
  await page.waitForFunction(() => !document.getElementById('cam').classList.contains('gravando') && !document.getElementById('cam').classList.contains('fechando'), null, { timeout: 30000 })
  const arquivos = await listar(page)
  const mov = arquivos.find((n) => n.endsWith('.mov'))
  assert.ok(mov, JSON.stringify(arquivos))
  assert.match(mov, /^A001C001_\d{6}_[2-9A-HJKMNP-Z]{4}\.mov$/)
  assert.ok(!arquivos.some((n) => n.includes('.gravando.')), 'sobrou o arquivo de gravação')
  const f = await fichaNoNavegador(page, mov)
  assert.equal(f.video, 'avc')
  assert.equal(f.audio, 'pcm-s24')
  assert.equal(f.canais, 2)
  assert.ok(f.duracao > 2 && f.duracao < 4, String(f.duracao))
  // cadência constante: 30 quadros por segundo (a câmera falsa entrega menos; o CAMZRO repete o quadro no relógio)
  assert.ok(Math.abs(f.fps - 30) < 0.5, String(f.fps))
  const sidecar = await page.evaluate(async (n) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('clipes')
    return JSON.parse(await (await (await dir.getFileHandle(n.replace(/\.mov$/, '.json'))).getFile()).text())
  }, mov)
  assert.equal(sidecar.formato, 'camzro.clip/1')
  assert.equal(sidecar.arquivo, mov)
  assert.equal(sidecar.claquete.cena, '12')
  assert.equal(sidecar.claquete.plano, 'B')
  assert.equal(sidecar.claquete.take, 1)
  assert.equal(sidecar.fps, 30)
  assert.match(sidecar.timecode.inicio, /^\d{2}:\d{2}:\d{2}:\d{2}$/)
  assert.equal(sidecar.video.motor, 'webcodecs')
  assert.equal(sidecar.fechado, true)
  // o take sobe sozinho
  assert.match(await page.textContent('#claquete-texto'), /Cena 12 · B · Take 2/)
  // biblioteca: o clipe aparece com cena-plano-take
  await page.click('#biblioteca')
  await page.waitForSelector('.clipe')
  assert.match(await page.textContent('.clipe'), /12B-1/)
  // bom take
  await page.click('.clipe [data-acao="bom"]')
  await page.waitForSelector('.clipe [data-acao="bom"][aria-pressed="true"]')
  assert.deepEqual(erros, [])
  await ctx.close()
})

test('o app cai no meio do take: na volta, o take é recuperado e abre', async () => {
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] })
  const { page } = await abrir(ctx)
  await page.click('#gravar')
  await page.waitForFunction(() => document.getElementById('cam').classList.contains('gravando'))
  await page.waitForTimeout(3500) // mais de um fragmento (1 s cada) já no disco
  const antes = await listar(page)
  assert.ok(antes.some((n) => n.includes('.gravando.mp4')), JSON.stringify(antes))
  // derruba a página sem parar (como o telefone matando o app); beforeunload não roda
  await page.close({ runBeforeUnload: false })
  const { page: volta } = await abrir(ctx)
  // espera a recuperação terminar: sem arquivo de gravação, com o vídeo e a ficha marcada "recuperado"
  const pronto = () =>
    volta.evaluate(async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('clipes')
      const n = []
      for await (const [k] of dir.entries()) n.push(k)
      if (n.some((k) => k.includes('.gravando.')) || !n.some((k) => /\.(mov|mp4)$/.test(k))) return false
      const j = n.find((k) => k.endsWith('.json'))
      try {
        return Boolean(j && JSON.parse(await (await (await dir.getFileHandle(j)).getFile()).text()).recuperado)
      } catch {
        return false
      }
    })
  const limite = Date.now() + 30000
  while (!(await pronto())) {
    assert.ok(Date.now() < limite, 'a recuperação não terminou em 30 s')
    await volta.waitForTimeout(300)
  }
  const arquivos = await listar(volta)
  const video = arquivos.find((n) => /\.(mov|mp4)$/.test(n))
  const f = await fichaNoNavegador(volta, video)
  assert.ok(f.duracao >= 1, `recuperou ${f.duracao} s`)
  assert.equal(f.video, 'avc')
  const sidecar = await volta.evaluate(async (n) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('clipes')
    return JSON.parse(await (await (await dir.getFileHandle(n.replace(/\.(mov|mp4)$/, '.json'))).getFile()).text())
  }, video)
  assert.equal(sidecar.recuperado, true)
  await ctx.close()
})

test('exports da diária: CSV do DaVinci, ALE e relatório saem dos sidecars', async () => {
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], acceptDownloads: true })
  const { page } = await abrir(ctx)
  await page.click('#gravar')
  await page.waitForTimeout(1500)
  await page.click('#gravar')
  await page.waitForFunction(() => !document.getElementById('cam').classList.contains('fechando') && !document.getElementById('cam').classList.contains('gravando'), null, { timeout: 30000 })
  await page.click('#biblioteca')
  await page.waitForSelector('.clipe')
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-acao="csv"]')])
  const texto = await (await csv.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'))
  assert.match(texto, /^File Name,Scene,Shot,Take,Good Take,Camera #,Angle,Roll Card #/)
  assert.match(texto, /\r\nA001C001_\d{6}_\w{4}\.mov,1,A,1,/)
  const [ale] = await Promise.all([page.waitForEvent('download'), page.click('[data-acao="ale"]')])
  assert.match(ale.suggestedFilename(), /\.ale$/)
  await ctx.close()
})

test('gravador simples (reserva para navegador sem WebCodecs): grava e a ficha diz o motor', async () => {
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] })
  const { page, erros } = await abrir(ctx)
  await page.evaluate(async () => ((await import('/app/app.js')).S.forcarSimples = true))
  await page.click('#gravar')
  await page.waitForFunction(() => document.getElementById('cam').classList.contains('gravando'))
  await page.waitForTimeout(2500)
  await page.click('#gravar')
  await page.waitForFunction(() => !document.getElementById('cam').classList.contains('gravando') && !document.getElementById('cam').classList.contains('fechando'), null, { timeout: 30000 })
  const arquivos = await listar(page)
  const video = arquivos.find((n) => /\.(mp4|webm)$/.test(n) && !n.includes('.gravando.'))
  assert.ok(video, JSON.stringify(arquivos))
  const f = await fichaNoNavegador(page, video)
  assert.ok(f.duracao > 1.5, String(f.duracao))
  const sidecar = await page.evaluate(async (n) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('clipes')
    return JSON.parse(await (await (await dir.getFileHandle(n.replace(/\.(mp4|webm)$/, '.json'))).getFile()).text())
  }, video)
  assert.equal(sidecar.video.motor, 'mediarecorder')
  assert.deepEqual(erros, [])
  await ctx.close()
})
