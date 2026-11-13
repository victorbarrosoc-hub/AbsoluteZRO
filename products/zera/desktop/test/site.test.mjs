// ZERA · site (products/zera/site e publicar.mjs): fechado não diz nada do ZERA (regra dos não lançados); aberto tem
// tudo o que a página pede, sem script nem estilo dentro do HTML (a CSP do vercel.json não deixa).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const publico = path.join(raiz, 'publico')
const publicar = (env) => execFileSync(process.execPath, [path.join(raiz, 'publicar.mjs')], { env: { ...process.env, ZERA_SITE_ABERTO: '', ...env } })

test('fechado: só a página neutra, sem nome nem marca do ZERA, e o robots fecha tudo', () => {
  publicar({})
  assert.deepEqual(fs.readdirSync(publico).sort(), ['404.html', 'index.html', 'robots.txt'])
  const html = fs.readFileSync(path.join(publico, 'index.html'), 'utf8')
  assert.match(html, /Página <\/span><b>indisponível\.<\/b>/)
  assert.match(html, /noindex/)
  assert.doesNotMatch(html, /zera/i)
  assert.equal(fs.readFileSync(path.join(publico, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n')
})

test('aberto: a página do produto, com tudo o que ela usa e nada inline', () => {
  publicar({ ZERA_SITE_ABERTO: '1' })
  const html = fs.readFileSync(path.join(publico, 'index.html'), 'utf8')
  assert.match(html, /<title>ZERA · Espaço livre, sem medo\.<\/title>/)
  assert.doesNotMatch(html, /\sstyle=|<style|<script>|\son[a-z]+="/i, 'nada inline (CSP)')
  const locais = [...html.matchAll(/(?:src|href)="(\/[^"#]*)"/g)].map((m) => m[1]).filter((u) => u !== '/')
  assert.ok(locais.length >= 10)
  for (const u of locais) assert.ok(fs.existsSync(path.join(publico, u)), 'falta ' + u)
  assert.ok(fs.existsSync(path.join(publico, 'og.png')))
  const vercel = JSON.parse(fs.readFileSync(path.join(raiz, 'vercel.json'), 'utf8'))
  assert.equal(vercel.outputDirectory, 'publico')
  assert.match(JSON.stringify(vercel.headers), /frame-ancestors 'none'/)
  publicar({})
})
