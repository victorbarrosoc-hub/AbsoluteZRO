// Os estilos da casa, a biblioteca da pessoa (src/estilo/biblioteca.js) e o controle de qualidade (src/estilo/qc.js).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DA_FOTO, mexidos, neutro } from '../src/motor/ajustes.js'
import {
  FAMILIAS,
  acrescentar,
  achar,
  buscar,
  criarBiblioteca,
  duplicar,
  estilosDaCasa,
  exportar,
  familias,
  favoritar,
  favoritas,
  importar,
  moverDeFamilia,
  normalizarBiblioteca,
  ordenar,
  porFamilia,
  recentes,
  remover,
  renomear,
  reordenar,
  usar,
} from '../src/estilo/biblioteca.js'
import { criarPredefinicao, serializarPacote } from '../src/estilo/predefinicao.js'
import { LIMITES_QC, eTonalizado, qc } from '../src/estilo/qc.js'

const AGORA = '2026-11-13T12:00:00.000Z'

test('estilos da casa: cerca de 36, nas 11 famílias, ids estáveis, nomes nossos', () => {
  const casa = estilosDaCasa()
  assert.ok(casa.length >= 33 && casa.length <= 45, `${casa.length} estilos`)
  assert.deepEqual([...new Set(casa.map((p) => p.familia))], FAMILIAS)
  for (const familia of FAMILIAS) assert.ok(casa.filter((p) => p.familia === familia).length >= 3, familia)
  assert.ok(casa.filter((p) => p.familia === 'Palco e show').length >= 4)
  const ids = casa.map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(
    estilosDaCasa().map((p) => p.id),
    ids,
  )
  // nada de nome de fabricante, de película ou de marca; nome curto e descrição de uma linha
  const proibidos = /kodak|fuji|portra|ektar|velvia|provia|ilford|agfa|cinestill|polaroid|leica|vsco|lightroom|adobe|instagram/i
  for (const p of casa) {
    assert.ok(!proibidos.test(`${p.nome} ${p.descricao}`), p.nome)
    assert.ok(p.nome.length <= 18, p.nome)
    assert.ok(p.descricao.length > 10 && p.descricao.length <= 70 && !p.descricao.includes('\n'), p.descricao)
    assert.equal(p.origem.tipo, 'nossa')
  }
  assert.equal(new Set(casa.map((p) => p.nome.toLowerCase())).size, casa.length)
})

test('estilos da casa: só controles do motor que são de estilo', () => {
  const daFoto = /^(luz\.exposicao|branco|geometria|detalhe\.)/
  for (const p of estilosDaCasa()) {
    const m = mexidos(p.ajustes)
    assert.ok(m.length >= 2, `${p.nome} mexe em quase nada`)
    for (const c of m) assert.ok(!daFoto.test(c), `${p.nome} mexe em ${c}`)
    assert.deepEqual(p.levar, [])
    for (const g of DA_FOTO)
      assert.equal(
        g.split('.').reduce((o, k) => o?.[k], p.ajustes),
        undefined,
      )
  }
})

test('qc: todos os estilos da casa passam', () => {
  for (const p of estilosDaCasa()) {
    const r = qc(p)
    assert.ok(r.aprovado, `${p.nome}: ${r.problemas.map((x) => `${x.codigo} ${x.valor}`).join('; ')}`)
    assert.equal(r.medidas.foraDaFaixa, 0)
  }
})

test('qc: a revelação neutra passa e as falhas típicas são pegas, cada uma pelo seu código', () => {
  const n = qc(neutro())
  assert.ok(n.aprovado)
  assert.ok(n.medidas.croma < 1e-3)
  for (const pele of n.medidas.peles) {
    assert.ok(pele.min >= LIMITES_QC.peleFaixa[0] && pele.max <= LIMITES_QC.peleFaixa[1])
  }
  const codigos = (ajustes, opcoes) => qc(ajustes, opcoes).problemas.map((p) => p.codigo)
  // curva que desce
  assert.ok(
    codigos({
      curva: {
        pontos: {
          luz: [
            [0, 0],
            [0.4, 0.6],
            [0.6, 0.4],
            [1, 1],
          ],
        },
      },
    }).includes('monotonia'),
  )
  // cinza colorido sem marca de tonalizado: global de 40 em verde
  assert.ok(codigos({ tonalizacao: { global: { matiz: 120, saturacao: 40, luz: 0 } } }, { tonalizado: false }).includes('neutro'))
  // a mesma tonalização marcada como tonalizada passa no limite próprio se for leve
  assert.ok(!codigos({ tonalizacao: { sombras: { matiz: 220, saturacao: 12, luz: 0 } } }).includes('neutro'))
  // pele empurrada para o magenta
  assert.ok(codigos({ misturador: { matiz: [-100, -100, 0, 0, 0, 0, 0, 0] }, calibracao: { vermelhoMatiz: -100 } }).some((c) => c.startsWith('pele')))
  // preto esmagado
  assert.ok(codigos({ luz: { pretos: -100, sombras: -100, contraste: 100 } }).includes('pretos'))
  // P&B que deixa cor passar não existe (o motor zera a croma): P&B neutro passa
  assert.ok(qc({ pb: { ativo: true } }).aprovado)
  assert.equal(eTonalizado({ tonalizacao: { altas: { matiz: 40, saturacao: 5, luz: 0 } } }), true)
  assert.equal(eTonalizado({ luz: { contraste: 10 } }), false)
})

test('famílias diferentes de verdade: o estilo médio de cada família se afasta do das outras', () => {
  // distância entre famílias medida no que o qc mede (tom da rampa e cor da cartela)
  const medida = (p) => {
    const m = qc(p).medidas
    return [m.sombras, m.altas, m.cromaDaCartela, ...m.peles.flatMap((x) => [x.min ?? 0, x.max ?? 0]).map((v) => v / 100)]
  }
  const porFamilia = new Map()
  for (const p of estilosDaCasa()) {
    if (!porFamilia.has(p.familia)) porFamilia.set(p.familia, [])
    porFamilia.get(p.familia).push(medida(p))
  }
  const media = (l) => l[0].map((_, k) => l.reduce((s, v) => s + v[k], 0) / l.length)
  const centros = [...porFamilia.values()].map(media)
  let menor = Infinity
  for (let i = 0; i < centros.length; i++)
    for (let j = i + 1; j < centros.length; j++) menor = Math.min(menor, Math.hypot(...centros[i].map((v, k) => v - centros[j][k])))
  assert.ok(menor > 0.003, `duas famílias quase iguais (${menor})`)
  // e o preto e branco é preto e branco
  for (const p of estilosDaCasa().filter((x) => x.familia === 'Preto e branco')) assert.equal(p.ajustes.pb.ativo, true)
})

test('biblioteca: acrescentar, favoritar, usar, buscar, duplicar, renomear, mover, reordenar, remover', () => {
  let e = criarBiblioteca()
  const minha = criarPredefinicao({ nome: 'Show da banda', familia: 'Palco e show', ajustes: { luz: { contraste: 30 } } }, { agora: AGORA })
  e = acrescentar(e, minha)
  assert.equal(achar(e, minha.id).nome, 'Show da banda')
  assert.throws(
    () => acrescentar(e, estilosDaCasa()[0]),
    (x) => x.codigo === 'da-casa',
  )
  // favoritos e recentes
  const casa = estilosDaCasa()
  e = favoritar(e, casa[3].id)
  e = favoritar(e, minha.id)
  assert.deepEqual(
    favoritas(e).map((p) => p.id),
    [casa[3].id, minha.id],
  )
  e = favoritar(e, casa[3].id)
  assert.deepEqual(
    favoritas(e).map((p) => p.id),
    [minha.id],
  )
  e = usar(usar(usar(e, casa[0].id), minha.id), casa[0].id)
  assert.deepEqual(
    recentes(e).map((p) => p.id),
    [casa[0].id, minha.id],
  )
  // busca sem acento e sem caixa
  assert.ok(buscar(e, 'palco BANDA').some((p) => p.id === minha.id))
  assert.ok(buscar(e, 'preto branco').every((p) => /preto|branco/i.test(`${p.nome} ${p.familia} ${p.descricao}`)))
  // duplicar um estilo da casa vai para "Minhas" com nome livre
  const { estado: e2, predefinicao: copia } = duplicar(e, casa[0].id, { agora: AGORA })
  assert.equal(copia.familia, 'Minhas')
  assert.equal(copia.nome, `${casa[0].nome} cópia`)
  assert.equal(duplicar(e2, casa[0].id, { agora: AGORA }).predefinicao.nome, `${casa[0].nome} cópia 2`)
  e = e2
  assert.throws(
    () => renomear(e, casa[0].id, 'x'),
    (x) => x.codigo === 'da-casa',
  )
  e = renomear(e, copia.id, 'Meu limpo')
  assert.equal(achar(e, copia.id).nome, 'Meu limpo')
  e = moverDeFamilia(e, copia.id, 'Casamentos 2026')
  assert.ok(familias(e).includes('Casamentos 2026'))
  assert.deepEqual(familias(e).slice(0, FAMILIAS.length), FAMILIAS)
  // ordem manual da família
  const palco = porFamilia(e)
    .find((g) => g.familia === 'Palco e show')
    .predefinicoes.map((p) => p.id)
  e = reordenar(e, 'Palco e show', [minha.id, ...palco.filter((id) => id !== minha.id)])
  assert.equal(porFamilia(e).find((g) => g.familia === 'Palco e show').predefinicoes[0].id, minha.id)
  assert.equal(porFamilia(e, { soFavoritos: true }).length, 1)
  // remover tira de todas as listas
  e = remover(e, minha.id)
  assert.equal(achar(e, minha.id), null)
  assert.ok(!e.favoritos.includes(minha.id) && !e.recentes.includes(minha.id) && !e.ordem['Palco e show'].includes(minha.id))
})

test('biblioteca: as funções não mexem no estado recebido e o estado estragado vira válido', () => {
  const e = criarBiblioteca()
  const congelado = JSON.stringify(e)
  favoritar(e, estilosDaCasa()[0].id)
  assert.equal(JSON.stringify(e), congelado)
  const n = normalizarBiblioteca({
    predefinicoes: [{ nome: '' }, { zro: 'foto.predefinicao', versao: 1, nome: 'Boa' }],
    favoritos: ['nao-existe'],
    recentes: 'x',
  })
  assert.equal(n.predefinicoes.length, 1)
  assert.deepEqual(n.favoritos, [])
  assert.deepEqual(n.recentes, [])
})

test('ordenar: nome, criação, recentes e manual', () => {
  const a = criarPredefinicao({ nome: 'Água', ajustes: {} }, { agora: '2026-01-01T00:00:00.000Z' })
  const b = criarPredefinicao({ nome: 'Brasa', ajustes: {} }, { agora: '2026-06-01T00:00:00.000Z' })
  const c = criarPredefinicao({ nome: 'acaso', ajustes: {} }, { agora: '2026-03-01T00:00:00.000Z' })
  const lista = [b, c, a]
  assert.deepEqual(
    ordenar(lista, 'nome').map((p) => p.nome),
    ['acaso', 'Água', 'Brasa'],
  )
  assert.deepEqual(
    ordenar(lista, 'criacao').map((p) => p.nome),
    ['Brasa', 'acaso', 'Água'],
  )
  let e = criarBiblioteca()
  for (const p of lista) e = acrescentar(e, p)
  e = usar(e, a.id)
  assert.equal(ordenar(lista, 'recentes', e)[0].id, a.id)
  assert.throws(() => ordenar(lista, 'sorteio'))
})

test('exportar e importar a biblioteca (.zropack): ida e volta, repetidas e estilo da casa como cópia', () => {
  let e = criarBiblioteca()
  const p = criarPredefinicao({ nome: 'Minha', ajustes: { cor: { vibracao: 12 } } }, { agora: AGORA })
  e = acrescentar(e, p)
  const pacote = exportar(e, { agora: AGORA })
  assert.equal(pacote.predefinicoes.length, 1)
  const texto = serializarPacote(exportar(e, { ids: [p.id, estilosDaCasa()[0].id], agora: AGORA }))
  const r = importar(criarBiblioteca(), texto, { agora: AGORA })
  assert.equal(r.entraram.length, 2)
  assert.equal(r.erros.length, 0)
  const daCasa = r.estado.predefinicoes.find((x) => x.nome === estilosDaCasa()[0].nome)
  assert.ok(daCasa && !daCasa.id.startsWith('casa-'))
  const de_novo = importar(r.estado, texto, { agora: AGORA })
  assert.ok(de_novo.repetidas.includes(p.id))
})
