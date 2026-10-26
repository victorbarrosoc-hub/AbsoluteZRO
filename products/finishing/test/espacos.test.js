import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CURVAS, ENTRADAS, SAIDAS, criarCst, matrizGamut, rgbParaXyz } from '../src/cor/espacos.js'

const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b}`)

test('cinza 18% de cada log no valor que o fabricante publica', () => {
  const cinza = {
    slog3: 420 / 1023, // Sony: código 420
    slog2: 347 / 1023, // Sony: código 347
    logc3: 0.391, // ARRI: 0,391 (EI 800)
    logc4: 0.278396, // ARRI: 0,2784
    vlog: 433 / 1023, // Panasonic: código 433
    clog3: (0.343 * 876 + 64) / 1023, // Canon: 34,3% IRE
    clog2: (0.398 * 876 + 64) / 1023,
    bmdgen5: 0.3836,
    flog2: 0.391,
    flog: 0.4593,
    nlog: 372 / 1023,
    log3g10: 1 / 3, // RED: cinza em 1/3
    davinci: 0.336,
    acescct: 0.4136,
    rec709: 0.18 ** (1 / 2.4),
  }
  for (const [id, v] of Object.entries(cinza)) perto(CURVAS[id].deLinear(0.18), v, 0.0015, id)
})

test('toda curva vai e volta (código → linear → código)', () => {
  for (const [id, c] of Object.entries(CURVAS)) {
    for (const x of [0, 0.001, 0.01, 0.18, 0.9, 4, 12]) {
      const volta = c.paraLinear(c.deLinear(x))
      assert.ok(Math.abs(volta - x) <= 1e-4 * Math.max(1, x), `${id} em ${x}: ${volta}`)
    }
  }
})

test('matrizes: Rec.709 → XYZ padrão; S-Gamut3.Cine e AP1 → Rec.709 iguais às de referência', () => {
  const m = rgbParaXyz('rec709')
  perto(m[0][0], 0.4124, 1e-4, 'Rec.709 X/R')
  perto(m[1][1], 0.7152, 1e-4, 'Rec.709 Y/G')
  perto(m[2][2], 0.9505, 1e-4, 'Rec.709 Z/B')
  const s = matrizGamut('sgamut3cine', 'rec709')
  perto(s[0][0], 1.6269474, 1e-4, 'S-Gamut3.Cine')
  perto(s[1][2], -0.2394254, 1e-4, 'S-Gamut3.Cine')
  const a = matrizGamut('ap1', 'rec709') // com Bradford, branco do ACES → D65
  perto(a[0][0], 1.7051, 1e-3, 'AP1')
  perto(a[2][1], -0.129, 1e-3, 'AP1')
  // branco continua branco em qualquer par de gamuts
  for (const g of ['dwg', 'awg4', 'redwg', 'cinema', 'ap1']) {
    const linha = matrizGamut(g, 'rec709').map((l) => l[0] + l[1] + l[2])
    linha.forEach((v) => perto(v, 1, 1e-3, `branco de ${g}`))
  }
})

test('CST: cinza da câmera vira cinza 18% na tela, neutro', () => {
  for (const e of ENTRADAS) {
    const cst = criarCst(e.id, 'rec709')
    const v = CURVAS[e.curva].deLinear(0.18)
    const [r, g, b] = cst.aplicar(v, v, v)
    perto(r, 0.18 ** (1 / 2.4), 0.003, e.id)
    perto(g, r, 0.002, `${e.id} neutro`)
    perto(b, r, 0.002, `${e.id} neutro`)
  }
})

test('CST: mesma origem e destino não mexe; log para log não corta acima do branco', () => {
  const igual = criarCst('rec709', 'rec709', { tom: 'nenhum' })
  for (const v of [0, 0.25, 0.5, 1]) perto(igual.aplicar(v, v, v)[0], v, 1e-9, 'identidade')
  const paraDwg = criarCst('sony-slog3-cine', 'davinci')
  const alto = CURVAS.slog3.deLinear(8)
  const [r] = paraDwg.aplicar(alto, alto, alto)
  perto(r, CURVAS.davinci.deLinear(8), 0.002, '8 stops acima continuam no DaVinci Intermediate')
})

test('CST: suavizar altas deita o branco sem cortar; sem suavizar corta', () => {
  const v = CURVAS.slog3.deLinear(2)
  const suave = criarCst('sony-slog3-cine', 'rec709').aplicar(v, v, v)[0]
  const duro = criarCst('sony-slog3-cine', 'rec709', { tom: 'nenhum' }).aplicar(v, v, v)[0]
  assert.equal(duro, 1)
  assert.ok(suave < 1 && suave > 0.95, `suave: ${suave}`)
  // cor saturada fora do Rec.709 não sai com canal negativo
  const verde = criarCst('sony-slog3-cine', 'rec709').aplicar(0.3, 0.6, 0.3)
  verde.forEach((c) => assert.ok(c >= 0 && c <= 1))
  assert.ok(ENTRADAS.length >= 15 && SAIDAS.length >= 5)
})
