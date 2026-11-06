// Download rápido (desktop/baixador.cjs, ADR 0043): pedaços em paralelo com Range, retomada, link vencido, espelho com
// o GitHub de reserva e SHA-256 conferido antes de instalar. Servidores falsos em memória e um servidor HTTP de verdade
// (para o https/http do Node com IPv4 primeiro, download.cjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { baixarDe, baixarComReserva, dividir, lerContentRange, comOrigem } = require('../desktop/baixador.cjs')
const { criarFetchDireto } = require('../desktop/download.cjs')
const { baixar, ErroCentral } = require('../desktop/central.cjs')
const regras = require('../desktop/regras.cjs')
const { Atualizador } = require('../desktop/atualizador.cjs')

const MB = 1024 * 1024
const sha = (b) => createHash('sha256').update(b).digest('hex')
const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zro-baixador-'))
const ESPELHO = 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/apps/synquei-app-desktop/Synquei-1.2.0-b40-mac-universal.dmg'

/** Corpo em pedaços pequenos; `cair` = bytes depois dos quais a "rede cai"; `parar` = fica parado depois deles. */
function corpo(buf, { cair = null, parar = null, signal } = {}) {
  let pos = 0
  return new globalThis.ReadableStream({
    pull(c) {
      if (signal && signal.aborted) return c.error(new Error('abortado'))
      if (cair != null && pos >= cair) return c.error(new Error('rede caiu'))
      if (parar != null && pos >= parar)
        return new Promise((_, falha) => signal && signal.addEventListener('abort', () => falha(new Error('abortado')), { once: true })).catch((e) =>
          c.error(e),
        )
      if (pos >= buf.length) return c.close()
      const fim = Math.min(buf.length, pos + 256 * 1024, cair ?? Infinity, parar ?? Infinity)
      c.enqueue(new Uint8Array(buf.subarray(pos, fim)))
      pos = fim
    },
  })
}

/**
 * Um servidor falso com a forma de fetch que o baixador usa. `range`: aceita Range. `pedidos`: o que chegou.
 * `falhar(pedido, n)` → { cair?, parar?, status? } para simular problemas no n-ésimo pedido.
 */
function servidor(buf, { range = true, url = 'https://objects.githubusercontent.com/x', falhar = () => null } = {}) {
  const pedidos = []
  let abertos = 0
  let maxAbertos = 0
  const f = async (pedido, { headers = {}, signal } = {}) => {
    const n = pedidos.length
    pedidos.push({ url: pedido, range: headers.range || null })
    const problema = falhar(pedidos[n], n) || {}
    if (problema.status) return { ok: false, status: problema.status, url, headers: new Headers(), body: corpo(Buffer.alloc(0)) }
    const m = range && headers.range ? /^bytes=(\d+)-(\d*)$/.exec(headers.range) : null
    abertos++
    maxAbertos = Math.max(maxAbertos, abertos)
    const fechar = () => abertos--
    if (!m) {
      const b = corpo(buf, { ...problema, signal })
      return { ok: true, status: 200, url, headers: new Headers({ 'content-length': String(buf.length) }), body: comFim(b, fechar) }
    }
    const ini = Number(m[1])
    const fim = m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1
    const parte = buf.subarray(ini, fim + 1)
    return {
      ok: true,
      status: 206,
      url,
      headers: new Headers({ 'content-range': `bytes ${ini}-${fim}/${buf.length}`, 'content-length': String(parte.length) }),
      body: comFim(corpo(parte, { ...problema, signal }), fechar),
    }
  }
  f.pedidos = pedidos
  f.max = () => maxAbertos
  return f
}

/** Chama `fim` quando o corpo termina (bem ou mal), para contar conexões abertas ao mesmo tempo. */
function comFim(stream, fim) {
  const leitor = stream.getReader()
  let feito = false
  const uma = () => {
    if (!feito) {
      feito = true
      fim()
    }
  }
  return new globalThis.ReadableStream({
    async pull(c) {
      try {
        const { done, value } = await leitor.read()
        if (done) {
          uma()
          c.close()
        } else c.enqueue(value)
      } catch (e) {
        uma()
        c.error(e)
      }
    },
    cancel() {
      uma()
      return leitor.cancel().catch(() => {})
    },
  })
}

test('dividir e Content-Range', () => {
  assert.deepEqual(dividir(10, 4), [
    { ini: 0, fim: 3 },
    { ini: 4, fim: 7 },
    { ini: 8, fim: 9 },
  ])
  assert.deepEqual(dividir(0, 4), [])
  assert.deepEqual(dividir(8, 4).at(-1), { ini: 4, fim: 7 })
  assert.deepEqual(lerContentRange('bytes 0-0/1234'), { ini: 0, fim: 0, total: 1234 })
  assert.deepEqual(lerContentRange('bytes 5-9/*'), { ini: 5, fim: 9, total: null })
  assert.equal(lerContentRange('bytes 9-5/10'), null)
  assert.equal(lerContentRange('bytes 0-10/10'), null)
  assert.equal(lerContentRange('lixo'), null)
  assert.equal(comOrigem('https://absolutezro.com/baixar/hub/mac?build=12', 'github'), 'https://absolutezro.com/baixar/hub/mac?build=12&origem=github')
  assert.equal(comOrigem('https://h/baixar/app/x/a.dmg?origem=espelho', 'github'), 'https://h/baixar/app/x/a.dmg?origem=github')
  assert.equal(comOrigem('u', 'github'), 'u')
})

test('paralelo: pedaços com Range em até 6 conexões, arquivo inteiro e o SHA-256 certo', async () => {
  const buf = randomBytes(5 * MB + 123)
  const s = servidor(buf)
  const dir = pasta()
  const progresso = []
  const r = await baixarDe('https://absolutezro.com/baixar/app/x/a.dmg', path.join(dir, 'a'), {
    abrir: s,
    direto: s,
    fs,
    tamanho: buf.length,
    pedaco: 512 * 1024,
    aoProgresso: (rec, tot) => progresso.push([rec, tot]),
  })
  assert.equal(r.paralelo, true)
  assert.equal(r.sha256, sha(buf))
  assert.deepEqual(fs.readFileSync(path.join(dir, 'a')), buf)
  // o primeiro pedido é o de um byte; depois 11 pedaços de 512 KB
  assert.equal(s.pedidos[0].range, 'bytes=0-0')
  assert.equal(s.pedidos.length, 1 + dividir(buf.length, 512 * 1024).length)
  assert.ok(s.max() <= 6, `conexões ao mesmo tempo: ${s.max()}`)
  assert.ok(s.max() > 1)
  assert.deepEqual(progresso.at(-1), [buf.length, buf.length])
})

test('sem Range: uma conexão só, como antes', async () => {
  const buf = randomBytes(700 * 1024)
  const s = servidor(buf, { range: false })
  const dir = pasta()
  const r = await baixarDe('https://x/a', path.join(dir, 'a'), { abrir: s, direto: s, fs, tamanho: buf.length })
  assert.equal(r.paralelo, false)
  assert.equal(r.sha256, sha(buf))
  assert.equal(s.pedidos.length, 1)
})

test('retomada: o pedaço que cai volta de onde parou (Range a partir do byte já gravado)', async () => {
  const buf = randomBytes(2 * MB)
  let caiu = false
  const s = servidor(buf, {
    falhar: (p) => {
      if (!caiu && p.range === `bytes=${MB}-${2 * MB - 1}`) {
        caiu = true
        return { cair: 300 * 1024 }
      }
      return null
    },
  })
  const dir = pasta()
  const r = await baixarDe('https://x/a', path.join(dir, 'a'), { abrir: s, direto: s, fs, tamanho: buf.length, pedaco: MB, espera: 1 })
  assert.equal(r.sha256, sha(buf))
  // o pedaço de 1 MB caiu depois de 300 KB: o pedido seguinte começa ali, não do início do pedaço
  const retomada = s.pedidos.find((p) => p.range === `bytes=${MB + 300 * 1024}-${2 * MB - 1}`)
  assert.ok(retomada, `pedidos: ${s.pedidos.map((p) => p.range).join(', ')}`)
})

test('parado: o pedaço que não anda é cancelado e pedido de novo', async () => {
  const buf = randomBytes(1 * MB)
  let parou = false
  const s = servidor(buf, {
    falhar: (p) => {
      if (!parou && p.range === `bytes=${512 * 1024}-${MB - 1}`) {
        parou = true
        return { parar: 0 }
      }
      return null
    },
  })
  const dir = pasta()
  const r = await baixarDe('https://x/a', path.join(dir, 'a'), { abrir: s, direto: s, fs, tamanho: buf.length, pedaco: 512 * 1024, paradoMs: 80, espera: 1 })
  assert.equal(r.sha256, sha(buf))
  assert.equal(s.pedidos.filter((p) => p.range === `bytes=${512 * 1024}-${MB - 1}`).length, 2)
})

test('link assinado vencido (403): renova pelo endereço original e segue', async () => {
  const buf = randomBytes(1 * MB)
  let venceu = 0
  const abrir = servidor(buf, { url: 'https://release-assets.githubusercontent.com/novo' })
  const direto = servidor(buf, {
    falhar: () => (venceu++ < 2 ? { status: 403 } : null),
  })
  const dir = pasta()
  const r = await baixarDe('https://absolutezro.com/baixar/app/x/a.dmg', path.join(dir, 'a'), {
    abrir,
    direto,
    fs,
    tamanho: buf.length,
    pedaco: MB,
    espera: 1,
    conexoes: 1,
  })
  assert.equal(r.sha256, sha(buf))
  // o primeiro salto e a renovação passaram pelo endereço original (o HUB)
  assert.ok(abrir.pedidos.filter((p) => p.url === 'https://absolutezro.com/baixar/app/x/a.dmg').length >= 2)
})

test('tamanho diferente do catálogo: não confere (nem começa os pedaços)', async () => {
  const buf = randomBytes(1000)
  const s = servidor(buf)
  await assert.rejects(baixarDe('https://x/a', path.join(pasta(), 'a'), { abrir: s, fs, tamanho: 999 }), (e) => e.conferencia === true)
  assert.equal(s.pedidos.length, 1)
})

test('reserva: espelho com arquivo errado ou fora do ar passa para o GitHub; SHA-256 sempre conferido', async () => {
  const certo = randomBytes(600 * 1024)
  const errado = Buffer.from(certo)
  errado[1000] ^= 0xff
  const espelho = servidor(errado, { url: ESPELHO })
  const github = servidor(certo)
  const abrir = (u, o) => (u.includes('origem=espelho') ? espelho : github)(u, o)
  const dir = pasta()
  const urls = ['https://absolutezro.com/baixar/app/synquei/a.dmg?origem=espelho', 'https://absolutezro.com/baixar/app/synquei/a.dmg']
  const r = await baixarComReserva(urls, path.join(dir, 'a'), { abrir, fs, sha256: sha(certo), tamanho: certo.length, pedaco: 256 * 1024 })
  assert.equal(r.confere, true)
  assert.deepEqual(fs.readFileSync(path.join(dir, 'a')), certo)
  assert.ok(espelho.pedidos.length > 0 && github.pedidos.length > 0)

  // espelho fora do ar
  const fora = async () => Promise.reject(new Error('ECONNRESET'))
  const r2 = await baixarComReserva(urls, path.join(dir, 'b'), { abrir: (u, o) => (u.includes('espelho') ? fora : github)(u, o), fs, sha256: sha(certo) })
  assert.equal(r2.confere, true)

  // só o último endereço deu arquivo, e ele não bate: devolve o SHA-256 obtido (quem chama decide)
  const r3 = await baixarComReserva(urls, path.join(dir, 'c'), { abrir: servidor(errado), fs, sha256: sha(certo) })
  assert.equal(r3.confere, false)
  assert.equal(r3.sha256, sha(errado))
})

test('central: espelho errado cai no GitHub; os dois errados = "não confere" e nada fica no disco', async () => {
  const certo = randomBytes(300 * 1024)
  const errado = Buffer.from(certo)
  errado[0] ^= 1
  const dir = pasta()
  const urls = ['https://h/baixar/app/x/a.dmg?origem=espelho', 'https://h/baixar/app/x/a.dmg']
  const espelho = servidor(errado)
  const github = servidor(certo)
  const deps = { fs, fetch: (u, o) => (u.includes('espelho') ? espelho : github)(u, o) }
  const ok = await baixar({ urls, destino: path.join(dir, 'a.dmg'), sha256: sha(certo), tamanho: certo.length, deps })
  assert.deepEqual(fs.readFileSync(ok), certo)
  await assert.rejects(
    baixar({ urls, destino: path.join(dir, 'b.dmg'), sha256: sha(certo), tamanho: certo.length, deps: { fs, fetch: servidor(errado) } }),
    (e) => e instanceof ErroCentral && e.codigo === 'conferencia',
  )
  assert.equal(fs.existsSync(path.join(dir, 'b.dmg')), false)
  assert.equal(fs.existsSync(path.join(dir, 'b.dmg.parte')), false)
  // cancelado no meio: a mensagem de cancelado e nenhum pedaço no disco
  const ac = new globalThis.AbortController()
  const lento = servidor(certo, { falhar: (p) => (p.range && p.range !== 'bytes=0-0' ? { parar: 0 } : null) })
  setTimeout(() => ac.abort(), 30)
  await assert.rejects(
    baixar({ urls, destino: path.join(dir, 'c.dmg'), sha256: sha(certo), tamanho: certo.length, signal: ac.signal, deps: { fs, fetch: lento } }),
    (e) => e.codigo === 'download' && /cancelado/.test(e.message),
  )
  assert.equal(fs.existsSync(path.join(dir, 'c.dmg.parte')), false)
})

test('regras: o espelho (bucket público apps do Supabase) entra; outro host, porta ou caminho não', () => {
  const HUB = 'https://absolutezro.com'
  assert.equal(regras.downloadPermitido(ESPELHO, HUB), true)
  assert.equal(regras.ehDoEspelho(ESPELHO), true)
  assert.equal(regras.downloadPermitido(ESPELHO.replace('https:', 'http:'), HUB), false)
  assert.equal(regras.downloadPermitido(ESPELHO.replace('.supabase.co', '.supabase.co:8443'), HUB), false)
  assert.equal(regras.downloadPermitido(ESPELHO.replace('/public/apps/', '/public/outro/'), HUB), false)
  assert.equal(regras.downloadPermitido(ESPELHO.replace('/object/public/', '/object/sign/'), HUB), false)
  assert.equal(regras.downloadPermitido(ESPELHO.replace('abcdefghijklmnopqrst', 'curto'), HUB), false)
  assert.equal(regras.downloadPermitido(ESPELHO.replace('supabase.co', 'supabase.co.evil.com'), HUB), false)
  assert.equal(regras.downloadPermitido('https://abcdefghijklmnopqrst.supabase.co/rest/v1/x', HUB), false)
  assert.equal(regras.downloadPermitido('https://u:p@abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/apps/t/a.dmg', HUB), false)
  // o resto continua como era
  assert.equal(regras.downloadPermitido('https://objects.githubusercontent.com/x', HUB), true)
  assert.equal(regras.downloadPermitido('https://example.com/a.dmg', HUB), false)
})

test('direto (https do Node): IPv4 primeiro, Range repassado e cada redirecionamento conferido', async () => {
  const buf = randomBytes(64 * 1024)
  const vistos = []
  const srv = http.createServer((req, res) => {
    vistos.push({ url: req.url, familia: req.socket.remoteFamily, range: req.headers.range || null })
    if (req.url === '/hub') return res.writeHead(302, { location: '/arquivo' }).end()
    if (req.url === '/fora') return res.writeHead(302, { location: 'http://outro.example/x' }).end()
    const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '')
    if (m) {
      const ini = Number(m[1])
      const fim = Number(m[2])
      res.writeHead(206, { 'content-range': `bytes ${ini}-${fim}/${buf.length}`, 'content-length': fim - ini + 1 })
      return res.end(buf.subarray(ini, fim + 1))
    }
    res.writeHead(200, { 'content-length': buf.length }).end(buf)
  })
  await new Promise((ok) => srv.listen(0, 'localhost', ok))
  const base = `http://localhost:${srv.address().port}`
  try {
    const direto = criarFetchDireto({ https: http, permitido: (u) => u.startsWith(base) })
    const dir = pasta()
    const r = await baixarDe(`${base}/hub`, path.join(dir, 'a'), { abrir: direto, direto, fs, tamanho: buf.length, pedaco: 16 * 1024, permitirHttp: true })
    assert.equal(r.sha256, sha(buf))
    assert.equal(r.url, `${base}/arquivo`)
    assert.ok(vistos.length > 2 && vistos.every((v) => v.familia === 'IPv4'))
    assert.equal(vistos[0].range, 'bytes=0-0')
    await assert.rejects(direto(`${base}/fora`), (e) => e.recusado === true)
    await assert.rejects(direto('http://outro.example/x'), (e) => e.recusado === true)
  } finally {
    srv.close()
  }
})

test('atualizar a própria central: o espelho com arquivo errado cai no ?origem=github do mesmo build', async () => {
  const certo = randomBytes(200 * 1024)
  const errado = Buffer.from(certo)
  errado[5] ^= 1
  const pedidos = []
  const fetchDireto = async (u, o) => {
    pedidos.push(u)
    return servidor(u.includes('origem=github') ? certo : errado, { url: u })(u, o)
  }
  const a = new Atualizador({ platform: 'linux', fetchDireto, tmpRoot: pasta() })
  const arquivo = path.join(pasta(), 'AbsoluteZRO.dmg')
  const got = await a.baixar('https://absolutezro.com/baixar/hub/mac?build=30', arquivo, () => {}, {
    urls: ['https://absolutezro.com/baixar/hub/mac?build=30', comOrigem('https://absolutezro.com/baixar/hub/mac?build=30', 'github')],
    sha256: sha(certo),
  })
  assert.equal(got, sha(certo))
  assert.ok(pedidos.some((u) => u.endsWith('?build=30')) && pedidos.some((u) => u.endsWith('&origem=github')))
})

test('caminho direto que nunca conecta (proxy do sistema): os pedaços passam para o caminho do primeiro salto', async () => {
  const buf = randomBytes(2 * MB)
  const abrir = servidor(buf)
  let tentativasDiretas = 0
  const direto = async () => {
    tentativasDiretas++
    throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
  }
  const r = await baixarDe('https://x/a', path.join(pasta(), 'a'), { abrir, direto, fs, tamanho: buf.length, pedaco: 256 * 1024, espera: 1, conexoes: 2 })
  assert.equal(r.sha256, sha(buf))
  // 8 pedaços: o direto desiste depois de poucas falhas, não 3 por pedaço
  assert.ok(tentativasDiretas <= 4, `tentativas diretas: ${tentativasDiretas}`)
})
