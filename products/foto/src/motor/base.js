// A base do motor Latitude: do dado do sensor (o negativo) até a imagem de trabalho — linear, Rec.2020 D65, cena, sem
// teto. É o passo "no sensor" do contrato:
//
//   normalizar por sensel (preto com padrão, saturação efetiva por canal, sem cortar negativos) → máscara de corte →
//   branco em espaço de câmera → reconstrução de altas luzes no mosaico → demosaico → câmera → XYZ D50 → Rec.2020
//
// Nada aqui corta em 1,0: o que passa de 1 é alta luz de verdade e segue até o mapa de tons (tela.js).
//
// Fontes das contas:
// - Demosaico 'rapido': Malvar, He e Cutler (2004), "High-quality linear interpolation for demosaicing of
//   Bayer-patterned color images", ICASSP — os quatro núcleos 5×5 do artigo.
// - Demosaico 'qualidade': escrito aqui. Verde por interpolação direcional com correção de Laplaciano (Hamilton e
//   Adams, 1997, patente US 5,629,734, já expirada) nas duas direções, e a escolha entre elas pela homogeneidade da
//   diferença de cor, a ideia de Hirakawa e Parks (2005), "Adaptive homogeneity-directed demosaicing algorithm", IEEE
//   TIP 14(3): a direção certa é a que deixa G − R (ou G − B) liso na vizinhança. Aqui a escolha é suave (pesos), não
//   um ou outro. Vermelho e azul pela diferença de cor, com a diagonal mais lisa pesando mais.
// - Câmera → XYZ: especificação DNG 1.6, capítulo "Mapping Camera Color Space to CIE XYZ Space" (dois iluminantes
//   interpolados por 1/T, ForwardMatrix, adaptação Bradford para D50). Matriz única D65 (arquivos lidos pelo LibRaw):
//   linhas normalizadas para o branco D65 dar (1, 1, 1) na câmera, como o dcraw/LibRaw faz em `cam_xyz_coeff`.
// - Altas luzes: escrito aqui (ver `reconstruirAltas`).
// - Ruído: var = ganho·sinal + leitura² (Foi, Trimeche, Katkovnik e Egiazarian, 2008, "Practical Poissonian-Gaussian
//   noise modeling and fitting for single-image raw-data", IEEE TIP 17(10)); é também a tag NoiseProfile do DNG.

import { matrizAdaptacao } from './cor/adaptacao.js'
import { temperaturaDeXy } from './cor/branco.js'
import { D50, D65, XYZParaXy, luminancia, xyParaXYZ, xyzParaRgb } from './cor/espacos.js'
import { diagonal, escalar, inversa, misturarM, mulM, mulV } from './cor/matriz.js'
import { MARGENS, criarTela } from './tela.js'

/** Sensel conta como cortado a partir desta fração da saturação efetiva (em DN): perto do teto a resposta já entorta. */
export const LIMIAR_CORTE = 0.98

// Margem espelhada em volta do mosaico de trabalho: 4 sensels cobrem os núcleos 5×5 e a vizinhança da homogeneidade,
// e por ser par mantém a fase do filtro de cor.
const BORDA = 4

// ─────────── cor da câmera ───────────

const XYZ_D50 = xyParaXYZ(D50)
const XYZ_D65 = xyParaXYZ(D65)
const D50_PARA_D65 = matrizAdaptacao(XYZ_D50, XYZ_D65, 'bradford')

/**
 * Tudo que a cor da câmera precisa, a partir do negativo:
 *   neutro        o que a câmera registra de um objeto neutro sob a luz da foto (maior canal = 1)
 *   ganhos        multiplicadores de branco em espaço de câmera (o menor vale 1: o neutro satura em 1,0)
 *   paraRec2020   matriz 3×3: câmera já com o branco aplicado → Rec.2020 D65 (neutro vira r = g = b)
 *   branco        { kelvin, tinta } da luz da foto, medido pelas matrizes do arquivo
 */
export function corDaCamera(negativo) {
  const { matrizes, origem } = negativo.cor
  let neutro = null
  if (Array.isArray(negativo.cor.neutroComoFotografado)) neutro = negativo.cor.neutroComoFotografado.slice(0, 3)
  else if (Array.isArray(negativo.wb?.comoFotografado)) neutro = negativo.wb.comoFotografado.slice(0, 3).map((m) => 1 / m)
  // sem branco gravado: a luz do dia (D65) vista pela matriz mais fria
  const maisFria = matrizes.reduce((a, b) => (b.kelvin > a.kelvin ? b : a))
  if (!neutro || !neutro.every((v) => Number.isFinite(v) && v > 0)) neutro = mulV(maisFria.xyzParaCamera, XYZ_D65)
  const maior = Math.max(...neutro)
  neutro = neutro.map((v) => v / maior)
  const ganhos = neutro.map((v) => 1 / v)

  let paraXyzD65
  let xyBranco
  if (origem === 'libraw' && matrizes.length === 1) {
    // matriz única D65: XYZ → câmera com as linhas escaladas para o branco D65 dar (1, 1, 1); a inversa leva a câmera
    // (já com o branco da foto aplicado) direto a XYZ D65
    const m = matrizes[0].xyzParaCamera
    const noBranco = mulV(m, XYZ_D65)
    paraXyzD65 = inversa(mulM(diagonal(noBranco.map((v) => 1 / v)), m))
    xyBranco = XYZParaXy(mulV(inversa(m), neutro))
  } else {
    // DNG: a matriz depende da temperatura da luz, que depende da matriz — itera até assentar (como o DNG SDK)
    const [quente, fria] = matrizes.length === 2 ? (matrizes[0].kelvin <= matrizes[1].kelvin ? matrizes : [matrizes[1], matrizes[0]]) : [matrizes[0], matrizes[0]]
    const peso = (T) => {
      if (quente === fria) return 1
      const g = (1 / T - 1 / fria.kelvin) / (1 / quente.kelvin - 1 / fria.kelvin)
      return g < 0 ? 0 : g > 1 ? 1 : g
    }
    let T = 5000
    let cm = quente.xyzParaCamera
    let g = 1
    for (let i = 0; i < 30; i++) {
      g = peso(T)
      cm = misturarM(quente.xyzParaCamera, fria.xyzParaCamera, g)
      xyBranco = XYZParaXy(mulV(inversa(cm), neutro))
      const nova = temperaturaDeXy(xyBranco).kelvin
      if (Math.abs(nova - T) < 0.5) {
        T = nova
        break
      }
      T = nova
    }
    let paraXyzD50
    if (quente.cameraParaXyzD50 && fria.cameraParaXyzD50) {
      // ForwardMatrix: já leva a câmera com o branco aplicado a XYZ D50
      paraXyzD50 = misturarM(quente.cameraParaXyzD50, fria.cameraParaXyzD50, g)
    } else {
      const semBranco = mulM(inversa(cm), diagonal(neutro)) // câmera com branco aplicado → XYZ sob a luz da foto
      const luz = mulV(semBranco, [1, 1, 1])
      const adaptar = matrizAdaptacao([luz[0] / luz[1], 1, luz[2] / luz[1]], XYZ_D50, 'bradford')
      paraXyzD50 = escalar(mulM(adaptar, semBranco), 1 / luz[1])
    }
    paraXyzD65 = mulM(D50_PARA_D65, paraXyzD50)
  }
  const t = temperaturaDeXy(xyBranco)
  return {
    neutro,
    ganhos,
    paraRec2020: mulM(xyzParaRgb('rec2020'), paraXyzD65),
    branco: { kelvin: t.kelvin, tinta: t.tinta, neutroCamera: neutro },
  }
}

// ─────────── mosaico normalizado ───────────

// O mosaico de trabalho: Float32, só a área ativa, com BORDA sensels espelhados em volta. `em(x, y)` = dados[(y +
// BORDA)·passo + x + BORDA]. Já sai com o branco de câmera aplicado; `cortado` marca os sensels saturados.
function normalizar(negativo, latitude, ganhos) {
  const { area, sensor, cfa } = negativo
  const W = area.largura
  const H = area.altura
  const passo = W + 2 * BORDA
  const dados = new Float32Array(passo * (H + 2 * BORDA))
  const cortado = new Uint8Array(W * H)
  const preto = latitude?.preto ?? negativo.preto.porCanal
  const branco = latitude?.branco ?? negativo.branco.declarado
  const escala = [0, 1, 2].map((c) => ganhos[c] / (branco[c] - preto[c]))
  const limiar = [0, 1, 2].map((c) => LIMIAR_CORTE * branco[c])
  const padrao = negativo.preto.padrao
  const lado = cfa.lado
  const bruto = sensor.dados
  const corDaLinha = new Uint8Array(W)
  let cortados = 0
  for (let y = 0; y < H; y++) {
    const fase = (y % lado) * lado
    for (let x = 0; x < W; x++) corDaLinha[x] = cfa.padrao[fase + (x % lado)]
    const sy = area.y + y
    const origem = sy * sensor.largura + area.x
    const destino = (y + BORDA) * passo + BORDA
    const linhaPadrao = padrao ? (sy % padrao.linhas) * padrao.colunas : 0
    for (let x = 0; x < W; x++) {
      const c = corDaLinha[x]
      const dn = bruto[origem + x]
      let p = preto[c]
      if (padrao) p += padrao.valores[linhaPadrao + ((area.x + x) % padrao.colunas)]
      dados[destino + x] = (dn - p) * escala[c]
      if (dn >= limiar[c]) {
        cortado[y * W + x] = 1
        cortados++
      }
    }
  }
  return { dados, cortado, cortados, W, H, passo, lado, padrao: cfa.padrao, tipo: cfa.tipo }
}

// Espelha a borda (depois da reconstrução, antes do demosaico): x = −j ↔ j e x = W − 1 + j ↔ W − 1 − j.
function espelharBorda(mos) {
  const { dados, W, H, passo } = mos
  for (let y = 0; y < H; y++) {
    const l = (y + BORDA) * passo + BORDA
    for (let j = 1; j <= BORDA; j++) {
      dados[l - j] = dados[l + Math.min(j, W - 1)]
      dados[l + W - 1 + j] = dados[l + Math.max(W - 1 - j, 0)]
    }
  }
  for (let j = 1; j <= BORDA; j++) {
    const cima = Math.min(j, H - 1)
    const baixo = Math.max(H - 1 - j, 0)
    dados.copyWithin((BORDA - j) * passo, (BORDA + cima) * passo, (BORDA + cima + 1) * passo)
    dados.copyWithin((BORDA + H - 1 + j) * passo, (BORDA + baixo) * passo, (BORDA + baixo + 1) * passo)
  }
}

// ─────────── reconstrução de altas luzes ───────────

// Peso do "neutro" nas células com os três canais cortados: fraco perto da borda da região (onde a razão medida ao
// lado manda) e dominante a partir de umas 8 células para dentro (soma 64 × 0,02 > 1). É o que faz a transição suave.
const PESO_NEUTRO = 0.02

/**
 * Reconstrução de altas luzes no mosaico (já com o branco aplicado), em células do tamanho do filtro (2×2 no Bayer,
 * 3×3 no X-Trans), cada uma com os três canais:
 *
 * 1. Célula sem corte dá duas razões em log, ln(R/G) e ln(B/G), com peso proporcional ao quadrado do brilho (quem
 *    está perto do teto diz mais sobre a cor da alta luz que a sombra ao lado).
 * 2. As razões são levadas para dentro das regiões cortadas por uma pirâmide de médias ponderadas (pull-push): cada
 *    célula cortada recebe a razão da borda não cortada mais próxima, suavizada. Célula com os três canais cortados
 *    entra como neutra com peso fraco.
 * 3. Um ou dois canais cortados: o canal que falta é o canal válido vezes a razão (média geométrica quando há dois
 *    válidos). Três: o menor brilho em que todos os canais estariam no teto com aquela razão — no miolo, branco.
 * 4. O sensel cortado fica com o maior entre o que tinha e o estimado (lido no lugar do sensel): a reconstrução só
 *    acrescenta.
 *
 * Devolve { celulas: [um, dois, tres] (frações da área), folga (EV acima de 1,0 do percentil 99,9 da imagem) }.
 */
function reconstruirAltas(mos, ganhos) {
  const { dados, cortado, W, H, passo, padrao, lado } = mos
  const cl = lado === 2 ? 2 : 3
  const cw = Math.ceil(W / cl)
  const ch = Math.ceil(H / cl)
  const n = cw * ch
  const valor = new Float32Array(n * 3)
  const conta = new Uint8Array(n * 3)
  const marca = new Uint8Array(n) // bit c ligado = canal c cortado (ou sem amostra válida) na célula
  for (let y = 0; y < H; y++) {
    const cy = (y / cl) | 0
    const fase = (y % lado) * lado
    const linha = (y + BORDA) * passo + BORDA
    for (let x = 0; x < W; x++) {
      const c = padrao[fase + (x % lado)]
      const cel = cy * cw + ((x / cl) | 0)
      if (cortado[y * W + x]) marca[cel] |= 1 << c
      else {
        valor[cel * 3 + c] += dados[linha + x]
        conta[cel * 3 + c]++
      }
    }
  }
  // médias por célula
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      if (conta[i * 3 + c]) valor[i * 3 + c] /= conta[i * 3 + c]
      else marca[i] |= 1 << c
    }
  }
  // No Bayer o vermelho e o azul moram em cantos opostos da célula: num degradê, a média de cada canal vale para um
  // ponto diferente, e a razão entre canais ganharia um erro igual ao degradê de meio pixel. Leva os dois para o
  // centro da célula (bilinear com as três células vizinhas do lado do centro: pesos 9, 3, 3, 1). O verde, e os três
  // canais no X-Trans, já têm o centro de massa no centro.
  if (lado === 2) {
    const bruto = Float32Array.from(valor)
    for (let c = 0; c < 3; c += 2) {
      const pos = padrao.indexOf(c)
      const dx = (pos & 1) === 0 ? 1 : -1
      const dy = pos >> 1 === 0 ? 1 : -1
      const bit = 1 << c
      for (let y = 0; y < ch; y++) {
        const yv = y + dy
        for (let x = 0; x < cw; x++) {
          const i = y * cw + x
          if (marca[i] & bit) continue
          const xv = x + dx
          let soma = 9 * bruto[i * 3 + c]
          let peso = 9
          const temX = xv >= 0 && xv < cw
          const temY = yv >= 0 && yv < ch
          if (temX && !(marca[i + dx] & bit)) {
            soma += 3 * bruto[(i + dx) * 3 + c]
            peso += 3
          }
          if (temY && !(marca[i + dy * cw] & bit)) {
            soma += 3 * bruto[(i + dy * cw) * 3 + c]
            peso += 3
          }
          if (temX && temY && !(marca[i + dy * cw + dx] & bit)) {
            soma += bruto[(i + dy * cw + dx) * 3 + c]
            peso += 1
          }
          valor[i * 3 + c] = soma / peso
        }
      }
    }
  }
  // razões das células válidas
  const nivel0 = { w: new Float32Array(n), a: new Float32Array(n), b: new Float32Array(n), cw, ch }
  const quantas = [0, 0, 0, 0]
  const iG = [1 / ganhos[0], 1 / ganhos[1], 1 / ganhos[2]]
  for (let i = 0; i < n; i++) {
    const m = marca[i]
    const k = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1)
    quantas[k]++
    if (k === 0) {
      const r = valor[i * 3]
      const g = valor[i * 3 + 1]
      const b = valor[i * 3 + 2]
      if (r > 1e-4 && g > 1e-4 && b > 1e-4) {
        let brilho = Math.max(r * iG[0], g * iG[1], b * iG[2])
        if (brilho > 1) brilho = 1
        const w = brilho * brilho
        nivel0.w[i] = w
        nivel0.a[i] = w * Math.log(r / g)
        nivel0.b[i] = w * Math.log(b / g)
      }
    } else if (k === 3) nivel0.w[i] = PESO_NEUTRO
  }
  const resultado = { celulas: [quantas[1] / n, quantas[2] / n, quantas[3] / n], folga: 0 }
  if (quantas[1] + quantas[2] + quantas[3] === 0) return resultado

  // pull: cada nível soma os quatro filhos
  const niveis = [nivel0]
  while (niveis[niveis.length - 1].cw > 1 || niveis[niveis.length - 1].ch > 1) {
    const f = niveis[niveis.length - 1]
    const pw = Math.ceil(f.cw / 2)
    const ph = Math.ceil(f.ch / 2)
    const p = { w: new Float32Array(pw * ph), a: new Float32Array(pw * ph), b: new Float32Array(pw * ph), cw: pw, ch: ph }
    for (let y = 0; y < f.ch; y++) {
      const linha = (y >> 1) * pw
      for (let x = 0; x < f.cw; x++) {
        const i = y * f.cw + x
        const j = linha + (x >> 1)
        p.w[j] += f.w[i]
        p.a[j] += f.a[i]
        p.b[j] += f.b[i]
      }
    }
    niveis.push(p)
  }
  // push: de cima para baixo, cada célula fica com a própria média na medida do peso que tem e completa com o nível
  // de cima (interpolado em bilinear)
  let cima = null
  for (let k = niveis.length - 1; k >= 0; k--) {
    const f = niveis[k]
    for (let y = 0; y < f.ch; y++) {
      for (let x = 0; x < f.cw; x++) {
        const i = y * f.cw + x
        const w = f.w[i]
        const t = w >= 1 ? 1 : w
        let a = 0
        let b = 0
        if (cima && t < 1) {
          const fx = Math.min(Math.max((x + 0.5) / 2 - 0.5, 0), cima.cw - 1)
          const fy = Math.min(Math.max((y + 0.5) / 2 - 0.5, 0), cima.ch - 1)
          const x0 = fx | 0
          const y0 = fy | 0
          const x1 = Math.min(x0 + 1, cima.cw - 1)
          const y1 = Math.min(y0 + 1, cima.ch - 1)
          const tx = fx - x0
          const ty = fy - y0
          const i00 = y0 * cima.cw + x0
          const i01 = y0 * cima.cw + x1
          const i10 = y1 * cima.cw + x0
          const i11 = y1 * cima.cw + x1
          a = (cima.a[i00] * (1 - tx) + cima.a[i01] * tx) * (1 - ty) + (cima.a[i10] * (1 - tx) + cima.a[i11] * tx) * ty
          b = (cima.b[i00] * (1 - tx) + cima.b[i01] * tx) * (1 - ty) + (cima.b[i10] * (1 - tx) + cima.b[i11] * tx) * ty
        }
        if (w > 0) {
          a = t * (f.a[i] / w) + (1 - t) * a
          b = t * (f.b[i] / w) + (1 - t) * b
        }
        f.a[i] = a
        f.b[i] = b
      }
    }
    cima = f
  }

  // estimativa por célula marcada (fica em `valor`), e o histograma para a folga
  const CASAS = 96 // 1/16 EV, de 0 a 6 EV acima de 1,0
  const histograma = new Uint32Array(CASAS)
  for (let i = 0; i < n; i++) {
    const m = marca[i]
    let r = valor[i * 3]
    let g = valor[i * 3 + 1]
    let b = valor[i * 3 + 2]
    if (m) {
      const rr = Math.exp(nivel0.a[i]) // R/G esperado
      const rb = Math.exp(nivel0.b[i]) // B/G esperado
      const pos = (v) => (v > 1e-6 ? v : 1e-6)
      if (m === 0b010) g = Math.sqrt((pos(r) / rr) * (pos(b) / rb))
      else if (m === 0b001) r = rr * Math.sqrt((pos(g) * pos(b)) / rb)
      else if (m === 0b100) b = rb * Math.sqrt((pos(g) * pos(r)) / rr)
      else if (m === 0b011) {
        g = pos(b) / rb
        r = g * rr
      } else if (m === 0b110) {
        g = pos(r) / rr
        b = g * rb
      } else if (m === 0b101) {
        r = pos(g) * rr
        b = pos(g) * rb
      } else {
        // os três no teto: o menor brilho em que cada canal estaria saturado (ganho_c é o canal c em 1,0 do sensor)
        g = Math.max(ganhos[1], ganhos[0] / rr, ganhos[2] / rb)
        r = g * rr
        b = g * rb
      }
      valor[i * 3] = r
      valor[i * 3 + 1] = g
      valor[i * 3 + 2] = b
    }
    const topo = Math.max(r, g, b)
    if (topo > 1) histograma[Math.min(CASAS - 1, (Math.log2(topo) * 16) | 0)]++
  }
  // folga: quanto acima de 1,0 fica o percentil 99,9 do brilho das células
  let acima = 0
  const alvo = n * 0.001
  for (let k = CASAS - 1; k >= 0; k--) {
    acima += histograma[k]
    if (acima >= alvo) {
      resultado.folga = (k + 1) / 16
      break
    }
  }
  // de volta ao mosaico: só os sensels cortados, e só para cima. O valor de cada célula vale no centro dela; o sensel
  // lê o plano no lugar onde está (bilinear entre os centros das células vizinhas).
  for (let y = 0; y < H; y++) {
    const fase = (y % lado) * lado
    const linha = (y + BORDA) * passo + BORDA
    const fy = Math.min(Math.max((y + 0.5) / cl - 0.5, 0), ch - 1)
    const y0 = fy | 0
    const y1 = Math.min(y0 + 1, ch - 1)
    const ty = fy - y0
    for (let x = 0; x < W; x++) {
      if (!cortado[y * W + x]) continue
      const c = padrao[fase + (x % lado)]
      const fx = Math.min(Math.max((x + 0.5) / cl - 0.5, 0), cw - 1)
      const x0 = fx | 0
      const x1 = Math.min(x0 + 1, cw - 1)
      const tx = fx - x0
      const estimado =
        (valor[(y0 * cw + x0) * 3 + c] * (1 - tx) + valor[(y0 * cw + x1) * 3 + c] * tx) * (1 - ty) +
        (valor[(y1 * cw + x0) * 3 + c] * (1 - tx) + valor[(y1 * cw + x1) * 3 + c] * tx) * ty
      if (estimado > dados[linha + x]) dados[linha + x] = estimado
    }
  }
  return resultado
}

// ─────────── demosaico ───────────

// Malvar-He-Cutler: os quatro núcleos 5×5 (÷ 8), aplicados conforme a cor do sensel e a da linha.
function demosaicoRapido(mos, saida) {
  const { dados: m, W, H, passo: S, padrao } = mos
  for (let y = 0; y < H; y++) {
    const fase = (y & 1) * 2
    const outraFase = ((y + 1) & 1) * 2
    let i = (y + BORDA) * S + BORDA
    let o = y * W * 3
    for (let x = 0; x < W; x++, i++, o += 3) {
      const cor = padrao[fase + (x & 1)]
      const C = m[i]
      const cruz2 = m[i - 2] + m[i + 2] + m[i - 2 * S] + m[i + 2 * S]
      if (cor === 1) {
        const diagonais = m[i - S - 1] + m[i - S + 1] + m[i + S - 1] + m[i + S + 1]
        // cor dos vizinhos da mesma linha e a dos vizinhos da mesma coluna
        const naLinha = padrao[fase + ((x + 1) & 1)]
        const naColuna = padrao[outraFase + (x & 1)]
        const h = (5 * C + 4 * (m[i - 1] + m[i + 1]) - diagonais - (m[i - 2] + m[i + 2]) + 0.5 * (m[i - 2 * S] + m[i + 2 * S])) * 0.125
        const v = (5 * C + 4 * (m[i - S] + m[i + S]) - diagonais - (m[i - 2 * S] + m[i + 2 * S]) + 0.5 * (m[i - 2] + m[i + 2])) * 0.125
        saida[o + 1] = C
        saida[o + naLinha] = h
        saida[o + naColuna] = v
      } else {
        saida[o + cor] = C
        saida[o + 1] = (4 * C + 2 * (m[i - 1] + m[i + 1] + m[i - S] + m[i + S]) - cruz2) * 0.125
        saida[o + 2 - cor] = (6 * C + 2 * (m[i - S - 1] + m[i - S + 1] + m[i + S - 1] + m[i + S + 1]) - 1.5 * cruz2) * 0.125
      }
    }
  }
}

// Regularização dos pesos direcionais, em unidades do sinal normalizado: abaixo disto (ruído de um bom sensor em ISO
// base) as duas direções pesam igual e o resultado é a média delas.
const PISO_DIRECAO = 0.002

function demosaicoQualidade(mos, saida) {
  const { dados: m, W, H, passo: S, padrao } = mos
  // 1. verde, em faixas de linhas (as diferenças de cor direcionais só vivem dentro da faixa)
  const FAIXA = 64
  const LD = W + 4 // largura das linhas de diferença, com 2 de margem de cada lado
  const dh = new Float32Array(LD * (FAIXA + 4))
  const dv = new Float32Array(LD * (FAIXA + 4))
  const gh = new Float32Array(LD * (FAIXA + 4))
  const gv = new Float32Array(LD * (FAIXA + 4))
  for (let y0 = 0; y0 < H; y0 += FAIXA) {
    const y1 = Math.min(H, y0 + FAIXA)
    // diferenças de cor (G estimado − cor do sensel) nas duas direções, nos sensels R e B, com 2 de margem
    for (let y = y0 - 2; y < y1 + 2; y++) {
      const fase = (y & 1) * 2
      const linha = (y - y0 + 2) * LD + 2
      const base = (y + BORDA) * S + BORDA
      for (let x = -2; x < W + 2; x++) {
        if (padrao[fase + (x & 1)] === 1) continue
        const i = base + x
        const C = m[i]
        const lapH = 2 * C - m[i - 2] - m[i + 2]
        const lapV = 2 * C - m[i - 2 * S] - m[i + 2 * S]
        const eh = 0.5 * (m[i - 1] + m[i + 1]) + 0.25 * lapH
        const ev = 0.5 * (m[i - S] + m[i + S]) + 0.25 * lapV
        dh[linha + x] = eh - C
        dv[linha + x] = ev - C
        // gradiente de Hamilton-Adams na direção (vizinhos verdes e Laplaciano da própria cor)
        gh[linha + x] = Math.abs(m[i - 1] - m[i + 1]) + Math.abs(lapH)
        gv[linha + x] = Math.abs(m[i - S] - m[i + S]) + Math.abs(lapV)
      }
    }
    for (let y = y0; y < y1; y++) {
      const fase = (y & 1) * 2
      const linha = (y - y0 + 2) * LD + 2
      const base = (y + BORDA) * S + BORDA
      let o = y * W * 3
      for (let x = 0; x < W; x++, o += 3) {
        const cor = padrao[fase + (x & 1)]
        const C = m[base + x]
        saida[o + cor] = C
        if (cor === 1) continue
        const j = linha + x
        const h = dh[j]
        const v = dv[j]
        // homogeneidade: quanto a diferença de cor de cada direção varia para os quatro vizinhos da mesma cor
        const custoH = Math.abs(h - dh[j - 2]) + Math.abs(h - dh[j + 2]) + Math.abs(h - dh[j - 2 * LD]) + Math.abs(h - dh[j + 2 * LD]) + gh[j]
        const custoV = Math.abs(v - dv[j - 2]) + Math.abs(v - dv[j + 2]) + Math.abs(v - dv[j - 2 * LD]) + Math.abs(v - dv[j + 2 * LD]) + gv[j]
        const ph = 1 / ((PISO_DIRECAO + custoH) * (PISO_DIRECAO + custoH))
        const pv = 1 / ((PISO_DIRECAO + custoV) * (PISO_DIRECAO + custoV))
        saida[o + 1] = C + (ph * h + pv * v) / (ph + pv)
      }
    }
  }
  // 2. vermelho e azul pela diferença para o verde já pronto. Vizinho fora da imagem: o do outro lado (mesma cor).
  const W3 = W * 3
  for (let y = 0; y < H; y++) {
    const fase = (y & 1) * 2
    const outraFase = ((y + 1) & 1) * 2
    const cima = y > 0 ? -W3 : W3
    const baixo = y < H - 1 ? W3 : -W3
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3
      const cor = padrao[fase + (x & 1)]
      const esq = x > 0 ? -3 : 3
      const dir = x < W - 1 ? 3 : -3
      const G = saida[o + 1]
      if (cor === 1) {
        const naLinha = padrao[fase + ((x + 1) & 1)]
        const naColuna = padrao[outraFase + (x & 1)]
        saida[o + naLinha] = G + 0.5 * (saida[o + esq + naLinha] - saida[o + esq + 1] + saida[o + dir + naLinha] - saida[o + dir + 1])
        saida[o + naColuna] = G + 0.5 * (saida[o + cima + naColuna] - saida[o + cima + 1] + saida[o + baixo + naColuna] - saida[o + baixo + 1])
      } else {
        const z = 2 - cor
        const a = saida[o + cima + esq + z] - saida[o + cima + esq + 1]
        const b = saida[o + baixo + dir + z] - saida[o + baixo + dir + 1]
        const c = saida[o + cima + dir + z] - saida[o + cima + dir + 1]
        const d = saida[o + baixo + esq + z] - saida[o + baixo + esq + 1]
        const c1 = PISO_DIRECAO + Math.abs(a - b)
        const c2 = PISO_DIRECAO + Math.abs(c - d)
        const p1 = 1 / (c1 * c1)
        const p2 = 1 / (c2 * c2)
        saida[o + z] = G + (0.5 * (p1 * (a + b) + p2 * (c + d))) / (p1 + p2)
      }
    }
  }
}

// X-Trans, caminho básico: verde pela média dos verdes vizinhos (peso 1/distância²) na janela 5×5; vermelho e azul
// pela média, na mesma janela, da diferença para o verde. Sem direção: serve para ver e tratar, não é o melhor que o
// sensor dá (isso é o Markesteijn do LibRaw, na exportação).
function demosaicoBasico(mos, saida) {
  const { dados: m, W, H, passo: S, padrao, lado } = mos
  const vizinhos = []
  for (let py = 0; py < lado; py++) {
    for (let px = 0; px < lado; px++) {
      const porCor = [[], [], []]
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!dx && !dy) continue
          const c = padrao[((py + dy + lado * 2) % lado) * lado + ((px + dx + lado * 2) % lado)]
          porCor[c].push(dx, dy, 1 / (dx * dx + dy * dy))
        }
      }
      vizinhos.push(porCor)
    }
  }
  // dentro da imagem? (a borda espelhada do mosaico não guarda a fase do X-Trans, então vizinho de fora não entra)
  const dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < H
  for (let passada = 0; passada < 2; passada++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const fase = (y % lado) * lado + (x % lado)
        const cor = padrao[fase]
        const o = (y * W + x) * 3
        const i = (y + BORDA) * S + BORDA + x
        if (passada === 0) {
          saida[o + cor] = m[i]
          if (cor === 1) continue
          const lista = vizinhos[fase][1]
          let soma = 0
          let peso = 0
          for (let k = 0; k < lista.length; k += 3) {
            if (!dentro(x + lista[k], y + lista[k + 1])) continue
            soma += lista[k + 2] * m[i + lista[k] + lista[k + 1] * S]
            peso += lista[k + 2]
          }
          saida[o + 1] = peso > 0 ? soma / peso : m[i]
        } else {
          for (let c = 0; c < 3; c += 2) {
            if (c === cor) continue
            const lista = vizinhos[fase][c]
            let soma = 0
            let peso = 0
            for (let k = 0; k < lista.length; k += 3) {
              const xx = x + lista[k]
              const yy = y + lista[k + 1]
              if (!dentro(xx, yy)) continue
              soma += lista[k + 2] * (m[i + lista[k] + lista[k + 1] * S] - saida[(yy * W + xx) * 3 + 1])
              peso += lista[k + 2]
            }
            saida[o + c] = saida[o + 1] + (peso > 0 ? soma / peso : 0)
          }
        }
      }
    }
  }
}

// Prévia: cada bloco do filtro de cor vira um pixel (média dos sensels de cada cor). No Bayer o bloco é `fator`×
// `fator`; no X-Trans a janela tem pelo menos 3×3, o menor quadrado que sempre tem as três cores.
function agrupar(mos, fator) {
  const { dados: m, W, H, passo: S, padrao, lado } = mos
  const janela = lado === 2 ? fator : Math.max(fator, 3)
  const largura = Math.floor(W / fator)
  const altura = Math.floor(H / fator)
  const saida = new Float32Array(largura * altura * 3)
  const soma = [0, 0, 0]
  const conta = [0, 0, 0]
  for (let oy = 0; oy < altura; oy++) {
    for (let ox = 0; ox < largura; ox++) {
      soma[0] = soma[1] = soma[2] = 0
      conta[0] = conta[1] = conta[2] = 0
      const y1 = Math.min(H, oy * fator + janela)
      const x1 = Math.min(W, ox * fator + janela)
      for (let y = oy * fator; y < y1; y++) {
        const fase = (y % lado) * lado
        const linha = (y + BORDA) * S + BORDA
        for (let x = ox * fator; x < x1; x++) {
          const c = padrao[fase + (x % lado)]
          soma[c] += m[linha + x]
          conta[c]++
        }
      }
      const o = (oy * largura + ox) * 3
      for (let c = 0; c < 3; c++) saida[o + c] = conta[c] ? soma[c] / conta[c] : 0
    }
  }
  return { largura, altura, dados: saida }
}

// ─────────── ruído ───────────

// O modelo de ruído do arquivo trazido para a luminância da imagem de trabalho: var(Y) ≈ a·Y + b, para um pixel
// neutro. Cada sensel tem var = α·x + β no sinal normalizado; a luminância é Σ q_c·x_c com q_c = ganho_c · (peso de
// Y na coluna c da matriz), e para o neutro x_c = Y / ganho_c. Logo a = α·Σ q_c²/(ganho_c·n_c) e b = β·Σ q_c²/n_c,
// com n_c o número de sensels do canal c que viram um pixel (1 sem redução). Ignora a correlação que o demosaico cria
// entre vizinhos: é um teto por pixel.
function ruidoDaBase(negativo, latitude, cor, amostras) {
  let alfa = null
  let beta = null
  let origem = null
  if (latitude?.ruido && latitude.branco && latitude.preto) {
    const faixa = latitude.branco[1] - latitude.preto[1]
    alfa = latitude.ruido.ganho / faixa
    beta = (latitude.ruido.leitura / faixa) ** 2
    origem = latitude.ruido.origem ?? 'latitude'
  } else if (Array.isArray(negativo.perfilRuido) && negativo.perfilRuido.length) {
    const p = negativo.perfilRuido[Math.min(1, negativo.perfilRuido.length - 1)]
    alfa = p.escala
    beta = p.deslocamento
    origem = 'perfil'
  }
  if (alfa == null || beta == null || !(alfa >= 0) || !(beta >= 0)) return null
  const Y = luminancia('rec2020')
  const M = cor.paraRec2020
  let a = 0
  let b = 0
  for (let c = 0; c < 3; c++) {
    const q = cor.ganhos[c] * (Y[0] * M[c] + Y[1] * M[3 + c] + Y[2] * M[6 + c])
    a += (q * q) / (cor.ganhos[c] * amostras[c])
    b += (q * q) / amostras[c]
  }
  return { a: alfa * a, b: beta * b, origem }
}

// ─────────── as duas portas de entrada ───────────

/**
 * Negativo → Base. `demosaico`: 'rapido' (Malvar-He-Cutler) ou 'qualidade' (direcional). `reduzir`: 1, 2 ou 4 (2 e 4
 * agrupam o bloco do filtro de cor: é a prévia). `latitude`: a medida do arquivo (src/raw/latitude.js), quando houver —
 * dela saem o preto e a saturação efetivos e o modelo de ruído.
 *
 * Base = { imagem: { largura, altura, dados: Float32Array }, latitude, branco: { kelvin, tinta, neutroCamera },
 *          origem: 'raw', exposicaoBase, orientacao, ruido: { a, b, origem } | null,
 *          demosaico: 'rapido' | 'qualidade' | 'basica' | 'agrupado', reduzir,
 *          cortado: { um, dois, tres } (fração das células), folgaAltas (EV recuperados acima da saturação) }
 */
export function prepararBase(negativo, { demosaico = 'rapido', reduzir = 1, latitude = null } = {}) {
  if (![1, 2, 4].includes(reduzir)) throw new Error('reduzir precisa ser 1, 2 ou 4')
  if (demosaico !== 'rapido' && demosaico !== 'qualidade') throw new Error("demosaico precisa ser 'rapido' ou 'qualidade'")
  const cor = corDaCamera(negativo)
  const mos = normalizar(negativo, latitude, cor.ganhos)
  const altas = mos.cortados ? reconstruirAltas(mos, cor.ganhos) : { celulas: [0, 0, 0], folga: 0 }
  mos.cortado = null
  let imagem
  let feito
  let amostras = [1, 1, 1]
  if (reduzir > 1) {
    imagem = agrupar(mos, reduzir)
    feito = 'agrupado'
    // sensels de cada cor por pixel: no Bayer, um quarto, metade e um quarto do bloco; no X-Trans, 2, 5 e 2 em cada 9
    const janela = mos.lado === 2 ? reduzir * reduzir : Math.max(reduzir, 3) ** 2
    amostras = mos.lado === 2 ? [janela / 4, janela / 2, janela / 4] : [(janela * 2) / 9, (janela * 5) / 9, (janela * 2) / 9]
  } else {
    espelharBorda(mos)
    imagem = { largura: mos.W, altura: mos.H, dados: new Float32Array(mos.W * mos.H * 3) }
    if (mos.tipo === 'xtrans') {
      demosaicoBasico(mos, imagem.dados)
      feito = 'basica'
    } else if (demosaico === 'qualidade') {
      demosaicoQualidade(mos, imagem.dados)
      feito = 'qualidade'
    } else {
      demosaicoRapido(mos, imagem.dados)
      feito = 'rapido'
    }
  }
  // câmera (com o branco aplicado) → Rec.2020
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = cor.paraRec2020
  const d = imagem.dados
  for (let i = 0; i < d.length; i += 3) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    d[i] = m0 * r + m1 * g + m2 * b
    d[i + 1] = m3 * r + m4 * g + m5 * b
    d[i + 2] = m6 * r + m7 * g + m8 * b
  }
  return {
    imagem,
    latitude,
    branco: cor.branco,
    origem: 'raw',
    exposicaoBase: negativo.exposicaoBase ?? 0,
    orientacao: negativo.exif?.orientacao ?? 1,
    ruido: ruidoDaBase(negativo, latitude, cor, amostras),
    demosaico: feito,
    reduzir,
    cortado: { um: altas.celulas[0], dois: altas.celulas[1], tres: altas.celulas[2] },
    folgaAltas: altas.folga,
  }
}

let brancoD65 = null

/**
 * Foto que já chega pronta (JPEG, PNG, TIFF) → Base. Entra pela inversa exata da tela neutra (contraste 0, margens
 * padrão) do espaço em que a foto está: com os ajustes neutros, `revelar` devolve a mesma imagem (erro < 1/255), e os
 * controles se comportam como no RAW. `dados`: Uint8Array, Uint8ClampedArray ou Uint16Array; `canais` 3 ou 4 (o alfa é
 * ignorado); `espaco`: 'srgb' | 'p3' | 'adobe' | 'rec2020' | 'prophoto'; `orientacao`: a do EXIF (1 a 8).
 */
export function baseDeImagem({ largura, altura, dados, canais = 4, espaco = 'srgb', orientacao = 1 }) {
  if (canais !== 3 && canais !== 4) throw new Error('canais precisa ser 3 ou 4')
  if (dados.length < largura * altura * canais) throw new Error('dados menores que largura × altura × canais')
  const tela = criarTela(espaco, { altas: MARGENS.altas.padrao, sombras: MARGENS.sombras.padrao })
  const n = largura * altura
  const saida = new Float32Array(n * 3)
  const escala = dados instanceof Uint16Array ? 1 / 65535 : 1 / 255
  const cor = [0, 0, 0]
  for (let p = 0, i = 0, o = 0; p < n; p++, i += canais, o += 3) {
    tela.inverter(dados[i] * escala, dados[i + 1] * escala, dados[i + 2] * escala, cor)
    saida[o] = cor[0]
    saida[o + 1] = cor[1]
    saida[o + 2] = cor[2]
  }
  brancoD65 ??= temperaturaDeXy(D65)
  return {
    imagem: { largura, altura, dados: saida },
    latitude: null,
    branco: { kelvin: brancoD65.kelvin, tinta: brancoD65.tinta },
    origem: 'imagem',
    exposicaoBase: 0,
    orientacao,
    ruido: null,
    demosaico: null,
    reduzir: 1,
    cortado: { um: 0, dois: 0, tres: 0 },
    folgaAltas: 0,
    espaco,
  }
}
