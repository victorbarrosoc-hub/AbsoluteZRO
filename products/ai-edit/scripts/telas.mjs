// Telas de verdade do app para o site (marca/home/app-*.jpg, 1600×1000): o editor rodando no Chromium com material de
// demonstração (imagens do Higgsfield em marca/home viram vídeos aqui mesmo, com fala sintética). A transcrição é
// trocada por um roteiro fixo (a fala sintética não tem palavras); cortes, zoom, linha do tempo e legenda são os do app.
//   node scripts/telas.mjs   (depois do npm run vendor)
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { servir } from './servidor.mjs'

const FRASES = ['Todo vídeo começa no bruto.', 'Horas de material, pausas, respiros.', 'O AEON encontra cada silêncio', 'e propõe o corte.', 'Você aprova o que fica!', 'O tempo é seu.']
const destino = new URL('../marca/home/', import.meta.url)
const dir = mkdtempSync(join(tmpdir(), 'aeon-telas-'))
const s = await servir()
const nav = await chromium.launch()
const pagina = await nav.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1600 / 1440 })
pagina.on('pageerror', (e) => console.error('erro na página:', e.message))
// o AEON só abre com conta: aqui uma sessão de demonstração (nome genérico)
await pagina.route('**/api/zro/eu', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, pessoa: { nome: 'Sua conta', email: 'voce@absolutezro.com', produtos: ['ai-edit'] }, acesso: true }) }))
await pagina.goto(s.url + 'app/')
await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')

// vídeos de demonstração, gravados pelo próprio app (Mediabunny): imagem com aproximação lenta + fala sintética
const videos = await pagina.evaluate(async (FRASES) => {
  const { MB } = await import('/app/midia.js')
  const { codecsDaMaquina } = await import('/app/render.js')
  const L = 1280
  const A = 720
  const fps = 30
  async function gravar(imagem, duracao, fala) {
    const img = await createImageBitmap(await (await fetch(imagem)).blob())
    const codecs = await codecsDaMaquina(L, A)
    const tela = new OffscreenCanvas(L, A)
    const ctx = tela.getContext('2d')
    const saida = new MB.Output({ format: new MB.Mp4OutputFormat(), target: new MB.BufferTarget() })
    const v = new MB.CanvasSource(tela, { codec: codecs.video, bitrate: 4e6 })
    saida.addVideoTrack(v, { frameRate: fps })
    let a = null
    if (fala) {
      a = new MB.AudioBufferSource({ codec: codecs.audio, bitrate: 128_000 })
      saida.addAudioTrack(a)
    }
    await saida.start()
    for (let k = 0; k < duracao * fps; k++) {
      const z = 1 + 0.06 * (k / (duracao * fps))
      const w = L * z
      const h = A * z
      ctx.drawImage(img, (L - w) / 2, (A - h) / 2, w, h)
      await v.add(k / fps, 1 / fps)
    }
    if (a) {
      const taxa = 48000
      const buf = new AudioBuffer({ length: Math.round(duracao * taxa), numberOfChannels: 2, sampleRate: taxa })
      for (const w of fala)
        for (let c = 0; c < 2; c++) {
          const ch = buf.getChannelData(c)
          const i0 = Math.round(w.ini * taxa)
          const n = Math.round((w.fim - w.ini) * taxa)
          for (let i = 0; i < n; i++) ch[i0 + i] = 0.3 * Math.sin((Math.PI * i) / n) ** 0.4 * Math.sin((2 * Math.PI * (180 + 40 * Math.sin(i / 900)) * i) / taxa)
        }
      for (let c = 0; c < 2; c++) {
        const ch = buf.getChannelData(c)
        for (let i = 0; i < ch.length; i++) ch[i] += 0.0015 * (Math.random() - 0.5)
      }
      await a.add(buf)
    }
    await saida.finalize()
    return [...new Uint8Array(saida.target.buffer)]
  }
  // palavras com pausas longas entre as frases (silêncio para cortar) e uma curta no meio (respiro)
  const palavras = []
  let t = 0.6
  FRASES.forEach((f, i) => {
    for (const texto of f.split(' ')) {
      const d = 0.28 + texto.length * 0.035
      palavras.push({ texto, ini: t, fim: t + d })
      t += d + 0.07
    }
    t += i === 2 ? 0.5 : 1.3
  })
  const duracao = Math.ceil(t + 0.4)
  return {
    podcast: await gravar('/marca/home/podcast.jpg', duracao, palavras),
    aula: await gravar('/marca/home/aula.jpg', 4, null),
    viagem: await gravar('/marca/home/viagem.jpg', 4, null),
    bastidor: await gravar('/marca/home/bastidor.jpg', 4, null),
    palavras,
  }
}, FRASES)
const MIDIAS = ['podcast', 'aula', 'viagem', 'bastidor']
for (const n of MIDIAS) writeFileSync(join(dir, `${n}.mp4`), Buffer.from(videos[n]))

// transcrição: o roteiro (worker trocado, com os mesmos cabeçalhos de isolamento)
await pagina.route('**/app/transcricao-worker.js', (rota) =>
  rota.fulfill({
    contentType: 'text/javascript',
    headers: { 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' },
    body: `self.onmessage = () => self.postMessage({ tipo: 'pronto', palavras: ${JSON.stringify(videos.palavras)}, dispositivo: 'wasm', carregou: 0 })`,
  }),
)

const foto = async (nome) => {
  // sem aviso na frente e com o vídeo parado
  await pagina.evaluate(() => document.getElementById('aviso').classList.remove('visivel'))
  if ((await pagina.getAttribute('#tocar', 'aria-label')) === 'Pausar') await pagina.evaluate(() => document.querySelector('#tocar').click())
  // a barra mostra "Salvo" (o autosave terminou), não "Salvando…"
  await pagina.waitForFunction(() => !document.querySelector('#nomeProjeto')?.textContent || document.querySelector('#salvo')?.dataset.estado === 'ok', null, { timeout: 5000 }).catch(() => {})
  await pagina.waitForTimeout(700)
  writeFileSync(new URL(`${nome}.jpg`, destino), await pagina.screenshot({ type: 'jpeg', quality: 85 }))
  console.log('ok', nome)
}

await pagina.setInputFiles('#arquivo', MIDIAS.map((n) => join(dir, `${n}.mp4`)))
await pagina.locator('.cartao-midia').nth(MIDIAS.length - 1).waitFor()
await pagina.waitForFunction((n) => document.querySelectorAll('.cartao-mini canvas').length === n, MIDIAS.length)
await pagina.click('#nomeProjeto')
await pagina.keyboard.press('Control+a')
await pagina.keyboard.type('Podcast · Episódio 12')
await pagina.keyboard.press('Enter')
await foto('app-midia')

await pagina.click('#analisar')
await pagina.waitForFunction(() => document.body.dataset.pagina === 'revisar')
await pagina.locator('.proposta').nth(1).click()
await pagina.evaluate(() => document.querySelector('#tocar').click())
await pagina.waitForTimeout(1200)
await pagina.evaluate(() => document.querySelector('#tocar').click())
await foto('app-revisar')

await pagina.click('#aprovarTodos')
await pagina.click('.dock [data-ir="edicao"]')
await pagina.locator('.clipe').first().waitFor()
const n = await pagina.locator('.clipe').count()
const marcar = async (i, cor, etiqueta) => {
  await pagina.locator('.clipe').nth(i).click()
  await pagina.click(`.paleta [data-cor="${cor}"]`)
  await pagina.fill('.etiqueta-campo', etiqueta)
  await pagina.press('.etiqueta-campo', 'Enter')
}
await marcar(0, 'laranja', 'Gancho')
await marcar(n - 3, 'azul', 'Aula')
await marcar(n - 2, 'menta', 'B-roll')
await marcar(n - 1, 'menta', 'B-roll')
await marcar(2, 'verde', 'Melhor take')
// a viagem com a rampa Herói (o selo aparece no clipe)
await pagina.locator('.clipe').nth(n - 2).click()
await pagina.locator('.insp-velocidade').getByRole('button', { name: 'Herói' }).click()
// marcador e o ponto numa frase com legenda
const caixa = await pagina.locator('.clipe').nth(3).boundingBox()
await pagina.mouse.click(caixa.x + caixa.width * 0.4, caixa.y - 10)
await pagina.keyboard.press('m')
await pagina.locator('.clipe').nth(2).click()
await pagina.mouse.click(caixa.x + caixa.width * 0.55, caixa.y - 10)
// no Inspector, a viagem com a curva Herói
await pagina.locator('.clipe').nth(n - 2).click()
await pagina.locator('.insp-velocidade').scrollIntoViewIfNeeded()
await foto('app-edicao')

await pagina.click('#abasPainel [data-aba="texto"]')
await foto('app-texto')

await pagina.click('.dock [data-ir="entrega"]')
await foto('app-entrega')

await pagina.click('#tema')
await pagina.click('.dock [data-ir="edicao"]')
await pagina.click('#abasPainel [data-aba="inspector"]')
await foto('app-edicao-claro')

await nav.close()
s.servidor.close()
rmSync(dir, { recursive: true, force: true })
