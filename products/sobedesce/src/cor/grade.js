// Cor do Frames (docs/FRAMES.md, "Cor"): a conversão da câmera, um ajuste rápido e a LUT da pessoa juntos numa LUT só,
// que o ffmpeg aplica numa passada (lut3d tetraédrico) nos frames e nos takes. Ordem de colorista: primeiro a correção
// (exposição, temperatura, contraste, preto, saturação), na luz do arquivo; depois o look (a LUT); a intensidade mistura
// o look com a conversão neutra.
//
//   código do arquivo (0–1) ──▶ luz linear (curva e gamut da câmera, src/cor/lut.js; ou o gama 2,4 do Rec.709)
//                           ──▶ ajuste rápido
//                           ──▶ o que a LUT recebe: o log da câmera de novo (LUT de câmera) ou o Rec.709 (LUT criativa)
//                           ──▶ a LUT da pessoa (.cube 3D) ──▶ intensidade (mistura com o Rec.709 neutro)
//
// Nada aqui mexe no arquivo original: a LUT montada vai para a pasta de dados e só o que sai (frame, take) leva a cor.
import { CURVAS, PERFIS, curvaFilme, matrizPara709 } from './lut.js'

const limitar = (v, a, b) => Math.min(b, Math.max(a, v))
const suave = (a, b, x) => {
  const t = limitar((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

export class LutError extends Error {
  constructor(message) {
    super(message)
    this.name = 'LutError'
    this.status = 400
  }
}

// ─────────── .cube ───────────

/**
 * Lê uma LUT 3D no formato .cube (Resolve/Adobe): LUT_3D_SIZE, DOMAIN_MIN/MAX opcionais, TITLE e comentários.
 * LUT 1D, shaper e tamanhos fora do padrão são recusados com o motivo (nunca aplica pela metade).
 * @returns {{ n: number, titulo: string|null, min: number[], max: number[], dados: Float32Array }}
 */
export function lerCube(texto) {
  const linhas = String(texto ?? '').replace(/^﻿/, '').split(/\r?\n/)
  let n = null
  let titulo = null
  let min = [0, 0, 0]
  let max = [1, 1, 1]
  const valores = []
  for (const bruta of linhas) {
    const l = bruta.trim()
    if (!l || l.startsWith('#')) continue
    const chave = /^([A-Z][A-Z_0-9]*)\b\s*(.*)$/.exec(l)
    if (chave) {
      const [, k, resto] = chave
      if (k === 'TITLE') titulo = resto.replace(/^"|"$/g, '').slice(0, 120) || null
      else if (k === 'LUT_3D_SIZE') n = Number(resto)
      else if (k === 'LUT_1D_SIZE' || k === 'LUT_1D_INPUT_RANGE') throw new LutError('Essa é uma LUT 1D (só curva). Use uma LUT 3D (.cube com LUT_3D_SIZE).')
      else if (k === 'DOMAIN_MIN' || k === 'DOMAIN_MAX' || k === 'LUT_3D_INPUT_RANGE') {
        const v = resto.split(/\s+/).map(Number)
        const tres = k === 'LUT_3D_INPUT_RANGE' ? null : v
        if (k === 'LUT_3D_INPUT_RANGE') {
          if (v.length !== 2 || !v.every(Number.isFinite)) throw new LutError('A faixa de entrada da LUT está quebrada.')
          min = [v[0], v[0], v[0]]
          max = [v[1], v[1], v[1]]
        } else {
          if (tres.length !== 3 || !tres.every(Number.isFinite)) throw new LutError('O DOMAIN da LUT está quebrado.')
          if (k === 'DOMAIN_MIN') min = tres
          else max = tres
        }
      }
      // outras chaves (LUT_IN_VIDEO_RANGE, palavras de outros programas) não mudam a conta: ficam de fora
      continue
    }
    const v = l.split(/\s+/).map(Number)
    if (v.length !== 3 || !v.every(Number.isFinite)) throw new LutError('A LUT tem uma linha que não é um número RGB.')
    valores.push(v[0], v[1], v[2])
  }
  if (!Number.isInteger(n)) throw new LutError('Não é uma LUT 3D: falta o LUT_3D_SIZE.')
  if (n < 2 || n > 129) throw new LutError(`LUT de tamanho ${n}: aceito de 2 a 129.`)
  if (valores.length !== n * n * n * 3) throw new LutError(`A LUT diz ${n}³ pontos mas tem ${Math.floor(valores.length / 3)}: o arquivo está incompleto.`)
  if (min.some((v, i) => !(max[i] > v))) throw new LutError('O DOMAIN da LUT está invertido.')
  return { n, titulo, min, max, dados: Float32Array.from(valores) }
}

/** Um ponto na LUT (tetraédrica, como o lut3d do ffmpeg e o Resolve). Fora do DOMAIN, encosta na borda. */
export function amostrarCube(lut, r, g, b) {
  const { n, min, max, dados } = lut
  const p = [r, g, b].map((v, i) => limitar((v - min[i]) / (max[i] - min[i]), 0, 1) * (n - 1))
  const i0 = p.map((v) => Math.min(n - 2, Math.floor(v)))
  const f = p.map((v, i) => v - i0[i])
  const at = (dr, dg, db) => {
    const k = ((i0[2] + db) * n * n + (i0[1] + dg) * n + (i0[0] + dr)) * 3
    return [dados[k], dados[k + 1], dados[k + 2]]
  }
  const [fr, fg, fb] = f
  const c000 = at(0, 0, 0)
  const c111 = at(1, 1, 1)
  let a, bb, w
  // os seis tetraedros do cubo: os pesos vêm da ordem das frações
  if (fr >= fg) {
    if (fg >= fb) {
      a = at(1, 0, 0)
      bb = at(1, 1, 0)
      w = [1 - fr, fr - fg, fg - fb, fb]
    } else if (fr >= fb) {
      a = at(1, 0, 0)
      bb = at(1, 0, 1)
      w = [1 - fr, fr - fb, fb - fg, fg]
    } else {
      a = at(0, 0, 1)
      bb = at(1, 0, 1)
      w = [1 - fb, fb - fr, fr - fg, fg]
    }
  } else if (fb > fg) {
    a = at(0, 0, 1)
    bb = at(0, 1, 1)
    w = [1 - fb, fb - fg, fg - fr, fr]
  } else if (fb > fr) {
    a = at(0, 1, 0)
    bb = at(0, 1, 1)
    w = [1 - fg, fg - fb, fb - fr, fr]
  } else {
    a = at(0, 1, 0)
    bb = at(1, 1, 0)
    w = [1 - fg, fg - fr, fr - fb, fb]
  }
  return [0, 1, 2].map((c) => w[0] * c000[c] + w[1] * a[c] + w[2] * bb[c] + w[3] * c111[c])
}

// ─────────── o ajuste rápido ───────────

/** Os cinco controles do ajuste rápido: -100 a 100, 0 é neutro. */
export const AJUSTES_RAPIDOS = [
  { id: 'exposicao', nome: 'Exposição', dica: '±2 stops, na luz da cena' },
  { id: 'temperatura', nome: 'Temperatura', dica: 'Mais frio ↔ mais quente' },
  { id: 'contraste', nome: 'Contraste', dica: 'Em volta do cinza 18%: o meio fica onde está' },
  { id: 'preto', nome: 'Preto', dica: 'Abaixo de 0 assenta o preto; acima levanta' },
  { id: 'saturacao', nome: 'Saturação', dica: '-100 é preto e branco' },
]
export const AJUSTES_NEUTROS = Object.freeze(Object.fromEntries(AJUSTES_RAPIDOS.map((a) => [a.id, 0])))

/** Ajustes vindos da tela → -100…100 inteiros, só os conhecidos. */
export function lerAjustes(a) {
  return Object.fromEntries(AJUSTES_RAPIDOS.map(({ id }) => {
    const v = Math.round(Number(a?.[id]))
    return [id, Number.isFinite(v) ? limitar(v, -100, 100) : 0]
  }))
}
const neutros = (a) => AJUSTES_RAPIDOS.every(({ id }) => !a?.[id])

const lumaLin = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]

/** O ajuste rápido em RGB linear Rec.709 (cinza 18% = 0,18). Neutro devolve o mesmo valor. */
export function ajustar(v, aj) {
  if (neutros(aj)) return v
  let [r, g, b] = v
  const ganho = 2 ** ((aj.exposicao / 100) * 2)
  r *= ganho
  g *= ganho
  b *= ganho
  if (aj.temperatura) {
    // quente: mais vermelho, menos azul; a luz do cinza fica a mesma
    const t = aj.temperatura / 100
    const k = [2 ** (0.16 * t), 2 ** (0.02 * t), 2 ** (-0.32 * t)]
    const s = 1 / lumaLin(k)
    r *= k[0] * s
    g *= k[1] * s
    b *= k[2] * s
  }
  if (aj.contraste || aj.preto) {
    // em stops da luminância, em volta do cinza; a cor (razão entre os canais) fica
    const Y = Math.max(1e-7, lumaLin([r, g, b]))
    const e = Math.log2(Y / 0.18)
    let e2 = e * (1 + 0.45 * (aj.contraste / 100))
    // preto para baixo: só a sombra profunda (abaixo de -1,5 stop, inteiro a -7), a curva sempre sobe
    if (aj.preto < 0) e2 += 2 * (aj.preto / 100) * suave(-1.5, -7, e)
    const f = 2 ** (e2 - e)
    r *= f
    g *= f
    b *= f
  }
  if (aj.preto > 0) {
    // preto para cima: um véu pequeno, como o offset de um colorista (o cinza quase não sai do lugar)
    const o = 0.006 * (aj.preto / 100)
    r += o
    g += o
    b += o
  }
  if (aj.saturacao) {
    const Y = lumaLin([r, g, b])
    const s = Math.max(0, 1 + aj.saturacao / 100)
    r = Y + (r - Y) * s
    g = Y + (g - Y) * s
    b = Y + (b - Y) * s
  }
  return [r, g, b]
}

// ─────────── a câmera: ida e volta ───────────

const gama24 = (v) => Math.max(0, v) ** 2.4
const degama24 = (L) => limitar(L, 0, 1) ** (1 / 2.4)
const inversa3 = (m) => {
  const [[a, b, c], [d, e, f], [g, h, i]] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ]
}
const mult = (m, v) => m.map((l) => l[0] * v[0] + l[1] * v[1] + l[2] * v[2])

/** A volta da curva LOG (linear → código), por tabela: as fórmulas só vêm num sentido em src/cor/lut.js. */
const inversas = new Map()
function inversaDaCurva(id) {
  if (inversas.has(id)) return inversas.get(id)
  const curva = CURVAS[id]
  const N = 4096
  const lin = new Float64Array(N + 1)
  for (let k = 0; k <= N; k++) lin[k] = curva(k / N)
  const inv = (y) => {
    if (y <= lin[0]) return 0
    if (y >= lin[N]) return 1
    let lo = 0
    let hi = N
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (lin[mid] <= y) lo = mid
      else hi = mid
    }
    const t = (y - lin[lo]) / Math.max(1e-12, lin[hi] - lin[lo])
    return (lo + t) / N
  }
  inversas.set(id, inv)
  return inv
}

/**
 * A ida e a volta do arquivo: `paraLinear(rgb)` (código → RGB linear Rec.709) e `doLinear(lin)` (o caminho de volta, para
 * a LUT que espera o log da câmera). Rec.709 (ou perfil desconhecido): gama 2,4.
 */
export function camera(perfil) {
  const p = PERFIS[perfil]
  if (!p?.curva) return { log: false, paraLinear: (v) => v.map(gama24), doLinear: (v) => v.map(degama24), para709: (v) => v.map(degama24) }
  const curva = CURVAS[p.curva]
  const M = matrizPara709(p.gamut)
  const Mi = inversa3(M)
  const inv = inversaDaCurva(p.curva)
  return {
    log: true,
    paraLinear: (v) => mult(M, [curva(v[0]), curva(v[1]), curva(v[2])]),
    doLinear: (lin) => mult(Mi, lin).map(inv),
    // a mesma conversão de monitor da prévia (src/cor/lut.js): curva de filme e gama 2,4
    para709: (lin) => lin.map((x) => degama24(curvaFilme(x))),
  }
}

// ─────────── a cor inteira ───────────

export const MODOS_COR = ['original', '709', 'lut']

/**
 * `cor`: { modo: 'original' | '709' | 'lut', perfil (id de PERFIS), lut (lerCube) | null, espera: 'log' | '709',
 * intensidade (0–1), ajustes }. Devolve a função código → código (0–1) que vai para a LUT montada, ou null quando nada
 * muda (original sem ajuste: o ffmpeg nem recebe o filtro).
 */
export function criarCor(cor) {
  const aj = lerAjustes(cor.ajustes)
  const modo = MODOS_COR.includes(cor.modo) ? cor.modo : 'original'
  const cam = camera(cor.perfil)
  const semAjuste = neutros(aj)
  if (modo === 'original' && semAjuste) return null
  if (modo === 'lut' && !cor.lut) throw new LutError('Escolha a LUT.')
  const t = limitar(cor.intensidade ?? 1, 0, 1)
  // o neutro de cada caminho: o Rec.709 da câmera (ou o próprio arquivo, se ele já é Rec.709)
  const neutro709 = (lin) => cam.para709(lin)
  return (r, g, b) => {
    const x = [r, g, b]
    const lin = ajustar(cam.paraLinear(x), aj)
    if (modo === 'original') return cam.doLinear(lin)
    const base = neutro709(lin)
    if (modo === '709') return base
    // a LUT: o arquivo como ele é (log da câmera, sem ajuste é exato) ou o Rec.709 neutro
    const entrada = cor.espera === '709' ? base : semAjuste ? x : cam.doLinear(lin)
    const look = amostrarCube(cor.lut, ...entrada)
    return t >= 1 ? look : look.map((v, i) => base[i] + (v - base[i]) * t)
  }
}

/** A cor montada em texto .cube (`n`³), para o lut3d do ffmpeg. */
export function cubeDaCor(fn, { n = 33, titulo = 'SOBEDESCE Frames' } = {}) {
  const linhas = [`TITLE "${String(titulo).replace(/"/g, "'").slice(0, 100)}"`, `LUT_3D_SIZE ${n}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1']
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++) {
        const o = fn(r / (n - 1), g / (n - 1), b / (n - 1))
        linhas.push(o.map((v) => limitar(Number.isFinite(v) ? v : 0, 0, 1).toFixed(6)).join(' '))
      }
  return `${linhas.join('\n')}\n`
}
