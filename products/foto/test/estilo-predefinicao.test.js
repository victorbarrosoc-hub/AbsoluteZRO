// O arquivo .zropreset e o pacote .zropack (src/estilo/predefinicao.js).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { neutro, normalizar } from '../src/motor/ajustes.js'
import {
  ErroPredefinicao,
  TIPO,
  aplicar,
  criarPacote,
  criarPredefinicao,
  diferenca,
  gruposMexidos,
  idDe,
  ler,
  lerPacote,
  oQueMexe,
  serializar,
  serializarPacote,
  soEstilo,
  validar,
} from '../src/estilo/predefinicao.js'
import { compactar, criarLut } from '../src/estilo/look.js'

const AGORA = '2026-11-13T12:00:00.000Z'

test('criar: só o estilo viaja; exposição, branco e geometria ficam de fora salvo "levar"', () => {
  const ajustes = neutro()
  ajustes.luz.exposicao = 1.2
  ajustes.luz.contraste = 20
  ajustes.branco = { modo: 'manual', temperatura: 4000, tinta: 5 }
  ajustes.geometria.angulo = 3
  const p = criarPredefinicao({ nome: 'Teste', ajustes }, { agora: AGORA })
  assert.equal(p.zro, TIPO)
  assert.equal(p.ajustes.luz.contraste, 20)
  assert.equal(p.ajustes.luz.exposicao, undefined)
  assert.equal(p.ajustes.branco, undefined)
  assert.equal(p.ajustes.geometria, undefined)
  assert.equal(p.ajustes.intensidade, undefined)
  const leva = criarPredefinicao({ nome: 'Frio de propósito', ajustes, levar: ['branco', 'qualquer'] }, { agora: AGORA })
  assert.deepEqual(leva.levar, ['branco'])
  assert.equal(leva.ajustes.branco.temperatura, 4000)
  assert.equal(leva.ajustes.luz.exposicao, undefined)
})

test('validar: qualquer entrada vira predefinição válida ou erro claro', () => {
  const lixo = validar({ nome: '  Nome\u0000 com\ncontrole  ', ajustes: { luz: { contraste: 900, desconhecido: 1 }, coisa: 2 }, familia: 7 }, { agora: AGORA })
  assert.equal(lixo.nome, 'Nome com controle')
  assert.equal(lixo.ajustes.luz.contraste, 100)
  assert.equal(lixo.ajustes.coisa, undefined)
  assert.equal(lixo.familia, 'Minhas')
  for (const [entrada, codigo] of [
    [null, 'nao-e-predefinicao'],
    [[], 'nao-e-predefinicao'],
    [{ zro: 'outra.coisa' }, 'nao-e-predefinicao'],
    [{ zro: TIPO, versao: 99, nome: 'x' }, 'versao-futura'],
    [{ zro: TIPO, versao: 1, nome: '   ' }, 'sem-nome'],
    [{ zro: TIPO, versao: 1, nome: 'x', look: { lado: 1, dados: '' } }, 'look-invalido'],
    [{ zro: TIPO, versao: 1, nome: 'x', look: { lado: 2, dados: 'AAAA' } }, 'look-invalido'],
  ]) {
    assert.throws(
      () => validar(entrada),
      (e) => e instanceof ErroPredefinicao && e.codigo === codigo && e.message.length > 5,
    )
  }
  assert.throws(
    () => ler('{isto não é json'),
    (e) => e.codigo === 'json-invalido',
  )
})

test('migração: a versão 0 (ajustes soltos ou { nome, ajustes }) vira a versão atual', () => {
  const v0 = ler(JSON.stringify({ nome: 'Antiga', ajustes: { cor: { saturacao: -30 } } }), { agora: AGORA })
  assert.equal(v0.versao, 1)
  assert.equal(v0.ajustes.cor.saturacao, -30)
  assert.throws(
    () => validar({ luz: { contraste: 5 } }),
    (e) => e.codigo === 'sem-nome',
  )
})

test('serializar e ler: JSON estável (mesma predefinição, mesmo texto) e id pelo conteúdo', () => {
  const a = criarPredefinicao({ nome: 'Estável', descricao: 'uma linha', ajustes: { luz: { contraste: 10 } } }, { agora: AGORA })
  const texto = serializar(a)
  assert.ok(texto.endsWith('\n'))
  const b = ler(texto)
  assert.equal(serializar(b), texto)
  assert.deepEqual(Object.keys(JSON.parse(texto)), [
    'zro',
    'versao',
    'id',
    'nome',
    'familia',
    'descricao',
    'autor',
    'criadaEm',
    'ajustes',
    'levar',
    'look',
    'origem',
  ])
  // bytes com BOM também entram
  assert.equal(ler(new TextEncoder().encode(`\uFEFF${texto}`)).id, a.id)
  // id pelo conteúdo: muda com o ajuste, não muda com a data
  const c = criarPredefinicao({ nome: 'Estável', ajustes: { luz: { contraste: 11 } } }, { agora: AGORA })
  assert.notEqual(c.id, a.id)
  assert.equal(idDe({ ...a, criadaEm: '2020-01-01T00:00:00.000Z' }), idDe(a))
})

test('aplicar: o que é da foto fica, o estilo entra na intensidade, o look acompanha', () => {
  const lut = compactar(criarLut(5)).look
  const p = criarPredefinicao({ nome: 'Com look', ajustes: { luz: { contraste: 40 }, look: { quantidade: 80 } }, look: lut }, { agora: AGORA })
  const daFoto = normalizar({ luz: { exposicao: 0.7, contraste: -50 }, branco: { modo: 'manual', temperatura: 5000, tinta: 3 } })
  const metade = aplicar(p, daFoto, 50)
  assert.equal(metade.luz.exposicao, 0.7)
  assert.equal(metade.branco.temperatura, 5000)
  assert.equal(metade.luz.contraste, 20)
  assert.equal(metade.look.quantidade, 40)
  assert.match(metade.look.id, /^look_[0-9a-f]{16}$/)
  const zero = aplicar(p, daFoto, 0)
  assert.equal(zero.luz.contraste, 0)
  const sem = aplicar(criarPredefinicao({ nome: 'Sem', ajustes: {} }, { agora: AGORA }), daFoto)
  assert.equal(sem.look.id, null)
})

test('diferença: "o que esta predefinição mexe" em frases curtas, na ordem dos painéis', () => {
  const p = criarPredefinicao(
    {
      nome: 'Mexe',
      ajustes: {
        luz: { contraste: 18, altas: -30 },
        misturador: { saturacao: [0, -5, -12, 0, 0, 0, 0, 0] },
        tonalizacao: { sombras: { matiz: 220, saturacao: 12, luz: 0 } },
        pb: { ativo: false },
        curva: {
          pontos: {
            luz: [
              [0, 0.05],
              [0.5, 0.5],
              [1, 1],
            ],
          },
        },
      },
    },
    { agora: AGORA },
  )
  const frases = oQueMexe(p)
  assert.deepEqual(frases.slice(0, 2), ['Contraste +18', 'Altas luzes −30'])
  assert.ok(frases.includes('Misturador · saturação: laranja −5, amarelo −12'))
  assert.ok(frases.some((f) => f.startsWith('Tonalização · sombras: azul')))
  assert.ok(frases.includes('Curva de pontos (3 pontos)'))
  assert.deepEqual(gruposMexidos(p), ['Luz', 'Curva', 'Tonalização', 'Misturador'])
  // entre duas: só o que muda
  const q = criarPredefinicao({ nome: 'Outra', ajustes: { luz: { contraste: 18, altas: -10 } } }, { agora: AGORA })
  const d = diferenca(q, p).map((x) => x.texto)
  assert.ok(d.includes('Altas luzes −30'))
  assert.ok(!d.includes('Contraste +18'))
  assert.deepEqual(oQueMexe(criarPredefinicao({ nome: 'Nada', ajustes: {} }, { agora: AGORA })), [])
})

test('pacote .zropack: junta, tira repetidas, sobrevive a uma estragada', () => {
  const a = criarPredefinicao({ nome: 'A', ajustes: { luz: { contraste: 5 } } }, { agora: AGORA })
  const b = criarPredefinicao({ nome: 'B', ajustes: { cor: { saturacao: -5 } } }, { agora: AGORA })
  const pacote = criarPacote([a, b, a], { nome: 'Minhas', agora: AGORA })
  assert.equal(pacote.predefinicoes.length, 2)
  const texto = serializarPacote(pacote)
  const lido = lerPacote(texto)
  assert.deepEqual(
    lido.predefinicoes.map((p) => p.id),
    [a.id, b.id],
  )
  const estragado = JSON.parse(texto)
  estragado.predefinicoes.push({ zro: TIPO, versao: 1, nome: '' })
  const r = lerPacote(estragado)
  assert.equal(r.predefinicoes.length, 2)
  assert.equal(r.erros.length, 1)
  assert.equal(r.erros[0].codigo, 'sem-nome')
  // um .zropreset sozinho entra como pacote de uma
  assert.equal(lerPacote(serializar(a)).predefinicoes.length, 1)
  assert.throws(
    () => lerPacote('{"zro":"x"}'),
    (e) => e.codigo === 'pacote-invalido',
  )
})

test('soEstilo: o look da predefinição leva só a quantidade (o id sai do conteúdo)', () => {
  const a = soEstilo({ look: { id: 'qualquer', quantidade: 70 }, intensidade: 150 })
  assert.deepEqual(a.look, { quantidade: 70 })
  assert.equal(a.intensidade, undefined)
})
