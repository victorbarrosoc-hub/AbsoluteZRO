// "A IA propõe, você aprova": cortes de silêncio e de respiro e zooms na fala viram propostas com motivo. Nada entra
// na edição até ser aprovado; aprovar e recusar se desfaz como qualquer outra ação.
//
// Silêncio: trecho abaixo do limiar da gravação (analise/silencio.js), menos uma folga de cada lado.
// Respiro: buraco entre duas palavras da transcrição que não é silêncio (puxada de ar, estalo de boca, "hã" que o
//          Whisper não escreveu), dentro de um tamanho de respiro.
// Zoom: uma frase sim, outra não, aproxima (punch-in); frase com "!" ou "?" aproxima mais. Foco fixo do preset (sem
//       detecção de rosto neste recorte: a pessoa arrasta o ponto na prévia).
// Nenhum corte entra numa palavra: o trecho encolhe até ficar fora das palavras (com uma margem).

import { mediaDb, niveis, silencios } from './analise/silencio.js'

let seq = 0
const novoId = (tipo) => `${tipo[0]}${Date.now().toString(36)}${(seq++).toString(36)}`
const r3 = (x) => Math.round(x * 1000) / 1000
const fmt = (s) => `${s.toFixed(1).replace('.', ',')} s`

/** Encolhe [ini, fim) para não pegar nenhuma palavra (com margem). Pode virar vários pedaços. */
export function foraDasPalavras(ini, fim, palavras, margem) {
  let pedacos = [{ ini, fim }]
  for (const p of palavras) {
    const a = p.ini - margem
    const b = p.fim + margem
    if (b <= ini || a >= fim) continue
    const prox = []
    for (const t of pedacos) {
      if (b <= t.ini || a >= t.fim) prox.push(t)
      else {
        if (a > t.ini) prox.push({ ini: t.ini, fim: a })
        if (b < t.fim) prox.push({ ini: b, fim: t.fim })
      }
    }
    pedacos = prox
  }
  return pedacos
}

/**
 * Propostas de corte para uma mídia. db = envelope (analise/silencio.js); palavras = transcrição [{ texto, ini, fim }]
 * (pode ser vazia: aí só silêncio); preset = prepararPreset(...).cortes; duracao em segundos.
 */
export function proporCortes({ midia, db, palavras = [], preset, duracao }) {
  const c = preset
  const { limiar } = niveis(db)
  const out = []
  const ordenadas = [...palavras].sort((a, b) => a.ini - b.ini)

  for (const s of silencios(db, { limiar, minS: c.silencio_min_s })) {
    // folga: um pouco de ar antes e depois da fala, para o corte não soar seco
    const ini = s.ini === 0 ? 0 : s.ini + c.folga_s
    const fim = s.fim >= duracao - 0.01 ? duracao : s.fim - c.folga_s
    for (const t of foraDasPalavras(ini, fim, ordenadas, c.margem_palavra_s)) {
      if (t.fim - t.ini < Math.max(c.sobra_min_s, 0.1)) continue
      out.push({ id: novoId('silencio'), tipo: 'silencio', midia, ini: r3(t.ini), fim: r3(t.fim), estado: 'pendente', motivo: `${fmt(s.fim - s.ini)} sem fala` })
    }
  }

  for (let i = 1; i < ordenadas.length; i++) {
    const a = ordenadas[i - 1].fim + c.margem_palavra_s
    const b = ordenadas[i].ini - c.margem_palavra_s
    const gap = ordenadas[i].ini - ordenadas[i - 1].fim
    if (gap < c.respiro_min_s || gap > c.respiro_max_s || b - a < c.sobra_min_s) continue
    // já é silêncio proposto? então não repete
    if (out.some((p) => p.ini < b && p.fim > a)) continue
    // silêncio de verdade (abaixo do limiar) e curto: é pausa natural da frase, fica
    if (mediaDb(db, a, b) < limiar) continue
    out.push({ id: novoId('respiro'), tipo: 'respiro', midia, ini: r3(a), fim: r3(b), estado: 'pendente', motivo: `respiro de ${fmt(gap)}` })
  }
  return out.sort((x, y) => x.ini - y.ini)
}

/** Frases da transcrição: quebra no ponto final, exclamação, interrogação ou numa pausa longa. */
export function frases(palavras, pausa = 0.6) {
  const out = []
  let atual = []
  const ordenadas = [...palavras].sort((a, b) => a.ini - b.ini)
  ordenadas.forEach((p, i) => {
    atual.push(p)
    const prox = ordenadas[i + 1]
    if (!prox || /[.!?…]["”']?$/.test(p.texto.trim()) || prox.ini - p.fim > pausa) {
      out.push(atual)
      atual = []
    }
  })
  return out
}

/** Propostas de zoom (punch-in) na fala. preset = prepararPreset(...).zoom */
export function proporZooms({ midia, palavras = [], preset }) {
  const z = preset
  const out = []
  let k = 0
  for (const f of frases(palavras, z.pausa_frase_s)) {
    const ini = f[0].ini
    const fim = Math.min(f.at(-1).fim, ini + z.max_s)
    if (fim - ini < z.frase_min_s) continue
    const ultima = f.at(-1).texto.trim()
    const forte = /[!?]["”']?$/.test(ultima)
    if (k++ % 2 === 0 && !forte) continue
    const escala = forte ? z.enfase : z.escala
    out.push({
      id: novoId('zoom'),
      tipo: 'zoom',
      midia,
      ini: r3(Math.max(0, ini - 0.05)),
      fim: r3(fim + 0.05),
      escala,
      foco: { ...z.foco },
      estado: 'pendente',
      motivo: forte ? `ênfase: "${ultima.slice(-24)}"` : `frase de ${fmt(fim - ini)}`,
    })
  }
  return out
}

/** Muda o estado de propostas (aprovar, recusar, voltar a pendente). Devolve a lista nova. */
export function marcar(propostas, ids, estado) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  let mudou = false
  const novas = propostas.map((p) => {
    if (!alvo.has(p.id) || p.estado === estado) return p
    mudou = true
    return { ...p, estado }
  })
  return mudou ? novas : propostas
}

/** Resumo para a tela: quantas de cada tipo e quanto tempo os cortes aprovados/pendentes tiram. */
export function resumo(propostas) {
  const r = { pendentes: 0, aprovadas: 0, recusadas: 0, cortes: 0, zooms: 0, tempoPendente: 0, tempoAprovado: 0 }
  for (const p of propostas) {
    r[p.estado === 'pendente' ? 'pendentes' : p.estado === 'aprovada' ? 'aprovadas' : 'recusadas']++
    if (p.tipo === 'zoom') r.zooms++
    else {
      r.cortes++
      if (p.estado === 'pendente') r.tempoPendente += p.fim - p.ini
      if (p.estado === 'aprovada') r.tempoAprovado += p.fim - p.ini
    }
  }
  return r
}
