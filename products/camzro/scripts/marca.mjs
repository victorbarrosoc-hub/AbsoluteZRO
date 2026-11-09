// CAMZRO · a marca, em estudo (docs/marca/camzro.md). Três estudos de símbolo, tudo vetor no código (caixa 0 0 100 100),
// uma cor só, na família do símbolo Absolute ZRO. `node scripts/marca.mjs` escreve os SVG de marca/estudos/ (fora do
// app: nada disso é servido). O app segue com o símbolo Absolute ZRO até o titular escolher.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GRAFITE = '#1d1d1f'
export const VERMELHO = '#ff3b30' // a luz do REC: só no ícone do app e gravando; a marca plana é de uma cor
/** A centelha da Absolute ZRO (scripts/marca/vetor/vetorizar.py): centro em (74, 50), sobre o traço do anel. */
export const ESTRELA = 'M74.00 40.02C75.00 47.51 77.33 49.00 94.82 50.00C77.33 51.00 75.00 52.49 74.00 59.98C73.00 52.49 70.67 51.00 53.18 50.00C70.67 49.00 73.00 47.51 74.00 40.02Z'

const f = (n) => String(+n.toFixed(2))
const ponto = (a, r, cx, cy) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)]

/** Anel inteiro (fill-rule evenodd): raio de fora R, de dentro r. */
export const anel = (cx, cy, R, r) => `M${f(cx - R)} ${cy}a${R} ${R} 0 1 0 ${f(2 * R)} 0a${R} ${R} 0 1 0 ${f(-2 * R)} 0ZM${f(cx - r)} ${cy}a${r} ${r} 0 1 0 ${f(2 * r)} 0a${r} ${r} 0 1 0 ${f(-2 * r)} 0Z`

/** Setor de anel de a0 a a1 (graus, sentido horário na tela). */
export function arco(cx, cy, R, r, a0, a1) {
  const g = a1 - a0 > 180 ? 1 : 0
  const [x0, y0] = ponto(a0, R, cx, cy)
  const [x1, y1] = ponto(a1, R, cx, cy)
  const [x2, y2] = ponto(a1, r, cx, cy)
  const [x3, y3] = ponto(a0, r, cx, cy)
  return `M${f(x0)} ${f(y0)}A${R} ${R} 0 ${g} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r} ${r} 0 ${g} 0 ${f(x3)} ${f(y3)}Z`
}

/** Anel (cx, cy, R, r) menos um círculo (px, py, pr): o C com as pontas em curva, num caminho só (sem máscara). */
export function anelAberto(cx, cy, R, r, px, py, pr) {
  const d = px - cx
  const corte = (raio) => {
    const x = (d * d + raio * raio - pr * pr) / (2 * d)
    return [cx + x, Math.sqrt(raio * raio - x * x)]
  }
  const [xo, yo] = corte(R)
  const [xi, yi] = corte(r)
  return `M${f(xo)} ${f(cy + yo)}A${R} ${R} 0 1 1 ${f(xo)} ${f(cy - yo)}A${pr} ${pr} 0 0 0 ${f(xi)} ${f(cy - yi)}A${r} ${r} 0 1 0 ${f(xi)} ${f(cy + yi)}A${pr} ${pr} 0 0 0 ${f(xo)} ${f(cy + yo)}Z`
}

/** `desenho` é a marca; `mini` é a forma reforçada para menos de 20 px (favicon). `p` é a cor do ponto do Tally. */
export const ESTUDOS = {
  tally: {
    nome: 'Tally',
    ideia: 'O anel abre onde mora a centelha da Absolute ZRO. Ali acende a luz do REC.',
    desenho: (c, p = c) => `<path fill="${c}" d="${anelAberto(48.5, 50, 35, 24, 78, 50, 13.5)}"/><circle cx="78" cy="50" r="8.4" fill="${p}"/>`,
    mini: (c, p = c) => `<path fill="${c}" d="${anelAberto(48.5, 50, 35, 22, 78, 50, 14.5)}"/><circle cx="78" cy="50" r="9.2" fill="${p}"/>`,
  },
  obturador: {
    nome: 'Obturador 180°',
    ideia: 'Meio disco fechado, meio aberto: o obturador em 180°. A luz entra pela metade aberta.',
    desenho: (c) => `<path fill="${c}" d="${ESTRELA}"/><path fill="${c}" fill-rule="evenodd" d="${anel(44, 50, 34.3, 25.7)}"/><path fill="${c}" d="M44 31a19 19 0 0 0 0 38Z"/>`,
    mini: (c) => `<path fill="${c}" fill-rule="evenodd" d="${anel(50, 50, 38, 27.5)}"/><path fill="${c}" d="M50 30a20 20 0 0 0 0 40Z"/>`,
  },
  meialuz: {
    nome: 'Meia-luz',
    ideia: 'Um anel só, metade ExtraBold e metade Light: o C de CAM e o O de ZRO, em 180°.',
    desenho: (c) => `<path fill="${c}" d="${arco(50, 50, 34.3, 22.3, 90, 270)}"/><path fill="${c}" d="${arco(50, 50, 34.3, 30.9, -90, 90)}"/>`,
    mini: (c) => `<path fill="${c}" d="${arco(50, 50, 38, 23, 90, 270)}"/><path fill="${c}" d="${arco(50, 50, 38, 32, -90, 90)}"/>`,
  },
}

export const simbolo = (k, cor, { mini = false, ponto: p } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${ESTUDOS[k][mini ? 'mini' : 'desenho'](cor, p)}</svg>\n`

/** Ícone do app: a placa da família (1024, canto 232), escura ou clara; no Tally o ponto é a luz do REC. */
export function icone(k, escuro = true) {
  const [de, ate] = escuro ? ['#232327', '#0c0c0e'] : ['#ffffff', '#f0f0f4']
  const desenho = ESTUDOS[k].desenho(escuro ? '#fff' : GRAFITE, k === 'tally' ? VERMELHO : undefined)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${de}"/><stop offset="1" stop-color="${ate}"/></linearGradient></defs><rect width="1024" height="1024" rx="232" fill="url(#p)"/><g transform="translate(212 212) scale(6)">${desenho}</g></svg>\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const saida = fileURLToPath(new URL('../marca/estudos', import.meta.url))
  mkdirSync(saida, { recursive: true })
  for (const k of Object.keys(ESTUDOS)) {
    writeFileSync(join(saida, `${k}-simbolo.svg`), simbolo(k, GRAFITE))
    writeFileSync(join(saida, `${k}-simbolo-branco.svg`), simbolo(k, '#fff'))
    writeFileSync(join(saida, `${k}-mini.svg`), simbolo(k, GRAFITE, { mini: true }))
    writeFileSync(join(saida, `${k}-icone.svg`), icone(k, true))
    writeFileSync(join(saida, `${k}-icone-claro.svg`), icone(k, false))
  }
  console.log(`${Object.keys(ESTUDOS).length} estudos em marca/estudos/`)
}
