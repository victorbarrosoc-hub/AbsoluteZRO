// Menu do item da aba Drive igual ao do Google Drive (titular, 09/11/2026), parte do app de computador: os textos do
// "Copiar link", a escolha lembrada nunca inventa "público", o selo vem das permissionIds e o "liberar" só sai da
// escolha. A parte do celular (e a comparação dos textos nos dois apps) vem com o app do celular, no lote do site.
// As rotas do motor ficam em test/compartilhar.test.js (restringir e estrela).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as pc from '../public/lib/compartilhar.js'
import { ehPublico as ehPublicoMotor, PUBLICO_IDS } from '../src/google/drive.js'

test('os textos do Copiar link no computador', () => {
  assert.equal(pc.LINK_PUBLICO, 'Qualquer pessoa com o link pode ver')
  assert.equal(pc.SELO_PUBLICO, 'Público (link)')
})

test('a escolha lembrada só vale "publico" ou "copiar": qualquer outra coisa pergunta de novo', () => {
  const f = pc.padraoDoLink
  assert.equal(f('publico'), 'publico')
  assert.equal(f('copiar'), 'copiar')
  for (const v of [null, undefined, '', 'sim', true, 'PUBLICO', { publico: true }]) assert.equal(f(v), null)
  assert.equal(pc.textoPublico(true), 'Copiado. Qualquer pessoa com o link pode ver.')
})

test('selo "Público (link)": anyoneWithLink ou anyone nas permissionIds', () => {
  assert.deepEqual([...PUBLICO_IDS].sort(), ['anyone', 'anyoneWithLink'])
  for (const [ids, esperado] of [
    [['12345', 'anyoneWithLink'], true],
    [['anyone'], true],
    [['12345', 'domain:exemplo.com'], false],
    [[], false],
  ]) assert.equal(ehPublicoMotor(ids), esperado)
  assert.equal(ehPublicoMotor(undefined), false)
})

test('o computador não torna público sem a escolha: o "liberar" só sai da escolha ou do Compartilhar', () => {
  const comp = fs.readFileSync(new URL('../public/components/compartilhar.js', import.meta.url), 'utf8')
  assert.match(comp, /if \(!modo\) \{\s*const r = await openModal\('escolher-link'/, 'sem escolha guardada, o computador pergunta')
  const link = fs.readFileSync(new URL('../public/components/link-share.js', import.meta.url), 'utf8')
  assert.equal((link.match(/\/link\/liberar`/g) || []).length, 2, 'liberar: o clique público e a confirmação do cartão')
})
