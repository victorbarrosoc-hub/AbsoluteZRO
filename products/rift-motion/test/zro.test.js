// O login da Absolute ZRO no Rift (api/): sem o cliente configurado, nada liga e o painel fica em demonstração; com ele,
// a volta é sempre para dentro do site (o painel mora em /#app) e os cookies são do Rift.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const pedido = (url, host = 'rift.absolutezro.com') => ({ url, method: 'GET', headers: { host, 'x-forwarded-proto': 'https' } })
const resposta = () => {
  const r = { statusCode: 0, headers: {}, corpo: '' }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.end = (c) => (r.corpo = c ?? '')
  return r
}

test('sem ZRO_CLIENT_ID e ZRO_CLIENT_SECRET: /eu diz "não configurado" e /entrar volta ao painel com ?zro=config', async () => {
  delete process.env.ZRO_CLIENT_ID
  delete process.env.ZRO_CLIENT_SECRET
  const eu = (await import('../api/zro/eu.js')).default
  const r = resposta()
  await eu(pedido('/api/zro/eu'), r)
  assert.equal(r.statusCode, 200)
  assert.deepEqual(JSON.parse(r.corpo), { ok: false, configurado: false })
  const entrar = (await import('../api/zro/entrar.js')).default
  const r2 = resposta()
  await entrar(pedido('/api/zro/entrar?volta=%2F%23projetos'), r2)
  assert.equal(r2.statusCode, 303)
  assert.equal(r2.headers.location, '/?zro=config#projetos')
})

test('a volta fica no site, com o hash do painel; outro endereço vira o oficial; cookies do Rift', async () => {
  const z = await import('../api/_zro.js')
  assert.equal(z.voltaSegura('/#app'), '/#app')
  assert.equal(z.voltaSegura('https://golpe.com/#app'), '/#app')
  assert.equal(z.voltaSegura('//golpe.com'), '/#app')
  assert.equal(z.origemPermitida(pedido('/', 'rift-motion-xyz.vercel.app')), 'https://rift.absolutezro.com')
  assert.equal(z.retorno(z.SITE), 'https://rift.absolutezro.com/api/zro/callback')
  assert.deepEqual([z.COOKIE_IDA, z.COOKIE_CONTA, z.COOKIE_HUB], ['rf_zro', 'rf_conta', 'rf_hub'])
  assert.equal(z.ESCOPOS, 'openid email profile org offline_access')
})
