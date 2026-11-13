// Miniaturas instantâneas. Uma fila com prioridade para o que está na tela: a grade diz quais fotos aparecem
// (`mostrar`) e essas passam na frente; o resto vai sendo feito por trás. Cada foto gera a miniatura (~400 px) e a
// prévia de análise (1024 px no lado maior), guardadas no IndexedDB por id da foto: reabrir o trabalho não refaz nada.
//
// Quem desenha usa `url(id)` (na hora, se já está na memória) e `assinar(id, f)` para saber quando chega.
// Os endereços (blob:) ficam num cache limitado; o que sai dele volta do IndexedDB quando a foto reaparece.

import { criarPool } from '../trabalho/pool.js'
import { guardar } from './guardar.js'

const WORKER = new URL('../trabalho/miniatura-worker.js', import.meta.url)
const MAXIMO_NA_MEMORIA = 1600
const NA_TELA = 100
const POR_TRAS = 0

/**
 * `arquivoDe(id)` → { arquivo: File, par?: File, tipo } | null (null: o original não está ligado).
 * `aoGerar(id, { proporcao, exif, semPrevia })`: a foto ganhou miniatura (ou se soube que não tem).
 */
export function criarMiniaturas({ arquivoDe, aoGerar, pool = criarPool(WORKER, { nome: 'miniaturas' }) }) {
  /** id → url (blob:), na ordem de uso (o Map guarda a ordem de entrada: quem é usado volta para o fim) */
  const urls = new Map()
  const ouvintes = new Map()
  const andamento = new Map()
  const semPrevia = new Set()
  const guardadas = new Set()
  /** ids que já se conferiu que NÃO estão no IndexedDB (não vale a pena procurar de novo) */
  const semGuardar = new Set()
  /** ids sem miniatura guardada e sem o original ao alcance: não há de onde tirar (a tela não finge que está vindo) */
  const faltando = new Set()
  let naTela = new Set()
  let total = 0
  let feitas = 0
  const progresso = new Set()

  const avisar = (id) => ouvintes.get(id)?.forEach((f) => f())
  const avisarProgresso = () => progresso.forEach((f) => f({ feitas, total }))

  function lembrar(id, blob) {
    const antiga = urls.get(id)
    if (antiga) URL.revokeObjectURL(antiga)
    urls.delete(id)
    urls.set(id, URL.createObjectURL(blob))
    if (urls.size > MAXIMO_NA_MEMORIA) {
      for (const [velho, u] of urls) {
        if (urls.size <= MAXIMO_NA_MEMORIA) break
        if (naTela.has(velho)) continue
        URL.revokeObjectURL(u)
        urls.delete(velho)
      }
    }
    avisar(id)
  }

  async function gerar(id, prioridade) {
    const origem = await arquivoDe(id)
    if (!origem) {
      faltando.add(id)
      avisar(id)
      return false
    }
    const r = await pool.pedir('miniatura', { arquivo: origem.arquivo, par: origem.par, tipo: origem.tipo }, { prioridade: naTela.has(id) ? NA_TELA : prioridade, chave: `mini:${id}` })
    if (!r) return false
    if (r.semPrevia) {
      semPrevia.add(id)
      aoGerar?.(id, { semPrevia: true, exif: r.exif })
      avisar(id)
      return false
    }
    guardadas.add(id)
    lembrar(id, r.mini)
    // guarda por trás: a tela não espera o disco
    guardar.salvarMiniaturas(id, { mini: r.mini, previa: r.previa })
    aoGerar?.(id, { proporcao: r.proporcao, exif: r.exif, origem: r.origem })
    return true
  }

  /** Garante a miniatura de uma foto: memória → IndexedDB → gerar. Devolve se ela existe. */
  function pedir(id, prioridade = POR_TRAS) {
    if (urls.has(id)) return Promise.resolve(true)
    if (semPrevia.has(id) || faltando.has(id)) return Promise.resolve(false)
    if (andamento.has(id)) {
      if (prioridade > POR_TRAS) pool.priorizar(`mini:${id}`, prioridade)
      return andamento.get(id)
    }
    const p = (async () => {
      try {
        const blob = semGuardar.has(id) ? null : await guardar.miniatura(id, 'mini')
        if (blob) {
          guardadas.add(id)
          lembrar(id, blob)
          return true
        }
        return await gerar(id, prioridade)
      } catch {
        return false
      } finally {
        andamento.delete(id)
      }
    })()
    andamento.set(id, p)
    return p
  }

  return {
    pool,
    /** O endereço da miniatura se já está na memória, senão null (e `pedir` traz). */
    url(id) {
      const u = urls.get(id)
      if (u) {
        urls.delete(id)
        urls.set(id, u)
      }
      return u ?? null
    },
    /** Esta foto não tem prévia que o navegador abra (a tela mostra o cartão sem imagem, com o motivo). */
    semPrevia: (id) => semPrevia.has(id),
    /** Não há miniatura guardada nem original ao alcance para fazer uma (trabalho reaberto sem os arquivos). */
    falta: (id) => faltando.has(id),
    /** Os originais voltaram (a pasta foi religada, as fotos foram escolhidas de novo): o que faltava pode ser feito. */
    religou() {
      const ids = [...faltando]
      faltando.clear()
      ids.forEach(avisar)
    },
    pedir,
    /** Chama `f()` quando a miniatura da foto chega ou muda. Devolve a função que cancela. */
    assinar(id, f) {
      if (!ouvintes.has(id)) ouvintes.set(id, new Set())
      ouvintes.get(id).add(f)
      return () => {
        const s = ouvintes.get(id)
        s?.delete(f)
        if (s && !s.size) ouvintes.delete(id)
      }
    },
    /** A grade avisa o que está na tela: essas fotos passam na frente da fila. */
    mostrar(ids) {
      const antes = naTela
      naTela = new Set(ids)
      // o que saiu da tela volta para o fim da fila
      for (const id of antes) if (!naTela.has(id) && andamento.has(id)) pool.priorizar(`mini:${id}`, POR_TRAS)
      for (const id of ids) {
        if (urls.has(id) || semPrevia.has(id) || faltando.has(id)) continue
        if (andamento.has(id)) pool.priorizar(`mini:${id}`, NA_TELA)
        else pedir(id, NA_TELA)
      }
    },
    /**
     * Faz por trás as miniaturas de todas (as que já estão guardadas não são refeitas). `aoProgresso` em
     * `assinarProgresso` acompanha. Devolve quando acabar.
     */
    async gerarTudo(ids) {
      const prontas = await guardar.comMiniatura(ids)
      for (const id of prontas) guardadas.add(id)
      const faltam = ids.filter((id) => !prontas.has(id) && !urls.has(id) && !semPrevia.has(id) && !faltando.has(id))
      for (const id of faltam) semGuardar.add(id)
      total += faltam.length
      avisarProgresso()
      await Promise.all(
        faltam.map((id) =>
          pedir(id, POR_TRAS).finally(() => {
            feitas++
            avisarProgresso()
          }),
        ),
      )
      if (feitas >= total) {
        feitas = 0
        total = 0
        avisarProgresso()
      }
    },
    progresso: () => ({ feitas, total }),
    assinarProgresso(f) {
      progresso.add(f)
      return () => progresso.delete(f)
    },
    /** O Blob guardado: 'mini' (~400 px) ou 'previa' (1024 px, a que a decupagem mede e a lupa mostra). */
    async blob(id, tipo = 'previa') {
      let b = await guardar.miniatura(id, tipo)
      if (!b && !semPrevia.has(id)) {
        await pedir(id, NA_TELA)
        // acabou de ser gerada: a gravação pode estar a caminho
        for (let i = 0; i < 20 && !b; i++) {
          b = await guardar.miniatura(id, tipo)
          if (!b) await new Promise((ok) => setTimeout(ok, 50))
        }
      }
      return b ?? null
    },
    /** A prévia como pixels ({ largura, altura, rgba }), no worker: é a entrada de `medir()` da decupagem. */
    async pixels(id, { lado } = {}) {
      const blob = await this.blob(id, 'previa')
      return blob ? pool.pedir('pixels', { blob, lado }, { prioridade: POR_TRAS + 1 }) : null
    },
    /** A maior JPEG embutida de um RAW (para o zoom de 100%): { blob, orientacao } ou null. */
    async grande(id) {
      const origem = await arquivoDe(id)
      if (!origem) return null
      if (origem.tipo !== 'raw') return { blob: origem.arquivo, orientacao: 1, doNavegador: true }
      const r = await pool.pedir('grande', { arquivo: origem.arquivo }, { prioridade: NA_TELA + 1, chave: `grande:${id}` }).catch(() => null)
      if (r) return r
      return origem.par ? { blob: origem.par, orientacao: 1, doNavegador: true } : null
    },
    /** Identifica arquivos (EXIF do começo de cada um), em lotes pelo pool. Devolve na mesma ordem. */
    async identificar(arquivos, { aoLote } = {}) {
      const LOTE = 24
      const saida = new Array(arquivos.length)
      const lotes = []
      for (let i = 0; i < arquivos.length; i += LOTE) lotes.push(i)
      await Promise.all(
        lotes.map(async (inicio) => {
          const parte = arquivos.slice(inicio, inicio + LOTE)
          let r
          try {
            r = await pool.pedir('identificar', { arquivos: parte }, { prioridade: NA_TELA + 10 })
          } catch {
            r = parte.map(() => ({ exif: { orientacao: 1 } }))
          }
          r.forEach((x, k) => (saida[inicio + k] = x))
          aoLote?.(inicio, r)
        }),
      )
      return saida
    },
    /** Esquece o que está na memória (ao fechar o trabalho). O que está guardado fica. */
    limpar() {
      pool.cancelarTudo()
      for (const u of urls.values()) URL.revokeObjectURL(u)
      urls.clear()
      semPrevia.clear()
      faltando.clear()
      semGuardar.clear()
      guardadas.clear()
      andamento.clear()
      naTela = new Set()
      total = 0
      feitas = 0
      avisarProgresso()
    },
  }
}
