// Guarda dos templates da interface (htm): um "<" seguido de número dentro de html`` abre uma tag inválida e a tela
// inteira para de desenhar. Foi o que congelou Transferências em 3% (relato do titular, 10/11/2026: "<1 min" no
// "Falta"). Texto assim vai interpolado: ${'<1'}.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const pastas = ['public', 'web/public/app']

function arquivos(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!['vendor', 'node_modules', 'relay'].includes(e.name)) out.push(...arquivos(p))
    } else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}

test('templates html``: nenhum "<" seguido de número (vira tag e derruba a tela)', () => {
  const achados = []
  for (const dir of pastas)
    for (const f of arquivos(path.join(raiz, dir))) {
      fs.readFileSync(f, 'utf8')
        .split('\n')
        .forEach((linha, i) => {
          if (/^\s*(\/\/|\*)/.test(linha)) return
          // "<1" colado em texto ou em tag (não em comparação "a < 1", nem em string '<1')
          if (/[^\s'"`(=<]<\d/.test(linha) || /html`(?:[^`]*[^'"`])?<\d/.test(linha)) achados.push(`${path.relative(raiz, f)}:${i + 1}: ${linha.trim().slice(0, 120)}`)
        })
    }
  assert.deepEqual(achados, [])
})
