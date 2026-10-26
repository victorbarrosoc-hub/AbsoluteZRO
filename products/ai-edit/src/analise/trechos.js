// Pedaços para o Whisper (que lê até 30 s de cada vez): corta no ponto mais quieto entre `min` e `alvo` segundos, para
// nenhuma palavra ficar partida entre dois pedaços. Pedaço todo em silêncio fica de fora (o Whisper inventa texto
// no silêncio).

import { JANELA_S, mediaDb, niveis } from './silencio.js'

export function trechosParaTranscrever(db, duracao, { alvo = 28, min = 16 } = {}) {
  const { limiar } = niveis(db)
  const out = []
  let ini = 0
  while (ini < duracao - 0.05) {
    let fim = Math.min(duracao, ini + alvo)
    if (fim < duracao) {
      // o ponto mais quieto (janela de 200 ms) entre ini+min e ini+alvo
      let melhor = fim
      let menor = Infinity
      for (let t = ini + min; t <= ini + alvo - 0.2; t += JANELA_S * 5) {
        const e = mediaDb(db, t, t + 0.2)
        if (e < menor) {
          menor = e
          melhor = t + 0.1
        }
      }
      fim = melhor
    }
    if (mediaDb(db, ini, fim) >= limiar || temFala(db, ini, fim, limiar)) out.push({ ini, fim })
    ini = fim
  }
  return out
}

function temFala(db, ini, fim, limiar) {
  const a = Math.floor(ini / JANELA_S)
  const b = Math.min(db.length, Math.ceil(fim / JANELA_S))
  let n = 0
  for (let j = a; j < b; j++) if (db[j] >= limiar) n++
  // pelo menos 0,3 s acima do limiar
  return n * JANELA_S >= 0.3
}

/** Junta a saída do Whisper de cada pedaço: [{ texto, ini, fim }] no tempo da mídia, sem palavras vazias. */
export function juntarPalavras(pedacos) {
  const out = []
  for (const { ini, fim, chunks } of pedacos)
    for (const c of chunks || []) {
      const texto = String(c.text || '').trim()
      const [a, b] = c.timestamp || []
      if (!texto || !Number.isFinite(a)) continue
      const wi = Math.min(fim, ini + a)
      const wf = Math.min(fim, ini + (Number.isFinite(b) ? b : a + 0.3))
      out.push({ texto, ini: Math.round(wi * 1000) / 1000, fim: Math.round(Math.max(wf, wi + 0.02) * 1000) / 1000 })
    }
  return out
}
