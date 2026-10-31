// FCPXML 1.10: Final Cut Pro 10.6+ e DaVinci Resolve. Uma sequência na trilha principal; zoom vai como
// adjust-transform (escala e posição) de cada clipe. Efeitos sonoros vão como clipes conectados embaixo (lane negativa),
// com a função de áudio "effects", presos ao clipe em que começam: no Final Cut eles andam junto com a imagem.

import { duracao } from '../linha.js'
import { racional } from '../tempo.js'
import { caminhoDa, efeitosExportados, esc, fileUrl, marcadoresDe, segmentos, sonsUsados, transformacao } from './comum.js'
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
  const sons = sonsUsados(p)
  const assetsSom = sons
    .map((m, i) => `    <asset id="s${i + 1}" name="${esc(m.nome.replace(/\.[^.]+$/, ''))}" start="0s" duration="${racional(Math.max(1, Math.round((m.duracao * f.n) / f.d)), f)}" hasAudio="1" audioSources="1" audioChannels="${m.canais || 2}" audioRate="${m.taxa || 48000}">\n      <media-rep kind="original-media" src="${esc(fileUrl(caminhoDa(m)))}"/>\n    </asset>`)
    .join('\n')
  const refSom = new Map(sons.map((m, i) => [m.id, `s${i + 1}`]))
  const efeitos = efeitosExportados(p)
  const ref = new Map(p.midias.map((m, i) => [m.id, `a${i + 1}`]))
  const nome = new Map(p.midias.map((m) => [m.id, m.nome]))
  const clipes = segmentos(p)
    .map((s) => {
      const attrs = `ref="${ref.get(s.midia)}" offset="${racional(s.linha, f)}" name="${esc(nome.get(s.midia))}" start="${racional(s.ini, f)}" duration="${racional(s.fim - s.ini, f)}" tcFormat="NDF"`
      const filhos = []
      // escala e posição (ajustes do clipe + zoom); posição do FCPXML em % da altura do quadro, a partir do centro, y para cima
      const tr = transformacao(p, s)
      if (Math.abs(tr.escala - 1) > 1e-4 || Math.abs(tr.cx) > 0.01 || Math.abs(tr.cy) > 0.01) {
        const e = Math.round(tr.escala * 10000) / 10000
        filhos.push(`<adjust-transform position="${((tr.cx / p.altura) * 100).toFixed(3)} ${((-tr.cy / p.altura) * 100).toFixed(3)}" scale="${e} ${e}"/>`)
      }
      if (s.ajustes.opacidade !== 1) filhos.push(`<adjust-blend amount="${s.ajustes.opacidade}"/>`)
      if (s.ajustes.volume !== 0) filhos.push(`<adjust-volume amount="${s.ajustes.volume}dB"/>`)
      // efeitos que começam neste clipe: conectados embaixo, no tempo de origem do clipe
      for (const x of efeitos.filter((e) => e.seg?.linha === s.linha)) {
        const at = `ref="${refSom.get(x.som.id)}" lane="-${x.faixa + 1}" offset="${racional(s.ini + (x.inicio - s.linha), f)}" name="${esc(x.som.nome.replace(/\.[^.]+$/, ''))}" start="0s" duration="${racional(x.quadros, f)}" audioRole="effects"`
        filhos.push(x.efeito.volume ? `<asset-clip ${at}>\n                <adjust-volume amount="${x.efeito.volume}dB"/>\n              </asset-clip>` : `<asset-clip ${at}/>`)
      }
      for (const k of marcadoresDe(p, s)) filhos.push(`<marker start="${racional(k.q, f)}" duration="${racional(1, f)}" value="${esc(k.nome)}"/>`)
      // etiqueta vira palavra-chave do clipe (o Final Cut não tem cor de clipe)
      if (s.etiqueta) filhos.push(`<keyword start="${racional(s.ini, f)}" duration="${racional(s.fim - s.ini, f)}" value="${esc(s.etiqueta)}"/>`)
      if (!filhos.length) return `            <asset-clip ${attrs}/>`
      return `            <asset-clip ${attrs}>\n${filhos.map((x) => `              ${x}`).join('\n')}\n            </asset-clip>`
    })
    .join('\n')
  const total = racional(duracao(p.linha), f)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" frameDuration="${racional(1, f)}" width="${p.largura}" height="${p.altura}"/>
${assets}${assetsSom ? '\n' + assetsSom : ''}
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
