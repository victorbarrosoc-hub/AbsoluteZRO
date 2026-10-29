// A família Absolute ZRO vista da Revela: o Maestro entra no lançamento em Beta grátis, atrás de uma chave só
// (MAESTRO_NA_FAMILIA no menu e o bloco maestro-familia nas páginas, virados juntos por scripts/lancamento-maestro.mjs
// na raiz), com o ícone dele em marca/familia.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const ler = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

/** true = aberto, false = comentado; exige um bloco só. */
function bloco(html) {
  const aberto = /<!--maestro-familia-->([\s\S]*?)<!--\/maestro-familia-->/.exec(html)
  const fechado = /<!--maestro-familia ([\s\S]*?) maestro-familia-->/.exec(html)
  assert.ok(!!aberto !== !!fechado, 'um bloco só do Maestro')
  const m = aberto ?? fechado
  assert.match(m[1], /src="marca\/familia\/maestro\.svg"/)
  return !!aberto
}

test('Maestro: chave no menu, blocos na página inicial e no entrar, tudo no mesmo estado', () => {
  const menu = ler('../app/menu.js')
  const chave = /^const MAESTRO_NA_FAMILIA = (true|false)$/m.exec(menu)
  assert.ok(chave)
  assert.match(
    menu,
    /if \(MAESTRO_NA_FAMILIA\) FAMILIA\.splice\(3, 0, \{ href: 'https:\/\/maestro\.absolutezro\.com', nome: 'Maestro', img: 'marca\/familia\/maestro\.svg' \}\)/,
  )
  const aberto = chave[1] === 'true'
  assert.equal(bloco(ler('../index.html')), aberto)
  assert.equal(bloco(ler('../entrar.html')), aberto)
  assert.ok(existsSync(new URL('../marca/familia/maestro.svg', import.meta.url)))
})
