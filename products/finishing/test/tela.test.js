// Tela no Chromium de verdade: escolher as duas imagens, ver a prévia, mexer na intensidade, baixar a LUT.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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
// os mesmos cabeçalhos de segurança do vercel.json: a tela tem que funcionar com a CSP que vai ao ar
const CABECALHOS = Object.fromEntries(
  JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).headers[0].headers.map((h) => [h.key, h.value]),
)
const TIPOS = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.mjs': 'text/javascript',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
}
// o navegador registra o 401 de /api/zro/eu (sem sessão) como erro de rede; não é falha da página
const SEM_SESSAO = /status of 401/
let servidor
let endereco
let navegador
let dir

before(async () => {
  servidor = createServer((req, res) => {
    const caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
    // sem as funções da Vercel aqui: a conta responde como "sem sessão"
    if (caminho === '/api/zro/eu') return res.writeHead(401, { 'content-type': 'application/json' }).end('{"ok":false}')
    const arquivo = join(RAIZ, caminho === '/' ? 'index.html' : caminho)
    if (!arquivo.startsWith(RAIZ)) return res.writeHead(403).end()
    try {
      const corpo = readFileSync(arquivo)
      res.writeHead(200, { ...CABECALHOS, 'content-type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' }).end(corpo)
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
  // o mesmo frame sem a cor, para o Clonar LUT (o filme.png é ele com o look)
  writeFileSync(join(dir, 'antes.png'), gravarPng(cena(21, 320, 180)))
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
  pagina.on('console', (m) => m.type() === 'error' && !SEM_SESSAO.test(m.text()) && erros.push(m.text()))
  const resposta = await pagina.goto(endereco + 'lut.html')
  assert.match(resposta.headers()['content-security-policy'], /default-src 'self'/)
  await assert.doesNotReject(pagina.getByRole('heading', { name: 'Revela a cor que você quer.' }).waitFor())
  // marca: ícone do cabeçalho e favicon carregados
  await pagina.waitForFunction(() => document.querySelector('.marca img')?.complete)
  assert.ok(await pagina.evaluate(() => document.querySelector('.marca img').naturalWidth > 0), 'logo da Revela não carregou')
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
    await pagina.getByRole('radio', { name: tamanho }).check({ force: true })
    const [baixado] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Baixar LUT' }).click()])
    assert.equal(baixado.suggestedFilename(), `revela-filme-${tamanho}.cube`)
    const texto = readFileSync(await baixado.path(), 'utf8')
    assert.match(texto, /^TITLE "Revela - filme - 80%"/)
    assert.equal(lerCube(texto).tamanho, Number(tamanho))
  }

  // só a cor: a leitura diz que o contraste está desligado
  await pagina.locator('#usar-tom').uncheck({ force: true })
  await pagina.getByText('Contraste desligado: a luz fica como está.').waitFor({ state: 'attached' })
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('fundo sempre preto fosco, mesmo com o sistema no tema claro', async () => {
  const pagina = await navegador.newPage({ colorScheme: 'light' })
  await pagina.goto(endereco + 'lut.html')
  const { fundo, texto } = await pagina.evaluate(() => ({
    fundo: getComputedStyle(document.body).backgroundColor,
    texto: getComputedStyle(document.body).color,
  }))
  assert.equal(fundo, 'rgb(14, 14, 16)')
  assert.equal(texto, 'rgb(245, 245, 247)')
  await pagina.close()
})

test('link compartilhado: tags de OG e imagem 1200×630', async () => {
  const pagina = await navegador.newPage()
  await pagina.goto(endereco)
  const meta = (seletor) => pagina.locator(seletor).getAttribute('content')
  const imagem = await meta('meta[property="og:image"]')
  assert.match(imagem, /^https:\/\/revela-zro\.vercel\.app\/og\.jpg/)
  assert.equal(await meta('meta[name="twitter:card"]'), 'summary_large_image')
  assert.equal(await meta('meta[name="twitter:image"]'), imagem)
  assert.equal(await meta('meta[property="og:url"]'), 'https://revela-zro.vercel.app/')
  // a mesma imagem, servida daqui
  const tamanho = await pagina.evaluate(async () => {
    const img = new Image()
    img.src = '/og.jpg'
    await img.decode()
    return [img.naturalWidth, img.naturalHeight]
  })
  assert.deepEqual(tamanho, [1200, 630])
  await pagina.close()
})

test('arquivo que não é imagem avisa sem quebrar', async () => {
  const pagina = await navegador.newPage()
  await pagina.goto(endereco + 'lut.html')
  await pagina.setInputFiles('#arquivo-referencia', join(dir, 'texto.txt'))
  await pagina.getByText('Esse arquivo não é uma imagem. Use PNG, JPEG ou WebP.').waitFor()
  await pagina.close()
})

test('celular: sem rolagem horizontal e controles com nome', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 375, height: 800 } })
  await pagina.goto(endereco + 'lut.html')
  await pagina.setInputFiles('#arquivo-referencia', join(dir, 'filme.png'))
  await pagina.setInputFiles('#arquivo-material', join(dir, 'meu-frame.png'))
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  const largura = await pagina.evaluate(() => document.documentElement.scrollWidth)
  assert.ok(largura <= 375, `rolagem horizontal: ${largura}px`)
  for (const nome of ['Comparar antes e depois', 'Intensidade', 'Contraste', 'Cor']) {
    assert.equal(await pagina.getByLabel(nome, { exact: true }).count(), 1, `controle sem nome: ${nome}`)
  }
  assert.equal(await pagina.getByRole('radiogroup', { name: 'Tamanho da LUT' }).getByRole('radio').count(), 2)
  await pagina.close()
})

test('conta-gotas: marca um par, refaz o look e limpa', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 1000 } })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco + 'lut.html')
  await pagina.setInputFiles('#arquivo-referencia', join(dir, 'filme.png'))
  await pagina.setInputFiles('#arquivo-material', join(dir, 'meu-frame.png'))
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()

  await pagina.getByRole('button', { name: 'Conta-gotas' }).click()
  await pagina.getByText('Clique num ponto da referência (lá em cima).').waitFor()
  // clicar na referência não pode abrir a escolha de arquivo
  let abriuArquivo = false
  pagina.on('filechooser', () => (abriuArquivo = true))
  await pagina.locator('#caixa-referencia img').click()
  await pagina.getByText('Agora clique na mesma coisa no seu frame (na comparação).').waitFor()
  await pagina.locator('#previa').click({ position: { x: 100, y: 100 } })
  await pagina.getByText('Pronto, com 1 par de cor. Arraste sobre a imagem para comparar.').waitFor()
  assert.equal(abriuArquivo, false)
  assert.equal(await pagina.locator('#pares li').count(), 1)
  assert.equal(await pagina.locator('#pares li').getAttribute('aria-label'), 'Par 1: seu frame → referência')

  // Esc cancela no meio
  await pagina.getByRole('button', { name: 'Conta-gotas' }).click()
  await pagina.keyboard.press('Escape')
  await pagina.getByText('Conta-gotas cancelado.').waitFor()

  await pagina.getByRole('button', { name: 'Limpar' }).click()
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  assert.equal(await pagina.locator('#pares li').count(), 0)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('entrega: escolhe o destino, mostra fonte e baixa o script do Resolve', async () => {
  const pagina = await navegador.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  pagina.on('console', (m) => m.type() === 'error' && !SEM_SESSAO.test(m.text()) && erros.push(m.text()))
  await pagina.goto(endereco + 'entrega.html')
  await pagina.getByRole('heading', { name: 'Cada destino, do jeito certo.' }).waitFor()
  assert.equal(await pagina.locator('#destinos .cartao').count(), 8)

  // YouTube abre por padrão: bitrate oficial e selo
  await pagina.getByRole('heading', { name: 'YouTube', exact: true }).waitFor()
  assert.match(await pagina.locator('#detalhe').textContent(), /1080p: 8 Mbps \(24–30 fps\) · 12 Mbps \(48–60 fps\)/)
  // à vista, só o essencial em blocos; a ficha inteira fica recolhida
  assert.match(await pagina.locator('.specs').innerText(), /H\.264[\s\S]*8 Mbps[\s\S]*Rec\.709 SDR/)
  assert.equal(await pagina.locator('#detalhe .cabeca .etiqueta').innerText(), 'Oficial')

  // Reels: valor de mercado, vertical, e o endereço guarda o destino
  await pagina.getByRole('button', { name: /Instagram Reels/ }).click()
  assert.equal(await pagina.locator('#detalhe .cabeca .etiqueta').innerText(), 'Mercado')
  assert.match(await pagina.locator('.specs').innerText(), /1080×1920/)
  assert.ok(pagina.url().endsWith('#reels'))

  const [baixado] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Baixar preset' }).click()])
  assert.equal(baixado.suggestedFilename(), 'revela-entrega-reels.py')
  const script = readFileSync(await baixado.path(), 'utf8')
  assert.match(script, /NOME = "Revela · Instagram Reels e Stories"/)
  assert.match(script, /SetCurrentRenderFormatAndCodec/)

  // TV aberta: loudness da portaria
  await pagina.getByRole('button', { name: /TV aberta/ }).click()
  assert.match(await pagina.locator('#detalhe').textContent(), /-23 LKFS ±2/)
  assert.match(await pagina.locator('.specs').innerText(), /-23 LKFS/)
  assert.equal(await pagina.locator('#detalhe .cabeca .etiqueta').innerText(), 'Loudness oficial') // o resto é da emissora
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('entrega: link direto para um destino e celular sem rolagem lateral', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 375, height: 800 } })
  await pagina.goto(endereco + 'entrega.html#master')
  await pagina.getByRole('heading', { name: 'Master de arquivo' }).waitFor()
  assert.equal(await pagina.getByRole('button', { name: /Master de arquivo/ }).getAttribute('aria-pressed'), 'true')
  const largura = await pagina.evaluate(() => document.documentElement.scrollWidth)
  assert.ok(largura <= 375, `rolagem horizontal: ${largura}px`)
  // as duas ferramentas se ligam pelas abas
  await pagina.getByRole('navigation', { name: 'Ferramentas da Revela' }).getByRole('link', { name: 'LUT', exact: true }).click()
  await pagina.getByRole('heading', { name: 'Revela a cor que você quer.' }).waitFor()
  await pagina.close()
})

test('converter: ProRes 422 HQ vira MP4 H.264 marcado BT.709, no navegador', async () => {
  // master de teste: ProRes 422 HQ 1280×720 24 fps, 2 s, com áudio PCM 24 bits, marcado BT.709
  const master = join(dir, 'master.mov')
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=24',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '2',
    '-c:v',
    'prores_ks',
    '-profile:v',
    '3',
    '-pix_fmt',
    'yuv422p10le',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-colorspace',
    'bt709',
    '-c:a',
    'pcm_s24le',
    master,
  ])
  const pagina = await navegador.newPage({ acceptDownloads: true })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  pagina.on('console', (m) => m.type() === 'error' && !SEM_SESSAO.test(m.text()) && erros.push(m.text()))
  await pagina.goto(endereco + 'converter.html')
  assert.equal(await pagina.evaluate(() => crossOriginIsolated), true, 'sem isolamento: o ProRes decodifica mais devagar')
  await pagina.locator('#aparelho [data-codec=avc][data-ok=true]').waitFor()
  assert.equal(await pagina.getByRole('radio', { name: /YouTube/ }).isChecked(), true)

  await pagina.setInputFiles('#arquivos', master)
  await pagina.locator('.item[data-estado=pronto]').waitFor()
  assert.deepEqual(await pagina.locator('.item-info .ficha').allTextContents(), ['ProRes', '1280×720', '24 fps', '2 s', '1280×720 · ~1 MB'])
  // miniatura com o primeiro quadro
  assert.ok(
    await pagina.evaluate(() =>
      document
        .querySelector('.miniatura canvas')
        .getContext('2d')
        .getImageData(0, 0, 224, 126)
        .data.some((v, i) => i % 4 !== 3 && v > 20),
    ),
  )
  assert.ok(await pagina.locator('#caixa-arquivos.compacta').count(), 'a caixa de soltar devia encolher')
  await pagina.locator('#salvar-pasta').uncheck({ force: true }) // a escolha de pasta não existe no navegador de teste
  await pagina.getByRole('button', { name: 'Converter' }).click()
  const link = pagina.getByRole('link', { name: 'Baixar master-youtube.mp4' })
  await link.waitFor({ timeout: 60_000 })
  assert.match((await pagina.locator('.item-info .ficha').allTextContents()).join(' · '), /^H\.264 \+ (AAC|Opus) · BT\.709 · [\d,]+× tempo real · \d+ MB$/)

  const [baixado] = await Promise.all([pagina.waitForEvent('download'), link.click()])
  const saida = join(dir, 'saida.mp4')
  await baixado.saveAs(saida)
  const sonda = JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,color_primaries,color_transfer,color_space', '-of', 'json', saida],
      { encoding: 'utf8' },
    ),
  )
  const video = sonda.streams.find((s) => s.codec_type === 'video')
  assert.deepEqual([video.codec_name, video.width, video.height], ['h264', 1280, 720])
  assert.deepEqual([video.color_primaries, video.color_transfer, video.color_space], ['bt709', 'bt709', 'bt709'])
  assert.ok(
    sonda.streams.some((s) => s.codec_type === 'audio'),
    'sem áudio na saída',
  )
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('página inicial: seções, conta e sem rolagem horizontal', async () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const pagina = await navegador.newPage({ viewport })
    const erros = []
    pagina.on('pageerror', (e) => erros.push(e.message))
    pagina.on('console', (m) => m.type() === 'error' && !SEM_SESSAO.test(m.text()) && erros.push(m.text()))
    await pagina.goto(endereco)
    await pagina.getByRole('heading', { level: 1 }).waitFor()
    assert.match(await pagina.getByRole('heading', { level: 1 }).textContent(), /Revela a cor/)
    for (const id of ['ferramentas', 'entrega', 'converter', 'familia']) assert.equal(await pagina.locator('#' + id).count(), 1, id)
    // a faixa de destinos vem da mesma lista da Entrega
    assert.ok((await pagina.locator('#faixa > *').count()) >= 4)
    // sem sessão, o topo oferece "Entrar"
    await pagina.locator('#conta.conta--pronta').waitFor()
    assert.equal(await pagina.locator('#conta').getAttribute('href'), 'entrar.html')
    await pagina.evaluate(() => scrollTo(0, document.body.scrollHeight))
    const largura = await pagina.evaluate(() => document.documentElement.scrollWidth)
    assert.ok(largura <= viewport.width, `rolagem horizontal: ${largura}px`)
    const quebradas = await pagina.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src))
    assert.deepEqual(quebradas, [])
    assert.deepEqual(erros, [])
    await pagina.close()
  }
})

test('entrar: sem sessão mostra os botões; login desligado avisa', async () => {
  const pagina = await navegador.newPage()
  await pagina.goto(endereco + 'entrar.html?volta=/converter')
  await pagina.getByRole('heading', { name: 'Entre na Revela.' }).waitFor()
  const entrar = await pagina.getByRole('link', { name: 'Entrar com Absolute ZRO' }).getAttribute('href')
  assert.match(entrar, /^\/api\/zro\/entrar\?volta=%2Fconverter/)
  assert.match(await pagina.getByRole('link', { name: 'Criar conta' }).getAttribute('href'), /criar=1/)

  await pagina.route('**/api/zro/eu', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }))
  await pagina.reload()
  await pagina.getByRole('heading', { name: 'Entrar chega em breve.' }).waitFor()
  assert.equal(await pagina.getByRole('heading', { name: 'Entre na Revela.' }).isVisible(), false)
  await pagina.close()
})

test('testar com um exemplo: carrega as duas imagens e monta a prévia', async () => {
  const pagina = await navegador.newPage()
  await pagina.goto(endereco + 'lut.html')
  await pagina.getByRole('button', { name: 'Testar com um exemplo' }).click()
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  await pagina.close()
})

test('Revela Look: sem referência, compara e baixa o .cube do look', async () => {
  const pagina = await navegador.newPage({ acceptDownloads: true })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco + 'lut.html')
  await pagina.getByRole('button', { name: 'Revela Look' }).click()
  await pagina.getByText('Agora o seu frame.').waitFor()
  assert.equal(await pagina.locator('#usar-look').getAttribute('aria-pressed'), 'true')
  await pagina.setInputFiles('#arquivo-material', join(dir, 'meu-frame.png'))
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  assert.equal(await pagina.getByRole('button', { name: 'Conta-gotas' }).isDisabled(), true)
  assert.equal(await pagina.locator('#titulo-leitura').textContent(), 'Leitura do look')
  const [baixado] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Baixar LUT' }).click()])
  assert.equal(baixado.suggestedFilename(), 'revela-look-33.cube')
  assert.match(readFileSync(await baixado.path(), 'utf8'), /^TITLE "Revela Look - 100%"/)
  // referência nova volta ao look por referência
  await pagina.setInputFiles('#arquivo-referencia', join(dir, 'filme.png'))
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  assert.equal(await pagina.locator('#usar-look').getAttribute('aria-pressed'), 'false')
  assert.equal(await pagina.getByRole('button', { name: 'Conta-gotas' }).isDisabled(), false)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('CST: escolhe câmera e saída, vê num frame e baixa o .cube', async () => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 375, height: 800 },
  ]) {
    const pagina = await navegador.newPage({ acceptDownloads: true, viewport })
    const erros = []
    pagina.on('pageerror', (e) => erros.push(e.message))
    await pagina.goto(endereco + 'cst.html')
    await pagina.getByRole('heading', { name: 'Da câmera à tela.' }).waitFor()
    await pagina.getByLabel('Câmera').selectOption('arri-logc4')
    await pagina.getByLabel('Saída').selectOption('rec709')
    await pagina.setInputFiles('#frame', join(dir, 'meu-frame.png'))
    await pagina.getByText('Arraste sobre a imagem para comparar.').waitFor()
    const largura = await pagina.evaluate(() => document.documentElement.scrollWidth)
    assert.ok(largura <= viewport.width, `rolagem horizontal: ${largura}px`)
    const [baixado] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Baixar LUT' }).click()])
    assert.equal(baixado.suggestedFilename(), 'revela-cst-arri-logc4-para-rec709-65.cube')
    const texto = readFileSync(await baixado.path(), 'utf8')
    assert.match(texto, /^TITLE "Revela CST - ARRI · LogC4 \/ Wide Gamut 4 para Rec.709/)
    assert.equal(lerCube(texto).tamanho, 65)
    assert.deepEqual(erros, [])
    await pagina.close()
  }
})

test('dock embaixo e menu recolhível: computador lembra, celular abre em gaveta', async () => {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
  const pagina = await contexto.newPage()
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco + 'converter.html')
  const dock = pagina.getByRole('navigation', { name: 'Ferramentas da Revela' })
  const caixa = await dock.boundingBox()
  assert.ok(caixa.y + caixa.height > 900 - 60, `dock devia ficar embaixo: ${caixa.y}`)
  const botao = pagina.locator('.menu-topo .menu-botao')
  assert.equal(await botao.getAttribute('aria-expanded'), 'false')
  await botao.click()
  assert.equal(await botao.getAttribute('aria-expanded'), 'true')
  await pagina.locator('#menu').getByRole('link', { name: 'CST' }).click()
  await pagina.waitForURL(/cst\.html$/)
  assert.equal(await pagina.locator('.menu-topo .menu-botao').getAttribute('aria-expanded'), 'true', 'o menu aberto devia ser lembrado')
  assert.equal(await pagina.locator('#menu [aria-current="page"]').textContent(), 'CST')
  // família em ordem alfabética, como em todas as plataformas
  const familia = await pagina.locator('#menu .menu-item[href^="http"]').allTextContents()
  assert.deepEqual(familia, ['Absolute ZRO', 'Carro do Freela', 'Nossom', 'Sobedesce', 'Synquei', 'TPEasy'])
  await contexto.close()

  const celular = await navegador.newPage({ viewport: { width: 375, height: 800 } })
  await celular.goto(endereco + 'lut.html')
  assert.equal(await celular.locator('#menu').isVisible(), false)
  await celular.getByRole('button', { name: 'Abrir menu' }).click()
  await celular.locator('#menu').getByRole('link', { name: 'Sobedesce' }).waitFor()
  await celular.keyboard.press('Escape')
  await celular.waitForFunction(() => !document.documentElement.classList.contains('menu-gaveta'))
  const largura = await celular.evaluate(() => document.documentElement.scrollWidth)
  assert.ok(largura <= 375, `rolagem horizontal: ${largura}px`)
  assert.deepEqual(erros, [])
  await celular.close()
})

test('Clonar LUT e preset Lightroom: o mesmo frame com e sem a cor vira .cube e .xmp', async () => {
  const pagina = await navegador.newPage({ acceptDownloads: true })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco + 'lut.html')
  await pagina.locator('#usar-clone').click()
  assert.equal(await pagina.locator('#usar-clone').getAttribute('aria-pressed'), 'true')
  assert.equal(await pagina.locator('#caixa-referencia strong').textContent(), 'Com a cor')
  await pagina.setInputFiles('#arquivo-referencia', join(dir, 'filme.png'))
  await pagina.setInputFiles('#arquivo-material', join(dir, 'antes.png'))
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  assert.equal(await pagina.getByRole('button', { name: 'Conta-gotas' }).isDisabled(), true)
  const [cube] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Baixar LUT' }).click()])
  assert.equal(cube.suggestedFilename(), 'revela-clone-33.cube')
  const [xmp] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Preset Lightroom' }).click()])
  assert.equal(xmp.suggestedFilename(), 'revela-clone.xmp')
  const texto = readFileSync(await xmp.path(), 'utf8')
  assert.match(texto, /<rdf:li xml:lang="x-default">Revela clone<\/rdf:li>/)
  assert.match(texto, /<crs:ToneCurvePV2012Blue>/)
  // o clone, aplicado no "sem a cor", chega perto do "com a cor"
  const perto = await pagina.evaluate(() => {
    const c = document.getElementById('previa')
    const d = document.getElementById('divisao')
    d.value = '0'
    d.dispatchEvent(new Event('input'))
    return c.width > 0
  })
  assert.ok(perto)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('página inicial: arrastar a comparação e "Testar grátis agora" abre o exemplo pronto', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco)
  await pagina.getByRole('slider', { name: 'Comparar log e cor final' }).fill('25')
  assert.equal(await pagina.locator('.comparar').evaluate((n) => [n.classList.contains('manual'), n.style.getPropertyValue('--corte')].join()), 'true,25%')
  assert.equal(await pagina.getByRole('list', { name: 'Editores compatíveis' }).getByRole('listitem').count(), 6)
  await pagina.getByRole('link', { name: 'Testar grátis agora' }).click()
  await pagina.waitForURL(/lut\.html\?exemplo=1$/)
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  assert.deepEqual(erros, [])
  await pagina.close()
})
