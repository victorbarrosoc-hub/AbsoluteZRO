// A família Absolute ZRO no menu lateral (computador) e em Ajustes (celular): cada app com o ícone que existe na pasta
// do próprio SOBEDESCE (cada app publica sozinho), sem o SOBEDESCE na lista, e links que abrem fora do app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
// Só as plataformas abertas (28/10/2026): NOSSOM, AEON, Revela, Carro do Freela e Maestro estão fechados e não aparecem.
const APPS = ['Absolute ZRO', 'Synquei', 'TPEasy']
const FECHADOS = /nossom|aeon|ai-edit|revela|finishing|carro|maestro/i

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
  for (const f of itens) assert.doesNotMatch(`${f.href} ${f.nome}`, FECHADOS)
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
    assert.doesNotMatch(`${f.href} ${f.nome}`, FECHADOS)
  }
  assert.doesNotMatch(sw, /icons\/familia\/(nossom|revela|carro)/)
})

test('entrar só com a conta Absolute ZRO: nada de "Entrar com Google" no app do computador nem no do celular', () => {
  const telas = [
    '../public/components/cloud.js',
    '../public/components/setup.js',
    '../public/components/z.js',
    '../web/public/app/components/account.js',
    '../web/public/app/components/z.js',
  ].map(ler)
  for (const src of telas) assert.doesNotMatch(src, /(entrar|continuar|login) com (o )?google|conta antiga com google/i)
  assert.match(telas[0], /Entrar com a conta Absolute ZRO/)
  assert.match(telas[3], /Entre com a sua conta Absolute ZRO/)
})
