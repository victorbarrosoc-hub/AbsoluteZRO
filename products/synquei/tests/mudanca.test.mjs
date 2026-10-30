// Mudança para synquei.absolutezro.com: os projetos gravados no endereço antigo vão junto, sem apagar nada do novo.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import vm from 'node:vm'

const CODIGO = readFileSync(new URL('../app/mudanca.js', import.meta.url), 'utf8')

function armazenamento(inicial = {}) {
  const m = new Map(Object.entries(inicial))
  return {
    get length() {
      return m.size
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    dados: m,
  }
}

/** Carrega o script como no navegador, num endereço à escolha. */
function carregar(host = 'synquei.absolutezro.com', { ls = armazenamento(), caminho = '/app/', hash = '' } = {}) {
  const idas = []
  const raiz = { style: { visibility: '' } }
  const location = { hostname: host, pathname: caminho, search: '', hash, replace: (u) => idas.push(u) }
  const ctx = { location, localStorage: ls, document: { documentElement: raiz }, CompressionStream, DecompressionStream, Blob, Response, TextEncoder, TextDecoder, atob, btoa, Uint8Array, JSON, Promise, Object, Array, Number, String, RegExp, Date }
  ctx.window = ctx
  vm.runInNewContext(CODIGO, ctx)
  return { M: ctx.SynqueiMudanca, idas, raiz, ls }
}

const projeto = (id, updatedAt = 1) => JSON.stringify({ v: 1, id, name: `Projeto ${id}`, updatedAt, clips: [], devices: [] })
const indice = (...ids) => JSON.stringify(ids.map(([id, updatedAt]) => ({ id, name: `Projeto ${id}`, updatedAt })))
const esperar = () => new Promise((r) => setTimeout(r, 20))

describe('endereço antigo', () => {
  test('sem nada gravado: vai direto para a mesma página no endereço novo', () => {
    const { idas } = carregar('synquei.vercel.app', { caminho: '/app/', hash: '#/linha' })
    assert.deepEqual(idas, ['https://synquei.absolutezro.com/app/#/linha'])
  })

  test('com projetos: leva tudo no # para /mudanca/ e marca que já levou', async () => {
    const ls = armazenamento({ 'synquei:index': indice(['a1', 5]), 'synquei:p:a1': projeto('a1', 5), 'synquei:theme': 'dark', 'outro:app': 'x' })
    const { idas, raiz, M } = carregar('synquei.vercel.app', { ls, caminho: '/formatos/' })
    assert.equal(raiz.style.visibility, 'hidden')
    await esperar()
    assert.equal(idas.length, 1)
    assert.match(idas[0], /^https:\/\/synquei\.absolutezro\.com\/mudanca\/#g[A-Za-z0-9_-]+$/)
    assert.ok(ls.getItem('synquei:mudou'))
    const d = await M.abrir(idas[0].split('#')[1])
    assert.equal(d.volta, '/formatos/')
    assert.deepEqual(Object.keys(d.itens).sort(), ['synquei:index', 'synquei:p:a1', 'synquei:theme'])
  })

  test('depois de levar uma vez, só redireciona (não manda de novo)', () => {
    const ls = armazenamento({ 'synquei:p:a1': projeto('a1'), 'synquei:mudou': '2026-10-29T00:00:00Z' })
    const { idas } = carregar('synquei.vercel.app', { ls, caminho: '/' })
    assert.deepEqual(idas, ['https://synquei.absolutezro.com/'])
  })

  test('no endereço novo e no app de computador o script não faz nada', () => {
    for (const host of ['synquei.absolutezro.com', 'app', 'localhost']) {
      const { idas, raiz } = carregar(host, { ls: armazenamento({ 'synquei:p:a1': projeto('a1') }) })
      assert.deepEqual(idas, [], host)
      assert.equal(raiz.style.visibility, '', host)
    }
  })
})

describe('chegada no endereço novo', () => {
  test('grava projetos e ajustes que não existem e junta a lista de projetos', async () => {
    const { M, ls } = carregar('synquei.absolutezro.com', { ls: armazenamento({ 'synquei:index': indice(['n1', 9]), 'synquei:p:n1': projeto('n1', 9), 'synquei:theme': 'light' }) })
    const itens = { 'synquei:index': indice(['a1', 5], ['n1', 1]), 'synquei:p:a1': projeto('a1', 5), 'synquei:p:n1': projeto('n1', 1), 'synquei:theme': 'dark', 'synquei:sons': '{"on":false}' }
    const d = await M.abrir(await M.empacotar(itens, '/app/#/projetos'))
    assert.equal(d.volta, '/app/#/projetos')
    assert.equal(M.aplicar(ls, d.itens), 1)
    assert.equal(JSON.parse(ls.getItem('synquei:p:n1')).updatedAt, 9, 'o que já existe aqui fica')
    assert.equal(ls.getItem('synquei:theme'), 'light', 'ajuste já escolhido aqui fica')
    assert.equal(ls.getItem('synquei:sons'), '{"on":false}')
    assert.ok(ls.getItem('synquei:p:a1'))
    assert.deepEqual(JSON.parse(ls.getItem('synquei:index')).map((e) => e.id), ['n1', 'a1'])
  })

  test('recusa chave fora do Synquei, projeto estragado e entrada de lista sem projeto', () => {
    const { M, ls } = carregar()
    const n = M.aplicar(ls, {
      'outro:chave': 'x',
      'synquei:p:b1': '{nao é json',
      'synquei:p:b2': JSON.stringify({ id: 'outro-id', clips: [] }),
      'synquei:mudou': 'x',
      'synquei:index': indice(['b1', 1], ['zz', 2]),
      'synquei:p:ok': projeto('ok'),
    })
    assert.equal(n, 1)
    assert.deepEqual([...ls.dados.keys()], ['synquei:p:ok'], 'a lista só muda quando entra projeto dela')
  })

  test('volta só para caminho do próprio site', async () => {
    const { M } = carregar()
    for (const v of ['https://mal.exemplo/', '//mal.exemplo/x', '/\\mal', 'javascript:alert(1)', '/mudanca/#x', '']) assert.equal(M.voltaSegura(v), '/app/', v)
    assert.equal(M.voltaSegura('/formatos/?q=braw#r3d'), '/formatos/?q=braw#r3d')
  })

  test('pacote inválido vira null, também sem compressão', async () => {
    const { M } = carregar()
    for (const t of ['', 'x', 'gAAAA', 'j' + Buffer.from('{"v":2}').toString('base64url'), 'j' + Buffer.from('lixo').toString('base64url')]) assert.equal(await M.abrir(t), null, t)
    const puro = 'j' + Buffer.from(JSON.stringify({ v: 1, volta: '/app/', itens: { 'synquei:theme': 'dark' } })).toString('base64url')
    assert.deepEqual(JSON.parse(JSON.stringify(await M.abrir(puro))), { volta: '/app/', itens: { 'synquei:theme': 'dark' } })
  })
})
