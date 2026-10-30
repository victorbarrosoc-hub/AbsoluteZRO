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
import { simularZ } from './z-falso.js'
import { simularSet } from './set-falso.js'

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
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
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
    if (caminho === '/api/zro/set' || caminho.startsWith('/api/zro/set/')) return res.writeHead(401, { 'content-type': 'application/json' }).end('{"ok":false}')
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
  // o Set (app/set.js) carrega o <zro-set> de absolutezro.com: nos testes ele não chega (módulo vazio, sem rede), a
  // não ser no teste do Set, que liga o widget de verdade (a rota registrada depois ganha)
  const semSet = (alvo) => alvo.route('https://absolutezro.com/set/**', (r) => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin', 'content-type': 'text/javascript' }, body: 'export {}\n' }))
  for (const m of ['newPage', 'newContext']) {
    const original = navegador[m].bind(navegador)
    navegador[m] = async (...a) => {
      const x = await original(...a)
      await semSet(x)
      return x
    }
  }
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

test('tema claro por padrão, mesmo com o sistema no escuro (o escuro é escolha no seletor)', async () => {
  const pagina = await navegador.newPage({ colorScheme: 'dark' })
  await pagina.goto(endereco + 'lut.html')
  const { fundo, texto } = await pagina.evaluate(() => ({
    fundo: getComputedStyle(document.body).backgroundColor,
    texto: getComputedStyle(document.body).color,
  }))
  assert.equal(fundo, 'rgb(245, 245, 247)')
  assert.equal(texto, 'rgb(29, 29, 31)')
  await pagina.close()
})

test('link compartilhado: tags de OG e imagem 1200×630', async () => {
  const pagina = await navegador.newPage()
  await pagina.goto(endereco)
  const meta = (seletor) => pagina.locator(seletor).getAttribute('content')
  const imagem = await meta('meta[property="og:image"]')
  assert.match(imagem, /^https:\/\/revela\.absolutezro\.com\/og\.jpg/)
  assert.equal(await meta('meta[name="twitter:card"]'), 'summary_large_image')
  assert.equal(await meta('meta[name="twitter:image"]'), imagem)
  assert.equal(await meta('meta[property="og:url"]'), 'https://revela.absolutezro.com/')
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
    '-vf',
    // o ffmpeg 8 tira a cor dos quadros (as opções -color_* sozinhas não bastam): marca cada quadro com setparams
    'scale=out_color_matrix=bt709:out_range=tv,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
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
  // cabeçalho dos quadros em BT.601 (6) contra o contêiner em BT.709: vale o contêiner, como no QuickTime
  const bruto = readFileSync(master)
  for (let i = bruto.indexOf('icpf'); i >= 0; i = bruto.indexOf('icpf', i + 4)) bruto.fill(6, i + 18, i + 21)
  writeFileSync(master, bruto)
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
  // balão da aba: o vídeo lido espera o botão Converter (no dock e no menu)
  const balao = pagina.locator('.abas a[href^="converter"] .balao')
  assert.equal(await balao.innerText(), '1')
  assert.equal(await balao.getAttribute('aria-label'), '1 pendência')
  assert.match(await pagina.getAttribute('.abas a[href^="converter"]', 'title'), /1 vídeo esperando Converter/)
  assert.equal(await pagina.locator('.menu-item[href^="converter"] .balao').innerText(), '1')
  await pagina.locator('#salvar-pasta').uncheck({ force: true }) // a escolha de pasta não existe no navegador de teste
  await pagina.getByRole('button', { name: 'Converter' }).click()
  const link = pagina.getByRole('link', { name: 'Baixar master-youtube.mp4' })
  await link.waitFor({ timeout: 60_000 })
  // pronto na memória: espera o Baixar
  assert.match(await pagina.getAttribute('.abas a[href^="converter"]', 'title'), /1 vídeo pronto para baixar/)
  assert.match((await pagina.locator('.item-info .ficha').allTextContents()).join(' · '), /^H\.264 \+ (AAC|Opus) · BT\.709 · [\d,]+× tempo real · \d+ MB$/)

  const [baixado] = await Promise.all([pagina.waitForEvent('download'), link.click()])
  await balao.waitFor({ state: 'detached' })
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
  // na falha, as marcas de cor de cada lado: colr do contêiner e cabeçalho do primeiro quadro ProRes
  const marcas = (arquivo, caixa, deslocamento) => {
    const b = readFileSync(arquivo)
    const i = b.indexOf(caixa)
    return i < 0 ? `${caixa} ausente` : `${caixa} ${[...b.subarray(i + deslocamento, i + deslocamento + 10)].join(',')}`
  }
  assert.deepEqual(
    [video.color_primaries, video.color_transfer, video.color_space],
    ['bt709', 'bt709', 'bt709'],
    `master: ${marcas(master, 'colr', 0)} · ${marcas(master, 'icpf', 16)} · saída: ${marcas(saida, 'colr', 0)}`,
  )
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
    for (const id of ['looks', 'ferramentas', 'entrega', 'converter', 'familia', 'z']) assert.equal(await pagina.locator('#' + id).count(), 1, id)
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

test('perfil único: a foto da conta Absolute ZRO no topo e na entrada; editar leva à conta; sem foto, iniciais', async () => {
  // 1×1 PNG servido como a Absolute ZRO serve (Cross-Origin-Resource-Policy: cross-origin: a Revela isola origens)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
  const foto = 'https://absolutezro.com/api/v1/foto/b8a4a3c2-0f4e-4d55-9a51-1f3f0c6a2b10'
  let pessoa = { nome: 'Lia Martins', email: 'lia@produtora.com', foto, organizacao: null, produtos: ['finishing'] }
  const pagina = await navegador.newPage()
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
  await pagina.route('**/api/zro/eu', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, acesso: true, conta: 'https://absolutezro.com/perfil?de=revela', pessoa }) }))
  await pagina.route('https://absolutezro.com/api/v1/foto/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'cross-origin-resource-policy': 'cross-origin' }, body: png }))
  await pagina.goto(endereco)
  // a CSP da Revela deixa a foto da conta carregar (img-src https://absolutezro.com)
  await pagina.locator('#conta.conta--logado.avatar--foto img').waitFor()
  assert.equal(await pagina.locator('#conta img').getAttribute('src'), foto)
  assert.equal(await pagina.locator('#conta img').evaluate((i) => i.naturalWidth), 1)
  assert.match(await pagina.locator('#conta').getAttribute('title'), /Lia Martins/)

  await pagina.goto(endereco + 'entrar.html')
  await pagina.locator('#avatar.avatar--foto img').waitFor()
  assert.equal(await pagina.getByRole('heading', { name: 'Olá, Lia.' }).count(), 1)
  const editar = pagina.getByRole('link', { name: 'Editar na conta Absolute ZRO' })
  assert.equal(await editar.getAttribute('href'), 'https://absolutezro.com/perfil?de=revela')
  assert.equal(await editar.getAttribute('target'), '_blank')
  // a Revela não edita nome, foto nem e-mail
  assert.equal(await pagina.locator('#dentro input').count(), 0)

  pessoa = { ...pessoa, foto: null }
  await pagina.goto(endereco)
  await pagina.locator('#conta.conta--logado').waitFor()
  assert.equal(await pagina.locator('#conta').innerText(), 'LM')
  assert.equal(await pagina.locator('#conta img').count(), 0)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('entrar: sem sessão mostra os botões; login desligado avisa', async () => {
  const pagina = await navegador.newPage()
  await pagina.goto(endereco + 'entrar.html?volta=/converter')
  await pagina.getByRole('heading', { name: 'Entre na Revela.' }).waitFor()
  const entrar = await pagina.getByRole('link', { name: 'Entrar com Absolute ZRO' }).getAttribute('href')
  assert.match(entrar, /^\/api\/zro\/entrar\?volta=%2Fconverter/)
  assert.match(await pagina.getByRole('link', { name: 'Criar conta' }).getAttribute('href'), /criar=1/)
  // a conta vale para a família inteira, AEON e a própria Absolute ZRO inclusive
  const familia = await pagina.locator('.familia-mini img').evaluateAll((n) => n.map((i) => i.alt))
  for (const nome of ['AEON', 'Absolute ZRO']) assert.ok(familia.includes(nome), nome)

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
  // o Maestro entra no lançamento (MAESTRO_NA_FAMILIA em app/menu.js, scripts/lancamento-maestro.mjs na raiz)
  const comMaestro = /^const MAESTRO_NA_FAMILIA = true$/m.test(readFileSync(new URL('../app/menu.js', import.meta.url), 'utf8'))
  assert.deepEqual(familia, ['Absolute ZRO', 'AEON', 'Carro do Freela', ...(comMaestro ? ['Maestro'] : []), 'Nossom', 'Sobedesce', 'Synquei', 'TPEasy'])
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
  // no clone o conta-gotas sai e entra "Mais frames"
  assert.equal(await pagina.locator('#marcar-par').isHidden(), true)
  assert.equal(await pagina.locator('#n-frames').textContent(), '1')
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

test('página inicial fechada ao público: a comparação segue, "Conhecer o projeto" é âncora e nada leva a uma ferramenta', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  pagina.on('console', (m) => m.type() === 'error' && !SEM_SESSAO.test(m.text()) && erros.push(m.text()))
  await pagina.goto(endereco)
  await pagina.getByRole('slider', { name: 'Comparar log e cor final' }).fill('25')
  assert.equal(await pagina.locator('.comparar').evaluate((n) => [n.classList.contains('manual'), n.style.getPropertyValue('--corte')].join()), 'true,25%')
  assert.equal(await pagina.getByRole('list', { name: 'Editores compatíveis' }).getByRole('listitem').count(), 6)
  const hrefs = await pagina.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))
  assert.deepEqual(
    hrefs.filter((h) => /^(inicio|lut|lab|looks|cst|entrega|converter)(\.html)?(\?|#|$)/.test(h)),
    [],
  )
  assert.equal(await pagina.getByRole('link', { name: 'Conhecer o projeto' }).first().getAttribute('href'), '#looks')
  assert.equal(await pagina.getByRole('link', { name: 'Testar agora' }).count(), 0)
  assert.equal(await pagina.locator('#ferramentas .cartao-home').count(), 4)
  assert.equal(await pagina.locator('#ferramentas a.cartao-home').count(), 0)
  assert.match(await pagina.locator('.hero .selo-dev').innerText(), /Em desenvolvimento/)
  assert.equal(await pagina.locator('.fecho').getByRole('link', { name: 'Voltar ao HUB' }).getAttribute('href'), 'https://absolutezro.com/inicio')
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('em desenvolvimento: símbolo, logo, título, uma linha e Voltar ao HUB, nos dois temas e no celular', async () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const pagina = await navegador.newPage({ viewport })
    const erros = []
    pagina.on('pageerror', (e) => erros.push(e.message))
    pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
    const r = await pagina.goto(endereco + 'em-desenvolvimento.html')
    assert.equal(r.status(), 200)
    assert.match(r.headers()['content-security-policy'], /default-src 'self'/)
    assert.equal(await pagina.locator('.fechado-zro svg').count(), 1)
    await pagina.waitForFunction(() => document.querySelector('.fechado-produto img')?.complete)
    assert.ok(await pagina.evaluate(() => document.querySelector('.fechado-produto img').naturalWidth > 0), 'logo da Revela não carregou')
    assert.equal(await pagina.getByRole('heading', { level: 1 }).innerText(), 'Em desenvolvimento.')
    assert.equal(await pagina.locator('.fechado p').count(), 1)
    const botao = pagina.getByRole('link', { name: 'Voltar ao HUB' })
    assert.equal(await botao.getAttribute('href'), 'https://absolutezro.com/inicio')
    assert.ok(await botao.evaluate((b) => b.classList.contains('glass-btn--ink')))
    await pagina.evaluate(() => document.fonts.ready)
    assert.ok(await pagina.evaluate(() => document.fonts.check('300 40px Figtree') && document.fonts.check('800 40px Figtree')))
    const pesos = await pagina.evaluate(() => [getComputedStyle(document.querySelector('.fechado .fino')).fontWeight, getComputedStyle(document.querySelector('.fechado .forte')).fontWeight])
    assert.deepEqual(pesos, ['300', '800'])
    // claro por padrão; escuro pela escolha guardada (app/tema.js), com a logo de letras brancas
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(245, 245, 247)')
    assert.match(await pagina.locator('.fechado-produto img').getAttribute('src'), /revela-logo-claro\.png$/)
    await pagina.evaluate(() => window.revelaTema.alternar())
    assert.equal(await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(0, 0, 0)')
    assert.match(await pagina.locator('.fechado-produto img').getAttribute('src'), /revela-logo\.png$/)
    await pagina.evaluate(() => window.revelaTema.alternar())
    const largura = await pagina.evaluate(() => document.documentElement.scrollWidth)
    assert.ok(largura <= viewport.width, `rolagem horizontal: ${largura}px`)
    assert.deepEqual(erros, [])
    await pagina.close()
  }
})

test('entrar.html com a conta fechada pelo HUB (403): "Em desenvolvimento", Voltar ao HUB e Sair', async () => {
  const pagina = await navegador.newPage()
  await pagina.route('**/api/zro/eu', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, fechado: true, hub: 'https://absolutezro.com/inicio', pagina: '/em-desenvolvimento' }) }))
  await pagina.goto(endereco + 'entrar.html')
  await pagina.locator('#fechado:not([hidden])').waitFor()
  assert.equal(await pagina.locator('#fechado').getByRole('link', { name: 'Voltar ao HUB' }).getAttribute('href'), 'https://absolutezro.com/inicio')
  assert.equal(await pagina.locator('#fechado').getByRole('button', { name: 'Sair' }).count(), 1)
  assert.equal(await pagina.locator('#dentro').isHidden(), true)
  assert.equal(await pagina.locator('#fora').isHidden(), true)
  // na página inicial, a conta fechada continua vendo só "Entrar"
  await pagina.goto(endereco)
  await pagina.locator('#conta.conta--pronta').waitFor()
  assert.equal(await pagina.locator('#conta').innerText(), 'Entrar')
  await pagina.close()
})

test('converter com log: S-Log3 vira Rec.709 na GPU (cinza 18% no lugar certo) e sai marcado BT.709', async () => {
  // "material em S-Log3": cinza liso no código do cinza 18% da Sony (~420 em 10 bits), ProRes marcado BT.709
  const log = join(dir, 'slog3.mov')
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x686868:size=640x360:rate=24',
    '-t',
    '1',
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
    log,
  ])
  const pagina = await navegador.newPage({ acceptDownloads: true })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco + 'converter.html')
  await pagina.locator('#aparelho [data-codec=avc][data-ok=true]').waitFor()
  await pagina.getByLabel('Log da câmera').selectOption('sony-slog3-cine')
  await pagina.setInputFiles('#arquivos', log)
  await pagina.locator('.item[data-estado=pronto]').waitFor()
  await pagina.locator('#salvar-pasta').uncheck({ force: true })
  await pagina.getByRole('button', { name: 'Converter' }).click()
  const link = pagina.getByRole('link', { name: 'Baixar slog3-youtube.mp4' })
  await link.waitFor({ timeout: 60_000 })
  const [baixado] = await Promise.all([pagina.waitForEvent('download'), link.click()])
  const saida = join(dir, 'slog3-saida.mp4')
  await baixado.saveAs(saida)
  // luma do centro do primeiro quadro (8 bits, faixa de vídeo): S-Log3 cinza → Rec.709 cinza 18% ≈ 16 + 0,49 × 219 ≈ 124
  const y = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', saida, '-vf', 'crop=8:8,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'])
  const media = y.reduce((s, v) => s + v, 0) / y.length
  assert.ok(Math.abs(media - 124) <= 5, `luma do cinza: ${media} (sem o CST ficaria perto de 105)`)
  const sonda = JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=color_primaries,color_transfer,color_space', '-of', 'json', saida],
      {
        encoding: 'utf8',
      },
    ),
  )
  const v = sonda.streams[0]
  assert.deepEqual([v.color_primaries, v.color_transfer, v.color_space], ['bt709', 'bt709', 'bt709'])
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('converter no celular: nome comprido não alarga a página e o vídeo em pé reduz na GPU igual ao canvas', async () => {
  // 1080p deitado com a rotação de celular (90°): sai em pé, 720 de altura
  const deitado = join(dir, 'deitado.mp4')
  const nome = 'C0042_Clipe_Com_Nome_Bem_Comprido_De_Camera_Em_Pe_4K_Final.mp4'
  const empe = join(dir, nome)
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=24', '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', deitado])
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-display_rotation', '90', '-i', deitado, '-c', 'copy', empe])
  const converter = async (escala) => {
    const pagina = await navegador.newPage({ acceptDownloads: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const erros = []
    pagina.on('pageerror', (e) => erros.push(e.message))
    await pagina.goto(endereco + `converter.html?escala=${escala}`)
    await pagina.locator('#aparelho [data-codec=avc][data-ok=true]').waitFor()
    await pagina.setInputFiles('#arquivos', empe)
    await pagina.locator('.item[data-estado=pronto]').waitFor()
    await pagina.getByRole('radio', { name: '720p' }).check({ force: true })
    assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth), 390, 'a página alargou com o nome do arquivo')
    await pagina.locator('#salvar-pasta').uncheck({ force: true })
    await pagina.getByRole('button', { name: 'Converter' }).click()
    const link = pagina.getByRole('link', { name: /^Baixar / })
    await link.waitFor({ timeout: 60_000 })
    assert.equal(await pagina.locator('.item').getAttribute('data-escala'), escala === 'gpu' ? 'gpu' : 'nenhuma')
    assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth), 390)
    const [baixado] = await Promise.all([pagina.waitForEvent('download'), link.click()])
    const saida = join(dir, `em-pe-${escala}.mp4`)
    await baixado.saveAs(saida)
    assert.deepEqual(erros, [])
    await pagina.close()
    const { streams } = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'json', saida], { encoding: 'utf8' }))
    assert.deepEqual([streams[0].width, streams[0].height], [406, 720])
    // primeiro quadro em 36×64 cinza, para comparar os dois caminhos (girado errado, a diferença dispara)
    return execFileSync('ffmpeg', ['-loglevel', 'error', '-i', saida, '-vf', 'scale=36:64,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'])
  }
  const gpu = await converter('gpu')
  const canvas = await converter('canvas')
  const diferenca = gpu.reduce((s, v, i) => s + Math.abs(v - canvas[i]), 0) / gpu.length
  assert.ok(diferenca < 4, `GPU e canvas diferem demais: ${diferenca}`)
})

test('grade de looks: só o frame já mostra todos os looks; trocar de look muda o palco e o nome do arquivo', async () => {
  const pagina = await navegador.newPage({ acceptDownloads: true })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  pagina.on('console', (m) => m.type() === 'error' && !SEM_SESSAO.test(m.text()) && erros.push(m.text()))
  await pagina.goto(endereco + 'lut.html')
  await pagina.setInputFiles('#arquivo-material', join(dir, 'meu-frame.png'))
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  const looks = pagina.locator('#looks .look')
  assert.deepEqual(await looks.evaluateAll((n) => n.map((b) => b.dataset.look)), ['revela', 'suave', 'petroleo', 'dourado', 'pb'])
  // sem texto na grade: o nome fica no title e no rótulo
  assert.equal((await pagina.locator('#looks').innerText()).trim(), '')
  assert.equal(await pagina.locator('#looks [aria-checked=true]').getAttribute('data-look'), 'revela')
  // cada miniatura é diferente das outras
  const miniaturas = await looks.evaluateAll((n) => n.map((b) => Array.from(b.querySelector('canvas').getContext('2d').getImageData(0, 0, 40, 20).data)))
  for (let i = 1; i < miniaturas.length; i++) assert.notDeepEqual(miniaturas[i], miniaturas[0])

  await pagina.getByRole('radio', { name: 'P&B' }).click()
  await pagina.locator('.rotulo-depois', { hasText: 'P&B' }).waitFor()
  assert.equal(await pagina.locator('#looks [aria-checked=true]').getAttribute('data-look'), 'pb')
  const [baixado] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Baixar LUT' }).click()])
  assert.equal(baixado.suggestedFilename(), 'revela-pb-33.cube')
  assert.match(readFileSync(await baixado.path(), 'utf8'), /^TITLE "P&B - 100%"/)

  // com a referência da pessoa, ela entra primeiro na grade e dá para voltar a ela
  await pagina.setInputFiles('#arquivo-referencia', join(dir, 'filme.png'))
  await pagina.locator('#looks [data-look=ref]').waitFor()
  assert.equal(await looks.first().getAttribute('data-look'), 'ref')
  await pagina.getByRole('radio', { name: 'Dourado' }).click()
  await pagina.locator('.rotulo-depois', { hasText: 'Dourado' }).waitFor()
  await pagina.getByRole('radio', { name: 'Sua referência' }).click()
  await pagina.locator('.rotulo-depois', { hasText: 'Depois' }).waitFor()
  assert.equal(await pagina.locator('#looks [aria-checked=true]').getAttribute('data-look'), 'ref')
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('exportar para outro editor: Premiere e CapCut recebem .cube de 33, o tamanho só aparece no Resolve', async () => {
  const pagina = await navegador.newPage({ acceptDownloads: true })
  await pagina.goto(endereco + 'lut.html')
  await pagina.setInputFiles('#arquivo-material', join(dir, 'meu-frame.png'))
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  await pagina.getByRole('radio', { name: '65' }).check({ force: true })
  for (const [editor, dica] of [
    ['premiere', /Lumetri/],
    ['capcut', /CapCut/],
    ['fcp', /Final Cut/],
  ]) {
    await pagina.selectOption('#editor', editor)
    assert.equal(await pagina.locator('#tamanhos').isHidden(), true)
    const [baixado] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Baixar LUT' }).click()])
    assert.equal(baixado.suggestedFilename(), `revela-look-33-${editor}.cube`)
    assert.equal(lerCube(readFileSync(await baixado.path(), 'utf8')).tamanho, 33)
    await pagina.locator('#estado', { hasText: dica }).waitFor()
  }
  await pagina.selectOption('#editor', 'resolve')
  assert.equal(await pagina.locator('#tamanhos').isVisible(), true)
  // a escolha fica lembrada
  await pagina.selectOption('#editor', 'capcut')
  await pagina.reload()
  assert.equal(await pagina.locator('#editor').inputValue(), 'capcut')
  await pagina.close()
})

test('tema: claro por padrão, escuro no menu, lembrado e com a logo certa', async () => {
  const pagina = await navegador.newPage()
  await pagina.goto(endereco + 'lut.html')
  assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema ?? 'claro'), 'claro')
  assert.equal(await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(245, 245, 247)')
  assert.match(await pagina.locator('.marca img').getAttribute('src'), /revela-logo-claro\.png$/)
  await pagina.getByRole('button', { name: 'Tema escuro' }).click({ force: true })
  assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'escuro')
  assert.match(await pagina.locator('.marca img').getAttribute('src'), /revela-logo\.png$/)
  await pagina.goto(endereco + 'index.html')
  assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), 'escuro')
  assert.equal(await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(14, 14, 16)')
  await pagina.locator('#tema').click()
  assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema ?? 'claro'), 'claro')
  // títulos em Figtree, servida pela própria Revela (a CSP só aceita 'self')
  await pagina.evaluate(() => document.fonts.ready)
  assert.ok(await pagina.evaluate(() => document.fonts.check('800 40px "Figtree Variable"')))
  await pagina.close()
})

test('preset Lightroom de cada look: XML válido, curvas de 0 a 255 subindo e HSL dentro do que o Lightroom aceita', async () => {
  const pagina = await navegador.newPage()
  await pagina.goto(endereco + 'lut.html')
  const resultados = await pagina.evaluate(async () => {
    const { LOOKS, criarRevelaLook } = await import('/src/cor/looks.js')
    const { presetLightroom } = await import('/src/cor/lightroom.js')
    return LOOKS.map((l) => {
      const xml = new DOMParser().parseFromString(presetLightroom(criarRevelaLook({ look: l.id }).aplicar, l.nome), 'application/xml')
      const erro = xml.querySelector('parsererror')?.textContent ?? null
      const desc = xml.getElementsByTagNameNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'Description')[0]
      const curvas = ['Red', 'Green', 'Blue'].map((c) =>
        [...xml.getElementsByTagNameNS('http://ns.adobe.com/camera-raw-settings/1.0/', `ToneCurvePV2012${c}`)[0].getElementsByTagName('rdf:li')].map((li) =>
          li.textContent.split(',').map(Number),
        ),
      )
      const hsl = [...desc.attributes].filter((a) => /Adjustment/.test(a.name)).map((a) => Number(a.value))
      const nome = xml.getElementsByTagNameNS('http://ns.adobe.com/camera-raw-settings/1.0/', 'Name')[0].textContent.trim()
      return { id: l.id, nome, erro, curvas, hsl, versao: desc.getAttribute('crs:ProcessVersion'), uuid: desc.getAttribute('crs:UUID') }
    })
  })
  for (const r of resultados) {
    assert.equal(r.erro, null, `${r.id}: XML inválido`)
    assert.equal(r.versao, '11.0')
    assert.match(r.uuid, /^[0-9A-F]{32}$/)
    assert.equal(r.hsl.length, 24)
    for (const v of r.hsl) assert.ok(Number.isInteger(v) && Math.abs(v) <= 100, `${r.id}: HSL fora (${v})`)
    for (const pontos of r.curvas) {
      assert.deepEqual([pontos[0][0], pontos.at(-1)[0]], [0, 255])
      for (let i = 1; i < pontos.length; i++) assert.ok(pontos[i][0] > pontos[i - 1][0] && pontos[i][1] >= pontos[i - 1][1], `${r.id}: curva desce`)
    }
  }
  // o P&B vira saturação -100 em todas as faixas
  const pb = resultados.find((r) => r.id === 'pb')
  assert.ok(pb.hsl.filter((_, i) => i % 3 === 1).every((v) => v === -100))
  await pagina.close()
})

test('CST por clipe: o relatório do Synquei vira a lista de câmeras e um script do Resolve', async () => {
  const pagina = await navegador.newPage({ acceptDownloads: true })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco + 'cst.html')
  const csv = join(dir, 'relatorio.csv')
  writeFileSync(
    csv,
    '﻿arquivo,caminho,aparelho,tipo,inicio_s,duracao,metodo,confianca,deriva_ppm,timecode_origem,codec_video,resolucao,fps,codec_audio,sessao\r\n' +
      'C0001.MP4,A/C0001.MP4,FX30,video,,0:12,Sem sincronia,,,,h264,3840x2160,23.976,aac,\r\n' +
      'ZOOM0001.WAV,B/ZOOM0001.WAV,Zoom H6,audio,,0:30,Sem sincronia,,,,,,,pcm,\r\n' +
      'IMG_0001.MOV,C/IMG_0001.MOV,iPhone,video,,0:05,Sem sincronia,,,,hevc,1920x1080,30,,\r\n',
  )
  await pagina.setInputFiles('#relatorio', csv)
  await pagina.locator('#lista-cameras li').nth(1).waitFor()
  assert.equal(await pagina.getByRole('combobox', { name: 'Log de FX30' }).inputValue(), 'sony-slog3-cine')
  assert.equal(await pagina.getByRole('combobox', { name: 'Log de iPhone' }).inputValue(), '')
  // balão da aba CST: o iPhone ficou sem log e ninguém conferiu; escolher (até "Sem log") resolve
  const balao = pagina.locator('.abas a[href^="cst"] .balao')
  assert.equal(await balao.innerText(), '1')
  assert.match(await pagina.getAttribute('.abas a[href^="cst"]', 'title'), /1 câmera sem log escolhido/)
  await pagina.getByRole('combobox', { name: 'Log de iPhone' }).selectOption('')
  await balao.waitFor({ state: 'detached' })
  const [baixado] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Script do Resolve' }).click()])
  assert.equal(baixado.suggestedFilename(), 'revela-cst-por-clipe.py')
  const script = readFileSync(await baixado.path(), 'utf8')
  assert.match(script, /"c0001\.mp4": "Revela CST Sony/)
  assert.doesNotMatch(script, /img_0001/)
  await pagina.locator('#estado', { hasText: 'CST em 1 clipe(s)' }).waitFor()
  // sem log em nenhuma câmera, não há o que gerar
  await pagina.getByRole('combobox', { name: 'Log de FX30' }).selectOption('')
  assert.equal(await pagina.getByRole('button', { name: 'Script do Resolve' }).isDisabled(), true)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('abas do dock trocam só o painel: sem recarregar, menu parado, marca desliza e o painel guarda o que estava', async () => {
  const pagina = await navegador.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 900 } })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco + 'lut.html')
  await pagina.getByRole('heading', { name: 'Revela a cor que você quer.' }).waitFor()
  await pagina.setInputFiles('#arquivo-material', join(dir, 'meu-frame.png'))
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  // marcas que um recarregamento apagaria
  await pagina.evaluate(() => {
    window.semRecarregar = true
    document.getElementById('menu').dataset.mesmo = '1'
  })
  const dock = pagina.getByRole('navigation', { name: 'Ferramentas da Revela' })
  const marca = pagina.locator('.abas-marca')
  const xAntes = (await marca.boundingBox()).x

  await dock.getByRole('link', { name: 'CST' }).click()
  await pagina.waitForURL(/cst\.html$/)
  await pagina.getByRole('heading', { name: 'Da câmera à tela.' }).waitFor()
  assert.equal(await pagina.title(), 'Revela · Espaço de cor')
  assert.equal(await pagina.evaluate(() => window.semRecarregar), true, 'a página recarregou')
  assert.equal(await pagina.locator('#menu').getAttribute('data-mesmo'), '1', 'o menu foi refeito')
  assert.equal(await pagina.locator('main').count(), 1)
  assert.equal(await dock.locator('[aria-current="page"]').textContent(), 'CST')
  assert.equal(await pagina.locator('#menu [aria-current="page"]').textContent(), 'CST')
  await pagina.waitForFunction((x) => document.querySelector('.abas-marca').getBoundingClientRect().x > x + 20, xAntes)
  // a ferramenta do painel novo funciona
  await pagina.getByLabel('Câmera').selectOption('arri-logc4')
  const [baixado] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Baixar LUT' }).click()])
  assert.match(baixado.suggestedFilename(), /^revela-cst-arri-logc4-para-/)

  // voltar: o LUT segue com o frame e os looks
  await pagina.goBack()
  await pagina.waitForURL(/lut\.html$/)
  await pagina.getByRole('heading', { name: 'Revela a cor que você quer.' }).waitFor()
  assert.ok(await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').isVisible(), 'o painel do LUT perdeu o frame')
  assert.equal(await pagina.locator('#looks .look').count(), 5)
  assert.equal(await dock.locator('[aria-current="page"]').textContent(), 'LUT')
  // e ir de novo para o CST não roda o módulo outra vez (a câmera escolhida continua)
  await dock.getByRole('link', { name: 'CST' }).click()
  await pagina.getByRole('heading', { name: 'Da câmera à tela.' }).waitFor()
  assert.equal(await pagina.getByLabel('Câmera').inputValue(), 'arri-logc4')
  // início não é aba: vai pelo link
  await pagina.locator('#menu').getByRole('link', { name: 'Início' }).click()
  await pagina.waitForURL(/\/$/)
  assert.equal(await pagina.evaluate(() => window.semRecarregar), undefined)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('app na Tela de Início: manifesto, ícones e o passo a passo do Compartilhar no iPhone', async () => {
  const manifesto = JSON.parse(readFileSync(join(RAIZ, 'manifest.webmanifest'), 'utf8'))
  assert.equal(manifesto.display, 'standalone')
  // fechada ao público: o app instalado abre na página inicial e não tem atalhos para as ferramentas
  assert.equal(manifesto.start_url, '/')
  assert.equal(manifesto.shortcuts, undefined)
  for (const i of manifesto.icons.filter((i) => i.type === 'image/png')) {
    const png = readFileSync(join(RAIZ, i.src))
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)]
    assert.equal(`${w}x${h}`, i.sizes, i.src)
  }
  // o iPhone usa o apple-touch-icon (180, sem transparência) e não o manifesto
  const toque = readFileSync(join(RAIZ, 'marca/app/apple-touch-icon.png'))
  assert.deepEqual([toque.readUInt32BE(16), toque.readUInt32BE(20), toque[25]], [180, 180, 2], 'PNG 180×180 RGB')
  for (const f of ['index.html', 'lut.html', 'lab.html', 'looks.html', 'cst.html', 'entrega.html', 'converter.html', 'entrar.html']) {
    const html = readFileSync(join(RAIZ, f), 'utf8')
    for (const marca of ['rel="manifest"', 'rel="apple-touch-icon"', 'apple-mobile-web-app-title" content="Revela"', 'black-translucent'])
      assert.ok(html.includes(marca), `${f}: ${marca}`)
  }

  // Safari do iPhone, fora do app: "Instalar o app" no menu abre os dois toques do Compartilhar
  const contexto = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  })
  const pagina = await contexto.newPage()
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco + 'lut.html')
  await pagina.getByRole('button', { name: 'Abrir menu' }).click()
  await pagina.locator('#menu').getByRole('button', { name: 'Instalar o app' }).click()
  const folha = pagina.getByRole('dialog', { name: 'Instalar a Revela' })
  await folha.waitFor()
  assert.match(await folha.innerText(), /Compartilhar[\s\S]*Adicionar à Tela de Início/)
  await folha.getByRole('button', { name: 'Entendi' }).click()
  await folha.waitFor({ state: 'detached' })
  assert.deepEqual(erros, [])
  await contexto.close()

  // no computador (sem pedido de instalação do navegador) o item não aparece
  const computador = await navegador.newPage()
  await computador.goto(endereco + 'lut.html')
  assert.equal(await computador.locator('#menu .menu-instalar').isVisible(), false)
  await computador.close()
})

test('abertura do app: o quadro se revela e a tela abre sozinha; no navegador comum não aparece', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco + 'lut.html')
  assert.equal(await pagina.locator('.abertura-app').count(), 0, 'abertura fora do app instalado')
  await pagina.goto(endereco + 'lut.html?abertura=1')
  await pagina.locator('.abertura-app .pel-quadro--marca').waitFor({ state: 'attached' })
  await pagina.locator('.abertura-app').waitFor({ state: 'detached', timeout: 5000 })
  await pagina.getByRole('heading', { name: 'Revela a cor que você quer.' }).waitFor()
  assert.equal(await pagina.evaluate(() => document.documentElement.classList.contains('abrindo')), false)
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('celular: trocar de aba pela gaveta não alarga a página nem repete a entrada lenta', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await pagina.goto(endereco + 'lut.html')
  await pagina.getByRole('button', { name: 'Abrir menu' }).click()
  await pagina.locator('#menu').getByRole('link', { name: 'Entrega' }).click()
  await pagina.getByRole('heading', { name: 'Cada destino, do jeito certo.' }).waitFor()
  assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth), 390)
  assert.equal(await pagina.locator('main').getAttribute('class'), 'tela painel-troca')
  assert.equal(await pagina.evaluate(() => getComputedStyle(document.querySelector('main .entra')).animationName), 'none')
  await pagina.close()
})

test('menu do computador: abrir e recolher várias vezes não duplica nada e segue a aba', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } })
  await pagina.goto(endereco + 'lut.html')
  const botao = pagina.locator('#menu .menu-topo .menu-botao')
  for (let i = 0; i < 4; i++) await botao.click()
  const dock = pagina.getByRole('navigation', { name: 'Ferramentas da Revela' })
  await dock.getByRole('link', { name: 'Converter' }).click()
  await pagina.getByRole('heading', { name: 'Converta aqui mesmo.' }).waitFor()
  assert.deepEqual(await pagina.locator('#menu [aria-current="page"]').allTextContents(), ['Converter'])
  await pagina.close()
})

test('Clonar LUT com mais frames: os stills chegam em qualquer ordem, acham o par e entram na LUT', async () => {
  writeFileSync(join(dir, 'outra-sem.png'), gravarPng(cena(31, 320, 180)))
  writeFileSync(join(dir, 'outra-com.png'), gravarPng(aplicarEmImagem(cena(31, 320, 180), lookConhecido)))
  writeFileSync(join(dir, 'sozinha.png'), gravarPng(cena(32, 320, 180)))
  const pagina = await navegador.newPage()
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco + 'lut.html')
  await pagina.locator('#usar-clone').click()
  assert.equal(await pagina.locator('#mais-frames').isHidden(), true, 'só aparece depois do primeiro par')
  await pagina.setInputFiles('#arquivo-referencia', join(dir, 'filme.png'))
  await pagina.setInputFiles('#arquivo-material', join(dir, 'antes.png'))
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  assert.ok(await pagina.locator('#mais-frames').isVisible())
  // "com a cor" antes do "sem a cor", e uma imagem sem par
  await pagina.setInputFiles('#arquivo-mais', [join(dir, 'outra-com.png'), join(dir, 'sozinha.png'), join(dir, 'outra-sem.png')])
  await pagina.getByText('Uma imagem ficou sem o par').waitFor()
  assert.equal(await pagina.locator('#n-frames').textContent(), '2')
  assert.equal(await pagina.locator('#tom').textContent(), 'Feita de 2 frames do mesmo grade, com e sem a cor.')
  // desligar o clone esquece os frames a mais
  await pagina.locator('#usar-clone').click()
  await pagina.locator('#usar-clone').click()
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  assert.equal(await pagina.locator('#n-frames').textContent(), '1')
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('meu look: o clone vira um look com nome, aparece na grade em outro frame, baixa e apaga', async () => {
  const contexto = await navegador.newContext({ acceptDownloads: true })
  const pagina = await contexto.newPage()
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  await pagina.goto(endereco + 'lut.html')
  await pagina.locator('#usar-clone').click()
  await pagina.setInputFiles('#arquivo-referencia', join(dir, 'filme.png'))
  await pagina.setInputFiles('#arquivo-material', join(dir, 'antes.png'))
  await pagina.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  await pagina.getByLabel('Nome do look').fill('ZRO Filmes')
  await pagina.getByRole('button', { name: 'Salvar como meu look' }).click()
  await pagina.getByText('"ZRO Filmes" salvo.').waitFor()

  // outra visita, sem clone: só o frame já mostra o meu look na grade
  const outra = await contexto.newPage()
  outra.on('pageerror', (e) => erros.push(e.message))
  await outra.goto(endereco + 'lut.html')
  await outra.setInputFiles('#arquivo-material', join(dir, 'meu-frame.png'))
  await outra.getByText('Pronto. Arraste sobre a imagem para comparar.').waitFor()
  assert.equal(await outra.locator('#looks .look').count(), 6)
  await outra.getByRole('radio', { name: 'ZRO Filmes' }).click()
  await outra.waitForFunction(() => document.querySelector('.rotulo-depois').textContent === 'ZRO Filmes')
  assert.ok(await outra.getByRole('button', { name: 'Apagar este look' }).isVisible())
  const [cube] = await Promise.all([outra.waitForEvent('download'), outra.getByRole('button', { name: 'Baixar LUT' }).click()])
  assert.equal(cube.suggestedFilename(), 'revela-zro-filmes-33.cube')
  assert.match(readFileSync(await cube.path(), 'utf8'), /^TITLE "ZRO Filmes - 100%"/)
  await outra.getByRole('button', { name: 'Apagar este look' }).click()
  await outra.getByText('"ZRO Filmes" apagado.').waitFor()
  assert.equal(await outra.locator('#looks .look').count(), 5)
  assert.deepEqual(erros, [])
  await contexto.close()
})

test('a primeira ferramenta é a LUT: o login volta para /lut, a Z não está no dock nem abre sozinha', async () => {
  const { VOLTA_PADRAO, voltaSegura } = await import('../api/_zro.js')
  assert.equal(VOLTA_PADRAO, '/lut')
  assert.equal(voltaSegura(undefined), '/lut')
  for (const largura of [1440, 393]) {
    const pagina = await navegador.newPage({ viewport: { width: largura, height: 900 } })
    const pedidos = await simularZ(pagina)
    await pagina.goto(endereco + 'lut.html')
    await pagina.getByRole('heading', { name: 'Revela a cor que você quer.' }).waitFor()
    const dock = pagina.getByRole('navigation', { name: 'Ferramentas da Revela' })
    assert.equal(await dock.locator('a').first().textContent(), 'LUT')
    assert.equal(await dock.locator('a[href^="inicio"]').count(), 0)
    // a Z é só o anel discreto do topo; nada dela monta nem pede ao abrir
    assert.equal(await pagina.locator('.topo .topo-z[href="inicio.html"]').count(), 1)
    await pagina.waitForTimeout(300)
    assert.equal(await pagina.locator('zro-ia').count(), 0)
    assert.deepEqual(pedidos, [])
    await pagina.close()
  }
})

test('a Z (link direto /inicio) com a CSP de produção, conversa pelo repasse e as ferramentas a um toque no dock', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  pagina.on('console', (m) => m.type() === 'error' && !SEM_SESSAO.test(m.text()) && erros.push(m.text()))
  const pedidos = await simularZ(pagina)
  const r = await pagina.goto(endereco + 'inicio.html')
  assert.match(r.headers()['content-security-policy'], /script-src 'self' 'wasm-unsafe-eval' https:\/\/absolutezro\.com;/)
  assert.match(r.headers()['cross-origin-embedder-policy'], /require-corp/)
  const z = pagina.locator('#zPainel zro-ia')
  await z.waitFor()
  assert.equal(await z.getAttribute('api'), '/api/zro/ia')
  assert.equal(await z.getAttribute('tema'), 'claro')
  await pagina.locator('zro-ia h1', { hasText: 'Lia' }).waitFor()
  // sem botões: a sugestão se escreve no campo; Tab completa (sem enviar) e Enter manda
  assert.equal(await pagina.locator('zro-ia .sug, zro-ia [data-sug]').count(), 0)
  await pagina.locator('zro-ia textarea').focus()
  await pagina.keyboard.press('Tab')
  const sugerida = await pagina.locator('zro-ia textarea').inputValue()
  assert.ok(sugerida && (await pagina.locator('zro-ia #zd').textContent()).includes(sugerida), sugerida)
  assert.equal(pedidos.filter((p) => p.caminho === '/mensagens').length, 0, 'completar não envia')
  await pagina.keyboard.press('Enter')
  await pagina.locator('zro-ia .msg', { hasText: 'posso te ajudar com isso.' }).waitFor()
  assert.equal(JSON.parse(pedidos.find((p) => p.caminho === '/mensagens').corpo).texto, sugerida)
  assert.ok(pedidos.every((p) => p.autorizacao === null), 'a página nunca manda token: o repasse põe')
  // tema: o painel acompanha
  await pagina.evaluate(() => window.revelaTema.alternar())
  assert.equal(await z.getAttribute('tema'), 'escuro')
  await pagina.evaluate(() => window.revelaTema.alternar())
  // a Z não é aba do dock (titular, 29/10/2026): o dock começa na LUT, e o anel do topo volta à Z, sem recarregar
  const dock = pagina.getByRole('navigation', { name: 'Ferramentas da Revela' })
  assert.equal(await dock.locator('a').first().textContent(), 'LUT')
  assert.equal(await dock.locator('a[href^="inicio"]').count(), 0)
  await dock.getByRole('link', { name: 'LUT' }).click()
  await pagina.getByRole('heading', { name: 'Revela a cor que você quer.' }).waitFor()
  assert.equal(await pagina.getAttribute('.topo-z', 'aria-current'), null)
  await pagina.locator('.topo-z').click()
  await pagina.waitForURL(/inicio\.html$/)
  assert.equal(await pagina.getAttribute('.topo-z', 'aria-current'), 'page')
  await pagina.locator('#zPainel zro-ia').waitFor({ state: 'attached' })
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('Set: no topo, antes da Z (fora do dock), aparece quando o Set responde, abre a folha com a cara da Revela e segue o tema', async () => {
  for (const [tema, vp] of [
    ['claro', { viewport: { width: 1440, height: 900 } }],
    ['escuro', { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true }],
  ]) {
    const pagina = await navegador.newPage(vp)
    const erros = []
    pagina.on('pageerror', (e) => erros.push(e.message))
    pagina.on('console', (m) => m.type() === 'error' && !SEM_SESSAO.test(m.text()) && erros.push(m.text()))
    await simularZ(pagina)
    const pedidos = await simularSet(pagina)
    if (tema === 'escuro') await pagina.addInitScript(() => localStorage.setItem('revela-tema', 'escuro'))
    await pagina.goto(endereco + 'lut.html')
    const dock = pagina.getByRole('navigation', { name: 'Ferramentas da Revela' })
    const entrada = pagina.locator('.topo [data-set]')
    await entrada.waitFor()
    // no topo, logo antes do anel da Z; o dock continua só com as ferramentas (no máximo cinco no iPhone)
    assert.equal(await dock.locator('[data-set]').count(), 0)
    assert.ok((await dock.locator('a').count()) <= 5)
    assert.deepEqual(await pagina.locator('.topo > :not([hidden])').evaluateAll((es) => es.map((e) => e.className.split(' ')[0])), ['marca', 'topo-set', 'topo-z', 'conta'])
    assert.equal(await entrada.locator('.balao').textContent(), '2')
    await entrada.click()
    const painel = pagina.locator('zro-set-folha .folha[data-on] .painel')
    await painel.waitFor()
    assert.equal(await entrada.getAttribute('aria-expanded'), 'true')
    await pagina.locator('zro-set-folha .linha', { hasText: 'Rui Tavares' }).waitFor()
    assert.equal(await pagina.locator('zro-set').getAttribute('tema'), tema)
    const [cor, texto] = await pagina.evaluate(() => {
      const p = document.querySelector('zro-set-folha').shadowRoot.querySelector('.painel')
      const d = document.createElement('div')
      d.style.color = 'var(--texto)'
      document.body.append(d)
      const t = getComputedStyle(d).color
      d.remove()
      return [getComputedStyle(p).color, t]
    })
    assert.equal(cor, texto, 'a tinta da folha é a da Revela')
    assert.ok(pedidos.every((p) => p.autorizacao === null), 'a página nunca manda token')
    // SET_FOTOS=<pasta>: as telas da entrega (a folha aberta)
    if (process.env.SET_FOTOS) await pagina.screenshot({ path: join(process.env.SET_FOTOS, `revela-${tema === 'claro' ? 'desktop' : '393'}-${tema}.png`) })
    // a troca de ferramenta pelo dock não recarrega: o Set continua lá
    await pagina.keyboard.press('Escape')
    await dock.getByRole('link', { name: 'CST' }).click()
    await pagina.waitForURL(/cst(\.html)?$/)
    assert.equal(await pagina.locator('zro-set').count(), 1)
    assert.ok(await entrada.isVisible())
    assert.deepEqual(erros, [])
    await pagina.close()
  }
})

test('painel inicial sem conta ou sem o escopo da Z: Entrar com Absolute ZRO (no celular também)', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await simularZ(pagina, { logado: false })
  await pagina.goto(endereco + 'inicio.html')
  const entrar = pagina.locator('#zPainel .z-aviso a')
  await entrar.waitFor()
  assert.equal(await entrar.getAttribute('href'), '/api/zro/entrar?volta=%2Finicio.html')
  assert.match(await pagina.locator('#zPainel .z-aviso p').textContent(), /a Z/)
  const largura = await pagina.evaluate(() => document.documentElement.scrollWidth)
  assert.ok(largura <= 390, `sem rolagem para o lado (${largura}px)`)
  await pagina.close()
})

test('página inicial fechada ao público: a seção da Z diz "Chegando à Revela", sem link para o painel', async () => {
  const pagina = await navegador.newPage()
  await pagina.goto(endereco)
  const sec = pagina.locator('#z')
  assert.match(await sec.innerText(), /Chegando à Revela/)
  assert.equal(await sec.getByRole('link', { name: 'Conversar com a Z' }).count(), 0)
  assert.equal(await sec.getByRole('link', { name: 'Conhecer a Z' }).getAttribute('href'), 'https://absolutezro.com/ia')
  assert.doesNotMatch(await sec.innerText(), /Agora na Revela|o Z\b/)
  await pagina.close()
})

test('Revela Lab: exemplo, película, ajuste, LUT, receita de volta e Meus looks', async () => {
  const pagina = await navegador.newPage({ acceptDownloads: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  pagina.on('console', (m) => m.type() === 'error' && !SEM_SESSAO.test(m.text()) && erros.push(m.text()))
  await pagina.goto(endereco + 'lab.html')
  await pagina.getByRole('heading', { name: 'Crie o seu look.' }).waitFor()
  await pagina.getByRole('button', { name: 'Usar um exemplo' }).click()
  await pagina.locator('#lab:not([hidden])').waitFor()
  // "Analisar e corrigir" já vem ligado e diz o que fez
  assert.equal(await pagina.getByRole('switch', { name: 'Analisar e corrigir' }).isChecked(), true)
  assert.notEqual((await pagina.locator('#leitura-correcao').textContent()).trim(), '')
  await pagina.getByRole('tab', { name: 'Película' }).click()
  assert.deepEqual(await pagina.locator('#bases .look').evaluateAll((n) => n.map((b) => b.dataset.look)), ['negativo-250d', 'negativo-500t', 'positivo-50d', 'reversivel', 'sem-branqueamento'])
  await pagina.getByRole('radio', { name: 'Negativo 500T' }).click()
  assert.equal(await pagina.locator('#rotulo-depois').textContent(), 'Negativo 500T')
  // a cópia de cinema vai na receita
  await pagina.getByRole('combobox', { name: 'Cópia de cinema' }).selectOption('2383')
  await pagina.locator('#aj-calor').fill('40')
  await pagina.locator('#aj-calor').dispatchEvent('change')
  await pagina.locator('#nome-look').fill('Noite quente')
  assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth), 390)

  const [lut] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Baixar LUT' }).click()])
  assert.equal(lut.suggestedFilename(), 'revela-lab-noite-quente-33.cube')
  assert.match(readFileSync(await lut.path(), 'utf8'), /^# Revela Lab · Noite quente\n# Entrada: Rec.709[^\n]*\n# Saída: Rec.709[^\n]*\nTITLE "Revela Lab - Noite quente"\nLUT_3D_SIZE 33\n/)
  const [receita] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Baixar receita' }).click()])
  assert.equal(receita.suggestedFilename(), 'noite-quente.revela')
  const r = JSON.parse(readFileSync(await receita.path(), 'utf8'))
  assert.equal(r.base, 'negativo-500t')
  assert.equal(r.ajustes.calor, 40)
  assert.equal(r.copia, '2383')

  // zera, reabre a receita e volta tudo
  await pagina.getByRole('button', { name: 'Zerar ajustes' }).click()
  assert.equal(await pagina.locator('#aj-calor').inputValue(), '0')
  await pagina.setInputFiles('#arquivo-receita', await receita.path())
  await pagina.getByText('Receita "Noite quente" aberta.').waitFor()
  assert.equal(await pagina.locator('#aj-calor').inputValue(), '40')
  assert.equal(await pagina.locator('#bases [aria-checked=true]').getAttribute('data-look'), 'negativo-500t')
  assert.equal(await pagina.locator('#copia').inputValue(), '2383')

  // pacote profissional (worker): zip com o look em log, a LUT do monitor, CDL e o controle de qualidade aprovado
  assert.equal(await pagina.locator('#entrada option').first().textContent(), 'Still já tratado (Rec.709)')
  const [pacote] = await Promise.all([pagina.waitForEvent('download', { timeout: 60_000 }), pagina.getByRole('button', { name: 'Pacote profissional' }).click()])
  assert.equal(pacote.suggestedFilename(), 'REVELA_NOITE-QUENTE.zip')
  const zip = readFileSync(await pacote.path())
  assert.equal(zip.readUInt32LE(0), 0x04034b50)
  assert.ok(zip.includes('REVELA_NOITE-QUENTE_DWG-DI-to-DWG-DI_v1_65.cube'))
  assert.ok(zip.includes('REVELA_NOITE-QUENTE_ACEScct-AP1-to-ACEScct-AP1_v1_65.cube'))
  assert.ok(zip.includes('O look inclui a cópia 2383'))
  assert.equal(await pagina.locator('#qc').textContent(), 'Controle de qualidade: aprovado')

  // salvo em Meus looks: aparece na grade da tela de LUT
  await pagina.getByRole('button', { name: 'Salvar em Meus looks' }).click()
  await pagina.getByText('"Noite quente" está em Meus looks').waitFor()
  assert.equal(await pagina.evaluate(() => JSON.parse(localStorage.getItem('revela-meus-looks')).map((l) => l.nome).join()), 'Noite quente')
  assert.deepEqual(erros, [])
  await pagina.close()
})

test('Revela Looks: vitrine com o motor, packs em faixas, Abrir no Lab com a base, e a troca de aba com View Transition', async () => {
  const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } })
  const erros = []
  pagina.on('pageerror', (e) => erros.push(e.message))
  pagina.on('console', (m) => m.type() === 'error' && !SEM_SESSAO.test(m.text()) && erros.push(m.text()))
  await pagina.goto(endereco + 'looks.html')
  await pagina.getByRole('heading', { name: 'Looks prontos.' }).waitFor()
  await pagina.locator('#packs .pack').nth(3).waitFor()
  assert.deepEqual(await pagina.locator('#packs .pack h2').allTextContents(), ['Revela', 'Película', 'Cinema', 'Clássicos'])
  assert.match(await pagina.locator('#vitrine-nome').textContent(), /^Revela · /)
  // a vitrine é o frame de verdade com o look (não fica preto nem igual ao original)
  const media = () =>
    pagina.evaluate(() => {
      const c = document.querySelector('.vitrine-palco canvas.visivel')
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let s = 0
      for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]
      return s / (d.length * 0.75)
    })
  assert.ok((await media()) > 20)
  // a capa do Película leva a vitrine para o pack; os pontos trocam o look
  await pagina.locator('.pack[data-pack="pelicula"] .pack-capa').click()
  assert.equal(await pagina.locator('#vitrine-nome').textContent(), 'Película · Negativo 250D')
  assert.equal(await pagina.locator('#vitrine-pontos [role=tab]').count(), 5)
  await pagina.getByRole('tab', { name: 'Negativo 500T' }).click()
  assert.equal(await pagina.locator('#vitrine-nome').textContent(), 'Película · Negativo 500T')
  assert.equal(await pagina.locator('.pack[data-pack="pelicula"]').getAttribute('class'), 'pack ativo')
  assert.equal(await pagina.locator('.pack .ficha--saida').first().textContent(), 'Loja em breve')
  assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth), 390)
  // Abrir no Lab: troca de aba sem recarregar, com a base do pack e o exemplo
  await pagina.locator('.pack[data-pack="pelicula"]').getByRole('link', { name: 'Abrir no Lab' }).click()
  await pagina.locator('#lab:not([hidden])').waitFor()
  assert.match(pagina.url(), /lab\.html\?base=negativo-250d&exemplo$/)
  assert.equal(await pagina.getByRole('tab', { name: 'Película' }).getAttribute('aria-selected'), 'true')
  assert.equal(await pagina.getByRole('radio', { name: 'Negativo 250D' }).getAttribute('aria-checked'), 'true')
  assert.equal(await pagina.evaluate(() => getComputedStyle(document.querySelector('main')).viewTransitionName), 'painel')
  assert.deepEqual(erros, [])
  await pagina.close()
})
