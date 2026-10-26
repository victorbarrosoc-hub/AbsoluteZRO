// "Abrir no Synquei" (src/backup/synquei.js): o tipo de projeto vai no descargas.jsonl e no link synquei://organizar,
// que só sai depois de um cartão conferido. Os tipos batem com os do Synquei (products/synquei/app/js/tipos.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TIPOS_SYNQUEI, linkSynquei, tipoSynquei } from '../src/backup/synquei.js'
import { BackupService, RESUMO_ARQUIVO, RESUMO_PASTA } from '../src/backup/servico.js'

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p))
const tiposDoSynquei = new URL('../../synquei/app/js/tipos.js', import.meta.url)

test('os tipos são os mesmos do Synquei (id e nome)', { skip: !fs.existsSync(tiposDoSynquei) && 'Synquei fora do monorepo' }, async () => {
  const { TIPOS } = await import(tiposDoSynquei.href)
  assert.deepEqual(TIPOS_SYNQUEI, TIPOS.map((t) => ({ id: t.id, label: t.label })))
})

test('link: pasta absoluta e tipo conhecido; o resto fica de fora', () => {
  const pasta = path.resolve('/Volumes/HD/Casamento Ana')
  const u = new URL(linkSynquei(pasta, 'casamento'))
  assert.equal(u.protocol, 'synquei:')
  assert.equal(u.hostname, 'organizar')
  assert.equal(u.searchParams.get('pasta'), pasta)
  assert.equal(u.searchParams.get('tipo'), 'casamento')
  assert.equal(new URL(linkSynquei(pasta, 'inventado')).searchParams.get('tipo'), null)
  assert.throws(() => linkSynquei('relativa/pasta'), /inválida/)
  assert.equal(tipoSynquei('toString'), null)
})

test('projeto com tipo: vai no resumo do cartão e no link; sem cartão conferido, não há o que abrir', async () => {
  const discos = []
  const svc = new BackupService({ arquivo: path.join(tmp('sobedesce-sq-'), 'backup.json'), listar: async () => discos.map((d) => ({ ...d })), vigiaMs: 0, keepAwake: { setActive() {} }, avisar() {}, ejetar: async () => true })
  await svc.init()
  const hd = tmp('sobedesce-sq-hd-')
  await svc.criarProjeto({ nome: 'Casamento Ana', destinos: [hd], tipo: 'casamento' })
  assert.equal(svc.view().projeto.tipo, 'casamento')
  assert.ok(svc.view().tiposSynquei.length > 10)
  await assert.rejects(svc.paraSynquei(), /Nenhum cartão/)

  const card = tmp('sobedesce-sq-card-')
  fs.mkdirSync(path.join(card, 'DCIM'))
  fs.writeFileSync(path.join(card, 'DCIM', 'C0001.MP4'), Buffer.alloc(2048, 1))
  discos.push({ caminho: card, nome: 'SD', id: 'uuid:SQ-1', capacidade: 64e9 })
  await svc.varrer()
  await svc.responder({ caminho: card, nome: 'Ana', camera: 'A7S' })
  const t0 = Date.now()
  while ((svc.rodando || svc.fila.length) && Date.now() - t0 < 15_000) await new Promise((ok) => setTimeout(ok, 20))
  assert.equal(svc.view().ultimo.resultado, 'ok')

  const linha = JSON.parse(fs.readFileSync(path.join(hd, 'Casamento Ana', RESUMO_PASTA, RESUMO_ARQUIVO), 'utf8').trim())
  assert.equal(linha.tipo, 'casamento')
  const r = await svc.paraSynquei()
  assert.equal(r.pasta, path.join(hd, 'Casamento Ana'))
  assert.equal(new URL(r.link).searchParams.get('tipo'), 'casamento')

  await svc.editarProjeto(svc.view().atual, { tipo: '' })
  assert.equal(svc.view().projeto.tipo, null)
  assert.equal(new URL((await svc.paraSynquei()).link).searchParams.get('tipo'), null)
  await svc.close()
})
