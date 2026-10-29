// Revela · controle de qualidade de um look, como um colorista e um engenheiro de imagem conferem um pack antes de
// entregar: o cinza continua cinza (ou só com o tom pedido), a luz sobe sem dobrar, nada quebra em degrau, a pele não
// muda de matiz quando a exposição muda, a cor fora do gamut não vira lixo e a LUT assada bate com a conta exata.
// Cada verificação tem um limite; o look só sai da Revela se passar em todas. O relatório vai junto com o pack.

import { aplicarTetra, assar } from './cube.js'
import { CURVAS, matrizGamut } from './espacos.js'
import { criarTela, diParaLinear, linearParaDi } from './cena.js'
import { linearParaOklab } from './oklab.js'
import { copiaDe } from './copia.js'

const mul = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]
const GRAU = 180 / Math.PI
const REC709_DWG = matrizGamut('rec709', 'dwg')
const srgbParaLinear = CURVAS.srgb.paraLinear

/**
 * ColorChecker (24 cores, valores sRGB 8 bits publicados para o D65) em luz da cena DWG, com o cinza N5 em ~0,19:
 * as cores de referência que todo colorista usa para ver o que um look faz com pele, céu, folha e as primárias.
 */
const CARTELA_SRGB = {
  'pele escura': [115, 82, 68],
  'pele clara': [194, 150, 130],
  céu: [98, 122, 157],
  folhagem: [87, 108, 67],
  'flor azul': [133, 128, 177],
  'verde-azulado': [103, 189, 170],
  laranja: [214, 126, 44],
  'azul arroxeado': [80, 91, 166],
  'vermelho moderado': [193, 90, 99],
  roxo: [94, 60, 108],
  'verde-amarelo': [157, 188, 64],
  'amarelo-laranja': [224, 163, 46],
  azul: [56, 61, 150],
  verde: [70, 148, 73],
  vermelho: [175, 54, 60],
  amarelo: [231, 199, 31],
  magenta: [187, 86, 149],
  ciano: [8, 133, 161],
  branco: [243, 243, 242],
  'neutro 8': [200, 200, 200],
  'neutro 6.5': [160, 160, 160],
  'neutro 5': [122, 122, 121],
  'neutro 3.5': [85, 85, 85],
  preto: [52, 52, 52],
}
export const CARTELA = Object.fromEntries(
  Object.entries(CARTELA_SRGB).map(([nome, c]) => [nome, mul(REC709_DWG, c.map((v) => srgbParaLinear(v / 255)))]),
)

/** Código da tela (Rec.709, gama 2,4) → Oklab da luz que a tela mostra. */
const telaParaOklab = (c) => linearParaOklab(...c.map((v) => Math.max(0, v) ** 2.4))
const croma = (lab) => Math.hypot(lab[1], lab[2])
const matiz = (lab) => ((Math.atan2(lab[2], lab[1]) * GRAU + 360) % 360)
const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
const fixo = (v, n = 3) => Number(v.toFixed(n))

/** Gerador de números fixo (os testes saem iguais a cada vez). */
function sorteio(semente = 7) {
  let s = semente >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Confere um look. `motor`: { emCena([r,g,b]) DWG linear → DWG linear } (src/cor/pelicula.js · criarMotor).
 * `opcoes`: { tingeMax (croma Oklab máximo no cinza, padrão 0,035), peleMax (graus; padrão 7, ou o da cópia de
 * cinema), veu (o look levanta o preto de propósito), pb (preto e branco) }. Devolve { ok, verificacoes: [{ id, nome, valor, limite, ok, detalhe }], cartela }.
 */
export function avaliarLook(motor, opcoes = {}) {
  const tela = criarTela('rec709')
  const ver = (x) => tela.aplicar(motor.emCena(x))
  const verificacoes = []
  const conferir = (id, nome, valor, limite, ok, detalhe = '') => verificacoes.push({ id, nome, valor: fixo(valor), limite, ok, detalhe })

  // 1. eixo neutro: cinza de -4 a +4 stops sai com pouca cor (o tom do look pode existir, mas contido)
  const tingeMax = opcoes.tingeMax ?? 0.035
  // com cópia de cinema, o limite declarado da cópia (src/cor/copia.js)
  const peleMax = opcoes.peleMax ?? (motor.copia ? (copiaDe(motor.copia)?.peleMax ?? 7) : 7)
  let maiorTinge = 0
  let ondeTinge = 0
  for (let s = -4; s <= 4; s += 0.25) {
    const x = 0.18 * 2 ** s
    const c = croma(telaParaOklab(ver([x, x, x])))
    if (c > maiorTinge) [maiorTinge, ondeTinge] = [c, s]
  }
  conferir('neutro', 'Cinza continua cinza', maiorTinge, tingeMax, maiorTinge <= tingeMax, `maior cor no cinza: ${fixo(ondeTinge, 2)} stops`)

  // 2. luz que sobe sem dobrar: rampa de cinza de -10 a +10 stops, luminância da tela nunca desce
  let desce = 0
  let antes = -Infinity
  for (let s = -10; s <= 10; s += 1 / 16) {
    const x = 0.18 * 2 ** s
    const L = telaParaOklab(ver([x, x, x]))[0]
    desce = Math.max(desce, antes - L)
    antes = L
  }
  conferir('monotonia', 'A luz sobe sem dobrar', desce, 1e-6, desce <= 1e-6, 'maior descida na rampa de cinza')

  // 3. sem degrau: rampas finas em DI (cinza, e do cinza até cada cor saturada) sem quebra de derivada. Mede a mudança
  // de inclinação de um passo para o outro, na escala da faixa que o canal percorre, com 512 e com 1024 passos: numa
  // curva suave ela cai pela metade quando os passos dobram; num bico ela fica. A quebra é 2·(1024) − (512).
  const rampas = {
    cinza: (t) => [t, t, t],
    vermelho: (t) => [0.42 + 0.3 * t, 0.42 - 0.12 * t, 0.42 - 0.12 * t],
    verde: (t) => [0.42 - 0.12 * t, 0.42 + 0.25 * t, 0.42 - 0.12 * t],
    azul: (t) => [0.42 - 0.12 * t, 0.42 - 0.08 * t, 0.42 + 0.3 * t],
    pele: (t) => [0.42 + 0.12 * t, 0.42 + 0.02 * t, 0.42 - 0.06 * t],
    céu: (t) => [0.42 - 0.08 * t, 0.42 + 0.02 * t, 0.42 + 0.14 * t],
    luz: (t) => [0.15 + 0.85 * t, 0.12 + 0.8 * t, 0.1 + 0.75 * t],
  }
  function quebras(N) {
    const mapa = new Map() // "rampa/canal/posição em 1/512" → maior quebra ali
    for (const [nome, f] of Object.entries(rampas)) {
      const saida = []
      for (let i = 0; i <= N; i++) saida.push(motor.emCena(f(i / N).map(diParaLinear)).map(linearParaDi))
      for (let k = 0; k < 3; k++) {
        const valores = saida.map((o) => o[k])
        const faixa = Math.max(0.05, Math.max(...valores) - Math.min(...valores))
        for (let i = 2; i <= N; i++) {
          const q = (Math.abs(valores[i] - 2 * valores[i - 1] + valores[i - 2]) * N) / faixa
          const chave = `${nome}/${k}/${Math.round(((i - 1) / N) * 512)}`
          mapa.set(chave, Math.max(mapa.get(chave) ?? 0, q))
        }
      }
    }
    return mapa
  }
  const q512 = quebras(512)
  const q1024 = quebras(1024)
  let pior = 0
  let ondePior = ''
  for (const [chave, q] of q1024) {
    const quebra = 2 * q - (q512.get(chave) ?? 0)
    if (quebra > pior) {
      pior = quebra
      const [nome, k, pos] = chave.split('/')
      ondePior = `${nome}, canal ${'RGB'[k]}, ${fixo(pos / 512, 3)}`
    }
  }
  conferir('suavidade', 'Sem degrau nem quebra', pior, 0.25, pior <= 0.25, `maior quebra: ${ondePior}`)

  // 4. pele estável: pele clara e escura de -2 a +2 stops mantém o matiz (graus Oklab) e fica no lugar da pele
  if (!opcoes.pb) {
    let espalha = 0
    let foraDoLugar = 0
    for (const nome of ['pele clara', 'pele escura']) {
      const hs = []
      for (let s = -2; s <= 2; s += 0.5) {
        const lab = telaParaOklab(ver(CARTELA[nome].map((v) => v * 2 ** s)))
        if (croma(lab) > 0.015) hs.push(matiz(lab)) // quase sem cor, o matiz não diz nada
      }
      const meio = hs[hs.length >> 1] ?? 58
      // em volta do meio, sem pular de 359° para 0°
      const desvios = hs.map((h) => ((((h - meio) % 360) + 540) % 360) - 180)
      espalha = Math.max(espalha, Math.max(0, ...desvios) - Math.min(0, ...desvios))
      foraDoLugar = Math.max(foraDoLugar, meio < 35 ? 35 - meio : meio > 80 ? meio - 80 : 0)
    }
    conferir('pele', 'Pele estável na exposição', espalha, peleMax, espalha <= peleMax, 'variação do matiz da pele de -2 a +2 stops (graus)')
    conferir('pele-lugar', 'Pele no lugar da pele', foraDoLugar, 0, foraDoLugar === 0, 'matiz da pele entre 35° e 80°')
  }

  // 5. latitude: preto fundo (-8 stops) e branco que chega (+7 stops)
  const preto = ver([0.18 * 2 ** -8, 0.18 * 2 ** -8, 0.18 * 2 ** -8])[1]
  const branco = ver([0.18 * 2 ** 7, 0.18 * 2 ** 7, 0.18 * 2 ** 7])[1]
  const limitePreto = opcoes.veu ? 0.16 : 0.09
  conferir('preto', 'Preto no lugar', preto, limitePreto, preto <= limitePreto, 'código da tela a -8 stops')
  conferir('branco', 'Branco que chega', branco, 0.86, branco >= 0.86, 'código da tela a +7 stops')

  // 6. gamut: cor qualquer (até fora de todos os gamuts) sai finita e dentro da faixa, nos dois lados
  const sorte = sorteio(11)
  let foraDi = 0
  let ruins = 0
  for (let i = 0; i < 3000; i++) {
    const di = [sorte() * 1.1 - 0.05, sorte() * 1.1 - 0.05, sorte() * 1.1 - 0.05]
    const o = motor.emCena(di.map(diParaLinear)).map(linearParaDi)
    const t = tela.aplicar(motor.emCena(di.map(diParaLinear)))
    if (![...o, ...t].every(Number.isFinite)) ruins++
    if (o.some((v) => v < -0.06 || v > 1.12)) foraDi++
    if (t.some((v) => v < 0 || v > 1)) ruins++
  }
  conferir('gamut', 'Cor extrema não quebra', ruins + foraDi, 0, ruins + foraDi === 0, `${ruins} saídas inválidas, ${foraDi} fora da faixa DI`)

  // 7. a LUT assada (65, tetraédrica, DI → DI) bate com a conta exata
  const lut = assar((r, g, b) => motor.emCena([r, g, b].map(diParaLinear)).map(linearParaDi), 65)
  let erroLut = 0
  const sorte2 = sorteio(23)
  for (let i = 0; i < 2000; i++) {
    const di = [sorte2(), sorte2(), sorte2()].map((v) => 0.05 + 0.75 * v)
    const exato = telaParaOklab(tela.aplicar(motor.emCena(di.map(diParaLinear))))
    const lido = telaParaOklab(tela.aplicar(aplicarTetra(lut, ...di).map(diParaLinear)))
    erroLut = Math.max(erroLut, deltaE(exato, lido))
  }
  // 0,012 em Oklab fica abaixo do que se vê (a diferença mínima visível é perto de 0,02)
  conferir('lut', 'LUT 65 igual à conta', erroLut, 0.012, erroLut <= 0.012, 'maior ΔE Oklab entre a LUT e o motor')

  // a cartela, para o relatório e para ver o que o look fez com cada cor
  const cartela = Object.fromEntries(
    Object.entries(CARTELA).map(([nome, x]) => {
      const lab = telaParaOklab(ver(x))
      return [nome, { L: fixo(lab[0]), croma: fixo(croma(lab)), matiz: fixo(matiz(lab), 1) }]
    }),
  )
  return { ok: verificacoes.every((v) => v.ok), verificacoes, cartela }
}

/** O relatório em texto, para ir junto com o pack (e para o terminal). */
export function relatorioEmTexto(nome, r) {
  const linhas = [`Revela · controle de qualidade · ${nome}`, r.ok ? 'Resultado: aprovado' : 'Resultado: reprovado', '']
  for (const v of r.verificacoes) linhas.push(`${v.ok ? 'ok  ' : 'FALHA'} ${v.nome}: ${v.valor} (limite ${v.limite}) ${v.detalhe}`)
  return linhas.join('\n') + '\n'
}
