// Decupar só o que está em dúvida (docs/estudo/decupagem.md, fluxo ideal, passo 5). A fila (src/decupagem/duvidas.js)
// junta as decisões de baixa confiança, da mais importante para a menos; aqui elas aparecem uma de cada vez, grandes,
// com o motivo em uma linha, a sugestão e duas respostas. A contagem cai até zero; o resto segue a sugestão.
//
//   P  Fica (escolhida)       X  Fora (rejeitada)       →  pular (fica para o fim)       ←  a anterior
//   Espaço  zoom no rosto     O  sobreposição           I  painel                         G ou Esc  grade
//
// A fila é tirada ao entrar e não muda enquanto o modo dura (responder não reordena o que falta). Como nas Cenas, o
// catálogo fica sem filtro e sem pilha enquanto o modo dura, e volta como estava.

import { html, useEffect, useLayoutEffect, useMemo, useRef, useState } from '../../preact.js'
import { Icone } from '../../icones.js'
import { Numero, Tecla, Vazio } from '../../componentes/base.js'
import { comTransicao } from '../../casca/transicao.js'
import { usarAtalhos } from '../../casca/atalhos.js'
import { usarCatalogo } from '../../estado.js'
import { Lupa } from '../../lupa/lupa.js'
import { DUVIDAS } from '../../../src/decupagem/textos.js'

/**
 * `esteira`: a da Decupar (tira a fila). `lupa`: as peças comuns da lupa da Decupar. `aoSair()`: volta para a grade.
 * `fechar`: { rotulo, aoTocar, desligado } a ação principal no fim.
 */
export function Duvidas({ loja, esteira, lupa, aoSair, fechar }) {
  const c = loja.catalogo
  const versao = usarCatalogo(loja, (x) => x.versao, ['fotos', 'dados'])
  const foco = usarCatalogo(loja, (x) => x.foco(), ['selecao', 'fotos', 'filtro', 'pilhas'])
  const [fila] = useState(() => esteira.duvidas())
  const [pronto, definirPronto] = useState(false)
  const trocando = useRef(false)
  const pendentes = useMemo(() => fila.filter((d) => c.foto(d.id) && !c.foto(d.id).marca), [versao])
  const atual = pendentes.find((d) => d.id === foco) ?? null

  useLayoutEffect(() => {
    const antes = { filtro: c.filtro(), empilhado: c.empilhado() }
    c.limparFiltro()
    c.empilhar(false)
    if (pendentes[0]) c.selecionar(pendentes[0].id)
    definirPronto(true)
    return () => {
      c.empilhar(antes.empilhado)
      c.filtrar(antes.filtro)
    }
  }, [])

  /** A pendente seguinte (ou anterior) a partir de `id`, na ordem da fila, dando a volta. */
  const vizinha = (id, passo) => {
    if (!pendentes.length) return null
    const k = fila.findIndex((d) => d.id === id)
    for (let n = 1; n <= fila.length; n++) {
      const d = fila[(((k + passo * n) % fila.length) + fila.length) % fila.length]
      if (d && d.id !== id && pendentes.some((p) => p.id === d.id)) return d.id
    }
    return null
  }

  const irPara = (id, sentido) => {
    if (!id) return
    const fazer = () => c.selecionar(id)
    if (trocando.current) return fazer()
    trocando.current = true
    void comTransicao(fazer, { sentido }).finally(() => (trocando.current = false))
  }

  // a foto em foco é sempre uma dúvida pendente (marcou pelo botão da régua: passa para a seguinte)
  useEffect(() => {
    if (!pronto || !pendentes.length || atual) return
    const k = fila.findIndex((d) => d.id === foco)
    const seguinte = k >= 0 ? (fila.slice(k + 1).find((d) => pendentes.includes(d)) ?? pendentes[0]) : pendentes[0]
    irPara(seguinte.id, 'cena-frente')
  }, [pronto, versao, foco])

  const responder = (lado) => {
    if (!atual) return
    const proxima = vizinha(atual.id, 1)
    c.definir([atual.id], { marca: lado === 'fica' ? 'escolhida' : 'rejeitada' }, { rotulo: lado === 'fica' ? 'Fica' : 'Fora' })
    if (proxima) irPara(proxima, 'cena-frente')
  }

  const aoTecla = (e, comando) => {
    if (lupa.aoTecla(e, comando)) return true
    if (e.ctrlKey || e.metaKey || e.altKey) return false
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (atual) irPara(vizinha(atual.id, 1), 'cena-frente')
      return true
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (atual) irPara(vizinha(atual.id, -1), 'cena-volta')
      return true
    }
    if (comando?.acao === 'marca' && comando.valor) {
      responder(comando.valor === 'escolhida' ? 'fica' : 'fora')
      return true
    }
    return false
  }

  usarAtalhos(pronto && !pendentes.length, (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Escape' || e.key.toLowerCase() === 'g') {
      e.preventDefault()
      aoSair()
    }
  })

  if (!pronto) return html`<div class="cenas duvidas palco"></div>`
  if (!pendentes.length) {
    return html`<div class="cenas duvidas palco duvidas-fim">
      <${Vazio} icone="ok" titulo=${['Nenhuma', 'dúvida.']} apoio=${DUVIDAS.resto()}>
        <button type="button" class="vidro" onClick=${aoSair}><${Icone} nome="grade" />Ver a grade</button>
        ${
          fechar
            ? html`<button type="button" class="vidro vidro--tinta" disabled=${fechar.desligado} onClick=${fechar.aoTocar}>${fechar.rotulo}</button>`
            : null
        }
      <//>
    </div>`
  }
  if (!atual) return html`<div class="cenas duvidas palco"></div>`

  const faltam = pendentes.length
  const topo = html`<div class="cena-topo duvida-topo">
    <div class="cena-titulo" aria-live="polite">
      <span class="duvida-faltam"
        ><b><${Numero} valor=${faltam} /></b> ${faltam === 1 ? 'dúvida' : 'dúvidas'}</span
      >
      <small>${atual.texto}</small>
    </div>
  </div>`
  const fica = atual.sugestao === 'fica'
  const tira = html`<div class="duvida-respostas" role="group" aria-label=${DUVIDAS.sugestao[atual.sugestao]}>
    <button type="button" class=${fica ? 'vidro' : 'vidro vidro--tinta'} data-resposta="fora" aria-keyshortcuts="X" onClick=${() => responder('fora')}>
      <${Icone} nome="x" />Fora<${Tecla}>X<//>
    </button>
    <span class="duvida-sugestao">${DUVIDAS.sugestao[atual.sugestao]}</span>
    <button type="button" class=${fica ? 'vidro vidro--tinta' : 'vidro'} data-resposta="fica" aria-keyshortcuts="P" onClick=${() => responder('fica')}>
      <${Icone} nome="ok" />Fica<${Tecla}>P<//>
    </button>
  </div>`
  return html`<div class="cenas duvidas palco" data-duvida=${atual.id}>
    <${Lupa}
      loja=${loja}
      classe="lupa--cenas lupa--duvidas"
      aoFechar=${aoSair}
      aoTecla=${aoTecla}
      contador=${DUVIDAS.faltam(faltam)}
      limites=${{ antes: pendentes.length > 1, depois: pendentes.length > 1 }}
      andar=${(passo) => irPara(vizinha(atual.id, passo), passo > 0 ? 'cena-frente' : 'cena-volta')}
      aoDeslizar=${(lado) => responder(lado === 'cima' ? 'fica' : 'fora')}
      camada=${lupa.camada}
      painel=${lupa.painel}
      painelAberto=${lupa.painelAberto}
      extras=${lupa.extras}
      controle=${lupa.controle}
      topo=${topo}
      tira=${tira}
    />
  </div>`
}
