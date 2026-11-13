// Decupar por cena, não por foto. Uma cena é um momento com mais de uma foto (repetidas ou sequência, os grupos da
// análise). A melhor já vem escolhida e destacada; quem concorda só aperta →, e a cena seguinte entra (View Transition).
//
//   →  ←       próxima cena (aceitando a escolhida desta) · cena anterior
//   ↑  ↓       as fotos da cena                S  esta passa a ser a escolhida (e os pesos aprendem)
//   P  X  1–5  marcar (com Shift ou Caps Lock, segue sozinho)
//   Espaço     zoom no rosto principal          Alt + ← →  o rosto anterior, o próximo
//   N          lado a lado com a escolhida (zoom sincronizado)        O  sobreposição · I  painel · G ou Esc  grade
//
// Enquanto o modo dura, o catálogo fica sem filtro e sem pilha (toda foto da cena precisa estar na lista para entrar
// em foco); ao sair, volta como estava.

import { cx, html, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from '../../preact.js'
import { Icone } from '../../icones.js'
import { Vazio } from '../../componentes/base.js'
import { Estrelas, Marca } from '../../componentes/marcas.js'
import { avisar } from '../../componentes/aviso.js'
import { usarAtalhos } from '../../casca/atalhos.js'
import { comTransicao } from '../../casca/transicao.js'
import { usarCatalogo, usarFoto, usarMiniatura } from '../../estado.js'
import { executarComAviso } from '../../grade/acoes.js'
import { Lupa } from '../../lupa/lupa.js'
import { EMPATE, GRUPOS } from '../../../src/decupagem/textos.js'

const instante = (f) => f.exif?.data ?? ''

/** As cenas do catálogo, na ordem de captura: [{ id, tipo, fotos, ids, sugerida }]. Só grupos com duas fotos ou mais. */
export function montarCenas(catalogo) {
  const grupos = new Map()
  catalogo.fotos().forEach((f, i) => {
    if (!f.grupo) return
    if (!grupos.has(f.grupo)) grupos.set(f.grupo, [])
    grupos.get(f.grupo).push({ f, i })
  })
  const tipos = new Map(catalogo.grupos().map((g) => [g.id, g.tipo]))
  const cenas = []
  for (const [id, lista] of grupos) {
    if (lista.length < 2) continue
    lista.sort((a, b) => instante(a.f).localeCompare(instante(b.f)) || a.i - b.i)
    const fotos = lista.map((x) => x.f)
    const sugerida = fotos.find((f) => f.escolha?.escolhida) ?? [...fotos].sort((a, b) => (b.magnitude?.total ?? -1) - (a.magnitude?.total ?? -1))[0]
    cenas.push({ id, tipo: tipos.get(id) ?? fotos[0].escolha?.tipo ?? 'repetidas', fotos, ids: fotos.map((f) => f.id), sugerida, ordem: lista[0].i })
  }
  return cenas.sort((a, b) => a.ordem - b.ordem)
}

/** A escolhida da cena: a que a pessoa marcou; sem marca, a que a nota escolheu. */
export const escolhidaDa = (cena) => cena.fotos.find((f) => f.marca === 'escolhida') ?? cena.sugerida
const decidida = (cena) => cena.fotos.some((f) => f.marca === 'escolhida')

/** A linha do empate: "2 equivalentes · Desempate pelos olhos" (ou nada). */
export function linhaDoEmpate(foto) {
  const e = foto?.escolha
  if (!e?.escolhida || !(e.equivalentes > 1)) return null
  return [EMPATE.equivalentes(e.equivalentes), e.desempate && EMPATE[e.desempate] ? EMPATE[e.desempate]() : null].filter(Boolean).join(' · ')
}

const NaTira = memo(function NaTira({ loja, id, ativa, escolhida, sugerida, aoTocar }) {
  const { foto } = usarFoto(loja, id)
  const mini = usarMiniatura(loja, id)
  if (!foto) return null
  const nota = foto.magnitude?.total
  return html`<button
    type="button"
    class="tira-foto"
    role="option"
    aria-selected=${ativa ? 'true' : 'false'}
    aria-label=${`${foto.nome}${escolhida ? ', escolhida' : ''}${typeof nota === 'number' ? `, nota ${Math.round(nota)}` : ''}`}
    data-id=${id}
    data-escolhida=${escolhida ? '' : undefined}
    data-marca=${foto.marca ?? undefined}
    data-balde=${foto.magnitude?.balde ?? undefined}
    onClick=${() => aoTocar(id)}
  >
    <span class="tira-moldura" style=${`aspect-ratio:${(foto.proporcao || 1.5).toFixed(3)}`}>
      ${mini ? html`<img src=${mini} alt="" draggable=${false} />` : html`<span class="esqueleto"></span>`}
      <${Marca} marca=${foto.marca} classe="tira-marca" />
      ${escolhida ? html`<span class="tira-coroa" title=${sugerida && !foto.marca ? 'A melhor da cena' : 'Escolhida'}><${Icone} nome="ok" /></span>` : null}
    </span>
    <span class="tira-pe">
      ${typeof nota === 'number' ? html`<b>${Math.round(nota)}</b>` : null}
      ${foto.escolha?.equivalente && !escolhida ? html`<span title="Equivale à escolhida">≈</span>` : null}
      <${Estrelas} valor=${foto.estrelas} compacta tamanho=${9} />
    </span>
  </button>`
})

/**
 * `lupa`: as peças que a Decupar dá a toda lupa (camada, painel, extras, controle e as teclas comuns em `aoTecla`).
 * `aoSair()`: volta para a grade. `aoTrocar(id)`: S (troca a escolhida e aprende). `aoAprender(preferida, preterida)`.
 * `fechar`: { rotulo, aoTocar } a ação principal no fim das cenas.
 */
export function Cenas({ loja, lupa, aoSair, aoTrocar, aoAprender, fechar }) {
  const c = loja.catalogo
  const g = loja.aba('decupar')
  const versao = usarCatalogo(loja, (x) => x.versao, ['fotos', 'dados', 'pilhas'])
  const cenas = useMemo(() => montarCenas(c), [versao])
  const foco = usarCatalogo(loja, (x) => x.foco(), ['selecao', 'fotos', 'filtro', 'pilhas'])
  const [pronto, definirPronto] = useState(false)
  const [i, definirI] = useState(() => {
    const k = cenas.findIndex((x) => x.id === g.cena)
    if (k >= 0) return k
    const pendente = cenas.findIndex((x) => !decidida(x))
    return pendente >= 0 ? pendente : 0
  })
  const [fim, definirFim] = useState(false)
  const [fixa, definirFixa] = useState(null)
  const trocando = useRef(false)
  const cena = cenas[Math.min(i, cenas.length - 1)] ?? null

  // o catálogo inteiro na lista enquanto o modo dura; ao sair, como estava
  useLayoutEffect(() => {
    const antes = { filtro: c.filtro(), empilhado: c.empilhado() }
    c.limparFiltro()
    c.empilhar(false)
    if (cena && !cena.ids.includes(c.foco())) c.selecionar(escolhidaDa(cena).id)
    definirPronto(true)
    return () => {
      c.empilhar(antes.empilhado)
      c.filtrar(antes.filtro)
    }
  }, [])

  // a foto em foco sempre dentro da cena
  useEffect(() => {
    if (!pronto || !cena || fim) return
    if (!cena.ids.includes(foco)) c.selecionar(escolhidaDa(cena).id)
  }, [pronto, cena?.id, fim])

  const irPara = (n, sentido) => {
    const alvo = cenas[n]
    if (!alvo) return
    const fazer = () => {
      definirI(n)
      definirFim(false)
      definirFixa(null)
      g.cena = alvo.id
      c.selecionar(escolhidaDa(alvo).id)
    }
    if (trocando.current) return fazer()
    trocando.current = true
    void comTransicao(fazer, { sentido }).finally(() => (trocando.current = false))
  }

  /** →: concorda com a escolhida desta cena (se ninguém foi marcado ainda) e passa para a próxima. */
  const proxima = ({ aceitar = true } = {}) => {
    if (!cena) return
    if (aceitar && !decidida(cena)) {
      const e = escolhidaDa(cena)
      if (e.magnitude?.balde !== 'fora') c.definir([e.id], { marca: 'escolhida' }, { rotulo: 'Cena aceita' })
    }
    if (i < cenas.length - 1) irPara(i + 1, 'cena-frente')
    else
      void comTransicao(() => definirFim(true), { sentido: 'cena-frente' }).catch(() => {
        definirFim(true)
      })
  }
  const anterior = () => {
    if (fim) return irPara(cenas.length - 1, 'cena-volta')
    if (i > 0) irPara(i - 1, 'cena-volta')
  }
  const membro = (passo) => {
    if (!cena) return
    const k = cena.ids.indexOf(c.foco())
    const n = Math.max(0, Math.min(cena.ids.length - 1, (k < 0 ? 0 : k) + passo))
    c.selecionar(cena.ids[n])
  }

  const aoTecla = (e, comando) => {
    if (lupa.aoTecla(e, comando)) return true
    if (e.ctrlKey || e.metaKey || e.altKey) return false
    switch (e.key) {
      case 'ArrowRight':
        proxima()
        return true
      case 'ArrowLeft':
        anterior()
        return true
      case 'ArrowUp':
        membro(-1)
        return true
      case 'ArrowDown':
        membro(1)
        return true
      default:
    }
    if (e.key.toLowerCase() === 's') {
      aoTrocar(c.foco())
      return true
    }
    if (comando && ['marca', 'estrelas', 'cor'].includes(comando.acao)) {
      const atual = c.foco()
      const antes = cena && !decidida(cena) ? escolhidaDa(cena) : null
      executarComAviso(loja, { ...comando, avancar: false }, { colunas: 1 })
      // escolher outra que não a da nota, numa cena ainda sem escolhida, é uma troca: os pesos aprendem
      if (comando.acao === 'marca' && comando.valor === 'escolhida' && antes && antes.id !== atual) aoAprender(c.foto(atual), antes)
      if (comando.avancar) {
        if (comando.acao === 'marca' && comando.valor === 'escolhida') proxima({ aceitar: false })
        else membro(1)
      }
      return true
    }
    return false
  }

  const aoComparar = () => {
    if (fixa) return definirFixa(null)
    if (!cena) return
    const e = escolhidaDa(cena)
    if (c.foco() !== e.id) return definirFixa(e.id)
    definirFixa(e.id)
    membro(cena.ids.indexOf(e.id) === cena.ids.length - 1 ? -1 : 1)
  }

  usarAtalhos(fim, (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      anterior()
    } else if (e.key === 'Escape' || e.key.toLowerCase() === 'g') {
      e.preventDefault()
      aoSair()
    }
  })

  if (!cenas.length) {
    return html`<div class="cenas palco">
      <${Vazio} icone="pilha" titulo=${['Nenhuma', 'repetida.']} apoio="Cada momento tem uma foto só.">
        <button type="button" class="vidro" onClick=${aoSair}>Ver a grade</button>
      <//>
    </div>`
  }
  if (fim) {
    const escolhidas = cenas.filter(decidida).length
    return html`<div class="cenas palco cenas-fim">
      <${Vazio}
        icone="ok"
        titulo=${['Pronto,', `${cenas.length.toLocaleString('pt-BR')} ${cenas.length === 1 ? 'cena' : 'cenas'}.`]}
        apoio=${`${escolhidas.toLocaleString('pt-BR')} com escolhida`}
      >
        <button type="button" class="vidro" onClick=${anterior}><${Icone} nome="esquerda" />Voltar</button>
        <button type="button" class="vidro vidro--tinta" onClick=${fechar.aoTocar} disabled=${fechar.desligado}>${fechar.rotulo}</button>
      <//>
    </div>`
  }
  if (!pronto || !cena) return html`<div class="cenas palco"></div>`

  const escolhida = escolhidaDa(cena)
  const empate = linhaDoEmpate(cena.sugerida)
  const tipo = cena.tipo === 'sequencia' ? GRUPOS.sequencia : GRUPOS.repetidas
  const topo = html`<div class="cena-topo">
    <button type="button" class="liso" aria-label="Cena anterior" disabled=${i === 0} onClick=${anterior}><${Icone} nome="esquerda" /></button>
    <div class="cena-titulo" aria-live="polite">
      <span><b>Cena ${(i + 1).toLocaleString('pt-BR')}</b> de ${cenas.length.toLocaleString('pt-BR')}</span>
      <small>${tipo} · ${cena.fotos.length} fotos${empate ? html` · <span class="cena-empate">${empate}</span>` : null}</small>
    </div>
    <button type="button" class="liso" aria-label="Próxima cena" data-dica="Próxima" data-tecla="→" onClick=${() => proxima()}>
      <${Icone} nome="direita" />
    </button>
  </div>`
  const tira = html`<div class="cena-tira" role="listbox" aria-label="Fotos da cena">
    ${cena.fotos.map(
      (f) =>
        html`<${NaTira}
          key=${f.id}
          loja=${loja}
          id=${f.id}
          ativa=${f.id === foco}
          escolhida=${f.id === escolhida.id}
          sugerida=${f.id === cena.sugerida.id}
          aoTocar=${(id) => c.selecionar(id)}
        />`,
    )}
  </div>`
  return html`<div class=${cx('cenas palco')} data-cena=${cena.id}>
    <${Lupa}
      loja=${loja}
      classe="lupa--cenas"
      aoFechar=${aoSair}
      aoTecla=${aoTecla}
      contador=${`Cena ${i + 1} de ${cenas.length}`}
      limites=${{ antes: i > 0, depois: true }}
      andar=${(passo, origem) => (origem === 'deslize' ? membro(passo) : passo > 0 ? proxima() : anterior())}
      fixa=${fixa}
      aoComparar=${aoComparar}
      aoDeslizar=${lupa.aoDeslizarNaCena}
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
