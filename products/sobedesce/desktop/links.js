// Links sobedesce:// que o app aceita (o sistema abre o app com eles). Puro e testado (test/relay.test.js): o que não
// for exatamente um destes vira null e é ignorado:
//
//   sobedesce://relay?presets=youtube-1080,reels&meus=<base64url do JSON das fichas>
//   sobedesce://looks            (sobedesce://looks?trocar=1 escolhe as duas pastas de novo)
//
// "Looks do Relay" (30/10/2026): o site do Relay grava os .cube numa pasta deste computador; o link abre o Comparar
// com essa pasta e a pasta do Drive dos looks (escolhidas uma vez), para subir o que falta e baixar o que só está lá.
// Sem parâmetros: o navegador não sabe o caminho da pasta, e o app não aceita caminho vindo de fora.
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

/** { tipo: 'relay', destinos: (id | ficha)[] }, { tipo: 'looks' } ou null. */
export function lerLinkSobedesce(texto) {
  if (typeof texto !== 'string' || texto.length > MAX_LINK) return null
  let u
  try {
    u = new URL(texto)
  } catch {
    return null
  }
  if (u.protocol !== 'sobedesce:') return null
  if (u.hostname === 'looks') {
    if (u.pathname && u.pathname !== '/') return null
    if (u.search === '?trocar=1') return { tipo: 'looks', trocar: true }
    return u.search ? null : { tipo: 'looks' }
  }
  if (u.hostname !== 'relay') return null
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

