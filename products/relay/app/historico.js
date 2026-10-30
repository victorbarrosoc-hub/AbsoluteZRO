// Relay · o histórico e os projetos do painel, no IndexedDB deste aparelho, separados por conta (o `id` que o
// /api/zro/eu devolve: um resumo do sub, nunca o e-mail). Nada sobe: o servidor do Relay só cuida do login.
// Sem IndexedDB (janela privada antiga): vale até fechar a aba.

import { HISTORICO_MAX } from '../src/painel.js'

const BANCO = 'relay-painel'
const memoria = { conversoes: new Map(), projetos: new Map() }

function abrir() {
  return new Promise((ok, falha) => {
    if (typeof indexedDB === 'undefined') return falha(new Error('sem IndexedDB'))
    const pedido = indexedDB.open(BANCO, 1)
    pedido.onupgradeneeded = () => {
      for (const loja of ['conversoes', 'projetos']) pedido.result.createObjectStore(loja, { keyPath: 'id' }).createIndex('conta', 'conta')
    }
    pedido.onsuccess = () => ok(pedido.result)
    pedido.onerror = () => falha(pedido.error)
  })
}

async function loja(nome, modo, f) {
  const db = await abrir()
  try {
    return await new Promise((ok, falha) => {
      const t = db.transaction(nome, modo)
      const r = f(t.objectStore(nome))
      t.oncomplete = () => ok(r?.result)
      t.onerror = () => falha(t.error)
    })
  } finally {
    db.close()
  }
}

async function todos(nome, conta) {
  try {
    return await loja(nome, 'readonly', (s) => s.index('conta').getAll(conta))
  } catch {
    return [...memoria[nome].values()].filter((x) => x.conta === conta)
  }
}

async function por(nome, item) {
  try {
    await loja(nome, 'readwrite', (s) => s.put(item))
  } catch {
    memoria[nome].set(item.id, item)
  }
}

async function tirar(nome, ids) {
  for (const id of ids) memoria[nome].delete(id)
  try {
    await loja(nome, 'readwrite', (s) => {
      for (const id of ids) s.delete(id)
    })
  } catch {
    // sem IndexedDB: só a memória
  }
}

/** Conversões da conta, da mais nova à mais antiga. */
export async function conversoes(conta) {
  return (await todos('conversoes', conta)).sort((a, b) => b.quando - a.quando)
}

/** Guarda uma conversão (src/painel.js `registro`). Passou do limite: as mais antigas saem. */
export async function registrar(conta, r) {
  if (!conta) return
  await por('conversoes', { ...r, conta })
  const lista = await conversoes(conta)
  if (lista.length > HISTORICO_MAX) await tirar('conversoes', lista.slice(HISTORICO_MAX).map((x) => x.id))
}

/** Troca o histórico da conta pela lista dada (a sincronização com a conta: app/nuvem.js). */
export async function substituirConversoes(conta, lista) {
  const ficam = new Set(lista.map((x) => x.id))
  await tirar('conversoes', (await conversoes(conta)).filter((x) => !ficam.has(x.id)).map((x) => x.id))
  for (const c of lista) await por('conversoes', { ...c, conta })
}

/** Troca os projetos da conta (os dela e os da equipe) pela lista dada. */
export async function substituirProjetos(conta, lista) {
  const ficam = new Set(lista.map((x) => x.id))
  await tirar('projetos', (await projetos(conta)).filter((x) => !ficam.has(x.id)).map((x) => x.id))
  for (const p of lista) await por('projetos', { ...p, conta })
}

export async function limpar(conta) {
  await tirar('conversoes', (await conversoes(conta)).map((x) => x.id))
}

/** Projetos da conta, do mais mexido ao menos. */
export async function projetos(conta) {
  return (await todos('projetos', conta)).sort((a, b) => b.atualizado - a.atualizado)
}

export async function projetoPorId(conta, id) {
  return (await projetos(conta)).find((p) => p.id === id) ?? null
}

/** Guarda um projeto (src/painel.js `projeto`). */
export async function guardarProjeto(conta, p) {
  if (!conta) return
  await por('projetos', { ...p, conta })
}

/** Apaga o projeto; as conversões dele ficam no histórico, sem projeto. */
export async function apagarProjeto(conta, id) {
  await tirar('projetos', [id])
  for (const c of await conversoes(conta)) if (c.projeto === id) await por('conversoes', { ...c, projeto: null })
}
