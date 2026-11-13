// As barras em vidro da grade: a de cima (filtros em pílulas com contagem, estrelas, cor, ordem e o tamanho da
// miniatura) e a de seleção, que flutua embaixo com a régua de marcar. Ficam por cima do palco; a grade rola por baixo.

import { html } from '../preact.js'
import { CORES } from '../../src/biblioteca/catalogo.js'
import { Icone } from '../icones.js'
import { Controle, Menu, Numero, Pilulas } from '../componentes/base.js'
import { Marcar } from '../componentes/marcas.js'
import { usarCatalogo } from '../estado.js'
import { colorir, estrelar, marcar } from './acoes.js'
import { TAMANHO_MAXIMO, TAMANHO_MINIMO, TAMANHO_PADRAO } from './grade.js'

const ORDENS = [
  { por: 'captura', rotulo: 'Captura' },
  { por: 'nome', rotulo: 'Nome' },
  { por: 'nota', rotulo: 'Nota' },
]

/** Os filtros e a visão da grade. `tamanho` e `aoTamanho`: o lado da miniatura (o controle some no celular). */
export function BarraDaGrade({ loja, tamanho, aoTamanho }) {
  usarCatalogo(loja, (c) => c.versao, ['fotos', 'dados*', 'filtro', 'ordem', 'pilhas'])
  const c = loja.catalogo
  const n = c.contagens()
  const f = c.filtro()
  const ordem = c.ordem()
  const marca = f.marca?.[0] ?? 'todas'
  const cores = f.cor || []
  const temNota = n.balde.sem < n.total
  return html`<div class="grade-barra" role="toolbar" aria-label="Filtros">
    <${Pilulas}
      rola
      rotulo="Marca"
      valor=${marca}
      aoMudar=${(v) => c.filtrar({ marca: v == null || v === 'todas' ? null : v })}
      opcoes=${[
        { valor: 'todas', rotulo: 'Todas', contagem: n.total },
        { valor: 'escolhida', rotulo: 'Escolhidas', contagem: n.marca.escolhida },
        { valor: 'rejeitada', rotulo: 'Rejeitadas', contagem: n.marca.rejeitada },
        { valor: 'sem', rotulo: 'Sem marca', contagem: n.marca.sem },
      ]}
    />
    <span class="grade-barra-fim">
      <${Menu}
        rotulo=${f.estrelas ? `Estrelas: ${f.estrelas} ou mais` : 'Filtrar por estrelas'}
        dica="Estrelas"
        lado="direita"
        classeBotao=${f.estrelas ? 'liso liso--ativo' : 'liso'}
        gatilho=${html`<${Icone} nome="estrela" cheio=${!!f.estrelas} />${f.estrelas ? html`<span class="liso-n">${f.estrelas}+</span>` : null}`}
        itens=${[
          { rotulo: 'Qualquer', marcado: !f.estrelas, aoEscolher: () => c.filtrar({ estrelas: 0 }) },
          ...[1, 2, 3, 4, 5].map((e) => ({ rotulo: `${'★'.repeat(e)} ou mais`, marcado: f.estrelas === e, detalhe: String(n.estrelas.slice(e).reduce((a, b) => a + b, 0)), aoEscolher: () => c.filtrar({ estrelas: e }) })),
        ]}
      />
      <${Menu}
        rotulo=${cores.length ? `Cor: ${cores.join(', ')}` : 'Filtrar por cor'}
        dica="Cor"
        lado="direita"
        classeBotao=${cores.length ? 'liso liso--ativo' : 'liso'}
        gatilho=${html`<span class="cores-icone" aria-hidden="true">${(cores.length ? cores.filter((x) => x !== 'sem') : CORES.slice(0, 3)).slice(0, 3).map((x) => html`<span class="ponto" data-cor=${x}></span>`)}</span>`}
        itens=${[
          { rotulo: 'Qualquer', marcado: !cores.length, aoEscolher: () => c.filtrar({ cor: null }) },
          ...CORES.map((x) => ({
            no: html`<button type="button" class="menu-item" role="menuitemradio" aria-checked=${cores.includes(x) ? 'true' : 'false'} tabindex="-1" onClick=${() => c.filtrar({ cor: cores.includes(x) ? cores.filter((y) => y !== x) : [...cores, x] })}>
              <span class="ponto" data-cor=${x}></span><span>${x[0].toUpperCase() + x.slice(1)}</span><small>${n.cor[x]}</small>
            </button>`,
          })),
        ]}
      />
      <${Menu}
        rotulo=${`Ordem: ${ORDENS.find((o) => o.por === ordem.por)?.rotulo}`}
        dica="Ordem"
        lado="direita"
        gatilho=${html`<${Icone} nome="ordenar" />`}
        itens=${[
          ...ORDENS.filter((o) => o.por !== 'nota' || temNota).map((o) => ({ rotulo: o.rotulo, marcado: ordem.por === o.por, aoEscolher: () => c.ordenar(o.por, ordem.sentido) })),
          { divisa: true },
          { rotulo: 'Inverter', icone: 'trocar', marcado: ordem.sentido === 'desc', aoEscolher: () => c.ordenar(ordem.por, ordem.sentido === 'desc' ? 'asc' : 'desc') },
        ]}
      />
      <span class="grade-tamanho">
        <${Icone} nome="tamanho" />
        <${Controle} linha rotulo="Tamanho das miniaturas" valor=${tamanho} min=${TAMANHO_MINIMO} max=${TAMANHO_MAXIMO} passo=${4} neutro=${TAMANHO_PADRAO} formato=${(v) => `${v} px`} aoMudar=${(v) => aoTamanho(v)} />
      </span>
    </span>
  </div>`
}

/** A barra de seleção: quantas estão selecionadas e a régua de marcar. Some sem seleção. `aoAbrir(id)`: foto grande. */
export function BarraDeSelecao({ loja, aoAbrir }) {
  usarCatalogo(loja, (c) => c.versao, ['selecao', 'dados*', 'fotos', 'filtro', 'ordem', 'pilhas'])
  const c = loja.catalogo
  const ids = c.selecionadas()
  if (!ids.length) return null
  const fotos = ids.map((id) => c.foto(id)).filter(Boolean)
  return html`<div class="selecao barra-vidro" role="region" aria-label="Seleção">
    <span class="selecao-n" aria-live="polite"><${Numero} valor=${ids.length} /><span class="selecao-palavra"> ${ids.length === 1 ? 'selecionada' : 'selecionadas'}</span></span>
    <span class="separador" aria-hidden="true"></span>
    <${Marcar} fotos=${fotos} aoMarcar=${(m) => marcar(loja, ids, m)} aoEstrelar=${(e) => estrelar(loja, ids, e)} aoColorir=${(x) => colorir(loja, ids, x)} />
    <span class="separador" aria-hidden="true"></span>
    <button type="button" class="liso" aria-label="Ver a foto grande" data-dica="Foto grande" data-tecla="E" data-dica-lado="cima" onClick=${() => aoAbrir?.(c.foco() ?? ids[0])}><${Icone} nome="zoom" /></button>
    <button type="button" class="liso" aria-label="Tirar a seleção" data-dica="Tirar a seleção" data-tecla="Esc" data-dica-lado="cima" onClick=${() => c.limparSelecao()}><${Icone} nome="x" /></button>
  </div>`
}
