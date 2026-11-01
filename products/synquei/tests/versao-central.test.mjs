// Versão nova no app de computador (desktop/versao.cjs, desktop/central.cjs, app/js/atualizacao.js): desde 01/11/2026
// quem atualiza é a central Absolute ZRO. O app só confere o site, mostra "Atualização disponível" e uma notificação
// por build, e aponta para absolutezro://apps/synquei?acao=atualizar (sem a central, a página de baixar).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { AvisoDeVersao, parseRemote, readBuildInfo, PREFS_FILE } = require('../desktop/versao.cjs')
const central = require('../desktop/central.cjs')
const DESKTOP = new URL('../desktop/', import.meta.url)
const LINK = 'absolutezro://apps/synquei?acao=atualizar'

function aviso({ build = 5, corpo = { build: 7 }, falhar = false } = {}) {
  const pedidos = []
  const avisos = []
  const a = new AvisoDeVersao({
    stateDir: mkdtempSync(join(tmpdir(), 'syn-versao-')),
    buildInfo: { build },
    site: 'https://synquei.example',
    fetchJSON: async (url) => {
      pedidos.push(url)
      if (falhar) throw new Error('sem rede')
      return corpo
    },
  })
  a.on('avisar', (x) => avisos.push(x))
  return { a, pedidos, avisos }
}

test('versão nova: o aviso aponta para a central e a notificação sai uma vez por build', async () => {
  const { a, pedidos, avisos } = aviso()
  const st = await a.check()
  assert.equal(pedidos[0], 'https://synquei.example/baixar/versao')
  assert.equal(st.nova, true)
  assert.equal(st.link, LINK)
  assert.equal(st.pagina, 'https://absolutezro.com/baixar')
  assert.deepEqual(avisos, [{ build: 7, link: LINK }])
  await a.check()
  assert.equal(avisos.length, 1, 'mesmo build não notifica de novo')
  assert.deepEqual(JSON.parse(readFileSync(join(a.stateDir, PREFS_FILE), 'utf8')), { avisadoDoBuild: 7 })
  a.fetchJSON = async () => ({ build: 9 })
  await a.check()
  assert.equal(avisos.length, 2, 'build mais novo notifica de novo')
})

test('em dia, sem rede e desenvolvimento não avisam', async () => {
  const emDia = aviso({ corpo: { build: 5 } })
  assert.equal((await emDia.a.check()).nova, false)
  const semRede = aviso({ falhar: true })
  const st = await semRede.a.check()
  assert.equal(st.nova, false)
  assert.equal(st.falhou, true)
  const dev = aviso({ build: 0 })
  await dev.a.check()
  assert.equal(dev.pedidos.length, 0)
  assert.equal(emDia.avisos.length + semRede.avisos.length + dev.avisos.length, 0)
  assert.equal(parseRemote({ build: 0 }), null)
  assert.deepEqual(readBuildInfo('/nao/existe.json'), { build: 0, commit: '', data: null })
})

test('o app não baixa instalador sozinho: sem atualizador e sem as ações antigas', () => {
  assert.equal(existsSync(new URL('atualizador.cjs', DESKTOP)), false)
  assert.equal(existsSync(new URL('gerenciado.cjs', DESKTOP)), false)
  const main = readFileSync(new URL('main.cjs', DESKTOP), 'utf8')
  assert.doesNotMatch(main, /child_process|atu:aplicar|atu:baixar|handoff/)
  assert.match(main, /'Atualização disponível'/)
  assert.match(main, /'Atualizar na Absolute ZRO'/)
  const preload = readFileSync(new URL('preload.cjs', DESKTOP), 'utf8')
  assert.doesNotMatch(preload, /atu:aplicar|atu:baixar|atu:tentar|atu:depois/)
  assert.match(preload, /central: \(\) => ipcRenderer\.invoke\('atu:central'\)/)
  const versao = readFileSync(new URL('versao.cjs', DESKTOP), 'utf8')
  assert.doesNotMatch(versao, /sha256|\.dmg|\.exe|baixar\/mac|baixar\/windows/i)
})

test('a central: deep link; sem a central (ou o sistema recusa), a página de baixar', async () => {
  assert.equal(central.linkDaCentral('synquei'), LINK)
  const abertos = []
  const abrir = async (u) => abertos.push(u)
  assert.equal(await central.abrirNaCentral('synquei', { temCentral: () => true, abrir }), 'central')
  assert.equal(await central.abrirNaCentral('synquei', { temCentral: () => false, abrir }), 'pagina')
  const recusa = async (u) => {
    abertos.push(u)
    if (u.startsWith('absolutezro:')) throw new Error('sem app')
  }
  assert.equal(await central.abrirNaCentral('synquei', { temCentral: () => true, abrir: recusa }), 'pagina')
  assert.deepEqual(abertos, [LINK, 'https://absolutezro.com/baixar', LINK, 'https://absolutezro.com/baixar'])
})

test('cartão da barra lateral: "Atualização disponível" e "Atualizar na Absolute ZRO"; sem versão nova, nada', async () => {
  globalThis.synqueiDesktop = undefined
  const { cartaoHtml, aplicarCartao } = await import('../app/js/atualizacao.js')
  assert.equal(cartaoHtml(null), '')
  assert.equal(cartaoHtml({ nova: false, atual: { build: 5 } }), '')
  const html = cartaoHtml({ nova: true, atual: { build: 5 }, ultima: { build: 7 } })
  assert.match(html, /Atualização disponível/)
  assert.match(html, /data-act="atu-central">Atualizar na Absolute ZRO/)
  assert.doesNotMatch(html, /Baixar|Atualizar agora|instalador/)
  const box = { innerHTML: '' }
  assert.equal(aplicarCartao(box, { nova: true, ultima: { build: 7 } }), 'novo')
  assert.equal(aplicarCartao(box, { nova: true, ultima: { build: 7 } }), 'igual')
})
