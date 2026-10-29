// Navegar no Drive (aba Drive): listar pastas e arquivos com miniatura, buscar por nome, ordenar e filtrar por tipo.
// Quase tudo é só leitura. A única escrita é macJunkTrash (arquivos ._ do Mac para a lixeira), e só depois da
// confirmação na tela. Usa o mesmo token da conta (lib/auth.js) e o mesmo `call` do envio.
import { FOLDER_MIME, driveCall, q, trashFile } from './drive.js'
import { extOf } from './format.js'
import { local } from './config.js'
import { criarListador, FILE_FIELDS, isFolder, isTrashableJunk, kindOf, mayPlay, SORTS } from './drive-nucleo.js'
import { FolderSizes, pageLister, walkFolderSize } from './tamanho.js'

// O núcleo sem estado (tipos, filtros, ordens, a consulta de cada página) é o de packages/drive-web, copiado em
// drive-nucleo.js; aqui fica o que é só do app: preferências, limpeza dos ._ do Mac, tamanho das pastas e proxy.
export * from './drive-nucleo.js'

const lister = criarListador(driveCall)
/** Uma página de um lugar do Drive (drive-nucleo.js → criarListador). */
export const listPage = lister.listPage
/** Drives compartilhados da conta, como "pastas" da raiz. */
export const listDrives = lister.listDrives
/** Metadados de um arquivo só (alvo de atalho, por exemplo). */
export const getFile = lister.getFile

// ───── preferências do aparelho (grade/lista e ordem) ─────
//
// view: 'grid' | 'list' quando a pessoa escolheu no botão; null = automático (autoView): lista numa pasta só de
// pastas, grade quando há foto ou vídeo. Antes da 2.6 a grade era o padrão e o app guardava 'grid' junto com a ordem,
// mesmo sem ninguém escolher; por isso só vale o que veio com viewSet (ou 'list', que só existia escolhendo).

const PREFS_KEY = 'sobedesce.browse'
export function getPrefs() {
  const p = local.get(PREFS_KEY) || {}
  const chosen = p.view === 'list' || (p.viewSet === true && p.view === 'grid')
  return {
    view: chosen ? p.view : null,
    sort: SORTS[p.sort] ? p.sort : 'name',
    flip: p.flip === true,
  }
}
export function savePrefs(p) {
  local.set(PREFS_KEY, { view: p.view || null, viewSet: Boolean(p.view), sort: p.sort, flip: !!p.flip })
}

// ───── arquivos do Mac (._* e .DS_Store) ─────
//
// O Finder grava, em discos que não são do Mac, um "._nome" (AppleDouble: ícone, etiquetas, metadados) ao lado de cada
// arquivo, e um .DS_Store por pasta. Quem copia o cartão inteiro para o Drive leva junto. Ficam ocultos por padrão.
// Para a lixeira só vão os ._ pequenos (MAC_JUNK_MAX): um ._ de verdade tem de 4 KB a algumas centenas de KB; um
// arquivo grande com nome começando em "._" pode ser outra coisa e fica onde está.

/**
 * Os ._ de uma pasta (só os filhos diretos), para a folha de confirmação: lista a pasta toda com o mínimo de campos,
 * em páginas de 1000. Devolve [{ id, name, size, canTrash }].
 */
export async function macJunkIn(folder, { driveId = null, signal } = {}) {
  const out = []
  let pageToken
  do {
    const query = {
      q: `'${q(folder.id)}' in parents and trashed = false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 1000,
      pageToken,
      fields: 'nextPageToken,files(id,name,size,mimeType,parents,capabilities(canTrash))',
    }
    const d = driveId || folder.driveId || null
    if (d) Object.assign(query, { corpora: 'drive', driveId: d })
    const r = await driveCall('/files', { query, signal })
    for (const f of r.files || []) {
      if (!isTrashableJunk(f) || (f.parents && !f.parents.includes(folder.id))) continue
      out.push({ id: f.id, name: f.name, size: Number(f.size), canTrash: f.capabilities?.canTrash !== false })
    }
    pageToken = r.nextPageToken
  } while (pageToken)
  return out
}

/**
 * Move para a lixeira (files.update trashed=true, recuperável por 30 dias), 3 de cada vez. Confere de novo cada item
 * (nome ._ e < 4 MB) antes de mexer. onProgress({ done, moved, refused, failed }). Cancelado (signal), para de pedir
 * novos e devolve o que já foi. Devolve { moved: [ids], refused, failed, reason }.
 */
export async function macJunkTrash(items, { signal, onProgress } = {}) {
  const list = items.filter((f) => isTrashableJunk(f))
  const res = { moved: [], refused: 0, failed: 0, reason: null, skipped: items.length - list.length }
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < list.length && !signal?.aborted) {
      const f = list[next++]
      try {
        await trashFile(f.id, signal)
        res.moved.push(f.id)
      } catch (err) {
        if (signal?.aborted) break
        if (err?.status === 403 || err?.status === 404) {
          res.refused++
          res.reason = res.reason || err.reason || 'forbidden'
        } else res.failed++
      }
      done++
      onProgress?.({ done, total: list.length, moved: res.moved.length, refused: res.refused, failed: res.failed })
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, list.length) }, worker))
  return res
}

// ───── tamanho das pastas ─────

/**
 * Tamanho de uma pasta (o Drive não guarda): soma a árvore com listagens mínimas, 4 de cada vez (lib/tamanho.js).
 * folder = { id }; `driveId` = drive compartilhado onde ela mora (corpora=drive). Atalhos não são seguidos.
 * Devolve { bytes, files, folders, docs, shortcuts }; cancelada, rejeita com AbortError e `err.partial`.
 */
export function folderSize(folder, { driveId = null, signal, onProgress } = {}) {
  return walkFolderSize({ listPage: pageLister(driveCall, driveId || folder.driveId || null), rootId: folder.id, signal, onProgress, concurrency: 4 })
}

/** Contas desta sessão (uma por pasta, guardadas enquanto a página está aberta). */
export const folderSizes = new FolderSizes({ walk: (folder, opts) => folderSize(folder, opts) })

// ───── proxy de câmera ─────
//
// Bruto que o navegador não toca (BRAW, R3D, ARRI, MXF, ProRes que falhou): procura um proxy com o mesmo nome-base
// em .mp4/.mov/.m4v na mesma pasta ou numa subpasta irmã "Proxy"/"Proxies" (como as câmeras Blackmagic gravam:
// A001_08221425_C001.braw + Proxy/A001_08221425_C001.mp4). Só ao abrir a prévia; cache por pasta e por arquivo.

const PROXY_EXT = ['mp4', 'mov', 'm4v']
const PROXY_DIRS = ['proxy', 'proxies']
const proxyDirs = new Map() // pasta → Promise<[ids das subpastas Proxy]>
const proxies = new Map() // arquivo → Promise<proxy|null>
const proxyDone = new Map() // arquivo → proxy|null (já resolvido)

export function baseName(name = '') {
  const i = name.lastIndexOf('.')
  return (i > 0 ? name.slice(0, i) : name).normalize('NFC').toLowerCase()
}

/** Este arquivo serve de proxy de `orig`? (mesmo nome-base, outro arquivo, extensão de vídeo comum). */
export function isProxyOf(cand, orig) {
  return cand.id !== orig.id && !isFolder(cand) && PROXY_EXT.includes(extOf(cand.name)) && baseName(cand.name) === baseName(orig.name)
}

/** Cópia leve gerada pelo app de computador (Proxy/<nome>.mp4, appProperties.sobedesce = 'previa'). */
export const isPrevia = (f) => f?.appProperties?.sobedesce === 'previa'

/** Vídeo grande (qualquer codec): a prévia procura antes a cópia leve e toca ela, fluida como no Drive. */
export const LITE_MIN = 30e6
export function wantsLite(f) {
  return kindOf(f) === 'video' && Number(f.size || 0) > LITE_MIN && !isPrevia(f)
}

/** Vale procurar proxy? (vídeo que o navegador não toca; `failed` = tocou e deu erro de formato). */
export function wantsProxy(f, failed = false) {
  return kindOf(f) === 'video' && (failed || !mayPlay(f))
}

const sameFolder = (a, b) => (a.parents?.[0] || null) === (b.parents?.[0] || null)

function dirsOf(parentId, driveId, signal) {
  const key = `${driveId || ''}:${parentId}`
  if (!proxyDirs.has(key)) {
    const query = {
      q: `'${q(parentId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false and (${PROXY_DIRS.map((n) => `name = '${n}'`).join(' or ')})`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 10,
      fields: 'files(id,name)',
    }
    if (driveId) Object.assign(query, { corpora: 'drive', driveId })
    const p = driveCall('/files', { query, signal }).then(
      (r) => (r.files || []).filter((d) => PROXY_DIRS.includes(d.name.toLowerCase())).map((d) => d.id),
      (err) => {
        proxyDirs.delete(key)
        throw err
      },
    )
    proxyDirs.set(key, p)
  }
  return proxyDirs.get(key)
}

/** O proxy de `f` (ou null). `siblings` = arquivos da mesma pasta já carregados na tela (evita uma consulta). */
export function findProxy(f, siblings = [], signal) {
  const key = `${f.id}:${f.modifiedTime || ''}`
  if (proxies.has(key)) return proxies.get(key)
  const parent = f.parents?.[0]
  const local = siblings.filter((c) => isProxyOf(c, f) && sameFolder(c, f))
  const pick = (list) => list.sort((a, b) => PROXY_EXT.indexOf(extOf(a.name)) - PROXY_EXT.indexOf(extOf(b.name)))[0] || null
  const p = (async () => {
    if (local.length) return pick(local)
    if (!parent) return null
    const dirs = await dirsOf(parent, f.driveId, signal)
    const where = [parent, ...dirs].map((id) => `'${q(id)}' in parents`).join(' or ')
    const query = {
      q: `name contains '${q(baseName(f.name))}' and trashed = false and (${where})`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 50,
      fields: `files(${FILE_FIELDS})`,
    }
    if (f.driveId) Object.assign(query, { corpora: 'drive', driveId: f.driveId })
    const r = await driveCall('/files', { query, signal })
    return pick((r.files || []).filter((c) => isProxyOf(c, f)))
  })().then(
    (v) => (proxyDone.set(key, v), v),
    (err) => {
      proxies.delete(key)
      throw err
    },
  )
  proxies.set(key, p)
  return p
}

/** Proxy já conhecido (sem consultar): da prévia aberta antes ou da mesma pasta na tela. */
export function knownProxy(f, siblings = []) {
  const key = `${f.id}:${f.modifiedTime || ''}`
  if (proxyDone.has(key)) return proxyDone.get(key)
  return siblings.find((c) => isProxyOf(c, f) && sameFolder(c, f)) || null
}
