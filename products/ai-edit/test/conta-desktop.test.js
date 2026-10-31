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

// cofre de teste no lugar do safeStorage do sistema: o que vai para o disco não é o token em claro
const COFRE = { cifrar: (t) => `cofre:${Buffer.from(t).toString('base64').split('').reverse().join('')}`, decifrar: (c) => Buffer.from(c.slice(6).split('').reverse().join(''), 'base64').toString() }

test('perfil único: a foto da conta vem no login e a próxima abertura relê nome e foto (userinfo + refresh)', async () => {
  zro.estado.pessoa = { ...LIA, foto: 'b8a4a3c2-0f4e-4d55-9a51-1f3f0c6a2b10' }
  const c = criarConta({ pasta, abrirNavegador: navegador(false), cofre: COFRE })
  assert.equal(await c.entrar(), 'ok')
  assert.equal(c.eu().pessoa.foto, `${zro.url}/api/v1/foto/b8a4a3c2-0f4e-4d55-9a51-1f3f0c6a2b10`)
  assert.equal(c.eu().conta, `${zro.url}/perfil`, 'onde editar: a conta Absolute ZRO')
  const bruto = readFileSync(join(pasta, 'conta.json'), 'utf8')
  assert.ok(!/rt_|at_/.test(bruto), 'refresh token só cifrado; access token nunca no disco')
  assert.match(bruto, /"rt":"cofre:/)
  const exp = JSON.parse(bruto).exp

  // mudou na conta: a mesma abertura do app relê pelo access token ainda válido
  zro.estado.pessoa = { ...LIA, nome: 'Lia Martins', foto: 'c0ffee00-1111-4222-8333-444455556666' }
  assert.equal(await c.atualizar(), 'ok')
  assert.equal(c.eu().pessoa.nome, 'Lia Martins')
  assert.equal(c.eu().pessoa.foto, `${zro.url}/api/v1/foto/c0ffee00-1111-4222-8333-444455556666`)

  // app fechado e aberto de novo (outro processo, sem tokens na memória), access token vencido: renova e relê
  zro.vencer()
  zro.estado.pessoa = { ...LIA, nome: 'Lia M.', foto: null }
  const renovacoes = zro.estado.renovacoes
  const depois = criarConta({ pasta, abrirNavegador: navegador(false), cofre: COFRE })
  assert.equal(depois.eu().pessoa.nome, 'Lia Martins', 'antes de reler, a cópia')
  assert.equal(await depois.atualizar(), 'ok')
  assert.equal(zro.estado.renovacoes, renovacoes + 1)
  assert.equal(depois.eu().pessoa.nome, 'Lia M.')
  assert.equal(depois.eu().pessoa.foto, null, 'sem foto: iniciais')
  assert.equal(JSON.parse(readFileSync(join(pasta, 'conta.json'), 'utf8')).exp, exp, 'reler não estica a sessão')

  // acesso removido no Perfil: esquece o token e fica com a cópia
  zro.vencer()
  zro.estado.recusarRenovacao = true
  const outra = criarConta({ pasta, abrirNavegador: navegador(false), cofre: COFRE })
  assert.equal(await outra.atualizar(), 'recusado')
  zro.estado.recusarRenovacao = false
  assert.equal(outra.eu().pessoa.nome, 'Lia M.')
  assert.ok(!/"rt"/.test(readFileSync(join(pasta, 'conta.json'), 'utf8')))
  assert.equal(await outra.atualizar(), 'sem-token')
  outra.sair()
  assert.equal(outra.eu(), null)
})

test('sem cofre do sistema: o refresh token fica só na memória; sair revoga', async () => {
  zro.estado.pessoa = LIA
  const c = criarConta({ pasta, abrirNavegador: navegador(false) })
  assert.equal(await c.entrar(), 'ok')
  assert.ok(!/"rt"/.test(readFileSync(join(pasta, 'conta.json'), 'utf8')))
  zro.vencer()
  zro.estado.pessoa = { ...LIA, nome: 'Lia Nova' }
  assert.equal(await c.atualizar(), 'ok', 'na mesma abertura, renova pela memória')
  assert.equal(c.eu().pessoa.nome, 'Lia Nova')
  assert.equal(await criarConta({ pasta, abrirNavegador: navegador(false) }).atualizar(), 'sem-token', 'outra abertura: fica a cópia')
  const n = zro.estado.revogados.length
  c.sair()
  for (let i = 0; i < 50 && zro.estado.revogados.length === n; i++) await new Promise((r) => setTimeout(r, 10))
  assert.match(zro.estado.revogados.at(-1) || '', /^rt_/)
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

test('a Z no app: o login pede zro.ia e o access token fica só no processo (renova quando vence, um refresh por vez)', async () => {
  zro.estado.pessoa = LIA
  const c = criarConta({ pasta, abrirNavegador: navegador(false), cofre: COFRE })
  assert.equal(await c.entrar(), 'ok')
  assert.ok(zro.estado.escopo.split(' ').includes('zro.ia'))
  const at = await c.tokenDeAcesso()
  assert.match(at, /^at_/)
  assert.ok(!readFileSync(join(pasta, 'conta.json'), 'utf8').includes(at), 'o access token não vai para o disco')
  // venceu (10 min): duas chamadas juntas gastam um refresh token só
  const antes = zro.estado.renovacoes
  c.esquecerAcesso()
  const [a, b] = await Promise.all([c.tokenDeAcesso(), c.tokenDeAcesso()])
  assert.equal(zro.estado.renovacoes, antes + 1)
  assert.equal(a, b)
  assert.notEqual(a, at)
  // acesso removido no Perfil: sem token (a página pede entrar de novo)
  zro.estado.recusarRenovacao = true
  c.esquecerAcesso()
  assert.equal(await c.tokenDeAcesso(), null)
  zro.estado.recusarRenovacao = false
  c.sair()
  assert.equal(await c.tokenDeAcesso(), null)
})

test('cliente sem o escopo da Z (invalid_scope): entra de novo sem ele, sem quebrar o login', async () => {
  zro.estado.pessoa = LIA
  zro.estado.recusarEscopoIa = true
  try {
    let idas = 0
    const ir = navegador(false)
    const c = criarConta({ pasta, abrirNavegador: (u) => (idas++, ir(u)) })
    assert.equal(await c.entrar(), 'ok')
    // com tudo, sem os sons, sem o Set, sem a Z
    assert.equal(idas, 4)
    assert.equal(zro.estado.escopo, 'openid email profile org offline_access')
    c.sair()
  } finally {
    zro.estado.recusarEscopoIa = false
  }
})

test('cliente sem o escopo dos sons (Absolute ZRO de antes da Sonoplasta): entra de novo sem ele, com a Z e o Set', async () => {
  zro.estado.pessoa = LIA
  zro.estado.recusarEscopoSons = true
  try {
    let idas = 0
    const ir = navegador(false)
    const c = criarConta({ pasta, abrirNavegador: (u) => (idas++, ir(u)) })
    assert.equal(await c.entrar(), 'ok')
    assert.equal(idas, 2)
    assert.equal(zro.estado.escopo, 'openid email profile org offline_access zro.ia zro.set')
    c.sair()
  } finally {
    zro.estado.recusarEscopoSons = false
  }
})

test('cliente sem o escopo do Set (Absolute ZRO de antes dele): entra de novo sem ele, com a Z', async () => {
  zro.estado.pessoa = LIA
  zro.estado.recusarEscopoSet = true
  try {
    let idas = 0
    const ir = navegador(false)
    const c = criarConta({ pasta, abrirNavegador: (u) => (idas++, ir(u)) })
    assert.equal(await c.entrar(), 'ok')
    // com tudo, sem os sons (o mais novo) e, ainda recusado, sem o Set
    assert.equal(idas, 3)
    assert.equal(zro.estado.escopo, 'openid email profile org offline_access zro.ia')
    c.sair()
  } finally {
    zro.estado.recusarEscopoSet = false
  }
})
