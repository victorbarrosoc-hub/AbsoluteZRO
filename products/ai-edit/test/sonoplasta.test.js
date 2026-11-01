// Sonoplasta: o português vira termo do banco (pelo preset), a sugestão de cada momento e o som buscado como som do
// projeto, com a origem completa para os créditos.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { filtrarZro, idDoSomBuscado, pastaDoLink, somDoBanco, sugestaoDoMomento, termoDeBusca, versaoZro } from '../src/sonoplasta.js'

const PRESET = JSON.parse(readFileSync(new URL('../presets/sonoplasta.v1.json', import.meta.url), 'utf8'))

test('preset da Sonoplasta: versão 1, volume, momentos e sugestões', () => {
  assert.equal(PRESET.preset, 'sonoplasta')
  assert.equal(PRESET.version, 1)
  assert.ok(PRESET.volume_db < 0)
  for (const m of ['corte', 'marcador']) assert.ok(PRESET.momentos[m].busca && PRESET.momentos[m].por_que)
  assert.ok(PRESET.sugestoes.length >= 4)
})

test('termo de busca: troca as palavras que o preset conhece, sem ligar para acento, a expressão mais longa primeiro', () => {
  assert.equal(termoDeBusca('Impacto', PRESET), 'impact')
  assert.equal(termoDeBusca('explosao   grande', PRESET), 'explosion grande')
  assert.equal(termoDeBusca('máquina de escrever', PRESET), 'typewriter')
  assert.equal(termoDeBusca('whoosh', PRESET), 'whoosh')
  assert.equal(termoDeBusca('x'.repeat(200), PRESET).length, 80)
})

test('sugestão por momento: corte pede whoosh, marcador pede impacto; momento desconhecido não sugere', () => {
  assert.equal(sugestaoDoMomento({ tipo: 'corte' }, PRESET).busca, 'whoosh')
  assert.equal(sugestaoDoMomento({ tipo: 'marcador' }, PRESET).busca, 'impact')
  assert.equal(sugestaoDoMomento({ tipo: 'outro' }, PRESET), null)
})

test('som buscado vira som do projeto com id estável, nome com extensão e origem para os créditos', () => {
  const s = { id: 'eab8a6e2-0ac8-4615-9e0d-ebde30523783', origem: 'openverse', titulo: 'Deep: Whoosh/1', autor: 'Kinoton', licenca: 'CC0 1.0', licencaUrl: 'https://cc/0', pagina: 'https://freesound.org/s/1', fonte: 'Freesound', formato: 'MP3' }
  const som = somDoBanco(s, { duracao: 1.2, taxa: 44100, canais: 1 })
  assert.equal(som.id, idDoSomBuscado(s))
  assert.equal(som.id, 'openverse:eab8a6e2-0ac8-4615-9e0d-ebde30523783')
  assert.equal(som.nome, 'Deep- Whoosh-1.mp3')
  assert.deepEqual(som.origem, { tipo: 'openverse', id: s.id, titulo: 'Deep: Whoosh/1', autor: 'Kinoton', licenca: 'CC0 1.0', licencaUrl: 'https://cc/0', url: 'https://freesound.org/s/1', fonte: 'Freesound' })
  assert.equal(somDoBanco({ ...s, formato: '../x' }, {}).nome.endsWith('.mp3'), true)
})

test('banco no Drive: som da pasta da pessoa sem licença nem crédito, com a conta para descer de novo', () => {
  const s = { id: '1WhooshDoBancoXyz', origem: 'banco', titulo: 'Whoosh grave', nome: 'Whoosh grave.wav', formato: 'wav', bytes: 9, conta: 'c1' }
  const som = somDoBanco(s, { duracao: 1, taxa: 48000, canais: 2 })
  assert.equal(som.id, 'banco:1WhooshDoBancoXyz')
  assert.equal(som.nome, 'Whoosh grave.wav')
  assert.deepEqual(som.origem, { tipo: 'banco', id: '1WhooshDoBancoXyz', titulo: 'Whoosh grave', fonte: 'Meu banco no Drive', conta: 'c1' })
})

test('link da pasta do banco: Drive, link antigo, SOBEDESCE ou o id; o resto não', () => {
  const ID = '1AbCdEfGhIjKlMnOp_-'
  for (const t of [
    ID,
    `https://drive.google.com/drive/folders/${ID}`,
    `https://drive.google.com/drive/u/0/folders/${ID}?usp=sharing`,
    `https://drive.google.com/open?id=${ID}`,
    `https://sobedesce.absolutezro.com/app/#drive/${ID}`,
    `  https://drive.google.com/drive/folders/${ID}/  `,
  ])
    assert.equal(pastaDoLink(t), ID, t)
  for (const t of ['', 'curto', `http://drive.google.com/drive/folders/${ID}`, `https://evil.com/drive/folders/${ID}`, `https://drive.google.com/file/d/${ID}/view`, `https://x.com/app/#arquivo/${ID}`])
    assert.equal(pastaDoLink(t), null, t)
})

test('sons da Absolute ZRO: categoria, busca em português ou no termo do preset, e a versão escolhida', () => {
  const v = (id, versao, melhor = false) => ({ id, versao, duracao: 1, bytes: 4, formato: 'mp3', melhor })
  const catalogo = {
    sons: [
      { id: 'whoosh-rapido-de-ar', origem: 'zro', titulo: 'Whoosh rápido de ar', categoria: 'Whooshes e Transições', versoes: [v('whoosh-rapido-de-ar-v1', 1, true)] },
      { id: 'impacto-metalico', origem: 'zro', titulo: 'Impacto metálico', categoria: 'Impactos', versoes: [v('impacto-metalico-v3', 3, true), v('impacto-metalico-v1', 1)] },
      { id: 'boom-grave', origem: 'zro', titulo: 'Boom grave', categoria: 'Impactos', versoes: [v('boom-grave-v2', 2, true)] },
    ],
  }
  const ids = (r) => r.map((s) => s.id)
  assert.deepEqual(ids(filtrarZro(catalogo, {}, PRESET)), ['whoosh-rapido-de-ar', 'impacto-metalico', 'boom-grave'])
  assert.deepEqual(ids(filtrarZro(catalogo, { categoria: 'Impactos' }, PRESET)), ['impacto-metalico', 'boom-grave'])
  // sem acento, todas as palavras, no nome ou na categoria
  assert.deepEqual(ids(filtrarZro(catalogo, { q: 'METALICO' }, PRESET)), ['impacto-metalico'])
  assert.deepEqual(ids(filtrarZro(catalogo, { q: 'impactos grave' }, PRESET)), ['boom-grave'])
  // "transição" vira "whoosh" pelo preset
  assert.deepEqual(ids(filtrarZro(catalogo, { q: 'transição' }, PRESET)), ['whoosh-rapido-de-ar'])
  assert.deepEqual(filtrarZro(null, { q: 'x' }, PRESET), [])

  const som = catalogo.sons[1]
  assert.deepEqual(versaoZro(som, 'impacto-metalico-v1'), { id: 'impacto-metalico-v1', origem: 'zro', titulo: 'Impacto metálico 1', formato: 'mp3', duracao: 1, bytes: 4 })
  assert.equal(versaoZro(som, 'nao-existe').id, 'impacto-metalico-v3')
  assert.equal(versaoZro(catalogo.sons[0]).titulo, 'Whoosh rápido de ar')
  // vira som do projeto sem licença nem crédito
  const r = somDoBanco(versaoZro(som, 'impacto-metalico-v1'), { duracao: 1, taxa: 48000, canais: 2 })
  assert.equal(r.id, 'zro:impacto-metalico-v1')
  assert.equal(r.nome, 'Impacto metálico 1.mp3')
  assert.deepEqual(r.origem, { tipo: 'zro', id: 'impacto-metalico-v1', titulo: 'Impacto metálico 1', fonte: 'Absolute ZRO' })
})
