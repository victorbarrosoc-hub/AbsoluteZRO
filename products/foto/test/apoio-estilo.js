// Apoio dos testes de src/estilo: cenas sintéticas com semente (nada de binário no git), revelação em bytes como a tela
// decodifica, a métrica de cor (ΔE Oklab) e o acesso às amostras do titular.
//
// As amostras do titular (products/foto/.amostras/titular, fora do git) são arquivos de cliente: só existem na máquina
// de quem trabalha com eles e nunca no CI. Teste que as usa pula com mensagem quando faltam; com
// FOTO_EXIGIR_AMOSTRAS=1 a falta vira falha (a mesma chave das amostras RAW, ver CLAUDE.md do app).

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { neutro } from '../src/motor/ajustes.js'
import { criarOklab } from '../src/motor/cor/oklab.js'
import { paraBytes, revelar } from '../src/motor/revelar.js'
import { CARTELA, deSrgb8, sorteio } from './apoio-motor.js'

export { CARTELA, deSrgb8, sorteio }

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pastaDoTitular = process.env.FOTO_AMOSTRAS_TITULAR || path.join(raiz, '.amostras', 'titular')

export const caminhoDoTitular = (relativo) => path.join(pastaDoTitular, relativo)
export const temDoTitular = (relativo) => existsSync(caminhoDoTitular(relativo))
export const lerDoTitular = async (relativo) => new Uint8Array(await readFile(caminhoDoTitular(relativo)))

/** Pula o teste (com a razão) quando a amostra do titular não está na máquina. Devolve true quando está. */
export function precisaDoTitular(t, relativo) {
  if (temDoTitular(relativo)) return true
  if (process.env.FOTO_EXIGIR_AMOSTRAS === '1') throw new Error(`FOTO_EXIGIR_AMOSTRAS=1 e falta a amostra do titular ${relativo}`)
  t.skip(`sem a amostra do titular ${relativo} (arquivo de cliente, fora do git e do CI)`)
  return false
}

/**
 * Uma cena "de sessão": fotos seguidas de um mesmo trabalho — a mesma luz e as mesmas coisas na frente da câmera, outro
 * enquadramento. As manchas (cor da cartela ou cinza, tamanho e luz entre −2 e +1,3 EV) saem de `sessao`; onde cada uma
 * cai, de `semente`. Fundo em degradê (céu claro em cima, chão escuro e quente embaixo). Rec.2020 linear, cinza médio
 * perto de 0,18. Pixels desenhados direto (sem superamostragem): é rápido e basta para medir cor e tom.
 */
export function cenaDeSessao(semente, largura = 240, altura = 160, { sessao = 1, manchas = 1500, cinzas = 0.2, tamanho = 0.025 } = {}) {
  const coisas = sorteio(sessao)
  const onde = sorteio(semente)
  const paleta = CARTELA.map(([, r, g, b]) => deSrgb8(r, g, b))
  const dados = new Float32Array(largura * altura * 3)
  for (let y = 0; y < altura; y++) {
    const u = y / (altura - 1)
    const ceu = [0.42, 0.5, 0.62]
    const chao = [0.12, 0.09, 0.06]
    for (let x = 0; x < largura; x++) {
      const o = (y * largura + x) * 3
      const t = Math.min(1, Math.max(0, (u - 0.35) / 0.3))
      const brilho = 0.85 + 0.3 * (x / largura)
      for (let c = 0; c < 3; c++) dados[o + c] = (ceu[c] * (1 - t) + chao[c] * t) * brilho
    }
  }
  const lado = Math.max(largura, altura)
  for (let i = 0; i < manchas; i++) {
    const rx = lado * tamanho * (0.4 + coisas() * 1.6)
    const ry = lado * tamanho * (0.4 + coisas() * 1.6)
    const disco = coisas() < 0.5
    const luz = 2 ** (-2 + coisas() * 3.3)
    const cinza = coisas() < cinzas
    const base = cinza ? [0.18, 0.18, 0.18] : paleta[(coisas() * paleta.length) | 0]
    const cor = base.map((v) => v * luz)
    const cx = onde() * largura
    const cy = onde() * altura
    const x0 = Math.max(0, Math.floor(cx - rx))
    const x1 = Math.min(largura - 1, Math.ceil(cx + rx))
    const y0 = Math.max(0, Math.floor(cy - ry))
    const y1 = Math.min(altura - 1, Math.ceil(cy + ry))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        if (disco && dx * dx + dy * dy > 1) continue
        const o = (y * largura + x) * 3
        dados[o] = cor[0]
        dados[o + 1] = cor[1]
        dados[o + 2] = cor[2]
      }
    }
  }
  return { largura, altura, dados }
}

/** Uma Base do motor para uma imagem linear (como a que `baseDeImagem` devolve, sem ler arquivo). */
export function baseDe(imagem) {
  return {
    imagem,
    latitude: null,
    branco: { kelvin: 6504, tinta: 0 },
    origem: 'imagem',
    exposicaoBase: 0,
    orientacao: 1,
    ruido: null,
    demosaico: null,
    reduzir: 1,
    cortado: { um: 0, dois: 0, tres: 0 },
    folgaAltas: 0,
  }
}

/** Revela e devolve como a tela decodifica um JPEG: { largura, altura, dados RGBA de 8 bits, espaco }. */
export function emBytes(base, ajustes = neutro(), { tela = 'srgb', look = null } = {}) {
  const img = revelar(base, ajustes, { tela, semente: 3, look })
  return { largura: img.largura, altura: img.altura, dados: paraBytes(img), espaco: tela }
}

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const TABELA = Float64Array.from({ length: 256 }, (_, i) => linear(i / 255))

/** ΔE Oklab médio (× 100) entre duas imagens RGBA de 8 bits do mesmo tamanho. */
export function deltaEMedio(x, y, espaco = 'srgb') {
  const ok = criarOklab(espaco)
  const a = [0, 0, 0]
  const b = [0, 0, 0]
  const n = x.largura * x.altura
  let soma = 0
  for (let i = 0; i < n; i++) {
    const o = i * 4
    ok.paraOklab(TABELA[x.dados[o]], TABELA[x.dados[o + 1]], TABELA[x.dados[o + 2]], a)
    ok.paraOklab(TABELA[y.dados[o]], TABELA[y.dados[o + 1]], TABELA[y.dados[o + 2]], b)
    soma += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  }
  return (100 * soma) / n
}

// ─────────── cena com textura natural (para medir textura, clareza, neblina e nitidez) ───────────

// Ruído de valor: um número por nó da grade (hash da posição e da semente), interpolado com a curva suave de Perlin
// (6t⁵ − 15t⁴ + 10t³). Desvio perto de 0,3 em cada oitava.
function hash2(x, y, s) {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(s, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296 - 0.5
}
const suave5 = (t) => t * t * t * (t * (t * 6 - 15) + 10)
function ruidoDeValor(x, y, s) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const tx = suave5(x - ix)
  const ty = suave5(y - iy)
  const a = hash2(ix, iy, s) + (hash2(ix + 1, iy, s) - hash2(ix, iy, s)) * tx
  const b = hash2(ix, iy + 1, s) + (hash2(ix + 1, iy + 1, s) - hash2(ix, iy + 1, s)) * tx
  return a + (b - a) * ty
}

/**
 * Ruído fractal em pixels: oitavas de célula `maior`, maior/2, … até `menor` px, a de célula c com amplitude
 * (c/maior)^h. h = 0 dá espectro de amplitude 1/f (a mesma energia por oitava, como nas fotos naturais: Field, 1987,
 * "Relations between the statistics of natural images and the response properties of cortical cells", JOSA A 4(12)).
 */
export function fractal(x, y, s, { maior = 256, menor = 1.5, h = 0 } = {}) {
  let soma = 0
  let norma = 0
  let k = 0
  for (let c = maior; c >= menor; c /= 2, k++) {
    const a = (c / maior) ** h
    soma += a * ruidoDeValor(x / c + k * 17.3, y / c + k * 31.7, s + k * 101)
    norma += a * a
  }
  return soma / Math.sqrt(norma || 1)
}

/**
 * Uma paisagem com textura natural em todas as escalas, em Rec.2020 linear (cinza médio perto de 0,18): céu com nuvem
 * leve; morros ao fundo com névoa (transmissão t = e^(−β·distância) e a luz do ar do céu, o modelo de Koschmieder que o
 * canal escuro supõe); folhagem fractal (1/f); um muro de tijolo (tijolos de cor e luz próprias, argamassa, aspereza
 * fina); chão de terra; e uns objetos de borda dura com as cores da cartela. Tudo em coordenadas proporcionais: a
 * mesma semente em outro tamanho é a mesma cena com mais ou menos detalhe (o detalhe desce até ~1,5 px). `nevoa`
 * escala a névoa (0 = ar limpo).
 */
export function cenaNatural(semente, largura = 1024, altura = 683, { nevoa = 1 } = {}) {
  const acaso = sorteio(semente * 7919 + 1)
  const lado = Math.max(largura, altura)
  const horizonte = 0.3 + 0.08 * acaso()
  const muro = { x0: 0.08 + 0.4 * acaso(), y0: 0.5 + 0.1 * acaso() }
  muro.x1 = muro.x0 + 0.3 + 0.15 * acaso()
  muro.y1 = muro.y0 + 0.18 + 0.1 * acaso()
  const tijolo = { l: 0.045 + 0.01 * acaso(), a: 0.018 + 0.004 * acaso() }
  const paleta = CARTELA.map(([, r, g, b]) => deSrgb8(r, g, b))
  const objetos = Array.from({ length: 6 }, () => ({
    cx: 0.1 + 0.8 * acaso(),
    cy: 0.66 + 0.3 * acaso(),
    r: 0.025 + 0.04 * acaso(),
    disco: acaso() < 0.5,
    cor: paleta[(acaso() * paleta.length) | 0].map((v) => v * 2 ** (-0.5 + acaso())),
  }))
  const ar = [0.62, 0.68, 0.76]
  const dados = new Float32Array(largura * altura * 3)
  const px = lado / 1024 // as células do fractal crescem com a foto (a cena é a mesma); o menor detalhe fica em 1,5 px
  const f = (x, y, s, maior, h = 0) => fractal(x, y, s, { maior: maior * px, menor: 1.5, h })
  for (let y = 0; y < altura; y++) {
    const v = y / altura
    for (let x = 0; x < largura; x++) {
      const u = x / largura
      let cor
      let distancia
      const morro = horizonte + 0.06 * f(x, 0, semente + 5, 300, 0.5)
      if (v < morro) {
        const nuvem = 0.25 * f(x, y, semente + 1, 200, 0.6)
        const g = 0.85 + 0.3 * (1 - v / morro) + nuvem
        cor = [0.42 * g, 0.5 * g, 0.66 * g]
        distancia = Infinity
      } else if (v < horizonte + 0.14) {
        const l = 2 ** (1.2 * f(x, y, semente + 2, 64))
        cor = [0.05 * l, 0.09 * l, 0.04 * l]
        distancia = 0.6 - (0.2 * (v - morro)) / (horizonte + 0.14 - morro)
      } else if (u >= muro.x0 && u < muro.x1 && v >= muro.y0 && v < muro.y1) {
        const fila = Math.floor((v - muro.y0) / tijolo.a)
        const desloca = fila % 2 ? tijolo.l / 2 : 0
        const coluna = Math.floor((u - muro.x0 + desloca) / tijolo.l)
        const du = (u - muro.x0 + desloca) / tijolo.l - coluna
        const dv = (v - muro.y0) / tijolo.a - fila
        const junta = Math.min(du, 1 - du) * tijolo.l * largura < 0.12 * tijolo.a * altura || Math.min(dv, 1 - dv) < 0.12
        const aspero = 2 ** (0.35 * f(x, y, semente + 3, 12))
        if (junta) cor = [0.2 * aspero, 0.19 * aspero, 0.17 * aspero]
        else {
          const k = 0.7 + 0.6 * hash2(coluna, fila, semente + 4) + 0.3
          cor = [0.3 * k * aspero, 0.12 * k * aspero, 0.07 * k * aspero]
        }
        distancia = 0.2
      } else if (v < 0.72) {
        // folhagem: muito relevo em todas as escalas, verde com variação de matiz
        const l = 2 ** (1.3 * f(x, y, semente + 6, 48))
        const m = 0.5 + f(x, y, semente + 7, 96)
        cor = [(0.05 + 0.04 * m) * l, (0.13 + 0.03 * m) * l, 0.04 * l]
        distancia = 0.35 - 0.3 * ((v - horizonte - 0.14) / (0.58 - horizonte))
      } else {
        const l = 2 ** (1.1 * f(x, y, semente + 8, 128))
        cor = [0.16 * l, 0.11 * l, 0.07 * l]
        distancia = 0.05
      }
      for (const o of objetos) {
        const dx = (u - o.cx) * largura
        const dy = (v - o.cy) * altura
        const r = o.r * lado
        if (o.disco ? dx * dx + dy * dy <= r * r : Math.abs(dx) <= r && Math.abs(dy) <= r * 0.7) {
          const k = 2 ** (0.15 * f(x, y, semente + 9, 24))
          cor = o.cor.map((c) => c * k)
          distancia = 0.05
        }
      }
      const t = distancia === Infinity ? 0 : Math.exp(-2.2 * nevoa * distancia)
      const o = (y * largura + x) * 3
      for (let c = 0; c < 3; c++) dados[o + c] = distancia === Infinity ? cor[c] : cor[c] * t + ar[c] * 0.5 * (1 - t)
    }
  }
  return { largura, altura, dados }
}
