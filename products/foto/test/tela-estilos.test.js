// A tela Estilos no Chromium, pelo servidor local com os cabeçalhos de produção (vercel.json), em modo local
// (FOTO_LOCAL=1, sem banco: a conta não aparece e nada dá erro). As fotos são fabricadas (test/apoio-tela.js). Confere:
//   - a aba abre sem erro de console nem violação da CSP;
//   - a biblioteca mostra os 39 estilos da casa, cada um com a PRÓPRIA foto revelada (pixels diferentes entre estilos);
//   - passar o mouse mostra no palco sem aplicar; clicar aplica (ajustes e predefinição na foto) e Desfazer volta;
//     "Aplicar em todas" trata o trabalho; "o que mexe" lista os controles;
//   - importar um .xmp gerado aqui mostra o relatório (os mesmos números do importador) e guarda em Importados;
//   - extrair de uma referência gerada aqui devolve um estilo, com aderência medida, e guarda;
//   - exportar baixa os quatro formatos (.zropreset, .zropack, .xmp, .cube);
//   - teclado: / busca, setas, F favorita, Enter aplica;
//   - celular (390 px) sem rolar de lado e com alvos de 44 px; tema claro e escuro; sem fotos, a cena neutra.
// Capturas em FOTO_TELAS (ou numa pasta temporária): estilos-*.png.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importarLightroom } from '../src/estilo/lightroom-ler.js'
import { ler, lerPacote } from '../src/estilo/predefinicao.js'
import { lerCube } from '../src/estilo/cube.js'
import { abrirChromium, EXIGIR, fabricarFotos, pastaDasTelas, semChromium, subirApp, vigiar } from './apoio-tela.js'

const TELAS = pastaDasTelas()
const ESPERA = 120_000
const CASA = 39
const CELULAR = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }

const XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:PresetType="Normal" crs:Version="15.0" crs:ProcessVersion="11.0"
   crs:Contrast2012="+20" crs:Highlights2012="-35" crs:Shadows2012="+25" crs:Clarity2012="+10" crs:Vibrance="+12"
   crs:SaturationAdjustmentOrange="-8" crs:HueAdjustmentGreen="+15" crs:SplitToningShadowHue="210"
   crs:SplitToningShadowSaturation="12" crs:LensProfileEnable="1" crs:ToneCurveName2012="Linear">
   <crs:Name><rdf:Alt><rdf:li xml:lang="x-default">Quente de teste</rdf:li></rdf:Alt></crs:Name>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`

let app, navegador, fotos
/** a página das provas funcionais (uma só: a biblioteca guardada no IndexedDB segue de uma prova para a outra) */
let sessao

before(async () => {
  if (semChromium) return
  app = await subirApp()
  navegador = await abrirChromium()
  fotos = await fabricarFotos(navegador, { quantas: 8 })
})
after(async () => {
  await sessao?.contexto.close()
  await navegador?.close()
  await app?.fechar()
})

const limpo = (olho) =>
  assert.deepEqual({ erros: olho.erros, falhas: olho.falhas, ruins: olho.ruins, fora: olho.fora }, { erros: [], falhas: [], ruins: [], fora: [] })
const captura = (pagina, nome) => pagina.screenshot({ path: join(TELAS, `estilos-${nome}.png`) })
const naLoja = (pagina, f, arg) =>
  pagina.evaluate(async ({ codigo, arg }) => new Function('loja', 'arg', `return (${codigo})(loja, arg)`)((await import('/app/estado.js')).loja, arg), {
    codigo: f.toString(),
    arg,
  })
const fotoEmFoco = (pagina) =>
  naLoja(pagina, (l) => {
    const f = l.catalogo.foto(l.catalogo.foco())
    return { id: f.id, ajustes: f.ajustes ?? null, predefinicao: f.predefinicao ?? null }
  })
/** As animações das folhas e da troca terminaram (a captura não pega o meio do caminho). */
const assentar = (pagina) =>
  pagina.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity))

/** Uma página do app com as fotos abertas e a aba Estilos com os 39 estilos revelados. */
async function abrirEstilos(opcoes = {}, { tema } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...opcoes })
  if (tema) await contexto.addCookies([{ name: 'foto_tema', value: tema, url: app.base }])
  contexto.setDefaultTimeout(ESPERA)
  const pagina = await contexto.newPage()
  const olho = vigiar(pagina, app.base)
  await pagina.goto(`${app.base}/`)
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  await pagina.setInputFiles('input[data-escolher]', fotos.arquivos)
  await pagina.waitForFunction((n) => document.querySelector('.pilula[data-valor="todas"] .pilula-n')?.textContent.trim() === String(n), fotos.total)
  await pagina.waitForSelector('.foto img')
  await naLoja(pagina, (l) => l.ocioso())
  await naLoja(pagina, (l) => l.catalogo.selecionar(l.catalogo.visiveis()[0].id))
  const inicio = Date.now()
  await pagina.click('.dock-aba[data-aba="estilos"]')
  await pagina.waitForFunction((n) => new Set([...document.querySelectorAll('.estilo-cartao img[data-pronta="1"]')].map((i) => i.closest('button').dataset.estilo)).size >= n, CASA)
  const tempo = Date.now() - inicio
  await pagina.waitForSelector('.estilos-palco[data-pronto="1"]')
  return { contexto, pagina, olho, tempo }
}

test('Chromium é exigido no CI', { skip: !EXIGIR }, () => {
  assert.equal(semChromium, false, 'FOTO_EXIGIR=1 e o Playwright não está instalado')
})

test('a aba abre sem erro nem CSP, e os 39 estilos aparecem com a foto da pessoa revelada (pixels diferentes)', { skip: semChromium }, async () => {
  sessao = await abrirEstilos()
  const { pagina, olho, tempo } = sessao
  const medida = await pagina.evaluate(async () => {
    const lista = [...document.querySelectorAll('.estilo-cartao')].filter((b) => b.dataset.estilo.startsWith('casa-'))
    const vistos = new Map()
    for (const b of lista) {
      if (vistos.has(b.dataset.estilo)) continue
      const img = b.querySelector('img')
      await img.decode()
      const tela = new OffscreenCanvas(48, 32)
      const c = tela.getContext('2d')
      c.drawImage(img, 0, 0, 48, 32)
      const d = c.getImageData(0, 0, 48, 32).data
      let h = 0
      for (let i = 0; i < d.length; i++) h = (Math.imul(h, 31) + d[i]) | 0
      vistos.set(b.dataset.estilo, { h, largura: img.naturalWidth, altura: img.naturalHeight })
    }
    const { temposDasPrevias } = await import('/app/telas/estilos/index.js')
    const t = temposDasPrevias().filter((x) => x.lado === 320)
    const ms = t.map((x) => x.ms).sort((a, b) => a - b)
    return {
      estilos: vistos.size,
      distintos: new Set([...vistos.values()].map((v) => v.h)).size,
      lado: Math.max(...[...vistos.values()].map((v) => Math.max(v.largura, v.altura))),
      mediana: ms[Math.floor(ms.length / 2)],
      p90: ms[Math.floor(ms.length * 0.9)],
    }
  })
  console.log(`biblioteca inteira: ${tempo} ms; prévia por estilo no worker: mediana ${medida.mediana?.toFixed(0)} ms, p90 ${medida.p90?.toFixed(0)} ms`)
  assert.equal(medida.estilos, CASA)
  assert.equal(medida.distintos, CASA, 'cada estilo dá uma imagem diferente')
  assert.ok(medida.lado >= 300 && medida.lado <= 340, `prévia de ${medida.lado} px`)
  // as famílias da casa e o palco escuro
  for (const f of ['Natural', 'Retrato', 'Palco e show', 'Preto e branco', 'Comida e produto']) assert.ok(await pagina.locator(`.biblioteca-secao h3:text-is("${f}")`).count(), f)
  assert.equal(await pagina.locator('.estilos-palco.palco').count(), 1)
  // sem banco: a conta não aparece, e não há pílula de equipe
  assert.equal(await pagina.locator('.pilula[data-valor="equipe"]').count(), 0)
  await captura(pagina, 'biblioteca-1440-claro')
  limpo(olho)
})

test('passar o mouse mostra no palco sem aplicar; clicar aplica e Desfazer volta; aplicar em todas', { skip: semChromium }, async () => {
  const { pagina, olho } = sessao
  const id = 'casa-retrato-dourado'
  const antes = await fotoEmFoco(pagina)
  assert.equal(antes.ajustes, null)
  await pagina.hover(`.estilo-cartao[data-estilo="${id}"]`)
  await pagina.waitForSelector(`.estilos-palco[data-palco-estilo="${id}"][data-pronto="1"]`)
  assert.equal(await pagina.locator('.palco-titulo h2').innerText(), 'Dourado')
  assert.equal((await fotoEmFoco(pagina)).ajustes, null, 'passar o mouse não aplica')

  await pagina.click(`.estilo-cartao[data-estilo="${id}"]`)
  await pagina.waitForFunction(() => document.querySelector('.aviso button')?.textContent.trim() === 'Desfazer')
  const depois = await fotoEmFoco(pagina)
  assert.equal(depois.predefinicao.id, id)
  assert.equal(depois.predefinicao.intensidade, 100)
  assert.ok(depois.ajustes.tonalizacao.altas.saturacao > 0, 'o estilo entrou nos ajustes')
  assert.equal(depois.ajustes.luz.altas, -16)
  assert.match(await pagina.locator('.aviso').innerText(), /Dourado/)
  await pagina.mouse.move(700, 450)
  await pagina.waitForSelector(`.estilo--na-foto .estilo-cartao[data-estilo="${id}"]`)
  await assentar(pagina)
  await captura(pagina, 'aplicado-1440-claro')
  await pagina.locator('.aviso button').click()
  await pagina.waitForFunction(async () => !(await import('/app/estado.js')).loja.catalogo.foto((await import('/app/estado.js')).loja.catalogo.foco()).ajustes)
  assert.equal((await fotoEmFoco(pagina)).predefinicao ?? null, null)

  // "o que mexe": os controles em palavras
  await pagina.hover(`.estilo-cartao[data-estilo="${id}"]`)
  await pagina.click(`.estilo-cartao[data-estilo="${id}"]`)
  await pagina.mouse.move(700, 450)
  await pagina.click('.palco-acoes button[aria-label="O que este estilo mexe"]')
  await pagina.waitForSelector('dialog.folha-mexe[open] .mexe dd')
  const linhas = await pagina.locator('dialog.folha-mexe .mexe dd').allInnerTexts()
  assert.ok(linhas.some((l) => /Altas luzes −16/.test(l)), linhas.join(' | '))
  assert.ok(await pagina.locator('dialog.folha-mexe .qualidade--ok').count(), 'passou no qc')
  await pagina.keyboard.press('Escape')
  await pagina.waitForSelector('dialog.folha-mexe[open]', { state: 'detached' })

  // aplicar em todas (corrigindo cada foto antes)
  await pagina.click('.estilos-aplicar')
  await pagina.waitForFunction(
    async (id) => (await import('/app/estado.js')).loja.catalogo.fotos().every((f) => f.predefinicao?.id === id),
    id,
  )
  const todas = await naLoja(pagina, (l) => l.catalogo.fotos().map((f) => f.predefinicao.modo))
  assert.ok(todas.every((m) => m === 'corrigir-e-estilo'))
  assert.match(await pagina.locator('.aviso').innerText(), /Dourado em \d+ fotos/)
  await pagina.locator('.aviso button').click()
  await pagina.waitForFunction(async () => (await import('/app/estado.js')).loja.catalogo.fotos().filter((f) => f.predefinicao).length === 1)
  limpo(olho)
})

test('importar um .xmp mostra o relatório honesto e guarda em Importados', { skip: semChromium }, async () => {
  const { pagina, olho } = sessao
  const esperado = importarLightroom(XMP, { nome: 'quente' }).relatorio.resumo
  await pagina.click('.biblioteca-novo > button')
  await pagina.click('.menu-item:has-text("Importar preset")')
  await pagina.setInputFiles('dialog[open] input[data-entrada="importar"]', [{ name: 'quente.xmp', mimeType: 'application/rdf+xml', buffer: Buffer.from(XMP) }])
  await pagina.waitForSelector('dialog[open] .relatorio-numeros')
  const numeros = await pagina.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll('dialog[open] .relatorio-numeros > div')].map((d) => [d.dataset.classe, Number(d.querySelector('.relatorio-n').textContent)])),
  )
  assert.deepEqual(numeros, esperado)
  assert.ok(esperado.exato + esperado.aproximado > 5 && esperado.ignorado >= 1, JSON.stringify(esperado))
  assert.equal(await pagina.locator('dialog[open] .importado-nome h3').innerText(), 'Quente de teste')
  // a lista inteira fica recolhida; o aviso da lente aparece
  assert.equal(await pagina.locator('dialog[open] .relatorio-lista li').count(), esperado.exato + esperado.aproximado + esperado.ignorado)
  assert.ok((await pagina.locator('dialog[open] .avisos-estilo').innerText()).includes('lente'))
  await pagina.waitForSelector('dialog[open] .importado-imagem img')
  await assentar(pagina)
  await captura(pagina, 'importar-1440-claro')
  await pagina.click('dialog[open] button:has-text("Pronto")')
  await pagina.waitForSelector('.pilula[data-valor="importados"][aria-pressed="true"]')
  await pagina.waitForFunction(() => [...document.querySelectorAll('.estilo-nome')].some((n) => n.textContent === 'Quente de teste'))
  assert.match(await pagina.locator('.aviso').innerText(), /1 estilo importado/)
  limpo(olho)
})

test('extrair de uma referência gerada devolve um estilo com aderência medida e guarda', { skip: semChromium }, async () => {
  const { pagina, olho } = sessao
  // a referência: a própria foto em foco, tratada por fora (sépia e contraste num canvas) — a mesma cena
  const png = await naLoja(pagina, async (l) => {
    const blob = await l.miniaturas.blob(l.catalogo.foco(), 'previa')
    const bitmap = await createImageBitmap(blob)
    const tela = new OffscreenCanvas(bitmap.width, bitmap.height)
    const c = tela.getContext('2d')
    c.filter = 'sepia(0.55) contrast(1.15) saturate(0.8)'
    c.drawImage(bitmap, 0, 0)
    const bytes = new Uint8Array(await (await tela.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let texto = ''
    for (let k = 0; k < bytes.length; k += 0x8000) texto += String.fromCharCode(...bytes.subarray(k, k + 0x8000))
    return btoa(texto)
  })
  await pagina.click('.biblioteca-novo > button')
  await pagina.click('.menu-item:has-text("Extrair de uma foto")')
  await pagina.setInputFiles('dialog[open] input[data-entrada="referencia"]', [{ name: 'referencia.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }])
  await pagina.waitForSelector('dialog[open] .aderencia-n', { timeout: ESPERA })
  const aderencia = Number(await pagina.locator('dialog[open] .aderencia-n').getAttribute('data-aderencia'))
  const grupos = await pagina.locator('dialog[open] .extraido-grupos .ficha').allInnerTexts()
  console.log(`extração: aderência ${(aderencia * 100).toFixed(0)}%, grupos ${grupos.join(', ')}`)
  assert.ok(aderencia > 0.3, `aderência ${aderencia}`)
  assert.ok(grupos.includes('Mesma cena'))
  assert.ok(grupos.length >= 2, grupos.join(', '))
  await pagina.waitForFunction(() => [...document.querySelectorAll('dialog[open] .comparador img')].every((i) => i.complete && i.naturalWidth))
  await assentar(pagina)
  await captura(pagina, 'extrair-1440-claro')
  await pagina.fill('dialog[open] .campo--linha input', 'Sépia da referência')
  await pagina.click('dialog[open] button:has-text("Guardar como estilo")')
  await pagina.waitForSelector('dialog[open]', { state: 'detached' })
  await pagina.waitForSelector('.pilula[data-valor="meus"][aria-pressed="true"]')
  await pagina.waitForFunction(() => [...document.querySelectorAll('.estilo-nome')].some((n) => n.textContent === 'Sépia da referência'))
  const guardado = await pagina.evaluate(() => [...document.querySelectorAll('.estilo-cartao')].find((b) => b.textContent.includes('Sépia da referência')).dataset.estilo)
  await pagina.waitForSelector(`.estilo-cartao[data-estilo="${guardado}"] img[data-pronta="1"]`)
  limpo(olho)
})

test('exportar baixa os quatro formatos', { skip: semChromium }, async () => {
  const { pagina, olho } = sessao
  await pagina.click('.pilula[data-valor="todos"]')
  const cartao = pagina.locator('.estilo:has(.estilo-cartao[data-estilo="casa-filme-vencido"])').first()
  const baixar = async (rotulo, abrirMenu) => {
    await abrirMenu()
    const [download] = await Promise.all([pagina.waitForEvent('download'), pagina.click(`.menu-lista .menu-item:has-text("${rotulo}")`)])
    return { nome: download.suggestedFilename(), texto: readFileSync(await download.path(), 'utf8') }
  }
  const doCartao = async () => {
    await cartao.hover()
    await cartao.locator('.estilo-mais').click()
  }
  const zropreset = await baixar('Estilo', doCartao)
  assert.equal(zropreset.nome, 'Vencido.zropreset')
  assert.equal(ler(zropreset.texto).id, 'casa-filme-vencido')
  const xmp = await baixar('Lightroom', doCartao)
  assert.equal(xmp.nome, 'Vencido.xmp')
  assert.match(xmp.texto, /crs:Contrast2012="-10"/)
  assert.match(await pagina.locator('.aviso').innerText(), /Lightroom/)
  const cube = await baixar('LUT', doCartao)
  assert.equal(cube.nome, 'Vencido.cube')
  assert.equal(lerCube(cube.texto).lado, 33)
  // o que depende de vizinhança não cabe na LUT, e o aviso diz
  assert.match(await pagina.locator('.aviso').innerText(), /grão/)
  const pacote = await baixar('Exportar meus estilos', () => pagina.click('.biblioteca-novo > button'))
  assert.equal(pacote.nome, 'Meus estilos.zropack')
  const nomes = lerPacote(pacote.texto).predefinicoes.map((p) => p.nome)
  assert.deepEqual(nomes.sort(), ['Quente de teste', 'Sépia da referência'])
  limpo(olho)
})

test('teclado: / busca, setas andam, F favorita, Enter aplica', { skip: semChromium }, async () => {
  const { pagina, olho } = sessao
  await pagina.mouse.move(700, 450)
  await pagina.locator('.biblioteca-cabeca h2').click()
  await pagina.keyboard.press('/')
  assert.equal(await pagina.evaluate(() => document.activeElement?.type), 'search')
  await pagina.keyboard.type('prata')
  await pagina.waitForFunction(() => document.querySelectorAll('.estilo-cartao').length === 1)
  await pagina.keyboard.press('Escape')
  await pagina.waitForFunction(() => document.querySelectorAll('.estilo-cartao').length > 39)
  await pagina.locator('.pilula[data-valor="Retrato"]').click()
  await pagina.waitForFunction(() => document.querySelectorAll('.estilo-cartao').length === 4)
  await pagina.keyboard.press('/')
  await pagina.keyboard.press('ArrowDown')
  const focado = () => pagina.evaluate(() => document.activeElement?.dataset?.estilo)
  assert.equal(await focado(), 'casa-retrato-pele')
  await pagina.keyboard.press('ArrowRight')
  assert.equal(await focado(), 'casa-retrato-estudio')
  await pagina.waitForSelector('.estilos-palco[data-palco-estilo="casa-retrato-estudio"]')
  await pagina.keyboard.press('ArrowDown')
  assert.equal(await focado(), 'casa-retrato-dourado')
  await pagina.keyboard.press('ArrowUp')
  assert.equal(await focado(), 'casa-retrato-pele')
  await pagina.keyboard.press('f')
  await pagina.waitForSelector('.estilo-cartao[data-estilo="casa-retrato-pele"] + .estilo-estrela[aria-pressed="true"]')
  assert.equal(await pagina.locator('.pilula[data-valor="favoritos"]').count(), 1)
  await pagina.keyboard.press('Enter')
  await pagina.waitForFunction(async () => {
    const { loja } = await import('/app/estado.js')
    return loja.catalogo.foto(loja.catalogo.foco()).predefinicao?.id === 'casa-retrato-pele'
  })
  limpo(olho)
})

test('tema claro e escuro (1440)', { skip: semChromium }, async () => {
  for (const tema of ['claro', 'escuro']) {
    const { contexto, pagina, olho } = await abrirEstilos({}, { tema })
    try {
      assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), tema)
      await pagina.hover('.estilo-cartao[data-estilo="casa-filme-negativo-quente"]')
      await pagina.waitForSelector('.estilos-palco[data-palco-estilo="casa-filme-negativo-quente"][data-pronto="1"]')
      await assentar(pagina)
      await captura(pagina, `1440-${tema}`)
      // o palco é escuro nos dois temas; a biblioteca segue o tema
      const cores = await pagina.evaluate(() => ({
        palco: getComputedStyle(document.querySelector('.estilos-palco')).backgroundColor,
        titulo: getComputedStyle(document.querySelector('.biblioteca-cabeca h2')).color,
      }))
      assert.equal(cores.palco, 'rgb(12, 12, 12)')
      assert.equal(cores.titulo, tema === 'claro' ? 'rgb(29, 29, 31)' : 'rgb(245, 245, 247)')
      limpo(olho)
    } finally {
      await contexto.close()
    }
  }
})

/** Os alvos de toque menores que 44 × 44 (contando a área estendida pelo ::before invisível). */
const alvosPequenos = (pagina) =>
  pagina.evaluate(() => {
    const ruins = []
    for (const el of document.querySelectorAll('.estilos button, .estilos a[href], .estilos [role="radio"], .estilos input:not([type="file"]), .estilos select, .estilos summary')) {
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
      const nome = el.getAttribute('aria-label') || el.textContent || ''
      if (l < 43.5 || a < 43.5) ruins.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')} "${nome.trim().slice(0, 24)}" ${Math.round(l)}×${Math.round(a)}`)
    }
    return ruins
  })
const semRolarDeLado = async (pagina) => {
  const m = await pagina.evaluate(() => ({
    pagina: document.scrollingElement.scrollWidth,
    tela: document.querySelector('.estilos').scrollWidth,
    janela: innerWidth,
    largos: [...document.querySelectorAll('.estilos *')]
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5 && !e.closest('.pilulas--rola') && e.getBoundingClientRect().width > 0)
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`)
      .slice(0, 5),
  }))
  assert.equal(m.pagina, m.janela, 'a página rola de lado')
  assert.ok(m.tela <= m.janela, 'a tela rola de lado')
  assert.deepEqual(m.largos, [], 'elementos passando da borda')
}

test('celular (390 px): nada rola de lado, os alvos têm 44 px, claro e escuro', { skip: semChromium }, async () => {
  for (const tema of ['claro', 'escuro']) {
    const { contexto, pagina, olho } = await abrirEstilos(CELULAR, { tema })
    try {
      await semRolarDeLado(pagina)
      assert.deepEqual(await alvosPequenos(pagina), [])
      // tocar aplica direto (não há passar o mouse)
      await pagina.tap('.estilo-cartao[data-estilo="casa-natural-dia-claro"]')
      await pagina.waitForFunction(async () => {
        const { loja } = await import('/app/estado.js')
        return loja.catalogo.foto(loja.catalogo.foco()).predefinicao?.id === 'casa-natural-dia-claro'
      })
      await pagina.waitForSelector('.estilos-palco[data-palco-estilo="casa-natural-dia-claro"][data-pronto="1"]')
      await assentar(pagina)
      await captura(pagina, `390-${tema}`)
      await pagina.evaluate(() => document.querySelector('.estilos').scrollTo(0, 640))
      await pagina.waitForTimeout(300)
      await semRolarDeLado(pagina)
      assert.deepEqual(await alvosPequenos(pagina), [])
      await captura(pagina, `390-${tema}-biblioteca`)
      limpo(olho)
    } finally {
      await contexto.close()
    }
  }
})

test('sem fotos: os cartões usam a cena neutra e uma linha convida a abrir fotos', { skip: semChromium }, async () => {
  const { contexto, pagina, olho } = await abrirEstilos()
  try {
    await naLoja(pagina, (l) => l.catalogo.remover(l.catalogo.fotos().map((f) => f.id)))
    await pagina.waitForSelector('.palco-nota')
    assert.equal(await pagina.locator('.palco-nota').innerText(), 'Abra fotos para ver os estilos nelas.')
    await pagina.waitForFunction((n) => document.querySelectorAll('.estilo-cartao img[data-pronta="1"]').length >= n, CASA)
    await pagina.waitForSelector('.estilos-palco[data-pronto="1"]')
    await pagina.hover('.estilo-cartao[data-estilo="casa-paisagem-horizonte"]')
    await pagina.waitForSelector('.estilos-palco[data-palco-estilo="casa-paisagem-horizonte"][data-pronto="1"]')
    await assentar(pagina)
    await captura(pagina, 'vazio-1440-claro')
    // clicar sem foto não finge: avisa
    await pagina.click('.estilo-cartao[data-estilo="casa-paisagem-horizonte"]')
    await pagina.waitForFunction(() => document.querySelector('.aviso')?.textContent.includes('Abra fotos'))
    limpo(olho)
  } finally {
    await contexto.close()
  }
})
