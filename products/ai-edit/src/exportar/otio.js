// OpenTimelineIO (JSON .otio): a ponte aberta entre editores. Zoom e foco vão em metadata.zro de cada clipe.

import { caminhoDa, fileUrl, segmentos } from './comum.js'
import { fpsNumero } from '../tempo.js'
import { PRODUTO } from '../produto.js'

const rt = (q, rate) => ({ OTIO_SCHEMA: 'RationalTime.1', rate, value: q })
const range = (ini, n, rate) => ({ OTIO_SCHEMA: 'TimeRange.1', start_time: rt(ini, rate), duration: rt(n, rate) })

export function paraOtio(p) {
  const rate = fpsNumero(p.fps)
  const clipe = (s, tipo) => {
    const m = p.midias.find((x) => x.id === s.midia)
    return {
      OTIO_SCHEMA: 'Clip.2',
      name: m.nome,
      source_range: range(s.ini, s.fim - s.ini, rate),
      media_references: { DEFAULT_MEDIA: { OTIO_SCHEMA: 'ExternalReference.1', target_url: fileUrl(caminhoDa(m)), available_range: range(0, m.quadros, rate), metadata: { zro: { asset_id: m.id } } } },
      active_media_reference_key: 'DEFAULT_MEDIA',
      effects: [],
      markers: [],
      enabled: true,
      metadata: { zro: { ...(tipo === 'Video' && s.escala !== 1 ? { zoom: { escala: s.escala, foco: s.foco } } : {}), ...(s.cor ? { cor: s.cor } : {}), ...(s.etiqueta ? { etiqueta: s.etiqueta } : {}), ...(JSON.stringify(s.ajustes) !== '{"volume":0,"opacidade":1,"escala":1,"x":0,"y":0}' ? { ajustes: s.ajustes } : {}) } },
    }
  }
  const segs = segmentos(p)
  const trilha = (tipo) => ({
    OTIO_SCHEMA: 'Track.1',
    name: tipo === 'Video' ? 'V1' : 'A1',
    kind: tipo,
    children: segs.filter((s) => p.midias.find((m) => m.id === s.midia)?.[tipo === 'Video' ? 'temVideo' : 'temAudio']).map((s) => clipe(s, tipo)),
    effects: [],
    markers:
      tipo === 'Video'
        ? (p.marcadores || []).map((k) => ({ OTIO_SCHEMA: 'Marker.2', name: k.nome || 'Marcador', marked_range: range(k.q, 0, rate), color: 'PURPLE', comment: '', metadata: {} }))
        : [],
    enabled: true,
    metadata: {},
  })
  return JSON.stringify(
    {
      OTIO_SCHEMA: 'Timeline.1',
      name: p.nome,
      global_start_time: rt(0, rate),
      tracks: { OTIO_SCHEMA: 'Stack.1', name: 'tracks', children: [trilha('Video'), trilha('Audio')], effects: [], markers: [], enabled: true, metadata: {} },
      metadata: { zro: { produced_by: PRODUTO.id, project_id: p.id } },
    },
    null,
    2,
  )
}
