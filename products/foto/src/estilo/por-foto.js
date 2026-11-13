// Tratar em lote: para cada foto, corrigir primeiro o que é DA FOTO (exposição e branco, com src/motor/auto.js, que já
// respeita a Latitude do arquivo) e só então aplicar o estilo na intensidade pedida. Puro: recebe as bases (a prévia
// reduzida basta: o automático lê uma grade de no máximo 60 mil pontos) e devolve os ajustes e a explicação curta.
//
// Modos:
//   'so-estilo'              não corrige nada: o que a foto já tem de exposição e branco fica, o estilo entra por cima
//   'corrigir-e-estilo'      exposição e branco automáticos em toda foto, depois o estilo
//   'manter-o-que-ja-mexi'   onde a pessoa já mexeu (exposição diferente de 0, branco fora de 'original') fica o dela;
//                            o resto é corrigido como no modo anterior
//
// SÉRIE SEM PISCAR. Fotos seguidas da mesma cena (mesmo `grupo`, vizinhas na lista) recebem a correção suavizada: cada
// uma vira a média ponderada das vizinhas da janela, com peso que cai com a diferença para a própria correção — um
// filtro bilateral em uma dimensão (Tomasi e Manduchi, 1998, "Bilateral filtering for gray and color images", ICCV).
// Assim o automático que oscila 0,2 EV de uma foto para a outra (enquadramento um pouco diferente, alguém de branco
// entrando no quadro) fica estável, e uma mudança de verdade (o flash que não disparou, uma janela de 2 EV) não é
// arrastada pelas vizinhas. Os pesos: exp(−(Δ/σ)²), σ = 0,5 EV na exposição e 15 mired na temperatura (metade do teto
// do branco automático, AUTO_BRANCO.mired) — números de escolha nossa, descritos aqui e travados no teste.

import { neutro, normalizar } from '../motor/ajustes.js'
import { autoBranco, autoExposicao } from '../motor/auto.js'
import { aplicar } from './predefinicao.js'

export const MODOS = ['so-estilo', 'corrigir-e-estilo', 'manter-o-que-ja-mexi']
export const SERIE = { janela: 2, sigmaEv: 0.5, sigmaMired: 15, sigmaTinta: 6 }

const numero = (v, casas = 1) => Math.abs(v).toFixed(casas).replace('.', ',')
const limitar = (v, a, b) => (v < a ? a : v > b ? b : v)

// O que o automático diz de uma foto, antes de suavizar.
function medir(foto) {
  if (!foto.base) return null
  const ex = autoExposicao(foto.base)
  const br = autoBranco(foto.base)
  const original = { kelvin: foto.base.branco?.kelvin ?? 6500, tinta: foto.base.branco?.tinta ?? 0 }
  return {
    exposicao: ex.exposicao,
    limites: ex.limites,
    porqueExposicao: ex.porque,
    brancoMudou: br.mudou,
    mired: 1e6 / br.temperatura,
    tinta: br.tinta,
    porqueBranco: br.porque,
    original,
  }
}

// Fotos seguidas com o mesmo `grupo` formam uma série; sem grupo, cada foto é sozinha.
function series(fotos) {
  const lista = []
  let atual = null
  fotos.forEach((foto, i) => {
    const g = foto.grupo ?? null
    if (g != null && atual && atual.grupo === g) atual.indices.push(i)
    else {
      atual = { grupo: g, indices: [i] }
      lista.push(atual)
    }
  })
  return lista
}

function bilateral(valores, i, sigma, janela) {
  let soma = 0
  let peso = 0
  for (let j = Math.max(0, i - janela); j <= Math.min(valores.length - 1, i + janela); j++) {
    if (valores[j] == null) continue
    const w = Math.exp(-(((valores[j] - valores[i]) / sigma) ** 2))
    soma += w * valores[j]
    peso += w
  }
  return soma / peso
}

/**
 * Trata uma lista de fotos com uma predefinição.
 *
 * `fotos`: [{ id, base?, ajustes?, grupo? }] na ordem da série (`base` é a Base do motor — a prévia reduzida serve; sem
 * `base` a foto não é corrigida, só recebe o estilo). `opcoes`: modo, intensidade (0..200), suavizar (padrão true).
 *
 * Devolve [{ id, ajustes, explicacao: [frases curtas], correcao: { exposicao, temperatura, tinta, brancoMudou,
 * suavizada, manteve: [o que era da pessoa] } }].
 */
export function tratarEmLote(fotos, predefinicao, { modo = 'corrigir-e-estilo', intensidade = 100, suavizar = true } = {}) {
  if (!MODOS.includes(modo)) throw new Error(`por-foto: modo desconhecido: ${modo}`)
  const forca = limitar(Number.isFinite(intensidade) ? intensidade : 100, 0, 200)
  const corrigir = modo !== 'so-estilo'
  const medidas = fotos.map((f) => (corrigir ? medir(f) : null))
  const doLote = fotos.map((f) => normalizar(f.ajustes ?? neutro()))

  // o que a pessoa já mexeu fica, no modo que respeita isso
  const manter = doLote.map((a) => ({
    exposicao: modo === 'manter-o-que-ja-mexi' && a.luz.exposicao !== 0,
    branco: modo === 'manter-o-que-ja-mexi' && a.branco.modo !== 'original',
  }))

  // valores alvo antes da suavização (null = não entra na conta)
  const ev = medidas.map((m, i) => (m && !manter[i].exposicao ? m.exposicao : null))
  const mired = medidas.map((m, i) => (m && !manter[i].branco ? m.mired : null))
  const tinta = medidas.map((m, i) => (m && !manter[i].branco ? m.tinta : null))
  const evFinal = [...ev]
  const miredFinal = [...mired]
  const tintaFinal = [...tinta]
  const suavizada = fotos.map(() => false)
  if (corrigir && suavizar) {
    for (const serie of series(fotos)) {
      if (serie.indices.length < 2) continue
      const pega = (lista) => serie.indices.map((i) => lista[i])
      const [e, m, t] = [pega(ev), pega(mired), pega(tinta)]
      serie.indices.forEach((i, k) => {
        if (e[k] != null) {
          // a suavização nunca passa dos limites que a Latitude daquela foto deu
          const lim = medidas[i].limites
          evFinal[i] = Math.round(limitar(bilateral(e, k, SERIE.sigmaEv, SERIE.janela), lim.min, lim.max) * 100) / 100
          if (Math.abs(evFinal[i] - e[k]) >= 0.05) suavizada[i] = true
        }
        if (m[k] != null) {
          miredFinal[i] = bilateral(m, k, SERIE.sigmaMired, SERIE.janela)
          tintaFinal[i] = bilateral(t, k, SERIE.sigmaTinta, SERIE.janela)
          if (Math.abs(1e6 / miredFinal[i] - 1e6 / m[k]) >= 50 || Math.abs(tintaFinal[i] - t[k]) >= 1) suavizada[i] = true
        }
      })
    }
  }

  return fotos.map((foto, i) => {
    const m = medidas[i]
    const daFoto = structuredClone(doLote[i])
    const explicacao = []
    const correcao = { exposicao: daFoto.luz.exposicao, temperatura: null, tinta: null, brancoMudou: false, suavizada: suavizada[i], manteve: [] }
    if (!corrigir || !m) {
      if (corrigir && !m) explicacao.push('Sem a imagem: só o estilo.')
    } else {
      // exposição
      if (manter[i].exposicao) {
        correcao.manteve.push('exposição')
        explicacao.push('Exposição como você deixou.')
      } else {
        daFoto.luz.exposicao = evFinal[i]
        correcao.exposicao = evFinal[i]
        if (Math.abs(evFinal[i]) < 0.05) explicacao.push('Exposição mantida.')
        else explicacao.push(`${evFinal[i] > 0 ? 'Clareei' : 'Escureci'} ${numero(evFinal[i])} EV.`)
      }
      // branco: só vira manual quando muda de verdade; senão fica o da foto
      if (manter[i].branco) {
        correcao.manteve.push('branco')
        explicacao.push('Branco como você deixou.')
      } else {
        const temperatura = Math.round(limitar(1e6 / miredFinal[i], 2000, 50000) / 10) * 10
        const t = Math.round(limitar(tintaFinal[i], -150, 150))
        const mudou = Math.abs(1e6 / temperatura - 1e6 / m.original.kelvin) >= 1 || Math.abs(t - m.original.tinta) >= 1
        if (mudou && (m.brancoMudou || suavizada[i])) {
          daFoto.branco = { modo: 'manual', temperatura, tinta: t }
          correcao.temperatura = temperatura
          correcao.tinta = t
          correcao.brancoMudou = true
          const lado = temperatura > m.original.kelvin ? 'mais quente' : 'mais frio'
          explicacao.push(`Branco ${lado}: ${temperatura} K.`)
        } else {
          daFoto.branco = { ...daFoto.branco, modo: 'original' }
          explicacao.push('Branco mantido.')
        }
      }
      if (suavizada[i]) explicacao.push('Igualei com as vizinhas da mesma cena.')
    }
    const ajustes = predefinicao ? aplicar(predefinicao, daFoto, forca) : normalizar(daFoto)
    if (predefinicao) explicacao.push(`${predefinicao.nome}${forca !== 100 ? ` a ${Math.round(forca)}%` : ''}.`)
    return { id: foto.id ?? i, ajustes, explicacao, correcao }
  })
}

/** Uma foto só (sem série): o mesmo que `tratarEmLote([foto], …)[0]`. */
export function tratarFoto(foto, predefinicao, opcoes = {}) {
  return tratarEmLote([foto], predefinicao, { ...opcoes, suavizar: false })[0]
}
