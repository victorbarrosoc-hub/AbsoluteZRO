// Entregar: as três saídas do trabalho, uma de cada vez.
//   Exportar          o lote para uma pasta ou um .zip (exportar.js), com a fila em workers (lote.js)
//   Galeria           o link para o cliente escolher as fotos (galeria.js); a escolha volta para o catálogo
//   Busca por rosto   o evento em que cada convidado acha as próprias fotos com uma selfie (app/rosto/painel.js)
// Sem armazenamento, banco ou login no servidor, Galeria e Busca por rosto mostram a mesma linha e nada mais.
// "Tratar as escolhidas pelo cliente" leva da galeria ao lote já com elas.
//
// Contrato de tela: export default um componente Preact que recebe { loja, ativa }.

import { html, useEffect, useState } from '../../preact.js'
import { usarCatalogo, usarLoja } from '../../estado.js'
import { Segmentado, Vazio } from '../../componentes/index.js'
import { usarFolhaDeEstilo } from './comum.js'
import { Exportar } from './exportar.js'
import { Galeria } from './galeria.js'
import { PainelEvento } from '../../rosto/painel.js'
import { vinculo } from './servico.js'

const TITULOS = {
  exportar: ['Exportar', 'em lote.'],
  galeria: ['Galeria', 'para o cliente.'],
  evento: ['Busca', 'por rosto.'],
}

export default function Entregar({ loja, ativa }) {
  usarFolhaDeEstilo()
  const guardado = loja.aba('entregar')
  const trabalho = usarLoja(loja, (l) => l.trabalho())
  const total = usarCatalogo(loja, (c) => c.tamanho, ['fotos'])
  const [modo, definirModo] = useState(TITULOS[guardado.modo] ? guardado.modo : trabalho && vinculo.ler(trabalho.id) ? 'galeria' : 'exportar')
  const [pedido, definirPedido] = useState(null)
  const [visitou, definirVisitou] = useState({ [modo]: true })

  useEffect(() => {
    guardado.modo = modo
    if (!visitou[modo]) definirVisitou((v) => ({ ...v, [modo]: true }))
  }, [modo])

  if (!trabalho || !total) {
    return html`<div class="tela entregar-tela"><div class="entregar"><${Vazio} icone="entregar" titulo=${['Nada', 'para entregar.']} /></div></div>`
  }

  const [fino, pesado] = TITULOS[modo]
  return html`<div class="tela entregar-tela">
    <div class="entregar" data-modo=${modo}>
      <header class="entregar-cabeca">
        <h2><span class="fino">${fino} </span><span class="pesado">${pesado}</span></h2>
        <${Segmentado}
          rotulo="Entregar"
          classe="entregar-modo"
          valor=${modo}
          opcoes=${[
            { valor: 'exportar', rotulo: 'Exportar' },
            { valor: 'galeria', rotulo: 'Galeria do cliente' },
            { valor: 'evento', rotulo: 'Busca por rosto' },
          ]}
          aoMudar=${definirModo}
        />
      </header>
      <div class="entregar-painel" hidden=${modo !== 'exportar'} data-painel="exportar">
        ${visitou.exportar ? html`<${Exportar} loja=${loja} ativa=${ativa && modo === 'exportar'} pedido=${pedido} />` : null}
      </div>
      <div class="entregar-painel" hidden=${modo !== 'galeria'} data-painel="galeria">
        ${
          visitou.galeria
            ? html`<${Galeria}
                loja=${loja}
                ativa=${ativa && modo === 'galeria'}
                aoTratarCliente=${() => {
                  definirPedido({ criterio: 'cliente', em: Date.now() })
                  definirModo('exportar')
                }}
              />`
            : null
        }
      </div>
      <div class="entregar-painel" hidden=${modo !== 'evento'} data-painel="evento">
        ${visitou.evento ? html`<${PainelEvento} loja=${loja} embutido />` : null}
      </div>
    </div>
  </div>`
}
