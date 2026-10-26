// XML do Final Cut 7 (xmeml v4): Premiere Pro e DaVinci Resolve importam. V1 com os clipes e A1/A2 com o som de cada
// um, ligados; zoom vai no efeito Movimento (Basic Motion: escala e centro); a cor vira o rótulo do Premiere e a
// etiqueta, o comentário do clipe.

import { duracao } from '../linha.js'
import { fpsNominal } from '../tempo.js'
import { caminhoDa, esc, pathUrl, segmentos } from './comum.js'
import { corPorId } from '../cores.js'

export function paraXmeml(p) {
  const I = '      '
  const tb = fpsNominal(p.fps)
  const ntsc = p.fps.d === 1001 ? 'TRUE' : 'FALSE'
  const rate = (ind) => `${ind}<rate>\n${ind}  <timebase>${tb}</timebase>\n${ind}  <ntsc>${ntsc}</ntsc>\n${ind}</rate>`
  const segs = segmentos(p)
  const arquivos = new Set()
  const fileXml = (m, ind) => {
    const id = `file-${p.midias.indexOf(m) + 1}`
    if (arquivos.has(id)) return `${ind}<file id="${id}"/>`
    arquivos.add(id)
    const media = []
    if (m.temVideo) media.push(`${ind}    <video>\n${ind}      <samplecharacteristics>\n${rate(ind + '        ')}\n${ind}        <width>${m.largura || p.largura}</width>\n${ind}        <height>${m.altura || p.altura}</height>\n${ind}        <pixelaspectratio>square</pixelaspectratio>\n${ind}      </samplecharacteristics>\n${ind}    </video>`)
    if (m.temAudio) media.push(`${ind}    <audio>\n${ind}      <samplecharacteristics>\n${ind}        <depth>16</depth>\n${ind}        <samplerate>${m.taxa || 48000}</samplerate>\n${ind}      </samplecharacteristics>\n${ind}      <channelcount>${m.canais || 2}</channelcount>\n${ind}    </audio>`)
    return [`${ind}<file id="${id}">`, `${ind}  <name>${esc(m.nome)}</name>`, `${ind}  <pathurl>${esc(pathUrl(caminhoDa(m)))}</pathurl>`, rate(ind + '  '), `${ind}  <duration>${m.quadros}</duration>`, `${ind}  <media>`, ...media, `${ind}  </media>`, `${ind}</file>`].join('\n')
  }
  const movimento = (s, ind) => {
    if (s.escala === 1) return ''
    // centro do Basic Motion: deslocamento do centro da imagem, em frações da metade do quadro
    const h = ((0.5 - s.foco.x) * (s.escala - 1) * 2).toFixed(4)
    const v = ((0.5 - s.foco.y) * (s.escala - 1) * 2).toFixed(4)
    return `\n${ind}<filter>\n${ind}  <effect>\n${ind}    <name>Basic Motion</name>\n${ind}    <effectid>basic</effectid>\n${ind}    <effectcategory>motion</effectcategory>\n${ind}    <effecttype>motion</effecttype>\n${ind}    <mediatype>video</mediatype>\n${ind}    <parameter authoringApp="PremierePro">\n${ind}      <parameterid>scale</parameterid>\n${ind}      <name>Scale</name>\n${ind}      <valuemin>0</valuemin>\n${ind}      <valuemax>1000</valuemax>\n${ind}      <value>${Math.round(s.escala * 1000) / 10}</value>\n${ind}    </parameter>\n${ind}    <parameter authoringApp="PremierePro">\n${ind}      <parameterid>center</parameterid>\n${ind}      <name>Center</name>\n${ind}      <value>\n${ind}        <horiz>${h}</horiz>\n${ind}        <vert>${v}</vert>\n${ind}      </value>\n${ind}    </parameter>\n${ind}  </effect>\n${ind}</filter>`
  }
  const item = (s, k, tipo, faixa, ind) => {
    const m = p.midias.find((x) => x.id === s.midia)
    const id = `clipitem-${tipo}${faixa}-${k + 1}`
    const lig = []
    if (m.temVideo) lig.push(['video', 1])
    if (m.temAudio) lig.push(['audio', 1], ['audio', 2])
    const links = lig.length > 1 ? lig.map(([t, f]) => `\n${ind}  <link>\n${ind}    <linkclipref>clipitem-${t === 'video' ? 'v' : 'a'}${f}-${k + 1}</linkclipref>\n${ind}    <mediatype>${t}</mediatype>\n${ind}    <trackindex>${f}</trackindex>\n${ind}    <clipindex>${k + 1}</clipindex>${t === 'audio' ? `\n${ind}    <groupindex>1</groupindex>` : ''}\n${ind}  </link>`).join('') : ''
    return `${ind}<clipitem id="${id}">
${ind}  <masterclipid>masterclip-${p.midias.indexOf(m) + 1}</masterclipid>
${ind}  <name>${esc(m.nome)}</name>
${ind}  <enabled>TRUE</enabled>
${ind}  <duration>${m.quadros}</duration>
${rate(ind + '  ')}
${ind}  <start>${s.linha}</start>
${ind}  <end>${s.linha + s.fim - s.ini}</end>
${ind}  <in>${s.ini}</in>
${ind}  <out>${s.fim}</out>
${fileXml(m, ind + '  ')}${s.cor ? `\n${ind}  <labels>\n${ind}    <label2>${corPorId(s.cor)?.premiere || 'Iris'}</label2>\n${ind}  </labels>` : ''}${s.etiqueta ? `\n${ind}  <comments>\n${ind}    <mastercomment1>${esc(s.etiqueta)}</mastercomment1>\n${ind}  </comments>` : ''}${tipo === 'a' ? `\n${ind}  <sourcetrack>\n${ind}    <mediatype>audio</mediatype>\n${ind}    <trackindex>${faixa}</trackindex>\n${ind}  </sourcetrack>` : movimento(s, ind + '  ')}${links}
${ind}</clipitem>`
  }
  const comVideo = segs.map((s, k) => ({ s, k })).filter(({ s }) => p.midias.find((m) => m.id === s.midia)?.temVideo)
  const comAudio = segs.map((s, k) => ({ s, k })).filter(({ s }) => p.midias.find((m) => m.id === s.midia)?.temAudio)
  const trilha = (itens, ind, extra = '') => `${ind}<track>\n${itens.join('\n')}\n${ind}  <enabled>TRUE</enabled>\n${ind}  <locked>FALSE</locked>${extra}\n${ind}</track>`
  const v1 = trilha(comVideo.map(({ s, k }) => item(s, k, 'v', 1, I + '    ')), I + '  ')
  const a = [1, 2].map((f) => trilha(comAudio.map(({ s, k }) => item(s, k, 'a', f, I + '    ')), I + '  ', `\n${I}    <outputchannelindex>${f}</outputchannelindex>`)).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="sequence-1">
    <name>${esc(p.nome)}</name>
    <duration>${duracao(p.linha)}</duration>
${rate('    ')}
    <media>
      <video>
        <format>
          <samplecharacteristics>
${rate('            ')}
            <width>${p.largura}</width>
            <height>${p.altura}</height>
            <pixelaspectratio>square</pixelaspectratio>
          </samplecharacteristics>
        </format>
${v1}
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
${a}
      </audio>
    </media>
    <timecode>
${rate('      ')}
      <string>00:00:00:00</string>
      <frame>0</frame>
      <displayformat>NDF</displayformat>
    </timecode>
  </sequence>
</xmeml>
`
}
