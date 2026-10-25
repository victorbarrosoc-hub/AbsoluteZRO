// Tela no Chromium de verdade: escolher as duas imagens, ver a prévia, mexer na intensidade, baixar a LUT.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { lerCube } from '../src/cor/cube.js'
import { gravarPng } from '../src/imagem/png.js'
import { aplicarEmImagem, cena, lookConhecido } from './apoio.js'

// require (e não import) para achar o Playwright também pelo NODE_PATH do ambiente
const { chromium } = createRequire(import.meta.url)('playwright')

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
let servidor
let endereco
let navegador
let dir

before(async () => {
  servidor = createServer((req, res) => {
    const caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
    const arquivo = join(RAIZ, caminho === '/' ? 'index.html' : caminho)
    if (!arquivo.startsWith(RAIZ)) return res.writeHead(403).end()
    try {
      const corpo = readFileSync(arquivo)
      res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' }).end(corpo)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
  endereco = `http://127.0.0.1:${servidor.address().port}/`
  navegador = await chromium.launch()
  dir = mkdtempSync(join(tmpdir(), 'revela-tela-'))
  writeFileSync(join(dir, 'filme.png'), gravarPng(aplicarEmImagem(cena(21, 320, 180), lookConhecido)))
  writeFileSync(join(dir, 'meu-frame.png'), gravarPng(cena(22, 320, 180)))
  writeFileSync(join(dir, 'texto.txt'), 'não é imagem')
})

after(async () => {
  await navegador?.close()
  servidor?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

test('escolhe as duas imagens, compara, ajusta e baixa a LUT', async () => {
  const pagina = await navegador.newPage({ acceptDownloads: true })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco)
  await assert.doesNotReject(pagina.getByRole('heading', { name: 'Revela a cor que você quer.' }).waitFor())
  // marca: ícone do cabeçalho e favicon carregados
  await pagina.waitForFunction(() => document.querySelector('.marca img')?.complete)
  assert.ok(await pagina.evaluate(() => document.querySelector('.marca img').naturalWidth > 0), 'ícone da marca não carregou')
  const favicon = await pagina.evaluate(() => document.querySelector('link[rel=icon]').href)
  assert.equal((await pagina.request.get(favicon)).headers()['content-type'], 'image/svg+xml')

  await pagina.setInputFiles('#arquivo-referencia', join(dir, 'filme.png'))
  await pagina.getByText('Agora o seu frame.').waitFor()
  await pagina.setInputFiles('#arquivo-material', join(dir, 'meu-frame.png'))
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()

  // prévia: metade direita (depois) diferente da original
  const mudou = await pagina.evaluate(() => {
    const c = document.getElementById('previa')
    return (
      c.width > 0 &&
      c
        .getContext('2d')
        .getImageData(0, 0, c.width, c.height)
        .data.some((v) => v > 0)
    )
  })
  assert.ok(mudou, 'prévia vazia')
  const faixas = await pagina.locator('#faixas li').allTextContents()
  assert.equal(faixas.length, 8)
  assert.match(faixas[0], /^Saturação: /)
  assert.match(faixas[2], /^Sombras: /)

  // divisão em 0 mostra só o depois, em 100 só o antes: com intensidade 0 as duas são iguais; com 100, não
  const quadro = (pos) =>
    pagina.evaluate((v) => {
      const d = document.getElementById('divisao')
      d.value = String(v)
      d.dispatchEvent(new Event('input'))
      const c = document.getElementById('previa')
      return Array.from(c.getContext('2d').getImageData(4, 0, c.width - 8, c.height).data)
    }, pos)
  const diferenca = (x, y) => x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0) / x.length
  assert.ok(diferenca(await quadro(0), await quadro(100)) > 2, 'com intensidade 100 o depois devia mudar')
  await pagina.locator('#intensidade').fill('0')
  await pagina.getByText('0%', { exact: true }).waitFor()
  await pagina.waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))))
  assert.ok(diferenca(await quadro(0), await quadro(100)) < 0.6, 'com intensidade 0 o depois devia ser igual ao antes')
  await quadro(50)
  await pagina.locator('#intensidade').fill('80')

  for (const tamanho of ['33', '65']) {
    await pagina.selectOption('#tamanho', tamanho)
    const [baixado] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Baixar LUT (.cube)' }).click()])
    assert.equal(baixado.suggestedFilename(), `revela-filme-${tamanho}.cube`)
    const texto = readFileSync(await baixado.path(), 'utf8')
    assert.match(texto, /^TITLE "Revela - filme - 80%"/)
    assert.equal(lerCube(texto).tamanho, Number(tamanho))
  }

  // só a cor: a leitura diz que o contraste está desligado
  await pagina.locator('#usar-tom').uncheck()
  await pagina.getByText('Contraste desligado: a luz fica como está.').waitFor()
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('arquivo que não é imagem avisa sem quebrar', async () => {
  const pagina = await navegador.newPage()
  await pagina.goto(endereco)
  await pagina.setInputFiles('#arquivo-referencia', join(dir, 'texto.txt'))
  await pagina.getByText('Esse arquivo não é uma imagem. Use PNG, JPEG ou WebP.').waitFor()
  await pagina.close()
})

test('celular: sem rolagem horizontal e controles com nome', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 375, height: 800 } })
  await pagina.goto(endereco)
  await pagina.setInputFiles('#arquivo-referencia', join(dir, 'filme.png'))
  await pagina.setInputFiles('#arquivo-material', join(dir, 'meu-frame.png'))
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  const largura = await pagina.evaluate(() => document.documentElement.scrollWidth)
  assert.ok(largura <= 375, `rolagem horizontal: ${largura}px`)
  for (const nome of ['Comparar antes e depois', 'Intensidade', 'Tamanho da LUT', 'Contraste', 'Cor']) {
    assert.equal(await pagina.getByLabel(nome, { exact: true }).count(), 1, `controle sem nome: ${nome}`)
  }
  await pagina.close()
})
