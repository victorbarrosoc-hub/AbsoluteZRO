// Cor da Revela no Relay: a receita vira LUT pela conta da própria Revela (src/revela/ é cópia conferida), e um arquivo
// em S-Log3 sai em Rec.709 no ffmpeg com as cores que a Revela calcula, faixa a faixa.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ENTRADAS_COR, aplicarEtapas, assarParaFfmpeg, descreverReceita, etapasParaPlaca, funcaoDaReceita, lerLook, receitaDe } from '../src/cor.js'
import { criarCst } from '../src/revela/espacos.js'
import { aplicar, assar, escreverCube, lerCube } from '../src/revela/cube.js'
import { especificacaoDe, presetPersonalizado } from '../src/personalizado.js'
import { preset } from '../src/presets.js'
import { planejar } from '../src/plano.js'
import { argsFfmpeg } from '../src/ffmpeg.js'
import { centros, esperado, maiorDiferenca, quadroRgb48 } from './carta.js'

const temFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-filters'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
})()

/** Look de teste: esquenta (mais vermelho, menos azul) e sobe o contraste um pouco. */
const LOOK = (() => {
  const n = 17
  const dados = new Float32Array(n ** 3 * 3)
  let i = 0
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++) {
        const c = [r, g, b].map((v) => v / (n - 1))
        const contraste = (v) => Math.min(1, Math.max(0, 0.5 + (v - 0.5) * 1.15))
        dados[i++] = contraste(c[0] * 1.06)
        dados[i++] = contraste(c[1])
        dados[i++] = contraste(c[2] * 0.9)
      }
  return { tamanho: n, dados }
})()

test('receita: limpa o que veio torto e descreve em uma linha', () => {
  assert.equal(receitaDe(null), null)
  assert.equal(receitaDe({ entrada: 'nao-existe' }), null)
  assert.deepEqual(receitaDe({ entrada: 'sony-slog3-cine', tom: 'x' }), { entrada: 'sony-slog3-cine', tom: 'suave', look: null })
  assert.equal(descreverReceita({ entrada: 'sony-slog3-cine', tom: 'suave', look: { id: 'look-1234', nome: 'Verão' } }), 'S-Log3 / S-Gamut3.Cine → Rec.709 · look Verão')
  assert.ok(ENTRADAS_COR.some((e) => e.id === 'arri-logc4') && ENTRADAS_COR.some((e) => e.id === 'panasonic-vlog'))
})

test('a conta da placa (curva, matriz, tom, gamut, 2.4) é a CST da Revela em toda câmera, com e sem tom', () => {
  for (const { id } of ENTRADAS_COR)
    for (const tom of ['suave', 'nenhum']) {
      const r = { entrada: id, tom, look: null }
      const f = funcaoDaReceita(r)
      const etapas = etapasParaPlaca(r)
      let pior = 0
      for (let i = 0; i < 3000; i++) {
        const c = [(i * 0.6180339) % 1, (i * 0.4142135) % 1, (i * 0.7320508) % 1]
        const a = f(...c)
        const b = aplicarEtapas(etapas, ...c)
        pior = Math.max(pior, ...a.map((x, k) => Math.abs(x - b[k]) * 255))
      }
      assert.ok(pior < 1.2, `${id} ${tom}: ${pior.toFixed(2)}/255`)
    }
  // uma LUT 3D de 65 pontos erraria muito mais em cor saturada: é por isso que a placa faz a conta
  const r = { entrada: 'sony-slog3-cine', tom: 'suave', look: null }
  const lut = assar(funcaoDaReceita(r), 65)
  const verdeAgua = [0.589, 0.702, 0.645]
  const exato = funcaoDaReceita(r)(...verdeAgua)
  assert.ok(Math.abs(aplicar(lut, ...verdeAgua)[0] - exato[0]) * 255 > 20)
  assert.ok(Math.abs(aplicarEtapas(etapasParaPlaca(r), ...verdeAgua)[0] - exato[0]) * 255 < 1)
  // com look: a CST e depois o look; sem o look no aparelho, erro claro (nunca sem ele)
  const comLook = funcaoDaReceita({ ...r, look: { id: 'look-teste', nome: 'Teste' } }, LOOK)
  const final = comLook(0.41, 0.41, 0.41)
  const meio = funcaoDaReceita(r)(0.41, 0.41, 0.41)
  assert.ok(final[0] > meio[0] && final[2] < meio[2], 'o look esquenta')
  const b = aplicarEtapas(etapasParaPlaca({ ...r, look: { id: 'look-teste', nome: 'Teste' } }, LOOK), 0.41, 0.41, 0.41)
  assert.ok(Math.max(...b.map((x, k) => Math.abs(x - final[k]))) * 255 < 1)
  assert.throws(() => funcaoDaReceita({ ...r, look: { id: 'look-teste', nome: 'Teste' } }), /não está neste aparelho/)
  assert.throws(() => etapasParaPlaca({ ...r, look: { id: 'look-teste', nome: 'Teste' } }), /não está neste aparelho/)
  assert.throws(() => lerLook('LUT_1D_SIZE 4'), /não abre/)
  // só look: nada de curva nem matriz
  assert.deepEqual(etapasParaPlaca({ entrada: null, tom: 'suave', look: { id: 'look-teste', nome: 'Teste' } }, LOOK).curva, null)
})

test('LUT do ffmpeg: desfaz a faixa de vídeo por dentro (o RGB chega esticado); só look não mexe na faixa', () => {
  const r = { entrada: 'sony-slog3-cine', tom: 'suave', look: null }
  const tv = lerCube(assarParaFfmpeg(r, null, 'tv', 33))
  const pc = lerCube(assarParaFfmpeg(r, null, 'pc', 33))
  const f = funcaoDaReceita(r)
  // RGB esticado 0,5 = código (0,5 × 876 + 64) / 1023
  const codigo = (0.5 * 876 + 64) / 1023
  const alvo = f(codigo, codigo, codigo)
  const medido = aplicar(tv, 0.5, 0.5, 0.5)
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(medido[c] - alvo[c]) < 0.004, `tv canal ${c}: ${medido[c]} × ${alvo[c]}`)
  const cheio = aplicar(pc, 0.5, 0.5, 0.5)
  const alvoCheio = f(0.5, 0.5, 0.5)
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(cheio[c] - alvoCheio[c]) < 0.004, `pc canal ${c}`)
  const soLook = lerCube(assarParaFfmpeg({ entrada: null, tom: 'suave', look: { id: 'look-teste', nome: 'Teste' } }, LOOK, 'tv', 33))
  const x = aplicar(soLook, 0.5, 0.5, 0.5)
  const y = aplicar(LOOK, 0.5, 0.5, 0.5)
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(x[c] - y[c]) < 0.004, `só look canal ${c}`)
})

test('S-Log3 de verdade no ffmpeg: sai Rec.709 com as cores da Revela, com e sem look', { skip: !temFfmpeg && 'sem ffmpeg' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-cor-'))
  try {
    const [w, h] = [640, 360]
    const raw = join(dir, 'carta.rgb')
    writeFileSync(raw, quadroRgb48(w, h))
    const entrada = join(dir, 'slog3.mov')
    // como a câmera grava: 10 bits 4:2:2, faixa de vídeo, matriz BT.709
    execFileSync('ffmpeg', ['-v', 'error', '-stream_loop', '11', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', `${w}x${h}`, '-r', '24', '-i', raw, '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv422p10le', '-c:v', 'prores_ks', '-profile:v', '3', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', entrada])
    const origem = { largura: w, altura: h, fps: 24, duracao: 0.5, temVideo: true, temAudio: false, cor: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false } }
    for (const [nome, cor, look] of [
      ['cst', { entrada: 'sony-slog3-cine', entradaNome: 'S-Log3', tom: 'suave', look: null }, null],
      ['cst+look', { entrada: 'sony-slog3-cine', entradaNome: 'S-Log3', tom: 'suave', look: { id: 'look-teste', nome: 'Teste' } }, LOOK],
    ]) {
      const p = presetPersonalizado({ ...especificacaoDe(preset('youtube-1080')), nome, qualidade: 'rf', rf: 10, cor })
      const plano = planejar(origem, p, { motor: 'computador' })
      const cube = join(dir, `${nome}.cube`)
      writeFileSync(cube, assarParaFfmpeg(plano.receitaCor, look, plano.entrada.faixa))
      const saida = join(dir, `${nome}.mp4`)
      for (const a of argsFfmpeg(plano, { input: entrada, output: saida, origem, lut: cube })) execFileSync('ffmpeg', a, { stdio: 'pipe' })
      const rgb = execFileSync('ffmpeg', ['-v', 'error', '-i', saida, '-frames:v', '1', '-vf', 'scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgb24', '-f', 'rawvideo', '-'])
      const medido = centros(rgb, w, h)
      const alvo = esperado(cor, look)
      const erro = maiorDiferenca(medido, alvo)
      assert.ok(erro <= 3, `${nome}: diferença de ${erro.toFixed(1)}/255\nmedido ${JSON.stringify(medido)}\nalvo ${JSON.stringify(alvo.map((p) => p.map(Math.round)))}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cube da Revela ida e volta (a cópia lê o que escreve)', () => {
  const lut = assar(funcaoDaReceita({ entrada: 'arri-logc3', tom: 'nenhum', look: null }), 17)
  const lido = lerCube(escreverCube(lut, 'teste'))
  assert.equal(lido.tamanho, 17)
  assert.ok(Math.abs(lido.dados[100] - Math.min(1, Math.max(0, lut.dados[100]))) < 1e-5)
})
