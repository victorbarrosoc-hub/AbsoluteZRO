// Momentos (app/js/momentos.js): cada tipo de vídeo separa os clipes do jeito que o editor espera.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { classificar, pastaDoClipe, tagsDoClipe, sessoesOrganizadas, camerasComLentes, resumoMomentos, normalizar, MODELOS } from '../app/js/momentos.js'
import { TIPOS } from '../app/js/tipos.js'

const H = 3600e3
const DIA = Date.parse('2026-11-07T08:00:00-03:00')

/** Clipe de mentira: o mínimo que o Synquei sabe de cada arquivo depois de ler e sincronizar. */
function clipe(id, { rel, kind = 'video', dev = 'cam1', created, dur = 60, sync = null, audio = true, org = null, lens = '' } = {}) {
  return { id, status: 'ready', name: rel.split('/').pop(), relPath: rel, kind, deviceId: dev, created, duration: dur, sync, audio: audio ? { channels: 2 } : null, audioStatus: audio ? 'done' : 'none', org, device: lens ? { lens } : null }
}
const som = (pos, group = 0, conf = 0.9) => ({ pos, group, conf, method: 'audio' })

function projeto(type, clips, devices, sessions = []) {
  return { type, clips, devices, sessions, momentosManual: {} }
}

describe('modelos', () => {
  test('todo tipo de projeto tem um modelo, e todo modelo tem o momento principal na lista', () => {
    for (const t of TIPOS) assert.ok(MODELOS[t.id], t.id)
    for (const [id, md] of Object.entries(MODELOS)) {
      assert.ok(md.momentos.some((x) => x.id === md.principal), id)
      for (const p of md.pistas || []) assert.ok(md.momentos.some((x) => x.id === p), `${id}: ${p}`)
    }
  })

  test('as pistas não ligam para acento, maiúscula nem separador', () => {
    assert.equal(normalizar('Diária 01/CERIMÔNIA_Igreja-Matriz'), 'diaria 01 cerimonia igreja matriz')
  })
})

describe('casamento', () => {
  const devices = [
    { id: 'cam1', label: 'Aladim - FX30', kind: 'camera' },
    { id: 'cam2', label: 'Bia - A7S3', kind: 'camera' },
    { id: 'gim', label: 'Caio - Gimbal', kind: 'camera' },
    { id: 'rec', label: 'Som - F8', kind: 'recorder' },
    { id: 'lap', label: 'Lapela noivo', kind: 'recorder' },
  ]

  test('pela pasta: making da noiva, cerimônia (até com "entrada da noiva"), votos, festa e drone como b-roll', () => {
    const p = projeto(
      'casamento',
      [
        clipe('a', { rel: 'Diária 01/Making Noiva/C0001.MP4', created: DIA }),
        clipe('b', { rel: 'Diária 01/Cerimônia - entrada da noiva/C0002.MP4', created: DIA + 4 * H, sync: som(0) }),
        clipe('c', { rel: 'Diária 01/Votos/ZOOM0001.WAV', kind: 'audio', dev: 'lap', created: DIA + 4.2 * H, sync: som(600) }),
        clipe('d', { rel: 'Diária 01/Festa/C0003.MP4', created: DIA + 8 * H, sync: som(5000) }),
        clipe('e', { rel: 'Diária 01/Drone/DJI_0001.MP4', created: DIA + 5 * H, audio: false }),
        clipe('f', { rel: 'Diária 01/Buffet e bolo/C0004.MP4', created: DIA + 9 * H }),
      ],
      devices,
    )
    const cls = classificar(p)
    const de = (id) => cls.clipes[id]
    assert.equal(de('a').momentoNome, 'Making da noiva')
    assert.equal(de('b').momentoNome, 'Cerimônia')
    assert.equal(de('c').momentoNome, 'Votos')
    assert.equal(de('c').audio, true)
    assert.equal(de('d').momentoNome, 'Festa')
    assert.equal(de('e').broll, true)
    assert.equal(de('e').drone, true)
    assert.equal(de('f').momentoNome, 'Buffet')
    assert.equal(de('a').origem, 'pasta')
    // as pastas vêm na ordem do dia
    assert.deepEqual(
      cls.momentos.map((x) => x.pasta),
      ['01 Making da noiva', '02 Cerimônia', '03 Votos', '04 Festa', '05 Buffet'],
    )
  })

  test('sem pista de pasta: a sessão mais cheia é a cerimônia, antes é making, depois é festa, e isso é sugestão', () => {
    const clips = [
      clipe('m1', { rel: 'D1/CAM A/C0001.MP4', dev: 'cam1', created: DIA, sync: som(0, 1) }),
      clipe('c1', { rel: 'D1/CAM A/C0002.MP4', dev: 'cam1', created: DIA + 4 * H, sync: som(1000, 0), dur: 2400 }),
      clipe('c2', { rel: 'D1/CAM B/C0001.MP4', dev: 'cam2', created: DIA + 4 * H, sync: som(1000, 0), dur: 2400 }),
      clipe('c3', { rel: 'D1/SOM/ZOOM0001.WAV', kind: 'audio', dev: 'rec', created: DIA + 4 * H, sync: som(990, 0), dur: 2500 }),
      clipe('f1', { rel: 'D1/CAM B/C0002.MP4', dev: 'cam2', created: DIA + 9 * H, sync: som(0, 2) }),
      clipe('g1', { rel: 'D1/GIMBAL/C0001.MP4', dev: 'gim', created: DIA + 4.5 * H, audio: false }),
    ]
    const sessions = [
      { id: 's1', group: 1, start: 0, end: 60, clipIds: ['m1'] },
      { id: 's2', group: 0, start: 990, end: 3490, clipIds: ['c1', 'c2', 'c3'] },
      { id: 's3', group: 2, start: 0, end: 60, clipIds: ['f1'] },
    ]
    const cls = classificar(projeto('casamento', clips, devices, sessions))
    assert.equal(cls.clipes.m1.momentoNome, 'Making of')
    assert.equal(cls.clipes.c1.momentoNome, 'Cerimônia')
    assert.equal(cls.clipes.f1.momentoNome, 'Festa')
    // gimbal sem som e sem sincronia: b-roll do momento em que ele caiu pelo relógio
    assert.equal(cls.clipes.g1.broll, true)
    assert.equal(cls.clipes.g1.momentoNome, 'Cerimônia')
    assert.ok(cls.momentos.every((x) => x.sugestao))
    assert.ok(tagsDoClipe(cls.clipes.c1, { diaria: 'Diária 01' }).includes('Momento sugerido'))
  })

  test('o que a pessoa marcou (no cartão ou corrigido aqui) vale mais que a pasta', () => {
    const p = projeto('casamento', [clipe('x', { rel: 'D1/Festa/C1.MP4', created: DIA, org: { dono: 'Aladim - FX30', momento: 'Decoração' } }), clipe('y', { rel: 'D1/Festa/C2.MP4', created: DIA })], devices)
    p.momentosManual = { y: 'Primeira dança' }
    const cls = classificar(p)
    assert.equal(cls.clipes.x.momentoNome, 'Decoração')
    assert.equal(cls.clipes.x.origem, 'marcado')
    assert.equal(cls.clipes.y.momentoNome, 'Primeira dança')
    assert.equal(cls.clipes.x.camera, 'Aladim - FX30')
  })

  test('pasta no editor: diária › momento › câmeras/b-roll/áudio › câmera › cartão; linha do tempo por momento', () => {
    const clips = [
      clipe('c1', { rel: 'D1/Cerimonia/C1.MP4', dev: 'cam1', created: DIA, sync: som(0), org: { dono: 'Aladim - FX30', cartaoNome: 'Cartão 01' } }),
      clipe('c2', { rel: 'D1/Cerimonia/C2.MP4', dev: 'cam2', created: DIA, sync: som(5), org: { dono: 'Bia - A7S3', cartaoNome: 'Cartão 02' } }),
      clipe('a1', { rel: 'D1/Cerimonia/Z1.WAV', kind: 'audio', dev: 'rec', created: DIA, sync: som(0), org: { dono: 'Som - F8', cartaoNome: 'Cartão 01' } }),
      clipe('b1', { rel: 'D1/Cerimonia/Detalhes/C3.MP4', dev: 'gim', created: DIA, audio: false }),
    ]
    const p = projeto('casamento', clips, devices, [{ id: 's1', group: 0, start: 0, end: 65, clipIds: ['c1', 'c2', 'a1'] }])
    const cls = classificar(p)
    const lentes = camerasComLentes(cls)
    const o = (id, cartao) => pastaDoClipe(cls.clipes[id], { diaria: 'Diária 01', cartao, eixo: cls.eixo, parte: cls.parte, lentes })
    assert.deepEqual(o('c1', 'Cartão 01'), ['Diária 01', '01 Cerimônia', 'Câmeras', 'Aladim - FX30', 'Cartão 01'])
    assert.deepEqual(o('a1', 'Cartão 01'), ['Diária 01', '01 Cerimônia', 'Áudio', 'Som - F8'])
    assert.deepEqual(o('b1', 'Cartão 01'), ['Diária 01', '01 Cerimônia', 'B-roll', 'Caio - Gimbal'])
    const ss = sessoesOrganizadas(p, cls)
    assert.equal(ss.length, 1)
    assert.equal(ss[0].name, '01 Cerimônia')
    assert.deepEqual(ss[0].clipIds.sort(), ['a1', 'c1', 'c2'])
  })

  test('lente vira subpasta só na câmera que trocou de lente', () => {
    const clips = [
      clipe('l1', { rel: 'D1/Festa/C1.MP4', dev: 'cam1', created: DIA, sync: som(0), lens: 'FE 24-70mm F2.8 GM II' }),
      clipe('l2', { rel: 'D1/Festa/C2.MP4', dev: 'cam1', created: DIA, sync: som(70), lens: 'FE 85mm F1.4 GM' }),
      clipe('l3', { rel: 'D1/Festa/C3.MP4', dev: 'cam2', created: DIA, sync: som(10), lens: 'FE 35mm F1.4 GM' }),
    ]
    const cls = classificar(projeto('casamento', clips, devices))
    const lentes = camerasComLentes(cls)
    assert.deepEqual([...lentes], ['Aladim - FX30'])
    assert.deepEqual(pastaDoClipe(cls.clipes.l2, { diaria: 'D1', eixo: 'momento', lentes }), ['D1', '01 Festa', 'Câmeras', 'Aladim - FX30', 'FE 85mm F1.4 GM'])
    assert.deepEqual(pastaDoClipe(cls.clipes.l3, { diaria: 'D1', eixo: 'momento', lentes }), ['D1', '01 Festa', 'Câmeras', 'Bia - A7S3'])
    assert.ok(tagsDoClipe(cls.clipes.l3).includes('FE 35mm F1.4 GM'))
  })
})

describe('clipe (videoclipe)', () => {
  const devices = [
    { id: 'a', label: 'CAM A', kind: 'camera' },
    { id: 'b', label: 'CAM B', kind: 'camera' },
    { id: 'm', label: 'Música', kind: 'recorder' },
  ]
  test('performance é o que encaixou na música; takes pelo relógio; b-roll à parte; uma linha do tempo por take com a música', () => {
    const t = (n) => DIA + n * 10 * 60e3
    const clips = [
      clipe('mus', { rel: 'MASTER/musica.wav', kind: 'audio', dev: 'm', sync: som(0), dur: 200 }),
      clipe('a1', { rel: 'CAM A/A001.MOV', dev: 'a', created: t(0), sync: som(0), dur: 200 }),
      clipe('b1', { rel: 'CAM B/B001.MOV', dev: 'b', created: t(0) + 3000, sync: som(1), dur: 199 }),
      clipe('a2', { rel: 'CAM A/A002.MOV', dev: 'a', created: t(1), sync: som(0), dur: 200 }),
      clipe('b2', { rel: 'CAM B/B002.MOV', dev: 'b', created: t(1) + 2000, sync: som(0), dur: 200 }),
      clipe('x1', { rel: 'CAM B/B003.MOV', dev: 'b', created: t(2), dur: 20 }),
    ]
    const p = projeto('videoclipe', clips, devices, [{ id: 's1', group: 0, start: 0, end: 200, clipIds: ['mus', 'a1', 'b1', 'a2', 'b2'] }])
    const cls = classificar(p)
    assert.equal(cls.clipes.a1.momentoNome, 'Performance')
    assert.equal(cls.clipes.a1.broll, false)
    assert.equal(cls.clipes.x1.broll, true)
    assert.equal(cls.clipes.a1.parte, 'Take 01')
    assert.equal(cls.clipes.b1.parte, 'Take 01')
    assert.equal(cls.clipes.b2.parte, 'Take 02')
    assert.deepEqual(cls.partes, ['Take 01', 'Take 02'])
    assert.deepEqual(pastaDoClipe(cls.clipes.b2, { diaria: 'Diária 01', eixo: cls.eixo, parte: cls.parte }), ['Diária 01', 'Takes', 'Take 02', 'CAM B'])
    assert.deepEqual(pastaDoClipe(cls.clipes.x1, { diaria: 'Diária 01', cartao: 'Cartão 01', eixo: cls.eixo, parte: cls.parte }), ['Diária 01', 'B-roll', 'CAM B', 'Cartão 01'])
    const ss = sessoesOrganizadas(p, cls)
    assert.deepEqual(
      ss.map((s) => s.name),
      ['Take 01', 'Take 02'],
    )
    assert.ok(ss[0].clipIds.includes('mus'), 'a música entra no take')
    const r = resumoMomentos(cls)
    assert.equal(r.partes, 2)
    assert.equal(r.broll, 1)
  })
})

describe('outros tipos', () => {
  test('EP: uma música por sessão; podcast e aula ficam por câmera', () => {
    const devices = [{ id: 'a', label: 'Cam 1', kind: 'camera' }]
    const clips = [clipe('s1', { rel: 'Cam 1/C1.MP4', dev: 'a', sync: som(0) }), clipe('s2', { rel: 'Cam 1/C2.MP4', dev: 'a', sync: som(3000) })]
    const sessions = [
      { id: 'x1', group: 0, start: 0, end: 60, clipIds: ['s1'] },
      { id: 'x2', group: 0, start: 3000, end: 3060, clipIds: ['s2'] },
    ]
    const ep = classificar(projeto('sessao', clips, devices, sessions))
    assert.deepEqual(ep.partes, ['Música 01', 'Música 02'])
    assert.deepEqual(pastaDoClipe(ep.clipes.s2, { diaria: 'D1', eixo: ep.eixo, parte: ep.parte }), ['D1', 'Músicas', 'Música 02', 'Cam 1'])
    const pod = classificar(projeto('podcast', clips, devices, sessions))
    assert.equal(pod.eixo, 'camera')
    assert.deepEqual(pastaDoClipe(pod.clipes.s1, { diaria: 'D1', cartao: 'Cartão 01', eixo: pod.eixo }), ['D1', 'Câmeras', 'Cam 1', 'Cartão 01'])
    assert.deepEqual(
      sessoesOrganizadas(projeto('podcast', clips, devices, sessions), pod).map((s) => s.name),
      ['Episódio 01', 'Episódio 02'],
    )
    const aula = classificar(projeto('aula', [clipe('t', { rel: 'TELA/gravacao de tela.mp4', dev: 'a', sync: som(0) })], devices))
    assert.equal(aula.clipes.t.momentoNome, 'Tela')
  })

  test('evento corporativo, documentário e aftermovie separam pelos nomes das pastas', () => {
    const devices = [{ id: 'a', label: 'Cam', kind: 'camera' }]
    const ev = classificar(projeto('evento', [clipe('k', { rel: 'Credenciamento/C1.MP4', dev: 'a' }), clipe('p', { rel: 'Palestra CEO/C2.MP4', dev: 'a', sync: som(0) })], devices))
    assert.equal(ev.clipes.k.momentoNome, 'Credenciamento')
    assert.equal(ev.clipes.p.momentoNome, 'Palestras e painéis')
    const doc = classificar(projeto('documentario', [clipe('e', { rel: 'Entrevista Maria/C1.MP4', dev: 'a', sync: som(0) }), clipe('o', { rel: 'Cotidiano/C2.MP4', dev: 'a' })], devices))
    assert.equal(doc.clipes.e.momentoNome, 'Entrevistas')
    assert.equal(doc.clipes.o.momentoNome, 'Observacional')
    const af = classificar(projeto('aftermovie', [clipe('d', { rel: 'Palco/DJ set/C1.MP4', dev: 'a' }), clipe('z', { rel: 'Drone/DJI_0001.MP4', dev: 'a', audio: false })], devices))
    assert.equal(af.clipes.d.momentoNome, 'Palco e shows')
    assert.equal(af.clipes.z.drone, true)
  })

  test('tipo desconhecido cai no modelo "outro" sem quebrar', () => {
    const cls = classificar(projeto('nao-existe', [clipe('q', { rel: 'X/C1.MP4' })], []))
    assert.equal(cls.eixo, 'camera')
    assert.equal(cls.clipes.q.camera, 'Câmera')
  })
})
