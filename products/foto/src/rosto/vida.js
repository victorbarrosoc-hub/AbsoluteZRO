// Rosto em evento · prova de vida da selfie. Puro (sem DOM, sem modelo): o celular usa para saber quando parar e o
// servidor confere de novo, com o desafio que ele mesmo sorteou e assinou (api/_evento.js). Estudo em
// docs/estudo/rosto-em-evento.md (C.11); limiares medidos em test/rosto.test.js e test/evento-tela.test.js.
//
// Três camadas, e nenhuma é antifraude certificada (PAD ISO 30107-3 está fora de alcance no navegador):
//   1. desafio: o servidor sorteia a ordem de "vire para a sua esquerda", "para a sua direita" e "chegue mais perto",
//      com prazo curto. Os 5 pontos do detector, quadro a quadro, dizem se a ordem foi cumprida, sem salto e sem
//      lacuna entre os quadros.
//   2. planaridade: rosto de verdade tem profundidade. Quando ele gira, o nariz sai do plano dos olhos e da boca. A
//      homografia que leva os olhos e os cantos da boca do quadro de frente ao quadro girado diz onde o nariz estaria
//      se o rosto fosse plano (foto impressa, tela); a distância até o nariz visto, sobre a distância entre os olhos, é
//      a paralaxe. Na geometria, plano dá 0 e cabeça girando dá perto da guinada. Com o detector de verdade o plano não
//      dá 0: o YuNet aprendeu rostos 3D e entorta os pontos de um rosto chato inclinado (medimos até 0,21 de paralaxe e
//      0,17 de guinada num plano girado 50°). Por isso quem mais separa é a guinada exigida (0,18): um rosto chato não
//      leva o nariz tão longe. A paralaxe pega o resto (nariz no plano dos olhos e da boca).
//   3. sinais de tela, só de apoio (decidem apenas na faixa de dúvida da paralaxe): moiré, pico isolado na alta
//      frequência de um recorte da bochecha; cintilação, o brilho desse recorte oscilando de um quadro ao outro. Os
//      limiares vêm de imagens simuladas, não de telas de verdade: calibrar com telas antes de dar mais peso a eles.
//
// Barra: foto impressa, foto ou vídeo parado numa tela, a mesma foto virada ou inclinada para imitar o giro, troca de
// foto com lacuna ou salto, envio de arquivo (não existe). Não barra: vídeo de alguém girando a cabeça exibido numa tela,
// se quem ataca segue a ordem sorteada a tempo (a profundidade está no vídeo); foto "animada" por IA; máscara; câmera
// virtual; cliente modificado que fabrica pontos e vetores (o servidor não vê a câmera). Esses casos ficam com os
// limites por aparelho, rede e evento, com a busca restrita a um evento e com a resposta sem nota.
//
// Quadro: { t (ms desde o desafio), p: 5 pontos [x, y] no quadro analisado (olhos, nariz, cantos da boca), m (moiré),
// l (brilho médio do recorte, 0..255) }. Guinada aqui é na imagem, sem depender da ordem dos olhos: > 0 = nariz para a
// direita da imagem crua (sem espelho) = a pessoa virou para a esquerda dela.

export const PASSOS = Object.freeze(['esquerda', 'direita', 'perto'])

export const VIDA = Object.freeze({
  /** do desafio emitido à prova recebida pelo servidor */
  prazoMs: 30000,
  /** |guinada| mínima para "virou" e máxima para assinar o vetor do giro. Com o YuNet de verdade (test/evento-tela),
   *  a cabeça 3D girando 15° já dá 0,19 e o mesmo rosto num plano girado ou inclinado até 70° não passou de 0,17 (o
   *  detector entorta os pontos de um rosto chato, mas não tanto) */
  giro: 0.18,
  giroMax: 0.45,
  /** |guinada| abaixo disso é "de frente" */
  frente: 0.15,
  /** "chegue mais perto": a distância entre os olhos cresce 25% sobre a do quadro de frente */
  perto: 1.25,
  /** quadros seguidos cumprindo o passo (um quadro só pode ser ruído do detector) */
  seguidos: 2,
  /** girou como cabeça, não como cartão deitado: a razão altura (olhos → boca) / distância entre os olhos, sobre a
   *  do quadro de frente. A cabeça girando 15° a 50° dá 1,05 a 2,1 no detector; cartão quase deitado passa disso */
  forma: [0.8, 2.4],
  /** paralaxe do nariz / distância entre os olhos (a mediana de cada giro, na média dos dois): de `paralaxe` para
   *  cima, rosto com profundidade; abaixo de `duvida`, plano; entre os dois, os sinais de tela decidem */
  paralaxe: 0.15,
  duvida: 0.12,
  /** sinais de tela (só apoio): pico/mediana do espectro alto e oscilação do brilho */
  moire: 40,
  cintilacao: 0.04,
  /** entre dois quadros seguidos: no máximo 1,5 s; o rosto não anda mais que 1 distância entre os olhos nem muda de
   *  tamanho mais que 1,6× (troca de foto, corte de vídeo) */
  lacunaMs: 1500,
  salto: 1,
  escala: 1.6,
  /** no máximo tantos quadros por prova (~12 por segundo em 30 s) */
  quadros: 360,
})

const MENSAGENS = Object.freeze({
  esquerda: 'Vire para a sua esquerda',
  direita: 'Vire para a sua direita',
  perto: 'Chegue mais perto',
})
/** A instrução de cada passo, curta. */
export const INSTRUCOES = MENSAGENS

/** Uma ordem sorteada dos 3 passos. `aleatorio()` em [0, 1). */
export function sortearPassos(aleatorio = Math.random) {
  const p = [...PASSOS]
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  return p
}

// ───────── geometria dos 5 pontos ─────────

const finito = (v) => typeof v === 'number' && Number.isFinite(v)
const ponto = (p) => Array.isArray(p) && p.length === 2 && finito(p[0]) && finito(p[1]) && Math.abs(p[0]) < 1e4 && Math.abs(p[1]) < 1e4

/** Distância entre os olhos. */
export const dioDe = (p) => Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1])
/** O meio dos olhos. */
export const centroDe = (p) => [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2]

/** Guinada na imagem: o nariz em relação ao meio dos olhos, ao longo da linha dos olhos (da esquerda para a direita da
 *  imagem), sobre a distância entre os olhos. */
export function guinadaNaImagem(p) {
  const [a, b] = p[0][0] <= p[1][0] ? [p[0], p[1]] : [p[1], p[0]]
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  return ((p[2][0] - mx) * (b[0] - a[0]) + (p[2][1] - my) * (b[1] - a[1])) / (d * d)
}

/** A homografia (9 números, h33 = 1) que leva os 4 pontos `de` aos 4 pontos `para`; null se degenerada. */
export function homografia(de, para) {
  const A = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = de[i]
    const [u, v] = para[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  // eliminação de Gauss com pivô parcial (8 × 8)
  for (let c = 0; c < 8; c++) {
    let m = c
    for (let l = c + 1; l < 8; l++) if (Math.abs(A[l][c]) > Math.abs(A[m][c])) m = l
    if (Math.abs(A[m][c]) < 1e-9) return null
    ;[A[c], A[m]] = [A[m], A[c]]
    for (let l = 0; l < 8; l++) {
      if (l === c) continue
      const f = A[l][c] / A[c][c]
      for (let k = c; k < 9; k++) A[l][k] -= f * A[c][k]
    }
  }
  const h = A.map((l, i) => l[8] / l[i])
  return [...h, 1]
}

export function aplicar(H, [x, y]) {
  const w = H[6] * x + H[7] * y + H[8]
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]
}

const QUATRO = [0, 1, 3, 4]

/** Paralaxe do nariz entre o quadro de frente `ref` e o quadro `q` (pontos), sobre a distância entre os olhos de `q`. */
export function paralaxe(ref, q) {
  const H = homografia(
    QUATRO.map((i) => ref[i]),
    QUATRO.map((i) => q[i]),
  )
  if (!H) return 0
  const [x, y] = aplicar(H, ref[2])
  return Math.hypot(x - q[2][0], y - q[2][1]) / (dioDe(q) || 1)
}

const mediana = (xs) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ───────── o andamento do desafio ─────────

const altura = (p) => {
  const [cx, cy] = centroDe(p)
  return Math.hypot((p[3][0] + p[4][0]) / 2 - cx, (p[3][1] + p[4][1]) / 2 - cy)
}
/** A forma do rosto (altura / distância entre os olhos) de `q` sobre a de `ref`. */
export const formaDe = (ref, q) => altura(q) / (dioDe(q) || 1) / (altura(ref) / (dioDe(ref) || 1) || 1)
const girouComoCabeca = (q, ref) => {
  const f = formaDe(ref.p, q.p)
  return f >= VIDA.forma[0] && f <= VIDA.forma[1]
}

/** O quadro `q` cumpre o passo, dado o quadro de frente `ref`? */
export function cumpre(passo, q, ref) {
  const g = guinadaNaImagem(q.p)
  if (passo === 'frente') return Math.abs(g) < VIDA.frente
  if (passo === 'esquerda') return g >= VIDA.giro && ref != null && girouComoCabeca(q, ref)
  if (passo === 'direita') return g <= -VIDA.giro && ref != null && girouComoCabeca(q, ref)
  if (passo === 'perto') return Math.abs(g) < VIDA.giro && ref != null && dioDe(q.p) >= VIDA.perto * dioDe(ref.p)
  return false
}

/** O quadro serve para assinar o vetor deste tipo ('frente', 'esquerda' ou 'direita')? (pela pose, antes da qualidade) */
export function serveParaVetor(tipo, p) {
  const g = guinadaNaImagem(p)
  if (tipo === 'frente') return Math.abs(g) < VIDA.frente
  if (tipo === 'esquerda') return g >= VIDA.giro && g <= VIDA.giroMax
  if (tipo === 'direita') return g <= -VIDA.giro && g >= -VIDA.giroMax
  return false
}

/**
 * Onde o desafio está, lido dos quadros desde o começo (o celular a cada quadro; o servidor uma vez).
 * { ref (índice do quadro de frente), feitos (passos cumpridos), atual (o passo que falta, ou null), pronto,
 *   trechos: { passo: [índices do trecho que cumpriu] } }.
 */
export function andamento(passos, quadros) {
  const saida = { ref: -1, feitos: 0, atual: 'frente', pronto: false, trechos: {} }
  let i = quadros.findIndex((q) => cumpre('frente', q, null))
  if (i < 0) return saida
  saida.ref = i
  const ref = quadros[i]
  i++
  for (const passo of passos) {
    saida.atual = passo
    let achou = -1
    for (; i < quadros.length; i++) {
      let n = 0
      while (i + n < quadros.length && cumpre(passo, quadros[i + n], ref)) n++
      if (n >= VIDA.seguidos) {
        achou = i
        saida.trechos[passo] = Array.from({ length: n }, (_, k) => i + k)
        i += n
        break
      }
      i += Math.max(0, n - 1)
    }
    if (achou < 0) return saida
    saida.feitos++
  }
  saida.atual = null
  saida.pronto = true
  return saida
}

// ───────── sinais de tela (apoio) ─────────

const N = 32
const HANN = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)))
const COS = Float64Array.from({ length: N * N }, (_, i) => Math.cos((2 * Math.PI * Math.floor(i / N) * (i % N)) / N))
const SEN = Float64Array.from({ length: N * N }, (_, i) => -Math.sin((2 * Math.PI * Math.floor(i / N) * (i % N)) / N))

/**
 * Moiré e brilho num recorte de 32 × 32 px da bochecha (o meio entre o olho e o canto da boca, do lado mais longe do
 * nariz: pele lisa, sem a borda das narinas), na resolução da câmera, sem reamostrar (o moiré mora na grade de pixels).
 * `imagem`: { largura, altura, dados RGBA }; `pontos`: os 5, em px dessa imagem.
 * m = maior potência / mediana na banda alta (raio 8 a 16 de 16): pele cai suave, tela fotografada faz pico isolado.
 */
export function sinaisDeTela({ largura, altura, dados }, pontos) {
  const bochecha = [
    [(pontos[0][0] + pontos[3][0]) / 2, (pontos[0][1] + pontos[3][1]) / 2],
    [(pontos[1][0] + pontos[4][0]) / 2, (pontos[1][1] + pontos[4][1]) / 2],
  ]
  const longe = (b) => Math.hypot(b[0] - pontos[2][0], b[1] - pontos[2][1])
  const [cx, cy] = longe(bochecha[0]) >= longe(bochecha[1]) ? bochecha[0] : bochecha[1]
  const x0 = Math.round(cx - N / 2)
  const y0 = Math.round(cy - N / 2)
  if (x0 < 0 || y0 < 0 || x0 + N > largura || y0 + N > altura) return null
  const L = new Float64Array(N * N)
  let soma = 0
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = ((y0 + y) * largura + x0 + x) * 4
      const v = 0.2126 * dados[i] + 0.7152 * dados[i + 1] + 0.0722 * dados[i + 2]
      L[y * N + x] = v
      soma += v
    }
  const media = soma / (N * N)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) L[y * N + x] = (L[y * N + x] - media) * HANN[x] * HANN[y]
  // DFT separável: linhas, depois colunas (32³ × 2 operações)
  const re = new Float64Array(N * N)
  const im = new Float64Array(N * N)
  for (let y = 0; y < N; y++)
    for (let u = 0; u < N; u++) {
      let a = 0
      let b = 0
      for (let x = 0; x < N; x++) {
        a += L[y * N + x] * COS[u * N + x]
        b += L[y * N + x] * SEN[u * N + x]
      }
      re[y * N + u] = a
      im[y * N + u] = b
    }
  const banda = []
  for (let v = 0; v < N; v++)
    for (let u = 0; u < N; u++) {
      const fu = u <= N / 2 ? u : u - N
      const fv = v <= N / 2 ? v : v - N
      const r = Math.hypot(fu, fv)
      if (r < 8 || r > 16 || fv < 0 || (fv === 0 && fu < 0)) continue
      let a = 0
      let b = 0
      for (let y = 0; y < N; y++) {
        const c = COS[v * N + y]
        const s = SEN[v * N + y]
        const pr = re[y * N + u]
        const pi = im[y * N + u]
        a += pr * c - pi * s
        b += pr * s + pi * c
      }
      banda.push(a * a + b * b)
    }
  const med = mediana(banda)
  return { m: med > 1e-9 ? Math.round((Math.max(...banda) / med) * 10) / 10 : 0, l: Math.round(media * 10) / 10 }
}

/** Oscilação do brilho entre quadros: mediana de |l(i) − média dos vizinhos| sobre o brilho médio. */
export function cintilacao(ls) {
  if (ls.length < 5) return 0
  const d = []
  for (let i = 1; i < ls.length - 1; i++) d.push(Math.abs(ls[i] - (ls[i - 1] + ls[i + 1]) / 2))
  const media = ls.reduce((s, x) => s + x, 0) / ls.length
  return media > 1 ? mediana(d) / media : 0
}

// ───────── conferir ─────────

/** Os quadros vieram bem-formados? (o servidor recebe do celular) */
export function quadrosValidos(quadros) {
  if (!Array.isArray(quadros) || quadros.length < 3 || quadros.length > VIDA.quadros) return false
  let antes = -1
  for (const q of quadros) {
    if (!q || typeof q !== 'object' || !finito(q.t) || q.t < antes || q.t < 0) return false
    if (!Array.isArray(q.p) || q.p.length !== 5 || !q.p.every(ponto)) return false
    if (q.m != null && !(finito(q.m) && q.m >= 0)) return false
    if (q.l != null && !(finito(q.l) && q.l >= 0 && q.l <= 255)) return false
    antes = q.t
  }
  return true
}

/**
 * Confere a prova: { ok, motivo, medidas }. `decorridoMs`: quanto tempo passou, pelo relógio de quem confere, desde o
 * desafio (o servidor usa o dele; o celular, o próprio).
 * motivos: 'formato' | 'prazo' | 'passos' | 'lacuna' | 'salto' | 'plano' | 'tela'
 */
export function conferirVida({ passos, quadros, decorridoMs }) {
  if (!Array.isArray(passos) || passos.length !== PASSOS.length || !PASSOS.every((p) => passos.includes(p)) || !quadrosValidos(quadros))
    return { ok: false, motivo: 'formato' }
  const fim = quadros.at(-1).t
  if (decorridoMs > VIDA.prazoMs || fim > VIDA.prazoMs || fim > decorridoMs + 2000) return { ok: false, motivo: 'prazo' }
  const a = andamento(passos, quadros)
  if (!a.pronto) return { ok: false, motivo: 'passos', medidas: { feitos: a.feitos } }
  const ultimo = Math.max(...Object.values(a.trechos).map((t) => t.at(-1)))
  for (let i = a.ref + 1; i <= ultimo; i++) {
    const q0 = quadros[i - 1]
    const q1 = quadros[i]
    if (q1.t - q0.t > VIDA.lacunaMs) return { ok: false, motivo: 'lacuna' }
    const d0 = dioDe(q0.p)
    const d1 = dioDe(q1.p)
    const [c0, c1] = [centroDe(q0.p), centroDe(q1.p)]
    if (Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) > VIDA.salto * Math.max(d0, d1) || Math.max(d0, d1) > VIDA.escala * Math.min(d0, d1))
      return { ok: false, motivo: 'salto' }
  }
  const ref = quadros[a.ref].p
  const porGiro = ['esquerda', 'direita'].map((g) => mediana(a.trechos[g].map((i) => paralaxe(ref, quadros[i].p))))
  const par = (porGiro[0] + porGiro[1]) / 2
  const trecho = quadros.slice(a.ref, ultimo + 1)
  const ms = trecho.map((q) => q.m).filter(finito)
  const moire = ms.length ? mediana(ms) : 0
  const cint = cintilacao(trecho.map((q) => q.l).filter(finito))
  const tela = (moire >= VIDA.moire ? 1 : 0) + (cint >= VIDA.cintilacao ? 1 : 0)
  const medidas = { paralaxe: Math.round(par * 1000) / 1000, moire, cintilacao: Math.round(cint * 1000) / 1000, tela }
  if (par < VIDA.duvida) return { ok: false, motivo: 'plano', medidas }
  if (par < VIDA.paralaxe && tela > 0) return { ok: false, motivo: 'tela', medidas }
  return { ok: true, motivo: null, medidas }
}
