// EDL CMX 3600: o formato mais antigo e aceito por todos (Avid, Resolve, Premiere). Só cortes: zoom, legenda e efeitos
// sonoros não cabem na EDL (vão como comentário). Velocidade: linha M2 (velocidade constante em quadros por segundo)
// em cada degrau; fora de 100% o evento vai só com imagem (a regra do AEON: som só em 100%).

import { fpsNominal, timecode } from '../tempo.js'
import { segmentos, trilhaExportada } from './comum.js'
import { efeitosNaLinha } from '../efeitos.js'

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
    const som = m.temAudio && s.som
    const canal = m.temVideo ? (som ? 'AA/V ' : 'V    ') : 'AA   '
    // com M2, a origem do evento tem o tamanho do evento na gravação; a velocidade real vem na linha M2
    linhas.push(`${String(k + 1).padStart(3, '0')}  ${reel(m).padEnd(8)} ${canal} C        ${tc(s.ini)} ${tc(s.ini + s.saida)} ${tc(s.linha)} ${tc(s.linha + s.saida)}`)
    if (s.v !== 1) linhas.push(`M2   ${reel(m).padEnd(8)}       ${(s.v * fpsNominal(p.fps)).toFixed(1).padStart(5, '0')}                ${tc(s.ini)}`)
    linhas.push(`* FROM CLIP NAME: ${ascii(m.nome)}`)
    if (s.escala !== 1) linhas.push(`* ZOOM: ${Math.round(s.escala * 100)}%`)
    if (s.etiqueta) linhas.push(`* ETIQUETA: ${ascii(s.etiqueta)}`)
    if (s.ajustes.volume !== 0) linhas.push(`* VOLUME: ${s.ajustes.volume} DB`)
    if (s.ajustes.opacidade !== 1) linhas.push(`* OPACIDADE: ${Math.round(s.ajustes.opacidade * 100)}%`)
    if (s.ajustes.escala !== 1 || s.ajustes.x || s.ajustes.y) linhas.push(`* ESCALA: ${Math.round(s.ajustes.escala * 100)}% POSICAO: ${Math.round(s.ajustes.x * 100)}% ${Math.round(s.ajustes.y * 100)}%`)
    linhas.push('')
  })
  for (const k of p.marcadores || []) linhas.push(`* MARCADOR ${tc(k.q)}: ${ascii(k.nome || 'Marcador')}${k.nota ? ` - ${ascii(k.nota)}` : ''}`)
  const tr = trilhaExportada(p)
  if (tr) linhas.push(`* MUSICA ${tc(0)}: ${ascii(tr.midia.nome)} DESDE ${tc(tr.desde)}${tr.volume ? ` ${tr.volume} DB` : ''}`)
  for (const x of efeitosNaLinha(p)) linhas.push(`* EFEITO ${tc(x.inicio)}: ${ascii(x.som.nome)}${x.efeito.volume ? ` ${x.efeito.volume} DB` : ''}`)
  return linhas.join('\r\n')
}
