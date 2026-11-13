// O que fica guardado neste aparelho (IndexedDB `foto`): a lista de trabalhos, o catálogo de cada um (marcas, notas,
// ajustes), a pasta escolhida (o handle, para pedir a permissão de novo ao voltar) e as miniaturas. Nada sobe.
// Sem IndexedDB (janela anônima de alguns navegadores), tudo vira "não achei" e o app segue só na memória.
//
//   trabalhos   { id, nome, origem: 'pasta' | 'arquivos', criadoEm, abertoEm, total, assinatura, capas: [idDaFoto] }
//   catalogos   id do trabalho → catalogo.serializar()
//   pastas      id do trabalho → FileSystemDirectoryHandle
//   miniaturas  `${idDaFoto}/mini` (~400 px) e `${idDaFoto}/previa` (1024 px) → Blob JPEG

const BANCO = 'foto'
const VERSAO = 1
const LOJAS = ['trabalhos', 'catalogos', 'pastas', 'miniaturas']

let abrindo = null

function banco() {
  abrindo ??= new Promise((ok) => {
    try {
      const pedido = indexedDB.open(BANCO, VERSAO)
      pedido.onupgradeneeded = () => {
        const b = pedido.result
        if (!b.objectStoreNames.contains('trabalhos')) b.createObjectStore('trabalhos', { keyPath: 'id' })
        for (const nome of LOJAS.slice(1)) if (!b.objectStoreNames.contains(nome)) b.createObjectStore(nome)
      }
      pedido.onsuccess = () => {
        pedido.result.onversionchange = () => pedido.result.close()
        ok(pedido.result)
      }
      pedido.onerror = () => ok(null)
      pedido.onblocked = () => ok(null)
    } catch {
      ok(null)
    }
  })
  return abrindo
}

const esperar = (pedido) =>
  new Promise((ok, falhou) => {
    pedido.onsuccess = () => ok(pedido.result)
    pedido.onerror = () => falhou(pedido.error)
  })

/** Uma transação; `f(lojas)` devolve um pedido (ou nada). Erro vira `padrao`: guardar nunca derruba a tela. */
async function em(nomes, modo, f, padrao = null) {
  const b = await banco()
  if (!b) return padrao
  try {
    const t = b.transaction(nomes, modo)
    const fim = new Promise((ok, falhou) => {
      t.oncomplete = ok
      t.onerror = () => falhou(t.error)
      t.onabort = () => falhou(t.error)
    })
    const lojas = Object.fromEntries([nomes].flat().map((n) => [n, t.objectStore(n)]))
    const pedido = f(lojas)
    const valor = pedido && 'onsuccess' in pedido ? await esperar(pedido) : pedido
    await fim
    return valor ?? padrao
  } catch {
    return padrao
  }
}

export const guardar = {
  /** Os trabalhos, do aberto por último para o mais antigo. */
  async trabalhos() {
    const lista = await em('trabalhos', 'readonly', (l) => l.trabalhos.getAll(), [])
    return lista.sort((a, b) => (b.abertoEm || 0) - (a.abertoEm || 0))
  },
  trabalho: (id) => em('trabalhos', 'readonly', (l) => l.trabalhos.get(id)),
  salvarTrabalho: (t) => em('trabalhos', 'readwrite', (l) => l.trabalhos.put(t)),
  catalogo: (id) => em('catalogos', 'readonly', (l) => l.catalogos.get(id)),
  salvarCatalogo: (id, dados) => em('catalogos', 'readwrite', (l) => l.catalogos.put(dados, id)),
  pasta: (id) => em('pastas', 'readonly', (l) => l.pastas.get(id)),
  salvarPasta: (id, handle) => em('pastas', 'readwrite', (l) => l.pastas.put(handle, id)),

  /** Apaga o trabalho deste aparelho (catálogo, pasta lembrada e as miniaturas das fotos dele). Os arquivos ficam. */
  async apagarTrabalho(id) {
    const catalogo = await guardar.catalogo(id)
    const ids = (catalogo?.fotos || []).map((f) => f.id)
    await em(LOJAS, 'readwrite', (l) => {
      l.trabalhos.delete(id)
      l.catalogos.delete(id)
      l.pastas.delete(id)
      for (const f of ids) {
        l.miniaturas.delete(`${f}/mini`)
        l.miniaturas.delete(`${f}/previa`)
      }
    })
  },

  /** `tipo`: 'mini' | 'previa'. Devolve o Blob, ou null. */
  miniatura: (id, tipo = 'mini') => em('miniaturas', 'readonly', (l) => l.miniaturas.get(`${id}/${tipo}`)),
  salvarMiniaturas: (id, { mini, previa }) =>
    em('miniaturas', 'readwrite', (l) => {
      if (mini) l.miniaturas.put(mini, `${id}/mini`)
      if (previa) l.miniaturas.put(previa, `${id}/previa`)
    }),
  /** Quais destas fotos já têm miniatura guardada (um Set de ids). */
  async comMiniatura(ids) {
    const chaves = await em('miniaturas', 'readonly', (l) => l.miniaturas.getAllKeys(), [])
    const tem = new Set()
    for (const c of chaves) if (typeof c === 'string' && c.endsWith('/mini')) tem.add(c.slice(0, -5))
    return new Set(ids.filter((id) => tem.has(id)))
  },
}

/** A última coisa aberta (para reabrir ao recarregar). Fica no localStorage: é só um id. */
export const ultimo = {
  ler() {
    try {
      return localStorage.getItem('foto_trabalho')
    } catch {
      return null
    }
  },
  gravar(id) {
    try {
      if (id) localStorage.setItem('foto_trabalho', id)
      else localStorage.removeItem('foto_trabalho')
    } catch {
      // sem armazenamento: só não reabre sozinho
    }
  },
}
