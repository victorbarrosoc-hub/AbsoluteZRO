// Onde ficam os arquivos criados com IA (Higgsfield): no disco do navegador (IndexedDB), pelo id da mídia, nunca no
// projeto (que segue leve). Projeto reaberto neste navegador: a mídia volta sozinha. Em outro computador, a Mídia pede
// o arquivo pelo nome, como qualquer outro (a pessoa pode baixar o original na Higgsfield).

const BANCO = 'aeon-criadas'
const LOJA = 'arquivos'

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
      tx.onabort = () => erro(tx.error || new Error('Não deu para guardar neste navegador.'))
    })
  } finally {
    db.close()
  }
}

/** Guarda o arquivo (File, com o nome) de uma mídia criada. */
export async function guardar(id, arquivo) {
  navigator.storage?.persist?.().catch(() => {})
  await com('readwrite', (loja) => loja.put(arquivo, id))
}

/** O arquivo guardado, ou null. */
export async function ler(id) {
  const b = await com('readonly', (loja) => loja.get(id))
  return b instanceof Blob ? b : null
}
