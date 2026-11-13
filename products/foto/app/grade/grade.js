// A grade virtualizada: milhares de fotos a 60 qps porque só o que está na janela existe no DOM (mais duas linhas de
// sobra em cima e embaixo). Reutilizável: qualquer tela passa a loja e recebe a grade do catálogo (itens(), já com
// filtro, ordem e pilhas).
//
//   <${Grade} loja=${loja} tamanho=${176} aoAbrir=${(id) => …} teclado=${ativa} topo=${52} />
//
// Seleção estilo Finder: clique, Cmd/Ctrl + clique, Shift + clique com âncora, setas pelas colunas medidas, Cmd + A,
// Esc. role="listbox" multisselecionável, cada foto é role="option" com roving tabindex. As teclas de marcar são as
// do Lightroom (src/biblioteca/catalogo.js). Duplo clique, Enter, E ou espaço abrem a foto (`aoAbrir`).
// O cartão mostra a marca, as estrelas, a cor, o selo de par RAW + JPEG, a pilha (grupo de repetidas, que abre no
// lugar) e tem espaço para a nota e o motivo da decupagem (foto.magnitude, quando existir).

import { cx, html, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from '../preact.js'
import { lerTecla } from '../../src/biblioteca/catalogo.js'
import { Icone } from '../icones.js'
import { Vazio } from '../componentes/base.js'
import { Estrelas, Marca, Ponto } from '../componentes/marcas.js'
import { usarAtalhos } from '../casca/atalhos.js'
import { usarCatalogo, usarFoto, usarLoja, usarMiniatura } from '../estado.js'
import { executarComAviso } from './acoes.js'

const SOBRA = 2
/** A célula é 4:3: a foto deitada (3:2) ocupa a largura quase inteira e a de pé cabe na altura, sem recorte. */
export const PROPORCAO_DA_CELULA = 4 / 3
export const TAMANHO_MINIMO = 96
export const TAMANHO_MAXIMO = 340
export const TAMANHO_PADRAO = 184

/**
 * As medidas da grade para uma largura: quantas colunas cabem com miniaturas de cerca de `tamanho` px, o lado de cada
 * célula e o passo entre linhas. Pura, para os testes e para quem precisa saber as colunas.
 */
export function medirGrade(largura, tamanho) {
  const estreita = largura < 560
  const margem = estreita ? 10 : 20
  const vao = estreita ? 6 : 12
  const pe = 24
  const util = Math.max(0, largura - 2 * margem)
  const colunas = Math.max(2, Math.floor((util + vao) / (Math.max(TAMANHO_MINIMO * (estreita ? 0.8 : 1), tamanho) + vao)))
  const lado = (util - (colunas - 1) * vao) / colunas
  return { colunas, lado, passo: lado / PROPORCAO_DA_CELULA + pe + vao, margem, vao, pe }
}

const nomeCurto = (nome) => nome.replace(/\.[^.]+$/, '')

function rotuloDa(foto, pilha) {
  const partes = [foto.nome]
  if (foto.marca) partes.push(foto.marca)
  if (foto.estrelas) partes.push(foto.estrelas === 1 ? '1 estrela' : `${foto.estrelas} estrelas`)
  if (foto.cor) partes.push(foto.cor)
  if (foto.par) partes.push('RAW e JPEG')
  if (pilha && !pilha.aberta) partes.push(`pilha de ${pilha.total}`)
  return partes.join(', ')
}

const Cartao = memo(
  function Cartao({ loja, id, pilha, ordem, entrada, h }) {
    const { foto, selecionada, emFoco } = usarFoto(loja, id)
    const mini = usarMiniatura(loja, id)
    if (!foto) return null
    const proporcao = foto.proporcao || 1.5
    const nota = foto.magnitude?.total
    const motivo = foto.magnitude?.motivos?.[0]
    const ponta = pilha?.aberta ? (pilha.posicao === 0 ? 'inicio' : pilha.posicao === pilha.total - 1 ? 'fim' : 'meio') : undefined
    return html`<div
      class="foto"
      role="option"
      aria-selected=${selecionada ? 'true' : 'false'}
      aria-label=${rotuloDa(foto, pilha)}
      tabindex=${emFoco || entrada ? 0 : -1}
      data-id=${id}
      data-marca=${foto.marca ?? undefined}
      data-foco=${emFoco ? '' : undefined}
      data-pilha=${pilha ? (pilha.aberta ? 'aberta' : 'fechada') : undefined}
      data-ponta=${ponta}
      style=${`--i:${ordem}`}
      onClick=${(e) => h.clique(e, id)}
      onDblClick=${() => h.abrir(id)}
    >
      <div class="foto-quadro">
        <div class="foto-moldura" data-forma=${proporcao >= PROPORCAO_DA_CELULA ? 'deitada' : 'de-pe'} style=${`aspect-ratio:${proporcao.toFixed(4)}`}>
          ${mini
            ? html`<img src=${mini} alt="" draggable=${false} decoding="async" />`
            : foto.semPrevia
              ? html`<span class="foto-sem" title="Este navegador não abre a prévia deste arquivo"><${Icone} nome="fotos" /><span>${foto.formato.toUpperCase()}</span></span>`
              : loja.miniaturas.falta(id)
                ? html`<span class="foto-sem" title="O arquivo não está ao alcance: ligue a pasta ou escolha as fotos de novo"><${Icone} nome="ligar" /></span>`
                : html`<span class="foto-espera esqueleto"></span>`}
          <${Marca} marca=${foto.marca} classe="foto-marca" />
          ${foto.par ? html`<span class="selo selo-par" title="RAW e JPEG do mesmo clique">RAW+J</span>` : null}
          ${pilha && (!pilha.aberta || pilha.posicao === 0)
            ? html`<button
                type="button"
                class="selo selo-pilha toque"
                tabindex="-1"
                aria-expanded=${pilha.aberta ? 'true' : 'false'}
                aria-label=${pilha.aberta ? 'Fechar a pilha' : `Abrir a pilha de ${pilha.total} ${pilha.tipo === 'sequencia' ? 'em sequência' : 'repetidas'}`}
                onClick=${(e) => h.pilha(e, pilha.id)}
                onDblClick=${(e) => e.stopPropagation()}
              >
                <${Icone} nome="pilha" />${pilha.total}
              </button>`
            : null}
        </div>
      </div>
      <div class="foto-pe">
        <${Estrelas} valor=${foto.estrelas} compacta tamanho=${11} />
        <${Ponto} cor=${foto.cor} />
        ${motivo ? html`<span class="foto-motivo" title=${foto.magnitude.motivos.join(' · ')}>${motivo}</span>` : html`<span class="foto-nome">${nomeCurto(foto.nome)}</span>`}
        ${typeof nota === 'number' ? html`<span class="foto-nota" data-balde=${foto.magnitude.balde}>${Math.round(nota)}</span>` : null}
      </div>
    </div>`
  },
  (a, b) => a.id === b.id && a.ordem === b.ordem && a.entrada === b.entrada && a.loja === b.loja && a.h === b.h && a.pilha?.id === b.pilha?.id && a.pilha?.total === b.pilha?.total && a.pilha?.aberta === b.pilha?.aberta && a.pilha?.posicao === b.pilha?.posicao,
)

/**
 * `tamanho`: o lado desejado da miniatura, em px. `aoAbrir(id)`: abrir a foto grande. `teclado`: se os atalhos valem
 * (a tela desliga quando a lupa está na frente). `topo` e `base`: espaço extra antes e depois (barras por cima).
 * `aoMedir({ colunas })`: avisa as medidas.
 */
export function Grade({ loja, tamanho = TAMANHO_PADRAO, aoAbrir, teclado = true, topo = 0, base = 0, rotulo = 'Fotos', aoMedir, aoVazio }) {
  const itens = usarCatalogo(loja, (c) => c.itens(), ['fotos', 'filtro', 'ordem', 'pilhas', 'dados'])
  const foco = usarCatalogo(loja, (c) => c.foco(), ['selecao', 'fotos', 'filtro', 'ordem', 'pilhas', 'dados'])
  const trabalho = usarLoja(loja, (l) => l.trabalho()?.id)
  const rolador = useRef(null)
  const [caixa, definirCaixa] = useState({ l: 0, a: 0, pt: 0, pb: 0 })
  const [linha0, definirLinha0] = useState(0)
  const [entrando, definirEntrando] = useState(true)
  const rolagem = useRef(0)
  const levarFoco = useRef(false)

  const m = useMemo(() => medirGrade(caixa.l, tamanho), [caixa.l, tamanho])
  const linhas = Math.ceil(itens.length / m.colunas)
  const recuo = topo + m.vao
  const altura = recuo + linhas * m.passo + base + m.vao

  // mede a caixa; escondida (aba de trás) mantém a última medida e, ao voltar, devolve a rolagem
  useLayoutEffect(() => {
    const el = rolador.current
    const medir = () => {
      if (!el.clientWidth) return
      // o respiro do próprio rolador (o topo em vidro e, no celular, o dock passam por cima)
      const estilo = getComputedStyle(el)
      const pt = parseFloat(estilo.paddingTop) || 0
      const pb = parseFloat(estilo.paddingBottom) || 0
      definirCaixa((c) => (c.l === el.clientWidth && c.a === el.clientHeight && c.pt === pt && c.pb === pb ? c : { l: el.clientWidth, a: el.clientHeight, pt, pb }))
      if (Math.abs(el.scrollTop - rolagem.current) > 1) el.scrollTop = rolagem.current
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => aoMedir?.({ colunas: m.colunas }), [m.colunas])

  // entrada em cascata: ao abrir o trabalho e quando o filtro ou a ordem mudam (não ao rolar)
  useEffect(() => {
    const acender = () => {
      definirEntrando(true)
      clearTimeout(acender.t)
      acender.t = setTimeout(() => definirEntrando(false), 700)
    }
    acender()
    const cancelar = loja.catalogo.assinar((aviso) => (aviso.tipo === 'filtro' || aviso.tipo === 'ordem') && acender())
    return () => {
      cancelar()
      clearTimeout(acender.t)
    }
  }, [trabalho])

  const aoRolar = () => {
    const el = rolador.current
    if (!el.clientWidth) return
    rolagem.current = el.scrollTop
    const l0 = Math.max(0, Math.floor((el.scrollTop - caixa.pt - recuo) / m.passo))
    if (l0 !== linha0) definirLinha0(l0)
  }

  const primeira = Math.max(0, Math.min(linha0, Math.max(0, linhas - 1)) - SOBRA)
  const ultima = Math.min(linhas, linha0 + Math.ceil((caixa.a || 1) / m.passo) + 1 + SOBRA)
  const janela = caixa.l ? itens.slice(primeira * m.colunas, ultima * m.colunas) : []

  // o que está na janela passa na frente da fila de miniaturas
  const chave = janela.length ? `${janela[0].foto.id}:${janela.length}:${itens.length}` : ''
  useEffect(() => {
    if (janela.length) loja.miniaturas.mostrar(janela.map((i) => i.foto.id))
  }, [chave])

  // a foto em foco fica sempre à vista (setas, marcar com filtro, voltar ao trabalho)
  useLayoutEffect(() => {
    const el = rolador.current
    if (!foco || !caixa.l || !el.clientWidth) return
    const i = loja.catalogo.indice(foco)
    if (i < 0) return
    const y = caixa.pt + recuo + Math.floor(i / m.colunas) * m.passo
    const cima = el.scrollTop + caixa.pt + topo
    const baixo = el.scrollTop + el.clientHeight - caixa.pb - base
    if (y - m.vao < cima) el.scrollTop = Math.max(0, y - m.vao - caixa.pt - topo)
    else if (y + m.passo > baixo) el.scrollTop = y + m.passo - el.clientHeight + caixa.pb + base
    aoRolar()
  }, [foco, caixa.l, caixa.a, m.colunas, m.passo])

  // roving tabindex: o foco do teclado acompanha a foto em foco quando a pessoa está na grade
  useLayoutEffect(() => {
    const el = rolador.current
    if (!foco || !el) return
    const ativo = document.activeElement
    if (!levarFoco.current && ativo && ativo !== document.body && !el.contains(ativo)) return
    const alvo = el.querySelector(`[data-id="${foco}"]`)
    if (alvo && alvo !== ativo) {
      alvo.focus({ preventScroll: true })
      levarFoco.current = false
    }
  })

  const vivo = useRef({})
  vivo.current = {
    clique(e, id) {
      const c = loja.catalogo
      // no toque, tocar de novo na foto que já está em foco abre a foto grande
      if (e.pointerType !== 'mouse' && matchMedia('(pointer: coarse)').matches && !e.shiftKey && c.foco() === id && c.selecao().size === 1 && c.selecionada(id)) return aoAbrir?.(id)
      c.selecionar(id, { alternar: e.metaKey || e.ctrlKey, intervalo: e.shiftKey })
    },
    abrir(id) {
      loja.catalogo.selecionar(id)
      aoAbrir?.(id)
    },
    pilha(e, grupo) {
      e.stopPropagation()
      loja.catalogo.alternarPilha(grupo)
    },
  }
  const h = useRef(null)
  h.current ??= { clique: (e, id) => vivo.current.clique(e, id), abrir: (id) => vivo.current.abrir(id), pilha: (e, g) => vivo.current.pilha(e, g) }

  usarAtalhos(teclado, (e) => {
    const comando = lerTecla(e)
    if (!comando) return
    const c = loja.catalogo
    if (executarComAviso(loja, comando, { colunas: m.colunas })) {
      e.preventDefault()
      levarFoco.current = comando.acao === 'mover'
      return
    }
    if (comando.acao === 'lupa' || comando.acao === 'zoom') {
      const id = c.foco() ?? c.itens()[0]?.foto.id
      if (!id) return
      e.preventDefault()
      vivo.current.abrir(id)
    } else if (comando.acao === 'sair' && c.selecao().size) {
      e.preventDefault()
      c.limparSelecao()
    }
  })

  return html`<div class="grade" ref=${rolador} onScroll=${aoRolar} role="listbox" aria-multiselectable="true" aria-label=${rotulo} aria-rowcount=${linhas} tabindex="-1">
    ${itens.length
      ? html`<div class="grade-area" style=${`height:${Math.ceil(altura)}px`}>
          <div class=${cx('grade-janela', entrando && 'cascata')} style=${`transform:translateY(${Math.round(recuo + primeira * m.passo)}px);left:${m.margem}px;grid-template-columns:repeat(${m.colunas},${m.lado.toFixed(2)}px);column-gap:${m.vao}px;row-gap:${m.vao}px;--pe:${m.pe}px`}>
            ${janela.map((it, k) => html`<${Cartao} key=${it.foto.id} loja=${loja} id=${it.foto.id} pilha=${it.pilha} ordem=${k} entrada=${!foco && primeira === 0 && k === 0} h=${h.current} />`)}
          </div>
        </div>`
      : html`<div class="grade-vazia" style=${`padding-top:${topo}px`}>${aoVazio?.() ?? html`<${Vazio} icone="fotos" titulo=${['Nada', 'por aqui.']} />`}</div>`}
  </div>`
}
