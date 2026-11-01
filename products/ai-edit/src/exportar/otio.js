// OpenTimelineIO (JSON .otio): a ponte aberta entre editores. Zoom e foco vão em metadata.zro de cada clipe. Velocidade:
// LinearTimeWarp por degrau (o clipe ocupa `saida` quadros na trilha e consome saida × v da mídia). Onde uma trilha não
// tem o que tocar (mídia sem som, degrau fora de 100%) entra um Gap do mesmo tamanho: as trilhas ficam alinhadas.
// Efeitos sonoros em trilhas de áudio próprias (FX1, FX2…), com lacunas entre um efeito e outro. A trilha (a música do
// clipe musical) numa trilha de áudio "Música", do começo da linha.

import { caminhoDa, caminhoDoSom, COR_OTIO, efeitosExportados, fileUrl, segmentos, trilhaExportada } from './comum.js'
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
      source_range: range(s.ini, s.saida, rate),
      media_references: { DEFAULT_MEDIA: { OTIO_SCHEMA: 'ExternalReference.1', target_url: fileUrl(caminhoDa(m)), available_range: range(0, m.quadros, rate), metadata: { zro: { asset_id: m.id } } } },
      active_media_reference_key: 'DEFAULT_MEDIA',
      effects: s.v === 1 ? [] : [{ OTIO_SCHEMA: 'LinearTimeWarp.1', name: 'Velocidade', effect_name: 'LinearTimeWarp', time_scalar: s.v, metadata: {} }],
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
    children: segs.map((s) => (p.midias.find((m) => m.id === s.midia)?.[tipo === 'Video' ? 'temVideo' : 'temAudio'] && (tipo === 'Video' || s.som) ? clipe(s, tipo) : { OTIO_SCHEMA: 'Gap.1', name: '', source_range: range(0, s.saida, rate), effects: [], markers: [], enabled: true, metadata: {} })),
    effects: [],
    markers:
      tipo === 'Video'
        ? (p.marcadores || []).map((k) => ({ OTIO_SCHEMA: 'Marker.2', name: k.nome || 'Marcador', marked_range: range(k.q, 0, rate), color: COR_OTIO[k.cor] || 'PURPLE', comment: k.nota || '', metadata: {} }))
        : [],
    enabled: true,
    metadata: {},
  })
  const efeitos = efeitosExportados(p)
  const trilhaEfeitos = (f) => {
    const children = []
    let t = 0
    for (const x of efeitos.filter((e) => e.faixa === f)) {
      if (x.inicio > t) children.push({ OTIO_SCHEMA: 'Gap.1', name: '', source_range: range(0, x.inicio - t, rate), effects: [], markers: [], enabled: true, metadata: {} })
      children.push({
        OTIO_SCHEMA: 'Clip.2',
        name: x.som.nome,
        source_range: range(0, x.quadros, rate),
        media_references: { DEFAULT_MEDIA: { OTIO_SCHEMA: 'ExternalReference.1', target_url: fileUrl(caminhoDoSom(x.som)), available_range: range(0, x.quadrosSom, rate), metadata: { zro: { sound_id: x.som.id } } } },
        active_media_reference_key: 'DEFAULT_MEDIA',
        effects: [],
        markers: [],
        enabled: true,
        metadata: { zro: { efeito: x.efeito.id, origem: x.som.origem, ...(x.efeito.volume ? { volume: x.efeito.volume } : {}) } },
      })
      t = x.inicio + x.quadros
    }
    return { OTIO_SCHEMA: 'Track.1', name: `FX${f + 1}`, kind: 'Audio', children, effects: [], markers: [], enabled: true, metadata: { zro: { funcao: 'efeitos' } } }
  }
  const nFaixas = efeitos.reduce((n, x) => Math.max(n, x.faixa + 1), 0)
  const tr = trilhaExportada(p)
  const musica = tr
    ? [
        {
          OTIO_SCHEMA: 'Track.1',
          name: 'Música',
          kind: 'Audio',
          children: [
            {
              OTIO_SCHEMA: 'Clip.2',
              name: tr.midia.nome,
              source_range: range(tr.desde, tr.quadros, rate),
              media_references: { DEFAULT_MEDIA: { OTIO_SCHEMA: 'ExternalReference.1', target_url: fileUrl(caminhoDa(tr.midia)), available_range: range(0, tr.midia.quadros, rate), metadata: { zro: { asset_id: tr.midia.id } } } },
              active_media_reference_key: 'DEFAULT_MEDIA',
              effects: [],
              markers: [],
              enabled: true,
              metadata: { zro: { funcao: 'trilha', ...(tr.volume ? { volume: tr.volume } : {}) } },
            },
          ],
          effects: [],
          markers: [],
          enabled: true,
          metadata: { zro: { funcao: 'trilha' } },
        },
      ]
    : []
  return JSON.stringify(
    {
      OTIO_SCHEMA: 'Timeline.1',
      name: p.nome,
      global_start_time: rt(0, rate),
      tracks: { OTIO_SCHEMA: 'Stack.1', name: 'tracks', children: [trilha('Video'), trilha('Audio'), ...Array.from({ length: nFaixas }, (_, f) => trilhaEfeitos(f)), ...musica], effects: [], markers: [], enabled: true, metadata: {} },
      metadata: { zro: { produced_by: PRODUTO.id, project_id: p.id } },
    },
    null,
    2,
  )
}
