// Decupagem · rostos e cena: funções puras sobre detecções fabricadas (malha de 478 pontos com semente geométrica,
// blendshapes à mão) e sobre imagens sintéticas com uma região desfocada de propósito. Nenhum modelo roda aqui, e
// nenhuma foto de pessoa entra no repositório.

import test from 'node:test'
import assert from 'node:assert/strict'

import { lumaDe, medir } from '../src/decupagem/medidas.js'
import { analisarRostos, ear, estadoDosOlhos, faixaDosOlhos, guinadaDaMalha, pesoDoRosto, rostoCortado, LIMIARES_ROSTO, OLHO_DIREITO, OLHO_ESQUERDO } from '../src/decupagem/rostos.js'
import { classificarCena, cenaDeRotulo, eNoite, ROTULOS_PARA_CENA, OBJETOS_DE_ANIMAL, OBJETOS_DE_APOIO, LIMIARES_CENA } from '../src/decupagem/cena.js'
import { CENAS } from '../src/decupagem/textos.js'
import { expressao, folhas, fotografar, gauss, malhaDeRosto, mascaraDaCaixa, misturar, paraPrevia } from './apoio-decupagem.js'

const perto = (obtido, esperado, tolerancia, nome) => assert.ok(Math.abs(obtido - esperado) <= tolerancia, `${nome}: obtido ${obtido}, esperado ${esperado}`)

// ───────────────────────────── EAR e estado dos olhos ─────────────────────────────

test('EAR: a fórmula de Soukupová e Čech nos índices da malha de 478 pontos', () => {
  // olho de largura 10 com as pálpebras a ±1,5: (3 + 3) / (2 · 10) = 0,3
  const malha = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }))
  const [p1, p2, p3, p4, p5, p6] = OLHO_DIREITO
  malha[p1] = { x: 0, y: 0 }
  malha[p4] = { x: 10, y: 0 }
  malha[p2] = { x: 3, y: -1.5 }
  malha[p6] = { x: 3, y: 1.5 }
  malha[p3] = { x: 7, y: -1.5 }
  malha[p5] = { x: 7, y: 1.5 }
  perto(ear(malha, OLHO_DIREITO), 0.3, 1e-12, 'EAR')
  // não depende de escala nem de giro
  const girada = malha.map((p) => ({ x: 7 * (p.x * 0.6 - p.y * 0.8) + 100, y: 7 * (p.x * 0.8 + p.y * 0.6) - 30 }))
  perto(ear(girada, OLHO_DIREITO), 0.3, 1e-12, 'EAR girado e ampliado')
  assert.deepEqual(OLHO_DIREITO, [33, 160, 158, 133, 153, 144])
  assert.deepEqual(OLHO_ESQUERDO, [362, 385, 387, 263, 373, 380])
  assert.equal(ear(malha, OLHO_ESQUERDO), null, 'olho sem largura não tem EAR')
  assert.equal(ear(null, OLHO_DIREITO), null)
  assert.equal(ear([], OLHO_DIREITO), null)
})

test('EAR: a malha fabricada devolve a abertura pedida em cada olho', () => {
  const malha = malhaDeRosto({ ear: [0.31, 0.12] })
  perto(ear(malha, OLHO_DIREITO), 0.31, 1e-9, 'direito')
  perto(ear(malha, OLHO_ESQUERDO), 0.12, 1e-9, 'esquerdo')
  assert.equal(malha.length, 478)
})

test('olhos: as quatro classes pela regra da pesquisa (EAR e blendshapes), com os valores medidos nas fotos de prova', () => {
  const estado = (earDosOlhos, bs) => estadoDosOlhos({ malha: malhaDeRosto({ ear: earDosOlhos }), blendshapes: bs && expressao(bs) }).olhos
  // FECHADOS medidos: EAR 0,06/0,106 com piscada 0,64/0,67; EAR 0,105/0,145 com piscada 0,36/0,47 (o blendshape
  // sozinho perderia este); EAR 0,086/0,19 com piscada 0,24/0,56
  assert.equal(estado([0.06, 0.106], { piscada: [0.64, 0.67] }), 'fechados')
  assert.equal(estado([0.105, 0.145], { piscada: [0.36, 0.47] }), 'fechados')
  assert.equal(estado([0.086, 0.19], { piscada: [0.24, 0.56] }), 'fechados')
  // fechado pela segunda regra: piscada ≥ 0,5 com EAR abaixo de 0,20
  assert.equal(estado([0.18, 0.18], { piscada: 0.55 }), 'fechados')
  // ABERTOS, SORRINDO (olhos apertados): EAR 0,191/0,194, piscada 0,27/0,29, aperto 0,78/0,69, sorriso 0,94/0,92
  assert.equal(estado([0.191, 0.194], { piscada: [0.27, 0.29], aperto: [0.78, 0.69], sorriso: [0.94, 0.92] }), 'sorrindo')
  assert.equal(estado([0.173, 0.21], { piscada: [0.22, 0.31], aperto: [0.65, 0.58], sorriso: [0.95, 0.96] }), 'sorrindo')
  // ABERTOS, NEUTROS: EAR de 0,236 a 0,401, piscada até 0,18
  assert.equal(estado([0.236, 0.236], { piscada: 0.18 }), 'abertos')
  assert.equal(estado([0.401, 0.39], { piscada: 0 }), 'abertos')
  // no meio sem riso: piscada parcial
  assert.equal(estado([0.19, 0.19], { piscada: 0.3, aperto: 0.2, sorriso: 0.1 }), 'parcial')
  // EAR alto mas o blendshape de piscada alto: não é "aberto" com certeza
  assert.equal(estado([0.24, 0.24], { piscada: 0.4, aperto: 0.1, sorriso: 0.1 }), 'parcial')
  // sorriso sem olho apertado não vira "sorrindo" (a classe é dos olhos)
  assert.equal(estado([0.19, 0.19], { piscada: 0.3, aperto: 0.2, sorriso: 0.9 }), 'parcial')
})

test('olhos: os limiares exatos da regra', () => {
  const L = LIMIARES_ROSTO
  assert.deepEqual([L.earFechado, L.earDuvida, L.piscadaFechado, L.earAberto, L.piscadaAberto, L.sorriso, L.aperto, L.guinada], [0.15, 0.2, 0.5, 0.22, 0.35, 0.6, 0.5, 25])
  const estado = (v, bs) => estadoDosOlhos({ malha: malhaDeRosto({ ear: [v, v] }), blendshapes: expressao(bs) }).olhos
  assert.equal(estado(0.149, { piscada: 0 }), 'fechados')
  assert.equal(estado(0.151, { piscada: 0 }), 'parcial')
  assert.equal(estado(0.199, { piscada: 0.5 }), 'fechados')
  assert.equal(estado(0.201, { piscada: 0.5 }), 'parcial')
  assert.equal(estado(0.221, { piscada: 0.34 }), 'abertos')
  assert.equal(estado(0.219, { piscada: 0.34 }), 'parcial')
  assert.equal(estado(0.221, { piscada: 0.36 }), 'parcial')
})

test('olhos: sem blendshapes vale só o EAR; sem malha não se inventa nada', () => {
  assert.equal(estadoDosOlhos({ malha: malhaDeRosto({ ear: [0.3, 0.3] }) }).olhos, 'abertos')
  assert.equal(estadoDosOlhos({ malha: malhaDeRosto({ ear: [0.1, 0.1] }) }).olhos, 'fechados')
  assert.equal(estadoDosOlhos({ malha: malhaDeRosto({ ear: [0.18, 0.18] }) }).olhos, 'parcial')
  const semMalha = estadoDosOlhos({ blendshapes: expressao({ piscada: 0.9 }) })
  assert.equal(semMalha.olhos, null)
  assert.equal(semMalha.ear, null)
  assert.equal(estadoDosOlhos({ malha: [{ x: 1, y: 1 }] }).olhos, null, 'malha incompleta')
  assert.equal(estadoDosOlhos().olhos, null)
})

test('olhos: com o rosto virado mais de 25°, o olho de trás é ignorado', () => {
  // guinada da malha fabricada: positiva = o nariz vai para o lado direito da pessoa (o olho direito fica atrás)
  for (const graus of [-40, -20, 0, 20, 40]) perto(guinadaDaMalha(malhaDeRosto({ guinada: graus })), graus, 1e-6, `guinada ${graus}`)
  // olho de trás (direito) achatado, olho da frente (esquerdo) aberto
  const virado = estadoDosOlhos({ malha: malhaDeRosto({ ear: [0.08, 0.3], guinada: 35 }), blendshapes: expressao({ piscada: [0.7, 0.05] }) })
  assert.equal(virado.olhoUsado, 'esquerdo')
  assert.equal(virado.olhos, 'abertos')
  perto(virado.ear, 0.3, 1e-9, 'EAR do olho da frente')
  perto(virado.piscada, 0.05, 1e-12, 'piscada do olho da frente')
  // o mesmo rosto de frente: a média dos dois olhos reprova
  const deFrente = estadoDosOlhos({ malha: malhaDeRosto({ ear: [0.08, 0.3], guinada: 10 }), blendshapes: expressao({ piscada: [0.7, 0.05] }) })
  assert.equal(deFrente.olhoUsado, 'ambos')
  perto(deFrente.ear, 0.19, 1e-9, 'média')
  assert.equal(deFrente.olhos, 'parcial')
  // virado para o outro lado: vale o olho direito
  const outroLado = estadoDosOlhos({ malha: malhaDeRosto({ ear: [0.3, 0.05], guinada: -35 }) })
  assert.equal(outroLado.olhoUsado, 'direito')
  assert.equal(outroLado.olhos, 'abertos')
  // e o olho da frente fechado continua fechado
  assert.equal(estadoDosOlhos({ malha: malhaDeRosto({ ear: [0.3, 0.05], guinada: 35 }) }).olhos, 'fechados')
})

// ───────────────────────────── peso, corte, rosto principal ─────────────────────────────

test('peso: cresce com o tamanho do rosto e cai longe do centro', () => {
  const quadro = { largura: 1000, altura: 600 }
  const centro = pesoDoRosto({ x: 400, y: 200, largura: 200, altura: 200 }, quadro)
  perto(centro.tamanho, Math.sqrt(40000 / 600000), 1e-12, 'tamanho = raiz da fração da área')
  perto(centro.peso, centro.tamanho, 1e-12, 'no centro o peso é o tamanho')
  const canto = pesoDoRosto({ x: 0, y: 0, largura: 200, altura: 200 }, quadro)
  assert.ok(canto.peso < centro.peso && canto.peso > 0.5 * centro.peso, `canto ${canto.peso}`)
  const pequeno = pesoDoRosto({ x: 450, y: 250, largura: 100, altura: 100 }, quadro)
  perto(pequeno.peso, centro.peso / 2, 1e-12, 'metade do lado, metade do peso')
})

test('rosto cortado: caixa que encosta na borda ou passa dela', () => {
  const quadro = { largura: 1000, altura: 600 }
  assert.equal(rostoCortado({ x: 400, y: 200, largura: 200, altura: 200 }, quadro), false)
  assert.equal(rostoCortado({ x: -20, y: 200, largura: 200, altura: 200 }, quadro), true)
  assert.equal(rostoCortado({ x: 400, y: 1, largura: 200, altura: 200 }, quadro), true)
  assert.equal(rostoCortado({ x: 801, y: 200, largura: 200, altura: 200 }, quadro), true)
  assert.equal(rostoCortado({ x: 400, y: 420, largura: 200, altura: 200 }, quadro), true)
  assert.equal(rostoCortado({ x: 10, y: 10, largura: 200, altura: 200 }, quadro), false)
})

test('faixa dos olhos: de um olho ao outro, com meia distância para os lados e um terço para cima e para baixo', () => {
  assert.deepEqual(faixaDosOlhos([{ x: 100, y: 50 }, { x: 160, y: 50 }]), { x: 70, y: 30, largura: 120, altura: 40 })
  assert.equal(faixaDosOlhos([{ x: 100, y: 50 }]), null)
  assert.equal(faixaDosOlhos(null), null)
  assert.equal(faixaDosOlhos([{ x: 1, y: 1 }, { x: 1, y: 1 }]), null)
})

// ───────────────────────────── nitidez no rosto contra o fundo ─────────────────────────────

const LARGURA = 768
const ALTURA = 512
const CAIXA = { x: 300, y: 150, largura: 160, altura: 200 }
const OLHOS = [
  { x: 348, y: 230 },
  { x: 412, y: 230 },
]
let cenarios = null
function retratos() {
  if (cenarios) return cenarios
  const base = folhas(11, LARGURA, ALTURA, { raioMin: 2.5 })
  const mascara = mascaraDaCaixa(LARGURA, ALTURA, CAIXA, 6)
  const analisar = (img) => {
    const previa = fotografar(img)
    const medidas = medir(previa, { horizonte: false })
    const [rosto] = analisarRostos([{ caixa: CAIXA, olhos: OLHOS, confianca: 0.93 }], lumaDe(previa), { medidas })
    return { medidas, rosto }
  }
  cenarios = {
    tudoNitido: analisar(base),
    soFundoDesfocado: analisar(misturar(gauss(base, 4), base, mascara)),
    soRostoDesfocado: analisar(misturar(base, gauss(base, 2.5), mascara)),
    tudoDesfocado: analisar(gauss(base, 2.5)),
  }
  return cenarios
}

test('nitidez no rosto: os olhos e o rosto medem o que o quadro inteiro não vê', () => {
  const c = retratos()
  // tudo nítido
  assert.ok(c.tudoNitido.rosto.nitidezOlhos >= 0.7 && c.tudoNitido.rosto.nitidezRosto >= 0.7, 'rosto nítido')
  perto(c.tudoNitido.rosto.razaoFundo, 1, 0.2, 'rosto e fundo com o mesmo contraste')
  assert.equal(c.tudoNitido.rosto.focoErrado, false)
  // só o fundo desfocado (retrato de verdade): o rosto continua nítido e ganha de longe do fundo
  assert.equal(c.soFundoDesfocado.rosto.nitidezOlhos, c.tudoNitido.rosto.nitidezOlhos, 'os olhos não mudaram')
  assert.ok(c.soFundoDesfocado.rosto.razaoFundo > 3, `rosto/fundo ${c.soFundoDesfocado.rosto.razaoFundo}`)
  assert.equal(c.soFundoDesfocado.rosto.focoErrado, false)
  assert.ok(c.soFundoDesfocado.medidas.nitidez.q < 0.7, 'o q de percentis do quadro inteiro cairia aqui')
  // só o rosto desfocado: o quadro inteiro aprova, o rosto reprova e o foco caiu no fundo
  assert.ok(c.soRostoDesfocado.medidas.nitidez.qLocal >= 0.7, 'o quadro inteiro parece ótimo')
  assert.ok(c.soRostoDesfocado.rosto.nitidezOlhos < 0.6 && c.soRostoDesfocado.rosto.nitidezRosto < 0.6, `olhos ${c.soRostoDesfocado.rosto.nitidezOlhos}`)
  assert.ok(c.soRostoDesfocado.rosto.razaoFundo < LIMIARES_ROSTO.razaoFundo, `rosto/fundo ${c.soRostoDesfocado.rosto.razaoFundo}`)
  assert.equal(c.soRostoDesfocado.rosto.focoErrado, true)
  // tudo desfocado: rosto e fundo iguais, sem "foco errado" (não há nada nítido para onde o foco tenha ido)
  assert.ok(c.tudoDesfocado.rosto.nitidezOlhos < 0.6)
  assert.equal(c.tudoDesfocado.rosto.focoErrado, false)
})

test('analisarRostos: o contrato do rosto devolvido', () => {
  const { rosto } = retratos().tudoNitido
  assert.deepEqual(rosto.caixa, CAIXA)
  assert.equal(rosto.confianca, 0.93)
  assert.equal(rosto.olhos, null, 'sem malha, o estado dos olhos é null')
  assert.equal(rosto.ear, null)
  assert.equal(rosto.principal, true)
  assert.equal(rosto.chave, true)
  assert.equal(rosto.cortado, false)
  perto(rosto.tamanho, Math.sqrt((160 * 200) / (LARGURA * ALTURA)), 1e-12, 'tamanho')
  for (const k of ['nitidezOlhos', 'nitidezRosto', 'sOlhos', 'sRosto', 'sFundo', 'razaoFundo', 'peso']) assert.equal(typeof rosto[k], 'number', k)
})

test('analisarRostos: rosto principal, pessoas-chave e secundárias, com malha e blendshapes', () => {
  const luma = lumaDe(paraPrevia(folhas(12, 640, 428, { raioMin: 2.5 })))
  const deteccoes = [
    { caixa: { x: 40, y: 60, largura: 38, altura: 44 }, confianca: 0.7 }, // pequeno, no canto, sem malha
    { caixa: { x: 250, y: 120, largura: 150, altura: 180 }, confianca: 0.97, olhos: [{ x: 295, y: 190 }, { x: 355, y: 190 }], malha: malhaDeRosto({ ear: [0.3, 0.29] }), blendshapes: expressao({ sorriso: 0.8 }) },
    { caixa: { x: 440, y: 150, largura: 110, altura: 130 }, confianca: 0.9, malha: malhaDeRosto({ ear: [0.09, 0.1] }), blendshapes: expressao({ piscada: 0.7 }) },
  ]
  const rostos = analisarRostos(deteccoes, luma)
  assert.equal(rostos.length, 3)
  assert.deepEqual(rostos.map((r) => r.principal), [false, true, false])
  assert.deepEqual(rostos.map((r) => r.chave), [false, true, true], 'o rosto com menos da metade do peso do maior é secundário')
  assert.deepEqual(rostos.map((r) => r.olhos), [null, 'abertos', 'fechados'])
  perto(rostos[1].sorriso, 0.8, 1e-12, 'sorriso')
  assert.equal(rostos[0].nitidezOlhos, null, 'sem os pontos dos olhos não há faixa dos olhos')
  assert.equal(rostos[0].nitidezRosto, null, 'rosto de 38 × 44 px não comporta a medida de nitidez (menos de 6 blocos)')
  assert.equal(typeof rostos[1].nitidezOlhos, 'number')
  assert.equal(typeof rostos[2].nitidezRosto, 'number')
})

test('analisarRostos: sem detecção devolve lista vazia; detecção sem caixa é ignorada; rosto na borda sai cortado', () => {
  const luma = lumaDe(paraPrevia(folhas(13, 320, 240)))
  assert.deepEqual(analisarRostos([], luma), [])
  assert.deepEqual(analisarRostos(undefined, luma), [])
  assert.deepEqual(analisarRostos([{ confianca: 0.9 }, null, { caixa: { x: 1, y: 1, largura: 0, altura: 10 } }], luma), [])
  const [r] = analisarRostos([{ caixa: { x: -10, y: 60, largura: 120, altura: 140 } }], luma)
  assert.equal(r.cortado, true)
  assert.equal(r.confianca, null)
})

// ───────────────────────────── cena ─────────────────────────────

const medidasDe = (largura, exposicaoDaFoto = { p1: 10, p50: 110, p99: 230, altas: 0.001 }) => ({ largura, altura: Math.round(largura / 1.5), exposicao: { altas3: 0, baixas: 0, media: 110, ...exposicaoDaFoto } })
const rosto = (largura, confianca = 0.95) => ({ caixa: { x: 100, y: 100, largura, altura: largura * 1.2 }, confianca })

test('cena: os rostos decidem retrato, grupo e pessoas', () => {
  const medidas = medidasDe(1000)
  const retrato = classificarCena({ rostos: [rosto(200)], objetos: [], rotulos: [], medidas })
  assert.equal(retrato.cena, 'retrato')
  assert.equal(retrato.confianca, 'alta')
  assert.match(retrato.porque, /Um rosto, com 20% da largura/)
  assert.equal(classificarCena({ rostos: [rosto(150)], medidas }).cena, 'retrato', 'exatamente 15% da largura')
  const pequeno = classificarCena({ rostos: [rosto(140)], medidas })
  assert.equal(pequeno.cena, 'pessoas')
  assert.equal(pequeno.porque, 'Um rosto pequeno no quadro')
  assert.equal(classificarCena({ rostos: [rosto(200), rosto(180)], medidas }).cena, 'pessoas', 'dois rostos: pessoas')
  const grupo = classificarCena({ rostos: [rosto(90), rosto(80), rosto(85), rosto(70)], medidas })
  assert.equal(grupo.cena, 'grupo')
  assert.equal(grupo.porque, '4 rostos')
  assert.equal(classificarCena({ rostos: [rosto(200, 0.55)], medidas }).confianca, 'media')
})

test('cena: gente com contexto forte continua sendo gente (o rótulo não ganha do rosto)', () => {
  const medidas = medidasDe(1000)
  // os erros do classificador de imagem sozinho na prova: fundo branco virou "produto", mesa virou "comida"
  assert.equal(classificarCena({ rostos: [rosto(220)], rotulos: [{ nome: 'lotion', confianca: 0.8 }], objetos: [], medidas }).cena, 'retrato')
  assert.equal(classificarCena({ rostos: [rosto(120)], rotulos: [{ nome: 'pizza', confianca: 0.82 }], objetos: [{ classe: 'pizza', confianca: 0.9 }], medidas }).cena, 'pessoas')
  // rosto e cachorro: a regra do animal só vale sem rosto
  assert.equal(classificarCena({ rostos: [rosto(200)], objetos: [{ classe: 'dog', confianca: 0.9 }], medidas }).cena, 'retrato')
})

test('cena: sem rosto, os objetos decidem pessoas e animal', () => {
  const medidas = medidasDe(1000)
  const costas = classificarCena({ rostos: [], objetos: [{ classe: 'person', confianca: 0.8 }, { classe: 'dog', confianca: 0.9 }], rotulos: [], medidas })
  assert.equal(costas.cena, 'pessoas')
  assert.equal(costas.porque, 'Pessoa no quadro, sem rosto à vista')
  const bicho = classificarCena({ rostos: [], objetos: [{ classe: 'dog', confianca: 0.88 }, { classe: 'cat', confianca: 0.8 }], rotulos: [{ nome: 'seashore', confianca: 0.5 }], medidas })
  assert.equal(bicho.cena, 'animal')
  assert.equal(bicho.porque, 'Tem cachorro no quadro')
  assert.equal(bicho.confianca, 'alta')
  // abaixo de 0,5 o objeto não conta
  assert.equal(classificarCena({ rostos: [], objetos: [{ classe: 'dog', confianca: 0.45 }], rotulos: [], medidas }).cena, 'outra')
  for (const classe of OBJETOS_DE_ANIMAL) assert.equal(classificarCena({ rostos: [], objetos: [{ classe, confianca: 0.7 }], medidas }).cena, 'animal', classe)
})

test('cena: os rótulos ImageNet escolhem entre natureza, paisagem, comida, arquitetura, produto e documento', () => {
  const medidas = medidasDe(1000)
  const de = (rotulos, objetos = []) => classificarCena({ rostos: [], objetos, rotulos, medidas })
  assert.equal(de([{ nome: 'seashore', confianca: 0.6 }, { nome: 'sandbar', confianca: 0.2 }]).cena, 'paisagem')
  assert.equal(de([{ nome: 'daisy', confianca: 0.7 }]).cena, 'natureza')
  assert.equal(de([{ nome: 'cheeseburger', confianca: 0.65 }]).cena, 'comida')
  assert.equal(de([{ nome: 'church', confianca: 0.4 }, { nome: 'bell cote', confianca: 0.3 }]).cena, 'arquitetura')
  assert.equal(de([{ nome: 'perfume', confianca: 0.5 }]).cena, 'produto')
  assert.equal(de([{ nome: 'menu', confianca: 0.45 }]).cena, 'documento')
  const praia = de([{ nome: 'seashore', confianca: 0.6 }, { nome: 'sandbar', confianca: 0.2 }])
  assert.equal(praia.confianca, 'alta')
  assert.equal(praia.porque, 'Parece paisagem')
  perto(praia.pontos.paisagem, 0.8, 1e-12, 'soma dos rótulos da cena')
  // o nome vem como no arquivo de rótulos do modelo: maiúsculas e lista de sinônimos não atrapalham
  assert.equal(cenaDeRotulo('Granny Smith'), 'comida')
  assert.equal(cenaDeRotulo('seashore, coast, seacoast'), 'paisagem')
  assert.equal(cenaDeRotulo('folding chair'), null)
  assert.equal(cenaDeRotulo(undefined), null)
  // rótulo fraco não decide
  assert.equal(de([{ nome: 'seashore', confianca: 0.2 }]).cena, 'outra')
  assert.equal(de([{ nome: 'folding chair', confianca: 0.9 }]).cena, 'outra')
  assert.equal(de([{ nome: 'seashore', confianca: 0.3 }]).confianca, 'baixa')
})

test('cena: os 398 primeiros rótulos do ImageNet são animais (pelo índice), para quando o detector de objetos não achou', () => {
  const medidas = medidasDe(1000)
  assert.equal(cenaDeRotulo('tench', 0), 'animal')
  assert.equal(cenaDeRotulo('puffer', 397), 'animal')
  assert.equal(cenaDeRotulo('abacus', 398), null)
  const r = classificarCena({ rostos: [], objetos: [], rotulos: [{ nome: 'Labrador retriever', indice: 208, confianca: 0.7 }], medidas })
  assert.equal(r.cena, 'animal')
  assert.equal(r.porque, 'Parece um animal')
})

test('cena: os objetos apoiam comida e produto, sem decidir sozinhos por um copo', () => {
  const medidas = medidasDe(1000)
  const de = (rotulos, objetos) => classificarCena({ rostos: [], objetos, rotulos, medidas })
  // rótulo fraco + objeto de comida = comida
  const prato = de([{ nome: 'plate', confianca: 0.15 }], [{ classe: 'fork', confianca: 0.6 }])
  assert.equal(prato.cena, 'comida')
  perto(prato.pontos.comida, 0.15 + 0.5 * 0.6, 1e-12, 'rótulo + metade da confiança do objeto')
  // objeto de comida com certeza basta, e o porquê diz que veio dos objetos
  const pizza = de([], [{ classe: 'pizza', confianca: 0.9 }])
  assert.equal(pizza.cena, 'comida')
  assert.equal(pizza.porque, 'Objetos de comida no quadro')
  assert.equal(de([], [{ classe: 'bottle', confianca: 0.7 }]).cena, 'produto')
  // um copo com pouca certeza não faz da foto uma foto de comida
  assert.equal(de([], [{ classe: 'cup', confianca: 0.49 }]).cena, 'outra')
})

test('cena: noturna por regra de luma (mediana escura com pontos de luz)', () => {
  const noite = medidasDe(1000, { p1: 2, p50: 22, p99: 205, altas: 0.004 })
  const escura = medidasDe(1000, { p1: 2, p50: 22, p99: 80, altas: 0 })
  const dia = medidasDe(1000)
  assert.equal(eNoite(noite), true)
  assert.equal(eNoite(escura), false, 'escura sem luz nenhuma é subexposta, não noturna')
  assert.equal(eNoite(dia), false)
  assert.equal(eNoite(undefined), false)
  assert.equal(eNoite(medidasDe(1000, { p1: 1, p50: 30, p99: 100, altas: 0.002 })), true, 'vela: pouca área, mas estourada')
  const cidade = classificarCena({ rostos: [], objetos: [], rotulos: [], medidas: noite })
  assert.equal(cidade.cena, 'noturna')
  assert.equal(cidade.confianca, 'media')
  assert.equal(cidade.noite, true)
  // rótulo com certeza ganha, mas a foto continua marcada como de noite
  const ponte = classificarCena({ rostos: [], objetos: [], rotulos: [{ nome: 'suspension bridge', confianca: 0.7 }], medidas: noite })
  assert.equal(ponte.cena, 'arquitetura')
  assert.equal(ponte.noite, true)
  // rótulo fraco perde para a noite
  assert.equal(classificarCena({ rostos: [], objetos: [], rotulos: [{ nome: 'suspension bridge', confianca: 0.3 }], medidas: noite }).cena, 'noturna')
  // gente de noite continua sendo gente, com a marca da noite
  const festa = classificarCena({ rostos: [rosto(200)], medidas: noite })
  assert.equal(festa.cena, 'retrato')
  assert.equal(festa.noite, true)
})

test('cena: sem camada de visão nenhuma, sai "outra" com certeza baixa e dizendo por quê', () => {
  const r = classificarCena({ medidas: medidasDe(1000) })
  assert.deepEqual([r.cena, r.confianca, r.porque, r.noite], ['outra', 'baixa', 'Sem leitura de visão: só o que foi medido', false])
  assert.equal(classificarCena({ rostos: [], objetos: [], rotulos: [], medidas: medidasDe(1000) }).porque, 'Sem pista suficiente')
  assert.equal(classificarCena().cena, 'outra')
})

test('cena: a tabela de rótulos não repete nome, usa só cenas que existem e cobre as seis cenas sem gente', () => {
  const vistos = new Set()
  for (const [cena, nomes] of Object.entries(ROTULOS_PARA_CENA)) {
    assert.ok(cena in CENAS, cena)
    for (const nome of nomes) {
      assert.equal(nome, nome.toLowerCase(), `${nome} em minúsculas`)
      assert.ok(!vistos.has(nome), `${nome} repetido`)
      vistos.add(nome)
    }
  }
  assert.deepEqual(Object.keys(ROTULOS_PARA_CENA).sort(), ['arquitetura', 'comida', 'documento', 'natureza', 'paisagem', 'produto'])
  for (const cena of Object.keys(OBJETOS_DE_APOIO)) assert.ok(cena in CENAS)
  assert.equal(LIMIARES_CENA.retratoLargura, 0.15)
  assert.equal(LIMIARES_CENA.grupoRostos, 3)
})
