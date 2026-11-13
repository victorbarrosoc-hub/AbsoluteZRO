// Latitude: o que se mede no dado do sensor. Negativos fabricados com preto, corte, ganho e ruído conhecidos têm de
// voltar dentro da tolerância declarada em cada teste; com as amostras CC0, os números batem com a tabela da pesquisa.

import test from 'node:test'
import assert from 'node:assert/strict'

import { criarNegativo } from '../src/raw/negativo.js'
import { medirLatitude, resumoLatitude } from '../src/raw/latitude.js'
import { lerDng, escreverDng } from '../src/raw/dng.js'
import { criarLeitor } from '../src/raw/libraw.js'
import { fabricarNegativo, cena, acaso, carregarLibRaw, precisaDoLibRaw, precisaDeAmostras, lerAmostra } from './apoio-raw.js'

const perto = (a, b, tol, nome) => assert.ok(Math.abs(a - b) <= tol, `${nome}: ${a} deveria estar a ${tol} de ${b}`)
const relativo = (a, b, tol, nome) => assert.ok(Math.abs(a / b - 1) <= tol, `${nome}: ${a} deveria estar a ${tol * 100} % de ${b}`)

// Câmera de teste: preto 512, sensor que corta em 12000 mas declara 16383 (o caso da Canon 30D), ganho de 0,5 DN²
// por DN (2 e⁻/DN), 3 DN de ruído de leitura, 40 colunas e 24 linhas mascaradas
const CAMERA = { largura: 1200, altura: 800, esquerda: 40, topo: 24, preto: 512, corte: 12000, declarado: 16383, ganho: 0.5, leitura: 3 }
const FAIXA = CAMERA.corte - CAMERA.preto

/** Fração dos blocos 2×2 com exatamente 1, 2 e 3 canais acima de 98 % da faixa, pela cena SEM ruído. */
function cortadoDaCena({ largura, altura, pico = 1.5, stops = 15 }) {
  const conta = [0, 0, 0, 0]
  for (let y = 0; y < altura; y += 2) {
    for (let x = 0; x < largura; x += 2) {
      let k = 0
      // RGGB: vermelho em (0,0), verdes em (0,1) e (1,0), azul em (1,1); canal cortado se algum sensel dele passa
      const passa = (dx, dy, c) => cena((x + dx) / largura, (y + dy) / altura, c, { pico: pico * FAIXA, stops }) >= 0.98 * FAIXA
      if (passa(0, 0, 0)) k++
      if (passa(1, 0, 1) || passa(0, 1, 1)) k++
      if (passa(1, 1, 2)) k++
      conta[k]++
    }
  }
  const total = (largura / 2) * (altura / 2)
  return { um: conta[1] / total, dois: conta[2] / total, tres: conta[3] / total }
}

test('latitude recupera preto, saturação, ganho e ruído de um sensor fabricado (com pixels mascarados)', () => {
  const n = criarNegativo(fabricarNegativo({ ...CAMERA, semente: 42 }))
  const l = medirLatitude(n)

  // preto: medido nos mascarados, a ±0,1 DN do verdadeiro
  for (let c = 0; c < 3; c++) perto(l.preto[c], 512, 0.1, `preto[${c}]`)
  assert.equal(l.detalhe.mascarados.margem, 'esquerda')
  // saturação efetiva: o corte de verdade (12000), não o declarado (16383), nos três canais, exato
  assert.deepEqual(l.branco, [12000, 12000, 12000])
  assert.deepEqual(l.detalhe.brancoDeclarado, [16383, 16383, 16383])
  // ruído: leitura a 5 % (mascarados) e ganho a 8 % (ajuste)
  assert.equal(l.ruido.origem, 'mascarados')
  relativo(l.ruido.leitura, 3, 0.05, 'ruído de leitura')
  relativo(l.ruido.ganho, 0.5, 0.08, 'ganho')
  assert.equal(l.confianca, 'alta')
  // faixa: engenharia = log2(11488 / 3) = 11,90; fotográfica pelo sinal de SNR 10 = (50 + √(2500 + 3600)) / 2 = 64,05 DN → 7,49
  perto(l.faixa.engenharia, Math.log2(FAIXA / 3), 0.08, 'faixa de engenharia')
  perto(l.faixa.fotografica, Math.log2(FAIXA / 64.05), 0.1, 'faixa fotográfica')
  // margens em torno do cinza: 2,47 acima; abaixo = log2(0,18 · 11488 / 3)
  perto(l.margem.acimaDoCinza, Math.log2(1 / 0.18), 1e-9, 'acima do cinza')
  perto(l.margem.abaixoDoCinza, Math.log2((0.18 * FAIXA) / 3), 0.08, 'abaixo do cinza')
  // a cena estoura os três canais no topo: nenhuma folga nas altas; e o pé da escada some no ruído
  assert.deepEqual(l.margem.altas, [0, 0, 0])
  assert.ok(l.margem.sombras < 0.6, `sombras ${l.margem.sombras}`)
  // área cortada: a ±0,5 ponto percentual da cena sem ruído
  const verdade = cortadoDaCena(CAMERA)
  assert.ok(verdade.um > 0.01 && verdade.dois > 0.01 && verdade.tres > 0.01, 'a cena de teste tem os três casos')
  for (const k of ['um', 'dois', 'tres']) perto(l.cortado[k], verdade[k], 0.005, `cortado.${k}`)

  // o mesmo negativo, depois de virar DNG e voltar, dá a mesma medida
  assert.deepEqual(medirLatitude(lerDng(escreverDng(n))), l)
})

test('latitude sem pixels mascarados: ruído pelo ajuste entre verdes vizinhos (leitura a 20 %, ganho a 8 %)', () => {
  for (const [cfa, semente] of [['RGGB', 7], ['GBRG', 8], ['BGGR', 9]]) {
    const n = criarNegativo(fabricarNegativo({ ...CAMERA, esquerda: 0, topo: 0, cfa, semente }))
    const l = medirLatitude(n)
    assert.equal(l.ruido.origem, 'ajuste', cfa)
    assert.deepEqual(l.preto, [512, 512, 512], 'sem mascarados vale o preto declarado')
    assert.deepEqual(l.branco, [12000, 12000, 12000])
    relativo(l.ruido.ganho, 0.5, 0.08, `ganho (${cfa})`)
    relativo(l.ruido.leitura, 3, 0.2, `leitura (${cfa})`)
    perto(l.faixa.engenharia, Math.log2(FAIXA / 3), 0.3, `faixa de engenharia (${cfa})`)
    assert.equal(l.confianca, 'media')
    assert.equal(l.detalhe.mascarados, null)
  }
})

test('latitude em X-Trans: blocos de 3×3 e verdes vizinhos na linha', () => {
  const n = criarNegativo(fabricarNegativo({ ...CAMERA, largura: 1200, altura: 798, esquerda: 0, topo: 6, cfa: 'XTRANS', preto: 1022, corte: 16383, semente: 13 }))
  const l = medirLatitude(n)
  assert.deepEqual(l.branco, [16383, 16383, 16383])
  assert.equal(l.ruido.origem, 'ajuste')
  relativo(l.ruido.ganho, 0.5, 0.08, 'ganho')
  relativo(l.ruido.leitura, 3, 0.25, 'leitura')
  assert.ok(l.cortado.um > 0.01 && l.cortado.dois > 0.01 && l.cortado.tres > 0.01)
  perto(l.cortado.um + l.cortado.dois + l.cortado.tres, 0.185, 0.03, 'área com algum canal cortado')
})

test('latitude com NoiseProfile: vale o perfil do arquivo, convertido para DN', () => {
  const n = fabricarNegativo({ ...CAMERA, esquerda: 0, topo: 0, corte: 16383, semente: 3 })
  const faixa = 16383 - 512
  // perfil que descreve exatamente a câmera fabricada: escala = ganho / faixa, deslocamento = (leitura / faixa)²
  n.perfilRuido = [0, 1, 2].map(() => ({ escala: 0.5 / faixa, deslocamento: (3 / faixa) ** 2 }))
  const l = medirLatitude(criarNegativo(n))
  assert.equal(l.ruido.origem, 'perfil')
  perto(l.ruido.ganho, 0.5, 1e-9, 'ganho do perfil')
  perto(l.ruido.leitura, 3, 1e-9, 'leitura do perfil')
  assert.equal(l.confianca, 'alta', 'o ajuste confirma o perfil')
  relativo(l.detalhe.ajuste.ganho, 0.5, 0.08, 'ganho do ajuste, para conferir o perfil')
  // perfil que não bate com o dado (ganho 5× menor): continua valendo, mas a confiança cai
  n.perfilRuido = [0, 1, 2].map(() => ({ escala: 0.1 / faixa, deslocamento: (3 / faixa) ** 2 }))
  assert.equal(medirLatitude(n).confianca, 'media')
})

test('latitude: sem corte o branco é o declarado; a exposição base desloca o cinza', () => {
  // cena que chega só a 40 % do sensor, 1,5 stop abaixo do topo
  const n = criarNegativo(fabricarNegativo({ ...CAMERA, corte: 16383, pico: 0.4, stops: 9, exposicaoBase: 0.72, semente: 5 }))
  const l = medirLatitude(n)
  assert.deepEqual(l.branco, [16383, 16383, 16383])
  assert.deepEqual(l.detalhe.empilhamento, [null, null, null])
  assert.deepEqual(l.cortado, { um: 0, dois: 0, tres: 0 })
  // topo da cena (percentil 99,9): 0,4 · 1,0 (último degrau vertical) · cor do canal → folga = log2(1 / (0,4 · cor))
  ;[0.5, 1, 0.72].forEach((cor, c) => perto(l.margem.altas[c], Math.log2(1 / (0.4 * cor)), 0.06, `altas[${c}]`))
  perto(l.margem.acimaDoCinza, Math.log2(1 / 0.18) + 0.72, 1e-9, 'acima do cinza com exposição base')
  perto(l.margem.abaixoDoCinza, Math.log2((0.18 * (16383 - 512)) / 3) - 0.72, 0.08, 'abaixo do cinza com exposição base')
  // pé da cena (percentil 0,1): 9 stops abaixo do pico, 0,55 no degrau vertical mais escuro, verde
  perto(l.margem.sombras, Math.log2((0.4 * 15871 * 2 ** -9 * 0.55) / 3), 0.35, 'folga nas sombras')
})

test('latitude: margem que não é sensor mascarado não vira preto', () => {
  // enchimento com zeros (Fuji, Ricoh), com o teto do formato (Panasonic) e margem com imagem (Sony): nenhuma serve
  for (const enchimento of [0, 16383]) {
    const n = criarNegativo(fabricarNegativo({ ...CAMERA, largura: 400, altura: 300, direita: 40, esquerda: 0, enchimento, semente: 2 }))
    const l = medirLatitude(n)
    assert.equal(l.detalhe.mascarados, null, `enchimento ${enchimento}`)
    assert.deepEqual(l.preto, [512, 512, 512])
  }
  const comImagem = fabricarNegativo({ ...CAMERA, largura: 440, altura: 300, esquerda: 0, topo: 0, semente: 2 })
  comImagem.area = { x: 0, y: 0, largura: 400, altura: 300 } // as 40 colunas da direita são imagem, declaradas como margem
  assert.equal(medirLatitude(criarNegativo(comImagem)).detalhe.mascarados, null)
  // preto mascarado que não conversa com o declarado (outra calibração): fica o declarado
  const outro = fabricarNegativo({ ...CAMERA, largura: 400, altura: 300, semente: 2 })
  outro.preto.porCanal = [300, 300, 300]
  const l = medirLatitude(criarNegativo(outro))
  assert.equal(l.detalhe.mascarados, null)
  assert.deepEqual(l.preto, [300, 300, 300])
})

test('latitude: quadro todo estourado não inventa ruído; o resumo diz o que houve', () => {
  const n = criarNegativo(fabricarNegativo({ largura: 240, altura: 160, preto: 512, corte: 16383, sinal: () => 1e6, semente: 1 }))
  const l = medirLatitude(n)
  assert.deepEqual(l.ruido, { leitura: null, ganho: null, origem: 'declarado' })
  assert.deepEqual(l.faixa, { engenharia: null, fotografica: null })
  assert.equal(l.margem.sombras, null)
  assert.equal(l.margem.abaixoDoCinza, null)
  assert.deepEqual(l.cortado, { um: 0, dois: 0, tres: 1 })
  assert.equal(l.confianca, 'baixa')
  assert.deepEqual(resumoLatitude(l), ['Altas luzes: 100 % da área estourou de vez', 'Ruído não medido neste arquivo'])
})

test('resumoLatitude: frases curtas, em português, só com o que foi medido', () => {
  const base = {
    preto: [512, 512, 512],
    branco: [14008, 14008, 14008],
    ruido: { leitura: 0.8, ganho: 0.58, origem: 'mascarados' },
    faixa: { engenharia: 14.04, fotografica: 7.84 },
    margem: { altas: [1.99, 1.08, 1.71], sombras: 5.62, acimaDoCinza: 2.47, abaixoDoCinza: 11.6 },
    cortado: { um: 0, dois: 0, tres: 0 },
    confianca: 'alta'
  }
  assert.deepEqual(resumoLatitude(base), ['+1,1 EV até estourar', '5,6 EV de sombra limpa', '14,0 EV de faixa no sensor (7,8 com pouco ruído)'])
  const estourada = { ...base, margem: { ...base.margem, altas: [0.3, 0, 0], sombras: 0 }, cortado: { um: 0.031, dois: 0.004, tres: 0.012 }, confianca: 'baixa' }
  assert.deepEqual(resumoLatitude(estourada), [
    'Altas luzes: 1,2 % da área estourou de vez',
    'Altas luzes: 3,5 % da área perdeu um canal (recuperável)',
    'Sombras já no ruído',
    '14,0 EV de faixa no sensor (7,8 com pouco ruído)',
    'Medida aproximada: o ruído deste arquivo não fechou no modelo'
  ])
  for (const frase of [...resumoLatitude(base), ...resumoLatitude(estourada)]) assert.ok(frase.length <= 64, frase)
})

test('latitude de 24 MP em menos de 150 ms', (t) => {
  // 6000 × 4000 com ruído de verdade numa faixa de 200 linhas, repetida (o tempo não depende do conteúdo)
  const largura = 6000
  const altura = 4000
  const faixa = fabricarNegativo({ largura, altura: 200, preto: 512, corte: 15000, semente: 4 })
  const dados = new Uint16Array(largura * altura)
  for (let y = 0; y < altura; y += 200) dados.set(faixa.sensor.dados, y * largura)
  // embaralha as linhas de cada cópia para as repetições não serem idênticas
  const rng = acaso(9)
  for (let i = 0; i < dados.length; i += 4001) dados[i] = Math.min(15000, dados[i] + Math.floor(rng.u() * 3))
  const n = criarNegativo({ ...faixa, sensor: { largura, altura, dados }, area: { x: 0, y: 0, largura, altura } })
  const tempos = []
  let l
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now()
    l = medirLatitude(n)
    tempos.push(performance.now() - t0)
  }
  t.diagnostic(`24 MP: ${tempos.map((v) => `${Math.round(v)} ms`).join(', ')} (amostra de ${(l.detalhe.amostra.sensels / 1e6).toFixed(1)} M sensels, 1 linha de bloco a cada ${l.detalhe.amostra.salto})`)
  assert.ok(Math.min(...tempos) < 150, `melhor de 5: ${Math.min(...tempos).toFixed(0)} ms`)
  assert.deepEqual(l.branco, [15000, 15000, 15000])
  assert.ok(Math.abs(l.ruido.ganho / 0.5 - 1) < 0.1)
})

// ---------------------------------------------------------------------------------------------------- amostras

test('amostras: a latitude bate com a tabela da pesquisa', { timeout: 120000 }, async (t) => {
  if (!precisaDeAmostras(t)) return
  const LibRaw = await carregarLibRaw()
  if (!precisaDoLibRaw(t, LibRaw)) return
  const leitor = criarLeitor(LibRaw)
  const medir = async (nome) => {
    const n = await leitor.ler(await lerAmostra(nome), { nome })
    const t0 = performance.now()
    const l = medirLatitude(n)
    t.diagnostic(`${nome} (${(n.sensor.largura * n.sensor.altura / 1e6).toFixed(1)} MP, ${Math.round(performance.now() - t0)} ms): ${resumoLatitude(l).join(' · ')}`)
    return l
  }

  // Canon 30D: declara 4095 e corta em 3398 (1,45 % dos verdes empilhados); preto 128,07 ± 2,19 nos mascarados
  const c30 = await medir('canon_30d.cr2')
  assert.deepEqual(c30.branco, [3398, 3398, 3398])
  assert.deepEqual(c30.detalhe.brancoDeclarado, [4095, 4095, 4095])
  perto(c30.detalhe.empilhamento[1].fracao, 0.0145, 0.002, '30D: verdes empilhados')
  perto(c30.preto[1], 128.07, 0.15, '30D: preto')
  perto(c30.ruido.leitura, 2.19, 0.1, '30D: ruído de leitura')
  assert.equal(c30.ruido.origem, 'mascarados')
  perto(c30.faixa.engenharia, 10.54, 0.1, '30D: faixa de engenharia')
  perto(c30.faixa.fotografica, 5.5, 0.2, '30D: faixa fotográfica')
  perto(Math.min(...c30.margem.altas), 0, 1e-9, '30D: sem folga nas altas')
  perto(c30.margem.sombras, 0.86, 0.1, '30D: folga nas sombras')
  assert.ok(c30.cortado.um + c30.cortado.dois > 0.01 && c30.cortado.tres < 0.001, '30D: corte recuperável')

  // Canon R6: a margem declarada tem 156 colunas, mas só ~140 são pretas; preto 512,58 ± 0,80; DR 14,04
  const r6 = await medir('canon_r6.cr3')
  perto(r6.preto[1], 512.58, 0.1, 'R6: preto')
  perto(r6.ruido.leitura, 0.8, 0.12, 'R6: ruído de leitura')
  assert.ok(r6.detalhe.mascarados.x + r6.detalhe.mascarados.largura <= 142, 'R6: só as colunas pretas de verdade')
  assert.deepEqual(r6.branco, [14008, 14008, 14008])
  perto(r6.faixa.engenharia, 14.04, 0.25, 'R6: faixa de engenharia')
  perto(r6.faixa.fotografica, 7.84, 0.2, 'R6: faixa fotográfica')
  perto(r6.margem.altas[1], 1.08, 0.03, 'R6: folga nas altas (verde)')
  perto(r6.margem.sombras, 5.62, 0.25, 'R6: folga nas sombras')
  assert.equal(r6.confianca, 'alta')

  // Pixel 6 Pro: o perfil do arquivo (S = 7,703e-6, O = 5,642e-8 → a = 0,118 DN, σ = 3,64 DN, DR 12,04) e o ajuste
  const px = await medir('pixel6pro.dng')
  assert.equal(px.ruido.origem, 'perfil')
  perto(px.ruido.ganho, 0.118, 0.001, 'Pixel: ganho do perfil')
  perto(px.ruido.leitura, 3.64, 0.01, 'Pixel: leitura do perfil')
  perto(px.faixa.engenharia, 12.04, 0.02, 'Pixel: faixa de engenharia')
  relativo(px.detalhe.ajuste.ganho, px.ruido.ganho, 0.15, 'Pixel: inclinação do ajuste contra o perfil')
  assert.ok(px.detalhe.ajuste.leitura > px.ruido.leitura && px.detalhe.ajuste.leitura < 2 * px.ruido.leitura, 'Pixel: a leitura do ajuste é um teto, até 1 stop acima')
  perto(px.margem.acimaDoCinza, 3.19, 0.01, 'Pixel: acima do cinza com BaselineExposure 0,72')
  assert.equal(px.confianca, 'alta')

  // Fuji X-T30 II (X-Trans): 5,4 % dos verdes cortados em 16383
  const fuji = await medir('fuji_xt30ii.raf')
  assert.deepEqual(fuji.branco, [16383, 16383, 16383])
  perto(fuji.detalhe.empilhamento[1].fracao, 0.054, 0.004, 'Fuji: verdes cortados')
  perto(fuji.margem.altas[1], 0, 1e-9, 'Fuji: sem folga no verde')
  relativo(1 / fuji.ruido.ganho, 1.62, 0.2, 'Fuji: ganho em e⁻/DN')

  // Sony A7S: sem mascarados válidos (a margem direita é cópia da imagem); folga de 0,43 EV nas altas
  const a7s = await medir('sony_a7s.arw')
  assert.equal(a7s.detalhe.mascarados, null)
  assert.deepEqual(a7s.branco, [15360, 15360, 15360])
  perto(a7s.margem.altas[1], 0.43, 0.03, 'A7S: folga nas altas')
  relativo(1 / a7s.ruido.ganho, 1.56, 0.1, 'A7S: ganho em e⁻/DN')

  // Ricoh GR: preto declarado 0 (sombras cortadas em zero): o ajuste não fecha e a medida se declara aproximada
  const gr = await medir('ricoh_gr.dng')
  assert.equal(gr.confianca, 'baixa')
  perto(gr.margem.acimaDoCinza, 2.27, 0.01, 'GR: acima do cinza com BaselineExposure −0,2')
})
