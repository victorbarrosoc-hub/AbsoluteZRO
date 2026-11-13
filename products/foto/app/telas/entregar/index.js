// Entregar (provisória): só o título da etapa e o vazio. A tela de verdade substitui este arquivo.
// Contrato de tela: export default um componente Preact que recebe { loja, ativa }.

import { html } from '../../preact.js'
import { Vazio } from '../../componentes/base.js'

export default function Entregar() {
  return html`<div class="tela"><${Vazio} icone="entregar" titulo="Entregar" /></div>`
}
