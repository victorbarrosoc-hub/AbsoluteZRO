// A tela Decupar no Chromium, pelo servidor local com os cabeçalhos de produção, sobre 120 fotos fabricadas com semente
// (nada de gente: texturas, formas e números). Cada bloco de 10 tem: uma cena nítida, a mesma cena 1 s depois um pouco
// mais mole (andou 0,6%), a mesma cena borrada 2 s depois, outra nítida, uma borrada sozinha, uma estourada sozinha e
// quatro nítidas. No último bloco, três fotos são RAW (DNG fabricado com a prévia, com a extensão .ARW). Confere:
//   - a análise começa sozinha ao abrir, mostra o andamento e termina;
//   - os baldes e os filtros de motivo contam o que o filtro mostra;
//   - a meta "quero cerca de N" muda os baldes na hora, sem analisar nada de novo, e sai devolvendo os de antes;
//   - o modo Cenas: → aceita a escolhida e passa (a escolhida é a mais nítida), ↓ anda na cena, S troca;
//   - "Aceitar sugestões" marca e o desfazer volta; P, X e 1–5 na grade (com o voo até o balde);
//   - a lupa explica a nota e a sobreposição liga com O;
//   - "Gravar estrelas" entrega um .zip com .xmp válidos (lerSidecarXmp) nos caminhos dos RAW;
//   - 390 px sem rolar de lado e com alvos de 44 px; claro e escuro; sem erro de console nem violação da CSP.
// Capturas em FOTO_TELAS (ou numa pasta temporária): decupar-*.png.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { abrirChromium, comExif, dngFabricado, EXIGIR, pastaDasTelas, semChromium, subirApp, vigiar } from './apoio-tela.js'
import { lerSidecarXmp } from '../src/exportar/xmp.js'

const TELAS = pastaDasTelas()
const QUANTAS = 120
const BLOCO = 10
const ESPERA = 300_000
const RAWS = [QUANTAS - 3, QUANTAS - 2, QUANTAS - 1] // as três últimas (nítidas, sozinhas) são RAW
const dois = (n) => String(n).padStart(2, '0')
const nomeDa = (i) => `IMG_${String(i + 1).padStart(4, '0')}.${RAWS.includes(i) ? 'ARW' : 'JPG'}`
function horaDa(i) {
  const b = Math.floor(i / BLOCO)
  const k = i % BLOCO
  const s = b * 400 + (k <= 2 ? k : k * 40)
  return `2026-11-13T${dois(9 + Math.floor(s / 3600))}:${dois(Math.floor(s / 60) % 60)}:${dois(s % 60)}`
}

let app, navegador, arquivos

/** Desenha as fotos no canvas do Chromium (gerador com semente) e devolve os arquivos para setInputFiles. */
async function fabricar() {
  const p = await navegador.newPage()
  try {
    const lista = await p.evaluate(
      async ({ quantas, bloco }) => {
        const L = 960
        const A = 640
        const semeado = (a) => () => {
          a = (a + 0x6d2b79f5) | 0
          let t = Math.imul(a ^ (a >>> 15), 1 | a)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
        const cena = new OffscreenCanvas(L, A)
        const cc = cena.getContext('2d')
        function desenharCena(semente, dx) {
          const r = semeado(semente)
          cc.setTransform(1, 0, 0, 1, 0, 0)
          const g = cc.createLinearGradient(0, 0, L, A)
          g.addColorStop(0, `hsl(${r() * 360} 45% 55%)`)
          g.addColorStop(1, `hsl(${r() * 360} 50% 25%)`)
          cc.fillStyle = g
          cc.fillRect(0, 0, L, A)
          cc.translate(dx, 0)
          for (let i = 0; i < 160; i++) {
            cc.fillStyle = `hsl(${r() * 360} ${30 + r() * 50}% ${15 + r() * 60}%)`
            const w = 8 + r() * 90
            const h = 8 + r() * 90
            if (r() < 0.5) cc.fillRect(r() * L - 20, r() * A - 20, w, h)
            else {
              cc.beginPath()
              cc.arc(r() * L, r() * A, w / 2, 0, Math.PI * 2)
              cc.fill()
            }
          }
          for (let i = 0; i < 900; i++) {
            cc.strokeStyle = `hsl(${r() * 360} 40% ${r() < 0.5 ? 12 : 80}%)`
            cc.lineWidth = 1 + r()
            const x = r() * L
            const y = r() * A
            cc.beginPath()
            cc.moveTo(x, y)
            cc.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30)
            cc.stroke()
          }
          cc.font = '700 90px sans-serif'
          cc.fillStyle = 'rgb(20 20 20)'
          cc.fillText(String(semente), 60, 120)
        }
        const saida = new OffscreenCanvas(L, A)
        const c = saida.getContext('2d')
        const fotos = []
        for (let i = 0; i < quantas; i++) {
          const b = Math.floor(i / bloco)
          const k = i % bloco
          desenharCena(1000 + b * bloco + (k <= 2 ? 0 : k), k === 1 ? 6 : 0)
          c.filter = k === 2 || k === 4 ? 'blur(5px)' : k === 1 ? 'blur(0.8px)' : 'none'
          c.drawImage(cena, 0, 0)
          c.filter = 'none'
          if (k === 5) {
            c.fillStyle = 'rgb(255 255 255)'
            c.fillRect(0, 0, L, A * 0.45)
          }
          const blob = await saida.convertToBlob({ type: 'image/jpeg', quality: 0.88 })
          const bytes = new Uint8Array(await blob.arrayBuffer())
          let texto = ''
          for (let j = 0; j < bytes.length; j += 0x8000) texto += String.fromCharCode(...bytes.subarray(j, j + 0x8000))
          fotos.push(btoa(texto))
        }
        return fotos
      },
      { quantas: QUANTAS, bloco: BLOCO },
    )
    return lista.map((b64, i) => {
      const jpeg = Buffer.from(b64, 'base64')
      if (RAWS.includes(i))
        return { name: nomeDa(i), mimeType: 'application/octet-stream', buffer: dngFabricado(jpeg, { largura: 960, altura: 640, data: horaDa(i) }) }
      return { name: nomeDa(i), mimeType: 'image/jpeg', buffer: comExif(jpeg, { data: horaDa(i) }) }
    })
  } finally {
    await p.close()
  }
}

before(async () => {
  if (semChromium) return
  app = await subirApp()
  navegador = await abrirChromium()
  arquivos = await fabricar()
})
after(async () => {
  await navegador?.close()
  await app?.fechar()
})

test('Chromium é exigido no CI', { skip: !EXIGIR }, () => {
  assert.equal(semChromium, false, 'FOTO_EXIGIR=1 e o Playwright não está instalado')
})

const CELULAR = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }

/** Uma página do app com as fotos abertas. `camadas`: as camadas de visão pedidas (padrão: o da tela). */
async function abrir({ opcoes = {}, tema, camadas } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...opcoes })
  if (tema) await contexto.addCookies([{ name: 'foto_tema', value: tema, url: app.base }])
  if (camadas) await contexto.addInitScript((v) => localStorage.setItem('foto_decupar_camadas', v), JSON.stringify(camadas))
  contexto.setDefaultTimeout(ESPERA)
  const pagina = await contexto.newPage()
  const olho = vigiar(pagina, app.base)
  await pagina.goto(`${app.base}/`)
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  await pagina.evaluate(async () => {
    const loja = (await import('/app/estado.js')).loja
    const e = (await import('/app/telas/decupar/esteira.js')).esteiraDa(loja)
    self.__log = []
    e.assinar((s) =>
      self.__log.push(
        `${s.trabalho} ${s.analise.situacao} ${s.analise.feitas}/${s.analise.total} cat=${loja.catalogo.tamanho} lendo=${JSON.stringify(loja.lendo())}`,
      ),
    )
  })
  await pagina.setInputFiles('input[data-escolher]', arquivos)
  await pagina.waitForFunction((n) => document.querySelector('.pilula[data-valor="todas"] .pilula-n')?.textContent.trim() === String(n), QUANTAS)
  return { contexto, pagina, olho }
}
const limpo = (olho) =>
  assert.deepEqual({ erros: olho.erros, falhas: olho.falhas, ruins: olho.ruins, fora: olho.fora }, { erros: [], falhas: [], ruins: [], fora: [] })
const captura = (pagina, nome) => pagina.screenshot({ path: join(TELAS, `decupar-${nome}.png`) })

/** Roda `f(loja, esteira, arg)` na página (pelo protocolo do navegador, não por eval: a CSP de produção vale). */
async function naPagina(pagina, f, arg = null) {
  await pagina.evaluate(async () => {
    if (self.__esteira) return
    self.__loja = (await import('/app/estado.js')).loja
    self.__esteira = (await import('/app/telas/decupar/esteira.js')).esteiraDa(self.__loja)
  })
  return pagina.evaluate(`(${f.toString()})(self.__loja, self.__esteira, ${JSON.stringify(arg)})`)
}
async function esperarAnalise(pagina) {
  await naPagina(pagina, () => true)
  await pagina.waitForFunction(() => {
    const e = self.__esteira.estado().analise
    return e.situacao === 'pronta' && e.total > 0 && e.feitas === e.total
  })
}
const numero = (pagina, seletor) =>
  pagina
    .locator(seletor)
    .innerText()
    .then((t) => Number(t.replace(/\D/g, '')))

const semRolarDeLado = async (pagina, onde) => {
  const m = await pagina.evaluate(() => ({
    pagina: document.scrollingElement.scrollWidth,
    janela: innerWidth,
    largos: [...document.querySelectorAll('#app *')]
      .filter(
        (e) =>
          e.getBoundingClientRect().right > innerWidth + 0.5 &&
          !e.closest('.pilulas--rola') &&
          getComputedStyle(e).position !== 'fixed' &&
          e.getBoundingClientRect().width > 0,
      )
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`)
      .slice(0, 5),
  }))
  assert.equal(m.pagina, m.janela, `${onde}: a página rola de lado`)
  assert.deepEqual(m.largos, [], `${onde}: elementos passando da borda`)
}
const alvosPequenos = (pagina) =>
  pagina.evaluate(() => {
    const ruins = []
    for (const el of document.querySelectorAll('button, a[href], [role="option"], [role="radio"], input:not([type="file"]), select, summary')) {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (!r.width || !r.height || s.visibility === 'hidden' || s.pointerEvents === 'none' || el.closest('[hidden], .so-leitor, [inert]')) continue
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
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
      if (l < 43.5 || a < 43.5)
        ruins.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')} "${nome.trim().slice(0, 24)}" ${Math.round(l)}×${Math.round(a)}`)
    }
    return ruins
  })

/** Lê um .zip sem compressão (o que a tela gera): [{ nome, texto }]. */
function lerZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const saida = []
  let p = 0
  while (p + 30 <= bytes.length && v.getUint32(p, true) === 0x04034b50) {
    assert.equal(v.getUint16(p + 8, true), 0, 'método store')
    const tamanho = v.getUint32(p + 18, true)
    const nomeL = v.getUint16(p + 26, true)
    const extra = v.getUint16(p + 28, true)
    const nome = Buffer.from(bytes.subarray(p + 30, p + 30 + nomeL)).toString('utf8')
    const ini = p + 30 + nomeL + extra
    saida.push({ nome, texto: Buffer.from(bytes.subarray(ini, ini + tamanho)).toString('utf8') })
    p = ini + tamanho
  }
  return saida
}

test(
  'decupar 120 fotos: começa sozinha, baldes e filtros, meta ao vivo, cenas, aceitar, atalhos, sobreposição e .xmp',
  { skip: semChromium, timeout: 900_000 },
  async (t) => {
    const { contexto, pagina, olho } = await abrir()
    try {
      // ───── começa sozinha, com o andamento à vista ─────
      await pagina.waitForSelector('.dec-andamento[data-situacao="rodando"], .dec-andamento[data-situacao="preparando"]')
      await pagina.waitForFunction(() => /\d+ de 120/.test(document.querySelector('.dec-andamento-texto')?.textContent ?? ''))
      await pagina.waitForTimeout(1500)
      await captura(pagina, 'andamento-1440-claro')
      const t0 = Date.now()
      await esperarAnalise(pagina)
      const fim = await naPagina(pagina, (loja, esteira) => esteira.estado().analise)
      console.log((await pagina.evaluate(() => self.__log)).filter((x, i, a) => x !== a[i - 1]).join('\n'))
      t.diagnostic(
        `análise: ${fim.novas} fotos em ${((Date.now() - t0) / 1000).toFixed(0)} s depois do primeiro andamento; camadas ${JSON.stringify(fim.camadas)}`,
      )
      assert.equal(fim.feitas, QUANTAS)
      assert.equal(fim.puladas, 0, fim.erro ?? '')
      assert.ok(fim.camadas.rostos === 'pronta' || fim.camadas.rostos === 'indisponivel', JSON.stringify(fim.camadas))
      assert.equal(fim.camadas.objetos, 'desligada')
      await pagina.waitForSelector('.dec-andamento[data-situacao="pronta"]')

      // ───── os baldes contam o que o catálogo diz, e filtram ─────
      const dados = () =>
        naPagina(pagina, (loja) =>
          loja.catalogo.fotos().map((f) => ({
            id: f.id,
            nome: f.nome,
            balde: f.magnitude?.balde,
            motivos: f.magnitude?.motivos ?? [],
            grupo: f.grupo,
            escolha: f.escolha,
            q: f.medidas?.nitidez?.qLocal ?? null,
            marca: f.marca,
            estrelas: f.estrelas,
            medidas: !!f.medidas,
          })),
        )
      const fotos = await dados()
      const porBalde = (b) => fotos.filter((f) => f.balde === b).length
      const baldes = {}
      for (const b of ['fica', 'talvez', 'fora']) {
        baldes[b] = await numero(pagina, `.dec-balde[data-valor="${b}"] .pilula-n`)
        assert.equal(baldes[b], porBalde(b), `balde ${b}`)
      }
      assert.equal(baldes.fica + baldes.talvez + baldes.fora, QUANTAS)
      t.diagnostic(`baldes: ${JSON.stringify(baldes)}`)
      await pagina.locator('.dec-balde[data-valor="fora"]').click()
      const noFora = await naPagina(pagina, (loja) => loja.catalogo.itens().map((i) => i.foto.magnitude?.balde))
      assert.ok(noFora.length > 0 && noFora.every((b) => b === 'fora'), JSON.stringify(noFora))
      await captura(pagina, 'fora-1440-claro')
      await pagina.locator('.dec-balde[data-valor="fora"]').click()

      // motivos: a pílula diz quantas o filtro vai mostrar
      const comMotivo = (busca) => fotos.filter((f) => f.motivos.some((m) => m.toLowerCase().includes(busca))).length
      const borradas = await numero(pagina, '.dec-filtros .pilula[data-valor="borradas"] .pilula-n')
      const estouradas = await numero(pagina, '.dec-filtros .pilula[data-valor="estouradas"] .pilula-n')
      assert.equal(borradas, comMotivo('fora de foco'))
      assert.equal(estouradas, comMotivo('altas luzes'))
      assert.ok(borradas >= 12, `borradas: ${borradas}`)
      assert.ok(estouradas >= 12, `estouradas: ${estouradas}`)
      await pagina.locator('.dec-filtros .pilula[data-valor="borradas"]').click()
      const filtradas = await naPagina(pagina, (loja) => ({
        n: loja.catalogo.fotos().filter((f) => (f.magnitude?.motivos ?? []).some((m) => m.toLowerCase().includes('fora de foco'))).length,
        todas: loja.catalogo.itens().every((i) => i.foto.magnitude.motivos.some((m) => m.toLowerCase().includes('fora de foco'))),
      }))
      assert.equal(filtradas.n, borradas)
      assert.ok(filtradas.todas)
      await pagina.locator('.dec-filtros .pilula[data-valor="borradas"]').click()
      // repetidas: as reservas de cada momento, escondidas atrás da melhor
      const grupos = new Map()
      for (const f of fotos) if (f.grupo) grupos.set(f.grupo, [...(grupos.get(f.grupo) ?? []), f])
      assert.equal(grupos.size, QUANTAS / BLOCO, 'um momento repetido por bloco')
      assert.equal(await numero(pagina, '.dec-filtros .pilula[data-valor="repetidas"] .pilula-n'), (QUANTAS / BLOCO) * 2)
      // escolhidas pelo cliente: a pílula só existe quando a galeria trouxe alguma
      assert.equal(await pagina.locator('.dec-filtros .pilula[data-valor="cliente"]').count(), 0)
      await naPagina(pagina, (loja) => {
        const ids = loja.catalogo
          .fotos()
          .filter((f) => !f.grupo)
          .map((f) => f.id)
        loja.catalogo.atualizarVarias([
          { id: ids[3], cliente: { galeria: 'g', escolhida: true, comentario: null, etiquetas: [] } },
          { id: ids[13], cliente: { galeria: 'g', escolhida: true, comentario: 'Mais clara', etiquetas: [] } },
          { id: ids[23], cliente: { galeria: 'g', escolhida: false, comentario: null, etiquetas: ['recortar'] } },
        ])
      })
      await pagina.locator('.dec-filtros .pilula[data-valor="cliente"]').waitFor()
      assert.equal(await numero(pagina, '.dec-filtros .pilula[data-valor="cliente"] .pilula-n'), 2)
      await pagina.locator('.dec-filtros .pilula[data-valor="cliente"]').click()
      const doCliente = await naPagina(pagina, (loja) => loja.catalogo.itens().map((i) => !!i.foto.cliente?.escolhida))
      assert.deepEqual(doCliente, [true, true])
      await pagina.locator('.dec-filtros .pilula[data-valor="cliente"]').click()
      assert.equal(await naPagina(pagina, (loja) => loja.catalogo.filtroAtivo()), false)
      await naPagina(pagina, (loja) =>
        loja.catalogo.atualizarVarias(
          loja.catalogo
            .fotos()
            .filter((f) => f.cliente)
            .map((f) => ({ id: f.id, cliente: null })),
        ),
      )
      await pagina.locator('.dec-filtros .pilula[data-valor="cliente"]').waitFor({ state: 'detached' })

      // ───── meta ao vivo: os baldes mudam na hora, e nada é analisado de novo ─────
      const antesDaMeta = await naPagina(pagina, (loja, esteira) => ({ novas: esteira.estado().analise.novas, medir: esteira.estado().analise.tempos.medir }))
      await pagina.locator('.dec-meta > button').click()
      const t1 = Date.now()
      await pagina.locator('.dec-meta-quadro input[type="range"]').fill('30')
      await pagina.waitForFunction(() => document.querySelector('.dec-balde[data-valor="fica"] .pilula-n')?.textContent.trim() === '30')
      const levou = Date.now() - t1
      const comMeta = await dados()
      assert.equal(comMeta.filter((f) => f.balde === 'fica').length, 30)
      // cada momento entra antes de qualquer repetida: nenhum grupo com duas no Fica
      const noFica = comMeta.filter((f) => f.balde === 'fica' && f.grupo).map((f) => f.grupo)
      assert.equal(new Set(noFica).size, noFica.length, 'a meta não leva duas do mesmo momento')
      const depoisDaMeta = await naPagina(pagina, (loja, esteira) => ({ novas: esteira.estado().analise.novas, medir: esteira.estado().analise.tempos.medir }))
      assert.deepEqual(depoisDaMeta, antesDaMeta, 'a meta não analisou nada de novo')
      t.diagnostic(`meta 30: baldes trocados em ${levou} ms`)
      await pagina.waitForTimeout(700)
      await captura(pagina, 'meta-1440-claro')
      await pagina.locator('.dec-meta-quadro .vidro').click()
      await pagina.waitForFunction((n) => document.querySelector('.dec-balde[data-valor="fica"] .pilula-n')?.textContent.trim() === String(n), baldes.fica)

      // ───── modo Cenas ─────
      await pagina.locator('.foto').first().click()
      await pagina.keyboard.press('c')
      await pagina.waitForSelector('.cenas .lupa .quadro-moldura img')
      assert.match(await pagina.locator('.cena-titulo').innerText(), /Cena\s+1\s+de\s+12/)
      const cenaAtual = () =>
        naPagina(pagina, (loja) => {
          const c = loja.catalogo
          const foco = c.foto(c.foco())
          const membros = c.fotos().filter((f) => f.grupo && f.grupo === foco.grupo)
          return { foco: foco.id, grupo: foco.grupo, qs: membros.map((f) => [f.id, f.medidas.nitidez.qLocal]), marcas: membros.map((f) => [f.id, f.marca]) }
        })
      const primeira = await cenaAtual()
      // a escolhida (em foco ao entrar) é a mais nítida da cena
      const maisNitida = primeira.qs.reduce((a, b) => (b[1] > a[1] ? b : a))
      assert.equal(primeira.foco, maisNitida[0], `a escolhida não é a mais nítida: ${JSON.stringify(primeira.qs)}`)
      assert.equal(await pagina.locator('.tira-foto[aria-selected="true"]').getAttribute('data-escolhida'), '')
      await pagina.waitForTimeout(700)
      await captura(pagina, 'cenas-1440-claro')
      // → aceita a escolhida e passa para a próxima cena
      await pagina.keyboard.press('ArrowRight')
      await pagina.waitForFunction(() => /Cena\s+2\s+de/.test(document.querySelector('.cena-titulo')?.textContent ?? ''))
      const marcada = await naPagina(pagina, (loja, esteira, id) => loja.catalogo.foto(id).marca, primeira.foco)
      assert.equal(marcada, 'escolhida', '→ aceitou a escolhida da cena 1')
      const segunda = await cenaAtual()
      assert.notEqual(segunda.grupo, primeira.grupo)
      // ↓ anda dentro da cena; S troca a escolhida
      await pagina.keyboard.press('ArrowDown')
      const outra = await naPagina(pagina, (loja) => loja.catalogo.foco())
      assert.notEqual(outra, segunda.foco)
      assert.ok(segunda.qs.some(([id]) => id === outra))
      await pagina.keyboard.press('s')
      const trocada = await cenaAtual()
      const marcas = Object.fromEntries(trocada.marcas)
      assert.equal(marcas[outra], 'escolhida')
      assert.equal(await pagina.locator('.tira-foto[data-escolhida]').getAttribute('data-id'), outra)
      await pagina.waitForSelector('.aviso')
      t.diagnostic(`S: "${await pagina.locator('.aviso').innerText()}"`)
      // a sobreposição e o painel também valem nas cenas
      await pagina.keyboard.press('o')
      await pagina.waitForSelector('.cenas .sobre .sobre-foco rect')
      await pagina.waitForTimeout(500)
      await captura(pagina, 'cenas-sobreposicao-1440-claro')
      await pagina.keyboard.press('o')
      // conta de toques: as 12 cenas com uma tecla cada
      let toques = 2
      for (let k = 2; k < 12; k++) {
        await pagina.keyboard.press('ArrowRight')
        toques++
        await pagina.waitForTimeout(80)
      }
      await pagina.keyboard.press('ArrowRight')
      toques++
      await pagina.waitForSelector('.cenas-fim')
      await pagina.waitForTimeout(900)
      t.diagnostic(`cenas: 12 momentos decididos com ${toques} teclas (→ por cena, ↓ e S numa delas)`)
      await captura(pagina, 'cenas-fim-1440-claro')
      await pagina.keyboard.press('Escape')
      await pagina.waitForSelector('.cenas', { state: 'detached' })
      const escolhidasNasCenas = (await dados()).filter((f) => f.marca === 'escolhida' && f.grupo)
      assert.equal(escolhidasNasCenas.length, 12)

      // ───── aceitar sugestões (com desfazer) ─────
      await naPagina(pagina, (loja) => {
        while (loja.catalogo.desfazer());
        return true
      })
      await pagina.waitForSelector('.dec-principal[data-acao="aceitar"]')
      await pagina.locator('.dec-principal').click()
      await pagina.waitForSelector('dialog.folha-aceitar[open] [data-acao="confirmar-aceitar"]')
      const plano = await naPagina(pagina, (loja, esteira) => {
        const p = esteira.planoDeAceitar()
        return { escolhidas: p.escolhidas, rejeitadas: p.rejeitadas }
      })
      await pagina.waitForTimeout(700)
      await captura(pagina, 'aceitar-1440-claro')
      await pagina.locator('[data-acao="confirmar-aceitar"]').click()
      const aceitas = await dados()
      assert.equal(aceitas.filter((f) => f.marca === 'escolhida').length, plano.escolhidas)
      assert.equal(aceitas.filter((f) => f.marca === 'rejeitada').length, plano.rejeitadas)
      assert.ok(plano.escolhidas > 0 && plano.rejeitadas > 0, JSON.stringify(plano))
      // as reservas de cada momento não viram escolhidas (a melhor já é)
      for (const lista of grupos.values()) assert.ok(lista.map((f) => aceitas.find((x) => x.id === f.id)).filter((f) => f.marca === 'escolhida').length <= 1)
      assert.match(await pagina.locator('.dec-principal').innerText(), new RegExp(`Tratar as ${plano.escolhidas} escolhidas`))
      await pagina.keyboard.press('Control+z')
      const desfeitas = await dados()
      assert.equal(desfeitas.filter((f) => f.marca).length, 0, 'desfazer volta tudo de uma vez')
      assert.equal(desfeitas.filter((f) => f.estrelas).length, 0)

      // ───── atalhos na grade: P, X, 1–5 (e a miniatura voa até o balde) ─────
      const ids = await naPagina(pagina, (loja) => {
        const ids = loja.catalogo.itens().map((i) => i.foto.id)
        loja.catalogo.selecionar(ids[0]) // a grade rola até ela
        return ids
      })
      await pagina.locator(`.foto[data-id="${ids[0]}"]`).click()
      await pagina.evaluate(() => {
        self.__voos = 0
        new MutationObserver((l) => l.forEach((m) => m.addedNodes.forEach((n) => n.classList?.contains('voo') && self.__voos++))).observe(document.body, {
          childList: true,
        })
      })
      await pagina.keyboard.press('p')
      await pagina.keyboard.press('ArrowRight')
      await pagina.keyboard.press('x')
      for (const [k, n] of [
        [2, 1],
        [3, 3],
        [4, 5],
      ]) {
        await naPagina(pagina, (loja, esteira, id) => loja.catalogo.selecionar(id), ids[k])
        await pagina.keyboard.press(String(n))
      }
      const marcadas = Object.fromEntries((await dados()).map((f) => [f.id, f]))
      assert.equal(marcadas[ids[0]].marca, 'escolhida')
      assert.equal(marcadas[ids[1]].marca, 'rejeitada')
      assert.deepEqual(
        [2, 3, 4].map((k) => marcadas[ids[k]].estrelas),
        [1, 3, 5],
      )
      await pagina.waitForTimeout(200)
      assert.ok((await pagina.evaluate(() => self.__voos)) >= 2, 'P e X fazem a miniatura voar até a pílula')
      assert.equal(await numero(pagina, '.grade-barra .pilula[data-valor="escolhida"] .pilula-n'), 1)

      // ───── a lupa explica; O liga a sobreposição ─────
      const borrada = (await dados()).find((f) => !f.grupo && f.motivos.some((m) => m.toLowerCase().includes('fora de foco')))
      await naPagina(pagina, (loja, esteira, id) => loja.catalogo.selecionar(id), borrada.id)
      await pagina.keyboard.press('e')
      await pagina.waitForSelector('.lupa .quadro-moldura img')
      await pagina.waitForSelector('.lupa-painel .explica-numero')
      assert.match(await pagina.locator('.lupa-painel .explica-motivos').innerText(), /foco|Única/i)
      assert.equal(await pagina.locator('.sobre').count(), 0)
      await pagina.keyboard.press('o')
      await pagina.waitForSelector('.lupa .sobre .sobre-foco rect')
      assert.ok((await pagina.locator('.lupa .sobre .sobre-foco rect').count()) > 20)
      await pagina.waitForTimeout(600)
      await captura(pagina, 'lupa-sobreposicao-1440-claro')
      await pagina.keyboard.press('i')
      assert.equal(await pagina.locator('.lupa-painel').isHidden(), true)
      await pagina.keyboard.press('i')
      await pagina.keyboard.press('o')
      await pagina.keyboard.press('g')
      await pagina.waitForSelector('.lupa', { state: 'detached' })

      // ───── gravar estrelas: um .zip com um .xmp por RAW decidido ─────
      // "Aceitar sugestões" de novo (agora no menu ⋯, porque já há escolhida): os RAW ganham estrelas e marca
      await pagina.locator('.dec-barra .menu > button[aria-label="Mais"]').click()
      await pagina.locator('.dec-barra .menu-item', { hasText: 'Aceitar sugestões' }).click()
      await pagina.locator('[data-acao="confirmar-aceitar"]').click()
      await pagina.locator('.dec-barra .menu > button[aria-label="Mais"]').click()
      await pagina.locator('.dec-barra .menu-item', { hasText: 'Gravar estrelas' }).click()
      await pagina.waitForSelector('dialog.folha-gravar[open] [data-acao="confirmar-gravar"]')
      assert.equal(await numero(pagina, '.gravar-numero b'), RAWS.length)
      await pagina.waitForTimeout(700)
      await captura(pagina, 'gravar-1440-claro')
      const [baixado] = await Promise.all([pagina.waitForEvent('download'), pagina.locator('[data-acao="confirmar-gravar"]').click()])
      const caminho = await baixado.path()
      const zip = lerZip(new Uint8Array(readFileSync(caminho)))
      assert.deepEqual(
        zip.map((z) => z.nome).sort(),
        RAWS.map((i) => nomeDa(i).replace(/\.ARW$/, '.xmp')),
      )
      const finais = Object.fromEntries((await dados()).map((f) => [f.nome, f]))
      for (const z of zip) {
        const x = lerSidecarXmp(z.texto)
        assert.ok(x, `${z.nome} não é XMP`)
        const f = finais[z.nome.replace(/\.xmp$/, '.ARW')]
        assert.equal(x.estrelas, f.estrelas, z.nome)
        assert.equal(x.marca, f.marca ?? null, z.nome)
      }
      t.diagnostic(`zip: ${zip.map((z) => z.nome).join(', ')}`)

      // ───── na pasta (com permissão de escrita): o .xmp que já existia é atualizado sem perder nada ─────
      // (showDirectoryPicker não roda no Chromium automatizado; a pasta privada do navegador tem a mesma API de escrita)
      const ANTIGO = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" crs:Exposure2012="+0.50" xmp:Rating="1"/></rdf:RDF></x:xmpmeta>`
      const naPasta = await naPagina(
        pagina,
        async (loja, esteira, antigo) => {
          const { gravarNaPasta, caminhoDoXmp } = await import('/app/telas/decupar/gravar.js')
          const raiz = await navigator.storage.getDirectory()
          const fotos = loja.catalogo.fotos().filter((f) => f.formato === 'arw')
          const w = await (await raiz.getFileHandle(caminhoDoXmp(fotos[0]), { create: true })).createWritable()
          await w.write(antigo)
          await w.close()
          const r = await gravarNaPasta(raiz, fotos)
          const textos = {}
          for (const f of fotos) textos[f.nome] = await (await (await raiz.getFileHandle(caminhoDoXmp(f))).getFile()).text()
          return { r, textos, primeira: fotos[0].nome }
        },
        ANTIGO,
      )
      assert.deepEqual([naPasta.r.novos, naPasta.r.atualizados, naPasta.r.falhas.length], [RAWS.length - 1, 1, 0])
      for (const [nome, texto] of Object.entries(naPasta.textos)) assert.equal(lerSidecarXmp(texto).estrelas, finais[nome].estrelas, nome)
      assert.match(naPasta.textos[naPasta.primeira], /crs:Exposure2012="\+0\.50"/, 'o ajuste do Lightroom ficou')

      // ───── tratar as escolhidas: vai para Estilos com elas selecionadas ─────
      const escolhidas = (await dados()).filter((f) => f.marca === 'escolhida').length
      await pagina.locator('.dec-principal[data-acao="tratar"]').click()
      await pagina.waitForFunction(() => location.hash === '#/estilos')
      const selecionadas = await naPagina(pagina, (loja) => loja.catalogo.selecionadas().length)
      assert.equal(selecionadas, escolhidas)
      limpo(olho)
    } finally {
      await contexto.close()
    }
  },
)

test('escuro a 1440 e celular (390 px) nos dois temas: sem rolar de lado, alvos de 44 px, lupa e cenas', { skip: semChromium, timeout: 900_000 }, async () => {
  // aqui a análise roda só a parte clássica (a escolha da pessoa nos ajustes), para não repetir a camada de rostos
  {
    const { contexto, pagina, olho } = await abrir({ tema: 'escuro', camadas: [] })
    try {
      await esperarAnalise(pagina)
      await pagina.waitForTimeout(800)
      await captura(pagina, 'grade-1440-escuro')
      await pagina.locator('.foto').nth(1).dblclick()
      await pagina.waitForSelector('.lupa .lupa-painel .explica-numero')
      await pagina.keyboard.press('o')
      await pagina.waitForTimeout(800)
      await captura(pagina, 'lupa-1440-escuro')
      await pagina.keyboard.press('g')
      await pagina.waitForSelector('.lupa', { state: 'detached' })
      await pagina.locator('.dec-modo button[role="radio"]').nth(1).click()
      await pagina.waitForSelector('.cenas .lupa .quadro-moldura img')
      await pagina.waitForTimeout(800)
      await captura(pagina, 'cenas-1440-escuro')
      limpo(olho)
    } finally {
      await contexto.close()
    }
  }
  for (const tema of ['claro', 'escuro']) {
    const { contexto, pagina, olho } = await abrir({ opcoes: CELULAR, tema, camadas: [] })
    try {
      await esperarAnalise(pagina)
      await pagina.waitForTimeout(600)
      await semRolarDeLado(pagina, 'grade')
      assert.deepEqual(await alvosPequenos(pagina), [], 'grade')
      await captura(pagina, `grade-390-${tema}`)
      // tocar seleciona, tocar de novo abre a lupa; deslizar para cima escolhe
      await pagina.locator('.foto').nth(3).tap()
      await pagina.locator('.foto').nth(3).tap()
      await pagina.waitForSelector('.lupa .quadro-moldura img')
      await pagina.waitForTimeout(600)
      await semRolarDeLado(pagina, 'lupa')
      assert.deepEqual(await alvosPequenos(pagina), [], 'lupa')
      await captura(pagina, `lupa-390-${tema}`)
      const antes = await naPagina(pagina, (loja) => loja.catalogo.foco())
      const q = await pagina.locator('.quadro[data-principal]').boundingBox()
      await pagina.mouse.move(q.x + q.width / 2, q.y + q.height * 0.75)
      await pagina.mouse.down()
      await pagina.mouse.move(q.x + q.width / 2, q.y + q.height * 0.2, { steps: 6 })
      await pagina.mouse.up()
      assert.equal(await naPagina(pagina, (loja, esteira, id) => loja.catalogo.foto(id).marca, antes), 'escolhida', 'deslizar para cima escolhe')
      await pagina.locator('.lupa-barra button[aria-label="Por que esta nota"]').tap()
      await pagina.waitForSelector('.lupa-painel:not([hidden]) .explica')
      await pagina.waitForTimeout(500)
      await semRolarDeLado(pagina, 'lupa com painel')
      await captura(pagina, `lupa-painel-390-${tema}`)
      await pagina.locator('.lupa-painel .explica-fecha').tap()
      await pagina.locator('.lupa-barra button[aria-label="Voltar à grade"]').tap()
      await pagina.waitForSelector('.lupa', { state: 'detached' })
      // cenas no celular (pelo menu ⋯)
      await pagina.locator('.dec-barra .menu > button[aria-label="Mais"]').tap()
      await pagina.locator('.dec-barra .menu-item', { hasText: 'Ver por cenas' }).tap()
      await pagina.waitForSelector('.cenas .lupa .quadro-moldura img')
      await pagina.waitForTimeout(700)
      await semRolarDeLado(pagina, 'cenas')
      assert.deepEqual(await alvosPequenos(pagina), [], 'cenas')
      await captura(pagina, `cenas-390-${tema}`)
      limpo(olho)
    } finally {
      await contexto.close()
    }
  }
})

// ───────────────────────────── dúvidas, pessoas e calibração ─────────────────────────────

/**
 * Rostos FABRICADOS nas fotos (nada de gente: as fotos seguem sendo texturas). Quatro "pessoas", cada uma num lugar do
 * quadro (x = 60 + 230 × k): a 0 nas cenas de cada bloco, a 1 em parte delas, a 2 em quatro fotos e a 3 numa foto só,
 * a repetida borrada do bloco 5 (o momento já tem foto que fica, e a principal dela está borrada: vai para Fora). A
 * nitidez do rosto é a da foto, salvo a da pessoa 3, nítida (o rosto dela entra no centroide). As assinaturas vêm de um
 * assinador falso que devolve vetores fabricados: cada pessoa uma semente, cada rosto com cosseno 0,7 com ela.
 */
async function comPessoasFabricadas(pagina) {
  return naPagina(pagina, (loja, esteira) => {
    const c = loja.catalogo
    const fotos = c.fotos().slice().sort((a, b) => a.nome.localeCompare(b.nome))
    const rosto = (k, q, { largura = 130, principal = false, olhos = 'abertos' } = {}) => ({
      caixa: { x: 60 + 230 * k, y: 180 + 10 * k, largura, altura: Math.round(largura * 1.2) },
      confianca: 0.95,
      olhos,
      ear: olhos === 'fechados' ? 0.1 : 0.3,
      piscada: olhos === 'fechados' ? 0.8 : 0.05,
      aperto: 0.1,
      sorriso: 0.2,
      guinada: 0,
      nitidezOlhos: q,
      nitidezRosto: q,
      tamanho: largura / 960,
      peso: largura / 960,
      chave: true,
      principal,
      cortado: false,
      duvidoso: false,
      pontos: null,
    })
    const mudancas = []
    fotos.forEach((f, i) => {
      const k = i % 10
      const q = f.medidas.nitidez.qLocal
      const rostos = []
      if ([0, 1, 2, 3, 6].includes(k)) rostos.push(rosto(0, q, { largura: 150, principal: true, olhos: i % 20 === 6 ? 'fechados' : 'abertos' }))
      if ([0, 1, 2, 7].includes(k)) rostos.push(rosto(1, q, { principal: rostos.length === 0 }))
      if (k === 8 && i < 40) rostos.push(rosto(2, q, { principal: true }))
      if (i === 52) rostos.push(rosto(3, 0.86, { largura: 80 }))
      mudancas.push({ id: f.id, rostos, analise: { ...f.analise, camadas: ['rostos'] } })
    })
    c.atualizarVarias(mudancas)
    esteira.analise.refazerNota()
    // o assinador falso: o "quem" sai do lugar da caixa; o vetor, de uma semente por pessoa e outra por rosto
    const sorteio = (s) => () => {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r())
    const unit = (v) => {
      const n = Math.hypot(...v)
      return v.map((x) => x / n)
    }
    const base = (k) => {
      const r = sorteio(1000 + k)
      return unit(Array.from({ length: 128 }, () => gauss(r)))
    }
    let n = 0
    esteira.pessoas.usarAssinador({
      async pedir(tipo, dados) {
        if (tipo === 'preparar') return { ms: 0 }
        return {
          rostos: dados.rostos.map((x) => {
            const k = Math.round((x.caixa.x - 60) / 230)
            const b = base(k)
            const r = sorteio(5000 + n++)
            const ruido = unit(Array.from({ length: 128 }, () => gauss(r)))
            const v = unit(b.map((y, j) => 0.7 * y + 0.71 * ruido[j]))
            const m = Math.max(...v.map(Math.abs))
            return { i: x.i, v: Int8Array.from(v, (y) => Math.round((y / m) * 127)), nota: 0.9 }
          }),
        }
      },
      cancelarTudo() {},
    })
    return fotos[52].id
  })
}

const capturaDois = (pagina, nome) => pagina.screenshot({ path: join(TELAS, `decupar2-${nome}.png`) })

/** Liga o agrupamento pela folha (aviso → consentimento → Agrupar) e espera as pessoas. */
async function ligarPessoas(pagina, { capturar = null } = {}) {
  await pagina.locator('.dec-barra .menu > button[aria-label="Mais"]').click()
  await pagina.locator('.dec-barra .menu-item', { hasText: 'Agrupar por pessoa' }).click()
  await pagina.waitForSelector('dialog.folha-pessoas[open] .pessoas-aviso')
  assert.equal(await pagina.locator('[data-acao="ligar-pessoas"]').isDisabled(), true, 'sem consentimento não liga')
  if (capturar) {
    await pagina.waitForTimeout(500)
    await capturaDois(pagina, `folha-pessoas-${capturar}`)
  }
  await pagina.locator('.pessoas-consentimento input').check()
  await pagina.locator('[data-acao="ligar-pessoas"]').click()
  await pagina.waitForFunction(() => {
    const e = self.__esteira.estado().pessoas
    return e.ligado && e.situacao === 'pronto' && e.pessoas.length === 4
  })
}

test('dúvidas, pessoas e calibração: a fila cai a zero, o agrupamento só com consentimento e some ao esquecer, a calibração muda o limite', { skip: semChromium, timeout: 900_000 }, async (t) => {
  const { contexto, pagina, olho } = await abrir({ camadas: [] })
  try {
    await esperarAnalise(pagina)
    const daTia = await comPessoasFabricadas(pagina)

    // ───── modo Dúvidas: só o que está em dúvida, uma por vez, até zero ─────
    const fila = await naPagina(pagina, (loja, esteira) => esteira.duvidas().map((d) => ({ id: d.id, motivos: d.motivos, sugestao: d.sugestao })))
    assert.ok(fila.length >= 3, JSON.stringify(fila))
    const naBarra = await numero(pagina, '.dec-modo .dec-modo-n')
    assert.equal(naBarra, fila.length)
    t.diagnostic(`dúvidas: ${fila.length} de ${QUANTAS} (${[...new Set(fila.flatMap((d) => d.motivos))].join(', ')})`)
    await pagina.keyboard.press('q')
    await pagina.waitForSelector('.duvidas .lupa .quadro-moldura img')
    const faltam = () => numero(pagina, '.duvida-faltam b')
    assert.equal(await faltam(), fila.length)
    const primeira = await naPagina(pagina, (loja) => loja.catalogo.foco())
    assert.equal(primeira, fila[0].id, 'a mais importante vem primeiro')
    await pagina.waitForTimeout(700)
    await capturaDois(pagina, 'duvidas-1440-claro')
    // P: fica; X: fora; → pula (a contagem não cai); a contagem cai uma por resposta
    await pagina.keyboard.press('p')
    await pagina.waitForFunction((n) => Number(document.querySelector('.duvida-faltam b')?.textContent.replace(/\D/g, '')) === n, fila.length - 1)
    assert.equal(await naPagina(pagina, (loja, esteira, id) => loja.catalogo.foto(id).marca, primeira), 'escolhida')
    const segunda = await naPagina(pagina, (loja) => loja.catalogo.foco())
    await pagina.keyboard.press('ArrowRight')
    assert.notEqual(await naPagina(pagina, (loja) => loja.catalogo.foco()), segunda)
    assert.equal(await faltam(), fila.length - 1)
    await pagina.keyboard.press('x')
    await pagina.waitForFunction((n) => Number(document.querySelector('.duvida-faltam b')?.textContent.replace(/\D/g, '')) === n, fila.length - 2)
    for (let n = fila.length - 2; n > 0; n--) {
      await pagina.locator('.duvida-respostas [data-resposta="fica"]').click()
      if (n > 1) await pagina.waitForFunction((m) => Number(document.querySelector('.duvida-faltam b')?.textContent.replace(/\D/g, '')) === m, n - 1)
    }
    await pagina.waitForSelector('.duvidas-fim')
    const marcadas = await naPagina(pagina, (loja, esteira, ids) => ids.map((id) => loja.catalogo.foto(id).marca), fila.map((d) => d.id))
    assert.ok(marcadas.every(Boolean), 'toda dúvida respondida')
    assert.equal(await naPagina(pagina, (loja, esteira) => esteira.duvidas().length), 0)
    await pagina.waitForTimeout(500)
    await capturaDois(pagina, 'duvidas-fim-1440-claro')
    await pagina.keyboard.press('Escape')
    await pagina.waitForSelector('.duvidas', { state: 'detached' })
    await naPagina(pagina, (loja) => {
      while (loja.catalogo.desfazer());
      return true
    })

    // ───── agrupar por pessoa: o aviso, o consentimento, as pílulas, a cobertura e a meta ─────
    assert.equal(await pagina.locator('.pilula--pessoa').count(), 0, 'desligado por padrão')
    const antes = await naPagina(pagina, (loja, esteira, id) => loja.catalogo.foto(id).magnitude, daTia)
    assert.equal(antes.balde, 'fora', `a foto da pessoa 3 devia cair em Fora: ${JSON.stringify(antes.motivos)}`)
    await ligarPessoas(pagina, { capturar: '1440-claro' })
    await pagina.waitForSelector('.pilula--pessoa')
    assert.equal(await pagina.locator('.pilula--pessoa').count(), 4)
    const pessoas = await naPagina(pagina, (loja, esteira) => esteira.estado().pessoas.pessoas.map((p) => ({ id: p.id, fotos: p.fotos.length, chave: p.chave })))
    t.diagnostic(`pessoas: ${JSON.stringify(pessoas)}`)
    assert.deepEqual(
      pessoas.map((p) => p.fotos),
      [60, 48, 4, 1],
    )
    // a única foto da pessoa 3 não vai para Fora sozinha
    await pagina.waitForFunction((id) => self.__loja.catalogo.foto(id).magnitude.balde === 'talvez', daTia)
    const depois = await naPagina(pagina, (loja, esteira, id) => loja.catalogo.foto(id).magnitude, daTia)
    assert.equal(depois.motivos[0], 'A melhor foto que há desta pessoa')
    assert.equal(depois.total, antes.total, 'a nota não muda')
    assert.equal(await pagina.locator('.pilula--pessoa[data-sozinha]').count(), 1)
    // a pílula filtra; o filtro não vai para o catálogo guardado
    await pagina.locator('.pilula--pessoa').last().click()
    assert.deepEqual(
      await naPagina(pagina, (loja) => loja.catalogo.itens().map((i) => i.foto.id)),
      [daTia],
    )
    const guardado = await naPagina(pagina, (loja) => JSON.stringify(loja.catalogo.serializar()))
    assert.doesNotMatch(guardado, /pessoa:|idsDe|Int8Array/)
    await pagina.waitForTimeout(600)
    await capturaDois(pagina, 'pilulas-1440-claro')
    await pagina.locator('.pilula--pessoa').last().click()
    // a meta garante uma foto de cada pessoa-chave
    await naPagina(pagina, (loja, esteira) => esteira.definirMeta(10))
    await pagina.waitForFunction((id) => self.__loja.catalogo.foto(id).magnitude.balde === 'fica', daTia)
    await naPagina(pagina, (loja, esteira) => esteira.definirMeta(null))
    // a folha lista as pessoas com a cobertura; dá nome
    await pagina.locator('.pilula[data-valor="pessoas"]').click()
    await pagina.waitForSelector('dialog.folha-pessoas[open] .pessoas-lista')
    assert.equal(await pagina.locator('.pessoa-linha').count(), 4)
    assert.match(await pagina.locator('.pessoa-linha[data-sozinha] small').innerText(), /Uma foto só/)
    await pagina.locator('.pessoa-linha[data-sozinha] .pessoa-nome').fill('Tia')
    await pagina.locator('.pessoa-linha[data-sozinha] .pessoa-nome').press('Enter')
    await pagina.waitForFunction(() => self.__esteira.estado().pessoas.pessoas.some((p) => p.nome === 'Tia'))
    await pagina.waitForTimeout(400)
    await capturaDois(pagina, 'folha-pessoas-lista-1440-claro')
    // os vetores estão no IndexedDB do trabalho; "Esquecer rostos" apaga tudo
    const trabalho = await naPagina(pagina, (loja) => loja.trabalho().id)
    const contar = () => naPagina(pagina, async (loja, esteira, t) => (await import('/app/decupagem/pessoas.js')).deposito.contar(t), trabalho)
    const guardados = await contar()
    assert.equal(guardados.trabalho, 1)
    assert.ok(guardados.rostos >= 60, JSON.stringify(guardados))
    await pagina.locator('[data-acao="esquecer-rostos"]').click()
    await pagina.waitForSelector('dialog.folha-pessoas[open]', { state: 'detached' }).catch(() => {})
    await pagina.waitForFunction(() => !self.__esteira.estado().pessoas.ligado)
    assert.deepEqual(await contar(), { trabalho: 0, rostos: 0 }, 'sumiu do IndexedDB')
    assert.equal(await pagina.locator('.pilula--pessoa').count(), 0)
    await pagina.waitForFunction((id) => self.__loja.catalogo.foto(id).magnitude.balde === 'fora', daTia)

    // ───── calibração: perguntas perto do corte; aceitar as de foco mole deixa o ensaio mais tolerante ─────
    await pagina.locator('.dec-barra .menu > button[aria-label="Mais"]').click()
    await pagina.locator('.dec-barra .menu-item', { hasText: 'Calibrar' }).click()
    await pagina.waitForSelector('dialog.folha-calibrar[open] .calibrar')
    const perguntas = await naPagina(pagina, (loja, esteira) => esteira.perguntas())
    assert.ok(perguntas.length >= 3, JSON.stringify(perguntas))
    await pagina.waitForSelector('dialog.folha-calibrar .calibrar-moldura img')
    await pagina.waitForTimeout(500)
    await capturaDois(pagina, 'calibrar-1440-claro')
    for (const p of perguntas) {
      if (p.tipo === 'serve') await pagina.locator('dialog.folha-calibrar .calibrar').press(p.dimensao === 'nitidez' ? 'p' : p.valor >= p.corte ? 'p' : 'x')
      else await pagina.locator('dialog.folha-calibrar .calibrar').press('1')
    }
    await pagina.waitForSelector('dialog.folha-calibrar .calibrar-fim')
    const est = await naPagina(pagina, (loja, esteira) => esteira.estado())
    t.diagnostic(`calibração: ${perguntas.length} perguntas → ${JSON.stringify(est.limiares)} · ${est.calibrado.join(' ')}`)
    if (perguntas.some((p) => p.tipo === 'serve' && p.dimensao === 'nitidez' && p.valor < p.corte)) {
      assert.ok(est.limiares.nitidez < 0, JSON.stringify(est.limiares))
      assert.ok(await naPagina(pagina, () => !!localStorage.getItem('foto_decupar_limiares')))
    }
    await pagina.waitForTimeout(400)
    await capturaDois(pagina, 'calibrar-fim-1440-claro')
    if (await pagina.locator('[data-acao="voltar-ao-padrao"]').count()) {
      await pagina.locator('[data-acao="voltar-ao-padrao"]').click()
      assert.equal(await naPagina(pagina, (loja, esteira) => esteira.estado().limiaresMexidos), false)
    } else await pagina.locator('[data-acao="calibrado"]').click()
    limpo(olho)
  } finally {
    await contexto.close()
  }
})

test('dúvidas, pessoas e calibração em 1440 escuro e 390 claro e escuro: sem rolar de lado, alvos de 44 px', { skip: semChromium, timeout: 900_000 }, async () => {
  for (const [tema, largura] of [
    ['escuro', 1440],
    ['claro', 390],
    ['escuro', 390],
  ]) {
    const celular = largura === 390
    const { contexto, pagina, olho } = await abrir({ tema, camadas: [], opcoes: celular ? CELULAR : {} })
    const nome = (x) => `${x}-${largura}-${tema}`
    try {
      await esperarAnalise(pagina)
      await comPessoasFabricadas(pagina)
      // dúvidas (no celular, pelo menu ⋯)
      if (celular) {
        await pagina.locator('.dec-barra .menu > button[aria-label="Mais"]').tap()
        await pagina.locator('.dec-barra .menu-item', { hasText: 'Ver as dúvidas' }).tap()
      } else await pagina.keyboard.press('q')
      await pagina.waitForSelector('.duvidas .lupa .quadro-moldura img')
      await pagina.waitForTimeout(700)
      if (celular) {
        await semRolarDeLado(pagina, 'dúvidas')
        assert.deepEqual(await alvosPequenos(pagina), [], 'dúvidas')
      }
      await capturaDois(pagina, nome('duvidas'))
      await pagina.locator('.lupa-barra button[aria-label="Voltar à grade"]').click()
      await pagina.waitForSelector('.duvidas', { state: 'detached' })
      // a folha do aviso, as pílulas e a lista
      await ligarPessoas(pagina, { capturar: `${largura}-${tema}` })
      await pagina.waitForSelector('.pilula--pessoa')
      await pagina.waitForTimeout(600)
      if (celular) {
        await semRolarDeLado(pagina, 'pílulas')
        assert.deepEqual(await alvosPequenos(pagina), [], 'pílulas')
      }
      await capturaDois(pagina, nome('pilulas'))
      await pagina.locator('.pilula[data-valor="pessoas"]').click()
      await pagina.waitForSelector('dialog.folha-pessoas[open] .pessoas-lista')
      await pagina.waitForTimeout(500)
      await capturaDois(pagina, nome('folha-pessoas-lista'))
      await pagina.locator('dialog.folha-pessoas .folha-pe .vidro--tinta').click()
      // calibração
      await pagina.locator('.dec-barra .menu > button[aria-label="Mais"]').click()
      await pagina.locator('.dec-barra .menu-item', { hasText: 'Calibrar' }).click()
      await pagina.waitForSelector('dialog.folha-calibrar .calibrar-moldura img')
      await pagina.waitForTimeout(600)
      if (celular) assert.deepEqual(await alvosPequenos(pagina), [], 'calibrar')
      await capturaDois(pagina, nome('calibrar'))
      limpo(olho)
    } finally {
      await contexto.close()
    }
  }
})
