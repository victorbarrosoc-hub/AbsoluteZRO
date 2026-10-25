// Análise de uma sequência montada (Beta): a partir da linha do tempo que o DaVinci devolve, acha onde cabe um efeito
// sonoro (cada corte, o começo, o fim e os picos de som dos clipes) e sugere sons da biblioteca do usuário pelo nome
// dos arquivos. Tudo aqui é cálculo puro: a tela (views/sfx.js) cuida do DaVinci e dos arquivos; os testes rodam no Node.

export const TIPOS = {
  abertura: { rotulo: 'Abertura', cor: 'Blue', tom: '#2a78d6', palavras: ['riser', 'rise', 'build', 'swell', 'intro', 'abertura', 'sweep', 'whoosh'], dur: [1, 8] },
  corte: { rotulo: 'Corte', cor: 'Purple', tom: '#6250d6', palavras: ['whoosh', 'swoosh', 'swish', 'woosh', 'swipe', 'transition', 'transicao', 'pass', 'zip', 'swoop'], dur: [0.2, 2.5] },
  impacto: { rotulo: 'Impacto', cor: 'Red', tom: '#e34948', palavras: ['hit', 'impact', 'boom', 'punch', 'thud', 'slam', 'impacto', 'batida', 'soco', 'kick', 'smash'], dur: [0.2, 3] },
  final: { rotulo: 'Final', cor: 'Orange', tom: '#eb6834', palavras: ['stinger', 'hit', 'boom', 'outro', 'final', 'tail', 'reverse', 'sub', 'drop'], dur: [0.5, 6] },
}

const JUNTO = 0.4 // segundos: pontos mais perto que isso viram um só

/** Quadro → "00:01:02:12" (timecode a partir do começo da sequência). */
export function tc(quadro, fps) {
  const f = Math.max(0, Math.round(quadro))
  const n = Math.round(fps) || 24
  const pad = (x) => String(x).padStart(2, '0')
  const s = Math.floor(f / n)
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(f % n)}`
}

/**
 * Pontos da sequência onde cabe um SFX.
 * linha: { fps, quadros, video: [[{ nome, inicio, fim }]], audio: [...] } (quadros a partir do começo dela)
 * picos: [{ quadro, forca, nome }] já na escala da sequência
 */
export function pontosDaSequencia(linha, picos = []) {
  const fps = Number(linha.fps) || 24
  const faixas = (linha.video || []).filter(Array.isArray)
  const clipes = faixas.flat().filter((c) => c && c.fim > c.inicio)
  if (!clipes.length) return []
  const pontos = []
  const comeco = Math.min(...clipes.map((c) => c.inicio))
  const fim = Math.max(...clipes.map((c) => c.fim))
  pontos.push({ quadro: comeco, tipo: 'abertura', motivo: 'Começo da sequência' })
  // cada clipe de vídeo que entra depois do começo é um corte (em qualquer faixa)
  for (const c of clipes.slice().sort((a, b) => a.inicio - b.inicio)) {
    if (c.inicio <= comeco) continue
    pontos.push({ quadro: c.inicio, tipo: 'corte', motivo: `Corte para ${c.nome || 'o próximo clipe'}` })
  }
  for (const p of picos) {
    if (p.quadro <= comeco || p.quadro >= fim) continue
    pontos.push({ quadro: p.quadro, tipo: 'impacto', motivo: `Pico de som${p.nome ? ` em ${p.nome}` : ''}`, forca: p.forca })
  }
  // o final fica meio segundo antes do último quadro (o som termina junto com a imagem)
  pontos.push({ quadro: Math.max(comeco, fim - Math.round(fps * 0.5)), tipo: 'final', motivo: 'Fim da sequência' })
  pontos.sort((a, b) => a.quadro - b.quadro || ordem(a.tipo) - ordem(b.tipo))
  // pontos colados: fica o mais importante (um corte em cima de um pico vira "corte com pico de som")
  const out = []
  for (const p of pontos) {
    const ult = out[out.length - 1]
    if (ult && (p.quadro - ult.quadro) / fps < JUNTO) {
      const tipos = [ult.tipo, p.tipo]
      if (tipos.includes('corte') && tipos.includes('impacto') && !ult.comPico) {
        ult.motivo = `${(ult.tipo === 'corte' ? ult : p).motivo}, com pico de som`
        ult.tipo = 'impacto'
        ult.comPico = true
      }
      continue
    }
    out.push({ ...p })
  }
  return out.map(({ comPico, ...p }, i) => ({ ...p, id: `p${i + 1}`, segundos: p.quadro / fps, tc: tc(p.quadro, fps) }))
}
const ordem = (t) => ['abertura', 'impacto', 'corte', 'final'].indexOf(t)

/**
 * Picos de som num sinal (o envelope de 4 kHz que o Synquei já extrai para sincronizar): onde a energia salta bem
 * acima do que vinha antes. Devolve segundos dentro do arquivo.
 */
export function picosDoSinal(sig, sr = 4000, { janela = 0.05, antes = 1, salto = 4, minimo = 0.02, distancia = 1.2 } = {}) {
  const n = Math.max(1, Math.round(sr * janela))
  const energia = []
  for (let i = 0; i + n <= sig.length; i += n) {
    let s = 0
    for (let k = i; k < i + n; k++) s += sig[k] * sig[k]
    energia.push(Math.sqrt(s / n))
  }
  const voltas = Math.max(1, Math.round(antes / janela))
  const out = []
  let ultimo = -Infinity
  for (let i = voltas; i < energia.length; i++) {
    const viz = energia.slice(i - voltas, i).sort((a, b) => a - b)
    const base = viz[Math.floor(viz.length / 2)] || 0
    const e = energia[i]
    const t = i * janela
    if (e >= minimo && e > base * salto && t - ultimo >= distancia) {
      out.push({ t: Math.round(t * 1000) / 1000, forca: base > 0 ? e / base : salto * 2 })
      ultimo = t
    }
  }
  return out
}

/** Picos de um clipe de áudio da sequência, levados para os quadros da sequência. */
export function picosNaSequencia(clipe, picosArquivo, fps) {
  const ini = clipe.entrada / fps
  const dur = (clipe.fim - clipe.inicio) / fps
  return picosArquivo
    .filter((p) => p.t >= ini && p.t < ini + dur)
    .map((p) => ({ quadro: Math.round(clipe.inicio + (p.t - ini) * fps), forca: p.forca, nome: clipe.nome }))
}

// ───────── biblioteca ─────────
const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
/** "Whoosh_FastSwipe 03.wav" → ["whoosh", "fast", "swipe"] */
export function palavras(texto) {
  return semAcento(String(texto).replace(/([a-z])([A-Z])/g, '$1 $2'))
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1)
}

// "Whooshes", "Impacts", "Hits" → também no singular (as pastas das bibliotecas costumam vir no plural)
const comSingular = (ws) => new Set(ws.flatMap((w) => [w, w.replace(/(sh|ch|ss|x)es$/, '$1').replace(/([^s])s$/, '$1')]))

/** Índice da biblioteca: cada som com as palavras do nome (peso 2) e das pastas (peso 1). */
export function indexar(arquivos) {
  return arquivos.map((a) => {
    const partes = a.rel.split('/')
    const nome = partes.pop().replace(/\.[^.]+$/, '')
    return { ...a, nome, doNome: comSingular(palavras(nome)), dasPastas: comSingular(partes.flatMap(palavras)) }
  })
}

/** As melhores opções da biblioteca para um ponto (sons já escolhidos perto perdem um pouco, para variar). */
export function sugerir(ponto, indice, { n = 3, usados = new Map() } = {}) {
  const t = TIPOS[ponto.tipo]
  if (!t || !indice.length) return []
  const notas = []
  for (const s of indice) {
    let nota = 0
    for (const w of t.palavras) {
      if (s.doNome.has(w)) nota += 2
      else if (s.dasPastas.has(w)) nota += 1
    }
    if (!nota) continue
    if (s.duracao != null) nota += s.duracao >= t.dur[0] && s.duracao <= t.dur[1] ? 0.5 : -0.5
    nota -= (usados.get(s.caminho) || 0) * 1.5
    notas.push({ s, nota })
  }
  notas.sort((a, b) => b.nota - a.nota || a.s.rel.localeCompare(b.s.rel))
  return notas.slice(0, n).map((x) => ({ caminho: x.s.caminho, rel: x.s.rel, nome: x.s.nome, duracao: x.s.duracao, nota: x.nota }))
}

/** Sugestões para todos os pontos, variando os sons ao longo da sequência. */
export function sugerirTodos(pontos, indice) {
  const usados = new Map()
  return pontos.map((p) => {
    const opcoes = sugerir(p, indice, { usados })
    if (opcoes[0]) usados.set(opcoes[0].caminho, (usados.get(opcoes[0].caminho) || 0) + 1)
    return { ...p, opcoes, escolhido: opcoes[0] ? opcoes[0].caminho : null, incluir: !!opcoes[0] }
  })
}

/** O pedido para o DaVinci: marcadores em todos os pontos e, se pedido, os sons escolhidos. */
export function pedidoSfx(nomeLinha, pontos, { sons = true, fps = 24 } = {}) {
  const marcadores = pontos.map((p) => ({ quadro: p.quadro, cor: TIPOS[p.tipo].cor, nome: `SFX · ${TIPOS[p.tipo].rotulo}`, nota: p.motivo + (p.escolhido && sons ? ` · ${p.escolhido.split(/[\\/]/).pop()}` : '') }))
  const escolhidos = sons
    ? pontos
        .filter((p) => p.incluir && p.escolhido)
        .map((p) => {
          const o = (p.opcoes || []).find((x) => x.caminho === p.escolhido)
          return { caminho: p.escolhido, quadro: p.quadro, quadros: o && o.duracao ? Math.max(1, Math.round(o.duracao * fps)) : null }
        })
    : []
  return { tipo: 'sfx', linha: nomeLinha, marcadores, sons: escolhidos }
}
