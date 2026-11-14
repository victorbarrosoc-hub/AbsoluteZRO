// Calibrar em 30 segundos: de 6 a 8 perguntas sobre fotos do próprio ensaio que estão perto dos cortes ("esta serve?"
// e "qual das duas?"), e os limiares de nitidez, olhos e exposição deste tipo de ensaio andam (src/decupagem/calibracao.js).
// No fim, o que mudou em palavras e "Voltar ao padrão". Teclas: P serve, X não serve; 1 e 2 (ou ← →) nos pares.

import { cx, html, useEffect, useRef, useState } from '../../preact.js'
import { Icone } from '../../icones.js'
import { Tecla } from '../../componentes/base.js'
import { Folha } from '../../componentes/folha.js'
import { CALIBRACAO } from '../../../src/decupagem/textos.js'

/** A prévia de 1024 px da foto (a mesma da lupa), como endereço; solta ao sair. */
function usarPrevia(loja, id) {
  const [url, definir] = useState(null)
  useEffect(() => {
    let vivo = true
    let feito = null
    definir(null)
    if (!id) return
    loja.miniaturas
      .blob(id, 'previa')
      .then((b) => {
        if (!vivo || !b) return
        feito = URL.createObjectURL(b)
        definir(feito)
      })
      .catch(() => {})
    return () => {
      vivo = false
      if (feito) URL.revokeObjectURL(feito)
    }
  }, [id])
  return url
}

/** A foto da pergunta, inteira; com rosto, um detalhe ampliado no rosto principal (é onde se julga foco e olho). */
function FotoDaPergunta({ loja, id, rotulo, aoTocar, tecla }) {
  const foto = loja.catalogo.foto(id)
  const url = usarPrevia(loja, id)
  const m = foto?.medidas
  const r = (foto?.rostos ?? []).find((x) => x.principal && !x.duvidoso)
  let detalhe = null
  if (url && r && m?.largura) {
    const lado = Math.max(r.caixa.largura, r.caixa.altura) * 1.6
    const sw = Math.min(1, lado / m.largura)
    const sh = Math.min(1, lado / m.altura)
    const x0 = Math.max(0, Math.min(1 - sw, (r.caixa.x + r.caixa.largura / 2 - lado / 2) / m.largura))
    const y0 = Math.max(0, Math.min(1 - sh, (r.caixa.y + r.caixa.altura / 2 - lado / 2) / m.altura))
    const px = sw < 1 ? (x0 / (1 - sw)) * 100 : 50
    const py = sh < 1 ? (y0 / (1 - sh)) * 100 : 50
    detalhe = `background-image:url("${url}");background-size:${(100 / sw).toFixed(2)}% ${(100 / sh).toFixed(2)}%;background-position:${px.toFixed(2)}% ${py.toFixed(2)}%`
  }
  const corpo = html`<span class="calibrar-moldura" style=${`aspect-ratio:${(foto?.proporcao || (m ? m.largura / m.altura : 1.5)).toFixed(3)}`}>
      ${url ? html`<img src=${url} alt="" draggable=${false} />` : html`<span class="esqueleto"></span>`}
      ${detalhe ? html`<span class="calibrar-detalhe" style=${detalhe} aria-hidden="true"></span>` : null}
    </span>
    ${rotulo ? html`<span class="calibrar-rotulo">${tecla ? html`<${Tecla}>${tecla}<//>` : null}${rotulo}</span>` : null}`
  return aoTocar
    ? html`<button type="button" class="calibrar-foto" data-id=${id} onClick=${aoTocar}>${corpo}</button>`
    : html`<div class="calibrar-foto" data-id=${id}>${corpo}</div>`
}

export function FolhaDeCalibrar({ aberta, aoFechar, loja, esteira, est }) {
  const [lista, definirLista] = useState([])
  const [k, definirK] = useState(0)
  const [respostas, definirRespostas] = useState([])
  const [fim, definirFim] = useState(null)
  const raiz = useRef(null)
  useEffect(() => {
    if (!aberta) return
    definirLista(esteira.perguntas())
    definirK(0)
    definirRespostas([])
    definirFim(null)
  }, [aberta])
  useEffect(() => {
    if (aberta && !fim) raiz.current?.focus({ preventScroll: true })
  }, [aberta, k, fim])

  const p = lista[k]
  const responder = (resposta) => {
    const todas = [...respostas, resposta]
    definirRespostas(todas)
    if (k + 1 < lista.length) return definirK(k + 1)
    definirFim(esteira.calibrar(todas))
  }
  const serve = (sim) => p?.tipo === 'serve' && responder({ tipo: 'serve', dimensao: p.dimensao, valor: p.valor, serve: sim })
  const escolher = (n) => {
    if (p?.tipo !== 'qual') return
    const [a, b] = n === 0 ? p.ids : [...p.ids].reverse()
    responder({ tipo: 'qual', preferida: loja.catalogo.foto(a)?.magnitude, preterida: loja.catalogo.foto(b)?.magnitude, ids: [a, b] })
  }
  const tecla = (e) => {
    if (fim || !p || e.ctrlKey || e.metaKey || e.altKey) return
    const x = e.key.toLowerCase()
    if (p.tipo === 'serve' && (x === 'p' || x === 'x')) serve(x === 'p')
    else if (p.tipo === 'qual' && (x === '1' || x === 'arrowleft')) escolher(0)
    else if (p.tipo === 'qual' && (x === '2' || x === 'arrowright')) escolher(1)
    else return
    e.preventDefault()
  }

  const poucas = aberta && lista.length < 3
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${CALIBRACAO.titulo} largura=${760} classe="folha-calibrar">
    ${
      poucas
        ? html`<p class="apoio">${CALIBRACAO.poucas}</p>
            <div class="folha-pe">
              ${est.limiaresMexidos ? html`<button type="button" class="vidro" onClick=${() => esteira.voltarAoPadrao()}>${CALIBRACAO.padrao}</button>` : null}
              <button type="button" class="vidro vidro--tinta" onClick=${aoFechar}>Fechar</button>
            </div>`
        : fim
          ? html`<div class="calibrar-fim" role="status">
              <span class="calibrar-ok"><${Icone} nome="ok" /></span>
              <ul>
                ${fim.explicacao.map((f) => html`<li>${f}</li>`)}
              </ul>
              <div class="folha-pe">
                ${
                  est.limiaresMexidos || est.mexido
                    ? html`<button
                        type="button"
                        class="vidro"
                        data-acao="voltar-ao-padrao"
                        onClick=${() => {
                          esteira.voltarAoPadrao()
                          aoFechar()
                        }}
                      >
                        ${CALIBRACAO.padrao}
                      </button>`
                    : null
                }
                <button type="button" class="vidro vidro--tinta" data-acao="calibrado" onClick=${aoFechar}>Pronto</button>
              </div>
            </div>`
          : p
            ? html`<div class="calibrar" ref=${raiz} tabindex="-1" onKeyDown=${tecla} data-tipo=${p.tipo} data-dimensao=${p.dimensao}>
                <div class="calibrar-topo">
                  <span class="calibrar-pergunta">${p.tipo === 'serve' ? CALIBRACAO.serve : CALIBRACAO.qual}</span>
                  ${p.tipo === 'serve' ? html`<span class="calibrar-ficha">${CALIBRACAO.dimensoes[p.dimensao]}</span>` : null}
                  <span class="calibrar-pontos" aria-label=${`${k + 1} de ${lista.length}`}>
                    ${lista.map((_, i) => html`<i class=${cx(i < k && 'feito', i === k && 'agora')}></i>`)}
                  </span>
                </div>
                ${
                  p.tipo === 'serve'
                    ? html`<div class="calibrar-fotos calibrar-fotos--uma">
                          <${FotoDaPergunta} key=${p.id} loja=${loja} id=${p.id} />
                        </div>
                        <div class="folha-pe calibrar-respostas">
                          <button type="button" class="vidro" data-resposta="nao" onClick=${() => serve(false)}>
                            <${Icone} nome="x" />${CALIBRACAO.nao}<${Tecla}>X<//>
                          </button>
                          <button type="button" class="vidro vidro--tinta" data-resposta="sim" onClick=${() => serve(true)}>
                            <${Icone} nome="ok" />${CALIBRACAO.sim}<${Tecla}>P<//>
                          </button>
                        </div>`
                    : html`<div class="calibrar-fotos">
                        <${FotoDaPergunta} key=${p.ids[0]} loja=${loja} id=${p.ids[0]} rotulo="Esta" tecla="1" aoTocar=${() => escolher(0)} />
                        <${FotoDaPergunta} key=${p.ids[1]} loja=${loja} id=${p.ids[1]} rotulo="Esta" tecla="2" aoTocar=${() => escolher(1)} />
                      </div>`
                }
              </div>`
            : null
    }
  <//>`
}
