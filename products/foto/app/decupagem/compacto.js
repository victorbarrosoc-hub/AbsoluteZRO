// O que a análise guarda em cada foto do catálogo, em forma enxuta. O catálogo inteiro vai para o IndexedDB a cada
// poucos segundos enquanto a análise roda: três mil fotos com o mapa de nitidez em Float32, a malha de 478 pontos de
// cada rosto e a Latitude completa pesariam dezenas de MB a cada gravação. Aqui fica só o que a nota, os grupos e a
// lupa usam. Funções puras, sem DOM: rodam no worker, na página e no Node (os testes).

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const casas = (v, n = 4) => {
  const x = numero(v)
  if (x == null) return null
  const k = 10 ** n
  return Math.round(x * k) / k
}

/**
 * As medidas de `medir()` como vão para o catálogo: iguais, menos o mapa de nitidez, que passa de Float32 para um
 * byte por bloco (`valores[i] × escala` devolve o contraste de borda do bloco, com erro de até 0,2% do maior).
 * `valoresDoMapa` desfaz. O resto (q, qLocal, borrão com o cepstro, exposição, ruído, impressões, horizonte) fica
 * com a precisão inteira: é o que a nota e os grupos leem.
 */
export function compactarMedidas(medidas) {
  const mapa = medidas?.nitidez?.mapa
  if (!mapa || !mapa.valores || mapa.valores instanceof Uint8Array) return medidas
  let maximo = 0
  for (const v of mapa.valores) if (v > maximo) maximo = v
  const escala = maximo > 0 ? maximo / 255 : 1
  const valores = new Uint8Array(mapa.valores.length)
  for (let i = 0; i < valores.length; i++) valores[i] = Math.round(mapa.valores[i] / escala)
  return { ...medidas, nitidez: { ...medidas.nitidez, mapa: { colunas: mapa.colunas, linhas: mapa.linhas, bloco: mapa.bloco, escala, valores } } }
}

/** O contraste de borda de cada bloco do mapa, venha ele inteiro (Float32, de `medir`) ou enxuto (do catálogo). */
export function valoresDoMapa(mapa) {
  if (!mapa?.valores) return null
  if (!(mapa.valores instanceof Uint8Array)) return mapa.valores
  const escala = numero(mapa.escala) ?? 1
  const saida = new Float32Array(mapa.valores.length)
  for (let i = 0; i < saida.length; i++) saida[i] = mapa.valores[i] * escala
  return saida
}

const ponto = (p) => (p && numero(p.x) != null && numero(p.y) != null ? { x: casas(p.x, 1), y: casas(p.y, 1) } : null)

/**
 * Um rosto de `analisarRostos` como vai para o catálogo: tudo o que a nota lê (olhos, nitidez, peso, chave,
 * principal, cortado), arredondado, mais onde estão os olhos (`pontos`, em px da prévia, para a lupa desenhar).
 * A malha e os blendshapes não ficam: servem só para chegar ao estado dos olhos.
 */
export function resumirRosto(rosto, deteccao = null) {
  const c = rosto.caixa
  const pontos = (deteccao?.olhos ?? rosto.pontos ?? []).map(ponto)
  return {
    caixa: { x: casas(c.x, 1), y: casas(c.y, 1), largura: casas(c.largura, 1), altura: casas(c.altura, 1) },
    confianca: casas(rosto.confianca, 3),
    olhos: rosto.olhos ?? null,
    ear: casas(rosto.ear, 3),
    earPorOlho: Array.isArray(rosto.earPorOlho) ? rosto.earPorOlho.map((v) => casas(v, 3)) : [null, null],
    olhoUsado: rosto.olhoUsado ?? null,
    piscada: casas(rosto.piscada, 3),
    aperto: casas(rosto.aperto, 3),
    sorriso: casas(rosto.sorriso, 3),
    guinada: casas(rosto.guinada, 1),
    nitidezOlhos: casas(rosto.nitidezOlhos),
    nitidezRosto: casas(rosto.nitidezRosto),
    razaoFundo: casas(rosto.razaoFundo, 3),
    focoErrado: rosto.focoErrado ?? null,
    tamanho: casas(rosto.tamanho),
    peso: casas(rosto.peso),
    chave: rosto.chave === true,
    principal: rosto.principal === true,
    cortado: rosto.cortado === true,
    pontos: pontos.length === 2 && pontos.every(Boolean) ? pontos : null,
    // por que os olhos não foram lidos, quando não foram: 'pequeno' | 'secundario' | 'sem-malha' | 'outro-rosto'
    semOlhos: rosto.olhos == null ? (deteccao?.semMalha ?? rosto.semOlhos ?? 'sem-malha') : null,
  }
}

/**
 * A Latitude do RAW (src/raw/latitude.js) no que a nota usa: o corte no sensor (um, dois ou três canais), as margens
 * e a confiança. O `detalhe` e as curvas de ruído ficam de fora.
 */
export function resumirLatitude(latitude) {
  if (!latitude) return null
  const c = latitude.cortado ?? {}
  const m = latitude.margem ?? {}
  return {
    cortado: { um: numero(c.um), dois: numero(c.dois), tres: numero(c.tres) },
    margem: {
      altas: Array.isArray(m.altas) ? m.altas.map((v) => casas(v, 3)) : null,
      sombras: casas(m.sombras, 3),
      acimaDoCinza: casas(m.acimaDoCinza, 3),
      abaixoDoCinza: casas(m.abaixoDoCinza, 3),
    },
    faixa: latitude.faixa ? { engenharia: casas(latitude.faixa.engenharia, 2), fotografica: casas(latitude.faixa.fotografica, 2) } : null,
    confianca: latitude.confianca ?? null,
  }
}
