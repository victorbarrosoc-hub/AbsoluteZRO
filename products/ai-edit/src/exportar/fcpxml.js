// FCPXML 1.10: Final Cut Pro 10.6+ e DaVinci Resolve. Uma sequência na trilha principal; zoom vai como
// adjust-transform (escala e posição) de cada clipe.

import { duracao } from '../linha.js'
import { racional } from '../tempo.js'
import { caminhoDa, esc, fileUrl, segmentos } from './comum.js'
import { PRODUTO } from '../produto.js'

export function paraFcpxml(p) {
  const f = p.fps
  const assets = p.midias
    .map((m, i) => {
      const attrs = [`id="a${i + 1}"`, `name="${esc(m.nome.replace(/\.[^.]+$/, ''))}"`, `start="0s"`, `duration="${racional(m.quadros, f)}"`]
      if (m.temVideo) attrs.push('hasVideo="1"', 'format="r1"', 'videoSources="1"')
      if (m.temAudio) attrs.push('hasAudio="1"', 'audioSources="1"', `audioChannels="${m.canais || 2}"`, `audioRate="${m.taxa || 48000}"`)
      return `    <asset ${attrs.join(' ')}>\n      <media-rep kind="original-media" src="${esc(fileUrl(caminhoDa(m)))}"/>\n    </asset>`
    })
    .join('\n')
  const ref = new Map(p.midias.map((m, i) => [m.id, `a${i + 1}`]))
  const nome = new Map(p.midias.map((m) => [m.id, m.nome]))
  const clipes = segmentos(p)
    .map((s) => {
      const attrs = `ref="${ref.get(s.midia)}" offset="${racional(s.linha, f)}" name="${esc(nome.get(s.midia))}" start="${racional(s.ini, f)}" duration="${racional(s.fim - s.ini, f)}" tcFormat="NDF"`
      // etiqueta vira palavra-chave do clipe (o Final Cut não tem cor de clipe)
      const chave = s.etiqueta ? `\n              <keyword start="${racional(s.ini, f)}" duration="${racional(s.fim - s.ini, f)}" value="${esc(s.etiqueta)}"/>` : ''
      if (s.escala === 1) return chave ? `            <asset-clip ${attrs}>${chave}\n            </asset-clip>` : `            <asset-clip ${attrs}/>`
      // posição do FCPXML: em porcentagem da altura do quadro, a partir do centro (y para cima)
      const px = ((0.5 - s.foco.x) * (s.escala - 1) * 100 * p.largura) / p.altura
      const py = (s.foco.y - 0.5) * (s.escala - 1) * 100
      return `            <asset-clip ${attrs}>\n              <adjust-transform position="${px.toFixed(3)} ${py.toFixed(3)}" scale="${s.escala} ${s.escala}"/>${chave}\n            </asset-clip>`
    })
    .join('\n')
  const total = racional(duracao(p.linha), f)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" frameDuration="${racional(1, f)}" width="${p.largura}" height="${p.altura}"/>
${assets}
  </resources>
  <library>
    <event name="${esc(`${PRODUTO.nome} · ${p.nome}`)}">
      <project name="${esc(p.nome)}">
        <sequence format="r1" duration="${total}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
${clipes}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`
}
