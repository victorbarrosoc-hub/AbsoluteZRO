// O Lab como nó do Resolve (src/cor/dctl-lab.js). O teste lê o texto da DCTL, traduz para JavaScript (test/dctl-apoio.js)
// e compara com o motor: o nó tem que dar a mesma cor que a LUT do pacote, em qualquer look e com qualquer ajuste.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COPIAS } from '../src/cor/copia.js'
import { LOOKS_DO_NO, escreverDctlLab, lit, padroesDoNo } from '../src/cor/dctl-lab.js'
import { AJUSTES, criarLab } from '../src/cor/lab.js'
import { NEGATIVOS } from '../src/cor/negativos.js'
import { montarPacote } from '../src/cor/pacote.js'
import { aleatorio } from './apoio.js'
import { CONTAS_DO_RESOLVE, lerDctl } from './dctl-apoio.js'

const texto = escreverDctlLab()
const no = lerDctl(texto)

/** Códigos DaVinci Intermediate: a escala de cinza, peles, cores fortes, os cantos e um punhado ao acaso. */
function cores(semente, quantas = 40) {
  const rnd = aleatorio(semente)
  const lista = [0, 0.03, 0.12, 0.25, 0.336, 0.45, 0.6, 0.8, 1].map((v) => [v, v, v])
  lista.push([0.45, 0.38, 0.33], [0.52, 0.43, 0.37], [0.3, 0.26, 0.24], [0.62, 0.5, 0.42]) // pele, do escuro ao claro
  lista.push([0.6, 0.2, 0.1], [0.1, 0.2, 0.7], [0.2, 0.6, 0.2], [0.9, 0.85, 0.2], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0])
  for (let i = 0; i < quantas; i++) lista.push([rnd(), rnd(), rnd()])
  return lista
}
/** A maior diferença entre o motor e o nó em cada cor da lista (em código DaVinci Intermediate). */
const diferencas = (f, g, lista) =>
  lista.map((c) => {
    const a = f(...c)
    const b = g(...c)
    for (const v of b) assert.ok(Number.isFinite(v), `a DCTL devolveu ${v} para ${c}`)
    return Math.max(...a.map((v, k) => Math.abs(v - b[k])))
  })
const maiorDiferenca = (f, g, lista) => Math.max(...diferencas(f, g, lista))
// Com um negativo das fichas na cópia, o motor guarda a curva numa tabela de 4096 pontos e a deixa monótona; o nó faz a
// conta direto. Na sombra profunda com revelação forçada e no super-branco as duas se afastam até meio código de 10
// bits (invisível); no resto ficam em milionésimos. O teste cobra os dois limites.
const UM_CODIGO = 1 / 1023
const QUASE_SEMPRE = 2e-5
/** As trocas que a pessoa faria no nó para chegar na receita. */
function trocasDe(receita) {
  const d = padroesDoNo(receita)
  const nomes = { luz: 'p_Luz', temperatura: 'p_Temperatura', tint: 'p_Tint', contraste: 'p_Contraste', cor: 'p_Cor', altas: 'p_Altas', sombras: 'p_Sombras', preto: 'p_Preto', calor: 'p_Calor', estilo: 'p_Estilo', densidade: 'p_Densidade', branqueamento: 'p_Branqueamento', peleMatiz: 'p_PeleMatiz', peleSat: 'p_PeleSat', pele: 'p_Pele', desbotar: 'p_Desbotar' }
  const t = { p_Look: d.look, p_Negativo: d.negativo, p_Copia: d.copia, p_LuzCopia: d.luz, p_Revelacao: d.revelacao, p_Expandido: d.expandido, p_Intensidade: d.intensidade }
  for (const [id, p] of Object.entries(nomes)) t[p] = d.ajustes[id]
  return t
}
function receitaAoAcaso(rnd) {
  const um = (lista) => lista[Math.floor(rnd() * lista.length)]
  const ajustes = {}
  // metade dos ajustes fica no neutro, como numa receita de verdade
  for (const a of AJUSTES) ajustes[a.id] = rnd() < 0.5 ? 0 : Math.round(a.min + rnd() * (a.max - a.min))
  return {
    base: um(LOOKS_DO_NO).id,
    negativo: um(['', '', 'digital', ...NEGATIVOS.map((n) => n.id)]),
    copia: um(['', '', 'nenhuma', ...COPIAS.map((c) => c.id)]),
    luzCopia: um(['', 'D65', 'D60', 'D55']),
    revelacao: um([null, -1, 0, 1, 2]),
    expandido: um([null, false, true]),
    intensidade: um([1, 1, 0.75, 0.4, 0]),
    ajustes,
  }
}

test('DCTL do Lab: cabeçalho, controles e a forma que o Resolve espera', () => {
  const parametros = [...texto.matchAll(/^DEFINE_UI_PARAMS\((\w+), ([^,]+), (DCTLUI_\w+)/gm)]
  assert.equal(parametros.length, 23)
  assert.ok(parametros.length <= 64, 'o Resolve aceita até 64 controles por DCTL')
  assert.deepEqual(
    parametros.slice(0, 7).map((m) => `${m[2]}: ${m[3]}`),
    ['Look: DCTLUI_COMBO_BOX', 'Negativo: DCTLUI_COMBO_BOX', 'Cópia: DCTLUI_COMBO_BOX', 'Luz da cópia: DCTLUI_COMBO_BOX', 'Revelação: DCTLUI_COMBO_BOX', 'Expandido: DCTLUI_CHECK_BOX', 'Intensidade do look: DCTLUI_SLIDER_FLOAT'],
  )
  // os ajustes do Lab, com os mesmos nomes e limites
  for (const a of AJUSTES) assert.ok(texto.includes(`, ${a.nome}, DCTLUI_SLIDER_FLOAT, 0.00000000, ${a.min}.0, ${a.max}.0, 1.0)`), a.nome)
  // todos os looks, negativos e cópias nas listas, cada opção com um identificador próprio
  const lista = (nome) => new RegExp(`^DEFINE_UI_PARAMS\\(${nome}, [^,]+, DCTLUI_COMBO_BOX, \\d+, \\{ ([^}]+) \\}, \\{ ([^}]+) \\}\\)$`, 'm').exec(texto)
  const looks = lista('p_Look')
  assert.equal(looks[1].split(', ').length, 25)
  assert.deepEqual(looks[2].split(', '), LOOKS_DO_NO.map((l) => l.nome))
  assert.equal(lista('p_Negativo')[2].split(', ').length, 12)
  assert.deepEqual(lista('p_Copia')[2].split(', '), ['Do look', 'Sem cópia', 'Cópia 2383', 'Cópia 2393', 'Cópia 3513'])
  const ids = [...texto.matchAll(/DCTLUI_COMBO_BOX, \d+, \{ ([^}]+) \}/g)].flatMap((m) => m[1].split(', '))
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.match(id, /^[A-Za-z_]\w*$/)
  // transformação por pixel (sem textura), em DaVinci Intermediate
  assert.match(texto, /__DEVICE__ float3 transform\(int p_Width, int p_Height, int p_X, int p_Y, float p_R, float p_G, float p_B\)/)
  assert.doesNotMatch(texto, /undefined|NaN|Infinity|\$\{|\[object/)
  // parênteses e chaves fechados
  for (const [abre, fecha] of ['()', '{}']) assert.equal(texto.split(abre).length, texto.split(fecha).length, `${abre}${fecha}`)
})

test('DCTL do Lab: só usa contas que o Resolve tem e toda função existe antes de ser chamada', () => {
  const semComentario = texto.replace(/\/\/.*$/gm, '')
  for (const m of semComentario.matchAll(/\b(_[a-z0-9]+)\(/g)) assert.ok(CONTAS_DO_RESOLVE.includes(m[1]), `conta desconhecida: ${m[1]}`)
  const definidas = [...semComentario.matchAll(/__DEVICE__ (?:float3|float|int) (\w+)\(/g)].map((m) => ({ nome: m[1], onde: m.index }))
  assert.ok(definidas.length > 40)
  assert.equal(new Set(definidas.map((d) => d.nome)).size, definidas.length)
  for (const d of definidas) {
    const primeiraChamada = semComentario.search(new RegExp(`(?<!(?:float3|float|int) )\\b${d.nome}\\(`))
    assert.ok(primeiraChamada === -1 || primeiraChamada > d.onde, `${d.nome} é chamada antes de existir`)
  }
  // todo número da conta é de 32 bits (sufixo f): número sem sufixo vira 64 bits e a placa da Apple recusa
  const conta = semComentario.replace(/^DEFINE_UI_PARAMS.*$/gm, '')
  assert.deepEqual([...conta.matchAll(/(?<![\w.])\d+\.\d*(?:e[+-]?\d+)?(?![\w.])/g)].map((m) => m[0]), [])
  // os controles só existem dentro de transform: nenhuma função de apoio pode ler p_…
  const antesDoTransform = semComentario.slice(semComentario.indexOf('__CONSTANT__'), semComentario.indexOf('__DEVICE__ float3 transform'))
  assert.doesNotMatch(antesDoTransform, /\bp_[A-Z]/)
})

test('DCTL do Lab: os 25 looks dão a mesma cor que o motor (a LUT do pacote)', () => {
  for (const [i, l] of LOOKS_DO_NO.entries()) {
    const motor = criarLab({ base: l.id }).emDi
    const d = maiorDiferenca(motor, (r, g, b) => no.aplicar(r, g, b, { p_Look: i }), cores(11 + i))
    assert.ok(d < 1e-6, `${l.id}: ${d}`)
  }
})

test('DCTL do Lab: receitas ao acaso (negativo, cópia, luz, revelação, intensidade e todos os ajustes) batem com o motor', () => {
  const rnd = aleatorio(2026)
  const todas = []
  for (let i = 0; i < 80; i++) {
    const receita = receitaAoAcaso(rnd)
    const motor = criarLab(receita).emDi
    const trocas = trocasDe(receita)
    const d = diferencas(motor, (r, g, b) => no.aplicar(r, g, b, trocas), cores(100 + i, 16))
    assert.ok(Math.max(...d) < 1.5 * UM_CODIGO, `receita ${i} ${JSON.stringify(receita)}: ${Math.max(...d)}`)
    todas.push(...d)
  }
  todas.sort((a, b) => a - b)
  assert.ok(todas[Math.floor(todas.length * 0.99)] < QUASE_SEMPRE, `99% das cores: ${todas[Math.floor(todas.length * 0.99)]}`)
  assert.ok(todas.at(-1) > 0)
})

test('DCTL do Lab: o nó abre com a receita (os valores viram o padrão dos controles)', () => {
  const receita = { nome: 'Noite quente', base: 'negativo-500t', negativo: '5219', copia: '2383', luzCopia: 'D60', revelacao: 1, expandido: true, intensidade: 0.8, ajustes: { luz: 20, calor: 40, estilo: -30, peleSat: 15, desbotar: 10 } }
  const d = escreverDctlLab(receita, { titulo: 'Revela · Noite quente' })
  assert.match(d, /^\/\/ Revela · Noite quente\n/)
  const aberto = lerDctl(d)
  assert.equal(aberto.parametros.p_Look.valor, LOOKS_DO_NO.findIndex((l) => l.id === 'negativo-500t'))
  assert.deepEqual(
    ['p_Negativo', 'p_Copia', 'p_LuzCopia', 'p_Revelacao', 'p_Expandido', 'p_Intensidade', 'p_Luz', 'p_Calor', 'p_Estilo'].map((p) => aberto.parametros[p].valor),
    [2, 2, 1, 2, 1, 80, 20, 40, -30],
  )
  assert.ok(maiorDiferenca(criarLab(receita).emDi, aberto.aplicar, cores(5)) < UM_CODIGO)
  // "da base" continua "da base": trocar o look no nó troca a película junto
  assert.deepEqual([padroesDoNo({}).negativo, padroesDoNo({}).copia, padroesDoNo({ negativo: 'digital', copia: 'nenhuma' }).negativo, padroesDoNo({ negativo: 'digital', copia: 'nenhuma' }).copia], [0, 0, 1, 1])
  // receita com base desconhecida não quebra: abre no primeiro look
  assert.equal(padroesDoNo({ base: 'inventada' }).look, 0)
  assert.throws(() => lit(Infinity))
})

test('DCTL do Lab: com a conta de 32 bits da placa, nada estoura e a cor continua a mesma', () => {
  const no32 = lerDctl(texto, { f32: true })
  const rnd = aleatorio(77)
  // fora da faixa também: código negativo e acima de 1 (super-branco) não podem virar "sem número"
  const extremos = [[-0.05, -0.05, -0.05], [1.2, 1.2, 1.2], [1.2, 0, 0], [0, 0, 1.2], [0, 0, 0], [1, 1, 1]]
  const todas = []
  for (let i = 0; i < 60; i++) {
    const receita = receitaAoAcaso(rnd)
    const trocas = trocasDe(receita)
    for (const c of extremos) for (const v of no32.aplicar(...c, trocas)) assert.ok(Number.isFinite(v), `${JSON.stringify(receita)} em ${c}`)
    todas.push(...diferencas(criarLab(receita).emDi, (r, g, b) => no32.aplicar(r, g, b, trocas), cores(300 + i, 12)))
  }
  todas.sort((a, b) => a - b)
  // 32 bits somam um pouco de erro de arredondamento: no pior caso, menos de três códigos de 10 bits (no super-branco)
  assert.ok(todas.at(-1) < 3 * UM_CODIGO, `pior caso: ${todas.at(-1)}`)
  // e 99% das cores ficam a menos de um terço de código
  assert.ok(todas[Math.floor(todas.length * 0.99)] < UM_CODIGO / 3, `99% das cores: ${todas[Math.floor(todas.length * 0.99)]}`)
})

test('pacote profissional: leva o Lab como nó, aberto com a receita, e o LEIA-ME explica', () => {
  const receita = { nome: 'Noite quente', base: '500t-2383', intensidade: 1, ajustes: { calor: 30 } }
  const p = montarPacote(receita, { qc: false })
  const dctl = p.arquivos.find((a) => a.nome.endsWith('_Lab_DWG-DI.dctl'))
  assert.ok(dctl, 'a DCTL do Lab vai no pacote')
  assert.equal(dctl.nome, 'REVELA_NOITE-QUENTE/REVELA_NOITE-QUENTE_Lab_DWG-DI.dctl')
  assert.equal(lerDctl(dctl.dados).parametros.p_Calor.valor, 30)
  const leia = p.arquivos.find((a) => a.nome.endsWith('LEIA-ME.txt')).dados
  assert.match(leia, /REVELA_NOITE-QUENTE_Lab_DWG-DI\.dctl/)
  assert.match(leia, /Resolve Studio/)
})
