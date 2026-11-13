// O lado do worker do pool (app/trabalho/pool.js). Um worker de módulo declara as tarefas e pronto:
//
//   import { servir, comTransferencia } from './servir.js'
//   servir({
//     async pixels({ blob }, { cancelado, progresso }) {
//       ...
//       if (cancelado()) return null
//       return comTransferencia({ largura, altura, rgba }, [rgba.buffer])   // sem cópia de volta
//     },
//   })
//
// Uma tarefa por vez em cada worker (quem distribui é o pool). Erro vira { ok: false, erro } e a promessa de quem pediu
// rejeita com a mesma mensagem.

const TRANSFERIR = Symbol('transferir')

/** Marca o resultado para voltar sem cópia: os buffers (ou ImageBitmap) em `lista` são transferidos. */
export function comTransferencia(resultado, lista) {
  return { [TRANSFERIR]: lista, resultado }
}

export function servir(tarefas, alvo = globalThis) {
  const cancelados = new Set()
  alvo.onmessage = async (e) => {
    const m = e.data
    if (m?.cancelar != null) {
      cancelados.add(m.cancelar)
      return
    }
    const { id, tipo, dados } = m
    try {
      const f = tarefas[tipo]
      if (!f) throw new Error(`tarefa desconhecida: ${tipo}`)
      const r = await f(dados, { cancelado: () => cancelados.has(id), progresso: (p) => alvo.postMessage({ id, progresso: p }) })
      if (r && r[TRANSFERIR]) alvo.postMessage({ id, ok: true, resultado: r.resultado }, r[TRANSFERIR])
      else alvo.postMessage({ id, ok: true, resultado: r })
    } catch (erro) {
      alvo.postMessage({ id, ok: false, erro: { nome: erro?.name || 'Error', mensagem: String(erro?.message ?? erro) } })
    } finally {
      cancelados.delete(id)
    }
  }
}
