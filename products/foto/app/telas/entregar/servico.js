// As rotas da galeria do fotógrafo (docs/API.md). Tudo pela própria origem (a CSP só deixa 'self'), com a sessão do
// cookie. Erro vira ErroServico com o `codigo` do servidor; sem rede, `codigo = 'rede'`.
//
// Sem armazenamento (503 sem_armazenamento), sem banco (503 sem_banco) ou sem sessão (401 sem_sessao) a galeria não
// existe: `foraDoAr(erro)` diz isso, e a tela mostra uma linha — nunca finge que publicou.

export class ErroServico extends Error {
  constructor(status, corpo) {
    super(corpo?.erro || `erro ${status}`)
    this.name = 'ErroServico'
    this.status = status
    this.codigo = corpo?.erro || (status ? `http_${status}` : 'rede')
    this.corpo = corpo
  }
}

/** A galeria não está disponível neste servidor (e não adianta tentar de novo agora). */
export const foraDoAr = (e) => e instanceof ErroServico && ['sem_armazenamento', 'sem_banco', 'sem_sessao'].includes(e.codigo)

const BASE = '/api/foto/galerias'

async function pedir(metodo, caminho, { corpo, bytes, sinal } = {}) {
  let r
  try {
    r = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: bytes ? { 'content-type': 'application/octet-stream' } : corpo ? { 'content-type': 'application/json' } : {},
      body: bytes ?? (corpo ? JSON.stringify(corpo) : undefined),
      signal: sinal,
    })
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    throw new ErroServico(0, { erro: 'rede' })
  }
  let dados = null
  try {
    dados = await r.json()
  } catch {
    dados = null
  }
  if (!r.ok || !dados?.ok) throw new ErroServico(r.status, dados)
  return dados
}

export const servico = {
  listar: () => pedir('GET', '').then((d) => d.galerias),
  criar: (ficha) => pedir('POST', '', { corpo: ficha }).then((d) => d.galeria),
  ler: (id) => pedir('GET', `/${id}`),
  alterar: (id, campos) => pedir('PATCH', `/${id}`, { corpo: campos }).then((d) => d.galeria),
  apagar: (id) => pedir('DELETE', `/${id}`),
  registrar: (id, fotos, sinal) => pedir('POST', `/${id}/fotos`, { corpo: { fotos }, sinal }).then((d) => d.fotos),
  enviarArquivo: (id, foto, variante, bytes, sinal) => pedir('PUT', `/${id}/arquivo?foto=${encodeURIComponent(foto)}&v=${variante}`, { bytes, sinal }),
  publicar: (id, opcoes) => pedir('POST', `/${id}/publicar`, { corpo: opcoes }),
  trocarLink: (id, opcoes) => pedir('POST', `/${id}/link`, { corpo: opcoes }),
  pin: (id, pin) => pedir('PATCH', `/${id}/link`, { corpo: { pin } }).then((d) => d.galeria),
  revogar: (id) => pedir('DELETE', `/${id}/link`).then((d) => d.galeria),
  reabrir: (id) => pedir('POST', `/${id}/reabrir`).then((d) => d.galeria),
  encerrar: (id) => pedir('POST', `/${id}/encerrar`).then((d) => d.galeria),
  selecao: (id) => pedir('GET', `/${id}/selecao`),
}

/** A galeria deste trabalho (o servidor não sabe de trabalho: o vínculo mora neste aparelho). */
export const vinculo = {
  ler(trabalho) {
    try {
      return localStorage.getItem(`foto_galeria:${trabalho}`) || null
    } catch {
      return null
    }
  },
  gravar(trabalho, id) {
    try {
      if (id) localStorage.setItem(`foto_galeria:${trabalho}`, id)
      else localStorage.removeItem(`foto_galeria:${trabalho}`)
    } catch {
      // sem armazenamento: a lista do servidor ainda mostra a galeria
    }
  },
  /** O trabalho deste aparelho ligado a uma galeria, ou null (o aviso pode ser de outro aparelho). */
  trabalhoDe(galeria) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const chave = localStorage.key(i)
        if (chave?.startsWith('foto_galeria:') && localStorage.getItem(chave) === galeria) return chave.slice('foto_galeria:'.length)
      }
    } catch {
      // sem armazenamento: nenhum
    }
    return null
  },
}

export const ETIQUETAS = {
  suavizar_pele: 'Suavizar pele',
  preto_e_branco: 'Preto e branco',
  remover_objeto: 'Remover objeto',
  clarear: 'Clarear',
  recortar: 'Recortar',
}
