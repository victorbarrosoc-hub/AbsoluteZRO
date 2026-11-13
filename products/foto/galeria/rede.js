// A conversa da página do cliente com o servidor: sempre pelo token do endereço (/g/<token>), em POST com JSON para
// /api/link/<acao>. As escritas saem em fila (uma de cada vez, na ordem dos toques). Erro vira `Falha` com o código que
// a tela sabe mostrar: 'rede' (sem conexão), 'link' (não vale mais), 'pin', 'limite', 'travada', 'cheia', …

export const token = location.pathname.split('/')[2] ?? ''
export const base = `/g/${token}`

export class Falha extends Error {
  constructor(codigo, status = 0, dados = null) {
    super(codigo)
    this.codigo = codigo
    this.status = status
    this.dados = dados
  }
}

export async function pedir(acao, corpo = {}) {
  let r
  try {
    r = await fetch(`/api/link/${acao}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ token, ...corpo }),
    })
  } catch {
    throw new Falha('rede')
  }
  let dados = null
  try {
    dados = await r.json()
  } catch {
    /* resposta sem JSON: cai no erro genérico */
  }
  if (!r.ok || !dados?.ok) throw new Falha(dados?.erro || (r.status === 404 ? 'link' : 'erro'), r.status, dados)
  return dados
}

let fila = Promise.resolve()
/** Escrita em fila: a seguinte só sai quando a anterior terminou (dois toques seguidos chegam na ordem). */
export function escrever(acao, corpo) {
  const vez = fila.then(() => pedir(acao, corpo))
  fila = vez.catch(() => {})
  return vez
}

/** O endereço de uma foto: a miniatura (se veio) na grade, a prévia no visor. O `s` deixa o navegador guardar. */
export const enderecoDaFoto = (foto, mini = false) => `${base}/i/${foto.id}?${mini && foto.mini ? `v=mini&s=${foto.mini}` : `s=${foto.v}`}`
