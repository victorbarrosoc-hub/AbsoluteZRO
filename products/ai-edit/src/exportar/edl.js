// EDL CMX 3600: o formato mais antigo e aceito por todos (Avid, Resolve, Premiere). Só cortes: zoom e legenda não
// cabem na EDL (vão como comentário).

import { timecode } from '../tempo.js'
import { segmentos } from './comum.js'

const ascii = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '-')

const reel = (m) =>
  ascii(m.nome.replace(/\.[^.]+$/, ''))
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase()
    .slice(0, 8) || 'AX'

export function paraEdl(p) {
  const tc = (q) => timecode(q, p.fps)
  const linhas = [`TITLE: ${ascii(p.nome).toUpperCase().slice(0, 70)}`, 'FCM: NON-DROP FRAME', '']
  segmentos(p).forEach((s, k) => {
    const m = p.midias.find((x) => x.id === s.midia)
    const canal = m.temVideo ? (m.temAudio ? 'AA/V ' : 'V    ') : 'AA   '
    linhas.push(`${String(k + 1).padStart(3, '0')}  ${reel(m).padEnd(8)} ${canal} C        ${tc(s.ini)} ${tc(s.fim)} ${tc(s.linha)} ${tc(s.linha + s.fim - s.ini)}`)
    linhas.push(`* FROM CLIP NAME: ${ascii(m.nome)}`)
    if (s.escala !== 1) linhas.push(`* ZOOM: ${Math.round(s.escala * 100)}%`)
    if (s.etiqueta) linhas.push(`* ETIQUETA: ${ascii(s.etiqueta)}`)
    if (s.ajustes.volume !== 0) linhas.push(`* VOLUME: ${s.ajustes.volume} DB`)
    if (s.ajustes.opacidade !== 1) linhas.push(`* OPACIDADE: ${Math.round(s.ajustes.opacidade * 100)}%`)
    if (s.ajustes.escala !== 1 || s.ajustes.x || s.ajustes.y) linhas.push(`* ESCALA: ${Math.round(s.ajustes.escala * 100)}% POSICAO: ${Math.round(s.ajustes.x * 100)}% ${Math.round(s.ajustes.y * 100)}%`)
    linhas.push('')
  })
  for (const k of p.marcadores || []) linhas.push(`* MARCADOR ${tc(k.q)}: ${ascii(k.nome || 'Marcador')}`)
  return linhas.join('\r\n')
}
