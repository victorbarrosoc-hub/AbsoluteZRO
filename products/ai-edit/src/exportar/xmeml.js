// XML do Final Cut 7 (xmeml v4): Premiere Pro e DaVinci Resolve importam. V1 com os clipes e A1/A2 com o som de cada
// um, ligados; efeitos sonoros em pares de faixas depois (A3/A4, A5/A6… sem sobreposição em cada par); zoom vai no
// efeito Movimento (Basic Motion: escala e centro); a cor vira o rótulo do Premiere e a etiqueta, o comentário do clipe.
// Velocidade: Time Remap constante em cada degrau (o Premiere não lê rampa suave por XML, só velocidade constante);
// fora de 100% o degrau vai sem som (a regra do AEON). A trilha (a música do clipe musical) vai no último par de faixas,
// do quadro 0 da linha.

import { duracao } from '../linha.js'
import { fpsNominal } from '../tempo.js'
import { arquivosDeFaixas, caminhoDa, caminhoDoSom, efeitosExportados, esc, faixasExportadas, pathUrl, segmentos, sonsUsados, transformacao, trilhaExportada } from './comum.js'
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
  // velocidade constante do degrau (Time Remap, como o Premiere grava a Velocidade/Duração)
  const remap = (s, ind, midia) =>
    s.v === 1
      ? ''
      : efeito(ind, 'Time Remap', 'timeremap', 'motion', 'motion', midia, [
          `<parameter authoringApp="PremierePro">\n  <parameterid>variablespeed</parameterid>\n  <name>variablespeed</name>\n  <valuemin>0</valuemin>\n  <valuemax>1</valuemax>\n  <value>0</value>\n</parameter>`,
          `<parameter authoringApp="PremierePro">\n  <parameterid>speed</parameterid>\n  <name>speed</name>\n  <valuemin>-100000</valuemin>\n  <valuemax>100000</valuemax>\n  <value>${Math.round(s.v * 100000) / 1000}</value>\n</parameter>`,
          `<parameter authoringApp="PremierePro">\n  <parameterid>reverse</parameterid>\n  <name>reverse</name>\n  <value>FALSE</value>\n</parameter>`,
          // câmera lenta com mistura ou fluxo: o Premiere liga a Mistura de quadros (o fluxo óptico dele não vem pelo XML)
          `<parameter authoringApp="PremierePro">\n  <parameterid>frameblending</parameterid>\n  <name>frameblending</name>\n  <value>${s.v < 1 && s.modo !== 'quadro' ? 'TRUE' : 'FALSE'}</value>\n</parameter>`,
        ])
  // volume no efeito Níveis de áudio (ganho linear)
  const niveis = (s, ind) =>
    s.ajustes.volume === 0 ? '' : efeito(ind, 'Audio Levels', 'audiolevels', 'audiolevels', 'audiolevels', 'audio', [`<parameter authoringApp="PremierePro">\n  <parameterid>level</parameterid>\n  <name>Level</name>\n  <valuemin>0.00001</valuemin>\n  <valuemax>31.6228</valuemax>\n  <value>${Math.round(ganho(s.ajustes.volume) * 10000) / 10000}</value>\n</parameter>`])
  const item = (s, k, tipo, faixa, ind) => {
    const m = p.midias.find((x) => x.id === s.midia)
    const id = `clipitem-${tipo}${faixa}-${k + 1}`
    const lig = []
    if (m.temVideo) lig.push(['video', 1])
    // com voz e instrumental separados, o som original não vai (vão as duas faixas, que somam ele)
    if (m.temAudio && s.som && !s.faixas) lig.push(['audio', 1], ['audio', 2])
    const links = lig.length > 1 ? lig.map(([t, f]) => `\n${ind}  <link>\n${ind}    <linkclipref>clipitem-${t === 'video' ? 'v' : 'a'}${f}-${k + 1}</linkclipref>\n${ind}    <mediatype>${t}</mediatype>\n${ind}    <trackindex>${f}</trackindex>\n${ind}    <clipindex>${k + 1}</clipindex>${t === 'audio' ? `\n${ind}    <groupindex>1</groupindex>` : ''}\n${ind}  </link>`).join('') : ''
    return `${ind}<clipitem id="${id}">
${ind}  <masterclipid>masterclip-${p.midias.indexOf(m) + 1}</masterclipid>
${ind}  <name>${esc(m.nome)}</name>
${ind}  <enabled>TRUE</enabled>
${ind}  <duration>${m.quadros}</duration>
${rate(ind + '  ')}
${ind}  <start>${s.linha}</start>
${ind}  <end>${s.linha + s.saida}</end>
${ind}  <in>${s.ini}</in>
${ind}  <out>${s.fim}</out>
${fileXml(m, ind + '  ')}${s.cor ? `\n${ind}  <labels>\n${ind}    <label2>${corPorId(s.cor)?.premiere || 'Iris'}</label2>\n${ind}  </labels>` : ''}${s.etiqueta ? `\n${ind}  <comments>\n${ind}    <mastercomment1>${esc(s.etiqueta)}</mastercomment1>\n${ind}  </comments>` : ''}${tipo === 'a' ? `\n${ind}  <sourcetrack>\n${ind}    <mediatype>audio</mediatype>\n${ind}    <trackindex>${faixa}</trackindex>\n${ind}  </sourcetrack>${remap(s, ind + '  ', 'audio')}${niveis(s, ind + '  ')}` : remap(s, ind + '  ', 'video') + movimento(s, ind + '  ')}${links}
${ind}</clipitem>`
  }
  const comVideo = segs.map((s, k) => ({ s, k })).filter(({ s }) => p.midias.find((m) => m.id === s.midia)?.temVideo)
  const comAudio = segs.map((s, k) => ({ s, k })).filter(({ s }) => s.som && !s.faixas && p.midias.find((m) => m.id === s.midia)?.temAudio)
  const trilha = (itens, ind, extra = '') => `${ind}<track>\n${itens.join('\n')}\n${ind}  <enabled>TRUE</enabled>\n${ind}  <locked>FALSE</locked>${extra}\n${ind}</track>`
  const v1 = trilha(comVideo.map(({ s, k }) => item(s, k, 'v', 1, I + '    ')), I + '  ')
  const a = [1, 2].map((f) => trilha(comAudio.map(({ s, k }) => item(s, k, 'a', f, I + '    ')), I + '  ', `\n${I}    <outputchannelindex>${f}</outputchannelindex>`)).join('\n')
  // efeitos: um arquivo por som (só áudio), o par de faixas da faixa de efeitos, esquerda e direita ligadas
  const sons = sonsUsados(p)
  const arquivoSom = (m, ind) => {
    const id = `file-s${sons.indexOf(m) + 1}`
    if (arquivos.has(id)) return `${ind}<file id="${id}"/>`
    arquivos.add(id)
    const quadros = Math.max(1, Math.round((m.duracao * p.fps.n) / p.fps.d))
    return [`${ind}<file id="${id}">`, `${ind}  <name>${esc(m.nome)}</name>`, `${ind}  <pathurl>${esc(pathUrl(caminhoDoSom(m)))}</pathurl>`, rate(ind + '  '), `${ind}  <duration>${quadros}</duration>`, `${ind}  <media>`, `${ind}    <audio>\n${ind}      <samplecharacteristics>\n${ind}        <depth>16</depth>\n${ind}        <samplerate>${m.taxa || 48000}</samplerate>\n${ind}      </samplecharacteristics>\n${ind}      <channelcount>${m.canais || 2}</channelcount>\n${ind}    </audio>`, `${ind}  </media>`, `${ind}</file>`].join('\n')
  }
  const efeitos = efeitosExportados(p)
  const itemEfeito = (x, k, lado, ind) => {
    const links = [1, 2].map((l) => `\n${ind}  <link>\n${ind}    <linkclipref>clipitem-e${x.faixa + 1}${l === 1 ? 'L' : 'R'}-${k + 1}</linkclipref>\n${ind}    <mediatype>audio</mediatype>\n${ind}    <trackindex>${3 + x.faixa * 2 + l - 1}</trackindex>\n${ind}    <clipindex>${k + 1}</clipindex>\n${ind}    <groupindex>1</groupindex>\n${ind}  </link>`).join('')
    return `${ind}<clipitem id="clipitem-e${x.faixa + 1}${lado === 1 ? 'L' : 'R'}-${k + 1}">
${ind}  <masterclipid>masterclip-s${sons.indexOf(x.som) + 1}</masterclipid>
${ind}  <name>${esc(x.som.nome)}</name>
${ind}  <enabled>TRUE</enabled>
${ind}  <duration>${x.quadrosSom}</duration>
${rate(ind + '  ')}
${ind}  <start>${x.inicio}</start>
${ind}  <end>${x.inicio + x.quadros}</end>
${ind}  <in>0</in>
${ind}  <out>${x.quadros}</out>
${arquivoSom(x.som, ind + '  ')}
${ind}  <sourcetrack>
${ind}    <mediatype>audio</mediatype>
${ind}    <trackindex>${lado}</trackindex>
${ind}  </sourcetrack>${niveis({ ajustes: { volume: x.efeito.volume } }, ind + '  ')}${links}
${ind}</clipitem>`
  }
  const nFaixas = efeitos.reduce((n, x) => Math.max(n, x.faixa + 1), 0)
  const fx = Array.from({ length: nFaixas }, (_, f) =>
    [1, 2].map((lado) => trilha(efeitos.map((x, k) => ({ x, k })).filter(({ x }) => x.faixa === f).map(({ x, k }) => itemEfeito(x, k, lado, I + '    ')), I + '  ', `\n${I}    <outputchannelindex>${lado}</outputchannelindex>`)).join('\n'),
  ).join('\n')
  // voz e instrumental (NOSSOM): um par de faixas para cada, depois dos efeitos; o arquivo WAV vai ao lado do XML
  const arquivosF = arquivosDeFaixas(p)
  const pedacos = faixasExportadas(p)
  const baseF = 3 + nFaixas * 2
  const arquivoFaixa = (a, ind) => {
    const id = `file-f${arquivosF.indexOf(a) + 1}`
    if (arquivos.has(id)) return `${ind}<file id="${id}"/>`
    arquivos.add(id)
    return [`${ind}<file id="${id}">`, `${ind}  <name>${esc(a.arquivo)}</name>`, `${ind}  <pathurl>${esc(pathUrl(a.arquivo))}</pathurl>`, rate(ind + '  '), `${ind}  <duration>${a.quadros}</duration>`, `${ind}  <media>`, `${ind}    <audio>\n${ind}      <samplecharacteristics>\n${ind}        <depth>16</depth>\n${ind}        <samplerate>44100</samplerate>\n${ind}      </samplecharacteristics>\n${ind}      <channelcount>2</channelcount>\n${ind}    </audio>`, `${ind}  </media>`, `${ind}</file>`].join('\n')
  }
  const itemFaixa = (x, k, lado, ind) => {
    const a = arquivosF.find((y) => y.arquivo === x.arquivo)
    const par = x.parte === 'voz' ? 0 : 1
    const id = (l) => `clipitem-f${par + 1}${l === 1 ? 'L' : 'R'}-${k + 1}`
    const links = [1, 2].map((l) => `\n${ind}  <link>\n${ind}    <linkclipref>${id(l)}</linkclipref>\n${ind}    <mediatype>audio</mediatype>\n${ind}    <trackindex>${baseF + par * 2 + l - 1}</trackindex>\n${ind}    <clipindex>${k + 1}</clipindex>\n${ind}    <groupindex>1</groupindex>\n${ind}  </link>`).join('')
    return `${ind}<clipitem id="${id(lado)}">
${ind}  <masterclipid>masterclip-f${arquivosF.indexOf(a) + 1}</masterclipid>
${ind}  <name>${esc(a.arquivo)}</name>
${ind}  <enabled>TRUE</enabled>
${ind}  <duration>${a.quadros}</duration>
${rate(ind + '  ')}
${ind}  <start>${x.seg.linha}</start>
${ind}  <end>${x.seg.linha + x.seg.saida}</end>
${ind}  <in>${x.desde}</in>
${ind}  <out>${x.desde + x.seg.saida}</out>
${arquivoFaixa(a, ind + '  ')}
${ind}  <sourcetrack>
${ind}    <mediatype>audio</mediatype>
${ind}    <trackindex>${lado}</trackindex>
${ind}  </sourcetrack>${niveis({ ajustes: { volume: x.volume } }, ind + '  ')}${links}
${ind}</clipitem>`
  }
  const trilhasF = ['voz', 'instrumental']
    .filter((parte) => pedacos.some((x) => x.parte === parte))
    .map((parte) => [1, 2].map((lado) => trilha(pedacos.filter((x) => x.parte === parte).map((x, k) => itemFaixa(x, k, lado, I + '    ')), I + '  ', `\n${I}    <outputchannelindex>${lado}</outputchannelindex>`)).join('\n'))
    .join('\n')
  // a trilha: um clipe por lado no último par de faixas, do começo da linha, ligados
  const tr = trilhaExportada(p)
  const baseT = baseF + (trilhasF ? 2 * ['voz', 'instrumental'].filter((parte) => pedacos.some((x) => x.parte === parte)).length : 0)
  const itemTrilha = (lado, ind) => {
    const m = tr.midia
    const id = (l) => `clipitem-t${l === 1 ? 'L' : 'R'}-1`
    const links = [1, 2].map((l) => `\n${ind}  <link>\n${ind}    <linkclipref>${id(l)}</linkclipref>\n${ind}    <mediatype>audio</mediatype>\n${ind}    <trackindex>${baseT + l - 1}</trackindex>\n${ind}    <clipindex>1</clipindex>\n${ind}    <groupindex>1</groupindex>\n${ind}  </link>`).join('')
    return `${ind}<clipitem id="${id(lado)}">
${ind}  <masterclipid>masterclip-${p.midias.indexOf(m) + 1}</masterclipid>
${ind}  <name>${esc(m.nome)}</name>
${ind}  <enabled>TRUE</enabled>
${ind}  <duration>${m.quadros}</duration>
${rate(ind + '  ')}
${ind}  <start>0</start>
${ind}  <end>${tr.quadros}</end>
${ind}  <in>${tr.desde}</in>
${ind}  <out>${tr.desde + tr.quadros}</out>
${fileXml(m, ind + '  ')}
${ind}  <sourcetrack>
${ind}    <mediatype>audio</mediatype>
${ind}    <trackindex>${lado}</trackindex>
${ind}  </sourcetrack>${niveis({ ajustes: { volume: tr.volume } }, ind + '  ')}${links}
${ind}</clipitem>`
  }
  const trilhaT = tr ? [1, 2].map((lado) => trilha([itemTrilha(lado, I + '    ')], I + '  ', `\n${I}    <outputchannelindex>${lado}</outputchannelindex>`)).join('\n') : ''
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
${a}${fx ? '\n' + fx : ''}${trilhasF ? '\n' + trilhasF : ''}${trilhaT ? '\n' + trilhaT : ''}
      </audio>
    </media>
${(p.marcadores || []).map((k) => `    <marker>\n      <name>${esc(k.nome || 'Marcador')}</name>\n      <comment>${esc(k.nota || '')}</comment>\n      <in>${k.q}</in>\n      <out>-1</out>\n    </marker>`).join('\n')}
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
