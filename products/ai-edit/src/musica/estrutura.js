// As partes da música (intro, verso, pré-refrão, refrão, ponte, final), pela harmonia e pela energia de cada frase de
// 4 compassos: frase que continua a anterior (mesmos acordes, mesma força) é a mesma parte; parte que volta com os
// mesmos acordes é a mesma (A, B…); a que volta e é a mais forte é o refrão. É estimativa medida do som, não IA: a
// tela diz isso e a pessoa troca o nome de qualquer parte com um toque. Os limites vêm do preset do modo.

import { cromaMedio } from './ritmo.js'

export const TIPOS = Object.freeze(['intro', 'verso', 'pre', 'refrao', 'ponte', 'final'])
export const NOMES = Object.freeze({ intro: 'Intro', verso: 'Verso', pre: 'Pré-refrão', refrao: 'Refrão', ponte: 'Ponte', final: 'Final' })

export const PADRAO_SECOES = Object.freeze({ bloco_compassos: 4, continua_min: 0.55, repete_min: 0.6, salto_db: 3, refrao_db: 1.5 })

const r3 = (x) => Math.round(x * 1000) / 1000

/** Croma de cada compasso, com a média da música tirada (assim o tom da música não deixa tudo parecido). */
function cromasDosCompassos(medidas, limites) {
  const { hz, croma, n } = medidas
  const cs = limites.slice(0, -1).map((t, i) => cromaMedio(croma, Math.min(n - 1, Math.floor(t * hz)), Math.max(Math.min(n, Math.ceil(limites[i + 1] * hz)), Math.floor(t * hz) + 1)))
  const media = new Float64Array(12)
  for (const c of cs) for (let j = 0; j < 12; j++) media[j] += c[j] / cs.length
  return cs.map((c) => {
    const d = c.map((v, j) => v - media[j])
    const s = Math.sqrt(d.reduce((a, v) => a + v * v, 0)) || 1
    return d.map((v) => v / s)
  })
}

const energiaMedia = (medidas, a, b) => {
  const { hz, energia, n } = medidas
  const i = Math.min(n - 1, Math.max(0, Math.floor(a * hz)))
  const j = Math.max(i + 1, Math.min(n, Math.ceil(b * hz)))
  // média em potência, devolvida em dB (dB médio subestima os trechos fortes)
  let s = 0
  for (let k = i; k < j; k++) s += 10 ** (energia[k] / 10)
  return 10 * Math.log10(s / (j - i) + 1e-12)
}

const produto = (a, b) => a.reduce((s, v, j) => s + v * b[j], 0)

/** Semelhança de duas frases: a média, compasso a compasso, do croma delas. */
function semelhanca(blocos, x, y) {
  const a = blocos[x].cromas
  const b = blocos[y].cromas
  const k = Math.min(a.length, b.length)
  let s = 0
  for (let i = 0; i < k; i++) s += produto(a[i], b[i])
  return k ? s / k : 0
}

/** Energia de cada compasso (dB): o que o aftermovie usa para acelerar na subida e soltar no drop. */
export function energiaDosCompassos(medidas, compassos, duracao) {
  const limites = [...compassos, duracao]
  return limites.slice(0, -1).map((t, i) => Math.round(energiaMedia(medidas, t, limites[i + 1]) * 10) / 10)
}

/**
 * As partes: [{ ini, fim (s), tipo, nome, grupo (A, B…), energia (dB) }], cobrindo a música de 0 até duracao.
 * medidas de sinal.js › medir; compassos de ritmo.js › batidaDa.
 */
export function partesDa(medidas, compassos, duracao, preset = {}) {
  const o = { ...PADRAO_SECOES, ...preset }
  if (!compassos.length) return [{ ini: 0, fim: r3(duracao), tipo: 'verso', nome: 'Música', grupo: 'A', energia: 0 }]
  const limites = [...compassos, duracao].filter((t, i, a) => i === 0 || t > a[i - 1] + 1e-3)
  const cromas = cromasDosCompassos(medidas, limites)
  // frases de N compassos; a última leva o resto
  const N = Math.max(1, Math.round(o.bloco_compassos))
  const blocos = []
  for (let i = 0; i < cromas.length; i += N) {
    const fimC = Math.min(cromas.length, i + N)
    if (fimC - i < N && blocos.length) {
      const u = blocos.at(-1)
      u.cromas.push(...cromas.slice(i, fimC))
      u.fim = limites[fimC]
      continue
    }
    blocos.push({ ini: limites[i], fim: limites[fimC], cromas: cromas.slice(i, fimC) })
  }
  for (const b of blocos) b.energia = energiaMedia(medidas, b.ini, b.fim)
  // a anacruse (antes do primeiro compasso) entra na primeira frase
  blocos[0].ini = 0
  blocos.at(-1).fim = duracao
  // frases seguidas e parecidas, sem salto de energia, são a mesma parte
  const partes = []
  blocos.forEach((b, i) => {
    const ant = partes.at(-1)
    if (ant && semelhanca(blocos, i - 1, i) >= o.continua_min && Math.abs(b.energia - blocos[i - 1].energia) < o.salto_db) {
      ant.blocos.push(i)
      ant.fim = b.fim
    } else partes.push({ ini: b.ini, fim: b.fim, blocos: [i] })
  })
  for (const p of partes) p.energia = energiaMedia(medidas, p.ini, p.fim)
  // grupos: a parte que volta com os mesmos acordes (a primeira frase de uma contra as frases da outra)
  const sim = (a, b) => Math.max(...b.blocos.map((y) => semelhanca(blocos, a.blocos[0], y)), ...a.blocos.map((x) => semelhanca(blocos, x, b.blocos[0])))
  let letra = 0
  for (const p of partes) {
    const igual = partes.find((q) => q !== p && q.grupo && sim(p, q) >= o.repete_min)
    p.grupo = igual ? igual.grupo : String.fromCharCode(65 + letra++)
  }
  const porGrupo = new Map()
  for (const p of partes) porGrupo.set(p.grupo, [...(porGrupo.get(p.grupo) || []), p])
  const energias = partes.map((p) => p.energia).sort((a, b) => a - b)
  const mediana = energias[Math.floor(energias.length / 2)]
  // refrão: o grupo que se repete e é o mais forte; sem repetição, a parte mais forte se passar da mediana
  const repetidos = [...porGrupo.entries()].filter(([, ps]) => ps.length >= 2)
  const forca = (ps) => ps.reduce((s, p) => s + p.energia, 0) / ps.length
  let grupoRefrao = null
  if (repetidos.length) grupoRefrao = repetidos.sort((a, b) => forca(b[1]) - forca(a[1]))[0][0]
  else {
    const forte = partes.slice().sort((a, b) => b.energia - a.energia)[0]
    if (partes.length > 1 && forte.energia >= mediana + o.refrao_db) grupoRefrao = forte.grupo
  }
  const ehRefrao = (p) => p.grupo === grupoRefrao && (repetidos.length === 0 || p.energia >= forca(porGrupo.get(grupoRefrao)) - o.salto_db)
  partes.forEach((p, i) => {
    const longe = partes.length >= 3
    if (ehRefrao(p)) p.tipo = 'refrao'
    else if (longe && i === 0 && (p.energia < mediana || p.blocos.length === 1)) p.tipo = 'intro'
    else if (longe && i === partes.length - 1 && (p.energia < mediana || p.grupo === partes[0].grupo)) p.tipo = 'final'
    // pré-refrão: uma frase só, entre um verso e o refrão, com acordes próprios
    else if (i > 1 && p.blocos.length === 1 && partes[i + 1] && ehRefrao(partes[i + 1]) && partes[i - 1].tipo === 'verso' && partes[i - 1].grupo !== p.grupo) p.tipo = 'pre'
    else if (porGrupo.get(p.grupo).length === 1 && partes.slice(0, i).some(ehRefrao) && i < partes.length - 1) p.tipo = 'ponte'
    else p.tipo = 'verso'
  })
  const conta = {}
  const total = {}
  for (const p of partes) total[p.tipo] = (total[p.tipo] || 0) + 1
  return partes.map((p) => {
    conta[p.tipo] = (conta[p.tipo] || 0) + 1
    const nome = total[p.tipo] > 1 ? `${NOMES[p.tipo]} ${conta[p.tipo]}` : NOMES[p.tipo]
    return { ini: r3(p.ini), fim: r3(p.fim), tipo: p.tipo, nome, grupo: p.grupo, energia: Math.round(p.energia * 10) / 10 }
  })
}

/** Troca o tipo de uma parte (a pessoa corrige) e refaz os nomes ("Verso 1", "Refrão 2"…). */
export function renomearPartes(partes, i, tipo) {
  if (!TIPOS.includes(tipo) || !partes[i]) return partes
  const novas = partes.map((p, k) => (k === i ? { ...p, tipo } : p))
  const total = {}
  for (const p of novas) total[p.tipo] = (total[p.tipo] || 0) + 1
  const conta = {}
  return novas.map((p) => {
    conta[p.tipo] = (conta[p.tipo] || 0) + 1
    return { ...p, nome: total[p.tipo] > 1 ? `${NOMES[p.tipo]} ${conta[p.tipo]}` : NOMES[p.tipo] }
  })
}
