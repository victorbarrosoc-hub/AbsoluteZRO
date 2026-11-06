// Servidores de conexão (pedirIceServers): sem a chave, só STUN; com a chave, o pedido certo à Cloudflare (Bearer,
// ttl de 6 h) e a porta 53 fora da lista; a Cloudflare fora do ar ou recusando, volta para STUN sem quebrar o rádio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pedirIceServers, STUN_PADRAO, TURN_TTL_S } from '../api/_nucleo.js'

const CHAVE = { CLOUDFLARE_TURN_KEY_ID: 'chave_teste_123', CLOUDFLARE_TURN_API_TOKEN: 'token-de-teste' }

test('sem a chave: só STUN, sem chamar ninguém', async () => {
  let chamou = false
  const r = await pedirIceServers({}, async () => (chamou = true))
  assert.deepEqual(r, { iceServers: STUN_PADRAO, turn: false })
  assert.equal(chamou, false)
})

test('com a chave: pede à Cloudflare e tira a porta 53', async () => {
  let pedido
  const r = await pedirIceServers(CHAVE, async (url, init) => {
    pedido = { url, init }
    return {
      ok: true,
      json: async () => ({
        iceServers: [
          { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
          { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
        ],
      }),
    }
  })
  assert.equal(pedido.url, 'https://rtc.live.cloudflare.com/v1/turn/keys/chave_teste_123/credentials/generate-ice-servers')
  assert.equal(pedido.init.method, 'POST')
  assert.equal(pedido.init.headers.authorization, 'Bearer token-de-teste')
  assert.deepEqual(JSON.parse(pedido.init.body), { ttl: TURN_TTL_S })
  assert.equal(r.turn, true)
  assert.deepEqual(r.iceServers, [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
  ])
})

test('Cloudflare recusando ou fora do ar: volta para STUN', async () => {
  assert.deepEqual(await pedirIceServers(CHAVE, async () => ({ ok: false, json: async () => ({}) })), { iceServers: STUN_PADRAO, turn: false })
  assert.deepEqual(
    await pedirIceServers(CHAVE, async () => {
      throw new Error('rede')
    }),
    { iceServers: STUN_PADRAO, turn: false },
  )
})
