// CAMZRO · metadados do clipe. Contas puras.
//
// Cada clipe sai com um sidecar JSON (camzro.clip/1, contrato em docs/integration-contracts/camzro.md) e a diária
// exporta, de uma vez:
// - CSV de metadados do DaVinci Resolve (Media Pool › Importar metadados): primeira coluna "File Name" e os mesmos
//   campos que o Synquei usa no Resolve (Scene, Shot, Take, Camera #, Angle, Roll Card #, Lens Type, Comments,
//   Keywords) mais Good Take, ISO, Shutter, White Point (Kelvin) e Camera FPS.
// - ALE (Avid Log Exchange), que o Avid e o Resolve leem: Name, Start, End, Tape, Scene, Take, Camroll…
// - Relatório de câmera (HTML para imprimir), como o da assistência de câmera no set.
// O CAMZRO nunca muda o arquivo de vídeo depois de gravado: o sidecar é outro arquivo, com o mesmo nome.

import { campo, nomeDoRolo } from './claquete.js'
import { formatar, fim } from './timecode.js'
import { fracao, anguloTexto } from './exposicao.js'

export const FORMATO_SIDECAR = 'camzro.clip/1'

/** Monta o sidecar de um clipe a partir do que a gravação mediu. Campos desconhecidos ficam null, nunca inventados. */
export function sidecar(c) {
  const df = Boolean(c.df)
  return {
    formato: FORMATO_SIDECAR,
    arquivo: c.arquivo,
    clipe: c.nome,
    criado: new Date(c.inicioMs).toISOString(),
    duracao_s: Math.round(c.duracao * 1000) / 1000,
    quadros: c.quadros,
    fps: c.fps,
    timecode: { inicio: formatar(c.tcInicio, c.fps, df), fim: formatar(fim(c.tcInicio, c.quadros, c.fps, df), c.fps, df), drop_frame: df, fonte: c.tcFonte || 'relogio' },
    claquete: {
      projeto: campo(c.claquete.projeto, 60) || null,
      cena: campo(c.claquete.cena, 8),
      plano: campo(c.claquete.plano, 6),
      take: c.claquete.take,
      camera: c.claquete.camera,
      rolo: nomeDoRolo(c.claquete.camera, c.claquete.rolo),
      bom: Boolean(c.bom),
      notas: campo(c.notas, 500) || null,
    },
    video: {
      codec: c.video.codec,
      largura: c.video.largura,
      altura: c.video.altura,
      bitrate: c.video.bitrate,
      quadro_chave_s: c.video.quadroChave ?? null,
      quadros_perdidos: c.video.perdidos ?? 0,
      motor: c.video.motor,
    },
    audio: c.audio ? { codec: c.audio.codec, taxa: c.audio.taxa, canais: c.audio.canais } : null,
    camera: {
      aparelho: c.aparelho,
      lente: campo(c.camera?.lente, 60) || null,
      iso: c.camera?.iso ?? null,
      obturador_s: c.camera?.tempo ?? null,
      angulo: c.camera?.angulo ?? null,
      kelvin: c.camera?.kelvin ?? null,
      zoom: c.camera?.zoom ?? null,
      anamorfico: c.camera?.anamorfico ?? 1,
      lut_monitor: c.camera?.lut || null,
      nd: c.camera?.nd ?? null,
    },
    ecossistema: { maestro: c.maestro || null, sincronia: c.sincronia || null },
  }
}

const escaparCsv = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const COLUNAS_RESOLVE = ['File Name', 'Scene', 'Shot', 'Take', 'Good Take', 'Camera #', 'Angle', 'Roll Card #', 'Lens Type', 'ISO', 'Shutter', 'White Point (Kelvin)', 'Camera FPS', 'Comments', 'Keywords', 'Description']

/** CSV de metadados do DaVinci Resolve para os sidecars da diária. */
export function csvResolve(sidecars, { keywords = [] } = {}) {
  const linhas = [COLUNAS_RESOLVE.join(',')]
  for (const s of sidecars) {
    const k = [...keywords, s.claquete.bom ? 'Bom take' : null, 'CAMZRO'].filter(Boolean).join(', ')
    const v = [
      s.arquivo,
      s.claquete.cena,
      s.claquete.plano,
      s.claquete.take,
      s.claquete.bom ? '1' : '',
      s.claquete.camera,
      s.claquete.camera,
      s.claquete.rolo,
      s.camera.lente || '',
      s.camera.iso ?? '',
      s.camera.angulo != null ? anguloTexto(s.camera.angulo) : s.camera.obturador_s ? fracao(s.camera.obturador_s) : '',
      s.camera.kelvin ?? '',
      Number(s.fps.toFixed(3)),
      s.claquete.notas || '',
      k,
      s.claquete.projeto || '',
    ]
    linhas.push(v.map(escaparCsv).join(','))
  }
  return `${linhas.join('\r\n')}\r\n`
}

const limparAle = (v) => String(v ?? '').replace(/[\t\r\n]/g, ' ')

/** ALE (Avid Log Exchange) da diária. Uma cadência por arquivo (a do primeiro clipe). */
export function ale(sidecars) {
  const fps = sidecars[0]?.fps ?? 24
  const formato = sidecars[0] ? (sidecars[0].video.altura >= 2160 ? 'CUSTOM' : sidecars[0].video.altura >= 1080 ? '1080' : '720') : '1080'
  const cab = ['Heading', 'FIELD_DELIM\tTABS', `VIDEO_FORMAT\t${formato}`, 'AUDIO_FORMAT\t48khz', `FPS\t${Number(fps.toFixed(3))}`, '', 'Column']
  const cols = ['Name', 'Tracks', 'Start', 'End', 'Tape', 'Source File', 'Scene', 'Take', 'Camroll', 'Circled', 'Comments']
  const dados = sidecars.map((s) =>
    [s.clipe, s.audio ? (s.audio.canais > 1 ? 'VA1A2' : 'VA1') : 'V', s.timecode.inicio, s.timecode.fim, s.claquete.rolo, s.arquivo, s.claquete.cena + s.claquete.plano, s.claquete.take, s.claquete.rolo, s.claquete.bom ? 'Y' : '', s.claquete.notas || '']
      .map(limparAle)
      .join('\t'),
  )
  return `${[...cab, cols.join('\t'), '', 'Data', ...dados].join('\n')}\n`
}

const escaparHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** Relatório de câmera (HTML autossuficiente, para imprimir ou salvar em PDF). */
export function relatorioHtml(sidecars, { titulo = 'Relatório de câmera', data = new Date() } = {}) {
  const linhas = sidecars
    .map(
      (s) =>
        `<tr${s.claquete.bom ? ' class="bom"' : ''}><td>${escaparHtml(s.clipe)}</td><td>${escaparHtml(s.claquete.cena)}</td><td>${escaparHtml(s.claquete.plano)}</td><td>${s.claquete.take}</td><td>${s.claquete.bom ? '●' : ''}</td><td>${escaparHtml(s.timecode.inicio)}</td><td>${escaparHtml(s.timecode.fim)}</td><td>${Math.round(s.duracao_s)} s</td><td>${escaparHtml(s.camera.lente || '')}</td><td>${s.camera.iso ?? ''}</td><td>${s.camera.angulo != null ? anguloTexto(s.camera.angulo) : ''}</td><td>${s.camera.kelvin ?? ''}</td><td>${escaparHtml(s.claquete.notas || '')}</td></tr>`,
    )
    .join('')
  const bons = sidecars.filter((s) => s.claquete.bom).length
  const total = sidecars.reduce((t, s) => t + s.duracao_s, 0)
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escaparHtml(titulo)}</title><style>body{font:13px/1.4 -apple-system,system-ui,sans-serif;color:#1d1d1f;margin:24px}h1{font-weight:300;font-size:24px;margin:0 0 4px}h1 b{font-weight:800}p{color:#6e6e73;margin:0 0 16px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e5e5ea;white-space:nowrap}th{font-weight:600;color:#6e6e73;font-size:11px;text-transform:uppercase;letter-spacing:.04em}tr.bom td{font-weight:600}td:last-child{white-space:normal}@media print{body{margin:0}}</style></head><body><h1><b>${escaparHtml(titulo)}</b></h1><p>${escaparHtml(data.toLocaleDateString('pt-BR'))} · ${sidecars.length} clipes · ${bons} bons · ${Math.round(total / 60)} min · CAMZRO</p><table><thead><tr><th>Clipe</th><th>Cena</th><th>Plano</th><th>Take</th><th>Bom</th><th>TC início</th><th>TC fim</th><th>Duração</th><th>Lente</th><th>ISO</th><th>Obt.</th><th>K</th><th>Notas</th></tr></thead><tbody>${linhas}</tbody></table></body></html>`
}

/** Confere um sidecar que veio de fora (outro aparelho, outro app). Devolve a lista de problemas (vazia = ok). */
export function conferirSidecar(s) {
  const p = []
  if (!s || typeof s !== 'object') return ['não é um objeto']
  if (s.formato !== FORMATO_SIDECAR) p.push('formato')
  if (typeof s.arquivo !== 'string' || !/^[A-Za-z0-9_.-]{1,120}$/.test(s.arquivo)) p.push('arquivo')
  if (!(s.fps > 0 && s.fps <= 240)) p.push('fps')
  if (!Number.isInteger(s.quadros) || s.quadros < 0) p.push('quadros')
  if (!s.timecode || typeof s.timecode.inicio !== 'string') p.push('timecode')
  if (!s.claquete || !Number.isInteger(s.claquete.take)) p.push('claquete')
  return p
}
