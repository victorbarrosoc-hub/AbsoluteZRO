// Peças comuns da tela Entregar: que fotos entram, os estilos da pessoa, números e tempos em português, os ícones que
// só esta tela usa e a miniatura.

import { html } from '../../preact.js'
import { usarMiniatura } from '../../estado.js'
import { FAMILIAS, normalizarBiblioteca, todas } from '../../../src/estilo/biblioteca.js'
import { idDoLook } from '../../../src/estilo/predefinicao.js'

// ─────────── que fotos ───────────

/** As fotos de um critério, na ordem do catálogo. `estrelas`: o mínimo do critério 'nota'. */
export function fotosDe(catalogo, criterio, { estrelas = 3 } = {}) {
  const todasAs = catalogo.fotos()
  switch (criterio) {
    case 'escolhidas':
      return todasAs.filter((f) => f.marca === 'escolhida')
    case 'selecao':
      return catalogo.selecionadas()
    case 'nota':
      return todasAs.filter((f) => (f.estrelas || 0) >= estrelas)
    case 'filtro':
      return catalogo.visiveis()
    case 'cliente':
      return todasAs.filter((f) => f.cliente?.escolhida)
    case 'todas':
      return todasAs
    default:
      return []
  }
}

/** Quantas fotos em cada critério (para as pílulas). */
export function contarCriterios(catalogo, estrelas) {
  const fotos = catalogo.fotos()
  let escolhidas = 0
  let nota = 0
  let cliente = 0
  for (const f of fotos) {
    if (f.marca === 'escolhida') escolhidas++
    if ((f.estrelas || 0) >= estrelas) nota++
    if (f.cliente?.escolhida) cliente++
  }
  return { escolhidas, selecao: catalogo.selecao().size, nota, filtro: catalogo.visiveis().length, cliente, todas: fotos.length }
}

/**
 * A ordem da galeria: a do catálogo, com cada pilha de parecidas junta e a melhor na frente (a que a decupagem
 * escolheu; sem ela, a de maior nota). Devolve [{ foto, ordem, grupo, melhor }].
 */
export function ordemDaGaleria(fotos) {
  const porGrupo = new Map()
  for (const f of fotos) if (f.grupo) porGrupo.set(f.grupo, [...(porGrupo.get(f.grupo) || []), f])
  const melhorDe = (lista) => lista.find((f) => f.escolha?.escolhida) ?? [...lista].sort((a, b) => (b.magnitude?.total ?? -1) - (a.magnitude?.total ?? -1))[0]
  const saida = []
  const feitos = new Set()
  for (const f of fotos) {
    if (feitos.has(f.id)) continue
    const lista = f.grupo ? porGrupo.get(f.grupo) : null
    if (!lista || lista.length < 2) {
      feitos.add(f.id)
      saida.push({ foto: f, grupo: null, melhor: false })
      continue
    }
    const melhor = melhorDe(lista)
    for (const g of [melhor, ...lista.filter((x) => x !== melhor)]) {
      feitos.add(g.id)
      saida.push({ foto: g, grupo: String(f.grupo).slice(0, 64), melhor: g === melhor })
    }
  }
  return saida.map((x, ordem) => ({ ...x, ordem }))
}

// ─────────── os estilos da pessoa (a biblioteca da tela Estilos, só leitura) ───────────

// O mesmo banco de app/telas/estilos/acervo.js ('foto-estilos', loja 'kv', chave 'biblioteca'): abre na versão 1 e
// cria a loja se for o primeiro a abrir, exatamente como lá.
function lerBiblioteca() {
  return new Promise((ok) => {
    try {
      const pedido = indexedDB.open('foto-estilos', 1)
      pedido.onupgradeneeded = () => pedido.result.createObjectStore('kv')
      pedido.onerror = () => ok(null)
      pedido.onblocked = () => ok(null)
      pedido.onsuccess = () => {
        try {
          const b = pedido.result
          const g = b.transaction('kv', 'readonly').objectStore('kv').get('biblioteca')
          g.onsuccess = () => {
            ok(g.result ?? null)
            b.close()
          }
          g.onerror = () => ok(null)
        } catch {
          ok(null)
        }
      }
    } catch {
      ok(null)
    }
  })
}

/** { lista, grupos: [[familia, [p]]], porId, look(id) } com os estilos da casa e os da pessoa. */
export async function carregarEstilos() {
  const estado = normalizarBiblioteca(await lerBiblioteca())
  const lista = todas(estado)
  const porId = new Map(lista.map((p) => [p.id, p]))
  const porLook = new Map(lista.filter((p) => p.look).map((p) => [idDoLook(p), p]))
  const familias = [...FAMILIAS, ...new Set(lista.map((p) => p.familia).filter((f) => !FAMILIAS.includes(f)))]
  const favoritas = estado.favoritos.map((id) => porId.get(id)).filter(Boolean)
  const grupos = [
    ...(favoritas.length ? [['Favoritos', favoritas]] : []),
    ...familias.map((f) => [f, lista.filter((p) => p.familia === f)]).filter(([, l]) => l.length),
  ]
  return { lista, grupos, porId, look: (id) => porLook.get(id) ?? null }
}

// ─────────── números ───────────

export const numero = (n) => Number(n || 0).toLocaleString('pt-BR')
export const fotosTexto = (n) => `${numero(n)} ${n === 1 ? 'foto' : 'fotos'}`

export function tamanhoTexto(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`
  return `${(mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
}

/** "menos de 1 min", "cerca de 3 min", "cerca de 1 h 10 min". */
export function tempoTexto(ms) {
  if (ms == null) return null
  const min = Math.round(ms / 60000)
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `cerca de ${min} min`
  return `cerca de ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`
}

export function dataTexto(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const esteAno = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', ...(esteAno ? {} : { year: 'numeric' }) })
}

// ─────────── ícones desta tela (mesmo traço de app/icones.js) ───────────

const CORPOS = {
  pausar: '<path d="M9 6.5v11M15 6.5v11"/>',
  tocar: '<path d="M8 5.8v12.4L18 12Z"/>',
  baixar: '<path d="M12 4.5v10.5"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  copiar: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  zip: '<path d="M6.5 3.5h8l4 4v13h-12Z"/><path d="M14.5 3.5v4h4"/><path d="M11 7v1.5M11 10.5V12M11 14v2.5"/>',
  coracao: '<path d="M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 1.9c0 5.3-7 9.6-7 9.6Z"/>',
  balao: '<path d="M5 6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4 3.5v-3.5H7a2 2 0 0 1-2-2Z"/>',
  atualizar: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4.5V8h-3.5"/>',
  computador: '<rect x="3.5" y="5" width="17" height="11" rx="2"/><path d="M9 19.5h6M12 16v3.5"/>',
}

export const Simbolo = ({ nome, classe }) =>
  html`<svg
    class=${classe}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: CORPOS[nome] ?? '' }}
  ></svg>`

/** A miniatura de uma foto do catálogo (a mesma da grade). */
export function Miniatura({ loja, id, classe, estilo }) {
  const url = usarMiniatura(loja, id)
  return html`<span class=${`mini ${classe || ''}`} style=${estilo}>${url ? html`<img src=${url} alt="" draggable="false" decoding="async" />` : null}</span>`
}

/** Copia para a área de transferência; devolve se deu. */
export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}

/** Carrega o CSS desta tela uma vez (a casca não sabe dele; a CSP aceita folha da própria origem). */
export function usarFolhaDeEstilo() {
  if (typeof document === 'undefined' || document.querySelector('link[data-entregar]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = new URL('./entregar.css', import.meta.url).pathname
  link.dataset.entregar = ''
  document.head.append(link)
}
