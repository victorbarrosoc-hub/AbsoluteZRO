// CAMZRO · Looks ZRO: looks de cinema só na tela (pedido do titular, 14/11/2026, a partir do estudo do 2Shoot). Conta
// pura. Cada look é uma função de cor no sinal Rec.709 já codificado (0–1) e vira uma LUT 3D .cube de 33 pontos: a tela
// mostra o look ao vivo, o arquivo grava limpo, e o .cube vai ao lado do clipe para o colorista aplicar o mesmo look
// (ou não) na edição. Nada de grão ou halação queimados no arquivo.
//
// Peças: luma Rec.709 (BT.709: 0,2126 R + 0,7152 G + 0,0722 B), curva em S monótona (mistura com o smoothstep, k entre
// −1 e 1 nunca inverte o tom), saturação em torno da luma, preto e branco de saída, e tom dividido (sombras × luzes).

import { escreverCube } from './lut.js'

export const TAMANHO = 33
const prender = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
/** Curva em S: k > 0 aumenta o contraste, k < 0 achata. Monótona para |k| ≤ 1. */
export const curva = (x, k) => x + k * (x * x * (3 - 2 * x) - x)
const saturar = (c, s) => {
  const l = luma(c)
  return c.map((v) => l + (v - l) * s)
}
const niveis = (c, preto, branco) => c.map((v) => preto + v * (branco - preto))
const vezes = (c, m) => c.map((v, i) => v * m[i])
const dividido = (c, sombra, luz) => {
  const l = prender(luma(c))
  return c.map((v, i) => v + (1 - l) * sombra[i] + l * luz[i])
}
const emS = (c, k) => c.map((v) => curva(prender(v), k))

/** Os looks. Nomes genéricos (sem marca de filme): o que importa é o caráter. */
export const LOOKS = [
  { id: 'contraste', nome: 'Contraste 709', dica: 'Devolve contraste e cor ao Neutro ZRO, só na tela', f: (c) => saturar(emS(c, 0.35), 1.25) },
  { id: 'tungstenio', nome: 'Tungstênio 500', dica: 'Negativo de noite: sombras frias, luzes quentes, contraste suave', f: (c) => niveis(dividido(saturar(vezes(emS(c, 0.25), [0.94, 0.98, 1.06]), 0.85), [-0.05, 0, 0.08], [0.08, 0.03, -0.05]), 0.035, 1) },
  { id: 'diurno', nome: 'Diurno 250', dica: 'Negativo de dia: quente e macio', f: (c) => niveis(dividido(saturar(vezes(emS(c, 0.22), [1.06, 1.01, 0.9]), 1.08), [0.01, 0, -0.02], [0.03, 0.01, -0.03]), 0.025, 0.98) },
  { id: 'teal', nome: 'Teal e laranja', dica: 'Pele quente, fundo frio', f: (c) => dividido(saturar(emS(c, 0.32), 1.15), [-0.09, 0.02, 0.09], [0.09, 0.02, -0.08]) },
  { id: 'bleach', nome: 'Bleach', dica: 'Pouca cor e muito contraste, como o banho de prata', f: (c) => saturar(emS(c, 0.55), 0.45) },
  { id: 'desbotado', nome: 'Desbotado', dica: 'Pretos lavados, cor contida', f: (c) => niveis(saturar(c, 0.75), 0.08, 0.94) },
  { id: 'noite', nome: 'Noite', dica: 'Frio e fechado', f: (c) => niveis(saturar(vezes(emS(c, 0.3), [0.9, 0.97, 1.08]), 0.8), 0, 0.92) },
  {
    id: 'pb',
    nome: 'P&B',
    dica: 'Preto e branco com filtro vermelho: céu escuro, pele clara',
    f: ([r, g, b]) => {
      const v = curva(prender(0.35 * r + 0.55 * g + 0.1 * b), 0.4)
      return [v, v, v]
    },
  },
]

export const IDS = LOOKS.map((l) => l.id)
export const look = (id) => LOOKS.find((l) => l.id === id) || null

/** A cor de um ponto pelo look (0–1). */
export const aplicarLook = (id, c) => look(id).f(c).map(prender)

/** O .cube do look (33 pontos), com o título que vai na ficha e no nome da LUT. */
export function cubeDoLook(id, tamanho = TAMANHO) {
  const l = look(id)
  if (!l) return null
  return escreverCube({ titulo: `ZRO · ${l.nome}`, tamanho, funcao: (c) => aplicarLook(id, c) })
}
