// Uma cabeça SINTÉTICA com profundidade (nenhuma foto de gente), para a prova de vida (src/rosto/vida.js):
//   - os 5 pontos em 3D (olhos, ponta do nariz, cantos da boca) e a projeção com perspectiva de uma câmera de selfie;
//   - o mesmo rosto achatado num plano (foto impressa ou tela), que gira e anda como um corpo rígido;
//   - um renderizador por raio (elipsoide da cabeça + elipsoide do nariz, textura do rosto desenhado de frente
//     projetada no rosto, luz de Lambert), para fabricar o vídeo da câmera falsa do Chromium.
//
// Unidade: a distância entre os olhos (DIO, ~6,3 cm num adulto). Eixos da cabeça: x para a direita da imagem, y para
// baixo, z para a câmera; o pivô do giro é o centro da cabeça. Guinada > 0 = a pessoa vira para a esquerda dela (o nariz
// vai para a direita da imagem crua). As medidas do rosto seguem o desenho de test/evento-tela.test.js (`desenharRosto`):
// olhos em y = −0,195, nariz em 0,29, boca em 0,73 (cantos em ±0,375), oval de 1,25 × 1,625.

export const CABECA = Object.freeze({ rx: 1.25, ry: 1.625, rz: 1.2 })
export const NARIZ = Object.freeze({ y: 0.22, rx: 0.16, ry: 0.28, rz: 0.42 })

const superficie = (x, y) => CABECA.rz * Math.sqrt(Math.max(0, 1 - (x / CABECA.rx) ** 2 - (y / CABECA.ry) ** 2))

/** Os 5 pontos em 3D. `nariz`: quanto a ponta do nariz sai além do rosto (em DIO; ~0,36 num adulto). */
export function pontos3d({ nariz = 0.36 } = {}) {
  const olho = (x) => [x, -0.195, superficie(x, -0.195) - 0.04]
  const boca = (x) => [x, 0.73, superficie(x, 0.73)]
  return [olho(-0.5), olho(0.5), [0, NARIZ.y, superficie(0, NARIZ.y) + nariz], boca(-0.375), boca(0.375)]
}

/** O mesmo rosto achatado: todos os pontos no plano z = 1,2 (a frente do rosto), como numa foto de frente. */
export const achatar = (pts) => pts.map(([x, y]) => [x, y, CABECA.rz])

const girar = ([x, y, z], { guinada = 0, arfagem = 0, rolagem = 0 }) => {
  // guinada (em torno de y), arfagem (em torno de x), rolagem (em torno de z), nesta ordem
  let [a, b, c] = [x * Math.cos(guinada) + z * Math.sin(guinada), y, -x * Math.sin(guinada) + z * Math.cos(guinada)]
  ;[b, c] = [b * Math.cos(arfagem) - c * Math.sin(arfagem), b * Math.sin(arfagem) + c * Math.cos(arfagem)]
  ;[a, b] = [a * Math.cos(rolagem) - b * Math.sin(rolagem), a * Math.sin(rolagem) + b * Math.cos(rolagem)]
  return [a, b, c]
}

/**
 * Projeta pontos 3D numa câmera de selfie. `pose`: { guinada, arfagem, rolagem (rad), x, y, z (deslocamento em DIO) };
 * `camera`: { distancia (do pivô à câmera, em DIO), focal (px), cx, cy }. Devolve [[x, y]] em px.
 */
export function projetar(pts, pose = {}, { distancia = 6.7, focal = 250, cx = 160, cy = 120 } = {}) {
  return pts.map((p) => {
    const [x, y, z] = girar(p, pose)
    const X = x + (pose.x ?? 0)
    const Y = y + (pose.y ?? 0)
    const Z = z + (pose.z ?? 0)
    const k = focal / (distancia - Z)
    return [cx + X * k, cy + Y * k]
  })
}

// ───────── renderizar ─────────

/** Interseção do raio (o, d) com o elipsoide de centro c e raios r: o menor t > 0, ou Infinity. */
function elipsoide(o, d, c, r) {
  const ox = (o[0] - c[0]) / r[0]
  const oy = (o[1] - c[1]) / r[1]
  const oz = (o[2] - c[2]) / r[2]
  const dx = d[0] / r[0]
  const dy = d[1] / r[1]
  const dz = d[2] / r[2]
  const a = dx * dx + dy * dy + dz * dz
  const b = 2 * (ox * dx + oy * dy + oz * dz)
  const cc = ox * ox + oy * oy + oz * oz - 1
  const disc = b * b - 4 * a * cc
  if (disc < 0) return Infinity
  const s = Math.sqrt(disc)
  const t1 = (-b - s) / (2 * a)
  if (t1 > 1e-6) return t1
  const t2 = (-b + s) / (2 * a)
  return t2 > 1e-6 ? t2 : Infinity
}

const inverso = (v, pose) => {
  // desfaz a rotação (ordem inversa, ângulos negativos)
  let [a, b, c] = v
  const { guinada = 0, arfagem = 0, rolagem = 0 } = pose
  ;[a, b] = [a * Math.cos(-rolagem) - b * Math.sin(-rolagem), a * Math.sin(-rolagem) + b * Math.cos(-rolagem)]
  ;[b, c] = [b * Math.cos(-arfagem) - c * Math.sin(-arfagem), b * Math.sin(-arfagem) + c * Math.cos(-arfagem)]
  return [a * Math.cos(-guinada) + c * Math.sin(-guinada), b, -a * Math.sin(-guinada) + c * Math.cos(-guinada)]
}

/**
 * Renderiza um quadro L × A (RGBA). `textura`: { largura, altura, dados, escala (px por DIO), cx, cy (px do centro do
 * rosto) }, o rosto desenhado de frente. `pose` como em `projetar`; `plano`: o rosto achatado num cartão (foto/tela)
 * em vez da cabeça. `fundo(x, y)` → [r, g, b].
 */
export function renderizar({ textura, pose = {}, plano = false, L = 640, A = 480, distancia = 6.7, focal = 500, nariz = 0.36, fundo }) {
  const saida = new Uint8ClampedArray(L * A * 4)
  const cam = [-(pose.x ?? 0), -(pose.y ?? 0), distancia - (pose.z ?? 0)]
  const o = inverso(cam, pose)
  const zNariz = superficie(0, NARIZ.y) + nariz - NARIZ.rz
  const luz = (() => {
    const l = [-0.35, -0.45, 1]
    const n = Math.hypot(...l)
    return l.map((x) => x / n)
  })()
  const amostra = (x, y) => {
    const tx = Math.round(textura.cx + x * textura.escala)
    const ty = Math.round(textura.cy + y * textura.escala)
    if (tx < 0 || ty < 0 || tx >= textura.largura || ty >= textura.altura) return null
    const i = (ty * textura.largura + tx) * 4
    return textura.dados[i + 3] > 8 ? [textura.dados[i], textura.dados[i + 1], textura.dados[i + 2]] : null
  }
  for (let py = 0; py < A; py++) {
    for (let px = 0; px < L; px++) {
      const dCam = [(px + 0.5 - L / 2) / focal, (py + 0.5 - A / 2) / focal, -1]
      const d = inverso(dCam, pose)
      let cor = null
      let brilho = 1
      if (plano) {
        // o cartão: z = rz (a frente do rosto), do tamanho do oval com folga
        const t = (CABECA.rz - o[2]) / d[2]
        if (t > 0) {
          const x = o[0] + t * d[0]
          const y = o[1] + t * d[1]
          if (Math.abs(x) <= 1.6 && Math.abs(y) <= 2.1) cor = amostra(x, y) ?? [232, 228, 222]
        }
      } else {
        const t1 = elipsoide(o, d, [0, 0, 0], [CABECA.rx, CABECA.ry, CABECA.rz])
        const t2 = elipsoide(o, d, [0, NARIZ.y, zNariz], [NARIZ.rx, NARIZ.ry, NARIZ.rz])
        const t = Math.min(t1, t2)
        if (t < Infinity) {
          const x = o[0] + t * d[0]
          const y = o[1] + t * d[1]
          const z = o[2] + t * d[2]
          const [c, r] = t2 < t1 ? [[0, NARIZ.y, zNariz], [NARIZ.rx, NARIZ.ry, NARIZ.rz]] : [[0, 0, 0], [CABECA.rx, CABECA.ry, CABECA.rz]]
          let n = [(x - c[0]) / r[0] ** 2, (y - c[1]) / r[1] ** 2, (z - c[2]) / r[2] ** 2]
          const nn = Math.hypot(...n)
          n = n.map((v) => v / nn)
          // a normal no espaço da câmera (a luz está presa à câmera)
          const nw = girar(n, pose)
          brilho = 0.38 + 0.62 * Math.max(0, nw[0] * luz[0] + nw[1] * luz[1] + nw[2] * luz[2])
          cor = (z > 0 ? amostra(x, y) : null) ?? [43, 29, 20]
        }
      }
      const i = (py * L + px) * 4
      const c = cor ?? fundo?.(px, py) ?? [120, 132, 140]
      saida[i] = c[0] * brilho
      saida[i + 1] = c[1] * brilho
      saida[i + 2] = c[2] * brilho
      saida[i + 3] = 255
    }
  }
  return saida
}

// ───────── a trajetória de quem cumpre um desafio ─────────

/** Gerador com semente (mulberry32) e normal por Box-Muller. */
export function sorteio(semente) {
  let s = semente >>> 0
  const u = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { u, normal: () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u()) }
}

const GRAU = Math.PI / 180

/**
 * As poses, quadro a quadro, de quem segue o desafio: 0,8 s de frente; para cada passo, 0,4 s indo, 0,7 s parado e 0,4 s
 * voltando. `giro` em graus (25: o comum de "vire um pouco"), `perto`: quanto a cabeça chega (em DIO); `escala`
 * encolhe o tempo (o teste de banco não espera 6 s por prova). Devolve [{ t, pose }] a `fps` quadros por segundo.
 */
export function posesDoDesafio(passos, { fps = 10, giro = 25, perto = 1.6, inicio = 300, escala = 1 } = {}) {
  const alvo = { esquerda: { guinada: giro * GRAU }, direita: { guinada: -giro * GRAU }, perto: { z: perto } }
  const trechos = [{ de: {}, para: {}, ms: 800 }]
  for (const p of passos) trechos.push({ de: {}, para: alvo[p], ms: 400 }, { de: alvo[p], para: alvo[p], ms: 700 }, { de: alvo[p], para: {}, ms: 400 })
  const saida = []
  let t0 = inicio
  for (const tr of trechos) {
    const n = Math.max(1, Math.round(((tr.ms * escala) / 1000) * fps))
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 1 : i / (n - 1)
      const mistura = (c) => (tr.de[c] ?? 0) + ((tr.para[c] ?? 0) - (tr.de[c] ?? 0)) * k
      saida.push({ t: Math.round(t0 + (i * 1000) / fps), pose: { guinada: mistura('guinada'), z: mistura('z') } })
    }
    t0 += (n * 1000) / fps
  }
  return saida
}

/**
 * Os quadros (como o celular manda) de quem segue o desafio: os 5 pontos projetados num quadro de 320 × 240, com ruído
 * de `ruido` px, mais um pouco de arfagem e rolagem da mão. `plano`: o mesmo rosto achatado numa foto ou tela.
 */
export function quadrosDoDesafio(passos, { plano = false, nariz = 0.36, ruido = 0.6, semente = 1, distancia = 6.7, ...resto } = {}) {
  const r = sorteio(semente)
  const pts = plano ? achatar(pontos3d({ nariz })) : pontos3d({ nariz })
  return posesDoDesafio(passos, resto).map(({ t, pose }) => {
    const p = projetar(pts, { ...pose, arfagem: r.normal() * 1.5 * GRAU, rolagem: r.normal() * 1.5 * GRAU }, { distancia })
    return { t, p: p.map(([x, y]) => [Math.round((x + r.normal() * ruido) * 10) / 10, Math.round((y + r.normal() * ruido) * 10) / 10]), m: 12, l: 140 }
  })
}
