// O acervo de estilos da pessoa: a biblioteca (src/estilo/biblioteca.js, JSON puro) guardada neste aparelho
// (IndexedDB `foto-estilos`, não depende do trabalho aberto) e a cópia na conta (docs/API.md, "Predefinições na
// conta"). Sem banco ou sem sessão a conta simplesmente não aparece: os estilos locais seguem valendo.
//
//   const acervo = criarAcervo()
//   acervo.estado() · acervo.mudar(f, { rotulo }) → desfazer · acervo.assinar(f)
//   acervo.conta() → { ligada, minhas: [Predefinicao], equipe: [Predefinicao], fichas: Map(chave → ficha) }
//   acervo.lerConta() · acervo.guardarNaConta(p, { compartilhada })

import { criarBiblioteca, normalizarBiblioteca } from '../../../src/estilo/biblioteca.js'
import { validar } from '../../../src/estilo/predefinicao.js'

const BANCO = 'foto-estilos'
const LOJA = 'kv'
let abrindo = null

function banco() {
  abrindo ??= new Promise((ok) => {
    try {
      const pedido = indexedDB.open(BANCO, 1)
      pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA)
      pedido.onsuccess = () => ok(pedido.result)
      pedido.onerror = () => ok(null)
      pedido.onblocked = () => ok(null)
    } catch {
      ok(null)
    }
  })
  return abrindo
}

async function ler(chave) {
  const b = await banco()
  if (!b) return null
  return new Promise((ok) => {
    try {
      const p = b.transaction(LOJA, 'readonly').objectStore(LOJA).get(chave)
      p.onsuccess = () => ok(p.result ?? null)
      p.onerror = () => ok(null)
    } catch {
      ok(null)
    }
  })
}

async function gravar(chave, valor) {
  const b = await banco()
  if (!b) return false
  return new Promise((ok) => {
    try {
      const t = b.transaction(LOJA, 'readwrite')
      t.objectStore(LOJA).put(valor, chave)
      t.oncomplete = () => ok(true)
      t.onerror = () => ok(false)
    } catch {
      ok(false)
    }
  })
}

const pedirJson = async (url, opcoes) => {
  const r = await fetch(url, { credentials: 'same-origin', ...opcoes, headers: { 'content-type': 'application/json', ...(opcoes?.headers || {}) } })
  let corpo = null
  try {
    corpo = await r.json()
  } catch {
    corpo = null
  }
  return { status: r.status, corpo }
}

export function criarAcervo() {
  let estado = criarBiblioteca()
  let pronto = false
  let conta = { ligada: false, minhas: [], equipe: [], fichas: new Map() }
  const ouvintes = new Set()
  const publicar = () => ouvintes.forEach((f) => f())
  let relogio = null

  const salvar = () => {
    clearTimeout(relogio)
    relogio = setTimeout(() => void gravar('biblioteca', estado), 200)
  }

  const carregando = ler('biblioteca').then((guardado) => {
    if (guardado) estado = normalizarBiblioteca(guardado)
    pronto = true
    publicar()
  })

  return {
    carregando,
    pronto: () => pronto,
    estado: () => estado,
    conta: () => conta,
    assinar(f) {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    /** Troca o estado por `f(estado)`. Devolve a função que volta ao anterior (o Desfazer do aviso). */
    mudar(f) {
      const antes = estado
      const depois = f(estado)
      if (!depois || depois === antes) return () => {}
      estado = depois
      salvar()
      publicar()
      return () => {
        estado = antes
        salvar()
        publicar()
      }
    },
    /**
     * Lê a conta. Primeiro pergunta ao servidor se há banco (`/api/foto/saude` sempre responde 200): sem banco, nem
     * tenta. Sem sessão (401) ou qualquer falha: a conta fica desligada, sem alarme.
     */
    async lerConta() {
      try {
        const saude = await pedirJson('/api/foto/saude')
        if (!saude.corpo?.ok) return conta
        const lista = await pedirJson('/api/foto/predefinicoes')
        if (lista.status !== 200 || !lista.corpo?.ok) return conta
        const cache = (await ler('conta')) || {}
        const fichas = new Map()
        const carregar = async (ficha) => {
          fichas.set(ficha.chave, ficha)
          const guardada = cache[ficha.id]
          if (guardada && guardada.atualizadaEm === ficha.atualizadaEm) return guardada.json
          const r = await pedirJson(`/api/foto/predefinicoes/${encodeURIComponent(ficha.id)}`)
          if (r.status !== 200 || !r.corpo?.predefinicao?.json) return null
          cache[ficha.id] = { atualizadaEm: ficha.atualizadaEm, json: r.corpo.predefinicao.json }
          return r.corpo.predefinicao.json
        }
        const valida = (json, ficha) => {
          try {
            return validar({ ...json, nome: ficha.nome, familia: ficha.familia || json?.familia })
          } catch {
            return null
          }
        }
        const minhas = []
        const equipe = []
        // quatro de cada vez
        const fila = [...(lista.corpo.minhas || []).map((f) => [f, minhas]), ...(lista.corpo.equipe || []).map((f) => [f, equipe])].slice(0, 400)
        await Promise.all(
          Array.from({ length: 4 }, async () => {
            while (fila.length) {
              const [ficha, destino] = fila.shift()
              const json = await carregar(ficha).catch(() => null)
              const p = json && valida(json, ficha)
              if (p) destino.push(p)
            }
          }),
        )
        void gravar('conta', cache)
        conta = { ligada: true, minhas, equipe, fichas }
        publicar()
      } catch {
        // sem rede ou sem conta: só o que está neste aparelho
      }
      return conta
    },
    /** Grava (ou atualiza) um estilo na conta; `compartilhada` divide com a equipe. Devolve { ok, erro? }. */
    async guardarNaConta(p, { compartilhada = false } = {}) {
      try {
        const r = await pedirJson('/api/foto/predefinicoes', {
          method: 'PUT',
          body: JSON.stringify({ chave: p.id, nome: p.nome, familia: p.familia, compartilhada, json: p }),
        })
        if (r.status === 200 && r.corpo?.ok) {
          void this.lerConta()
          return { ok: true }
        }
        return { ok: false, erro: r.corpo?.erro || String(r.status) }
      } catch {
        return { ok: false, erro: 'rede' }
      }
    },
  }
}
