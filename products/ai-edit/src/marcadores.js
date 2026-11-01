// Marcadores que fazem coisas. O marcador é um ponto da linha (quadro q) com nome, nota e cor; cada um abre uma seção
// que vai até o próximo (ou o fim): é isso que vira peça na Entrega (src/pecas.js), capítulo do YouTube e trecho que se
// tira de uma vez. Tudo puro e imutável, como a linha: a interface (app/marcadores-ui.js) só chama e desenha.
//
// Entrada sem IA, e exata: notas com tempo coladas de qualquer lugar ("00:12 Logo pequeno", "[1:02] tirar", lista de
// capítulos do YouTube, comentários do Frame.io), SRT e planilha (CSV). Saída: capítulos do YouTube conferidos pelas
// regras de lá, CSV e as notas em todos os exportadores (src/exportar).

import { CORES } from './cores.js'
import { dividir, duracao, posicoes, tamanho } from './linha.js'
import { fpsNominal, paraQuadros, paraSegundos, timecode } from './tempo.js'

/** Cores do marcador: as mesmas da organização dos clipes (src/cores.js). */
export const CORES_MARCADOR = CORES.map((c) => c.id)
const NOME_MAX = 60
const NOTA_MAX = 500

let seq = 0
const novoId = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`
const limpo = (t, max) =>
  String(t ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
const corValida = (c) => (CORES_MARCADOR.includes(c) ? c : null)
const marcadoresDe = (p) => p.marcadores || []
const ordenar = (ms) => ms.slice().sort((a, b) => a.q - b.q || a.id.localeCompare(b.id))

/** Um marcador limpo: { id, q, nome, nota?, cor? } (o que não tem valor não entra). */
function montar({ id, q, nome, nota, cor }) {
  const m = { id: id || novoId(), q: Math.max(0, Math.round(q)), nome: limpo(nome, NOME_MAX) }
  const n = limpo(nota, NOTA_MAX)
  if (n) m.nota = n
  const c = corValida(cor)
  if (c) m.cor = c
  return m
}

/**
 * Marca o quadro q da linha. Já existe marcador ali: nada muda (devolve o mesmo projeto e o id dele).
 * { projeto, id }
 */
export function marcar(p, q, { nome = '', nota = '', cor = null } = {}) {
  const qq = Math.max(0, Math.round(q))
  const ja = marcadoresDe(p).find((m) => m.q === qq)
  if (ja) return { projeto: p, id: ja.id }
  const m = montar({ q: qq, nome, nota, cor })
  return { projeto: { ...p, marcadores: ordenar([...marcadoresDe(p), m]) }, id: m.id }
}

/** Muda nome, nota ou cor dos marcadores (só as chaves dadas; '' ou null tira). */
export function editarMarcadores(p, ids, mudanca) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  let mudou = false
  const marcadores = marcadoresDe(p).map((m) => {
    if (!alvo.has(m.id)) return m
    const novo = montar({
      ...m,
      ...('nome' in mudanca ? { nome: mudanca.nome } : {}),
      ...('nota' in mudanca ? { nota: mudanca.nota } : {}),
      ...('cor' in mudanca ? { cor: mudanca.cor } : {}),
    })
    if (JSON.stringify(novo) === JSON.stringify(m)) return m
    mudou = true
    return novo
  })
  return mudou ? { ...p, marcadores } : p
}

export function removerMarcadores(p, ids) {
  const fora = new Set(Array.isArray(ids) ? ids : [ids])
  const marcadores = marcadoresDe(p).filter((m) => !fora.has(m.id))
  return marcadores.length === marcadoresDe(p).length ? p : { ...p, marcadores }
}

/**
 * Desloca marcadores `delta` quadros (positivo = para a frente), sem sair da linha. O que cairia em cima de outro
 * marcador fica onde estava. { projeto, movidos }
 */
export function deslocarMarcadores(p, ids, delta) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  const d = Math.round(delta)
  const fim = Math.max(0, duracao(p.linha) - 1)
  if (!d) return { projeto: p, movidos: 0 }
  const fixos = new Set(marcadoresDe(p).filter((m) => !alvo.has(m.id)).map((m) => m.q))
  const ocupados = new Set(fixos)
  let movidos = 0
  // na direção do movimento, os da frente primeiro: um não bloqueia o vizinho que também anda
  const ordem = ordenar(marcadoresDe(p).filter((m) => alvo.has(m.id)))
  if (d > 0) ordem.reverse()
  const novos = new Map()
  for (const m of ordem) {
    const q = Math.max(0, Math.min(fim, m.q + d))
    if (q === m.q || ocupados.has(q)) {
      ocupados.add(m.q)
      continue
    }
    ocupados.add(q)
    novos.set(m.id, q)
    movidos++
  }
  if (!movidos) return { projeto: p, movidos }
  return { projeto: { ...p, marcadores: ordenar(marcadoresDe(p).map((m) => (novos.has(m.id) ? { ...m, q: novos.get(m.id) } : m))) }, movidos }
}

/**
 * Seções da linha: cada marcador abre uma que vai até o próximo marcador (ou o fim da linha). Marcador fora da linha
 * (depois do fim, por um corte) não abre seção. [{ marcador, ini, fim, quadros, n }] em ordem (n começa em 1).
 */
export function secoes(p) {
  const total = duracao(p.linha)
  const ms = ordenar(marcadoresDe(p)).filter((m) => m.q < total)
  return ms.map((m, i) => {
    const fim = i + 1 < ms.length ? ms[i + 1].q : total
    return { marcador: m, ini: m.q, fim, quadros: fim - m.q, n: i + 1 }
  })
}

/**
 * Um marcador em cada começo de clipe (ou só nos clipes com etiqueta): o nome é a etiqueta, senão o nome da mídia, e
 * a cor é a do clipe. Onde já há marcador, nada muda. { projeto, novos }
 */
export function marcarClipes(p, { soEtiquetados = false } = {}) {
  let atual = p
  let novos = 0
  for (const { clipe, inicio } of posicoes(p.linha)) {
    if (soEtiquetados && !clipe.etiqueta) continue
    const midia = p.midias.find((m) => m.id === clipe.midia)
    const nome = clipe.etiqueta || (midia?.nome || 'Clipe').replace(/\.[^.]+$/, '')
    const r = marcar(atual, inicio, { nome, cor: clipe.cor || midia?.cor || null })
    if (r.projeto !== atual) novos++
    atual = r.projeto
  }
  return { projeto: atual, novos }
}

// ───────── tempo escrito por gente ─────────

/**
 * Lê um tempo escrito: "01:02:03:04" (timecode com quadros), "1:02:03", "02:03", "2:03.5", "75" ou "75,5" (segundos).
 * Devolve quadros da linha, ou null se não é um tempo.
 */
export function lerTempo(texto, fps) {
  const t = String(texto ?? '')
    .trim()
    .replace(',', '.')
  if (!t) return null
  if (/^\d+(\.\d+)?$/.test(t)) return paraQuadros(Number(t), fps)
  const tc = t.match(/^(\d{1,2})[:;](\d{2})[:;](\d{2})[:;.](\d{2})$/)
  if (tc) {
    const [h, m, s, f] = tc.slice(1).map(Number)
    if (m > 59 || s > 59 || f >= fpsNominal(fps)) return null
    // timecode sem drop-frame: quadros contados na base nominal (como o timecode() daqui)
    return (h * 3600 + m * 60 + s) * fpsNominal(fps) + f
  }
  const hms = t.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(\.\d+)?$/)
  if (!hms) return null
  const h = Number(hms[1] || 0)
  const m = Number(hms[2])
  const s = Number(hms[3]) + Number(hms[4] || 0)
  if ((hms[1] && m > 59) || s >= 60) return null
  return paraQuadros(h * 3600 + m * 60 + s, fps)
}

// o tempo no começo da linha, solto ou entre [] ou (), e o separador depois dele
const TEMPO_NA_LINHA = /^\s*(?:[-*•]\s*)?[[(]?\s*(\d{1,2}(?:[:;]\d{2}){1,3}(?:[.,]\d+)?)\s*[\])]?\s*(?:[-–—:|]\s*)?(.*)$/

/**
 * Notas com tempo, uma por linha, de onde vierem: revisão do cliente, lista de capítulos, comentários exportados.
 * "00:12 Logo pequeno", "[1:02] Tirar o respiro", "1:02:03 - Corrigir a cor", "01:00:12:05 | Fulano: trocar a música".
 * Linha sem tempo no começo é continuação da nota anterior. [{ q, texto }] na ordem do texto.
 */
export function lerNotas(texto, fps) {
  const out = []
  for (const linha of String(texto ?? '').split(/\r?\n/)) {
    if (!linha.trim()) continue
    const m = linha.match(TEMPO_NA_LINHA)
    const q = m ? lerTempo(m[1], fps) : null
    if (q === null) {
      if (out.length) out.at(-1).texto = limpo(`${out.at(-1).texto} ${linha}`, NOTA_MAX)
      continue
    }
    out.push({ q, texto: limpo(m[2], NOTA_MAX) })
  }
  return out
}

/** Legenda SRT: um item por bloco, no começo dele. [{ q, texto }] */
export function lerSrt(texto, fps) {
  const out = []
  for (const bloco of String(texto ?? '').split(/\r?\n\s*\r?\n/)) {
    const linhas = bloco.split(/\r?\n/).filter((l) => l.trim())
    const i = linhas.findIndex((l) => /-->/.test(l))
    if (i < 0) continue
    const ini = linhas[i].split('-->')[0].trim().replace(',', '.')
    const q = lerTempo(ini, fps)
    if (q === null) continue
    out.push({ q, texto: limpo(linhas.slice(i + 1).join(' ').replace(/<[^>]+>/g, ''), NOTA_MAX) })
  }
  return out
}

/** Divide uma linha de CSV (aspas com "" dentro) no separador dado. */
function campos(linha, sep) {
  const out = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]
    if (aspas) {
      if (ch === '"' && linha[i + 1] === '"') {
        atual += '"'
        i++
      } else if (ch === '"') aspas = false
      else atual += ch
    } else if (ch === '"') aspas = true
    else if (ch === sep) {
      out.push(atual)
      atual = ''
    } else atual += ch
  }
  out.push(atual)
  return out.map((c) => c.trim())
}

const COLUNAS = {
  tempo: /^(tempo|time|timecode|in|entrada|início|inicio|start|tc)$/i,
  nome: /^(nome|name|título|titulo|title|marcador|marker)$/i,
  nota: /^(nota|notas|note|notes|comentário|comentario|comment|comments|descrição|descricao|description)$/i,
  cor: /^(cor|color|colour)$/i,
}

/**
 * Planilha (CSV com vírgula, ponto e vírgula ou tab), com ou sem cabeçalho. Sem cabeçalho: tempo, nome, nota, cor.
 * Cor por id (laranja…) ou nome (Laranja, ou o rótulo do Premiere). [{ q, nome, nota, cor }]
 */
export function lerCsv(texto, fps) {
  const linhas = String(texto ?? '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
  if (!linhas.length) return []
  const sep = [';', '\t', ','].map((s) => [s, linhas[0].split(s).length]).sort((a, b) => b[1] - a[1])[0][0]
  let col = { tempo: 0, nome: 1, nota: 2, cor: 3 }
  let corpo = linhas
  const cab = campos(linhas[0], sep)
  if (lerTempo(cab[0], fps) === null && cab.some((c) => COLUNAS.tempo.test(c))) {
    col = {}
    for (const [k, re] of Object.entries(COLUNAS)) col[k] = cab.findIndex((c) => re.test(c))
    corpo = linhas.slice(1)
  }
  const corDe = (v) => {
    const t = String(v || '').toLowerCase()
    return CORES.find((c) => c.id === t || c.nome.toLowerCase() === t || c.premiere.toLowerCase() === t)?.id || null
  }
  const out = []
  for (const l of corpo) {
    const c = campos(l, sep)
    const q = col.tempo >= 0 ? lerTempo(c[col.tempo], fps) : null
    if (q === null) continue
    out.push({ q, nome: col.nome >= 0 ? limpo(c[col.nome], NOME_MAX) : '', nota: col.nota >= 0 ? limpo(c[col.nota], NOTA_MAX) : '', cor: col.cor >= 0 ? corDe(c[col.cor]) : null })
  }
  return out
}

/**
 * Lê o que a pessoa colou ou abriu: SRT, CSV ou notas com tempo (o primeiro que entender). { tipo, itens }
 * itens: [{ q, nome, nota, cor }] com o nome tirado do começo do texto (o resto vira nota).
 */
export function lerEntrada(texto, fps, nomeArquivo = '') {
  const t = String(texto ?? '')
  if (/\.srt$/i.test(nomeArquivo) || /^\s*\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->/m.test(t)) return { tipo: 'srt', itens: lerSrt(t, fps).map(nomeENota) }
  if (/\.(csv|tsv)$/i.test(nomeArquivo)) return { tipo: 'csv', itens: lerCsv(t, fps) }
  const notas = lerNotas(t, fps)
  if (notas.length) return { tipo: 'notas', itens: notas.map(nomeENota) }
  const csv = lerCsv(t, fps)
  return { tipo: csv.length ? 'csv' : 'nada', itens: csv }
}

/** Texto curto vira nome; comprido vira nome (o começo) e nota (o texto inteiro). */
function nomeENota({ q, texto }) {
  const t = limpo(texto, NOTA_MAX)
  if (t.length <= 40) return { q, nome: t, nota: '', cor: null }
  const corte = t.slice(0, 40).replace(/\s+\S*$/, '') || t.slice(0, 40)
  return { q, nome: `${corte}…`, nota: t, cor: null }
}

/**
 * Põe na linha o que veio de lerEntrada. O que cai depois do fim da linha não entra; onde já há marcador, a nota
 * nova soma à dele. cor: a de todos os novos (as notas do cliente, numa cor só). { projeto, novos, juntos, fora }
 */
export function importar(p, itens, { cor = null } = {}) {
  const total = duracao(p.linha)
  let atual = p
  let novos = 0
  let juntos = 0
  let fora = 0
  for (const it of itens) {
    if (it.q >= total) {
      fora++
      continue
    }
    const ja = marcadoresDe(atual).find((m) => m.q === it.q)
    if (ja) {
      const extra = [it.nome, it.nota].filter(Boolean).join(' · ')
      if (extra && !(ja.nota || '').includes(extra)) {
        atual = editarMarcadores(atual, ja.id, { nota: [ja.nota, extra].filter(Boolean).join(' · ') })
        juntos++
      }
      continue
    }
    atual = marcar(atual, it.q, { nome: it.nome, nota: it.nota, cor: it.cor || cor }).projeto
    novos++
  }
  return { projeto: atual, novos, juntos, fora }
}

// ───────── saída ─────────

/** "0:09", "1:02:05": como o YouTube escreve. */
function tempoYoutube(q, fps) {
  const t = Math.floor(paraSegundos(q, fps) + 1e-6)
  const h = Math.floor(t / 3600)
  const m = Math.floor(t / 60) % 60
  const s = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/**
 * Capítulos do YouTube a partir das seções, com a conferência das regras de lá (o primeiro em 0:00, pelo menos três,
 * cada um com 10 s ou mais). Sem marcador no 0, entra "Início". { texto, problemas: [texto], capitulos }
 */
export function capitulosYoutube(p, { inicio = 'Início' } = {}) {
  const ss = secoes(p)
  const caps = ss.map((s) => ({ q: s.ini, nome: s.marcador.nome || `Parte ${s.n}`, quadros: s.quadros }))
  if (!caps.length || caps[0].q > 0) caps.unshift({ q: 0, nome: inicio, quadros: caps.length ? caps[0].q : duracao(p.linha) })
  const problemas = []
  if (caps.length < 3) problemas.push('O YouTube pede pelo menos 3 capítulos.')
  const curtos = caps.filter((c) => paraSegundos(c.quadros, p.fps) < 10)
  if (curtos.length) problemas.push(`${curtos.length === 1 ? 'Um capítulo tem' : `${curtos.length} capítulos têm`} menos de 10 s: ${curtos.map((c) => c.nome).join(', ')}.`)
  const texto = caps.map((c) => `${tempoYoutube(c.q, p.fps)} ${c.nome}`).join('\n')
  return { texto, problemas, capitulos: caps }
}

const aspasCsv = (v) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))

/** CSV dos marcadores (abre em qualquer planilha e volta pelo lerCsv). */
export function paraCsv(p) {
  const cab = 'Tempo,Nome,Nota,Cor,Duração'
  const ss = new Map(secoes(p).map((s) => [s.marcador.id, s]))
  const linhas = ordenar(marcadoresDe(p)).map((m) => {
    const s = ss.get(m.id)
    return [timecode(m.q, p.fps), m.nome, m.nota || '', m.cor || '', s ? timecode(s.quadros, p.fps) : ''].map(aspasCsv).join(',')
  })
  return `${[cab, ...linhas].join('\n')}\n`
}

/**
 * Conferência antes de entregar: marcador fora da linha (um corte encurtou o vídeo), sem nome, seção curta demais e
 * nomes repetidos (as peças sairiam com o mesmo nome). [{ tipo, texto, ids }]
 */
export function conferir(p, { secaoMinima = 1 } = {}) {
  const total = duracao(p.linha)
  const out = []
  const fora = marcadoresDe(p).filter((m) => m.q >= total)
  if (fora.length) out.push({ tipo: 'fora', texto: `${fora.length === 1 ? 'Um marcador ficou' : `${fora.length} marcadores ficaram`} depois do fim do vídeo.`, ids: fora.map((m) => m.id) })
  const ss = secoes(p)
  const semNome = ss.filter((s) => !s.marcador.nome)
  if (semNome.length) out.push({ tipo: 'sem-nome', texto: `${semNome.length === 1 ? 'Um marcador está' : `${semNome.length} marcadores estão`} sem nome.`, ids: semNome.map((s) => s.marcador.id) })
  const curtas = ss.filter((s) => paraSegundos(s.quadros, p.fps) < secaoMinima)
  if (curtas.length) out.push({ tipo: 'curta', texto: `${curtas.length === 1 ? 'Uma seção tem' : `${curtas.length} seções têm`} menos de ${secaoMinima} s.`, ids: curtas.map((s) => s.marcador.id) })
  const porNome = new Map()
  for (const s of ss) if (s.marcador.nome) porNome.set(s.marcador.nome.toLowerCase(), [...(porNome.get(s.marcador.nome.toLowerCase()) || []), s.marcador.id])
  const repetidos = [...porNome.values()].filter((ids) => ids.length > 1).flat()
  if (repetidos.length) out.push({ tipo: 'repetido', texto: 'Há nomes repetidos: as peças levam o número na frente.', ids: repetidos })
  return out
}

// ───────── trechos da linha ─────────

/**
 * A linha cortada nos quadros a e b: { linha, ini, fim } com os clipes que tocam em [ini, fim) já separados. Em câmera
 * lenta o corte cai no quadro de origem mais perto, então ini e fim podem andar um pouco em relação a a e b.
 */
export function cortarEm(linha, a, b) {
  const l = dividir(dividir(linha, a), b)
  const ps = posicoes(l)
  // o clipe é do trecho quando o meio dele cai dentro: o corte em câmera lenta não arrasta vizinho
  const dentro = ps.filter(({ clipe, inicio }) => {
    const meio = inicio + tamanho(clipe) / 2
    return meio >= a && meio < b
  })
  if (!dentro.length) return { linha: l, ids: [], ini: a, fim: a }
  const ini = dentro[0].inicio
  const fim = dentro.at(-1).inicio + tamanho(dentro.at(-1).clipe)
  return { linha: l, ids: dentro.map((x) => x.clipe.id), ini, fim }
}

/**
 * Tira da linha as seções destes marcadores (o "erro" que vai do marcador ao próximo), fechando o buraco. Os
 * marcadores tirados somem; os de depois andam junto com a imagem. { projeto, tirados (quadros) }
 */
export function tirarSecoes(p, ids) {
  const alvo = new Set(Array.isArray(ids) ? ids : [ids])
  const ss = secoes(p)
    .filter((s) => alvo.has(s.marcador.id))
    .sort((a, b) => b.ini - a.ini)
  if (!ss.length) return { projeto: p, tirados: 0 }
  let linha = p.linha
  let marcadores = marcadoresDe(p)
  let tirados = 0
  // de trás para a frente: cortar um trecho não muda onde estão os de antes
  for (const s of ss) {
    const c = cortarEm(linha, s.ini, s.fim)
    if (!c.ids.length) continue
    const fora = new Set(c.ids)
    linha = { ...c.linha, clipes: c.linha.clipes.filter((x) => !fora.has(x.id)) }
    const n = c.fim - c.ini
    tirados += n
    marcadores = marcadores.filter((m) => m.id !== s.marcador.id && !(m.q >= c.ini && m.q < c.fim)).map((m) => (m.q >= c.fim ? { ...m, q: m.q - n } : m))
  }
  return { projeto: { ...p, linha, marcadores }, tirados }
}

/** Seção que contém o quadro q (a do último marcador antes dele), ou null antes do primeiro. */
export function secaoEm(p, q) {
  return secoes(p).find((s) => q >= s.ini && q < s.fim) || null
}
