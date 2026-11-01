// A família Absolute ZRO no menu lateral (computador) e em Ajustes (celular): cada app com o ícone que existe na pasta
// do próprio SOBEDESCE (cada app publica sozinho), sem o SOBEDESCE na lista, e links que abrem fora do app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
// Só as plataformas abertas (28/10/2026): NOSSOM, AEON e Revela estão fechados e não aparecem. O Maestro entra no
// lançamento em Beta grátis, atrás de MAESTRO_NA_FAMILIA (docs/operations/lancamento-maestro.md). O Relay está no ar
// desde a migration 0032 (30/10/2026) e o Carro do Freela desde a 0041 (entrou aqui na revisão de 01/11/2026).
const APPS = ['Absolute ZRO', 'Carro do Freela', 'Relay', 'Synquei', 'TPeasy']
const FECHADOS = /nossom|aeon|ai-edit|revela|finishing|maestro/i

/** O Maestro fora da lista fixa: chave única e a linha que o põe depois da Absolute ZRO e do Carro (ordem alfabética), com o ícone dele. */
function maestro(src) {
  const chave = /^const MAESTRO_NA_FAMILIA = (true|false)$/m.exec(src)
  assert.ok(chave, 'MAESTRO_NA_FAMILIA')
  const m = /if \(MAESTRO_NA_FAMILIA\) FAMILIA\.splice\(2, 0, \{ href: '([^']+)', nome: '([^']+)', img: '([^']+)' \}\)/.exec(src)
  assert.ok(m, 'FAMILIA.splice do Maestro')
  return { aberto: chave[1] === 'true', href: m[1], nome: m[2], img: m[3] }
}

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
  const m = maestro(src)
  assert.deepEqual([m.href, m.nome, m.img], ['https://maestro.absolutezro.com', 'Maestro', '/familia/maestro.svg'])
  assert.ok(fs.existsSync(new URL(`../public${m.img}`, import.meta.url)), m.img)
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
  assert.doesNotMatch(sw, /icons\/familia\/(nossom|revela|aeon)/)
  const m = maestro(ler('../web/public/app/components/settings.js'))
  assert.deepEqual([m.href, m.nome, m.img], ['https://maestro.absolutezro.com', 'Maestro', 'icons/familia/maestro.svg'])
  assert.ok(fs.existsSync(new URL(`../web/public/app/${m.img}`, import.meta.url)), m.img)
  assert.ok(sw.includes(`'./${m.img}'`), 'ícone do Maestro no cache')
})

test('Maestro: a mesma chave no computador e no celular (vira junto no lançamento)', () => {
  const a = maestro(ler('../public/components/sidebar.js'))
  const b = maestro(ler('../web/public/app/components/settings.js'))
  assert.equal(a.aberto, b.aberto)
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
