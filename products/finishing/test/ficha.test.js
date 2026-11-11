import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FORMATOS_FICHA, montarFicha, paletaDominante } from '../src/imagem/ficha.js'
import { cena } from './apoio.js'

/** Quadro de `w` × `h` com faixas verticais das cores dadas (RGBA 8 bits). */
function faixas(cores, w = 200, h = 100) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = cores[Math.min(cores.length - 1, Math.floor((x / w) * cores.length))]
      data.set([...c, 255], (y * w + x) * 4)
    }
  return { data, w, h }
}

test('Ficha: a paleta acha as cores do quadro, onde elas estão e quanto ocupam', () => {
  const cores = [
    [20, 24, 40],
    [190, 60, 40],
    [60, 130, 90],
    [235, 225, 200],
  ]
  const { data, w, h } = faixas(cores)
  const paleta = paletaDominante(data, w, h, 5)
  assert.equal(paleta.length, 4)
  // da mais escura para a mais clara
  assert.deepEqual(
    paleta.map((p) => p.hex),
    ['#141828', '#BE3C28', '#3C825A', '#EBE1C8'],
  )
  const ordem = [0, 1, 2, 3]
  for (const [i, p] of paleta.entries()) {
    assert.ok(Math.abs(p.peso - 0.25) < 0.03, `peso ${p.peso}`)
    assert.equal(Math.floor(p.x * 4), ordem[i], `a cor ${p.hex} está na faixa ${i}`)
    assert.ok(p.y > 0 && p.y < 1)
  }
})

test('Ficha: a paleta é sempre a mesma para o mesmo quadro e não inventa cor em quadro liso', () => {
  const { pixels, largura, altura } = cena(3)
  const data = new Uint8ClampedArray(largura * altura * 4)
  for (let i = 0, j = 0; j < pixels.length; i += 4, j += 3) data.set([pixels[j] * 255, pixels[j + 1] * 255, pixels[j + 2] * 255, 255], i)
  const a = paletaDominante(data, largura, altura, 5)
  const b = paletaDominante(data, largura, altura, 5)
  assert.deepEqual(a, b)
  assert.ok(a.length >= 3 && a.length <= 5)
  assert.ok(a.reduce((s, p) => s + p.peso, 0) <= 1.0001)
  const liso = faixas([[120, 120, 120]])
  assert.equal(paletaDominante(liso.data, liso.w, liso.h, 5).length, 1)
  assert.deepEqual(paletaDominante(new Uint8ClampedArray(0), 0, 0), [])
})

const dentro = (r, w, h) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 1 && r.y + r.h <= h + 1
const cruza = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1

test('Ficha: em qualquer proporção e nos dois formatos, tudo cabe e nada passa por cima do quadro', () => {
  const paleta = [0.1, 0.3, 0.5, 0.7, 0.9].map((x, i) => ({ hex: '#808080', rgb: [128, 128, 128], x, y: 0.2 + i * 0.15, peso: 0.2 }))
  const dados = {
    titulo: 'Closed eyes',
    creditos: { direcao: 'A', fotografia: 'B', cor: 'C', ano: '2026' },
    tecnica: { copia: '2383', negativo: '500T', look: 'Revela', camera: 'S-Log3', formato: '3840 × 2160', textura: '35 mm' },
    paleta,
  }
  for (const formato of FORMATOS_FICHA)
    for (const proporcao of [2.39, 16 / 9, 3 / 2, 1, 4 / 5, 9 / 16]) {
      const p = montarFicha({ ...dados, formato: formato.id, proporcao })
      const onde = `${formato.id} ${proporcao.toFixed(2)}`
      assert.equal(p.w, formato.w)
      assert.equal(p.h, formato.h)
      assert.ok(Math.abs(p.imagem.w / p.imagem.h - proporcao) < 0.01, `${onde}: proporção do quadro`)
      assert.ok(p.imagem.w > formato.w * 0.2, `${onde}: quadro grande o bastante`)
      const caixas = [p.titulo, p.marca, p.imagem, ...p.creditos, ...p.tecnica, ...p.amostras]
      for (const c of caixas) assert.ok(dentro(c, p.w, p.h), `${onde}: ${JSON.stringify(c)} fora da ficha`)
      for (const c of [p.titulo, ...p.creditos, ...p.tecnica, ...p.amostras]) assert.ok(!cruza(c, p.imagem), `${onde}: ${c.rotulo ?? 'caixa'} sobre o quadro`)
      for (const c of p.creditos) for (const t of p.tecnica) assert.ok(!cruza(c, t), `${onde}: créditos sobre a técnica`)
      assert.equal(p.pontos.length, 5)
      for (const pt of p.pontos) assert.ok(pt.x >= p.imagem.x && pt.x <= p.imagem.x + p.imagem.w && pt.y >= p.imagem.y && pt.y <= p.imagem.y + p.imagem.h)
    }
})

test('Ficha: crédito vazio não ocupa lugar e o título nunca fica em branco', () => {
  const p = montarFicha({ creditos: { direcao: '  ', fotografia: 'Ana', ano: '' }, tecnica: { look: 'Revela' } })
  assert.deepEqual(
    p.creditos.map((c) => [c.rotulo, c.valor]),
    [['Fotografia', 'Ana']],
  )
  assert.deepEqual(
    p.tecnica.map((c) => c.rotulo),
    ['Look'],
  )
  assert.equal(p.titulo.texto, 'Sem título')
  assert.equal(montarFicha({ formato: 'inventado' }).w, FORMATOS_FICHA[0].w)
  assert.equal(montarFicha({}).creditos.length, 0)
})
