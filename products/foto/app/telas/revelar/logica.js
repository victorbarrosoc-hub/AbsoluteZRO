// Revelar: a lógica pura da tela, sem DOM (roda em Node e é testada em test/tela-revelar.test.js).
//   GRUPOS                  os grupos do painel, na ordem de uso, e o pedaço dos ajustes que cada um guarda
//   grupoMexido · zerarGrupo · copiarGrupos
//   criarHistorico          desfazer e refazer por foto (passos de ajustes inteiros: JSON pequeno, sem diferença)
//   quadroCheio · quadroDe  o tamanho da foto na resolução cheia, para o zoom de 100% (sem ler a base)
//   brancoDoPonto           o conta-gotas: o branco que deixa neutra a cor que está na tela
//   janelaDaTela            a margem: em que EV do arquivo a tela começa e termina de mostrar detalhe

import { CONTROLES, neutro, normalizar } from '../../../src/motor/ajustes.js'
import { CAT16 } from '../../../src/motor/cor/adaptacao.js'
import { temperaturaDeXy, xyDeTemperatura } from '../../../src/motor/cor/branco.js'
import { CURVAS, D65, XYZParaXy, rgbParaXyz, xyParaXYZ } from '../../../src/motor/cor/espacos.js'
import { inversa, mulV } from '../../../src/motor/cor/matriz.js'

/** Os grupos do painel. `chaves`: o pedaço do objeto de ajustes que é do grupo (é o que zera, copia e cola). */
export const GRUPOS = [
  { id: 'luz', rotulo: 'Luz', chaves: ['luz'] },
  { id: 'cor', rotulo: 'Cor', chaves: ['branco', 'cor'] },
  { id: 'presenca', rotulo: 'Presença', chaves: ['presenca'] },
  { id: 'curva', rotulo: 'Curva', chaves: ['curva'] },
  { id: 'misturador', rotulo: 'Misturador', chaves: ['misturador', 'pb'] },
  { id: 'tonalizacao', rotulo: 'Tonalização', chaves: ['tonalizacao'] },
  { id: 'detalhe', rotulo: 'Detalhe', chaves: ['detalhe'] },
  { id: 'efeitos', rotulo: 'Efeitos', chaves: ['efeitos'] },
  { id: 'geometria', rotulo: 'Geometria', chaves: ['geometria'] },
  { id: 'calibracao', rotulo: 'Calibração', chaves: ['calibracao'], avancado: true },
  { id: 'tela', rotulo: 'Tela', chaves: ['tela'], avancado: true },
  { id: 'estilo', rotulo: 'Estilo', chaves: ['look', 'intensidade'], soCopiar: true },
]
export const grupo = (id) => GRUPOS.find((g) => g.id === id)

/** O que se copia por padrão (como no Lightroom: o corte e a geometria ficam, são de cada foto). */
export const COPIAR_PADRAO = GRUPOS.filter((g) => g.id !== 'geometria').map((g) => g.id)

/** Os caminhos de CONTROLES de um grupo do painel, na ordem da lista única. */
export function controlesDoGrupo(id) {
  return Object.entries(CONTROLES)
    .filter(([, c]) => c.grupo === id)
    .map(([caminho, c]) => ({ caminho, ...c }))
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** O grupo tem algo diferente do neutro? */
export function grupoMexido(ajustes, id) {
  const a = normalizar(ajustes)
  const n = neutro()
  const g = grupo(id)
  if (!g) return false
  if (id === 'cor') return a.branco.modo !== 'original' || !igual(a.cor, n.cor)
  return g.chaves.some((k) => !igual(a[k], n[k]))
}

/** Volta o grupo ao neutro (o resto fica). */
export function zerarGrupo(ajustes, id) {
  const a = normalizar(ajustes)
  const n = neutro()
  for (const k of grupo(id)?.chaves ?? []) a[k] = structuredClone(n[k])
  return a
}

/** `para` com os grupos `ids` trocados pelos de `de`. */
export function copiarGrupos(de, para, ids) {
  const origem = normalizar(de)
  const destino = normalizar(para)
  for (const id of ids) for (const k of grupo(id)?.chaves ?? []) destino[k] = structuredClone(origem[k])
  return normalizar(destino)
}

/**
 * Desfazer por foto: uma lista de passos (ajustes inteiros) e onde se está nela. Puro: cada função devolve um
 * histórico novo. `empurrar` corta o refazer, ignora passo igual ao atual e guarda no máximo `LIMITE` passos.
 */
export const LIMITE = 200
export function criarHistorico(inicial) {
  return { passos: [{ ajustes: normalizar(inicial), rotulo: '' }], i: 0 }
}
export const atual = (h) => h.passos[h.i].ajustes
export const podeDesfazer = (h) => h.i > 0
export const podeRefazer = (h) => h.i < h.passos.length - 1
export function empurrar(h, ajustes, rotulo = '') {
  const a = normalizar(ajustes)
  if (igual(a, atual(h))) return h
  const passos = [...h.passos.slice(0, h.i + 1), { ajustes: a, rotulo }]
  const corte = Math.max(0, passos.length - LIMITE)
  return { passos: passos.slice(corte), i: passos.length - 1 - corte }
}
export const desfazer = (h) => (podeDesfazer(h) ? { ...h, i: h.i - 1 } : h)
export const refazer = (h) => (podeRefazer(h) ? { ...h, i: h.i + 1 } : h)
/** O rótulo do passo que o desfazer tiraria (ou que o refazer poria). */
export const rotuloDoDesfazer = (h) => (podeDesfazer(h) ? h.passos[h.i].rotulo : '')
export const rotuloDoRefazer = (h) => (podeRefazer(h) ? h.passos[h.i + 1].rotulo : '')

// ─────────── o quadro, para o zoom ───────────

/** A geometria dos ajustes sem corte e sem ângulo (é com ela que a foto é aberta, para saber o tamanho cheio). */
export function semGeometria(ajustes) {
  const a = normalizar(ajustes)
  a.geometria = neutro().geometria
  return a
}

/**
 * O quadro (largura × altura em pixels da foto cheia) que a sessão mostra com estes ajustes, a partir do tamanho cheio
 * já com a orientação do EXIF (`cheio`: o que `abrir` devolve com a geometria neutra). Mesmas contas de
 * src/motor/revelar.js `geometria` (giro, ângulo com o maior retângulo que cabe, corte em frações).
 */
export function quadroDe(cheio, ajustes) {
  const g = normalizar(ajustes).geometria
  let w = cheio.largura
  let h = cheio.altura
  if (g.giro === 90 || g.giro === 270) [w, h] = [h, w]
  if (g.angulo) {
    const t = (g.angulo * Math.PI) / 180
    const prop = Math.max(w / h, h / w)
    const fator = 1 / (Math.abs(Math.cos(t)) + prop * Math.abs(Math.sin(t)))
    w = Math.max(1, Math.floor(w * fator))
    h = Math.max(1, Math.floor(h * fator))
  }
  if (g.corte) {
    w = Math.max(1, Math.round(g.corte.l * w))
    h = Math.max(1, Math.round(g.corte.a * h))
  }
  return { largura: w, altura: h }
}

/** O ângulo que deixa reta a linha traçada na tela (graus, y para baixo), somado ao ângulo atual, de −45 a 45. */
export function anguloDaRegua(atualGraus, dx, dy) {
  let phi = (Math.atan2(dy, dx) * 180) / Math.PI
  // a linha pode ser um horizonte (perto de 0° ou 180°) ou um prumo (perto de ±90°)
  while (phi > 45) phi -= 90
  while (phi <= -45) phi += 90
  const novo = atualGraus - phi
  return Math.max(-45, Math.min(45, Math.round(novo * 10) / 10))
}

/** Proporções do corte (largura / altura). `null` = livre; 'original' = a da foto. */
export const PROPORCOES = [
  { valor: 'original', rotulo: 'Original' },
  { valor: 'livre', rotulo: 'Livre' },
  { valor: '1:1', rotulo: '1:1' },
  { valor: '4:5', rotulo: '4:5' },
  { valor: '3:2', rotulo: '3:2' },
  { valor: '16:9', rotulo: '16:9' },
]
/** A razão largura/altura de uma proporção, deitada ou de pé conforme a foto. */
export function razaoDe(proporcao, quadro) {
  if (proporcao === 'livre') return null
  const deitada = quadro.largura >= quadro.altura
  if (proporcao === 'original') return quadro.largura / quadro.altura
  const [a, b] = proporcao.split(':').map(Number)
  const r = a / b
  // 4:5 é retrato por natureza; as outras, paisagem: viram junto com a foto
  return deitada === r >= 1 ? r : 1 / r
}

/** O maior corte centrado com a razão pedida, em frações do quadro. */
export function corteCentrado(razao, quadro) {
  if (!razao) return { x: 0, y: 0, l: 1, a: 1 }
  const rq = quadro.largura / quadro.altura
  if (razao > rq) {
    const a = rq / razao
    return { x: 0, y: (1 - a) / 2, l: 1, a }
  }
  const l = razao / rq
  return { x: (1 - l) / 2, y: 0, l, a: 1 }
}

// ─────────── o conta-gotas ───────────

const XYZ_DE_SRGB = rgbParaXyz('srgb')
const CAT16_INV = inversa(CAT16)

/**
 * O branco que deixa neutro o ponto clicado. `cor`: [r, g, b] em código sRGB 0..255 (o que está na tela), `brancoAtual`:
 * { kelvin, tinta } que está valendo. Em cones CAT16: o branco novo é o atual multiplicado pela cor vista e dividido
 * pelo D65 da tela (a mesma conta de `matrizDeBranco`, resolvida para "este ponto fica cinza"). O mapa de tons
 * comprime a saturação; por isso a tela chama de novo sobre o quadro novo até parar de mudar (2 ou 3 voltas).
 * Devolve { kelvin, tinta, perto } (`perto`: a cor já estava quase neutra) ou null (ponto preto ou estourado).
 */
export function brancoDoPonto(cor, brancoAtual) {
  const lin = cor.map((c) => CURVAS.srgb.decodificar(Math.max(0, Math.min(255, c)) / 255))
  const maior = Math.max(...lin)
  if (maior < 0.004 || Math.min(...cor) >= 254) return null
  const xyz = mulV(XYZ_DE_SRGB, lin)
  const lmsQ = mulV(CAT16, xyz)
  const lmsW = mulV(CAT16, xyParaXYZ(xyDeTemperatura(brancoAtual.kelvin, brancoAtual.tinta)))
  const lmsD = mulV(CAT16, xyParaXYZ(D65))
  const lms = [0, 1, 2].map((i) => (lmsW[i] * lmsQ[i]) / lmsD[i])
  if (lms.some((v) => !(v > 0))) return null
  const t = temperaturaDeXy(XYZParaXy(mulV(CAT16_INV, lms)))
  const kelvin = Math.round(Math.max(CONTROLES['branco.temperatura'].min, Math.min(CONTROLES['branco.temperatura'].max, t.kelvin)) / 10) * 10
  const tinta = Math.round(Math.max(-150, Math.min(150, t.tinta))) || 0
  const perto = Math.abs(1e6 / kelvin - 1e6 / brancoAtual.kelvin) < 2 && Math.abs(tinta - brancoAtual.tinta) < 1
  return { kelvin, tinta, perto }
}

// ─────────── temperatura: o controle anda em mired ───────────

/** A temperatura anda em mired (como o olho vê): posição 0..1000 ↔ kelvin. */
const T = CONTROLES['branco.temperatura']
const MIRED_MIN = 1e6 / T.max
const MIRED_MAX = 1e6 / T.min
export const POSICOES_DA_TEMPERATURA = 1000
export const posicaoDaTemperatura = (k) => Math.round(((MIRED_MAX - 1e6 / k) / (MIRED_MAX - MIRED_MIN)) * POSICOES_DA_TEMPERATURA)
export const temperaturaDaPosicao = (p) => {
  const k = 1e6 / (MIRED_MAX - (p / POSICOES_DA_TEMPERATURA) * (MIRED_MAX - MIRED_MIN))
  return Math.max(T.min, Math.min(T.max, Math.round(k / (k < 10000 ? 10 : 100)) * (k < 10000 ? 10 : 100)))
}

// ─────────── a margem: onde a tela mostra detalhe ───────────

/**
 * A janela da tela no eixo do ARQUIVO (EV em torno do cinza, já com a exposição base): `codigo(ev)` é o código de
 * tela (0..1) de um cinza daquele EV com os ajustes atuais (ponto + tela, sem vizinhança). Devolve { de, ate, cinza }:
 * de onde o cinza sai do preto (2 %) até onde chega ao branco (98 %), e o EV que cai no cinza médio da tela.
 */
export function janelaDaTela(codigo, { evMin = -14, evMax = 10, passo = 1 / 16 } = {}) {
  let de = null
  let ate = null
  let cinza = null
  let antes = codigo(evMin)
  for (let ev = evMin + passo; ev <= evMax + 1e-9; ev += passo) {
    const c = codigo(ev)
    if (de === null && antes < 0.02 && c >= 0.02) de = ev - passo * ((c - 0.02) / Math.max(1e-6, c - antes))
    if (cinza === null && antes < 0.46 && c >= 0.46) cinza = ev - passo * ((c - 0.46) / Math.max(1e-6, c - antes))
    if (ate === null && antes < 0.98 && c >= 0.98) ate = ev - passo * ((c - 0.98) / Math.max(1e-6, c - antes))
    antes = c
  }
  return { de: de ?? evMin, ate: ate ?? evMax, cinza: cinza ?? 0 }
}
