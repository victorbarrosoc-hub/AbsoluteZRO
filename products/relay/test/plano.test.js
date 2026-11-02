import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRESETS, GRUPOS, preset } from '../src/presets.js'
import { BPP_MINIMO, bitrateTabela, cadencia, nomeSaida, planejar, tamanhoLegivel } from '../src/plano.js'

const horizontal = (o = {}) => ({ largura: 3840, altura: 2160, fps: 23.976, duracao: 60, temVideo: true, temAudio: true, canais: 2, taxa: 48000, cor: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709' }, ...o })

test('todo preset tem grupo, formato, fonte com data (ou é conta do Relay) e áudio', () => {
  const ids = new Set()
  for (const p of PRESETS) {
    assert.match(p.id ?? '', /^[a-z0-9-]+$/, `preset sem id: ${p.nome}`)
    assert.ok(!ids.has(p.id), `id repetido: ${p.id}`)
    ids.add(p.id)
    assert.ok(GRUPOS.includes(p.grupo), p.id)
    assert.ok(['mp4', 'mp3', 'wav', 'm4a', 'webm', 'mov'].includes(p.formato), p.id)
    assert.ok(p.audio, p.id)
    for (const f of p.fontes) {
      assert.match(f.url, /^https:\/\//, p.id)
      assert.match(f.verificadoEm, /^\d{4}-\d{2}-\d{2}$/)
      assert.ok(['oficial', 'mercado'].includes(f.tipo))
    }
    if (!p.fontes.length) assert.ok(p.ajustavel, `${p.id} sem fonte`)
    if (p.video && !p.tamanhoMax && p.video.codec !== 'prores4444') assert.ok(p.video.kbps, `${p.id} sem tabela de bitrate`)
  }
})

test('YouTube 1080p: 4K vira 1920×1080, cadência mantida, bitrate da tabela', () => {
  const p = planejar(horizontal(), 'youtube-1080')
  assert.equal(p.video.largura, 1920)
  assert.equal(p.video.altura, 1080)
  assert.equal(p.video.fps, null) // 23,976 fica
  assert.equal(p.video.bitrate, 16_000_000)
  assert.equal(p.audio.bitrate, 384_000)
  assert.deepEqual(p.cor, { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false })
})

test('não amplia: 720p no YouTube 1080p continua 720p (e o bitrate cai junto)', () => {
  const p = planejar(horizontal({ largura: 1280, altura: 720 }), 'youtube-1080')
  assert.equal(p.video.altura, 720)
  assert.ok(p.video.bitrate < 16_000_000)
})

test('truque 1440p amplia 1080p para 2560×1440', () => {
  const p = planejar(horizontal({ largura: 1920, altura: 1080 }), 'youtube-1440')
  assert.equal(p.video.largura, 2560)
  assert.equal(p.video.altura, 1440)
  assert.ok(p.avisos.some((a) => /Lanczos/.test(a)))
})

test('cadência acima do teto divide por inteiro: 60 → 30, 50 → 25, 59,94 → 29,97, 120 → 30', () => {
  assert.equal(cadencia(60, 30).fps, 30)
  assert.equal(cadencia(50, 30).fps, 25)
  assert.equal(cadencia(59.94, 30).fps, 29.97)
  assert.equal(cadencia(120, 30).fps, 30)
  assert.equal(cadencia(24, 30).dividiu, 1)
  const p = planejar(horizontal({ fps: 50 }), 'reels')
  assert.equal(p.video.fps, 25)
})

test('Reels: vertical vai para 1080×1920 direto; deitado vira faixas ou corte', () => {
  const pe = planejar(horizontal({ largura: 2160, altura: 3840 }), 'reels')
  assert.deepEqual([pe.video.largura, pe.video.altura, pe.video.encaixe], [1080, 1920, null])
  const deitado = planejar(horizontal(), 'reels')
  assert.equal(deitado.video.encaixe, 'contain')
  assert.deepEqual(deitado.video.imagem, { largura: 1080, altura: 608 })
  const cheio = planejar(horizontal(), 'reels', { preencher: true })
  assert.equal(cheio.video.encaixe, 'cover')
})

test('bitrate pela área: 4:5 (1080×1350) gasta menos que 16:9 na mesma faixa', () => {
  const tabela = { 1080: [12000, 12000] }
  assert.equal(bitrateTabela(tabela, 1920, 1080, 30), 12000)
  assert.ok(bitrateTabela(tabela, 1080, 1350, 30) < 12000)
})

test('tamanho máximo: cabe, com margem, e baixa a resolução antes de esmagar a imagem', () => {
  const p = planejar(horizontal({ duracao: 120 }), 'discord')
  const total = ((p.video.bitrate + p.audio.bitrate) * 120) / 8
  assert.ok(total <= 20e6 * 0.93, `estimado ${total}`)
  const bpp = p.video.bitrate / (p.video.largura * p.video.altura * (p.video.fpsSaida))
  assert.ok(bpp >= BPP_MINIMO.avc, `bpp ${bpp}`)
  assert.ok(p.video.altura < 1080)
  assert.equal(p.video.modo, 'constante')
  // curto cabe em 1080p
  const curto = planejar(horizontal({ duracao: 10 }), 'discord')
  assert.equal(curto.video.altura, 1080)
})

test('tamanho máximo impossível recusa em vez de prometer', () => {
  assert.throws(() => planejar(horizontal({ duracao: 3 * 3600 }), 'discord'), (e) => e.codigo === 'nao-cabe')
})

test('tamanho exato usa o MB pedido', () => {
  const p = planejar(horizontal({ duracao: 30 }), 'tamanho', { tamanhoMB: 8 })
  assert.equal(p.tamanhoMax, 8e6)
  assert.ok(((p.video.bitrate + p.audio.bitrate) * 30) / 8 <= 8e6)
})

test('áudio: MP3 sem vídeo, taxa válida; arquivo sem áudio recusa preset de áudio', () => {
  const p = planejar(horizontal({ taxa: 96000 }), 'mp3')
  assert.equal(p.video, null)
  assert.equal(p.audio.taxa, 48000)
  assert.equal(p.audio.bitrate, 320_000)
  assert.throws(() => planejar(horizontal({ temAudio: false }), 'wav'), (e) => e.codigo === 'sem-audio')
  const w = planejar(horizontal({ canais: 6 }), 'wav')
  assert.equal(w.audio.canais, 6)
  assert.equal(w.audio.codec, 'pcm-s24')
})

test('HDR e gamut largo viram aviso', () => {
  const hdr = planejar(horizontal({ cor: { primaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl' } }), 'youtube-1080')
  assert.ok(hdr.avisos.some((a) => /HDR/.test(a)))
  const p3 = planejar(horizontal({ cor: { primaries: 'smpte432', transfer: 'bt709', matrix: 'bt709' } }), 'youtube-1080')
  assert.ok(p3.avisos.some((a) => /Rec\.709/.test(a)))
})

test('resolução pedida pela pessoa vale nos presets sem tela fixa', () => {
  const p = planejar(horizontal(), 'vimeo', { resolucao: 1080 })
  assert.equal(p.video.altura, 1080)
  const sem = planejar(horizontal(), 'vimeo')
  assert.equal(sem.video.altura, 2160)
})

test('nome de saída e tamanho legível', () => {
  assert.equal(nomeSaida('filme master.mov', 'youtube-1080'), 'filme master (YouTube 1080p).mp4')
  assert.equal(nomeSaida('trilha.wav', preset('mp3')), 'trilha (MP3 320).mp3')
  assert.equal(nomeSaida('a.mov', 'reels'), 'a (Reels · No Compress).mp4')
  assert.equal(tamanhoLegivel(1_234_000_000), '1,2 GB')
  assert.equal(tamanhoLegivel(350_000_000), '350 MB')
  assert.equal(tamanhoLegivel(4_500_000), '4,5 MB')
})

test('ficha técnica: o que sai, conforme o motor', async () => {
  const { fichaTecnica } = await import('../src/plano.js')
  const nav = Object.fromEntries(fichaTecnica(planejar(horizontal(), 'youtube-1080')))
  assert.equal(nav['Tamanho'], '1920×1080')
  assert.equal(nav['Bitrate'], '16 Mbit/s variável')
  assert.match(nav['Cor'], /1-1-1/)
  assert.match(nav['Áudio'], /AAC-LC · 384 kbit\/s · 48 kHz · estéreo/)
  const comp = Object.fromEntries(fichaTecnica(planejar(horizontal(), 'youtube-1080', { motor: 'computador' })))
  assert.match(comp['Qualidade'], /RF 17/)
  const mp3 = Object.fromEntries(fichaTecnica(planejar(horizontal(), 'mp3')))
  assert.equal(mp3['Vídeo'], undefined)
})

test('entrega ao cliente: só ids que existem, sem repetir', async () => {
  const { ENTREGA_AO_CLIENTE } = await import('../src/presets.js')
  assert.equal(new Set(ENTREGA_AO_CLIENTE).size, ENTREGA_AO_CLIENTE.length)
  for (const id of ENTREGA_AO_CLIENTE) assert.ok(preset(id), id)
})
