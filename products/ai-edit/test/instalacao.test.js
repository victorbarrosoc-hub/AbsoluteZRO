// Instalação no molde do Synquei: nome e Release iguais aos de src/produto.js nos dois instaladores, e o versao.json
// que o CI grava é lido pelos mesmos comandos que o instalar.sh usa.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { PRODUTO } from '../src/produto.js'
import { nomear, nomeFinal, versao } from '../scripts/release.mjs'

const sh = readFileSync(new URL('../instalar.sh', import.meta.url), 'utf8')
const ps = readFileSync(new URL('../instalar.ps1', import.meta.url), 'utf8')

test('instaladores usam o nome e o Release do produto', () => {
  assert.match(sh, new RegExp(`^  NOME="${PRODUTO.nome}"$`, 'm'))
  assert.match(ps, new RegExp(`^  \\$nome = '${PRODUTO.nome}'$`, 'm'))
  for (const t of [sh, ps]) {
    assert.ok(t.includes(`releases/download/${PRODUTO.release}`))
    assert.ok(t.includes('https://aeon.absolutezro.com/instalar'), 'o comando aponta para o site do AEON')
  }
  execFileSync('sh', ['-n', new URL('../instalar.sh', import.meta.url).pathname])
})

test('versao.json do CI é lido pelos comandos do instalar.sh', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aiedit-rel-'))
  try {
    mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'dist', 'AI-Edit-0.1.0-mac-universal.dmg'), 'dmg')
    writeFileSync(join(dir, 'dist', 'AI-Edit-0.1.0-windows-setup.exe'), 'exe')
    const m = await nomear('mac', join(dir, 'dist'), join(dir, 'sha'))
    const w = await nomear('windows', join(dir, 'dist'), join(dir, 'sha'))
    assert.equal(m.nome, nomeFinal('mac'))
    assert.equal(w.nome, `${PRODUTO.arquivo}-windows-setup.exe`)
    const v = await versao(join(dir, 'sha'), join(dir, 'versao.json'), new Date('2026-10-26T12:00:00Z'))
    assert.equal(v.sha256Mac, m.hash)
    // os mesmos grep/sed do instalar.sh
    const json = readFileSync(join(dir, 'versao.json'), 'utf8')
    const rodar = (cmd) => execFileSync('sh', ['-c', `printf '%s' "$VERSAO" | ${cmd}`], { env: { ...process.env, VERSAO: json }, encoding: 'utf8' }).trim()
    assert.equal(rodar(`grep -Eo '"build"[[:space:]]*:[[:space:]]*[0-9]+' | grep -Eo '[0-9]+$'`), String(v.build))
    assert.equal(rodar(`grep -Eo '"sha256Mac"[[:space:]]*:[[:space:]]*"[0-9a-fA-F]{64}"' | grep -Eo '[0-9a-fA-F]{64}'`), m.hash)
    assert.equal(rodar(`grep -Eo '"mac"[[:space:]]*:[[:space:]]*"[A-Za-z0-9._-]+\\.dmg"' | sed -E 's/.*"([^"]+)"$/\\1/'`), m.nome)
    assert.match(w.nome, /^[A-Za-z0-9._-]+\.exe$/, 'o instalar.ps1 só aceita esse formato de nome')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('electron-builder tira nome, id e arquivos do produto', async () => {
  const { createRequire } = await import('node:module')
  const c = createRequire(import.meta.url)('../electron-builder.config.cjs')
  assert.equal(c.productName, PRODUTO.nome)
  assert.equal(c.appId, PRODUTO.appId)
  assert.equal(c.mac.identity, '-', 'custo zero: assinatura ad-hoc')
  for (const p of ['app/**/*', 'src/**/*', 'vendor/**/*', 'desktop/**/*', 'presets/**/*.json']) assert.ok(c.files.includes(p), p)
})

test('instalar.sh roda no bash 3.2 do Mac: variável colada em acento ou "…" vai entre chaves', () => {
  // o bash 3.2 lê o primeiro byte do "…" como parte do nome: "$NOME…" virava a variável "NOME?" (unbound variable)
  const sh = readFileSync(new URL('../instalar.sh', import.meta.url), 'utf8')
  const ruins = sh.split('\n').filter((l) => /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/.test(l))
  assert.deepEqual(ruins, [])
})
