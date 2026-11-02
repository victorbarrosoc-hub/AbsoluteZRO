// Remover fundo verde (chroma key) no clipe: a cor do fundo vira transparência, com borda suave e sem o reflexo verde
// na pele e no cabelo. Puro (sem DOM): a conta de referência daqui e o shader da placa (FRAG_CHROMA, usado por
// app/chroma.js na prévia e no render) são a mesma conta, e o teste confere uma com a outra.
//
// A distância é medida só na cor (Cb e Cr do BT.709), não no brilho: a sombra no fundo verde continua verde. Abaixo de
// `tolerancia` some; entre ela e `tolerancia + suavidade` fica meio transparente (cabelo, desfoque); acima, inteiro.
// O derramamento (o verde que o fundo joga no assunto) é tirado limitando o canal da cor do fundo ao maior dos outros
// dois, na medida de `derramamento`.
//
// A cor do fundo é medida uma vez, na borda do quadro, quando a pessoa liga, e fica gravada no clipe: a prévia e o
// render usam a mesma, e o resultado não muda de quadro para quadro.

/** Cores de fundo de recorte de mercado: verde chroma (Pantone 354 C) e azul chroma (Pantone 2728 C). */
export const CORES = Object.freeze({ verde: '#00B140', azul: '#0047BB' })

/** Ajustes ao ligar. */
export const PADRAO = Object.freeze({ cor: CORES.verde, tolerancia: 0.12, suavidade: 0.2, derramamento: 0.7 })

/** Limites dos controles (o Inspector usa os mesmos). */
export const LIMITES = Object.freeze({ tolerancia: [0.02, 0.4], suavidade: [0.01, 0.4], derramamento: [0, 1] })

const HEX = /^#[0-9a-f]{6}$/i
const limitar = (v, [a, b], padrao) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Math.round(Number(v) * 1000) / 1000)) : padrao)

/** Ajustes conferidos (cor #RRGGBB e números dentro dos limites); null desliga. */
export function normalizar(aj) {
  if (!aj) return null
  return {
    cor: HEX.test(aj.cor ?? '') ? aj.cor.toUpperCase() : PADRAO.cor,
    tolerancia: limitar(aj.tolerancia, LIMITES.tolerancia, PADRAO.tolerancia),
    suavidade: limitar(aj.suavidade, LIMITES.suavidade, PADRAO.suavidade),
    derramamento: limitar(aj.derramamento, LIMITES.derramamento, PADRAO.derramamento),
  }
}

/** Liga, ajusta (ajustes) ou desliga (null) o recorte nos clipes `ids`. Linha nova; a antiga fica (desfazer). */
export function recortar(linha, ids, ajustes) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  const aj = normalizar(ajustes)
  let mudou = false
  const clipes = linha.clipes.map((c) => {
    if (!alvo.has(c.id) || JSON.stringify(c.chroma || null) === JSON.stringify(aj)) return c
    mudou = true
    const novo = { ...c }
    if (aj) novo.chroma = aj
    else delete novo.chroma
    return novo
  })
  return mudou ? { ...linha, clipes } : linha
}

/** #RRGGBB → [r, g, b] de 0 a 1. */
export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const paraHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()

/** Cb e Cr (BT.709) de uma cor de 0 a 1. */
export function cbcr(r, g, b) {
  return [-0.1146 * r - 0.3854 * g + 0.5 * b, 0.5 * r - 0.4542 * g - 0.0458 * b]
}

/** Canal dominante da cor do fundo: 1 (verde) ou 2 (azul). Vermelho não é cor de recorte. */
export const canalDaChave = ([r, g, b]) => (b > g && b > r ? 2 : 1)

/**
 * A conta de um pixel (r, g, b de 0 a 1) contra a chave: { a (alfa 0–1), r, g, b (sem o derramamento) }.
 * Espelho de FRAG_CHROMA.
 */
export function recortarPixel(r, g, b, aj) {
  const chave = rgb(aj.cor)
  const [kb, kr] = cbcr(...chave)
  const [pb, pr] = cbcr(r, g, b)
  const d = Math.hypot(pb - kb, pr - kr)
  const t = Math.min(1, Math.max(0, (d - aj.tolerancia) / aj.suavidade))
  const a = t * t * (3 - 2 * t)
  const c = [r, g, b]
  const k = canalDaChave(chave)
  const outros = k === 1 ? Math.max(c[0], c[2]) : Math.max(c[0], c[1])
  if (c[k] > outros) c[k] = c[k] - (c[k] - outros) * aj.derramamento
  return { a, r: c[0], g: c[1], b: c[2] }
}

/**
 * A cor do fundo pela borda do quadro: os pixels da moldura (8% de cada lado) que puxam para verde ou azul, pela
 * mediana de cada canal. rgba: Uint8ClampedArray (ImageData.data) de w × h. Sem borda colorida: o verde padrão.
 */
export function corDaBorda(rgba, w, h) {
  const m = Math.max(1, Math.round(Math.min(w, h) * 0.08))
  const cand = { 1: [[], [], []], 2: [[], [], []] }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x >= m && x < w - m && y >= m && y < h - m) continue
      const i = (y * w + x) * 4
      const r = rgba[i]
      const g = rgba[i + 1]
      const b = rgba[i + 2]
      const k = g > r * 1.25 && g > b * 1.1 ? 1 : b > r * 1.25 && b > g * 1.1 ? 2 : 0
      if (k) [r, g, b].forEach((v, c) => cand[k][c].push(v))
    }
  const [lado] = [1, 2].sort((a, b) => cand[b][0].length - cand[a][0].length)
  const n = cand[lado][0].length
  // menos de um terço da moldura colorida: não é fundo de recorte
  if (n < (2 * m * (w + h - 2 * m)) / 3) return PADRAO.cor
  const mediana = (v) => v.sort((a, b) => a - b)[v.length >> 1]
  return paraHex(...cand[lado].map(mediana))
}

/**
 * O shader da placa (WebGL2): u_img (o quadro), u_chave (rgb da cor do fundo), u_canal (1 verde, 2 azul), u_tol, u_suave,
 * u_derr. Sai com alfa pré-multiplicado desligado (o canvas compõe). A mesma conta de recortarPixel.
 */
export const FRAG_CHROMA = `#version 300 es
precision highp float;
uniform sampler2D u_img;
uniform vec3 u_chave;
uniform int u_canal;
uniform float u_tol;
uniform float u_suave;
uniform float u_derr;
in vec2 v_uv;
out vec4 cor;
vec2 cbcr(vec3 c) { return vec2(-0.1146 * c.r - 0.3854 * c.g + 0.5 * c.b, 0.5 * c.r - 0.4542 * c.g - 0.0458 * c.b); }
void main() {
  vec3 c = texture(u_img, v_uv).rgb;
  float d = distance(cbcr(c), cbcr(u_chave));
  float t = clamp((d - u_tol) / u_suave, 0.0, 1.0);
  float a = t * t * (3.0 - 2.0 * t);
  if (u_canal == 1) { float o = max(c.r, c.b); if (c.g > o) c.g -= (c.g - o) * u_derr; }
  else { float o = max(c.r, c.g); if (c.b > o) c.b -= (c.b - o) * u_derr; }
  cor = vec4(c, a);
}`
