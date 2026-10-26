// A família Absolute ZRO no menu lateral (computador) e em Ajustes (celular): cada app com o ícone que existe na pasta
// do próprio SOBEDESCE (cada app publica sozinho), sem o SOBEDESCE na lista, e links que abrem fora do app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const APPS = ['Absolute ZRO', 'Revela', 'Synquei', 'Nossom', 'TPEasy', 'Carro do Freela']

function familia(src) {
  const bloco = src.slice(src.indexOf('const FAMILIA = ['), src.indexOf(']', src.indexOf('const FAMILIA = [')))
  return [...bloco.matchAll(/href: '([^']+)', nome: '([^']+)', img: '([^']+)'/g)].map(([, href, nome, img]) => ({ href, nome, img }))
}

test('computador: a barra lateral lista a família com ícones de public/ e abre pelo navegador do sistema', () => {
  const src = ler('../public/components/sidebar.js')
  const itens = familia(src)
  assert.deepEqual(itens.map((f) => f.nome), APPS)
  for (const f of itens) {
    assert.match(f.href, /^https:\/\//)
    assert.ok(fs.existsSync(new URL(`../public${f.img}`, import.meta.url)), f.img)
  }
  assert.match(src, /openExternal\(f\.href\)/)
  assert.match(src, /e\.preventDefault\(\)/)
})

test('celular: Ajustes lista a família com ícones de icons/familia/, guardados pelo service worker', () => {
  const itens = familia(ler('../web/public/app/components/settings.js'))
  const sw = ler('../web/public/app/sw.js')
  assert.deepEqual(itens.map((f) => f.nome), APPS)
  for (const f of itens) {
    assert.match(f.href, /^https:\/\//)
    assert.ok(fs.existsSync(new URL(`../web/public/app/${f.img}`, import.meta.url)), f.img)
    assert.ok(sw.includes(`'./${f.img}'`), `${f.img} no cache`)
  }
})
