import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autopilot, lerFabricante, pareceLog, pistaDoFabricante, pistaDoNome } from '../src/cor/autopilot.js'
import { ENTRADAS, criarCst } from '../src/cor/espacos.js'
import { cena } from './apoio.js'

const REC709 = { curva: 'rec709', gamut: 'rec709' }
// as câmeras de verdade: DaVinci Intermediate e ACEScct são espaços de trabalho, não o que sai do cartão
const CAMERAS = ENTRADAS.filter((e) => !['davinci', 'acescct'].includes(e.id))

/** A mesma cena, como a câmera gravaria em log. */
function emLog(pixels, camera) {
  const f = criarCst(REC709, camera, { tom: 'nenhum', gamut: 'cortar' }).aplicar
  const out = new Float32Array(pixels.length)
  for (let i = 0; i < pixels.length; i += 3) {
    const o = f(pixels[i], pixels[i + 1], pixels[i + 2])
    out[i] = o[0]
    out[i + 1] = o[1]
    out[i + 2] = o[2]
  }
  return out
}

test('Autopilot: still tratado (Rec.709) não é log', () => {
  for (const semente of [1, 2, 3, 4, 5, 6]) assert.equal(pareceLog(cena(semente).pixels).log, false, `cena ${semente}`)
})

test('Autopilot: a mesma cena no log de cada câmera é reconhecida como log', () => {
  for (const camera of CAMERAS)
    for (const semente of [1, 2, 3]) {
      const l = pareceLog(emLog(cena(semente).pixels, camera))
      assert.equal(l.log, true, `${camera.id}, cena ${semente}: preto ${l.preto.toFixed(3)}, branco ${l.branco.toFixed(3)}, croma ${l.croma.toFixed(3)}`)
    }
})

test('Autopilot: frame lavado de propósito (véu no preto, pouca cor) continua sendo still', () => {
  const { pixels } = cena(7)
  // a cena sintética não tem preto de verdade: desce o preto a zero, como um still tratado, e põe o véu por cima
  const piso = pixels.reduce((m, v) => Math.min(m, v), 1)
  const lavado = pixels.map((v) => 0.045 + ((v - piso) / (1 - piso)) * 0.8)
  assert.equal(pareceLog(lavado).log, false)
  // e um frame quase branco (vestido, neve) também
  const claro = pixels.map((v) => 0.6 + v * 0.38)
  assert.equal(pareceLog(claro).log, false)
})

test('Autopilot: a câmera sai do nome do arquivo', () => {
  assert.equal(pistaDoNome('A001C003_SLog3.jpg'), 'sony-slog3-cine')
  assert.equal(pistaDoNome('casamento s-log2 frame.png'), 'sony-slog2')
  assert.equal(pistaDoNome('alexa35_logc4_0012.tif'), 'arri-logc4')
  assert.equal(pistaDoNome('B002_LogC.jpg'), 'arri-logc3')
  assert.equal(pistaDoNome('clip_clog3.jpg'), 'canon-clog3')
  assert.equal(pistaDoNome('GH6 V-Log.jpg'), 'panasonic-vlog')
  assert.equal(pistaDoNome('XH2S_flog2.jpg'), 'fuji-flog2')
  assert.equal(pistaDoNome('DJI_0042.JPG'), 'dji-dlog')
  assert.equal(pistaDoNome('komodo_log3g10.jpg'), 'red-log3g10')
  assert.equal(pistaDoNome('still-1.2.1.jpg'), null)
  assert.equal(pistaDoNome('catalogo.jpg'), null) // "log" solto não é pista
  for (const id of [pistaDoNome('x_slog3.jpg'), pistaDoFabricante('SONY'), pistaDoFabricante('FUJIFILM')]) assert.ok(ENTRADAS.some((e) => e.id === id))
})

/** JPEG mínimo com EXIF: só a tag Make. */
function jpegComFabricante(texto, littleEndian = true) {
  const make = new TextEncoder().encode(`${texto}\0`)
  const tiff = new DataView(new ArrayBuffer(8 + 2 + 12 + 4 + make.length))
  tiff.setUint16(0, littleEndian ? 0x4949 : 0x4d4d)
  tiff.setUint16(2, 42, littleEndian)
  tiff.setUint32(4, 8, littleEndian)
  tiff.setUint16(8, 1, littleEndian)
  tiff.setUint16(10, 0x010f, littleEndian)
  tiff.setUint16(12, 2, littleEndian)
  tiff.setUint32(14, make.length, littleEndian)
  tiff.setUint32(18, 26, littleEndian)
  new Uint8Array(tiff.buffer).set(make, 26)
  const app1 = 2 + 6 + tiff.byteLength
  const out = new DataView(new ArrayBuffer(2 + 2 + app1 + 2))
  out.setUint16(0, 0xffd8)
  out.setUint16(2, 0xffe1)
  out.setUint16(4, app1)
  out.setUint32(6, 0x45786966)
  new Uint8Array(out.buffer).set(new Uint8Array(tiff.buffer), 12)
  out.setUint16(4 + app1, 0xffd9)
  return out.buffer
}

test('Autopilot: lê o fabricante do EXIF e não quebra com arquivo estranho', () => {
  assert.equal(lerFabricante(jpegComFabricante('SONY')), 'SONY')
  assert.equal(lerFabricante(jpegComFabricante('Canon', false)), 'Canon')
  assert.equal(lerFabricante(new ArrayBuffer(0)), '')
  assert.equal(lerFabricante(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 2, 3, 4, 5, 6]).buffer), '')
  assert.equal(lerFabricante(new Uint8Array(64).fill(7).buffer), '')
})

test('Autopilot: só afirma a câmera com pista; sem pista, pede', () => {
  const still = cena(2).pixels
  const log = emLog(still, ENTRADAS.find((e) => e.id === 'sony-slog3-cine'))
  assert.deepEqual(pick(autopilot({ pixels: still, nome: 'frame_slog3.jpg' })), { entrada: 'still', log: false, pista: null })
  assert.deepEqual(pick(autopilot({ pixels: log, nome: 'frame_vlog.jpg' })), { entrada: 'panasonic-vlog', log: true, pista: 'nome' })
  assert.deepEqual(pick(autopilot({ pixels: log, nome: 'frame.jpg', fabricante: 'Canon' })), { entrada: 'canon-clog3', log: true, pista: 'exif' })
  assert.deepEqual(pick(autopilot({ pixels: log, nome: 'frame.jpg', ultima: 'arri-logc3' })), { entrada: 'arri-logc3', log: true, pista: 'ultima' })
  assert.deepEqual(pick(autopilot({ pixels: log, nome: 'frame.jpg', ultima: 'inventada' })), { entrada: null, log: true, pista: null })
  assert.match(autopilot({ pixels: log, nome: 'frame.jpg' }).frase, /câmera\?$/)
})

const pick = ({ entrada, log, pista }) => ({ entrada, log, pista })
