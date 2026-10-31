// Pacote de entrega da linha do tempo: um arquivo por editor, a legenda em SRT e VTT e o ZroTimelineRef
// (packages/media-contracts/src/timeline.ts) que o evento edit.timeline.ready referencia.

import { paraFcpxml } from './fcpxml.js'
import { paraXmeml } from './xmeml.js'
import { paraEdl } from './edl.js'
import { paraOtio } from './otio.js'
import { nomeArquivo } from './comum.js'
import { agrupar, srt, vtt } from '../legenda.js'
import { palavrasNaLinha } from '../projeto.js'
import { fpsNumero } from '../tempo.js'
import { creditos } from '../efeitos.js'

export const FORMATOS = [
  { id: 'fcpxml', editor: 'Final Cut Pro e DaVinci Resolve', ext: '.fcpxml', gerar: paraFcpxml },
  { id: 'xmeml', editor: 'Premiere Pro e DaVinci Resolve', ext: '.xml', gerar: paraXmeml },
  { id: 'otio', editor: 'OpenTimelineIO', ext: '.otio', gerar: paraOtio },
  { id: 'edl', editor: 'EDL (qualquer editor, só cortes)', ext: '.edl', gerar: paraEdl },
]

/** ZroTimelineRef v0.1 de um arquivo exportado. Caminhos relativos (nome do arquivo); o relink é pelo asset_id. */
export function referencia(p, formato, arquivo, agora = new Date()) {
  return {
    schema_version: '0.1',
    project_id: p.id,
    produced_by: 'ai-edit',
    format: formato,
    file: arquivo,
    fps: Math.round(fpsNumero(p.fps) * 1000) / 1000,
    created_at: agora.toISOString(),
    relink: p.midias.map((m) => ({ asset_id: m.id, media_path: m.nome })),
    notes: [
      'Zoom vai como escala e posição de cada clipe (na EDL, só como comentário).',
      'Legenda vai à parte em SRT e VTT.',
      ...((p.efeitos || []).length ? ['Efeitos sonoros em faixa própria (na EDL, só como comentário); créditos em CREDITOS.txt.'] : []),
    ],
  }
}

/**
 * Arquivos da entrega: [{ name, data }] (o mesmo formato do zip). cfgLegenda = preset.legenda; formatos = ids de
 * FORMATOS (todos, sem dizer).
 */
export function pacote(p, cfgLegenda, agora = new Date(), formatos = FORMATOS.map((f) => f.id)) {
  const base = nomeArquivo(p.nome)
  const arquivos = FORMATOS.filter((f) => formatos.includes(f.id)).map((f) => ({ name: `${base}${f.ext}`, data: f.gerar(p), formato: f.id }))
  const blocos = agrupar(palavrasNaLinha(p), cfgLegenda)
  if (blocos.length) arquivos.push({ name: `${base}.srt`, data: srt(blocos) }, { name: `${base}.vtt`, data: vtt(blocos) })
  const cred = creditos(p)
  if (cred.length) arquivos.push({ name: 'CREDITOS.txt', data: `Efeitos sonoros\n\n${cred.join('\n')}\n` })
  const refs = arquivos.filter((a) => a.formato).map((a) => referencia(p, a.formato, a.name, agora))
  arquivos.push({ name: 'zro-timeline-ref.json', data: JSON.stringify(refs, null, 2) })
  return arquivos.map(({ name, data }) => ({ name, data }))
}
