// O catálogo (src/biblioteca/catalogo.js) e a lista de arquivos (src/biblioteca/arquivos.js): modelo puro, sem DOM.
// Marcas, estrelas, cores, filtros combinados, ordem, pilhas, seleção com âncora, desfazer, guardar e os atalhos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ATALHOS, CORES, criarCatalogo, criarFoto, executar, hashDe, idDaFoto, lerTecla } from '../src/biblioteca/catalogo.js'
import { ACEITA, formatoDe, juntarPares } from '../src/biblioteca/arquivos.js'

/** n fotos de teste: IMG_0001.CR3 …, um segundo entre uma e outra. */
function fotos(n, extra = () => ({})) {
  return Array.from({ length: n }, (_, i) => {
    const num = String(i + 1).padStart(4, '0')
    return {
      nome: `IMG_${num}.CR3`,
      caminho: `cartao/IMG_${num}.CR3`,
      tamanho: 20_000_000 + i,
      tipo: 'raw',
      formato: 'cr3',
      exif: { data: `2026-11-13T10:00:${String(i % 60).padStart(2, '0')}`, orientacao: 1 },
      ...extra(i),
    }
  })
}
function novo(n = 10, extra) {
  const c = criarCatalogo()
  const ids = c.adicionar(fotos(n, extra))
  return { c, ids }
}
const nomes = (c) =>
  c
    .itens()
    .map((i) => i.foto.nome.slice(4, 8))
    .map(Number)

test('id estável: nome + tamanho + data de captura, sem depender da pasta nem de maiúsculas', () => {
  const a = idDaFoto({ nome: 'IMG_0001.CR3', tamanho: 123, data: '2026-11-13T10:00:00' })
  assert.match(a, /^[a-z0-9]{22}$/)
  assert.equal(a, idDaFoto({ nome: 'cartao/DCIM/img_0001.cr3', tamanho: 123, data: '2026-11-13T10:00:00' }))
  assert.notEqual(a, idDaFoto({ nome: 'IMG_0001.CR3', tamanho: 124, data: '2026-11-13T10:00:00' }))
  assert.notEqual(a, idDaFoto({ nome: 'IMG_0001.CR3', tamanho: 123, data: '2026-11-13T10:00:01' }))
  assert.notEqual(a, idDaFoto({ nome: 'IMG_0002.CR3', tamanho: 123, data: '2026-11-13T10:00:00' }))
  assert.notEqual(a, idDaFoto({ nome: 'IMG_0001.CR3', tamanho: 123 }))
  // valor travado: se o hash mudar, as marcas guardadas deixam de casar com as fotos
  assert.equal(hashDe('a'), hashDe('a'))
  assert.equal(idDaFoto({ nome: 'a.jpg', tamanho: 1, data: '' }), hashDe('a.jpg|1|'))
  // 5.000 fotos de uma sessão: nenhum id repetido
  const ids = new Set(fotos(5000).map((f) => idDaFoto({ nome: f.nome, tamanho: f.tamanho, data: f.exif.data })))
  assert.equal(ids.size, 5000)
})

test('foto: campos do contrato, valores fora do contrato viram neutros, objeto que não muda', () => {
  const f = criarFoto({ nome: 'a.dng', tamanho: 9, tipo: 'raw', formato: 'DNG', marca: 'talvez', estrelas: 9, cor: 'rosa' })
  assert.deepEqual(
    { marca: f.marca, estrelas: f.estrelas, cor: f.cor, formato: f.formato, tipo: f.tipo, caminho: f.caminho },
    { marca: null, estrelas: 5, cor: null, formato: 'dng', tipo: 'raw', caminho: 'a.dng' },
  )
  assert.deepEqual(f.exif, {})
  assert.ok(Object.isFrozen(f))
  assert.equal(criarFoto({ nome: 'b.jpg', tamanho: 1 }).tipo, 'imagem')
})

test('adicionar: entra uma vez; a mesma foto de novo mantém marcas e atualiza o caminho', () => {
  const { c, ids } = novo(3)
  assert.equal(c.tamanho, 3)
  c.marcar([ids[0]], 'escolhida')
  c.estrelar([ids[0]], 4)
  const de_novo = c.adicionar(fotos(4, () => ({ caminho: 'outra/pasta' })))
  assert.equal(de_novo.length, 1)
  assert.equal(c.tamanho, 4)
  assert.equal(c.foto(ids[0]).marca, 'escolhida')
  assert.equal(c.foto(ids[0]).estrelas, 4)
  assert.equal(c.foto(ids[0]).caminho, 'outra/pasta')
  assert.deepEqual(c.remover([ids[1], 'nao-existe']), [ids[1]])
  assert.equal(c.tamanho, 3)
  assert.equal(c.foto(ids[1]), null)
})

test('marcas, estrelas e cores: valem para várias fotos e avisam só o que mudou', () => {
  const { c, ids } = novo(5)
  const avisos = []
  c.assinar((a) => avisos.push(a))
  assert.deepEqual(c.marcar([ids[0], ids[1]], 'escolhida'), [ids[0], ids[1]])
  assert.equal(c.foto(ids[0]).marca, 'escolhida')
  assert.deepEqual(avisos[0], { tipo: 'dados', ids: [ids[0], ids[1]], campos: ['marca'], lista: true })
  // repetir não muda nada, não avisa e não entra no desfazer
  avisos.length = 0
  assert.deepEqual(c.marcar([ids[0]], 'escolhida'), [])
  assert.deepEqual(avisos, [])
  c.marcar([ids[0]], 'rejeitada')
  assert.equal(c.foto(ids[0]).marca, 'rejeitada')
  c.marcar([ids[0]], null)
  assert.equal(c.foto(ids[0]).marca, null)
  c.marcar([ids[0]], 'qualquer')
  assert.equal(c.foto(ids[0]).marca, null)
  c.estrelar(ids, 3)
  assert.ok(ids.every((id) => c.foto(id).estrelas === 3))
  c.estrelar([ids[2]], 7)
  assert.equal(c.foto(ids[2]).estrelas, 5)
  c.colorir([ids[3]], 'verde')
  assert.equal(c.foto(ids[3]).cor, 'verde')
  c.colorir([ids[3]], 'rosa')
  assert.equal(c.foto(ids[3]).cor, null)
  // o objeto da foto troca só em quem mudou (a grade compara por identidade)
  const antes = c.foto(ids[4])
  c.marcar([ids[0]], 'escolhida')
  assert.equal(c.foto(ids[4]), antes)
  assert.deepEqual(c.contagens().marca, { escolhida: 2, rejeitada: 0, sem: 3 })
})

test('atualizar: dados medidos não entram no desfazer e só refazem a lista quando mexem nela', () => {
  const { c, ids } = novo(3)
  const avisos = []
  c.assinar((a) => avisos.push(a))
  assert.equal(c.atualizar(ids[0], { largura: 6000, altura: 4000 }), true)
  assert.deepEqual(avisos, [{ tipo: 'dados', ids: [ids[0]], campos: ['largura', 'altura'], lista: false }])
  assert.equal(c.podeDesfazer, false)
  assert.equal(c.atualizar('nao-existe', { largura: 1 }), false)
  avisos.length = 0
  c.atualizarVarias([
    { id: ids[0], magnitude: { total: 80, balde: 'fica', motivos: ['A mais nítida de 3'] }, cena: 'retrato' },
    { id: ids[1], magnitude: { total: 20, balde: 'fora', motivos: ['Olho fechado'] }, cena: 'retrato' },
  ])
  assert.equal(avisos.length, 1)
  assert.equal(avisos[0].lista, true)
  assert.deepEqual(c.contagens().balde, { fica: 1, talvez: 0, fora: 1, sem: 1 })
  assert.deepEqual(c.contagens().motivo, { 'A mais nítida de 3': 1, 'Olho fechado': 1 })
  assert.deepEqual(c.contagens().cena, { retrato: 2 })
})

test('filtros combinam com E: marca, estrelas ≥ n, cor, balde, motivo, cena, tipo', () => {
  const { c, ids } = novo(12, (i) => ({
    tipo: i % 2 ? 'imagem' : 'raw',
    cena: i < 6 ? 'retrato' : 'paisagem',
    magnitude: { total: i * 8, balde: i < 4 ? 'fora' : i < 8 ? 'talvez' : 'fica', motivos: i < 4 ? ['Olho fechado'] : ['Nítida'] },
  }))
  c.marcar(ids.slice(0, 6), 'escolhida')
  c.marcar(ids.slice(10), 'rejeitada')
  c.estrelar(ids.slice(2, 8), 4)
  c.estrelar([ids[8]], 2)
  c.colorir([ids[3], ids[4]], 'verde')
  c.colorir([ids[5]], 'azul')

  c.filtrar({ marca: 'escolhida' })
  assert.deepEqual(nomes(c), [1, 2, 3, 4, 5, 6])
  c.filtrar({ estrelas: 4 })
  assert.deepEqual(nomes(c), [3, 4, 5, 6])
  c.filtrar({ cor: ['verde', 'azul'] })
  assert.deepEqual(nomes(c), [4, 5, 6])
  c.filtrar({ tipo: 'imagem' })
  assert.deepEqual(nomes(c), [4, 6])
  c.filtrar({ balde: 'talvez' })
  assert.deepEqual(nomes(c), [6])
  assert.equal(c.filtroAtivo(), true)
  // tirar um critério devolve o resto
  c.filtrar({ balde: null, tipo: null, cor: null, estrelas: 0 })
  assert.deepEqual(nomes(c), [1, 2, 3, 4, 5, 6])
  c.limparFiltro()
  assert.equal(c.filtroAtivo(), false)
  assert.equal(c.itens().length, 12)
  // sem marca, sem cor, motivo e cena
  c.filtrar({ marca: 'sem' })
  assert.deepEqual(nomes(c), [7, 8, 9, 10])
  c.limparFiltro()
  c.filtrar({ motivo: 'olho' })
  assert.deepEqual(nomes(c), [1, 2, 3, 4])
  c.limparFiltro()
  c.filtrar({ cena: 'paisagem', estrelas: 2 })
  assert.deepEqual(nomes(c), [7, 8, 9])
  c.limparFiltro()
  c.filtrar({ cor: 'sem', marca: ['escolhida', 'rejeitada'] })
  assert.deepEqual(nomes(c), [1, 2, 3, 11, 12])
  // as contagens são do catálogo inteiro (as pílulas mostram o que há, não o que sobrou)
  const n = c.contagens()
  assert.equal(n.total, 12)
  assert.equal(n.visiveis, 5)
  assert.deepEqual(n.marca, { escolhida: 6, rejeitada: 2, sem: 4 })
  assert.deepEqual(n.estrelas, [5, 0, 1, 0, 6, 0])
  assert.equal(n.cor.verde, 2)
  assert.equal(n.cor.sem, 9)
  assert.deepEqual(n.tipo, { raw: 6, imagem: 6 })
})

test('ordem: captura, nome (números em ordem de gente) e nota; desc inverte; sem data e sem nota no fim', () => {
  const c = criarCatalogo()
  c.adicionar([
    { nome: 'b10.jpg', tamanho: 1, exif: { data: '2026-01-01T10:00:02' }, magnitude: { total: 50 } },
    { nome: 'b9.jpg', tamanho: 2, exif: { data: '2026-01-01T10:00:01' }, magnitude: { total: 90 } },
    { nome: 'a.jpg', tamanho: 3, exif: {} },
    { nome: 'B2.jpg', tamanho: 4, exif: { data: '2026-01-01T10:00:01', subsegundo: 0.5 }, magnitude: { total: 70 } },
  ])
  const ordem = () => c.itens().map((i) => i.foto.nome)
  assert.deepEqual(c.ordem(), { por: 'captura', sentido: 'asc' })
  assert.deepEqual(ordem(), ['b9.jpg', 'B2.jpg', 'b10.jpg', 'a.jpg'])
  c.ordenar('nome')
  assert.deepEqual(ordem(), ['a.jpg', 'B2.jpg', 'b9.jpg', 'b10.jpg'])
  c.ordenar('nome', 'desc')
  assert.deepEqual(ordem(), ['b10.jpg', 'b9.jpg', 'B2.jpg', 'a.jpg'])
  c.ordenar('nota')
  assert.deepEqual(ordem(), ['b9.jpg', 'B2.jpg', 'b10.jpg', 'a.jpg'])
  c.ordenar('qualquer')
  assert.deepEqual(c.ordem(), { por: 'nota', sentido: 'asc' })
})

test('seleção estilo Finder: clique, Cmd/Ctrl, Shift com âncora, setas, tudo e Esc', () => {
  const { c, ids } = novo(10)
  const sel = () => c.selecionadas().map((id) => ids.indexOf(id))
  c.selecionar(ids[2])
  assert.deepEqual(sel(), [2])
  assert.equal(c.foco(), ids[2])
  assert.equal(c.ancora(), ids[2])
  // Shift: da âncora até a clicada; outro Shift troca o intervalo (a âncora fica)
  c.selecionar(ids[5], { intervalo: true })
  assert.deepEqual(sel(), [2, 3, 4, 5])
  c.selecionar(ids[0], { intervalo: true })
  assert.deepEqual(sel(), [0, 1, 2])
  assert.equal(c.ancora(), ids[2])
  assert.equal(c.foco(), ids[0])
  // Cmd/Ctrl: entra e sai, e vira a âncora
  c.selecionar(ids[7], { alternar: true })
  assert.deepEqual(sel(), [0, 1, 2, 7])
  c.selecionar(ids[1], { alternar: true })
  assert.deepEqual(sel(), [0, 2, 7])
  assert.equal(c.ancora(), ids[1])
  // Cmd/Ctrl + Shift soma o intervalo
  c.selecionar(ids[7], { alternar: true })
  c.selecionar(ids[9], { alternar: true, intervalo: true })
  assert.deepEqual(sel(), [0, 2, 7, 8, 9])
  // clique simples volta a uma só
  c.selecionar(ids[4])
  assert.deepEqual(sel(), [4])
  // setas: andam o foco e a seleção; com Shift estendem; param nas pontas
  assert.equal(c.mover(1), ids[5])
  assert.deepEqual(sel(), [5])
  c.mover(3, { intervalo: true })
  assert.deepEqual(sel(), [5, 6, 7, 8])
  c.mover(-5, { intervalo: true })
  assert.deepEqual(sel(), [3, 4, 5])
  assert.equal(c.mover(-50), ids[0])
  assert.equal(c.mover(50), ids[9])
  assert.equal(c.mover(1), ids[9])
  // tudo e Esc: a seleção sai, o foco fica, e a ação passa a valer para a foto em foco
  c.selecionarTudo()
  assert.equal(sel().length, 10)
  assert.equal(c.alvo().length, 10)
  c.limparSelecao()
  assert.deepEqual(sel(), [])
  assert.equal(c.foco(), ids[9])
  assert.deepEqual(c.alvo(), [ids[9]])
  // o aviso leva só quem mudou de estado
  const avisos = []
  c.assinar((a) => avisos.push(a))
  c.selecionar(ids[3])
  assert.deepEqual(avisos, [{ tipo: 'selecao', ids: [ids[3], ids[9]] }])
  avisos.length = 0
  c.selecionar(ids[3])
  assert.deepEqual(avisos, [])
  // catálogo sem foco: a primeira seta entra na primeira foto
  const vazio = novo(3)
  assert.equal(vazio.c.foco(), null)
  assert.equal(vazio.c.mover(1), vazio.ids[0])
  assert.equal(criarCatalogo().mover(1), null)
})

test('com filtro ligado, a foto marcada sai da lista e a seguinte toma o foco', () => {
  const { c, ids } = novo(6)
  c.filtrar({ marca: 'sem' })
  c.selecionar(ids[2])
  c.marcar(c.alvo(), 'rejeitada')
  assert.deepEqual(nomes(c), [1, 2, 4, 5, 6])
  assert.equal(c.foco(), ids[3])
  assert.deepEqual(c.selecionadas(), [ids[3]])
  // a última: o foco fica na que virou última
  c.selecionar(ids[5])
  c.marcar(c.alvo(), 'escolhida')
  assert.equal(c.foco(), ids[4])
  // desfazer traz a foto de volta para a lista
  c.desfazer()
  assert.deepEqual(nomes(c), [1, 2, 4, 5, 6])
})

test('desfazer e refazer: por passo, com várias fotos, e uma decisão nova apaga o refazer', () => {
  const { c, ids } = novo(4)
  assert.equal(c.desfazer(), null)
  assert.equal(c.refazer(), null)
  c.marcar([ids[0], ids[1]], 'escolhida')
  c.estrelar([ids[1]], 5)
  c.colorir([ids[2]], 'roxo')
  c.definir([ids[3]], { ajustes: { exposicao: 0.5 } }, { rotulo: 'Exposição' })
  assert.equal(c.podeDesfazer, true)
  assert.deepEqual(c.desfazer(), { rotulo: 'Exposição', ids: [ids[3]] })
  assert.equal(c.foto(ids[3]).ajustes, undefined)
  assert.deepEqual(c.desfazer(), { rotulo: 'Cor: roxo', ids: [ids[2]] })
  assert.equal(c.foto(ids[2]).cor, null)
  assert.equal(c.desfazer().rotulo, '5 estrelas')
  assert.equal(c.foto(ids[1]).estrelas, 0)
  assert.equal(c.foto(ids[1]).marca, 'escolhida')
  c.desfazer()
  assert.equal(c.foto(ids[0]).marca, null)
  assert.equal(c.foto(ids[1]).marca, null)
  assert.equal(c.podeDesfazer, false)
  assert.equal(c.podeRefazer, true)
  assert.deepEqual(c.refazer(), { rotulo: 'Escolhida', ids: [ids[0], ids[1]] })
  assert.equal(c.foto(ids[1]).marca, 'escolhida')
  c.refazer()
  assert.equal(c.foto(ids[1]).estrelas, 5)
  // decisão nova: o que estava para refazer some
  c.marcar([ids[3]], 'rejeitada')
  assert.equal(c.podeRefazer, false)
  assert.equal(c.foto(ids[2]).cor, null)
  // função por foto e passo que não muda nada
  c.definir(ids, (f) => ({ estrelas: f.estrelas + 1 }))
  assert.deepEqual(
    ids.map((id) => c.foto(id).estrelas),
    [1, 5, 1, 1],
  )
  c.desfazer()
  assert.deepEqual(
    ids.map((id) => c.foto(id).estrelas),
    [0, 5, 0, 0],
  )
  // foto removida some do histórico
  c.remover([ids[3]])
  assert.equal(c.desfazer().rotulo, '5 estrelas')
})

test('pilhas: grupo fechado mostra a capa; aberto, todas no lugar; a capa é a escolhida ou a de maior nota', () => {
  const { c, ids } = novo(8, (i) => ({ magnitude: { total: [10, 60, 30, 5, 5, 5, 40, 90][i] } }))
  c.definirGrupos([
    { id: 'g1', fotos: [ids[1], ids[2], ids[3]], tipo: 'repetidas' },
    { id: 'g2', fotos: [ids[6], ids[7]], tipo: 'sequencia' },
    { id: 'g3', fotos: [ids[5]], tipo: 'repetidas' },
  ])
  assert.deepEqual(nomes(c), [1, 2, 5, 6, 8])
  const pilha = c.itens()[1].pilha
  assert.deepEqual(pilha, { id: 'g1', tipo: 'repetidas', total: 3, aberta: false, posicao: 0 })
  assert.equal(c.itens()[3].pilha, null) // grupo de uma foto só não é pilha
  // escolhida vira a capa; rejeitada perde para a que não está
  c.marcar([ids[3]], 'escolhida')
  assert.deepEqual(nomes(c), [1, 4, 5, 6, 8])
  c.marcar([ids[7]], 'rejeitada')
  assert.deepEqual(nomes(c), [1, 4, 5, 6, 7])
  // abrir no lugar
  c.alternarPilha('g1')
  assert.deepEqual(nomes(c), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(
    c
      .itens()
      .slice(1, 4)
      .map((i) => i.pilha.posicao),
    [0, 1, 2],
  )
  assert.equal(c.pilhaAberta('g1'), true)
  // o filtro vale dentro da pilha: sobra uma visível, deixa de ser pilha
  c.filtrar({ marca: 'escolhida' })
  assert.deepEqual(nomes(c), [4])
  assert.equal(c.itens()[0].pilha, null)
  c.limparFiltro()
  // fechar com o foco numa foto que some: o foco vai para a capa (quem ficou no lugar)
  c.selecionar(ids[2])
  c.alternarPilha('g1', false)
  assert.equal(c.foco(), ids[3])
  // sem empilhar, tudo solto
  c.empilhar(false)
  assert.equal(c.itens().length, 8)
  assert.ok(c.itens().every((i) => i.pilha === null))
  c.empilhar(true)
  assert.deepEqual(c.grupos().find((g) => g.id === 'g2').fotos, [ids[6], ids[7]])
  // trocar os grupos tira os antigos
  c.definirGrupos([])
  assert.equal(c.itens().length, 8)
  assert.equal(c.foto(ids[1]).grupo, null)
})

test('serializar e restaurar: passa por JSON e volta igual; desfazer e seleção não vão', () => {
  const { c, ids } = novo(6, (i) => ({ ...(i === 0 ? { par: { nome: 'IMG_0001.JPG', tamanho: 5, formato: 'jpg' } } : {}), medidas: { nitidez: { q: i } } }))
  c.marcar([ids[0]], 'escolhida')
  c.estrelar([ids[1]], 3)
  c.colorir([ids[2]], 'amarelo')
  c.definirGrupos([{ id: 'g', fotos: [ids[3], ids[4]], tipo: 'sequencia' }])
  c.alternarPilha('g')
  c.filtrar({ estrelas: 0, tipo: 'raw' })
  c.ordenar('nome', 'desc')
  c.selecionar(ids[4])
  const guardado = JSON.parse(JSON.stringify(c.serializar()))
  assert.equal(guardado.zro, 'foto.catalogo')
  assert.equal(guardado.versao, 1)
  const d = criarCatalogo(guardado)
  assert.deepEqual(d.fotos(), c.fotos())
  assert.deepEqual(
    d.itens().map((i) => [i.foto.id, i.pilha]),
    c.itens().map((i) => [i.foto.id, i.pilha]),
  )
  assert.deepEqual(d.filtro(), c.filtro())
  assert.deepEqual(d.ordem(), { por: 'nome', sentido: 'desc' })
  assert.equal(d.foco(), ids[4])
  assert.equal(d.selecao().size, 0)
  assert.equal(d.podeDesfazer, false)
  assert.equal(d.foto(ids[0]).par.nome, 'IMG_0001.JPG')
  // campos pesados podem ficar de fora
  assert.equal(c.serializar({ omitir: ['medidas'] }).fotos[0].medidas, undefined)
  assert.equal(c.foto(ids[0]).medidas.nitidez.q, 0)
  // o que não é catálogo é recusado e não estraga o que havia
  assert.throws(() => d.restaurar({ fotos: [] }), /catálogo/)
  assert.throws(() => d.restaurar({ zro: 'foto.catalogo', versao: 2, fotos: [] }), /versão/)
  assert.equal(d.tamanho, 6)
})

test('atalhos do Lightroom: teclas viram comandos', () => {
  const t = (key, extra = {}) => lerTecla({ key, ...extra })
  assert.deepEqual(t('p'), { acao: 'marca', valor: 'escolhida', avancar: false })
  assert.deepEqual(t('X', { capsLock: true }), { acao: 'marca', valor: 'rejeitada', avancar: true })
  assert.deepEqual(t('U', { shiftKey: true }), { acao: 'marca', valor: null, avancar: true })
  assert.deepEqual(t('0'), { acao: 'estrelas', valor: 0, avancar: false })
  assert.deepEqual(t('5', { code: 'Digit5' }), { acao: 'estrelas', valor: 5, avancar: false })
  // Shift + 3 chega como '#': vale a posição da tecla
  assert.deepEqual(t('#', { code: 'Digit3', shiftKey: true }), { acao: 'estrelas', valor: 3, avancar: true })
  assert.deepEqual(t('4', { code: 'Numpad4' }), { acao: 'estrelas', valor: 4, avancar: false })
  assert.deepEqual(
    ['6', '7', '8', '9'].map((k) => t(k).valor),
    CORES.slice(0, 4),
  )
  assert.deepEqual(t(']'), { acao: 'estrelas-passo', valor: 1 })
  assert.deepEqual(t('['), { acao: 'estrelas-passo', valor: -1 })
  assert.deepEqual(t('ArrowLeft'), { acao: 'mover', valor: 'esquerda', intervalo: false })
  assert.deepEqual(t('ArrowDown', { shiftKey: true }), { acao: 'mover', valor: 'abaixo', intervalo: true })
  assert.deepEqual(t(' '), { acao: 'zoom' })
  assert.deepEqual(t('z'), { acao: 'zoom' })
  assert.deepEqual(t('g'), { acao: 'grade' })
  assert.deepEqual(t('e'), { acao: 'lupa' })
  assert.deepEqual(t('Enter'), { acao: 'lupa' })
  assert.deepEqual(t('n'), { acao: 'comparar' })
  assert.deepEqual(t('d'), { acao: 'aba', valor: 'revelar' })
  assert.deepEqual(t('Escape'), { acao: 'sair' })
  assert.deepEqual(t('?', { shiftKey: true }), { acao: 'ajuda' })
  assert.deepEqual(t('z', { metaKey: true }), { acao: 'desfazer' })
  assert.deepEqual(t('z', { ctrlKey: true }), { acao: 'desfazer' })
  assert.deepEqual(t('Z', { metaKey: true, shiftKey: true }), { acao: 'refazer' })
  assert.deepEqual(t('y', { ctrlKey: true }), { acao: 'refazer' })
  assert.deepEqual(t('a', { metaKey: true }), { acao: 'selecionar-tudo' })
  // Cmd/Ctrl com outra tecla, Alt e teclas sem função: nada (o navegador segue com o atalho dele)
  assert.equal(t('p', { metaKey: true }), null)
  assert.equal(t('1', { code: 'Digit1', ctrlKey: true }), null)
  assert.equal(t('p', { altKey: true }), null)
  assert.equal(t('q'), null)
  assert.equal(t('Tab'), null)
  // Caps Lock pelo evento de verdade
  assert.equal(lerTecla({ key: 'P', getModifierState: (m) => m === 'CapsLock' }).avancar, true)
  // a tabela da folha de atalhos cobre o que o contrato lista
  const mostradas = ATALHOS.flatMap((a) => [...a.teclas, ...(a.ou || [])]).join(' ')
  for (const tecla of ['P', 'X', 'U', '0', '5', '6', '9', '←', '→', 'Espaço', 'Z', 'G', 'E', 'N', 'Caps Lock', 'Shift'])
    assert.ok(mostradas.includes(tecla), tecla)
  assert.ok(ATALHOS.every((a) => a.rotulo && a.grupo && a.acao))
})

test('executar: P, X, U, estrelas, cor que alterna, setas pelas colunas, avançar e desfazer', () => {
  const { c, ids } = novo(12)
  const tecla = (key, extra) => executar(c, lerTecla({ key, ...extra }), { colunas: 4 })
  c.selecionar(ids[0])
  assert.equal(tecla('p'), true)
  assert.equal(c.foto(ids[0]).marca, 'escolhida')
  assert.equal(c.foco(), ids[0])
  // Caps Lock ou Shift: marca e vai para a próxima
  tecla('x', { capsLock: true })
  assert.equal(c.foto(ids[0]).marca, 'rejeitada')
  assert.equal(c.foco(), ids[1])
  tecla('#', { code: 'Digit3', shiftKey: true })
  assert.equal(c.foto(ids[1]).estrelas, 3)
  assert.equal(c.foco(), ids[2])
  tecla('u')
  tecla('5')
  assert.equal(c.foto(ids[2]).estrelas, 5)
  tecla('[')
  assert.equal(c.foto(ids[2]).estrelas, 4)
  tecla(']')
  tecla(']')
  assert.equal(c.foto(ids[2]).estrelas, 5)
  tecla('0')
  assert.equal(c.foto(ids[2]).estrelas, 0)
  // cor: a mesma tecla de novo tira
  tecla('8')
  assert.equal(c.foto(ids[2]).cor, 'verde')
  tecla('8')
  assert.equal(c.foto(ids[2]).cor, null)
  tecla('6')
  tecla('9')
  assert.equal(c.foto(ids[2]).cor, 'azul')
  // setas: → e ↓ pelas colunas da grade; Shift estende
  tecla('ArrowRight')
  assert.equal(c.foco(), ids[3])
  tecla('ArrowDown')
  assert.equal(c.foco(), ids[7])
  tecla('ArrowUp')
  tecla('ArrowLeft')
  assert.equal(c.foco(), ids[2])
  tecla('ArrowDown', { shiftKey: true })
  assert.deepEqual(c.selecionadas(), ids.slice(2, 7))
  // a marca vale para a seleção inteira
  tecla('p')
  assert.ok(ids.slice(2, 7).every((id) => c.foto(id).marca === 'escolhida'))
  // desfazer e refazer pelo teclado
  tecla('z', { metaKey: true })
  assert.ok(ids.slice(2, 7).every((id) => c.foto(id).marca === null))
  tecla('z', { metaKey: true, shiftKey: true })
  assert.equal(c.foto(ids[4]).marca, 'escolhida')
  tecla('a', { ctrlKey: true })
  assert.equal(c.selecao().size, 12)
  // com filtro, avançar não pula uma foto: a seguinte já veio para o lugar
  c.limparSelecao()
  c.filtrar({ marca: 'sem' })
  const visiveis = c.itens().map((i) => i.foto.id)
  c.selecionar(visiveis[0])
  tecla('p', { capsLock: true })
  assert.equal(c.foco(), visiveis[1])
  // comandos de tela não são do catálogo
  for (const k of [' ', 'g', 'e', 'n', 'd', 'Escape', '?', 'q']) assert.equal(tecla(k), false, k)
  assert.equal(executar(c, null), false)
})

test('arquivos: o que é foto, e RAW + JPEG do mesmo nome viram uma só', () => {
  assert.deepEqual(formatoDe('IMG_1.CR3'), { tipo: 'raw', formato: 'cr3' })
  assert.deepEqual(formatoDe('pasta/sub/DSC001.ARW'), { tipo: 'raw', formato: 'arw' })
  assert.deepEqual(formatoDe('a.JPEG'), { tipo: 'imagem', formato: 'jpg' })
  assert.deepEqual(formatoDe('a.tiff'), { tipo: 'imagem', formato: 'tif' })
  assert.deepEqual(formatoDe('a.heic'), { tipo: 'imagem', formato: 'heic' })
  for (const fora of ['notas.txt', 'video.mov', '.DS_Store', '._IMG_1.CR3', 'semextensao', 'a.xmp', 'IMG_1.CR3.xmp', ''])
    assert.equal(formatoDe(fora), null, fora)
  for (const ext of ['.dng', '.cr2', '.cr3', '.nef', '.arw', '.rw2', '.orf', '.raf', '.pef', '.jpg', '.png', '.webp', '.heic', '.tif'])
    assert.ok(ACEITA.split(',').includes(ext), ext)

  const a = (caminho, tamanho = 1) => ({ nome: caminho.split('/').pop(), caminho, tamanho })
  const pares = juntarPares([
    a('c/IMG_1.JPG', 5),
    a('c/IMG_1.CR3', 30),
    a('c/IMG_2.CR3'),
    a('c/img_2.jpg'),
    a('c/IMG_3.JPG'),
    a('c/leia.txt'),
    a('outra/IMG_1.JPG'),
    a('c/IMG_4.png'),
    a('c/IMG_4.jpg'),
    a('c/IMG_5.DNG'),
    a('c/IMG_5.CR3'),
  ])
  assert.deepEqual(
    pares.map((p) => [p.principal.caminho, p.par?.caminho ?? null, p.tipo, p.formato]),
    [
      ['c/IMG_1.CR3', 'c/IMG_1.JPG', 'raw', 'cr3'],
      ['c/IMG_2.CR3', 'c/img_2.jpg', 'raw', 'cr3'],
      ['c/IMG_3.JPG', null, 'imagem', 'jpg'],
      ['outra/IMG_1.JPG', null, 'imagem', 'jpg'],
      ['c/IMG_4.png', null, 'imagem', 'png'],
      ['c/IMG_4.jpg', null, 'imagem', 'jpg'],
      ['c/IMG_5.DNG', null, 'raw', 'dng'],
      ['c/IMG_5.CR3', null, 'raw', 'cr3'],
    ],
  )
  assert.deepEqual(juntarPares([]), [])
})
