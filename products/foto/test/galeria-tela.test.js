// A página do cliente no Chromium, com as rotas de verdade: servidor local (scripts/servir.mjs, com os cabeçalhos do
// vercel.json) em modo local, Postgres temporário e a pasta local de arquivos. A fotógrafa cria e publica pela API
// (como a tela dela fará); o cliente abre o endereço num celular (390 px) e num computador (1280 px):
//   PIN → grade com pilhas → escolher até passar do contratado → foto grande (arrastar) → comentar e pedir →
//   "esta ou esta" → revisar → enviar com o nome → conclusão → só leitura (também depois de recarregar).
// Confere também: sem erro de console nem violação de CSP, nada com o nome do produto no que foi servido, nada rola de
// lado, a fonte da família carregou, os estados de erro (PIN errado, rede caída com desfazer, link que morreu, sem
// armazenamento) e a página neutra para link morto.
// As imagens são paisagens desenhadas em canvas no próprio Chromium (nenhuma foto de pessoa).
// FOTO_TELAS=<pasta> grava as capturas galeria-*.png para olhar.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { ASSINATURA, NOME } from '../app/nome.js'
import { semPostgres, subirPostgres } from './banco-apoio.js'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const EXIGIR = process.env.FOTO_EXIGIR === '1'
const TELAS = (process.env.FOTO_TELAS || '').trim()
const NEUTRA = readFileSync(join(RAIZ, 'app/indisponivel.html'))
const ESPERA = 90000

let chromium = null
try {
  chromium = createRequire(import.meta.url)('playwright').chromium
} catch {
  chromium = null
}
const pular = semPostgres || (chromium ? false : 'sem Playwright na máquina')

let pg, dono, banco, servidor, endereco, publico, pasta, navegador, cookie
const sha256 = (b) => createHash('sha256').update(b).digest('hex')

/** A fotógrafa falando com as rotas dela (modo local: a pessoa vem do cookie foto_local). */
async function api(metodo, caminho, corpo, bytes) {
  const r = await fetch(`${endereco}${caminho}`, {
    method: metodo,
    headers: { cookie, origin: endereco, 'content-type': bytes ? 'application/octet-stream' : 'application/json' },
    body: bytes ?? (corpo ? JSON.stringify(corpo) : undefined),
  })
  return { status: r.status, corpo: await r.json() }
}

/** Desenha no Chromium `n` paisagens (JPEG, prévia e miniatura), com uma marca-d'água leve como numa prova. */
async function desenhar(n) {
  const contexto = await navegador.newContext()
  const p = await contexto.newPage()
  const imagens = await p.evaluate(async (total) => {
    const PALETAS = [
      ['#f6c177', '#eb6f92', '#31466b', '#1f2a44', '#101726'],
      ['#bfe3ff', '#7fb4e6', '#3d6d8f', '#27495f', '#16303d'],
      ['#ffd6a5', '#ff9e7a', '#7a4b63', '#4b2e4a', '#2a1a2e'],
      ['#e8f1d4', '#a9cf9a', '#4f7f5a', '#2f5740', '#183226'],
      ['#f4e4c9', '#e2b07a', '#9a6a4b', '#63402f', '#35221b'],
      ['#d9d6ff', '#a79cf0', '#55508f', '#35315f', '#1b1933'],
    ]
    const pintar = (largura, altura, k, variante) => {
      const c = document.createElement('canvas')
      c.width = largura
      c.height = altura
      const x = c.getContext('2d')
      const cores = PALETAS[k % PALETAS.length]
      const ceu = x.createLinearGradient(0, 0, 0, altura * 0.72)
      ceu.addColorStop(0, cores[1])
      ceu.addColorStop(1, cores[0])
      x.fillStyle = ceu
      x.fillRect(0, 0, largura, altura)
      // sol
      const sx = largura * (0.24 + ((k * 37) % 52) / 100 + variante * 0.035)
      const sy = altura * (0.3 + ((k * 13) % 18) / 100)
      const raio = Math.min(largura, altura) * 0.085
      const brilho = x.createRadialGradient(sx, sy, raio * 0.2, sx, sy, raio * 4.5)
      brilho.addColorStop(0, 'rgba(255,255,255,0.75)')
      brilho.addColorStop(1, 'rgba(255,255,255,0)')
      x.fillStyle = brilho
      x.fillRect(0, 0, largura, altura)
      x.fillStyle = 'rgba(255,252,240,0.96)'
      x.beginPath()
      x.arc(sx, sy, raio, 0, Math.PI * 2)
      x.fill()
      // serras
      for (let camada = 0; camada < 3; camada++) {
        const base = altura * (0.56 + camada * 0.13)
        const amp = altura * (0.085 - camada * 0.012)
        x.fillStyle = cores[2 + camada]
        x.beginPath()
        x.moveTo(0, altura)
        for (let px = 0; px <= largura; px += 8) {
          const t = px / largura
          const y =
            base -
            amp *
              (Math.sin(t * 5.2 + k * 1.7 + camada * 2.1 + variante * 0.25) * 0.6 + Math.sin(t * 11.3 + k * 0.9 + camada) * 0.28 + Math.sin(t * 2.1 + k) * 0.5)
          x.lineTo(px, y)
        }
        x.lineTo(largura, altura)
        x.closePath()
        x.fill()
      }
      // marca-d'água gravada nos pixels, como a de uma prova
      x.save()
      x.translate(largura / 2, altura / 2)
      x.rotate(-Math.PI / 7)
      x.fillStyle = 'rgba(255,255,255,0.16)'
      x.font = `600 ${Math.round(Math.min(largura, altura) * 0.06)}px sans-serif`
      x.textAlign = 'center'
      for (let linha = -2; linha <= 2; linha++) x.fillText('PROVA   ·   PROVA   ·   PROVA', 0, linha * Math.min(largura, altura) * 0.24)
      x.restore()
      return c
    }
    const bytes = (canvas, qualidade) =>
      new Promise((ok) => canvas.toBlob(async (b) => ok([...new Uint8Array(await b.arrayBuffer())]), 'image/jpeg', qualidade))
    const saida = []
    for (let i = 0; i < total; i++) {
      // as três primeiras depois da abertura são uma sequência (quase iguais); mais adiante, um par
      const cena = i >= 1 && i <= 3 ? 1 : i === 8 || i === 9 ? 8 : i
      const variante = i >= 1 && i <= 3 ? i - 1 : i === 9 ? 1 : 0
      const emPe = cena % 4 === 2
      const [l, a] = emPe ? [800, 1200] : [1200, 800]
      saida.push({
        largura: l,
        altura: a,
        previa: await bytes(pintar(l, a, cena, variante), 0.82),
        mini: await bytes(pintar(Math.round(l * 0.4), Math.round(a * 0.4), cena, variante), 0.72),
      })
    }
    return saida
  }, n)
  await contexto.close()
  return imagens.map((i) => ({ ...i, previa: Buffer.from(i.previa), mini: Buffer.from(i.mini) }))
}

/** Cria, registra, envia e publica uma galeria pela API da fotógrafa. Devolve { id, endereco, fotos }. */
async function publicar(ficha, imagens, { pin = null, comPilhas = true } = {}) {
  const criada = await api('POST', '/api/foto/galerias', ficha)
  assert.equal(criada.status, 201, JSON.stringify(criada.corpo))
  const id = criada.corpo.galeria.id
  const registro = imagens.map((im, i) => ({
    fotoId: `cat-${i + 1}`,
    nome: `LIA_${String(4100 + i)}.CR3`,
    ordem: i,
    grupo: comPilhas ? (i >= 1 && i <= 3 ? 'serie-1' : i === 8 || i === 9 ? 'serie-2' : null) : null,
    melhor: comPilhas && (i === 2 || i === 8),
    largura: im.largura,
    altura: im.altura,
    tipo: 'image/jpeg',
    tamanho: im.previa.length,
    sha256: sha256(im.previa),
    mini: { tipo: 'image/jpeg', tamanho: im.mini.length, sha256: sha256(im.mini) },
  }))
  const registradas = await api('POST', `/api/foto/galerias/${id}/fotos`, { fotos: registro })
  assert.equal(registradas.status, 200, JSON.stringify(registradas.corpo))
  const fotos = registradas.corpo.fotos
  for (let i = 0; i < fotos.length; i++) {
    for (const [variante, bytes] of [
      ['previa', imagens[i].previa],
      ['mini', imagens[i].mini],
    ]) {
      const r = await api('PUT', `/api/foto/galerias/${id}/arquivo?foto=${fotos[i].id}&v=${variante}`, null, bytes)
      assert.deepEqual([r.status, r.corpo.ok], [200, true], JSON.stringify(r.corpo))
    }
  }
  const pub = await api('POST', `/api/foto/galerias/${id}/publicar`, pin ? { pin } : {})
  assert.equal(pub.status, 201, JSON.stringify(pub.corpo))
  assert.match(pub.corpo.endereco, new RegExp(`^${endereco}/g/[A-Za-z0-9_-]{43}$`))
  return { id, endereco: pub.corpo.endereco, fotos }
}

/** Uma página do cliente que anota o que deu errado e tudo o que foi servido. */
async function cliente({ largura, altura = 844, celular = false, tema = null, movimento = 'no-preference' }) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: celular ? 2 : 1,
    hasTouch: celular,
    isMobile: celular,
    reducedMotion: movimento,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  })
  if (tema) await contexto.addCookies([{ name: 'foto_tema', value: tema, url: endereco }])
  contexto.setDefaultTimeout(ESPERA)
  const pagina = await contexto.newPage()
  const erros = []
  const servido = []
  const ruins = []
  pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
  pagina.on('pageerror', (e) => erros.push(`erro na página: ${e.message}`))
  pagina.on('response', async (r) => {
    if (!/^https?:/.test(r.url())) return
    const u = new URL(r.url())
    if (r.status() >= 400) ruins.push([r.status(), u.pathname])
    if (u.origin !== endereco) ruins.push(['fora da origem', r.url()])
    const tipo = r.headers()['content-type'] ?? ''
    if (/html|javascript|css|json/.test(tipo)) servido.push([u.pathname, await r.text().catch(() => '')])
  })
  return { contexto, pagina, erros, servido, ruins }
}
const fase = (pagina, nome) => pagina.waitForSelector(`#galeria[data-fase="${nome}"]`)
/** Espera as imagens que estão na tela (as de baixo só carregam quando rolar) e as animações de entrada. */
async function assentar(pagina, seletor = '.grade img') {
  await pagina.waitForFunction(
    (s) => {
      const naTela = [...document.querySelectorAll(s)].filter((i) => {
        const r = i.getBoundingClientRect()
        return r.bottom > 0 && r.top < innerHeight && r.width > 0
      })
      return naTela.length > 0 && naTela.every((i) => i.complete && i.naturalWidth > 0 && i.classList.contains('pronta'))
    },
    seletor,
    { timeout: ESPERA },
  )
  await pagina.evaluate(() => document.fonts.ready)
  await pagina.waitForTimeout(700)
}
async function captura(pagina, nome) {
  if (!TELAS) return
  mkdirSync(TELAS, { recursive: true })
  await pagina.screenshot({ path: join(TELAS, `galeria-${nome}.png`) })
}
/** A tela adianta o coração; o banco chega logo depois: espera a contagem de escolhidas bater. */
async function gravou(galeria, n) {
  const contar = async () => (await dono`select count(*)::int as n from foto.selecao where galeria = ${galeria} and escolhida`)[0].n
  for (let i = 0; i < 150 && (await contar()) !== n; i++) await new Promise((ok) => setTimeout(ok, 100))
  assert.equal(await contar(), n)
}
const texto = (pagina, seletor) => pagina.locator(seletor).first().innerText()
const semRolarDeLado = async (pagina, largura) =>
  assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth), largura, 'a página rola de lado')
const semNome = (servido) => {
  assert.ok(servido.length > 3)
  for (const [caminho, corpo] of servido) {
    assert.ok(!corpo.toLowerCase().includes(NOME.toLowerCase()), `${caminho} tem o nome do produto`)
    assert.ok(!corpo.includes(ASSINATURA), `${caminho} tem a assinatura do produto`)
    assert.doesNotMatch(corpo, /app\/marca|manifest\.webmanifest|apple-touch-icon/, caminho)
  }
}

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(
    `create role foto login password 'teste'; create role foto_app nologin; grant foto_app to foto with admin option; create schema foto authorization foto;`,
  )
  await admin.end()
  const urlFoto = pg.url.replace('postgres://postgres@', 'postgres://foto:teste@')
  pasta = mkdtempSync(join(tmpdir(), 'foto-arquivos-'))
  // modo local: sem o login único configurado, em localhost
  for (const v of ['ZRO_CLIENT_ID', 'ZRO_CLIENT_SECRET', 'FOTO_SITE', 'FOTO_S3_ENDPOINT', 'FOTO_S3_BUCKET', 'FOTO_S3_KEY_ID', 'FOTO_S3_SECRET', 'VERCEL'])
    delete process.env[v]
  process.env.FOTO_LOCAL = '1'
  process.env.FOTO_DATABASE_URL = urlFoto
  process.env.FOTO_ARQUIVOS_DIR = pasta
  await (await import('../scripts/migrar.mjs')).migrar(urlFoto)
  dono = postgres(urlFoto, { max: 2, onnotice: () => {} })
  banco = await import('../api/_banco.js')
  // o site estático mínimo: fontes, as bibliotecas da página e o 404 neutro (o resto sai pelas funções)
  publico = mkdtempSync(join(tmpdir(), 'foto-publico-'))
  cpSync(join(RAIZ, 'fontes'), join(publico, 'fontes'), { recursive: true })
  for (const lib of ['preact', 'htm']) cpSync(join(RAIZ, 'vendor', lib), join(publico, 'vendor', lib), { recursive: true })
  cpSync(join(RAIZ, 'app/indisponivel.html'), join(publico, '404.html'))
  servidor = await (await import('../scripts/servir.mjs')).servir({ porta: 0, publico })
  endereco = `http://127.0.0.1:${servidor.address().port}`
  cookie = `foto_local=${(await import('../api/_sessao.js')).selarLocal('local-0a1b2c3d4e5f', 'Lia Fotografia')}`
  navegador = await chromium.launch()
})
after(async () => {
  await navegador?.close()
  servidor?.close()
  await dono?.end({ timeout: 5 })
  await banco?.fecharBanco()
  await pg?.fechar()
  for (const dir of [pasta, publico]) if (dir) rmSync(dir, { recursive: true, force: true })
  for (const v of ['FOTO_LOCAL', 'FOTO_DATABASE_URL', 'FOTO_ARQUIVOS_DIR']) delete process.env[v]
})

test('Postgres e Chromium são exigidos no CI', { skip: !EXIGIR }, () => {
  assert.equal(pular, false, 'FOTO_EXIGIR=1 e falta Postgres ou Playwright')
})

test(
  'celular (390 px): PIN, pilhas, escolher até passar do contratado, comentar, comparar, enviar e só leitura',
  { skip: pular, timeout: 600000 },
  async () => {
    const imagens = await desenhar(14)
    const g = await publicar(
      {
        nome: 'Casamento Ana & Rui',
        fotografo: 'Lia Fotografia',
        contratadas: 6,
        permiteExtras: true,
        precoExtra: 'R$ 25 por foto',
        prazo: '2030-01-15T15:00:00.000Z',
        mensagem: 'Escolham com calma as que vão para o álbum.',
      },
      imagens,
      { pin: '2468' },
    )
    const { contexto, pagina, erros, servido, ruins } = await cliente({ largura: 390, celular: true })
    try {
      // ── PIN: antes dele, nada da galeria ──
      const resposta = await pagina.goto(g.endereco)
      assert.equal(resposta.status(), 200)
      assert.equal(resposta.headers()['referrer-policy'], 'no-referrer')
      assert.match(resposta.headers()['content-security-policy'], /default-src 'self'/)
      await fase(pagina, 'pin')
      assert.equal(await pagina.title(), 'Absolute ZRO')
      assert.equal(await texto(pagina, 'h1'), 'Digite o PIN.')
      const antes = await pagina.locator('body').innerText()
      assert.doesNotMatch(antes, /Casamento|Lia Fotografia/)
      assert.match(antes, /Absolute ZRO/)
      assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'claro')
      await pagina.evaluate(() => document.fonts.ready)
      assert.equal(await pagina.evaluate(() => document.fonts.check("800 40px 'Figtree Variable'")), true)
      assert.match(await pagina.evaluate(() => getComputedStyle(document.body).fontFamily), /Figtree Variable/)
      // campo de 16 px ou mais (o iPhone não dá zoom) e botão desligado até ter 4 dígitos
      assert.ok((await pagina.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#pin')).fontSize))) >= 16)
      assert.equal(await pagina.locator('.pin button').isDisabled(), true)
      await pagina.waitForTimeout(900)
      await captura(pagina, 'pin-390')
      await pagina.fill('#pin', '2468')
      await pagina.locator('.pin button').tap()

      // ── a grade ──
      await fase(pagina, 'galeria')
      assert.equal(await texto(pagina, '.topo-nome strong'), 'Casamento Ana & Rui')
      assert.equal(await texto(pagina, '.topo-nome span'), 'Lia Fotografia')
      assert.equal(await texto(pagina, '.cabeca h1'), 'Escolha 6 fotos.')
      assert.equal((await texto(pagina, '.sobretitulo')).toLowerCase(), 'até 15 de janeiro')
      assert.equal(await texto(pagina, '.cabeca .apoio'), 'Escolham com calma as que vão para o álbum.')
      // 14 fotos: uma pilha de três e uma de duas aparecem fechadas, com a melhor na frente
      assert.equal(await pagina.locator('.grade .foto').count(), 11)
      assert.deepEqual(await pagina.locator('.selo--pilha').allInnerTexts(), ['3', '2'])
      assert.equal(await pagina.locator('.grade .foto').nth(1).getAttribute('data-foto'), g.fotos[2].id, 'a melhor da pilha na frente')
      assert.equal(await texto(pagina, '.conta'), '0 de 6')
      assert.equal(await pagina.locator('.doca .vidro').isDisabled(), true)
      await assentar(pagina)
      await semRolarDeLado(pagina, 390)
      // as imagens da grade são as miniaturas, com cache privado, e não abrem menu de contexto
      const miniatura = await pagina.evaluate(() => document.querySelector('.grade img').src)
      assert.match(miniatura, /\/g\/[A-Za-z0-9_-]{43}\/i\/[0-9a-f-]{36}\?v=mini&s=[0-9a-f]{12}$/)
      const cabecalhos = await pagina.evaluate(async (u) => Object.fromEntries((await fetch(u)).headers), miniatura)
      assert.equal(cabecalhos['cache-control'], 'private, max-age=86400, immutable')
      assert.equal(cabecalhos['content-type'], 'image/jpeg')
      assert.equal(
        await pagina.evaluate(() => {
          const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
          document.querySelector('.grade img').dispatchEvent(e)
          return e.defaultPrevented
        }),
        true,
      )
      // alvos de toque de 44 px
      for (const seletor of ['.coracao', '.doca .vidro', '.rodape-tema']) {
        const caixa = await pagina.locator(seletor).first().boundingBox()
        assert.ok(caixa.width >= 44 && caixa.height >= 44, `${seletor}: ${caixa.width} × ${caixa.height}`)
      }
      await captura(pagina, 'grade-390')

      // ── pilha: abre no lugar ──
      await pagina.locator('.selo--pilha').first().tap()
      assert.equal(await pagina.locator('.grade .foto').count(), 13)
      assert.equal(await pagina.locator('.grade .foto.da-pilha').count(), 3)
      assert.equal(await pagina.locator('.selo--pilha').first().getAttribute('aria-expanded'), 'true')
      await assentar(pagina)
      await captura(pagina, 'pilha-390')

      // ── escolher: até o contratado e uma a mais ──
      const coracoes = pagina.locator('.grade .coracao')
      for (const i of [0, 1, 4, 5, 6, 7]) await coracoes.nth(i).tap()
      await pagina.waitForFunction(() => document.querySelector('.conta')?.innerText === '6 de 6')
      assert.equal(await pagina.locator('.grade .foto.escolhida').count(), 6)
      assert.equal(await pagina.locator('.doca-extra').count(), 0)
      await pagina.waitForTimeout(600)
      await captura(pagina, 'contratadas-390')
      await coracoes.nth(8).tap()
      await pagina.waitForFunction(() => document.querySelector('.conta')?.innerText === '7 de 6')
      assert.equal(await texto(pagina, '.doca-extra'), '+1 extra · R$ 25 por foto')
      // desfazer e refazer
      await coracoes.nth(8).tap()
      await pagina.waitForFunction(() => document.querySelector('.conta')?.innerText === '6 de 6')
      await coracoes.nth(8).tap()
      await coracoes.nth(9).tap()
      await pagina.waitForFunction(() => document.querySelector('.conta')?.innerText === '8 de 6')
      assert.equal(await texto(pagina, '.doca-extra'), '+2 extras · R$ 25 por foto')
      await pagina.waitForTimeout(700)
      await semRolarDeLado(pagina, 390)
      await captura(pagina, 'extras-390')
      // o servidor tem o mesmo que a tela
      await gravou(g.id, 8)

      // ── a foto grande: arrastar troca ──
      await pagina.locator('.grade .foto-abrir').first().tap()
      await pagina.waitForSelector('.visor')
      assert.equal(await texto(pagina, '.visor-conta'), '1 de 14')
      await assentar(pagina, '.visor-folha--aqui img')
      assert.equal(await pagina.locator('.visor .escolha').getAttribute('aria-pressed'), 'true')
      await captura(pagina, 'visor-390')
      await pagina.mouse.move(300, 380)
      await pagina.mouse.down()
      await pagina.mouse.move(200, 384, { steps: 5 })
      await pagina.mouse.move(90, 386, { steps: 5 })
      await pagina.mouse.up()
      await pagina.waitForFunction(() => document.querySelector('.visor-conta')?.innerText === '2 de 14')
      // arrastar pouco não troca
      await pagina.mouse.move(300, 380)
      await pagina.mouse.down()
      await pagina.mouse.move(280, 381, { steps: 14 })
      await pagina.waitForTimeout(350)
      await pagina.mouse.up()
      await pagina.waitForTimeout(500)
      assert.equal(await texto(pagina, '.visor-conta'), '2 de 14')

      // ── comentário e pedidos ──
      await pagina.locator('.visor-acoes .redondo').first().tap()
      await pagina.waitForSelector('.folha')
      assert.deepEqual(await pagina.locator('.pedido').allInnerTexts(), ['Suavizar pele', 'Preto e branco', 'Remover objeto', 'Clarear', 'Recortar'])
      assert.ok((await pagina.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.folha textarea')).fontSize))) >= 16)
      await pagina.locator('.pedido', { hasText: 'Remover objeto' }).tap()
      await pagina.locator('.pedido', { hasText: 'Clarear' }).tap()
      await pagina.fill('.folha textarea', 'Tirar o fio de luz no canto, por favor.')
      await pagina.waitForTimeout(500)
      await captura(pagina, 'pedido-390')
      await pagina.locator('.folha button[type=submit]').tap()
      await pagina.waitForSelector('.folha', { state: 'detached' })
      assert.equal(await texto(pagina, '.visor-nota p'), 'Tirar o fio de luz no canto, por favor.')
      assert.deepEqual(await pagina.locator('.visor-nota .pedido').allInnerTexts(), ['Remover objeto', 'Clarear'])
      await pagina.waitForTimeout(400)
      await captura(pagina, 'visor-com-pedido-390')

      // ── esta ou esta: a foto 2 é da pilha de três; quem ganha fica escolhida ──
      await pagina.locator('.visor-acoes .redondo').nth(1).tap()
      await pagina.waitForSelector('.duelo')
      assert.equal(await texto(pagina, '.duelo .visor-conta'), 'Esta ou esta')
      assert.equal(await pagina.locator('.duelo-foto').count(), 2)
      await pagina.waitForFunction(() => [...document.querySelectorAll('.duelo-foto img')].every((i) => i.complete && i.naturalWidth > 0))
      await pagina.waitForTimeout(500)
      await captura(pagina, 'esta-ou-esta-390')
      await pagina.locator('.duelo-foto').nth(1).tap()
      await pagina.waitForFunction(() => document.querySelector('.duelo .visor-conta--fim')?.innerText === '2 de 2')
      await pagina.locator('.duelo-foto').nth(0).tap()
      await pagina.waitForSelector('.duelo', { state: 'detached' })
      // ganhou a segunda da pilha (a que ficou no primeiro duelo), que ainda não estava escolhida
      await pagina.waitForFunction(() => document.querySelector('.visor-conta')?.innerText === '3 de 14')
      await pagina.waitForFunction(() => document.querySelector('.visor .escolha')?.getAttribute('aria-pressed') === 'true')
      await pagina.locator('.visor-topo .redondo').tap()
      await pagina.waitForSelector('.visor', { state: 'detached' })
      await pagina.waitForFunction(() => document.querySelector('.conta')?.innerText === '9 de 6')
      assert.equal(await pagina.locator('.grade .selo--nota').count(), 1)

      // ── só as escolhidas ──
      await pagina.locator('.filtro button', { hasText: 'Escolhidas' }).tap()
      assert.equal(await pagina.locator('.grade .foto').count(), 9)
      await pagina.locator('.filtro button', { hasText: 'Todas' }).tap()

      // ── revisar e enviar ──
      await pagina.locator('.doca .vidro').tap()
      await pagina.waitForSelector('.revisar')
      assert.equal(await texto(pagina, '.revisar h1'), 'Sua seleção.')
      assert.equal(await texto(pagina, '.revisar .apoio'), '6 do pacote e 3 extras · R$ 25 por foto.')
      assert.equal(await pagina.locator('.revisar .foto').count(), 9)
      assert.equal(await pagina.locator('.enviar button[type=submit]').isDisabled(), true)
      // tirar uma direto na revisão
      await pagina.locator('.revisar .coracao').last().tap()
      await pagina.waitForFunction(() => document.querySelectorAll('.revisar .foto').length === 8)
      assert.equal(await texto(pagina, '.revisar .apoio'), '6 do pacote e 2 extras · R$ 25 por foto.')
      await assentar(pagina, '.revisar img')
      await captura(pagina, 'revisar-390')
      await pagina.fill('#nome', 'Ana Cliente')
      await pagina.locator('.enviar').scrollIntoViewIfNeeded()
      await pagina.evaluate(() => document.querySelector('.revisar').scrollTo(0, 99999))
      await pagina.waitForTimeout(400)
      await captura(pagina, 'enviar-390')
      await pagina.locator('.enviar button[type=submit]').tap()

      // ── conclusão ──
      await fase(pagina, 'feito')
      assert.equal(await texto(pagina, 'h1'), 'Seleção enviada.')
      assert.equal(await texto(pagina, '.estado .apoio'), 'Lia Fotografia recebeu as suas 8 fotos, com 2 extras.')
      await pagina.waitForTimeout(1600)
      await captura(pagina, 'enviada-390')
      await pagina.locator('.estado .vidro').tap()

      // ── só leitura ──
      await fase(pagina, 'galeria')
      assert.equal(await texto(pagina, '.cabeca h1'), 'Seleção enviada.')
      assert.match(await texto(pagina, '.cabeca .apoio'), /^Por Ana Cliente, em \d{1,2} de [a-zç]+\.$/)
      assert.equal(await pagina.locator('.grade .foto').count(), 8)
      assert.equal(await pagina.locator('button.coracao').count(), 0)
      assert.equal(await pagina.locator('.coracao--fixo').count(), 8)
      assert.equal(await pagina.locator('.doca .vidro').count(), 0)
      assert.equal(await texto(pagina, '.conta'), '8 fotos')
      await assentar(pagina)
      await captura(pagina, 'so-leitura-390')
      // a foto grande em só leitura: sem coração, sem comentar; o pedido aparece
      await pagina.locator(`[data-foto="${g.fotos[2].id}"] .foto-abrir`).tap()
      await pagina.waitForSelector('.visor')
      assert.equal(await pagina.locator('.visor-acoes').count(), 0)
      assert.equal(await texto(pagina, '.visor-nota p'), 'Tirar o fio de luz no canto, por favor.')
      await pagina.locator('.visor-topo .redondo').tap()

      // recarregar: continua só leitura (a prova do PIN vale 12 horas)
      await pagina.reload()
      await fase(pagina, 'galeria')
      assert.equal(await texto(pagina, '.cabeca h1'), 'Seleção enviada.')
      assert.equal(await pagina.locator('button.coracao').count(), 0)
      assert.equal(await pagina.locator('.filtro button[aria-checked=true]').innerText(), 'Escolhidas')
      await semRolarDeLado(pagina, 390)

      // ── a fotógrafa lê a seleção pela API dela ──
      const s = (await api('GET', `/api/foto/galerias/${g.id}/selecao`)).corpo
      assert.deepEqual([s.enviada, s.escolhidas, s.extras, s.envio.nome, s.galeria.estado], [true, 8, 2, 'Ana Cliente', 'concluida'])
      assert.equal(s.ids.length, 8)
      assert.ok(s.ids.includes('cat-2') && s.ids.includes('cat-3') && s.ids.includes('cat-1'))
      const comPedido = s.fotos.filter((f) => f.comentario)
      assert.deepEqual(
        comPedido.map((f) => [f.fotoId, f.comentario, f.etiquetas]),
        [['cat-3', 'Tirar o fio de luz no canto, por favor.', ['clarear', 'remover_objeto']]],
      )
      assert.match(s.listas.lightroom, /^LIA_41\d\d(, LIA_41\d\d){7}$/)
      const naLista = (await api('GET', '/api/foto/galerias')).corpo.galerias.find((x) => x.id === g.id)
      assert.ok(naLista.link.aberturas >= 2)

      // ── reaberta pela fotógrafa: o cliente volta a poder mexer ──
      assert.equal((await api('POST', `/api/foto/galerias/${g.id}/reabrir`)).corpo.galeria.estado, 'reaberta')
      await pagina.reload()
      await fase(pagina, 'galeria')
      assert.equal(await texto(pagina, '.cabeca h1'), 'Escolha 6 fotos.')
      assert.ok((await pagina.locator('button.coracao').count()) > 0)
      assert.equal(await texto(pagina, '.conta'), '8 de 6')

      assert.deepEqual(erros, [], 'erro de console ou violação de CSP')
      assert.deepEqual(ruins, [], 'pedido que falhou ou saiu da origem')
      semNome(servido)
      assert.ok(servido.some(([c]) => /^\/g\/[A-Za-z0-9_-]{43}\/galeria\.js$/.test(c)))
      assert.ok(servido.some(([c]) => c === '/vendor/preact/preact.mjs'))
    } finally {
      await contexto.close()
    }
  },
)

test('computador (1280 px): sem extras a galeria enche; teclado na foto grande; enviar; tema escuro', { skip: pular, timeout: 600000 }, async () => {
  const imagens = await desenhar(12)
  const g = await publicar({ nome: 'Ensaio da Serra', fotografo: 'Lia Fotografia', contratadas: 3 }, imagens)
  const { contexto, pagina, erros, servido, ruins } = await cliente({ largura: 1280, altura: 800 })
  try {
    await pagina.goto(g.endereco)
    await fase(pagina, 'galeria')
    assert.equal(await texto(pagina, '.cabeca h1'), 'Escolha 3 fotos.')
    assert.equal(await texto(pagina, '.cabeca .apoio'), 'Toque no coração das que você quer.')
    assert.equal(await pagina.locator('.sobretitulo').count(), 0)
    await assentar(pagina)
    await semRolarDeLado(pagina, 1280)
    await captura(pagina, 'grade-1280')
    const coracoes = pagina.locator('.grade .coracao')
    for (const i of [0, 2, 5]) await coracoes.nth(i).click()
    await pagina.waitForFunction(() => document.querySelector('.conta')?.innerText === '3 de 3')
    // cheia: a quarta não entra e a tela diz por quê
    await coracoes.nth(6).click()
    await pagina.waitForSelector('.aviso')
    assert.equal(await texto(pagina, '.aviso'), 'Você já escolheu as 3. Tire uma para trocar.')
    assert.equal(await texto(pagina, '.conta'), '3 de 3')
    assert.equal(await pagina.locator('.grade .foto.escolhida').count(), 3)
    await pagina.waitForTimeout(600)
    await captura(pagina, 'cheia-1280')

    // a foto grande pelo teclado
    await pagina.locator('.grade .foto-abrir').nth(3).click()
    await pagina.waitForSelector('.visor')
    await assentar(pagina, '.visor-folha--aqui img')
    const numero = await texto(pagina, '.visor-conta')
    assert.match(numero, /^\d+ de 12$/)
    await pagina.keyboard.press('ArrowRight')
    await pagina.waitForFunction((antes) => document.querySelector('.visor-conta')?.innerText !== antes, numero)
    await pagina.keyboard.press('ArrowLeft')
    await pagina.waitForFunction((antes) => document.querySelector('.visor-conta')?.innerText === antes, numero)
    assert.equal(await pagina.locator('.visor-seta').count(), 2)
    await assentar(pagina, '.visor-folha--aqui img')
    await captura(pagina, 'visor-1280')
    await pagina.locator('.visor-acoes .redondo').first().click()
    await pagina.waitForSelector('.folha')
    await pagina.waitForTimeout(500)
    await captura(pagina, 'pedido-1280')
    await pagina.keyboard.press('Escape')
    await pagina.waitForSelector('.folha', { state: 'detached' })
    assert.equal(await pagina.locator('.visor').count(), 1, 'Esc fecha só a folha')
    await pagina.keyboard.press('Escape')
    await pagina.waitForSelector('.visor', { state: 'detached' })

    // esta ou esta, lado a lado
    await pagina.locator('.selo--pilha').first().click()
    await pagina.locator('.grade .foto.da-pilha .foto-abrir').first().click()
    await pagina.waitForSelector('.visor')
    await pagina.locator('.visor-acoes .redondo').nth(1).click()
    await pagina.waitForSelector('.duelo')
    await pagina.waitForFunction(() => [...document.querySelectorAll('.duelo-foto img')].every((i) => i.complete && i.naturalWidth > 0))
    await pagina.waitForTimeout(500)
    await captura(pagina, 'esta-ou-esta-1280')
    await pagina.locator('.duelo .redondo').click()
    await pagina.waitForSelector('.duelo', { state: 'detached' })
    await pagina.keyboard.press('Escape')
    await pagina.waitForSelector('.visor', { state: 'detached' })

    // revisar e enviar
    await pagina.locator('.doca .vidro').click()
    await pagina.waitForSelector('.revisar')
    assert.equal(await texto(pagina, '.revisar .apoio'), '3 fotos, a conta certa.')
    await pagina.fill('#nome', 'Rui')
    await assentar(pagina, '.revisar img')
    await captura(pagina, 'revisar-1280')
    await pagina.locator('.enviar button[type=submit]').click()
    await fase(pagina, 'feito')
    assert.equal(await texto(pagina, '.estado .apoio'), 'Lia Fotografia recebeu as suas 3 fotos.')
    await pagina.waitForTimeout(1600)
    await captura(pagina, 'enviada-1280')
    await pagina.locator('.estado .vidro').click()
    await fase(pagina, 'galeria')
    await assentar(pagina)
    await captura(pagina, 'so-leitura-1280')
    assert.equal((await api('GET', `/api/foto/galerias/${g.id}/selecao`)).corpo.envio.nome, 'Rui')

    // o tema escuro é escolha: o botão do rodapé troca na hora e a visita seguinte já nasce escura
    await pagina.locator('.rodape-tema').click()
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'escuro')
    await pagina.reload()
    await fase(pagina, 'galeria')
    assert.equal(await pagina.evaluate(() => document.documentElement.getAttribute('data-tema')), 'escuro')
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(14, 14, 16)')
    await pagina.locator('.filtro button', { hasText: 'Todas' }).click()
    await assentar(pagina)
    await captura(pagina, 'escuro-1280')

    assert.deepEqual(erros, [])
    assert.deepEqual(ruins, [])
    semNome(servido)
  } finally {
    await contexto.close()
  }
})

test(
  'estados: PIN errado, rede caída (desfaz e avisa), link que morre, sem armazenamento, link morto e reduzir movimento',
  { skip: pular, timeout: 600000 },
  async () => {
    const imagens = await desenhar(6)
    const g = await publicar({ nome: 'Aniversário da Bia', fotografo: 'Lia Fotografia', contratadas: 4 }, imagens, { pin: '2468', comPilhas: false })
    const { contexto, pagina, erros, servido } = await cliente({ largura: 390, celular: true, movimento: 'reduce', tema: 'escuro' })
    try {
      // carregando: o esqueleto aparece enquanto a galeria não chega
      await pagina.route('**/api/link/abrir', async (rota) => {
        await new Promise((ok) => setTimeout(ok, 1500))
        await rota.continue()
      })
      await pagina.goto(g.endereco)
      await pagina.waitForSelector('.carregando .osso')
      await captura(pagina, 'carregando-390')
      await fase(pagina, 'pin')
      await pagina.unroute('**/api/link/abrir')
      assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'escuro')

      // PIN errado: diz, limpa o campo e deixa tentar de novo
      await pagina.fill('#pin', '1111')
      await pagina.locator('.pin button').tap()
      await pagina.waitForFunction(() => document.querySelector('.pin-erro')?.innerText === 'PIN errado.')
      assert.equal(await pagina.inputValue('#pin'), '')
      await captura(pagina, 'pin-errado-390')
      await pagina.fill('#pin', '2468')
      await pagina.locator('.pin button').tap()
      await fase(pagina, 'galeria')
      await assentar(pagina)
      // com "reduzir movimento" nada fica escondido esperando animação
      assert.equal(
        await pagina.evaluate(() => [...document.querySelectorAll('.cabeca > *, .grade .foto')].every((e) => getComputedStyle(e).opacity === '1')),
        true,
      )
      await captura(pagina, 'escuro-390')

      // rede caída no meio: o coração volta e a tela oferece tentar de novo
      await pagina.route('**/api/link/escolher', (rota) => rota.abort())
      await pagina.locator('.grade .coracao').first().tap()
      await pagina.waitForSelector('.aviso')
      assert.equal(await texto(pagina, '.aviso span'), 'Sem conexão. Não foi salvo.')
      assert.equal(await pagina.locator('.grade .foto.escolhida').count(), 0, 'desfez o que tinha adiantado')
      assert.equal(await texto(pagina, '.conta'), '0 de 4')
      await pagina.waitForTimeout(400)
      await captura(pagina, 'sem-conexao-390')
      await pagina.unroute('**/api/link/escolher')
      await pagina.locator('.aviso button').tap()
      await pagina.waitForFunction(() => document.querySelector('.conta')?.innerText === '1 de 4')
      await gravou(g.id, 1)

      // sem internet: o aviso aparece e some sozinho
      await contexto.setOffline(true)
      await pagina.waitForSelector('.sem-rede')
      await contexto.setOffline(false)
      await pagina.waitForSelector('.sem-rede', { state: 'detached' })

      // sem armazenamento configurado: a tela diz que as fotos não estão disponíveis (nada de fingir)
      const dir = process.env.FOTO_ARQUIVOS_DIR
      delete process.env.FOTO_ARQUIVOS_DIR
      try {
        await pagina.reload()
        await fase(pagina, 'erro')
        assert.equal(await texto(pagina, 'h1'), 'Fotos indisponíveis.')
        await captura(pagina, 'indisponivel-390')
      } finally {
        process.env.FOTO_ARQUIVOS_DIR = dir
      }
      await pagina.locator('.estado .vidro').tap()
      await fase(pagina, 'galeria')

      // o link morre com a página aberta (a fotógrafa revogou): o próximo toque mostra que não vale mais
      assert.equal((await api('DELETE', `/api/foto/galerias/${g.id}/link`)).status, 200)
      await pagina.locator('.grade .coracao').nth(1).tap()
      await fase(pagina, 'erro')
      assert.equal(await texto(pagina, 'h1'), 'Link indisponível.')
      assert.equal(await texto(pagina, '.estado .apoio'), 'Peça um novo a quem enviou.')
      assert.doesNotMatch(await pagina.locator('body').innerText(), /Aniversário|Lia Fotografia/)
      await captura(pagina, 'link-indisponivel-390')

      // quem abre um link morto recebe a página neutra, igual à de qualquer endereço que não existe
      for (const morto of [
        g.endereco,
        `${endereco}/g/${'a'.repeat(43)}`,
        `${endereco}/g/torto`,
        `${g.endereco}/galeria.js`,
        `${g.endereco}/i/${g.fotos[0].id}`,
      ]) {
        const r = await fetch(morto)
        assert.equal(r.status, 404, morto)
        const corpo = Buffer.from(await r.arrayBuffer())
        assert.ok(morto.includes('/i/') ? corpo.length === 0 : corpo.equals(NEUTRA), morto)
      }
      const neutra = await pagina.goto(g.endereco)
      assert.equal(neutra.status(), 404)
      assert.equal(await texto(pagina, 'h1'), 'Página indisponível.')
      await captura(pagina, 'link-morto-390')

      // aqui os erros de console são só os que o teste provocou (401 do PIN, rede cortada, 503, 404 do link morto)
      for (const e of erros) assert.match(e, /Failed to load resource|net::ERR_/, e)
      assert.ok(!erros.some((e) => /Content Security Policy|Refused to/.test(e)))
      semNome(servido)
    } finally {
      await contexto.close()
    }
  },
)

test('galeria vazia: quando as fotos ainda não têm arquivo, a tela diz', { skip: pular, timeout: 300000 }, async () => {
  const imagens = await desenhar(1)
  const g = await publicar({ nome: 'Formatura', fotografo: 'Lia Fotografia', contratadas: 10 }, imagens, { comPilhas: false })
  // o arquivo some do registro (como depois da limpeza de uma galeria vencida que foi republicada sem reenviar)
  await dono`alter table foto.galeria_fotos disable trigger galeria_fotos_guarda`
  await dono`update foto.galeria_fotos set enviada_em = null where galeria = ${g.id}`
  await dono`alter table foto.galeria_fotos enable trigger galeria_fotos_guarda`
  const { contexto, pagina, erros } = await cliente({ largura: 390, celular: true })
  try {
    await pagina.goto(g.endereco)
    await fase(pagina, 'galeria')
    assert.equal(await texto(pagina, '.vazio h2'), 'As fotos ainda não chegaram.')
    assert.equal(await pagina.locator('.doca').count(), 0)
    await pagina.waitForTimeout(800)
    await captura(pagina, 'vazia-390')
    assert.deepEqual(erros, [])
  } finally {
    await contexto.close()
  }
})
