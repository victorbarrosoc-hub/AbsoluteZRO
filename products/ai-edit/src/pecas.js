// Peças: uma edição longa vira várias curtas. Cada marcador abre uma seção (src/marcadores.js › secoes); cada seção
// escolhida vira um projeto à parte, só com aquele trecho, em cada formato pedido (16:9, 9:16, 1:1, 4:5), com o nome do
// modelo e a margem pedida. A edição original nunca muda: a peça é uma cópia do projeto com a linha recortada, e o
// resto (legenda, efeitos sonoros, zoom) segue sozinho, porque tudo ali se prende à mídia de origem.
//
// Juntar: as seções escolhidas, na ordem que a pessoa quiser, numa linha nova (um projeto novo, o original intacto).

import { cortarEm, secoes } from './marcadores.js'
import { duracao, tamanho } from './linha.js'
import { paraSegundos, timecode } from './tempo.js'

/** Formatos de saída de uma peça. 'original' = o tamanho do projeto. */
export const FORMATOS_PECA = Object.freeze([
  { id: 'original', nome: 'Original', dica: 'O tamanho do projeto' },
  { id: '16x9', nome: '16:9', dica: 'YouTube, TV', largura: 1920, altura: 1080 },
  { id: '9x16', nome: '9:16', dica: 'Reels, Shorts, TikTok', largura: 1080, altura: 1920 },
  { id: '1x1', nome: '1:1', dica: 'Feed quadrado', largura: 1080, altura: 1080 },
  { id: '4x5', nome: '4:5', dica: 'Feed retrato', largura: 1080, altura: 1350 },
])
export const formatoPorId = (id) => FORMATOS_PECA.find((f) => f.id === id) || FORMATOS_PECA[0]

/** Modelo de nome padrão: número, nome da seção e formato. */
export const MODELO_PADRAO = '{n}_{nome}_{formato}'
const MARCAS = ['{n}', '{nome}', '{projeto}', '{formato}', '{duracao}']

/** Nome de arquivo seguro (sem barra, dois-pontos e afins), sem extensão. */
export function nomeSeguro(texto) {
  return (
    String(texto ?? '')
      .normalize('NFC')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .slice(0, 120) || 'peca'
  )
}

/**
 * Nome de uma peça pelo modelo: {n} (01, 02…), {nome} (da seção), {projeto}, {formato} (9x16…) e {duracao} (0m45s).
 * Sem {n} nem {nome} no modelo, o número entra na frente (duas peças nunca saem com o mesmo nome).
 */
export function nomeDaPeca(modelo, { n, nome, projeto, formato, segundos }) {
  const m = String(modelo || MODELO_PADRAO)
  const s = Math.round(segundos || 0)
  const vals = { '{n}': String(n).padStart(2, '0'), '{nome}': nome || `Parte ${n}`, '{projeto}': projeto || '', '{formato}': formato === 'original' ? '' : formato, '{duracao}': `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` }
  // formato original: a marca some com o separador colado nela (não sobra "_" no fim)
  const base = formato === 'original' ? m.replace(/[_\- ]?\{formato\}/g, '') : m
  let out = MARCAS.reduce((t, k) => t.split(k).join(vals[k]), base)
  if (!m.includes('{n}') && !m.includes('{nome}')) out = `${vals['{n}']}_${out}`
  return nomeSeguro(out.replace(/^[_\- ]+|[_\- ]+$/g, ''))
}

/** Fator de "preencher": quanto a imagem cresce, além de caber, para cobrir o quadro L × A sem faixa. */
const preencher = (L, A, cw, ch) => Math.max(L / cw, A / ch) / Math.min(L / cw, A / ch)

/**
 * O projeto de uma peça: uma cópia com a linha só da seção (mais a margem dos dois lados, sem passar da linha), os
 * marcadores de dentro trazidos para o começo, e no formato pedido. Em outro formato a imagem preenche o quadro
 * (centralizada; o ajuste de escala que for maior fica). { projeto, ini, fim } (ini/fim na linha original).
 */
export function projetoDaPeca(p, secao, { formato = 'original', margem = 0, nome } = {}) {
  const total = duracao(p.linha)
  const m = Math.max(0, Math.round(margem))
  const a = Math.max(0, secao.ini - m)
  const b = Math.min(total, secao.fim + m)
  const c = cortarEm(p.linha, a, b)
  const dentro = new Set(c.ids)
  let linha = { ...c.linha, clipes: c.linha.clipes.filter((x) => dentro.has(x.id)) }
  const f = formatoPorId(formato)
  const largura = f.largura || p.largura
  const altura = f.altura || p.altura
  if (largura !== p.largura || altura !== p.altura)
    linha = {
      ...linha,
      clipes: linha.clipes.map((cl) => {
        const md = p.midias.find((x) => x.id === cl.midia)
        if (!md?.temVideo || !md.largura || !md.altura) return cl
        const k = preencher(largura, altura, md.largura, md.altura)
        const escala = cl.ajustes?.escala ?? 1
        if (k <= escala + 1e-6) return cl
        return { ...cl, ajustes: { ...(cl.ajustes || {}), escala: Math.round(k * 10000) / 10000 } }
      }),
    }
  // só os marcadores da própria seção (o da seção seguinte, que cai na margem, não vai junto)
  const marcadores = (p.marcadores || []).filter((k) => k.q >= Math.max(c.ini, secao.ini) && k.q < Math.min(c.fim, secao.fim)).map((k) => ({ ...k, q: k.q - c.ini }))
  return {
    projeto: { ...p, id: `${p.id}-peca-${secao.n}-${f.id}`, nome: nome || secao.marcador?.nome || p.nome, largura, altura, linha, marcadores },
    ini: c.ini,
    fim: c.fim,
  }
}

/**
 * O plano da entrega em peças: uma peça por seção escolhida × formato. ids = ids dos marcadores (todas, sem dizer).
 * [{ secao, formato, nome, projeto, ini, fim, quadros }] na ordem da linha, formato a formato.
 */
export function planoDePecas(p, { ids, formatos = ['original'], modelo = MODELO_PADRAO, margem = 0 } = {}) {
  const escolhidas = secoes(p).filter((s) => !ids || ids.includes(s.marcador.id))
  const usados = new Map()
  const out = []
  for (const s of escolhidas)
    for (const formato of formatos) {
      const segundos = paraSegundos(s.quadros, p.fps)
      let nome = nomeDaPeca(modelo, { n: s.n, nome: s.marcador.nome, projeto: p.nome, formato, segundos })
      // o mesmo nome duas vezes (seções com nome igual e modelo sem número): o segundo ganha o número
      const vezes = usados.get(nome.toLowerCase()) || 0
      usados.set(nome.toLowerCase(), vezes + 1)
      if (vezes) nome = nomeSeguro(`${nome} (${vezes + 1})`)
      const r = projetoDaPeca(p, s, { formato, margem, nome })
      out.push({ secao: s, formato, nome, projeto: r.projeto, ini: r.ini, fim: r.fim, quadros: r.fim - r.ini })
    }
  return out
}

const aspas = (v) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))

/**
 * Relatório da entrega (CSV): uma linha por arquivo gerado. itens: [{ peca (de planoDePecas), arquivos: [nome], ok }].
 */
export function relatorio(p, itens) {
  const cab = 'Peça,Seção,Formato,Entrada,Saída,Duração,Arquivos,Situação'
  const linhas = itens.map(({ peca, arquivos, ok, erro }) =>
    [peca.nome, peca.secao.marcador.nome || `Parte ${peca.secao.n}`, formatoPorId(peca.formato).nome, timecode(peca.ini, p.fps), timecode(peca.fim, p.fps), timecode(peca.quadros, p.fps), (arquivos || []).join(' | '), ok ? 'pronto' : `falhou: ${erro || ''}`].map(aspas).join(','),
  )
  return `${[cab, ...linhas].join('\n')}\n`
}

let seq = 0
const novoId = () => `c${Date.now().toString(36)}j${(seq++).toString(36)}`

/**
 * As seções destes marcadores, na ordem dada, numa linha só: { linha, marcadores } para um projeto novo. Cada seção
 * leva os seus marcadores. O que vem antes do primeiro marcador não entra (não é seção).
 */
export function juntarSecoes(p, ordem) {
  const porId = new Map(secoes(p).map((s) => [s.marcador.id, s]))
  const vistos = new Set()
  const clipes = []
  const marcadores = []
  let t = 0
  for (const id of ordem) {
    const s = porId.get(id)
    if (!s || vistos.has(id)) continue
    vistos.add(id)
    const c = cortarEm(p.linha, s.ini, s.fim)
    const dentro = new Set(c.ids)
    const pedaco = c.linha.clipes.filter((x) => dentro.has(x.id))
    const ids = new Set(clipes.map((x) => x.id))
    for (const x of pedaco) clipes.push(ids.has(x.id) ? { ...x, id: novoId() } : x)
    for (const k of p.marcadores || []) if (k.q >= c.ini && k.q < c.fim) marcadores.push({ ...k, q: t + (k.q - c.ini) })
    t += pedaco.reduce((n, x) => n + tamanho(x), 0)
  }
  return { linha: { ...p.linha, clipes }, marcadores }
}
