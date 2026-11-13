// Marcar com retorno: o mesmo caminho para o teclado, a barra de seleção e a lupa. Quando a ação vale para várias
// fotos de uma vez, sobe um aviso com "Desfazer"; desfazer e refazer pelo teclado dizem o que voltou.

import { executar } from '../../src/biblioteca/catalogo.js'
import { avisar } from '../componentes/aviso.js'

const n = (q) => q.toLocaleString('pt-BR')
const TEXTO = {
  marca: (q, v) => `${n(q)} fotos ${v === 'escolhida' ? 'escolhidas' : v === 'rejeitada' ? 'rejeitadas' : 'sem marca'}`,
  estrelas: (q, v) => `${n(q)} fotos ${v ? `com ${v} ${v === 1 ? 'estrela' : 'estrelas'}` : 'sem estrelas'}`,
  cor: (q, v) => `${n(q)} fotos ${v ? `em ${v}` : 'sem cor'}`,
}

function avisarLote(loja, tipo, quantas, valor) {
  if (quantas > 1) avisar(TEXTO[tipo](quantas, valor), { desfazer: () => loja.catalogo.desfazer() })
}

/** Escolhida, rejeitada ou null (tira a marca) para as fotos `ids`. */
export function marcar(loja, ids, marca) {
  avisarLote(loja, 'marca', loja.catalogo.marcar(ids, marca).length, marca)
}
export function estrelar(loja, ids, estrelas) {
  avisarLote(loja, 'estrelas', loja.catalogo.estrelar(ids, estrelas).length, estrelas)
}
export function colorir(loja, ids, cor) {
  avisarLote(loja, 'cor', loja.catalogo.colorir(ids, cor).length, cor)
}

/**
 * Um comando do teclado (src/biblioteca/catalogo.js, `lerTecla`) com os avisos. Devolve true se era do catálogo.
 */
export function executarComAviso(loja, comando, opcoes) {
  const c = loja.catalogo
  if (!comando) return false
  if (comando.acao === 'desfazer' || comando.acao === 'refazer') {
    const passo = comando.acao === 'desfazer' ? c.desfazer() : c.refazer()
    if (passo) avisar(`${comando.acao === 'desfazer' ? 'Desfeito' : 'Refeito'}: ${passo.rotulo.toLowerCase()}`, { duracao: 2200 })
    else avisar(comando.acao === 'desfazer' ? 'Nada para desfazer' : 'Nada para refazer', { duracao: 1800 })
    return true
  }
  const quantas = c.alvo().length
  const feito = executar(c, comando, opcoes)
  if (feito && quantas > 1 && TEXTO[comando.acao]) {
    const valor = comando.acao === 'cor' ? c.foto(c.alvo()[0] ?? '')?.cor ?? null : comando.valor
    avisarLote(loja, comando.acao, quantas, valor)
  }
  return feito
}
