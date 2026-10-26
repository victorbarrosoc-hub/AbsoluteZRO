// "Converter com a Revela" (src/media/revela.js, src/server/revela.js, src/engine/pedidos-revela.js): os presets são
// os da Revela (cópia conferida), a leitura do ffmpeg vira o que o plano espera, a linha de comando leva bitrate, tags
// BT.709 e AAC, e — com o ffmpeg de verdade e o Drive falso — um ProRes do Drive vira o MP4 do YouTube na mesma pasta,
// com o MD5 conferido. O celular converte no próprio aparelho (test/revela-celular.test.js) com as mesmas cópias.
import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { argsRevela, converterComRevela, destinoRevela, origemDoProbe, DESTINOS_REVELA, REVELA_MARCA } from '../src/media/revela.js'
import { planejar } from '../src/revela/conversao/plano.js'
import { RevelaJobs, destinosParaTela } from '../src/server/revela.js'
import { GeradorPrevias } from '../src/media/previa-fila.js'
import { detectarMotor } from '../src/media/previa.js'
import { closeHttp } from '../src/net/http.js'
import { setupDrive, md5File } from './helpers.js'

after(() => closeHttp())

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const FINISHING = path.join(RAIZ, '..', 'finishing')
const ler = p => fs.readFile(p)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const ffmpegDoSistema = (() => {
  try {
    const r = spawnSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' })
    return r.status === 0 ? r.stdout.trim() : null
  } catch {
    return null
  }
})()
const ffprobe = (() => {
  try {
    return spawnSync('ffprobe', ['-version'], { encoding: 'utf8' }).status === 0
  } catch {
    return false
  }
})()

const PRORES = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'x.mov':
  Duration: 00:01:00.00, start: 0.000000, bitrate: 700000 kb/s
  Stream #0:0[0x1]: Video: prores (HQ) (apch / 0x68637061), yuv422p10le(tv, bt709, progressive), 3840x2160, 698000 kb/s, SAR 1:1 DAR 16:9, 23.98 fps, 23.98 tbr, 24k tbn (default)
  Stream #0:1[0x2]: Audio: pcm_s24le (in24 / 0x34326E69), 48000 Hz, stereo, s32 (24 bit), 2304 kb/s (default)
At least one output file must be specified
`
const HDR = `  Duration: 00:00:10.00, start: 0.000000, bitrate: 50000 kb/s
  Stream #0:0: Video: hevc (Main 10), yuv420p10le(tv, bt2020nc/bt2020/smpte2084), 3840x2160, 50 fps, 50 tbr
`
const CELULAR = `  Duration: 00:00:05.00, start: 0.000000, bitrate: 20000 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080, 19000 kb/s, 30 fps, 30 tbr
      Side data:
        displaymatrix: rotation of -90.00 degrees
`

describe('presets: cópia da Revela', () => {
  test('src/revela é igual a products/finishing (destinos e plano) e o ícone é o oficial', async () => {
    for (const [copia, original] of [
      ['src/revela/entrega/destinos.js', 'src/entrega/destinos.js'],
      ['src/revela/conversao/plano.js', 'src/conversao/plano.js'],
      ['public/revela-icone.svg', 'marca/revela-icone.svg'],
      ['web/public/app/icons/revela.svg', 'marca/revela-icone.svg'],
      ['web/public/app/lib/revela/entrega/destinos.js', 'src/entrega/destinos.js'],
      ['web/public/app/lib/revela/conversao/plano.js', 'src/conversao/plano.js'],
      ['web/public/app/vendor/mediabunny.min.mjs', 'vendor/mediabunny.min.mjs'],
      ['web/public/app/vendor/mediabunny-prores.min.mjs', 'vendor/mediabunny-prores.min.mjs'],
      ['web/public/app/vendor/LICENSE-mediabunny.txt', 'vendor/LICENSE-mediabunny.txt'],
    ]) {
      assert.ok((await ler(path.join(RAIZ, copia))).equals(await ler(path.join(FINISHING, original))), `${copia} diferente de products/finishing/${original}: copie de novo`)
    }
  })

  test('a tela do computador mostra os destinos do conversor, com o formato', () => {
    assert.deepEqual(DESTINOS_REVELA.map(d => d.id), ['youtube', 'vimeo', 'reels', 'tiktok'])
    assert.deepEqual(destinosParaTela().map(d => [d.id, d.vertical]), [['youtube', false], ['vimeo', false], ['reels', true], ['tiktok', true]])
  })
})

describe('leitura e linha de comando', () => {
  test('ProRes 4K: tamanho, cadência, áudio e cor BT.709', () => {
    assert.deepEqual(origemDoProbe(PRORES), { largura: 3840, altura: 2160, fps: 23.98, duracao: 60, temAudio: true, cor: { matrix: 'bt709', primaries: 'bt709', transfer: 'bt709' } })
  })

  test('HDR vira transferência pq (o plano avisa); celular deitado troca largura e altura', () => {
    const hdr = origemDoProbe(HDR)
    assert.deepEqual(hdr.cor, { matrix: 'bt2020nc', primaries: 'bt2020', transfer: 'pq' })
    assert.match(planejar(hdr, destinoRevela('youtube')).avisos[0], /HDR/)
    const cel = origemDoProbe(CELULAR)
    assert.deepEqual([cel.largura, cel.altura, cel.temAudio], [1080, 1920, false])
    assert.equal(origemDoProbe('sem vídeo'), null)
  })

  test('YouTube a partir do ProRes 4K: bitrate de 2160p, GOP de meio segundo, tags 1-1-1, AAC 384k', () => {
    const plano = planejar(origemDoProbe(PRORES), destinoRevela('youtube'))
    const a = argsRevela({ input: 'in.mov', output: 'out.mp4', encoder: 'libx264', plano, fps: 23.98 })
    const depois = k => a[a.indexOf(k) + 1]
    assert.equal(depois('-c:v'), 'libx264')
    assert.equal(depois('-b:v'), '45000k')
    assert.equal(depois('-maxrate'), '67500k')
    assert.equal(depois('-g'), '12')
    assert.match(depois('-vf'), /^scale=3840:2160:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p$/)
    for (const k of ['-color_primaries', '-color_trc', '-colorspace']) assert.equal(depois(k), 'bt709')
    assert.equal(depois('-c:a'), 'aac')
    assert.equal(depois('-b:a'), '384k')
    assert.equal(depois('-ar'), '48000')
    assert.ok(a.includes('+faststart'))
    // Reels: 1080×1920 a partir de um vertical 4K, e o QSV pede nv12
    const reels = planejar({ ...origemDoProbe(PRORES), largura: 2160, altura: 3840 }, destinoRevela('reels'))
    const b = argsRevela({ input: 'i', output: 'o', encoder: 'h264_qsv', plano: reels, fps: 30 })
    assert.match(b[b.indexOf('-vf') + 1], /^scale=1080:1920:.*format=nv12$/)
    assert.equal(b[b.indexOf('-b:v') + 1], '12000k')
  })
})

describe('conversão de verdade (ffmpeg do sistema + Drive falso)', () => {
  test('ProRes do Drive vira o MP4 do YouTube na mesma pasta, marcado BT.709, com MD5 conferido', { skip: (!ffmpegDoSistema || !ffprobe) && 'sem ffmpeg/ffprobe neste computador', timeout: 120_000 }, async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sobedesce-revela-'))
    t.after(() => fs.rm(dir, { recursive: true, force: true }))
    const master = path.join(dir, 'master.mov')
    const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1', '-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-c:a', 'pcm_s24le', master])
    assert.equal(r.status, 0, r.stderr?.toString())

    const env = await setupDrive()
    t.after(() => env.cleanup())
    const pasta = env.mock.addFolder('Entregas')
    const original = env.mock.addFile('Filme Master.mov', pasta.id, { content: await fs.readFile(master) })
    const motor = await detectarMotor({ candidates: [{ path: ffmpegDoSistema, origem: 'sistema' }], resourcesPath: undefined, braw: async () => null })
    assert.ok(motor.ffmpeg?.path, 'o motor achou o ffmpeg')
    const gerador = new GeradorPrevias({ detect: async () => motor, tmpRoot: dir, selfCheck: false })
    const fases = []
    const item = await env.drive.getItem(original.id, { media: true })
    const res = await converterComRevela({ gerador, drive: env.drive, item, destino: 'youtube', tmpRoot: dir, onFase: f => fases.at(-1) !== f && fases.push(f) })

    assert.equal(res.nome, 'Filme Master-youtube.mp4')
    assert.equal(res.conferido, true, 'o Drive devolveu o MD5 e bateu')
    assert.deepEqual(fases, ['esperando', 'baixando', 'analisando', 'convertendo', 'enviando', 'conferindo'])
    const noDrive = env.mock.getItem(res.fileId)
    assert.deepEqual(noDrive.parents, [pasta.id], 'ao lado do original')
    assert.equal(noDrive.appProperties?.sobedesce, REVELA_MARCA)
    assert.equal(noDrive.appProperties?.original, original.id)
    assert.equal(noDrive.appProperties?.destino, 'youtube')

    const saida = path.join(dir, 'baixado.mp4')
    await fs.writeFile(saida, env.mock.readContent(res.fileId))
    assert.equal(await md5File(saida), (await env.drive.getItem(res.fileId)).md5)
    const sonda = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,color_primaries,color_transfer,color_space,sample_rate', '-of', 'json', saida], { encoding: 'utf8' }).stdout)
    const v = sonda.streams.find(s => s.codec_type === 'video')
    assert.deepEqual([v.codec_name, v.width, v.height, v.color_primaries, v.color_transfer, v.color_space], ['h264', 1280, 720, 'bt709', 'bt709', 'bt709'])
    const a = sonda.streams.find(s => s.codec_type === 'audio')
    assert.deepEqual([a?.codec_name, a?.sample_rate], ['aac', '48000'])
    // nada de temporário para trás
    assert.deepEqual((await fs.readdir(dir)).filter(n => n.startsWith('sobedesce-')), [])
  })
})

describe('trabalhos da tela (SSE e parar)', () => {
  test('manda o andamento, termina com o resultado e parar cancela', async () => {
    const enviados = []
    const ctx = { manager: { previas: { emVaga: () => {} }, driveFor: () => ({}) }, hub: { send: (ev, d) => enviados.push([ev, d]) }, log: () => {} }
    let soltar
    const converter = async ({ onFase, signal }) => {
      onFase('convertendo', 0.5)
      await new Promise((resolve, reject) => {
        soltar = resolve
        signal.addEventListener('abort', () => reject(Object.assign(new Error('parou'), { name: 'AbortError' })), { once: true })
      })
      return { fileId: 'novo', nome: 'x-youtube.mp4' }
    }
    const jobs = new RevelaJobs(ctx, { converter })
    const id = jobs.start({ accountId: 'a', item: { id: 'f', name: 'x.mov' }, destino: 'youtube' })
    await sleep(5)
    assert.equal(jobs.list()[0].fase, 'convertendo')
    soltar()
    await sleep(5)
    assert.equal(jobs.list()[0].status, 'done')
    assert.equal(jobs.list()[0].resultado.nome, 'x-youtube.mp4')
    assert.ok(enviados.every(([ev]) => ev === 'revela'))

    const id2 = jobs.start({ accountId: 'a', item: { id: 'g', name: 'y.mov' }, destino: 'reels' })
    await sleep(5)
    assert.equal(jobs.cancel(id2), true)
    await sleep(5)
    assert.equal(jobs.view(jobs.jobs.get(id2)).status, 'canceled')
    assert.notEqual(id, id2)
  })
})
