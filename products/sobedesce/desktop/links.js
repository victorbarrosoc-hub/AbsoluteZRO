// Links sobedesce:// que o app aceita (o sistema abre o app com eles). Puro e testado (test/links.test.js): o que não
// for exatamente um destes vira null e é ignorado. Hoje só um:
//
//   sobedesce://relay?presets=youtube-1080,reels&meus=<base64url do JSON das fichas>
//
// "Máxima qualidade" do site do Relay: abre a folha "Converter com o Relay" para arquivos deste computador, com os
// destinos já marcados. `presets` são ids de preset do Relay; `meus`, fichas de presets da pessoa
// (products/relay/src/personalizado.js). No máximo 8 destinos no total; o link inteiro até 8 KB.

const ID = /^[a-z0-9-]{2,40}$/
const MAX_LINK = 8192
const MAX_DESTINOS = 8

function base64urlParaTexto(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64').toString('utf8')
}

/** { tipo: 'relay', destinos: (id | ficha)[] } ou null. */
export function lerLinkSobedesce(texto) {
  if (typeof texto !== 'string' || texto.length > MAX_LINK) return null
  let u
  try {
    u = new URL(texto)
  } catch {
    return null
  }
  if (u.protocol !== 'sobedesce:' || u.hostname !== 'relay') return null
  const destinos = []
  for (const id of (u.searchParams.get('presets') || '').split(',').filter(Boolean)) {
    if (!ID.test(id)) return null
    destinos.push(id)
  }
  const meus = u.searchParams.get('meus')
  if (meus) {
    try {
      const lista = JSON.parse(base64urlParaTexto(meus))
      if (!Array.isArray(lista)) return null
      for (const f of lista) {
        if (!f || typeof f !== 'object' || Array.isArray(f) || typeof f.nome !== 'string') return null
        destinos.push(f)
      }
    } catch {
      return null
    }
  }
  if (destinos.length > MAX_DESTINOS) return null
  return { tipo: 'relay', destinos }
}

