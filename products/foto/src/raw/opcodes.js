// Opcodes do DNG (OpcodeList1/2/3): correções que a câmera manda aplicar e que o LibRaw ignora. Celular depende
// deles: o Pixel 6 Pro traz quatro GainMap (um por posição do Bayer) que desfazem o escurecimento e o desvio de cor
// das bordas; o iPhone XS traz a vinheta radial. Sem isso a foto de celular sai com os cantos escuros e esverdeados.
//
// Fonte: especificação DNG 1.4 (Adobe), capítulo 7 "Opcode List Processing" e as seções de cada opcode. Formato de
// lista: tudo big-endian, qualquer que seja a ordem do arquivo; contagem (LONG) e, por opcode, id, versão do DNG,
// flags (bit 0 = opcional, bit 1 = pode pular na prévia), tamanho dos parâmetros e os parâmetros.
//
// Em que ponto cada lista entra (DNG 1.4, cap. 7): a 1 no dado cru; a 2 no mosaico já linearizado (preto
// subtraído); a 3 depois do demosaico. Aqui só se aplicam os dois opcodes de ganho: GainMap e FixVignetteRadial.
// Como a vinheta radial é um ganho que só depende da posição (igual para todos os planos), aplicá-la no mosaico
// linearizado dá o mesmo resultado que depois do demosaico. Os demais opcodes são lidos e DEVOLVIDOS COMO NÃO
// APLICADOS, com o nome: quem revela decide o que dizer.

export const NOMES = {
  1: 'WarpRectilinear',
  2: 'WarpFisheye',
  3: 'FixVignetteRadial',
  4: 'FixBadPixelsConstant',
  5: 'FixBadPixelsList',
  6: 'TrimBounds',
  7: 'MapTable',
  8: 'MapPolynomial',
  9: 'GainMap',
  10: 'DeltaPerRow',
  11: 'DeltaPerColumn',
  12: 'ScalePerRow',
  13: 'ScalePerColumn',
  14: 'WarpRectilinear2',
}

const GAIN_MAP = 9
const VINHETA_RADIAL = 3
const MAPA_POLINOMIAL = 8

// DNG 1.4, MapPolynomial: Top, Left, Bottom, Right, Plane, Planes, RowPitch, ColPitch (LONG), Degree (LONG) e
// Degree + 1 coeficientes (DOUBLE). O valor do pixel, normalizado de 0 a 1, vira Σ cᵢ·xⁱ (cortado em 0..1). É como o
// "DNG com perdas" devolve ao linear os 8 bits do JPEG (lista 2, um por plano).
function lerMapaPolinomial(v) {
  if (v.byteLength < 44) return null
  const grau = v.getUint32(32)
  if (grau > 8 || v.byteLength < 36 + (grau + 1) * 8) return null
  const m = {
    area: { topo: v.getUint32(0), esquerda: v.getUint32(4), base: v.getUint32(8), direita: v.getUint32(12) },
    plano: v.getUint32(16),
    planos: v.getUint32(20),
    passoLinha: v.getUint32(24),
    passoColuna: v.getUint32(28),
    coeficientes: Array.from({ length: grau + 1 }, (_, i) => v.getFloat64(36 + i * 8)),
  }
  if (m.passoLinha < 1 || m.passoColuna < 1 || m.planos < 1) return null
  return m
}

/** A função de um MapPolynomial já lido: x (0..1) → y (0..1). */
export function funcaoDoMapa(op) {
  const c = op.coeficientes
  return (x) => {
    let y = 0
    for (let i = c.length - 1; i >= 0; i--) y = y * x + c[i]
    return y < 0 ? 0 : y > 1 ? 1 : y
  }
}

function lerGainMap(v) {
  if (v.byteLength < 76) return null
  const m = {
    area: { topo: v.getUint32(0), esquerda: v.getUint32(4), base: v.getUint32(8), direita: v.getUint32(12) },
    plano: v.getUint32(16),
    planos: v.getUint32(20),
    passoLinha: v.getUint32(24),
    passoColuna: v.getUint32(28),
    pontosV: v.getUint32(32),
    pontosH: v.getUint32(36),
    espacoV: v.getFloat64(40),
    espacoH: v.getFloat64(48),
    origemV: v.getFloat64(56),
    origemH: v.getFloat64(64),
    planosDoMapa: v.getUint32(72),
  }
  const n = m.pontosV * m.pontosH * m.planosDoMapa
  if (!(n > 0) || v.byteLength < 76 + n * 4 || m.passoLinha < 1 || m.passoColuna < 1) return null
  m.ganhos = new Float32Array(n)
  for (let i = 0; i < n; i++) m.ganhos[i] = v.getFloat32(76 + i * 4)
  return m
}

function lerVinheta(v) {
  if (v.byteLength < 56) return null
  const k = [0, 1, 2, 3, 4].map((i) => v.getFloat64(i * 8))
  return { k, centro: { x: v.getFloat64(40), y: v.getFloat64(48) } }
}

/**
 * Lista de opcodes a partir dos bytes da tag: [{ id, nome, versao, opcional, pulaNaPrevia, aplicavel, bruto, … }].
 * GainMap traz { area, plano, planos, passoLinha, passoColuna, pontosV, pontosH, espacoV, espacoH, origemV, origemH,
 * planosDoMapa, ganhos: Float32Array }; FixVignetteRadial traz { k: [k0..k4], centro: { x, y } }; MapPolynomial traz
 * { area, plano, planos, passoLinha, passoColuna, coeficientes } (quem aplica é abrir.js, na imagem sem mosaico).
 * Lista truncada ou inválida devolve o que deu para ler.
 */
export function lerOpcodes(bytes) {
  const lista = []
  if (!bytes || bytes.length < 4) return lista
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const n = v.getUint32(0)
  let p = 4
  for (let i = 0; i < n && p + 16 <= bytes.length; i++) {
    const id = v.getUint32(p)
    const flags = v.getUint32(p + 8)
    const tam = v.getUint32(p + 12)
    if (p + 16 + tam > bytes.length) break
    const bruto = bytes.slice(p + 16, p + 16 + tam)
    const op = {
      id,
      nome: NOMES[id] || `Opcode${id}`,
      versao: [0, 1, 2, 3].map((k) => bytes[p + 4 + k]).join('.'),
      opcional: (flags & 1) !== 0,
      pulaNaPrevia: (flags & 2) !== 0,
      aplicavel: false,
      bruto,
    }
    const pv = new DataView(bruto.buffer, bruto.byteOffset, bruto.byteLength)
    const lido = id === GAIN_MAP ? lerGainMap(pv) : id === VINHETA_RADIAL ? lerVinheta(pv) : id === MAPA_POLINOMIAL ? lerMapaPolinomial(pv) : null
    if (lido) Object.assign(op, lido, { aplicavel: true })
    lista.push(op)
    p += 16 + tam
  }
  return lista
}

/** Bytes da tag a partir da lista (o inverso de `lerOpcodes`): usa `bruto` quando existe, senão monta os parâmetros. */
export function escreverOpcodes(lista) {
  const partes = lista.map((op) => {
    if (op.bruto) return op.bruto
    if (op.id === GAIN_MAP) {
      const b = new Uint8Array(76 + op.ganhos.length * 4)
      const v = new DataView(b.buffer)
      const a = op.area
      ;[a.topo, a.esquerda, a.base, a.direita, op.plano ?? 0, op.planos ?? 1, op.passoLinha ?? 1, op.passoColuna ?? 1, op.pontosV, op.pontosH].forEach((x, i) =>
        v.setUint32(i * 4, x),
      )
      ;[op.espacoV, op.espacoH, op.origemV, op.origemH].forEach((x, i) => v.setFloat64(40 + i * 8, x))
      v.setUint32(72, op.planosDoMapa ?? 1)
      op.ganhos.forEach((g, i) => v.setFloat32(76 + i * 4, g))
      return b
    }
    if (op.id === VINHETA_RADIAL) {
      const b = new Uint8Array(56)
      const v = new DataView(b.buffer)
      ;[...op.k, op.centro.x, op.centro.y].forEach((x, i) => v.setFloat64(i * 8, x))
      return b
    }
    throw new Error(`opcode ${op.id} sem parâmetros para escrever`)
  })
  const saida = new Uint8Array(4 + partes.reduce((s, b) => s + 16 + b.length, 0))
  const v = new DataView(saida.buffer)
  v.setUint32(0, lista.length)
  let p = 4
  lista.forEach((op, i) => {
    const versao = String(op.versao || '1.3.0.0')
      .split('.')
      .map(Number)
    v.setUint32(p, op.id)
    versao.forEach((x, k) => v.setUint8(p + 4 + k, x || 0))
    v.setUint32(p + 8, (op.opcional ? 1 : 0) | (op.pulaNaPrevia ? 2 : 0))
    v.setUint32(p + 12, partes[i].length)
    saida.set(partes[i], p + 16)
    p += 16 + partes[i].length
  })
  return saida
}

// Posição no mapa de um pixel: DNG 1.4, GainMap. O mapa cobre a imagem em coordenadas relativas (0 = borda de
// cima/esquerda, 1 = de baixo/direita); o ponto i fica em origem + i·espaço. O pixel entra pelo centro (+0,5),
// como na implementação de referência da Adobe; fora do mapa vale a borda.
function eixo(inicio, fim, passo, tamanho, origem, espaco, pontos) {
  const n = Math.max(0, Math.ceil((fim - inicio) / passo))
  const indice = new Int32Array(n)
  const peso = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const rel = (inicio + i * passo + 0.5) / tamanho
    const f = pontos > 1 && espaco > 0 ? Math.min(pontos - 1, Math.max(0, (rel - origem) / espaco)) : 0
    const i0 = Math.min(Math.floor(f), Math.max(0, pontos - 2))
    indice[i] = i0
    peso[i] = pontos > 1 ? f - i0 : 0
  }
  return { n, indice, peso }
}

function aplicarGainMap(dados, largura, img, op) {
  const topo = Math.min(op.area.topo, img.altura)
  const base = Math.min(op.area.base, img.altura)
  const esquerda = Math.min(op.area.esquerda, img.largura)
  const direita = Math.min(op.area.direita, img.largura)
  const v = eixo(topo, base, op.passoLinha, img.altura, op.origemV, op.espacoV, op.pontosV)
  const h = eixo(esquerda, direita, op.passoColuna, img.largura, op.origemH, op.espacoH, op.pontosH)
  const { ganhos, pontosH, planosDoMapa } = op
  const prox = op.pontosV > 1 ? pontosH * planosDoMapa : 0
  const lado = pontosH > 1 ? planosDoMapa : 0
  for (let j = 0; j < v.n; j++) {
    const linha = (img.y + topo + j * op.passoLinha) * largura + img.x + esquerda
    const m0 = v.indice[j] * pontosH * planosDoMapa
    const fv = v.peso[j]
    for (let i = 0; i < h.n; i++) {
      const a = m0 + h.indice[i] * planosDoMapa
      const fh = h.peso[i]
      const cima = ganhos[a] + (ganhos[a + lado] - ganhos[a]) * fh
      const baixo = ganhos[a + prox] + (ganhos[a + prox + lado] - ganhos[a + prox]) * fh
      dados[linha + i * op.passoColuna] *= cima + (baixo - cima) * fv
    }
  }
}

// DNG 1.4, FixVignetteRadial: ganho = 1 + k0·r² + k1·r⁴ + k2·r⁶ + k3·r⁸ + k4·r¹⁰, com r = distância ao centro óptico
// dividida pela distância do centro ao canto mais longe (r = 1 nesse canto). Pixel pelo centro (+0,5): meio pixel de
// diferença muda o ganho em menos de 1e-3 numa imagem de milhares de pixels.
function aplicarVinheta(dados, largura, img, op) {
  const cx = op.centro.x * img.largura
  const cy = op.centro.y * img.altura
  const longe = Math.max(cx, img.largura - cx) ** 2 + Math.max(cy, img.altura - cy) ** 2
  const [k0, k1, k2, k3, k4] = op.k
  const dx2 = new Float32Array(img.largura)
  for (let x = 0; x < img.largura; x++) dx2[x] = (x + 0.5 - cx) ** 2 / longe
  for (let y = 0; y < img.altura; y++) {
    const dy2 = (y + 0.5 - cy) ** 2 / longe
    const linha = (img.y + y) * largura + img.x
    for (let x = 0; x < img.largura; x++) {
      const r2 = dx2[x] + dy2
      dados[linha + x] *= 1 + r2 * (k0 + r2 * (k1 + r2 * (k2 + r2 * (k3 + r2 * k4))))
    }
  }
}

/**
 * Aplica GainMap e FixVignetteRadial num mosaico Float32 JÁ LINEARIZADO (preto subtraído), na ordem da lista.
 * Função pura: `mosaico` não é tocado; o resultado sai em `dados` (um vetor novo, ou `destino` se for passado —
 * passar o próprio mosaico como destino é a forma de aplicar no lugar).
 *
 * `largura` e `altura` são do vetor; `area` ({ x, y, largura, altura }) é a imagem dentro dele (a área ativa do
 * sensor: as coordenadas dos opcodes contam dela). Sem `area`, a imagem é o vetor inteiro.
 *
 * Devolve { dados, aplicados: [nome], naoAplicados: [{ nome, motivo, opcional }] }.
 */
export function aplicarOpcodes(mosaico, { largura, altura, area }, lista, { destino } = {}) {
  if (mosaico.length !== largura * altura) throw new Error('aplicarOpcodes: tamanho do mosaico não bate com largura × altura')
  const img = area || { x: 0, y: 0, largura, altura }
  const dados = destino || new Float32Array(mosaico)
  if (destino && destino !== mosaico) destino.set(mosaico)
  const aplicados = []
  const naoAplicados = []
  for (const op of lista || []) {
    if (op.id === GAIN_MAP && op.aplicavel && op.plano === 0) {
      aplicarGainMap(dados, largura, img, op)
      aplicados.push(op.nome)
    } else if (op.id === VINHETA_RADIAL && op.aplicavel) {
      aplicarVinheta(dados, largura, img, op)
      aplicados.push(op.nome)
    } else {
      const motivo =
        op.id === GAIN_MAP ? (op.aplicavel ? 'mapa para um plano que o mosaico não tem' : 'parâmetros inválidos') : 'opcode não coberto por este leitor'
      naoAplicados.push({ nome: op.nome, motivo, opcional: op.opcional })
    }
  }
  return { dados, aplicados, naoAplicados }
}
