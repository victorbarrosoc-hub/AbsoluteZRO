// O editor completo dos presets da pessoa: cadência exata (23,976), recorte, giro, trecho, bitrate constante,
// qualidade constante (RF), volume, opções do computador e a receita de cor da Revela, do preset à linha do ffmpeg.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { especificacaoDe, importar, exportar, presetPersonalizado } from '../src/personalizado.js'
import { preset } from '../src/presets.js'
import { fichaTecnica, planejar } from '../src/plano.js'
import { argsFfmpeg, filtroVideo, fracaoFps } from '../src/ffmpeg.js'
import { linkMaxima } from '../src/link.js'

const origem = { largura: 3840, altura: 2160, fps: 29.97, duracao: 60, temVideo: true, temAudio: true, canais: 2, taxa: 48000, cor: null }
const meu = (mudar) => presetPersonalizado({ ...especificacaoDe(preset('youtube-1080')), nome: 'Teste', ...mudar })
const vf = (plano, lut = null) => filtroVideo(plano, 'libx264', lut)

test('23,976 exatos: repete ou descarta quadros, avisa e o ffmpeg recebe a fração NTSC', () => {
  const p = meu({ fps: 23.976, fpsModo: 'constante' })
  assert.equal(p.video.fpsExato, 23.976)
  const plano = planejar(origem, p)
  assert.equal(plano.video.fps, 23.976)
  assert.equal(plano.video.fpsModo, 'constante')
  assert.ok(plano.avisos.some((a) => /29,97 fps → 23,976 fps exatos/.test(a)), plano.avisos.join(' | '))
  assert.match(vf(planejar(origem, p, { motor: 'computador' })), /fps=24000\/1001/)
  assert.deepEqual(fichaTecnica(plano).find(([r]) => r === 'Cadência'), ['Cadência', '23,976 fps exatos'])
  // arquivo já em 23,976: fica, sem aviso, mas a cadência continua presa (celular com cadência variável vira constante)
  const igual = planejar({ ...origem, fps: 23.976 }, p)
  assert.equal(igual.video.fps, 23.976)
  assert.equal(igual.avisos.length, 0)
  // "no máximo": 24 e 23,976 contam como a mesma (sem a folga, 24 num teto de 23,976 cairia para 12)
  assert.equal(planejar({ ...origem, fps: 23.976 }, meu({ fps: 24, fpsModo: 'pico' })).video.fps, null)
  assert.equal(planejar({ ...origem, fps: 24 }, meu({ fps: 23.976, fpsModo: 'pico' })).video.fps, null)
  assert.equal(planejar({ ...origem, fps: 60 }, meu({ fps: 29.97, fpsModo: 'pico' })).video.fps, 30)
  assert.equal(planejar({ ...origem, fps: 59.94 }, meu({ fps: 30, fpsModo: 'pico' })).video.fps, 29.97)
  assert.deepEqual([fracaoFps(29.97), fracaoFps(59.94), fracaoFps(25), fracaoFps(14.985)], ['30000/1001', '60000/1001', '25', '15000/1001'])
  // ida e volta da ficha
  assert.deepEqual(especificacaoDe(p).fps, 23.976)
  assert.equal(especificacaoDe(p).fpsModo, 'constante')
})

test('recorte e giro: a imagem que sobra decide o tamanho; o ffmpeg gira, espelha e corta antes da escala', () => {
  const p = meu({ tamanho: 'lado', lado: null, recorte: { cima: 140, baixo: 140, esquerda: 0, direita: 0 }, giro: 90, espelhar: true })
  assert.deepEqual(p.video.recorte, { cima: 140, baixo: 140, esquerda: 0, direita: 0 })
  const plano = planejar(origem, p, { motor: 'computador' })
  // 3840×2160 girado = 2160×3840, menos 280 na altura = 2160×3560
  assert.deepEqual([plano.video.largura, plano.video.altura], [2160, 3560])
  assert.match(vf(plano), /^transpose=clock,hflip,crop=iw-0:ih-280:0:140,scale=2160:3560/)
  assert.deepEqual(fichaTecnica(plano).find(([r]) => r === 'Giro'), ['Giro', '90° · espelhado'])
  assert.throws(() => planejar(origem, meu({ recorte: { cima: 2000, baixo: 2000 } })), (e) => e.codigo === 'recorte')
  // recorte ímpar vira par (4:2:0)
  assert.equal(meu({ recorte: { cima: 3 } }).video.recorte.cima, 4)
})

test('tela fixa: faixas, preencher ou esticar', () => {
  for (const [encaixe, esperado] of [
    ['contain', /pad=1080:1920/],
    ['cover', /force_original_aspect_ratio=increase.*crop=1080:1920/],
    ['fill', /^scale=1080:1920:flags/],
  ]) {
    const plano = planejar(origem, meu({ tamanho: 'tela', largura: 1080, altura: 1920, encaixe }), { motor: 'computador' })
    assert.equal(plano.video.encaixe, encaixe)
    assert.match(vf(plano), esperado, encaixe)
  }
})

test('qualidade: bitrate constante numa passada; RF no computador e a tabela no navegador', () => {
  const cbr = planejar(origem, meu({ qualidade: 'cbr', kbps: 12000 }), { motor: 'computador' })
  assert.equal(cbr.video.modo, 'constante')
  const linhas = argsFfmpeg(cbr, { input: 'a.mov', output: 'b.mp4', origem })
  assert.equal(linhas.length, 1, 'CBR vai numa passada')
  assert.ok(linhas[0].join(' ').includes('-b:v 12000k -minrate 12000k -maxrate 12000k -bufsize 12000k -x264-params nal-hrd=cbr'))
  const rf = meu({ qualidade: 'rf', rf: 20 })
  assert.equal(rf.video.crf, 20)
  const noComputador = planejar(origem, rf, { motor: 'computador' })
  assert.ok(argsFfmpeg(noComputador, { input: 'a', output: 'b.mp4', origem })[0].join(' ').includes('-crf 20'))
  assert.match(fichaTecnica(noComputador).find(([r]) => r === 'Qualidade')[1], /RF 20/)
  const noNavegador = planejar(origem, rf)
  assert.ok(noNavegador.video.bitrate > 10e6, 'a tabela do YouTube 1080p')
  assert.match(fichaTecnica(noNavegador).find(([r]) => r === 'Bitrate')[1], /RF 20 no computador/)
  assert.equal(rf.resumo, 'H.264 · 1080p · RF 20')
})

test('trecho: a duração cai, o tamanho estimado junto, e o ffmpeg busca e corta', () => {
  const p = meu({ inicio: 10, fim: 25.5 })
  assert.deepEqual(p.trecho, { inicio: 10, fim: 25.5 })
  const inteiro = planejar(origem, meu({}))
  const plano = planejar(origem, p, { motor: 'computador' })
  assert.ok(Math.abs(plano.tamanhoEstimado / inteiro.tamanhoEstimado - 15.5 / 60) < 0.01)
  const a = argsFfmpeg(plano, { input: 'a.mov', output: 'b.mp4', origem })[0]
  assert.deepEqual(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 5), ['-ss', '10', '-i', 'a.mov', '-t'])
  assert.equal(a[a.indexOf('-t') + 1], '15.5')
  assert.deepEqual(fichaTecnica(plano).find(([r]) => r === 'Trecho'), ['Trecho', '0:10 → 0:25,5'])
  assert.throws(() => meu({ inicio: 30, fim: 20 }), (e) => e.campo === 'trecho')
  assert.throws(() => planejar({ ...origem, duracao: 5 }, p), (e) => e.codigo === 'trecho')
  // só o fim
  assert.deepEqual(meu({ fim: 8 }).trecho, { inicio: null, fim: 8 })
})

test('áudio: volume em dB e volume normalizado (só no computador)', () => {
  const p = meu({ ganho: 3.5, computador: { loudness: -14 } })
  assert.equal(p.audio.ganho, 3.5)
  const comp = planejar(origem, p, { motor: 'computador' })
  const a = argsFfmpeg(comp, { input: 'a', output: 'b.mp4', origem }).at(-1)
  assert.equal(a[a.indexOf('-af') + 1], 'volume=3.5dB,loudnorm=I=-14:TP=-1.5:LRA=11')
  const nav = planejar(origem, p)
  assert.equal(nav.audio.loudness, undefined)
  assert.ok(nav.avisos.some((x) => /Volume normalizado: só na Máxima qualidade/.test(x)), nav.avisos.join(' | '))
  assert.match(fichaTecnica(nav).find(([r]) => r === 'Áudio')[1], /\+3,5 dB/)
})

test('computador: velocidade, ajuste, perfil e filtros no ffmpeg; no navegador, a ficha diz o que ficou de fora', () => {
  const p = meu({ computador: { velocidade: 'veryslow', ajuste: 'grain', perfil: 'main', desentrelacar: true, ruido: 1, nitidez: 2 } })
  const plano = planejar(origem, p, { motor: 'computador' })
  const linha = argsFfmpeg(plano, { input: 'a', output: 'b.mp4', origem })[1].join(' ') // bitrate médio: 2 passadas
  assert.ok(linha.includes('-preset veryslow -tune grain'), linha)
  assert.ok(linha.includes('-profile:v main'), linha)
  assert.match(vf(plano), /^bwdif=mode=send_frame:parity=auto:deint=interlaced,hqdn3d=2:1.5:3:2.25,scale=.*unsharp=5:5:0.8:5:5:0,setsar=1/)
  const nav = planejar(origem, p)
  assert.deepEqual(fichaTecnica(nav).find(([r]) => r === 'Só no computador'), ['Só no computador', 'velocidade do x264, ajuste do x264, perfil, desentrelaçar, redução de ruído e nitidez'])
  // o padrão (lenta, sem filtros) não vira opção do computador
  assert.equal(meu({ computador: { velocidade: 'slow' } }).computador, undefined)
  // HEVC: o x265 não tem "film" e não leva perfil
  const hevc = planejar(origem, meu({ codec: 'hevc', computador: { ajuste: 'film', perfil: 'baseline' } }), { motor: 'computador' })
  const h = argsFfmpeg(hevc, { input: 'a', output: 'b.mp4', origem, log: '/tmp/p' })[1].join(' ')
  assert.ok(!h.includes('-tune film') && !h.includes('-profile:v'), h)
})

test('cor da Revela: a receita viaja no preset e no .relay.json, o ffmpeg exige a LUT e o Máxima fica fora', () => {
  const p = meu({ cor: { entrada: 'sony-slog3-cine', entradaNome: 'S-Log3 / S-Gamut3.Cine', tom: 'suave', look: { id: 'look-abc123', nome: 'Verão' } } })
  assert.deepEqual(p.cor, { entrada: 'sony-slog3-cine', entradaNome: 'S-Log3 / S-Gamut3.Cine', tom: 'suave', look: { id: 'look-abc123', nome: 'Verão' } })
  assert.equal(p.resumo, 'H.264 · 1080p · 8 Mbit/s · cor da Revela'.replace('8 Mbit/s', `${(p.video.bitrateFixo / 1000).toLocaleString('pt-BR')} Mbit/s`))
  const plano = planejar(origem, p, { motor: 'computador' })
  assert.deepEqual(plano.receitaCor, p.cor)
  assert.equal(fichaTecnica(plano).find(([r]) => r === 'Cor')[1], 'S-Log3 / S-Gamut3.Cine → Rec.709 · look Verão (Revela), sai 1-1-1')
  assert.throws(() => vf(plano), /LUT assada/)
  assert.match(vf(plano, '/tmp/x.cube'), /scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd\+full_chroma_int,format=gbrpf32le,lut3d=file='\/tmp\/x.cube':interp=tetrahedral,scale=1920:1080:flags=lanczos\+accurate_rnd\+full_chroma_int:out_color_matrix=bt709:out_range=tv/)
  assert.match(vf(plano, 'C:\\Temp\\a.cube'), /lut3d=file='C\\:\/Temp\/a.cube'/)
  const { presets } = importar(JSON.parse(JSON.stringify(exportar([p]))))
  assert.deepEqual(presets[0].cor, p.cor)
  // receita torta some; só o look vale
  assert.equal(meu({ cor: { entrada: '<script>' } }).cor, undefined)
  assert.deepEqual(meu({ cor: { look: { id: 'look-xyz789', nome: 'Noite' } } }).cor, { entrada: null, entradaNome: null, tom: 'suave', look: { id: 'look-xyz789', nome: 'Noite' } })
  // look de log só sem CST
  assert.equal(meu({ cor: { look: { id: 'look-xyz789', nome: 'Câmera', sobre: 'log' } } }).cor.look.sobre, 'log')
  assert.equal(meu({ cor: { entrada: 'sony-slog3-cine', look: { id: 'look-xyz789', nome: 'X', sobre: 'log' } } }).cor.look.sobre, undefined)
  assert.match(fichaTecnica(planejar(origem, meu({ cor: { look: { id: 'look-xyz789', nome: 'Câmera', sobre: 'log' } } }))).find(([r]) => r === 'Cor')[1], /look Câmera sobre o log/)
  // o app do computador ainda não assa a LUT: o preset com cor fica no navegador
  const { fora, levados } = linkMaxima([p.id, 'youtube-1080'], [p])
  assert.deepEqual([fora, levados], [['Teste'], ['YouTube 1080p']])
})

test('fichas da versão 1 (sem os campos novos) continuam abrindo iguais', () => {
  const v1 = { v: 1, nome: 'Antigo', base: 'reels', formato: 'mp4', codec: 'avc', tamanho: 'tela', lado: null, largura: 1080, altura: 1920, fps: 30, qualidade: 'bitrate', kbps: 9000, mb: 50, gop: 2, audio: 'aac', audioKbps: 320, taxa: null, canais: null }
  const { presets, recusados } = importar([v1])
  assert.equal(recusados, 0)
  const p = presets[0]
  assert.deepEqual([p.video.fpsMax, p.video.fpsExato, p.video.encaixe, p.video.recorte, p.trecho, p.cor, p.computador], [30, undefined, 'contain', undefined, undefined, undefined, undefined])
})
