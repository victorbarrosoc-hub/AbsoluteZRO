// A conversa da página do visitante com o servidor: sempre pelo token do endereço (/e/<token>), em POST com JSON para
// /api/evento/<acao>. O que sai daqui: o token, a versão do texto que a pessoa aceitou e, na busca, só os vetores
// (128 números por quadro). A selfie não sai: não existe pedido que leve imagem.

export const token = location.pathname.split('/')[2] ?? ''
export const base = `/e/${token}`

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
    r = await fetch(`/api/evento/${acao}`, {
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
    /* sem JSON: erro genérico */
  }
  if (!r.ok || !dados?.ok) throw new Falha(dados?.erro || (r.status === 404 ? 'link' : 'erro'), r.status, dados)
  return dados
}

/** O endereço de uma prévia (com marca-d'água): a miniatura na grade, a prévia na foto grande. */
export const enderecoDaFoto = (foto, mini = false) => `${base}/i/${foto.id}?${mini && foto.mini ? `v=mini&s=${foto.mini}` : `s=${foto.v}`}`
