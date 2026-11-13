// A tela Revelar (app/telas/revelar) no Chromium, pelo servidor local com os cabeçalhos de produção (vercel.json), em
// modo local. As fotos são fabricadas: JPEG desenhados num canvas e um DNG de verdade (escreverDng) com a cena
// sintética "fotografada" por uma câmera conhecida e a JPEG embutida como prévia. Confere:
//   - a lógica pura (grupos × CONTROLES, desfazer, copiar, quadro e zoom, conta-gotas, a janela da margem);
//   - abre a foto em foco: prévia primeiro, depois a revelação; a margem aparece com as marcas do arquivo;
//   - mexer na exposição muda os pixels do palco e move a janela da margem; o número se digita; duplo clique zera;
//   - cada grupo do painel tem os controles da lista única; desfazer e refazer; copiar e colar entre duas fotos;
//   - antes/depois, zoom de 100%, avisos de corte, auto com o porquê, exportar esta foto (o JPEG abre);
//   - a placa (SwiftShader) e o JS; quadros por segundo arrastando a exposição nos dois;
//   - 390 px com a folha de baixo, sem rolar de lado e com alvos de 44 px; claro e escuro; sem erro de console.
// Capturas em FOTO_TELAS (ou numa pasta temporária): revelar-*.png. FOTO_AMOSTRA=<arquivo de .amostras> troca o DNG
// fabricado por uma amostra RAW real nas capturas.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONTROLES, neutro, normalizar } from '../src/motor/ajustes.js'
import { escreverDng } from '../src/raw/dng.js'
import {
  COPIAR_PADRAO,
  GRUPOS,
  anguloDaRegua,
  atual,
  brancoDoPonto,
  controlesDoGrupo,
  copiarGrupos,
  criarHistorico,
  desfazer,
  empurrar,
  enquadrar,
  grupoMexido,
  janelaDaTela,
  podeDesfazer,
  quadroDe,
  refazer,
  zerarGrupo,
  zoomNoPonto,
} from '../app/telas/revelar/logica.js'
import { codigoDaTela } from '../app/telas/revelar/margem.js'
import { cena, fotografar } from './apoio-motor.js'
import { abrirChromium, comExif, desenharJpegs, horaDaFoto, pastaDasTelas, semChromium, subirApp, vigiar } from './apoio-tela.js'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const TELAS = pastaDasTelas()
const ESPERA = 120_000
const CELULAR = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }

// ─────────────────────────────── a lógica pura ───────────────────────────────

test('lógica: os grupos cobrem a lista única, desfazer, copiar, zerar', () => {
  // todo controle de CONTROLES tem um grupo do painel (menos o look e a intensidade, que moram no estilo)
  const doPainel = new Set(GRUPOS.map((g) => g.id))
  for (const [caminho, c] of Object.entries(CONTROLES)) {
    if (caminho === 'look.quantidade' || caminho === 'intensidade') continue
    assert.ok(doPainel.has(c.grupo), `${caminho} (${c.grupo}) sem grupo no painel`)
  }
  assert.deepEqual(
    controlesDoGrupo('luz').map((c) => c.caminho),
    ['luz.exposicao', 'luz.contraste', 'luz.altas', 'luz.sombras', 'luz.brancos', 'luz.pretos'],
  )
  assert.ok(!COPIAR_PADRAO.includes('geometria'))

  const a = normalizar({ luz: { exposicao: 1.2, contraste: 30 }, cor: { vibracao: 20 }, geometria: { angulo: 3 } })
  assert.equal(grupoMexido(a, 'luz'), true)
  assert.equal(grupoMexido(a, 'detalhe'), false)
  assert.equal(grupoMexido(normalizar({ branco: { modo: 'auto' } }), 'cor'), true)
  const z = zerarGrupo(a, 'luz')
  assert.deepEqual(z.luz, neutro().luz)
  assert.equal(z.cor.vibracao, 20)

  const colado = copiarGrupos(a, normalizar({ luz: { exposicao: -2 }, geometria: { giro: 90 } }), ['luz', 'cor'])
  assert.equal(colado.luz.exposicao, 1.2)
  assert.equal(colado.cor.vibracao, 20)
  assert.equal(colado.geometria.giro, 90)
  assert.equal(colado.geometria.angulo, 0)

  let h = criarHistorico(neutro())
  assert.equal(podeDesfazer(h), false)
  h = empurrar(h, a, 'Exposição')
  h = empurrar(h, a, 'igual') // passo igual não entra
  assert.equal(h.passos.length, 2)
  h = desfazer(h)
  assert.deepEqual(atual(h), neutro())
  h = refazer(h)
  assert.equal(atual(h).luz.exposicao, 1.2)
  h = desfazer(h)
  h = empurrar(h, zerarGrupo(a, 'cor'), 'outro') // novo passo corta o refazer
  assert.equal(h.passos.length, 2)
})

test('lógica: quadro, zoom no ponto, régua, conta-gotas e a janela da margem', () => {
  const cheio = { largura: 6000, altura: 4000 }
  assert.deepEqual(quadroDe(cheio, neutro()), cheio)
  assert.deepEqual(quadroDe(cheio, { geometria: { giro: 90 } }), { largura: 4000, altura: 6000 })
  assert.deepEqual(quadroDe(cheio, { geometria: { corte: { x: 0.25, y: 0, l: 0.5, a: 1 } } }), { largura: 3000, altura: 4000 })
  // zoom de 100% no ponto: o ponto da foto debaixo do cursor fica parado
  const c = { quadro: cheio, W: 1000, H: 700, dpr: 2, vista: { zoom: 'encaixar', x: 0.5, y: 0.5 } }
  const g0 = enquadrar(c)
  const cx = 300
  const cy = 200
  const antes = [g0.x0 + ((cx - g0.esq) * 2) / g0.z, g0.y0 + ((cy - g0.topo) * 2) / g0.z]
  const v = zoomNoPonto(c, 1, cx, cy)
  assert.equal(v.zoom, 1)
  const g1 = enquadrar({ ...c, vista: v })
  const depois = [g1.x0 + ((cx - g1.esq) * 2) / g1.z, g1.y0 + ((cy - g1.topo) * 2) / g1.z]
  assert.ok(Math.abs(antes[0] - depois[0]) < 1 && Math.abs(antes[1] - depois[1]) < 1, `${antes} × ${depois}`)
  assert.equal(zoomNoPonto(c, 0.01, cx, cy).zoom, 'encaixar')
  // régua: linha descendo 10 px em 100 endireita girando ao contrário
  assert.equal(anguloDaRegua(0, 100, 10), -5.7)
  assert.equal(anguloDaRegua(0, 100, 0), 0)
  // conta-gotas: cinza fica onde está; cor quente pede branco mais quente (kelvin menor)
  assert.equal(brancoDoPonto([128, 128, 128], { kelvin: 5500, tinta: 0 }).perto, true)
  const quente = brancoDoPonto([200, 170, 130], { kelvin: 5500, tinta: 0 })
  assert.ok(quente.kelvin < 5000, JSON.stringify(quente))
  assert.equal(brancoDoPonto([255, 255, 255], { kelvin: 5500, tinta: 0 }), null)
  // a margem: subir a exposição desce a janela no eixo do arquivo, em EV
  const latitude = { margem: { acimaDoCinza: 3.4, abaixoDoCinza: 8.5 } }
  const j0 = janelaDaTela(codigoDaTela(neutro(), latitude).codigo)
  const j1 = janelaDaTela(codigoDaTela({ luz: { exposicao: 1 } }, latitude).codigo)
  assert.ok(Math.abs(j0.cinza) < 0.1, `cinza ${j0.cinza}`)
  assert.ok(Math.abs(j1.cinza - j0.cinza + 1) < 0.1, `cinza ${j1.cinza}`)
  assert.ok(j1.ate < j0.ate - 0.3 && j1.de < j0.de - 0.3, `${JSON.stringify(j0)} → ${JSON.stringify(j1)}`)
})

// ─────────────────────────────── no Chromium ───────────────────────────────

let app, navegador, arquivos

/** Um DNG de verdade: a cena sintética fotografada, com a JPEG desenhada embutida como prévia. */
function dngDe(imagem, previa, { largura, altura }) {
  const { negativo } = fotografar(imagem, { margem: { x: 0, y: 0, direita: 0, baixo: 0 }, origem: 'dng' })
  negativo.formato = 'dng'
  negativo.fabricante = 'ZRO'
  negativo.modelo = 'Sintetica'
  negativo.exif = { ...negativo.exif, orientacao: 1, iso: 400, tempo: 1 / 250, abertura: 2.8, focal: 50, data: horaDaFoto(0) }
  negativo.previa = { jpeg: new Uint8Array(previa), largura, altura }
  return Buffer.from(escreverDng(negativo))
}

before(async () => {
  if (semChromium) return
  app = await subirApp()
  navegador = await abrirChromium()
  const jpegs = await desenharJpegs(navegador, { quantas: 4, largura: 900, altura: 600 })
  const imagem = cena(5, 1200, 800, { ganho: 1.6 })
  arquivos = [
    { name: 'IMG_0001.DNG', mimeType: 'image/x-adobe-dng', buffer: dngDe(imagem, jpegs[0], { largura: 900, altura: 600 }) },
    ...jpegs.slice(1).map((j, i) => ({ name: `IMG_000${i + 2}.JPG`, mimeType: 'image/jpeg', buffer: comExif(j, { data: horaDaFoto(i + 1) }) })),
  ]
  const amostra = process.env.FOTO_AMOSTRA
  if (amostra && existsSync(join(RAIZ, '.amostras', amostra))) {
    arquivos.push({ name: amostra, mimeType: 'application/octet-stream', buffer: readFileSync(join(RAIZ, '.amostras', amostra)) })
  }
})
after(async () => {
  await navegador?.close()
  await app?.fechar()
})

const limpo = (olho) =>
  assert.deepEqual({ erros: olho.erros, falhas: olho.falhas, ruins: olho.ruins, fora: olho.fora }, { erros: [], falhas: [], ruins: [], fora: [] })

/** Abre o app, escolhe as fotos, põe o foco na `nome` e vai para a Revelar. Anota a sequência das fases do palco. */
async function abrirRevelar({ opcoes = {}, tema = 'claro', motor = null, nome = 'IMG_0001.DNG' } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...opcoes })
  await contexto.addCookies([{ name: 'foto_tema', value: tema, url: app.base }])
  contexto.setDefaultTimeout(ESPERA)
  await contexto.addInitScript((m) => {
    if (m) localStorage.setItem('foto_motor', m)
    // o seletor de arquivo do sistema não abre no Chromium automatizado: a exportação cai no download
    window.showSaveFilePicker = undefined
    window.__fases = []
    new MutationObserver(() => {
      const el = document.querySelector('.palco-revelar')
      const f = el && /fase-(\w[\w-]*)/.exec(el.className)?.[1]
      if (f && window.__fases[window.__fases.length - 1] !== f) window.__fases.push(f)
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true })
  }, motor)
  const pagina = await contexto.newPage()
  const olho = vigiar(pagina, app.base)
  await pagina.goto(`${app.base}/`)
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  await pagina.setInputFiles('input[data-escolher]', arquivos)
  await pagina.waitForFunction((n) => document.querySelectorAll('.foto img').length >= n, Math.min(4, arquivos.length))
  await pagina.evaluate(async (alvo) => {
    const { loja } = await import('/app/estado.js')
    await loja.ocioso()
    // a análise da Decupar empilha fotos parecidas e o foco iria para a capa da pilha: aqui cada foto fica solta
    loja.catalogo.empilhar(false)
    loja.catalogo.selecionar(loja.catalogo.fotos().find((f) => f.nome === alvo).id)
  }, nome)
  await pagina.keyboard.press('d')
  await pronta(pagina)
  return { contexto, pagina, olho }
}
const pronta = (pagina) => pagina.waitForSelector('.palco-revelar.fase-pronta', { timeout: ESPERA }).then(() => pagina.waitForTimeout(400))
const naLoja = (pagina, f, arg) =>
  pagina.evaluate(async ({ codigo, arg }) => new Function('loja', 'arg', `return (${codigo})(loja, arg)`)((await import('/app/estado.js')).loja, arg), {
    codigo: f.toString(),
    arg,
  })
const captura = (pagina, nome) => pagina.screenshot({ path: join(TELAS, `revelar-${nome}.png`) })

/** Média dos pixels do palco (lê o canvas da sessão, seja 2D ou WebGL com o quadro guardado). */
const mediaDoPalco = (pagina) =>
  pagina.evaluate(() => {
    const c = document.querySelector('.rv-visor:not(.rv-visor--antes) .palco-canvas')
    const t = document.createElement('canvas')
    t.width = 96
    t.height = 64
    const x = t.getContext('2d')
    x.drawImage(c, 0, 0, 96, 64)
    const d = x.getImageData(0, 0, 96, 64).data
    let s = 0
    for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]
    return s / (d.length * 0.75)
  })
const valorDe = (pagina, caminho) => pagina.locator(`.rv-ajuste[data-caminho="${caminho}"] .controle-valor`).innerText()
const quadros = (pagina) => naLoja(pagina, (l) => l.aba('revelar').medidas.quadros.length)
async function esperarQuadro(pagina, desde) {
  await pagina.waitForFunction(
    async (n) => {
      const { loja } = await import('/app/estado.js')
      return loja.aba('revelar').medidas.quadros.length > n
    },
    desde,
    { polling: 50 },
  )
  await pagina.waitForTimeout(250)
}

/** Arrasta o controle de exposição de ponta a ponta por `ms` e conta os quadros desenhados. */
async function medirArrasto(pagina, ms = 2500) {
  const trilho = await pagina.locator('.rv-ajuste[data-caminho="luz.exposicao"] input').boundingBox()
  const y = trilho.y + trilho.height / 2
  const x0 = trilho.x + trilho.width * 0.5
  const n0 = await quadros(pagina)
  const t0 = Date.now()
  await pagina.mouse.move(x0, y)
  await pagina.mouse.down()
  let i = 0
  while (Date.now() - t0 < ms) {
    const f = 0.5 + 0.25 * Math.sin(i++ / 6)
    await pagina.mouse.move(trilho.x + trilho.width * f, y)
    await pagina.waitForTimeout(16)
  }
  await pagina.mouse.up()
  const dt = (Date.now() - t0) / 1000
  const n = (await quadros(pagina)) - n0
  return Math.round((n / dt) * 10) / 10
}

const COMPUTADOR = 'revelar no computador: dois tempos, margem, exposição, grupos, desfazer, estilo, versões, comparar, zoom, avisos, auto, copiar, exportar'
test(COMPUTADOR, { skip: semChromium, timeout: 600_000 }, async () => {
  const { contexto, pagina, olho } = await abrirRevelar()
  try {
    // dois tempos: a prévia da câmera (borrada) antes da revelação
    const fases = await pagina.evaluate(() => window.__fases)
    assert.ok(fases.indexOf('previa') >= 0 && fases.indexOf('previa') < fases.indexOf('pronta'), fases.join(' → '))
    // a margem do RAW: histograma da cena com as marcas e as frases da Latitude
    await pagina.waitForSelector('.margem[data-raw][data-ate]')
    const frases = await pagina.locator('.margem-frases').innerText()
    assert.match(frases, /estourou de vez/)
    assert.match(frases, /recuperável/)
    assert.match(frases, /sombra limpa|Sombras já no ruído/)
    await captura(pagina, '1440-claro')

    // exposição pelo teclado: o palco clareia e a janela da margem desce no eixo do arquivo
    const media0 = await mediaDoPalco(pagina)
    const ate0 = Number(await pagina.locator('.margem').getAttribute('data-ate'))
    const exp = pagina.locator('.rv-ajuste[data-caminho="luz.exposicao"] input')
    await exp.focus()
    const n0 = await quadros(pagina)
    for (let i = 0; i < 10; i++) await pagina.keyboard.press('Shift+ArrowRight')
    await esperarQuadro(pagina, n0)
    assert.equal(await valorDe(pagina, 'luz.exposicao'), '+1,00 EV')
    const media1 = await mediaDoPalco(pagina)
    assert.ok(media1 > media0 + 8, `média ${media0} → ${media1}`)
    const ate1 = Number(await pagina.locator('.margem').getAttribute('data-ate'))
    assert.ok(ate1 < ate0 - 0.3, `janela ${ate0} → ${ate1}`)
    // salvo sozinho na foto do catálogo
    await pagina.waitForTimeout(300)
    assert.equal(await naLoja(pagina, (l) => l.catalogo.foto(l.catalogo.foco()).ajustes?.luz.exposicao), 1)

    // duplo clique zera; desfazer e refazer
    await exp.dblclick()
    assert.equal(await valorDe(pagina, 'luz.exposicao'), '0,00 EV')
    await pagina.locator('.palco-revelar').click({ position: { x: 30, y: 30 } })
    await pagina.keyboard.press('Control+z')
    assert.equal(await valorDe(pagina, 'luz.exposicao'), '+1,00 EV')
    await pagina.keyboard.press('Control+Shift+z')
    assert.equal(await valorDe(pagina, 'luz.exposicao'), '0,00 EV')
    await pagina.keyboard.press('Control+z')

    // o número se digita
    await pagina.locator('.rv-ajuste[data-caminho="luz.contraste"] .rv-ajuste-editar').click()
    await pagina.keyboard.type('25')
    await pagina.keyboard.press('Enter')
    assert.equal(await valorDe(pagina, 'luz.contraste'), '+25')
    assert.equal(await pagina.locator('.rv-grupo[data-grupo="luz"] .rv-grupo-ponto').count(), 1)

    // cada grupo tem os controles da lista única
    for (const g of ['presenca', 'curva', 'misturador', 'tonalizacao', 'detalhe', 'efeitos', 'geometria']) {
      await pagina.locator(`.rv-grupo[data-grupo="${g}"] .rv-grupo-botao`).click()
    }
    await pagina.locator('.avancado-botao').click()
    for (const g of ['calibracao', 'tela']) await pagina.locator(`.rv-grupo[data-grupo="${g}"] .rv-grupo-botao`).click()
    const caminhos = new Set(await pagina.locator('.rv-ajuste[data-caminho]').evaluateAll((l) => l.map((e) => e.dataset.caminho)))
    const faltam = Object.keys(CONTROLES).filter((c) => c !== 'look.quantidade' && c !== 'intensidade' && !caminhos.has(c))
    assert.deepEqual(faltam, [])
    assert.equal(await pagina.locator('.rv-faixa').count(), 8)
    assert.equal(await pagina.locator('.roda').count(), 1)
    assert.equal(await pagina.locator('.curva-grafico').count(), 1)
    // a curva: tocar cria um ponto e arrastar muda o palco
    await pagina.locator('.curva-grafico').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    const curva = await pagina.locator('.curva-grafico').boundingBox()
    const nc = await quadros(pagina)
    await pagina.mouse.move(curva.x + curva.width * 0.5, curva.y + curva.height * 0.5)
    await pagina.mouse.down()
    await pagina.mouse.move(curva.x + curva.width * 0.5, curva.y + curva.height * 0.35, { steps: 4 })
    await pagina.mouse.up()
    await esperarQuadro(pagina, nc)
    assert.equal(await pagina.locator('.curva-ponto').count(), 3)
    assert.equal(await pagina.locator('.rv-grupo[data-grupo="curva"] .rv-grupo-ponto').count(), 1)
    // zerar o grupo
    await pagina.locator('.rv-grupo[data-grupo="curva"] .rv-grupo-zerar').click()
    assert.equal(await pagina.locator('.curva-ponto').count(), 2)
    // nada no painel passa da largura (o painel não rola de lado nem quando o foco entra num ponto da curva)
    const painel = await pagina.locator('.painel-rola').evaluate((el) => [el.scrollWidth, el.clientWidth, el.scrollLeft])
    assert.ok(painel[0] <= painel[1] && painel[2] === 0, `painel ${painel}`)
    await captura(pagina, '1440-claro-grupos')

    // antes e depois (\): a divisória e o antes (no JS, uma segunda sessão)
    await pagina.locator('.palco-revelar').click({ position: { x: 30, y: 30 } })
    await pagina.keyboard.press('\\')
    await pagina.waitForSelector('.divisoria', { state: 'attached' })
    await pagina.waitForTimeout(2500)
    await captura(pagina, '1440-claro-comparar')
    await pagina.keyboard.press('\\')
    assert.equal(await pagina.locator('.divisoria').count(), 0)

    // zoom de 100% (Z) e de volta
    await pagina.keyboard.press('z')
    await pagina.waitForSelector('.palco-revelar.ampliada')
    assert.match(await pagina.locator('[data-zoom]').innerText(), /\d+%/)
    await pagina.keyboard.press('z')
    await pagina.waitForSelector('.palco-revelar:not(.ampliada)')

    // avisos de corte (J): com a exposição lá em cima o palco tem branco cortado
    await exp.focus()
    const na = await quadros(pagina)
    for (let i = 0; i < 30; i++) await pagina.keyboard.press('Shift+ArrowRight')
    await esperarQuadro(pagina, na)
    await pagina.locator('.palco-revelar').click({ position: { x: 30, y: 30 } })
    await pagina.keyboard.press('j')
    await pagina.waitForSelector('.palco-legenda')
    await pagina.waitForTimeout(600)
    const marcados = await pagina.evaluate(() => {
      const c = document.querySelector('.palco-avisos')
      if (!c || c.hidden) return -1
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 3; i < d.length; i += 4) if (d[i]) n++
      return n
    })
    assert.ok(marcados > 0, `pixels marcados: ${marcados}`)
    await captura(pagina, '1440-claro-avisos')
    await pagina.keyboard.press('j')
    await exp.dblclick()

    // auto (Shift+A): mexe na exposição e diz por quê
    await pagina.locator('.palco-revelar').click({ position: { x: 30, y: 30 } })
    await pagina.keyboard.press('Shift+A')
    await pagina.waitForSelector('[data-porque]')
    assert.match(await pagina.locator('[data-porque]').innerText(), /EV/)

    // estilo da lista curta, com a intensidade; e uma versão guardada
    await pagina.locator('.menu-estilo > button').click()
    await pagina.locator('.menu-estilo .menu-item').nth(1).click()
    await pagina.waitForSelector('.rv-ajuste[data-caminho="intensidade"]')
    assert.ok(await naLoja(pagina, (l) => l.catalogo.foto(l.catalogo.foco()).predefinicao?.id))
    await pagina.locator('.rv-ajuste[data-caminho="intensidade"] input').focus()
    await pagina.keyboard.press('Shift+ArrowRight')
    assert.equal(await valorDe(pagina, 'intensidade'), '110%')
    assert.equal(await naLoja(pagina, (l) => l.catalogo.foto(l.catalogo.foco()).predefinicao.intensidade), 110)
    await pagina.locator('.painel-acoes-fim .menu > button').click()
    await pagina.getByRole('menuitem', { name: /Versões/ }).click()
    await pagina.locator('.folha-versoes input').fill('Quente')
    await pagina.locator('.folha-versoes button[type="submit"]').click()
    await pagina.waitForSelector('.folha-versoes .rv-versao')
    assert.equal(await naLoja(pagina, (l) => l.catalogo.foto(l.catalogo.foco()).versoes?.[0]?.nome), 'Quente')
    await pagina.keyboard.press('Escape')
    await pagina.locator('.menu-estilo > button').click()
    await pagina.getByRole('menuitemradio', { name: 'Sem estilo' }).click()
    assert.equal(await pagina.locator('.rv-ajuste[data-caminho="intensidade"]').count(), 0)

    // copiar (com a escolha dos grupos) e colar na foto seguinte
    await exp.focus()
    for (let i = 0; i < 5; i++) await pagina.keyboard.press('Shift+ArrowRight')
    const expo = await naLoja(pagina, (l) => l.catalogo.foto(l.catalogo.foco()).ajustes.luz.exposicao)
    await pagina.locator('.palco-revelar').click({ position: { x: 30, y: 30 } })
    await pagina.keyboard.press('Control+Shift+c')
    await pagina.waitForSelector('.folha-grupos[open]')
    await pagina.locator('.folha-grupos [data-confirmar]').click()
    await pagina.waitForSelector('.folha-grupos[open]', { state: 'detached' }).catch(() => {})
    const primeira = await naLoja(pagina, (l) => l.catalogo.foco())
    await pagina.keyboard.press('ArrowRight')
    await pagina.waitForFunction((id) => import('/app/estado.js').then(({ loja }) => loja.catalogo.foco() !== id), primeira)
    await pronta(pagina)
    await pagina.keyboard.press('Control+Shift+v')
    await pagina.waitForTimeout(300)
    assert.equal(await naLoja(pagina, (l) => l.catalogo.foto(l.catalogo.foco()).ajustes?.luz.exposicao), expo)
    assert.equal(await valorDe(pagina, 'luz.exposicao'), `${expo > 0 ? '+' : '−'}${Math.abs(expo).toFixed(2).replace('.', ',')} EV`)
    // a foto pronta mostra o histograma da tela e diz que não há margem além
    await pagina.waitForSelector('.margem:not([data-raw])')
    assert.match(await pagina.locator('.margem-frases').innerText(), /não guarda/)
    await captura(pagina, '1440-claro-jpeg')
    await pagina.keyboard.press('ArrowLeft')
    await pagina.waitForFunction((id) => import('/app/estado.js').then(({ loja }) => loja.catalogo.foco() === id), primeira)
    await pronta(pagina)

    // exportar esta foto: Instagram (sRGB) → um JPEG que abre
    await pagina.locator('[data-exportar]').click()
    await pagina.locator('[data-saida="instagram"]').click()
    const [baixado] = await Promise.all([pagina.waitForEvent('download', { timeout: ESPERA }), pagina.locator('[data-exportar-ir]').click()])
    const caminho = await baixado.path()
    const bytes = readFileSync(caminho)
    assert.equal(bytes[0], 0xff)
    assert.equal(bytes[1], 0xd8)
    assert.match(baixado.suggestedFilename(), /^IMG_0001\.jpg$/)
    const aberto = await pagina.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const bm = await createImageBitmap(new Blob([bin], { type: 'image/jpeg' }))
      return [bm.width, bm.height]
    }, bytes.toString('base64'))
    assert.deepEqual(aberto, [1200, 800])
    await pagina.waitForSelector('.folha-exportar [data-pronto]')
    await pagina.keyboard.press('Escape')

    // quadros por segundo arrastando a exposição (JS nesta máquina, sem placa de verdade)
    const qps = await medirArrasto(pagina)
    const motor = await pagina.evaluate(() => document.querySelector('[data-motor-lento]') ? 'js' : 'gpu')
    console.log(`# arrastando a exposição: ${qps} quadros/s (${motor})`)
    assert.ok(qps > 1, `${qps} quadros/s`)
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

test('revelar na placa (SwiftShader): antes/depois e avisos da própria sessão, conta-gotas, escuro', { skip: semChromium, timeout: 300_000 }, async () => {
  const { contexto, pagina, olho } = await abrirRevelar({ motor: 'gpu', tema: 'escuro' })
  try {
    assert.equal(await pagina.locator('[data-motor-lento]').count(), 0)
    await captura(pagina, '1440-escuro')
    const exp = pagina.locator('.rv-ajuste[data-caminho="luz.exposicao"] input')
    await exp.focus()
    const n0 = await quadros(pagina)
    for (let i = 0; i < 15; i++) await pagina.keyboard.press('Shift+ArrowLeft')
    await esperarQuadro(pagina, n0)
    await pagina.locator('.palco-revelar').click({ position: { x: 30, y: 30 } })
    const media0 = await mediaDoPalco(pagina)
    await pagina.keyboard.press('\\')
    await pagina.waitForSelector('.divisoria', { state: 'attached' })
    await pagina.waitForTimeout(500)
    const media1 = await mediaDoPalco(pagina)
    assert.notEqual(Math.round(media0), Math.round(media1), 'o antes aparece à esquerda da divisória')
    await pagina.keyboard.press('\\')
    await pagina.keyboard.press('j')
    await pagina.waitForSelector('.palco-legenda [data-l="recuperavel"]')
    await pagina.keyboard.press('j')
    // conta-gotas (W): o branco vira manual e muda
    await pagina.locator('.rv-grupo[data-grupo="cor"] [data-gota]').click()
    const caixa = await pagina.locator('.rv-visor:not(.rv-visor--antes) .palco-canvas').boundingBox()
    await pagina.mouse.click(caixa.x + caixa.width * 0.3, caixa.y + caixa.height * 0.5)
    await pagina.waitForFunction(() => !document.querySelector('.palco-revelar.modo-gota'))
    const branco = await naLoja(pagina, (l) => l.catalogo.foto(l.catalogo.foco()).ajustes?.branco)
    assert.equal(branco?.modo, 'manual')
    const qps = await medirArrasto(pagina)
    console.log(`# arrastando a exposição: ${qps} quadros/s (placa, SwiftShader)`)
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

test('revelar no celular (390 px): folha de baixo, sem rolar de lado, alvos de 44 px, claro e escuro', { skip: semChromium, timeout: 300_000 }, async () => {
  for (const tema of ['claro', 'escuro']) {
    const { contexto, pagina, olho } = await abrirRevelar({ opcoes: CELULAR, tema })
    try {
      const folha = await pagina.locator('.painel-revelar').boundingBox()
      const dock = await pagina.locator('.dock').boundingBox()
      assert.ok(Math.abs(folha.y + folha.height - dock.y) < 1.5 && folha.width === 390, `folha ${JSON.stringify(folha)}`)
      const palco = await pagina.locator('.palco-revelar').boundingBox()
      assert.ok(palco.height > 250, 'a foto tem espaço')
      await semRolarDeLado(pagina)
      assert.deepEqual(await alvosPequenos(pagina), [])
      await captura(pagina, `390-${tema}`)
      await pagina.locator('.folha-puxador').tap()
      await pagina.waitForTimeout(600)
      const alta = await pagina.locator('.painel-revelar').boundingBox()
      assert.ok(alta.height > folha.height + 150, 'a folha sobe')
      await semRolarDeLado(pagina)
      assert.deepEqual(await alvosPequenos(pagina), [])
      await captura(pagina, `390-${tema}-folha`)
      limpo(olho)
    } finally {
      await contexto.close()
    }
  }
})

async function semRolarDeLado(pagina) {
  const m = await pagina.evaluate(() => ({
    pagina: document.scrollingElement.scrollWidth,
    janela: innerWidth,
    largos: [...document.querySelectorAll('#app *')]
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5 && !e.closest('.rv-tira') && e.getBoundingClientRect().width > 0)
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`)
      .slice(0, 5),
  }))
  assert.equal(m.pagina, m.janela, 'a página rola de lado')
  assert.deepEqual(m.largos, [])
}

/** Os alvos de toque visíveis menores que 44 × 44 (contando o ::before invisível que estende a área). */
const alvosPequenos = (pagina) =>
  pagina.evaluate(() => {
    const ruins = []
    for (const el of document.querySelectorAll('.revelar button, .revelar [role="radio"], .revelar input, .revelar [role="slider"]')) {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (!r.width || !r.height || s.visibility === 'hidden' || s.pointerEvents === 'none' || el.closest('[hidden], .so-leitor')) continue
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
      const nome = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)
      if (l < 43.5 || a < 43.5) ruins.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${nome}" ${Math.round(l)}×${Math.round(a)}`)
    }
    return ruins
  })
