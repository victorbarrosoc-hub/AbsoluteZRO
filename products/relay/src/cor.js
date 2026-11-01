// Relay · cor na exportação, com o motor da Revela. `src/revela/` é cópia conferida de products/finishing/src/cor/
// (test/copias.test.js): a Revela é dona da cor; o Relay só aplica a receita dela na conversão.
//
// A receita: { entrada: id de câmera da Revela (o log do arquivo) | null, tom: 'suave' | 'nenhum', look: { id, nome } |
// null }. Sem entrada, o arquivo já é Rec.709 e só o look entra. A saída é sempre Rec.709 SDR (o arquivo sai marcado
// 1-1-1).
//
// Caminho: CST da Revela (log → Rec.709 gama 2.4) e depois o look (.cube) sobre o Rec.709 de tela de 0 a 1 (o que o
// Resolve passa a um nó depois da CST; sem CST, o look recebe o próprio Rec.709 do arquivo, em faixa cheia). Sem CST e
// com `look.sobre: 'log'` (LUT de câmera ou look feito para o log, como as do Lab da Revela, que dizem "# Entrada:"
// no .cube), o look lê o código da câmera, na mesma convenção da CST.
//
// Na placa de vídeo (app/escala.js) a CST é a CONTA, não uma LUT 3D: curva da câmera (1D, 2048 pontos), matriz de
// gamut, mapa de tom, compressão de gamut e curva 2.4, em ponto flutuante (`etapasParaPlaca`). Medido: uma LUT 3D de
// 65 pontos erra até ~30/255 em cor saturada (um canal encosta no zero, onde a curva 2.4 é vertical) e ~6/255 no
// preto; a conta fica dentro do arredondamento de 8 bits. No ffmpeg (computador) ainda vai uma LUT 3D de 65 pontos
// tetraédrica (`assarParaFfmpeg`), com esse limite.
//
// Convenção de nível da Revela na CST: a curva lê o código ÷ 1023 (o que o Resolve passa para ela). Arquivo de faixa
// de vídeo decodificado sai esticado (16–235 → 0–1), então quem aplica desfaz o esticamento antes da CST.
//
// Enquanto a Revela não está no ar, a tela só mostra a cor com o recurso ligado (app/recursos.js).

import { CURVAS, ENTRADAS, criarCst, deitarAltas, matrizGamut } from './revela/espacos.js'
import { aplicarTetra, assar, escreverCube, lerCube } from './revela/cube.js'
/** Logs de câmera que a Revela converte para Rec.709. */
export const ENTRADAS_COR = ENTRADAS

export const TONS = [
  { id: 'suave', nome: 'Altas suaves' },
  { id: 'nenhum', nome: 'Sem mapa de tom' },
]

/** Pontos da LUT assada: 65 (o máximo do .cube no Resolve), sem degrau visível na CST. */
export const PONTOS = 65

/** Receita limpa, ou null se não muda nada. `look` só leva id e nome (a LUT mora à parte: app/looks.js). */
export function receitaDe(r) {
  if (!r || typeof r !== 'object') return null
  const entrada = ENTRADAS_COR.some((e) => e.id === r.entrada) ? r.entrada : null
  const look = r.look && typeof r.look.id === 'string' && /^[a-z0-9-]{4,60}$/.test(r.look.id) ? { id: r.look.id, nome: String(r.look.nome ?? 'Look').slice(0, 60) } : null
  if (!entrada && !look) return null
  if (look && !entrada && r.look.sobre === 'log') look.sobre = 'log'
  return { entrada, tom: r.tom === 'nenhum' ? 'nenhum' : 'suave', look }
}

/** "S-Log3 / S-Gamut3.Cine → Rec.709 · look Verão". */
export function descreverReceita(r) {
  if (!r) return null
  const e = ENTRADAS_COR.find((x) => x.id === r.entrada)
  const partes = []
  if (e) partes.push(`${e.nome.replace(/^[^·]+· /, '')} → Rec.709${r.tom === 'nenhum' ? ' (sem mapa de tom)' : ''}`)
  if (r.look) partes.push(`look ${r.look.nome}${r.look.sobre === 'log' ? ' (sobre o log)' : ''}`)
  return partes.join(' · ')
}

/**
 * O look é de log? O .cube da Revela (e o padrão ARRI) diz a entrada num comentário "# Entrada: …"; sem ele, ou com
 * Rec.709/sRGB, o look é de tela.
 */
export function lookPedeLog(texto) {
  const entrada = /^#\s*(?:Entrada|Input)\s*:\s*(.+)$/im.exec(String(texto).slice(0, 4000))?.[1] ?? ''
  return Boolean(entrada) && !/rec\.?\s*709|srgb|gama\s*2|gamma\s*2/i.test(entrada)
}

const prender = (c) => [Math.min(1, Math.max(0, c[0])), Math.min(1, Math.max(0, c[1])), Math.min(1, Math.max(0, c[2]))]

/** A curva de saída da Revela no Rec.709 (gama 2.4). */
export const GAMA = 2.4
/** Pontos da curva da câmera na placa (textura 1D: 2048 cabe em toda placa com WebGL2). */
export const PONTOS_CURVA = 2048
/** O joelho do mapa de tom "Altas suaves" da Revela (deitarAltas). */
export const JOELHO = 0.6
const LUMA = [0.2126, 0.7152, 0.0722]

function cstDaReceita(receita) {
  return receita?.entrada ? criarCst(receita.entrada, 'rec709', { tom: receita.tom }) : null
}

function exigirLook(receita, look) {
  if (receita?.look && !look) throw Object.assign(new Error(`O look "${receita.look.nome}" não está neste aparelho.`), { codigo: 'look' })
}

/**
 * A receita como função de pixel (a conta de referência, a da própria Revela): com CST, recebe o código da câmera
 * (0–1); sem, o Rec.709 do arquivo. Devolve o Rec.709 de tela (0–1). `look`: LUT lida ({ tamanho, dados }) ou null.
 */
export function funcaoDaReceita(receita, look = null) {
  exigirLook(receita, look)
  const cst = cstDaReceita(receita)
  return (r, g, b) => {
    let c = cst ? prender(cst.aplicar(r, g, b)) : [r, g, b]
    if (look) c = aplicarTetra(look, ...prender(c))
    return prender(c)
  }
}

/**
 * As etapas para a placa de vídeo: { curva: Float32Array (código → luz linear, PONTOS_CURVA) | null, matriz: 3×3
 * (gamut da câmera → Rec.709, por linhas) | null, tom: bool, look: LUT 3D | null }.
 */
export function etapasParaPlaca(receita, look = null) {
  exigirLook(receita, look)
  const e = receita?.entrada ? ENTRADAS_COR.find((x) => x.id === receita.entrada) : null
  if (!e) return { curva: null, matriz: null, tom: false, look: look ?? null, lookNoLog: Boolean(look && receita?.look?.sobre === 'log') }
  const paraLinear = CURVAS[e.curva].paraLinear
  const curva = new Float32Array(PONTOS_CURVA)
  for (let i = 0; i < PONTOS_CURVA; i++) curva[i] = paraLinear(i / (PONTOS_CURVA - 1))
  return { curva, matriz: matrizGamut(e.gamut, 'rec709'), tom: receita.tom !== 'nenhum', look: look ?? null, lookNoLog: false }
}

/**
 * O que o shader faz (app/escala.js, FRAG_COR), em JavaScript: o teste confere que bate com `funcaoDaReceita`. Mudou
 * a conta da Revela, este espelho e o shader mudam juntos.
 */
export function aplicarEtapas(etapas, r, g, b) {
  let c = [r, g, b]
  if (etapas.curva) {
    const n = etapas.curva.length
    const lin = c.map((v) => {
      const x = Math.min(1, Math.max(0, v)) * (n - 1)
      const i = Math.min(n - 2, Math.floor(x))
      return etapas.curva[i] + (etapas.curva[i + 1] - etapas.curva[i]) * (x - i)
    })
    const M = etapas.matriz
    let l = M.map((linha) => linha[0] * lin[0] + linha[1] * lin[1] + linha[2] * lin[2])
    if (etapas.tom) {
      const Y = LUMA[0] * l[0] + LUMA[1] * l[1] + LUMA[2] * l[2]
      if (Y > JOELHO) l = l.map((v) => (v * deitarAltas(Y, JOELHO)) / Y)
    }
    const Y = Math.max(0, LUMA[0] * l[0] + LUMA[1] * l[1] + LUMA[2] * l[2])
    const menor = Math.min(...l)
    if (menor < 0) l = l.map((v) => Y + (v - Y) * (Y / (Y - menor)))
    c = l.map((v) => Math.min(1, Math.max(0, v)) ** (1 / GAMA))
  }
  if (etapas.look) c = aplicarTetra(etapas.look, ...prender(c))
  return prender(c)
}

/**
 * LUT para o `lut3d` do ffmpeg, que recebe o RGB já esticado (`faixa` 'tv') ou cheio ('pc'): o desfazer da faixa vai
 * dentro da LUT, e o look também. Devolve o texto do .cube (65 pontos, tetraédrica no ffmpeg).
 */
export function assarParaFfmpeg(receita, look = null, faixa = 'tv', pontos = PONTOS) {
  const f = funcaoDaReceita(receita, look)
  const leCodigo = Boolean(receita?.entrada) || receita?.look?.sobre === 'log'
  const codigo = faixa === 'pc' || !leCodigo ? (v) => v : (v) => (v * 876 + 64) / 1023
  const lut = assar((r, g, b) => f(codigo(r), codigo(g), codigo(b)), pontos)
  return escreverCube(lut, `Relay · ${descreverReceita(receita)}`, ['Relay: receita de cor, RGB de entrada já na faixa cheia'])
}

/** Lê o .cube de um look (texto). Erros em português, com o motivo. */
export function lerLook(texto) {
  try {
    return lerCube(texto)
  } catch (e) {
    throw Object.assign(new Error(`Este .cube não abre: ${e.message}.`), { codigo: 'look' })
  }
}
