// O contrato camzro.clip/1 (docs/integration-contracts/camzro.md): o exemplo do repositório sai do código de verdade.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { exemploSidecar, CAMINHO } from '../scripts/exemplos.mjs'
import { conferirSidecar, FORMATO_SIDECAR } from '../app/nucleo/metadados.js'

test('o exemplo do contrato é o que o CAMZRO grava (rode node scripts/exemplos.mjs se mudou)', () => {
  const noRepo = JSON.parse(readFileSync(CAMINHO, 'utf8'))
  assert.deepEqual(noRepo, JSON.parse(JSON.stringify(exemploSidecar())))
  assert.equal(noRepo.formato, FORMATO_SIDECAR)
  assert.deepEqual(conferirSidecar(noRepo), [])
})

test('o contrato documenta todos os campos do sidecar', () => {
  const doc = readFileSync(new URL('../../../docs/integration-contracts/camzro.md', import.meta.url), 'utf8')
  const campos = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? [`${pre}${k}`, ...campos(v, `${pre}${k}.`)] : [`${pre}${k}`]))
  for (const c of campos(exemploSidecar())) assert.ok(doc.includes(`\`${c}\``), `campo sem documentação: ${c}`)
})
