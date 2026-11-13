// A casca do app no Chromium, pelo servidor local com os cabeçalhos de produção (vercel.json), em modo local
// (FOTO_LOCAL=1). As fotos são fabricadas aqui (test/apoio-tela.js): 299 JPEG desenhados num canvas e um DNG de
// verdade com o JPEG da câmera ao lado. Confere:
//   - a casca abre sem erro de console nem violação da CSP, e o nome só vem de app/nome.js;
//   - com a sessão do login único, nada é pedido para fora e nada dá erro (o que test/fechado.test.js exige da casca);
//   - "Escolher fotos" com 300 arquivos: miniaturas, RAW + JPEG como uma foto só, e a grade com poucos nós no DOM;
//   - teclado: setas, P, X, 1–5, cores, seleção com Shift e Cmd/Ctrl + A, desfazer; filtros;
//   - lupa: abre, navega, dá zoom, compara, marca e volta;
//   - tema troca e persiste; reduzir movimento; celular (390 px) sem rolar de lado e com alvos de 44 px;
//   - o trabalho reabre depois de recarregar.
// Capturas de tela em FOTO_TELAS (ou numa pasta temporária): casca-*.png.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ASSINATURA, NOME } from '../app/nome.js'
import { abrirChromium, EXIGIR, fabricarFotos, pastaDasTelas, semChromium, subirApp, vigiar } from './apoio-tela.js'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const TELAS = pastaDasTelas()
const QUANTAS = 300
const ESPERA = 60_000

let app, navegador, fotos

before(async () => {
  if (semChromium) return
  app = await subirApp()
  navegador = await abrirChromium()
  fotos = await fabricarFotos(navegador, { quantas: QUANTAS })
})
after(async () => {
  await navegador?.close()
  await app?.fechar()
})

/** Uma página nova do app, já pronta. `opcoes` vai para o contexto (viewport, toque, reduzir movimento). */
async function abrir(opcoes = {}, { tema } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, ...opcoes })
  if (tema) await contexto.addCookies([{ name: 'foto_tema', value: tema, url: app.base }])
  contexto.setDefaultTimeout(ESPERA)
  const pagina = await contexto.newPage()
  const olho = vigiar(pagina, app.base)
  const resposta = await pagina.goto(`${app.base}/`)
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  return { contexto, pagina, olho, resposta }
}
const CELULAR = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }

/** Escolhe as 300 fotos e espera a grade ficar inteira (a contagem de "Todas" chega ao total). */
async function carregar(pagina) {
  await pagina.setInputFiles('input[data-escolher]', fotos.arquivos)
  await pagina.waitForFunction((n) => document.querySelector('.pilula[data-valor="todas"] .pilula-n')?.textContent.trim() === String(n), fotos.total, { timeout: ESPERA })
  await pagina.waitForSelector('.foto img', { timeout: ESPERA })
}
const limpo = (olho) => assert.deepEqual({ erros: olho.erros, falhas: olho.falhas, ruins: olho.ruins, fora: olho.fora }, { erros: [], falhas: [], ruins: [], fora: [] })
const captura = (pagina, nome) => pagina.screenshot({ path: join(TELAS, `casca-${nome}.png`) })
const contagem = (pagina, valor) => pagina.locator(`.pilula[data-valor="${valor}"] .pilula-n`).innerText().then((t) => Number(t.replace(/\D/g, '')))
/** O estado da loja, lido de dentro da página (o mesmo módulo que o app usa). */
const naLoja = (pagina, f, arg) => pagina.evaluate(async ({ codigo, arg }) => new Function('loja', 'arg', `return (${codigo})(loja, arg)`)((await import('/app/estado.js')).loja, arg), { codigo: f.toString(), arg })

function arquivosDe(pasta, base = '') {
  const lista = []
  for (const e of readdirSync(join(pasta, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) lista.push(...arquivosDe(pasta, rel))
    else lista.push(rel)
  }
  return lista.sort()
}

test('Chromium é exigido no CI', { skip: !EXIGIR }, () => {
  assert.equal(semChromium, false, 'FOTO_EXIGIR=1 e o Playwright não está instalado')
})

test('o nome do produto mora só em app/nome.js: telas, estilos e núcleo da biblioteca não escrevem', () => {
  const fontes = [...arquivosDe(join(RAIZ, 'app')).map((f) => `app/${f}`), ...arquivosDe(join(RAIZ, 'src/biblioteca')).map((f) => `src/biblioteca/${f}`), 'test/casca.test.js', 'test/catalogo.test.js', 'test/apoio-tela.js']
  for (const f of fontes) {
    if (f === 'app/nome.js' || !/\.(js|css|html|webmanifest|svg)$/.test(f)) continue
    const texto = readFileSync(join(RAIZ, f), 'utf8')
    assert.ok(!texto.toLowerCase().includes(NOME.toLowerCase()), `${f} escreve o nome do produto à mão`)
    assert.ok(!texto.includes(ASSINATURA), `${f} escreve a assinatura à mão`)
  }
  // a casca: sem script inline (a CSP não deixa), sem endereço de fora, com os marcadores que o servidor troca
  const casca = readFileSync(join(RAIZ, 'app/index.html'), 'utf8')
  assert.doesNotMatch(casca, /<script(?![^>]*\bsrc=)[^>]*>/)
  assert.doesNotMatch(casca, /https?:\/\//)
  assert.doesNotMatch(casca, /<style/)
  assert.match(casca, /<html lang="pt-BR" data-tema="%TEMA%">/)
  assert.match(casca, /<title>%NOME%<\/title>/)
  assert.match(casca, /<script type="module" src="\/app\/principal\.js"><\/script>/)
  for (const css of ['/app/foto.css', '/app/casca/casca.css', '/app/grade/grade.css']) assert.ok(casca.includes(`<link rel="stylesheet" href="${css}" />`), css)
})

test('o sistema visual: claro é o padrão, o palco é neutro e escuro nos dois temas, nada de azul em texto ou foco', () => {
  const css = ['app/foto.css', 'app/casca/casca.css', 'app/grade/grade.css'].map((f) => readFileSync(join(RAIZ, f), 'utf8')).join('\n')
  // o palco é cinza neutro (R = G = B)
  const palco = /--palco:\s*#([0-9a-f]{6})/.exec(css)[1]
  assert.equal(palco.slice(0, 2), palco.slice(2, 4))
  assert.equal(palco.slice(2, 4), palco.slice(4, 6))
  assert.ok(parseInt(palco.slice(0, 2), 16) < 32, 'o palco é escuro')
  // sem degradê em texto e sem cor de marca em `color`: as cores de etiqueta só entram como fundo do ponto
  assert.doesNotMatch(css, /background-clip:\s*text/)
  assert.doesNotMatch(css, /(?<![-\w])color:\s*var\(--cor-/)
  assert.doesNotMatch(css, /outline[^;]*var\(--cor-/)
  // foco em anel grafite (a cor do texto), e o corte de movimento no fim
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*2px solid var\(--texto\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important/)
  // o símbolo da casca é o da marca (scripts/marca.mjs gera app/marca/simbolo.svg)
  const simbolo = readFileSync(join(RAIZ, 'app/marca/simbolo.svg'), 'utf8')
  const raio = /RAIO_DO_SIMBOLO = '([^']+)'/.exec(readFileSync(join(RAIZ, 'app/casca/simbolo.js'), 'utf8'))[1]
  assert.ok(simbolo.includes(raio), 'o raio do símbolo da casca não é o de app/marca/simbolo.svg')
})

test('a casca abre: o símbolo, o nome fino × pesado, uma ação principal, sem erro de console nem violação da CSP', { skip: semChromium }, async () => {
  const { contexto, pagina, olho, resposta } = await abrir()
  try {
    assert.match(resposta.headers()['content-security-policy'], /script-src 'self' 'wasm-unsafe-eval'/)
    assert.equal(await pagina.title(), NOME)
    // um título e uma linha de apoio (os mesmos seletores de test/fechado.test.js)
    assert.equal(await pagina.locator('#app h1').innerText(), NOME)
    assert.equal(await pagina.locator('#app p').innerText(), ASSINATURA)
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'claro')
    await pagina.evaluate(() => document.fonts.ready)
    assert.equal(await pagina.evaluate(() => document.fonts.check("800 40px 'Figtree Variable'") && document.fonts.check("300 20px 'Figtree Variable'")), true)
    const estilo = await pagina.evaluate(() => {
      const h1 = getComputedStyle(document.querySelector('#app h1'))
      const p = getComputedStyle(document.querySelector('#app p'))
      return { pesoH1: h1.fontWeight, corH1: h1.color, pesoP: p.fontWeight, corP: p.color, fundo: getComputedStyle(document.body).backgroundColor, fonte: getComputedStyle(document.body).fontFamily }
    })
    assert.deepEqual({ ...estilo, fonte: undefined }, { pesoH1: '800', corH1: 'rgb(29, 29, 31)', pesoP: '300', corP: 'rgb(110, 110, 115)', fundo: 'rgb(245, 245, 247)', fonte: undefined })
    assert.match(estilo.fonte, /Figtree Variable/)
    // uma ação principal (vidro escuro) e uma secundária
    assert.equal(await pagina.locator('.inicio-acoes .vidro').count(), 2)
    assert.equal(await pagina.locator('.inicio-acoes .vidro--tinta').count(), 1)
    assert.equal(await pagina.locator('.inicio-acoes .vidro--tinta').innerText(), 'Abrir pasta')
    assert.equal(await pagina.locator('[data-acao="escolher-fotos"]').innerText(), 'Escolher fotos')
    // o símbolo é o protagonista e a assinatura do topo; sem trabalho aberto não há dock
    assert.ok((await pagina.locator('.simbolo-vivo').boundingBox()).width >= 130)
    assert.ok((await pagina.locator('.topo .simbolo').boundingBox()).width <= 32)
    assert.equal(await pagina.locator('.dock').count(), 0)
    // o anel terminou de se desenhar e o raio de cruzar
    await pagina.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.querySelector('.simbolo-vivo .simbolo-anel')).strokeDashoffset), '0px')
    assert.match(await pagina.evaluate(() => getComputedStyle(document.querySelector('.simbolo-vivo .simbolo-raio')).clipPath), /^inset\(-1px 0(px|%)?( -1px 0(px|%)?)?\)$/)
    // modo local: sem conta de verdade, nem Set nem Z aparecem (e nada é pedido para fora)
    await pagina.mouse.move(300, 300)
    await pagina.waitForTimeout(300)
    assert.equal(await pagina.locator('.topo-set, .topo-z').count(), 0)
    // ? abre o mapa de teclas, que vem do contrato
    await pagina.keyboard.press('?')
    await pagina.waitForSelector('dialog.folha-atalhos[open]')
    await pagina.waitForFunction(() => document.querySelector('dialog.folha-atalhos').getAnimations({ subtree: true }).every((a) => a.playState !== 'running'))
    const teclas = await pagina.locator('dialog.folha-atalhos kbd').allInnerTexts()
    for (const t of ['P', 'X', 'U', 'G', 'E', 'Z', 'N', 'D', '?', 'Caps Lock']) assert.ok(teclas.includes(t), t)
    await captura(pagina, 'atalhos-1440-claro')
    await pagina.keyboard.press('Escape')
    await pagina.waitForSelector('dialog.folha-atalhos[open]', { state: 'detached' })
    await captura(pagina, 'inicio-1440-claro')
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

test('com a sessão do login único: a mesma casca, sem pedir nada de fora e sem resposta de erro', { skip: semChromium }, async () => {
  // o servidor é o mesmo; o que muda é o ambiente (lido a cada pedido): login "configurado" e sem modo local
  const antes = { local: process.env.FOTO_LOCAL, id: process.env.ZRO_CLIENT_ID, segredo: process.env.ZRO_CLIENT_SECRET, emissor: process.env.ZRO_ISSUER }
  delete process.env.FOTO_LOCAL
  process.env.ZRO_CLIENT_ID = 'foto-web'
  process.env.ZRO_CLIENT_SECRET = 'segredo-de-teste-que-so-existe-aqui'
  process.env.ZRO_ISSUER = 'http://127.0.0.1:9'
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    const z = await import('../api/_zro.js')
    const sessao = z.selar(z.COOKIE_CONTA, { sub: 'zro-1', nome: 'Lia Fotógrafa', email: 'lia@exemplo.com', apps: ['foto'], org: { id: 'org-1', nome: 'Estúdio Lia', papel: 'owner' }, lido: Math.floor(Date.now() / 1000) }, 3600)
    await contexto.addCookies([{ name: 'foto_conta', value: sessao, url: app.base }])
    const pagina = await contexto.newPage()
    const olho = vigiar(pagina, app.base)
    const pedidos = []
    pagina.on('request', (r) => pedidos.push(new URL(r.url()).pathname))
    await pagina.goto(`${app.base}/`)
    await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
    assert.equal(await pagina.locator('#app h1').innerText(), NOME)
    assert.equal(await pagina.locator('#app p').innerText(), ASSINATURA)
    // a conta aparece no topo, com as iniciais (sem foto) e o caminho para editar o perfil na Absolute ZRO
    await pagina.waitForSelector('.conta .avatar')
    assert.equal(await pagina.locator('.conta .avatar').innerText(), 'LF')
    await pagina.locator('.conta button').click()
    assert.equal(await pagina.locator('.conta .menu-lista a[role="menuitem"]').getAttribute('href'), 'https://absolutezro.com/perfil')
    assert.deepEqual(await pagina.locator('.conta .menu-lista [role="menuitem"]').allInnerTexts().then((l) => l.map((t) => t.split('\n')[0])), ['Sua conta Absolute ZRO', 'Atalhos do teclado', 'Sair'])
    // (o clique acima é um gesto: o Set e a Z só são procurados depois dele, e aqui a Absolute ZRO não existe.
    // O que se confere é a abertura: até o primeiro gesto, nada saiu da origem e nada deu erro.)
    assert.ok(pedidos.includes('/api/zro/eu'))
  } finally {
    await contexto.close()
    for (const [k, v] of Object.entries({ FOTO_LOCAL: antes.local, ZRO_CLIENT_ID: antes.id, ZRO_CLIENT_SECRET: antes.segredo, ZRO_ISSUER: antes.emissor })) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})

test('com a sessão do login único, sem gesto: nenhum pedido para fora, nenhuma falha, nenhuma resposta ≥ 400', { skip: semChromium }, async () => {
  const antes = { local: process.env.FOTO_LOCAL, id: process.env.ZRO_CLIENT_ID, segredo: process.env.ZRO_CLIENT_SECRET, emissor: process.env.ZRO_ISSUER }
  delete process.env.FOTO_LOCAL
  process.env.ZRO_CLIENT_ID = 'foto-web'
  process.env.ZRO_CLIENT_SECRET = 'segredo-de-teste-que-so-existe-aqui'
  process.env.ZRO_ISSUER = 'http://127.0.0.1:9'
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    const z = await import('../api/_zro.js')
    const sessao = z.selar(z.COOKIE_CONTA, { sub: 'zro-1', nome: 'Lia Fotógrafa', email: 'lia@exemplo.com', apps: ['foto'], lido: Math.floor(Date.now() / 1000) }, 3600)
    await contexto.addCookies([{ name: 'foto_conta', value: sessao, url: app.base }])
    const pagina = await contexto.newPage()
    const olho = vigiar(pagina, app.base)
    await pagina.goto(`${app.base}/`)
    await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
    await pagina.waitForSelector('.conta .avatar')
    // trocar o tema pelo módulo (como test/fechado.test.js) e recarregar: nasce escuro, sem piscar
    await pagina.evaluate(async () => (await import('/app/principal.js')).tema.alternar())
    await pagina.reload()
    assert.equal(await pagina.evaluate(() => document.documentElement.getAttribute('data-tema')), 'escuro')
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(14, 14, 16)')
    await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
    await pagina.waitForSelector('.conta .avatar')
    await pagina.waitForTimeout(400)
    limpo(olho)
  } finally {
    await contexto.close()
    for (const [k, v] of Object.entries({ FOTO_LOCAL: antes.local, ZRO_CLIENT_ID: antes.id, ZRO_CLIENT_SECRET: antes.segredo, ZRO_ISSUER: antes.emissor })) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})

test('"Escolher fotos" com 300 arquivos: miniaturas, RAW + JPEG como uma foto só, e poucos nós no DOM', { skip: semChromium }, async () => {
  const { contexto, pagina, olho } = await abrir()
  try {
    const inicio = Date.now()
    await carregar(pagina)
    const levou = Date.now() - inicio
    // 301 arquivos, 300 fotos: o JPEG ao lado do RAW é o par, não outra foto
    assert.equal(fotos.arquivos.length, QUANTAS + 1)
    assert.equal(await contagem(pagina, 'todas'), QUANTAS)
    assert.equal(await naLoja(pagina, (l) => l.catalogo.tamanho), QUANTAS)
    assert.ok(levou < ESPERA, `a grade levou ${levou} ms`)
    // a casca com trabalho: o nome no topo, o dock com as quatro etapas e Decupar na frente
    assert.match(await pagina.locator('.trabalho-nome').innerText(), /^Fotos de 13 de novembro$/)
    assert.deepEqual(await pagina.locator('.dock-aba').allInnerTexts(), ['Decupar', 'Revelar', 'Estilos', 'Entregar'])
    assert.equal(await pagina.locator('.dock-aba[aria-current="page"]').innerText(), 'Decupar')
    assert.match(await pagina.title(), new RegExp(`^Fotos de 13 de novembro · ${NOME}$`))
    // a grade é uma lista de opções multisselecionável, com uma só parada de Tab
    assert.equal(await pagina.locator('.grade').getAttribute('role'), 'listbox')
    assert.equal(await pagina.locator('.grade').getAttribute('aria-multiselectable'), 'true')
    assert.equal(await pagina.locator('.foto[role="option"][tabindex="0"]').count(), 1)
    // virtualizada: 300 fotos, poucas dezenas no DOM
    const noDom = await pagina.locator('.foto').count()
    assert.ok(noDom > 10 && noDom <= 90, `${noDom} cartões no DOM`)
    // a área em volta das fotos é o palco: neutra e escura no tema claro também, e o topo escurece junto
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.querySelector('.decupar')).backgroundColor), 'rgb(12, 12, 12)')
    assert.equal(await pagina.evaluate(() => document.querySelector('.topo').classList.contains('sobre-palco')), true)
    // a terceira foto está de pé (orientação 6 no EXIF): a miniatura vem girada
    await pagina.waitForFunction(() => document.querySelectorAll('.foto')[2]?.querySelector('img')?.naturalWidth > 0)
    const terceira = await pagina.evaluate(() => {
      const img = document.querySelectorAll('.foto')[2].querySelector('img')
      return { l: img.naturalWidth, a: img.naturalHeight, forma: img.closest('.foto-moldura').dataset.forma }
    })
    assert.ok(terceira.a > terceira.l, 'a foto de pé veio deitada')
    assert.equal(terceira.forma, 'de-pe')
    assert.equal(Math.max(terceira.l, terceira.a), 400)
    await captura(pagina, 'grade-1440-claro')

    // rolar até o fim: os nós continuam poucos, e a última foto é o RAW, com a miniatura tirada da JPEG embutida
    for (let i = 0; i < 12; i++) {
      await pagina.evaluate(() => document.querySelector('.grade').scrollBy(0, 1400))
      await pagina.waitForTimeout(40)
      const n = await pagina.locator('.foto').count()
      assert.ok(n <= 90, `${n} cartões no DOM ao rolar`)
    }
    await pagina.evaluate(() => (document.querySelector('.grade').scrollTop = 1e7))
    const ultima = pagina.locator('.foto').last()
    await pagina.waitForFunction((nome) => [...document.querySelectorAll('.foto')].at(-1)?.getAttribute('aria-label')?.startsWith(nome), fotos.raw)
    assert.match(await ultima.getAttribute('aria-label'), /RAW e JPEG/)
    assert.equal(await ultima.locator('.selo-par').innerText(), 'RAW+J')
    await pagina.waitForFunction(() => [...document.querySelectorAll('.foto')].at(-1)?.querySelector('img')?.naturalWidth > 0, null, { timeout: ESPERA })
    const raw = await naLoja(pagina, (l, nome) => {
      const f = l.catalogo.fotos().find((x) => x.nome === nome)
      return { tipo: f.tipo, formato: f.formato, par: f.par, exif: f.exif, proporcao: f.proporcao, semPrevia: !!f.semPrevia, original: l.temOriginal(f.id) }
    }, fotos.raw)
    assert.equal(raw.tipo, 'raw')
    assert.equal(raw.formato, 'dng')
    assert.equal(raw.par.nome, fotos.raw.replace('.DNG', '.JPG'))
    assert.equal(raw.exif.iso, 200)
    assert.match(raw.exif.data, /^2026-11-13T10:/)
    assert.ok(Math.abs(raw.proporcao - 1.5) < 0.01)
    assert.equal(raw.semPrevia, false)
    assert.equal(raw.original, true)
    // todas as miniaturas ficam prontas por trás, e guardadas neste aparelho (mini e prévia de 1024)
    await naLoja(pagina, (l) => l.ocioso().then(() => true))
    const guardadas = await pagina.evaluate(async () => {
      const { guardar } = await import('/app/abrir/guardar.js')
      const { loja } = await import('/app/estado.js')
      const ids = loja.catalogo.ids()
      const previa = await guardar.miniatura(ids[0], 'previa')
      const bitmap = await createImageBitmap(previa)
      return { com: (await guardar.comMiniatura(ids)).size, lado: Math.max(bitmap.width, bitmap.height), tipo: previa.type }
    })
    assert.deepEqual(guardadas, { com: QUANTAS, lado: 720, tipo: 'image/jpeg' })
    // o pool: núcleos − 1 workers (no máximo 8), e a fila vazia no fim
    const pool = await naLoja(pagina, (l) => ({ tamanho: l.miniaturas.pool.tamanho, workers: l.miniaturas.pool.workers, pendentes: l.miniaturas.pool.pendentes, nucleos: navigator.hardwareConcurrency }))
    assert.equal(pool.tamanho, Math.max(1, Math.min(8, pool.nucleos - 1)))
    assert.ok(pool.workers >= 1 && pool.workers <= pool.tamanho)
    assert.equal(pool.pendentes, 0)
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

test('teclado: setas pelas colunas, P, X, 1–5, cor, Shift, Cmd/Ctrl + A, Esc, desfazer; os filtros contam', { skip: semChromium }, async () => {
  const { contexto, pagina, olho } = await abrir()
  try {
    await carregar(pagina)
    const ids = await naLoja(pagina, (l) => l.catalogo.itens().map((i) => i.foto.id))
    const cartao = (i) => pagina.locator(`.foto[data-id="${ids[i]}"]`)
    const emFoco = () => pagina.evaluate(() => document.activeElement?.dataset.id ?? null)
    const colunas = await pagina.evaluate(() => {
      const topo = document.querySelector('.foto').getBoundingClientRect().top
      return [...document.querySelectorAll('.foto')].filter((f) => Math.abs(f.getBoundingClientRect().top - topo) < 2).length
    })
    assert.ok(colunas >= 4, `${colunas} colunas`)

    await cartao(0).click()
    assert.equal(await cartao(0).getAttribute('aria-selected'), 'true')
    await pagina.keyboard.press('ArrowRight')
    assert.equal(await emFoco(), ids[1])
    assert.equal(await cartao(0).getAttribute('aria-selected'), 'false')
    await pagina.keyboard.press('ArrowDown')
    assert.equal(await emFoco(), ids[1 + colunas])
    await pagina.keyboard.press('ArrowUp')
    await pagina.keyboard.press('ArrowLeft')
    assert.equal(await emFoco(), ids[0])

    // P escolhe, X rejeita, U tira; os números são estrelas; 6–9 são cores
    await pagina.keyboard.press('p')
    assert.equal(await cartao(0).getAttribute('data-marca'), 'escolhida')
    assert.equal(await cartao(0).locator('.marca').getAttribute('aria-label'), 'Escolhida')
    await pagina.keyboard.press('ArrowRight')
    await pagina.keyboard.press('x')
    assert.equal(await cartao(1).getAttribute('data-marca'), 'rejeitada')
    assert.equal(await contagem(pagina, 'escolhida'), 1)
    assert.equal(await contagem(pagina, 'rejeitada'), 1)
    assert.equal(await contagem(pagina, 'sem'), QUANTAS - 2)
    for (const n of [1, 2, 3, 4, 5]) {
      await pagina.keyboard.press('ArrowRight')
      await pagina.keyboard.press(String(n))
      assert.equal(await cartao(1 + n).locator('.estrelas').getAttribute('aria-label'), n === 1 ? '1 estrela' : `${n} estrelas`)
    }
    await pagina.keyboard.press('8')
    assert.equal(await cartao(6).locator('.foto-pe .ponto').getAttribute('data-cor'), 'verde')
    assert.match(await cartao(6).getAttribute('aria-label'), /5 estrelas, verde$/)
    // as abas não usam números: 1–5 não trocaram de etapa
    assert.equal(await pagina.locator('.dock-aba[aria-current="page"]').innerText(), 'Decupar')

    // desfazer volta um passo de cada vez (e diz o que voltou); refazer traz de novo
    await pagina.keyboard.press('Control+z')
    assert.equal(await cartao(6).locator('.foto-pe .ponto').count(), 0)
    assert.match(await pagina.locator('.aviso').innerText(), /^Desfeito/)
    await pagina.keyboard.press('Control+z')
    assert.equal(await cartao(6).locator('.estrelas').count(), 0)
    await pagina.keyboard.press('Control+Shift+z')
    assert.equal(await cartao(6).locator('.estrelas').getAttribute('aria-label'), '5 estrelas')
    await pagina.keyboard.press('u')
    await pagina.keyboard.press('0')
    assert.equal(await cartao(6).locator('.estrelas').count(), 0)

    // Shift + seta estende desde a âncora; a barra de seleção em vidro conta; marcar vale para todas, com desfazer
    await pagina.keyboard.press('Shift+ArrowRight')
    await pagina.keyboard.press('Shift+ArrowRight')
    assert.equal(await pagina.locator('.foto[aria-selected="true"]').count(), 3)
    assert.equal(await pagina.locator('.selecao .numero').innerText(), '3')
    await pagina.keyboard.press('p')
    assert.equal(await contagem(pagina, 'escolhida'), 4)
    assert.match(await pagina.locator('.aviso').innerText(), /3 fotos escolhidas/)
    await pagina.locator('.aviso button').click()
    assert.equal(await contagem(pagina, 'escolhida'), 1)
    // Shift + clique: da âncora até a clicada; Ctrl + clique: entra e sai
    await cartao(2).click()
    await cartao(5).click({ modifiers: ['Shift'] })
    assert.equal(await pagina.locator('.selecao .numero').innerText(), '4')
    await cartao(3).click({ modifiers: ['Control'] })
    assert.equal(await pagina.locator('.selecao .numero').innerText(), '3')
    // tudo e nada
    await pagina.keyboard.press('Control+a')
    assert.equal(await pagina.locator('.selecao .numero').innerText(), '300')
    await pagina.keyboard.press('Escape')
    assert.equal(await pagina.locator('.selecao').count(), 0)
    assert.equal(await naLoja(pagina, (l) => l.catalogo.selecao().size), 0)

    // a barra de seleção também marca (para quem não tem teclado)
    await cartao(8).click()
    await pagina.locator('.selecao [data-marcar="rejeitada"]').click()
    assert.equal(await cartao(8).getAttribute('data-marca'), 'rejeitada')
    await pagina.locator('.selecao button[aria-label="4 estrelas"]').click()
    assert.equal(await cartao(8).locator('.estrelas').getAttribute('aria-label'), '4 estrelas')
    await captura(pagina, 'marcas-1440-claro')

    // filtros em pílulas, com contagem; tocar na ativa volta a todas
    await pagina.locator('.pilula[data-valor="rejeitada"]').click()
    assert.equal(await pagina.locator('.foto').count(), 2)
    assert.equal(await pagina.locator('.pilula[data-valor="rejeitada"]').getAttribute('aria-pressed'), 'true')
    // com o filtro ligado, tirar a marca faz a foto sair e a seguinte tomar o foco
    await pagina.locator('.foto').first().click()
    await pagina.keyboard.press('u')
    assert.equal(await pagina.locator('.foto').count(), 1)
    assert.equal(await pagina.locator('.foto[data-foco]').count(), 1)
    await pagina.locator('.pilula[data-valor="rejeitada"]').click()
    assert.equal(await pagina.locator('.pilula[data-valor="todas"]').getAttribute('aria-pressed'), 'true')
    await pagina.waitForFunction(() => document.querySelectorAll('.foto').length > 10)
    // filtro sem resultado: o vazio com a saída
    await pagina.locator('.pilula[data-valor="escolhida"]').click()
    await pagina.locator('.foto').first().click()
    await pagina.keyboard.press('u')
    await pagina.waitForSelector('.grade-vazia .vazio')
    assert.match(await pagina.locator('.grade-vazia h2').innerText(), /Nada\s+com esse filtro\./)
    await pagina.locator('.grade-vazia .vidro').click()
    await pagina.waitForFunction(() => document.querySelectorAll('.foto').length > 10)

    // o tamanho da miniatura muda as colunas (setas no controle; a seta não vaza para a grade)
    const tamanho = pagina.locator('.grade-tamanho input[type="range"]')
    await tamanho.focus()
    const focoAntes = await naLoja(pagina, (l) => l.catalogo.foco())
    for (let i = 0; i < 4; i++) await pagina.keyboard.press('Shift+ArrowRight')
    assert.equal(await naLoja(pagina, (l) => l.catalogo.foco()), focoAntes)
    const colunasDepois = await pagina.evaluate(() => {
      const topo = document.querySelector('.foto').getBoundingClientRect().top
      return [...document.querySelectorAll('.foto')].filter((f) => Math.abs(f.getBoundingClientRect().top - topo) < 2).length
    })
    assert.ok(colunasDepois < colunas, `${colunasDepois} colunas depois de aumentar (eram ${colunas})`)
    // duplo clique no controle volta ao neutro
    await tamanho.dblclick()
    assert.equal(await tamanho.inputValue(), '184')

    // as etapas: D vai para Revelar (título e vazio honestos), G volta para a grade, que está como ficou
    await pagina.locator('.foto').first().click()
    await pagina.keyboard.press('d')
    await pagina.waitForSelector('.painel-aba[data-tela="revelar"]:not([hidden]) h2')
    assert.equal(await pagina.locator('.painel-aba[data-tela="revelar"] h2').innerText(), 'Revelar')
    assert.equal(await pagina.evaluate(() => location.hash), '#/revelar')
    assert.equal(await pagina.evaluate(() => document.querySelector('.topo').classList.contains('sobre-palco')), false)
    assert.doesNotMatch(await pagina.locator('.painel-aba[data-tela="revelar"]').innerText(), /em breve|em desenvolvimento/i)
    await pagina.waitForFunction(() => !document.documentElement.dataset.sentido)
    await captura(pagina, 'revelar-1440-claro')
    await pagina.locator('.dock-aba[data-aba="entregar"]').click()
    await pagina.waitForSelector('.painel-aba[data-tela="entregar"]:not([hidden]) h2')
    await pagina.keyboard.press('g')
    await pagina.waitForSelector('.painel-aba[data-tela="decupar"]:not([hidden])')
    assert.equal(await pagina.locator('.dock-aba[aria-current="page"]').innerText(), 'Decupar')
    assert.ok((await pagina.locator('.foto').count()) > 10)
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

test('lupa: abre, conta "N de M", navega, dá zoom no ponto, arrasta, compara duas, marca e volta', { skip: semChromium }, async () => {
  const { contexto, pagina, olho } = await abrir()
  try {
    await carregar(pagina)
    const ids = await naLoja(pagina, (l) => l.catalogo.itens().map((i) => i.foto.id))
    const escala = () => pagina.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('.quadro[data-principal] .quadro-moldura')).transform).a)
    const posicao = () =>
      pagina.evaluate(() => {
        const m = new DOMMatrix(getComputedStyle(document.querySelector('.quadro[data-principal] .quadro-moldura')).transform)
        return [m.e, m.f]
      })
    const contador = () => pagina.locator('.lupa-contador').innerText()

    // duplo clique abre a foto grande no palco
    await pagina.locator(`.foto[data-id="${ids[0]}"]`).dblclick()
    await pagina.waitForSelector('.lupa .quadro-moldura img')
    assert.equal(await contador(), '1 de 300')
    assert.equal(await pagina.locator('.lupa-contador').getAttribute('aria-live'), 'polite')
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.querySelector('.lupa')).backgroundColor), 'rgb(12, 12, 12)')
    assert.match(await pagina.locator('.lupa-ficha strong').innerText(), /^IMG_0001\.JPG$/)
    // a imagem melhora sozinha: miniatura → prévia → o arquivo (aqui, 720 px)
    await pagina.waitForFunction(() => document.querySelector('.quadro-moldura')?.dataset.nivel === 'grande' && document.querySelector('.quadro-moldura img').naturalWidth === 720, null, { timeout: ESPERA })
    await pagina.waitForTimeout(500)
    await captura(pagina, 'lupa-1440-claro')

    // setas navegam (e ↓ ↑ também); o contador acompanha
    await pagina.keyboard.press('ArrowRight')
    assert.equal(await contador(), '2 de 300')
    await pagina.keyboard.press('ArrowDown')
    assert.equal(await contador(), '3 de 300')
    await pagina.keyboard.press('ArrowLeft')
    await pagina.keyboard.press('ArrowLeft')
    await pagina.keyboard.press('ArrowLeft')
    assert.equal(await contador(), '1 de 300')
    await pagina.locator('.lupa-seta--depois').click()
    assert.equal(await contador(), '2 de 300')

    // Z liga o zoom; arrastar move; Z desliga
    assert.ok(Math.abs((await escala()) - 1) < 0.001)
    await pagina.keyboard.press('z')
    await pagina.waitForFunction(() => document.querySelector('.quadro[data-principal]')?.hasAttribute('data-zoom'))
    await pagina.waitForTimeout(600)
    const ampliada = await escala()
    assert.ok(ampliada >= 1.9, `escala ${ampliada}`)
    assert.equal(await pagina.locator('.lupa-barra button[aria-label="Zoom de 100%"]').getAttribute('aria-pressed'), 'true')
    const caixa = await pagina.locator('.quadro[data-principal]').boundingBox()
    const meio = [caixa.x + caixa.width / 2, caixa.y + caixa.height / 2]
    const antes = await posicao()
    await pagina.mouse.move(meio[0], meio[1])
    await pagina.mouse.down()
    await pagina.mouse.move(meio[0] - 120, meio[1] - 60, { steps: 6 })
    await pagina.mouse.up()
    const depois = await posicao()
    assert.ok(depois[0] < antes[0] - 60 && depois[1] < antes[1] - 20, `arrastar não moveu: ${antes} → ${depois}`)
    // o zoom continua ligado ao trocar de foto (conferir o foco de uma sequência)
    await pagina.keyboard.press('ArrowRight')
    await pagina.waitForTimeout(300)
    assert.ok((await escala()) >= 1.9)
    await pagina.keyboard.press('Space')
    await pagina.waitForTimeout(600)
    assert.ok(Math.abs((await escala()) - 1) < 0.001)
    // (a terceira foto é a de pé; a quarta é deitada e, ampliada, passa da largura do palco)
    await pagina.keyboard.press('ArrowRight')
    assert.equal(await contador(), '4 de 300')

    // clicar dá zoom no ponto clicado: o canto de cima à esquerda vai para o lado dele; Esc tira o zoom antes de fechar
    const foto = await pagina.locator('.quadro[data-principal] .quadro-moldura').boundingBox()
    await pagina.mouse.click(foto.x + foto.width * 0.2, foto.y + foto.height * 0.2)
    await pagina.waitForTimeout(600)
    assert.ok((await escala()) >= 1.9)
    const [tx, ty] = await posicao()
    assert.ok(tx > 20 && ty > 20, `o zoom não foi para o ponto clicado: ${tx}, ${ty}`)
    await pagina.keyboard.press('Escape')
    await pagina.waitForTimeout(500)
    assert.ok(Math.abs((await escala()) - 1) < 0.001)
    assert.equal(await pagina.locator('.lupa').count(), 1)

    // marcar na lupa (teclado e régua)
    await pagina.keyboard.press('p')
    assert.equal(await pagina.locator('.lupa-barra [data-marcar="escolhida"]').getAttribute('aria-pressed'), 'true')
    await pagina.keyboard.press('4')
    assert.equal(await pagina.locator('.lupa-barra button[aria-label="4 estrelas"]').getAttribute('aria-pressed'), 'true')
    await pagina.locator('.lupa-barra [data-marcar="rejeitada"]').click()
    assert.equal(await naLoja(pagina, (l) => l.catalogo.foto(l.catalogo.foco()).marca), 'rejeitada')

    // N compara duas lado a lado, com o zoom sincronizado
    await pagina.keyboard.press('n')
    await pagina.waitForFunction(() => document.querySelectorAll('.lupa .quadro').length === 2)
    assert.deepEqual(await pagina.locator('.quadro-etiqueta').allInnerTexts().then((l) => l.map((t) => t.toUpperCase())), ['FIXA', 'CANDIDATA'])
    assert.equal(await contador(), '5 de 300')
    await pagina.keyboard.press('z')
    await pagina.waitForTimeout(600)
    const escalas = await pagina.evaluate(() => [...document.querySelectorAll('.quadro .quadro-moldura')].map((m) => new DOMMatrix(getComputedStyle(m).transform).a))
    assert.equal(escalas.length, 2)
    assert.ok(escalas.every((e) => e >= 1.9) && Math.abs(escalas[0] - escalas[1]) < 0.01, `zoom dessincronizado: ${escalas}`)
    await captura(pagina, 'comparar-1440-claro')
    await pagina.keyboard.press('z')
    await pagina.keyboard.press('n')
    await pagina.waitForFunction(() => document.querySelectorAll('.lupa .quadro').length === 1)

    // G volta para a grade: a foto que estava aberta fica em foco e à vista
    await pagina.keyboard.press('g')
    await pagina.waitForSelector('.lupa', { state: 'detached' })
    const foco = await naLoja(pagina, (l) => l.catalogo.foco())
    assert.equal(foco, ids[4])
    await pagina.waitForFunction((id) => document.activeElement?.dataset.id === id, foco)
    // Enter abre de novo; Esc fecha
    await pagina.keyboard.press('Enter')
    await pagina.waitForSelector('.lupa')
    assert.equal(await contador(), '5 de 300')
    await pagina.keyboard.press('Escape')
    await pagina.waitForSelector('.lupa', { state: 'detached' })
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

test('tema: troca na hora, persiste ao recarregar e nasce certo (sem piscar)', { skip: semChromium }, async () => {
  const { contexto, pagina, olho } = await abrir()
  try {
    const botao = pagina.locator('[data-tema-botao]')
    assert.equal(await botao.getAttribute('aria-pressed'), 'false')
    assert.equal(await botao.getAttribute('aria-label'), 'Usar o tema escuro')
    await botao.click()
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'escuro')
    assert.equal(await botao.getAttribute('aria-pressed'), 'true')
    assert.equal(await pagina.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#0e0e10')
    await pagina.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(14, 14, 16)')
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.querySelector('#app h1')).color), 'rgb(245, 245, 247)')
    assert.ok((await contexto.cookies()).some((c) => c.name === 'foto_tema' && c.value === 'escuro'))
    // recarregar: o servidor já escreve o tema no HTML
    const resposta = await pagina.reload()
    assert.match(await resposta.text(), /<html lang="pt-BR" data-tema="escuro">/)
    await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
    assert.equal(await pagina.locator('[data-tema-botao]').getAttribute('aria-pressed'), 'true')
    await pagina.waitForTimeout(1800)
    await captura(pagina, 'inicio-1440-escuro')
    // com fotos, no escuro
    await carregar(pagina)
    await pagina.locator('.foto').nth(1).click()
    await pagina.keyboard.press('p')
    await pagina.keyboard.press('ArrowRight')
    await pagina.keyboard.press('3')
    await pagina.keyboard.press('Shift+ArrowRight')
    await pagina.waitForTimeout(700)
    await captura(pagina, 'grade-1440-escuro')
    await pagina.locator('.trabalho button').click()
    await pagina.waitForSelector('.trabalho .menu-lista')
    await pagina.waitForFunction(() => document.querySelector('.menu-lista').getAnimations().every((a) => a.playState !== 'running'))
    await captura(pagina, 'menu-1440-escuro')
    await pagina.keyboard.press('Escape')
    await pagina.keyboard.press('Escape')
    await pagina.locator('.foto').nth(4).dblclick()
    await pagina.waitForSelector('.lupa .quadro-moldura img')
    await pagina.waitForTimeout(900)
    await captura(pagina, 'lupa-1440-escuro')
    await pagina.keyboard.press('g')
    // e de volta ao claro
    await pagina.locator('[data-tema-botao]').click()
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'claro')
    assert.ok((await contexto.cookies()).some((c) => c.name === 'foto_tema' && c.value === 'claro'))
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

test('reduzir movimento: nada anima, nada fica escondido esperando, e tudo continua funcionando', { skip: semChromium }, async () => {
  const { contexto, pagina, olho } = await abrir({ reducedMotion: 'reduce' })
  try {
    // o símbolo já está inteiro e o título à vista, sem esperar
    const parado = await pagina.evaluate(() => {
      const anel = getComputedStyle(document.querySelector('.simbolo-vivo .simbolo-anel'))
      const raio = getComputedStyle(document.querySelector('.simbolo-vivo .simbolo-raio'))
      const h1 = getComputedStyle(document.querySelector('#app h1'))
      return { tracejado: anel.strokeDasharray, corte: raio.clipPath, opacidade: h1.opacity, rodando: document.getAnimations().filter((a) => a.playState === 'running').length }
    })
    assert.deepEqual(parado, { tracejado: 'none', corte: 'none', opacidade: '1', rodando: 0 })
    await carregar(pagina)
    await pagina.waitForTimeout(300)
    const naGrade = await pagina.evaluate(() => ({
      opacidades: [...document.querySelectorAll('.foto')].map((f) => getComputedStyle(f).opacity).filter((o) => o !== '1').length,
      longas: document.getAnimations().filter((a) => a.playState === 'running' && (a.effect?.getComputedTiming().duration ?? 0) > 1).length,
    }))
    assert.deepEqual(naGrade, { opacidades: 0, longas: 0 })
    // abrir a foto grande e trocar de etapa funcionam sem View Transition
    await pagina.locator('.foto').first().dblclick()
    await pagina.waitForSelector('.lupa .quadro-moldura img')
    await pagina.keyboard.press('z')
    await pagina.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('.quadro-moldura')).transform).a >= 1.9)
    await pagina.keyboard.press('g')
    await pagina.waitForSelector('.lupa', { state: 'detached' })
    await pagina.locator('.dock-aba[data-aba="estilos"]').click()
    await pagina.waitForSelector('.painel-aba[data-tela="estilos"]:not([hidden]) h2')
    assert.equal(await pagina.evaluate(() => document.documentElement.dataset.sentido), undefined)
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

/** Os alvos de toque menores que 44 × 44 (contando a área estendida pelo ::before invisível). */
const alvosPequenos = (pagina) =>
  pagina.evaluate(() => {
    const ruins = []
    for (const el of document.querySelectorAll('button, a[href], [role="option"], [role="radio"], input:not([type="file"]), select, summary')) {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (!r.width || !r.height || s.visibility === 'hidden' || s.pointerEvents === 'none' || el.closest('[hidden], .so-leitor, [inert]')) continue
      if (r.bottom < 0 || r.top > innerHeight) continue
      let l = r.width
      let a = r.height
      const antes = getComputedStyle(el, '::before')
      if (antes.content !== 'none' && antes.position === 'absolute') {
        const [cima, direita, baixo, esquerda] = [antes.top, antes.right, antes.bottom, antes.left].map(parseFloat)
        if ([cima, direita, baixo, esquerda].every(Number.isFinite)) {
          l = Math.max(l, r.width - esquerda - direita)
          a = Math.max(a, r.height - cima - baixo)
        }
      }
      if (l < 43.5 || a < 43.5) ruins.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}" ${Math.round(l)}×${Math.round(a)}`)
    }
    return ruins
  })
const semRolarDeLado = async (pagina, onde) => {
  const m = await pagina.evaluate(() => ({ pagina: document.scrollingElement.scrollWidth, janela: innerWidth, largos: [...document.querySelectorAll('#app *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5 && !e.closest('.pilulas--rola') && getComputedStyle(e).position !== 'fixed' && e.getBoundingClientRect().width > 0).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`).slice(0, 5) }))
  assert.equal(m.pagina, m.janela, `${onde}: a página rola de lado`)
  assert.deepEqual(m.largos, [], `${onde}: elementos passando da borda`)
}

test('celular (390 px): nada rola de lado, os alvos têm 44 px, o dock é a barra de baixo', { skip: semChromium }, async () => {
  for (const tema of ['claro', 'escuro']) {
    const { contexto, pagina, olho } = await abrir(CELULAR, { tema })
    try {
      assert.equal(await pagina.evaluate(() => matchMedia('(pointer: coarse)').matches), true)
      await pagina.waitForTimeout(1800)
      await semRolarDeLado(pagina, 'início')
      assert.deepEqual(await alvosPequenos(pagina), [], 'início')
      await captura(pagina, `inicio-390-${tema}`)

      await carregar(pagina)
      await pagina.waitForTimeout(600)
      await semRolarDeLado(pagina, 'grade')
      // o dock virou a barra de baixo, com ícone e nome, encostado no fim da tela
      const dock = await pagina.locator('.dock').boundingBox()
      assert.ok(dock.y > 700 && Math.abs(dock.y + dock.height - 844) < 1 && dock.width === 390, JSON.stringify(dock))
      assert.equal(await pagina.locator('.dock-aba svg').first().isVisible(), true)
      // três colunas ou mais, e poucos nós
      const colunas = await pagina.evaluate(() => {
        const topo = document.querySelector('.foto').getBoundingClientRect().top
        return [...document.querySelectorAll('.foto')].filter((f) => Math.abs(f.getBoundingClientRect().top - topo) < 2).length
      })
      assert.ok(colunas >= 3, `${colunas} colunas`)
      assert.ok((await pagina.locator('.foto').count()) <= 60)
      // tocar seleciona e sobe a barra de marcar; tocar de novo abre a foto grande
      await pagina.locator('.foto').nth(1).tap()
      await pagina.waitForSelector('.selecao')
      await pagina.locator('.selecao [data-marcar="escolhida"]').tap()
      assert.equal(await pagina.locator('.foto').nth(1).getAttribute('data-marca'), 'escolhida')
      await pagina.waitForTimeout(500)
      assert.deepEqual(await alvosPequenos(pagina), [], 'grade')
      await semRolarDeLado(pagina, 'grade com seleção')
      const barra = await pagina.locator('.selecao').boundingBox()
      assert.ok(barra.x >= 0 && barra.x + barra.width <= 390 && barra.y + barra.height <= dock.y, 'a barra de seleção cabe acima do dock')
      await captura(pagina, `grade-390-${tema}`)

      await pagina.locator('.foto').nth(1).tap()
      await pagina.waitForSelector('.lupa .quadro-moldura img')
      await pagina.waitForTimeout(700)
      await semRolarDeLado(pagina, 'lupa')
      assert.deepEqual(await alvosPequenos(pagina), [], 'lupa')
      const regua = await pagina.locator('.lupa-barra').boundingBox()
      assert.ok(regua.x >= 0 && regua.x + regua.width <= 390 && regua.y + regua.height <= dock.y, 'a barra da lupa cabe acima do dock')
      await captura(pagina, `lupa-390-${tema}`)
      // deslizar troca de foto
      const antes = await naLoja(pagina, (l) => l.catalogo.foco())
      const q = await pagina.locator('.quadro[data-principal]').boundingBox()
      await pagina.mouse.move(q.x + q.width * 0.8, q.y + q.height / 2)
      await pagina.mouse.down()
      await pagina.mouse.move(q.x + q.width * 0.2, q.y + q.height / 2, { steps: 5 })
      await pagina.mouse.up()
      assert.notEqual(await naLoja(pagina, (l) => l.catalogo.foco()), antes)
      await pagina.locator('.lupa-barra button[aria-label="Voltar à grade"]').tap()
      await pagina.waitForSelector('.lupa', { state: 'detached' })

      // as outras etapas e o menu do trabalho
      await pagina.locator('.dock-aba[data-aba="estilos"]').tap()
      await pagina.waitForSelector('.painel-aba[data-tela="estilos"]:not([hidden]) h2')
      await semRolarDeLado(pagina, 'estilos')
      await pagina.locator('.trabalho button').tap()
      await pagina.waitForSelector('.trabalho .menu-lista')
      await pagina.waitForFunction(() => document.querySelector('.menu-lista').getAnimations().every((a) => a.playState !== 'running'))
      assert.deepEqual(await alvosPequenos(pagina), [], 'menu')
      await semRolarDeLado(pagina, 'menu')
      limpo(olho)
    } finally {
      await contexto.close()
    }
  }
})

test('o trabalho reabre depois de recarregar: marcas, miniaturas guardadas, a foto onde a pessoa parou', { skip: semChromium }, async () => {
  const { contexto, pagina, olho } = await abrir()
  try {
    await carregar(pagina)
    const ids = await naLoja(pagina, (l) => l.catalogo.itens().map((i) => i.foto.id))
    await pagina.locator(`.foto[data-id="${ids[0]}"]`).click()
    await pagina.keyboard.press('p')
    await pagina.keyboard.press('ArrowRight')
    await pagina.keyboard.press('x')
    await pagina.keyboard.press('ArrowRight')
    await pagina.keyboard.press('5')
    await pagina.keyboard.press('7')
    await naLoja(pagina, (l) => l.ocioso().then(() => true))
    await naLoja(pagina, (l) => l.salvarAgora())

    await pagina.reload()
    await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
    // volta direto para o trabalho (sem passar pelo início), com o nome, as marcas e a foto em foco
    await pagina.waitForSelector('.foto img', { timeout: ESPERA })
    assert.equal(await pagina.locator('.inicio').count(), 0)
    assert.equal(await pagina.locator('.trabalho-nome').innerText(), 'Fotos de 13 de novembro')
    assert.equal(await contagem(pagina, 'todas'), QUANTAS)
    assert.equal(await contagem(pagina, 'escolhida'), 1)
    assert.equal(await contagem(pagina, 'rejeitada'), 1)
    assert.equal(await pagina.locator(`.foto[data-id="${ids[0]}"]`).getAttribute('data-marca'), 'escolhida')
    assert.equal(await pagina.locator(`.foto[data-id="${ids[1]}"]`).getAttribute('data-marca'), 'rejeitada')
    assert.match(await pagina.locator(`.foto[data-id="${ids[2]}"]`).getAttribute('aria-label'), /5 estrelas, amarelo$/)
    assert.equal(await pagina.locator('.foto[data-foco]').getAttribute('data-id'), ids[2])
    // as miniaturas vêm do que ficou guardado (os arquivos escolhidos não voltam sozinhos: a tela não finge)
    assert.equal(await naLoja(pagina, (l) => l.ligado()), false)
    assert.equal(await naLoja(pagina, (l, id) => l.temOriginal(id), ids[0]), false)
    await pagina.waitForFunction(() => [...document.querySelectorAll('.foto img')].filter((i) => i.naturalWidth > 0).length >= 20)
    // a lupa abre com a prévia guardada
    await pagina.locator(`.foto[data-id="${ids[2]}"]`).dblclick()
    await pagina.waitForFunction(() => {
      const img = document.querySelector('.quadro-moldura[data-nivel="previa"] img')
      return img && Math.max(img.naturalWidth, img.naturalHeight) === 720
    })
    await pagina.keyboard.press('g')
    await pagina.waitForSelector('.lupa', { state: 'detached' })
    // desfazer não atravessa a recarga (o histórico é da sessão)
    assert.equal(await naLoja(pagina, (l) => l.catalogo.podeDesfazer), false)

    // escolher as mesmas fotos de novo religa os originais no MESMO trabalho, com as marcas
    await pagina.locator('.trabalho button').click()
    await pagina.locator('.trabalho .menu-item', { hasText: 'Adicionar fotos' }).click()
    await pagina.setInputFiles('input[data-escolher]', fotos.arquivos)
    await pagina.waitForSelector('.aviso')
    assert.equal(await pagina.locator('.aviso').innerText(), 'Originais ligados de novo')
    await naLoja(pagina, (l) => l.ocioso().then(() => true))
    assert.equal(await naLoja(pagina, (l) => l.ligado()), true)
    assert.equal(await contagem(pagina, 'todas'), QUANTAS)
    assert.equal(await contagem(pagina, 'escolhida'), 1)

    // fechar: volta ao início, e o trabalho aparece nos recentes, com capa e contagem
    await pagina.locator('.trabalho button').click()
    await pagina.locator('.trabalho .menu-item', { hasText: 'Fechar' }).click()
    await pagina.waitForSelector('.inicio .recente')
    assert.equal(await pagina.locator('.recente').count(), 1)
    assert.equal(await pagina.locator('.recente-texto strong').innerText(), 'Fotos de 13 de novembro')
    assert.match(await pagina.locator('.recente-texto span').innerText(), /^300 fotos · hoje$/)
    await pagina.waitForFunction(() => document.querySelectorAll('.recente-capa img').length === 4)
    assert.equal(await pagina.locator('#app h1').innerText(), NOME)
    await pagina.waitForTimeout(1200)
    await captura(pagina, 'recentes-1440-claro')
    // recarregar agora fica no início (nada para retomar)
    await pagina.reload()
    await pagina.waitForSelector('.inicio .recente')
    // abrir pelo cartão
    await pagina.locator('.recente-abrir').click()
    await pagina.waitForSelector('.foto img', { timeout: ESPERA })
    assert.equal(await contagem(pagina, 'escolhida'), 1)
    // tirar da lista apaga o que estava guardado neste aparelho
    await pagina.locator('.trabalho button').click()
    await pagina.locator('.trabalho .menu-item', { hasText: 'Fechar' }).click()
    await pagina.waitForSelector('.inicio .recente')
    await pagina.locator('.recente .menu button').click()
    await pagina.locator('.recente .menu-item', { hasText: 'Tirar da lista' }).click()
    await pagina.waitForSelector('.recente', { state: 'detached' })
    const sobrou = await pagina.evaluate(async () => {
      const { guardar } = await import('/app/abrir/guardar.js')
      return { trabalhos: (await guardar.trabalhos()).length, miniaturas: (await guardar.comMiniatura(['x'])).size }
    })
    assert.deepEqual(sobrou, { trabalhos: 0, miniaturas: 0 })
    assert.equal(
      await pagina.evaluate(
        () =>
          new Promise((ok) => {
            const p = indexedDB.open('foto')
            p.onsuccess = () => {
              const t = p.result.transaction('miniaturas').objectStore('miniaturas').count()
              t.onsuccess = () => ok(t.result)
            }
          }),
      ),
      0,
    )
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

test('soltar arquivos em qualquer lugar da janela abre o trabalho', { skip: semChromium }, async () => {
  const { contexto, pagina, olho } = await abrir()
  try {
    // um DataTransfer de verdade, com três das fotos fabricadas
    const tres = fotos.arquivos.slice(0, 3).map((f) => ({ nome: f.name, tipo: f.mimeType, base64: f.buffer.toString('base64') }))
    const transferencia = await pagina.evaluateHandle((lista) => {
      const dt = new DataTransfer()
      for (const f of lista) dt.items.add(new File([Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))], f.nome, { type: f.tipo }))
      return dt
    }, tres)
    await pagina.dispatchEvent('body', 'dragenter', { dataTransfer: transferencia })
    await pagina.waitForSelector('.soltar')
    assert.match(await pagina.locator('.soltar h2').innerText(), /Solte\s+para abrir\./)
    await captura(pagina, 'soltar-1440-claro')
    await pagina.dispatchEvent('body', 'drop', { dataTransfer: transferencia })
    await pagina.waitForSelector('.soltar', { state: 'detached' })
    await pagina.waitForFunction(() => document.querySelector('.pilula[data-valor="todas"] .pilula-n')?.textContent.trim() === '3')
    await pagina.waitForFunction(() => document.querySelectorAll('.foto img').length === 3)
    // o que não é foto não entra, e diz
    const texto = await pagina.evaluateHandle(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['oi'], 'notas.txt', { type: 'text/plain' }))
      return dt
    })
    await pagina.dispatchEvent('body', 'drop', { dataTransfer: texto })
    await pagina.waitForSelector('.aviso')
    assert.equal(await pagina.locator('.aviso').innerText(), 'Nenhuma foto por aqui.')
    assert.equal(await contagem(pagina, 'todas'), 3)
    limpo(olho)
  } finally {
    await contexto.close()
  }
})
