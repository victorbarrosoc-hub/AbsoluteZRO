// Magnitude · cena: que tipo de foto é esta, por regra que dá para explicar em uma linha.
//
//   classificarCena({ rostos, objetos, rotulos, medidas }) → { cena, confianca, porque, noite, pontos }
//
// Entradas (todas opcionais; camada que não rodou vem undefined, camada que rodou e não achou nada vem []):
//   rostos     o que analisarRostos devolveu (basta { caixa, confianca? } por rosto)
//   objetos    [{ classe, confianca }]            classes COCO do EfficientDet-Lite0 (categoryName em inglês)
//   rotulos    [{ nome, confianca, indice? }]     rótulos ImageNet do EfficientNet-Lite0 (categoryName e index)
//   medidas    o que medir() devolveu (largura do quadro e a luma para a regra da noite)
//
// A ordem das regras é a que errou menos na prova: o classificador de imagem sozinho confunde gente com contexto
// forte (fundo branco vira "produto", mesa vira "comida", urso de pelúcia vira "animal"). Por isso quem decide
// primeiro são os rostos, depois os objetos, e o rótulo só escolhe entre as cenas sem gente.
//   1. rostos: um rosto com 15% da largura ou mais = retrato; três ou mais = grupo; os outros casos = pessoas
//   2. sem rosto, objeto 'person' = pessoas
//   3. sem rosto, objeto de animal = animal
//   4. rótulos (com o apoio dos objetos de comida e de produto) = natureza, paisagem, comida, arquitetura, produto,
//      documento (e animal, pelos 398 primeiros rótulos do ImageNet, quando o detector de objetos não achou)
//   5. cena escura com pontos de luz = noturna (só quando os rótulos não têm certeza)
//   6. senão: outra
// `noite` sai true sempre que a regra da luz bate, seja qual for a cena: a nota usa para não chamar de escura uma
// foto que é escura porque é de noite.

import { PORQUE_DA_CENA } from './textos.js'

/**
 * Limiares da cena. Os dois primeiros blocos vêm da prova em 32 fotos; os de rótulo são ponto de partida (a regra
 * inteira ainda não foi medida num conjunto rotulado).
 */
export const LIMIARES_CENA = Object.freeze({
  retratoLargura: 0.15, // um rosto com esta fração da largura do quadro, ou mais, é retrato
  grupoRostos: 3,
  objeto: 0.5, // confiança mínima do detector de objetos
  rotulo: 0.25, // soma mínima de confiança dos rótulos (mais o apoio dos objetos) para a cena valer
  rotuloForte: 0.5, // acima disto o rótulo ganha da regra da noite
  apoioDeObjeto: 0.5, // quanto a confiança de um objeto soma à cena que ele apoia
  // noite: mediana escura e, ainda assim, luz de verdade em algum lugar (níveis de 8 bits da luma)
  noiteMediana: 40,
  noiteLuz: 110,
})

/** Classes COCO que são bicho. */
export const OBJETOS_DE_ANIMAL = Object.freeze(['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'])

/** Classes COCO que apoiam uma cena (não decidem sozinhas: um copo na mesa não faz da foto uma foto de comida). */
export const OBJETOS_DE_APOIO = Object.freeze({
  comida: ['banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'bowl', 'fork', 'knife', 'spoon', 'wine glass', 'cup'],
  produto: ['bottle', 'handbag', 'backpack', 'suitcase', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'book', 'clock', 'vase', 'scissors', 'hair drier', 'toothbrush'],
})

/** Os 398 primeiros rótulos do ImageNet-1k (índices 0 a 397, de 'tench' a 'puffer') são todos animais. */
export const ULTIMO_INDICE_DE_ANIMAL = 397

/**
 * Tabela de rótulos ImageNet (os nomes do arquivo de rótulos do EfficientNet-Lite0, em minúsculas) → cena.
 * Só entram rótulos que dizem que tipo de foto é; objeto que aparece em qualquer foto (cadeira, parede) fica de fora.
 */
export const ROTULOS_PARA_CENA = Object.freeze({
  paisagem: ['alp', 'cliff', 'geyser', 'lakeside', 'promontory', 'sandbar', 'seashore', 'valley', 'volcano', 'breakwater'],
  natureza: [
    'daisy',
    "yellow lady's slipper",
    'corn',
    'acorn',
    'hip',
    'buckeye',
    'coral fungus',
    'agaric',
    'gyromitra',
    'stinkhorn',
    'earthstar',
    'hen-of-the-woods',
    'bolete',
    'ear',
    'rapeseed',
    'hay',
    'coral reef',
    'spider web',
    'honeycomb',
    'cardoon',
  ],
  comida: [
    'guacamole',
    'consomme',
    'hot pot',
    'trifle',
    'ice cream',
    'ice lolly',
    'french loaf',
    'bagel',
    'pretzel',
    'cheeseburger',
    'hotdog',
    'mashed potato',
    'head cabbage',
    'broccoli',
    'cauliflower',
    'zucchini',
    'spaghetti squash',
    'acorn squash',
    'butternut squash',
    'cucumber',
    'artichoke',
    'bell pepper',
    'mushroom',
    'granny smith',
    'strawberry',
    'orange',
    'lemon',
    'fig',
    'pineapple',
    'banana',
    'jackfruit',
    'custard apple',
    'pomegranate',
    'carbonara',
    'chocolate sauce',
    'dough',
    'meat loaf',
    'pizza',
    'potpie',
    'burrito',
    'red wine',
    'espresso',
    'eggnog',
    'plate',
    'soup bowl',
    'bakery',
    'confectionery',
  ],
  arquitetura: [
    'altar',
    'barn',
    'beacon',
    'bell cote',
    'boathouse',
    'castle',
    'church',
    'cinema',
    'cliff dwelling',
    'dam',
    'dock',
    'dome',
    'fountain',
    'greenhouse',
    'library',
    'lumbermill',
    'megalith',
    'mobile home',
    'monastery',
    'mosque',
    'obelisk',
    'palace',
    'patio',
    'pier',
    'planetarium',
    'prison',
    'restaurant',
    'steel arch bridge',
    'stupa',
    'suspension bridge',
    'thatch',
    'tile roof',
    'totem pole',
    'triumphal arch',
    'vault',
    'viaduct',
    'water tower',
    'yurt',
    'barbershop',
    'bookshop',
    'butcher shop',
    'grocery store',
    'shoe shop',
    'tobacco shop',
    'toyshop',
  ],
  produto: [
    'analog clock',
    'digital clock',
    'digital watch',
    'stopwatch',
    'wall clock',
    'perfume',
    'lipstick',
    'lotion',
    'face powder',
    'hair spray',
    'sunscreen',
    'sunglass',
    'sunglasses',
    'running shoe',
    'loafer',
    'sandal',
    'clog',
    'cowboy boot',
    'purse',
    'wallet',
    'backpack',
    'necklace',
    'cellular telephone',
    'ipod',
    'laptop',
    'notebook',
    'desktop computer',
    'computer keyboard',
    'mouse',
    'monitor',
    'reflex camera',
    'polaroid camera',
    'lens cap',
    'loudspeaker',
    'radio',
    'remote control',
    'hand-held computer',
    'hard disc',
    'modem',
    'printer',
    'joystick',
    'wine bottle',
    'beer bottle',
    'pop bottle',
    'water bottle',
    'pill bottle',
    'whiskey jug',
    'water jug',
    'cocktail shaker',
    'coffeepot',
    'teapot',
    'espresso maker',
    'coffee mug',
    'vase',
    'pitcher',
    'piggy bank',
    'candle',
    'lighter',
    'corkscrew',
  ],
  documento: ['web site', 'comic book', 'crossword puzzle', 'book jacket', 'menu', 'envelope', 'binder', 'packet'],
})

const cenaDoRotulo = new Map()
for (const [cena, nomes] of Object.entries(ROTULOS_PARA_CENA)) for (const nome of nomes) cenaDoRotulo.set(nome, cena)

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const nivel = (v, alta, media) => (v >= alta ? 'alta' : v >= media ? 'media' : 'baixa')

/** A cena de um rótulo ImageNet ('seashore' → 'paisagem'), ou null. Aceita o índice para reconhecer os animais. */
export function cenaDeRotulo(nome, indice) {
  if (Number.isInteger(indice) && indice >= 0 && indice <= ULTIMO_INDICE_DE_ANIMAL) return 'animal'
  if (typeof nome !== 'string') return null
  // o arquivo de rótulos traz um nome por linha; se vier a lista de sinônimos ("seashore, coast"), vale o primeiro
  return cenaDoRotulo.get(nome.split(',')[0].trim().toLowerCase()) ?? null
}

/**
 * Regra da noite: a mediana da luma é escura (abaixo de 40) e ainda assim há luz de verdade (percentil 99 de 110
 * para cima, o mesmo corte que separa "escura" de "tem claro"), ou algum ponto estourado (lâmpada, vela, farol).
 */
export function eNoite(medidas) {
  const e = medidas?.exposicao
  if (!e) return false
  return e.p50 < LIMIARES_CENA.noiteMediana && (e.p99 >= LIMIARES_CENA.noiteLuz || e.altas >= 0.001)
}

/**
 * Classifica a cena. Devolve { cena, confianca: 'alta' | 'media' | 'baixa', porque (uma linha), noite, pontos }.
 * `pontos` mostra a soma de cada cena candidata pelos rótulos e objetos, para a tela poder abrir a conta.
 */
export function classificarCena({ rostos, objetos, rotulos, medidas } = {}) {
  const L = LIMIARES_CENA
  const noite = eNoite(medidas)
  const saida = (cena, confianca, porque, pontos = {}) => ({ cena, confianca, porque, noite, pontos })
  const semVisao = !Array.isArray(rostos) && !Array.isArray(objetos) && !Array.isArray(rotulos)

  // 1. rostos
  const faces = Array.isArray(rostos) ? rostos.filter((r) => r && r.caixa && r.caixa.largura > 0) : []
  if (faces.length) {
    const certeza = Math.max(...faces.map((r) => numero(r.confianca) ?? 1))
    if (faces.length >= L.grupoRostos) return saida('grupo', nivel(certeza, 0.7, 0.5), PORQUE_DA_CENA.grupo(faces.length))
    const largura = numero(medidas?.largura)
    const fracao = largura ? faces[0].caixa.largura / largura : numero(faces[0].tamanho)
    if (faces.length === 1 && fracao != null && fracao >= L.retratoLargura) return saida('retrato', nivel(certeza, 0.7, 0.5), PORQUE_DA_CENA.retrato(fracao))
    return saida('pessoas', nivel(certeza, 0.7, 0.5), PORQUE_DA_CENA.pessoasRostos(faces.length))
  }

  // 2 e 3. objetos: gente de costas ou longe, e bicho
  const coisas = Array.isArray(objetos) ? objetos.filter((o) => o && typeof o.classe === 'string' && (numero(o.confianca) ?? 0) >= L.objeto) : []
  const maior = (classes) => coisas.filter((o) => classes.includes(o.classe)).sort((a, b) => b.confianca - a.confianca)[0]
  const pessoa = maior(['person'])
  if (pessoa) return saida('pessoas', nivel(pessoa.confianca, 0.7, 0.5), PORQUE_DA_CENA.pessoasCorpo())
  const bicho = maior(OBJETOS_DE_ANIMAL)
  if (bicho) return saida('animal', nivel(bicho.confianca, 0.7, 0.5), PORQUE_DA_CENA.animal(bicho.classe))

  // 4. rótulos, com o apoio dos objetos
  const pontos = {}
  const somar = (cena, v) => (pontos[cena] = (pontos[cena] || 0) + v)
  for (const r of Array.isArray(rotulos) ? rotulos : []) {
    const cena = r ? cenaDeRotulo(r.nome, r.indice) : null
    const v = numero(r?.confianca)
    if (cena && v != null && v > 0) somar(cena, v)
  }
  const soDeRotulo = { ...pontos }
  for (const [cena, classes] of Object.entries(OBJETOS_DE_APOIO)) {
    const apoio = maior(classes)
    if (apoio) somar(cena, L.apoioDeObjeto * apoio.confianca)
  }
  let melhor = null
  for (const [cena, v] of Object.entries(pontos)) if (!melhor || v > pontos[melhor]) melhor = cena
  const valor = melhor ? pontos[melhor] : 0
  if (melhor && valor >= L.rotulo && !(noite && valor < L.rotuloForte)) {
    const porque = melhor === 'animal' ? PORQUE_DA_CENA.animalRotulo() : soDeRotulo[melhor] ? PORQUE_DA_CENA.rotulos(melhor) : PORQUE_DA_CENA.objetos(melhor)
    return saida(melhor, nivel(valor, 0.6, 0.4), porque, pontos)
  }

  // 5. noite
  if (noite) return saida('noturna', 'media', PORQUE_DA_CENA.noturna(), pontos)

  // 6. nada decidiu
  return saida('outra', 'baixa', semVisao ? PORQUE_DA_CENA.semVisao() : PORQUE_DA_CENA.outra(), pontos)
}
