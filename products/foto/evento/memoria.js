// O que este celular guarda do evento, e só nele:
//   - na aba (sessionStorage): a chave do pedido de busca (modo com consentimento), para a página voltar sozinha se
//     recarregar. Some quando a aba fecha.
//   - "Lembrar neste celular" (IndexedDB, só se a pessoa ligar): a chave do pedido e os vetores (números, nunca a
//     selfie), para refazer a busca ao voltar sem tirar outra selfie. "Esquecer" apaga tudo.
// Nada disso vai para o servidor além do que cada pedido já leva.

import { token } from './rede.js'

const BANCO = 'evento'
const LOJA = 'lembrar'
const NA_ABA = `evento:${token.slice(0, 16)}`

function abrir() {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => falha(r.error)
  })
}
async function comLoja(modo, fn) {
  const db = await abrir()
  try {
    return await new Promise((ok, falha) => {
      const t = db.transaction(LOJA, modo)
      const r = fn(t.objectStore(LOJA))
      t.oncomplete = () => ok(r?.result)
      t.onerror = () => falha(t.error)
    })
  } finally {
    db.close()
  }
}

/** { chave?, vetores?, em } lembrado neste celular para este link, ou null. */
export async function lembrado() {
  try {
    return (await comLoja('readonly', (l) => l.get(token))) ?? null
  } catch {
    return null
  }
}

export async function lembrar(dados) {
  try {
    await comLoja('readwrite', (l) => l.put({ ...dados, em: Date.now() }, token))
    return true
  } catch {
    return false
  }
}

/** "Esquecer": apaga o que este celular lembra deste link (IndexedDB e a aba). */
export async function esquecer() {
  try {
    sessionStorage.removeItem(NA_ABA)
  } catch {
    /* sem armazenamento da aba */
  }
  try {
    await comLoja('readwrite', (l) => l.delete(token))
  } catch {
    /* nada guardado */
  }
}

export function chaveDaAba() {
  try {
    return sessionStorage.getItem(NA_ABA)
  } catch {
    return null
  }
}
export function guardarNaAba(chave) {
  try {
    sessionStorage.setItem(NA_ABA, chave)
  } catch {
    /* sem armazenamento da aba */
  }
}

/** Uma chave nova para o pedido de busca: 32 bytes aleatórios em base64url (o servidor guarda só o sha256). */
export function novaChave() {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}
