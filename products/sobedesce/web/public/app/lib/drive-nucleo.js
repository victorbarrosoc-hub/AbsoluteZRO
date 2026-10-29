// Núcleo do navegador do Google Drive da família Absolute ZRO (packages/drive-web): o que a aba Drive do SOBEDESCE e a
// aba Arquivos do Maestro têm em comum, sem framework e sem estado de tela. Tipos de arquivo, filtros, ordens, a
// consulta do Drive v3 de cada página (com as recusas de 400 contornadas), miniatura no tamanho certo e o que o
// navegador toca. Quem chama injeta `driveCall(caminho, { query, signal })`, com o token da conta (SOBEDESCE: o token
// da sessão; Maestro: o token curto pela ponte do HUB, `drive.token`). Só leitura: nada aqui escreve no Drive.
//
// Uma cópia idêntica mora em products/sobedesce/web/public/app/lib/drive-nucleo.js (o app do celular não tem build);
// products/sobedesce/test/drive-web.test.js confere que as duas são iguais.
import { extOf, fileKind } from './format.js'

export const FOLDER_MIME = 'application/vnd.google-apps.folder'
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'
const GAPPS = 'application/vnd.google-apps.'
const PAGE = 60

/** Escapa um texto para dentro de aspas simples na linguagem de busca do Drive. */
export function q(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// O que a grade e a prévia precisam de cada arquivo (sem isto o Google devolve só id, nome e tipo).
export const FILE_FIELDS = [
  'id',
  'name',
  'mimeType',
  'size',
  'modifiedTime',
  'thumbnailLink',
  'iconLink',
  'hasThumbnail',
  'videoMediaMetadata',
  'imageMediaMetadata',
  'webViewLink',
  'driveId',
  'parents',
  'shortcutDetails',
  'capabilities(canDownload,canAddChildren,canTrash,canRename,canEdit,canMoveItemWithinDrive)',
  'appProperties',
].join(',')

/** Escopos da raiz: Meu Drive, Compartilhados comigo e Drives compartilhados. */
export const SCOPES = [
  { id: 'mine', label: 'Meu Drive', aria: 'Meu Drive' },
  { id: 'shared', label: 'Comigo', aria: 'Compartilhados comigo' },
  { id: 'drives', label: 'Drives', aria: 'Drives compartilhados' },
]

// Ordens. Pastas sempre primeiro ('folder' no orderBy do Drive; sortLocal faz o mesmo). `hint` e `chip`: [padrão,
// invertida]. O Drive não ordena por tipo/extensão no servidor: 'type' pede por nome e agrupa aqui, no aparelho, e a
// tela carrega a pasta toda antes (senão a ordem mudaria a cada página que chega). Ver needsAll.
export const SORTS = {
  name: { label: 'Nome', order: 'folder,name_natural', desc: 'folder,name_natural desc', hint: ['A → Z', 'Z → A'], chip: ['Nome A→Z', 'Nome Z→A'] },
  date: {
    label: 'Modificado',
    order: 'folder,modifiedTime desc',
    desc: 'folder,modifiedTime',
    hint: ['Mais recentes', 'Mais antigos'],
    chip: ['Mais recentes', 'Mais antigos'],
  },
  size: { label: 'Tamanho', order: 'folder,quotaBytesUsed desc', desc: 'folder,quotaBytesUsed', hint: ['Maiores', 'Menores'], chip: ['Maiores', 'Menores'] },
  type: { label: 'Tipo', order: null, desc: null, hint: ['Por extensão, A → Z', 'Por extensão, Z → A'], chip: ['Tipo A→Z', 'Tipo Z→A'] },
}

/** Rótulo curto da ordem atual, para o chip ("Nome A→Z", "Mais recentes", "Maiores"…). */
export function sortChip(sort, flip) {
  return (SORTS[sort] || SORTS.name).chip[flip ? 1 : 0]
}

/** Ordem que vai para o Drive: 'type' não existe lá, então pede por nome (e a tela agrupa). */
export function serverSort(sort, flip) {
  return SORTS[sort]?.order ? { sort, flip: !!flip } : { sort: 'name', flip: false }
}

/** A ordem só fica certa com a pasta toda carregada? (ordenada no aparelho, não no Drive). */
export const needsAll = (sort) => Boolean(SORTS[sort]) && !SORTS[sort].order

/** Grade ou lista para o que está na tela: grade se tem foto ou vídeo (as miniaturas ajudam), lista se não. */
export function autoView(files) {
  return (files || []).some((f) => {
    const k = kindOf(f)
    return k === 'video' || k === 'image'
  })
    ? 'grid'
    : 'list'
}

// ───── tipos ─────

export function isFolder(f) {
  return f?.mimeType === FOLDER_MIME || (f?.mimeType === SHORTCUT_MIME && f.shortcutDetails?.targetMimeType === FOLDER_MIME)
}

/** Documento do Google (Docs, Planilhas…): não tem bytes para baixar, só abrir no Drive. */
export function isGoogleDoc(f) {
  const m = f?.mimeType === SHORTCUT_MIME ? f.shortcutDetails?.targetMimeType : f?.mimeType
  return Boolean(m && m.startsWith(GAPPS) && m !== FOLDER_MIME)
}

/** O arquivo de verdade por trás de um atalho (id e tipo do alvo). */
export function target(f) {
  if (f?.mimeType !== SHORTCUT_MIME || !f.shortcutDetails?.targetId) return f
  return { ...f, id: f.shortcutDetails.targetId, mimeType: f.shortcutDetails.targetMimeType || 'application/octet-stream', shortcut: f.id }
}

// Formatos que o navegador não toca, mesmo com o tipo certo (brutos de câmera e contêineres profissionais).
const NO_PLAY = new Set(['mxf', 'braw', 'r3d', 'ari', 'arx', 'crm', 'avi', 'mts', 'm2ts', 'mpg', 'mpeg', 'wmv', 'flv', 'dv', 'hevc', 'h264', '264', 'vob'])
const NO_PLAY_AUDIO = new Set(['aif', 'aiff', 'bwf', 'wma', 'ape', 'dsf'])
const SHOW_IMAGE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'heic', 'heif'])

/** 'folder' | 'video' | 'audio' | 'image' | 'pdf' | 'gdoc' | 'archive' | 'doc' | 'generic' */
export function kindOf(f) {
  if (isFolder(f)) return 'folder'
  if (isGoogleDoc(f)) return 'gdoc'
  if (f.mimeType === 'application/pdf' || extOf(f.name) === 'pdf') return 'pdf'
  if (NO_PLAY.has(extOf(f.name))) return 'video'
  return fileKind(f.name, f.mimeType)
}

// ───── filtro por tipo (chips Tudo · Vídeos · Fotos · Áudio · Pastas · Outros) ─────
//
// Em duas partes. No Drive, o `q` por mimeType já tira o grosso (uma pasta de BRAW filtrada em Fotos nem baixa os
// BRAW). Mas o Drive marca BRAW, R3D, ARRI e cia. como application/octet-stream: esses passam no `q` de vídeo, foto e
// áudio, e quem decide é a extensão, aqui no aparelho (categoryOf). Por isso o `q` é sempre um SUPERCONJUNTO do que
// categoryOf aceita, e a tela segue carregando páginas enquanto o filtro daqui esconde quase tudo.

export const FILTERS = [
  { id: 'all', label: 'Tudo' },
  { id: 'video', label: 'Vídeos', one: 'vídeo', many: 'vídeos', none: 'Nenhum vídeo aqui' },
  { id: 'image', label: 'Fotos', one: 'foto', many: 'fotos', none: 'Nenhuma foto aqui' },
  { id: 'audio', label: 'Áudio', one: 'áudio', many: 'áudios', none: 'Nenhum áudio aqui' },
  { id: 'folder', label: 'Pastas', one: 'pasta', many: 'pastas', none: 'Nenhuma pasta aqui' },
  { id: 'other', label: 'Outros', one: 'outro arquivo', many: 'outros arquivos', none: 'Nenhum outro arquivo aqui' },
]
export const filterById = (id) => FILTERS.find((x) => x.id === id) || FILTERS[0]

// Tipos "sem tipo" (o Drive não reconheceu): aí vale a extensão. Os de mídia (video/, image/, audio/) valem pelo tipo.
const BINARY = ['application/octet-stream', 'binary/octet-stream', 'application/mxf', 'application/x-mxf']
const MEDIA = ['video', 'audio', 'image']

/** 'folder' | 'video' | 'image' | 'audio' | 'other': em que chip o item aparece. */
export function categoryOf(f) {
  if (isFolder(f)) return 'folder'
  const mime = (f?.mimeType === SHORTCUT_MIME ? f.shortcutDetails?.targetMimeType : f?.mimeType) || ''
  const byMime = MEDIA.find((k) => mime.startsWith(`${k}/`))
  if (byMime) return byMime
  if (mime && !BINARY.includes(mime)) return 'other'
  const k = kindOf({ ...f, mimeType: mime })
  return MEDIA.includes(k) ? k : 'other'
}

export const matchesFilter = (f, id) => !id || id === 'all' || categoryOf(f) === id

/** O pedaço do `q` do Drive para o filtro (superconjunto de categoryOf; '' = sem filtro no servidor). */
export function filterQuery(id) {
  const loose = [...BINARY, SHORTCUT_MIME].map((m) => `mimeType = '${m}'`)
  if (MEDIA.includes(id)) return `(mimeType contains '${id}/' or ${loose.join(' or ')})`
  if (id === 'folder') return `(mimeType = '${FOLDER_MIME}' or mimeType = '${SHORTCUT_MIME}')`
  if (id === 'other') return `mimeType != '${FOLDER_MIME}' and ${MEDIA.map((k) => `not mimeType contains '${k}/'`).join(' and ')}`
  return ''
}

// ───── arquivos do Mac (._* e .DS_Store) ─────
//
// O Finder grava, em discos que não são do Mac, um "._nome" (AppleDouble: ícone, etiquetas, metadados) ao lado de cada
// arquivo, e um .DS_Store por pasta. Quem copia o cartão inteiro para o Drive leva junto. Ficam ocultos por padrão.
// Para a lixeira só vão os ._ pequenos (MAC_JUNK_MAX): um ._ de verdade tem de 4 KB a algumas centenas de KB; um
// arquivo grande com nome começando em "._" pode ser outra coisa e fica onde está.

export const MAC_JUNK_MAX = 4e6 // 4 MB (decimal, como o resto do app)

/** ._qualquer-coisa ou .DS_Store (só arquivos; pastas nunca). */
export function isMacJunk(f) {
  if (!f || isFolder(f) || isGoogleDoc(f)) return false
  const n = String(f.name || '')
  return n.startsWith('._') || n === '.DS_Store'
}

/** Pode ir para a lixeira pelo botão: começa com "._", tem tamanho conhecido e menor que 4 MB. */
export function isTrashableJunk(f) {
  if (!f || isFolder(f) || isGoogleDoc(f) || f.mimeType === SHORTCUT_MIME) return false
  const size = Number(f.size)
  return String(f.name || '').startsWith('._') && f.size != null && Number.isFinite(size) && size < MAC_JUNK_MAX
}

/** O navegador deve conseguir tocar? (a última palavra é do próprio <video>: se der erro, mostra o aviso). */
export function mayPlay(f, el) {
  const ext = extOf(f.name)
  const kind = kindOf(f)
  if (kind === 'video') return !NO_PLAY.has(ext) && canPlay(el, f.mimeType, ext)
  if (kind === 'audio') return !NO_PLAY_AUDIO.has(ext) && canPlay(el, f.mimeType, ext)
  return false
}

function canPlay(el, mime, ext) {
  try {
    const probe = el || document.createElement('video')
    const types = [
      mime,
      ext === 'mov' ? 'video/quicktime' : null,
      ext === 'mov' ? 'video/mp4' : null,
      ext === 'm4a' ? 'audio/mp4' : null,
      ext === 'wav' ? 'audio/wav' : null,
    ]
    return types.some((t) => t && probe.canPlayType(t) !== '')
  } catch {
    return true
  }
}

/** Foto que o navegador mostra direto (sem conversão): serve de reserva quando a miniatura não vem. */
export function showsAsImage(f) {
  const ext = extOf(f.name)
  if (!SHOW_IMAGE.has(ext)) return false
  if (ext === 'heic' || ext === 'heif')
    return /iP(hone|ad|od)|Macintosh/.test(navigator.userAgent) && /Safari\//.test(navigator.userAgent) && !/Chrome\//.test(navigator.userAgent)
  return true
}

export function canDownload(f) {
  return !isFolder(f) && !isGoogleDoc(f) && f.capabilities?.canDownload !== false
}

export function driveUrl(f) {
  if (f.webViewLink) return f.webViewLink
  return isFolder(f) ? `https://drive.google.com/drive/folders/${encodeURIComponent(f.id)}` : `https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`
}

/** Miniatura do Google no tamanho pedido: troca o "=s220" do fim pelo tamanho certo (em pixels de tela). */
export function sizedThumb(link, px) {
  if (!link) return null
  const n = Math.max(64, Math.min(2400, Math.round(px)))
  if (/=s\d+(-[\w-]+)?$/.test(link)) return link.replace(/=s\d+(-[\w-]+)?$/, `=s${n}`)
  if (/[?&]sz=w\d+/.test(link)) return link.replace(/([?&]sz=)w\d+/, `$1w${n}`)
  return link
}

// ───── listagem ─────

/**
 * O listador de uma conta: `driveCall(caminho, { query, signal })` faz o GET no Drive v3 com o token dela.
 * - listPage(where, opções): uma página de um lugar do Drive. where = { scope: 'mine'|'shared'|'drives',
 *   folder: { id, name } | null, driveId, search }. Devolve { files, next } (next = pageToken ou null).
 * - listDrives(signal): os Drives compartilhados da conta, como "pastas" da raiz.
 * - getFile(id, signal): os metadados de um arquivo só (alvo de atalho, por exemplo).
 */
export function criarListador(driveCall) {
  // O Drive aceitou o filtro por tipo no `q`? (se recusar uma vez, os próximos pedidos já vão sem ele).
  let kindQueryOk = true

  async function listPage(where, { sort = 'name', flip = false, filter = 'all', pageToken, pageSize = PAGE, signal } = {}) {
    const { scope, folder, driveId, search } = where
    const clean = (search || '').trim()
    const parts = ['trashed = false']
    const query = { supportsAllDrives: true, includeItemsFromAllDrives: true, pageSize, pageToken, fields: `nextPageToken,files(${FILE_FIELDS})` }
    if (clean) parts.push(`name contains '${q(clean)}'`)
    if (folder) {
      if (!clean) parts.push(`'${q(folder.id)}' in parents`)
    } else if (scope === 'mine') {
      if (!clean) parts.push(`'root' in parents`)
    } else if (scope === 'shared') {
      parts.push('sharedWithMe = true')
    }
    if (driveId) Object.assign(query, { corpora: 'drive', driveId })
    else if (scope === 'drives' && clean) query.corpora = 'allDrives'
    const fq = kindQueryOk ? filterQuery(filter) : ''
    query.q = [...parts, fq].filter(Boolean).join(' and ')
    const srv = serverSort(sort, flip)
    const s = SORTS[srv.sort] || SORTS.name
    query.orderBy = srv.flip ? s.desc : s.order
    // Recusas (400) que dá para contornar, uma de cada vez: o filtro por tipo no `q` (a tela filtra do mesmo jeito,
    // só carrega mais) e a ordem (alguns lugares, como a busca em todos os Drives e Compartilhados comigo, recusam
    // certas ordens: ordena aqui).
    for (;;) {
      try {
        const r = await driveCall('/files', { query, signal })
        // A tira de quadros do segurar-e-arrastar (Proxy/<nome>.quadros.jpg) é peça interna do app: fica fora da lista.
        const files = (r.files || []).filter((f) => f.appProperties?.sobedesce !== 'quadros')
        return { files: query.orderBy ? files : sortLocal(files, srv.sort, srv.flip), next: r.nextPageToken || null }
      } catch (err) {
        if (err?.status !== 400) throw err
        if (fq && query.q.includes(fq)) {
          kindQueryOk = false
          query.q = parts.join(' and ')
        } else if (query.orderBy) delete query.orderBy
        else throw err
      }
    }
  }

  /** Drives compartilhados da conta, como "pastas" da raiz. */
  async function listDrives(signal) {
    const out = []
    let pageToken
    do {
      const r = await driveCall('/drives', { query: { pageSize: 100, pageToken, fields: 'nextPageToken,drives(id,name)' }, signal })
      for (const d of r.drives || []) out.push({ id: d.id, name: d.name, mimeType: FOLDER_MIME, isDrive: true, driveId: d.id })
      pageToken = r.nextPageToken
    } while (pageToken)
    return out
  }

  /** Metadados de um arquivo só (alvo de atalho, por exemplo). */
  function getFile(id, signal) {
    return driveCall(`/files/${encodeURIComponent(id)}`, { query: { supportsAllDrives: true, fields: FILE_FIELDS }, signal })
  }

  return { listPage, listDrives, getFile }
}

const extKey = (f) => (isFolder(f) ? '' : extOf(f.name) || '\uffff')

export function sortLocal(files, sort, flip) {
  const coll = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })
  const byName = (a, b) => coll.compare(a.name, b.name)
  const dir = flip ? -1 : 1
  const by =
    {
      name: (a, b) => dir * byName(a, b),
      date: (a, b) => dir * String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')),
      size: (a, b) => dir * ((Number(b.size) || 0) - (Number(a.size) || 0)),
      // Por tipo: agrupa pela extensão (sem extensão vai para o fim); dentro do grupo, sempre por nome, A → Z.
      type: (a, b) => dir * extKey(a).localeCompare(extKey(b)) || byName(a, b),
    }[sort] || ((a, b) => dir * byName(a, b))
  return [...files].sort((a, b) => Number(isFolder(b)) - Number(isFolder(a)) || by(a, b))
}
