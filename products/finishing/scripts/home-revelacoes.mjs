// REVELAFILM · imagens da página inicial: frames de footage cinematográfico do Coverr (licença do Coverr: uso comercial,
// edição e cor liberados, sem atribuição; nada gerado por IA), um por assunto: carro, casamento, comida, natureza e moda.
// Os originais estão em marca/home/orig-*.jpg (Rec.709, como vieram) e entram no motor pela entrada de still já tratado
// (a tela inversa leva o frame de volta à luz da cena); cada um é revelado na película com a textura dela (grão de 35 mm e
// halation). O "antes" que a página mostra é o original.
// Uso: node scripts/home-revelacoes.mjs [nome]  (só os trabalhos com esse nome, como topo-cel; precisa do ffmpeg para ler e gravar JPEG; os arquivos entram no repositório).

import { execFileSync } from 'node:child_process'
import { criarLab, paraCena } from '../src/cor/lab.js'
import { aplicarTextura } from '../src/cor/textura.js'
import { criarTela } from '../src/cor/cena.js'

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
  // o topo: o carro antigo contra o sol, revelado em 250D na 2383 (e o recorte em pé para o celular)
  { fonte: 'marca/home/orig-carro.jpg', w: 1600, h: 900, nome: 'topo', looks: [['250d-2383', '5207']] },
  { fonte: 'marca/home/orig-carro.jpg', filtro: 'crop=499:1080:640:0', w: 780, h: 1688, nome: 'topo-cel', original: true, looks: [['250d-2383', '5207']] },
  // a revelação: o casal na golden hour, em cinco películas
  {
    fonte: 'marca/home/orig-casamento.jpg',
    w: 1600,
    h: 900,
    nome: 'rev',
    looks: [
      ['500t-2383', '5219'],
      ['250d-2383', '5207'],
      ['500t-3513', '5219'],
      ['eterna500-3513', '8573'],
      ['500t-scan', '5219'],
    ],
  },
  // as películas: uma cena para cada (o jantar à lareira, o campo, a praia)
  { fonte: 'marca/home/orig-jantar.jpg', w: 1200, h: 900, filtro: 'crop=1440:1080:0:0', nome: 'filme', looks: [['500t-2383', '5219']] },
  { fonte: 'marca/home/orig-campo.jpg', w: 1200, h: 900, filtro: 'crop=1440:1080:300:0', nome: 'filme', looks: [['250d-2383', '5207']] },
  { fonte: 'marca/home/orig-praia.jpg', w: 1200, h: 900, filtro: 'crop=1440:1080:240:0', nome: 'filme', looks: [['eterna500-3513', '8573']] },
  // one frame, different stories: o retrato em seis películas
  {
    fonte: 'marca/home/orig-retrato.jpg',
    w: 960,
    h: 540,
    nome: 'hist',
    looks: [
      ['500t-2383', '5219'],
      ['250d-2383', '5207'],
      ['500t-3513', '5219'],
      ['eterna500-3513', '8573'],
      ['eterna400-3513', '8583'],
      ['500t-scan', '5219'],
    ],
  },
  // o catálogo: cada negativo copiado na 2383; os de tungstênio no jantar (lareira), os de dia no campo
  { fonte: 'marca/home/orig-jantar.jpg', w: 720, h: 900, filtro: 'crop=864:1080:250:0', nome: 'orig-jantar-alto', so: true },
  { fonte: 'marca/home/orig-campo.jpg', w: 720, h: 900, filtro: 'crop=864:1080:790:0', nome: 'orig-campo-alto', so: true },
  ...[
    ['5219', 'T'],
    ['5213', 'T'],
    ['5207', 'D'],
    ['5203', 'D'],
    ['8573', 'T'],
    ['8583', 'T'],
    ['8553', 'T'],
    ['8563', 'D'],
    ['8543', 'T'],
    ['8592', 'D'],
  ].map(([id, luz]) => ({
    fonte: luz === 'T' ? 'marca/home/orig-jantar.jpg' : 'marca/home/orig-campo.jpg',
    w: 720,
    h: 900,
    filtro: luz === 'T' ? 'crop=864:1080:250:0' : 'crop=864:1080:790:0',
    nome: 'neg',
    looks: [[`copia-2383:${id}`, id]],
  })),
]
for (const t of TRABALHOS) {
  if (process.argv[2] && t.nome !== process.argv[2]) continue
  const n = t.w * t.h
  if (t.so) {
    gravar(ler(t.fonte, t.w, t.h, t.filtro), t.w, t.h, `marca/home/${t.nome}.jpg`)
    continue
  }
  const img = cenaDe(ler(t.fonte, t.w, t.h, t.filtro), n)
  if (t.original) gravar(ler(t.fonte, t.w, t.h, t.filtro), t.w, t.h, `marca/home/${t.nome}-orig.jpg`)
  for (const [base, negativo] of t.looks) {
    const [b, neg] = base.split(':')
    const arq = `marca/home/${t.nome}-${neg ?? b}.jpg`
    gravar(revelar(img, n, t.w, t.h, { base: b, intensidade: 1, ...(neg ? { negativo: neg } : {}) }, negativo), t.w, t.h, arq)
    console.log(arq)
  }
}
