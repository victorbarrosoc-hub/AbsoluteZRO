// Magnitude: a nota da decupagem. De 0 a 100, com estrelas, balde (fica, talvez, fora) e SEMPRE o motivo.
//
//   avaliar(sinais, { rigor, ensaio, pesos, referencia, limiares }) → Magnitude
//   { total, estrelas, balde, motivos: [até 3 frases, a de maior peso primeiro], componentes: { foco, pessoas,
//     exposicao, ruido }, confianca: 'alta' | 'media' | 'baixa', incertezas: [frases], dicas: [frases], detalhe }
//
// sinais = { medidas (obrigatório, de medir()), rostos?, cena?, exif?, latitude?, tipo?: 'raw' | 'imagem',
//            grupo?: { tamanho, maisNitida, olhosFechadosEmTodas }, unica? }
//   rostos   undefined = a camada de rostos não rodou (a nota sai só com o medido e a certeza cai);
//            [] = rodou e não achou ninguém. Nunca se inventa rosto.
//   latitude a medida do RAW (src/raw/latitude.js). Com ela, a exposição é julgada pelo dado do sensor.
//
// Como a nota é feita (e por quê):
// 1. Quatro componentes de 0 a 100: foco, pessoas, exposição e ruído, somados com pesos que dependem de haver gente.
// 2. Tetos: defeitos que nenhuma outra qualidade compensa limitam a nota e viram o primeiro motivo
//    (tremida 30, fora de foco 35, olhos fechados 40, altas luzes perdidas 50).
// 3. Pessoas: para os olhos vale a PIOR pessoa-chave, não a média (uma pessoa de olho fechado estraga a foto de
//    grupo); rosto secundário desfocado não entra na conta.
// 4. Contexto: olho fechado não reprova quando todas as fotos da sequência têm os olhos fechados (beijo, oração,
//    recém-nascido dormindo), nem nos ensaios em que olho fechado é da pose.
// 5. Exposição pelo RAW: com a Latitude do arquivo, altas luzes só descontam e só dão teto quando os TRÊS canais do
//    sensor estão cortados (dado perdido). Um ou dois canais cortados o motor reconstrói: vira aviso, não desconto.
//    RAW que ainda não foi lido (só a prévia embutida): um canal estourado é aviso; branco chapado desconta, mas
//    não dá teto, e a certeza cai. Imagem pronta (JPEG) é o que é: o que estourou não volta.
// 6. Calibração no ensaio: a régua da nitidez é a das fotos mais nítidas do próprio ensaio (lente suave, neblina e
//    ISO alto não reprovam o ensaio inteiro).
// 7. Cobertura: a única foto de um momento nunca vai para "fora" sozinha.
//
// Os pesos, os tetos e os cortes de balde são proposta de produto: ainda não foram medidos contra a escolha de
// fotógrafos. Por isso existe ajustarPesos(): a pessoa troca a escolhida, os pesos andam, e a mudança é dita em
// palavras e pode ser zerada. E existem os `limiares` da pessoa (src/decupagem/calibracao.js): três números que movem
// os cortes de nitidez, olhos e exposição, cada um com limite, sempre à vista e com "voltar ao padrão".

import { DICAS, INCERTEZAS, MOTIVOS, APRENDIZADO } from './textos.js'
import { agrupar, escolherNoGrupo, FOLGA_DE_NITIDEZ, MARGEM_DE_ERRO } from './grupos.js'
import { LIMIARES } from './medidas.js'
import { LIMIARES_ROSTO } from './rostos.js'
import { eNoite } from './cena.js'

/** Cortes de balde por rigor: nota a partir de `fica` fica; abaixo de `fora` sai; no meio, talvez. */
export const RIGORES = Object.freeze({
  relaxado: Object.freeze({ fica: 60, fora: 35 }),
  equilibrado: Object.freeze({ fica: 70, fora: 40 }),
  estrito: Object.freeze({ fica: 78, fora: 50 }),
})

/** Tetos: a nota máxima de uma foto com o defeito. Com os cortes acima, decidem em que balde o defeito cai. */
export const TETOS = Object.freeze({ tremida: 30, foraDeFoco: 35, olhosFechados: 40, estourada: 50 })

/** Tipos de ensaio que mudam a regra (os nomes de tela estão em textos.js). */
export const ENSAIOS = Object.freeze({
  geral: Object.freeze({ olhosContam: true }),
  'recem-nascido': Object.freeze({ olhosContam: false }),
  boudoir: Object.freeze({ olhosContam: false }),
  esporte: Object.freeze({ olhosContam: false }),
})

/** Parâmetros da conta, num lugar só. */
export const PARAMETROS = Object.freeze({
  // foco: 0 em q = 0,52 (o piso de uma imagem toda borrada, que é ruído) e 100 no topo (0,75, ou o do ensaio)
  qPiso: 0.52,
  qTopo: 0.75,
  qTopoMinimo: 0.65, // a calibração não desce o topo abaixo do meio da faixa "leve": ensaio todo fora de foco não vira nítido
  calibrarCom: 12, // mínimo de fotos para a calibração valer
  // exposição: pontos por ponto percentual de área, acima da tolerância
  altas: { tolerancia: 1, custo: 4 }, // um canal estourado (perde cor)
  perdidas: { tolerancia: 0.5, custo: 20 }, // três canais (branco sem volta)
  baixas: { tolerancia: 2, custo: 3 },
  estouradaTeto: 0.1, // fração da área com dado perdido que dá o teto
  escura: { p99: 110, custo: 0.5, maximo: 30 }, // pontos por nível de 8 bits abaixo do corte
  lavada: { p1: 60, custo: 0.5, maximo: 30 },
  // ruído: 100 até σ = 2, zero em σ = 12 (níveis de 8 bits)
  ruidoLimpo: 2,
  ruidoFaixa: 10,
  ruidoAlto: 6,
  // horizonte: só avisa com linha comprida, em cena que tem horizonte, e ângulo que vale consertar
  horizonte: { forca: 1, min: 0.7, max: 10, cenas: ['paisagem', 'arquitetura', 'natureza', 'noturna'] },
  // a decisão que cai a menos disto de um corte de balde é marcada como incerta
  noLimite: 3,
  // meta: quanto vale a segunda (terceira…) foto do mesmo grupo, em relação à primeira
  novidade: { repetidas: 0.25, sequencia: 0.5 },
  // aprendizado: passo de cada troca e até onde um peso pode ir (vezes o de fábrica)
  taxa: 0.15,
  pesoMinimo: 0.5,
  pesoMaximo: 2,
  // os limiares da pessoa (calibração): o que cada um move e até onde pode ir
  //   nitidez   q somado ao corte de "fora de foco" (positivo = mais exigente)
  //   olhos     somado aos cortes de EAR do olho fechado e do aberto (positivo = mais exigente com olho semicerrado)
  //   exposicao vezes a tolerância de área estourada e de sombra fechada (maior = tolera mais)
  limiares: Object.freeze({ nitidez: Object.freeze([-0.05, 0.05]), olhos: Object.freeze([-0.04, 0.04]), exposicao: Object.freeze([0.5, 4]) }),
})

/** Os limiares de fábrica: não mexem em nada. */
export const limiaresPadrao = () => ({ nitidez: 0, olhos: 0, exposicao: 1 })

/** Limiares válidos e dentro dos limites (o que vier fora vira o padrão ou a borda). */
export function normalizarLimiares(l) {
  const P = PARAMETROS.limiares
  const padrao = limiaresPadrao()
  const ler = (k) => {
    const v = num(l?.[k])
    return v == null ? padrao[k] : limitar(v, P[k][0], P[k][1])
  }
  return { nitidez: ler('nitidez'), olhos: ler('olhos'), exposicao: ler('exposicao') }
}

/** Os limiares saem do padrão? */
export const limiaresMexidos = (l) => {
  const n = normalizarLimiares(l)
  return n.nitidez !== 0 || n.olhos !== 0 || n.exposicao !== 1
}

/** Pesos de fábrica. `pessoas` vale quando há rosto analisado; `demais`, no resto; `rosto` reparte o componente pessoas. */
export function pesosPadrao() {
  return {
    pessoas: { foco: 35, pessoas: 35, exposicao: 15, ruido: 5 },
    demais: { foco: 55, exposicao: 30, ruido: 15 },
    rosto: { olhos: 0.6, nitidez: 0.25, expressao: 0.15 },
  }
}

const limitar = (v, min = 0, max = 1) => (v < min ? min : v > max ? max : v)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const VALOR_DOS_OLHOS = { abertos: 1, sorrindo: 1, parcial: 0.5, fechados: 0 }

// ───────────────────────────── leitura dos sinais ─────────────────────────────

function pessoasChave(rostos) {
  const lista = Array.isArray(rostos) ? rostos.filter(Boolean) : []
  if (!lista.length) return { todas: [], chaves: [], principal: null }
  const chaves = lista.filter((r) => r.chave)
  const principal = lista.find((r) => r.principal) ?? lista.reduce((a, b) => ((b.peso ?? 0) > (a.peso ?? 0) ? b : a))
  return { todas: lista, chaves: chaves.length ? chaves : [principal], principal }
}

/**
 * O q que representa o foco da foto, e de onde veio: dos olhos do rosto principal, senão do rosto, senão do quadro
 * inteiro. Com rosto, o quadro inteiro engana nos dois sentidos (retrato com fundo desfocado parece borrado; rosto
 * desfocado na frente de um fundo nítido parece bom), então só se usa quando o rosto não dá medida.
 */
export function focoDaFoto(sinais) {
  const { principal } = pessoasChave(sinais.rostos)
  if (principal) {
    if (num(principal.nitidezOlhos) != null) return { q: principal.nitidezOlhos, origem: 'olhos' }
    if (num(principal.nitidezRosto) != null) return { q: principal.nitidezRosto, origem: 'rosto' }
  }
  const n = sinais.medidas?.nitidez
  return { q: num(n?.qLocal) ?? num(n?.q), origem: 'quadro' }
}

function percentilDe(ordenados, p) {
  if (!ordenados.length) return null
  const pos = ((ordenados.length - 1) * p) / 100
  const k = Math.floor(pos)
  return k + 1 < ordenados.length ? ordenados[k] + (ordenados[k + 1] - ordenados[k]) * (pos - k) : ordenados[k]
}

/**
 * Calibração dentro do ensaio. Junta o q de foco de todas as fotos e tira a régua: o `topo` (q que vale 100) passa
 * a ser o percentil 90 do ensaio, nunca acima do de fábrica (ensaio todo nítido não fica mais exigente) nem abaixo
 * de 0,65 (com isso o teto de fora de foco, que na régua de fábrica começa em q = 0,60, nunca recua para menos de
 * 0,565). Com menos de 12 fotos não há ensaio para calibrar: vale a régua de fábrica.
 * `posto(q)` diz a fração do ensaio que é menos nítida que q.
 */
export function calibrar(fotos) {
  const P = PARAMETROS
  const valores = (Array.isArray(fotos) ? fotos : [])
    .map((f) => focoDaFoto(f).q)
    .filter((q) => q != null)
    .sort((a, b) => a - b)
  const n = valores.length
  const calibrada = n >= P.calibrarCom
  const p90 = percentilDe(valores, 90)
  return {
    n,
    calibrada,
    p10: percentilDe(valores, 10),
    p50: percentilDe(valores, 50),
    p90,
    topo: calibrada ? limitar(p90, P.qTopoMinimo, P.qTopo) : P.qTopo,
    posto(q) {
      if (!n || q == null) return null
      let menores = 0
      for (const v of valores) if (v < q) menores++
      return menores / n
    },
  }
}

// ───────────────────────────── componentes ─────────────────────────────

/**
 * O q abaixo do qual a foto leva o teto de "fora de foco": é onde o componente de foco cruza 35. Com a régua do
 * ensaio (`referencia`) e o limiar de nitidez da pessoa (somado ao q).
 */
export function corteDeFoco(referencia, limiares) {
  const P = PARAMETROS
  const topo = num(referencia?.topo) ?? P.qTopo
  return P.qPiso + (TETOS.foraDeFoco / 100) * (topo - P.qPiso) + normalizarLimiares(limiares).nitidez
}

/**
 * O estado dos olhos de um rosto com o limiar de olhos da pessoa (`d`, somado aos cortes de EAR de
 * src/decupagem/rostos.js). Sem limiar, ou sem o EAR guardado, é o estado que a análise leu. Riso forte segue riso;
 * olho apertado de sol (eyeSquint sem piscada) segue aberto.
 */
export function olhosComLimiar(rosto, d = 0) {
  const estado = rosto?.olhos ?? null
  const e = num(rosto?.ear)
  if (!d || estado == null || estado === 'sorrindo' || e == null) return estado
  const L = LIMIARES_ROSTO
  const p = num(rosto.piscada)
  const semPiscada = p == null || p < L.piscadaAberto
  const fechado = e < L.earFechado + d || (p != null && p >= L.piscadaFechado && e < L.earDuvida + d)
  if (fechado) return (num(rosto.sorriso) ?? 0) >= L.risoForte ? 'sorrindo' : 'fechados'
  const aberto = e >= L.earAberto + d && semPiscada
  if (estado === 'fechados' || estado === 'parcial') return aberto ? 'abertos' : 'parcial'
  const deSol = (num(rosto.aperto) ?? 0) >= L.aperto && semPiscada
  return estado === 'abertos' && !aberto && !deSol ? 'parcial' : estado
}

/**
 * Quantas vezes a tolerância de fábrica a pior área da foto passa: altas luzes de um canal (1%), dado perdido
 * (0,5%) ou sombra fechada (2%). Abaixo de 1, nada desconta. É a régua do limiar de exposição: com o limiar k, a foto
 * só perde ponto quando passa de k. Com a Latitude do RAW, conta o perdido no sensor (um ou dois canais voltam).
 */
export function excessoDeExposicao(sinais) {
  const P = PARAMETROS
  const e = sinais?.medidas?.exposicao
  if (!e) return null
  const cortado = sinais.latitude?.cortado
  const peloRaw = !!cortado && num(cortado.tres) != null
  const perdido = peloRaw ? cortado.tres : e.altas3
  const altas = peloRaw || sinais.tipo === 'raw' ? 0 : e.altas
  return Math.max((altas * 100) / P.altas.tolerancia, (perdido * 100) / P.perdidas.tolerancia, (e.baixas * 100) / P.baixas.tolerancia)
}

function componenteFoco(q, referencia) {
  if (q == null) return null
  const P = PARAMETROS
  const topo = num(referencia?.topo) ?? P.qTopo
  return 100 * limitar((q - P.qPiso) / (topo - P.qPiso))
}

// Exposição. Devolve { valor, perdido (fração com dado sem volta), problemas: [{ texto, custo }], avisos: [texto] }.
// `folga`: o limiar de exposição da pessoa (vezes as tolerâncias de área).
function componenteExposicao(sinais, noite, folga = 1) {
  const B = PARAMETROS
  const P =
    folga === 1
      ? B
      : {
          ...B,
          altas: { ...B.altas, tolerancia: B.altas.tolerancia * folga },
          perdidas: { ...B.perdidas, tolerancia: B.perdidas.tolerancia * folga },
          baixas: { ...B.baixas, tolerancia: B.baixas.tolerancia * folga },
        }
  const e = sinais.medidas.exposicao
  const cortado = sinais.latitude?.cortado
  const peloRaw = !!cortado && num(cortado.tres) != null
  const soPrevia = sinais.tipo === 'raw' && !peloRaw // é RAW, mas só a prévia embutida foi vista até agora
  const problemas = []
  const avisos = []
  let perdido
  if (peloRaw) {
    // o sensor é quem diz: três canais cortados = perdido; um ou dois = o motor reconstrói
    perdido = cortado.tres
    const recuperavel = (num(cortado.um) ?? 0) + (num(cortado.dois) ?? 0)
    if (recuperavel * 100 > P.altas.tolerancia) avisos.push(MOTIVOS.altasRecuperaveis(recuperavel))
  } else perdido = e.altas3
  const custoPerdido = P.perdidas.custo * Math.max(0, perdido * 100 - P.perdidas.tolerancia)
  const custoDeUmCanal = peloRaw ? 0 : P.altas.custo * Math.max(0, e.altas * 100 - P.altas.tolerancia)
  if (soPrevia) {
    // RAW que ainda não foi lido: um canal estourado na prévia quase sempre volta no sensor (avisa e não desconta);
    // branco chapado na prévia desconta, com a ressalva no texto. Uma frase só, com a área toda.
    if (custoPerdido > 0) problemas.push({ texto: MOTIVOS.altasNaPrevia(e.altas), custo: custoPerdido })
    else if (custoDeUmCanal > 0) avisos.push(MOTIVOS.altasNaPrevia(e.altas))
  } else {
    if (custoDeUmCanal > 0) problemas.push({ texto: MOTIVOS.altasEstouradas(e.altas), custo: custoDeUmCanal })
    if (custoPerdido > 0) problemas.push({ texto: MOTIVOS.altasPerdidas(perdido), custo: custoPerdido })
  }
  const custoBaixas = P.baixas.custo * Math.max(0, e.baixas * 100 - P.baixas.tolerancia)
  if (custoBaixas > 0 && !noite) problemas.push({ texto: MOTIVOS.sombrasFechadas(e.baixas), custo: custoBaixas })
  if (e.p99 < P.escura.p99 && !noite) {
    // quanto falta clarear, em EV, para o claro da foto chegar ao corte (valores codificados ≈ luz^(1/2,2))
    const falta = 2.2 * Math.log2(P.escura.p99 / Math.max(1, e.p99))
    const folga = num(sinais.latitude?.margem?.sombras)
    if (folga != null && folga >= falta) avisos.push(MOTIVOS.escuraRecuperavel())
    else problemas.push({ texto: MOTIVOS.escura(), custo: Math.min(P.escura.maximo, P.escura.custo * (P.escura.p99 - e.p99)) })
  }
  if (e.p1 > P.lavada.p1) problemas.push({ texto: MOTIVOS.lavada(), custo: Math.min(P.lavada.maximo, P.lavada.custo * (e.p1 - P.lavada.p1)) })
  const valor = limitar(100 - problemas.reduce((s, p) => s + p.custo, 0), 0, 100)
  return { valor, perdido, peloRaw, soPrevia, problemas, avisos }
}

// Pessoas. Devolve o componente, as partes (0..1) e a contagem dos olhos das pessoas-chave.
function componentePessoas(sinais, { olhosContam, pesosDoRosto, focoDoRosto, dOlhos = 0 }) {
  const { chaves: brutas } = pessoasChave(sinais.rostos)
  const chaves = dOlhos ? brutas.map((r) => ({ ...r, olhos: olhosComLimiar(r, dOlhos) })) : brutas
  const lidos = chaves.filter((r) => r.olhos in VALOR_DOS_OLHOS)
  const fechados = lidos.filter((r) => r.olhos === 'fechados').length
  const parciais = lidos.filter((r) => r.olhos === 'parcial').length
  const doMomento = fechados > 0 && sinais.grupo?.olhosFechadosEmTodas === true
  const perdoados = fechados > 0 && (!olhosContam || doMomento)
  let olhos = null
  if (lidos.length) {
    // a pior pessoa-chave manda; olho fechado perdoado (beijo, bebê dormindo) vale como aberto
    olhos = Math.min(...lidos.map((r) => (r.olhos === 'fechados' && perdoados ? 1 : VALOR_DOS_OLHOS[r.olhos])))
  }
  const sorrisos = chaves.map((r) => num(r.sorriso)).filter((v) => v != null)
  const expressao = sorrisos.length ? 0.5 + 0.5 * (sorrisos.reduce((a, b) => a + b, 0) / sorrisos.length) : null
  const nitidez = focoDoRosto != null ? focoDoRosto / 100 : null
  const partes = { olhos, nitidez, expressao }
  let soma = 0
  let pesos = 0
  for (const k of ['olhos', 'nitidez', 'expressao']) {
    if (partes[k] == null) continue
    soma += pesosDoRosto[k] * partes[k]
    pesos += pesosDoRosto[k]
  }
  return {
    valor: pesos > 0 ? (100 * soma) / pesos : null,
    partes,
    chaves: chaves.length,
    lidos: lidos.length,
    fechados,
    parciais,
    perdoados,
    doMomento,
    sorrindo: chaves.some((r) => r.olhos === 'sorrindo' || (num(r.sorriso) ?? 0) >= 0.6),
  }
}

// ───────────────────────────── avaliar ─────────────────────────────

function estrelasDe(total) {
  return total >= 85 ? 5 : total >= 70 ? 4 : total >= 55 ? 3 : total >= 40 ? 2 : total >= 20 ? 1 : 0
}

function baldeDe(total, rigor) {
  const r = RIGORES[rigor] ?? RIGORES.equilibrado
  return total >= r.fica ? 'fica' : total < r.fora ? 'fora' : 'talvez'
}

/**
 * Avalia uma foto. Ver o cabeçalho para `sinais`. `opcoes`:
 *   rigor      'relaxado' | 'equilibrado' (padrão) | 'estrito'
 *   ensaio     'geral' (padrão) | 'recem-nascido' | 'boudoir' | 'esporte'
 *   pesos      os de pesosPadrao() ou os que ajustarPesos() devolveu
 *   referencia o que calibrar() devolveu para o ensaio
 *   limiares  { nitidez, olhos, exposicao } da pessoa (limiaresPadrao() = de fábrica; ver PARAMETROS.limiares)
 */
export function avaliar(sinais, opcoes = {}) {
  const m = sinais?.medidas
  if (!m || !m.nitidez || !m.exposicao) throw new Error('avaliar: sinais.medidas é obrigatório (o que medir() devolveu)')
  const P = PARAMETROS
  const rigor = opcoes.rigor in RIGORES ? opcoes.rigor : 'equilibrado'
  const ensaio = ENSAIOS[opcoes.ensaio] ?? ENSAIOS.geral
  const pesos = opcoes.pesos ?? pesosPadrao()
  const limiares = normalizarLimiares(opcoes.limiares)
  const temRostos = Array.isArray(sinais.rostos)
  const { todas, principal } = pessoasChave(sinais.rostos)
  const comGente = todas.length > 0
  const cena = typeof sinais.cena === 'string' ? sinais.cena : (sinais.cena?.cena ?? null)
  const noite = sinais.cena?.noite === true || cena === 'noturna' || eNoite(m)

  // foco
  const foco = focoDaFoto(sinais)
  // o limiar de nitidez da pessoa move a régua: q menos o limiar é o que a régua de fábrica lê
  const F = componenteFoco(foco.q == null ? null : foco.q - limiares.nitidez, opcoes.referencia)
  const b = m.borrao ?? { tipo: 'nenhum' }
  const rostoNitido = comGente && foco.origem !== 'quadro' && foco.q >= LIMIARES.nitida
  // tremido de câmera pega o quadro inteiro; se o rosto mediu nítido, é panorâmica ou fundo em movimento, não defeito
  const tremida = b.tipo === 'movimento' && !rostoNitido
  const tremidaForte = tremida && b.comprimento >= LIMIARES.comprimentoForte

  // pessoas, exposição e ruído
  const pessoas = comGente
    ? componentePessoas(sinais, {
        olhosContam: ensaio.olhosContam,
        pesosDoRosto: pesos.rosto,
        focoDoRosto: foco.origem === 'quadro' ? null : F,
        dOlhos: limiares.olhos,
      })
    : null
  const exposicao = componenteExposicao(sinais, noite, limiares.exposicao)
  const R = 100 * limitar(1 - (m.ruido - P.ruidoLimpo) / P.ruidoFaixa)

  // soma ponderada do que foi possível medir
  const conjunto = comGente ? pesos.pessoas : pesos.demais
  const valores = { foco: F, pessoas: pessoas?.valor ?? null, exposicao: exposicao.valor, ruido: num(m.ruido) != null ? R : null }
  let soma = 0
  let somaDosPesos = 0
  for (const k of Object.keys(conjunto)) {
    if (valores[k] == null) continue
    soma += conjunto[k] * valores[k]
    somaDosPesos += conjunto[k]
  }
  const peso = (k) => (valores[k] == null || !(k in conjunto) ? 0 : (100 * conjunto[k]) / somaDosPesos) // em pontos da nota
  let total = somaDosPesos > 0 ? soma / somaDosPesos : 0

  // motivos: cada um com o peso em pontos da nota (perdidos ou ganhos); teto vem sempre na frente
  const motivos = []
  const tetos = []
  const teto = (nome, texto) => {
    tetos.push(nome)
    motivos.push({ texto, peso: 1000 + (100 - TETOS[nome]) })
  }
  const perdidos = (k) => (valores[k] == null ? 0 : (peso(k) * (100 - valores[k])) / 100)
  const ganhos = (k) => (valores[k] == null ? 0 : (peso(k) * (valores[k] - 50)) / 50)

  if (tremidaForte) teto('tremida', MOTIVOS.tremida(b.comprimento))
  else {
    if (tremida) motivos.push({ texto: MOTIVOS.tremidaLeve(b.comprimento), peso: Math.max(1, perdidos('foco')) })
    if (F != null && F < TETOS.foraDeFoco) {
      // componente de foco abaixo de 35 = q abaixo do limiar de "borrada" (na régua de fábrica, 0,60)
      const texto = foco.origem === 'quadro' ? MOTIVOS.foraDeFoco() : principal?.focoErrado ? MOTIVOS.focoNoFundo() : MOTIVOS.rostoForaDeFoco()
      teto('foraDeFoco', texto)
    } else if (F != null && !tremida) {
      if (F < 70) motivos.push({ texto: MOTIVOS.focoSuave(), peso: perdidos('foco') })
      else {
        const g = sinais.grupo
        const texto =
          g?.maisNitida && g.tamanho >= 2
            ? MOTIVOS.maisNitida(g.tamanho)
            : foco.origem === 'olhos'
              ? MOTIVOS.olhosNitidos()
              : foco.origem === 'rosto'
                ? MOTIVOS.rostoNitido()
                : MOTIVOS.nitida()
        motivos.push({ texto, peso: ganhos('foco') })
      }
    }
  }

  if (pessoas) {
    if (pessoas.fechados > 0 && !pessoas.perdoados) teto('olhosFechados', MOTIVOS.olhosFechados(pessoas.fechados, pessoas.lidos))
    else if (pessoas.fechados > 0)
      motivos.push({ texto: pessoas.doMomento ? MOTIVOS.olhosFechadosDoMomento() : MOTIVOS.olhosNaoContam(), peso: 0.2 * peso('pessoas') })
    else if (pessoas.parciais > 0) motivos.push({ texto: MOTIVOS.piscando(pessoas.parciais, pessoas.lidos), peso: perdidos('pessoas') })
    else if (pessoas.lidos > 0 && pessoas.valor != null) {
      motivos.push({ texto: pessoas.sorrindo ? MOTIVOS.sorrindo(pessoas.lidos) : MOTIVOS.olhosAbertos(pessoas.lidos), peso: ganhos('pessoas') })
    }
  }

  // o teto pede certeza: vale para a imagem pronta e para o RAW já lido; só pela prévia de um RAW, não
  if (exposicao.perdido > P.estouradaTeto * limiares.exposicao && !exposicao.soPrevia) teto('estourada', MOTIVOS.altasPerdidas(exposicao.perdido))
  else {
    const custoTotal = exposicao.problemas.reduce((s, p) => s + p.custo, 0)
    const pior = exposicao.problemas.reduce((a, p) => (!a || p.custo > a.custo ? p : a), null)
    // o desconto real do componente (cortado em 100), repartido pelo problema que mais pesou
    if (pior) motivos.push({ texto: pior.texto, peso: Math.max(0.5, (perdidos('exposicao') * pior.custo) / custoTotal) })
  }
  for (const aviso of exposicao.avisos) motivos.push({ texto: aviso, peso: 0.4 })
  if (m.ruido > P.ruidoAlto) motivos.push({ texto: MOTIVOS.ruidosa(), peso: Math.max(0.5, perdidos('ruido')) })

  for (const nome of tetos) total = Math.min(total, TETOS[nome])
  total = Math.round(limitar(total, 0, 100))
  let balde = baldeDe(total, rigor)

  // cobertura: a única foto de um momento nunca vai para "fora" sozinha
  let protegida = false
  if (balde === 'fora' && sinais.unica === true) {
    balde = 'talvez'
    protegida = true
    motivos.push({ texto: MOTIVOS.unica(), peso: 2000 }) // vem antes do teto: é o que explica o balde
  }

  // certeza: cada coisa que não deu para ler tira um degrau
  const incertezas = []
  if (!temRostos) incertezas.push(INCERTEZAS.semRostos())
  if (comGente && pessoas.lidos === 0 && ensaio.olhosContam) incertezas.push(INCERTEZAS.olhosNaoLidos())
  if (comGente && foco.origem === 'quadro') incertezas.push(INCERTEZAS.focoPeloQuadro())
  if (F == null) incertezas.push(INCERTEZAS.semNitidez())
  else if (!b.cepstro) incertezas.push(INCERTEZAS.semTremido())
  const e = m.exposicao
  const folga = limiares.exposicao
  if (exposicao.soPrevia && (e.altas * 100 > P.altas.tolerancia * folga || e.altas3 * 100 > P.perdidas.tolerancia * folga))
    incertezas.push(INCERTEZAS.rawNaoLido())
  const cortes = RIGORES[rigor]
  if (!tetos.length && (Math.abs(total - cortes.fica) < P.noLimite || Math.abs(total - cortes.fora) < P.noLimite)) incertezas.push(INCERTEZAS.noLimite())
  const confianca = incertezas.length === 0 ? 'alta' : incertezas.length === 1 ? 'media' : 'baixa'

  // dicas: não mexem na nota
  const dicas = []
  const h = m.horizonte
  if (h && h.forca >= P.horizonte.forca && P.horizonte.cenas.includes(cena) && Math.abs(h.angulo) >= P.horizonte.min && Math.abs(h.angulo) <= P.horizonte.max)
    dicas.push(DICAS.horizonte(h.angulo))
  if (principal?.cortado) dicas.push(DICAS.rostoCortado())

  motivos.sort((x, y) => y.peso - x.peso)
  const arred = (v) => (v == null ? null : Math.round(v))
  return {
    total,
    estrelas: estrelasDe(total),
    balde,
    motivos: motivos.slice(0, 3).map((x) => x.texto),
    componentes: { foco: arred(F), pessoas: arred(pessoas?.valor), exposicao: arred(exposicao.valor), ruido: arred(valores.ruido) },
    confianca,
    incertezas,
    dicas,
    detalhe: {
      qFoco: foco.q,
      origemDoFoco: foco.origem,
      olhos: pessoas?.partes.olhos ?? null,
      expressao: pessoas?.partes.expressao ?? null,
      nitidezDoRosto: pessoas?.partes.nitidez ?? null,
      tetos,
      protegida,
      exposicaoPeloRaw: exposicao.peloRaw,
    },
  }
}

// ───────────────────────────── cobertura ─────────────────────────────

/**
 * Proteção de cobertura sobre o ensaio inteiro. `magnitudes` = Map (ou objeto) de id → Magnitude; `grupos` = o que
 * agrupar() devolveu; `ids` = todas as fotos (as que não estão em grupo nenhum são momentos de uma foto só).
 * Se TODAS as fotos de um grupo caíram em "fora", a de maior nota sobe para "talvez"; foto sozinha em "fora" também.
 * Devolve um Map novo; as notas não mudam, só o balde e o motivo.
 */
export function protegerCobertura(magnitudes, grupos = [], ids = null) {
  const entrada = magnitudes instanceof Map ? magnitudes : new Map(Object.entries(magnitudes))
  const saida = new Map(entrada)
  const subir = (id, texto) => {
    const mg = saida.get(id)
    if (!mg || mg.balde !== 'fora') return
    saida.set(id, {
      ...mg,
      balde: 'talvez',
      motivos: [texto, ...mg.motivos.filter((t) => t !== texto)].slice(0, 3),
      detalhe: { ...mg.detalhe, protegida: true },
    })
  }
  const emGrupo = new Set()
  for (const g of grupos) {
    const membros = g.fotos.filter((id) => saida.has(id))
    for (const id of g.fotos) emGrupo.add(id)
    if (!membros.length || membros.some((id) => saida.get(id).balde !== 'fora')) continue
    const melhor = membros.reduce((a, id) => (saida.get(id).total > saida.get(a).total ? id : a))
    subir(melhor, MOTIVOS.unicaDoGrupo())
  }
  for (const id of ids ?? entrada.keys()) if (!emGrupo.has(id)) subir(id, MOTIVOS.unica())
  return saida
}

// ───────────────────────────── meta ao vivo ─────────────────────────────

/**
 * "Quero cerca de n": reordena as fotos por nota × novidade e devolve as n que ficam. Não reanalisa nada: usa a
 * nota que cada foto já tem e os grupos, então roda a cada arrasto do controle.
 * Novidade = o que a foto acrescenta ao que já foi escolhido: a melhor de um grupo vale inteira; a segunda de um
 * grupo de repetidas vale 25%, a de uma sequência 50%, a terceira o quadrado disso, e assim por diante. Assim cada
 * momento entra antes de qualquer repetida, e a repetida só entra quando a meta é maior que o número de momentos.
 * Como todas as que sobram de um grupo têm a mesma novidade, escolher sempre a de maior nota × novidade é o mesmo
 * que ordenar tudo por nota × fator^(posição no grupo): uma ordenação só.
 * `fotos` = [{ id, magnitude }]; `opcoes.grupos` = o que agrupar() devolveu (sem grupos, vale só a nota).
 * `opcoes.pessoas` = [{ id, fotos: [id] }], as pessoas-chave (agrupar por pessoa, só quando a pessoa ligou): a melhor
 * foto de cada uma (a primeira dela na ordem, que não esteja em Fora se houver outra) entra antes de tudo. Com mais
 * pessoas que a meta, ficam as das pessoas com a melhor foto.
 * Devolve { ficam: [id], saem: [id], ordem: [id], corte: nota da última que ficou } e, com pessoas, `garantidas: [id]`.
 */
export function meta(fotos, n, { grupos = null, pessoas = null } = {}) {
  const P = PARAMETROS.novidade
  const lista = (Array.isArray(fotos) ? fotos : [])
    .filter((f) => f && typeof f.magnitude?.total === 'number')
    .map((f, entrada) => ({ id: f.id, total: f.magnitude.total, balde: f.magnitude.baldeDaNota ?? f.magnitude.balde, entrada, valor: f.magnitude.total }))
  const porId = new Map(lista.map((f) => [f.id, f]))
  for (const g of grupos ?? []) {
    const fator = g.tipo === 'repetidas' ? P.repetidas : P.sequencia
    const membros = g.fotos.map((id) => porId.get(id)).filter(Boolean)
    membros.sort((a, b) => b.total - a.total || a.entrada - b.entrada)
    membros.forEach((f, posicao) => (f.valor = f.total * fator ** posicao))
  }
  lista.sort((a, b) => b.valor - a.valor || b.total - a.total || a.entrada - b.entrada)
  const ordem = lista.map((f) => f.id)
  const quantas = Math.max(0, Math.min(ordem.length, Math.round(n)))
  const posicao = new Map(ordem.map((id, i) => [id, i]))
  const garantidas = []
  for (const p of pessoas ?? []) {
    const dela = (p.fotos ?? []).filter((id) => posicao.has(id)).sort((a, b) => posicao.get(a) - posicao.get(b))
    const melhor = dela.find((id) => porId.get(id).balde !== 'fora') ?? dela[0]
    if (melhor != null && !garantidas.includes(melhor)) garantidas.push(melhor)
  }
  garantidas.sort((a, b) => posicao.get(a) - posicao.get(b))
  const ficam = garantidas.slice(0, quantas)
  const dentro = new Set(ficam)
  for (const id of ordem) {
    if (ficam.length >= quantas) break
    if (!dentro.has(id)) {
      ficam.push(id)
      dentro.add(id)
    }
  }
  ficam.sort((a, b) => posicao.get(a) - posicao.get(b))
  const ultima = ficam.length ? porId.get(ficam[ficam.length - 1]).total : null
  const r = { ficam, saem: ordem.filter((id) => !dentro.has(id)), ordem, corte: ultima }
  return pessoas ? { ...r, garantidas: garantidas.slice(0, quantas) } : r
}

// ───────────────────────────── aprendizado ─────────────────────────────

/**
 * Aprendizado simples e à vista. Cada troca é a pessoa dizendo "prefiro esta à que a nota escolheu":
 *   { cena?, preferida: componentes da foto que ela escolheu, preterida: componentes da que a nota tinha escolhido }
 * (`componentes` = magnitude.componentes; para aprender também a repartição do rosto, mande `detalhe` com
 * { olhos, nitidez, expressao } de 0 a 1 em `preferidaRosto` e `preteridaRosto`.)
 * Regra: o peso de cada componente é multiplicado por e^(taxa × diferença), diferença de −1 a 1. O que a preferida
 * tem a mais ganha peso; o que tem a menos, perde. Nenhum peso passa de metade ou do dobro do de fábrica, e a soma
 * de cada conjunto fica a mesma. Não muda teto nem regra: só a importância relativa.
 * Devolve { pesos, explicacao: [frases], zerar: frase }. Para zerar de verdade: pesosPadrao().
 */
export function ajustarPesos(pesos, trocas) {
  const P = PARAMETROS
  const fabrica = pesosPadrao()
  const novo = structuredClone(pesos ?? fabrica)
  const mover = (conjunto, a, bb, escala) => {
    for (const k of Object.keys(conjunto)) {
      const x = num(a?.[k])
      const y = num(bb?.[k])
      if (x == null || y == null) continue
      conjunto[k] *= Math.exp(P.taxa * limitar((x - y) / escala, -1, 1))
    }
  }
  const comGente = (t) => num(t.preferida?.pessoas) != null && num(t.preterida?.pessoas) != null
  for (const t of Array.isArray(trocas) ? trocas : []) {
    if (!t || !t.preferida || !t.preterida) continue
    mover(comGente(t) ? novo.pessoas : novo.demais, t.preferida, t.preterida, 100)
    if (t.preferidaRosto && t.preteridaRosto) mover(novo.rosto, t.preferidaRosto, t.preteridaRosto, 1)
  }
  const explicacao = []
  for (const nome of ['pessoas', 'demais', 'rosto']) {
    const base = fabrica[nome]
    const somaBase = Object.values(base).reduce((a, v) => a + v, 0)
    // primeiro o limite em relação ao de fábrica, depois a soma de volta ao que era
    for (const k of Object.keys(base)) novo[nome][k] = limitar(num(novo[nome][k]) ?? base[k], base[k] * P.pesoMinimo, base[k] * P.pesoMaximo)
    const soma = Object.keys(base).reduce((a, k) => a + novo[nome][k], 0)
    for (const k of Object.keys(base)) novo[nome][k] = (novo[nome][k] * somaBase) / soma
    let mais = null
    let menos = null
    for (const k of Object.keys(base)) {
      const razao = novo[nome][k] / base[k]
      if (razao > 1.03 && (!mais || razao > novo[nome][mais] / base[mais])) mais = k
      if (razao < 0.97 && (!menos || razao < novo[nome][menos] / base[menos])) menos = k
    }
    const frase = mais && menos ? APRENDIZADO.prioriza(mais, menos) : mais ? APRENDIZADO.soMais(mais) : null
    if (frase && !explicacao.includes(frase)) explicacao.push(frase)
  }
  if (!explicacao.length) explicacao.push(APRENDIZADO.semMudanca())
  return { pesos: novo, explicacao, zerar: APRENDIZADO.zerar() }
}

// ───────────────────────────── o ensaio inteiro ─────────────────────────────

// O que cada foto de um grupo precisa saber do grupo para ser avaliada.
function contextoDoGrupo(grupo, porId, dOlhos = 0) {
  const fotos = grupo.fotos.map((id) => porId.get(id)).filter(Boolean)
  // olhos fechados em todas: em cada foto com olhos lidos, TODAS as pessoas-chave estão de olhos fechados, e são
  // pelo menos duas fotos assim (uma só pode ser piscada)
  const estados = (f) =>
    pessoasChave(f.rostos)
      .chaves.map((r) => olhosComLimiar(r, dOlhos))
      .filter((o) => o in VALOR_DOS_OLHOS)
  const comOlhos = fotos.map(estados).filter((lidos) => lidos.length)
  const olhosFechadosEmTodas = comOlhos.length >= 2 && comOlhos.every((lidos) => lidos.every((o) => o === 'fechados'))
  // a mais nítida: só quando ganha da segunda por mais que o ruído da medida
  const focos = fotos.map((f) => ({ id: f.id, q: focoDaFoto(f).q })).filter((x) => x.q != null)
  focos.sort((a, b) => b.q - a.q)
  const maisNitida = focos.length >= 2 && focos[0].q - focos[1].q >= FOLGA_DE_NITIDEZ ? focos[0].id : null
  return (id) => ({ id: grupo.id, tipo: grupo.tipo, tamanho: grupo.fotos.length, olhosFechadosEmTodas, maisNitida: id === maisNitida })
}

/**
 * A decupagem de um ensaio, de ponta a ponta, sobre o que já foi medido (não relê pixel nenhum):
 * calibra a nitidez no ensaio → agrupa → avalia cada foto com o contexto do grupo → escolhe em cada grupo →
 * protege a cobertura.
 * `fotos` = [{ id, medidas, rostos?, cena?, exif?, latitude?, tipo?, vetor? }]; `opcoes` = as de avaliar().
 * Devolve { magnitudes: Map(id → Magnitude), grupos, referencia }.
 */
export function avaliarEnsaio(fotos, opcoes = {}) {
  const lista = (Array.isArray(fotos) ? fotos : []).filter((f) => f && f.medidas)
  const porId = new Map(lista.map((f) => [f.id, f]))
  const referencia = opcoes.referencia ?? calibrar(lista)
  const base = opcoes.grupos ?? agrupar(lista)
  const contexto = new Map()
  for (const g of base) {
    const ctx = contextoDoGrupo(g, porId, normalizarLimiares(opcoes.limiares).olhos)
    for (const id of g.fotos) contexto.set(id, ctx(id))
  }
  let magnitudes = new Map()
  for (const f of lista) magnitudes.set(f.id, avaliar({ ...f, grupo: contexto.get(f.id) }, { ...opcoes, referencia }))
  const grupos = base.map((g) => ({
    id: g.id,
    fotos: g.fotos,
    tipo: g.tipo,
    ...escolherNoGrupo(
      g.fotos.map((id) => ({ id, magnitude: magnitudes.get(id) })).filter((x) => x.magnitude),
      { margem: opcoes.margem ?? MARGEM_DE_ERRO },
    ),
  }))
  magnitudes = protegerCobertura(
    magnitudes,
    grupos,
    lista.map((f) => f.id),
  )
  return { magnitudes, grupos, referencia }
}
