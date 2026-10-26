// XML do Final Cut 7 (xmeml v4): Premiere Pro e DaVinci Resolve importam. V1 com os clipes e A1/A2 com o som de cada
// um, ligados; zoom vai no efeito Movimento (Basic Motion: escala e centro); a cor vira o rótulo do Premiere e a
// etiqueta, o comentário do clipe.

import { duracao } from '../linha.js'
import { fpsNominal } from '../tempo.js'
import { caminhoDa, esc, pathUrl, segmentos, transformacao } from './comum.js'
import { ganho } from '../quadro.js'
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
  const efeito = (ind, nome, id, cat, tipo, midia, params) =>
    `\n${ind}<filter>\n${ind}  <effect>\n${ind}    <name>${nome}</name>\n${ind}    <effectid>${id}</effectid>\n${ind}    <effectcategory>${cat}</effectcategory>\n${ind}    <effecttype>${tipo}</effecttype>\n${ind}    <mediatype>${midia}</mediatype>${params.map((x) => `\n${ind}    ${x.replace(/\n/g, `\n${ind}    `)}`).join('')}\n${ind}  </effect>\n${ind}</filter>`
  // escala e centro (ajustes do clipe + zoom) no Basic Motion; centro em frações da metade do quadro; opacidade à parte
  const movimento = (s, ind) => {
    const tr = transformacao(p, s)
    let out = ''
    if (Math.abs(tr.escala - 1) > 1e-4 || Math.abs(tr.cx) > 0.01 || Math.abs(tr.cy) > 0.01)
      out += efeito(ind, 'Basic Motion', 'basic', 'motion', 'motion', 'video', [
        `<parameter authoringApp="PremierePro">\n  <parameterid>scale</parameterid>\n  <name>Scale</name>\n  <valuemin>0</valuemin>\n  <valuemax>1000</valuemax>\n  <value>${Math.round(tr.escala * 1000) / 10}</value>\n</parameter>`,
        `<parameter authoringApp="PremierePro">\n  <parameterid>center</parameterid>\n  <name>Center</name>\n  <value>\n    <horiz>${(tr.cx / (p.largura / 2)).toFixed(4)}</horiz>\n    <vert>${(tr.cy / (p.altura / 2)).toFixed(4)}</vert>\n  </value>\n</parameter>`,
      ])
    if (s.ajustes.opacidade !== 1)
      out += efeito(ind, 'Opacity', 'opacity', 'motion', 'motion', 'video', [`<parameter authoringApp="PremierePro">\n  <parameterid>opacity</parameterid>\n  <name>opacity</name>\n  <valuemin>0</valuemin>\n  <valuemax>100</valuemax>\n  <value>${Math.round(s.ajustes.opacidade * 1000) / 10}</value>\n</parameter>`])
    return out
  }
  // volume no efeito Níveis de áudio (ganho linear)
  const niveis = (s, ind) =>
    s.ajustes.volume === 0 ? '' : efeito(ind, 'Audio Levels', 'audiolevels', 'audiolevels', 'audiolevels', 'audio', [`<parameter authoringApp="PremierePro">\n  <parameterid>level</parameterid>\n  <name>Level</name>\n  <valuemin>0.00001</valuemin>\n  <valuemax>31.6228</valuemax>\n  <value>${Math.round(ganho(s.ajustes.volume) * 10000) / 10000}</value>\n</parameter>`])
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
${fileXml(m, ind + '  ')}${s.cor ? `\n${ind}  <labels>\n${ind}    <label2>${corPorId(s.cor)?.premiere || 'Iris'}</label2>\n${ind}  </labels>` : ''}${s.etiqueta ? `\n${ind}  <comments>\n${ind}    <mastercomment1>${esc(s.etiqueta)}</mastercomment1>\n${ind}  </comments>` : ''}${tipo === 'a' ? `\n${ind}  <sourcetrack>\n${ind}    <mediatype>audio</mediatype>\n${ind}    <trackindex>${faixa}</trackindex>\n${ind}  </sourcetrack>${niveis(s, ind + '  ')}` : movimento(s, ind + '  ')}${links}
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
${(p.marcadores || []).map((k) => `    <marker>\n      <name>${esc(k.nome || 'Marcador')}</name>\n      <comment></comment>\n      <in>${k.q}</in>\n      <out>-1</out>\n    </marker>`).join('\n')}
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
