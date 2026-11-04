// O que tem no cartão (docs/BACKUP-AUTOMATICO.md, "Fotos e vídeos"): cada arquivo é vídeo, foto ou "outros" (o resto
// da estrutura da câmera: XML, índice, áudio, miniatura), pela extensão. Serve para três coisas:
//   - o projeto diz o que passa (só vídeos, só fotos ou os dois);
//   - cada dono diz para onde vai: Cenas, Fotos ou separado (vídeo em Cenas, foto em Fotos);
//   - "Escolher o que passar": a pessoa marca os tipos e as pastas do cartão que quer.
import path from 'node:path'
import { scanLocal } from '../local/scan.js'
import { SISTEMA } from '../discos/planejar.js'

const VIDEO = new Set(['mp4', 'mov', 'mxf', 'braw', 'r3d', 'avi', 'mts', 'm2ts', 'mkv', 'm4v', 'mpg', 'mpeg', 'wmv', 'webm', 'crm', 'insv', 'lrv', '3gp', 'dv', 'hevc'])
const FOTO = new Set(['jpg', 'jpeg', 'heic', 'heif', 'hif', 'arw', 'srf', 'sr2', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'raf', 'dng', 'orf', 'rw2', 'pef', 'srw', 'x3f', 'iiq', '3fr', 'gpr', 'tif', 'tiff', 'png', 'webp', 'xmp'])

export const TIPOS = ['videos', 'fotos', 'outros']
export const MIDIAS = ['tudo', 'videos', 'fotos'] // o que o projeto passa
export const SECOES = ['separar', 'cenas', 'fotos'] // para onde vai o cartão do dono
export const PASTA_SECAO = { cenas: 'Cenas', fotos: 'Fotos' }
const PASTAS_MAX = 60

/** 'videos' | 'fotos' | 'outros', pela extensão. */
export function tipoDe(relPath) {
  const ext = path.extname(String(relPath || '')).slice(1).toLowerCase()
  if (VIDEO.has(ext)) return 'videos'
  if (FOTO.has(ext)) return 'fotos'
  return 'outros'
}

export const midiaDe = (v) => (MIDIAS.includes(v) ? v : 'tudo')
export const secaoDe = (v) => (SECOES.includes(v) ? v : 'separar')
const pai = (rel) => {
  const i = rel.lastIndexOf('/')
  return i < 0 ? '' : rel.slice(0, i)
}

/**
 * O que o cartão tem: por tipo (arquivos e bytes) e as pastas que têm vídeo ou foto (a pasta de cada arquivo, com `/`;
 * '' = a raiz), para a tela de escolher. Lê só os nomes e tamanhos (rápido, nada de abrir arquivo).
 */
export async function lerConteudo(raiz, { signal } = {}) {
  const lido = await scanLocal(raiz, { signal })
  const tipos = { videos: { arquivos: 0, bytes: 0 }, fotos: { arquivos: 0, bytes: 0 }, outros: { arquivos: 0, bytes: 0 } }
  const pastas = new Map()
  for (const f of lido.files) {
    if (SISTEMA.test(f.relPath)) continue
    const t = tipoDe(f.relPath)
    tipos[t].arquivos++
    tipos[t].bytes += f.size
    if (t === 'outros') continue
    const dir = pai(f.relPath)
    const x = pastas.get(dir) || { pasta: dir, videos: 0, fotos: 0, bytes: 0 }
    x[t]++
    x.bytes += f.size
    pastas.set(dir, x)
  }
  return { tipos, pastas: [...pastas.values()].sort((a, b) => (a.pasta < b.pasta ? -1 : 1)).slice(0, PASTAS_MAX) }
}

/** Para onde a tela sugere mandar o cartão: só foto → Fotos; só vídeo → Cenas; os dois → separar. */
export function secaoSugerida(conteudo, midia = 'tudo') {
  if (midia === 'videos') return 'cenas'
  if (midia === 'fotos') return 'fotos'
  const v = conteudo?.tipos?.videos?.arquivos || 0
  const f = conteudo?.tipos?.fotos?.arquivos || 0
  if (f && !v) return 'fotos'
  if (v && !f) return 'cenas'
  return f && v ? 'separar' : 'cenas'
}

/** A escolha da pessoa limpa: tipos conhecidos e pastas relativas seguras. null = passa tudo o que o projeto passa. */
export function limparEscolha(e) {
  if (!e || typeof e !== 'object') return null
  const tipos = Array.isArray(e.tipos) ? TIPOS.filter((t) => e.tipos.includes(t)) : TIPOS.slice()
  const pastas = Array.isArray(e.pastas)
    ? [...new Set(e.pastas.filter((p) => typeof p === 'string' && p.length <= 1024 && !p.split('/').includes('..') && !p.startsWith('/') && !/^[a-z]:/i.test(p)))].slice(0, PASTAS_MAX)
    : null
  if (!tipos.length) return null
  return { tipos, pastas: pastas && pastas.length ? pastas : null }
}

/**
 * As levas da descarga: cada uma vai para uma seção (Cenas ou Fotos) com o filtro do que entra nela.
 *   midia 'videos': tudo menos as fotos → Cenas;  'fotos': só as fotos → Fotos;
 *   'tudo': separar (foto → Fotos, o resto → Cenas) ou tudo numa seção só (a do dono).
 * Por cima, a escolha da pessoa (tipos e pastas). `parcial`: algum arquivo do cartão fica de fora (não pode formatar).
 */
export function levas({ midia = 'tudo', secao = 'separar', escolha = null } = {}) {
  const m = midiaDe(midia)
  const s = secaoDe(secao)
  const e = limparEscolha(escolha)
  const permitido = (t) => (m === 'videos' ? t !== 'fotos' : m === 'fotos' ? t === 'fotos' : true) && (!e || e.tipos.includes(t))
  const naPasta = (rel) => !e?.pastas || e.pastas.includes(pai(rel))
  const filtro = (aceita) => (rel) => {
    const t = tipoDe(rel)
    return aceita(t) && permitido(t) && naPasta(rel)
  }
  let lista
  if (m === 'videos') lista = [{ secao: 'cenas', aceita: () => true }]
  else if (m === 'fotos') lista = [{ secao: 'fotos', aceita: () => true }]
  else if (s === 'separar') lista = [{ secao: 'cenas', aceita: (t) => t !== 'fotos' }, { secao: 'fotos', aceita: (t) => t === 'fotos' }]
  else lista = [{ secao: s, aceita: () => true }]
  return {
    levas: lista.map((l) => ({ secao: l.secao, pasta: PASTA_SECAO[l.secao], filtro: filtro(l.aceita) })),
    // Sem filtro nenhum (o projeto passa tudo e a pessoa não escolheu): o cartão inteiro vai.
    tudo: m === 'tudo' && !e,
  }
}
