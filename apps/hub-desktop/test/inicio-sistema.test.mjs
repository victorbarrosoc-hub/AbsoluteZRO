// Abrir com o computador (padrão ligado na primeira execução, escondido na bandeja) e a lista de apps que a central
// mantém em dia (lida pelo SOBEDESCE e pelo Synquei para não se atualizarem ao mesmo tempo).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const inicio = require('../desktop/inicio-sistema.cjs')
const gerenciados = require('../desktop/gerenciados.cjs')

const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zro-inicio-'))

test('primeira execução: abrir com o computador ligado; depois vale a escolha gravada', () => {
  const p = pasta()
  assert.deepEqual(inicio.lerPreferencias(fs, p), {})
  assert.equal(inicio.abrirComSistema({}), true)
  inicio.gravarPreferencias(fs, p, { abrirComSistema: false })
  inicio.gravarPreferencias(fs, p, { boasVindas: true })
  assert.deepEqual(inicio.lerPreferencias(fs, p), { abrirComSistema: false, boasVindas: true })
  assert.equal(inicio.abrirComSistema(inicio.lerPreferencias(fs, p)), false)
  fs.writeFileSync(path.join(p, inicio.ARQUIVO), '[1,2]')
  assert.deepEqual(inicio.lerPreferencias(fs, p), {}, 'arquivo estranho = sem preferências')
})

test('na abertura: registra só na primeira vez e segue o que a pessoa mudou nos Ajustes do sistema', () => {
  assert.deepEqual(inicio.estadoNaAbertura({ prefs: {}, sistema: false }), { ligado: true, registrar: true, gravar: true })
  assert.deepEqual(inicio.estadoNaAbertura({ prefs: { abrirComSistema: true }, sistema: true }), { ligado: true, registrar: false, gravar: false })
  // desligou nos Ajustes do Mac (ou no Gerenciador de Tarefas): o app não liga de novo por conta própria
  assert.deepEqual(inicio.estadoNaAbertura({ prefs: { abrirComSistema: true }, sistema: false }), { ligado: false, registrar: false, gravar: true })
  assert.deepEqual(inicio.estadoNaAbertura({ prefs: { abrirComSistema: false }, sistema: null }), { ligado: false, registrar: false, gravar: false })
})

test('registro no sistema: Windows abre escondido (--escondido); só no app instalado, no Mac e no Windows', () => {
  assert.deepEqual(inicio.opcoesDeLogin({ plataforma: 'windows', ligado: true, exe: 'C:\\A\\Absolute ZRO.exe' }), {
    openAtLogin: true,
    path: 'C:\\A\\Absolute ZRO.exe',
    args: ['--escondido'],
  })
  assert.deepEqual(inicio.opcoesDeLogin({ plataforma: 'windows', ligado: false, exe: 'x' }), { openAtLogin: false, path: 'x', args: [] })
  assert.deepEqual(inicio.opcoesDeLogin({ plataforma: 'mac', ligado: true }), { openAtLogin: true })
  assert.equal(inicio.opcoesDeLogin({ plataforma: 'linux', ligado: true }), null)
  assert.equal(inicio.suportado({ plataforma: 'mac', empacotado: true }), true)
  assert.equal(inicio.suportado({ plataforma: 'windows', empacotado: false }), false, 'npm run desktop não se registra')
  assert.equal(inicio.suportado({ plataforma: 'linux', empacotado: true }), false)
})

test('aberto pelo sistema começa escondido, só com o ícone', () => {
  assert.equal(inicio.iniciarEscondido({ argv: ['Absolute ZRO.exe', '--escondido'], plataforma: 'windows' }), true)
  assert.equal(inicio.iniciarEscondido({ argv: ['Absolute ZRO.exe'], plataforma: 'windows' }), false)
  assert.equal(inicio.iniciarEscondido({ argv: [], plataforma: 'mac', abertoNoLogin: true }), true)
  assert.equal(inicio.iniciarEscondido({ argv: [], plataforma: 'mac', abertoNoLogin: false }), false)
})

test('apps gerenciados: a central grava quem ela mantém em dia; vale enquanto ela der sinal de vida', () => {
  const p = pasta()
  const t0 = Date.parse('2026-10-28T12:00:00Z')
  const a = gerenciados.gravar(fs, p, ['synquei', 'sobedesce', '../x'], t0)
  assert.deepEqual(Object.keys(a.apps), ['sobedesce', 'synquei'], 'só ids válidos, em ordem')
  const json = gerenciados.ler(fs, p)
  assert.equal(json.versao, 1)
  assert.equal(gerenciados.eGerenciado(json, 'sobedesce', t0 + 3600_000), true)
  assert.equal(gerenciados.eGerenciado(json, 'nossom', t0), false)
  // a central sumiu há mais de 14 dias: o app volta a se atualizar sozinho
  assert.equal(gerenciados.eGerenciado(json, 'sobedesce', t0 + 15 * 86_400_000), false)
  // a lista é refeita a cada conferência; o "desde" de quem continua é mantido
  const b = gerenciados.gravar(fs, p, ['sobedesce'], t0 + 86_400_000)
  assert.deepEqual(Object.keys(b.apps), ['sobedesce'])
  assert.equal(b.apps.sobedesce.desde, a.apps.sobedesce.desde)
  assert.equal(b.visto, new Date(t0 + 86_400_000).toISOString())
  assert.equal(gerenciados.eGerenciado(null, 'sobedesce'), false)
  assert.equal(gerenciados.eGerenciado({ versao: 2, visto: new Date().toISOString(), apps: { sobedesce: {} } }, 'sobedesce'), false)
})
