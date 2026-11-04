// REVELAFILM · imagens da página inicial: o mesmo frame em log e revelado em cada película, pelo próprio motor.
// O "log" é o frame levado para a luz da cena e gravado na curva LogC3, com a cor contida (a imagem lavada que sai
// da câmera);
// o "revelado" é a mesma cena pelo look da película, com a textura dela (grão de 35 mm e halation).
// Uso: node scripts/home-revelacoes.mjs  (precisa do ffmpeg para ler e gravar JPEG; os arquivos entram no repositório).

import { execFileSync } from 'node:child_process'
import { criarLab, paraCena } from '../src/cor/lab.js'
import { aplicarTextura } from '../src/cor/textura.js'
import { criarTela } from '../src/cor/cena.js'
import { CURVAS } from '../src/cor/espacos.js'

const raiz = new URL('..', import.meta.url).pathname
const ler = (arq, w, h, filtro = '') =>
  execFileSync('ffmpeg', ['-v', 'error', '-i', raiz + arq, ...(filtro ? ['-vf', filtro] : []), '-s', `${w}x${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: 1e9,
  })
const gravar = (buf, w, h, arq) =>
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', '-', '-q:v', '3', raiz + arq], { input: buf })

function cenaDe(raw, n) {
  const cena = paraCena('still')
  const img = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const c = cena(raw[i * 3] / 255, raw[i * 3 + 1] / 255, raw[i * 3 + 2] / 255)
    img[i * 3] = c[0]
    img[i * 3 + 1] = c[1]
    img[i * 3 + 2] = c[2]
  }
  return img
}
function log(img, n) {
  const out = Buffer.alloc(n * 3)
  const enc = CURVAS.logc3.deLinear
  for (let i = 0; i < n; i++) {
    const v = [0, 1, 2].map((k) => enc(Math.max(0, img[i * 3 + k])))
    const y = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
    for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.round(Math.min(1, Math.max(0, y + (v[k] - y) * 0.7)) * 255)
  }
  return out
}
function revelar(img, n, w, h, receita, negativo) {
  const lab = criarLab(receita)
  const tex = aplicarTextura(img, w, h, { grao: 1.2, bitola: '35', halation: 0.9, difusao: 0.12 }, { negativo, largura: w })
  const tela = criarTela('rec709')
  const out = Buffer.alloc(n * 3)
  for (let i = 0; i < n; i++) {
    const d = tela.aplicar(lab.motor.emCena([Math.max(0, tex[i * 3]), Math.max(0, tex[i * 3 + 1]), Math.max(0, tex[i * 3 + 2])]))
    for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.round(Math.min(1, Math.max(0, d[k])) * 255)
  }
  return out
}

const TRABALHOS = [
  // o topo: o cavalo no contraluz, espelhado (o rosto à direita), revelado em 250D
  {
    fonte: 'exemplos/referencia-cavalo.jpg',
    filtro: 'hflip',
    w: 1600,
    h: 900,
    nome: 'topo',
    looks: [['250d-2383', '5207', { intensidade: 0.8, ajustes: { preto: -35, luz: -35 } }]],
  },
  {
    fonte: 'exemplos/referencia-cavalo.jpg',
    filtro: 'hflip,crop=416:900:624:0',
    w: 780,
    h: 1688,
    nome: 'topo-cel',
    looks: [['250d-2383', '5207', { intensidade: 0.8, ajustes: { preto: -35, luz: -40 } }]],
  },
  // a revelação: o mesmo frame em cinco películas
  {
    fonte: 'marca/home/hero-depois.jpg',
    w: 1600,
    h: 900,
    nome: 'rev',
    looks: [
      ['500t-2383', '5219', { intensidade: 0.85 }],
      ['250d-2383', '5207', { intensidade: 0.85 }],
      ['500t-3513', '5219', { intensidade: 0.85 }],
      ['eterna500-3513', '8573', { intensidade: 0.9 }],
      ['500t-scan', '5219', { intensidade: 0.9 }],
    ],
  },
]
for (const t of TRABALHOS) {
  const n = t.w * t.h
  const img = cenaDe(ler(t.fonte, t.w, t.h, t.filtro), n)
  gravar(log(img, n), t.w, t.h, `marca/home/${t.nome}-log.jpg`)
  for (const [base, negativo, extra] of t.looks) {
    gravar(revelar(img, n, t.w, t.h, { base, ...extra }, negativo), t.w, t.h, `marca/home/${t.nome}-${base}.jpg`)
    console.log(`marca/home/${t.nome}-${base}.jpg`)
  }
}
