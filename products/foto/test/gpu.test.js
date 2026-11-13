// O espelho do motor na GPU (src/motor/gpu/) contra o motor em JS, no Chromium de verdade (SwiftShader no CI).
//
// - Cadeia de ponto + tela: diferença < 1/255 em 8 bits, em cenas sintéticas cobrindo todos os controles.
// - Vizinhança (neblina, clareza, textura, nitidez, grão, vinheta): ΔE em Oklab dentro de TOLERANCIA.
// - Geometria (giro, espelho, ângulo, corte, orientação do EXIF), região e zoom.
// - Avisos de corte e de sombra, comparar com divisória, look (LUT 3D tetraédrica) e contexto perdido.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { neutro, normalizar } from '../src/motor/ajustes.js'
import { contextoDe, revelar } from '../src/motor/revelar.js'
import { criarPonto } from '../src/motor/ponto.js'
import { tirarNeblina } from '../src/motor/local.js'
import { telaDe } from '../src/motor/tela.js'
import { criarOklab } from '../src/motor/cor/oklab.js'
import { CURVAS } from '../src/motor/cor/espacos.js'
import { AVISOS, TOLERANCIA, luzDoArDaFoto } from '../src/motor/gpu/motor.js'
import { EXIGIR } from './apoio-tela.js'
import { NA_PAGINA, abrirPagina, baseParaPagina, baseSintetica, deBase64, semChromium } from './apoio-gpu.js'

const pular = semChromium && !EXIGIR ? semChromium : false

// Ajustes que juntos passam por todos os controles da cadeia de ponto e da tela
const mexer = (f) => {
  const a = neutro()
  f(a)
  return a
}
const CASOS = [
  ['neutro', neutro()],
  [
    'luz',
    mexer((a) => {
      Object.assign(a.luz, { exposicao: 0.7, contraste: 40, altas: -60, sombras: 50, brancos: 30, pretos: -40 })
    }),
  ],
  [
    'curvas',
    mexer((a) => {
      Object.assign(a.curva, { altas: -40, claros: 25, escuros: -20, sombras: 30 })
      a.curva.pontos.luz = [
        [0, 0.05],
        [0.3, 0.25],
        [0.7, 0.78],
        [1, 0.96],
      ]
      a.curva.pontos.r = [
        [0, 0],
        [0.5, 0.55],
        [1, 1],
      ]
      a.curva.pontos.b = [
        [0, 0.04],
        [0.6, 0.55],
        [1, 1],
      ]
    }),
  ],
  [
    'branco manual',
    mexer((a) => {
      a.branco = { modo: 'manual', temperatura: 3800, tinta: 20 }
      a.luz.exposicao = -0.4
    }),
  ],
  [
    'branco auto',
    mexer((a) => {
      a.branco.modo = 'auto'
    }),
  ],
  [
    'cor',
    mexer((a) => {
      a.cor = { vibracao: 55, saturacao: -25 }
      a.misturador.matiz = [30, -40, 20, 60, -50, 35, -20, 10]
      a.misturador.saturacao = [-30, 40, 10, -60, 50, 20, 70, -10]
      a.misturador.luz = [40, -30, 20, 50, -40, -20, 30, 10]
      Object.assign(a.calibracao, { sombrasTinta: 30, vermelhoMatiz: 25, vermelhoSaturacao: -20, verdeMatiz: -30 })
      Object.assign(a.calibracao, { verdeSaturacao: 40, azulMatiz: 15, azulSaturacao: 30 })
    }),
  ],
  [
    'pb tonalizado',
    mexer((a) => {
      a.pb = { ativo: true, mistura: [40, 20, -30, 10, 50, -40, 0, 30] }
      a.tonalizacao.sombras = { matiz: 35, saturacao: 40, luz: -20 }
      a.tonalizacao.altas = { matiz: 50, saturacao: 25, luz: 10 }
    }),
  ],
  [
    'pb puro',
    mexer((a) => {
      a.pb = { ativo: true, mistura: [-20, 30, 0, 0, 40, -10, 0, 0] }
    }),
  ],
  [
    'tonalizacao e desbotar',
    mexer((a) => {
      a.tonalizacao.sombras = { matiz: 200, saturacao: 60, luz: 20 }
      a.tonalizacao.meios = { matiz: 30, saturacao: 30, luz: -10 }
      a.tonalizacao.altas = { matiz: 45, saturacao: 50, luz: 0 }
      a.tonalizacao.global = { matiz: 300, saturacao: 15, luz: 5 }
      a.tonalizacao.equilibrio = 30
      a.tonalizacao.mistura = 70
      a.efeitos.desbotar = 60
    }),
  ],
  [
    'tela',
    mexer((a) => {
      a.tela = { contraste: 35, preservarMatiz: 40, margemAltas: 2.5, margemSombras: 6 }
      a.cor.saturacao = 40
    }),
  ],
  [
    'gamut',
    mexer((a) => {
      a.luz.exposicao = 1.8
      a.cor = { vibracao: 100, saturacao: 100 }
    }),
  ],
]

function maiorDiferenca(js, gpu) {
  let pior = 0
  let soma = 0
  const n = js.largura * js.altura
  for (let p = 0; p < n; p++) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(js.dados[p * 3 + c] - gpu[p * 4 + c])
      soma += d
      if (d > pior) pior = d
    }
  }
  return { pior: pior * 255, media: (soma / (n * 3)) * 255 }
}

// ΔE em Oklab entre duas imagens de código sRGB (js: 3 por pixel; gpu: 4 por pixel)
function deltaE(js, gpu) {
  const ok = criarOklab('srgb')
  const dec = CURVAS.srgb.decodificar
  const n = js.largura * js.altura
  const d = new Float64Array(n)
  const a = [0, 0, 0]
  const b = [0, 0, 0]
  for (let p = 0; p < n; p++) {
    ok.paraOklab(dec(js.dados[p * 3]), dec(js.dados[p * 3 + 1]), dec(js.dados[p * 3 + 2]), a)
    ok.paraOklab(dec(gpu[p * 4]), dec(gpu[p * 4 + 1]), dec(gpu[p * 4 + 2]), b)
    d[p] = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  }
  const ordem = Float64Array.from(d).sort()
  return { media: d.reduce((s, v) => s + v, 0) / n, p99: ordem[Math.floor(n * 0.99)], pior: ordem[n - 1] }
}

async function naGpu(pagina, base, lista, extra = {}) {
  return pagina.evaluate(
    async ({ base, lista, extra }) => {
      const m = await window.__gpu.motor({ precisao: 'alta' })
      m.carregarBase(window.__gpu.base(base))
      const saida = []
      for (const [ajustes, opcoes] of lista) {
        const r = m.desenhar(ajustes, { alvo: 'textura', ...extra, ...opcoes })
        const lido = m.ler()
        saida.push({ ...r, dados: window.__gpu.b64(lido.dados), largura: lido.largura, altura: lido.altura })
      }
      return saida
    },
    { base: baseParaPagina(base), lista, extra },
  )
}

test('GPU: espelho da cadeia de ponto e da tela abaixo de 1/255, em todos os controles', { skip: pular, timeout: 240000 }, async () => {
  const s = await abrirPagina()
  try {
    await s.pagina.evaluate(NA_PAGINA)
    const info = await s.pagina.evaluate(async () => (await window.__gpu.motor({ precisao: 'alta' })).info)
    console.log(`# renderizador: ${info.renderizador} (software: ${info.software})`)
    let pior = 0
    for (const [semente, ganho] of [
      [7, 1],
      [11, 3],
    ]) {
      const base = baseSintetica(semente, 240, 160, { ganho })
      for (const tela of ['srgb', 'p3', 'rec2020']) {
        const casos = tela === 'srgb' ? CASOS : CASOS.filter(([n]) => ['luz', 'cor', 'gamut', 'tela'].includes(n))
        const saidas = await naGpu(
          s.pagina,
          base,
          casos.map(([, a]) => [a, { tela }]),
        )
        casos.forEach(([nome, ajustes], i) => {
          const js = revelar(base, ajustes, { semLocal: true, tela })
          const d = maiorDiferenca(js, deBase64(saidas[i].dados))
          pior = Math.max(pior, d.pior)
          assert.ok(d.pior < TOLERANCIA.ponto * 255, `${nome} (${tela}, ganho ${ganho}): pior ${d.pior.toFixed(3)}/255, média ${d.media.toFixed(4)}/255`)
        })
      }
    }
    console.log(`# ponto + tela: pior diferença ${pior.toFixed(3)}/255`)
    assert.deepEqual(s.olho.erros, [])
  } finally {
    await s.fechar()
  }
})

const VIZINHANCA = [
  ['neblina +', (a) => (a.presenca.neblina = 60)],
  ['neblina −', (a) => (a.presenca.neblina = -40)],
  ['clareza +', (a) => (a.presenca.clareza = 70)],
  ['clareza −', (a) => (a.presenca.clareza = -50)],
  ['textura', (a) => (a.presenca.textura = 80)],
  ['nitidez', (a) => Object.assign(a.detalhe, { nitidez: 110, raio: 1.6, detalhe: 60 })],
  ['nitidez com máscara', (a) => Object.assign(a.detalhe, { nitidez: 90, raio: 1.2, mascara: 50 })],
  ['grão', (a) => Object.assign(a.efeitos, { grao: 70, graoTamanho: 40, graoAspereza: 70 })],
  ['vinheta', (a) => Object.assign(a.efeitos, { vinheta: -60, vinhetaMeio: 30, vinhetaSuavidade: 70 })],
  [
    'tudo',
    (a) => {
      a.presenca = { textura: 40, clareza: 50, neblina: 30 }
      Object.assign(a.detalhe, { nitidez: 60, raio: 1, mascara: 20 })
      Object.assign(a.efeitos, { grao: 30, vinheta: 25 })
      Object.assign(a.luz, { contraste: 20, sombras: 30 })
      a.cor.vibracao = 30
    },
  ],
]

// Pôr neblina: revelar.js mede a luz do ar em cada ladrilho (só a de tirar é da foto inteira); a placa usa a da foto
// inteira nos dois sentidos. A referência aqui é a mesma cadeia do JS (ponto → tirarNeblina → tela) com o ar da foto.
function porNeblinaComArDaFoto(base, ajustes) {
  const a = normalizar(ajustes)
  const contexto = contextoDe(base, a)
  const { largura, altura } = base.imagem
  const dados = Float32Array.from(base.imagem.dados)
  criarPonto(a, contexto).aplicarEm(dados, largura * altura)
  tirarNeblina({ largura, altura, dados, x0: 0, y0: 0, quadro: { largura, altura }, escala: 1 }, { quantidade: a.presenca.neblina, ar: luzDoArDaFoto(base, a) })
  const saida = new Float32Array(dados.length)
  telaDe('srgb', a, base).aplicarEm(dados, saida, largura * altura)
  return { largura, altura, dados: saida }
}

test('GPU: vizinhança dentro da tolerância (ΔE em Oklab), também em região com margem', { skip: pular, timeout: 300000 }, async () => {
  const s = await abrirPagina()
  try {
    await s.pagina.evaluate(NA_PAGINA)
    // 800 × 533: a clareza (raio 10) e o guiado da neblina (raio 20) passam de RAIO_MAXIMO e rodam reduzidos
    const base = baseSintetica(23, 800, 533)
    const casos = VIZINHANCA.map(([nome, f]) => [nome, mexer(f)])
    const saidas = await naGpu(
      s.pagina,
      base,
      casos.map(([, a]) => [a, { semente: 5 }]),
    )
    const linhas = []
    casos.forEach(([nome, ajustes], i) => {
      const js = nome === 'neblina −' ? porNeblinaComArDaFoto(base, ajustes) : revelar(base, ajustes, { semente: 5 })
      const d = deltaE(js, deBase64(saidas[i].dados))
      linhas.push(`${nome}: média ${d.media.toFixed(4)}, p99 ${d.p99.toFixed(4)}, pior ${d.pior.toFixed(3)}`)
      const dentro = d.media < TOLERANCIA.vizinhanca.media && d.p99 < TOLERANCIA.vizinhanca.p99
      assert.ok(dentro, `${nome}: ΔE média ${d.media.toFixed(4)}, p99 ${d.p99.toFixed(4)}`)
    })
    console.log(`# vizinhança (ΔE Oklab, 800×533):\n#   ${linhas.join('\n#   ')}`)
    // uma região do meio, com a vizinhança toda ligada: o pedaço é o mesmo da foto inteira
    const regiao = { x: 210, y: 130, largura: 300, altura: 200 }
    const tudo = casos.at(-1)[1]
    const [r] = await naGpu(s.pagina, base, [[tudo, { semente: 5, regiao }]])
    assert.equal(r.largura, 300)
    assert.equal(r.altura, 200)
    const d = deltaE(revelar(base, tudo, { semente: 5, regiao }), deBase64(r.dados))
    assert.ok(d.media < TOLERANCIA.vizinhanca.media && d.p99 < TOLERANCIA.vizinhanca.p99, `região: ΔE média ${d.media.toFixed(4)}, p99 ${d.p99.toFixed(4)}`)
    assert.deepEqual(s.olho.erros, [])
  } finally {
    await s.fechar()
  }
})

test('GPU: geometria (orientação, giro, espelhos, ângulo, corte) e zoom', { skip: pular, timeout: 240000 }, async () => {
  const s = await abrirPagina()
  try {
    await s.pagina.evaluate(NA_PAGINA)
    const geo = (g) => mexer((a) => Object.assign(a.geometria, g))
    const casos = [
      geo({ giro: 90 }),
      geo({ giro: 180, espelhoH: true }),
      geo({ giro: 270, espelhoV: true }),
      geo({ angulo: 7.5 }),
      geo({ angulo: -12, corte: { x: 0.1, y: 0.2, l: 0.6, a: 0.5 } }),
      geo({ giro: 90, corte: { x: 0.25, y: 0, l: 0.5, a: 0.8 } }),
    ]
    for (const orientacao of [1, 6, 8, 3]) {
      const base = baseSintetica(31, 180, 120, { orientacao })
      const saidas = await naGpu(
        s.pagina,
        base,
        casos.map((a) => [a, {}]),
      )
      casos.forEach((ajustes, i) => {
        const js = revelar(base, ajustes, { semLocal: true })
        assert.equal(saidas[i].largura, js.largura, `orientação ${orientacao}, caso ${i}: largura`)
        assert.equal(saidas[i].altura, js.altura, `orientação ${orientacao}, caso ${i}: altura`)
        const d = maiorDiferenca(js, deBase64(saidas[i].dados))
        assert.ok(d.pior < 1, `orientação ${orientacao}, caso ${i}: pior ${d.pior.toFixed(3)}/255`)
      })
    }
    // zoom 0,5 com superamostragem: a média de cada bloco 2 × 2 do JS fica perto do pixel da GPU
    const base = baseSintetica(31, 180, 120)
    const [meio] = await naGpu(s.pagina, base, [[neutro(), { zoom: 0.5, semLocal: true }]])
    assert.equal(meio.largura, 90)
    assert.equal(meio.altura, 60)
    const cheio = revelar(base, neutro(), { semLocal: true })
    const g = deBase64(meio.dados)
    let soma = 0
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 90; x++)
        for (let c = 0; c < 3; c++) {
          let m = 0
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) m += cheio.dados[((y * 2 + dy) * 180 + x * 2 + dx) * 3 + c]
          soma += Math.abs(m / 4 - g[(y * 90 + x) * 4 + c])
        }
    assert.ok(soma / (90 * 60 * 3) < 0.02, `zoom 0,5: diferença média ${(soma / (90 * 60 * 3)).toFixed(4)}`)
  } finally {
    await s.fechar()
  }
})

test('GPU: avisos de altas (recuperáveis e perdidas) e de sombra abaixo do piso de ruído', { skip: pular, timeout: 120000 }, async () => {
  const s = await abrirPagina()
  try {
    await s.pagina.evaluate(NA_PAGINA)
    // limiar de corte 1 em cada canal: topo com os três canais em 4 (perdida), faixa seguinte só com o vermelho (recuperável)
    const base = baseSintetica(3, 200, 120, { altas: true, latitude: { margem: { abaixoDoCinza: 2, acimaDoCinza: 2.5 } } })
    base.corte = { matriz: [1, 0, 0, 0, 1, 0, 0, 0, 1], limiar: [1, 1, 1] }
    const [com, sem] = await naGpu(s.pagina, base, [
      [neutro(), { avisos: true }],
      [neutro(), { avisos: false }],
    ])
    const a = deBase64(com.dados)
    const b = deBase64(sem.dados)
    const px = (d, x, y) => [0, 1, 2].map((c) => d[(y * 200 + x) * 4 + c])
    const igual = (v, cor) => v.every((x, i) => Math.abs(x - cor[i]) < 1e-3)
    // perdida: sólido
    for (const [x, y] of [
      [0, 0],
      [57, 3],
      [199, 5],
    ])
      assert.ok(igual(px(a, x, y), AVISOS.perdida), `perdida em ${x},${y}: ${px(a, x, y)}`)
    // recuperável: listras (metade da faixa pintada)
    let pintados = 0
    for (let y = 6; y < 12; y++) for (let x = 0; x < 200; x++) if (igual(px(a, x, y), AVISOS.recuperavel)) pintados++
    assert.ok(pintados > 500 && pintados < 700, `recuperáveis pintados: ${pintados} de 1200`)
    // sombra: a faixa de cinzas de baixo começa em 0,02 (abaixo do piso 0,18·2^−2 = 0,045)
    assert.ok(
      [0, 1, 2, 3, 4, 5, 6, 7].some((x) => igual(px(a, x, 118), AVISOS.sombra)),
      'sombra marcada',
    )
    // sem avisos, nada disso aparece
    assert.ok(!igual(px(b, 0, 0), AVISOS.perdida))
    // foto pronta: o que o JPEG tinha em 255 é perdido
    const pronta = baseSintetica(3, 200, 120, { altas: true, origem: 'imagem' })
    const [img] = await naGpu(s.pagina, pronta, [[neutro(), { avisos: { altas: true, sombras: false } }]])
    assert.ok(igual(px(deBase64(img.dados), 10, 2), AVISOS.perdida))
  } finally {
    await s.fechar()
  }
})

// LUT de teste: esquenta e sobe o contraste. Interpolação tetraédrica escrita aqui, independente do shader.
function lutDeTeste(n = 17) {
  const dados = new Float32Array(n ** 3 * 3)
  let i = 0
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++) {
        const k = (v) => Math.min(1, Math.max(0, 0.5 + (v - 0.5) * 1.2))
        dados[i++] = k((r / (n - 1)) * 1.08)
        dados[i++] = k(g / (n - 1))
        dados[i++] = k((b / (n - 1)) * 0.88)
      }
  return { tamanho: n, dados }
}
function tetraedrica(lut, r, g, b, saida) {
  const n = lut.tamanho - 1
  const x = [r, g, b].map((v) => Math.min(1, Math.max(0, v)) * n)
  const i = x.map((v) => Math.min(Math.floor(v), n - 1))
  const f = x.map((v, k) => v - i[k])
  const em = (dr, dg, db) => {
    const o = ((i[2] + db) * lut.tamanho * lut.tamanho + (i[1] + dg) * lut.tamanho + i[0] + dr) * 3
    return [lut.dados[o], lut.dados[o + 1], lut.dados[o + 2]]
  }
  // ordena as frações: o caminho do canto 000 ao 111 passa pelos eixos na ordem decrescente
  const ordem = [0, 1, 2].sort((p, q) => f[q] - f[p] || p - q)
  let canto = [0, 0, 0]
  let atual = em(0, 0, 0)
  const s = [...atual]
  for (const eixo of ordem) {
    canto = canto.map((v, k) => (k === eixo ? 1 : v))
    const prox = em(...canto)
    for (let c = 0; c < 3; c++) s[c] += f[eixo] * (prox[c] - atual[c])
    atual = prox
  }
  saida[0] = s[0]
  saida[1] = s[1]
  saida[2] = s[2]
  return saida
}

test('GPU: comparar com divisória e look em LUT 3D', { skip: pular, timeout: 120000 }, async () => {
  const s = await abrirPagina()
  try {
    await s.pagina.evaluate(NA_PAGINA)
    const base = baseSintetica(9, 200, 120)
    const depois = mexer((a) => {
      a.luz.exposicao = 1
      a.cor.saturacao = 30
    })
    const [c] = await naGpu(s.pagina, base, [[depois, { comparar: { posicao: 0.5 } }]])
    const g = deBase64(c.dados)
    const antes = revelar(base, neutro(), { semLocal: true })
    const dep = revelar(base, depois, { semLocal: true })
    const px = (y, x) => (y * 200 + x) * 4
    for (const [x, ref] of [
      [20, antes],
      [98, antes],
      [101, dep],
      [180, dep],
    ])
      for (let c2 = 0; c2 < 3; c2++) assert.ok(Math.abs(g[px(60, x) + c2] - ref.dados[(60 * 200 + x) * 3 + c2]) < 1 / 255, `coluna ${x}`)
    assert.ok(Math.abs(g[px(60, 100)] - 0.94) < 1e-3, 'divisória')
    // look: a LUT sobre o código da tela, na quantidade de ajustes.look
    const lut = lutDeTeste()
    const comLook = mexer((a) => {
      a.look = { id: 'teste', quantidade: 70 }
      a.luz.contraste = 15
    })
    const r = await s.pagina.evaluate(
      async ({ base, ajustes, lut }) => {
        const m = await window.__gpu.motor({ precisao: 'alta' })
        m.carregarBase(window.__gpu.base(base))
        m.desenhar(ajustes, { alvo: 'textura', look: { tamanho: lut.tamanho, dados: window.__gpu.de64(lut.dados) } })
        return window.__gpu.b64(m.ler().dados)
      },
      { base: baseParaPagina(base), ajustes: comLook, lut: { tamanho: lut.tamanho, dados: Buffer.from(lut.dados.buffer).toString('base64') } },
    )
    const js = revelar(base, comLook, { semLocal: true, look: (r2, g2, b2, saida) => tetraedrica(lut, r2, g2, b2, saida) })
    const d = maiorDiferenca(js, deBase64(r))
    assert.ok(d.pior < 1, `look: pior ${d.pior.toFixed(3)}/255`)
  } finally {
    await s.fechar()
  }
})

test('GPU: contexto perdido vira erro claro, e o motor volta depois de restaurado', { skip: pular, timeout: 120000 }, async () => {
  const s = await abrirPagina()
  try {
    await s.pagina.evaluate(NA_PAGINA)
    const base = baseParaPagina(baseSintetica(2, 64, 48))
    const r = await s.pagina.evaluate(async (base) => {
      const m = await window.__gpu.motor()
      m.carregarBase(window.__gpu.base(base))
      m.desenhar({})
      const ext = window.__gpu.gl.getExtension('WEBGL_lose_context')
      ext.loseContext()
      await new Promise((ok) => setTimeout(ok, 50))
      let erro = null
      try {
        m.desenhar({})
      } catch (e) {
        erro = { nome: e.name, codigo: e.codigo, mensagem: e.message }
      }
      const perdido = m.perdido()
      ext.restoreContext()
      await new Promise((ok) => window.__gpu.canvas.addEventListener('webglcontextrestored', ok, { once: true }))
      const { criarMotorGpu } = await import('/src/motor/gpu/motor.js')
      const novo = criarMotorGpu(window.__gpu.gl)
      novo.carregarBase(window.__gpu.base(base))
      const info = novo.desenhar({ luz: { exposicao: 0.5 } })
      const px = novo.ler({ tipo: 'uint8' }).dados
      return { erro, perdido, largura: info.largura, algum: px.some((v, i) => i % 4 !== 3 && v > 0) }
    }, base)
    assert.deepEqual(r.erro, { nome: 'ErroGpu', codigo: 'contexto-perdido', mensagem: 'A placa de vídeo foi reiniciada.' })
    assert.equal(r.perdido, true)
    assert.equal(r.largura, 64)
    assert.equal(r.algum, true, 'depois de restaurado, a imagem volta (não é tela preta)')
  } finally {
    await s.fechar()
  }
})
