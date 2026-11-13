// App FECHADO (raiz CLAUDE.md: app não lançado não aparece em lugar nenhum). Confere:
//   - o que o publico/ leva (só fontes, bibliotecas, modelos, robots e a página neutra) e que nada ali tem o nome;
//   - o vercel.json (rewrites, includeFiles, cabeçalhos, sem COEP);
//   - o gate pelas funções: sem sessão, sem a claim, cookie adulterado ou login desligado → página neutra em / e 404
//     neutro em /app/... e /src/...; com a claim → a casca e os arquivos;
//   - o mesmo pelo servidor local (scripts/servir.mjs), com os cabeçalhos de produção;
//   - no Chromium: a casca abre sem erro de CSP, importa /vendor/preact e instancia o libraw.wasm.
// O nome do produto vem sempre de app/nome.js (nenhum teste escreve o nome à mão).

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ASSINATURA, NOME } from '../app/nome.js'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const EXIGIR = process.env.FOTO_EXIGIR === '1'
const SEGREDO = 'segredo-de-teste-que-so-existe-aqui'
const SITE = 'foto.absolutezro.com'
const NEUTRA = readFileSync(join(RAIZ, 'app/indisponivel.html'))
/** A página neutra da família (products/radio/app/indisponivel.html): a daqui é a mesma, byte a byte. */
const SHA_DA_NEUTRA = 'c95ad2f2fef06e5050bdea6930b5d8dbc3cd24ca5ef96b16ee9e9e8b9585b6da'

let saida, z, sessao, rotas, publicado

const pedido = (url, { cookie = '', metodo = 'GET', host = SITE, cabecalhos = {} } = {}) => ({ url, method: metodo, headers: { host, 'x-forwarded-proto': 'https', cookie, ...cabecalhos } })
const resposta = () => {
  const r = { statusCode: 0, headers: {}, corpo: Buffer.alloc(0) }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.end = (c) => (r.corpo = c == null ? Buffer.alloc(0) : Buffer.from(c))
  return r
}
const chamar = async (rota, url, opcoes) => {
  const r = resposta()
  await rotas[rota](pedido(url, opcoes), r)
  return r
}
const ehNeutra = (r) => r.corpo.equals(NEUTRA)
const temNome = (bytes) => bytes.toString('latin1').toLowerCase().includes(NOME.toLowerCase()) || bytes.toString('utf8').includes(ASSINATURA)
/** Um .js qualquer do núcleo (src/ é de outro módulo: o teste usa o que existir). */
function umDoNucleo(pasta = 'src') {
  if (!existsSync(join(RAIZ, pasta))) return null
  for (const e of readdirSync(join(RAIZ, pasta), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) {
      const achado = umDoNucleo(`${pasta}/${e.name}`)
      if (achado) return achado
    } else if (e.name.endsWith('.js')) return `${pasta}/${e.name}`
  }
  return null
}
function arquivosDe(pasta, base = '') {
  const lista = []
  for (const e of readdirSync(join(pasta, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) lista.push(...arquivosDe(pasta, rel))
    else lista.push(rel)
  }
  return lista.sort()
}

before(async () => {
  process.env.ZRO_CLIENT_ID = 'foto-web'
  process.env.ZRO_CLIENT_SECRET = SEGREDO
  // nenhum teste daqui fala com a Absolute ZRO de verdade: o emissor aponta para uma porta fechada
  process.env.ZRO_ISSUER = 'http://127.0.0.1:9'
  delete process.env.FOTO_LOCAL
  delete process.env.FOTO_SITE
  delete process.env.FOTO_DATABASE_URL
  saida = mkdtempSync(join(tmpdir(), 'foto-publico-'))
  const { publicar } = await import('../publicar.mjs')
  publicado = await publicar({ saida, baixarModelos: false })
  z = await import('../api/_zro.js')
  sessao = (apps, sub = 'zro-1') => `foto_conta=${z.selar(z.COOKIE_CONTA, { sub, nome: 'Lia Fotógrafa', email: 'lia@exemplo.com', apps, org: { id: 'org-1', nome: 'Estúdio Lia', papel: 'owner' }, lido: Math.floor(Date.now() / 1000) }, 3600)}`
  rotas = {
    pagina: (await import('../api/pagina.js')).default,
    recurso: (await import('../api/recurso.js')).default,
    local: (await import('../api/local.js')).default,
    eu: (await import('../api/zro/eu.js')).default,
    saude: (await import('../api/foto/saude.js')).default,
  }
})
after(() => {
  if (saida) rmSync(saida, { recursive: true, force: true })
})

test('a página neutra é a da família, byte a byte, e não diz o que é o app', () => {
  const irma = join(RAIZ, '../radio/app/indisponivel.html')
  if (existsSync(irma)) assert.ok(NEUTRA.equals(readFileSync(irma)), 'app/indisponivel.html difere da do RADION')
  assert.equal(createHash('sha256').update(NEUTRA).digest('hex'), SHA_DA_NEUTRA, 'a página neutra mudou: ela é a mesma em todos os apps não lançados')
  const t = NEUTRA.toString('utf8')
  assert.match(t, /<title>Absolute ZRO<\/title>/)
  assert.match(t, /Página <\/span><b>indisponível\.<\/b>/)
  assert.match(t, /noindex, nofollow/)
  assert.ok(!temNome(NEUTRA))
  assert.doesNotMatch(t, /foto|raw|revela/i)
})

test('publico/ fechado: só fontes, bibliotecas, modelos, robots e a página neutra', () => {
  assert.deepEqual(readdirSync(saida).sort(), ['404.html', 'fontes', 'modelos', 'modelos.json', 'robots.txt', 'vendor'])
  assert.ok(readFileSync(join(saida, '404.html')).equals(NEUTRA))
  assert.equal(readFileSync(join(saida, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n')
  const arquivos = arquivosDe(saida)
  // nada do app: nem tela, nem núcleo, nem manifesto, nem ícone, nem imagem de compartilhar
  for (const f of arquivos) {
    assert.doesNotMatch(f, /^(app|src|api|db|test|scripts|docs|marca)\//, f)
    assert.doesNotMatch(f, /(manifest|\.webmanifest|og\.|icone|favicon|apple-touch|index\.html|nome\.js|principal\.js)/i, f)
  }
  // fontes e bibliotecas de terceiros, com as licenças junto
  for (const f of ['fontes/figtree-latin-wght-normal.woff2', 'fontes/OFL-figtree.txt', 'vendor/libraw/libraw.wasm', 'vendor/libraw/LibRaw/LICENSE.LGPL', 'vendor/preact/preact.mjs', 'vendor/htm/preact.mjs', 'vendor/README.md']) {
    assert.ok(arquivos.includes(f), f)
  }
  // o MediaPipe vem de node_modules no build (não está no git)
  assert.ok(!existsSync(join(RAIZ, 'vendor/mediapipe')), 'o MediaPipe não é versionado')
  assert.equal(publicado.mediapipe, JSON.parse(readFileSync(join(RAIZ, 'node_modules/@mediapipe/tasks-vision/package.json'), 'utf8')).version)
  for (const f of ['vendor/mediapipe/vision_bundle.mjs', 'vendor/mediapipe/wasm/vision_wasm_module_internal.wasm', 'vendor/mediapipe/wasm/vision_wasm_internal.wasm', 'vendor/mediapipe/LICENSE-Apache-2.0.txt']) {
    assert.ok(arquivos.includes(f), f)
  }
  // a lista dos modelos diz o que veio e o que faltou; só entra arquivo conferido
  const lista = JSON.parse(readFileSync(join(saida, 'modelos.json'), 'utf8'))
  assert.equal(lista.modelos.length, 4)
  for (const m of lista.modelos) {
    assert.equal(existsSync(join(saida, 'modelos', m.arquivo)), m.pronto, m.arquivo)
    if (m.pronto) assert.equal(createHash('sha256').update(readFileSync(join(saida, 'modelos', m.arquivo))).digest('hex'), m.sha256)
    assert.ok(!('url' in m))
  }
})

test('nada no estático tem o nome do produto nem a assinatura', () => {
  for (const f of arquivosDe(saida)) assert.ok(!temNome(readFileSync(join(saida, f))), `${f} tem o nome do produto`)
})

test('o nome mora só em app/nome.js: api/, scripts, vendor, banco e configuração não escrevem', () => {
  const pastas = ['api', 'scripts', 'vendor', 'db', 'fontes']
  const soltos = ['vercel.json', 'publicar.mjs', 'package.json', 'modelos.json', 'app/index.html', 'app/manifest.webmanifest', 'app/principal.js', 'app/indisponivel.html']
  const lista = [...soltos, ...pastas.flatMap((p) => (existsSync(join(RAIZ, p)) ? arquivosDe(join(RAIZ, p)).map((f) => `${p}/${f}`) : []))]
  for (const f of lista) assert.ok(!temNome(readFileSync(join(RAIZ, f))), `${f} escreve o nome do produto à mão`)
})

test('vercel.json: build fechado, funções com app/ e src/, rewrites e cabeçalhos (sem COEP)', () => {
  const c = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'))
  assert.equal(c.framework, null)
  assert.equal(c.installCommand, 'npm ci --omit=dev --no-audit --no-fund')
  assert.equal(c.buildCommand, 'node publicar.mjs')
  assert.equal(c.outputDirectory, 'publico')
  assert.equal(c.cleanUrls, true)
  assert.deepEqual(c.regions, ['gru1'])
  for (const f of ['api/pagina.js', 'api/recurso.js']) {
    assert.match(c.functions[f].includeFiles, /app\/\*\*/)
    assert.match(c.functions[f].includeFiles, /src\/\*\*/)
  }
  const destino = (origem) => c.rewrites.find((r) => r.source === origem)?.destination
  assert.equal(destino('/'), '/api/pagina')
  assert.equal(destino('/entrar'), '/api/zro/entrar')
  assert.equal(destino('/app/:f*'), '/api/recurso?pasta=app&f=:f*')
  assert.equal(destino('/src/:f*'), '/api/recurso?pasta=src&f=:f*')
  assert.equal(destino('/api/zro/set/:caminho*'), '/api/zro/set?c=:caminho*')
  // nenhum rewrite entrega arquivo sem passar por função
  for (const r of c.rewrites) assert.match(r.destination, /^\/api\//, r.source)
  const de = (origem) => Object.fromEntries(c.headers.find((h) => h.source === origem).headers.map((h) => [h.key, h.value]))
  const todos = de('/(.*)')
  assert.equal(todos['X-Content-Type-Options'], 'nosniff')
  assert.equal(todos['Referrer-Policy'], 'strict-origin-when-cross-origin')
  assert.equal(todos['X-Robots-Tag'], 'noindex, nofollow')
  assert.equal(todos['Cross-Origin-Opener-Policy'], 'same-origin')
  assert.match(todos['Permissions-Policy'], /camera=\(\)/)
  // decisão do contrato: sem COEP, para não barrar o quadro do Drive depois
  assert.ok(!('Cross-Origin-Embedder-Policy' in todos))
  assert.equal(
    todos['Content-Security-Policy'],
    "default-src 'self'; img-src 'self' blob: data: https://absolutezro.com; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://absolutezro.com; worker-src 'self' blob:; connect-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  )
  assert.equal(de('/api/(.*)')['Cache-Control'], 'no-store')
  assert.equal(de('/(fontes|vendor|modelos)/(.*)')['Cache-Control'], 'public, max-age=31536000, immutable')
  // as bibliotecas do vendor/ versionado vêm de devDependencies; o que o build copia de node_modules, de dependencies
  const p = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'))
  assert.ok(p.dependencies['@mediapipe/tasks-vision'], 'o build roda com --omit=dev')
  assert.ok(p.dependencies.postgres)
})

test('caminhoSeguro: só arquivo dentro de app/ ou src/', async () => {
  const { caminhoSeguro } = await import('../api/recurso.js')
  assert.equal(caminhoSeguro('app/principal.js'), 'app/principal.js')
  assert.equal(caminhoSeguro('src/motor/ajustes.js'), 'src/motor/ajustes.js')
  assert.equal(caminhoSeguro('app//telas/./inicio.js'), 'app/telas/inicio.js')
  for (const ruim of [
    '',
    null,
    undefined,
    42,
    'app',
    'app/',
    'src/motor/',
    'principal.js',
    'api/_zro.js',
    'vendor/libraw/index.js',
    'package.json',
    '../api/_zro.js',
    'app/../api/_zro.js',
    'app/../../etc/passwd',
    'src/..',
    'app/.env',
    'app/.oculto/x.js',
    '.modelos/face_landmarker.task',
    'app\\principal.js',
    'app/%2e%2e/api/_zro.js',
    'app/a\0.js',
    '/etc/passwd',
    'node_modules/postgres/package.json',
    `app/${'a'.repeat(300)}.js`,
  ]) {
    assert.equal(caminhoSeguro(ruim), null, String(ruim))
  }
})

test('sem sessão: página neutra em / e 404 neutro em /app/... e /src/...', async () => {
  const p = await chamar('pagina', '/api/pagina')
  assert.equal(p.statusCode, 200)
  assert.ok(ehNeutra(p))
  assert.equal(p.headers['cache-control'], 'no-store')
  assert.equal(p.headers['set-cookie'], undefined)
  const nucleo = umDoNucleo()
  for (const url of ['/api/recurso?pasta=app&f=principal.js', '/api/recurso?pasta=app&f=nome.js', '/api/recurso?pasta=app&f=index.html', '/api/recurso?pasta=app&f=manifest.webmanifest', '/api/recurso?f=app/principal.js', ...(nucleo ? [`/api/recurso?pasta=src&f=${nucleo.slice(4)}`] : []), '/api/recurso?pasta=src&f=nao/existe.js', '/api/recurso']) {
    const r = await chamar('recurso', url)
    assert.equal(r.statusCode, 404, url)
    assert.ok(ehNeutra(r), url)
    assert.match(r.headers['content-type'], /^text\/html/)
    assert.equal(r.headers['cache-control'], 'no-store')
    assert.equal(r.headers.etag, undefined)
  }
  // HEAD não entrega corpo; outro método não passa
  assert.equal((await chamar('pagina', '/api/pagina', { metodo: 'HEAD' })).corpo.length, 0)
  assert.equal((await chamar('pagina', '/api/pagina', { metodo: 'POST' })).statusCode, 405)
  assert.equal((await chamar('recurso', '/api/recurso?pasta=app&f=principal.js', { metodo: 'POST' })).statusCode, 405)
  // /eu não diz o que é o app
  const eu = await chamar('eu', '/api/zro/eu')
  assert.deepEqual(JSON.parse(eu.corpo), { ok: false, configurado: true, entrar: '/api/zro/entrar' })
  assert.ok(!temNome(eu.corpo))
  assert.deepEqual(JSON.parse((await chamar('saude', '/api/foto/saude')).corpo), { ok: false })
})

test('sessão sem a claim, com a claim de outro app, expirada ou adulterada: neutro', async () => {
  const boa = sessao(['foto'])
  const casos = {
    'sem apps': sessao(null),
    'lista vazia': sessao([]),
    'outros apps': sessao(['radio', 'maestro', 'fotos', 'foto-web']),
    'apps não é lista': sessao('foto'),
    expirada: `foto_conta=${z.selar(z.COOKIE_CONTA, { sub: 'zro-1', apps: ['foto'] }, -10)}`,
    'assinatura trocada': `${boa.slice(0, -3)}${boa.endsWith('AAA') ? 'BBB' : 'AAA'}`,
    'corpo trocado': (() => {
      const [corpo, ass] = boa.slice('foto_conta='.length).split('.')
      const d = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'))
      return `foto_conta=${Buffer.from(JSON.stringify({ ...d, sub: 'zro-outra' })).toString('base64url')}.${ass}`
    })(),
    'cookie de outro nome': boa.replace('foto_conta=', 'foto_zro='),
    'selo de outro cookie': `foto_conta=${z.selar(z.COOKIE_IDA, { sub: 'zro-1', apps: ['foto'] }, 3600)}`,
    lixo: 'foto_conta=aaaa.bbbb',
  }
  for (const [nome, cookie] of Object.entries(casos)) {
    const p = await chamar('pagina', '/api/pagina', { cookie })
    assert.equal(p.statusCode, 200, nome)
    assert.ok(ehNeutra(p), nome)
    const r = await chamar('recurso', '/api/recurso?pasta=app&f=principal.js', { cookie })
    assert.equal(r.statusCode, 404, nome)
    assert.ok(ehNeutra(r), nome)
  }
})

test('sessão com a claim: a casca, os arquivos de app/ e o núcleo de src/', async () => {
  const cookie = sessao(['maestro', 'foto'])
  const p = await chamar('pagina', '/api/pagina', { cookie })
  assert.equal(p.statusCode, 200)
  const casca = p.corpo.toString('utf8')
  assert.ok(casca.includes(`<title>${NOME}</title>`))
  assert.match(casca, /<html lang="pt-BR" data-tema="claro">/)
  assert.match(casca, /<script type="module" src="\/app\/principal\.js"><\/script>/)
  assert.match(casca, /name="theme-color" content="#f5f5f7"/)
  assert.doesNotMatch(casca, /%[A-Z_]+%/)
  // sem script inline (a CSP não deixa) nem endereço de fora
  assert.doesNotMatch(casca, /<script(?![^>]*\bsrc=)[^>]*>/)
  assert.doesNotMatch(casca, /https?:\/\//)
  assert.equal(p.headers['cache-control'], 'no-store')
  // tema escolhido: já vem no HTML, sem piscar
  const escuro = (await chamar('pagina', '/api/pagina', { cookie: `${cookie}; foto_tema=escuro` })).corpo.toString('utf8')
  assert.match(escuro, /data-tema="escuro"/)
  assert.match(escuro, /name="theme-color" content="#0e0e10"/)
  assert.match((await chamar('pagina', '/api/pagina', { cookie: `${cookie}; foto_tema="><script>` })).corpo.toString('utf8'), /data-tema="claro"/)

  const js = await chamar('recurso', '/api/recurso?pasta=app&f=principal.js', { cookie })
  assert.equal(js.statusCode, 200)
  assert.equal(js.headers['content-type'], 'text/javascript; charset=utf-8')
  assert.equal(js.headers['cache-control'], 'private, no-cache')
  assert.ok(js.corpo.equals(readFileSync(join(RAIZ, 'app/principal.js'))))
  assert.equal(js.headers['content-length'], String(js.corpo.length))
  // revalidação: mesma ETag, 304 sem corpo; HEAD sem corpo
  const de_novo = await chamar('recurso', '/api/recurso?pasta=app&f=principal.js', { cookie, cabecalhos: { 'if-none-match': js.headers.etag } })
  assert.equal(de_novo.statusCode, 304)
  assert.equal(de_novo.corpo.length, 0)
  assert.equal((await chamar('recurso', '/api/recurso?pasta=app&f=principal.js', { cookie, metodo: 'HEAD' })).corpo.length, 0)
  // a outra forma do caminho (sem `pasta`)
  assert.equal((await chamar('recurso', '/api/recurso?f=app/nome.js', { cookie })).statusCode, 200)

  // o manifesto e a casca saem com o nome de app/nome.js
  const m = await chamar('recurso', '/api/recurso?pasta=app&f=manifest.webmanifest', { cookie })
  assert.equal(m.headers['content-type'], 'application/manifest+json; charset=utf-8')
  const manifesto = JSON.parse(m.corpo)
  assert.equal(manifesto.name, NOME)
  assert.equal(manifesto.description, ASSINATURA)
  assert.ok((await chamar('recurso', '/api/recurso?pasta=app&f=index.html', { cookie })).corpo.toString('utf8').includes(`<title>${NOME}</title>`))

  // o núcleo ESM (o navegador importa direto de /src)
  const nucleo = umDoNucleo()
  if (nucleo) {
    const n = await chamar('recurso', `/api/recurso?pasta=src&f=${nucleo.slice(4)}`, { cookie })
    assert.equal(n.statusCode, 200, nucleo)
    assert.equal(n.headers['content-type'], 'text/javascript; charset=utf-8')
    assert.ok(n.corpo.equals(readFileSync(join(RAIZ, nucleo))))
  }
  // mesmo com acesso: nada fora de app/ e src/, nada que não exista, e o 404 é a página neutra
  for (const url of ['/api/recurso?f=../api/_zro.js', '/api/recurso?pasta=app&f=../api/_zro.js', '/api/recurso?pasta=api&f=_zro.js', '/api/recurso?pasta=vendor&f=libraw/index.js', '/api/recurso?pasta=.&f=package.json', '/api/recurso?pasta=app&f=nao-existe.js', '/api/recurso?pasta=app&f=', '/api/recurso?pasta=app', '/api/recurso?pasta=src&f=motor']) {
    const r = await chamar('recurso', url, { cookie })
    assert.equal(r.statusCode, 404, url)
    assert.ok(ehNeutra(r), url)
  }
  // tipos: o que o navegador precisa para módulo e WebAssembly
  const { TIPOS } = await import('../api/recurso.js')
  assert.equal(TIPOS['.js'], 'text/javascript; charset=utf-8')
  assert.equal(TIPOS['.mjs'], 'text/javascript; charset=utf-8')
  assert.equal(TIPOS['.wasm'], 'application/wasm')
  assert.match(TIPOS['.json'], /^application\/json/)
  assert.match(TIPOS['.webmanifest'], /^application\/manifest\+json/)
  assert.equal(TIPOS['.svg'], 'image/svg+xml')
  assert.equal(TIPOS['.png'], 'image/png')
  assert.equal(TIPOS['.woff2'], 'font/woff2')
})

test('sem ZRO_CLIENT_ID ou ZRO_CLIENT_SECRET: tudo fechado, mesmo com um cookie que valia', async () => {
  const cookie = sessao(['foto'])
  for (const falta of ['ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET']) {
    const antes = process.env[falta]
    delete process.env[falta]
    try {
      assert.ok(ehNeutra(await chamar('pagina', '/api/pagina', { cookie })), falta)
      const r = await chamar('recurso', '/api/recurso?pasta=app&f=principal.js', { cookie })
      assert.equal(r.statusCode, 404, falta)
      assert.ok(ehNeutra(r), falta)
      assert.deepEqual(JSON.parse((await chamar('eu', '/api/zro/eu', { cookie })).corpo), { ok: false, configurado: false })
    } finally {
      process.env[falta] = antes
    }
  }
  assert.ok(!ehNeutra(await chamar('pagina', '/api/pagina', { cookie })))
})

test('modo local: só com FOTO_LOCAL=1, sem login configurado e em localhost', async () => {
  const id = process.env.ZRO_CLIENT_ID
  const seg = process.env.ZRO_CLIENT_SECRET
  try {
    // com o login configurado, FOTO_LOCAL não liga nada
    process.env.FOTO_LOCAL = '1'
    assert.ok(ehNeutra(await chamar('pagina', '/api/pagina', { host: 'localhost:8094' })))
    assert.equal((await chamar('local', '/api/local', { metodo: 'POST', host: 'localhost:8094' })).statusCode, 404)
    delete process.env.ZRO_CLIENT_ID
    delete process.env.ZRO_CLIENT_SECRET
    // fora de localhost, nunca
    for (const host of [SITE, 'foto-abc.vercel.app', 'localhost.exemplo.com', '127.0.0.1.exemplo.com']) {
      assert.ok(ehNeutra(await chamar('pagina', '/api/pagina', { host })), host)
      assert.equal((await chamar('recurso', '/api/recurso?pasta=app&f=principal.js', { host })).statusCode, 404, host)
      assert.equal((await chamar('local', '/api/local', { metodo: 'POST', host })).statusCode, 404, host)
    }
    // sem FOTO_LOCAL, nem em localhost
    delete process.env.FOTO_LOCAL
    assert.ok(ehNeutra(await chamar('pagina', '/api/pagina', { host: 'localhost:8094' })))
    // ligado: a primeira visita cria a pessoa deste navegador e abre a casca
    process.env.FOTO_LOCAL = '1'
    const p = await chamar('pagina', '/api/pagina', { host: 'localhost:8094' })
    assert.ok(p.corpo.toString('utf8').includes(`<title>${NOME}</title>`))
    const cookie = String(p.headers['set-cookie'][0]).split(';')[0]
    assert.match(cookie, /^foto_local=/)
    assert.equal((await chamar('recurso', '/api/recurso?pasta=app&f=principal.js', { host: 'localhost:8094', cookie })).statusCode, 200)
    assert.equal((await chamar('recurso', '/api/recurso?pasta=app&f=principal.js', { host: 'localhost:8094' })).statusCode, 404)
    const eu = JSON.parse((await chamar('eu', '/api/zro/eu', { host: 'localhost:8094', cookie })).corpo)
    assert.equal(eu.ok, true)
    assert.equal(eu.local, true)
    assert.equal(eu.acesso, true)
    // cookie local forjado com sub de verdade não vale
    const forjado = `foto_local=${Buffer.from(JSON.stringify({ sub: 'zro-1', nome: 'X' })).toString('base64url')}`
    assert.equal((await chamar('recurso', '/api/recurso?pasta=app&f=principal.js', { host: 'localhost:8094', cookie: forjado })).statusCode, 404)
  } finally {
    delete process.env.FOTO_LOCAL
    process.env.ZRO_CLIENT_ID = id
    process.env.ZRO_CLIENT_SECRET = seg
  }
})

test('rota da pessoa: 401 sem sessão liberada, 403 de outra origem, 503 sem banco', async () => {
  const { rota } = await import('../api/_rota.js')
  let rodou = 0
  const r = rota({ GET: async () => ({ status: 200, corpo: { ok: true, n: ++rodou } }), POST: async () => ({ status: 200, corpo: { ok: true, n: ++rodou } }) })
  const chamarRota = async (opcoes) => {
    const res = resposta()
    await r({ ...pedido('/api/foto/x', opcoes), body: {} }, res)
    return res
  }
  assert.equal((await chamarRota()).statusCode, 401)
  assert.equal((await chamarRota({ cookie: sessao(['radio']) })).statusCode, 401)
  assert.equal((await chamarRota({ cookie: sessao(['foto']), metodo: 'PUT' })).statusCode, 405)
  assert.equal((await chamarRota({ cookie: sessao(['foto']), metodo: 'POST', cabecalhos: { origin: 'https://outro.site' } })).statusCode, 403)
  assert.equal((await chamarRota({ cookie: sessao(['foto']) })).statusCode, 503)
  assert.equal(rodou, 0)
})

// ───────── pelo servidor local, com os cabeçalhos de produção ─────────

let servidor, base
const subir = async () => {
  if (servidor) return
  const { servir } = await import('../scripts/servir.mjs')
  servidor = await servir({ porta: 0, publico: saida })
  base = `http://127.0.0.1:${servidor.address().port}`
}
after(() => servidor?.close())

test('servidor local: reescreve como o vercel.json e aplica os cabeçalhos', async () => {
  const { reescrever, cabecalhosDe, PORTA } = await import('../scripts/servir.mjs')
  assert.equal(PORTA, 8094)
  const c = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'))
  assert.equal(reescrever('/', c.rewrites), '/api/pagina')
  assert.equal(reescrever('/entrar', c.rewrites), '/api/zro/entrar')
  assert.equal(reescrever('/app/principal.js', c.rewrites), '/api/recurso?pasta=app&f=principal.js')
  assert.equal(reescrever('/src/motor/ajustes.js', c.rewrites), '/api/recurso?pasta=src&f=motor%2Fajustes.js')
  assert.equal(reescrever('/api/zro/set/conversas/abc', c.rewrites), '/api/zro/set?c=conversas%2Fabc')
  assert.equal(reescrever('/qualquer', c.rewrites), null)
  assert.equal(reescrever('/vendor/preact/preact.mjs', c.rewrites), null)
  assert.equal(cabecalhosDe('/vendor/x.js', c.headers)['Cache-Control'], 'public, max-age=31536000, immutable')
  assert.equal(cabecalhosDe('/modelos.json', c.headers)['Cache-Control'], undefined)
  assert.equal(cabecalhosDe('/api/zro/eu', c.headers)['Cache-Control'], 'no-store')

  await subir()
  const pedir = (caminho, cookie) => fetch(base + caminho, { redirect: 'manual', headers: cookie ? { cookie } : {} })
  const csp = c.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value
  // sem sessão
  const inicio = await pedir('/')
  assert.equal(inicio.status, 200)
  assert.ok(Buffer.from(await inicio.arrayBuffer()).equals(NEUTRA))
  assert.equal(inicio.headers.get('content-security-policy'), csp)
  assert.equal(inicio.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.equal(inicio.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(inicio.headers.get('cross-origin-opener-policy'), 'same-origin')
  assert.equal(inicio.headers.get('cross-origin-embedder-policy'), null)
  assert.equal(inicio.headers.get('cache-control'), 'no-store')
  const nucleo = umDoNucleo()
  for (const caminho of ['/app/principal.js', '/app/nome.js', '/app/index.html', '/app/manifest.webmanifest', '/app/marca/icone.svg', ...(nucleo ? [`/${nucleo}`] : []), '/src/nada.js', '/api/recurso?f=app/principal.js', '/qualquer-coisa', '/index.html', '/manifest.webmanifest', '/favicon.ico', '/og.png', '/api/_zro', '/api/_sessao', '/api/nao-existe', '/package.json', '/vercel.json', '/.env', '/api/../package.json', '/vendor/../../package.json', '/%2e%2e/package.json']) {
    const r = await pedir(caminho)
    assert.equal(r.status, 404, caminho)
    assert.ok(Buffer.from(await r.arrayBuffer()).equals(NEUTRA), caminho)
    assert.equal(r.headers.get('content-security-policy'), csp, caminho)
  }
  // o estático sem marca: tipos certos e cache longo
  const wasm = await pedir('/vendor/libraw/libraw.wasm')
  assert.equal(wasm.status, 200)
  assert.equal(wasm.headers.get('content-type'), 'application/wasm')
  assert.equal(wasm.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal((await pedir('/vendor/preact/preact.mjs')).headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.equal((await pedir('/fontes/figtree-latin-wght-normal.woff2')).headers.get('content-type'), 'font/woff2')
  assert.equal((await pedir('/vendor/mediapipe/wasm/vision_wasm_module_internal.wasm')).headers.get('content-type'), 'application/wasm')
  assert.equal(await (await pedir('/robots.txt')).text(), 'User-agent: *\nDisallow: /\n')
  assert.equal((await (await pedir('/modelos.json')).json()).modelos.length, 4)
  // /entrar começa o login (aqui a Absolute ZRO não existe: volta com ?zro=erro, sem dizer nada do app)
  const entrar = await pedir('/entrar')
  assert.equal(entrar.status, 303)
  assert.equal(entrar.headers.get('location'), '/?zro=erro')
  // com a claim
  const cookie = sessao(['foto'])
  const dentro = await pedir('/', cookie)
  assert.ok((await dentro.text()).includes(`<title>${NOME}</title>`))
  assert.equal(dentro.headers.get('content-security-policy'), csp)
  const js = await pedir('/app/principal.js', cookie)
  assert.equal(js.status, 200)
  assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.equal(js.headers.get('cache-control'), 'private, no-cache')
  if (nucleo) assert.equal((await pedir(`/${nucleo}`, cookie)).status, 200)
  // sem a claim, igual a sem sessão
  assert.ok(Buffer.from(await (await pedir('/', sessao(['radio']))).arrayBuffer()).equals(NEUTRA))
  assert.equal((await pedir('/app/principal.js', sessao(['radio']))).status, 404)
})

// ───────── Chromium ─────────

let chromium = null
try {
  // require (e não import) para achar o Playwright também pelo NODE_PATH do ambiente
  chromium = createRequire(import.meta.url)('playwright').chromium
} catch {
  chromium = null
}
const semChromium = chromium ? false : 'sem Playwright na máquina'

test('Chromium é exigido no CI', { skip: !EXIGIR }, () => {
  assert.equal(semChromium, false, 'FOTO_EXIGIR=1 e o Playwright não está instalado')
})

test('Chromium: a casca abre com a CSP de produção, importa /vendor/preact e instancia o libraw.wasm', { skip: semChromium }, async () => {
  await subir()
  const navegador = await chromium.launch()
  try {
    // quem não passa pelo gate: a página neutra, sem pedir nada do app
    const fora = await navegador.newPage()
    const pedidosDeFora = []
    fora.on('request', (r) => pedidosDeFora.push(new URL(r.url()).pathname))
    await fora.goto(`${base}/`)
    assert.equal(await fora.title(), 'Absolute ZRO')
    assert.match(await fora.locator('h1').innerText(), /indisponível/)
    assert.ok(!(await fora.content()).toLowerCase().includes(NOME.toLowerCase()))
    assert.deepEqual(
      pedidosDeFora.filter((p) => p !== '/' && p !== '/favicon.ico'),
      [],
    )
    await fora.close()

    // com a claim: a casca
    const contexto = await navegador.newContext()
    await contexto.addCookies([{ name: 'foto_conta', value: sessao(['foto']).slice('foto_conta='.length), url: base }])
    const pagina = await contexto.newPage()
    const erros = []
    pagina.on('pageerror', (e) => erros.push(`erro: ${e.message}`))
    pagina.on('console', (m) => (m.type() === 'error' || /Content Security Policy|CSP/i.test(m.text())) && erros.push(`console: ${m.text()}`))
    const falhas = []
    pagina.on('requestfailed', (r) => falhas.push(`${r.url()} ${r.failure()?.errorText}`))
    const pedidos = []
    pagina.on('response', (r) => pedidos.push([new URL(r.url()).pathname, r.status()]))
    const resposta = await pagina.goto(`${base}/`)
    assert.match(resposta.headers()['content-security-policy'], /script-src 'self' 'wasm-unsafe-eval'/)
    await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
    assert.equal(await pagina.title(), NOME)
    assert.equal(await pagina.locator('#app h1').innerText(), NOME)
    assert.equal(await pagina.locator('#app p').innerText(), ASSINATURA)
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'claro')
    // a fonte da família carregou do próprio site
    await pagina.evaluate(() => document.fonts.ready)
    assert.equal(await pagina.evaluate(() => document.fonts.check("800 40px 'Figtree Variable'")), true)
    assert.match(await pagina.evaluate(() => getComputedStyle(document.body).fontFamily), /Figtree Variable/)
    // as bibliotecas vêm de /vendor por caminho relativo (sem import map)
    const preact = await pagina.evaluate(async () => {
      const p = await import('/vendor/preact/preact.mjs')
      const h = await import('/vendor/preact/hooks.mjs')
      const { html } = await import('/vendor/htm/preact.mjs')
      const alvo = document.createElement('div')
      p.render(html`<b>ok ${1 + 1}</b>`, alvo)
      return { render: typeof p.render, estado: typeof h.useState, saida: alvo.innerHTML }
    })
    assert.deepEqual(preact, { render: 'function', estado: 'function', saida: '<b>ok 2</b>' })
    // o LibRaw em WebAssembly instancia sob a CSP ('wasm-unsafe-eval') com o .wasm servido como application/wasm
    const libraw = await pagina.evaluate(async () => {
      const { LibRaw } = await import('/vendor/libraw/index.js')
      const lr = new LibRaw()
      await lr.waitUntilReady()
      return { versao: String(LibRaw.version()), numero: LibRaw.versionNumber() }
    })
    assert.match(libraw.versao, /^\d+\.\d+/)
    assert.ok(libraw.numero > 0)
    // o mesmo dentro de um worker de módulo (é onde a revelação roda)
    const noWorker = await pagina.evaluate(
      () =>
        new Promise((ok, falhou) => {
          const codigo = `import { LibRaw } from '${location.origin}/vendor/libraw/index.js'
            const lr = new LibRaw()
            lr.waitUntilReady().then(() => postMessage(String(LibRaw.version())), (e) => postMessage('erro: ' + e))`
          const w = new Worker(URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' })), { type: 'module' })
          w.onmessage = (e) => ok(e.data)
          w.onerror = (e) => falhou(new Error(e.message || 'worker falhou'))
        }),
    )
    assert.equal(noWorker, libraw.versao)
    // trocar o tema grava o cookie; a página seguinte já nasce escura (sem piscar)
    await pagina.evaluate(async () => (await import('/app/principal.js')).tema.alternar())
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'escuro')
    await pagina.reload()
    assert.equal(await pagina.evaluate(() => document.documentElement.getAttribute('data-tema')), 'escuro')
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(14, 14, 16)')
    await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')

    assert.deepEqual(erros, [])
    assert.deepEqual(falhas, [])
    // nada saiu da origem e nada deu 404
    assert.deepEqual(
      pedidos.filter(([, status]) => status >= 400),
      [],
    )
    assert.ok(pedidos.some(([p]) => p === '/vendor/libraw/libraw.wasm'))
    assert.ok(pedidos.some(([p]) => p === '/app/principal.js'))
    await contexto.close()
  } finally {
    await navegador.close()
  }
})

test("Chromium: a CSP vale de verdade (sem 'wasm-unsafe-eval' o libraw.wasm não instancia)", { skip: semChromium }, async () => {
  const { servir } = await import('../scripts/servir.mjs')
  const config = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'))
  const csp = config.headers[0].headers.find((h) => h.key === 'Content-Security-Policy')
  assert.ok(csp.value.includes(" 'wasm-unsafe-eval'"))
  csp.value = csp.value.replace(" 'wasm-unsafe-eval'", '')
  const outro = await servir({ porta: 0, publico: saida, config })
  const navegador = await chromium.launch()
  try {
    const contexto = await navegador.newContext()
    const endereco = `http://127.0.0.1:${outro.address().port}`
    await contexto.addCookies([{ name: 'foto_conta', value: sessao(['foto']).slice('foto_conta='.length), url: endereco }])
    const pagina = await contexto.newPage()
    await pagina.goto(`${endereco}/`)
    await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
    const r = await pagina.evaluate(async () => {
      const { LibRaw } = await import('/vendor/libraw/index.js')
      const pronto = LibRaw.initialize().then(
        () => 'instanciou',
        (e) => `recusado: ${e?.message ?? e}`,
      )
      return Promise.race([pronto, new Promise((ok) => setTimeout(() => ok('recusado: não instanciou'), 4000))])
    })
    assert.match(r, /^recusado/)
  } finally {
    await navegador.close()
    outro.close()
  }
})
