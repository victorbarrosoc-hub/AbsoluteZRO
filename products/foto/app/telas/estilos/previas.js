// As prévias dos estilos: cada cartão é a foto da pessoa revelada com aquele estilo, num pool de workers
// (previa-worker.js) com fila de prioridade (o que está na tela passa na frente) e cache por (foto, estilo, ajustes da
// foto, intensidade, tamanho). O palco usa o mesmo caminho, em tamanho maior e com prioridade máxima.
//
//   const previas = criarPrevias()
//   previas.pedir({ fonte, p, daFoto, intensidade, lado, prioridade }) → Promise<url | null>
//   previas.pronta(chave) → url | null       (na hora, se já está no cache)
//   previas.priorizar(chave, prioridade) · previas.esquecerFonte(chave) · previas.corrigir(…) · previas.lote(…) · previas.extrair(…)

import { criarPool, tamanhoPadrao } from '../../trabalho/pool.js'
import { hashDe } from '../../../src/estilo/predefinicao.js'

const WORKER = new URL('./previa-worker.js', import.meta.url)
const MAXIMO = 600

/** Assinatura curta do conteúdo de um estilo (o que muda a imagem): ajustes, levar e look. */
export function assinaturaDoEstilo(p) {
  if (!p) return 'antes'
  return `${p.id}:${hashDe(JSON.stringify([p.ajustes, p.levar, p.look ? [p.look.lado, p.look.dados.length, p.look.dados.slice(0, 48)] : null]))}`
}

export function criarPrevias({ pool = criarPool(WORKER, { tamanho: Math.min(3, tamanhoPadrao()), nome: 'estilos' }) } = {}) {
  /** chave → url (blob:) na ordem de uso */
  const urls = new Map()
  const andamento = new Map()
  const tempos = []

  function lembrar(chave, blob) {
    const url = URL.createObjectURL(blob)
    urls.set(chave, url)
    if (urls.size > MAXIMO) {
      for (const [k, u] of urls) {
        if (urls.size <= MAXIMO) break
        URL.revokeObjectURL(u)
        urls.delete(k)
      }
    }
    return url
  }

  const chaveDe = ({ fonte, p, daFoto, intensidade = 100, lado = 320, local = true }) =>
    `${fonte.chave}|${lado}|${local ? 'l' : 's'}|${assinaturaDoEstilo(p)}|${p ? intensidade : ''}|${hashDe(JSON.stringify(daFoto ?? null))}`

  return {
    pool,
    chaveDe,
    pronta(chave) {
      const u = urls.get(chave)
      if (u) {
        urls.delete(chave)
        urls.set(chave, u)
      }
      return u ?? null
    },
    /** Revela (ou devolve do cache). `prioridade`: maior sai antes. Rejeita com AbortError se cancelado. */
    pedir(pedido, { prioridade = 0, sinal } = {}) {
      const chave = chaveDe(pedido)
      const pronta = urls.get(chave)
      if (pronta) return Promise.resolve(pronta)
      if (andamento.has(chave)) {
        if (prioridade) pool.priorizar(chave, prioridade)
        return andamento.get(chave)
      }
      const { fonte, p, daFoto, intensidade = 100, lado = 320, local = true } = pedido
      const promessa = pool
        .pedir('previa', { fonte, p, daFoto, intensidade, lado, local }, { prioridade, chave, sinal })
        .then((r) => {
          if (!r) return null
          tempos.push({ lado, ms: r.ms })
          if (tempos.length > 400) tempos.shift()
          return lembrar(chave, r.blob)
        })
        .finally(() => andamento.delete(chave))
      andamento.set(chave, promessa)
      return promessa
    },
    priorizar: (chave, prioridade) => pool.priorizar(chave, prioridade),
    cancelar: (chave) => pool.cancelar(chave),
    /** Quanto custou cada prévia (ms no worker), para medir. */
    tempos: () => tempos.slice(),
    /** A correção da foto (exposição e branco) no modo pedido; não depende do estilo. */
    corrigir: (fonte, ajustes, modo) => pool.pedir('corrigir', { fonte, ajustes, modo }, { prioridade: 90 }),
    lote: (dados, { aoProgredir, sinal } = {}) => pool.pedir('lote', dados, { prioridade: 80, aoProgredir, sinal }),
    extrair: (dados) => pool.pedir('extrair', dados, { prioridade: 95 }),
    encerrar() {
      pool.encerrar()
      for (const u of urls.values()) URL.revokeObjectURL(u)
      urls.clear()
    },
  }
}
