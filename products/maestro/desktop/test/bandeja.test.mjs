// O ícone do cronômetro (npm run icones:bandeja): todos os tamanhos, o do Mac é de modelo (preto + transparência), o do
// Windows tem a versão clara e a escura, e "rodando" tem o ponto no canto. Também a ponte da página com o cronômetro.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { lerPng } from '../../../../apps/hub-desktop/scripts/png.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BANDEJA = path.join(RAIZ, 'desktop', 'bandeja')
const ler = (f) => lerPng(fs.readFileSync(path.join(BANDEJA, f)))
const px = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4))
const tinta = (img, x0 = 0, y0 = 0, x1 = img.width, y1 = img.height) => {
  let n = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) n += px(img, x, y)[3] / 255
  return n
}

test('todos os tamanhos (1x, 1,5x e 2x), com o fundo transparente', () => {
  const esperados = {
    'bandejaTemplate.png': [20, 16],
    'bandejaTemplate@2x.png': [40, 32],
    'bandejaRodandoTemplate.png': [20, 16],
    'bandejaRodandoTemplate@2x.png': [40, 32],
  }
  for (const tema of ['claro', 'escuro'])
    for (const r of ['', '-rodando'])
      for (const [s, lado] of [
        ['', 16],
        ['@1.5x', 24],
        ['@2x', 32],
      ])
        esperados[`bandeja-windows-${tema}${r}${s}.png`] = [lado, lado]
  assert.deepEqual(fs.readdirSync(BANDEJA).sort(), Object.keys(esperados).sort())
  for (const [f, [w, h]] of Object.entries(esperados)) {
    const img = ler(f)
    assert.equal(img.width, w, f)
    assert.equal(img.height, h, f)
    assert.equal(px(img, 0, 0)[3], 0, `${f}: canto transparente`)
    // nem vazio nem borrão: o gesto ocupa uma fração da área
    const frac = tinta(img) / (w * h)
    assert.ok(frac > 0.08 && frac < 0.45, `${f}: tinta ${frac.toFixed(2)}`)
  }
})

test('Mac: ícone de modelo (só preto com transparência: o sistema pinta no claro e no escuro)', () => {
  for (const f of ['bandejaTemplate.png', 'bandejaTemplate@2x.png', 'bandejaRodandoTemplate.png', 'bandejaRodandoTemplate@2x.png']) {
    const img = ler(f)
    for (let i = 0; i < img.width * img.height; i++) {
      const [r, g, b, a] = img.data.slice(i * 4, i * 4 + 4)
      if (a > 0) assert.ok(r < 8 && g < 8 && b < 8, `${f}: pixel colorido ${[r, g, b, a]}`)
    }
  }
})

test('Windows: grafite na barra clara, branco na escura (uma cor só)', () => {
  const cor = (img) => {
    let m = [0, 0, 0, 0]
    for (let i = 0; i < img.width * img.height; i++) if (img.data[i * 4 + 3] > m[3]) m = Array.from(img.data.slice(i * 4, i * 4 + 4))
    return m.slice(0, 3)
  }
  assert.deepEqual(cor(ler('bandeja-windows-claro@2x.png')), [29, 29, 31])
  assert.deepEqual(cor(ler('bandeja-windows-escuro@2x.png')), [255, 255, 255])
})

test('rodando = o mesmo gesto com o ponto no canto de baixo', () => {
  for (const [parado, rodando] of [
    ['bandejaTemplate@2x.png', 'bandejaRodandoTemplate@2x.png'],
    ['bandeja-windows-escuro@2x.png', 'bandeja-windows-escuro-rodando@2x.png'],
  ]) {
    const a = ler(parado)
    const b = ler(rodando)
    const canto = (img) => tinta(img, Math.floor(img.width * 0.7), Math.floor(img.height * 0.7))
    assert.ok(canto(a) < 2, `${parado}: canto vazio`)
    assert.ok(canto(b) > 12, `${rodando}: o ponto`)
  }
})

test('a ponte da página tem o cronômetro (só dados simples; nada do Node)', () => {
  const pre = fs.readFileSync(path.join(RAIZ, 'desktop', 'preload.cjs'), 'utf8')
  for (const nome of ['aoMudar', 'aoPomodoro', 'aoParado', 'aoAbrirPainel', 'pronto', 'pomodoro', 'paradoResolvido'])
    assert.match(pre, new RegExp(`\\b${nome}\\b`))
  assert.doesNotMatch(pre, /ipcRenderer\.(invoke|send)\([^)]*\bfetch\b/)
  const main = fs.readFileSync(path.join(RAIZ, 'desktop', 'main.cjs'), 'utf8')
  // só a página do Maestro, no quadro principal da janela, fala com o cronômetro; e só três canais
  assert.match(
    main,
    /ipcMain\.on\('tempo:do-site', \(e, canal, dados\) => \{\n\s+if \(!cronometro \|\| !daView\(e\) \|\| !regras\.ehDoMaestro\(e\.senderFrame\.url, O\)\) return/,
  )
  assert.match(main, /\['pronto', 'pomodoro', 'parado-resolvido'\]\.includes\(canal\)/)
})
