// Meus looks: o clone salvo volta igual (16 bits), a intensidade mistura com o frame e o nome é limpo.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clonarLut } from '../src/cor/clonar.js'
import { PREFIXO, desempacotar, empacotar, lookSalvo } from '../src/cor/meuslooks.js'
import { aplicarEmImagem, cena, distanciaMedia, lookConhecido } from './apoio.js'

test('meu look: o clone salvo e lido de volta pinta a outra cena como o clone', () => {
  const antes = cena(41, 240, 135)
  const clone = clonarLut(antes, aplicarEmImagem(antes, lookConhecido))
  const salvo = JSON.parse(JSON.stringify(empacotar((r, g, b) => clone.aplicar(r, g, b, 1), '  ZRO   Filmes  ', 1_700_000_000_000)))
  assert.ok(salvo.id.startsWith(PREFIXO))
  assert.equal(salvo.nome, 'ZRO Filmes')
  assert.equal(desempacotar(salvo).tamanho, 33)
  const look = lookSalvo(salvo)
  const outra = cena(42, 240, 135)
  const comClone = aplicarEmImagem(outra, (r, g, b) => clone.aplicar(r, g, b, 1))
  assert.ok(distanciaMedia(aplicarEmImagem(outra, look.aplicar), comClone) < 0.01)
  // intensidade 0 não mexe; o resumo tem a luz e as frases da leitura
  look.aplicar(0.3, 0.5, 0.7, 0).forEach((v, i) => assert.ok(Math.abs(v - [0.3, 0.5, 0.7][i]) < 1e-9))
  assert.ok(look.resumo.tom.branco > look.resumo.tom.preto)
  assert.equal(empacotar((r, g, b) => [r, g, b], '').nome, 'Meu look')
  assert.throws(() => desempacotar({ ...salvo, dados: salvo.dados.slice(0, 100) }), /incompleto/)
})
