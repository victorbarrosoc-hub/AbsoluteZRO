// "Converter com o Relay" (src/media/relay.js, src/server/relay.js): presets, plano e linha de comando são os do Relay
// (cópia conferida de products/relay), a leitura do ffmpeg vira o que o plano espera, o x264 vem antes do hardware e
// — com o ffmpeg de verdade e o Drive falso — um ProRes do Drive vira o MP4 do YouTube na mesma pasta, com o MD5
// conferido. O celular converte no próprio aparelho com o mesmo motor do Relay (test/relay-celular.test.js).
import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { converterComRelay, destinoRelay, origemDoProbe, tentativasRelay, DESTINOS_RELAY, RELAY_MARCA } from '../src/media/relay.js'
import { planejar } from '../src/relay/plano.js'
import { argsFfmpeg } from '../src/relay/ffmpeg.js'
import { RelayJobs, destinosParaTela } from '../src/server/relay.js'
import { GeradorPrevias } from '../src/media/previa-fila.js'
import { detectarMotor } from '../src/media/previa.js'
import { closeHttp } from '../src/net/http.js'
import { setupDrive, md5File } from './helpers.js'

after(() => closeHttp())

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const RELAY = path.join(RAIZ, '..', 'relay')
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

describe('presets: cópia do Relay', () => {
  test('src/relay e web/public/app/relay são iguais a products/relay, e o ícone é o oficial', async () => {
    const pares = [
      ['src/relay/presets.js', 'src/presets.js'],
      ['src/relay/plano.js', 'src/plano.js'],
      ['src/relay/ffmpeg.js', 'src/ffmpeg.js'],
      ['src/relay/personalizado.js', 'src/personalizado.js'],
      ['public/relay-icone.svg', 'marca/relay-icone.svg'],
      ['web/public/app/icons/relay.svg', 'marca/relay-icone.svg'],
      ['web/public/app/relay/src/presets.js', 'src/presets.js'],
      ['web/public/app/relay/src/plano.js', 'src/plano.js'],
      ['web/public/app/relay/app/motor.js', 'app/motor.js'],
      ['web/public/app/relay/app/escala.js', 'app/escala.js'],
    ]
    for (const f of await fs.readdir(path.join(RELAY, 'vendor'))) if (/\.(mjs|txt)$/.test(f)) pares.push([`web/public/app/relay/vendor/${f}`, `vendor/${f}`])
    for (const [copia, original] of pares) {
      assert.ok((await ler(path.join(RAIZ, copia))).equals(await ler(path.join(RELAY, original))), `${copia} diferente de products/relay/${original}: copie de novo`)
    }
  })

  test('a tela mostra os destinos do Relay com grupo e forma (o de tamanho escolhido na hora fica no site)', () => {
    assert.ok(DESTINOS_RELAY.length >= 15)
    assert.equal(destinoRelay('tamanho'), null)
    const tela = destinosParaTela()
    assert.deepEqual(tela.find(d => d.id === 'reels'), { id: 'reels', nome: 'Reels · No Compress', grupo: 'Redes', resumo: tela.find(d => d.id === 'reels').resumo, forma: 'vertical' })
    assert.equal(tela.find(d => d.id === 'mp3').forma, 'audio')
    assert.equal(tela.find(d => d.id === 'youtube-4k').forma, 'horizontal')
  })
})

describe('leitura e linha de comando', () => {
  test('ProRes 4K: tamanho, cadência, áudio (taxa e canais) e cor BT.709', () => {
    assert.deepEqual(origemDoProbe(PRORES), { temVideo: true, largura: 3840, altura: 2160, fps: 23.98, duracao: 60, temAudio: true, taxa: 48000, canais: 2, cor: { matrix: 'bt709', primaries: 'bt709', transfer: 'bt709', fullRange: false } })
  })

  test('HDR vira transferência pq (o plano avisa); celular deitado troca largura e altura; só áudio também lê', () => {
    const hdr = origemDoProbe(HDR)
    assert.deepEqual(hdr.cor, { matrix: 'bt2020nc', primaries: 'bt2020', transfer: 'pq', fullRange: false })
    assert.ok(planejar(hdr, destinoRelay('youtube-1080')).avisos.some(a => /HDR/.test(a)))
    const cel = origemDoProbe(CELULAR)
    assert.deepEqual([cel.largura, cel.altura, cel.temAudio], [1080, 1920, false])
    assert.equal(origemDoProbe('sem vídeo'), null)
    const wav = origemDoProbe('  Duration: 00:00:03.00, start: 0.000000, bitrate: 1536 kb/s\n  Stream #0:0: Audio: pcm_s16le, 44100 Hz, mono, s16, 705 kb/s\n')
    assert.deepEqual([wav.temVideo, wav.temAudio, wav.taxa, wav.canais], [false, true, 44100, 1])
  })

  test('YouTube a partir do ProRes 4K: x264 em qualidade constante, matriz de entrada explícita, 1-1-1, AAC 384k', () => {
    const origem = origemDoProbe(PRORES)
    const plano = planejar(origem, destinoRelay('youtube-1080'), { motor: 'computador' })
    const [a] = argsFfmpeg(plano, { input: 'in.mov', output: 'out.mp4', origem, encoder: 'libx264' })
    const depois = k => a[a.indexOf(k) + 1]
    assert.equal(depois('-c:v'), 'libx264')
    assert.equal(depois('-preset'), 'slow')
    assert.equal(depois('-crf'), '17')
    assert.match(depois('-vf'), /^scale=1920:1080:flags=lanczos\+accurate_rnd\+full_chroma_int:in_color_matrix=bt709:in_range=tv:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv$/)
    for (const k of ['-color_primaries', '-color_trc', '-colorspace']) assert.equal(depois(k), 'bt709')
    assert.equal(depois('-c:a'), 'aac')
    assert.equal(depois('-b:a'), '384k')
    assert.ok(a.includes('+faststart'))
  })

  test('o x264 vem antes do hardware; sem x264, o hardware (com decodificação no chip no Mac)', () => {
    const plano = planejar(origemDoProbe(PRORES), destinoRelay('youtube-1080'))
    const comTudo = { encoder: { nome: 'h264_videotoolbox', hardware: true }, encoders: ['libx264', 'h264_videotoolbox'] }
    assert.deepEqual(tentativasRelay(comTudo, plano, 'darwin').map(t => t.encoder), ['libx264', 'h264_videotoolbox', 'h264_videotoolbox'])
    assert.deepEqual(tentativasRelay({ encoder: { nome: 'h264_nvenc', hardware: true }, encoders: ['h264_nvenc'] }, plano, 'win32'), [{ encoder: 'h264_nvenc', hwDecode: false }])
    const hevc = planejar(origemDoProbe(PRORES), destinoRelay('hevc'))
    assert.deepEqual(tentativasRelay(comTudo, hevc, 'darwin'), [{ encoder: 'hevc_videotoolbox', hwDecode: false }])
  })
})

describe('conversão de verdade (ffmpeg do sistema + Drive falso)', () => {
  test('ProRes do Drive vira o MP4 do YouTube na mesma pasta, marcado BT.709, com MD5 conferido', { skip: (!ffmpegDoSistema || !ffprobe) && 'sem ffmpeg/ffprobe neste computador', timeout: 120_000 }, async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sobedesce-relay-'))
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
    const res = await converterComRelay({ gerador, drive: env.drive, item, destino: 'youtube-1080', tmpRoot: dir, onFase: f => fases.at(-1) !== f && fases.push(f) })

    assert.equal(res.nome, 'Filme Master (YouTube 1080p).mp4')
    assert.equal(res.encoder, 'libx264')
    assert.equal(res.conferido, true, 'o Drive devolveu o MD5 e bateu')
    assert.deepEqual(fases, ['esperando', 'baixando', 'analisando', 'convertendo', 'enviando', 'conferindo'])
    const noDrive = env.mock.getItem(res.fileId)
    assert.deepEqual(noDrive.parents, [pasta.id], 'ao lado do original')
    assert.equal(noDrive.appProperties?.sobedesce, RELAY_MARCA)
    assert.equal(noDrive.appProperties?.original, original.id)
    assert.equal(noDrive.appProperties?.destino, 'youtube-1080')

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
      return { fileId: 'novo', nome: 'x (YouTube 1080p).mp4' }
    }
    const jobs = new RelayJobs(ctx, { converter })
    const id = jobs.start({ accountId: 'a', item: { id: 'f', name: 'x.mov' }, destino: 'youtube-1080' })
    await sleep(5)
    assert.equal(jobs.list()[0].fase, 'convertendo')
    soltar()
    await sleep(5)
    assert.equal(jobs.list()[0].status, 'done')
    assert.equal(jobs.list()[0].resultado.nome, 'x (YouTube 1080p).mp4')
    assert.ok(enviados.every(([ev]) => ev === 'relay'))

    const id2 = jobs.start({ accountId: 'a', item: { id: 'g', name: 'y.mov' }, destino: 'reels' })
    await sleep(5)
    assert.equal(jobs.cancel(id2), true)
    await sleep(5)
    assert.equal(jobs.view(jobs.jobs.get(id2)).status, 'canceled')
    assert.notEqual(id, id2)
  })
})

describe('"Máxima qualidade": link do site do Relay e arquivo deste computador', () => {
  test('o link sobedesce://relay que o Relay monta é o que o app aceita; o resto é ignorado', async () => {
    const { lerLinkSobedesce } = await import('../desktop/links.js')
    const { linkMaxima } = await import('../../relay/src/link.js')
    const { presetPersonalizado } = await import('../../relay/src/personalizado.js')
    const meu = presetPersonalizado({ nome: 'Cliente Ç', formato: 'mp3', audioKbps: 192 })
    const { link } = linkMaxima(['youtube-1080', meu.id], [meu])
    const lido = lerLinkSobedesce(link)
    assert.equal(lido.tipo, 'relay')
    assert.equal(lido.destinos[0], 'youtube-1080')
    assert.equal(lido.destinos[1].nome, 'Cliente Ç')
    assert.ok(destinoRelay(lido.destinos[1]), 'a ficha vira preset aqui também')
    for (const ruim of ['https://relay', 'sobedesce://outro?presets=reels', 'sobedesce://relay?presets=../x', 'sobedesce://relay?meus=lixo', 'sobedesce://relay?presets=' + Array(9).fill('reels').join(','), `sobedesce://relay?presets=${'a'.repeat(9000)}`, null])
      assert.equal(lerLinkSobedesce(ruim), null, String(ruim).slice(0, 40))
  })

  test('sobedesce://looks: sem caminho vindo de fora; ?trocar=1 escolhe as pastas de novo', async () => {
    const { lerLinkSobedesce } = await import('../desktop/links.js')
    assert.deepEqual(lerLinkSobedesce('sobedesce://looks'), { tipo: 'looks' })
    assert.deepEqual(lerLinkSobedesce('sobedesce://looks?trocar=1'), { tipo: 'looks', trocar: true })
    for (const ruim of ['sobedesce://looks?pasta=/etc', 'sobedesce://looks/../x', 'sobedesce://looks?trocar=1&pasta=/', 'sobedesce://lookss'])
      assert.equal(lerLinkSobedesce(ruim), null, ruim)
  })

  test('nome livre ao lado do original: nunca grava por cima', async t => {
    const { caminhoLivre } = await import('../src/media/relay.js')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sobedesce-livre-'))
    t.after(() => fs.rm(dir, { recursive: true, force: true }))
    assert.equal(await caminhoLivre(dir, 'a (WhatsApp).mp4'), path.join(dir, 'a (WhatsApp).mp4'))
    await fs.writeFile(path.join(dir, 'a (WhatsApp).mp4'), 'x')
    assert.equal(await caminhoLivre(dir, 'a (WhatsApp).mp4'), path.join(dir, 'a (WhatsApp) 2.mp4'))
  })

  test('arquivo deste computador vira WhatsApp e o MP3 da pessoa, ao lado do original, sem tocar nele', { skip: (!ffmpegDoSistema || !ffprobe) && 'sem ffmpeg/ffprobe neste computador', timeout: 120_000 }, async t => {
    const { converterLocal } = await import('../src/media/relay.js')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sobedesce-local-'))
    t.after(() => fs.rm(dir, { recursive: true, force: true }))
    const master = path.join(dir, 'Filme.mov')
    const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1', '-c:v', 'prores_ks', '-profile:v', '1', '-c:a', 'pcm_s16le', master])
    assert.equal(r.status, 0, r.stderr?.toString())
    const antes = await md5File(master)
    const motor = await detectarMotor({ candidates: [{ path: ffmpegDoSistema, origem: 'sistema' }], resourcesPath: undefined, braw: async () => null })
    const gerador = new GeradorPrevias({ detect: async () => motor, tmpRoot: dir, selfCheck: false })
    const zap = await converterLocal({ gerador, caminho: master, destino: 'whatsapp' })
    assert.equal(zap.caminho, path.join(dir, 'Filme (WhatsApp).mp4'))
    assert.equal(zap.encoder, 'libx264')
    const v = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', zap.caminho], { encoding: 'utf8' }).stdout).streams.find(s => s.codec_type === 'video')
    assert.deepEqual([v.codec_name, v.width, v.height, v.color_primaries], ['h264', 1280, 720, 'bt709'])
    const mp3 = await converterLocal({ gerador, caminho: master, destino: { v: 1, nome: 'Voz', formato: 'mp3', audioKbps: 192 } })
    assert.equal(path.basename(mp3.caminho), 'Filme (Voz).mp3')
    const de2 = await converterLocal({ gerador, caminho: master, destino: 'whatsapp' })
    assert.equal(path.basename(de2.caminho), 'Filme (WhatsApp) 2.mp4', 'segunda vez não grava por cima')
    assert.equal(await md5File(master), antes, 'o original não muda')
    assert.deepEqual((await fs.readdir(dir)).filter(n => /parcial|sobedesce-relay-/.test(n)), [], 'nada pela metade')
  })

  test('a rota /api/relay/local confere caminhos e destinos antes de começar', async () => {
    const { registerRelay } = await import('../src/server/relay.js')
    const rotas = {}
    class HttpProblem extends Error {
      constructor(status, message) {
        super(message)
        this.status = status
      }
    }
    const iniciados = []
    const { jobs } = registerRelay({
      route: (m, p, fn) => (rotas[`${m} ${p}`] = fn),
      ctx: { manager: { previas: { emVaga: () => {} }, driveFor: () => ({}) }, hub: { send: () => {} }, log: () => {} },
      account: () => ({}),
      HttpProblem,
      jobsOptions: { local: async o => (iniciados.push(o), { caminho: '/x' }) },
    })
    const local = rotas['POST /api/relay/local']
    for (const body of [{}, { caminhos: ['relativo.mov'], destinos: ['reels'] }, { caminhos: ['/a/b.txt'], destinos: ['reels'] }, { caminhos: ['/a/b.mov'], destinos: ['inventado'] }, { caminhos: ['/a/b.mov'], destinos: [] }])
      await assert.rejects(local({ body }), e => e.status === 400, JSON.stringify(body))
    const r = await local({ body: { caminhos: ['/a/b.mov', '/a/c.wav'], destinos: ['reels', { nome: 'Meu', formato: 'mp3' }] } })
    assert.equal(r.jobIds.length, 4)
    await sleep(5)
    assert.equal(iniciados.length, 4)
    assert.deepEqual(iniciados.map(o => o.caminho), ['/a/b.mov', '/a/b.mov', '/a/c.wav', '/a/c.wav'])
    assert.equal(jobs.list()[1].destino, 'Meu')
    jobs.close()
  })
})
