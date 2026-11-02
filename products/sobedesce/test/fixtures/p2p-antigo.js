// Os laços de espera dos apps ANTIGOS (antes de 02/11/2026), copiados sem mudar a lógica, para provar que eles recuam
// diante das rotas /api/p2p/* descontinuadas (503) em vez de entrar em laço apertado. Não é usado pelo app: só pelo
// teste test/celular-p2p-antigo.test.js. Origem: src/celular/wifi.js (#laco) e web/public/app/lib/p2p.js (rodarEspera)
// da main em 2026-11-02 (commit 14105457).

const BACKOFF_MIN_MS = 2_000
const BACKOFF_MAX_MS = 60_000

/** Computador antigo: `cloud.request` lança HttpError fora de 200; reauth para; o resto dorme 2 s, 4 s… até 60 s. */
export async function lacoComputadorAntigo({ cloud, rodando, sleep }) {
  let espera = BACKOFF_MIN_MS
  while (rodando()) {
    try {
      const { data } = await cloud.request('GET', '/api/p2p/espera?nome=Mac', { timeoutMs: 40_000 })
      espera = BACKOFF_MIN_MS
      void data
    } catch (err) {
      if (err?.kind === 'reauth' || err?.reason === 'cloudSignedOut') return 'saiu-da-conta'
      await sleep(espera)
      espera = Math.min(BACKOFF_MAX_MS, espera * 2)
    }
  }
  return 'parou'
}

/** Celular antigo: `fetch` cru; 401 desliga; fora de 2xx conta falha e dorme min(30 s, 2^falhas s). */
export async function lacoCelularAntigo({ fetch, ativo, dormir }) {
  let falhas = 0
  while (ativo()) {
    try {
      const res = await fetch('/api/p2p/espera?nome=iPhone')
      if (res.status === 401) return 'desligou'
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await res.json()
      falhas = 0
    } catch {
      falhas++
      await dormir(Math.min(30_000, 1000 * 2 ** Math.min(falhas, 5)))
    }
  }
  return 'parou'
}
