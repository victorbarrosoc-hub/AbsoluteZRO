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
import { ABERTO, FECHADO, MARCA, NEUTRAS, PAGINA_404, RECADO, RECADO_WEB, SITE, itens, paginaAberta, pecasDoLancamento, publicar } from '../scripts/publicar-site.mjs'
import { LANCADO, release } from '../api/_release.js'
import baixar, { INSTALADORES, destino } from '../api/baixar.js'
import { iniciarZroFalsa } from './zro-falso.js'

const RAIZ = new URL('..', import.meta.url)
const ler = (p) => readFileSync(new URL(p, RAIZ), 'utf8')

describe('o que o site publica', () => {
  test('vercel.json: nada aponta para o GitHub; /baixar pela função (fechado volta à home); o editor só pela função; recado nos instaladores', () => {
    const v = JSON.parse(ler('vercel.json'))
    assert.doesNotMatch(JSON.stringify(v), /github\.com/)
    assert.equal(v.outputDirectory, 'publico')
    assert.equal(v.redirects, undefined)
    assert.deepEqual(
      v.rewrites.map((r) => [r.source, r.destination]),
      [
        // o repasse do Set (api/_set.js, que confere a liberação como a Z)
        ['/api/zro/set/:caminho*', '/api/zro/set?c=:caminho*'],
        ['/app/:caminho*', '/api/app?caminho=app/:caminho*'],
        ['/src/:caminho*', '/api/app?caminho=src/:caminho*'],
        ['/presets/:caminho*', '/api/app?caminho=presets/:caminho*'],
        // o site do app (marca e folhas): fechado, só para a conta liberada
        ['/site/:caminho*', '/api/app?caminho=site/:caminho*'],
        ['/marca/:caminho*', '/api/app?caminho=marca/:caminho*'],
        // o instalador (api/baixar.js): fechado volta para "Em desenvolvimento"
        ['/baixar/:sistema', '/api/baixar?sistema=:sistema'],
      ],
    )
    const inclui = v.functions['api/app.js'].includeFiles
    for (const p of ['app/**', 'src/**', 'presets/**', 'site/**', 'marca/**', 'em-desenvolvimento.html']) assert.ok(inclui.includes(p), p)
    // nenhum cache público em caminho que a função entrega só para a conta liberada
    for (const h of v.headers) for (const x of h.headers) if (x.key === 'Cache-Control') assert.ok(!/^\/(marca|site|app|src|presets)/.test(h.source) || !/public/.test(x.value), h.source)
    assert.ok(v.headers.some((h) => h.source === '/api/(.*)' && h.headers.some((x) => x.key === 'Cache-Control' && x.value === 'no-store')))
    for (const nome of ['/instalar.sh', '/instalar.ps1']) assert.ok(v.headers.some((h) => h.source === nome && h.headers.some((x) => x.value.startsWith('text/plain'))), nome)
  })

  test('publicar-site: fechado sai só a página neutra e vendor/ (sem marca, site/, editor nem instalador de verdade); aberto sai tudo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aeon-publico-'))
    try {
      const raiz = join(dir, 'raiz')
      const arquivo = (p) => {
        mkdirSync(join(raiz, p, '..'), { recursive: true })
        writeFileSync(join(raiz, p), `conteudo de ${p}`)
      }
      for (const p of ['index.html', 'entrar.html', 'em-desenvolvimento.html', 'instalar.sh', 'instalar.ps1', 'site/home.js', 'marca/og.jpg', 'vendor/mediabunny.min.mjs', 'app/index.html', 'app/editor.js', 'presets/fala.v1.json', 'desktop/main.cjs', 'api/app.js']) arquivo(p)
      for (const p of [...MARCA, 'src/linha.js', 'src/exportar/edl.js']) arquivo(p)
      // a página inicial com um trecho marcado e a peça do lançamento (fora de site/: não é publicada)
      writeFileSync(join(raiz, 'index.html'), '<p><!-- lancamento:x -->Em desenvolvimento<!-- /lancamento:x --></p>')
      mkdirSync(join(raiz, 'lancamento'), { recursive: true })
      writeFileSync(join(raiz, 'lancamento', 'pagina.html'), '<template data-parte="x"><a href="#baixar">Baixar</a></template>')

      const fechado = publicar({ raiz: new URL(`file://${raiz}/`), saida: new URL(`file://${join(dir, 'fechado')}/`), estado: 'closed' })
      assert.deepEqual(fechado.itens, FECHADO)
      const tem = (saida, p) => existsSync(join(dir, saida, p))
      for (const p of ['index.html', 'entrar.html', 'em-desenvolvimento.html', PAGINA_404, 'vendor/mediabunny.min.mjs']) assert.ok(tem('fechado', p), `fechado tem ${p}`)
      // revisão de 01/11/2026: marca/ (ícone, OG), site/ e os módulos da marca não ficam públicos com ele fechado
      for (const p of ['app', 'app/index.html', 'presets', 'src', 'site', 'marca', 'desktop', 'api', 'lancamento']) assert.ok(!tem('fechado', p), `fechado não tem ${p}`)
      // fechado, a página inicial, a entrada e o 404 saem como a página neutra (titular, 01/11/2026): nada do AEON
      for (const p of [...NEUTRAS, PAGINA_404]) assert.equal(readFileSync(join(dir, 'fechado', p), 'utf8'), 'conteudo de em-desenvolvimento.html', p)
      // os instaladores existem, mas só com o recado neutro: nada de Release, download, instalação ou nome do app
      for (const nome of ['instalar.sh', 'instalar.ps1']) {
        const texto = readFileSync(join(dir, 'fechado', nome), 'utf8')
        assert.equal(texto, RECADO[nome])
        assert.doesNotMatch(texto, /github|releases|curl|Invoke-WebRequest|hdiutil|Start-Process|AEON|desenvolvimento/i)
        assert.match(texto, /Indisponível/)
        assert.match(texto, /https:\/\/absolutezro\.com/)
      }
      assert.match(RECADO['instalar.sh'], /^#!\/bin\/sh\n/)
      assert.match(RECADO['instalar.sh'], /\nexit 1\n$/)

      const aberto = publicar({ raiz: new URL(`file://${raiz}/`), saida: new URL(`file://${join(dir, 'aberto')}/`), estado: 'released', computador: true })
      assert.deepEqual(aberto.itens, [...SITE, ...ABERTO])
      for (const p of ['app/editor.js', 'presets/fala.v1.json', 'src/linha.js', 'src/exportar/edl.js', 'instalar.sh', 'site/home.js', 'marca/og.jpg', ...MARCA]) assert.ok(tem('aberto', p), `aberto tem ${p}`)
      assert.equal(readFileSync(join(dir, 'aberto', PAGINA_404), 'utf8'), 'conteudo de em-desenvolvimento.html')
      assert.equal(readFileSync(join(dir, 'aberto', 'instalar.sh'), 'utf8'), 'conteudo de instalar.sh')
      for (const p of ['desktop', 'api', 'lancamento']) assert.ok(!tem('aberto', p), p)
      // a página do lançamento: o trecho marcado vira a peça
      assert.equal(readFileSync(join(dir, 'aberto', 'index.html'), 'utf8'), '<p><a href="#baixar">Baixar</a></p>')
      // aberto só na web (o app de computador ainda não): o editor sai, e o Terminal manda para o navegador
      const web = publicar({ raiz: new URL(`file://${raiz}/`), saida: new URL(`file://${join(dir, 'web')}/`), estado: 'released', computador: false })
      assert.equal(web.computador, false)
      assert.ok(tem('web', 'app/editor.js'))
      for (const nome of ['instalar.sh', 'instalar.ps1']) {
        const texto = readFileSync(join(dir, 'web', nome), 'utf8')
        assert.equal(texto, RECADO_WEB[nome])
        assert.doesNotMatch(texto, /github|releases|curl|Invoke-WebRequest|hdiutil|Start-Process/i)
        assert.match(texto, /aeon\.absolutezro\.com\/app\//)
      }
      // o padrão é fechado: sem RELEASE no ambiente, nada do editor; e, com a trava do titular, nem com RELEASE=released
      delete process.env.RELEASE
      assert.deepEqual(itens(), FECHADO)
      process.env.RELEASE = 'released'
      assert.equal(LANCADO, false)
      assert.equal(release(), 'closed')
      assert.deepEqual(itens(), FECHADO)
      delete process.env.RELEASE
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('lançamento só na web (o app de computador ainda não): Abrir o AEON no navegador, Mac e Windows "Em breve" sem link', () => {
    const html = paginaAberta(ler('index.html'), pecasDoLancamento(ler('lancamento/pagina.html')))
    assert.doesNotMatch(html, /Em desenvolvimento|em-desenvolvimento|Chegando|quando ele abrir|Quando o AEON abre|lancamento:/)
    assert.match(html, /<section class="baixar-sec" id="baixar"/)
    // barra, topo, cartão e fim abrem o editor; nada de instalador, Release ou Terminal
    assert.equal((html.match(/href="\/app\/"/g) || []).length, 4)
    assert.doesNotMatch(html, /\/baixar\/(mac|windows)|instalar\.(sh|ps1)|curl -fsSL|irm https|xattr|releases|\.dmg|\.exe/)
    assert.equal((html.match(/<li class="baixar-breve" aria-disabled="true">/g) || []).length, 2)
    assert.match(html, />Abrir o AEON</)
    assert.match(html, /Mac e Windows em breve/)
    assert.match(html, />Quanto custa\?</)
    assert.match(html, /No AEON</)
  })

  test('lançamento com o app de computador: a página aberta tem Baixar (Mac, Windows, navegador, Terminal) e nada de "Em desenvolvimento"', () => {
    const pecas = pecasDoLancamento(ler('lancamento/pagina.html'), { computador: true })
    const html = paginaAberta(ler('index.html'), pecas)
    // cada trecho marcado tem a sua peça (e nenhuma sobra): paginaAberta reclama dos dois lados
    assert.deepEqual(Object.keys(pecas).sort(), ['baixar', 'descricao', 'faq', 'fim', 'menu', 'nav', 'topo', 'z'])
    assert.doesNotMatch(html, /Em desenvolvimento|em-desenvolvimento|Chegando|quando ele abrir|Quando o AEON abre|Ainda sem download|lancamento:/)
    assert.match(html, /<section class="baixar-sec" id="baixar"/)
    for (const href of ['/baixar/mac', '/baixar/windows', '/app/']) assert.match(html, new RegExp(`href="${href}"`))
    assert.match(html, /curl -fsSL https:\/\/aeon\.absolutezro\.com\/instalar\.sh \| bash/)
    assert.match(html, /irm https:\/\/aeon\.absolutezro\.com\/instalar\.ps1 \| iex/)
    assert.match(html, /xattr -cr \/Applications\/AEON\.app/)
    // o topo, a barra e o fim levam para Baixar; o teste ao vivo continua no topo
    assert.equal((html.match(/href="#baixar"/g) || []).length, 4)
    assert.match(html, />Baixar o AEON</)
    assert.match(html, />Quanto custa\?</)
    assert.match(html, /No AEON</)
    // nenhum link direto para o Release na página: o arquivo sai por /baixar (api/baixar.js)
    assert.doesNotMatch(html, /releases|\.dmg"|\.exe"/)
    assert.throws(() => paginaAberta(ler('index.html'), { ...pecas, sobra: '' }), /sem lugar/)
    const { nav: _nav, ...semNav } = pecas
    assert.throws(() => paginaAberta(ler('index.html'), semNav), /não tem a peça "nav"/)
  })

  test('/baixar/<sistema> (api/baixar.js): fechado (e com a trava do titular, mesmo com RELEASE=released) volta para a página neutra', () => {
    const antes = process.env.RELEASE
    try {
      delete process.env.RELEASE
      for (const s of ['mac', 'windows', 'linux']) assert.equal(destino(s), '/#em-desenvolvimento')
      process.env.RELEASE = 'released'
      process.env.RELEASE_DESKTOP = 'released'
      for (const s of ['mac', 'windows', 'linux']) assert.equal(destino(s), '/#em-desenvolvimento')
      if (!LANCADO) return
      delete process.env.RELEASE_DESKTOP
      // só na web: o instalador ainda não sai; volta para a seção da página ("Em breve")
      for (const s of ['mac', 'windows']) assert.equal(destino(s), '/#baixar')
      process.env.RELEASE_DESKTOP = 'released'
      assert.equal(destino('mac'), 'https://github.com/victorbarrosoc-hub/AbsoluteZRO/releases/download/ai-edit-app-desktop/AEON-mac-universal.dmg')
      assert.equal(destino('windows'), 'https://github.com/victorbarrosoc-hub/AbsoluteZRO/releases/download/ai-edit-app-desktop/AEON-windows-setup.exe')
      assert.equal(destino('linux'), '/#baixar')
      // os nomes são os do workflow (ai-edit-desktop.yml) e do atualizador do app
      const wf = readFileSync(new URL('../../../.github/workflows/ai-edit-desktop.yml', import.meta.url), 'utf8')
      assert.match(wf, /\*-mac-universal\.dmg/)
      assert.match(wf, /\*-windows-setup\.exe/)
      assert.deepEqual(Object.values(INSTALADORES), ['AEON-mac-universal.dmg', 'AEON-windows-setup.exe'])
      const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, end() { this.fim = true } }
      baixar({ url: '/api/baixar?sistema=MAC' }, res)
      assert.equal(res.statusCode, 302)
      assert.match(res.headers.Location, /AEON-mac-universal\.dmg$/)
      assert.equal(res.headers['Cache-Control'], 'no-store')
    } finally {
      if (antes === undefined) delete process.env.RELEASE
      else process.env.RELEASE = antes
      delete process.env.RELEASE_DESKTOP
    }
  })

  test('os módulos da marca que o site publica não puxam o editor', () => {
    for (const m of MARCA) {
      const imports = [...ler(m).matchAll(/from\s+'([^']+)'/g)].map((x) => x[1])
      for (const i of imports) assert.ok(MARCA.includes(`src/${i.replace(/^\.\//, '')}`), `${m} importa ${i}`)
    }
    for (const f of ['site/home.js', 'site/estudio.js', 'site/montagem.js', 'site/entrar.js', 'site/fechado.js', 'site/conta.js']) {
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

  test('em-desenvolvimento.html: a página neutra (titular, 01/11/2026), sem marca, nome ou explicação do app', () => {
    const html = ler('em-desenvolvimento.html')
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/)
    assert.match(html, /<title>Absolute ZRO<\/title>/)
    assert.match(html, /<h1><span>Página <\/span><b>indisponível\.<\/b><\/h1>/)
    assert.equal((html.match(/<p[\s>]/g) || []).length, 1, 'uma linha de apoio')
    assert.match(html, /<a href="https:\/\/absolutezro\.com">Ir para a Absolute ZRO</)
    assert.doesNotMatch(html, /AEON|desenvolvimento\.|em breve|Revela|NOSSOM|api\/|app\/|\.json|process\.env|RELEASE/i)
    // tudo dentro da página (a função a entrega em /app/, /src/* e /presets/*): nada de folha, script ou imagem de fora
    assert.doesNotMatch(html, /<script|<link|<img|src="/)
  })

  test('caminhoSeguro: só app/, src/, presets/, site/ e marca/, sem subir pasta nem arquivo oculto', () => {
    assert.equal(caminhoSeguro('marca/aeon-icone.svg'), 'marca/aeon-icone.svg')
    assert.equal(caminhoSeguro('site/site.css'), 'site/site.css')
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
      if (/^\/(app|src|presets|site|marca)(\/|$)/.test(u.pathname)) {
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
      assert.match(html, /indisponível\./, rotulo)
      assert.doesNotMatch(html, /AEON/, rotulo)
      assert.doesNotMatch(html, /editor\.js|zro-tokens/, `${rotulo}: ${caminho} entregou o editor`)
    }
    // fora as páginas, 404 com a página neutra: nem o arquivo nem a marca aparecem (revisão de 01/11/2026)
    for (const caminho of ['/app/editor.js', '/app/editor.css', '/src/linha.js', '/src/marca.js', '/src/exportar/edl.js', '/presets/fala.v1.json', '/api/app?caminho=app/editor.js', '/marca/aeon-icone.svg', '/marca/og.jpg', '/site/home.js', '/marca/nada.svg']) {
      const r = await pedir(caminho, { cookies })
      assert.equal(r.status, 404, `${rotulo}: ${caminho}`)
      assert.match(r.headers.get('content-type'), /^text\/html/, `${rotulo}: ${caminho}`)
      const html = await r.text()
      assert.match(html, /indisponível\./, `${rotulo}: ${caminho}`)
      assert.doesNotMatch(html, /AEON/, `${rotulo}: ${caminho}`)
    }
  }

  test('anônimo: a página neutra (200) no lugar do editor e 403 nos arquivos dele', async () => {
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
      ['/marca/aeon-icone.svg', /^image\/svg\+xml/, 'marca/aeon-icone.svg'],
      ['/site/home.js', /^text\/javascript/, 'site/home.js'],
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

  test('RELEASE=released não abre com a trava do titular (LANCADO = false): anônimo e closed seguem sem o editor', async () => {
    process.env.RELEASE = 'released'
    try {
      assert.equal(LANCADO, false)
      await semEditor({}, 'anônimo com RELEASE=released')
      await semEditor({ ae_conta: sessaoFalsa({ release: 'closed' }) }, 'closed com RELEASE=released')
      // a conta allowed (a administração da plataforma, no HUB) continua entrando
      assert.equal((await pedir('/app/', { cookies: { ae_conta: sessaoFalsa({ release: 'allowed' }) } })).status, 200)
    } finally {
      delete process.env.RELEASE
    }
  })
})
