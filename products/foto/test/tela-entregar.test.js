// A tela Entregar no Chromium, com o app de verdade (publicar.mjs + scripts/servir.mjs, cabeçalhos do vercel.json, modo
// local) e, para a galeria, Postgres temporário e a pasta local de prévias (FOTO_ARQUIVOS_DIR).
//
//   1. exportar 20 fotos (19 JPEG de 2400 px e um DNG) em .zip com a predefinição Instagram e um estilo de preto e
//      branco: pausar e retomar no meio, tamanhos e perfil ICC conferidos em cada arquivo, nomes sem colisão, a foto
//      quebrada falha com motivo, "Repetir" não refaz as prontas e o lote seguinte pula as que já saíram;
//   2. exportar para uma pasta que já tem um arquivo com o mesmo nome: nada é sobrescrito (-2);
//   3. criar e publicar uma galeria pela tela, o cliente escolher e comentar pela página pública (/g/<token>) e a
//      seleção voltar ao catálogo como filtro, com o comentário e o pedido; "Tratar as escolhidas" leva ao lote;
//   4. sem armazenamento (503 sem_armazenamento), a linha certa e nada de publicar, na galeria e na busca por rosto;
//      com ele, a busca por rosto (app/rosto/painel.js) é a terceira ação, com "Novo evento";
//   5. 390 px sem rolar de lado, claro e escuro, sem erro de console nem violação de CSP.
// As imagens são desenhadas no próprio Chromium (faixas, um sol e um número: nenhuma foto de gente).
// FOTO_TELAS=<pasta> grava as capturas entregar-*.png.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import { abrirChromium, comExif, desenharJpegs, dngFabricado, horaDaFoto, semChromium, vigiar } from './apoio-tela.js'
import { semPostgres, subirPostgres } from './banco-apoio.js'
import { extrairDoJpeg } from '../src/exportar/jpeg.js'
import { espacoDoPerfil } from '../src/exportar/icc.js'

const EXIGIR = process.env.FOTO_EXIGIR === '1'
const TELAS = (process.env.FOTO_TELAS || '').trim()
const ESPERA = 240000
const semBanco = semChromium || semPostgres

let navegador, servidor, base, publico, pasta, pg, dono, banco
let fotos // { arquivos, quebrada }
const antes = { ...process.env }

// ───────────────────────────── apoio ─────────────────────────────

async function fabricar() {
  const paisagens = await desenharJpegs(navegador, { quantas: 18, largura: 2400, altura: 1600 })
  const [emPe] = await desenharJpegs(navegador, { quantas: 1, largura: 1600, altura: 2400, inicio: 19 })
  const [pequena] = await desenharJpegs(navegador, { quantas: 1, largura: 720, altura: 480, inicio: 20 })
  const arquivos = []
  paisagens.forEach((j, i) =>
    arquivos.push({ name: `IMG_${String(i + 1).padStart(4, '0')}.JPG`, mimeType: 'image/jpeg', buffer: comExif(j, { data: horaDaFoto(i) }) }),
  )
  arquivos.push({ name: 'IMG_0019.JPG', mimeType: 'image/jpeg', buffer: comExif(emPe, { data: horaDaFoto(18) }) })
  arquivos.push({ name: 'IMG_0020.DNG', mimeType: 'image/x-adobe-dng', buffer: dngFabricado(pequena, { largura: 720, altura: 480, data: horaDaFoto(19) }) })
  // a quebrada: começa como JPEG e o resto é ruído (nenhum decodificador abre)
  const ruido = Buffer.alloc(6000)
  for (let i = 0, x = 7; i < ruido.length; i++) ruido[i] = (x = (x * 1103515245 + 12345) >>> 0) >>> 24
  const quebrada = { name: 'IMG_0021.JPG', mimeType: 'image/jpeg', buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]), ruido]) }
  return { arquivos, quebrada }
}

async function abrir({ largura = 1440, altura = 900, tema = null, celular = false, antesDeAbrir } = {}) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: celular ? 2 : 1,
    hasTouch: celular,
    isMobile: celular,
    acceptDownloads: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  })
  await contexto.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  if (tema) await contexto.addCookies([{ name: 'foto_tema', value: tema, url: base }])
  contexto.setDefaultTimeout(ESPERA)
  if (antesDeAbrir) await antesDeAbrir(contexto)
  const pagina = await contexto.newPage()
  const olho = vigiar(pagina, base)
  await pagina.goto(`${base}/`)
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  return { contexto, pagina, olho }
}

async function carregar(pagina, arquivos) {
  await pagina.setInputFiles('input[data-escolher]', arquivos)
  await pagina.waitForFunction((n) => document.querySelector('.pilula[data-valor="todas"] .pilula-n')?.textContent.trim() === String(n), arquivos.length)
  await pagina.waitForSelector('.foto img')
  await naLoja(pagina, (l) => l.ocioso())
}

/** Roda uma função com a loja do app (o mesmo módulo que a tela usa). */
const naLoja = (pagina, f, arg) =>
  pagina.evaluate(async ({ codigo, arg }) => new Function('loja', 'arg', `return (${codigo})(loja, arg)`)((await import('/app/estado.js')).loja, arg), {
    codigo: f.toString(),
    arg,
  })

async function irParaEntregar(pagina) {
  await pagina.locator('.dock-aba[data-aba="entregar"]').click()
  await pagina.waitForSelector('.painel-aba[data-tela="entregar"]:not([hidden]) .entregar-cabeca h2')
  await pagina.waitForFunction(() => !document.documentElement.dataset.sentido)
}

async function captura(pagina, nome) {
  if (!TELAS) return
  mkdirSync(TELAS, { recursive: true })
  await pagina.evaluate(() => document.fonts.ready)
  await pagina.waitForTimeout(500)
  await pagina.screenshot({ path: join(TELAS, `entregar-${nome}.png`) })
}

const semRolarDeLado = async (pagina) => {
  const [largura, total] = await pagina.evaluate(() => [
    innerWidth,
    Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll('.tela')].map((t) => t.scrollWidth)),
  ])
  assert.ok(total <= largura, `rola de lado: ${total} > ${largura}`)
}

const limpo = (olho, permitir = []) => {
  const fora = (lista) => lista.filter((x) => !permitir.some((p) => p.test(x)))
  assert.deepEqual(
    { erros: fora(olho.erros), falhas: fora(olho.falhas), ruins: fora(olho.ruins), fora: olho.fora },
    { erros: [], falhas: [], ruins: [], fora: [] },
  )
}

/** As entradas de um .zip guardado (método 0): [{ nome, bytes }], conferindo o CRC-32 de cada uma. */
async function lerZip(buf) {
  const { crc32 } = await import('../src/exportar/png.js')
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let fim = buf.length - 22
  while (fim >= 0 && v.getUint32(fim, true) !== 0x06054b50) fim--
  assert.ok(fim >= 0, 'zip sem o fim do diretório')
  const total = v.getUint16(fim + 10, true)
  let p = v.getUint32(fim + 16, true)
  const saida = []
  for (let i = 0; i < total; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50)
    const metodo = v.getUint16(p + 10, true)
    const crc = v.getUint32(p + 16, true)
    const tamanho = v.getUint32(p + 24, true)
    const n = v.getUint16(p + 28, true)
    const extra = v.getUint16(p + 30, true)
    const comentario = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const nome = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + n))
    assert.equal(metodo, 0)
    assert.equal(v.getUint32(local, true), 0x04034b50)
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const bytes = buf.subarray(inicio, inicio + tamanho)
    assert.equal(crc32(bytes), crc, `CRC de ${nome}`)
    saida.push({ nome, bytes })
    p += 46 + n + extra + comentario
  }
  return saida
}

/** Largura e altura do SOF de um JPEG. */
function medidasDoJpeg(b) {
  let p = 2
  while (p < b.length) {
    const m = b[p + 1]
    const tam = (b[p + 2] << 8) | b[p + 3]
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { altura: (b[p + 5] << 8) | b[p + 6], largura: (b[p + 7] << 8) | b[p + 8] }
    p += 2 + tam
  }
  return null
}

/** Quanto de cor há num JPEG (decodificado pelo Chromium): o maior desvio médio entre os canais, de 0 a 255. */
async function corDe(pagina, bytes) {
  return pagina.evaluate(async (b64) => {
    const bin = atob(b64)
    const u8 = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const bmp = await createImageBitmap(new Blob([u8], { type: 'image/jpeg' }))
    const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')
    c.drawImage(bmp, 0, 0)
    const d = c.getImageData(0, 0, bmp.width, bmp.height).data
    let soma = 0
    for (let i = 0; i < d.length; i += 4) soma += Math.max(Math.abs(d[i] - d[i + 1]), Math.abs(d[i + 1] - d[i + 2]), Math.abs(d[i] - d[i + 2]))
    return soma / (d.length / 4)
  }, Buffer.from(bytes).toString('base64'))
}

// ───────────────────────────── preparo ─────────────────────────────

before(async () => {
  if (semChromium) return
  for (const v of [
    'ZRO_CLIENT_ID',
    'ZRO_CLIENT_SECRET',
    'FOTO_SITE',
    'FOTO_S3_ENDPOINT',
    'FOTO_S3_BUCKET',
    'FOTO_S3_KEY_ID',
    'FOTO_S3_SECRET',
    'VERCEL',
    'FOTO_DATABASE_URL',
  ])
    delete process.env[v]
  process.env.FOTO_LOCAL = '1'
  if (!semPostgres) {
    pg = await subirPostgres()
    const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
    await admin.unsafe(
      `create role foto login password 'teste'; create role foto_app nologin; grant foto_app to foto with admin option; create schema foto authorization foto;`,
    )
    await admin.end()
    const urlFoto = pg.url.replace('postgres://postgres@', 'postgres://foto:teste@')
    await (await import('../scripts/migrar.mjs')).migrar(urlFoto)
    process.env.FOTO_DATABASE_URL = urlFoto
    pasta = mkdtempSync(join(tmpdir(), 'foto-arquivos-'))
    process.env.FOTO_ARQUIVOS_DIR = pasta
    dono = postgres(urlFoto, { max: 2, onnotice: () => {} })
    banco = await import('../api/_banco.js')
  }
  publico = mkdtempSync(join(tmpdir(), 'foto-entregar-'))
  await (await import('../publicar.mjs')).publicar({ saida: publico, baixarModelos: false })
  servidor = await (await import('../scripts/servir.mjs')).servir({ porta: 0, publico })
  base = `http://127.0.0.1:${servidor.address().port}`
  navegador = await abrirChromium()
  fotos = await fabricar()
})

after(async () => {
  await navegador?.close()
  await new Promise((ok) => (servidor ? servidor.close(ok) : ok()))
  await dono?.end({ timeout: 5 })
  await banco?.fecharBanco()
  await pg?.fechar()
  for (const dir of [publico, pasta]) if (dir) rmSync(dir, { recursive: true, force: true })
  for (const k of ['FOTO_LOCAL', 'FOTO_DATABASE_URL', 'FOTO_ARQUIVOS_DIR']) {
    if (antes[k] === undefined) delete process.env[k]
    else process.env[k] = antes[k]
  }
})

// ───────────────────────────── 0. o QR próprio ─────────────────────────────

test('o QR da galeria bate módulo a módulo com o gerador de referência (Kazuhiko Arase, o do RADION)', async (t) => {
  const { qrMatriz, qrSvg } = await import('../app/componentes/qr.js')
  let referencia
  try {
    referencia = (await import('../../radio/app/vendor/qrcode.mjs')).qrcode
  } catch {
    return t.skip('sem products/radio neste checkout')
  }
  const enderecos = [
    'a',
    `http://127.0.0.1:41234/g/${'W'.repeat(43)}`,
    `https://foto.absolutezro.com/g/${'Ab9_-'.repeat(8)}xyz`,
    'z'.repeat(120),
    'q'.repeat(200),
  ]
  for (const texto of enderecos) {
    const q = referencia(0, 'M')
    q.addData(texto, 'Byte')
    q.make()
    const n = q.getModuleCount()
    // a máscara que a referência escolheu, lida dos bits de formato (ISO 18004, 7.9)
    let formato = 0
    for (let i = 0; i < 15; i++) {
      const [r, c] = i < 6 ? [i, 8] : i < 8 ? [i + 1, 8] : [n - 15 + i, 8]
      if (q.isDark(r, c)) formato |= 1 << i
    }
    const mascara = ((formato ^ 0x5412) >> 10) & 7
    const nossa = qrMatriz(texto, { mascara })
    assert.equal(nossa.tamanho, n, texto)
    let diferentes = 0
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c) !== nossa.modulos[r][c]) diferentes++
    assert.equal(diferentes, 0, `${texto.length} bytes, máscara ${mascara}`)
  }
  assert.match(qrSvg('a'), /^<svg [^>]*viewBox="0 0 29 29"/)
  assert.throws(() => qrMatriz('x'.repeat(300)), /não cabem/)
})

test('Chromium e Postgres são exigidos no CI', { skip: !EXIGIR }, () => {
  assert.equal(semBanco, false, 'FOTO_EXIGIR=1 e falta Chromium ou Postgres')
})

// ───────────────────────────── 1. exportar em .zip ─────────────────────────────

test(
  'exportar 20 fotos em .zip: Instagram, estilo, pausar e retomar, ICC, nomes, falha com motivo, repetir sem refazer',
  { skip: semChromium, timeout: 1500000 },
  async () => {
    const { contexto, pagina, olho } = await abrir()
    try {
      await carregar(pagina, [...fotos.arquivos, fotos.quebrada])
      // as 21 escolhidas (a quebrada também: ela tem de falhar com motivo, não sumir)
      await naLoja(pagina, (l) =>
        l.catalogo.marcar(
          l.catalogo.fotos().map((f) => f.id),
          'escolhida',
        ),
      )
      await irParaEntregar(pagina)
      assert.equal(await pagina.locator('.entregar-cabeca h2').innerText(), 'Exportar em lote.')
      assert.equal(await pagina.locator('.exportar .pilula[data-valor="escolhidas"] .pilula-n').innerText(), '21')
      assert.equal(await pagina.locator('.resumo-numero .numero').innerText(), '21')
      // a saída em cartões e o estilo
      assert.deepEqual(await pagina.locator('.saida strong').allInnerTexts(), ['Entrega', 'Instagram', 'Prova do cliente', 'Impressão'])
      await pagina.locator('.saida', { hasText: 'Instagram' }).click()
      assert.equal(await pagina.locator('.saida--ativa strong').innerText(), 'Instagram')
      await pagina.locator('.exportar .segmentado button', { hasText: 'Um estilo' }).click()
      await pagina.waitForSelector('.estilo-config select:not([disabled])')
      const pb = await pagina.evaluate(() => [...document.querySelectorAll('.estilo-config optgroup[label="Preto e branco"] option')].map((o) => o.value)[0])
      assert.ok(pb, 'há estilo de preto e branco')
      await pagina.selectOption('.estilo-config select', pb)
      assert.match(await pagina.locator('.resumo-linhas').innerText(), /JPEG · sRGB · 2\.160 px/)
      await captura(pagina, 'exportar-1440-claro')
      // personalizar: as fichas montam o nome
      await pagina.locator('.personalizar summary').click()
      await pagina.waitForSelector('.campo--nome input')
      assert.equal(await pagina.locator('.exemplo').innerText(), 'Instagram/IMG_0001.jpg')
      await captura(pagina, 'personalizar-1440-claro')
      await pagina.locator('.personalizar summary').click()

      // ── exportar ──
      const t0 = Date.now()
      const baixou = pagina.waitForEvent('download', { timeout: 1200000 })
      await pagina.locator('[data-exportar]').click()
      await pagina.waitForSelector('.fila')
      // a correção por foto mede antes; depois a fila anda
      await pagina.waitForFunction(() => document.querySelectorAll('.fila-linha[data-estado="pronta"]').length >= 2, null, { timeout: 600000 })
      await pagina.locator('.fila-acoes button', { hasText: 'Pausar' }).click()
      await pagina.waitForFunction(() => document.querySelectorAll('.fila-linha[data-estado="tratando"]').length === 0, null, { timeout: 300000 })
      const pausadas = await pagina.locator('.fila-linha[data-estado="pronta"]').count()
      assert.match(await pagina.locator('.fila-titulo h3').innerText(), /^Pausada em/)
      await pagina.waitForTimeout(2500)
      assert.equal(await pagina.locator('.fila-linha[data-estado="pronta"]').count(), pausadas, 'pausada, nenhuma foto nova começa')
      assert.equal(await pagina.locator('.fila-linha[data-estado="tratando"]').count(), 0)
      await captura(pagina, 'fila-pausada-1440-claro')
      await pagina.locator('.fila-acoes button', { hasText: 'Retomar' }).click()
      await pagina.waitForFunction(() => document.querySelectorAll('.fila-linha[data-estado="tratando"]').length > 0)
      // estimativa honesta: só depois de três medidas
      await pagina.waitForFunction(() => /^Falta /.test(document.querySelector('.fila-apoio')?.innerText ?? ''), null, { timeout: 300000 })
      await captura(pagina, 'fila-1440-claro')
      const download = await baixou
      const ms = Date.now() - t0
      console.log(`# exportar 20 fotos (2400 px, Instagram + estilo) em ${(ms / 1000).toFixed(1)} s, com a pausa de ~3 s`)
      const zip = readFileSync(await download.path())
      assert.match(download.suggestedFilename(), /Instagram\.zip$/)
      await pagina.waitForSelector('.fila[data-fase="fim"]')
      assert.equal(await pagina.locator('.fila-titulo h3').innerText(), 'Quase. 1 não saiu.')
      const falha = pagina.locator('.fila-linha[data-estado="falhou"]')
      assert.equal(await falha.count(), 1)
      assert.match(await falha.locator('.fila-nome').innerText(), /IMG_0021/)
      assert.ok((await falha.locator('.fila-estado').innerText()).length > 3, 'a falha tem motivo')
      await captura(pagina, 'fila-fim-1440-claro')

      // ── o .zip ──
      const entradas = await lerZip(zip)
      assert.equal(entradas.length, 20)
      const nomes = entradas.map((e) => e.nome)
      assert.equal(new Set(nomes.map((n) => n.toLowerCase())).size, 20, 'nomes sem colisão')
      for (let i = 1; i <= 20; i++) assert.ok(nomes.includes(`Instagram/IMG_${String(i).padStart(4, '0')}.jpg`), `falta IMG_${i}`)
      for (const e of entradas) {
        const m = medidasDoJpeg(e.bytes)
        const icc = extrairDoJpeg(e.bytes).icc
        assert.equal(espacoDoPerfil(icc), 'srgb', `${e.nome}: perfil sRGB`)
        if (e.nome.endsWith('0019.jpg')) assert.deepEqual(m, { largura: 1440, altura: 2160 })
        else if (e.nome.endsWith('0020.jpg')) assert.ok(Math.max(m.largura, m.altura) <= 2160)
        else assert.deepEqual(m, { largura: 2160, altura: 1440 }, e.nome)
        assert.equal(extrairDoJpeg(e.bytes).xmp === null || !/GPS/.test(extrairDoJpeg(e.bytes).xmp), true)
      }
      // o estilo de preto e branco foi aplicado: quase nada de cor (as originais são faixas coloridas)
      const cor = await corDe(pagina, entradas.find((e) => e.nome.endsWith('0005.jpg')).bytes)
      assert.ok(cor < 3, `ainda tem cor: ${cor}`)

      // ── repetir só a que falhou: as prontas não são refeitas ──
      await pagina.locator('.fila-acoes button', { hasText: 'Repetir 1' }).click()
      await pagina.waitForFunction(() => document.querySelector('.fila-linha[data-estado="falhou"]')?.dataset.tentativas === '2')
      await pagina.waitForSelector('.fila[data-fase="fim"]')
      assert.equal(await pagina.locator('.fila-linha[data-estado="pronta"]').count(), 20)
      // cada pronta foi feita uma vez só; só a quebrada foi tentada de novo
      assert.deepEqual(
        new Set(await pagina.locator('.fila-linha[data-estado="pronta"]').evaluateAll((l) => l.map((x) => x.dataset.tentativas))),
        new Set(['1']),
      )
      // ── o lote seguinte, com a mesma receita, pula as que já saíram ──
      await pagina.locator('.fila-acoes button', { hasText: 'Nova exportação' }).click()
      await pagina.waitForSelector('.resumo-feitas')
      assert.match(await pagina.locator('.resumo-feitas').first().innerText(), /^20 já saíram assim/)
      assert.equal(await pagina.locator('[data-exportar]').innerText(), 'Exportar 1 foto')
      await captura(pagina, 'ja-feitas-1440-claro')
      limpo(olho)
    } finally {
      await contexto.close()
    }
  },
)

// ───────────────────────────── 2. pasta: nada é sobrescrito ─────────────────────────────

test('exportar para uma pasta que já tem o nome: grava -2 e não toca no que estava lá', { skip: semChromium, timeout: 600000 }, async () => {
  // a pasta é o armazenamento privado da origem (OPFS): a mesma API de diretório do seletor do sistema, que o
  // Chromium automatizado não abre
  const { contexto, pagina, olho } = await abrir({
    antesDeAbrir: (c) =>
      c.addInitScript(() => {
        window.showDirectoryPicker = async () => {
          const raiz = await navigator.storage.getDirectory()
          return raiz.getDirectoryHandle('Clientes', { create: true })
        }
      }),
  })
  try {
    await carregar(pagina, fotos.arquivos.slice(0, 3))
    await pagina.evaluate(async () => {
      const raiz = await (await navigator.storage.getDirectory()).getDirectoryHandle('Clientes', { create: true })
      const entrega = await raiz.getDirectoryHandle('Entrega', { create: true })
      const w = await (await entrega.getFileHandle('IMG_0001.jpg', { create: true })).createWritable()
      await w.write('o que já estava aqui')
      await w.close()
    })
    await naLoja(pagina, (l) => {
      const ids = l.catalogo.fotos().map((f) => f.id)
      l.catalogo.estrelar(ids.slice(0, 2), 5)
    })
    await irParaEntregar(pagina)
    await pagina.locator('.exportar .pilula[data-valor="nota"]').click()
    await pagina.locator('.estrelas-minimo .pilula').nth(4).click()
    assert.equal(await pagina.locator('.resumo-numero .numero').innerText(), '2')
    await pagina.locator('.destino', { hasText: 'Uma pasta' }).click()
    await pagina.waitForSelector('.destino--ativo:has-text("Clientes")')
    await pagina.locator('[data-exportar]').click()
    await pagina.waitForSelector('.fila[data-fase="fim"]')
    assert.match(await pagina.locator('.fila-apoio').innerText(), /na pasta Clientes\/Entrega/)
    const naPasta = await pagina.evaluate(async () => {
      const entrega = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Clientes')).getDirectoryHandle('Entrega')
      const saida = {}
      for await (const [nome, h] of entrega.entries()) {
        const f = await h.getFile()
        saida[nome] = nome === 'IMG_0001.jpg' ? await f.text() : [...new Uint8Array(await f.arrayBuffer())]
      }
      return saida
    })
    assert.deepEqual(Object.keys(naPasta).sort(), ['IMG_0001-2.jpg', 'IMG_0001.jpg', 'IMG_0002.jpg'])
    assert.equal(naPasta['IMG_0001.jpg'], 'o que já estava aqui')
    const nova = Uint8Array.from(naPasta['IMG_0001-2.jpg'])
    assert.deepEqual(medidasDoJpeg(nova), { largura: 2400, altura: 1600 })
    assert.equal(espacoDoPerfil(extrairDoJpeg(nova).icc), 'p3')
    await captura(pagina, 'pasta-fim-1440-claro')
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

// ───────────────────────────── 3. galeria ─────────────────────────────

test('galeria: criar, publicar, o cliente escolher pelo link e a seleção voltar ao catálogo', { skip: semBanco, timeout: 1200000 }, async () => {
  const { contexto, pagina, olho } = await abrir()
  try {
    await carregar(pagina, fotos.arquivos.slice(0, 8))
    const ids = await naLoja(pagina, (l) => l.catalogo.fotos().map((f) => f.id))
    await naLoja(pagina, (l, ids) => l.catalogo.marcar(ids.slice(0, 6), 'escolhida'), ids)
    await irParaEntregar(pagina)
    await pagina.locator('.entregar-modo button', { hasText: 'Galeria do cliente' }).click()
    await pagina.waitForSelector('[data-criar]')
    assert.equal(await pagina.locator('.entregar-cabeca h2').innerText(), 'Galeria para o cliente.')
    assert.equal(await pagina.locator('.galeria-criar-numero .numero').innerText(), '6')
    await pagina.fill('input[name="nome"]', 'Ensaio da Serra')
    await pagina.fill('input[name="fotografo"]', 'Lia Fotografia')
    await pagina.fill('input[name="contratadas"]', '3')
    await pagina.fill('input[name="mensagem"]', 'Escolham com calma.')
    await captura(pagina, 'galeria-criar-1440-claro')
    await pagina.locator('[data-criar] button[type="submit"]').click()
    await pagina.waitForSelector('[data-envio]')
    await captura(pagina, 'galeria-enviando-1440-claro')
    // tudo enviado: publica sozinha e mostra o endereço uma vez, com o QR
    await pagina.waitForSelector('dialog.folha-link[open] [data-endereco]', { timeout: 600000 })
    const endereco = await pagina.locator('[data-endereco]').inputValue()
    assert.match(endereco, new RegExp(`^${base}/g/[A-Za-z0-9_-]{43}$`))
    assert.equal(await pagina.locator('.link-qr svg path').count(), 1)
    assert.match(await pagina.locator('.link-aviso').first().innerText(), /não fica guardado/)
    await pagina.locator('dialog.folha-link .vidro--tinta').click()
    assert.equal(await pagina.evaluate(() => navigator.clipboard.readText()), endereco)
    await captura(pagina, 'galeria-link-1440-claro')
    await pagina.locator('dialog.folha-link .folha-pe .vidro', { hasText: 'Fechar' }).click()
    await pagina.waitForSelector('.estado-galeria[data-estado="publicada"]')
    assert.equal(
      await pagina
        .locator('[data-rotulo-estado]')
        .innerText()
        .then((t) => t.toLowerCase()),
      'aberta',
    )
    // o endereço não ficou guardado em lugar nenhum da página
    assert.equal(await pagina.evaluate((e) => document.body.innerHTML.includes(e.split('/g/')[1]), endereco), false)

    // o servidor conferiu: 6 fotos, cada uma com prévia e miniatura, sem GPS, a melhor da pilha marcada
    const { galeria } = await (
      await fetch(`${base}/api/foto/galerias`, { headers: { cookie: (await contexto.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') } })
    )
      .json()
      .then((d) => ({ galeria: d.galerias[0] }))
    assert.deepEqual([galeria.fotos, galeria.enviadas, galeria.estado], [6, 6, 'publicada'])

    // ── o cliente, no celular ──
    const cliente = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    try {
      const p = await cliente.newPage()
      await p.goto(endereco)
      await p.waitForSelector('#galeria[data-fase="galeria"]')
      assert.equal(await p.locator('.grade .foto').count(), 6)
      // a prévia vem com a marca e sem metadados (o servidor recusaria GPS)
      const coracoes = p.locator('.grade .coracao')
      await coracoes.nth(0).tap()
      await coracoes.nth(2).tap()
      await p.waitForFunction(() => document.querySelector('.conta')?.innerText === '2 de 3')
      await p.locator('.grade .foto-abrir').first().tap()
      await p.waitForSelector('.visor')
      await p.locator('.visor-acoes .redondo').first().tap()
      await p.waitForSelector('.folha')
      await p.locator('.pedido', { hasText: 'Clarear' }).tap()
      await p.fill('.folha textarea', 'Mais luz no rosto.')
      await p.locator('.folha button[type=submit]').tap()
      await p.waitForSelector('.folha', { state: 'detached' })
      await p.locator('.visor-topo .redondo').tap()
      await p.waitForSelector('.visor', { state: 'detached' })
      await p.locator('.doca .vidro').tap()
      await p.waitForSelector('.revisar')
      await p.fill('#nome', 'Ana Cliente')
      await p.locator('.enviar button[type=submit]').tap()
      await p.waitForSelector('#galeria[data-fase="feito"]')
    } finally {
      await cliente.close()
    }

    // ── de volta à fotógrafa: a seleção volta ao catálogo ──
    await pagina.locator('.estado-acoes [aria-label="Atualizar"]').click()
    await pagina.waitForSelector('.estado-galeria[data-estado="concluida"]')
    assert.equal(
      await pagina
        .locator('[data-rotulo-estado]')
        .innerText()
        .then((t) => t.toLowerCase()),
      'concluída',
    )
    assert.equal(await pagina.locator('[data-contagem]').innerText(), '2 de 3')
    assert.equal(await pagina.locator('.pelo-cliente .pilula[data-valor="escolhidas"] .pilula-n').innerText(), '2')
    assert.equal(await pagina.locator('.pelo-cliente-foto').count(), 2)
    const noCatalogo = await naLoja(pagina, (l) =>
      l.catalogo
        .fotos()
        .filter((f) => f.cliente?.escolhida)
        .map((f) => ({ id: f.id, nome: f.nome, c: f.cliente.comentario, e: f.cliente.etiquetas })),
    )
    assert.equal(noCatalogo.length, 2)
    const comPedido = noCatalogo.find((f) => f.c)
    assert.deepEqual([comPedido.c, comPedido.e], ['Mais luz no rosto.', ['clarear']])
    assert.match(await pagina.locator('.pelo-cliente-comentario').first().innerText(), /Mais luz no rosto\./)
    assert.equal(await pagina.locator('.pelo-cliente-etiquetas .ficha').first().innerText(), 'Clarear')
    // copiar para o Lightroom: os nomes sem extensão, separados por vírgula
    await pagina.locator('[data-lightroom]').click()
    const lista = await pagina.evaluate(() => navigator.clipboard.readText())
    assert.deepEqual(lista.split(', ').sort(), noCatalogo.map((f) => f.nome.replace(/\.[^.]+$/, '')).sort())
    await captura(pagina, 'galeria-concluida-1440-claro')
    // tratar as escolhidas pelo cliente: o lote já chega com elas
    await pagina.locator('[data-tratar-cliente]').click()
    await pagina.waitForSelector('[data-painel="exportar"]:not([hidden]) .resumo')
    assert.equal(await pagina.locator('.exportar .pilula[data-valor="cliente"]').getAttribute('aria-pressed'), 'true')
    assert.equal(await pagina.locator('.resumo-numero .numero').innerText(), '2')
    // reabrir e encerrar pela tela
    await pagina.locator('.entregar-modo button', { hasText: 'Galeria do cliente' }).click()
    await pagina.locator('.estado-acoes .menu > button').click()
    await pagina.locator('.menu-item', { hasText: 'Reabrir' }).click()
    await pagina.waitForSelector('.estado-galeria[data-estado="reaberta"]')
    await pagina.locator('.estado-acoes .menu > button').click()
    await pagina.locator('.menu-item', { hasText: 'Encerrar' }).click()
    await pagina.locator('dialog.folha[open] .vidro--tinta').click()
    await pagina.waitForSelector('.estado-galeria[data-estado="encerrada"]')
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

// ───────────────────────────── 4. sem armazenamento ─────────────────────────────

test('sem armazenamento: a galeria mostra uma linha e não finge', { skip: semBanco, timeout: 300000 }, async () => {
  const guardado = process.env.FOTO_ARQUIVOS_DIR
  delete process.env.FOTO_ARQUIVOS_DIR
  const { contexto, pagina, olho } = await abrir({ largura: 390, altura: 844, celular: true })
  try {
    await carregar(pagina, fotos.arquivos.slice(0, 2))
    await irParaEntregar(pagina)
    await pagina.locator('.entregar-modo button', { hasText: 'Galeria do cliente' }).click()
    await pagina.waitForSelector('[data-fora]')
    assert.equal(await pagina.locator('[data-fora]').getAttribute('data-fora'), 'sem_armazenamento')
    assert.equal(await pagina.locator('[data-fora]').innerText(), 'A galeria precisa do armazenamento ligado no servidor.')
    assert.equal(await pagina.locator('[data-criar], [data-publicar]').count(), 0)
    await semRolarDeLado(pagina)
    await captura(pagina, 'galeria-sem-armazenamento-390-claro')
    // a busca por rosto: a mesma linha, sem "Novo evento"
    await pagina.locator('.entregar-modo button', { hasText: 'Busca por rosto' }).click()
    const fora = pagina.locator('[data-painel="evento"] [data-fora]')
    await fora.waitFor()
    assert.equal(await fora.getAttribute('data-fora'), 'sem_armazenamento')
    assert.equal(await fora.innerText(), 'A busca por rosto precisa do armazenamento ligado no servidor.')
    assert.equal(await pagina.locator('[data-painel="evento"] button', { hasText: 'Novo evento' }).count(), 0)
    assert.equal(await pagina.locator('.entregar-cabeca h2').innerText(), 'Busca por rosto.')
    await semRolarDeLado(pagina)
    await captura(pagina, 'evento-sem-armazenamento-390-claro')
    limpo(olho, [/503 \/api\/foto\/(galerias|eventos)/, /Failed to load resource.*503/])
  } finally {
    await contexto.close()
    process.env.FOTO_ARQUIVOS_DIR = guardado
  }
})

test('busca por rosto: a terceira ação da Entregar, uma ideia por vez', { skip: semBanco, timeout: 300000 }, async () => {
  const { contexto, pagina, olho } = await abrir()
  try {
    await carregar(pagina, fotos.arquivos.slice(0, 2))
    await irParaEntregar(pagina)
    const opcoes = await pagina.locator('.entregar-modo button').allInnerTexts()
    assert.deepEqual(opcoes, ['Exportar', 'Galeria do cliente', 'Busca por rosto'])
    // só monta quando visitada
    assert.equal(await pagina.locator('.rosto-painel').count(), 0)
    await pagina.locator('.entregar-modo button', { hasText: 'Busca por rosto' }).click()
    await pagina.locator('[data-painel="evento"] .rosto-vazio').waitFor()
    assert.equal(await pagina.locator('.entregar-cabeca h2').innerText(), 'Busca por rosto.')
    // o título é da tela: o painel não repete
    assert.equal(await pagina.locator('[data-painel="evento"] h3').count(), 0)
    assert.equal(await pagina.locator('[data-painel="evento"] .vidro--tinta', { hasText: 'Novo evento' }).count(), 1)
    assert.equal(await pagina.locator('[data-painel="exportar"]').isHidden(), true)
    // a escolha fica para a próxima visita à aba
    assert.equal(await naLoja(pagina, (l) => l.aba('entregar').modo), 'evento')
    await semRolarDeLado(pagina)
    await captura(pagina, 'evento-1440-claro')
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

// ───────────────────────────── 5. celular e temas ─────────────────────────────

for (const tema of ['claro', 'escuro']) {
  test(`390 px e 1440 px no tema ${tema}: sem rolar de lado, sem erro`, { skip: semChromium, timeout: 300000 }, async () => {
    for (const [largura, altura, celular] of [
      [390, 844, true],
      [1440, 900, false],
    ]) {
      const { contexto, pagina, olho } = await abrir({ largura, altura, celular, tema })
      try {
        await carregar(pagina, fotos.arquivos.slice(0, 6))
        await naLoja(pagina, (l) =>
          l.catalogo.marcar(
            l.catalogo
              .fotos()
              .slice(0, 4)
              .map((f) => f.id),
            'escolhida',
          ),
        )
        await irParaEntregar(pagina)
        assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), tema)
        if (celular) assert.equal(await pagina.locator('.linha-aviso', { hasText: 'coisa de computador' }).count(), 1)
        assert.equal(await pagina.locator('[data-exportar]').count(), 1, 'o botão continua para quem tem pasta')
        await semRolarDeLado(pagina)
        await captura(pagina, `exportar-${largura}-${tema}`)
        await pagina.locator('.personalizar summary').click()
        await pagina.locator('.bloco-marca .chave input').check()
        await pagina.waitForSelector('.marca-previa')
        await semRolarDeLado(pagina)
        if (celular) await pagina.locator('.bloco-marca').scrollIntoViewIfNeeded()
        await captura(pagina, `personalizar-${largura}-${tema}`)
        await pagina.locator('.entregar-modo button', { hasText: 'Galeria do cliente' }).click()
        await pagina.waitForSelector(semBanco ? '[data-fora], [data-criar]' : '[data-criar]')
        await semRolarDeLado(pagina)
        await captura(pagina, `galeria-${largura}-${tema}`)
        await pagina.locator('.entregar-modo button', { hasText: 'Busca por rosto' }).click()
        await pagina.waitForSelector(semBanco ? '[data-painel="evento"] [data-fora]' : '[data-painel="evento"] .rosto-vazio')
        await semRolarDeLado(pagina)
        await captura(pagina, `evento-${largura}-${tema}`)
        limpo(olho, semBanco ? [/\/api\/foto\/(galerias|eventos)/, /Failed to load resource/] : [])
      } finally {
        await contexto.close()
      }
    }
  })
}
