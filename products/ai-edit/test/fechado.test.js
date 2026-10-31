// Fechado ao público (PRD §5 e §6, Etapa B): o que sai do site estático (scripts/publicar-site.mjs), o que o
// vercel.json deixa de apontar (downloads no GitHub, instaladores), a página inicial sem CTA funcional, a página
// "Em desenvolvimento" e a função api/app.js, que só entrega o editor (app/, src/, presets/) à conta que o HUB liberou:
// anônimo, conta closed, sessão antiga, conta allowed, caminho fora das pastas e RELEASE=released.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { caminhoSeguro } from '../api/app.js'
import { selar } from '../api/_zro.js'
import { ABERTO, MARCA, RECADO, SITE, itens, publicar } from '../scripts/publicar-site.mjs'
import { iniciarZroFalsa } from './zro-falso.js'

const RAIZ = new URL('..', import.meta.url)
const ler = (p) => readFileSync(new URL(p, RAIZ), 'utf8')

describe('o que o site publica', () => {
  test('vercel.json: nada aponta para o GitHub; /baixar volta à home; o editor só pela função; recado nos instaladores', () => {
    const v = JSON.parse(ler('vercel.json'))
    assert.doesNotMatch(JSON.stringify(v), /github\.com/)
    assert.equal(v.outputDirectory, 'publico')
    assert.deepEqual(v.redirects, [{ source: '/baixar/:resto*', destination: '/#em-desenvolvimento', permanent: false }])
    assert.deepEqual(
      v.rewrites.map((r) => [r.source, r.destination]),
      [
        // o repasse do Set (api/_set.js, que confere a liberação como a Z)
        ['/api/zro/set/:caminho*', '/api/zro/set?c=:caminho*'],
        ['/app/:caminho*', '/api/app?caminho=app/:caminho*'],
        ['/src/:caminho*', '/api/app?caminho=src/:caminho*'],
        ['/presets/:caminho*', '/api/app?caminho=presets/:caminho*'],
      ],
    )
    const inclui = v.functions['api/app.js'].includeFiles
    for (const p of ['app/**', 'src/**', 'presets/**', 'em-desenvolvimento.html']) assert.ok(inclui.includes(p), p)
    assert.ok(v.headers.some((h) => h.source === '/api/(.*)' && h.headers.some((x) => x.key === 'Cache-Control' && x.value === 'no-store')))
    for (const nome of ['/instalar.sh', '/instalar.ps1']) assert.ok(v.headers.some((h) => h.source === nome && h.headers.some((x) => x.value.startsWith('text/plain'))), nome)
  })

  test('publicar-site: fechado sai só o institucional (sem editor nem instalador de verdade); aberto sai tudo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aeon-publico-'))
    try {
      const raiz = join(dir, 'raiz')
      const arquivo = (p) => {
        mkdirSync(join(raiz, p, '..'), { recursive: true })
        writeFileSync(join(raiz, p), `conteudo de ${p}`)
      }
      for (const p of ['index.html', 'entrar.html', 'em-desenvolvimento.html', 'instalar.sh', 'instalar.ps1', 'site/home.js', 'marca/og.jpg', 'vendor/mediabunny.min.mjs', 'app/index.html', 'app/editor.js', 'presets/fala.v1.json', 'desktop/main.cjs', 'api/app.js']) arquivo(p)
      for (const p of [...MARCA, 'src/linha.js', 'src/exportar/edl.js']) arquivo(p)

      const fechado = publicar({ raiz: new URL(`file://${raiz}/`), saida: new URL(`file://${join(dir, 'fechado')}/`), estado: 'closed' })
      assert.deepEqual(fechado.itens, [...SITE, ...MARCA])
      const tem = (saida, p) => existsSync(join(dir, saida, p))
      for (const p of ['index.html', 'entrar.html', 'em-desenvolvimento.html', 'site/home.js', 'marca/og.jpg', 'vendor/mediabunny.min.mjs', ...MARCA]) assert.ok(tem('fechado', p), `fechado tem ${p}`)
      for (const p of ['app', 'app/index.html', 'presets', 'src/linha.js', 'src/exportar', 'desktop', 'api']) assert.ok(!tem('fechado', p), `fechado não tem ${p}`)
      // os instaladores existem, mas só com o recado: nada de Release, download ou instalação
      for (const nome of ['instalar.sh', 'instalar.ps1']) {
        const texto = readFileSync(join(dir, 'fechado', nome), 'utf8')
        assert.equal(texto, RECADO[nome])
        assert.doesNotMatch(texto, /github|releases|curl|Invoke-WebRequest|hdiutil|Start-Process/i)
        assert.match(texto, /em desenvolvimento/i)
        assert.match(texto, /absolutezro\.com\/inicio/)
      }
      assert.match(RECADO['instalar.sh'], /^#!\/bin\/sh\n/)
      assert.match(RECADO['instalar.sh'], /\nexit 1\n$/)

      const aberto = publicar({ raiz: new URL(`file://${raiz}/`), saida: new URL(`file://${join(dir, 'aberto')}/`), estado: 'released' })
      assert.deepEqual(aberto.itens, [...SITE, ...ABERTO])
      for (const p of ['app/editor.js', 'presets/fala.v1.json', 'src/linha.js', 'src/exportar/edl.js', 'instalar.sh']) assert.ok(tem('aberto', p), `aberto tem ${p}`)
      assert.equal(readFileSync(join(dir, 'aberto', 'instalar.sh'), 'utf8'), 'conteudo de instalar.sh')
      for (const p of ['desktop', 'api']) assert.ok(!tem('aberto', p), p)
      // o padrão é fechado: sem RELEASE no ambiente, nada do editor
      delete process.env.RELEASE
      assert.deepEqual(itens(), [...SITE, ...MARCA])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('os módulos da marca que o site publica não puxam o editor', () => {
    for (const m of MARCA) {
      const imports = [...ler(m).matchAll(/from\s+'([^']+)'/g)].map((x) => x[1])
      for (const i of imports) assert.ok(MARCA.includes(`src/${i.replace(/^\.\//, '')}`), `${m} importa ${i}`)
    }
    for (const f of ['site/home.js', 'site/estudio.js', 'site/entrar.js', 'site/fechado.js', 'site/conta.js']) {
      const fora = [...ler(f).matchAll(/from\s+'\.\.\/src\/([^']+)'/g)].map((x) => `src/${x[1]}`).filter((p) => !MARCA.includes(p))
      assert.deepEqual(fora, [], `${f} importa do editor`)
    }
  })

  test('página inicial sem CTA funcional: "Testar ao vivo" e "Conhecer o AEON" são âncoras, nada de Baixar, instalar, abrir o editor ou criar conta', () => {
    const html = ler('index.html')
    assert.doesNotMatch(html, /href="app\/"/)
    assert.doesNotMatch(html, /baixar\/(mac|windows)|instalar\.(sh|ps1)|github\.com\/[^"]*releases|curl -fsSL|irm https/)
    assert.doesNotMatch(html, /Começar a criar|Conversar com a Z|Criar conta|Agora no AEON/)
    assert.match(html, /href="#testar">Testar ao vivo</)
    assert.match(html, /href="#produto">Conhecer o AEON</)
    assert.match(html, /Chegando ao AEON/)
    assert.match(html, /id="em-desenvolvimento"/)
    assert.match(html, /href="https:\/\/absolutezro\.com\/inicio">Voltar ao HUB</)
    assert.match(html, /href="https:\/\/absolutezro\.com\/ia"[^>]*>Conhecer a Z</)
  })

  test('em-desenvolvimento.html: símbolo pequeno, a marca, título fino × pesado, uma linha e Voltar ao HUB; sem dado interno', () => {
    const html = ler('em-desenvolvimento.html')
    assert.match(html, /<meta name="robots" content="noindex"/)
    assert.match(html, /class="fechado-zro" href="https:\/\/absolutezro\.com"/)
    assert.match(html, /data-marca="simbolo"[\s\S]*data-marca="nome"/)
    assert.match(html, /<h1[^>]*><span class="fino">Em<\/span> <span class="forte">desenvolvimento\.<\/span><\/h1>/)
    assert.equal((html.match(/<p[\s>]/g) || []).length, 1, 'uma linha de apoio')
    assert.match(html, /class="glass-btn glass-btn--ink"[^>]*href="https:\/\/absolutezro\.com\/inicio">Voltar ao HUB</)
    assert.doesNotMatch(html, /api\/|app\/|\.json|process\.env|RELEASE/)
    // só a folha e o script próprios: a página não depende do site (nem do editor)
    assert.match(html, /"\/site\/tema\.js"/)
    assert.match(html, /"\/site\/fechado\.css"/)
    assert.match(html, /"\/site\/fechado\.js"/)
    // a função entrega esta página em /app/, /src/* e /presets/*: tudo que ela carrega tem caminho absoluto
    for (const u of [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u))) assert.ok(u.startsWith('/'), `${u} relativo`)
    // claro e escuro na mesma folha, com os dois jeitos de marcar o tema (AEON e Revela)
    const css = ler('site/fechado.css')
    assert.match(css, /:root\[data-theme='dark'\] \.pagina-fechado,\n:root\[data-tema='escuro'\] \.pagina-fechado/)
    assert.match(css, /\.glass-btn--ink/)
    assert.match(css, /prefers-reduced-motion: no-preference/)
  })

  test('caminhoSeguro: só app/, src/ e presets/, sem subir pasta nem arquivo oculto', () => {
    assert.equal(caminhoSeguro('app'), 'app/index.html')
    assert.equal(caminhoSeguro('app/'), 'app/index.html')
    assert.equal(caminhoSeguro('app/editor.js'), 'app/editor.js')
    assert.equal(caminhoSeguro('src/exportar/edl.js'), 'src/exportar/edl.js')
    assert.equal(caminhoSeguro('presets/fala.v1.json'), 'presets/fala.v1.json')
    for (const ruim of ['', 'desktop/main.cjs', 'api/_zro.js', 'app/../package.json', '../app/editor.js', 'app/./../api/_zro.js', 'src/.env', 'app/x\\y', 'app/%2e%2e/x', 'vercel.json', 'a'.repeat(301)]) assert.equal(caminhoSeguro(ruim), null, ruim)
  })
})

describe('api/app.js: o editor só para a conta liberada', () => {
  const CLIENTE = { clientId: 'aeon-web', clientSecret: 'segredo-de-teste-do-aeon-fechado' }
  const LIA = { sub: 'zro-411', email: 'lia@produtora.com', nome: 'Lia Produtora', org: 'Produtora Lia', produtos: ['ai-edit'], release: { 'ai-edit': 'allowed' } }
  let zro, app, SITE
  const f = {}

  before(async () => {
    zro = await iniciarZroFalsa(CLIENTE)
    Object.assign(process.env, { ZRO_ISSUER: zro.url, ZRO_CLIENT_ID: CLIENTE.clientId, ZRO_CLIENT_SECRET: CLIENTE.clientSecret })
    for (const r of ['entrar', 'callback']) f[r] = (await import(`../api/zro/${r}.js`)).default
    f.app = (await import('../api/app.js')).default
    // como na Vercel: a função responde /api/app, e as reescritas do vercel.json levam /app/*, /src/* e /presets/* a ela
    app = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x')
      if (u.pathname === '/api/zro/entrar') return f.entrar(req, res)
      if (u.pathname === '/api/zro/callback') return f.callback(req, res)
      if (u.pathname === '/api/app') return f.app(req, res)
      if (/^\/(app|src|presets)(\/|$)/.test(u.pathname)) {
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
  /** Login de verdade pela Absolute ZRO falsa; devolve o cookie da sessão (ou undefined se o AEON recusou). */
  async function entrar(pessoa = LIA) {
    zro.estado.pessoa = pessoa
    const ida = await pedir('/api/zro/entrar')
    const z = await fetch(new URL(ida.headers.get('location')), { redirect: 'manual' })
    const volta = await pedir(z.headers.get('location').replace(SITE, ''), { cookies: { ae_zro: cookiesDe(ida).get('ae_zro') } })
    return { destino: volta.headers.get('location'), conta: cookiesDe(volta).get('ae_conta') || undefined }
  }
  const sessaoFalsa = (extra = {}) => selar('ae_conta', { sub: LIA.sub, nome: LIA.nome, email: LIA.email, produtos: ['ai-edit'], ...extra }, 3600)

  async function semEditor(cookies, rotulo) {
    for (const caminho of ['/app/', '/app', '/app/index.html']) {
      const r = await pedir(caminho, { cookies })
      assert.equal(r.status, 200, `${rotulo}: ${caminho}`)
      assert.match(r.headers.get('content-type'), /^text\/html/)
      assert.equal(r.headers.get('cache-control'), 'no-store')
      const html = await r.text()
      assert.match(html, /desenvolvimento\./, rotulo)
      assert.doesNotMatch(html, /editor\.js|zro-tokens/, `${rotulo}: ${caminho} entregou o editor`)
    }
    for (const caminho of ['/app/editor.js', '/app/editor.css', '/src/linha.js', '/src/exportar/edl.js', '/presets/fala.v1.json', '/api/app?caminho=app/editor.js']) {
      const r = await pedir(caminho, { cookies })
      assert.equal(r.status, 403, `${rotulo}: ${caminho}`)
      assert.deepEqual(await r.json(), { ok: false, message: 'Em desenvolvimento.' })
    }
  }

  test('anônimo: "Em desenvolvimento" (200) no lugar do editor e 403 nos arquivos dele', async () => {
    await semEditor({}, 'anônimo')
    const cabeca = await pedir('/app/', { method: 'HEAD' })
    assert.equal(cabeca.status, 200)
    assert.equal((await cabeca.text()).length, 0)
  })

  test('conta closed no HUB não ganha sessão; sessão antiga ou closed forjada também não vê o editor', async () => {
    const r = await entrar({ ...LIA, release: { 'ai-edit': 'closed' } })
    assert.equal(r.destino, '/em-desenvolvimento.html')
    assert.equal(r.conta, undefined)
    await semEditor({ ae_conta: sessaoFalsa() }, 'sessão antiga')
    await semEditor({ ae_conta: sessaoFalsa({ release: 'closed' }) }, 'closed')
    await semEditor({ ae_conta: sessaoFalsa({ release: 'released' }) }, 'released só no HUB')
    await semEditor({ ae_conta: 'lixo.assinatura' }, 'cookie adulterado')
  })

  test('conta allowed (login pela Absolute ZRO): o editor inteiro, com o tipo certo e sem cache', async () => {
    const { destino, conta } = await entrar()
    assert.equal(destino, '/app/?zro=ok')
    assert.ok(conta)
    const cookies = { ae_conta: conta }
    const r = await pedir('/app/', { cookies })
    assert.equal(r.status, 200)
    assert.match(r.headers.get('content-type'), /^text\/html/)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.equal(await r.text(), ler('app/index.html'))
    for (const [caminho, tipo, arquivo] of [
      ['/app/editor.js', /^text\/javascript/, 'app/editor.js'],
      ['/app/editor.css', /^text\/css/, 'app/editor.css'],
      ['/src/linha.js', /^text\/javascript/, 'src/linha.js'],
      ['/src/exportar/edl.js', /^text\/javascript/, 'src/exportar/edl.js'],
      ['/presets/fala.v1.json', /^application\/json/, 'presets/fala.v1.json'],
      ['/api/app?caminho=app/z.js', /^text\/javascript/, 'app/z.js'],
    ]) {
      const a = await pedir(caminho, { cookies })
      assert.equal(a.status, 200, caminho)
      assert.match(a.headers.get('content-type'), tipo, caminho)
      assert.equal(a.headers.get('content-length'), String(Buffer.byteLength(ler(arquivo))))
      assert.equal(await a.text(), ler(arquivo), caminho)
    }
    // o que não é do editor continua 404 mesmo para a conta liberada; método errado, 405
    for (const caminho of ['/api/app?caminho=desktop/main.cjs', '/api/app?caminho=api/_zro.js', '/api/app?caminho=app/../package.json', '/api/app?caminho=vercel.json', '/app/nada.js', '/src/', '/api/app']) {
      assert.equal((await pedir(caminho, { cookies })).status, 404, caminho)
    }
    assert.equal((await pedir('/app/', { method: 'POST', cookies })).status, 405)
  })

  test('RELEASE=released: o editor é público (a função só repete o que o estático já teria)', async () => {
    process.env.RELEASE = 'released'
    try {
      const r = await pedir('/app/')
      assert.equal(r.status, 200)
      assert.equal(await r.text(), ler('app/index.html'))
      assert.equal((await pedir('/src/linha.js')).status, 200)
      // mesmo aberto, quem o HUB marcou como closed fica fora
      await semEditor({ ae_conta: sessaoFalsa({ release: 'closed' }) }, 'closed com RELEASE=released')
    } finally {
      delete process.env.RELEASE
    }
  })
})
