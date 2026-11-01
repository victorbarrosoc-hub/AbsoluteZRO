// Fechada ao público (PRD §5 e §6, Etapa B): o que sai do site estático (scripts/publicar-site.mjs), o vercel.json
// (ferramentas pela função, domínio antigo ainda redirecionando), o manifesto sem atalhos, a página inicial sem CTA de
// ferramenta, a página "Em desenvolvimento" e a função api/app.js, que só entrega as ferramentas (lut, cst, entrega,
// converter, inicio, app/, src/, exemplos/) à conta que o HUB liberou: anônimo, conta closed, sessão antiga, conta
// allowed, caminho fora da lista e RELEASE=released.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { caminhoSeguro, MARCA_RAIZ, PAGINAS } from '../api/app.js'
import { selar } from '../api/_zro.js'
import { ABERTO, FECHADO, NEUTRAS, PAGINA_404, SITE, SITE_APP, itens, publicar } from '../scripts/publicar-site.mjs'
import { iniciarZroFalsa } from './zro-falso.js'

const RAIZ = new URL('..', import.meta.url)
const ler = (p) => readFileSync(new URL(p, RAIZ), 'utf8')
const FERRAMENTAS = ['inicio', 'lut', 'lab', 'looks', 'cst', 'entrega', 'converter']

describe('o que o site publica', () => {
  test('vercel.json: as ferramentas passam pela função, o estático é publico/ e o domínio antigo ainda redireciona', () => {
    const v = JSON.parse(ler('vercel.json'))
    assert.equal(v.outputDirectory, 'publico')
    assert.equal(v.buildCommand, 'node scripts/publicar-site.mjs')
    assert.equal(v.cleanUrls, true)
    const reescritas = Object.fromEntries(v.rewrites.map((r) => [r.source, r.destination]))
    for (const f of FERRAMENTAS) assert.equal(reescritas[`/${f}`], `/api/app?caminho=${f}.html`)
    for (const p of ['app', 'src', 'exemplos', 'marca']) assert.equal(reescritas[`/${p}/:caminho*`], `/api/app?caminho=${p}/:caminho*`)
    for (const p of MARCA_RAIZ) assert.equal(reescritas[`/${p}`], `/api/app?caminho=${p}`)
    const inclui = v.functions['api/app.js'].includeFiles
    for (const p of [...PAGINAS, ...MARCA_RAIZ, 'em-desenvolvimento.html', 'app/**', 'src/**', 'exemplos/**', 'marca/**']) assert.ok(inclui.includes(p), p)
    assert.ok(v.headers.some((h) => h.source === '/api/(.*)' && h.headers.some((x) => x.key === 'Cache-Control' && x.value === 'no-store')))
    assert.deepEqual(v.redirects, [{ source: '/:caminho*', has: [{ type: 'host', value: 'revela-zro.vercel.app' }], destination: 'https://revela.absolutezro.com/:caminho*', permanent: true }])
    assert.match(ler('.vercelignore'), /^publico\/$/m)
  })

  test('publicar-site: fechada sai só a página neutra, fontes/ e vendor/ (sem marca, manifesto, OG nem app/); aberta sai tudo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'revela-publico-'))
    try {
      const raiz = join(dir, 'raiz')
      const arquivo = (p) => {
        mkdirSync(join(raiz, p, '..'), { recursive: true })
        writeFileSync(join(raiz, p), `conteudo de ${p}`)
      }
      for (const p of ['index.html', 'entrar.html', 'em-desenvolvimento.html', 'manifest.webmanifest', 'og.jpg', 'marca/revela-icone.svg', 'fontes/f.woff2', 'vendor/mediabunny.min.mjs', 'api/app.js', 'README.md', 'vercel.json']) arquivo(p)
      for (const p of [...PAGINAS, ...SITE_APP, 'app/revela.js', 'app/menu.js', 'app/converter.js', 'src/cor/cube.js', 'exemplos/x.jpg', 'test/x.test.js', 'scripts/vendor.mjs']) arquivo(p)

      const fechado = publicar({ raiz: new URL(`file://${raiz}/`), saida: new URL(`file://${join(dir, 'fechado')}/`), estado: 'closed' })
      assert.deepEqual(fechado.itens, FECHADO)
      const tem = (saida, p) => existsSync(join(dir, saida, p))
      for (const p of ['index.html', 'entrar.html', 'em-desenvolvimento.html', PAGINA_404, 'fontes/f.woff2', 'vendor/mediabunny.min.mjs']) assert.ok(tem('fechado', p), `fechada tem ${p}`)
      // revisão de 01/11/2026: manifesto (nome "Revela"), OG e marca/ não ficam públicos com ela fechada
      for (const p of [...PAGINAS, 'manifest.webmanifest', 'og.jpg', 'marca', 'app', 'src', 'exemplos', 'api', 'test', 'scripts', 'README.md', 'vercel.json']) assert.ok(!tem('fechado', p), `fechada não tem ${p}`)
      // fechada, a página inicial, a entrada e o 404 saem como a página neutra (titular, 01/11/2026): nada da Revela
      for (const p of [...NEUTRAS, PAGINA_404]) assert.equal(readFileSync(join(dir, 'fechado', p), 'utf8'), 'conteudo de em-desenvolvimento.html', p)

      const aberto = publicar({ raiz: new URL(`file://${raiz}/`), saida: new URL(`file://${join(dir, 'aberto')}/`), estado: 'released' })
      assert.deepEqual(aberto.itens, [...SITE, ...ABERTO])
      for (const p of [...PAGINAS, 'app/revela.js', 'app/tema.js', 'src/cor/cube.js', 'exemplos/x.jpg', 'manifest.webmanifest', 'og.jpg', 'marca/revela-icone.svg']) assert.ok(tem('aberto', p), `aberta tem ${p}`)
      for (const p of ['api', 'test', 'scripts']) assert.ok(!tem('aberto', p), p)
      assert.equal(readFileSync(join(dir, 'aberto', PAGINA_404), 'utf8'), 'conteudo de em-desenvolvimento.html')
      assert.equal(readFileSync(join(dir, 'aberto', 'index.html'), 'utf8'), 'conteudo de index.html')
      delete process.env.RELEASE
      assert.deepEqual(itens(), FECHADO)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('o que a página inicial, a entrada e "Em desenvolvimento" carregam está no publicado, e não puxa ferramenta', () => {
    const importes = (f) => [...ler(f).matchAll(/(?:from|import)\s+'([^']+)'/g)].map((x) => x[1])
    for (const f of ['app/home.js', 'app/entrar.js', 'app/conta.js', 'app/visual.js']) {
      for (const i of importes(f)) {
        assert.doesNotMatch(i, /\.\.\/(src|vendor|exemplos)\//, `${f} importa ${i}`)
        assert.ok(SITE_APP.includes(`app/${i.replace(/^\.\//, '')}`), `${f} importa ${i}, que não é publicado`)
      }
    }
    // em-desenvolvimento.html é a página neutra: não carrega nada (teste abaixo)
    for (const f of ['index.html', 'entrar.html']) {
      const usados = [...ler(f).matchAll(/(?:src|href)="\/?(app\/[^"]+)"/g)].map((x) => x[1])
      assert.ok(usados.length >= 2, `${f} carrega algo de app/`)
      for (const u of usados) assert.ok(SITE_APP.includes(u), `${f} usa ${u}, que não é publicado`)
    }
  })

  test('página inicial sem CTA de ferramenta: "Conhecer o projeto" é âncora, Z "Chegando", Voltar ao HUB no fecho', () => {
    const html = ler('index.html')
    for (const f of FERRAMENTAS) assert.doesNotMatch(html, new RegExp(`href="${f}(\\.html)?[^"]*"`), f)
    assert.doesNotMatch(html, /Testar agora|Abrir a Revela|Converter agora|Testar no seu frame|Conversar com a Z|Criar conta|Agora na Revela/)
    assert.match(html, /href="#looks">Conhecer o projeto</)
    assert.match(html, /Chegando à Revela/)
    assert.match(html, /Em desenvolvimento/)
    assert.match(html, /href="https:\/\/absolutezro\.com\/inicio">Voltar ao HUB</)
    assert.match(html, /href="https:\/\/absolutezro\.com\/ia"[^>]*>Conhecer a Z</)
    // a família continua sem link (apresentação), os cartões das ferramentas viraram só cartões
    assert.equal((html.match(/<a class="cartao-home/g) || []).length, 0)
    assert.equal((html.match(/<span class="cartao-home/g) || []).length, 4)
  })

  test('manifesto: abre na página inicial e sem atalhos para as ferramentas', () => {
    const m = JSON.parse(ler('manifest.webmanifest'))
    assert.equal(m.start_url, '/')
    assert.equal(m.id, '/')
    assert.equal(m.shortcuts, undefined)
    assert.doesNotMatch(JSON.stringify(m), /\/(lut|lab|looks|cst|entrega|converter|inicio)"/)
  })

  test('em-desenvolvimento.html: a página neutra (titular, 01/11/2026), sem marca, nome ou explicação da Revela; igual à do AEON', () => {
    const html = ler('em-desenvolvimento.html')
    assert.equal(html, readFileSync(new URL('../../ai-edit/em-desenvolvimento.html', import.meta.url), 'utf8'))
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/)
    assert.match(html, /<title>Absolute ZRO<\/title>/)
    assert.match(html, /<h1><span>Página <\/span><b>indisponível\.<\/b><\/h1>/)
    assert.match(html, /<a href="https:\/\/absolutezro\.com">Ir para a Absolute ZRO</)
    assert.doesNotMatch(html, /Revela|revela|desenvolvimento\.|api\/|\.json|process\.env|RELEASE|\b(lut|lab|looks|cst|entrega|converter|inicio)\b/)
    assert.doesNotMatch(html, /<script|<link|<img|src="/)
    // a folha antiga da porta fechada segue igual à do AEON (as duas continuam no repositório)
    const css = ler('app/fechado.css')
    assert.equal(css.replace("'../fontes/", "'../vendor/fontes/"), readFileSync(new URL('../../ai-edit/site/fechado.css', import.meta.url), 'utf8'))
  })

  test('os arquivos partilhados com o AEON são iguais (repasse da Z e Absolute ZRO falsa)', () => {
    for (const f of ['api/_ia.js', 'test/zro-falso.js', 'test/z-falso.js']) assert.equal(ler(f), readFileSync(new URL(`../../ai-edit/${f}`, import.meta.url), 'utf8'), f)
  })

  test('caminhoSeguro: só as páginas das ferramentas e app/, src/, exemplos/; sem subir pasta nem arquivo oculto', () => {
    for (const p of PAGINAS) assert.equal(caminhoSeguro(p), p)
    assert.equal(caminhoSeguro('app/revela.js'), 'app/revela.js')
    assert.equal(caminhoSeguro('src/cor/cube.js'), 'src/cor/cube.js')
    assert.equal(caminhoSeguro('exemplos/revela-look.jpg'), 'exemplos/revela-look.jpg')
    assert.equal(caminhoSeguro('marca/revela-icone.svg'), 'marca/revela-icone.svg')
    for (const p of MARCA_RAIZ) assert.equal(caminhoSeguro(p), p)
    for (const ruim of ['', 'index.html', 'entrar.html', 'em-desenvolvimento.html', 'api/_zro.js', 'app', 'app/', 'src/', 'app/../package.json', '../lut.html', 'app/./../api/_zro.js', 'src/.env', 'app/x\\y', 'app/%2e%2e/x', 'vercel.json', 'vendor/mediabunny.min.mjs', 'marca', 'marca/', 'package.json', 'a'.repeat(301)]) assert.equal(caminhoSeguro(ruim), null, ruim)
  })
})

describe('api/app.js: as ferramentas só para a conta liberada', () => {
  const CLIENTE = { clientId: 'revela-web', clientSecret: 'segredo-de-teste-da-revela-fechada' }
  const LIA = { sub: 'zro-411', email: 'lia@produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: ['finishing'], release: { finishing: 'allowed' } }
  let zro, app, SITE
  const f = {}

  before(async () => {
    zro = await iniciarZroFalsa(CLIENTE)
    Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
    for (const r of ['entrar', 'callback']) f[r] = (await import(`../api/zro/${r}.js`)).default
    f.app = (await import('../api/app.js')).default
    // como na Vercel: a função responde /api/app, e as reescritas do vercel.json levam as ferramentas e as pastas a ela
    app = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x')
      if (u.pathname === '/api/zro/entrar') return f.entrar(req, res)
      if (u.pathname === '/api/zro/callback') return f.callback(req, res)
      if (u.pathname === '/api/app') return f.app(req, res)
      const ferramenta = /^\/(inicio|lut|lab|looks|cst|entrega|converter)$/.exec(u.pathname)
      if (ferramenta) {
        req.url = `/api/app?caminho=${ferramenta[1]}.html`
        return f.app(req, res)
      }
      if (/^\/(manifest\.webmanifest|og\.jpg)$/.test(u.pathname) || /^\/(app|src|exemplos|marca)(\/|$)/.test(u.pathname)) {
        req.url = `/api/app?caminho=${encodeURIComponent(u.pathname.slice(1))}`
        return f.app(req, res)
      }
      res.statusCode = 404
      res.end()
    })
    await new Promise((ok) => app.listen(0, '127.0.0.1', ok))
    SITE = `http://127.0.0.1:${app.address().port}`
  })
  after(async () => {
    await zro?.fechar()
    await new Promise((ok) => app?.close(() => ok()))
  })

  const cookiesDe = (res) => new Map(res.headers.getSetCookie().map((c) => [c.split('=')[0], c.slice(c.indexOf('=') + 1).split(';')[0]]))
  const pedir = (caminho, { cookies = {}, ...init } = {}) =>
    fetch(new URL(caminho, SITE), {
      redirect: 'manual',
      ...init,
      headers: {
        cookie: Object.entries(cookies)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}=${v}`)
          .join('; '),
        ...(init.headers || {}),
      },
    })
  async function entrar(pessoa = LIA) {
    zro.estado.pessoa = pessoa
    const ida = await pedir('/api/zro/entrar')
    const z = await fetch(new URL(ida.headers.get('location')), { redirect: 'manual' })
    const volta = await pedir(z.headers.get('location').replace(SITE, ''), { cookies: { rv_zro: cookiesDe(ida).get('rv_zro') } })
    return { destino: volta.headers.get('location'), conta: cookiesDe(volta).get('rv_conta') || undefined }
  }
  const sessaoFalsa = (extra = {}) => selar('rv_conta', { sub: LIA.sub, nome: LIA.nome, email: LIA.email, produtos: ['finishing'], ...extra }, 3600)

  async function semFerramentas(cookies, rotulo) {
    for (const caminho of FERRAMENTAS.map((x) => `/${x}`)) {
      const r = await pedir(caminho, { cookies })
      assert.equal(r.status, 200, `${rotulo}: ${caminho}`)
      assert.match(r.headers.get('content-type'), /^text\/html/)
      assert.equal(r.headers.get('cache-control'), 'no-store')
      const html = await r.text()
      assert.match(html, /indisponível\./, rotulo)
      assert.doesNotMatch(html, /Revela/, rotulo)
      assert.doesNotMatch(html, /revela\.js|cst\.js|entrega\.js|converter\.js|inicio\.js|zro-ia/, `${rotulo}: ${caminho} entregou a ferramenta`)
    }
    // fora as ferramentas, 404 com a página neutra: nem o arquivo nem a marca aparecem (revisão de 01/11/2026)
    for (const caminho of ['/app/revela.js', '/app/menu.js', '/app/converter.js', '/app/home.js', '/app/', '/app', '/src/cor/cube.js', '/src/entrega/destinos.js', '/exemplos/revela-look.jpg', '/api/app?caminho=app/cst.js', '/manifest.webmanifest', '/og.jpg', '/marca/revela-icone.svg', '/marca/app/revela-192.png', '/marca/nada.svg']) {
      const r = await pedir(caminho, { cookies })
      assert.equal(r.status, 404, `${rotulo}: ${caminho}`)
      assert.match(r.headers.get('content-type'), /^text\/html/, `${rotulo}: ${caminho}`)
      const html = await r.text()
      assert.match(html, /indisponível\./, `${rotulo}: ${caminho}`)
      assert.doesNotMatch(html, /Revela/, `${rotulo}: ${caminho}`)
    }
  }

  test('anônimo: a página neutra (200) no lugar de cada ferramenta e 403 nos arquivos delas', async () => {
    await semFerramentas({}, 'anônimo')
    const cabeca = await pedir('/lut', { method: 'HEAD' })
    assert.equal(cabeca.status, 200)
    assert.equal((await cabeca.text()).length, 0)
  })

  test('conta closed no HUB não ganha sessão; sessão antiga ou closed forjada também não vê as ferramentas', async () => {
    const r = await entrar({ ...LIA, release: { finishing: 'closed' } })
    assert.equal(r.destino, '/em-desenvolvimento')
    assert.equal(r.conta, undefined)
    await semFerramentas({ rv_conta: sessaoFalsa() }, 'sessão antiga')
    await semFerramentas({ rv_conta: sessaoFalsa({ release: 'closed' }) }, 'closed')
    await semFerramentas({ rv_conta: sessaoFalsa({ release: 'released' }) }, 'released só no HUB')
    await semFerramentas({ rv_conta: 'lixo.assinatura' }, 'cookie adulterado')
  })

  test('conta allowed (login pela Absolute ZRO): cada ferramenta e o que ela carrega, com o tipo certo e sem cache', async () => {
    const { destino, conta } = await entrar()
    assert.equal(destino, '/lut?zro=ok')
    assert.ok(conta)
    const cookies = { rv_conta: conta }
    for (const f of FERRAMENTAS) {
      const r = await pedir(`/${f}`, { cookies })
      assert.equal(r.status, 200, f)
      assert.match(r.headers.get('content-type'), /^text\/html/)
      assert.equal(r.headers.get('cache-control'), 'no-store')
      assert.equal(await r.text(), ler(`${f}.html`), f)
    }
    for (const [caminho, tipo, arquivo] of [
      ['/app/revela.js', /^text\/javascript/, 'app/revela.js'],
      ['/app/menu.js', /^text\/javascript/, 'app/menu.js'],
      ['/src/cor/cube.js', /^text\/javascript/, 'src/cor/cube.js'],
      ['/exemplos/revela-look.jpg', /^image\/jpeg/, 'exemplos/revela-look.jpg'],
      ['/api/app?caminho=app/converter.js', /^text\/javascript/, 'app/converter.js'],
      ['/manifest.webmanifest', /^application\/manifest\+json/, 'manifest.webmanifest'],
      ['/og.jpg', /^image\/jpeg/, 'og.jpg'],
      ['/marca/revela-icone.svg', /^image\/svg\+xml/, 'marca/revela-icone.svg'],
    ]) {
      const a = await pedir(caminho, { cookies })
      assert.equal(a.status, 200, caminho)
      assert.match(a.headers.get('content-type'), tipo, caminho)
      const esperado = readFileSync(new URL(arquivo, RAIZ))
      assert.equal(a.headers.get('content-length'), String(esperado.length))
      assert.ok(Buffer.from(await a.arrayBuffer()).equals(esperado), caminho)
    }
    for (const caminho of ['/api/app?caminho=api/_zro.js', '/api/app?caminho=index.html', '/api/app?caminho=app/../package.json', '/api/app?caminho=vercel.json', '/app/nada.js', '/src/', '/api/app']) {
      assert.equal((await pedir(caminho, { cookies })).status, 404, caminho)
    }
    assert.equal((await pedir('/lut', { method: 'POST', cookies })).status, 405)
  })

  test('RELEASE=released: as ferramentas são públicas (a função só repete o que o estático já teria)', async () => {
    process.env.RELEASE = 'released'
    try {
      const r = await pedir('/lut')
      assert.equal(r.status, 200)
      assert.equal(await r.text(), ler('lut.html'))
      assert.equal((await pedir('/src/cor/cube.js')).status, 200)
      await semFerramentas({ rv_conta: sessaoFalsa({ release: 'closed' }) }, 'closed com RELEASE=released')
    } finally {
      delete process.env.RELEASE
    }
  })
})
