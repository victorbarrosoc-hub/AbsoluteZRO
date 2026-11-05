// Navegação do app de computador (proposta A, titular, 05/11/2026): cinco abas no menu (Início, Drive,
// Transferências, Cartões, Estúdio) e Ajustes embaixo; Z, Dispositivos e os apps da Absolute ZRO no menu da conta;
// Comparar dividido ("Entre discos" → Cartões › Copiar; "Computador × Drive" → botão do Drive); Frames e Referências
// no Estúdio, com as seções no topo. Lê o código (a interface roda sem build, com imports do navegador).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (p) => fs.readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8')

test('menu: cinco abas e Ajustes; Z, Dispositivos e a família no menu da conta', () => {
  const s = ler('components/sidebar.js')
  const nav = /const NAV = \[([\s\S]*?)\n\]/.exec(s)[1]
  assert.deepEqual([...nav.matchAll(/label: '([^']+)'/g)].map((m) => m[1]), ['Início', 'Drive', 'Transferências', 'Cartões', 'Estúdio'])
  assert.match(s, /const NAV_BAIXO = \[\{ id: 'ajustes'/)
  const menu = s.slice(s.indexOf('function AccountMenu'), s.indexOf('function AccountChip'))
  for (const t of ["navigate('computadores')", "navigate('z')", 'FAMILIA.map']) assert.ok(menu.includes(t), t)
  // as telas antigas acendem a aba nova
  assert.match(s, /tambem: \['comparar'\]/)
  assert.match(s, /tambem: \['referencias', 'montagens'\]/)
  assert.match(s, /tambem: \['computadores'\]/)
})

test('Estúdio: rota própria que volta à última seção; Frames e Referências com as seções no topo', () => {
  assert.match(ler('lib/router.js'), /'estudio'/)
  const app = ler('app.js')
  assert.match(app, /storage\.set\('estudio\.secao', route\.name\)/)
  assert.match(app, /<\$\{Secoes\} label="Estúdio"/)
})

test('Comparar dividido: Copiar em Cartões; Conferir com o computador no Drive', () => {
  const cartoes = ler('components/cartoes.js')
  assert.deepEqual([...cartoes.matchAll(/value: '(backup|copiar|calc)'/g)].map((m) => m[1]), ['backup', 'copiar', 'calc'])
  assert.match(cartoes, /aba === 'copiar'\) return html`\$\{secoes\}<\$\{DiscosPanel\}/)
  const compare = ler('components/compare.js')
  assert.ok(!compare.includes('DiscosPanel'), 'o Comparar não abre mais o "Entre discos"')
  assert.match(ler('components/drive.js'), /navigate\('comparar'\)[^\n]*Conferir com o computador/)
})

test('ao vivo: Transferências com o resumo grande no topo (5 min de gráfico) e o cartão com as fases', () => {
  const t = ler('components/transfers.js')
  assert.match(t, /const AoVivo = memo\(/)
  assert.match(t, /<\$\{AoVivo\} geral=\$\{data\.geral\} \/>/)
  for (const r of ["'Subindo'", "'Baixando'", "'Já passou'", "'Falta'"]) assert.ok(t.includes(r), r)
  const motor = fs.readFileSync(new URL('../src/engine/manager.js', import.meta.url), 'utf8')
  assert.match(motor, /const HISTORY_LEN = 300\b/, '5 minutos, um ponto por segundo')
  const b = ler('components/backup.js')
  assert.match(b, /\['Copiar', 'Conferir', 'Pode formatar'\]/)
})
