// O link sobedesce://relay do "Máxima qualidade": os destinos escolhidos no site do Relay, para o app SOBEDESCE abrir
// com eles marcados (products/sobedesce/desktop/links.js lê; o teste de lá confere com este). Puro.
//
//   sobedesce://relay?presets=<ids do Relay>&meus=<base64url do JSON das fichas dos presets da pessoa>

import { preset as presetDoRelay } from './presets.js'
import { exportar } from './personalizado.js'

export const MAX_LINK = 8192
export const MAX_DESTINOS = 8

function base64url(texto) {
  const bytes = new TextEncoder().encode(texto)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * `ids`: presets escolhidos (do Relay e da pessoa, misturados); `meus`: os presets da pessoa. Fica de fora o que o app
 * não converte (o "Tamanho exato", que pede o MB na hora) e o que passa de 8 destinos. Se as fichas não couberem no
 * link, vão só os presets do Relay. Devolve { link, levados: nomes, fora: nomes }.
 */
export function linkMaxima(ids, meus = []) {
  const doRelay = []
  const fichas = []
  const levados = []
  const fora = []
  for (const id of ids) {
    const meu = meus.find((p) => p.id === id)
    const p = meu ?? presetDoRelay(id)
    if (!p) continue
    if (p.ajustavel || levados.length >= MAX_DESTINOS) {
      fora.push(p.nome)
      continue
    }
    if (meu) fichas.push(meu)
    else doRelay.push(id)
    levados.push(p.nome)
  }
  const montar = (comFichas) => {
    const u = new URL('sobedesce://relay')
    if (doRelay.length) u.searchParams.set('presets', doRelay.join(','))
    if (comFichas && fichas.length) u.searchParams.set('meus', base64url(JSON.stringify(exportar(fichas).presets)))
    return u.href
  }
  let link = montar(true)
  if (link.length > MAX_LINK) {
    link = montar(false)
    for (const f of fichas) {
      levados.splice(levados.indexOf(f.nome), 1)
      fora.push(f.nome)
    }
  }
  return { link, levados, fora }
}
