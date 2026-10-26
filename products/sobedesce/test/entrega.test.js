// Entrega conferida (src/engine/entrega.js): o comprovante sobedesce.entrega/1 de um lote de envio de uma pasta. O leitor
// do outro lado é packages/integrations/src/sobedesce.ts (parseEntrega), testado com um comprovante gerado por este código.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comprovanteDeEntrega, pastaDoLote } from '../src/engine/entrega.js'

const MD5 = 'd41d8cd98f00b204e9800998ecf8427e'
const rec = (relPath, o = {}) => ({ type: 'upload', status: 'completed', relPath, size: 10, target: { relDir: relPath.split('/').slice(0, -1).join('/'), parentId: 'pastaId123', fileId: 'arq' + relPath.length }, verify: { state: 'ok', actual: MD5 }, ...o })

test('comprovante: arquivos dentro da pasta, MD5 e link da pasta pelo id; pulado igual no Drive entra', () => {
  const e = comprovanteDeEntrega({ records: [rec('Entrega/b.mp4'), rec('Entrega/Legendas/a.srt', { status: 'skipped' })], pastaId: 'pastaId123', id: 'ent-b1', agora: new Date('2026-10-26T00:00:00Z') })
  assert.equal(e.formato, 'sobedesce.entrega/1')
  assert.equal(e.pasta, 'Entrega')
  assert.equal(e.drive.link, 'https://drive.google.com/drive/folders/pastaId123')
  assert.deepEqual(e.arquivos.map((a) => a.rel), ['b.mp4', 'Legendas/a.srt'].sort((a, b) => a.localeCompare(b)))
  assert.ok(e.arquivos.every((a) => a.md5 === MD5 && a.fileId))
  assert.equal(e.origem, null)
})

test('sem MD5 conferido em todos, ainda subindo ou sem a pasta: não sai comprovante', () => {
  assert.throws(() => comprovanteDeEntrega({ records: [rec('E/a.mp4'), rec('E/b.mp4', { verify: { state: 'skipped' } })], pastaId: 'pastaId123', id: 'x' }), /1 arquivo ainda não foi conferido/)
  assert.throws(() => comprovanteDeEntrega({ records: [rec('E/a.mp4', { status: 'running' })], pastaId: 'pastaId123', id: 'x' }), /conferido/)
  assert.throws(() => comprovanteDeEntrega({ records: [rec('E/a.mp4')], pastaId: null, id: 'x' }), /pasta no Drive/)
})

test('só um envio de uma pasta: arquivos soltos ou de duas pastas ficam de fora', () => {
  assert.equal(pastaDoLote([rec('E/a.mp4'), rec('E/x/b.mp4')]), 'E')
  assert.equal(pastaDoLote([rec('a.mp4')]), null)
  assert.equal(pastaDoLote([rec('E/a.mp4'), rec('F/b.mp4')]), null)
  assert.equal(pastaDoLote([]), null)
})
