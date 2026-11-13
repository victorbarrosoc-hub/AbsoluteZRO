// Nome de arquivo (fichas, saneamento, colisão), receita de saída, predefinições de saída e a fila do lote.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ESPACOS_DE_SAIDA,
  ESTADOS,
  FORMATOS,
  METADADOS,
  PREDEFINICOES_DE_SAIDA,
  chaveDeSaida,
  criarFila,
  extensaoDaReceita,
  normalizarReceita,
  receitaDaPredefinicao,
} from '../src/exportar/fila.js'
import { EXTENSOES, FICHAS, criarNomes, fichasDoModelo, nomeDeSaida, preencherModelo, sanear, segmentosDaPasta, semExtensao } from '../src/exportar/nome.js'
import { sorteio } from './apoio-exportar.js'

// ─────────── nome ───────────

const FOTO = { nome: 'IMG_0042.CR3', data: '2026-09-17T18:45:03', trabalho: 'Casamento Ana e Leo', estrelas: 4, predefinicao: 'Filme quente' }

test('nome: cada ficha vira o valor, com sequência de tamanho pedido', () => {
  assert.deepEqual(FICHAS, ['nome', 'seq', 'data', 'trabalho', 'estrelas', 'predefinicao'])
  assert.equal(preencherModelo('{nome}', FOTO), 'IMG_0042')
  assert.equal(preencherModelo('{trabalho}-{seq:4}', { ...FOTO, seq: 7 }), 'Casamento Ana e Leo-0007')
  assert.equal(preencherModelo('{data}_{nome}_{estrelas}e_{predefinicao}', FOTO), '2026-09-17_IMG_0042_4e_Filme quente')
  assert.equal(preencherModelo('{seq}', { ...FOTO, seq: 12 }), '12')
  assert.equal(preencherModelo('{seq:2}', { ...FOTO, seq: 12345 }), '12345', 'sequência maior que o tamanho não é cortada')
  assert.equal(preencherModelo('{ seq : 3 }', { ...FOTO, seq: 5 }), '005', 'espaços dentro da ficha são tolerados')
  // ficha vazia ou desconhecida some; modelo que não gera nada vira o nome original
  assert.equal(preencherModelo('{nome}-{data}', { nome: 'a.jpg' }), 'a-')
  assert.equal(preencherModelo('{nmoe}-{nome}', FOTO), '-IMG_0042')
  assert.equal(preencherModelo('{trabalho}', { nome: 'DSC_1.NEF' }), 'DSC_1')
  assert.equal(preencherModelo('', FOTO), 'IMG_0042')
  assert.equal(preencherModelo(null, {}), 'foto')
  assert.deepEqual(fichasDoModelo('{nome}_{seq:4}_{nmoe}_{data}_{x}'), { conhecidas: ['nome', 'seq', 'data'], desconhecidas: ['nmoe', 'x'] })
  assert.equal(semExtensao('pasta/sub\\arquivo.final.dng'), 'arquivo.final')
  assert.equal(semExtensao('.oculto'), '.oculto')
  // o valor de uma ficha não cria pasta
  assert.equal(preencherModelo('{trabalho}_{nome}', { nome: 'a.jpg', trabalho: 'Ana/Leo\\2026' }), 'Ana-Leo-2026_a')
})

test('nome: saneado para Windows e macOS — proibidos, reservados, pontas, controle, comprimento', () => {
  assert.equal(sanear('a<b>c:d"e/f\\g|h?i*j'), 'a-b-c-d-e-f-g-h-i-j')
  assert.equal(sanear('  nome  com   espaços  '), 'nome com espaços')
  assert.equal(sanear('nome...'), 'nome')
  assert.equal(sanear('...nome'), 'nome', 'ponto na frente esconderia o arquivo')
  assert.equal(sanear('nome. '), 'nome')
  assert.equal(sanear('a\u0000b\u0007c\u001fd\u007fe\tf\ng'), 'abcde f g')
  assert.equal(sanear(''), 'foto')
  assert.equal(sanear('???'), '-')
  assert.equal(sanear(' . '), 'foto')
  for (const reservado of ['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9', 'CON.txt', 'nul.tar.gz']) {
    assert.equal(sanear(reservado), `_${reservado}`, reservado)
  }
  for (const livre of ['CONTA', 'COM10', 'LPT', 'console', 'NULO']) assert.equal(sanear(livre), livre)
  // NFC: "é" decomposto (e + acento) vira o composto, o mesmo nome em qualquer sistema
  assert.equal(sanear('café'), 'café')
  assert.equal(sanear('café').length, 4)
  // 255 bytes em UTF-8, sem partir caractere
  const longo = sanear('ã'.repeat(400))
  assert.equal(new TextEncoder().encode(longo).length, 254)
  assert.equal(longo, 'ã'.repeat(127))
  const emoji = sanear('📷'.repeat(100))
  assert.ok(new TextEncoder().encode(emoji).length <= 255 && emoji === '📷'.repeat(63), 'par substituto inteiro')
  // sorteio: o que sai é sempre válido
  const r = sorteio(41)
  const alfabeto = 'aB9 ._-<>:"/\\|?*\u0000\u001fçé📷\t'
  for (let i = 0; i < 2000; i++) {
    const entrada = Array.from({ length: Math.floor(r() * 40) }, () => Array.from(alfabeto)[Math.floor(r() * Array.from(alfabeto).length)]).join('')
    const s = sanear(entrada)
    assert.ok(s.length > 0, 'nunca vazio')
    assert.ok(!/[<>:"/\\|?*]/.test(s), `caractere proibido em ${JSON.stringify(s)}`)
    assert.ok(
      Array.from(s).every((c) => c.codePointAt(0) >= 32 && c.codePointAt(0) !== 127),
      'sem caractere de controle',
    )
    assert.ok(!/^[\s.]|[\s.]$/.test(s), `ponta com ponto ou espaço em ${JSON.stringify(s)}`)
    assert.equal(s, s.normalize('NFC'))
    assert.equal(sanear(s), s, 'sanear o que já está saneado não muda nada')
  }
})

test('nome: colisão resolve com -2, -3 e nunca devolve um nome que já existe', () => {
  const nomes = criarNomes({ modelo: '{nome}', extensao: 'jpeg', existentes: ['IMG_0042.jpg', 'img_0042-2.JPG', 'outra.jpg'] })
  // "IMG_0042.jpg" existe e "IMG_0042-2.jpg" também (em maiúsculas diferentes: o disco não diferencia)
  assert.equal(nomes.proximo(FOTO), 'IMG_0042-3.jpg')
  assert.equal(nomes.proximo(FOTO), 'IMG_0042-4.jpg', 'o nome entregue passa a contar como existente')
  assert.equal(nomes.proximo({ nome: 'nova.CR3' }), 'nova.jpg')
  assert.equal(nomes.proximo({ nome: 'NOVA.cr3' }), 'NOVA-2.jpg')
  assert.ok(nomes.tem('img_0042-3.jpg'))
  nomes.reservar('reservada.jpg')
  assert.equal(nomes.proximo({ nome: 'reservada.dng' }), 'reservada-2.jpg')
  // NFC na comparação: "café" composto e decomposto são o mesmo arquivo
  const acento = criarNomes({ existentes: ['café.jpg'] })
  assert.equal(acento.proximo({ nome: 'café.nef' }), 'café-2.jpg')
  // sequência do lote anda sozinha; extensão por formato
  const lote = criarNomes({ modelo: '{trabalho}_{seq:3}', extensao: 'tiff', inicio: 9 })
  assert.deepEqual(
    [lote.proximo(FOTO), lote.proximo(FOTO), lote.proximo({ ...FOTO, seq: 500 })],
    ['Casamento Ana e Leo_009.tif', 'Casamento Ana e Leo_010.tif', 'Casamento Ana e Leo_500.tif'],
  )
  assert.deepEqual(EXTENSOES, { jpeg: 'jpg', tiff: 'tif', png: 'png', webp: 'webp' })
  assert.equal(nomeDeSaida('{nome}', FOTO, { extensao: 'png', existentes: ['IMG_0042.png'] }), 'IMG_0042-2.png')
  // nome no limite: ainda cabe o sufixo e a extensão em 255 bytes
  const longo = criarNomes({ existentes: [`${'x'.repeat(234)}.jpg`] })
  const saida = longo.proximo({ nome: `${'x'.repeat(300)}.cr2` })
  assert.ok(new TextEncoder().encode(saida).length <= 255 && saida.endsWith('-2.jpg'), saida.length)
  // sorteio: mil nomes de um lote com muita repetição, todos diferentes entre si e dos que já existiam
  const r = sorteio(43)
  const existentes = Array.from({ length: 50 }, (_, i) => `IMG_${i % 10}.jpg`)
  const gerador = criarNomes({ existentes })
  const vistos = new Set(existentes.map((n) => n.toLowerCase()))
  for (let i = 0; i < 1000; i++) {
    const nome = gerador.proximo({ nome: `IMG_${Math.floor(r() * 10)}.RAF` })
    assert.ok(!vistos.has(nome.toLowerCase()), `repetiu ${nome}`)
    vistos.add(nome.toLowerCase())
  }
})

test('nome: pasta de destino em segmentos saneados, sem subir de pasta', () => {
  assert.deepEqual(segmentosDaPasta('Entrega'), ['Entrega'])
  assert.deepEqual(segmentosDaPasta('{trabalho}/Entrega\\{data}', FOTO), ['Casamento Ana e Leo', 'Entrega', '2026-09-17'])
  assert.deepEqual(segmentosDaPasta('../../etc/./x'), ['etc', 'x'])
  assert.deepEqual(segmentosDaPasta('a//b/ /c:d'), ['a', 'b', 'c-d'])
  assert.deepEqual(segmentosDaPasta('{trabalho}/Prova', {}), ['Prova'], 'ficha sem valor não vira pasta')
  assert.deepEqual(segmentosDaPasta(''), [])
  assert.deepEqual(segmentosDaPasta(null), [])
  assert.deepEqual(segmentosDaPasta('CON/aux'), ['_CON', '_aux'])
})

// ─────────── receita ───────────

test('receita: qualquer entrada vira receita válida, e normalizar de novo não muda nada', () => {
  const padrao = normalizarReceita()
  assert.deepEqual(padrao, {
    formato: 'jpeg',
    qualidade: 90,
    bits: 8,
    espaco: 'srgb',
    tamanho: { tipo: 'original', ampliar: false },
    nitidez: null,
    metadados: 'sem-local',
    marcaDagua: null,
    nome: '{nome}',
    pasta: '',
    compressao: null,
  })
  for (const lixo of [
    null,
    undefined,
    42,
    'jpeg',
    [],
    { formato: 'bmp', qualidade: 'alta', bits: 12, espaco: 'cmyk', tamanho: 'grande', nitidez: 7, metadados: 'x', marcaDagua: {}, nome: 9, pasta: {} },
  ]) {
    assert.deepEqual(normalizarReceita(lixo), padrao, JSON.stringify(lixo))
  }
  assert.deepEqual(FORMATOS, ['jpeg', 'tiff', 'png', 'webp'])
  assert.deepEqual(ESPACOS_DE_SAIDA, ['srgb', 'p3', 'adobe', 'rec2020', 'prophoto'])
  assert.deepEqual(METADADOS, ['todos', 'sem-local', 'so-direitos', 'nenhum'])

  // faixas
  assert.equal(normalizarReceita({ qualidade: 150 }).qualidade, 100)
  assert.equal(normalizarReceita({ qualidade: -3 }).qualidade, 1)
  assert.equal(normalizarReceita({ qualidade: 91.6 }).qualidade, 92)
  // 16 bits só onde existe; formato sem perda não tem qualidade
  assert.equal(normalizarReceita({ formato: 'jpeg', bits: 16 }).bits, 8)
  assert.equal(normalizarReceita({ formato: 'webp', bits: 16 }).bits, 8)
  assert.deepEqual(
    [normalizarReceita({ formato: 'tiff', bits: 16, qualidade: 50 }).bits, normalizarReceita({ formato: 'tiff', bits: 16, qualidade: 50 }).qualidade],
    [16, null],
  )
  assert.equal(normalizarReceita({ formato: 'png', bits: 16 }).bits, 16)
  // compressão só no TIFF
  assert.equal(normalizarReceita({ formato: 'tiff' }).compressao, 'nenhuma')
  assert.equal(normalizarReceita({ formato: 'tiff', compressao: 'deflate' }).compressao, 'deflate')
  assert.equal(normalizarReceita({ formato: 'png', compressao: 'deflate' }).compressao, null)
  // WebP sem perfil embutido só pode ser sRGB
  assert.equal(normalizarReceita({ formato: 'webp', espaco: 'p3' }).espaco, 'srgb')
  for (const espaco of ESPACOS_DE_SAIDA) assert.equal(normalizarReceita({ formato: 'jpeg', espaco }).espaco, espaco)
  // tamanho
  assert.deepEqual(normalizarReceita({ tamanho: 2048 }).tamanho, { tipo: 'lado', px: 2048, ampliar: false })
  assert.deepEqual(normalizarReceita({ tamanho: { tipo: 'lado', px: 1e9, ampliar: true } }).tamanho, { tipo: 'lado', px: 65535, ampliar: true })
  assert.deepEqual(normalizarReceita({ tamanho: { tipo: 'lado', px: 3 } }).tamanho, { tipo: 'lado', px: 16, ampliar: false })
  assert.deepEqual(normalizarReceita({ tamanho: { tipo: 'megapixels', mp: 12.3456 } }).tamanho, { tipo: 'megapixels', mp: 12.35, ampliar: false })
  assert.deepEqual(normalizarReceita({ tamanho: { tipo: 'caixa', largura: 1920.4, altura: 1080 } }).tamanho, {
    tipo: 'caixa',
    largura: 1920,
    altura: 1080,
    ampliar: false,
  })
  assert.deepEqual(normalizarReceita({ tamanho: { tipo: 'caixa', largura: 1920 } }).tamanho, { tipo: 'original', ampliar: false })
  assert.deepEqual(normalizarReceita({ tamanho: { tipo: 'lado', px: -5 } }).tamanho, { tipo: 'original', ampliar: false })
  // nitidez e marca
  assert.deepEqual(normalizarReceita({ nitidez: 'fosco' }).nitidez, { destino: 'fosco', intensidade: 'padrao' })
  assert.deepEqual(normalizarReceita({ nitidez: { destino: 'brilhante', intensidade: 'alta' } }).nitidez, { destino: 'brilhante', intensidade: 'alta' })
  assert.equal(normalizarReceita({ nitidez: { destino: 'outdoor' } }).nitidez, null)
  assert.deepEqual(normalizarReceita({ marcaDagua: '  © Ana  ' }).marcaDagua, {
    texto: '© Ana',
    posicao: 'inferior-direito',
    opacidade: 0.5,
    tamanho: 0.25,
    margem: 0.03,
  })
  assert.deepEqual(normalizarReceita({ marcaDagua: { texto: 'x', posicao: 'canto', opacidade: 9, tamanho: 0, margem: 2 } }).marcaDagua, {
    texto: 'x',
    posicao: 'inferior-direito',
    opacidade: 1,
    tamanho: 0.01,
    margem: 0.45,
  })
  assert.equal(normalizarReceita({ marcaDagua: { texto: '   ' } }).marcaDagua, null)
  assert.equal(normalizarReceita({ nome: 'x'.repeat(500) }).nome.length, 200)

  // idempotente e serializável, em entradas sorteadas
  const r = sorteio(51)
  const escolher = (lista) => lista[Math.floor(r() * lista.length)]
  for (let i = 0; i < 500; i++) {
    const entrada = {
      formato: escolher([...FORMATOS, 'gif', undefined]),
      qualidade: escolher([undefined, r() * 200 - 50, 'x']),
      bits: escolher([8, 16, 32, undefined]),
      espaco: escolher([...ESPACOS_DE_SAIDA, 'xyz', undefined]),
      tamanho: escolher([
        undefined,
        1000 * r(),
        { tipo: 'lado', px: r() * 9000 },
        { tipo: 'megapixels', mp: r() * 60 },
        { tipo: 'caixa', largura: r() * 4000, altura: r() * 4000, ampliar: r() < 0.5 },
        { tipo: 'x' },
      ]),
      nitidez: escolher([null, 'tela', { destino: 'fosco', intensidade: 'baixa' }, { destino: 1 }]),
      metadados: escolher([...METADADOS, 'tudo', undefined]),
      marcaDagua: escolher([null, 'PROVA', { texto: 'a', posicao: 'diagonal', opacidade: r() * 2 }, { posicao: 'centro' }]),
      nome: escolher(['{nome}', '', undefined, '{trabalho}-{seq:3}']),
      pasta: escolher(['', 'Entrega', undefined, 5]),
      compressao: escolher([undefined, 'deflate', 'lzw']),
    }
    const receita = normalizarReceita(entrada)
    assert.deepEqual(normalizarReceita(receita), receita, 'idempotente')
    assert.deepEqual(JSON.parse(JSON.stringify(receita)), receita, 'JSON puro')
    assert.ok(FORMATOS.includes(receita.formato) && ESPACOS_DE_SAIDA.includes(receita.espaco) && METADADOS.includes(receita.metadados))
    assert.ok(receita.bits === 8 || (receita.bits === 16 && ['tiff', 'png'].includes(receita.formato)))
    assert.ok(receita.formato !== 'webp' || receita.espaco === 'srgb')
    assert.equal(Object.keys(receita).length, 11)
  }
})

test('predefinições de saída: Entrega, Instagram, Prova do cliente e Impressão', () => {
  assert.deepEqual(
    PREDEFINICOES_DE_SAIDA.map((p) => p.id),
    ['entrega', 'instagram', 'prova', 'impressao'],
  )
  assert.deepEqual(
    PREDEFINICOES_DE_SAIDA.map((p) => p.nome),
    ['Entrega', 'Instagram', 'Prova do cliente', 'Impressão'],
  )
  for (const p of PREDEFINICOES_DE_SAIDA) {
    assert.deepEqual(normalizarReceita(p.receita), p.receita, `${p.id}: receita já normalizada`)
    assert.ok(p.descricao.length > 0 && p.descricao.length < 80)
  }
  const entrega = receitaDaPredefinicao('entrega')
  assert.deepEqual(
    [entrega.formato, entrega.espaco, entrega.qualidade, entrega.tamanho.tipo, entrega.marcaDagua, entrega.metadados],
    ['jpeg', 'p3', 92, 'original', null, 'sem-local'],
  )
  const instagram = receitaDaPredefinicao('instagram')
  assert.deepEqual([instagram.formato, instagram.espaco, instagram.tamanho], ['jpeg', 'srgb', { tipo: 'lado', px: 2160, ampliar: false }])
  const prova = receitaDaPredefinicao('prova')
  assert.deepEqual([prova.tamanho, prova.metadados, prova.espaco], [{ tipo: 'lado', px: 2048, ampliar: false }, 'nenhum', 'srgb'])
  assert.ok(prova.marcaDagua && prova.marcaDagua.texto.length > 0)
  const impressao = receitaDaPredefinicao('impressao')
  assert.deepEqual([impressao.formato, impressao.bits, impressao.espaco, impressao.tamanho.tipo, impressao.qualidade], ['tiff', 16, 'adobe', 'original', null])
  assert.deepEqual(
    ['entrega', 'instagram', 'prova', 'impressao'].map((id) => extensaoDaReceita(receitaDaPredefinicao(id))),
    ['jpg', 'jpg', 'jpg', 'tif'],
  )
  // é uma cópia: mexer nela não mexe na predefinição
  entrega.qualidade = 10
  assert.equal(receitaDaPredefinicao('entrega').qualidade, 92)
  assert.equal(receitaDaPredefinicao('nao-existe'), null)
  assert.throws(() => {
    PREDEFINICOES_DE_SAIDA[0].nome = 'x'
  }, TypeError)
})

test('chave de saída: a mesma foto, os mesmos ajustes e a mesma receita dão a mesma chave; qualquer mudança dá outra', () => {
  const ajustes = { versao: 1, luz: { exposicao: 0.3, contraste: 10 }, cor: { vibracao: 5 } }
  const receita = receitaDaPredefinicao('entrega')
  const base = chaveDeSaida({ foto: 'f1', ajustes, receita })
  assert.match(base, /^[0-9a-f]{16}$/)
  // ordem das chaves e receita crua × normalizada não importam
  assert.equal(
    chaveDeSaida({ receita: { ...receita }, ajustes: { cor: { vibracao: 5 }, luz: { contraste: 10, exposicao: 0.3 }, versao: 1 }, foto: 'f1' }),
    base,
  )
  assert.equal(chaveDeSaida({ foto: 'f1', ajustes, receita: { formato: 'jpeg', qualidade: 92, espaco: 'p3', pasta: 'Entrega' } }), base)
  assert.equal(chaveDeSaida({ foto: 'f1', ajustes: structuredClone(ajustes), receita: structuredClone(receita) }), base)
  const outras = [
    chaveDeSaida({ foto: 'f2', ajustes, receita }),
    chaveDeSaida({ foto: 'f1', ajustes: { ...ajustes, luz: { exposicao: 0.31, contraste: 10 } }, receita }),
    chaveDeSaida({ foto: 'f1', ajustes: null, receita }),
    chaveDeSaida({ foto: 'f1', ajustes, receita: { ...receita, qualidade: 91 } }),
    chaveDeSaida({ foto: 'f1', ajustes, receita: { ...receita, espaco: 'srgb' } }),
    chaveDeSaida({ foto: 'f1', ajustes, receita: { ...receita, pasta: 'Outra' } }),
    chaveDeSaida({ foto: 'f1', ajustes, receita: { ...receita, nome: '{nome}-b' } }),
    chaveDeSaida({ foto: 'f1', ajustes, receita: { ...receita, tamanho: 2048 } }),
    chaveDeSaida({ foto: 'f1', ajustes, receita: { ...receita, metadados: 'nenhum' } }),
  ]
  assert.equal(new Set([base, ...outras]).size, outras.length + 1)
  // sem colisão em vinte mil fotos
  const muitas = new Set()
  for (let i = 0; i < 20000; i++) muitas.add(chaveDeSaida({ foto: `foto-${i}`, ajustes, receita }))
  assert.equal(muitas.size, 20000)
})

// ─────────── fila ───────────

const RECEITA = receitaDaPredefinicao('entrega')
const item = (n, extra = {}) => ({ id: `i${n}`, foto: `foto-${n}`, ajustes: { versao: 1 }, receita: RECEITA, ...extra })
const estados = (fila) => fila.estado().itens.map((x) => x.estado)

test('fila: estados, limite de simultâneos e progresso', () => {
  assert.deepEqual(ESTADOS, ['na-fila', 'tratando', 'pronta', 'falhou', 'pulada'])
  const fila = criarFila({ itens: [1, 2, 3, 4, 5].map((n) => item(n)), simultaneos: 2 })
  assert.deepEqual(fila.estado().contagem, { total: 5, naFila: 5, tratando: 0, prontas: 0, falhas: 0, puladas: 0 })
  assert.equal(fila.estado().progresso, 0)
  assert.equal(fila.estado().terminada, false)

  const primeiros = fila.proximos()
  assert.deepEqual(
    primeiros.map((x) => x.id),
    ['i1', 'i2'],
    'só dois de cada vez, na ordem',
  )
  assert.equal(primeiros[0].dados.foto, 'foto-1')
  assert.deepEqual(fila.proximos(), [], 'sem vaga, nada novo')
  assert.deepEqual(estados(fila), ['tratando', 'tratando', 'na-fila', 'na-fila', 'na-fila'])

  fila.concluir('i1', { arquivo: 'a.jpg' })
  assert.deepEqual(
    fila.proximos().map((x) => x.id),
    ['i3'],
    'abriu uma vaga',
  )
  fila.falhar('i2', new Error('disco cheio'))
  fila.falhar('i3', 'sem permissão na pasta')
  const meio = fila.estado()
  assert.deepEqual(meio.contagem, { total: 5, naFila: 2, tratando: 0, prontas: 1, falhas: 2, puladas: 0 })
  assert.equal(meio.progresso, 3 / 5)
  assert.deepEqual(
    meio.itens.map((x) => x.motivo),
    [null, 'disco cheio', 'sem permissão na pasta', null, null],
  )
  assert.deepEqual(meio.itens[0].resultado, { arquivo: 'a.jpg' })

  fila.pular('i4', 'arquivo original sumiu')
  for (const x of fila.proximos()) fila.concluir(x.id)
  const fim = fila.estado()
  assert.deepEqual(fim.contagem, { total: 5, naFila: 0, tratando: 0, prontas: 2, falhas: 2, puladas: 1 })
  assert.deepEqual([fim.progresso, fim.terminada], [1, true])
  assert.equal(fim.itens[3].motivo, 'arquivo original sumiu')
  // o retrato é JSON puro
  assert.deepEqual(JSON.parse(JSON.stringify(fim)), fim)
  // transições inválidas são recusadas
  assert.throws(() => fila.concluir('i1'), /não está em tratamento/)
  assert.throws(() => fila.falhar('nao-existe', 'x'), /desconhecido/)
  assert.throws(() => criarFila({ itens: [item(1), item(1)] }), /id repetido/)
  // falha sem motivo ainda diz alguma coisa
  const outra = criarFila({ itens: [item(1)] })
  outra.proximos()
  outra.falhar('i1')
  assert.equal(outra.estado().itens[0].motivo, 'falhou sem dizer o motivo')
})

test('fila: pausar, retomar e cancelar', () => {
  const fila = criarFila({ itens: [1, 2, 3, 4].map((n) => item(n)), simultaneos: 1 })
  assert.deepEqual(
    fila.proximos().map((x) => x.id),
    ['i1'],
  )
  fila.pausar()
  assert.equal(fila.estado().pausada, true)
  fila.concluir('i1')
  assert.deepEqual(fila.proximos(), [], 'em pausa não começa nada novo (o que estava em curso terminou)')
  fila.retomar()
  assert.deepEqual(
    fila.proximos().map((x) => x.id),
    ['i2'],
  )

  fila.cancelar()
  assert.deepEqual(estados(fila), ['pronta', 'tratando', 'pulada', 'pulada'])
  assert.deepEqual(
    fila
      .estado()
      .itens.slice(2)
      .map((x) => x.motivo),
    ['cancelada', 'cancelada'],
  )
  assert.deepEqual(fila.proximos(), [])
  // o que estava em curso: se terminar, vale; se cair, não é falha
  fila.falhar('i2', new Error('abortado'))
  assert.deepEqual([fila.estado().itens[1].estado, fila.estado().itens[1].motivo], ['pulada', 'cancelada'])
  assert.deepEqual([fila.estado().cancelada, fila.estado().terminada, fila.estado().contagem.falhas], [true, true, 0])

  const outra = criarFila({ itens: [item(1), item(2)], simultaneos: 2 })
  outra.proximos()
  outra.cancelar()
  outra.concluir('i1')
  assert.equal(outra.estado().itens[0].estado, 'pronta', 'trabalho que terminou depois do cancelamento está feito')
  // item acrescentado a um lote cancelado não roda
  outra.adicionar([item(9)])
  assert.deepEqual([outra.estado().itens[2].estado, outra.estado().itens[2].motivo], ['pulada', 'cancelada'])
})

test('fila: repetir só as que falharam', () => {
  const fila = criarFila({ itens: [1, 2, 3, 4].map((n) => item(n)), simultaneos: 4 })
  fila.proximos()
  fila.concluir('i1')
  fila.falhar('i2', 'erro A')
  fila.falhar('i3', 'erro B')
  fila.pular('i4', 'pulada pela pessoa')
  assert.equal(fila.estado().terminada, true)
  assert.equal(fila.repetirFalhas(), 2)
  assert.deepEqual(estados(fila), ['pronta', 'na-fila', 'na-fila', 'pulada'])
  assert.deepEqual(
    fila.proximos().map((x) => x.id),
    ['i2', 'i3'],
    'a pronta e a pulada não voltam',
  )
  fila.concluir('i2')
  fila.falhar('i3', 'erro B de novo')
  assert.deepEqual(
    fila.estado().itens.map((x) => x.tentativas),
    [1, 2, 2, 1],
  )
  assert.equal(fila.estado().itens[2].motivo, 'erro B de novo')
  assert.equal(fila.repetirFalhas(), 1)
  fila.proximos()
  fila.concluir('i3')
  assert.equal(fila.repetirFalhas(), 0, 'sem falhas, nada volta')
  assert.deepEqual(fila.estado().contagem, { total: 4, naFila: 0, tratando: 0, prontas: 3, falhas: 0, puladas: 1 })
  // repetir reabre um lote cancelado
  const cancelada = criarFila({ itens: [item(1), item(2)], simultaneos: 1 })
  cancelada.proximos()
  cancelada.falhar('i1', 'x')
  cancelada.cancelar()
  assert.equal(cancelada.repetirFalhas(), 1)
  assert.equal(cancelada.estado().cancelada, false)
  assert.deepEqual(
    cancelada.proximos().map((x) => x.id),
    ['i1'],
    'só a que falhou; a cancelada continua pulada',
  )
})

test('fila: idempotência — a mesma saída não é refeita, no lote e entre lotes', () => {
  const itens = [
    item(1),
    { id: 'repetida', foto: 'foto-1', ajustes: { versao: 1 }, receita: structuredClone(RECEITA) }, // a mesma saída com outro id
    { id: 'outra-receita', foto: 'foto-1', ajustes: { versao: 1 }, receita: receitaDaPredefinicao('instagram') },
    { id: 'outros-ajustes', foto: 'foto-1', ajustes: { versao: 1, luz: { exposicao: 1 } }, receita: RECEITA },
    item(2),
  ]
  const fila = criarFila({ itens, simultaneos: 10 })
  assert.deepEqual(estados(fila), ['na-fila', 'pulada', 'na-fila', 'na-fila', 'na-fila'])
  assert.equal(fila.estado().itens[1].motivo, 'repetida')
  assert.equal(fila.estado().itens[0].chave, fila.estado().itens[1].chave)
  assert.equal(new Set(fila.estado().itens.map((x) => x.chave)).size, 4)
  const rodados = fila.proximos().map((x) => x.id)
  assert.deepEqual(rodados, ['i1', 'outra-receita', 'outros-ajustes', 'i2'])
  for (const id of rodados.slice(0, 3)) fila.concluir(id)
  fila.falhar('i2', 'falhou')
  const feitas = fila.chavesFeitas()
  assert.equal(feitas.length, 3, 'só o que ficou pronto conta como feito')

  // segundo lote, com as chaves do primeiro: só roda o que falhou e o que é novo
  const segunda = criarFila({ itens: [...itens, item(3)], feitas })
  assert.deepEqual(estados(segunda), ['pulada', 'pulada', 'pulada', 'pulada', 'na-fila', 'na-fila'])
  assert.deepEqual(
    segunda
      .estado()
      .itens.slice(0, 4)
      .map((x) => x.motivo),
    ['ja-feita', 'ja-feita', 'ja-feita', 'ja-feita'],
  )
  assert.deepEqual(
    segunda.proximos().map((x) => x.id),
    ['i2', 'i3'],
  )
  // mudou um ajuste da foto 1: aquela saída volta a ser trabalho
  const terceira = criarFila({ itens: [item(1, { ajustes: { versao: 1, cor: { saturacao: 20 } } })], feitas })
  assert.deepEqual(estados(terceira), ['na-fila'])
})

test('fila: estimativa honesta — só aparece depois de N fotos medidas', () => {
  let relogio = 0
  const fila = criarFila({ itens: Array.from({ length: 10 }, (_, i) => item(i + 1)), simultaneos: 2, minimoParaEstimar: 3, agora: () => relogio })
  const rodar = (id, duracao) => {
    relogio += duracao
    fila.concluir(id)
  }
  assert.deepEqual(fila.estado().estimativa, { restanteMs: null, medidos: 0, porItemMs: null })
  fila.proximos() // i1 e i2 começam em 0
  rodar('i1', 1000) // i1: 1000 ms
  assert.equal(fila.estado().estimativa.restanteMs, null, 'uma foto medida não é estimativa')
  rodar('i2', 200) // i2: 1200 ms
  assert.deepEqual([fila.estado().estimativa.restanteMs, fila.estado().estimativa.medidos], [null, 2])
  fila.proximos() // i3 e i4 começam em 1200
  rodar('i3', 800) // i3: 800 ms → média de 1000 ms com três medidas
  const e = fila.estado().estimativa
  assert.equal(e.medidos, 3)
  assert.equal(e.porItemMs, 1000)
  // faltam 6 na fila (6000 ms) e i4, que já andou 800 de 1000 (200 ms): 6200 ms de trabalho em duas frentes
  assert.equal(e.restanteMs, 3100)
  // falha não entra na média (falhar rápido faria a estimativa mentir para menos)
  relogio += 1
  fila.falhar('i4', 'erro')
  assert.equal(fila.estado().estimativa.porItemMs, 1000)
  assert.equal(fila.estado().estimativa.restanteMs, 3000, '6 na fila, duas frentes')
  // o tempo estimado encolhe conforme o lote anda e chega a zero no fim
  let anterior = Infinity
  for (;;) {
    const lote = fila.proximos()
    if (!lote.length) break
    for (const x of lote) rodar(x.id, 500)
    const restante = fila.estado().estimativa.restanteMs
    assert.ok(restante <= anterior, 'a estimativa não cresce com fotos de duração estável')
    anterior = restante
  }
  assert.equal(fila.estado().estimativa.restanteMs, 0)
  // uma frente só: sem dividir
  let t = 0
  const sozinha = criarFila({ itens: [1, 2, 3, 4].map((n) => item(n)), simultaneos: 1, minimoParaEstimar: 1, agora: () => t })
  sozinha.proximos()
  t = 2000
  sozinha.concluir('i1')
  assert.equal(sozinha.estado().estimativa.restanteMs, 6000)
})

test('fila: executar — roda com o limite de simultâneos, guarda o motivo das falhas e avisa a cada mudança', async () => {
  const fila = criarFila({ itens: Array.from({ length: 12 }, (_, i) => item(i + 1)), simultaneos: 3 })
  let emCurso = 0
  let pico = 0
  let avisos = 0
  const parar = fila.assinar(() => avisos++)
  const final = await fila.executar(async (dados, { sinal, id, chave }) => {
    assert.ok(sinal instanceof AbortSignal && typeof id === 'string' && /^[0-9a-f]{16}$/.test(chave))
    emCurso++
    pico = Math.max(pico, emCurso)
    await new Promise((r) => setTimeout(r, 2 + (Number(dados.foto.slice(5)) % 3)))
    emCurso--
    if (dados.foto === 'foto-4') throw new Error('arquivo corrompido')
    if (dados.foto === 'foto-9') throw new RangeError('sem memória')
    return { arquivo: `${dados.foto}.jpg` }
  })
  assert.equal(pico, 3, 'nunca mais de três ao mesmo tempo, e chega a três')
  assert.deepEqual(final.contagem, { total: 12, naFila: 0, tratando: 0, prontas: 10, falhas: 2, puladas: 0 })
  assert.equal(final.terminada, true)
  assert.deepEqual(
    final.itens.filter((x) => x.estado === 'falhou').map((x) => [x.id, x.motivo]),
    [
      ['i4', 'arquivo corrompido'],
      ['i9', 'sem memória'],
    ],
  )
  assert.deepEqual(final.itens[0].resultado, { arquivo: 'foto-1.jpg' })
  assert.ok(final.itens.filter((x) => x.estado === 'pronta').every((x) => x.duracao >= 0))
  assert.ok(final.estimativa.medidos === 10 && final.estimativa.restanteMs === 0)
  // um aviso por foto que termina (12) e um por leva que começa (pelo menos 4 levas de até 3)
  assert.ok(avisos >= 16, `avisou a cada leva que começa e a cada foto que termina (${avisos})`)
  parar()
  // repetir só as que falharam, agora dando certo
  const antes = avisos
  assert.equal(fila.repetirFalhas(), 2)
  const tratadas = []
  const segundo = await fila.executar(async (dados) => {
    tratadas.push(dados.foto)
  })
  assert.deepEqual(tratadas.sort(), ['foto-4', 'foto-9'])
  assert.deepEqual(segundo.contagem, { total: 12, naFila: 0, tratando: 0, prontas: 12, falhas: 0, puladas: 0 })
  assert.equal(avisos, antes, 'assinatura cancelada não é chamada')
  // função síncrona que lança também vira falha com motivo
  const sincrona = criarFila({ itens: [item(1)] })
  const r = await sincrona.executar(() => {
    throw new Error('lançou na hora')
  })
  assert.equal(r.itens[0].motivo, 'lançou na hora')
})

test('fila: executar — pausa espera o retomar; cancelar dispara o sinal e nada mais começa', async () => {
  const fila = criarFila({ itens: Array.from({ length: 6 }, (_, i) => item(i + 1)), simultaneos: 2 })
  const comecaram = []
  let pausou = false
  const execucao = fila.executar(async (dados) => {
    comecaram.push(dados.foto)
    if (!pausou) {
      pausou = true
      fila.pausar()
    }
    await new Promise((r) => setTimeout(r, 5))
  })
  await new Promise((r) => setTimeout(r, 60))
  assert.deepEqual(comecaram, ['foto-1', 'foto-2'], 'em pausa: as duas que já tinham começado terminam e nada novo começa')
  assert.deepEqual(fila.estado().contagem, { total: 6, naFila: 4, tratando: 0, prontas: 2, falhas: 0, puladas: 0 })
  fila.retomar()
  const final = await execucao
  assert.equal(final.contagem.prontas, 6)

  const outra = criarFila({ itens: Array.from({ length: 6 }, (_, i) => item(i + 1)), simultaneos: 2 })
  const sinais = []
  const cancelada = await outra.executar(
    (dados, { sinal }) =>
      new Promise((resolver, rejeitar) => {
        sinais.push(sinal)
        sinal.addEventListener('abort', () => rejeitar(new Error('interrompido')))
        if (dados.foto === 'foto-2') setTimeout(() => outra.cancelar(), 5)
        if (dados.foto === 'foto-1') setTimeout(resolver, 1) // esta termina antes do cancelamento
      }),
  )
  assert.ok(sinais.every((s) => s.aborted))
  assert.equal(cancelada.cancelada, true)
  assert.deepEqual(
    cancelada.contagem,
    { total: 6, naFila: 0, tratando: 0, prontas: 1, falhas: 0, puladas: 5 },
    'interrompida por cancelamento é pulada, não falha',
  )
  assert.ok(cancelada.itens.slice(1).every((x) => x.motivo === 'cancelada'))
  assert.ok(sinais.length <= 3, 'depois do cancelamento nada novo começou')
})
