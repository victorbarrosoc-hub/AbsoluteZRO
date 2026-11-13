// Pool de workers genérico: N = núcleos − 1 workers de módulo rodando o mesmo arquivo, com fila de prioridade,
// cancelamento e transferência sem cópia. É o que mantém a tela a 60 qps enquanto as miniaturas, a análise e a
// revelação rodam.
//
//   const pool = criarPool(new URL('./meu-worker.js', import.meta.url))
//   const r = await pool.pedir('tarefa', dados, { prioridade: 5, chave: foto.id, transferir: [buffer], sinal })
//   pool.priorizar(foto.id, 10)   // a foto entrou na tela
//   pool.cancelar(foto.id)        // não precisa mais
//
// O worker usa `servir` (app/trabalho/servir.js). Protocolo: ida { id, tipo, dados } e { cancelar: id };
// volta { id, ok, resultado | erro } e, no meio, { id, progresso }.
//
// Um pedido com a mesma `chave` de outro que ainda não terminou devolve a MESMA promessa (e fica com a prioridade
// maior): pedir duas vezes a miniatura da mesma foto não gera duas.

/** Quantos workers: núcleos − 1 (um fica para a tela), entre 1 e 8. */
export function tamanhoPadrao(nucleos = globalThis.navigator?.hardwareConcurrency || 4) {
  return Math.max(1, Math.min(8, nucleos - 1))
}

export class Cancelado extends Error {
  constructor() {
    super('cancelado')
    this.name = 'AbortError'
  }
}

/**
 * `url`: o arquivo do worker (módulo). `tamanho`: quantos (padrão núcleos − 1). `criar`: fábrica de worker (os testes
 * trocam). Os workers nascem sob demanda: sem pedido, nenhum existe.
 */
export function criarPool(url, { tamanho = tamanhoPadrao(), nome = 'trabalho', criar } = {}) {
  const fabricar = criar ?? (() => new Worker(url, { type: 'module', name: nome }))
  /** @type {{ worker: Worker, tarefa: any }[]} */
  const workers = []
  const fila = []
  const porId = new Map()
  const porChave = new Map()
  let seq = 0
  let encerrado = false

  function nascer() {
    const w = { worker: fabricar(), tarefa: null }
    w.worker.onmessage = (e) => {
      const m = e.data
      const t = w.tarefa
      if (!t || m?.id !== t.id) return
      if (m.progresso !== undefined) return t.aoProgredir?.(m.progresso)
      w.tarefa = null
      terminar(t)
      if (!t.cancelada) {
        if (m.ok) t.resolver(m.resultado)
        else t.rejeitar(Object.assign(new Error(m.erro?.mensagem || 'falhou'), { name: m.erro?.nome || 'Error' }))
      }
      despachar()
    }
    w.worker.onerror = (e) => {
      // o worker quebrou (erro de sintaxe, módulo que não carregou): a tarefa falha e ele é trocado
      const t = w.tarefa
      w.tarefa = null
      workers.splice(workers.indexOf(w), 1)
      w.worker.terminate()
      if (t) {
        terminar(t)
        if (!t.cancelada) t.rejeitar(new Error(e?.message || 'o worker falhou'))
      }
      despachar()
    }
    workers.push(w)
    return w
  }

  function terminar(t) {
    porId.delete(t.id)
    if (t.chave != null && porChave.get(t.chave) === t) porChave.delete(t.chave)
    t.sinal?.removeEventListener('abort', t.aoAbortar)
  }

  function proxima() {
    let melhor = -1
    for (let i = 0; i < fila.length; i++) {
      const t = fila[i]
      if (melhor < 0 || t.prioridade > fila[melhor].prioridade || (t.prioridade === fila[melhor].prioridade && t.ordem < fila[melhor].ordem)) melhor = i
    }
    return melhor < 0 ? null : fila.splice(melhor, 1)[0]
  }

  function despachar() {
    if (encerrado) return
    while (fila.length) {
      const livre = workers.find((w) => !w.tarefa) ?? (workers.length < tamanho ? nascer() : null)
      if (!livre) return
      const t = proxima()
      livre.tarefa = t
      t.rodando = true
      try {
        livre.worker.postMessage({ id: t.id, tipo: t.tipo, dados: t.dados }, t.transferir)
      } catch (erro) {
        livre.tarefa = null
        terminar(t)
        t.rejeitar(erro)
      }
      t.dados = null
      t.transferir = null
    }
  }

  function cancelarTarefa(t) {
    if (!t || t.cancelada) return
    t.cancelada = true
    const i = fila.indexOf(t)
    if (i >= 0) {
      fila.splice(i, 1)
      terminar(t)
    } else {
      // já está rodando: o worker é avisado (a tarefa pode parar no meio) e a resposta, quando vier, é ignorada
      workers.find((w) => w.tarefa === t)?.worker.postMessage({ cancelar: t.id })
    }
    t.rejeitar(new Cancelado())
  }

  return {
    tamanho,
    /** Quantas tarefas esperam na fila e quantas estão rodando. */
    get pendentes() {
      return fila.length
    },
    get rodando() {
      return workers.filter((w) => w.tarefa).length
    },
    get workers() {
      return workers.length
    },
    /**
     * Pede uma tarefa. `prioridade` maior sai antes (empate: quem chegou primeiro). `chave` identifica o pedido para
     * priorizar, cancelar e não repetir. `sinal`: AbortSignal. `aoProgredir(p)`: avisos do meio do caminho.
     */
    pedir(tipo, dados, { prioridade = 0, transferir = [], sinal, chave, aoProgredir } = {}) {
      if (encerrado) return Promise.reject(new Cancelado())
      if (sinal?.aborted) return Promise.reject(new Cancelado())
      if (chave != null && porChave.has(chave)) {
        const ja = porChave.get(chave)
        if (prioridade > ja.prioridade) ja.prioridade = prioridade
        return ja.promessa
      }
      const t = { id: ++seq, ordem: seq, tipo, dados, transferir, prioridade, chave, sinal, aoProgredir, rodando: false, cancelada: false }
      t.promessa = new Promise((resolver, rejeitar) => {
        t.resolver = resolver
        t.rejeitar = rejeitar
      })
      t.aoAbortar = () => cancelarTarefa(t)
      sinal?.addEventListener('abort', t.aoAbortar, { once: true })
      porId.set(t.id, t)
      if (chave != null) porChave.set(chave, t)
      fila.push(t)
      despachar()
      return t.promessa
    },
    /** Muda a prioridade de um pedido que ainda está na fila. Devolve se achou. */
    priorizar(chave, prioridade) {
      const t = porChave.get(chave)
      if (!t || t.rodando) return false
      t.prioridade = prioridade
      return true
    },
    /** Cancela pela chave (a promessa rejeita com AbortError). */
    cancelar(chave) {
      const t = porChave.get(chave)
      if (!t) return false
      cancelarTarefa(t)
      return true
    },
    /** Cancela tudo o que está na fila e rodando (os workers ficam). */
    cancelarTudo() {
      for (const t of [...porId.values()]) cancelarTarefa(t)
    },
    /** Encerra os workers. O pool não aceita mais pedidos. */
    encerrar() {
      for (const t of [...porId.values()]) cancelarTarefa(t)
      encerrado = true
      for (const w of workers) w.worker.terminate()
      workers.length = 0
    },
  }
}
