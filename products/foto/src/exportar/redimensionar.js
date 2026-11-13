// Tamanho de saída: reduzir a foto com qualidade e, se pedido, dar a nitidez de saída do destino (tela ou papel).
//
// A redução é feita em LUZ LINEAR: média de luz é o que a lente e o olho fazem; média de código (com a curva da tela)
// escurece o detalhe fino e muda a cor das bordas. A imagem de tela que o motor entrega (0..1, já com a curva) é
// linearizada linha a linha na entrada e recodificada na saída, quando `espaco` é informado.
//
// Filtros (separáveis: primeiro as linhas, depois as colunas):
//   Lanczos-3   sinc(x)·sinc(x/3) em |x| < 3 (Duchon, 1979; Turkowski, "Filters for Common Resampling Tasks", 1990).
//               Na redução o núcleo é esticado pela razão: ele é o passa-baixa que evita serrilhado.
//   área        média exata da área que cada pixel de saída cobre (caixa). É o filtro rápido das reduções grandes:
//               acima de 8× a redução vai por área até 4× o tamanho final e termina em Lanczos, que é quem define a
//               nitidez do resultado (a perda da caixa na frequência de corte final fica em sinc(1/8) ≈ 2,6%).
// Os pesos de cada pixel de saída somam 1: a luz média da foto não muda.
//
// Contra o "ringing" (o eco claro e escuro que o lóbulo negativo do Lanczos deixa numa borda dura): o resultado é
// preso entre o menor e o maior valor das amostras sob o lóbulo central do núcleo. Borda continua borda; o eco some.
//
// Nitidez de saída: máscara de nitidez na luma, depois da redução, com raio e quantidade por destino.

import { curvaDe } from '../motor/cor/espacos.js'

const LOBULOS = 3

const sinc = (x) => {
  if (x === 0) return 1
  const p = Math.PI * x
  return Math.sin(p) / p
}
const lanczos = (x) => (x > -LOBULOS && x < LOBULOS ? sinc(x) * sinc(x / LOBULOS) : 0)

// ─────────── o tamanho ───────────

/**
 * Tamanho de saída para um pedido, mantendo a proporção.
 *   { tipo: 'original' }                    como está
 *   { tipo: 'lado', px }                    lado maior com `px`
 *   { tipo: 'megapixels', mp }              área de `mp` milhões de pixels
 *   { tipo: 'caixa', largura, altura }      o maior tamanho que cabe em largura × altura
 * Sem `ampliar` (padrão) a foto nunca cresce: pedido maior do que o original devolve o original.
 */
export function calcularTamanho({ largura, altura }, tamanho, { ampliar = false } = {}) {
  if (!(largura >= 1) || !(altura >= 1)) throw new Error('calcularTamanho: a imagem precisa ter largura e altura')
  const t = tamanho && typeof tamanho === 'object' ? tamanho : { tipo: 'original' }
  let escala = 1
  if (t.tipo === 'lado' && t.px > 0) escala = t.px / Math.max(largura, altura)
  else if (t.tipo === 'megapixels' && t.mp > 0) escala = Math.sqrt((t.mp * 1e6) / (largura * altura))
  else if (t.tipo === 'caixa' && t.largura > 0 && t.altura > 0) escala = Math.min(t.largura / largura, t.altura / altura)
  else if (t.tipo !== 'original' && t.tipo !== undefined) throw new Error(`calcularTamanho: pedido de tamanho inválido: ${JSON.stringify(tamanho)}`)
  if (!ampliar && escala > 1) escala = 1
  if (escala === 1) return { largura, altura }
  // o lado maior é arredondado; o menor sai dele pela proporção, para não acumular dois arredondamentos
  if (largura >= altura) {
    const l = Math.max(1, Math.round(largura * escala))
    return { largura: l, altura: Math.max(1, Math.round((l * altura) / largura)) }
  }
  const a = Math.max(1, Math.round(altura * escala))
  return { largura: Math.max(1, Math.round((a * largura) / altura)), altura: a }
}

// ─────────── os pesos ───────────

/**
 * Para cada amostra de saída: de qual amostra de entrada começa, quantas usa e com que pesos (somando 1); e a faixa
 * de amostras sob o lóbulo central, para o limite contra ringing.
 */
function contribuicoes(entrada, saida, metodo) {
  const razao = entrada / saida
  const escala = Math.max(razao, 1) // ampliando o núcleo não encolhe: interpola
  const raio = metodo === 'area' ? razao / 2 : LOBULOS * escala
  const maximo = Math.ceil(raio * 2) + 2
  const inicio = new Int32Array(saida)
  const quantos = new Int32Array(saida)
  const centroDe = new Int32Array(saida)
  const centroAte = new Int32Array(saida)
  const pesos = new Float32Array(saida * maximo)
  for (let i = 0; i < saida; i++) {
    const centro = (i + 0.5) * razao // em coordenada de borda: a amostra j cobre [j, j + 1)
    let de = Math.max(0, Math.floor(centro - raio))
    let ate = Math.min(entrada - 1, Math.ceil(centro + raio) - 1)
    if (ate < de) ate = de = Math.min(entrada - 1, Math.max(0, Math.floor(centro)))
    let soma = 0
    const base = i * maximo
    for (let j = de; j <= ate; j++) {
      let w
      if (metodo === 'area') {
        // quanto da amostra [j, j + 1) cai dentro de [centro − razão/2, centro + razão/2)
        w = Math.max(0, Math.min(j + 1, centro + razao / 2) - Math.max(j, centro - razao / 2))
      } else w = lanczos((j + 0.5 - centro) / escala)
      pesos[base + j - de] = w
      soma += w
    }
    if (!(Math.abs(soma) > 1e-12)) {
      // não deveria acontecer; se acontecer, vale a amostra mais próxima
      const perto = Math.min(ate, Math.max(de, Math.floor(centro)))
      for (let j = de; j <= ate; j++) pesos[base + j - de] = j === perto ? 1 : 0
      soma = 1
    }
    for (let j = de; j <= ate; j++) pesos[base + j - de] /= soma
    inicio[i] = de
    quantos[i] = ate - de + 1
    // lóbulo central: |x| < 1 do núcleo, ou seja, as amostras a menos de `escala` do centro (sempre pelo menos uma)
    const meio = Math.min(entrada - 1, Math.max(0, Math.floor(centro)))
    centroDe[i] = Math.min(meio, Math.max(de, Math.ceil(centro - escala - 0.5)))
    centroAte[i] = Math.max(meio, Math.min(ate, Math.floor(centro + escala - 0.5)))
  }
  return { inicio, quantos, pesos, maximo, centroDe, centroAte }
}

// Tabela para tirar a curva da tela na entrada: 65536 degraus, o código arredondado a 16 bits (meio degrau de 16 bits
// de erro, no máximo, antes de uma média de vários pixels: abaixo do que qualquer saída guarda).
const DEGRAUS = 65535
function tabelaDeLinearizar(decodificar) {
  const tabela = new Float32Array(DEGRAUS + 1)
  for (let i = 0; i <= DEGRAUS; i++) tabela[i] = decodificar(i / DEGRAUS)
  return tabela
}

// Passada das linhas (a primeira): cada linha de saída é a soma pesada de linhas inteiras de entrada, lidas em
// sequência. A linearização acontece aqui: cada linha de entrada é linearizada uma vez e fica guardada enquanto alguma
// linha de saída ainda precisa dela. Os limites contra ringing saem do menor e do maior valor, amostra a amostra, das
// linhas centrais.
function passadaVertical(dados, largura, altura, canais, novaAltura, metodo, antiAnel, tabela) {
  const { inicio, quantos, pesos, maximo, centroDe, centroAte } = contribuicoes(altura, novaAltura, metodo)
  const passo = largura * canais
  const saida = new Float32Array(passo * novaAltura)
  const limitar = antiAnel > 0 && metodo !== 'area'
  const soma = new Float32Array(passo)
  const menor = new Float32Array(passo)
  const maior = new Float32Array(passo)
  // linhas linearizadas ainda em uso (índice → linha) e as já liberadas, para reaproveitar a memória
  const guardadas = new Map()
  const livres = []
  let maisAntiga = 0
  const linear = (j) => {
    let linha = guardadas.get(j)
    if (linha) return linha
    linha = livres.pop() ?? new Float32Array(passo)
    const o = j * passo
    for (let i = 0; i < passo; i++) {
      const v = dados[o + i]
      linha[i] = tabela[v <= 0 ? 0 : v >= 1 ? DEGRAUS : (v * DEGRAUS + 0.5) | 0]
    }
    guardadas.set(j, linha)
    return linha
  }
  for (let y = 0; y < novaAltura; y++) {
    if (tabela) {
      for (; maisAntiga < inicio[y]; maisAntiga++) {
        const velha = guardadas.get(maisAntiga)
        if (velha) {
          livres.push(velha)
          guardadas.delete(maisAntiga)
        }
      }
    }
    soma.fill(0)
    const n = quantos[y]
    for (let j = 0; j < n; j++) {
      const w = pesos[y * maximo + j]
      const fonte = tabela ? linear(inicio[y] + j) : dados
      const o = tabela ? 0 : (inicio[y] + j) * passo
      for (let i = 0; i < passo; i++) soma[i] += fonte[o + i] * w
    }
    if (limitar) {
      for (let j = centroDe[y]; j <= centroAte[y]; j++) {
        const fonte = tabela ? linear(j) : dados
        const o = tabela ? 0 : j * passo
        if (j === centroDe[y]) {
          for (let i = 0; i < passo; i++) menor[i] = maior[i] = fonte[o + i]
          continue
        }
        for (let i = 0; i < passo; i++) {
          const v = fonte[o + i]
          if (v < menor[i]) menor[i] = v
          else if (v > maior[i]) maior[i] = v
        }
      }
      for (let i = 0; i < passo; i++) {
        const s = soma[i]
        soma[i] = s + ((s < menor[i] ? menor[i] : s > maior[i] ? maior[i] : s) - s) * antiAnel
      }
    }
    saida.set(soma, y * passo)
  }
  return saida
}

// Passada das colunas (a segunda, já sobre a imagem de altura reduzida): cada linha vira uma linha com `novaLargura`
// amostras.
function passadaHorizontal(dados, largura, altura, canais, novaLargura, metodo, antiAnel) {
  const { inicio, quantos, pesos, maximo, centroDe, centroAte } = contribuicoes(largura, novaLargura, metodo)
  const saida = new Float32Array(novaLargura * altura * canais)
  const limitar = antiAnel > 0 && metodo !== 'area'
  for (let y = 0; y < altura; y++) {
    const base = y * largura * canais
    let d = y * novaLargura * canais
    if (canais === 3) {
      // o caso da foto, com os três canais na mesma volta
      for (let x = 0; x < novaLargura; x++, d += 3) {
        const n = quantos[x]
        const pw = x * maximo
        let p = base + inicio[x] * 3
        let s0 = 0
        let s1 = 0
        let s2 = 0
        for (let j = 0; j < n; j++, p += 3) {
          const w = pesos[pw + j]
          s0 += dados[p] * w
          s1 += dados[p + 1] * w
          s2 += dados[p + 2] * w
        }
        if (limitar) {
          p = base + centroDe[x] * 3
          const fim = base + centroAte[x] * 3
          let a0 = dados[p]
          let b0 = a0
          let a1 = dados[p + 1]
          let b1 = a1
          let a2 = dados[p + 2]
          let b2 = a2
          for (p += 3; p <= fim; p += 3) {
            const v0 = dados[p]
            const v1 = dados[p + 1]
            const v2 = dados[p + 2]
            if (v0 < a0) a0 = v0
            else if (v0 > b0) b0 = v0
            if (v1 < a1) a1 = v1
            else if (v1 > b1) b1 = v1
            if (v2 < a2) a2 = v2
            else if (v2 > b2) b2 = v2
          }
          s0 += ((s0 < a0 ? a0 : s0 > b0 ? b0 : s0) - s0) * antiAnel
          s1 += ((s1 < a1 ? a1 : s1 > b1 ? b1 : s1) - s1) * antiAnel
          s2 += ((s2 < a2 ? a2 : s2 > b2 ? b2 : s2) - s2) * antiAnel
        }
        saida[d] = s0
        saida[d + 1] = s1
        saida[d + 2] = s2
      }
      continue
    }
    for (let x = 0; x < novaLargura; x++) {
      const n = quantos[x]
      const pw = x * maximo
      for (let k = 0; k < canais; k++) {
        let soma = 0
        let p = base + inicio[x] * canais + k
        for (let j = 0; j < n; j++, p += canais) soma += dados[p] * pesos[pw + j]
        if (limitar) {
          let menor = Infinity
          let maior = -Infinity
          p = base + centroDe[x] * canais + k
          for (let j = centroDe[x]; j <= centroAte[x]; j++, p += canais) {
            const v = dados[p]
            if (v < menor) menor = v
            if (v > maior) maior = v
          }
          soma += ((soma < menor ? menor : soma > maior ? maior : soma) - soma) * antiAnel
        }
        saida[d + x * canais + k] = soma
      }
    }
  }
  return saida
}

/**
 * Reamostra um plano Float32 entrelaçado (`canais` por pixel) para outro tamanho. É a peça que `redimensionar` e a
 * marca-d'água usam.
 *   metodo     'lanczos' (padrão) | 'area' | 'auto' (área até 4× o tamanho final quando a redução passa de 8×, depois Lanczos)
 *   antiAnel   0..1: quanto do limite contra ringing aplicar (padrão 1)
 *   linearizar função código → luz aplicada a cada amostra de entrada (0..1) antes de filtrar
 */
export function reamostrar(dados, largura, altura, canais, novaLargura, novaAltura, { metodo = 'lanczos', antiAnel = 1, linearizar = null } = {}) {
  if (dados.length !== largura * altura * canais) throw new Error('reamostrar: os dados não têm largura × altura × canais amostras')
  if (!(novaLargura >= 1) || !(novaAltura >= 1)) throw new Error('reamostrar: tamanho de saída inválido')
  if (!['lanczos', 'area', 'auto'].includes(metodo)) throw new Error(`reamostrar: método desconhecido: ${metodo}`)
  let tabela = linearizar ? tabelaDeLinearizar(linearizar) : null
  let atual = dados
  let l = largura
  let a = altura
  if (metodo === 'auto') {
    const razao = Math.max(largura / novaLargura, altura / novaAltura)
    if (razao > 8) {
      const li = Math.min(largura, novaLargura * 4)
      const ai = Math.min(altura, novaAltura * 4)
      atual = doisEixos(atual, l, a, canais, li, ai, 'area', 0, tabela)
      tabela = null
      l = li
      a = ai
    }
  }
  if (l === novaLargura && a === novaAltura && !tabela) return atual === dados ? Float32Array.from(dados) : atual
  return doisEixos(atual, l, a, canais, novaLargura, novaAltura, metodo === 'area' ? 'area' : 'lanczos', antiAnel, tabela)
}

function doisEixos(dados, largura, altura, canais, novaLargura, novaAltura, metodo, antiAnel, tabela) {
  // linhas primeiro: é a passada que lê a imagem grande, e ela anda em sequência pela memória; as colunas vêm
  // depois, sobre a imagem que já encolheu na altura
  const v = altura === novaAltura && !tabela ? dados : passadaVertical(dados, largura, altura, canais, novaAltura, metodo, antiAnel, tabela)
  if (largura === novaLargura) return v === dados ? Float32Array.from(dados) : v
  return passadaHorizontal(v, largura, novaAltura, canais, novaLargura, metodo, antiAnel)
}

/**
 * Redimensiona uma Imagem ({ largura, altura, dados: Float32Array RGB }) para o tamanho pedido (ver `calcularTamanho`;
 * também aceita { largura, altura } exatos em `tamanho.tipo === 'exato'`).
 *   espaco    'srgb' | 'p3' | 'adobe' | 'rec2020' | 'prophoto': a imagem está com a curva desse espaço (é a imagem
 *             de tela do motor); a conta é feita em luz linear e o resultado volta com a mesma curva. Sem `espaco`,
 *             os dados são tratados como lineares.
 *   ampliar   deixa crescer (padrão: não)
 *   metodo, antiAnel   como em `reamostrar`; o método padrão aqui é 'auto'
 * Devolve uma imagem nova; quando o tamanho não muda, devolve a própria entrada.
 */
export function redimensionar(imagem, tamanho, { espaco = null, ampliar = false, metodo = 'auto', antiAnel = 1 } = {}) {
  const { largura, altura, dados } = imagem
  const alvo =
    tamanho?.tipo === 'exato'
      ? { largura: Math.max(1, Math.round(tamanho.largura)), altura: Math.max(1, Math.round(tamanho.altura)) }
      : calcularTamanho(imagem, tamanho, { ampliar })
  if (alvo.largura === largura && alvo.altura === altura) return imagem
  const curva = espaco ? curvaDe(espaco) : null
  const saida = reamostrar(dados, largura, altura, 3, alvo.largura, alvo.altura, { metodo, antiAnel, linearizar: curva?.decodificar ?? null })
  if (curva) {
    for (let i = 0; i < saida.length; i++) {
      const v = saida[i]
      saida[i] = v <= 0 ? 0 : v >= 1 ? 1 : curva.codificar(v)
    }
  }
  return { largura: alvo.largura, altura: alvo.altura, dados: saida }
}

// ─────────── nitidez de saída ───────────

export const DESTINOS_DE_NITIDEZ = ['tela', 'fosco', 'brilhante']
export const INTENSIDADES_DE_NITIDEZ = ['baixa', 'padrao', 'alta']

// Escolha de aparência (como as constantes de src/motor/tela.js), com o porquê:
//   tela        a foto é vista pixel a pixel: raio de meio pixel só devolve o que a redução amaciou
//   brilhante   a 300 ppi e 30 cm o olho separa cerca de 1 pixel; o papel brilhante quase não espalha a tinta
//   fosco       o papel fosco espalha mais (ganho de ponto): raio e quantidade maiores para o impresso parecer igual
// `raio` é o desvio do desfoque gaussiano em pixels; `quantidade` é quanto da diferença volta para a imagem.
const NITIDEZ = {
  tela: { raio: 0.5, quantidade: 0.6 },
  brilhante: { raio: 0.9, quantidade: 0.9 },
  fosco: { raio: 1.2, quantidade: 1.2 },
}
const FATOR_DA_INTENSIDADE = { baixa: 0.5, padrao: 1, alta: 1.5 }

/** Raio (px) e quantidade da nitidez de saída para um destino e uma intensidade. */
export function parametrosDeNitidez({ destino = 'tela', intensidade = 'padrao' } = {}) {
  const base = NITIDEZ[destino]
  const fator = FATOR_DA_INTENSIDADE[intensidade]
  if (!base) throw new Error(`Nitidez de saída: destino desconhecido: ${destino}`)
  if (!fator) throw new Error(`Nitidez de saída: intensidade desconhecida: ${intensidade}`)
  return { raio: base.raio, quantidade: base.quantidade * fator }
}

function desfocar(plano, largura, altura, sigma) {
  const raio = Math.max(1, Math.ceil(sigma * 3))
  const nucleo = new Float32Array(raio * 2 + 1)
  let soma = 0
  for (let i = -raio; i <= raio; i++) {
    nucleo[i + raio] = Math.exp(-(i * i) / (2 * sigma * sigma))
    soma += nucleo[i + raio]
  }
  for (let i = 0; i < nucleo.length; i++) nucleo[i] /= soma
  const meio = new Float32Array(plano.length)
  const saida = new Float32Array(plano.length)
  for (let y = 0; y < altura; y++) {
    const o = y * largura
    for (let x = 0; x < largura; x++) {
      let s = 0
      for (let k = -raio; k <= raio; k++) {
        const xx = x + k < 0 ? 0 : x + k >= largura ? largura - 1 : x + k
        s += plano[o + xx] * nucleo[k + raio]
      }
      meio[o + x] = s
    }
  }
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let s = 0
      for (let k = -raio; k <= raio; k++) {
        const yy = y + k < 0 ? 0 : y + k >= altura ? altura - 1 : y + k
        s += meio[yy * largura + x] * nucleo[k + raio]
      }
      saida[y * largura + x] = s
    }
  }
  return saida
}

/**
 * Nitidez de saída, aplicada DEPOIS da redução e sobre a imagem de tela (0..1, com a curva): máscara de nitidez na
 * luma (a mesma diferença somada aos três canais, para não criar franja de cor), com o resultado preso em 0..1.
 *   destino       'tela' | 'fosco' | 'brilhante'         intensidade   'baixa' | 'padrao' | 'alta'
 * Devolve uma imagem nova.
 */
export function nitidezDeSaida(imagem, opcoes) {
  const { raio, quantidade } = parametrosDeNitidez(opcoes)
  const { largura, altura, dados } = imagem
  const n = largura * altura
  const luma = new Float32Array(n)
  // pesos da luma do Rec.709 sobre o código (é só para medir contraste local; a cor não sai daqui)
  for (let p = 0, i = 0; p < n; p++, i += 3) luma[p] = 0.2126 * dados[i] + 0.7152 * dados[i + 1] + 0.0722 * dados[i + 2]
  const suave = desfocar(luma, largura, altura, raio)
  const saida = new Float32Array(dados.length)
  for (let p = 0, i = 0; p < n; p++, i += 3) {
    const d = (luma[p] - suave[p]) * quantidade
    for (let k = 0; k < 3; k++) {
      const v = dados[i + k] + d
      saida[i + k] = v < 0 ? 0 : v > 1 ? 1 : v
    }
  }
  return { largura, altura, dados: saida }
}
