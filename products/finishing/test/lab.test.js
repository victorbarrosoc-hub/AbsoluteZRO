import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AJUSTES,
  AJUSTES_NEUTROS,
  BOOST_PADRAO,
  GRUPOS,
  VERSAO_RECEITA,
  analisarFrame,
  centrosDasZonas,
  criarLab,
  escreverReceita,
  faixaDaEntrada,
  lerReceita,
} from '../src/cor/lab.js'
import { codigoParaOklab } from '../src/cor/oklab.js'
import { criarMotor, perfilDe, pesosHsl } from '../src/cor/pelicula.js'
import { criarTela } from '../src/cor/cena.js'

const distancia = (x, y) => Math.hypot(...x.map((v, i) => v - y[i]))

test('Lab: intensidade 0 sem ajustes devolve o still como veio (ida e volta da tela)', () => {
  const f = criarLab({ base: 'revela', intensidade: 0 }).aplicar
  for (const c of [
    [0.02, 0.02, 0.02],
    [0.5, 0.4, 0.3],
    [0.9, 0.9, 0.9],
    [0.2, 0.7, 0.9],
  ])
    assert.ok(distancia(f(...c), c) < 2e-3, `${c.join()} → ${f(...c).join()}`)
})

test('Lab: cada base tem nome, id único e muda o frame', () => {
  const ids = GRUPOS.flatMap((g) => g.looks.map((l) => l.id))
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(
    GRUPOS.map((g) => g.id),
    ['revela', 'pelicula', 'cinema', 'classicos'],
  )
  for (const id of ids) {
    const o = criarLab({ base: id }).aplicar(0.55, 0.45, 0.35)
    assert.ok(o.every((v) => v >= 0 && v <= 1))
    // o negativo escaneado (sem cópia) é sutil de propósito: mexe no pé, no ombro e na separação de cor
    assert.ok(distancia(o, [0.55, 0.45, 0.35]) > (id.endsWith('-scan') ? 0.002 : 0.01), id)
  }
})

test('Lab: Luz sobe o meio-tom, Temperatura esquenta, Cor -100 vira cinza, Desbotar abre o preto', () => {
  const L = (c) => codigoParaOklab(...c)[0]
  const base = { base: 'revela', intensidade: 0 }
  const cinza = [0.4, 0.4, 0.4]
  assert.ok(L(criarLab({ ...base, ajustes: { luz: 100 } }).aplicar(...cinza)) > L(cinza) + 0.05)
  assert.ok(codigoParaOklab(...criarLab({ base: 'pb', intensidade: 1, ajustes: {} }).aplicar(...cinza))[2] < 0.005)
  const quente = codigoParaOklab(...criarLab({ ...base, intensidade: 1, base: 'suave', ajustes: { temperatura: 100 } }).aplicar(...cinza))
  const neutro = codigoParaOklab(...criarLab({ ...base, intensidade: 1, base: 'suave' }).aplicar(...cinza))
  assert.ok(quente[2] > neutro[2] + 0.01, 'Temperatura devia esquentar')
  const sem = criarLab({ base: 'suave', ajustes: { cor: -100 } }).aplicar(0.7, 0.3, 0.2)
  assert.ok(Math.max(...sem) - Math.min(...sem) < 0.02, sem.join())
  const preto = criarLab({ base: 'suave' }).aplicar(0, 0, 0)[1]
  assert.ok(criarLab({ base: 'suave', ajustes: { desbotar: 100 } }).aplicar(0, 0, 0)[1] > preto + 0.02)
})

test('Lab: Pele protegida devolve a cor da pele de antes do look', () => {
  const pele = [0.78, 0.58, 0.47]
  const antes = codigoParaOklab(...pele)
  const com = codigoParaOklab(...criarLab({ base: 'nordico', ajustes: { pele: 100 } }).aplicar(...pele))
  const sem = codigoParaOklab(...criarLab({ base: 'nordico' }).aplicar(...pele))
  const hue = (o) => Math.atan2(o[2], o[1])
  const croma = (o) => Math.hypot(o[1], o[2])
  assert.ok(Math.abs(croma(com) - croma(antes)) < Math.abs(croma(sem) - croma(antes)) || Math.abs(hue(com) - hue(antes)) < Math.abs(hue(sem) - hue(antes)))
})

test('Analisar e corrigir: frame escuro e azulado → sobe exposição e esquenta o branco', () => {
  const px = new Float32Array(3 * 4000)
  for (let i = 0; i < px.length; i += 3) {
    const v = 0.1 + ((i / 3) % 50) / 250
    px[i] = v * 0.9
    px[i + 1] = v
    px[i + 2] = v * 1.12
  }
  const c = analisarFrame(px, { passo: 1 })
  assert.ok(c.exposicao > 0.5, `exposição ${c.exposicao}`)
  assert.ok(c.ganhos && c.ganhos[0] > c.ganhos[2], 'branco devia esquentar')
  assert.match(c.leitura, /stop.*branco mais quente/)
  // corrigido, o cinza azulado do frame fica mais neutro
  const f = criarLab({ base: 'revela', intensidade: 0, correcao: c }).aplicar
  const [, a, b] = codigoParaOklab(...f(0.3 * 0.9, 0.3, 0.3 * 1.12))
  const [, a0, b0] = codigoParaOklab(0.3 * 0.9, 0.3, 0.3 * 1.12)
  assert.ok(Math.hypot(a, b) < Math.hypot(a0, b0))
})

// frame sintético na luz da cena (cinzas DWG em stops sobre o cinza 18%), levado ao código Rec.709 pela tela da Revela
const telaTeste = criarTela('rec709')
function frameDeCinzas(stops) {
  const px = new Float32Array(3 * stops.length)
  stops.forEach((s, k) => px.set(telaTeste.aplicar([1, 1, 1].map(() => 0.18 * 2 ** s)), 3 * k))
  return px
}

test('Analisar e corrigir: frame cinza neutro não ganha correção de branco (branco de referência nos cones)', () => {
  // antes, comparar os cones com a média deles dava "branco mais quente · menos verde" num cinza perfeito
  const stops = Array.from({ length: 6000 }, (_, i) => -1.5 + (i % 60) / 20)
  const c = analisarFrame(frameDeCinzas(stops), { passo: 1 })
  assert.ok(c.ganhos, 'frame neutro tem neutros de sobra')
  for (const g of c.ganhos) assert.ok(Math.abs(g - 1) < 0.005, `ganhos ${c.ganhos.join()}`)
  assert.doesNotMatch(c.leitura, /branco mais|verde|magenta/)
})

test('Analisar e corrigir: cena escura de propósito (palco, arena) não sobe; cena clara escurece pouco', () => {
  // palco: 93% do quadro 3 a 4 stops abaixo do cinza, o assunto iluminado (7%) meio stop acima. O meio-tom pediria
  // +1,5 stop; o assunto só pode subir até 0,75 stop sobre o cinza (antes, com o percentil 90, subia o quadro todo)
  const palco = Array.from({ length: 6000 }, (_, i) => (i % 100 < 7 ? 0.5 : -4 + (i % 7) / 7))
  assert.ok(analisarFrame(frameDeCinzas(palco), { passo: 1 }).exposicao <= 0.25 + 1e-6)
  // estúdio claro: meio-tom 1,5 stop acima do cinza escurece no máximo 0,4 stop
  const estudio = Array.from({ length: 6000 }, (_, i) => 1 + (i % 50) / 50)
  const e = analisarFrame(frameDeCinzas(estudio), { passo: 1 }).exposicao
  assert.ok(e < 0 && e >= -0.4, `exposição ${e}`)
  // subexposto de verdade (tudo 2 stops abaixo, inclusive as altas) ainda sobe mais de 1 stop
  const escuro = Array.from({ length: 6000 }, (_, i) => -3 + (i % 50) / 25)
  assert.ok(analisarFrame(frameDeCinzas(escuro), { passo: 1 }).exposicao > 1)
})

test('Analisar e corrigir: níveis assentam o preto lavado e abrem o branco (não em cena escura); o cinza fica', () => {
  // frame lavado: sombra mais funda a só -2,2 stops, alta a +2,2 stops, meio-tom no cinza (não é cena escura)
  const stops = Array.from({ length: 6000 }, (_, i) => -2.2 + (i % 90) / 20)
  const c = analisarFrame(frameDeCinzas(stops), { passo: 1 })
  assert.ok(c.contraste[0] > 1.2, `contraste da sombra ${c.contraste}`)
  assert.ok(c.contraste[1] > 1.3, `contraste da alta ${c.contraste}`)
  // a cor automática está desligada desde a calibração no cinema (a cópia dá a densidade de cor)
  assert.equal(c.saturacao, 1)
  assert.match(c.leitura, /preto assentado.*branco aberto/)
  // cena escura de propósito (meio-tom 2 stops abaixo do cinza): menos contraste nas duas pontas
  const escura = analisarFrame(frameDeCinzas(Array.from({ length: 6000 }, (_, i) => -4 + (i % 90) / 30)), { passo: 1 })
  assert.ok(escura.contraste[1] < 1 && escura.contraste[0] <= 1.1, `cena escura: ${escura.contraste}`)
  // o cinza não sai do lugar e a curva sempre sobe (sem degrau)
  const f = criarLab({ base: 'neutro', boost: 0, correcao: { exposicao: 0, ganhos: null, contraste: [1.4, 1.4], saturacao: 1, sombraFria: 0 } }).aplicar
  const g = criarLab({ base: 'neutro', boost: 0 }).aplicar
  const cinza = telaTeste.aplicar([0.18, 0.18, 0.18])
  assert.ok(distancia(f(...cinza), g(...cinza)) < 2e-3)
  let antes = -1
  for (let v = 0.01; v <= 1; v += 0.01) {
    const y = f(v, v, v)[1]
    assert.ok(y >= antes - 1e-6, `desceu em ${v}`)
    antes = y
  }
  // a sombra fica mais funda que sem níveis e a alta mais aberta
  assert.ok(f(0.08, 0.08, 0.08)[1] < g(0.08, 0.08, 0.08)[1])
  assert.ok(f(0.7, 0.7, 0.7)[1] > g(0.7, 0.7, 0.7)[1])
})

test('Receita .revela: leva os níveis do Analisar; receita antiga abre sem eles', () => {
  const r = lerReceita(escreverReceita({ base: 'revela', correcao: { exposicao: 0.3, ganhos: [1, 1, 1], contraste: [1.3, 9], saturacao: 1.4, sombraFria: 2 } }))
  assert.deepEqual(r.correcao.contraste, [1.3, 1.4])
  assert.equal(r.correcao.saturacao, 1.4)
  assert.equal(r.correcao.sombraFria, 2)
  const velha = lerReceita(escreverReceita({ base: 'revela', correcao: { exposicao: 0.3, ganhos: null } }))
  assert.equal(velha.correcao.contraste, undefined)
})

test('Lab: frame em log de câmera entra pela câmera (S-Log3 cinza → cinza na tela)', () => {
  // cinza 18% em S-Log3 é o código 0,41; com o look neutro (intensidade 0) a tela mostra o cinza da curva (≈0,38)
  const o = criarLab({ base: 'revela', intensidade: 0, entrada: 'sony-slog3-cine' }).aplicar(0.41, 0.41, 0.41)
  assert.ok(Math.abs(o[0] - 0.383) < 0.02 && Math.max(...o) - Math.min(...o) < 0.01, o.join())
})

test('Lab: a cópia de cinema é uma escolha da receita (da base, nenhuma ou outra)', () => {
  const c = [0.55, 0.42, 0.33]
  // "Cópia 2383" sem a cópia é o perfil neutro: o still volta como veio
  assert.ok(distancia(criarLab({ base: 'copia-2383', copia: 'nenhuma' }).aplicar(...c), c) < 2e-3)
  const da2383 = criarLab({ base: 'copia-2383' }).aplicar(...c)
  assert.ok(distancia(da2383, c) > 0.01)
  // (o Revela Look já nasce da 2383; a troca de cópia num look sem cópia usa o Suave)
  assert.ok(distancia(criarLab({ base: 'suave', copia: '2383' }).aplicar(...c), criarLab({ base: 'suave' }).aplicar(...c)) > 0.01)
  assert.ok(distancia(criarLab({ base: 'copia-2383', copia: '3513' }).aplicar(...c), da2383) > 0.005)
})

test('Receita .revela: ida e volta, valores fora do limite voltam para o limite, lixo é recusado, versão 1 abre', () => {
  const r = lerReceita(
    escreverReceita({ nome: 'Meu filme', entrada: 'arri-logc4', base: 'negativo-500t', copia: '2393', intensidade: 0.8, ajustes: { calor: 60, luz: 999 } }),
  )
  assert.equal(r.nome, 'Meu filme')
  assert.equal(r.entrada, 'arri-logc4')
  assert.equal(r.base, 'negativo-500t')
  assert.equal(r.copia, '2393')
  assert.equal(lerReceita(escreverReceita({ base: 'revela', copia: 'kodak' })).copia, '')
  assert.equal(r.intensidade, 0.8)
  assert.equal(r.ajustes.calor, 60)
  assert.equal(r.ajustes.luz, 100)
  assert.equal(Object.keys(r.ajustes).length, AJUSTES.length)
  assert.equal(lerReceita(escreverReceita({ base: 'nao-existe' })).base, 'revela')
  assert.throws(() => lerReceita('{"a":1}'), /Não é uma receita/)
  assert.throws(() => lerReceita('oi'), /Não é uma receita/)
  assert.throws(() => lerReceita('{"revela":"lab","versao":99}'), /mais nova/)
  const v1 = lerReceita('{"revela":"lab","versao":1,"nome":"Antiga","base":"anos-70","correcao":{"exposicao":0.5,"branco":[0.01,0.02]},"ajustes":{"cor":20}}')
  assert.deepEqual([v1.base, v1.entrada, v1.ajustes.cor, v1.correcao.exposicao, v1.correcao.ganhos], ['anos-70', 'still', 20, 0.5, null])
  // a versão 2 não tinha cópia: abre com a cópia da base
  assert.equal(lerReceita('{"revela":"lab","versao":2,"base":"revela"}').copia, '')
})

test('receita: o Boost vem ligado em 50, vai e volta no .revela e as receitas antigas abrem sem ele', () => {
  assert.equal(VERSAO_RECEITA, 6)
  assert.equal(BOOST_PADRAO, 50)
  assert.equal(criarLab({ base: '250d-2383' }).receita.boost, 50)
  assert.equal(criarLab({ base: '250d-2383' }).motor.boost, 0.5)
  assert.equal(lerReceita(escreverReceita({ base: '250d-2383', boost: 80 })).boost, 80)
  assert.equal(lerReceita(escreverReceita({ base: '250d-2383', boost: 300 })).boost, 100)
  assert.equal(lerReceita(escreverReceita({ base: '250d-2383' })).boost, 50)
  // até a v4 não havia Boost: o look salvo continua o mesmo
  assert.equal(lerReceita('{"revela":"lab","versao":4,"base":"250d-2383"}').boost, 0)
})

test('receita v6: o acabamento da cópia vem ligado; as receitas até a v5 abrem sem ele e com o Estilo e a Densidade antigos', () => {
  const nova = criarLab({ base: '250d-2383' })
  assert.equal(nova.motor.acabamento, 1)
  // a v5 com Estilo e Densidade: abre como era (sem acabamento, com os dois ajustes do jeito antigo)
  const v5 = lerReceita('{"revela":"lab","versao":5,"base":"250d-2383","boost":50,"ajustes":{"estilo":40,"densidade":60}}')
  assert.deepEqual(v5.legado, { estilo: 40, densidade: 60 })
  assert.equal(v5.ajustes.densidade, 0)
  const lab = criarLab(v5)
  assert.equal(lab.motor.acabamento, 0)
  const antigo = criarMotor(perfilDe('250d-2383'), { boost: 50, estilo: 0.4, densidadeLegado: 0.6, acabamento: 0 })
  for (const x of [[0.18, 0.18, 0.18], [0.3, 0.15, 0.08], [0.05, 0.12, 0.3]]) assert.deepEqual(lab.motor.emCena(x), antigo.emCena(x))
  // e continua antiga quando é salva de novo
  assert.deepEqual(lerReceita(escreverReceita(v5)).legado, v5.legado)
  // os ajustes novos vão e voltam
  const r = lerReceita(escreverReceita({ base: '250d-2383', ajustes: { separacao: -30, era: 50, pretoNeutro: 80, densidade: -40 } }))
  assert.deepEqual([r.ajustes.separacao, r.ajustes.era, r.ajustes.pretoNeutro, r.ajustes.densidade], [-30, 50, 80, -40])
  assert.equal(r.legado, undefined)
})

test('Revela Look: branco e cinza claro saem neutros (sem o amarelado do look antigo)', () => {
  const f = criarLab({ base: 'revela' }).aplicar
  for (const v of [0.6, 0.75, 0.9]) {
    const [, a, b] = codigoParaOklab(...f(v, v, v))
    assert.ok(Math.abs(b) < 0.006 && Math.abs(a) < 0.004, `cinza ${v}: a ${a.toFixed(4)} b ${b.toFixed(4)}`)
  }
})

test('Exposição HDR por zonas: zero não muda nada; cada zona age na sua faixa; a luz nunca inverte', () => {
  const g = criarLab({ base: 'neutro', boost: 0 }).aplicar
  const zero = criarLab({ base: 'neutro', boost: 0, ajustes: { hdrClaros: 0 } }).aplicar
  for (const v of [0.05, 0.38, 0.8]) assert.ok(distancia(zero(v, v, v), g(v, v, v)) < 1e-9)
  // claros +100: o cinza claro (+1,5 stop, ~0,57 na tela) sobe bem mais que o cinza (0,38) e a sombra (0,1)
  const c = criarLab({ base: 'neutro', boost: 0, ajustes: { hdrClaros: 100 } }).aplicar
  const sobe = (v) => c(v, v, v)[1] - g(v, v, v)[1]
  assert.ok(sobe(0.57) > 0.04 && sobe(0.57) > 2 * Math.abs(sobe(0.1)), `claros: ${sobe(0.57)} / ${sobe(0.1)}`)
  // zonas vizinhas em sentidos opostos e no máximo: a curva continua subindo
  const extremo = criarLab({ base: 'neutro', boost: 0, ajustes: { hdrEscuros: 100, hdrSombras: -100, hdrClaros: 100, hdrAltas: -100, hdrEspecular: 100 } }).aplicar
  let antes = -1
  for (let v = 0.005; v <= 1; v += 0.005) {
    const y = extremo(v, v, v)[1]
    assert.ok(y >= antes - 1e-6, `desceu em ${v.toFixed(3)}`)
    antes = y
  }
})

test('saturação subtrativa (controle do motor): a cor forte fica mais escura que sem ela, e a luz forte não', () => {
  const com = criarMotor({ ...perfilDe('revela'), subtrativa: 0.3 }, { boost: 50 })
  const sem = criarMotor({ ...perfilDe('revela'), subtrativa: 0 }, { boost: 50 })
  const Y = (v) => 0.2627 * v[0] + 0.678 * v[1] + 0.0593 * v[2]
  const vermelho = [0.2, 0.05, 0.04] // cor forte de meio-tom
  assert.ok(Y(com.emCena(vermelho)) < Y(sem.emCena(vermelho)) * 0.97, 'vermelho mais denso')
  const luz = [3, 1.6, 0.6] // luz prática laranja, 4 stops acima do cinza
  assert.ok(Y(com.emCena(luz)) > Y(sem.emCena(luz)) * 0.98, 'a luz continua luz')
})

// ─────────── painel de cor (05/11/2026): densidade, subtrativa, HSL e zonas pela faixa do arquivo ───────────

const okDe = (f, c) => codigoParaOklab(...f(...c))
const croma = (o) => Math.hypot(o[1], o[2])
const NEUTROS = { ...AJUSTES_NEUTROS }
const comAjustes = (aj, extra = {}) => criarLab({ base: 'revela', ...extra, ajustes: { ...NEUTROS, ...aj } }).aplicar

test('painel de cor: tudo no ponto de partida não muda o look (os limitadores só agem com a densidade)', () => {
  const g = criarLab({ base: 'revela' }).aplicar
  const f = comAjustes({})
  for (const c of [[0.4, 0.4, 0.4], [0.6, 0.2, 0.18], [0.25, 0.5, 0.2], [0.62, 0.45, 0.36]]) assert.ok(distancia(f(...c), g(...c)) < 1e-9)
  assert.equal(AJUSTES_NEUTROS.poupaFraca, 20)
  assert.equal(AJUSTES_NEUTROS.protegePele, 80)
})

test('densidade de película: cor saturada mais escura com a mesma saturação; cinza, pele e preto ficam', () => {
  const g = comAjustes({})
  const f = comAjustes({ densidadeFilme: 100 })
  const vermelho = [0.6, 0.2, 0.18]
  const a = okDe(g, vermelho)
  const b = okDe(f, vermelho)
  assert.ok(b[0] < a[0] - 0.02, `vermelho mais denso: L ${a[0].toFixed(3)} → ${b[0].toFixed(3)}`)
  // saturação (croma ÷ luz) quase igual: a cor não lava nem vira neon
  assert.ok(Math.abs(croma(b) / b[0] - croma(a) / a[0]) < 0.06)
  assert.ok(distancia(f(0.4, 0.4, 0.4), g(0.4, 0.4, 0.4)) < 1e-6, 'cinza parado')
  assert.ok(Math.abs(okDe(f, [0.62, 0.45, 0.36])[0] - okDe(g, [0.62, 0.45, 0.36])[0]) < 0.006, 'pele protegida')
  // peso do vermelho acima de 1: o vermelho fica mais denso que com o peso neutro
  const pesado = okDe(comAjustes({ densidadeFilme: 100, pesoVermelho: 80 }), vermelho)
  assert.ok(pesado[0] < b[0], `peso do vermelho: ${pesado[0].toFixed(3)} < ${b[0].toFixed(3)}`)
  // a luz nunca sobe com a densidade, em nenhuma cor da grade
  for (let r = 0; r <= 1; r += 0.25)
    for (let gg = 0; gg <= 1; gg += 0.25)
      for (let bb = 0; bb <= 1; bb += 0.25) assert.ok(okDe(f, [r, gg, bb])[0] <= okDe(g, [r, gg, bb])[0] + 2e-3, `subiu em ${[r, gg, bb]}`)
})

test('saturação subtrativa no painel: a cor forte escurece e ganha cheio; 0 desliga', () => {
  const g = comAjustes({})
  const f = comAjustes({ subtrativa: 60 })
  const verde = [0.25, 0.5, 0.2]
  assert.ok(okDe(f, verde)[0] < okDe(g, verde)[0] - 0.02)
  assert.ok(distancia(f(0.4, 0.4, 0.4), g(0.4, 0.4, 0.4)) < 1e-3, 'cinza parado')
})

test('HSL de seis vetores: cada vetor age na sua cor, o vizinho distante não muda e o neutro fica', () => {
  const g = comAjustes({})
  const azul = [0.2, 0.3, 0.6]
  const vermelho = [0.6, 0.2, 0.18]
  const sat = comAjustes({ hslAzulSat: -100 })
  assert.ok(croma(okDe(sat, azul)) < croma(okDe(g, azul)) * 0.4, 'azul sem cor')
  assert.ok(distancia(sat(...vermelho), g(...vermelho)) < 1e-6, 'vermelho intocado')
  assert.ok(distancia(sat(0.4, 0.4, 0.4), g(0.4, 0.4, 0.4)) < 1e-6, 'cinza intocado')
  const luz = comAjustes({ hslVermelhoLuz: -100 })
  assert.ok(okDe(luz, vermelho)[0] < okDe(g, vermelho)[0] - 0.03, 'vermelho mais escuro')
  const matiz = comAjustes({ hslVermelhoMatiz: 20 })
  const h = (o) => (Math.atan2(o[2], o[1]) * 180) / Math.PI
  assert.ok(h(okDe(matiz, vermelho)) > h(okDe(g, vermelho)) + 5, 'vermelho gira para o laranja')
  // os pesos somam 1 em todo o círculo e passam sem degrau de um vetor ao outro
  let antes = pesosHsl(0)
  for (let x = 0.5; x <= 360; x += 0.5) {
    const w = pesosHsl(x)
    assert.ok(Math.abs(w.reduce((s, v) => s + v, 0) - 1) < 1e-9)
    assert.ok(Math.max(...w.map((v, i) => Math.abs(v - antes[i]))) < 0.05, `degrau em ${x}°`)
    antes = w
  }
})

test('zonas HDR pela faixa do arquivo: o Especular cai no brilho deste arquivo; sem faixa, os centros padrão', () => {
  assert.deepEqual(centrosDasZonas(null), [-6, -4, -2, 1.5, 3.5, 5.5])
  const largo = centrosDasZonas([-8.6, 6.9])
  assert.ok(Math.abs(largo[0] + 7.9) < 0.1 && Math.abs(largo[5] - 6.4) < 0.1, `RED: ${largo}`)
  const estreito = centrosDasZonas([-4, 3])
  assert.ok(estreito[5] < 3 && estreito[0] > -4)
  // num still estreito, o Especular +100 sobe o branco do arquivo (+2,8 stops), e não o que ele não tem (+5,5)
  const tela = criarTela('rec709')
  const codigo = (s) => tela.aplicar([0.18 * 2 ** s, 0.18 * 2 ** s, 0.18 * 2 ** s])
  const comFaixa = criarLab({ base: 'neutro', boost: 0, faixaHdr: [-4, 3], ajustes: { hdrEspecular: 100 } }).aplicar
  const semFaixa = criarLab({ base: 'neutro', boost: 0, ajustes: { hdrEspecular: 100 } }).aplicar
  const neutro = criarLab({ base: 'neutro', boost: 0 }).aplicar
  const c = codigo(2.8)
  assert.ok(comFaixa(...c)[1] - neutro(...c)[1] > 2 * Math.abs(semFaixa(...c)[1] - neutro(...c)[1]))
  // e a curva continua subindo com as zonas apertadas e opostas
  const extremo = criarLab({ base: 'neutro', boost: 0, faixaHdr: [-3, 2], ajustes: { hdrPreto: 100, hdrEscuros: -100, hdrSombras: 100, hdrClaros: -100, hdrAltas: 100, hdrEspecular: -100 } }).aplicar
  let antes = -1
  for (let v = 0.005; v <= 1; v += 0.005) {
    const y = extremo(v, v, v)[1]
    assert.ok(y >= antes - 1e-6, `desceu em ${v.toFixed(3)}`)
    antes = y
  }
})

test('Analisar mede a faixa do arquivo dentro do que a curva guarda; a receita leva a faixa', () => {
  const stops = Array.from({ length: 6000 }, (_, i) => -5 + (i % 100) / 10)
  const c = analisarFrame(frameDeCinzas(stops), { passo: 1 })
  assert.ok(Math.abs(c.faixa[0] + 5) < 0.3 && Math.abs(c.faixa[1] - 4.9) < 0.3, `faixa ${c.faixa}`)
  const [piso, teto] = faixaDaEntrada('red-log3g10')
  assert.ok(piso < -10 && teto > 9, `Log3G10: ${piso} a ${teto}`)
  assert.ok(faixaDaEntrada('canon-clog')[1] < 6)
  const r = lerReceita(escreverReceita({ base: 'revela', faixaHdr: [-8.6, 6.9], ajustes: { densidadeFilme: 70, hslVermelhoMatiz: 6 } }))
  assert.deepEqual(r.faixaHdr, [-8.6, 6.9])
  assert.equal(r.ajustes.densidadeFilme, 70)
  assert.equal(r.ajustes.hslVermelhoMatiz, 6)
  // receita de antes do painel: os limitadores abrem no padrão, a faixa fica de fora
  const velha = lerReceita(JSON.stringify({ revela: 'lab', versao: 6, base: 'revela', ajustes: { luz: 10 } }))
  assert.equal(velha.ajustes.protegePele, 80)
  assert.equal(velha.faixaHdr, null)
})
