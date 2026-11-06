// Cor do Frames (src/cor/grade.js, docs/FRAMES.md "Cor"): ler a .cube, a amostra tetraédrica, o ajuste rápido na luz do
// arquivo, a ida e volta da câmera e — com um ffmpeg de verdade — a LUT guardada, a prévia e os frames e takes saindo
// com a cor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { AJUSTES_NEUTROS, ajustar, amostrarCube, camera, criarCor, cubeDaCor, lerCube } from '../src/cor/grade.js'
import { FramesService } from '../src/frames/servico.js'
import { makeTmpDir } from './helpers.js'

const ffmpeg = (() => {
  try {
    const r = spawnSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' })
    return r.status === 0 ? r.stdout.trim() : null
  } catch {
    return null
  }
})()
const semFfmpeg = !ffmpeg && 'sem ffmpeg neste computador'

const perto = (a, b, tol = 1e-4) => a.every((v, i) => Math.abs(v - b[i]) <= tol)

/** .cube de uma função (vermelho mais rápido, como o Resolve grava). */
function cubeDe(fn, n = 9, extra = '') {
  const l = [`LUT_3D_SIZE ${n}`, extra].filter(Boolean)
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) l.push(fn(r / (n - 1), g / (n - 1), b / (n - 1)).map((v) => v.toFixed(6)).join(' '))
  return l.join('\n') + '\n'
}
const identidade = (r, g, b) => [r, g, b]

test('cor: lê a .cube 3D e recusa o que não dá para aplicar inteiro', () => {
  const l = lerCube(`# feita à mão\nTITLE "Teste"\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n${cubeDe(identidade, 3)}`)
  assert.equal(l.n, 3)
  assert.equal(l.titulo, 'Teste')
  assert.equal(l.dados.length, 81)
  assert.throws(() => lerCube('LUT_1D_SIZE 4\n0 0 0\n'), /LUT 1D/)
  assert.throws(() => lerCube('0 0 0\n1 1 1\n'), /LUT_3D_SIZE/)
  assert.throws(() => lerCube('LUT_3D_SIZE 2\n0 0 0\n1 1 1\n'), /incompleto/)
  assert.throws(() => lerCube('LUT_3D_SIZE 2\n0 0 x\n'), /número RGB/)
  assert.throws(() => lerCube('LUT_3D_SIZE 300\n'), /de 2 a 129/)
  // BOM e CRLF (LUT salva no Windows)
  assert.equal(lerCube(`﻿${cubeDe(identidade, 2).replace(/\n/g, '\r\n')}`).n, 2)
})

test('cor: amostra tetraédrica exata nos nós e na identidade; DOMAIN respeitado', () => {
  const id = lerCube(cubeDe(identidade, 5))
  for (const p of [[0.1, 0.7, 0.33], [0.9, 0.2, 0.55], [1, 0, 0.5], [0.25, 0.25, 0.25]]) assert.ok(perto(amostrarCube(id, ...p), p, 1e-6), String(p))
  const torta = (r, g, b) => [r * r, Math.sqrt(g), (r + b) / 2]
  const t = lerCube(cubeDe(torta, 9))
  assert.ok(perto(amostrarCube(t, 0.25, 0.5, 0.75), torta(0.25, 0.5, 0.75), 1e-5), 'no nó, o valor do nó')
  // fora do DOMAIN encosta na borda
  const larga = lerCube(cubeDe(identidade, 3, 'DOMAIN_MAX 2 2 2'))
  assert.ok(perto(amostrarCube(larga, 1, 1, 1), [0.5, 0.5, 0.5], 1e-6))
  assert.ok(perto(amostrarCube(larga, 9, 9, 9), [1, 1, 1], 1e-6))
})

test('cor: ajuste rápido na luz do arquivo (neutro não mexe, o cinza fica onde deve)', () => {
  const cinza = [0.18, 0.18, 0.18]
  assert.deepEqual(ajustar(cinza, AJUSTES_NEUTROS), cinza)
  assert.ok(perto(ajustar(cinza, { ...AJUSTES_NEUTROS, exposicao: 50 }), [0.36, 0.36, 0.36], 1e-9), '+50 = +1 stop')
  // contraste e preto para baixo não tiram o cinza do lugar
  assert.ok(perto(ajustar(cinza, { ...AJUSTES_NEUTROS, contraste: 80, preto: -100 }), cinza, 1e-9))
  // contraste abre a alta e fecha a sombra; preto assenta só a sombra funda
  const c = { ...AJUSTES_NEUTROS, contraste: 60 }
  assert.ok(ajustar([0.72, 0.72, 0.72], c)[1] > 0.72 && ajustar([0.045, 0.045, 0.045], c)[1] < 0.045)
  const p = { ...AJUSTES_NEUTROS, preto: -100 }
  assert.ok(ajustar([0.002, 0.002, 0.002], p)[1] < 0.001)
  assert.ok(Math.abs(ajustar([0.12, 0.12, 0.12], p)[1] - 0.12) < 0.002)
  assert.ok(ajustar([0, 0, 0], { ...AJUSTES_NEUTROS, preto: 100 })[1] > 0, 'preto para cima levanta o preto puro')
  // temperatura: o cinza esquenta sem mudar de luz; saturação -100 é P&B
  const q = ajustar(cinza, { ...AJUSTES_NEUTROS, temperatura: 100 })
  assert.ok(q[0] > q[2])
  assert.ok(Math.abs(0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2] - 0.18) < 1e-9)
  const pb = ajustar([0.4, 0.1, 0.05], { ...AJUSTES_NEUTROS, saturacao: -100 })
  assert.ok(perto(pb, [pb[1], pb[1], pb[1]], 1e-12))
  // a luz nunca inverte com contraste e preto juntos
  let antes = -1
  for (let y = 0.0005; y < 4; y *= 1.15) {
    const v = ajustar([y, y, y], { ...AJUSTES_NEUTROS, contraste: 100, preto: -100 })[1]
    assert.ok(v >= antes, `desceu em ${y}`)
    antes = v
  }
})

test('cor: a câmera vai e volta (o log refeito para a LUT de câmera é o mesmo código)', () => {
  for (const perfil of ['slog3-cine', 'logc3', 'vlog', 'clog3']) {
    const cam = camera(perfil)
    for (const x of [[0.41, 0.41, 0.41], [0.55, 0.38, 0.3], [0.2, 0.25, 0.6]]) assert.ok(perto(cam.doLinear(cam.paraLinear(x)), x, 2e-3), `${perfil} ${x}`)
  }
})

test('cor: os caminhos (original, Rec.709, LUT de câmera, LUT criativa e intensidade)', () => {
  assert.equal(criarCor({ modo: 'original', perfil: 'slog3-cine', ajustes: {} }), null, 'nada a fazer: nem filtro')
  // Rec.709 de um arquivo já Rec.709, sem ajuste: o mesmo código
  const r709 = criarCor({ modo: '709', perfil: 'rec709', ajustes: {} })
  assert.ok(perto(r709(0.3, 0.5, 0.7), [0.3, 0.5, 0.7], 1e-9))
  // LUT de câmera sem ajuste: recebe o código do arquivo exato
  const troca = lerCube(cubeDe((r, g, b) => [b, g, r], 17))
  const camLut = criarCor({ modo: 'lut', perfil: 'slog3-cine', lut: troca, espera: 'log', ajustes: {} })
  assert.ok(perto(camLut(0.6, 0.4, 0.2), [0.2, 0.4, 0.6], 1e-5))
  // LUT criativa: recebe o Rec.709 da câmera
  const cam = camera('slog3-cine')
  const r = criarCor({ modo: 'lut', perfil: 'slog3-cine', lut: troca, espera: '709', ajustes: {} })
  const base = cam.para709(cam.paraLinear([0.6, 0.4, 0.2]))
  assert.ok(perto(r(0.6, 0.4, 0.2), [base[2], base[1], base[0]], 1e-4))
  // intensidade 0: o Rec.709 neutro; 0,5: no meio
  const zero = criarCor({ modo: 'lut', perfil: 'slog3-cine', lut: troca, espera: 'log', intensidade: 0, ajustes: {} })
  assert.ok(perto(zero(0.6, 0.4, 0.2), base, 1e-9))
  const meio = criarCor({ modo: 'lut', perfil: 'slog3-cine', lut: troca, espera: 'log', intensidade: 0.5, ajustes: {} })(0.6, 0.4, 0.2)
  assert.ok(perto(meio, base.map((v, i) => (v + [0.2, 0.4, 0.6][i]) / 2), 1e-4))
  // ajuste com LUT de câmera: o log é refeito com a exposição (mais claro na entrada da LUT)
  const mais = criarCor({ modo: 'lut', perfil: 'slog3-cine', lut: lerCube(cubeDe(identidade, 33)), espera: 'log', ajustes: { exposicao: 50 } })
  assert.ok(mais(0.41, 0.41, 0.41)[1] > 0.41 + 0.05)
  assert.throws(() => criarCor({ modo: 'lut', perfil: 'rec709', lut: null, ajustes: {} }), /Escolha a LUT/)
  // a .cube montada tem n³ linhas, tudo entre 0 e 1
  const txt = cubeDaCor(r709, { n: 5 })
  assert.equal(lerCube(txt).n, 5)
})

function filmeVermelho(destino) {
  // imagem com textura e movimento (o Frames pula tela chapada), puxada para o vermelho: a LUT que troca R e B a deixa azul
  const r = spawnSync(ffmpeg, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=4,lutrgb=r=128+val/2:g=val/6:b=val/6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-shortest', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', destino])
  assert.equal(r.status, 0, String(r.stderr))
  return destino
}
/** A cor média de uma imagem ou do quadro do meio de um vídeo (RGB 0–255). */
function media(arquivo, t = null) {
  const a = ['-loglevel', 'error', ...(t != null ? ['-ss', String(t)] : []), '-i', arquivo, '-frames:v', '1', '-vf', 'scale=1:1:flags=area,format=rgb24', '-f', 'rawvideo', '-']
  const r = spawnSync(ffmpeg, a)
  assert.equal(r.status, 0, String(r.stderr))
  return [...r.stdout.subarray(0, 3)]
}

test('Frames com cor: LUT guardada (e recusada quando quebrada), prévia, frames e takes saem com a cor', { skip: semFfmpeg, timeout: 180_000 }, async (t) => {
  const dir = await makeTmpDir('sobedesce-frames-cor-')
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 3 }))
  const video = filmeVermelho(path.join(dir, 'Bruto C0001.mp4'))
  const lutArq = path.join(dir, 'Troca RB.cube')
  await fs.writeFile(lutArq, `TITLE "troca"\n${cubeDe((r, g, b) => [b, g, r], 17)}`)
  const quebrada = path.join(dir, 'Quebrada.cube')
  await fs.writeFile(quebrada, 'LUT_3D_SIZE 4\n0 0 0\n')
  const svc = new FramesService({
    dataRoot: path.join(dir, 'dados'),
    motor: async () => ({ ffmpeg: { path: ffmpeg }, encoder: { nome: 'libx264' } }),
    drive: () => assert.fail('não usa o Drive'),
    baixar: () => assert.fail('não baixa'),
    subir: async () => ({ count: 0 }),
    pastaPadrao: () => path.join(dir, 'Frames'),
  })
  await assert.rejects(svc.guardarLut({ tipo: 'local', caminho: quebrada }), /incompleto/)
  const lut = await svc.guardarLut({ tipo: 'local', caminho: lutArq })
  assert.match(lut.id, /^lut_[a-f0-9]{16}$/)
  assert.equal(lut.nome, 'Troca RB')
  assert.equal(lut.n, 17)
  assert.deepEqual((await svc.luts()).map((x) => x.id), [lut.id])
  // a mesma LUT de novo não duplica
  await svc.guardarLut({ tipo: 'local', caminho: lutArq })
  assert.equal((await svc.luts()).length, 1)

  const cor = { modo: 'lut', perfil: 'rec709', lut: { id: lut.id }, espera: 'log', intensidade: 1, ajustes: {} }
  // prévia: 960 px no máximo, com a cor; o mesmo pedido volta do cache
  const p = await svc.previaCor({ caminho: video, cor })
  const [r, , b] = media(p.arquivo)
  assert.ok(b > 150 && r < 80, `prévia azul: ${r},${b}`)
  assert.equal(p.perfilOrigem, 'escolhido')
  const p2 = await svc.previaCor({ caminho: video, cor })
  assert.equal(p2.arquivo, p.arquivo)

  const id = svc.iniciar({
    origem: { tipo: 'local', caminho: video },
    ajustes: { frames: { quantidade: 2, formato: 'jpg', logo: false }, takes: { quantidade: 1, duracao: 1, formato: 'original', foco: 0.5, audio: true, fade: false, codec: 'h264', logo: false }, logo: null, destino: null, subir: null, cor },
  })
  while (svc.job.status === 'running') await new Promise((res) => setTimeout(res, 100))
  assert.equal(svc.job.status, 'done', svc.job.erro)
  const m = await svc.manifesto(id)
  assert.ok(m.frames.length >= 1 && m.takes.length === 1, `${m.frames.length} frames, ${m.takes.length} takes`)
  assert.equal(m.cor.lut.nome, 'Troca RB')
  assert.match(m.cor.resumo, /Troca RB/)
  for (const f of m.frames) {
    const [fr, , fb] = media(path.join(m.pasta, f.arquivo))
    assert.ok(fb > 150 && fr < 80, `frame azul: ${fr},${fb}`)
  }
  const tk = path.join(m.pasta, m.takes[0].arquivo)
  const [tr, , tb] = media(tk, 0.5)
  assert.ok(tb > 150 && tr < 80, `take azul: ${tr},${tb}`)
  assert.match(spawnSync(ffmpeg, ['-hide_banner', '-i', tk], { encoding: 'utf8' }).stderr, /bt709/)
  // a pasta entregue continua só com o que serve (a LUT montada fica na pasta de dados)
  assert.deepEqual((await fs.readdir(m.pasta)).sort(), ['Frames', 'Takes', 'indice.csv'])
  // "outro frame" também sai com a cor
  const m2 = await svc.frameEm(id, 2.5)
  const novo = m2.frames.find((f) => f.manual)
  const [nr, , nb] = media(path.join(m.pasta, novo.arquivo))
  assert.ok(nb > 150 && nr < 80)

  // sem cor: sai como está (vermelho)
  const id2 = svc.iniciar({ origem: { tipo: 'local', caminho: video }, ajustes: { frames: { quantidade: 1, formato: 'jpg', logo: false }, takes: null, logo: null, destino: null, subir: null, cor: null } })
  while (svc.job.status === 'running') await new Promise((res) => setTimeout(res, 100))
  const m3 = await svc.manifesto(id2)
  assert.equal(m3.cor, null)
  const [vr, , vb] = media(path.join(m3.pasta, m3.frames[0].arquivo))
  assert.ok(vr > 150 && vb < 80, `vermelho: ${vr},${vb}`)
  // a LUT esquecida some da lista
  await svc.esquecerLut(lut.id)
  assert.equal((await svc.luts()).length, 0)
})

test('Frames de uma pasta (cartão): um frame por clipe, com a cor, proxy e RAW de fora, outro frame no clipe', { skip: semFfmpeg, timeout: 240_000 }, async (t) => {
  const dir = await makeTmpDir('sobedesce-frames-pasta-')
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 3 }))
  const cartao = path.join(dir, 'Cartão 03')
  await fs.mkdir(path.join(cartao, 'PRIVATE', 'M4ROOT', 'CLIP'), { recursive: true })
  await fs.mkdir(path.join(cartao, 'PRIVATE', 'M4ROOT', 'SUB'), { recursive: true })
  await fs.mkdir(path.join(cartao, 'Proxy'), { recursive: true })
  filmeVermelho(path.join(cartao, 'PRIVATE', 'M4ROOT', 'CLIP', 'C0010.mp4'))
  filmeVermelho(path.join(cartao, 'PRIVATE', 'M4ROOT', 'CLIP', 'C0002.mp4'))
  filmeVermelho(path.join(cartao, 'A001_C003.mov'))
  filmeVermelho(path.join(cartao, 'PRIVATE', 'M4ROOT', 'SUB', 'C0002S03.mp4')) // proxy da Sony: fica de fora
  filmeVermelho(path.join(cartao, 'Proxy', 'A001_C003.mp4')) // proxy: fica de fora
  await fs.writeFile(path.join(cartao, 'A002_C001.braw'), 'raw') // RAW: o conversor não lê
  const lutArq = path.join(dir, 'Troca.cube')
  await fs.writeFile(lutArq, cubeDe((r, g, b) => [b, g, r], 17))
  const svc = new FramesService({
    dataRoot: path.join(dir, 'dados'),
    motor: async () => ({ ffmpeg: { path: ffmpeg }, encoder: { nome: 'libx264' } }),
    drive: () => assert.fail('não usa o Drive'),
    baixar: () => assert.fail('não baixa'),
    subir: async () => ({ count: 0 }),
    pastaPadrao: () => path.join(dir, 'Frames'),
  })
  const lida = await svc.lerPasta(cartao)
  assert.equal(lida.clipes, 3)
  assert.equal(lida.ignorados.raw, 1)
  assert.match(lida.primeiro, /A001_C003\.mov$/)
  const lut = await svc.guardarLut({ tipo: 'local', caminho: lutArq })
  const id = svc.iniciar({
    origem: { tipo: 'pasta', caminho: cartao },
    ajustes: { frames: { quantidade: 99, formato: 'jpg', logo: false }, takes: null, logo: null, destino: null, subir: null, cor: { modo: 'lut', perfil: 'auto', lut: { id: lut.id }, espera: 'log', intensidade: 1, ajustes: { exposicao: 0 } } },
  })
  while (svc.job.status === 'running') await new Promise((res) => setTimeout(res, 100))
  assert.equal(svc.job.status, 'done', svc.job.erro)
  const m = await svc.manifesto(id)
  assert.equal(m.pasta, path.join(dir, 'Frames', 'Cartão 03 — Frames'))
  // um por clipe, na ordem do nome (C0002 antes de C0010), com o nome do clipe
  assert.deepEqual(m.cenas.map((c) => c.nome), ['A001_C003', 'C0002', 'C0010'])
  assert.equal(m.frames.length, 3)
  for (const [i, f] of m.frames.entries()) {
    assert.match(f.arquivo, new RegExp(`^Frames[\\\\/]${m.cenas[i].nome}_F00${i + 1}_\\d\\d-\\d\\d-\\d\\d-\\d\\d\\.jpg$`))
    const [r, , b] = media(path.join(m.pasta, f.arquivo))
    assert.ok(b > 150 && r < 80, `com a cor: ${r},${b}`)
    // longe do começo e do fim do clipe
    assert.ok(f.t > 0.3 && f.t < 3.7, `t ${f.t}`)
  }
  assert.equal(m.takes.length, 0)
  // outro frame do clipe: troca por outro ponto do mesmo clipe, com a cor
  const m2 = await svc.maisUm(id, { trocar: m.frames[1].id })
  const novo = m2.frames.find((f) => !f.descartado && f.cena === 2)
  assert.ok(novo && novo.id !== m.frames[1].id && Math.abs(novo.t - m.frames[1].t) > 0.4)
  const [r2, , b2] = media(path.join(m.pasta, novo.arquivo))
  assert.ok(b2 > 150 && r2 < 80)
  await assert.rejects(svc.frameEm(id, 1), /Outro frame/)
  // a pasta entregue só tem os frames e o índice
  assert.deepEqual((await fs.readdir(m.pasta)).sort(), ['Frames', 'indice.csv'])
  // pasta sem vídeo
  const vazia = path.join(dir, 'vazia')
  await fs.mkdir(vazia)
  await fs.writeFile(path.join(vazia, 'B001.braw'), 'raw')
  svc.iniciar({ origem: { tipo: 'pasta', caminho: vazia }, ajustes: { frames: { quantidade: 1, formato: 'jpg', logo: false }, takes: null, logo: null, destino: null, subir: null, cor: null } })
  while (svc.job.status === 'running') await new Promise((res) => setTimeout(res, 50))
  assert.equal(svc.job.status, 'error')
  assert.match(svc.job.erro, /só tem RAW/)
})
