// Cada foto explica a própria nota: o painel da lupa (a Magnitude, as estrelas sugeridas, os motivos, a certeza e as
// incertezas) e a sobreposição (tecla O) com o que a análise viu: os rostos com o estado dos olhos, onde está o foco e
// a direção do tremido. As frases vêm de src/decupagem/textos.js pelo resumoDaFoto; aqui só se arruma na tela.

import { cx, html } from '../../preact.js'
import { Estrelas } from '../../componentes/marcas.js'
import { Icone } from '../../icones.js'
import { resumoDaFoto, sobreposicao } from '../../decupagem/sobreposicao.js'
import { COMPONENTES } from '../../../src/decupagem/textos.js'
import { PARAMETROS } from '../../../src/decupagem/nota.js'
import { Icone2 } from './icones.js'

/** A frase da exposição quando o RAW já foi lido (a passada do RAW), ou null. */
export function exposicaoPeloRaw(foto) {
  const a = foto?.analise?.raw
  if (a?.erro) return { texto: 'O RAW não abriu: exposição vista só na prévia', tom: 'aviso' }
  if (a !== 'lido' || !foto.latitude) return null
  const e = foto.medidas?.exposicao
  const estourouNaPrevia = e && (e.altas * 100 > PARAMETROS.altas.tolerancia || e.altas3 * 100 > PARAMETROS.perdidas.tolerancia)
  if (!estourouNaPrevia) return { texto: 'Exposição conferida no RAW', tom: 'certo' }
  return foto.magnitude?.detalhe?.tetos?.includes('estourada')
    ? { texto: 'O sensor também perdeu as altas luzes', tom: 'aviso' }
    : { texto: 'O sensor guardou as altas luzes', tom: 'certo' }
}

const pct = (v) => `${(v * 100).toFixed(3)}%`

/** O que vai por cima da foto, dentro da moldura (acompanha o zoom). `ativo`: o rosto em destaque (Alt + setas). */
export function Sobreposicao({ foto, ativo = -1 }) {
  const s = sobreposicao(foto)
  if (!s) return null
  const celulas = s.nitidez?.celulas ?? []
  return html`<div class="sobre" aria-hidden="true">
    ${
      celulas.length
        ? html`<svg class="sobre-foco" viewBox="0 0 1 1" preserveAspectRatio="none" shape-rendering="crispEdges">
          ${celulas.map((k) =>
            k.nivel === 'alta'
              ? html`<rect x=${k.x} y=${k.y} width=${k.largura} height=${k.altura} class="sobre-nitida" />`
              : html`<rect x=${k.x} y=${k.y} width=${k.largura} height=${k.altura} class="sobre-veu" data-nivel=${k.nivel} />`,
          )}
        </svg>`
        : null
    }
    ${s.rostos.map(
      (r, i) => html`<div
        class=${cx('sobre-rosto', i === ativo && 'sobre-rosto--ativo')}
        data-estado=${r.estado}
        data-principal=${r.principal ? '' : undefined}
        style=${`left:${pct(r.x)};top:${pct(r.y)};width:${pct(r.largura)};height:${pct(r.altura)}`}
      >
        <span class="sobre-rotulo"><span class="sobre-ponto"></span>${r.rotulo}</span>
      </div>`,
    )}
    ${
      s.tremido
        ? html`<svg class=${cx('sobre-tremido', s.tremido.forte && 'sobre-tremido--forte')} viewBox="0 0 1 1" preserveAspectRatio="none">
            <line x1=${s.tremido.x1} y1=${s.tremido.y1} x2=${s.tremido.x2} y2=${s.tremido.y2} vector-effect="non-scaling-stroke" />
          </svg>
          <span class="sobre-tremido-rotulo" style=${`left:${pct((s.tremido.x1 + s.tremido.x2) / 2)};top:${pct(Math.max(s.tremido.y1, s.tremido.y2))}`}
            >${s.tremido.rotulo}</span
          >`
        : null
    }
  </div>`
}

function Barras({ componentes }) {
  const itens = Object.entries(COMPONENTES).filter(([k]) => typeof componentes?.[k] === 'number')
  if (!itens.length) return null
  return html`<div class="explica-barras">
    ${itens.map(
      ([k, nome]) => html`<div class="explica-barra" title=${`${nome}: ${componentes[k]} de 100`}>
        <span>${nome}</span>
        <span class="explica-trilho"><span style=${`width:${Math.max(2, componentes[k])}%`}></span></span>
        <b>${componentes[k]}</b>
      </div>`,
    )}
  </div>`
}

/**
 * O painel "por que esta nota". `sobre` e `aoSobre`: a sobreposição ligada e quem liga. `aoFechar`: recolher o painel.
 */
export function Explicacao({ foto, sobre, aoSobre, aoFechar }) {
  if (!foto) return null
  const r = resumoDaFoto(foto)
  const raw = exposicaoPeloRaw(foto)
  const fecha = html`<button type="button" class="liso explica-fecha" aria-label="Recolher" data-dica="Recolher" data-tecla="I" data-dica-lado="esquerda" onClick=${aoFechar}>
    <${Icone} nome="x" />
  </button>`
  if (!r.analisada) {
    return html`<div class="explica" data-analisada="nao">
      ${fecha}
      <div class="explica-espera">
        <span class="esqueleto explica-esqueleto"></span>
        <span class="apoio">${r.aviso}</span>
      </div>
    </div>`
  }
  return html`<div class="explica" data-balde=${r.balde?.id}>
    ${fecha}
    <div class="explica-nota">
      <span class="explica-numero">${Math.round(r.nota)}</span>
      <span class="explica-lado">
        <span class="explica-balde" data-balde=${r.balde?.id}><span class="balde-ponto" data-balde=${r.balde?.id}></span>${r.balde?.texto}</span>
        <${Estrelas} valor=${r.estrelas} tamanho=${12} />
      </span>
    </div>
    <ul class="explica-motivos">
      ${r.motivos.map((m) => html`<li>${m}</li>`)}
    </ul>
    ${
      r.grupo
        ? html`<div class="explica-linha"><${Icone} nome="pilha" /><span
            >${r.grupo.frase}${r.grupo.empate.length ? html`<small>${r.grupo.empate.join(' · ')}</small>` : null}</span
          ></div>`
        : null
    }
    ${raw ? html`<div class="explica-linha" data-tom=${raw.tom}><${Icone} nome="sol" /><span>${raw.texto}</span></div>` : null}
    ${r.cena ? html`<div class="explica-linha"><${Icone} nome="fotos" /><span>${r.cena.texto}${r.cena.porque ? html`<small>${r.cena.porque}</small>` : null}</span></div>` : null}
    ${
      r.rostos.length
        ? html`<div class="explica-rostos">
            ${r.rostos.map((x) => html`<span class="explica-rosto" data-estado=${x.estado}><span class="sobre-ponto"></span>${x.texto}</span>`)}
          </div>`
        : null
    }
    <${Barras} componentes=${foto.magnitude?.componentes} />
    <div class="explica-certeza" data-confianca=${r.confianca?.id}>
      <span>${r.confianca?.texto}</span>
      ${r.incertezas.length ? html`<ul>${r.incertezas.map((x) => html`<li>${x}</li>`)}</ul>` : null}
      ${r.dicas.length ? html`<ul class="explica-dicas">${r.dicas.map((x) => html`<li>${x}</li>`)}</ul>` : null}
    </div>
    <button type="button" class="vidro vidro--pequeno explica-sobre" aria-pressed=${sobre ? 'true' : 'false'} onClick=${aoSobre}>
      <${Icone2} nome="camadas" />O que a análise viu<kbd class="tecla">O</kbd>
    </button>
  </div>`
}
