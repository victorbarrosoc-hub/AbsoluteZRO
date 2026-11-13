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
