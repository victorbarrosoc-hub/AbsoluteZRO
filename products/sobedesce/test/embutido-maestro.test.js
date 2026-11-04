// O contrato do modo embutido com o Maestro, versão 2 (web/public/app/lib/embutido.js; do lado do Maestro,
// products/maestro/src/lib/sobedesce/embutido.ts): a pasta da entrega vem do endereço (só no modo `enviar` do Maestro,
// id do Drive conferido) e cada arquivo terminado nela vira o recado `enviado` com a conferência honesta (ok só com o
// MD5 batendo). O `pronto` leva a versão e os recursos: o Maestro esconde o botão quando eles não vêm.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { pastaDoEndereco, recadoDoEnvio, VERSAO_EMBUTIDO } from '../web/public/app/lib/embutido.js'

const p = (q) => new URLSearchParams(q)

test('a pasta da entrega: só no modo enviar do Maestro e com id do Drive', () => {
  assert.deepEqual(pastaDoEndereco(p('no=maestro&modo=enviar&pasta=1AbCdEfGh_ij-KL&nome=05%20Entregas')), {
    id: '1AbCdEfGh_ij-KL',
    name: '05 Entregas',
    driveId: null,
    path: [{ id: '1AbCdEfGh_ij-KL', name: '05 Entregas' }],
  })
  assert.equal(pastaDoEndereco(p('no=maestro&modo=enviar&pasta=1AbCdEfGh')).name, 'Entrega', 'sem nome, o padrão')
  assert.equal(pastaDoEndereco(p('no=maestro&modo=enviar&pasta=1AbCdEfGh&nome=%0Ax%09y')).name, 'x y', 'sem controle')
  assert.equal(pastaDoEndereco(p('no=carro&modo=enviar&pasta=1AbCdEfGh')), null, 'só o Maestro')
  assert.equal(pastaDoEndereco(p('no=maestro&pasta=1AbCdEfGh')), null, 'só no modo enviar')
  assert.equal(pastaDoEndereco(p('no=maestro&modo=enviar&pasta=../../x')), null)
  assert.equal(pastaDoEndereco(p('no=maestro&modo=enviar')), null)
})

test('o recado enviado: só arquivo terminado na pasta, com a conferência decidida', () => {
  const base = { id: 7, status: 'done', fileId: 'arq123', name: 'Final.mov', size: 1234, type: 'video/quicktime', folder: { id: 'pastaX' } }
  assert.deepEqual(recadoDoEnvio({ ...base, verify: { state: 'ok' } }, 'pastaX'), {
    arquivo: { id: 'arq123', nome: 'Final.mov', tamanho: 1234, mime: 'video/quicktime', pasta: 'pastaX', conferencia: 'ok' },
  })
  assert.equal(recadoDoEnvio({ ...base, verify: { state: 'mismatch' } }, 'pastaX').arquivo.conferencia, 'diferente')
  for (const s of ['big', 'unchecked']) assert.equal(recadoDoEnvio({ ...base, verify: { state: s } }, 'pastaX').arquivo.conferencia, 'sem')
  // ainda conferindo, sem conferência começada, outra pasta, sem id ou não terminado: nada a dizer
  for (const v of [null, { state: 'pending' }, { state: 'running' }]) assert.equal(recadoDoEnvio({ ...base, verify: v }, 'pastaX'), null)
  assert.equal(recadoDoEnvio({ ...base, verify: { state: 'ok' } }, 'outra'), null)
  assert.equal(recadoDoEnvio({ ...base, fileId: null, verify: { state: 'ok' } }, 'pastaX'), null)
  assert.equal(recadoDoEnvio({ ...base, status: 'skipped', verify: { state: 'ok' } }, 'pastaX'), null)
})

test('o pronto leva a versão e os recursos (o Maestro confere antes de mostrar o envio)', () => {
  assert.equal(VERSAO_EMBUTIDO, 2)
  const fonte = fs.readFileSync(new URL('../web/public/app/lib/embutido.js', import.meta.url), 'utf8')
  assert.match(fonte, /maestro: \['enviar'\]/)
  assert.match(fonte, /avisarAnfitriao\('pronto', \{ versao: VERSAO_EMBUTIDO, recursos: RECURSOS_DO_ANFITRIAO \}\)/)
  // a sonda não abre o app (nem conta, nem service worker)
  const app = fs.readFileSync(new URL('../web/public/app/app.js', import.meta.url), 'utf8')
  assert.match(app, /if \(!LAN && !SONDA\) \{\n  auth\.boot\(\)/)
  assert.match(app, /if \(!SONDA\) render\(/)
})
