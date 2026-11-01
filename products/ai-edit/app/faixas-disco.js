// Onde ficam os arquivos das faixas separadas pela NOSSOM: no disco do navegador (IndexedDB), por separação, nunca no
// projeto (que segue leve e vai para qualquer lugar). As cinco faixas como chegaram (FLAC, sem perda). Projeto aberto
// em outro computador: as faixas não estão lá, o clipe toca o som original e o Inspector diz como separar de novo.

const BANCO = 'aeon-faixas'
const LOJA = 'faixas'

function abrir() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(BANCO, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => erro(r.error)
  })
}

async function com(modo, fn) {
  const db = await abrir()
  try {
    return await new Promise((ok, erro) => {
      const tx = db.transaction(LOJA, modo)
      const r = fn(tx.objectStore(LOJA))
      tx.oncomplete = () => ok(r?.result)
      tx.onerror = () => erro(tx.error)
      tx.onabort = () => erro(tx.error || new Error('Não deu para guardar as faixas neste navegador.'))
    })
  } finally {
    db.close()
  }
}

/** Guarda as faixas de uma separação: { nome: Blob }. Pede ao navegador para não apagar por falta de espaço. */
export async function guardar(id, arquivos) {
  navigator.storage?.persist?.().catch(() => {})
  await com('readwrite', (loja) => {
    for (const [nome, blob] of Object.entries(arquivos)) loja.put(blob, `${id}/${nome}`)
  })
}

/** As faixas guardadas de uma separação, na ordem pedida: [Blob] ou null se falta alguma. */
export async function ler(id, nomes) {
  const out = []
  for (const nome of nomes) {
    const b = await com('readonly', (loja) => loja.get(`${id}/${nome}`))
    if (!(b instanceof Blob)) return null
    out.push(b)
  }
  return out
}

/** Apaga as faixas de uma separação (quando nenhum projeto usa mais). */
export async function apagar(id, nomes) {
  await com('readwrite', (loja) => {
    for (const nome of nomes) loja.delete(`${id}/${nome}`)
  })
}
