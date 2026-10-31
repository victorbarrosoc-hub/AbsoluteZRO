// IndexedDB do app (banco "sobedesce"). Sem IndexedDB (modo privado antigo), tudo fica em memória.
//  - uploads (v1): sessões de upload guardadas para retomar depois de recarregar a página.
//    Chave: nome + tamanho + data de modificação + pasta de destino.
//  - historico (v2): envios terminados (concluído, já estava, cancelado) com a conferência, para a tela
//    Transferências. Sobrevive a recarregar a página. Só metadados: nome, tamanho, pasta, id no Drive, MD5.
// Migração v1 → v2: só cria o que falta; as sessões do v1 continuam onde estavam.

const DB_NAME = 'sobedesce'
export const DB_VERSION = 2
const STORE = 'uploads'
export const HIST = 'historico'
const memory = { [STORE]: new Map(), [HIST]: new Map() }
let dbPromise = null

/** Cria o que faltar no banco (chamado no onupgradeneeded; exportado para o teste da migração). */
export function upgrade(db) {
  if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' })
  if (!db.objectStoreNames.contains(HIST)) db.createObjectStore(HIST, { keyPath: 'id' })
}

function open() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => upgrade(req.result)
      req.onsuccess = () => {
        const db = req.result
        // Outra aba com versão mais nova pediu o banco: fecha esta conexão (a próxima abertura usa a memória).
        db.onversionchange = () => {
          db.close()
          dbPromise = Promise.resolve(null)
        }
        resolve(db)
      }
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function run(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(fn(null)?.result)
        try {
          const tx = db.transaction(store, mode)
          const req = fn(tx.objectStore(store))
          tx.oncomplete = () => resolve(req?.result)
          tx.onerror = () => resolve(undefined)
          tx.onabort = () => resolve(undefined)
        } catch {
          resolve(fn(null)?.result)
        }
      }),
  )
}

export function sessionKey({ name, size, lastModified }, folderId) {
  return `${name}\u0000${size}\u0000${lastModified}\u0000${folderId}`
}

// ───── sessões (uploads) ─────

export function getRecord(key) {
  return run(STORE, 'readonly', (s) => (s ? s.get(key) : { result: memory[STORE].get(key) }))
}

export function putRecord(rec) {
  memory[STORE].set(rec.key, rec)
  return run(STORE, 'readwrite', (s) => (s ? s.put(rec) : null))
}

export function deleteRecord(key) {
  memory[STORE].delete(key)
  return run(STORE, 'readwrite', (s) => (s ? s.delete(key) : null))
}

export function allRecords() {
  return run(STORE, 'readonly', (s) => (s ? s.getAll() : { result: [...memory[STORE].values()] })).then((r) => r || [])
}

// ───── histórico ─────

export function putHistory(entry) {
  memory[HIST].set(entry.id, entry)
  return run(HIST, 'readwrite', (s) => (s ? s.put(entry) : null))
}

export function deleteHistory(id) {
  memory[HIST].delete(id)
  return run(HIST, 'readwrite', (s) => (s ? s.delete(id) : null))
}

export function allHistory() {
  return run(HIST, 'readonly', (s) => (s ? s.getAll() : { result: [...memory[HIST].values()] })).then((r) => r || [])
}
