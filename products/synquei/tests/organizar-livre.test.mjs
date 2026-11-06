// Organizar sem o SOBEDESCE e o que sai para o editor: a pasta livre do SSD (desktop/organizador.cjs), o relatório
// (app/js/relatorio.js), os bins do Premiere (export/xmeml.js) e as keywords do Final Cut (export/fcpxml.js).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classificar } from '../app/js/momentos.js'
import { dadosRelatorio, relatorioHtml, duracao } from '../app/js/relatorio.js'
import { newProject } from '../app/js/project.js'
import { buildTimelines } from '../app/js/export/model.js'
import { toXmeml } from '../app/js/export/xmeml.js'
import { toFcpxml } from '../app/js/export/fcpxml.js'

const require = createRequire(import.meta.url)
const { Organizador } = require('../desktop/organizador.cjs')

function arquivo(raiz, rel, conteudo = 'x') {
  const abs = join(raiz, ...rel.split('/'))
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, conteudo)
}

describe('pasta livre (sem o SOBEDESCE)', () => {
  test('qualquer pasta entra; o estudo lista a mídia e deixa de fora o que o Synquei e o sistema criam', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'org-livre-'))
    const raiz = join(tmp, 'SSD', 'Casamento Ana e Leo')
    for (const rel of ['Cerimonia/CAM A/C0001.MP4', 'Festa/CAM B/C0002.MP4', 'Som/ZOOM0001.WAV', 'Synquei/relatorio-x.json', 'Exports/final.mp4', '.DS_Store', 'Festa/CAM B/._C0002.MP4']) arquivo(raiz, rel)
    const org = new Organizador({ stateDir: join(tmp, 'dados'), intervaloMs: 20 })
    const { id } = await org.adicionarLivre(raiz, { tipo: 'casamento' })
    const [pasta] = org.estado()
    assert.equal(pasta.id, id)
    assert.equal(pasta.origem, 'livre')
    assert.equal(pasta.tipo, 'casamento')

    const ev = await org.estudar(id)
    assert.equal(ev.modo, 'livre')
    assert.equal(ev.tipo, 'casamento')
    assert.equal(ev.diaria.nome, 'Casamento Ana e Leo')
    assert.deepEqual(ev.arquivos.map((a) => a.rel).sort(), ['Cerimonia/CAM A/C0001.MP4', 'Festa/CAM B/C0002.MP4', 'Som/ZOOM0001.WAV'])

    // o app fechou no meio: volta na fila; depois de pronto, não
    assert.equal((await org.pendentes(id)).length, 1)
    await org.marcar(id, 'livre', 'pronto')
    assert.equal((await org.pendentes(id)).length, 0)

    // trocar o tipo vale para o próximo estudo
    await org.tipo(id, 'evento')
    assert.equal((await org.estudar(id)).tipo, 'evento')

    // só abre o que o Synquei gravou na pasta Synquei/
    assert.equal(org.doSynquei(id, join(raiz, 'Synquei', 'Relatório · x.html')), true)
    assert.equal(org.doSynquei(id, join(raiz, 'Cerimonia', 'CAM A', 'C0001.MP4')), false)
    assert.equal(org.doSynquei(id, join(raiz, 'Synquei', '..', '..', 'outra.html')), false)
  })
})

/** Projeto de casamento pronto: duas câmeras e um gravador, cerimônia e festa pela pasta, um drone. */
function casamento() {
  const p = newProject('Ana & Leo')
  p.type = 'casamento'
  p.devices = [
    { id: 'a', label: 'CAM A <FX30>', kind: 'camera', color: 0 },
    { id: 'b', label: 'CAM B', kind: 'camera', color: 1 },
    { id: 'r', label: 'Som', kind: 'recorder', color: 2 },
  ]
  const v = { kind: 'video', status: 'ready', audioStatus: 'done', video: { codec: 'H.264', width: 1920, height: 1080, rate: { num: 25, den: 1 } }, audio: { codec: 'AAC', sampleRate: 48000, channels: 2 }, size: 1 }
  const c = (id, dev, rel, pos, extra = {}) => ({ ...v, id, deviceId: dev, relPath: rel, name: rel.split('/').pop(), absPath: `/SSD/${rel}`, duration: 60, created: Date.parse('2026-11-07T16:00:00Z') + pos * 1000, sync: pos == null ? null : { pos, group: 0, conf: 0.9, method: 'audio' }, ...extra })
  p.clips = [
    c('a1', 'a', 'Cerimonia/CAM A/C0001.MP4', 0),
    c('b1', 'b', 'Cerimonia/CAM B/C0101.MP4', 5),
    c('r1', 'r', 'Cerimonia/Som/ZOOM0001.WAV', 0, { kind: 'audio', video: null }),
    c('a2', 'a', 'Festa/CAM A/C0002.MP4', 4000),
    c('d1', 'b', 'Drone/DJI_0001.MP4', null, { audio: null, audioStatus: 'none' }),
  ]
  p.sessions = [
    { id: 's1', group: 0, start: 0, end: 65, clipIds: ['a1', 'b1', 'r1'], name: 'Sessão 1' },
    { id: 's2', group: 0, start: 4000, end: 4060, clipIds: ['a2'], name: 'Sessão 2' },
  ]
  p.result = { stats: {} }
  return p
}

describe('relatório', () => {
  test('dados por momento e câmera, e o HTML sem script e com os nomes escapados', () => {
    const p = casamento()
    const cls = classificar(p)
    const d = dadosRelatorio({ p, cls, diaria: 'Casamento', tipoLabel: 'Casamento', linhas: ['03 Cerimônia'], arquivos: {}, quando: Date.parse('2026-11-07T22:00:00Z') })
    assert.equal(d.formato, 'synquei.relatorio/1')
    assert.equal(d.totais.arquivos, 5)
    assert.ok(d.momentos.some((m) => /Cerimônia/.test(m.nome)))
    assert.ok(d.momentos.some((m) => /Festa/.test(m.nome)))
    assert.ok(d.totais.broll >= 1, 'o drone é b-roll')
    const html = relatorioHtml(d)
    assert.match(html, /^<!doctype html>/i)
    assert.doesNotMatch(html, /<script/i)
    assert.match(html, /CAM A &lt;FX30&gt;/)
    assert.doesNotMatch(html, /CAM A <FX30>/)
    assert.match(html, /originais não foram movidos/)
    assert.equal(duracao(3725), '1 h 02 min')
  })
})

describe('arquivos para o editor', () => {
  test('Premiere: as sequências vão para bins pelo nome do momento', () => {
    const p = casamento()
    const tls = buildTimelines(p, { ...p.export, includeUnsynced: false, splitSessions: true })
    tls[0].name = 'Cerimônia'
    tls[1].name = 'Festa'
    const xml = toXmeml(tls, p, { wrap: true, bins: new Map([['Cerimônia', '03 Cerimônia'], ['Festa', '05 Festa']]) })
    assert.match(xml, /<bin>\s*<name>03 Cerimônia<\/name>\s*<children>\s*<sequence[^>]*>\s*(?:<[^>]+>\s*)*<name>Cerimônia<\/name>/)
    assert.match(xml, /<bin>\s*<name>05 Festa<\/name>/)
  })

  test('Final Cut: os clipes do evento levam as keywords (viram coleções no evento)', () => {
    const p = casamento()
    const tls = buildTimelines(p, { ...p.export, includeUnsynced: false, splitSessions: true })
    const xml = toFcpxml(tls, p, { tags: new Map([['a1', ['03 Cerimônia', 'CAM A', 'Principal']]]), evento: 'Ana & Leo' })
    assert.match(xml, /<event name="Ana &amp; Leo"/)
    assert.match(xml, /<keyword [^>]*value="03 Cerimônia, CAM A, Principal"\/>/)
  })
})
