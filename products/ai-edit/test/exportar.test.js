// Exportadores: XML bem formado (xmllint), tempos certos, zoom no formato de cada editor e o ZroTimelineRef conferido
// contra o JSON Schema gerado do contrato (docs/integration-contracts, npm run contracts:export).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { aprovar, comPropostas, comTranscricao, novoProjeto } from '../src/projeto.js'
import { etiquetar } from '../src/linha.js'
import { pacote, referencia } from '../src/exportar/index.js'
import { paraFcpxml } from '../src/exportar/fcpxml.js'
import { paraXmeml } from '../src/exportar/xmeml.js'
import { paraEdl } from '../src/exportar/edl.js'
import { paraOtio } from '../src/exportar/otio.js'
import { fileUrl, pathUrl, segmentos } from '../src/exportar/comum.js'
import { zip } from '../src/exportar/zip.js'
import { PRESET } from './apoio.js'

const SCHEMA = JSON.parse(readFileSync(new URL('../../../docs/integration-contracts/schemas/zro-timeline-ref.v0.schema.json', import.meta.url), 'utf8'))

function projeto() {
  const midias = [
    { id: 'a1b2c3', nome: 'Câmera A.mp4', caminho: '/Volumes/Cartão/Câmera A.mp4', duracao: 20, fps: 29.97, largura: 1920, altura: 1080, temVideo: true, temAudio: true, canais: 2, taxa: 48000 },
    { id: 'd4e5f6', nome: 'trilha.wav', duracao: 5, temVideo: false, temAudio: true },
  ]
  let p = novoProjeto({ id: '0b6f3c2a-6d4e-4c1b-9a8f-2e7d5c4b3a21', nome: 'Aula & teste <1>', midias, preset: PRESET })
  p = comTranscricao(p, 'a1b2c3', { modelo: 't', palavras: [{ texto: 'Bom', ini: 1, fim: 1.4 }, { texto: 'dia!', ini: 1.4, fim: 2 }, { texto: 'Tchau.', ini: 9, fim: 9.6 }] })
  p = comPropostas(
    p,
    [
      { id: 'k1', tipo: 'silencio', midia: 'a1b2c3', ini: 3, fim: 8, estado: 'pendente', motivo: '' },
      { id: 'z1', tipo: 'zoom', midia: 'a1b2c3', ini: 1, fim: 2.5, escala: 1.25, foco: { x: 0.5, y: 0.4 }, estado: 'pendente', motivo: '' },
    ],
    ['silencio', 'zoom'],
  )
  p = aprovar(p, ['k1', 'z1'])
  // o segundo pedaço da câmera vira "Gancho" em roxo
  return { ...p, linha: etiquetar(p.linha, p.linha.clipes[1].id, { cor: 'roxo', etiqueta: 'Gancho' }) }
}

function bemFormado(xml) {
  const dir = mkdtempSync(join(tmpdir(), 'aiedit-xml-'))
  try {
    writeFileSync(join(dir, 'x.xml'), xml)
    execFileSync('xmllint', ['--noout', join(dir, 'x.xml')], { stdio: 'pipe' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Validador do pedaço do JSON Schema que o contrato usa (type, const, enum, pattern, tamanhos, required, items). */
function validar(v, s, onde = '$') {
  const erros = []
  const tipo = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v
  if (s.type && !(s.type === tipo || (s.type === 'integer' && Number.isInteger(v)))) return [`${onde}: ${tipo} em vez de ${s.type}`]
  if ('const' in s && v !== s.const) erros.push(`${onde}: diferente de ${s.const}`)
  if (s.enum && !s.enum.includes(v)) erros.push(`${onde}: fora de ${s.enum}`)
  if (s.pattern && !new RegExp(s.pattern).test(v)) erros.push(`${onde}: não bate com o padrão`)
  if (s.minLength != null && v.length < s.minLength) erros.push(`${onde}: curto`)
  if (s.maxLength != null && v.length > s.maxLength) erros.push(`${onde}: longo`)
  if (s.maxItems != null && v.length > s.maxItems) erros.push(`${onde}: itens demais`)
  if (s.exclusiveMinimum != null && !(v > s.exclusiveMinimum)) erros.push(`${onde}: pequeno`)
  if (tipo === 'object' && s.properties) {
    for (const r of s.required || []) if (!(r in v)) erros.push(`${onde}.${r}: falta`)
    for (const [k, x] of Object.entries(v)) {
      if (s.properties[k]) erros.push(...validar(x, s.properties[k], `${onde}.${k}`))
      else if (s.additionalProperties === false) erros.push(`${onde}.${k}: não previsto`)
    }
  }
  if (tipo === 'array' && s.items) v.forEach((x, i) => erros.push(...validar(x, s.items, `${onde}[${i}]`)))
  return erros
}

test('segmentos quebram o clipe onde o zoom muda', () => {
  const p = projeto()
  const s = segmentos(p)
  // 0–3 s vira 0–1 (sem zoom), 1–2,5 (zoom), 2,5–3; depois 8–20 s; depois a trilha
  assert.deepEqual(
    s.map((x) => [x.midia, x.ini, x.fim, x.escala]),
    [
      ['a1b2c3', 0, 30, 1],
      ['a1b2c3', 30, 75, 1.25],
      ['a1b2c3', 75, 90, 1],
      ['a1b2c3', 240, 599, 1],
      ['d4e5f6', 0, 150, 1],
    ],
  )
  assert.deepEqual(
    s.map((x) => x.linha),
    [0, 30, 75, 90, 449],
  )
})

test('FCPXML: bem formado, tempos racionais, zoom em adjust-transform e caminho absoluto', () => {
  const x = paraFcpxml(projeto())
  bemFormado(x)
  assert.match(x, /<format id="r1" frameDuration="1001\/30000s" width="1920" height="1080"\/>/)
  assert.match(x, /<asset-clip ref="a1" offset="1001\/1000s" name="Câmera A\.mp4" start="1001\/1000s" duration="3003\/2000s" tcFormat="NDF">/)
  assert.match(x, /scale="1\.25 1\.25"/)
  assert.match(x, /src="file:\/\/\/Volumes\/Cart%C3%A3o\/C%C3%A2mera%20A\.mp4"/)
  assert.match(x, /src="trilha\.wav"/, 'sem caminho absoluto: relativo ao arquivo exportado')
  assert.match(x, /name="Aula &amp; teste &lt;1&gt;"/)
})

test('xmeml: bem formado, entrada e saída em quadros, som ligado e Basic Motion no zoom', () => {
  const x = paraXmeml(projeto())
  bemFormado(x)
  assert.match(x, /<timebase>30<\/timebase>\s*<ntsc>TRUE<\/ntsc>/)
  assert.match(x, /<start>30<\/start>\s*<end>75<\/end>\s*<in>30<\/in>\s*<out>75<\/out>/)
  assert.match(x, /<value>125<\/value>/)
  assert.match(x, /<pathurl>file:\/\/localhost\/Volumes\/Cart%C3%A3o\/C%C3%A2mera%20A\.mp4<\/pathurl>/)
  assert.match(x, /<linkclipref>clipitem-a2-1<\/linkclipref>/)
  assert.equal((x.match(/<clipitem /g) || []).length, 4 + 5 * 2)
  // cor como rótulo do Premiere (a mídia nasce com uma; o clipe etiquetado leva a dele) e etiqueta como comentário
  assert.match(x, /<label2>Violet<\/label2>/)
  assert.match(x, /<mastercomment1>Gancho<\/mastercomment1>/)
})

test('FCPXML e OTIO levam a etiqueta; EDL como comentário', () => {
  const p = projeto()
  assert.match(paraFcpxml(p), /<keyword start="\d+\/\d+s" duration="\d+\/\d+s" value="Gancho"\/>/)
  bemFormado(paraFcpxml(p))
  const o = JSON.parse(paraOtio(p))
  assert.ok(o.tracks.children[0].children.some((c) => c.metadata.zro.etiqueta === 'Gancho' && c.metadata.zro.cor === 'roxo'))
  assert.match(paraEdl(p), /\* ETIQUETA: Gancho/)
})

test('EDL: timecodes de origem e de gravação, zoom como comentário', () => {
  const e = paraEdl(projeto())
  const ev = e.split('\r\n').filter((l) => /^\d{3} /.test(l))
  assert.equal(ev.length, 5)
  assert.match(ev[1], /^002 {2}CAMERAA {2}AA\/V {2}C {8}00:00:01:00 00:00:02:15 00:00:01:00 00:00:02:15$/)
  assert.match(e, /\* ZOOM: 125%/)
  assert.match(e, /FROM CLIP NAME: Camera A\.mp4/)
})

test('OTIO: JSON com trilhas de vídeo e áudio e zoom em metadata', () => {
  const o = JSON.parse(paraOtio(projeto()))
  assert.equal(o.OTIO_SCHEMA, 'Timeline.1')
  const [v, a] = o.tracks.children
  // as duas trilhas do mesmo tamanho: o áudio solto (trilha.wav) entra como Gap no vídeo, no mesmo lugar
  assert.equal(v.children.length, 5)
  assert.equal(a.children.length, 5)
  assert.equal(v.children[4].OTIO_SCHEMA, 'Gap.1')
  const soma = (t) => t.children.reduce((s, c) => s + c.source_range.duration.value, 0)
  assert.equal(soma(v), soma(a))
  assert.deepEqual(v.children[1].metadata.zro.zoom, { escala: 1.25, foco: { x: 0.5, y: 0.4 } })
  assert.equal(v.children[0].source_range.duration.value, 30)
})

test('pacote: um arquivo por editor, legenda e ZroTimelineRef válido pelo contrato', () => {
  const agora = new Date('2026-10-26T12:00:00Z')
  const arquivos = pacote(projeto(), PRESET.legenda, agora)
  assert.deepEqual(
    arquivos.map((a) => a.name),
    ['Aula & teste -1-.fcpxml', 'Aula & teste -1-.xml', 'Aula & teste -1-.otio', 'Aula & teste -1-.edl', 'Aula & teste -1-.srt', 'Aula & teste -1-.vtt', 'zro-timeline-ref.json'],
  )
  const refs = JSON.parse(arquivos.at(-1).data)
  assert.equal(refs.length, 4)
  for (const r of refs) {
    assert.deepEqual(validar(r, SCHEMA), [])
    assert.ok(!r.file.startsWith('/') && !r.relink.some((x) => x.media_path.includes('/')), 'caminhos relativos')
  }
  assert.match(arquivos.find((a) => a.name.endsWith('.srt')).data, /Bom dia!/)
  assert.deepEqual(validar(referencia(projeto(), 'edl', 'x.edl', agora), SCHEMA), [])
  // o zip junta tudo
  const z = zip(arquivos)
  assert.equal(z[0], 0x50)
  assert.equal(z[1], 0x4b)
})

test('URLs de arquivo para Mac, Windows e rede', () => {
  assert.equal(fileUrl('C:\\Vídeos\\a b.mov'), 'file:///C:/V%C3%ADdeos/a%20b.mov')
  assert.equal(pathUrl('C:\\Vídeos\\a b.mov'), 'file://localhost/C%3a/V%C3%ADdeos/a%20b.mov')
  assert.equal(fileUrl('/Users/eu/a.mp4'), 'file:///Users/eu/a.mp4')
  assert.equal(pathUrl('/Users/eu/a.mp4'), 'file://localhost/Users/eu/a.mp4')
})
