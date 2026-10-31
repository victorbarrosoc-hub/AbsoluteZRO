// FCPXML 1.10: Final Cut Pro 10.6+ e DaVinci Resolve. Uma sequência na trilha principal; zoom vai como
// adjust-transform (escala e posição) de cada clipe. Velocidade: cada degrau é um clipe com timeMap linear ancorado no
// começo da mídia (0s → 0s), com start = entrada ÷ velocidade, como o próprio Final Cut grava (o DaVinci lê a partir
// do quadro certo assim). Fora de 100% o som do degrau vai a −96 dB (a regra do AEON: som só em 100%).

import { duracao } from '../linha.js'
import { racional, racionalFracao } from '../tempo.js'
import { caminhoDa, esc, fileUrl, marcadoresDe, segmentos, transformacao } from './comum.js'
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
      const len = s.fim - s.ini
      const acelerado = s.v !== 1
      // no tempo do clipe ajustado pela velocidade: quadro de origem q → q ÷ v = q · saida ÷ len
      const ajustado = (q) => (acelerado ? racionalFracao(q * s.saida, len, f) : racional(q, f))
      const m = p.midias.find((x) => x.id === s.midia)
      const attrs = `ref="${ref.get(s.midia)}" offset="${racional(s.linha, f)}" name="${esc(nome.get(s.midia))}" start="${ajustado(s.ini)}" duration="${racional(s.saida, f)}" tcFormat="NDF"`
      const filhos = []
      // câmera lenta: o Final Cut faz a mistura ou o fluxo óptico dele (frameSampling); fora disso, o quadro (floor)
      const amostra = s.v < 1 && s.modo !== 'quadro' ? ` frameSampling="${s.modo === 'mistura' ? 'frame-blending' : 'optical-flow'}"` : ''
      if (acelerado) filhos.push(`<timeMap${amostra}>\n  <timept time="0s" value="0s" interp="linear"/>\n  <timept time="${ajustado(m.quadros)}" value="${racional(m.quadros, f)}" interp="linear"/>\n</timeMap>`)
      // escala e posição (ajustes do clipe + zoom); posição do FCPXML em % da altura do quadro, a partir do centro, y para cima
      const tr = transformacao(p, s)
      if (Math.abs(tr.escala - 1) > 1e-4 || Math.abs(tr.cx) > 0.01 || Math.abs(tr.cy) > 0.01) {
        const e = Math.round(tr.escala * 10000) / 10000
        filhos.push(`<adjust-transform position="${((tr.cx / p.altura) * 100).toFixed(3)} ${((-tr.cy / p.altura) * 100).toFixed(3)}" scale="${e} ${e}"/>`)
      }
      if (s.ajustes.opacidade !== 1) filhos.push(`<adjust-blend amount="${s.ajustes.opacidade}"/>`)
      if (!s.som) filhos.push(`<adjust-volume amount="-96dB"/>`)
      else if (s.ajustes.volume !== 0) filhos.push(`<adjust-volume amount="${s.ajustes.volume}dB"/>`)
      for (const k of marcadoresDe(p, s)) filhos.push(`<marker start="${ajustado(k.q)}" duration="${racional(1, f)}" value="${esc(k.nome)}"/>`)
      // etiqueta vira palavra-chave do clipe (o Final Cut não tem cor de clipe)
      if (s.etiqueta) filhos.push(`<keyword start="${ajustado(s.ini)}" duration="${racional(s.saida, f)}" value="${esc(s.etiqueta)}"/>`)
      if (!filhos.length) return `            <asset-clip ${attrs}/>`
      return `            <asset-clip ${attrs}>\n${filhos.map((x) => `              ${x.replace(/\n/g, '\n              ')}`).join('\n')}\n            </asset-clip>`
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
