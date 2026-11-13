// A esteira da decupagem (app/decupagem/analisar.js) de ponta a ponta no Chromium, pelo servidor local com os
// cabeçalhos de produção, sobre 300 JPEG fabricados com semente (nada de gente: texturas, formas e números).
// Cada bloco de 10 fotos tem: uma cena nítida, a mesma cena 1 s depois (andou 0,6%), a mesma cena borrada 2 s depois,
// outra nítida, uma borrada sozinha, uma estourada sozinha e quatro nítidas. Confere:
//   - a fila termina; notas, baldes e grupos batem com o que foi fabricado;
//   - a rolagem da grade responde enquanto a análise roda;
//   - recarregar a página no meio retoma sem refazer o que já foi medido;
//   - refazerNota (outro rigor, outro ensaio) é instantâneo e não reanalisa nada;
//   - o caminho de rosto, com detecções FABRICADAS (malha com o EAR escolhido), dá olho fechado, aberto e riso;
//   - a sobreposição da lupa e as frases da ficha.
// A prova com rosto de verdade fica fora da suíte (fotos de clientes não entram no repositório).

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { abrirChromium, comExif, EXIGIR, semChromium, subirApp, vigiar } from './apoio-tela.js'
import { precisaDoRaw } from '../app/decupagem/analisar.js'
import { compactarMedidas } from '../app/decupagem/compacto.js'
import { resumoDaFoto, sobreposicao } from '../app/decupagem/sobreposicao.js'

const QUANTAS = 300
const ESPERA = 240_000
const dois = (n) => String(n).padStart(2, '0')
const BLOCO = 10
/** O papel de cada posição do bloco. */
const PAPEL = ['cena', 'repetida', 'repetida-borrada', 'cena', 'borrada', 'estourada', 'cena', 'cena', 'cena', 'cena']
const nomeDa = (i) => `IMG_${String(i + 1).padStart(4, '0')}.JPG`
/** A hora da foto i: um bloco a cada 400 s; a cena principal e as duas repetidas a 1 s uma da outra; o resto a 40 s. */
function horaDa(i) {
  const b = Math.floor(i / BLOCO)
  const k = i % BLOCO
  const s = b * 400 + (k <= 2 ? k : k * 40)
  return `2026-11-13T${dois(9 + Math.floor(s / 3600))}:${dois(Math.floor(s / 60) % 60)}:${dois(s % 60)}`
}

let app, navegador, arquivos, contexto, pagina, olho

/** Desenha as 300 fotos no canvas do Chromium (gerador com semente) e devolve os JPEG. */
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
          // detalhe fino: traços de 1 a 2 px (é o que a nitidez mede)
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
          const semente = 1000 + b * bloco + (k <= 2 ? 0 : k)
          desenharCena(semente, k === 1 ? 6 : 0)
          c.filter = k === 2 || k === 4 ? 'blur(5px)' : 'none'
          c.drawImage(cena, 0, 0)
          c.filter = 'none'
          if (k === 5) {
            c.fillStyle = 'rgb(255 255 255)'
            c.fillRect(0, 0, L, A * 0.45)
          }
          if (k >= 6 && k <= 8) {
            // onde o rosto fabricado vai estar: detalhe fino e denso (rosto em foco tem pele, cílio e cabelo)
            const r = semeado(semente + 7)
            c.fillStyle = 'rgb(200 160 130)'
            c.fillRect(L / 2 - 110, A / 2 - 110, 220, 220)
            for (let i = 0; i < 1600; i++) {
              c.fillStyle = r() < 0.5 ? 'rgb(60 40 30)' : 'rgb(250 230 210)'
              c.fillRect(L / 2 - 110 + r() * 218, A / 2 - 110 + r() * 218, 1 + r() * 2, 1 + r() * 2)
            }
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
    return lista.map((b64, i) => ({ name: nomeDa(i), mimeType: 'image/jpeg', buffer: comExif(Buffer.from(b64, 'base64'), { data: horaDa(i) }) }))
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

/**
 * Roda `f(arg)` na página. Antes, deixa à mão a loja do app (`self.__loja`) e os módulos da decupagem (`self.__mods`).
 * (A função vai pelo protocolo do navegador, não por eval: a CSP de produção fica valendo.)
 */
async function naPagina(f, arg) {
  await pagina.evaluate(async () => {
    if (self.__mods) return
    self.__loja = (await import('/app/estado.js')).loja
    self.__mods = {
      ...(await import('/app/decupagem/analisar.js')),
      ...(await import('/app/decupagem/sobreposicao.js')),
      ...(await import('/src/decupagem/nota.js')),
    }
  })
  return pagina.evaluate(f, arg)
}

async function abrirPagina() {
  contexto = await navegador.newContext({ viewport: { width: 1280, height: 860 } })
  // a esteira é testada sozinha: a Decupar não começa a dela por trás (preferência "começar sozinha" desligada)
  await contexto.addInitScript(() => localStorage.setItem('foto_decupar_sozinha', '0'))
  contexto.setDefaultTimeout(ESPERA)
  pagina = await contexto.newPage()
  olho = vigiar(pagina, app.base)
  await pagina.goto(`${app.base}/`)
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
}

/** As fotos do catálogo com o que a análise guardou, pelo nome. */
const catalogo = () =>
  naPagina(() =>
    Object.fromEntries(
      self.__loja.catalogo
        .fotos()
        .map((f) => [
          f.nome,
          { id: f.id, medida: !!f.medidas, q: f.medidas?.nitidez?.qLocal ?? null, cena: f.cena, grupo: f.grupo, escolha: f.escolha, m: f.magnitude, rostos: f.rostos },
        ]),
    ),
  )

test('300 fotos: a esteira roda sem travar a rolagem, e recarregar no meio retoma sem refazer', { skip: semChromium, timeout: 600_000 }, async (t) => {
  await abrirPagina()
  await pagina.setInputFiles('input[data-escolher]', arquivos)
  await pagina.waitForFunction((n) => document.querySelector('.pilula[data-valor="todas"] .pilula-n')?.textContent.trim() === String(n), QUANTAS)
  await naPagina(() => self.__loja.ocioso().then(() => true))

  // o relógio da tela: a maior pausa entre quadros e as tarefas longas enquanto a análise roda
  await naPagina(() => {
    const { criarAnalise } = self.__mods
    const loja = self.__loja
    const quadros = []
    let ultimo = performance.now()
    const passo = (t) => {
      quadros.push(t - ultimo)
      ultimo = t
      if (self.__relogio) requestAnimationFrame(passo)
    }
    self.__relogio = true
    requestAnimationFrame(passo)
    self.__quadros = quadros
    self.__longas = []
    new PerformanceObserver((l) => self.__longas.push(...l.getEntries().map((e) => e.duration))).observe({ type: 'longtask' })
    self.__analise = criarAnalise({ loja })
    return true
  })
  // a grade vai para o fim antes de começar: o que está na tela passa na frente da fila
  const grade = pagina.locator('.grade')
  await grade.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await pagina.waitForTimeout(500)
  await naPagina(() => {
    self.__fim = self.__analise.iniciar({ camadas: [] })
    return true
  })
  await pagina.waitForFunction(() => self.__analise.estado().feitas >= 25)
  const primeiras = await naPagina(() =>
    self.__loja.catalogo
      .fotos()
      .filter((f) => f.medidas)
      .map((f) => Number(f.nome.slice(4, 8))),
  )
  const doFim = primeiras.filter((n) => n > 200).length
  t.diagnostic(`as primeiras medidas: ${primeiras.length}, ${doFim} delas do fim da grade (o que estava na tela)`)
  assert.ok(doFim >= 15, `com a grade no fim, as primeiras fotos medidas foram ${primeiras.join(',')}`)
  // rola a grade enquanto mede
  await grade.evaluate((el) => (el.scrollTop = 0))
  const caixa = await grade.boundingBox()
  await pagina.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  let rolou = 0
  for (let i = 0; i < 400; i++) {
    const antes = await grade.evaluate((el) => el.scrollTop)
    await pagina.mouse.wheel(0, i % 20 < 10 ? 500 : -500)
    await pagina.waitForTimeout(60)
    if ((await grade.evaluate((el) => el.scrollTop)) !== antes) rolou++
    const { feitas } = await naPagina(() => self.__analise.estado())
    if (feitas >= 120) break
  }
  const pausada = await naPagina(async () => {
    self.__analise.pausar()
    self.__relogio = false
    return self.__analise.estado()
  })
  assert.equal(pausada.situacao, 'pausada')
  assert.ok(pausada.feitas >= 120 && pausada.feitas < QUANTAS, `pausou com ${pausada.feitas}`)
  assert.ok(rolou >= 10, `a grade rolou ${rolou} vezes`)
  const tela = await naPagina(() => {
    const q = self.__quadros.slice(5).sort((a, b) => a - b)
    return { quadros: q.length, p95: q[Math.floor(q.length * 0.95)], maior: q.at(-1), longa: Math.max(0, ...self.__longas) }
  })
  // máquina dividida, Chromium sem GPU: folga larga, mas um travamento de verdade (a nota de 300 fotos no meio da
  // rolagem, mil avisos de uma vez) passa disso
  t.diagnostic(`tela durante a análise: ${JSON.stringify(tela)}; a grade rolou ${rolou} vezes`)
  assert.ok(tela.quadros > 30, JSON.stringify(tela))
  assert.ok(tela.p95 < 150, `p95 entre quadros: ${JSON.stringify(tela)}`)
  assert.ok(tela.longa < 500, `tarefa longa: ${JSON.stringify(tela)}`)

  // o que estava no meio termina; tudo vai para o disco; recarrega
  await pagina.waitForTimeout(1500)
  const medidasAntes = await naPagina(async () => {
    const loja = self.__loja
    await loja.salvarAgora()
    return loja.catalogo.fotos().filter((f) => f.medidas).length
  })
  assert.ok(medidasAntes >= pausada.feitas, `${medidasAntes} medidas guardadas`)
  await pagina.reload()
  await pagina.waitForFunction(() => document.documentElement.dataset.pronto === '1')
  await pagina.waitForFunction(async () => {
    const { loja } = await import('/app/estado.js')
    return loja.situacao() === 'aberto' && loja.catalogo.tamanho === 300
  })
  const depois = await naPagina(async () => {
    const { criarAnalise } = self.__mods
    const loja = self.__loja
    const voltou = loja.catalogo.fotos().filter((f) => f.medidas).length
    const a = criarAnalise({ loja })
    let primeiro = null
    a.assinar((e) => e.situacao === 'rodando' && (primeiro ??= e))
    const fim = await a.iniciar({ camadas: [] })
    self.__analise = a
    return { voltou, primeiro, fim }
  })
  t.diagnostic(`depois de recarregar: ${medidasAntes} já medidas; ${depois.fim.novas} novas; ${depois.fim.porSegundo ?? '-'} fotos/s; tempos ${JSON.stringify(depois.fim.tempos)}`)
  assert.equal(depois.voltou, medidasAntes, 'o que foi medido voltou do disco')
  assert.equal(depois.primeiro.feitas, medidasAntes, 'a fila começou de onde parou')
  assert.equal(depois.fim.situacao, 'pronta')
  assert.equal(depois.fim.total, QUANTAS)
  assert.equal(depois.fim.feitas, QUANTAS)
  assert.equal(depois.fim.novas, QUANTAS - medidasAntes, 'só o que faltava foi medido')
  assert.equal(depois.fim.puladas, 0)
  assert.equal(depois.fim.erro, null)
  assert.deepEqual(depois.fim.camadas, { rostos: 'desligada', objetos: 'desligada', rotulos: 'desligada' })
  assert.ok(depois.fim.tempos.medir > 0 && depois.fim.tempos.nota > 0, JSON.stringify(depois.fim.tempos))
  assert.deepEqual({ erros: olho.erros, ruins: olho.ruins, fora: olho.fora }, { erros: [], ruins: [], fora: [] })
})

test('notas, baldes e grupos batem com o que foi fabricado', { skip: semChromium }, async () => {
  const fotos = await catalogo()
  const grupos = new Map()
  for (const [nome, f] of Object.entries(fotos)) if (f.grupo) grupos.set(f.grupo, [...(grupos.get(f.grupo) ?? []), nome])
  // um grupo por bloco: a cena e as duas repetidas (a borrada junto), e nenhum outro
  assert.equal(grupos.size, QUANTAS / BLOCO, [...grupos.values()].map((g) => g.join(',')).join(' | '))
  for (let b = 0; b < QUANTAS / BLOCO; b++) {
    const i = b * BLOCO
    const [cena, repetida, borrada] = [i, i + 1, i + 2].map((k) => fotos[nomeDa(k)])
    assert.ok(cena.grupo && cena.grupo === repetida.grupo && cena.grupo === borrada.grupo, `bloco ${b}`)
    assert.deepEqual(grupos.get(cena.grupo).sort(), [nomeDa(i), nomeDa(i + 1), nomeDa(i + 2)])
    // a escolhida do grupo é uma das nítidas; a borrada sai (o momento já está coberto pelas outras)
    assert.ok(cena.escolha.escolhida || repetida.escolha.escolhida, `bloco ${b}: escolhida`)
    assert.equal(borrada.escolha.escolhida, false)
    assert.equal(cena.escolha.tamanho, 3)
    assert.ok(borrada.m.detalhe.tetos.includes('foraDeFoco'), `bloco ${b}: ${JSON.stringify(borrada.m.motivos)}`)
    assert.equal(borrada.m.balde, 'fora')
    assert.equal(borrada.m.motivos[0], 'Fora de foco')
  }
  for (const [nome, f] of Object.entries(fotos)) {
    const i = Number(nome.slice(4, 8)) - 1
    const papel = PAPEL[i % BLOCO]
    assert.ok(f.medida && f.m, `${nome} sem nota`)
    assert.equal(f.rostos, undefined, `${nome}: a camada de rostos não rodou, e não se inventa rosto`)
    assert.ok(f.m.incertezas.includes('Sem leitura de rostos'))
    if (papel === 'cena' || papel === 'repetida') {
      assert.ok(f.q >= 0.7, `${nome}: q ${f.q}`)
      assert.deepEqual(f.m.detalhe.tetos, [], `${nome}: ${JSON.stringify(f.m.motivos)}`)
      assert.equal(f.m.balde, 'fica', `${nome}: ${f.m.total} ${JSON.stringify(f.m.motivos)}`)
    }
    if (papel === 'cena' && i % BLOCO >= 3) assert.ok(!f.grupo, `${nome} é um momento sozinho`)
    if (papel === 'borrada') {
      // borrada e sozinha: o teto de fora de foco, mas a única foto do momento não vai para "fora"
      assert.ok(f.m.detalhe.tetos.includes('foraDeFoco'))
      assert.ok(f.m.total <= 35)
      assert.equal(f.m.balde, 'talvez')
      assert.equal(f.m.motivos[0], 'Única foto deste momento')
      assert.equal(f.m.detalhe.protegida, true)
    }
    if (papel === 'estourada') {
      assert.ok(f.m.detalhe.tetos.includes('estourada'), `${nome}: ${JSON.stringify(f.m.motivos)}`)
      assert.ok(f.m.total <= 50)
      assert.match(f.m.motivos.join(' '), /Altas luzes perdidas em \d+%/)
    }
  }
  // "quero cerca de n": cada momento entra antes de qualquer repetida
  const meta = await naPagina(() => {
    const momentos = self.__analise.meta(240)
    const poucas = self.__analise.meta(50)
    return { ficam: momentos.ficam.length, corte: momentos.corte, poucas: poucas.ficam }
  })
  assert.equal(meta.ficam, 240)
  const porGrupo = new Map()
  for (const nome of Object.keys(fotos)) for (const id of [fotos[nome].id]) porGrupo.set(id, fotos[nome].grupo)
  const gruposNas50 = meta.poucas.map((id) => porGrupo.get(id)).filter(Boolean)
  assert.equal(new Set(gruposNas50).size, gruposNas50.length, 'nenhum momento repetido nas 50 primeiras')
})

test('refazerNota é instantâneo e não reanalisa nada', { skip: semChromium }, async () => {
  const r = await naPagina(() => {
    const { RIGORES } = self.__mods
    const loja = self.__loja
    const a = self.__analise
    const antes = a.estado()
    const resultados = {}
    for (const rigor of ['estrito', 'relaxado', 'equilibrado']) {
      const t = performance.now()
      const ms = a.refazerNota({ rigor })
      const fotos = loja.catalogo.fotos()
      const errados = fotos.filter((f) => {
        const m = f.magnitude
        if (m.detalhe.protegida) return m.balde !== 'talvez'
        const c = RIGORES[rigor]
        return m.balde !== (m.total >= c.fica ? 'fica' : m.total < c.fora ? 'fora' : 'talvez')
      })
      const baldes = { fica: 0, talvez: 0, fora: 0 }
      for (const f of fotos) baldes[f.magnitude.balde]++
      resultados[rigor] = { ms, total: performance.now() - t, errados: errados.length, baldes }
    }
    return { antes, resultados, depois: a.estado() }
  })
  for (const [rigor, x] of Object.entries(r.resultados)) {
    assert.equal(x.errados, 0, `${rigor}: ${JSON.stringify(x)}`)
    assert.ok(x.total < 1000, `${rigor} levou ${x.total} ms`)
  }
  assert.ok(r.resultados.estrito.baldes.fica <= r.resultados.equilibrado.baldes.fica)
  assert.ok(r.resultados.relaxado.baldes.fora <= r.resultados.equilibrado.baldes.fora)
  assert.equal(r.depois.novas, r.antes.novas, 'nenhuma foto medida de novo')
  assert.equal(r.depois.feitas, r.antes.feitas)
  assert.equal(r.depois.opcoes.rigor, 'equilibrado')
})

test('rosto fabricado: olho fechado tem teto, aberto fica, riso forte não reprova; o ensaio muda a regra sem reanalisar', { skip: semChromium }, async () => {
  const r = await naPagina(async () => {
    const loja = self.__loja
    const { criarPool } = await import('/app/trabalho/pool.js')
    const { analisarRostos, OLHO_DIREITO, OLHO_ESQUERDO } = await import('/src/decupagem/rostos.js')
    const { lumaDe } = await import('/src/decupagem/medidas.js')
    const { resumirRosto } = await import('/app/decupagem/compacto.js')
    // o rosto que um detector "acharia" no meio da foto, com a malha montada para dar o EAR escolhido
    function deteccao({ largura, altura }, { ear, piscada, aperto, sorriso }) {
      const cx = largura / 2
      const cy = altura / 2
      const malha = Array.from({ length: 478 }, () => ({ x: cx, y: cy }))
      const olho = (indices, x0) => {
        const w = 40
        const h = ear * w
        const [p1, p2, p3, p4, p5, p6] = indices
        malha[p1] = { x: x0, y: cy - 20 }
        malha[p4] = { x: x0 + w, y: cy - 20 }
        malha[p2] = { x: x0 + 13, y: cy - 20 - h / 2 }
        malha[p6] = { x: x0 + 13, y: cy - 20 + h / 2 }
        malha[p3] = { x: x0 + 27, y: cy - 20 - h / 2 }
        malha[p5] = { x: x0 + 27, y: cy - 20 + h / 2 }
      }
      olho(OLHO_DIREITO, cx - 50)
      olho(OLHO_ESQUERDO, cx + 10)
      malha[234] = { x: cx - 90, y: cy }
      malha[454] = { x: cx + 90, y: cy }
      malha[1] = { x: cx, y: cy + 10 }
      const par = (v) => [v, v]
      const [bd, be] = par(piscada)
      const [ad, ae] = par(aperto)
      const [sd, se] = par(sorriso)
      return {
        caixa: { x: cx - 100, y: cy - 100, largura: 200, altura: 200 },
        confianca: 0.95,
        olhos: [
          { x: cx - 30, y: cy - 20 },
          { x: cx + 30, y: cy - 20 },
        ],
        malha,
        blendshapes: { eyeBlinkRight: bd, eyeBlinkLeft: be, eyeSquintRight: ad, eyeSquintLeft: ae, mouthSmileRight: sd, mouthSmileLeft: se },
      }
    }
    const EXPRESSAO = {
      6: { ear: 0.08, piscada: 0.7, aperto: 0.1, sorriso: 0.05 },
      7: { ear: 0.3, piscada: 0.05, aperto: 0.1, sorriso: 0.2 },
      8: { ear: 0.1, piscada: 0.45, aperto: 0.4, sorriso: 0.9 },
    }
    let chamadas = 0
    const visao = {
      tamanho: 1,
      async pedir(tipo, dados, opcoes = {}) {
        if (tipo === 'preparar') return { camadas: { rostos: 'pronta' }, motivos: {}, tempos: {} }
        chamadas++
        const foto = loja.catalogo.foto(opcoes.chave.slice('visao:'.length))
        const k = (Number(foto.nome.slice(4, 8)) - 1) % 10
        let pixels = dados.previa
        if (pixels instanceof Blob) {
          const b = await createImageBitmap(pixels)
          const t = new OffscreenCanvas(b.width, b.height)
          t.getContext('2d').drawImage(b, 0, 0)
          pixels = { largura: b.width, altura: b.height, rgba: t.getContext('2d').getImageData(0, 0, b.width, b.height).data }
        }
        const quadro = { largura: pixels.largura, altura: pixels.altura }
        const lista = EXPRESSAO[k] ? [deteccao(quadro, EXPRESSAO[k])] : []
        const lidos = analisarRostos(lista, lumaDe(pixels), { medidas: dados.medidas })
        return { rostos: lidos.map((x, i) => resumirRosto(x, lista[i])), camadas: ['rostos'], giro: 0, quadro, tempos: { total: 1 }, estado: { rostos: 'pronta' } }
      },
      priorizar() {},
      cancelar() {},
      cancelarTudo() {},
      encerrar() {},
    }
    // o medidor de verdade, contado: com as medidas já guardadas, ele não pode ser chamado
    const real = criarPool(new URL('/app/decupagem/medir-worker.js', location.href), { tamanho: 2, nome: 'medir' })
    let medicoes = 0
    const medidor = { tamanho: 2, pedir: (...a) => (medicoes++, real.pedir(...a)), priorizar: real.priorizar, cancelar: real.cancelar, encerrar: real.encerrar }
    const { criarAnalise } = await import('/app/decupagem/analisar.js')
    const { sobreposicao, resumoDaFoto } = await import('/app/decupagem/sobreposicao.js')
    const a = criarAnalise({ loja, workers: { medidor, visao, leitorDeRaw: { pedir: () => Promise.reject(new Error('sem RAW aqui')) } } })
    const fim = await a.iniciar({ camadas: ['rostos'] })
    const ler = () =>
      Object.fromEntries(
        loja.catalogo
          .fotos()
          .filter((f) => [6, 7, 8].includes((Number(f.nome.slice(4, 8)) - 1) % 10))
          .map((f) => [
            f.nome,
            { olhos: f.rostos?.[0]?.olhos, cena: f.cena, balde: f.magnitude.balde, total: f.magnitude.total, tetos: f.magnitude.detalhe.tetos, motivos: f.magnitude.motivos, c: f.magnitude.componentes, d: f.magnitude.detalhe },
          ]),
      )
    const geral = ler()
    const chamadasAntes = chamadas
    const ms = a.refazerNota({ ensaio: 'esporte' })
    const esporte = ler()
    a.refazerNota({ ensaio: 'geral' })
    const exemplo = loja.catalogo.fotos().find((f) => f.nome === 'IMG_0007.JPG')
    const comRosto = sobreposicao(exemplo)
    const resumo = resumoDaFoto(exemplo)
    const semRostos = loja.catalogo.fotos().filter((f) => Array.isArray(f.rostos) && f.rostos.length === 0).length
    real.encerrar()
    return { fim, geral, esporte, chamadas, chamadasAntes, medicoes, ms, comRosto, resumo, semRostos }
  })
  assert.equal(r.fim.situacao, 'pronta')
  assert.equal(r.medicoes, 0, 'nenhuma foto medida de novo: só a camada nova rodou')
  assert.equal(r.chamadas, QUANTAS, 'a camada de rostos rodou uma vez em cada foto')
  assert.equal(r.fim.novas, QUANTAS)
  assert.equal(r.semRostos, QUANTAS - (QUANTAS / BLOCO) * 3, 'a camada rodou e não achou ninguém: lista vazia, não undefined')
  for (const [nome, x] of Object.entries(r.geral)) {
    const k = (Number(nome.slice(4, 8)) - 1) % 10
    assert.equal(x.cena, 'retrato', nome)
    if (k === 6) {
      assert.equal(x.olhos, 'fechados')
      assert.ok(x.tetos.includes('olhosFechados'), `${nome}: ${JSON.stringify(x)}`)
      assert.notEqual(x.balde, 'fica')
      assert.equal(x.motivos[0], 'Olhos fechados')
      // no ensaio de esporte o olho não conta: a mesma foto fica, sem reanalisar
      assert.deepEqual(r.esporte[nome].tetos, [])
      assert.equal(r.esporte[nome].balde, 'fica')
    }
    if (k === 7) {
      assert.equal(x.olhos, 'abertos')
      assert.equal(x.balde, 'fica', `${nome}: ${JSON.stringify(x)}`)
      assert.ok(x.motivos.includes('Olhos abertos'), JSON.stringify(x.motivos))
    }
    if (k === 8) {
      assert.equal(x.olhos, 'sorrindo')
      assert.deepEqual(x.tetos, [])
      assert.equal(x.balde, 'fica')
    }
  }
  assert.equal(r.chamadas, r.chamadasAntes, 'refazerNota não chamou a visão')
  assert.ok(r.ms < 1000, `refazerNota: ${r.ms} ms`)
  // a lupa: a caixa do rosto no meio do quadro, em fração, com o estado e a frase; a ficha com as frases prontas
  assert.equal(r.comRosto.rostos.length, 1)
  const caixa = r.comRosto.rostos[0]
  assert.ok(Math.abs(caixa.x + caixa.largura / 2 - 0.5) < 1e-6 && Math.abs(caixa.y + caixa.altura / 2 - 0.5) < 1e-6)
  assert.equal(caixa.estado, 'fechados')
  assert.equal(caixa.rotulo, 'Olhos fechados')
  assert.equal(caixa.principal, true)
  assert.equal(caixa.olhos.length, 2)
  assert.equal(r.resumo.analisada, true)
  assert.equal(r.resumo.cena.texto, 'Retrato')
  assert.equal(r.resumo.rostos[0].texto, 'Olhos fechados')
  assert.deepEqual(Object.keys(r.resumo.balde), ['id', 'texto'])
  assert.ok(r.comRosto.nitidez.celulas.length === r.comRosto.nitidez.colunas * r.comRosto.nitidez.linhas)
  assert.deepEqual({ erros: olho.erros, ruins: olho.ruins, fora: olho.fora }, { erros: [], ruins: [], fora: [] })
  await contexto.close()
})

// ───────────────────────────── sem navegador ─────────────────────────────

test('sobreposição: rostos, mapa de nitidez e direção do tremido em fração do quadro', () => {
  const valores = new Float32Array(6).map((_, i) => i)
  const medidas = compactarMedidas({
    largura: 200,
    altura: 100,
    nitidez: { q: 0.8, qLocal: 0.8, mapa: { colunas: 3, linhas: 2, bloco: 32, valores } },
    borrao: { tipo: 'movimento', grau: 'forte', comprimento: 20, angulo: 90 },
    exposicao: { altas: 0, altas3: 0, baixas: 0, p1: 5, p50: 100, p99: 240, media: 110 },
  })
  const foto = {
    medidas,
    rostos: [
      { caixa: { x: 50, y: 25, largura: 40, altura: 50 }, olhos: 'abertos', principal: true, chave: true, pontos: [{ x: 60, y: 40 }, { x: 80, y: 40 }] },
      { caixa: { x: 150, y: 10, largura: 20, altura: 20 }, olhos: null, duvidoso: true },
      { caixa: { x: 0, y: 0, largura: 10, altura: 10 }, olhos: null },
    ],
  }
  const s = sobreposicao(foto)
  assert.deepEqual(s.quadro, { largura: 200, altura: 100 })
  assert.deepEqual(
    s.rostos.map((r) => [r.x, r.y, r.largura, r.altura, r.estado, r.rotulo]),
    [
      [0.25, 0.25, 0.2, 0.5, 'abertos', 'Olhos abertos'],
      [0.75, 0.1, 0.1, 0.2, 'duvidoso', 'Talvez não seja rosto'],
      [0, 0, 0.05, 0.1, 'semLeitura', 'Olhos sem leitura'],
    ],
  )
  assert.deepEqual(s.rostos[0].olhos, [
    { x: 0.3, y: 0.4 },
    { x: 0.4, y: 0.4 },
  ])
  // o mapa: blocos de 32 px a partir do pixel 1, o mais nítido perto de 1
  assert.equal(s.nitidez.celulas.length, 6)
  assert.deepEqual([s.nitidez.celulas[4].x, s.nitidez.celulas[4].y], [33 / 200, 33 / 100])
  assert.equal(s.nitidez.celulas[0].nivel, 'baixa')
  assert.equal(s.nitidez.celulas[5].nivel, 'alta')
  assert.ok(s.nitidez.celulas[5].valor <= 1 && s.nitidez.celulas[5].valor > 0.95)
  // tremido vertical de 20 px: um segmento de 20 px no centro, de cima para baixo
  assert.ok(Math.abs(s.tremido.x1 - 0.5) < 1e-9 && Math.abs(s.tremido.x2 - 0.5) < 1e-9)
  assert.ok(Math.abs(s.tremido.y2 - s.tremido.y1 - 0.2) < 1e-9)
  assert.equal(s.tremido.forte, true)
  assert.equal(s.tremido.rotulo, 'Tremido de cerca de 20 px')
  assert.equal(sobreposicao({}), null)
})

test('resumo da foto: frases prontas, e foto sem nota diz que está na fila', () => {
  const foto = {
    cena: 'grupo',
    analise: { cena: { porque: '3 rostos' }, raw: 'lido' },
    rostos: [{ olhos: 'sorrindo' }, { olhos: 'fechados' }, { olhos: null }],
    escolha: { tipo: 'repetidas', tamanho: 4, escolhida: true, equivalente: true, equivalentes: 2, desempate: 'olhos' },
    magnitude: { total: 82, estrelas: 4, balde: 'fica', motivos: ['Olhos nítidos'], confianca: 'media', incertezas: ['x'], dicas: [] },
  }
  const r = resumoDaFoto(foto)
  assert.equal(r.analisada, true)
  assert.deepEqual(r.balde, { id: 'fica', texto: 'Fica' })
  assert.deepEqual(r.confianca, { id: 'media', texto: 'Certeza média' })
  assert.deepEqual(r.cena, { id: 'grupo', texto: 'Grupo', porque: '3 rostos' })
  assert.deepEqual(r.grupo, { tipo: 'repetidas', texto: 'Repetidas', papel: 'escolhida', frase: 'A escolhida de 4', empate: ['2 equivalentes', 'Desempate pelos olhos'] })
  assert.deepEqual(
    r.rostos.map((x) => x.texto),
    ['Sorrindo', 'Olhos fechados', 'Olhos sem leitura'],
  )
  assert.equal(r.raw, 'Exposição conferida no RAW')
  const reserva = resumoDaFoto({ ...foto, escolha: { ...foto.escolha, escolhida: false, equivalente: false } })
  assert.equal(reserva.grupo.frase, 'Reserva (4 no grupo)')
  const naFila = resumoDaFoto({ nome: 'x' })
  assert.equal(naFila.analisada, false)
  assert.equal(naFila.aviso, 'Na fila da análise')
  assert.equal(resumoDaFoto({ semPrevia: true }).aviso, 'Sem prévia para analisar')
})

test('segunda passada pelo RAW: só RAW ao alcance, ainda não lido, com estouro além da tolerância', () => {
  const exp = (altas, altas3) => ({ medidas: { exposicao: { altas, altas3 } } })
  assert.equal(precisaDoRaw({ tipo: 'raw', ...exp(0.05, 0) }), true, 'um canal estourado em 5%: o sensor decide')
  assert.equal(precisaDoRaw({ tipo: 'raw', ...exp(0, 0.02) }), true, 'branco chapado na prévia')
  assert.equal(precisaDoRaw({ tipo: 'raw', ...exp(0.005, 0.001) }), false, 'dentro da tolerância')
  assert.equal(precisaDoRaw({ tipo: 'imagem', ...exp(0.3, 0.2) }), false, 'JPEG é o que é')
  assert.equal(precisaDoRaw({ tipo: 'raw', ...exp(0.3, 0.2) }, false), false, 'sem o original não há o que ler')
  assert.equal(precisaDoRaw({ tipo: 'raw', latitude: {}, ...exp(0.3, 0.2) }), false, 'já lido')
  assert.equal(precisaDoRaw({ tipo: 'raw', analise: { raw: { erro: 'sem-suporte' } }, ...exp(0.3, 0.2) }), false, 'já tentou e não abriu')
})
