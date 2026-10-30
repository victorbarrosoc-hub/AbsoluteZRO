// O editor completo no Chromium de verdade: cadência exata, recorte com giro e espelho, trecho com volume e a cor da
// Revela (S-Log3 → Rec.709, com e sem look) saindo do motor do navegador, conferidos com o ffmpeg e com a conta da
// Revela; e a folha do editor com os grupos novos.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { especificacaoDe, presetPersonalizado } from '../src/personalizado.js'
import { preset } from '../src/presets.js'
import { escreverCube } from '../src/revela/cube.js'
import { abrir, ff, medirSsim, pasta, sondar, temFfmpeg } from './apoio.js'
import { FAIXAS, centros, esperado, maiorDiferenca, quadroRgb48 } from './carta.js'
import { funcaoDaReceita } from '../src/cor.js'

const pular = !temFfmpeg && 'sem ffmpeg'
let s
const meu = (mudar) => presetPersonalizado({ ...especificacaoDe(preset('youtube-1080')), nome: 'Teste', qualidade: 'bitrate', kbps: 20000, ...mudar })

/** Converte no navegador com um preset da pessoa; `cube` (texto) vira um look guardado no aparelho antes. */
async function converter(pagina, entrada, p, saida, cube = null) {
  const r = await pagina.evaluate(
    async ([entrada, p, saida, cube]) => {
      const m = await import('/app/motor.js')
      const Looks = await import('/app/looks.js')
      m.usarEscala('gpu')
      if (cube) {
        const look = await Looks.guardar('Teste', cube)
        p = { ...p, cor: { ...p.cor, look } }
      }
      const arquivo = new File([await (await fetch(`/teste-arquivo/${entrada}`)).blob()], entrada)
      const r = await m.converterArquivo(arquivo, p, { lerLook: Looks.ler })
      await fetch(`/teste-saida/${encodeURIComponent(saida)}`, { method: 'POST', body: r.blob })
      return { avisos: r.avisos, plano: r.plano }
    },
    [entrada, p, saida, cube],
  )
  return { ...r, caminho: join(pasta, saida) }
}

const rgbDoPrimeiro = (arquivo) => execFileSync('ffmpeg', ['-v', 'error', '-i', arquivo, '-frames:v', '1', '-vf', 'scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgb24', '-f', 'rawvideo', '-'])

before(async () => {
  if (!temFfmpeg) return
  ff('-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=2', '-c:v', 'libx264', '-crf', '10', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', join(pasta, 'trinta.mp4'))
  ff('-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=440:d=4:sample_rate=48000', '-filter:a', 'volume=-20dB', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', join(pasta, 'com-som.mov'))
  writeFileSync(join(pasta, 'carta.rgb'), quadroRgb48(640, 360))
  ff('-stream_loop', '11', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', '640x360', '-r', '24', '-i', join(pasta, 'carta.rgb'), '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv422p10le', '-c:v', 'prores_ks', '-profile:v', '3', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', join(pasta, 'slog3.mov'))
  s = await abrir()
})
after(async () => {
  await s?.fechar()
  rmSync(pasta, { recursive: true, force: true })
})

test('cadência exata no navegador: 30 fps → 23,976 (24000/1001), quadros repetidos ou descartados', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  const r = await converter(p, 'trinta.mp4', meu({ fps: 23.976, fpsModo: 'constante' }), 'cad.mp4')
  const v = sondar(r.caminho).streams.find((x) => x.codec_type === 'video')
  const [a, b] = v.avg_frame_rate.split('/').map(Number)
  assert.ok(Math.abs(a / b - 24000 / 1001) < 1e-4, `${v.avg_frame_rate}: o 23,976 dos editores é 24000/1001`)
  assert.ok(Math.abs(Number(v.nb_frames) - 48) <= 2, v.nb_frames)
  assert.ok(r.avisos.some((x) => /23,976 fps exatos/.test(x)))
  assert.deepEqual(s.erros, [])
  await p.close()
})

test('recorte, giro e espelho no navegador: o mesmo quadro que o ffmpeg faz', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  const preset = meu({ lado: null, recorte: { cima: 40, baixo: 40, esquerda: 80, direita: 0 }, giro: 90, espelhar: true })
  const r = await converter(p, 'trinta.mp4', preset, 'giro.mp4')
  const v = sondar(r.caminho).streams.find((x) => x.codec_type === 'video')
  // 1280×720 girado = 720×1280; menos 80 na largura e 80 na altura
  assert.deepEqual([v.width, v.height], [640, 1200])
  const ssim = medirSsim(r.caminho, join(pasta, 'trinta.mp4'), 'transpose=clock,hflip,crop=iw-80:ih-80:80:40')
  assert.ok(ssim > 0.95, `SSIM ${ssim}`)
  assert.deepEqual(s.erros, [])
  await p.close()
})

test('trecho e volume no navegador: 1 s a 3 s, 6 dB mais alto', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  const r = await converter(p, 'com-som.mov', meu({ inicio: 1, fim: 3, ganho: 6 }), 'trecho.mp4')
  const info = sondar(r.caminho)
  assert.ok(Math.abs(Number(info.format.duration) - 2) < 0.15, info.format.duration)
  const medir = (arquivo) => Number(/mean_volume: (-?[\d.]+) dB/.exec(spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', arquivo, '-af', 'volumedetect', '-f', 'null', '-']).stderr.toString())[1])
  const ganho = medir(r.caminho) - medir(join(pasta, 'com-som.mov'))
  assert.ok(Math.abs(ganho - 6) < 0.6, `ganho medido ${ganho.toFixed(2)} dB`)
  assert.deepEqual(s.erros, [])
  await p.close()
})

test('cor da Revela na placa, antes do codificador: a conta da Revela sobre o que o navegador decodificou', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  const cor = { entrada: 'sony-slog3-cine', entradaNome: 'S-Log3', tom: 'suave', look: null }
  // o mesmo quadro duas vezes pela placa: sem cor (o RGB que o navegador entregou) e com a cor
  const [entrada, saida] = await p.evaluate(async (cor) => {
    const { MB } = await import('/app/motor.js')
    const { criarEscala } = await import('/app/escala.js')
    const { etapasParaPlaca } = await import('/src/cor.js')
    const input = new MB.Input({ source: new MB.BlobSource(await (await fetch('/teste-arquivo/slog3.mov')).blob()), formats: MB.ALL_FORMATS })
    const sink = new MB.VideoSampleSink(await input.getPrimaryVideoTrack())
    // a cor do arquivo (o decodificador de ProRes marca errado)
    const preparar = async (a) => {
      const dados = new Uint8Array(a.allocationSize())
      const layout = await a.copyTo(dados)
      return new MB.VideoSample(dados, { format: a.format, codedWidth: a.codedWidth, codedHeight: a.codedHeight, timestamp: a.timestamp, layout, colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false } })
    }
    const d = { width: 640, height: 360, fit: 'fill', rotation: 0, flip: false, crop: { left: 0, top: 0, width: 640, height: 360 } }
    const centros = async (etapas) => {
      const escala = criarEscala(MB.VideoSample, { forcar: true })
      if (etapas) escala.definirCor(etapas, true)
      const original = await sink.getSample(0)
      const q = await escala.transformar(original, d, preparar)
      const i420 = new Uint8Array(q.allocationSize())
      await q.copyTo(i420)
      q.close()
      original.close()
      // I420 BT.709 de faixa de TV → RGB de 0 a 1, no centro de cada faixa
      return Array.from({ length: 8 }, (_, i) => {
        const x = 80 * i + 40
        const y = 180
        const Y = (i420[y * 640 + x] - 16) / 219
        const cb = (i420[640 * 360 + (y >> 1) * 320 + (x >> 1)] - 128) / 224
        const cr = (i420[640 * 360 * 1.25 + (y >> 1) * 320 + (x >> 1)] - 128) / 224
        return [Y + 1.5748 * cr, Y - 0.187324 * cb - 0.468124 * cr, Y + 1.8556 * cb]
      })
    }
    return [await centros(null), await centros(etapasParaPlaca(cor))]
  }, cor)
  const f = funcaoDaReceita(cor)
  const alvo = entrada.map((rgb) => f(...rgb.map((v) => (v * 876 + 64) / 1023)).map((v) => v * 255))
  const medido = saida.map((rgb) => rgb.map((v) => Math.min(1, Math.max(0, v)) * 255))
  const erro = maiorDiferenca(medido, alvo)
  // a medida passa pelo I420 de 8 bits (entrada e saída): só isso já dá até ~3/255 nas cores, ampliado pela CST
  assert.ok(erro <= 4, `conta na placa: diferença de ${erro.toFixed(1)}/255\n${JSON.stringify(medido.map((x) => x.map(Math.round)))}\n${JSON.stringify(alvo.map((x) => x.map(Math.round)))}`)
  assert.deepEqual(s.erros, [])
  await p.close()
})

test('cor da Revela no navegador: S-Log3 sai Rec.709 com as cores da Revela, com e sem look', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  const cor = { entrada: 'sony-slog3-cine', entradaNome: 'S-Log3 / S-Gamut3.Cine', tom: 'suave', look: null }
  const r = await converter(p, 'slog3.mov', meu({ lado: null, cor }), 'slog3-709.mp4')
  const v = sondar(r.caminho).streams.find((x) => x.codec_type === 'video')
  assert.deepEqual([v.width, v.height, v.color_primaries, v.color_transfer, v.color_space], [640, 360, 'bt709', 'bt709', 'bt709'])
  const medido = centros(rgbDoPrimeiro(r.caminho), 640, 360)
  const erro = maiorDiferenca(medido, esperado(cor))
  // de ponta a ponta entra o codificador H.264 do navegador: sem cor nenhuma ele já desvia ~3/255 no croma
  // (medido), e a CST amplia isso nas cores saturadas; o cinza fica no arredondamento
  assert.ok(erro <= 7, `CST: diferença de ${erro.toFixed(1)}/255\n${JSON.stringify(medido)}\n${JSON.stringify(esperado(cor).map((x) => x.map(Math.round)))}`)
  assert.ok(maiorDiferenca(medido.slice(0, 4), esperado(cor).slice(0, 4)) <= 2, 'cinzas')

  // com um look (.cube) guardado no aparelho: esquenta e sobe o contraste, depois da CST
  const n = 17
  const dados = new Float32Array(n ** 3 * 3)
  let i = 0
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let rr = 0; rr < n; rr++) {
        const c = [rr, g, b].map((x) => x / (n - 1))
        const k = (x) => Math.min(1, Math.max(0, 0.5 + (x - 0.5) * 1.15))
        dados[i++] = k(c[0] * 1.06)
        dados[i++] = k(c[1])
        dados[i++] = k(c[2] * 0.9)
      }
  const look = { tamanho: n, dados }
  const r2 = await converter(p, 'slog3.mov', meu({ lado: null, cor }), 'slog3-look.mp4', escreverCube(look, 'Teste'))
  const erroLook = maiorDiferenca(centros(rgbDoPrimeiro(r2.caminho), 640, 360), esperado({ ...cor, look: { id: 'look-teste', nome: 'Teste' } }, look))
  assert.ok(erroLook <= 7, `CST + look: diferença de ${erroLook.toFixed(1)}/255`)
  assert.deepEqual(s.erros, [])
  await p.close()
})

test('look de log no navegador (sem CST): a LUT lê o código da câmera, não o Rec.709 esticado', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  // LUT identidade de 2 pontos com "# Entrada:" de log: a saída tem de ser o próprio código da câmera
  const identidade = { tamanho: 2, dados: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1]) }
  const cube = escreverCube(identidade, 'Câmera', ['Entrada: Sony S-Log3 / S-Gamut3.Cine', 'Saída: Rec.709 Gama 2.4'])
  const r = await p.evaluate(
    async ([cube]) => {
      const m = await import('/app/motor.js')
      const Looks = await import('/app/looks.js')
      m.usarEscala('gpu')
      const look = await Looks.guardar('Câmera', cube)
      const P = await import('/src/personalizado.js')
      const { preset } = await import('/src/presets.js')
      const pr = P.presetPersonalizado({ ...P.especificacaoDe(preset('youtube-1080')), nome: 'x', lado: null, qualidade: 'bitrate', kbps: 20000, cor: { look: { id: look.id, nome: look.nome, ...(look.pedeLog ? { sobre: 'log' } : {}) } } })
      const arquivo = new File([await (await fetch('/teste-arquivo/slog3.mov')).blob()], 'slog3.mov')
      const out = await m.converterArquivo(arquivo, pr, { lerLook: Looks.ler })
      await fetch('/teste-saida/look-log.mp4', { method: 'POST', body: out.blob })
      return { pedeLog: look.pedeLog }
    },
    [cube],
  )
  assert.equal(r.pedeLog, true)
  const medido = centros(rgbDoPrimeiro(join(pasta, 'look-log.mp4')), 640, 360)
  const alvo = FAIXAS.map((c) => c.map((v) => v * 255))
  // cinzas: o código da câmera (0,41 → 105), não o esticado (0,41 → ~98)
  assert.ok(maiorDiferenca(medido.slice(0, 4), alvo.slice(0, 4)) <= 2, `${JSON.stringify(medido)} × ${JSON.stringify(alvo.map((x) => x.map(Math.round)))}`)
  assert.deepEqual(s.erros, [])
  await p.close()
})

test('editor: 23,976, grupos de recorte, trecho, computador e cor; a ficha acompanha', { skip: pular }, async () => {
  const p = await s.nova('/converter')
  await p.waitForFunction(() => window.relayPronto)
  await p.locator('.aba', { hasText: 'Meus' }).click()
  await p.locator('.preset', { hasText: 'Criar preset' }).click()
  await p.waitForSelector('dialog.folha[open]')
  await p.selectOption('.folha select[aria-label="Cadência"]', { label: '23,976 fps' })
  await p.locator('.folha .segmentos button', { hasText: 'Exata' }).click()
  assert.match(await p.locator('.folha .ficha-tecnica').textContent(), /23,976 fps exatos/)
  for (const g of ['Recorte e giro', 'Trecho', 'No computador · Máxima qualidade']) assert.equal(await p.locator('.folha details summary', { hasText: g }).count(), 1, g)
  await p.locator('.folha details.grupo--revela summary').click()
  await p.selectOption('.folha select[aria-label="Log da câmera"]', { label: 'Sony · S-Log3 / S-Gamut3.Cine' })
  await p.waitForFunction(() => /S-Log3 \/ S-Gamut3\.Cine → Rec\.709/.test(document.querySelector('.folha .ficha-tecnica').textContent))
  await p.locator('.folha details summary', { hasText: 'Trecho' }).click()
  await p.fill('.folha input[aria-label="Início"]', '0:05')
  await p.fill('.folha input[aria-label="Fim"]', '0:20')
  assert.match(await p.locator('.folha .ficha-tecnica').textContent(), /0:05 → 0:20/)
  await p.click('.folha-acoes .vidro--tinta')
  await p.waitForSelector('.aba[aria-selected="true"]:has-text("Meus")')
  const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('relay-meus-presets')).presets.at(-1))
  assert.deepEqual([guardado.fps, guardado.fpsModo, guardado.inicio, guardado.fim, guardado.cor.entrada], [23.976, 'constante', 5, 20, 'sony-slog3-cine'])
  assert.deepEqual(s.erros, [])
  await p.close()
})
