// Ajustes do motor Latitude: a lista única de controles, com faixa, neutro e passo.
// Tudo que mexe na foto passa por aqui: a tela, as predefinições, a importação do Lightroom, a conta na GPU e o
// espelho em JS. Controle novo entra neste arquivo primeiro (e sobe VERSAO se o significado de um antigo mudar).
//
// Regras:
// - O objeto de ajustes é JSON puro. `neutro()` é a foto sem tratamento: o motor com ele devolve a revelação base.
// - Valores bipolares vão de -100 a 100 com neutro 0; unipolares de 0 a 100. Exposição em EV. Temperatura em kelvin.
// - Os controles de luz são definidos em EV em torno do cinza médio (0,18 da cena), não pelo conteúdo da foto: o
//   mesmo número dá o mesmo resultado em qualquer imagem. É o que deixa a predefinição previsível em lote.
// - `normalizar` aceita qualquer coisa (arquivo de terceiros, versão antiga) e devolve um objeto completo e na faixa.

export const VERSAO = 1

// Faixas do misturador, na ordem usada em todo o motor (e na importação do Lightroom).
export const FAIXAS = ['vermelho', 'laranja', 'amarelo', 'verde', 'ciano', 'azul', 'roxo', 'magenta']
// Centro de cada faixa, em graus de matiz (0 = vermelho, sentido do círculo de cores). Janelas suaves entre vizinhas.
export const FAIXAS_MATIZ = [0, 30, 60, 120, 180, 240, 275, 315]

export const ZONAS = ['sombras', 'meios', 'altas', 'global']

const bi = (rotulo, grupo, extra = {}) => ({ min: -100, max: 100, neutro: 0, passo: 1, rotulo, grupo, ...extra })
const uni = (rotulo, grupo, extra = {}) => ({ min: 0, max: 100, neutro: 0, passo: 1, rotulo, grupo, ...extra })

// Controles escalares, por caminho. `grupo` é o painel da tela; `unidade` aparece ao lado do número.
export const CONTROLES = {
  // Luz: em EV em torno do cinza médio
  'luz.exposicao': { min: -5, max: 5, neutro: 0, passo: 0.01, rotulo: 'Exposição', grupo: 'luz', unidade: 'EV' },
  'luz.contraste': bi('Contraste', 'luz'),
  'luz.altas': bi('Altas luzes', 'luz'),
  'luz.sombras': bi('Sombras', 'luz'),
  'luz.brancos': bi('Brancos', 'luz'),
  'luz.pretos': bi('Pretos', 'luz'),

  // Branco: adaptação cromática (não multiplicador de canal)
  'branco.temperatura': { min: 2000, max: 50000, neutro: 6500, passo: 10, rotulo: 'Temperatura', grupo: 'cor', unidade: 'K', escala: 'mired' },
  'branco.tinta': { min: -150, max: 150, neutro: 0, passo: 1, rotulo: 'Tinta', grupo: 'cor' },

  'cor.vibracao': bi('Vibração', 'cor'),
  'cor.saturacao': bi('Saturação', 'cor'),

  'presenca.textura': bi('Textura', 'presenca'),
  'presenca.clareza': bi('Clareza', 'presenca'),
  'presenca.neblina': bi('Tirar neblina', 'presenca'),

  // Curva paramétrica (quatro regiões) — a de pontos fica em curva.pontos
  'curva.altas': bi('Altas', 'curva'),
  'curva.claros': bi('Claros', 'curva'),
  'curva.escuros': bi('Escuros', 'curva'),
  'curva.sombras': bi('Sombras', 'curva'),

  // Tonalização: equilíbrio e mistura (as rodas ficam em tonalizacao.<zona>)
  'tonalizacao.mistura': { min: 0, max: 100, neutro: 50, passo: 1, rotulo: 'Mistura', grupo: 'tonalizacao' },
  'tonalizacao.equilibrio': bi('Equilíbrio', 'tonalizacao'),

  // Detalhe
  'detalhe.nitidez': { min: 0, max: 150, neutro: 0, passo: 1, rotulo: 'Nitidez', grupo: 'detalhe' },
  'detalhe.raio': { min: 0.5, max: 3, neutro: 1, passo: 0.1, rotulo: 'Raio', grupo: 'detalhe', unidade: 'px' },
  'detalhe.detalhe': { min: 0, max: 100, neutro: 25, passo: 1, rotulo: 'Detalhe', grupo: 'detalhe' },
  'detalhe.mascara': uni('Só nas bordas', 'detalhe'),
  'detalhe.ruidoLuz': uni('Ruído', 'detalhe'),
  'detalhe.ruidoCor': uni('Ruído de cor', 'detalhe'),

  // Efeitos
  'efeitos.grao': uni('Grão', 'efeitos'),
  'efeitos.graoTamanho': { min: 0, max: 100, neutro: 25, passo: 1, rotulo: 'Tamanho', grupo: 'efeitos' },
  'efeitos.graoAspereza': { min: 0, max: 100, neutro: 50, passo: 1, rotulo: 'Aspereza', grupo: 'efeitos' },
  'efeitos.vinheta': bi('Vinheta', 'efeitos'),
  'efeitos.vinhetaMeio': { min: 0, max: 100, neutro: 50, passo: 1, rotulo: 'Meio', grupo: 'efeitos' },
  'efeitos.vinhetaSuavidade': { min: 0, max: 100, neutro: 50, passo: 1, rotulo: 'Suavidade', grupo: 'efeitos' },
  'efeitos.desbotar': uni('Desbotar', 'efeitos'),

  // Calibração (primárias): existe para receber predefinições do Lightroom com fidelidade
  'calibracao.sombrasTinta': bi('Tinta das sombras', 'calibracao'),
  'calibracao.vermelhoMatiz': bi('Vermelho · matiz', 'calibracao'),
  'calibracao.vermelhoSaturacao': bi('Vermelho · saturação', 'calibracao'),
  'calibracao.verdeMatiz': bi('Verde · matiz', 'calibracao'),
  'calibracao.verdeSaturacao': bi('Verde · saturação', 'calibracao'),
  'calibracao.azulMatiz': bi('Azul · matiz', 'calibracao'),
  'calibracao.azulSaturacao': bi('Azul · saturação', 'calibracao'),

  // Geometria
  'geometria.angulo': { min: -45, max: 45, neutro: 0, passo: 0.1, rotulo: 'Ângulo', grupo: 'geometria', unidade: '°' },

  // Tela: o mapa de tons que deita a cena na tela. As margens dizem quantos EV acima e abaixo do cinza cabem na
  // imagem; em 'auto' saem da medida do próprio arquivo (src/raw/latitude.js).
  'tela.contraste': bi('Contraste da tela', 'tela'),
  'tela.preservarMatiz': { min: 0, max: 100, neutro: 100, passo: 1, rotulo: 'Preservar matiz', grupo: 'tela' },

  // Look (LUT) e intensidade geral da predefinição
  'look.quantidade': { min: 0, max: 200, neutro: 100, passo: 1, rotulo: 'Quantidade', grupo: 'look' },
  intensidade: { min: 0, max: 200, neutro: 100, passo: 1, rotulo: 'Intensidade', grupo: 'geral' },
}

const BRANCO_MODOS = ['original', 'auto', 'manual']
const GIROS = [0, 90, 180, 270]
const MARGEM = { min: 0.5, max: 16 } // EV; 'auto' ou número

const zonaNeutra = () => ({ matiz: 0, saturacao: 0, luz: 0 })
const reta = () => [
  [0, 0],
  [1, 1],
]

/** A foto sem tratamento. Sempre um objeto novo. */
export function neutro() {
  return {
    versao: VERSAO,
    luz: { exposicao: 0, contraste: 0, altas: 0, sombras: 0, brancos: 0, pretos: 0 },
    // 'original' = o branco gravado no arquivo; 'auto' = estimado pela imagem; 'manual' = temperatura e tinta abaixo
    branco: { modo: 'original', temperatura: 6500, tinta: 0 },
    cor: { vibracao: 0, saturacao: 0 },
    presenca: { textura: 0, clareza: 0, neblina: 0 },
    curva: { altas: 0, claros: 0, escuros: 0, sombras: 0, pontos: { luz: reta(), r: reta(), g: reta(), b: reta() } },
    misturador: { matiz: zeros(8), saturacao: zeros(8), luz: zeros(8) },
    tonalizacao: { sombras: zonaNeutra(), meios: zonaNeutra(), altas: zonaNeutra(), global: zonaNeutra(), mistura: 50, equilibrio: 0 },
    pb: { ativo: false, mistura: zeros(8) },
    detalhe: { nitidez: 0, raio: 1, detalhe: 25, mascara: 0, ruidoLuz: 0, ruidoCor: 0 },
    efeitos: { grao: 0, graoTamanho: 25, graoAspereza: 50, vinheta: 0, vinhetaMeio: 50, vinhetaSuavidade: 50, desbotar: 0 },
    calibracao: { sombrasTinta: 0, vermelhoMatiz: 0, vermelhoSaturacao: 0, verdeMatiz: 0, verdeSaturacao: 0, azulMatiz: 0, azulSaturacao: 0 },
    // corte em fração da imagem já girada: { x, y, l, a } de 0 a 1; null = quadro inteiro
    geometria: { corte: null, angulo: 0, giro: 0, espelhoH: false, espelhoV: false },
    tela: { contraste: 0, preservarMatiz: 100, margemAltas: 'auto', margemSombras: 'auto' },
    // look: LUT 3D guardada na biblioteca (src/estilo/look.js); id null = sem look
    look: { id: null, quantidade: 100 },
    intensidade: 100,
  }
}

function zeros(n) {
  return new Array(n).fill(0)
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const limitar = (v, min, max) => (v < min ? min : v > max ? max : v)

function ler(obj, caminho) {
  let o = obj
  for (const parte of caminho.split('.')) {
    if (o == null || typeof o !== 'object') return undefined
    o = o[parte]
  }
  return o
}

function gravar(obj, caminho, valor) {
  const partes = caminho.split('.')
  let o = obj
  for (let i = 0; i < partes.length - 1; i++) o = o[partes[i]]
  o[partes[partes.length - 1]] = valor
}

/** Lê um controle escalar pelo caminho ('luz.exposicao'). */
export function valor(ajustes, caminho) {
  return ler(ajustes, caminho)
}

/** Devolve uma cópia com o controle trocado, já na faixa. */
export function comValor(ajustes, caminho, v) {
  const c = CONTROLES[caminho]
  if (!c) throw new Error(`Controle desconhecido: ${caminho}`)
  const copia = structuredClone(ajustes)
  gravar(copia, caminho, limitar(num(v) ?? c.neutro, c.min, c.max))
  return copia
}

function lista8(v, min, max) {
  const saida = zeros(8)
  if (Array.isArray(v)) for (let i = 0; i < 8; i++) saida[i] = limitar(num(v[i]) ?? 0, min, max)
  return saida
}

// Curva de pontos: de 2 a 16 pontos em 0..1, x crescente, pontas presas em x=0 e x=1.
function pontos(v) {
  if (!Array.isArray(v)) return reta()
  const limpos = []
  for (const p of v) {
    if (!Array.isArray(p)) continue
    const x = num(p[0])
    const y = num(p[1])
    if (x == null || y == null) continue
    limpos.push([limitar(x, 0, 1), limitar(y, 0, 1)])
  }
  limpos.sort((a, b) => a[0] - b[0])
  const unicos = []
  for (const p of limpos) {
    if (unicos.length && p[0] - unicos[unicos.length - 1][0] < 1e-4) continue
    unicos.push(p)
  }
  if (unicos.length < 2) return reta()
  if (unicos[0][0] > 0) unicos.unshift([0, unicos[0][1]])
  if (unicos[unicos.length - 1][0] < 1) unicos.push([1, unicos[unicos.length - 1][1]])
  return unicos.slice(0, 16)
}

function zona(v) {
  const z = v && typeof v === 'object' ? v : {}
  const m = num(z.matiz) ?? 0
  return {
    matiz: ((m % 360) + 360) % 360,
    saturacao: limitar(num(z.saturacao) ?? 0, 0, 100),
    luz: limitar(num(z.luz) ?? 0, -100, 100),
  }
}

function corte(v) {
  if (!v || typeof v !== 'object') return null
  const x = num(v.x)
  const y = num(v.y)
  const l = num(v.l)
  const a = num(v.a)
  if (x == null || y == null || l == null || a == null) return null
  const cx = limitar(x, 0, 1)
  const cy = limitar(y, 0, 1)
  const cl = limitar(l, 0.02, 1 - cx)
  const ca = limitar(a, 0.02, 1 - cy)
  if (cx === 0 && cy === 0 && cl === 1 && ca === 1) return null
  return { x: cx, y: cy, l: cl, a: ca }
}

function margem(v) {
  const n = num(v)
  return n == null ? 'auto' : limitar(n, MARGEM.min, MARGEM.max)
}

/**
 * Qualquer entrada vira um objeto de ajustes completo e na faixa. Campo desconhecido é descartado; campo ausente
 * ou inválido recebe o neutro. Nunca lança: arquivo estragado vira o neutro.
 */
export function normalizar(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {}
  const saida = neutro()
  for (const [caminho, c] of Object.entries(CONTROLES)) {
    const v = num(ler(e, caminho))
    if (v != null) gravar(saida, caminho, limitar(v, c.min, c.max))
  }
  const modo = ler(e, 'branco.modo')
  saida.branco.modo = BRANCO_MODOS.includes(modo) ? modo : 'original'
  for (const canal of ['luz', 'r', 'g', 'b']) saida.curva.pontos[canal] = pontos(ler(e, `curva.pontos.${canal}`))
  saida.misturador.matiz = lista8(ler(e, 'misturador.matiz'), -100, 100)
  saida.misturador.saturacao = lista8(ler(e, 'misturador.saturacao'), -100, 100)
  saida.misturador.luz = lista8(ler(e, 'misturador.luz'), -100, 100)
  for (const z of ZONAS) saida.tonalizacao[z] = zona(ler(e, `tonalizacao.${z}`))
  saida.pb.ativo = ler(e, 'pb.ativo') === true
  saida.pb.mistura = lista8(ler(e, 'pb.mistura'), -100, 100)
  saida.geometria.corte = corte(ler(e, 'geometria.corte'))
  const giro = num(ler(e, 'geometria.giro'))
  saida.geometria.giro = GIROS.includes(giro) ? giro : 0
  saida.geometria.espelhoH = ler(e, 'geometria.espelhoH') === true
  saida.geometria.espelhoV = ler(e, 'geometria.espelhoV') === true
  saida.tela.margemAltas = margem(ler(e, 'tela.margemAltas'))
  saida.tela.margemSombras = margem(ler(e, 'tela.margemSombras'))
  const look = ler(e, 'look.id')
  saida.look.id = typeof look === 'string' && look.length > 0 && look.length <= 80 ? look : null
  return saida
}

/** True quando o objeto não muda a foto (comparado ao neutro, depois de normalizar). */
export function eNeutro(ajustes) {
  return JSON.stringify(normalizar(ajustes)) === JSON.stringify(neutro())
}

// Grupos que são da FOTO (corrigem aquela imagem) e não do ESTILO. Uma predefinição não carrega estes por padrão:
// exposição, branco e geometria se resolvem foto a foto (src/estilo/normalizar-foto.js) antes de o estilo entrar.
export const DA_FOTO = ['luz.exposicao', 'branco', 'geometria']

/**
 * Mistura linear entre dois ajustes (t = 0 → a, t = 1 → b, pode passar de 1). É o que faz a intensidade da
 * predefinição: `misturar(neutro(), estilo, intensidade / 100)`. Matiz da tonalização anda pelo arco mais curto;
 * curvas de pontos são reamostradas em 17 pontos. Campos sem meio-termo (modo, giro, look, P&B) vêm de `b` quando
 * t >= 0,5 e de `a` senão.
 */
export function misturar(a, b, t) {
  const A = normalizar(a)
  const B = normalizar(b)
  const saida = neutro()
  const mix = (x, y) => x + (y - x) * t
  for (const [caminho, c] of Object.entries(CONTROLES)) {
    gravar(saida, caminho, limitar(mix(ler(A, caminho), ler(B, caminho)), c.min, c.max))
  }
  for (const k of ['matiz', 'saturacao', 'luz']) {
    saida.misturador[k] = A.misturador[k].map((v, i) => limitar(mix(v, B.misturador[k][i]), -100, 100))
  }
  saida.pb.mistura = A.pb.mistura.map((v, i) => limitar(mix(v, B.pb.mistura[i]), -100, 100))
  for (const z of ZONAS) {
    const za = A.tonalizacao[z]
    const zb = B.tonalizacao[z]
    // zona sem saturação não tem matiz: herda o da outra para o arco não passear
    const ma = za.saturacao === 0 ? zb.matiz : za.matiz
    const mb = zb.saturacao === 0 ? za.matiz : zb.matiz
    const d = ((mb - ma + 540) % 360) - 180
    saida.tonalizacao[z] = {
      matiz: (((ma + d * t) % 360) + 360) % 360,
      saturacao: limitar(mix(za.saturacao, zb.saturacao), 0, 100),
      luz: limitar(mix(za.luz, zb.luz), -100, 100),
    }
  }
  for (const canal of ['luz', 'r', 'g', 'b']) {
    const pa = A.curva.pontos[canal]
    const pb = B.curva.pontos[canal]
    if (ePontosReta(pa) && ePontosReta(pb)) continue
    const novos = []
    for (let i = 0; i <= 16; i++) {
      const x = i / 16
      novos.push([x, limitar(mix(amostrar(pa, x), amostrar(pb, x)), 0, 1)])
    }
    saida.curva.pontos[canal] = novos
  }
  const lado = t >= 0.5 ? B : A
  saida.branco.modo = lado.branco.modo
  saida.pb.ativo = lado.pb.ativo
  saida.geometria.corte = lado.geometria.corte ? { ...lado.geometria.corte } : null
  saida.geometria.giro = lado.geometria.giro
  saida.geometria.espelhoH = lado.geometria.espelhoH
  saida.geometria.espelhoV = lado.geometria.espelhoV
  saida.tela.margemAltas = lado.tela.margemAltas
  saida.tela.margemSombras = lado.tela.margemSombras
  saida.look.id = B.look.id ?? A.look.id
  return saida
}

function ePontosReta(p) {
  return p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 1 && p[1][1] === 1
}

// Interpolação linear só para reamostrar na mistura; a curva de verdade (suave e monótona) é do motor.
function amostrar(p, x) {
  if (x <= p[0][0]) return p[0][1]
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i][0]) {
      const [x0, y0] = p[i - 1]
      const [x1, y1] = p[i]
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1)
    }
  }
  return p[p.length - 1][1]
}

/**
 * Aplica um estilo sobre os ajustes da foto: o que é da foto (DA_FOTO) fica, o resto vem do estilo na intensidade
 * pedida. `levar` lista grupos da foto que o estilo deve trocar mesmo assim (ex.: ['branco'] numa predefinição que
 * esfria de propósito).
 */
export function aplicarEstilo(daFoto, estilo, intensidade = 100, levar = []) {
  const base = normalizar(daFoto)
  const saida = misturar(neutro(), estilo, intensidade / 100)
  saida.intensidade = limitar(intensidade, 0, 200)
  if (!levar.includes('luz.exposicao')) saida.luz.exposicao = base.luz.exposicao
  if (!levar.includes('branco')) saida.branco = { ...base.branco }
  if (!levar.includes('geometria')) saida.geometria = structuredClone(base.geometria)
  return normalizar(saida)
}

/** Lista dos caminhos escalares que diferem do neutro, para mostrar "o que esta predefinição mexe". */
export function mexidos(ajustes) {
  const a = normalizar(ajustes)
  const n = neutro()
  const lista = []
  for (const caminho of Object.keys(CONTROLES)) if (ler(a, caminho) !== ler(n, caminho)) lista.push(caminho)
  for (const k of ['matiz', 'saturacao', 'luz']) if (a.misturador[k].some((v) => v !== 0)) lista.push(`misturador.${k}`)
  for (const z of ZONAS) if (a.tonalizacao[z].saturacao !== 0 || a.tonalizacao[z].luz !== 0) lista.push(`tonalizacao.${z}`)
  for (const canal of ['luz', 'r', 'g', 'b']) if (!ePontosReta(a.curva.pontos[canal])) lista.push(`curva.pontos.${canal}`)
  if (a.pb.ativo) lista.push('pb')
  if (a.look.id) lista.push('look')
  return lista
}
