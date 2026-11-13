// Decupar (provisória, e já útil): a grade, a lupa e as marcas funcionando. A tela de verdade (a análise, a nota
// com o motivo, os baldes) substitui este arquivo e reaproveita as mesmas peças: Grade e as barras (app/grade),
// Lupa (app/lupa) e a loja.
//
// Contrato de tela: export default um componente Preact que recebe { loja, ativa }.

import { html, useEffect, useState } from '../../preact.js'
import { Vazio } from '../../componentes/base.js'
import { comTransicao, nomearFoto } from '../../casca/transicao.js'
import { BarraDaGrade, BarraDeSelecao } from '../../grade/barra.js'
import { Grade, TAMANHO_MAXIMO, TAMANHO_MINIMO, TAMANHO_PADRAO } from '../../grade/grade.js'
import { Lupa } from '../../lupa/lupa.js'

/** A tela inteira é palco: a casca escurece o topo e o dock junto. */
export const palco = true

const CHAVE_DO_TAMANHO = 'foto_miniatura'

function tamanhoGuardado() {
  try {
    const v = Number(localStorage.getItem(CHAVE_DO_TAMANHO))
    if (v >= TAMANHO_MINIMO && v <= TAMANHO_MAXIMO) return v
  } catch {
    // sem armazenamento: o padrão
  }
  return matchMedia('(max-width: 719px)').matches ? 112 : TAMANHO_PADRAO
}

export default function Decupar({ loja, ativa }) {
  const guardado = loja.aba('decupar')
  const [tamanho, definirTamanho] = useState(tamanhoGuardado)
  const [lupa, definirLupa] = useState(!!guardado.lupa)

  useEffect(() => {
    guardado.lupa = lupa
  }, [lupa])

  const mudarTamanho = (v) => {
    definirTamanho(v)
    try {
      localStorage.setItem(CHAVE_DO_TAMANHO, String(v))
    } catch {
      // segue sem lembrar
    }
  }
  const miniaturaDe = (id) => document.querySelector(`.decupar .foto[data-id="${id}"] .foto-moldura`)

  // a miniatura cresce até o palco (e volta para o lugar dela)
  const abrir = (id) => {
    if (lupa) return
    const tirar = nomearFoto(miniaturaDe(id))
    void comTransicao(
      () => {
        tirar()
        definirLupa(true)
      },
      { sentido: 'fica' },
    )
  }
  const fechar = () => {
    if (!lupa) return
    const id = loja.catalogo.foco()
    let tirar = () => {}
    void comTransicao(
      () => {
        definirLupa(false)
        tirar = nomearFoto(id ? miniaturaDe(id) : null)
      },
      { sentido: 'fica' },
    ).then(() => tirar())
  }

  return html`<div class="decupar palco">
    <${Grade}
      loja=${loja}
      tamanho=${tamanho}
      aoAbrir=${abrir}
      teclado=${ativa && !lupa}
      topo=${52}
      base=${76}
      aoVazio=${() =>
        html`<${Vazio} icone="filtro" titulo=${['Nada', 'com esse filtro.']}><button type="button" class="vidro" onClick=${() => loja.catalogo.limparFiltro()}>Limpar o filtro</button><//>`}
    />
    <${BarraDaGrade} loja=${loja} tamanho=${tamanho} aoTamanho=${mudarTamanho} />
    ${lupa ? null : html`<${BarraDeSelecao} loja=${loja} aoAbrir=${abrir} />`}
    ${lupa && ativa ? html`<${Lupa} loja=${loja} aoFechar=${fechar} />` : null}
  </div>`
}
