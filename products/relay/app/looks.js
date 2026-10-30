// Relay · os looks (.cube) da pessoa, guardados no aparelho para a receita de cor da Revela. IndexedDB: um .cube de
// 65 pontos passa de 7 MB, grande demais para o localStorage. O preset guarda só { id, nome } do look; sem o look neste
// aparelho, a conversão diz qual falta (nunca sai sem ele). Quando a Revela estiver no ar, os looks dela entram aqui
// pela conta (docs/integration-contracts/relay.md, "Cor da Revela").

import { lerLook, lookPedeLog } from '../src/cor.js'

const BANCO = 'relay-looks'
const LOJA = 'looks'
const memoria = new Map() // janela privada ou sem IndexedDB: vale até fechar a aba

function abrir() {
  return new Promise((ok, falha) => {
    if (typeof indexedDB === 'undefined') return falha(new Error('sem IndexedDB'))
    const pedido = indexedDB.open(BANCO, 1)
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA, { keyPath: 'id' })
    pedido.onsuccess = () => ok(pedido.result)
    pedido.onerror = () => falha(pedido.error)
  })
}

async function loja(modo, f) {
  const db = await abrir()
  try {
    return await new Promise((ok, falha) => {
      const t = db.transaction(LOJA, modo)
      const r = f(t.objectStore(LOJA))
      t.oncomplete = () => ok(r?.result)
      t.onerror = () => falha(t.error)
    })
  } finally {
    db.close()
  }
}

/** [{ id, nome, pontos }], do mais novo ao mais antigo. */
export async function listar() {
  try {
    const todos = await loja('readonly', (s) => s.getAll())
    return todos.map(({ id, nome, pontos, criado, pedeLog }) => ({ id, nome, pontos, criado, pedeLog: Boolean(pedeLog) })).sort((a, b) => b.criado - a.criado)
  } catch {
    return [...memoria.values()].map(({ id, nome, pontos, criado, pedeLog }) => ({ id, nome, pontos, criado, pedeLog })).reverse()
  }
}

/** Confere o .cube e guarda. Devolve { id, nome, pedeLog } (`pedeLog`: o .cube diz que a entrada é log). Erro em português se o arquivo não for um .cube 3D. */
export async function guardar(nome, texto) {
  const lut = lerLook(texto)
  const item = { id: `look-${crypto.randomUUID().slice(0, 18)}`, nome: String(nome).replace(/\.cube$/i, '').trim().slice(0, 60) || 'Look', pontos: lut.tamanho, texto, criado: Date.now(), pedeLog: lookPedeLog(texto) }
  try {
    await loja('readwrite', (s) => s.put(item))
  } catch {
    memoria.set(item.id, item)
  }
  return { id: item.id, nome: item.nome, pedeLog: item.pedeLog }
}

/** O texto do .cube de um look guardado (para o motor: `opcoes.lerLook`). */
export async function ler(id) {
  let item = null
  try {
    item = await loja('readonly', (s) => s.get(id))
  } catch {
    item = memoria.get(id)
  }
  item ??= memoria.get(id)
  if (!item) throw Object.assign(new Error('Este look não está neste aparelho: carregue o .cube de novo.'), { codigo: 'look' })
  return item.texto
}

export async function apagar(id) {
  memoria.delete(id)
  try {
    await loja('readwrite', (s) => s.delete(id))
  } catch {
    // sem IndexedDB: só a memória
  }
}
