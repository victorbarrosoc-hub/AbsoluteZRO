// A conta no app de computador (desktop/conta.cjs) contra uma Absolute ZRO falsa: o navegador da pessoa vai à
// Absolute ZRO, volta para 127.0.0.1 e o app guarda só quem é (sem token). Recusa, state trocado e nonce errado.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { iniciarZroFalsa } from './zro-falso.js'

const LIA = { sub: 'zro-111', email: 'Lia@Produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: ['ai-edit'] }
let zro
let pasta
let criarConta

before(async () => {
  zro = await iniciarZroFalsa({ clientId: 'aeon-desktop', publico: true })
  process.env.ZRO_ISSUER = zro.url
  ;({ criarConta } = createRequire(import.meta.url)('../desktop/conta.cjs'))
  pasta = mkdtempSync(join(tmpdir(), 'aeon-conta-'))
})
after(async () => {
  await zro?.fechar()
  rmSync(pasta, { recursive: true, force: true })
})

/** o "navegador": segue o authorize da Absolute ZRO falsa até o 127.0.0.1 do app; trocar = mexe no state */
const navegador = (trocar) => async (url) => {
  const r = await fetch(url, { redirect: 'manual' })
  const volta = new URL(r.headers.get('location'))
  assert.equal(volta.hostname, '127.0.0.1')
  assert.equal(volta.pathname, '/callback')
  if (trocar) volta.searchParams.set('state', 'outro')
  const pagina = await (await fetch(volta)).text()
  assert.match(pagina, /AEON/)
}

test('entra pelo navegador, guarda só quem é e sai', async () => {
  zro.estado.pessoa = LIA
  let voltou = 0
  const c = criarConta({ pasta, abrirNavegador: navegador(false), aoVoltar: () => voltou++ })
  assert.equal(c.eu(), null)
  assert.equal(await c.entrar(), 'ok')
  assert.equal(voltou, 1, 'a janela do app volta para frente')
  const eu = c.eu()
  assert.equal(eu.pessoa.email, 'lia@produtora.com')
  assert.equal(eu.acesso, true)
  const bruto = readFileSync(join(pasta, 'conta.json'), 'utf8')
  assert.ok(!/id_token|access_token|"at"/.test(bruto), 'nenhum token guardado')
  c.sair()
  assert.equal(c.eu(), null)
})

test('conta sem o AEON: entra, mas acesso falso', async () => {
  zro.estado.pessoa = { ...LIA, produtos: ['sobedesce'] }
  const c = criarConta({ pasta, abrirNavegador: navegador(false) })
  assert.equal(await c.entrar(), 'ok')
  assert.equal(c.eu().acesso, false)
  c.sair()
})

test('recusas: state trocado, pessoa negou, nonce adulterado', async () => {
  zro.estado.pessoa = LIA
  const c = criarConta({ pasta, abrirNavegador: navegador(true) })
  assert.equal(await c.entrar(), 'expirou')
  zro.estado.negar = true
  const r = await criarConta({ pasta, abrirNavegador: navegador(false) }).entrar()
  assert.equal(r, 'recusado')
  zro.estado.negar = false
  zro.estado.adulterar = 'nonce'
  assert.equal(await criarConta({ pasta, abrirNavegador: navegador(false) }).entrar(), 'erro')
  zro.estado.adulterar = null
  assert.equal(c.eu(), null, 'nada foi guardado')
})
