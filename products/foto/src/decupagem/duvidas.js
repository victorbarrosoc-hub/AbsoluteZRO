// Magnitude · fila de dúvidas: das milhares de decisões da nota, só as de baixa confiança vão para a pessoa, uma de
// cada vez, da mais importante para a menos. O resto segue a sugestão sem ninguém olhar. Puro: Node e navegador.
//
//   filaDeDuvidas(fotos, { rigor, limiares?, pessoas?, maximo? }) → [{ id, motivos: [chave], importancia, sugestao, texto }]
//
// `fotos` = as do catálogo (magnitude, escolha, rostos, marca, grupo). Foto já marcada (P ou X) está decidida e não
// entra. `pessoas` = [{ id, fotos: [id], chave }] quando a pessoa ligou "agrupar por pessoa".
//
// O que é dúvida (e quanto pesa, do mais grave para o menos):
//   pessoa-sozinha  100  a melhor foto de uma pessoa-chave que só tem fotos em Fora (subiu para Talvez pela cobertura)
//   chave-fora       80  Fora com uma pessoa-chave no quadro, e o momento não tem outra foto que fica
//   unica-talvez     70  a única foto de um momento, que a cobertura tirou de Fora
//   empate           60  a escolhida de uma cena empatada (a nota não sabe qual é a melhor)
//   limite           50  nota a menos de LIMITE pontos de um corte de balde (mais perto, mais alto, até +10)
//   certeza          40  a análise disse "certeza baixa"
// Uma foto com vários motivos fica com o maior, mais 5 por motivo a mais. A sugestão é o balde (Talvez vira o lado do
// corte mais perto; a foto protegida pela cobertura sugere Fica: tirar é decisão da pessoa).

import { RIGORES } from './nota.js'
import { DUVIDAS } from './textos.js'

export const FILA = Object.freeze({
  // pontos de distância de um corte de balde que contam como "no limite": a margem de erro da nota (grupos.js)
  limite: 5,
  // a fila é curta de propósito: o que passar disto não é dúvida que valha o tempo
  maximo: 60,
  peso: Object.freeze({ 'pessoa-sozinha': 100, 'chave-fora': 80, 'unica-talvez': 70, empate: 60, limite: 50, certeza: 40 }),
})

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A foto tem alguém em destaque (rosto-chave lido pela análise, não o que a malha recusou)? */
const temChave = (foto) => Array.isArray(foto.rostos) && foto.rostos.some((r) => r?.chave && !r.duvidoso)

function textoDe(motivo, foto) {
  if (motivo === 'empate') return DUVIDAS.empate(foto.escolha?.equivalentes ?? 2)
  return {
    'pessoa-sozinha': DUVIDAS.pessoaSozinha,
    'chave-fora': DUVIDAS.chaveFora,
    'unica-talvez': DUVIDAS.unicaTalvez,
    limite: DUVIDAS.limite,
    certeza: DUVIDAS.certeza,
  }[motivo]()
}

/**
 * A fila. Ordem: importância, depois a nota mais perto do corte, depois a ordem do catálogo. `maximo` corta a cauda.
 */
export function filaDeDuvidas(fotos, { rigor = 'equilibrado', pessoas = null, maximo = FILA.maximo, limite = FILA.limite } = {}) {
  const cortes = RIGORES[rigor] ?? RIGORES.equilibrado
  const lista = (Array.isArray(fotos) ? fotos : []).filter((f) => f && f.magnitude && typeof f.magnitude.total === 'number')
  const porId = new Map(lista.map((f) => [f.id, f]))

  // o momento tem alguma foto que fica? (então a pessoa-chave em Fora está coberta por outra foto)
  const momentoComFica = new Set()
  for (const f of lista) if (f.grupo && f.magnitude.balde !== 'fora') momentoComFica.add(f.grupo)

  // pessoa-chave sem nenhuma foto fora de Fora, a não ser a protegida: a melhor dela é dúvida grave
  const sozinhas = new Set()
  for (const p of pessoas ?? []) {
    if (!p?.chave) continue
    const dela = (p.fotos ?? []).map((id) => porId.get(id)).filter(Boolean)
    if (!dela.length) continue
    const boas = dela.filter((f) => f.magnitude.balde !== 'fora' && !f.magnitude.detalhe?.protegida)
    if (boas.length) continue
    const melhor = dela.reduce((a, f) => (f.magnitude.total > a.magnitude.total ? f : a))
    sozinhas.add(melhor.id)
  }

  const saida = []
  lista.forEach((f, ordem) => {
    if (f.marca) return
    const m = f.magnitude
    const balde = m.balde
    const daNota = m.baldeDaNota ?? balde
    const motivos = []
    if (sozinhas.has(f.id)) motivos.push('pessoa-sozinha')
    if (balde === 'fora' && temChave(f) && !(f.grupo && momentoComFica.has(f.grupo))) motivos.push('chave-fora')
    if (balde === 'talvez' && m.detalhe?.protegida && !sozinhas.has(f.id)) motivos.push('unica-talvez')
    if (f.escolha?.escolhida && (f.escolha.equivalentes ?? 0) > 1) motivos.push('empate')
    // a distância ao corte que decide o balde da nota (com teto, a nota não está "no limite": o defeito decide)
    const comTeto = (m.detalhe?.tetos ?? []).length > 0
    const distancia = Math.min(Math.abs(m.total - cortes.fica), Math.abs(m.total - cortes.fora))
    if (!comTeto && distancia < limite) motivos.push('limite')
    if (m.confianca === 'baixa') motivos.push('certeza')
    if (!motivos.length) return
    const pesos = motivos.map((k) => FILA.peso[k])
    let importancia = Math.max(...pesos) + 5 * (motivos.length - 1)
    if (motivos.includes('limite')) importancia += Math.round((10 * (limite - distancia)) / limite) / (motivos[0] === 'limite' ? 1 : 2)
    const meio = (cortes.fica + cortes.fora) / 2
    const sugestao =
      motivos[0] === 'pessoa-sozinha' || motivos[0] === 'unica-talvez'
        ? 'fica'
        : daNota === 'fica' || balde === 'fica'
          ? 'fica'
          : daNota === 'fora' && balde === 'fora'
            ? 'fora'
            : m.total >= meio
              ? 'fica'
              : 'fora'
    saida.push({ id: f.id, motivos, importancia, sugestao, texto: textoDe(motivos[0], f), distancia, ordem })
  })
  saida.sort((a, b) => b.importancia - a.importancia || a.distancia - b.distancia || a.ordem - b.ordem)
  return saida.slice(0, Math.max(0, maximo)).map(({ distancia, ordem, ...x }) => ({ ...x, distancia: num(distancia) }))
}
