// No Mac, a área de arrastar (-webkit-app-region: drag) de uma página local vale para a janela inteira, mesmo por
// baixo da view do HUB: se ela cobrir mais que a barra de título, nenhum clique chega ao painel (bug do 1.1.0).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'desktop')
const PAGINAS = path.join(DESKTOP, 'paginas')
const ler = (f) => fs.readFileSync(path.join(PAGINAS, f), 'utf8')
const semComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Regras CSS (seletor → corpo) que ligam a área de arrastar. */
function regrasDeArrastar(css) {
  const out = []
  for (const m of semComentarios(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/-webkit-app-region\s*:\s*drag/.test(m[2])) out.push({ seletor: m[1].trim(), corpo: m[2] })
  }
  return out
}

test('a abertura não arrasta a janela (ela cobre a janela toda)', () => {
  assert.deepEqual(regrasDeArrastar(ler('abertura.css')), [])
  assert.doesNotMatch(ler('abertura.html'), /app-region/)
})

test('na barra do Mac, só a faixa de cima arrasta, com a altura da barra', () => {
  const altura = Number(/const ALTURA_BARRA = MAC \? (\d+) : 0/.exec(fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8'))[1])
  const regras = regrasDeArrastar(ler('barra.css'))
  assert.ok(regras.length > 0)
  for (const r of regras) {
    assert.doesNotMatch(r.seletor, /^(html|body|:root|\*)\b/, `${r.seletor} arrasta a página inteira`)
    const h = /(?:^|;)\s*height\s*:\s*([^;]+)/.exec(r.corpo)?.[1].trim()
    assert.equal(h, `${altura}px`, `${r.seletor} precisa ter height: ${altura}px (tem ${h ?? 'nada'})`)
  }
})

test('nenhuma outra página local arrasta a janela', () => {
  for (const f of fs.readdirSync(PAGINAS).filter((x) => /\.(css|html)$/.test(x) && !x.startsWith('barra'))) {
    assert.doesNotMatch(semComentarios(ler(f)), /app-region\s*:\s*drag/, f)
  }
})
