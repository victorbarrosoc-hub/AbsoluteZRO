// Tamanho de saída (redução em luz linear, proporção, energia, ringing), nitidez de saída e marca-d'água.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CURVAS } from '../src/motor/cor/espacos.js'
import { POSICOES, aplicarMarcaDagua, encaixarMarca } from '../src/exportar/marca-dagua.js'
import {
  DESTINOS_DE_NITIDEZ,
  INTENSIDADES_DE_NITIDEZ,
  calcularTamanho,
  nitidezDeSaida,
  parametrosDeNitidez,
  reamostrar,
  redimensionar,
} from '../src/exportar/redimensionar.js'
import { cenaDeTeste, sorteio } from './apoio-exportar.js'

const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: esperado ${b}, veio ${a} (tolerância ${tol})`)
const media = (dados, canais = 3) => {
  const s = new Array(canais).fill(0)
  for (let i = 0; i < dados.length; i++) s[i % canais] += dados[i]
  return s.map((v) => v / (dados.length / canais))
}

test('tamanho: lado maior, megapixels e caixa mantêm a proporção e não ampliam por padrão', () => {
  const foto = { largura: 6000, altura: 4000 }
  assert.deepEqual(calcularTamanho(foto, { tipo: 'original' }), { largura: 6000, altura: 4000 })
  assert.deepEqual(calcularTamanho(foto, { tipo: 'lado', px: 2048 }), { largura: 2048, altura: 1365 })
  assert.deepEqual(calcularTamanho({ largura: 4000, altura: 6000 }, { tipo: 'lado', px: 2048 }), { largura: 1365, altura: 2048 })
  assert.deepEqual(calcularTamanho(foto, { tipo: 'megapixels', mp: 6 }), { largura: 3000, altura: 2000 })
  assert.deepEqual(calcularTamanho(foto, { tipo: 'caixa', largura: 1920, altura: 1080 }), { largura: 1620, altura: 1080 })
  assert.deepEqual(calcularTamanho(foto, { tipo: 'caixa', largura: 1080, altura: 1920 }), { largura: 1080, altura: 720 })
  // sem ampliar: pedido maior que a foto devolve a foto
  assert.deepEqual(calcularTamanho(foto, { tipo: 'lado', px: 9000 }), foto)
  assert.deepEqual(calcularTamanho(foto, { tipo: 'megapixels', mp: 50 }), foto)
  assert.deepEqual(calcularTamanho(foto, { tipo: 'lado', px: 9000 }, { ampliar: true }), { largura: 9000, altura: 6000 })
  // proporção: em qualquer pedido, o erro é menor que meio pixel no lado menor
  const r = sorteio(2)
  for (let i = 0; i < 300; i++) {
    const original = { largura: 200 + Math.floor(r() * 8000), altura: 200 + Math.floor(r() * 8000) }
    const pedido = [
      { tipo: 'lado', px: 64 + Math.floor(r() * 4000) },
      { tipo: 'megapixels', mp: 0.1 + r() * 20 },
      { tipo: 'caixa', largura: 64 + Math.floor(r() * 3000), altura: 64 + Math.floor(r() * 3000) },
    ][i % 3]
    const t = calcularTamanho(original, pedido)
    assert.ok(t.largura <= original.largura && t.altura <= original.altura, 'nunca amplia')
    const menor = Math.min(t.largura, t.altura)
    const ideal = (Math.max(t.largura, t.altura) * Math.min(original.largura, original.altura)) / Math.max(original.largura, original.altura)
    assert.ok(Math.abs(menor - ideal) <= 0.5 + 1e-9, `proporção: ${JSON.stringify(original)} → ${JSON.stringify(t)}`)
    if (pedido.tipo === 'lado' && pedido.px < Math.max(original.largura, original.altura)) assert.equal(Math.max(t.largura, t.altura), pedido.px)
    if (pedido.tipo === 'caixa') assert.ok(t.largura <= pedido.largura + 1 && t.altura <= pedido.altura + 1)
  }
  assert.deepEqual(calcularTamanho({ largura: 5000, altura: 3 }, { tipo: 'lado', px: 100 }), { largura: 100, altura: 1 }, 'nunca zero')
  assert.deepEqual(calcularTamanho(foto, null), foto)
  assert.throws(() => calcularTamanho(foto, { tipo: 'metade' }), /inválido/)
})

test('redução: a luz média da foto é preservada (Lanczos, área e automático)', () => {
  const cena = cenaDeTeste(640, 427, 3)
  const antes = media(cena.dados)
  for (const metodo of ['lanczos', 'area', 'auto']) {
    for (const [l, a] of [
      [320, 214],
      [219, 146],
      [100, 67],
      [47, 31],
    ]) {
      const depois = media(reamostrar(cena.dados, 640, 427, 3, l, a, { metodo }))
      // medido: até 0,03% (o que sobra é o limite contra ringing nas bordas duras da cena); a área é exata
      for (let c = 0; c < 3; c++) perto(depois[c], antes[c], antes[c] * 1e-3, `${metodo} → ${l} × ${a}, canal ${c}`)
    }
  }
  // imagem lisa continua lisa, exatamente: os pesos somam 1 em todo pixel
  const lisa = new Float32Array(300 * 200 * 3).fill(0.37)
  for (const metodo of ['lanczos', 'area', 'auto']) {
    const saida = reamostrar(lisa, 300, 200, 3, 77, 51, { metodo })
    assert.equal(saida.length, 77 * 51 * 3)
    for (const v of saida) perto(v, 0.37, 2e-6, `lisa (${metodo})`)
  }
  // um canal só (a máscara da marca-d'água usa)
  const um = reamostrar(new Float32Array(100 * 50).fill(0.5), 100, 50, 1, 30, 15)
  assert.equal(um.length, 450)
  for (const v of um) perto(v, 0.5, 2e-6, 'um canal')
})

// Borda degrau vertical: metade 0,2, metade 0,8
function degrau(largura, altura, onde = 0.5) {
  const dados = new Float32Array(largura * altura * 3)
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) dados.fill(x < largura * onde ? 0.2 : 0.8, (y * largura + x) * 3, (y * largura + x) * 3 + 3)
  return dados
}

test('redução: borda degrau sem ringing (nada passa dos dois patamares) e ainda nítida', () => {
  for (const [de, para] of [
    [600, 205],
    [600, 150],
    [600, 400],
    [1000, 97],
    [601, 333],
  ]) {
    const altura = 24
    const novaAltura = Math.max(2, Math.round((altura * para) / de))
    const entrada = degrau(de, altura, 0.503)
    const saida = reamostrar(entrada, de, altura, 3, para, novaAltura)
    let menor = Infinity
    let maior = -Infinity
    for (const v of saida) {
      if (v < menor) menor = v
      if (v > maior) maior = v
    }
    // limite: 0,1% do degrau (0,6) para cada lado
    assert.ok(menor >= 0.2 - 6e-4 && maior <= 0.8 + 6e-4, `${de} → ${para}: saída entre ${menor} e ${maior}`)
    // a borda continua sendo uma borda: de 10% a 90% do degrau em no máximo 2 pixels de saída
    const linha = Array.from({ length: para }, (_, x) => saida[x * 3])
    const transicao = linha.filter((v) => v > 0.2 + 0.06 && v < 0.8 - 0.06).length
    assert.ok(transicao <= 2, `${de} → ${para}: transição de ${transicao} pixels`)
    for (let x = 1; x < para; x++) assert.ok(linha[x] >= linha[x - 1] - 1e-6, 'a borda é monótona')

    // sem o limite, o Lanczos passa dos patamares: prova de que o teste enxerga o ringing que o limite tira
    const cru = reamostrar(entrada, de, altura, 3, para, novaAltura, { antiAnel: 0 })
    let passou = 0
    for (const v of cru) passou = Math.max(passou, 0.2 - v, v - 0.8)
    assert.ok(passou > 0.6 * 0.02, `${de} → ${para}: sem limite o eco é de ${((passou / 0.6) * 100).toFixed(1)}% do degrau`)
    assert.ok(passou < 0.6 * 0.12, 'e é o eco normal do Lanczos-3, não um defeito')
  }
})

test('redução: geometria sem deslocamento — uma rampa continua rampa e o centro continua no centro', () => {
  const L = 400
  const A = 300
  const rampa = new Float32Array(L * A * 3)
  for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) rampa.set([(x + 0.5) / L, (y + 0.5) / A, 0.5], (y * L + x) * 3)
  for (const metodo of ['lanczos', 'area', 'auto']) {
    for (const [l, a] of [
      [137, 103],
      [40, 30],
    ]) {
      const saida = reamostrar(rampa, L, A, 3, l, a, { metodo })
      // longe das bordas, o pixel de saída vale a coordenada do próprio centro
      for (let y = 4; y < a - 4; y += 3) {
        for (let x = 4; x < l - 4; x += 3) {
          perto(saida[(y * l + x) * 3], (x + 0.5) / l, 1e-4, `${metodo} x`)
          perto(saida[(y * l + x) * 3 + 1], (y + 0.5) / a, 1e-4, `${metodo} y`)
        }
      }
    }
  }
})

test('redução: é feita em luz linear quando a imagem vem com a curva da tela', () => {
  // listras de um pixel, preto e branco: a média de luz é 0,5 de LUZ, que em código sRGB é 0,735 (e não 0,5)
  const L = 512
  const A = 64
  const listras = new Float32Array(L * A * 3)
  for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) listras.fill(x % 2, (y * L + x) * 3, (y * L + x) * 3 + 3)
  const imagem = { largura: L, altura: A, dados: listras }
  const linear = redimensionar(imagem, { tipo: 'lado', px: 64 }, { espaco: 'srgb' })
  const ingenuo = redimensionar(imagem, { tipo: 'lado', px: 64 })
  assert.deepEqual([linear.largura, linear.altura], [64, 8])
  const meio = (img) => img.dados[(4 * img.largura + 32) * 3]
  perto(meio(linear), CURVAS.srgb.codificar(0.5), 2e-3, 'média em luz linear')
  perto(meio(ingenuo), 0.5, 2e-3, 'média de código (sem dizer o espaço)')
  // cada espaço usa a própria curva
  for (const espaco of ['p3', 'adobe', 'rec2020', 'prophoto']) {
    const curva = espaco === 'p3' ? CURVAS.srgb : espaco === 'adobe' ? CURVAS.gama22 : CURVAS[espaco]
    perto(meio(redimensionar(imagem, { tipo: 'lado', px: 64 }, { espaco })), curva.codificar(0.5), 2e-3, espaco)
  }
  // cinza liso atravessa a ida e a volta da curva sem mudar
  const cinza = { largura: 200, altura: 100, dados: new Float32Array(200 * 100 * 3).fill(0.4) }
  for (const v of redimensionar(cinza, { tipo: 'lado', px: 50 }, { espaco: 'p3' }).dados) perto(v, 0.4, 2e-5, 'cinza')
})

test('redimensionar: tamanho pedido, sem ampliar por padrão, entrada intacta', () => {
  const cena = cenaDeTeste(300, 200, 5)
  const copia = cena.dados.slice()
  const reduzida = redimensionar(cena, { tipo: 'lado', px: 120 }, { espaco: 'srgb' })
  assert.deepEqual([reduzida.largura, reduzida.altura, reduzida.dados.length], [120, 80, 120 * 80 * 3])
  assert.ok(reduzida.dados.every((v) => v >= 0 && v <= 1))
  assert.deepEqual(cena.dados, copia)
  // mesmo tamanho ou pedido maior: devolve a própria imagem, sem conta
  assert.equal(redimensionar(cena, { tipo: 'original' }), cena)
  assert.equal(redimensionar(cena, { tipo: 'lado', px: 5000 }, { espaco: 'srgb' }), cena)
  const ampliada = redimensionar(cena, { tipo: 'lado', px: 450 }, { espaco: 'srgb', ampliar: true })
  assert.deepEqual([ampliada.largura, ampliada.altura], [450, 300])
  const exata = redimensionar(cena, { tipo: 'exato', largura: 150, altura: 150 })
  assert.deepEqual([exata.largura, exata.altura], [150, 150])
  // a redução grande pelo caminho automático (área e depois Lanczos) dá o mesmo resultado, a menos de um fio
  const grande = cenaDeTeste(1200, 800, 6)
  const auto = reamostrar(grande.dados, 1200, 800, 3, 90, 60, { metodo: 'auto' })
  const puro = reamostrar(grande.dados, 1200, 800, 3, 90, 60, { metodo: 'lanczos' })
  let soma = 0
  for (let i = 0; i < auto.length; i++) soma += (auto[i] - puro[i]) ** 2
  const psnr = 10 * Math.log10(1 / (soma / auto.length))
  assert.ok(psnr > 38, `automático × Lanczos puro: ${psnr.toFixed(1)} dB`)
  assert.throws(() => reamostrar(new Float32Array(10), 2, 2, 3, 1, 1), /amostras/)
  assert.throws(() => reamostrar(new Float32Array(12), 2, 2, 3, 1, 1, { metodo: 'cubico' }), /método/)
})

test('nitidez de saída: três destinos × três intensidades, borda mais firme, área lisa intacta, luz média igual', () => {
  assert.deepEqual(DESTINOS_DE_NITIDEZ, ['tela', 'fosco', 'brilhante'])
  assert.deepEqual(INTENSIDADES_DE_NITIDEZ, ['baixa', 'padrao', 'alta'])
  // o papel pede mais do que a tela, e o fosco mais do que o brilhante
  const p = (destino, intensidade) => parametrosDeNitidez({ destino, intensidade })
  assert.ok(p('tela').raio < p('brilhante').raio && p('brilhante').raio < p('fosco').raio)
  assert.ok(p('tela').quantidade < p('brilhante').quantidade && p('brilhante').quantidade < p('fosco').quantidade)
  for (const destino of DESTINOS_DE_NITIDEZ) {
    assert.ok(p(destino, 'baixa').quantidade < p(destino, 'padrao').quantidade && p(destino, 'padrao').quantidade < p(destino, 'alta').quantidade)
    assert.equal(p(destino, 'baixa').raio, p(destino, 'alta').raio)
  }
  assert.throws(() => parametrosDeNitidez({ destino: 'outdoor' }), /destino/)
  assert.throws(() => parametrosDeNitidez({ intensidade: 'máxima' }), /intensidade/)

  // borda suave (como a que sai de uma redução): 0,3 → 0,7 em quatro pixels
  const L = 80
  const A = 20
  const dados = new Float32Array(L * A * 3)
  for (let y = 0; y < A; y++) {
    for (let x = 0; x < L; x++) {
      const t = Math.min(1, Math.max(0, (x - 38) / 4))
      dados.fill(0.3 + 0.4 * t, (y * L + x) * 3, (y * L + x) * 3 + 3)
    }
  }
  const imagem = { largura: L, altura: A, dados }
  const inclinacao = (img) => {
    let maior = 0
    for (let x = 1; x < L; x++) maior = Math.max(maior, img.dados[(10 * L + x) * 3] - img.dados[(10 * L + x - 1) * 3])
    return maior
  }
  const base = inclinacao(imagem)
  for (const destino of DESTINOS_DE_NITIDEZ) {
    let anterior = base
    for (const intensidade of INTENSIDADES_DE_NITIDEZ) {
      const saida = nitidezDeSaida(imagem, { destino, intensidade })
      assert.notEqual(saida.dados, dados, 'imagem nova')
      const agora = inclinacao(saida)
      assert.ok(agora > anterior * 1.01, `${destino}/${intensidade}: a borda firma (${agora.toFixed(4)} > ${anterior.toFixed(4)})`)
      anterior = agora
      // longe da borda nada muda; a luz média não muda; nada sai de 0..1
      for (const x of [5, 20, 60, 75]) perto(saida.dados[(10 * L + x) * 3], dados[(10 * L + x) * 3], 1e-6, `${destino}: área lisa`)
      perto(media(saida.dados)[0], media(dados)[0], 1e-4, `${destino}/${intensidade}: média`)
      assert.ok(saida.dados.every((v) => v >= 0 && v <= 1))
      // o halo existe mas é contido: menos de um quarto do degrau, mesmo no mais forte
      let passou = 0
      for (const v of saida.dados) passou = Math.max(passou, 0.3 - v, v - 0.7)
      assert.ok(passou < 0.4 * 0.25, `${destino}/${intensidade}: halo de ${((passou / 0.4) * 100).toFixed(1)}% do degrau`)
    }
  }
  // cor: a diferença é a mesma nos três canais (nitidez na luma, sem franja)
  const cena = cenaDeTeste(120, 80, 9)
  const nitida = nitidezDeSaida(cena, { destino: 'fosco', intensidade: 'alta' })
  let franja = 0
  let dentro = 0
  for (let i = 0; i < cena.dados.length; i += 3) {
    const d = [0, 1, 2].map((c) => nitida.dados[i + c] - cena.dados[i + c])
    // só onde nenhum canal encostou em 0 ou 1
    if ([0, 1, 2].every((c) => nitida.dados[i + c] > 0 && nitida.dados[i + c] < 1)) {
      franja = Math.max(franja, Math.abs(d[0] - d[1]), Math.abs(d[1] - d[2]))
      dentro++
    }
  }
  assert.ok(dentro > 5000 && franja < 1e-6, `franja ${franja}`)
  assert.deepEqual(cena.dados, cenaDeTeste(120, 80, 9).dados, 'entrada intacta')
})

// ─────────── marca-d'água ───────────

// Máscara de teste: um retângulo cheio com uma moldura transparente de 1 pixel
function mascaraDeTeste(largura = 200, altura = 50) {
  const dados = new Float32Array(largura * altura)
  for (let y = 1; y < altura - 1; y++) for (let x = 1; x < largura - 1; x++) dados[y * largura + x] = 1
  return { largura, altura, dados }
}

test("marca-d'água no canto e no centro: posição e margem proporcionais, mistura exata, fora da marca nada muda", () => {
  const foto = { largura: 400, altura: 300, dados: new Float32Array(400 * 300 * 3).fill(0.25) }
  const original = foto.dados.slice()
  const mascara = mascaraDeTeste()
  for (const posicao of POSICOES.filter((p) => p !== 'diagonal')) {
    const opcoes = { posicao, opacidade: 0.4, tamanho: 0.25, margem: 0.05, cor: [1, 0.5, 0] }
    const lugar = encaixarMarca(foto, mascara, opcoes)
    // largura = 25% da foto; altura pela proporção da máscara (4:1); margem = 5% do lado menor
    assert.deepEqual([lugar.largura, lugar.altura], [100, 25])
    const margem = 15
    const esperado = {
      'inferior-direito': [400 - margem - 100, 300 - margem - 25],
      'inferior-esquerdo': [margem, 300 - margem - 25],
      'superior-direito': [400 - margem - 100, margem],
      'superior-esquerdo': [margem, margem],
      centro: [150, 138],
    }[posicao]
    assert.deepEqual([lugar.x, lugar.y], esperado, posicao)
    const saida = aplicarMarcaDagua(foto, mascara, opcoes)
    assert.deepEqual(foto.dados, original, 'a entrada não é tocada')
    let mudados = 0
    for (let y = 0; y < 300; y++) {
      for (let x = 0; x < 400; x++) {
        const i = (y * 400 + x) * 3
        const dentro = x >= lugar.x && x < lugar.x + lugar.largura && y >= lugar.y && y < lugar.y + lugar.altura
        if (!dentro) assert.equal(saida.dados[i], 0.25, `${posicao}: pixel de fora (${x}, ${y}) mudou`)
        else if (saida.dados[i] !== 0.25) mudados++
      }
    }
    assert.ok(mudados > 100 * 25 * 0.8, `${posicao}: a marca cobre a caixa`)
    // no miolo da marca (máscara = 1): foto·(1 − 0,4) + cor·0,4
    const meio = ((lugar.y + 12) * 400 + lugar.x + 50) * 3
    perto(saida.dados[meio], 0.25 * 0.6 + 1 * 0.4, 1e-5, 'vermelho')
    perto(saida.dados[meio + 1], 0.25 * 0.6 + 0.5 * 0.4, 1e-5, 'verde')
    perto(saida.dados[meio + 2], 0.25 * 0.6 + 0 * 0.4, 1e-5, 'azul')
  }
  // 'canto' é o canto de baixo à direita
  assert.deepEqual(encaixarMarca(foto, mascara, { posicao: 'canto' }), encaixarMarca(foto, mascara, { posicao: 'inferior-direito' }))
  assert.throws(() => encaixarMarca(foto, mascara, { posicao: 'lua' }), /posição/)
  assert.throws(() => aplicarMarcaDagua(foto, { largura: 2, altura: 2, dados: [1, 1, 1, 1] }), /máscara/)
})

test("marca-d'água: a mesma receita dá a mesma marca em qualquer tamanho de foto; opacidade zero não muda nada", () => {
  const mascara = mascaraDeTeste()
  const opcoes = { posicao: 'inferior-direito', tamanho: 0.3, margem: 0.04 }
  const pequena = encaixarMarca({ largura: 600, altura: 400 }, mascara, opcoes)
  const grande = encaixarMarca({ largura: 6000, altura: 4000 }, mascara, opcoes)
  assert.deepEqual(
    [grande.largura, grande.altura, grande.x, grande.y],
    [pequena.largura, pequena.altura, pequena.x, pequena.y].map((v) => v * 10),
  )
  // marca que não cabe é encolhida para caber dentro das margens, sem perder a proporção
  const estreita = encaixarMarca({ largura: 1000, altura: 100 }, mascaraDeTeste(100, 100), { tamanho: 0.5, margem: 0.1 })
  assert.deepEqual([estreita.largura, estreita.altura], [80, 80])
  assert.ok(estreita.x >= 10 && estreita.y >= 10 && estreita.x + estreita.largura <= 990 && estreita.y + estreita.altura <= 90)

  const cena = cenaDeTeste(200, 150, 12)
  const nula = aplicarMarcaDagua(cena, mascara, { opacidade: 0 })
  assert.deepEqual(nula.dados, cena.dados)
  assert.notEqual(nula.dados, cena.dados, 'mesmo sem mudança, é uma imagem nova')
  // mais opacidade, mais diferença
  const diferenca = (op) => {
    const s = aplicarMarcaDagua(cena, mascara, { opacidade: op, posicao: 'centro' })
    let d = 0
    for (let i = 0; i < s.dados.length; i++) d += Math.abs(s.dados[i] - cena.dados[i])
    return d
  }
  assert.ok(diferenca(0.2) > 0 && diferenca(0.5) > diferenca(0.2) * 2 && diferenca(1) > diferenca(0.5) * 1.5)
  // resultado sempre em 0..1
  assert.ok(aplicarMarcaDagua(cena, mascara, { opacidade: 1, posicao: 'diagonal' }).dados.every((v) => v >= 0 && v <= 1))
})

test("marca-d'água repetida em diagonal: cobre a foto toda, com vãos, inclinada na diagonal", () => {
  const L = 600
  const A = 400
  const foto = { largura: L, altura: A, dados: new Float32Array(L * A * 3) }
  const mascara = mascaraDeTeste(160, 40)
  const saida = aplicarMarcaDagua(foto, mascara, { posicao: 'diagonal', opacidade: 1, tamanho: 0.2, espaco: 0.5 })
  const marcado = (x, y) => saida.dados[(y * L + x) * 3] > 0.5
  let total = 0
  for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) if (marcado(x, y)) total++
  // área coberta = marca / (marca + vão) em cada eixo: 120/(120+60) × 30/(30+60) ≈ 22%
  const fracao = total / (L * A)
  assert.ok(fracao > 0.17 && fracao < 0.27, `fração coberta ${fracao.toFixed(3)}`)
  // cada quadrante da foto recebe marca (é repetida, não uma só)
  for (const [x0, y0] of [
    [0, 0],
    [300, 0],
    [0, 200],
    [300, 200],
  ]) {
    let n = 0
    for (let y = y0; y < y0 + 200; y++) for (let x = x0; x < x0 + 300; x++) if (marcado(x, y)) n++
    assert.ok(n > 300 * 200 * 0.1, `quadrante (${x0}, ${y0}) com ${n} pixels de marca`)
  }
  // uma repetição passa pelo centro, e a marca sobe para a direita: seguindo a diagonal da foto continua-se dentro dela
  assert.ok(marcado(300, 200))
  const passo = 40 / Math.hypot(L, A)
  assert.ok(marcado(Math.round(300 + L * passo), Math.round(200 - A * passo)), 'acima e à direita, na diagonal')
  assert.ok(marcado(Math.round(300 - L * passo), Math.round(200 + A * passo)), 'abaixo e à esquerda, na diagonal')
  // atravessando a marca (perpendicular à diagonal) sai-se dela logo: ela tem 30 pixels de altura
  assert.ok(!marcado(Math.round(300 + A * passo), Math.round(200 + L * passo)), 'perpendicular: fora da marca')
  // bordas suaves: há valores intermediários (a leitura da máscara é interpolada)
  let meios = 0
  for (let i = 0; i < saida.dados.length; i += 3) if (saida.dados[i] > 0.05 && saida.dados[i] < 0.95) meios++
  assert.ok(meios > 0)
})
