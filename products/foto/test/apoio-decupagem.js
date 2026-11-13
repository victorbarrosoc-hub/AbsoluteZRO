// Apoio dos testes da decupagem: imagens sintéticas com semente (nada de arquivo binário), os borrões e defeitos
// aplicados de propósito, e malhas de rosto fabricadas. Sem DOM e sem Node: só contas.
//
// A textura de base é o modelo de "folhas mortas" (Matheron, 1968; Lee, Mumford e Huang, IJCV 41, 2001): discos
// opacos de raio com distribuição r⁻³ empilhados. É o modelo sintético mais simples que reproduz a estatística de
// uma foto (espectro 1/f com bordas nítidas em todas as escalas), que é o que as medidas de nitidez enxergam.

/** Gerador determinístico (mulberry32): mesma semente, mesmos números. */
export function sorteio(semente) {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Normal padrão (Box-Muller) a partir de um sorteio uniforme. */
export function normal(rnd) {
  let u = 0
  while (u === 0) u = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())
}

const novaImagem = (largura, altura) => ({ largura, altura, dados: new Float32Array(largura * altura * 3) })

/**
 * Folhas mortas: imagem RGB em ponto flutuante (0..255), desenhada com o dobro de amostras e reduzida por média (a
 * abertura do pixel). `raioMin` e `raioMax` em px da imagem final.
 */
export function folhas(semente, largura = 768, altura = 512, { raioMin = 1.5, raioMax = 160, cobertura = 6, contraste = 1 } = {}) {
  const rnd = sorteio(semente)
  const S = 2
  const W = largura * S
  const H = altura * S
  const tela = new Float32Array(W * H * 3)
  const feito = new Uint8Array(W * H)
  let faltam = W * H
  // de frente para trás: cada disco só pinta o que ainda está vazio (equivale a empilhar de trás para a frente)
  const a = 1 / (raioMin * raioMin)
  const b = 1 / (raioMax * raioMax)
  const limite = cobertura * 40000
  for (let k = 0; k < limite && faltam > 0; k++) {
    const r = S / Math.sqrt(a - rnd() * (a - b)) // densidade ∝ r⁻³
    const cx = rnd() * (W + 2 * r) - r
    const cy = rnd() * (H + 2 * r) - r
    const luz = 20 + 215 * rnd() ** 1.4
    const cor = [luz * (0.75 + 0.5 * rnd()), luz * (0.75 + 0.5 * rnd()), luz * (0.75 + 0.5 * rnd())]
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(H - 1, Math.ceil(cy + r))
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy
      const meia = Math.sqrt(Math.max(0, r * r - dy * dy))
      const x0 = Math.max(0, Math.ceil(cx - meia))
      const x1 = Math.min(W - 1, Math.floor(cx + meia))
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x
        if (feito[i]) continue
        feito[i] = 1
        faltam--
        tela[i * 3] = cor[0]
        tela[i * 3 + 1] = cor[1]
        tela[i * 3 + 2] = cor[2]
      }
    }
  }
  const img = novaImagem(largura, altura)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0
        for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) s += feito[(y * S + j) * W + x * S + i] ? tela[((y * S + j) * W + x * S + i) * 3 + c] : 110
        const v = s / (S * S)
        img.dados[(y * largura + x) * 3 + c] = Math.min(255, Math.max(0, 118 + (v - 118) * contraste))
      }
    }
  }
  return img
}

/** Convolução separável com um núcleo 1D (borda repetida). */
function separavel(img, nucleo) {
  const { largura: W, altura: H, dados } = img
  const meio = (nucleo.length - 1) >> 1
  const tmp = new Float32Array(dados.length)
  const saida = novaImagem(W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0
        for (let k = 0; k < nucleo.length; k++) {
          const xx = Math.min(W - 1, Math.max(0, x + k - meio))
          s += nucleo[k] * dados[(y * W + xx) * 3 + c]
        }
        tmp[(y * W + x) * 3 + c] = s
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0
        for (let k = 0; k < nucleo.length; k++) {
          const yy = Math.min(H - 1, Math.max(0, y + k - meio))
          s += nucleo[k] * tmp[(yy * W + x) * 3 + c]
        }
        saida.dados[(y * W + x) * 3 + c] = s
      }
    }
  }
  return saida
}

/** Desfoque gaussiano de desvio `sigma` px. */
export function gauss(img, sigma) {
  const raio = Math.ceil(sigma * 3.5)
  const nucleo = new Float64Array(2 * raio + 1)
  let soma = 0
  for (let i = -raio; i <= raio; i++) soma += nucleo[i + raio] = Math.exp(-(i * i) / (2 * sigma * sigma))
  for (let i = 0; i < nucleo.length; i++) nucleo[i] /= soma
  return separavel(img, nucleo)
}

// Convolução com poucos pontos (lista de { dx, dy, peso }), borda repetida.
function esparsa(img, pontos) {
  const { largura: W, altura: H, dados } = img
  const saida = novaImagem(W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (const p of pontos) {
        const xx = Math.min(W - 1, Math.max(0, x + p.dx))
        const yy = Math.min(H - 1, Math.max(0, y + p.dy))
        const i = (yy * W + xx) * 3
        r += p.peso * dados[i]
        g += p.peso * dados[i + 1]
        b += p.peso * dados[i + 2]
      }
      const o = (y * W + x) * 3
      saida.dados[o] = r
      saida.dados[o + 1] = g
      saida.dados[o + 2] = b
    }
  }
  return saida
}

/** Desfoque de lente: disco (pillbox) de raio `raio` px. */
export function disco(img, raio) {
  const pontos = []
  const R = Math.floor(raio)
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (Math.hypot(dx, dy) <= raio) pontos.push({ dx, dy, peso: 1 })
  for (const p of pontos) p.peso = 1 / pontos.length
  return esparsa(img, pontos)
}

/** Tremido: movimento linear de `comprimento` px na direção `graus` (0 = horizontal; cresce no sentido horário da tela). */
export function movimento(img, comprimento, graus) {
  const mapa = new Map()
  const passos = comprimento * 4
  const t = (graus * Math.PI) / 180
  for (let k = 0; k < passos; k++) {
    const d = -(comprimento - 1) / 2 + ((comprimento - 1) * k) / (passos - 1)
    const dx = Math.round(d * Math.cos(t))
    const dy = Math.round(d * Math.sin(t))
    const chave = `${dx},${dy}`
    mapa.set(chave, (mapa.get(chave) || 0) + 1 / passos)
  }
  return esparsa(
    img,
    [...mapa].map(([chave, peso]) => {
      const [dx, dy] = chave.split(',').map(Number)
      return { dx, dy, peso }
    }),
  )
}

/** Mais ou menos exposição, em EV, feita em luz linear (curva de potência 2,2) e cortada em 0..255. */
export function exposicao(img, ev) {
  const k = 2 ** ev
  const saida = novaImagem(img.largura, img.altura)
  for (let i = 0; i < img.dados.length; i++) {
    const lin = (Math.max(0, img.dados[i]) / 255) ** 2.2 * k
    saida.dados[i] = Math.min(1, lin) ** (1 / 2.2) * 255
  }
  return saida
}

/** Soma ruído gaussiano de desvio `sigma` (níveis de 8 bits), independente por canal. */
export function ruido(img, sigma, semente = 1) {
  const rnd = sorteio(semente)
  const saida = novaImagem(img.largura, img.altura)
  for (let i = 0; i < img.dados.length; i++) saida.dados[i] = img.dados[i] + sigma * normal(rnd)
  return saida
}

/** Recorte (x, y, largura, altura) em px. */
export function recortar(img, x, y, largura, altura) {
  const saida = novaImagem(largura, altura)
  for (let j = 0; j < altura; j++) {
    const de = ((y + j) * img.largura + x) * 3
    saida.dados.set(img.dados.subarray(de, de + largura * 3), j * largura * 3)
  }
  return saida
}

/** Redução por média de área para `largura` × `altura` (fatores não inteiros: pesos pela área coberta). */
export function redimensionar(img, largura, altura) {
  const saida = novaImagem(largura, altura)
  const fx = img.largura / largura
  const fy = img.altura / altura
  for (let y = 0; y < altura; y++) {
    const ya = y * fy
    const yb = (y + 1) * fy
    for (let x = 0; x < largura; x++) {
      const xa = x * fx
      const xb = (x + 1) * fx
      let r = 0
      let g = 0
      let b = 0
      let area = 0
      for (let j = Math.floor(ya); j < Math.min(img.altura, Math.ceil(yb)); j++) {
        const py = Math.min(yb, j + 1) - Math.max(ya, j)
        for (let i = Math.floor(xa); i < Math.min(img.largura, Math.ceil(xb)); i++) {
          const p = py * (Math.min(xb, i + 1) - Math.max(xa, i))
          const o = (j * img.largura + i) * 3
          r += p * img.dados[o]
          g += p * img.dados[o + 1]
          b += p * img.dados[o + 2]
          area += p
        }
      }
      const o = (y * largura + x) * 3
      saida.dados[o] = r / area
      saida.dados[o + 1] = g / area
      saida.dados[o + 2] = b / area
    }
  }
  return saida
}

/**
 * Quadro de uma rajada: a câmera anda (fx, fy) da largura e da altura e aproxima `zoom`; o resultado volta ao
 * tamanho pedido. Com (0, 0, 1) é o quadro de referência (recorte central de 90%).
 */
export function quadro(img, fx = 0, fy = 0, zoom = 1, largura = Math.round(img.largura * 0.9), altura = Math.round(img.altura * 0.9)) {
  const cw = Math.round((img.largura * 0.9) / zoom)
  const ch = Math.round((img.altura * 0.9) / zoom)
  const x0 = Math.round((img.largura - cw) / 2 + fx * img.largura)
  const y0 = Math.round((img.altura - ch) / 2 + fy * img.altura)
  const corte = recortar(img, x0, y0, cw, ch)
  return cw === largura && ch === altura ? corte : redimensionar(corte, largura, altura)
}

/**
 * Paisagem com horizonte: céu em degradê em cima, chão texturizado embaixo, e a linha que os separa girada `graus`
 * (positivo: desce para a direita). A borda é suavizada pela cobertura do pixel.
 */
export function paisagem(semente, largura = 768, altura = 512, graus = 0) {
  const chao = folhas(semente, largura, altura, { raioMin: 2, raioMax: 40, contraste: 0.45 })
  const img = novaImagem(largura, altura)
  const t = Math.tan((graus * Math.PI) / 180)
  const c = Math.cos((graus * Math.PI) / 180)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const linha = altura * 0.5 + (x - largura / 2) * t
      const dentro = Math.min(1, Math.max(0, (y + 0.5 - linha) * c + 0.5)) // fração do pixel abaixo da linha
      const ceu = [150 + 60 * (y / altura), 185 + 40 * (y / altura), 235]
      for (let k = 0; k < 3; k++) {
        const terra = chao.dados[(y * largura + x) * 3 + k] * 0.6
        img.dados[(y * largura + x) * 3 + k] = ceu[k] * (1 - dentro) + terra * dentro
      }
    }
  }
  return img
}

/** Mistura duas imagens por uma máscara (0..1 por pixel): saída = a·(1 − m) + b·m. */
export function misturar(a, b, mascara) {
  const saida = novaImagem(a.largura, a.altura)
  for (let i = 0; i < a.largura * a.altura; i++) {
    const m = mascara[i]
    for (let c = 0; c < 3; c++) saida.dados[i * 3 + c] = a.dados[i * 3 + c] * (1 - m) + b.dados[i * 3 + c] * m
  }
  return saida
}

/** Máscara retangular com borda suave (rampa de `suave` px). */
export function mascaraDaCaixa(largura, altura, caixa, suave = 8) {
  const m = new Float32Array(largura * altura)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const dx = Math.min(x - caixa.x, caixa.x + caixa.largura - 1 - x)
      const dy = Math.min(y - caixa.y, caixa.y + caixa.altura - 1 - y)
      m[y * largura + x] = Math.min(1, Math.max(0, Math.min(dx, dy) / suave + 0.5))
    }
  }
  return m
}

/** Imagem em ponto flutuante → prévia do contrato: { largura, altura, rgba } em 8 bits, arredondada e cortada. */
export function paraPrevia(img) {
  const n = img.largura * img.altura
  const rgba = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = Math.round(img.dados[i * 3])
    rgba[i * 4 + 1] = Math.round(img.dados[i * 3 + 1])
    rgba[i * 4 + 2] = Math.round(img.dados[i * 3 + 2])
    rgba[i * 4 + 3] = 255
  }
  return { largura: img.largura, altura: img.altura, rgba }
}

/** O caminho de uma foto de verdade: o defeito, depois o ruído do sensor (σ = 1,5) e os 8 bits. */
export function fotografar(img, semente = 7, sigma = 1.5) {
  return paraPrevia(ruido(img, sigma, semente))
}

// ───────────────────────────── rostos fabricados ─────────────────────────────

// Índices da malha de 478 pontos do MediaPipe Face Mesh usados pela decupagem.
export const PONTOS = {
  olhoDireito: [33, 160, 158, 133, 153, 144],
  olhoEsquerdo: [362, 385, 387, 263, 373, 380],
  nariz: 1,
  faceDireita: 234,
  faceEsquerda: 454,
}

/**
 * Malha fabricada de 478 pontos: só os pontos que a decupagem lê recebem posição de verdade (os outros ficam no
 * centro do rosto). `ear` = abertura pedida de cada olho [direito, esquerdo]; `guinada` em graus (positivo: o rosto
 * vira para a esquerda da imagem, encolhendo o olho direito da pessoa, que fica desse lado).
 */
export function malhaDeRosto({ cx = 128, cy = 128, largura = 140, ear = [0.3, 0.3], guinada = 0 } = {}) {
  const pontos = Array.from({ length: 478 }, () => ({ x: cx, y: cy, z: 0 }))
  const g = (guinada * Math.PI) / 180
  // cabeça como um cilindro de raio R: um ponto no ângulo a (0 = frente) aparece em x = cx + R·sen(a − g)
  const R = largura / 2
  const emX = (a) => cx + R * Math.sin(a - g)
  const olho = (indices, centro, abertura) => {
    // cantos a ±0,2 rad do centro do olho; pálpebras em 1/3 e 2/3 da largura
    const x1 = emX(centro - 0.2)
    const x4 = emX(centro + 0.2)
    const larg = Math.abs(x4 - x1)
    const meia = (abertura * larg) / 2
    const y = cy - largura * 0.12
    const [p1, p2, p3, p4, p5, p6] = indices
    pontos[p1] = { x: x1, y, z: 0 }
    pontos[p4] = { x: x4, y, z: 0 }
    pontos[p2] = { x: x1 + (x4 - x1) / 3, y: y - meia, z: 0 }
    pontos[p3] = { x: x1 + (2 * (x4 - x1)) / 3, y: y - meia, z: 0 }
    pontos[p5] = { x: x1 + (2 * (x4 - x1)) / 3, y: y + meia, z: 0 }
    pontos[p6] = { x: x1 + (x4 - x1) / 3, y: y + meia, z: 0 }
  }
  // o olho direito da pessoa fica à esquerda da imagem (ângulo negativo)
  olho(PONTOS.olhoDireito, -0.42, ear[0])
  olho(PONTOS.olhoEsquerdo, 0.42, ear[1])
  pontos[PONTOS.nariz] = { x: emX(0), y: cy + largura * 0.08, z: 0 }
  pontos[PONTOS.faceDireita] = { x: cx - R, y: cy, z: 0 }
  pontos[PONTOS.faceEsquerda] = { x: cx + R, y: cy, z: 0 }
  return pontos
}

/** Blendshapes do MediaPipe com os nomes que a decupagem lê; o resto fica de fora. */
export function expressao({ piscada = 0.05, aperto = 0.1, sorriso = 0.1 } = {}) {
  const par = (v) => (Array.isArray(v) ? v : [v, v])
  const [pd, pe] = par(piscada)
  const [ad, ae] = par(aperto)
  const [sd, se] = par(sorriso)
  return { eyeBlinkRight: pd, eyeBlinkLeft: pe, eyeSquintRight: ad, eyeSquintLeft: ae, mouthSmileRight: sd, mouthSmileLeft: se }
}

// ───────────────────────────── casos de referência ─────────────────────────────

/**
 * Os casos cujos números estão travados em test/decupagem-medidas.test.js (conferidos com numpy: FFT, percentis e
 * histogramas de lá, sobre estas mesmas imagens). Mudou algo aqui, os números de referência precisam ser refeitos.
 * Devolve [[nome, previa]].
 */
export function casosDeReferencia() {
  const base = folhas(11, 768, 512, { raioMin: 2.5 })
  return [
    ['nitida', fotografar(base)],
    ['gauss1', fotografar(gauss(base, 1))],
    ['gauss2', fotografar(gauss(base, 2))],
    ['gauss4', fotografar(gauss(base, 4))],
    ['disco4', fotografar(disco(base, 4))],
    ['mov9a0', fotografar(movimento(base, 9, 0))],
    ['mov17a45', fotografar(movimento(base, 17, 45))],
    ['mov31a120', fotografar(movimento(base, 31, 120))],
    ['mais2ev', fotografar(exposicao(base, 2))],
    ['menos3ev', fotografar(exposicao(base, -3))],
    ['ruido10', fotografar(base, 7, 10)],
    ['horizonte3', fotografar(paisagem(5, 768, 512, 3))],
    ['horizonteMenos5', fotografar(paisagem(5, 768, 512, -5))],
  ]
}
