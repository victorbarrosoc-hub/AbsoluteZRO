// O núcleo do navegador do Drive mora em packages/drive-web (raiz do monorepo) e é o mesmo do Maestro. O app do
// celular não tem build, então guarda uma cópia idêntica em web/public/app/lib (format.js e drive-nucleo.js): este teste
// confere que as duas são iguais e que o browse.js do app usa o núcleo (listPage com o 400 contornado, tipos e ordens).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const raiz = (rel) => new URL(`../../../packages/drive-web/src/${rel}`, import.meta.url)
const app = (rel) => new URL(`../web/public/app/lib/${rel}`, import.meta.url)
const temPacote = fs.existsSync(raiz('nucleo.js'))

describe('packages/drive-web no app do celular', () => {
  test('format.js e drive-nucleo.js são cópias idênticas do pacote', { skip: !temPacote && 'fora do monorepo' }, () => {
    assert.equal(fs.readFileSync(app('format.js'), 'utf8'), fs.readFileSync(raiz('format.js'), 'utf8'))
    assert.equal(fs.readFileSync(app('drive-nucleo.js'), 'utf8'), fs.readFileSync(raiz('nucleo.js'), 'utf8'))
  })

  test('browse.js reexporta o núcleo e lista pelo listador dele', () => {
    const src = fs.readFileSync(app('browse.js'), 'utf8')
    assert.match(src, /export \* from '\.\/drive-nucleo\.js'/)
    assert.match(src, /criarListador\(driveCall\)/)
  })

  test('o listador contorna o 400 do filtro por tipo e da ordem, uma vez', async () => {
    const { criarListador, kindOf, categoryOf, sortLocal } = await import(app('drive-nucleo.js'))
    const pedidos = []
    let recusas = 2
    const driveCall = async (caminho, { query }) => {
      pedidos.push({ caminho, ...query })
      if (recusas-- > 0) throw Object.assign(new Error('400'), { status: 400 })
      return { files: [{ id: 'b', name: 'b.mov', mimeType: 'video/quicktime' }, { id: 'a', name: 'A', mimeType: 'application/vnd.google-apps.folder' }], nextPageToken: 'p2' }
    }
    const l = criarListador(driveCall)
    const r = await l.listPage({ scope: 'mine', folder: null }, { filter: 'video' })
    assert.equal(r.next, 'p2')
    assert.equal(pedidos.length, 3)
    assert.match(pedidos[0].q, /mimeType contains 'video\/'/)
    assert.doesNotMatch(pedidos[1].q, /mimeType contains/)
    assert.equal(pedidos[2].orderBy, undefined)
    assert.deepEqual(r.files.map((f) => f.id), ['a', 'b'], 'sem ordem do Drive: pastas antes, ordenado aqui')
    assert.equal(kindOf({ name: 'A001.braw', mimeType: 'application/octet-stream' }), 'video')
    assert.equal(categoryOf({ name: 'x.pdf', mimeType: 'application/pdf' }), 'other')
    assert.equal(sortLocal([{ name: 'b' }, { name: 'a' }], 'name', false)[0].name, 'a')
  })
})
