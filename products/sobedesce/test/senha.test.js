// Olho do campo de senha no computador (public/lib/senha.js e public/components/senha.js): alterna o type sem perder
// o cursor, rótulo certo, botão que nunca envia o form, e nenhum campo de senha da interface sem o olho.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MOSTRAR, OCULTAR, rotuloOlho, trocarVisibilidade } from '../public/lib/senha.js'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function campoFalso({ inicio = 3, fim = 5 } = {}) {
  const chamadas = []
  const campo = {
    type: 'password',
    selectionStart: inicio,
    selectionEnd: fim,
    setSelectionRange(a, b) {
      chamadas.push([this.type, a, b])
    },
  }
  return { campo, chamadas }
}

test('rótulos do olho', () => {
  assert.equal(rotuloOlho(false), MOSTRAR)
  assert.equal(rotuloOlho(true), OCULTAR)
  assert.equal(MOSTRAR, 'Mostrar senha')
  assert.equal(OCULTAR, 'Ocultar senha')
  assert.equal(rotuloOlho(false, 'chave'), 'Mostrar chave')
  assert.equal(rotuloOlho(true, 'chave'), 'Ocultar chave')
})

test('mostra e esconde mantendo o cursor quando o campo está com foco', () => {
  const { campo, chamadas } = campoFalso()
  trocarVisibilidade(campo, true, campo)
  assert.equal(campo.type, 'text')
  trocarVisibilidade(campo, false, campo)
  assert.equal(campo.type, 'password')
  assert.deepEqual(chamadas, [
    ['text', 3, 5],
    ['password', 3, 5],
  ])
})

test('sem foco no campo, só troca o type; sem campo, não quebra', () => {
  const { campo, chamadas } = campoFalso()
  trocarVisibilidade(campo, true, {})
  assert.equal(campo.type, 'text')
  assert.deepEqual(chamadas, [])
  assert.doesNotThrow(() => trocarVisibilidade(null, true))
})

test('componente: botão comum com aria-pressed, e nenhum campo de senha solto na interface', () => {
  const comp = fs.readFileSync(path.join(raiz, 'public/components/senha.js'), 'utf8')
  assert.match(comp, /<button\s+type="button"/)
  assert.match(comp, /aria-pressed=/)
  assert.match(comp, /aria-label=\$\{rotulo\}/)
  assert.match(comp, /onMouseDown=\$\{\(e\) => e\.preventDefault\(\)\}/)

  const soltos = []
  const varrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) varrer(p)
      else if (/\.(js|html)$/.test(e.name) && p !== path.join(raiz, 'public/components/senha.js') && /type="password"/.test(fs.readFileSync(p, 'utf8'))) soltos.push(path.relative(raiz, p))
    }
  }
  varrer(path.join(raiz, 'public'))
  varrer(path.join(raiz, 'web/public/app'))
  assert.deepEqual(soltos, [])
})
