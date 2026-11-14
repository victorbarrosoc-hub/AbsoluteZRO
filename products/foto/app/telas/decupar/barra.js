// A barra da decupagem (a de cima, acima dos filtros da grade): o andamento da análise, os três baldes que contam
// (Fica · Talvez · Fora), a meta "quero cerca de N", o tipo de ensaio e o rigor, o modo (Grade ou Cenas) e a ação de
// fechar. E as pílulas de motivo, de cena e a das escolhidas pelo cliente (só quando a galeria trouxe alguma), que
// entram na linha de filtros da grade (BarraDaGrade, `extra`).

import { cx, html, useRef } from '../../preact.js'
import { Icone } from '../../icones.js'
import { Balao } from '../../componentes/balao.js'
import { Controle, Menu, Numero, ProgressoAnel, Segmentado } from '../../componentes/base.js'
import { usarCatalogo } from '../../estado.js'
import { CAMADAS as NOMES_DAS_CAMADAS, ENSAIOS, RIGORES } from '../../../src/decupagem/textos.js'
import { Icone2 } from './icones.js'

const milhar = (n) => Number(n || 0).toLocaleString('pt-BR')
const decimal = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })

/** Os motivos que viram filtro: a busca é a mesma do catálogo (um pedaço do texto do motivo, sem maiúscula). */
export const FILTROS_DE_MOTIVO = Object.freeze([
  { valor: 'borradas', rotulo: 'Borradas', busca: 'fora de foco' },
  { valor: 'tremidas', rotulo: 'Tremidas', busca: 'tremid' },
  { valor: 'olhos', rotulo: 'Olhos fechados', busca: 'olhos fechados' },
  { valor: 'piscando', rotulo: 'Piscando', busca: 'piscando' },
  { valor: 'estouradas', rotulo: 'Estouradas', busca: 'altas luzes' },
  { valor: 'escuras', rotulo: 'Escuras', busca: 'escura' },
])

/** As cenas que viram filtro (Pessoas junta retrato e gente pequena no quadro). */
export const FILTROS_DE_CENA = Object.freeze([
  { valor: 'pessoas', rotulo: 'Pessoas', cenas: ['retrato', 'pessoas'] },
  { valor: 'grupo', rotulo: 'Grupo', cenas: ['grupo'] },
  { valor: 'animal', rotulo: 'Animal', cenas: ['animal'] },
  { valor: 'natureza', rotulo: 'Natureza', cenas: ['natureza'] },
  { valor: 'paisagem', rotulo: 'Paisagem', cenas: ['paisagem'] },
  { valor: 'noite', rotulo: 'Noite', cenas: ['noturna'] },
  { valor: 'comida', rotulo: 'Comida', cenas: ['comida'] },
  { valor: 'arquitetura', rotulo: 'Arquitetura', cenas: ['arquitetura'] },
  { valor: 'produto', rotulo: 'Produto', cenas: ['produto'] },
  { valor: 'documento', rotulo: 'Documento', cenas: ['documento'] },
])

/** As contagens dos filtros, com a mesma regra do catálogo (para a pílula dizer o que o filtro vai mostrar). */
export function contarFiltros(fotos) {
  const motivos = Object.fromEntries(FILTROS_DE_MOTIVO.map((m) => [m.valor, 0]))
  const cenas = Object.fromEntries(FILTROS_DE_CENA.map((m) => [m.valor, 0]))
  const grupos = new Map()
  for (const f of fotos) {
    const textos = (f.magnitude?.motivos ?? []).map((m) => String(m).toLowerCase())
    for (const m of FILTROS_DE_MOTIVO) if (textos.some((t) => t.includes(m.busca))) motivos[m.valor]++
    for (const k of FILTROS_DE_CENA) if (k.cenas.includes(f.cena)) cenas[k.valor]++
    if (f.grupo) grupos.set(f.grupo, (grupos.get(f.grupo) ?? 0) + 1)
  }
  let repetidas = 0
  for (const n of grupos.values()) if (n > 1) repetidas += n - 1
  return { motivos, cenas, repetidas }
}

const mesmaLista = (a, b) => !!a && !!b && a.length === b.length && a.every((x) => b.includes(x))

/**
 * As pílulas de motivo, de cena, a das repetidas (empilhar) e a das escolhidas pelo cliente, para a linha de filtros
 * da grade. Só as que têm foto.
 */
export function PilulasDaDecupagem({ loja }) {
  usarCatalogo(loja, (c) => c.versao, ['fotos', 'dados', 'filtro', 'pilhas'])
  const c = loja.catalogo
  const f = c.filtro()
  const n = contarFiltros(c.fotos())
  const motivos = FILTROS_DE_MOTIVO.filter((m) => n.motivos[m.valor] > 0 || f.motivo === m.busca)
  const cenas = FILTROS_DE_CENA.filter((k) => n.cenas[k.valor] > 0 || mesmaLista(f.cena, k.cenas))
  const doCliente = c.contagens().cliente.escolhida
  const clienteAtivo = !!f.cliente?.includes('escolhida')
  if (!motivos.length && !cenas.length && !n.repetidas && !doCliente && !clienteAtivo) return null
  const pilula = ({ valor, rotulo, contagem, ativo, aoTocar, dica, icone }) =>
    html`<button type="button" class="pilula" data-valor=${valor} aria-pressed=${ativo ? 'true' : 'false'} title=${dica} onClick=${aoTocar}>
      ${icone ? html`<${Icone} nome=${icone} />` : null}${rotulo}<span class="pilula-n"><${Numero} valor=${contagem} /></span>
    </button>`
  return html`<span class="dec-filtros" role="group" aria-label="Motivos e cenas">
    ${
      doCliente || clienteAtivo
        ? pilula({
            valor: 'cliente',
            rotulo: 'Do cliente',
            icone: 'pessoa',
            contagem: doCliente,
            ativo: clienteAtivo,
            dica: 'As que o cliente escolheu na galeria',
            aoTocar: () => c.filtrar({ cliente: clienteAtivo ? null : 'escolhida' }),
          })
        : null
    }
    ${motivos.length ? html`<span class="dec-divisa" aria-hidden="true"></span>` : null}
    ${motivos.map((m) =>
      pilula({
        valor: m.valor,
        rotulo: m.rotulo,
        contagem: n.motivos[m.valor],
        ativo: f.motivo === m.busca,
        aoTocar: () => c.filtrar({ motivo: f.motivo === m.busca ? null : m.busca }),
      }),
    )}
    ${
      n.repetidas
        ? pilula({
            valor: 'repetidas',
            rotulo: 'Repetidas',
            icone: 'pilha',
            contagem: n.repetidas,
            ativo: !c.empilhado(),
            dica: c.empilhado() ? 'Mostrar as repetidas (hoje atrás da melhor de cada momento)' : 'Esconder as repetidas atrás da melhor',
            aoTocar: () => c.empilhar(!c.empilhado()),
          })
        : null
    }
    ${cenas.length ? html`<span class="dec-divisa" aria-hidden="true"></span>` : null}
    ${cenas.map((k) =>
      pilula({
        valor: k.valor,
        rotulo: k.rotulo,
        contagem: n.cenas[k.valor],
        ativo: mesmaLista(f.cena, k.cenas),
        aoTocar: () => c.filtrar({ cena: mesmaLista(f.cena, k.cenas) ? null : k.cenas }),
      }),
    )}
  </span>`
}

/** O andamento: anel + "312 de 1.200 · 4 por segundo"; tocar pausa e retoma. Sem análise, o botão de começar. */
function Andamento({ est, esteira, temFotos }) {
  const a = est.analise
  const camadaFora = est.camadas.filter((k) => a.camadas?.[k] === 'indisponivel')
  const fora = camadaFora.length
    ? html`<span
        class="dec-fora"
        title=${camadaFora
          .map((k) => a.motivos?.[k])
          .filter(Boolean)
          .join(' · ')}
        >${camadaFora.length === 1 ? `${NOMES_DAS_CAMADAS[camadaFora[0]]} indisponível` : 'Visão indisponível'}</span
      >`
    : null
  if (a.situacao === 'rodando' || a.situacao === 'pausada' || a.situacao === 'preparando' || a.situacao === 'fechando') {
    const pausada = a.situacao === 'pausada'
    const valor = a.total ? a.feitas / a.total : 0
    const texto =
      a.situacao === 'preparando'
        ? 'Preparando a análise'
        : a.situacao === 'fechando'
          ? 'Juntando as cenas'
          : `${milhar(a.feitas)} de ${milhar(a.total)}${!pausada && a.porSegundo ? ` · ${decimal(a.porSegundo)} por segundo` : pausada ? ' · pausada' : ''}`
    return html`<div class="dec-andamento" role="status" data-situacao=${a.situacao}>
      <button
        type="button"
        class="liso dec-anel"
        aria-label=${pausada ? 'Continuar a análise' : 'Pausar a análise'}
        aria-pressed=${pausada ? 'true' : 'false'}
        data-dica=${pausada ? 'Continuar' : 'Pausar'}
        disabled=${a.situacao !== 'rodando' && !pausada}
        onClick=${() => (pausada ? esteira.retomar() : esteira.pausar())}
      >
        <${ProgressoAnel} valor=${valor} rotulo="Análise" />
        <span class="dec-anel-acao"><${Icone2} nome=${pausada ? 'tocar' : 'pausar'} tamanho=${10} /></span>
      </button>
      <span class="dec-andamento-texto">${texto}</span>
      ${fora}
    </div>`
  }
  if (a.situacao === 'pronta') {
    return html`<div class="dec-andamento" data-situacao="pronta">
      <span class="dec-pronta" title=${`${milhar(a.total)} fotos analisadas neste aparelho`}><${Icone} nome="ok" /></span>
      <span class="dec-andamento-texto">${milhar(a.total)} analisadas</span>
      ${a.puladas ? html`<span class="dec-fora" title=${a.erro ?? ''}>${milhar(a.puladas)} sem prévia</span>` : null} ${fora}
    </div>`
  }
  if (!temFotos) return null
  return html`<div class="dec-andamento">
    <button type="button" class="vidro vidro--pequeno dec-comecar" onClick=${() => esteira.comecar()}><${Icone2} nome="tocar" tamanho=${14} />Analisar</button>
  </div>`
}

const BALDES = [
  { valor: 'fica', rotulo: 'Fica', dica: 'O que a nota manda ficar' },
  { valor: 'talvez', rotulo: 'Talvez', dica: 'Vale um olhar' },
  { valor: 'fora', rotulo: 'Fora', dica: 'Problema técnico, com o motivo' },
]

/** Os três baldes, que contam e filtram. */
function Baldes({ loja }) {
  usarCatalogo(loja, (c) => c.versao, ['fotos', 'dados', 'filtro'])
  const c = loja.catalogo
  const n = c.contagens()
  const ativo = c.filtro().balde?.[0] ?? null
  return html`<div class="dec-baldes" role="group" aria-label="Baldes">
    ${BALDES.map(
      (b) =>
        html`<button
          type="button"
          class="pilula dec-balde"
          data-valor=${b.valor}
          aria-pressed=${ativo === b.valor ? 'true' : 'false'}
          title=${b.dica}
          aria-label=${`${b.rotulo}: ${n.balde[b.valor] ?? 0}`}
          onClick=${() => c.filtrar({ balde: ativo === b.valor ? null : b.valor })}
        >
          <span class="balde-ponto" data-balde=${b.valor} aria-hidden="true"></span><span class="dec-balde-nome">${b.rotulo}</span
          ><span class="pilula-n"><${Numero} valor=${n.balde[b.valor] ?? 0} /></span>
        </button>`,
    )}
  </div>`
}

/** "Quero cerca de N": o controle mexe nos baldes ao vivo, sem reanalisar. */
function Meta({ est, esteira, total }) {
  const quadro = useRef(0)
  const mudar = (v, { final } = {}) => {
    cancelAnimationFrame(quadro.current)
    if (final) return esteira.definirMeta(v)
    quadro.current = requestAnimationFrame(() => esteira.definirMeta(v))
  }
  const sugestao = Math.max(1, Math.round(total * 0.3))
  return html`<${Balao}
    classe="dec-meta"
    classeBotao=${cx('pilula', est.meta != null && 'pilula--meta')}
    pressionado=${est.meta != null}
    rotulo="Quero cerca de"
    gatilho=${html`<${Icone2} nome="meta" tamanho=${14} /><span class="dec-meta-texto">${est.meta != null ? html`Cerca de <${Numero} valor=${est.meta} />` : 'Meta'}</span>`}
  >
    ${(fechar) =>
      html`<div class="dec-meta-quadro">
        <${Controle}
          rotulo="Quero cerca de"
          valor=${est.meta ?? sugestao}
          min=${1}
          max=${Math.max(2, total)}
          neutro=${sugestao}
          formato=${(v) => milhar(v)}
          aoMudar=${mudar}
        />
        <div class="dec-meta-pe">
          <span class="apoio">A nota não muda: só quem fica.</span>
          <button
            type="button"
            class="vidro vidro--pequeno"
            onClick=${() => {
              esteira.definirMeta(null)
              fechar()
            }}
          >
            Sem meta
          </button>
        </div>
      </div>`}
  <//>`
}

/**
 * A barra inteira. `modo` e `aoModo`: Grade ou Cenas. `principal`: { rotulo, curto, aoTocar, desligado, dica } (a ação de
 * fechar). `mais`: os itens do menu ⋯.
 */
export function BarraDaDecupagem({ loja, est, esteira, modo, aoModo, principal, mais }) {
  const total = usarCatalogo(loja, (c) => c.tamanho, ['fotos'])
  // a fila de dúvidas encolhe a cada decisão (e muda com a nota): a contagem acompanha
  const duvidas = usarCatalogo(loja, () => (modo === 'duvidas' ? -1 : esteira.duvidas().length), ['fotos', 'dados'])
  const ensaio = ENSAIOS[est.ensaio]
  return html`<div class="dec-barra" role="toolbar" aria-label="Decupagem">
    <${Andamento} est=${est} esteira=${esteira} temFotos=${total > 0} />
    <div class="dec-meio pilulas--rola">
      <${Baldes} loja=${loja} />
    </div>
    <${Meta} est=${est} esteira=${esteira} total=${total} />
    <div class="dec-fim">
      <${Menu}
        classe="dec-so-largo"
        classeBotao="liso dec-ficha"
        lado="direita"
        rotulo=${`Tipo de ensaio: ${ensaio?.nome}`}
        gatilho=${html`<span>${ensaio?.nome}</span>${est.ensaioDetectado === est.ensaio && !est.ensaioEscolhido ? html`<small>detectado</small>` : null}<${Icone} nome="baixo" />`}
        itens=${[
          { titulo: 'Tipo de ensaio' },
          ...Object.entries(ENSAIOS).map(([id, e]) => ({
            rotulo: e.nome,
            detalhe: id === 'geral' ? 'evento, retrato' : undefined,
            marcado: est.ensaio === id,
            aoEscolher: () => esteira.definirEnsaio(id),
          })),
        ]}
      />
      <${Menu}
        classe="dec-so-largo"
        classeBotao="liso dec-ficha"
        lado="direita"
        rotulo=${`Rigor: ${RIGORES[est.rigor].nome}`}
        gatilho=${html`<span>${RIGORES[est.rigor].nome}</span><${Icone} nome="baixo" />`}
        itens=${[
          { titulo: 'Rigor' },
          ...Object.entries(RIGORES).map(([id, r]) => ({ rotulo: r.nome, marcado: est.rigor === id, aoEscolher: () => esteira.definirRigor(id) })),
        ]}
      />
      <${Segmentado}
        classe="dec-modo"
        rotulo="Ver"
        valor=${modo}
        aoMudar=${aoModo}
        opcoes=${[
          { valor: 'grade', rotulo: 'Grade', icone: 'grade', mostrarRotulo: true, dica: 'Foto por foto · G' },
          { valor: 'cenas', rotulo: 'Cenas', icone: 'pilha', mostrarRotulo: true, dica: 'Uma cena por vez · C' },
          {
            valor: 'duvidas',
            rotulo: html`<${Icone2} nome="duvida" />Dúvidas${duvidas > 0 ? html`<span class="dec-modo-n"><${Numero} valor=${duvidas} /></span>` : null}`,
            dica: 'Só o que está em dúvida · Q',
          },
        ]}
      />
      <${Menu} lado="direita" rotulo="Mais" dica="Mais" gatilho=${html`<${Icone} nome="tres" />`} itens=${mais} />
      <button
        type="button"
        class="vidro vidro--tinta dec-principal"
        disabled=${principal.desligado}
        title=${principal.dica}
        data-acao=${principal.acao}
        onClick=${principal.aoTocar}
      >
        <${Icone2} nome=${principal.icone} tamanho=${16} /><span class="dec-longo">${principal.rotulo}</span><span class="dec-curto">${principal.curto}</span>
      </button>
    </div>
  </div>`
}
