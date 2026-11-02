// Página de entrada do site (/entrar/, entrar/entrar.js): o Synquei pede a conta Absolute ZRO (decisão do titular,
// 02/11/2026). Fora: Entrar e Criar conta voltando para a tela pedida; dentro: volta direto; sem login ligado ou sem
// rede: o app segue aberto. Roda o script como no navegador, com um DOM mínimo.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import vm from 'node:vm'

const CODIGO = readFileSync(new URL('../entrar/entrar.js', import.meta.url), 'utf8')
const HTML = readFileSync(new URL('../entrar/index.html', import.meta.url), 'utf8')
const IDS = ['fora', 'dentro', 'desligado', 'entrar', 'criar', 'abrir', 'abrir-sem', 'aviso', 'avatar', 'ola', 'quem', 'sair']

function elemento() {
  const ouvintes = {}
  return {
    hidden: true,
    href: '',
    textContent: '',
    filhos: [],
    appendChild(f) {
      this.filhos.push(f)
    },
    addEventListener: (tipo, fn) => (ouvintes[tipo] = fn),
    clicar: () => ouvintes.click({ preventDefault() {} }),
  }
}

/** Carrega a página com `?busca` e a resposta do /eu (ou `null` para sem rede). */
async function abrir(busca, eu, { pagina = true } = {}) {
  const els = Object.fromEntries(IDS.map((id) => [id, elemento()]))
  const outras = [elemento(), elemento()]
  const idas = []
  const pedidos = []
  const resposta = (status, corpo) => ({ status, headers: { get: () => 'application/json' }, json: async () => corpo })
  const ctx = {
    URLSearchParams,
    Promise,
    location: { search: busca, replace: (u) => idas.push(u), assign: (u) => idas.push(u) },
    document: {
      getElementById: (id) => (pagina ? els[id] || null : null),
      createElement: () => elemento(),
      querySelectorAll: (sel) => (pagina && sel === '[data-outra]' ? outras : []),
    },
    fetch: async (url, opcoes) => {
      pedidos.push([url, opcoes?.method || 'GET'])
      if (url.startsWith('/api/zro/sair')) return resposta(200, { ok: true })
      if (eu === null) throw new TypeError('sem rede')
      return resposta(eu[0], eu[1])
    },
  }
  ctx.window = ctx
  vm.runInNewContext(CODIGO, ctx)
  await new Promise((r) => setTimeout(r, 10))
  return { E: ctx.SynqueiEntrar, els, outras, idas, pedidos }
}

describe('/entrar/', () => {
  test('a página tem os três estados, o script e só as plataformas no ar', () => {
    for (const id of IDS) assert.match(HTML, new RegExp(`id="${id}"`), id)
    assert.match(HTML, /<script src="\/entrar\/entrar\.js"><\/script>/)
    assert.match(HTML, /Entrar com Absolute ZRO/)
    assert.match(HTML, /Criar conta/)
    assert.doesNotMatch(HTML, /nossom|aeon|ai-edit|revela|finishing|rift/i)
  })

  test('fora da conta: Entrar e Criar conta voltam para a tela pedida, com o recado do login', async () => {
    const { els, idas } = await abrir('?volta=%2Fapp%2F%23%2Flinha&zro=recusado', [200, { ok: false, configurado: true, entrou: false }])
    assert.equal(els.fora.hidden, false)
    assert.equal(els.dentro.hidden, true)
    assert.equal(els.entrar.href, '/api/zro/entrar?volta=%2Fapp%2F%23%2Flinha')
    assert.equal(els.criar.href, '/api/zro/entrar?criar=1&volta=%2Fapp%2F%23%2Flinha')
    assert.equal(els.aviso.textContent, 'Entrada cancelada.')
    assert.deepEqual(idas, [])
  })

  test('"Usar outra conta" (fora e dentro): sai da conta deste site e pede a conta de novo (prompt=login)', async () => {
    assert.equal((HTML.match(/data-outra>Usar outra conta</g) || []).length, 2)
    const { outras, idas, pedidos } = await abrir('?volta=%2Fapp%2F%23%2Flinha', [200, { ok: false, configurado: true, entrou: false }])
    for (const a of outras) assert.equal(a.href, '/api/zro/entrar?outra=1&volta=%2Fapp%2F%23%2Flinha')
    outras[0].clicar()
    await new Promise((r) => setTimeout(r, 10))
    assert.deepEqual(pedidos.at(-1), ['/api/zro/sair', 'POST'])
    assert.deepEqual(idas, ['/api/zro/entrar?outra=1&volta=%2Fapp%2F%23%2Flinha'])
  })

  test('o 401 de sempre (app antigo) também é "fora"', async () => {
    const { els } = await abrir('', [401, { ok: false, configurado: true }])
    assert.equal(els.fora.hidden, false)
    assert.equal(els.entrar.href, '/api/zro/entrar?volta=%2Fapp%2F')
  })

  test('já dentro: volta direto para a tela pedida; sem volta, mostra quem é, Abrir o Synquei e Sair', async () => {
    const LIA = { nome: 'Lia Produtora', email: 'lia@produtora.com', foto: 'https://fotos.exemplo/lia.png' }
    const { idas } = await abrir('?volta=%2Fformatos%2F', [200, { ok: true, pessoa: LIA }])
    assert.deepEqual(idas, ['/formatos/'])
    const p = await abrir('', [200, { ok: true, pessoa: LIA }])
    assert.equal(p.els.dentro.hidden, false)
    assert.equal(p.els.ola.textContent, 'Olá, Lia.')
    assert.equal(p.els.quem.textContent, 'lia@produtora.com')
    assert.equal(p.els.avatar.textContent, 'LP')
    assert.equal(p.els.avatar.filhos[0].src, LIA.foto)
    assert.equal(p.els.abrir.href, '/app/')
    p.els.sair.clicar()
    await new Promise((r) => setTimeout(r, 10))
    assert.deepEqual(p.pedidos.at(-1), ['/api/zro/sair', 'POST'])
    assert.deepEqual(p.idas, ['/entrar/'])
  })

  test('sem rede ou login não ligado: o app segue aberto (Abrir o Synquei)', async () => {
    for (const eu of [null, [503, { ok: false }], [200, { ok: false, entrou: false }]]) {
      const { els, idas } = await abrir('?volta=%2Fapp%2F%23%2Fajustes', eu)
      assert.equal(els.desligado.hidden, false, JSON.stringify(eu))
      assert.equal(els['abrir-sem'].href, '/app/#/ajustes')
      assert.deepEqual(idas, [])
    }
  })

  test('volta só para caminho deste site, nunca para o próprio /entrar/', async () => {
    const { E } = await abrir('', null, { pagina: false })
    for (const v of ['https://mal.exemplo/', '//mal.exemplo/x', '/\\mal', 'javascript:alert(1)', '', '/entrar/', '/entrar?volta=/x', null]) assert.equal(E.voltaSegura(v), '/app/', String(v))
    assert.equal(E.voltaSegura('/app/#/projetos'), '/app/#/projetos')
    assert.equal(E.voltaSegura('/formatos/?q=braw'), '/formatos/?q=braw')
  })
})
