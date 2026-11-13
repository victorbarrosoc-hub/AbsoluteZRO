// Estilos: a biblioteca de predefinições com a PRÓPRIA foto da pessoa em cada cartão. Uma ideia por tela: escolher um
// estilo olhando a foto. Passar o mouse (ou focar com o teclado) mostra no palco sem aplicar; clique e Enter aplicam
// na foto em foco ou na seleção; "Aplicar em todas" trata o trabalho inteiro (corrigindo cada foto antes, se a pessoa
// quiser). Importar do Lightroom e de LUT, extrair de uma foto de referência, guardar o ajuste da foto como estilo,
// exportar nos quatro formatos e guardar na conta moram nas folhas (folhas.js).
//
// Contrato de tela: export default um componente Preact que recebe { loja, ativa }.
//
// Peças: previas.js (pool de workers e cache das prévias), previa-worker.js (o motor revelando a prévia), acervo.js
// (biblioteca neste aparelho e na conta), arquivos.js (importar e exportar), cartao.js, folhas.js, estilos.css.
//
// Na foto do catálogo ficam `ajustes` (os do motor) e `predefinicao: { id, nome, intensidade, modo }`.

import { cx, html, useEffect, useMemo, useRef, useState } from '../../preact.js'
import { Icone } from '../../icones.js'
import { Controle, Menu, Numero, Pilulas, Progresso, Vazio, avisar } from '../../componentes/index.js'
import { usarCatalogo, usarFoto } from '../../estado.js'
import { usarAtalhos } from '../../casca/atalhos.js'
import { comTransicao, nomearFoto } from '../../casca/transicao.js'
import { neutro, normalizar } from '../../../src/motor/ajustes.js'
import {
  FAMILIAS,
  FAMILIA_DA_PESSOA,
  FAMILIA_IMPORTADAS,
  acrescentar,
  duplicar,
  estilosDaCasa,
  favoritar,
  familias as familiasDe,
  moverDeFamilia,
  recentes,
  remover,
  renomear,
  usar,
} from '../../../src/estilo/biblioteca.js'
import { aplicar, criarPredefinicao } from '../../../src/estilo/predefinicao.js'
import { tratarEmLote } from '../../../src/estilo/por-foto.js'
import { criarAcervo } from './acervo.js'
import { criarPrevias } from './previas.js'
import { Cartao, usarPrevia } from './cartao.js'
import { FolhaCriar, FolhaEditar, FolhaExtrair, FolhaImportar, FolhaMexe } from './folhas.js'
import { eArquivoDeEstilo, eImagem, exportarCube, exportarPacote, exportarXmp, exportarZropreset, lerParaImportar, temXmpDoLightroom } from './arquivos.js'

// a folha de estilo da tela entra junto com ela (a casca só liga a do sistema visual)
if (typeof document !== 'undefined' && !document.querySelector('link[data-estilos]')) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = new URL('./estilos.css', import.meta.url).pathname
  link.dataset.estilos = ''
  const chegou = new Promise((ok) => {
    link.onload = ok
    link.onerror = ok
  })
  document.head.append(link)
  await chegou
}

const MODOS = [
  { valor: 'corrigir-e-estilo', rotulo: 'Corrigir e aplicar', curto: 'Corrigir', detalhe: 'Exposição e branco foto a foto' },
  { valor: 'manter-o-que-ja-mexi', rotulo: 'Manter o que já mexi', curto: 'Manter', detalhe: 'Corrige só o que você não mexeu' },
  { valor: 'so-estilo', rotulo: 'Só o estilo', curto: 'Só o estilo', detalhe: 'Não corrige nada' },
]
const CENA = { chave: 'cena', cena: true }
const NOTA_VAZIO = 'Abra fotos para ver os estilos nelas.'
const NOTA_SEM_PREVIA = 'Esta foto ainda não tem prévia.'
const PREFERENCIAS = 'foto_estilos'

const semAcento = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function lerPreferencias() {
  try {
    const v = JSON.parse(localStorage.getItem(PREFERENCIAS) || '{}')
    return {
      modo: MODOS.some((m) => m.valor === v.modo) ? v.modo : 'corrigir-e-estilo',
      intensidade: Number.isFinite(v.intensidade) ? Math.max(0, Math.min(200, v.intensidade)) : 100,
      filtro: typeof v.filtro === 'string' ? v.filtro : 'todos',
    }
  } catch {
    return { modo: 'corrigir-e-estilo', intensidade: 100, filtro: 'todos' }
  }
}
function guardarPreferencias(p) {
  try {
    localStorage.setItem(PREFERENCIAS, JSON.stringify(p))
  } catch {
    // sem armazenamento: só nesta visita
  }
}

/** Só o que é da foto (exposição, branco, geometria): o estilo anterior não conta para o próximo. */
function soDaFoto(ajustes) {
  const a = normalizar(ajustes ?? neutro())
  const n = neutro()
  n.luz.exposicao = a.luz.exposicao
  n.branco = a.branco
  n.geometria = a.geometria
  return n
}

const corrigida = (r) => Math.abs(r.correcao?.exposicao || 0) >= 0.05 || r.correcao?.brancoMudou

/** A explicação curta de uma foto tratada: só o que mudou de verdade. */
const explicar = (linhas) =>
  linhas
    .filter((t) => !/mantid/i.test(t))
    .map((t) => t.replace(/\.$/, ''))
    .join(' · ')

const icone = (corpo) =>
  html`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
    ${corpo}
  </svg>`
const LUPA = icone(html`<circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />`)

// uma biblioteca e um pool por página: o que já foi revelado continua valendo ao trocar de aba ou de trabalho
let acervo = null
let previas = null

function usarAcervo() {
  const [, redesenhar] = useState(0)
  useEffect(() => acervo.assinar(() => redesenhar((n) => n + 1)), [])
  return { bib: acervo.estado(), conta: acervo.conta() }
}

/** Filtro de texto: todas as palavras em nome, família ou descrição, sem acento. */
function filtroDeTexto(busca) {
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean)
  if (!palavras.length) return () => true
  return (p) => {
    const onde = semAcento(`${p.nome} ${p.familia} ${p.descricao}`)
    return palavras.every((w) => onde.includes(w))
  }
}

/** As seções da biblioteca para o filtro e a busca: [{ id, titulo, lista, marca? }]. */
function secoesDe({ bib, conta, filtro, busca }) {
  const casa = estilosDaCasa()
  const passa = filtroDeTexto(busca)
  const locais = bib.predefinicoes
  const daPessoa = locais.filter((p) => p.familia !== FAMILIA_IMPORTADAS)
  const importadas = locais.filter((p) => p.familia === FAMILIA_IMPORTADAS)
  const locaisIds = new Set(locais.map((p) => p.id))
  const naConta = conta.minhas.filter((p) => !locaisIds.has(p.id))
  const todos = new Map([...casa, ...locais, ...naConta, ...conta.equipe].map((p) => [p.id, p]))
  const porFamilia = (lista) => {
    const grupos = new Map()
    for (const p of lista) {
      if (!grupos.has(p.familia)) grupos.set(p.familia, [])
      grupos.get(p.familia).push(p)
    }
    return [...grupos].sort(([a], [b]) => (a === FAMILIA_DA_PESSOA ? -1 : b === FAMILIA_DA_PESSOA ? 1 : semAcento(a).localeCompare(semAcento(b), 'pt')))
  }
  const secoes = []
  const por = (id, titulo, lista, marca) => {
    const l = lista.filter(passa)
    if (l.length) secoes.push({ id, titulo, lista: l, marca })
  }
  if (filtro === 'favoritos') por('favoritos', null, bib.favoritos.map((id) => todos.get(id)).filter(Boolean))
  else if (filtro === 'recentes') por('recentes', null, recentes(bib))
  else if (filtro === 'meus') {
    for (const [f, l] of porFamilia(daPessoa)) por(`p-${f}`, f, l)
    por('conta', 'Na conta', naConta, 'Conta')
  } else if (filtro === 'importados') por('importados', null, importadas)
  else if (filtro === 'equipe') por('equipe', null, conta.equipe, 'Equipe')
  else if (FAMILIAS.includes(filtro))
    por(
      filtro,
      null,
      casa.filter((p) => p.familia === filtro),
    )
  else {
    if (!busca && bib.favoritos.length) por('favoritos', 'Favoritos', bib.favoritos.map((id) => todos.get(id)).filter(Boolean))
    for (const [f, l] of porFamilia(daPessoa)) por(`p-${f}`, f === FAMILIA_DA_PESSOA ? 'Meus' : f, l)
    por('conta', 'Na conta', naConta, 'Conta')
    por('equipe', 'Da equipe', conta.equipe, 'Equipe')
    for (const f of FAMILIAS)
      por(
        f,
        f,
        casa.filter((p) => p.familia === f),
      )
    por('importados', 'Importados', importadas)
  }
  return { secoes, todos, locaisIds, contagem: { daPessoa: daPessoa.length + naConta.length, importadas: importadas.length } }
}

/** O palco: a foto grande (escura nos dois temas) com o estilo que está sendo visto. */
function Palco({ fonte, daFoto, p, intensidade, arrastando, antes, semFoto, vazio, refImagem, nomeDaFoto, podeAndar, aoAndar, children }) {
  const pedido = fonte && daFoto ? { fonte, p: antes ? null : p, daFoto, intensidade, lado: arrastando ? 640 : 1024, local: !arrastando } : null
  const grande = usarPrevia(previas, pedido, { prioridade: 100, espera: 60, cancelarAoTrocar: true })
  // enquanto a grande não chega, a do cartão (mesma foto, mesmo estilo) segura o lugar: a troca é imediata
  const pequena = fonte && daFoto && intensidade === 100 ? previas.pronta(previas.chaveDe({ fonte, p: antes ? null : p, daFoto, lado: 320 })) : null
  // a última que ficou pronta, para nunca voltar ao vazio
  const src = grande.pronta ? grande.url : (pequena ?? grande.url)
  return html`<section
    class="estilos-palco palco"
    aria-label="Foto"
    data-palco-estilo=${antes ? 'antes' : (p?.id ?? '')}
    data-pronto=${grande.pronta ? '1' : '0'}
  >
    <div class="palco-foto">
      ${
        src
          ? html`<img ref=${refImagem} src=${src} alt=${nomeDaFoto || 'Foto'} draggable="false" data-nitida=${grande.pronta ? '1' : '0'} />`
          : html`<span class="esqueleto palco-esqueleto" aria-hidden="true"></span>`
      }
    </div>
    ${
      podeAndar
        ? html`<button type="button" class="liso palco-andar palco-andar--antes" aria-label="Foto anterior" onClick=${() => aoAndar(-1)}>
              <${Icone} nome="esquerda" />
            </button>
            <button type="button" class="liso palco-andar palco-andar--depois" aria-label="Próxima foto" onClick=${() => aoAndar(1)}>
              <${Icone} nome="direita" />
            </button>`
        : null
    }
    ${semFoto ? html`<span class="palco-nota">${vazio ? NOTA_VAZIO : NOTA_SEM_PREVIA}</span>` : null} ${children}
  </section>`
}

/** As teclas desta tela para a folha "?". */
export const atalhos = [
  { tecla: ['←', '→', '↑', '↓'], oque: 'Andar pelos estilos' },
  { tecla: 'Enter', oque: 'Aplicar' },
  { tecla: 'F', oque: 'Favoritar' },
  { tecla: '/', oque: 'Buscar' },
  { tecla: '\\', oque: 'Segurar para ver o antes' },
]

export default function Estilos({ loja, ativa }) {
  acervo ??= criarAcervo()
  previas ??= criarPrevias()
  const { bib, conta } = usarAcervo()
  const inicial = useMemo(lerPreferencias, [])
  const [modo, definirModo] = useState(inicial.modo)
  const [intensidade, definirIntensidade] = useState(inicial.intensidade)
  const [intensidadeVer, definirIntensidadeVer] = useState(inicial.intensidade)
  const [arrastando, definirArrastando] = useState(false)
  const [filtro, definirFiltro] = useState(inicial.filtro)
  const [busca, definirBusca] = useState('')
  const [vendo, definirVendo] = useState({ mouse: null, teclado: null })
  const [escolhido, definirEscolhido] = useState(null)
  const [antes, definirAntes] = useState(false)
  const [folha, definirFolha] = useState(null) // importar | extrair | criar | renomear | mover | mexe
  const [alvoDaFolha, definirAlvoDaFolha] = useState(null)
  const [importacao, definirImportacao] = useState({ lendo: false, resultados: [], desfazer: null })
  const [referencias, definirReferencias] = useState(null)
  const [tratando, definirTratando] = useState(null) // { feitas, total }
  const [soltando, definirSoltando] = useState(false)
  const raiz = useRef(null)
  const campoBusca = useRef(null)
  const imagemDoPalco = useRef(null)
  const ultimo = useRef(null) // { pId, ids }: a última aplicação (a intensidade e o modo valem para ela)

  useEffect(() => guardarPreferencias({ modo, intensidade, filtro }), [modo, intensidade, filtro])
  useEffect(() => {
    void acervo.lerConta()
  }, [])

  // ── a foto em foco e a fonte da prévia ──
  const focoId = usarCatalogo(loja, (c) => c.foco() ?? c.visiveis()[0]?.id ?? null, ['selecao', 'fotos', 'filtro', 'ordem'])
  const totalDeFotos = usarCatalogo(loja, (c) => c.tamanho, ['fotos'])
  const visiveisN = usarCatalogo(loja, (c) => c.visiveis().length, ['fotos', 'filtro'])
  const alvoN = usarCatalogo(loja, (c) => c.alvo().length, ['selecao', 'fotos'])
  const { foto } = usarFoto(loja, focoId ?? '')
  const [fonte, definirFonte] = useState(null)
  useEffect(() => {
    let vivo = true
    if (!focoId) {
      definirFonte(CENA)
      return
    }
    loja.miniaturas
      .blob(focoId, 'previa')
      .then((blob) => vivo && definirFonte(blob ? { chave: focoId, blob } : CENA))
      .catch(() => vivo && definirFonte(CENA))
    return () => {
      vivo = false
    }
  }, [focoId])
  const semFoto = !!fonte?.cena
  useEffect(() => {
    if (fonte) previas.cancelarOutras(fonte.chave)
  }, [fonte])

  // a foto trocou: o palco volta para o estilo que ela tem, e a intensidade para a dela
  useEffect(() => {
    definirEscolhido(null)
    const i = loja.catalogo.foto(focoId ?? '')?.predefinicao?.intensidade
    if (Number.isFinite(i)) {
      definirIntensidade(i)
      definirIntensidadeVer(i)
    }
  }, [focoId])

  // ── a correção da foto (não depende do estilo): o que o cartão mostra é o que a foto recebe ──
  const daFotoBase = useMemo(() => soDaFoto(foto?.ajustes), [foto?.ajustes])
  const [correcao, definirCorrecao] = useState(null)
  useEffect(() => {
    if (!fonte) return
    let vivo = true
    const fim = (daFoto, explicacao = []) => vivo && definirCorrecao({ fonte: fonte.chave, modo, daFoto, explicacao })
    if (modo === 'so-estilo') fim(daFotoBase)
    else
      previas
        .corrigir(fonte, daFotoBase, modo)
        .then((r) => {
          // mesma correção que a anterior: o mesmo objeto (os cartões não pedem de novo)
          const nova = soDaFoto(r.ajustes)
          definirCorrecao((c) =>
            vivo
              ? c && c.fonte === fonte.chave && c.modo === modo && JSON.stringify(c.daFoto) === JSON.stringify(nova)
                ? { ...c, explicacao: r.explicacao }
                : { fonte: fonte.chave, modo, daFoto: nova, explicacao: r.explicacao }
              : c,
          )
        })
        .catch(() => fim(daFotoBase))
    return () => {
      vivo = false
    }
  }, [fonte, modo, daFotoBase])
  const daFoto = correcao && fonte && correcao.fonte === fonte.chave && correcao.modo === modo ? correcao.daFoto : null

  // ── a biblioteca ──
  const { secoes, todos, locaisIds, contagem } = useMemo(() => secoesDe({ bib, conta, filtro, busca }), [bib, conta, filtro, busca])
  const aplicadoId = foto?.predefinicao?.id ?? null
  const escolhidoId = escolhido ?? aplicadoId
  const palcoId = vendo.mouse ?? vendo.teclado ?? escolhidoId
  const estiloDoPalco = palcoId ? (todos.get(palcoId) ?? null) : null
  const estiloEscolhido = escolhidoId ? (todos.get(escolhidoId) ?? null) : null
  const favoritos = useMemo(() => new Set(bib.favoritos), [bib])
  const familias = useMemo(() => [FAMILIA_DA_PESSOA, ...familiasDe(bib).filter((f) => f !== FAMILIA_DA_PESSOA)], [bib])
  const pilulas = [
    { valor: 'todos', rotulo: 'Todos' },
    bib.favoritos.length ? { valor: 'favoritos', rotulo: 'Favoritos', icone: 'estrela' } : null,
    bib.recentes.length ? { valor: 'recentes', rotulo: 'Recentes' } : null,
    contagem.daPessoa ? { valor: 'meus', rotulo: 'Meus' } : null,
    contagem.importadas ? { valor: 'importados', rotulo: 'Importados' } : null,
    conta.equipe.length ? { valor: 'equipe', rotulo: 'Da equipe' } : null,
    ...FAMILIAS.map((f) => ({ valor: f, rotulo: f })),
  ].filter(Boolean)
  useEffect(() => {
    if (acervo.pronto() && !pilulas.some((x) => x.valor === filtro)) definirFiltro('todos')
  })

  // ── aplicar ──
  const estado = useRef({})
  estado.current = { foto, focoId, daFoto, correcao, modo, intensidade, fonte, todos, locaisIds, bib, conta }

  async function aplicarEm(p, ids, { intensidadeNova = null, silencioso = false } = {}) {
    const s = estado.current
    const forca = intensidadeNova ?? s.intensidade
    if (!ids.length) {
      avisar('Abra fotos para aplicar.')
      return
    }
    const c = loja.catalogo
    let resultados
    if (ids.length === 1 && ids[0] === s.focoId && s.daFoto) {
      const ajustes = aplicar(p, s.daFoto, forca)
      resultados = [
        {
          id: ids[0],
          ajustes,
          explicacao: [...(s.modo === 'so-estilo' ? [] : s.correcao?.explicacao || []), `${p.nome}${forca !== 100 ? ` a ${forca}%` : ''}`],
        },
      ]
    } else if (s.modo === 'so-estilo') {
      resultados = tratarEmLote(
        ids.map((id) => ({ id, ajustes: c.foto(id)?.ajustes })),
        p,
        { modo: 'so-estilo', intensidade: forca },
      )
    } else {
      definirTratando({ feitas: 0, total: ids.length })
      try {
        const fotos = []
        for (const id of ids) {
          const f = c.foto(id)
          if (!f) continue
          fotos.push({ id, blob: await loja.miniaturas.blob(id, 'previa').catch(() => null), ajustes: f.ajustes, grupo: f.grupo })
        }
        resultados = await previas.lote(
          { fotos, p, modo: s.modo, intensidade: forca },
          { aoProgredir: (x) => definirTratando({ feitas: Math.round(x * ids.length), total: ids.length }) },
        )
      } catch {
        avisar('Não deu para tratar as fotos.')
        return
      } finally {
        definirTratando(null)
      }
    }
    if (!resultados) return
    const porId = new Map(resultados.map((r) => [r.id, r]))
    const marca = { id: p.id, nome: p.nome, intensidade: forca, modo: s.modo }
    const mudou = c.definir(
      ids.filter((id) => porId.has(id)),
      (f) => ({ ajustes: porId.get(f.id).ajustes, predefinicao: marca }),
      { rotulo: `Estilo ${p.nome}` },
    )
    ultimo.current = { pId: p.id, ids }
    acervo.mudar((e) => {
      try {
        return usar(e, p.id)
      } catch {
        return e
      }
    })
    if (silencioso || !mudou.length) return
    const texto =
      resultados.length === 1
        ? explicar(resultados[0].explicacao) || p.nome
        : `${p.nome} em ${resultados.length.toLocaleString('pt-BR')} fotos${
            s.modo === 'so-estilo' ? '' : ` · ${resultados.filter(corrigida).length.toLocaleString('pt-BR')} corrigidas`
          }`
    avisar(texto, { desfazer: () => c.desfazer() })
  }

  /** Clique ou Enter num cartão: aplica na foto em foco (ou na seleção), e o cartão cresce até o palco. */
  function escolher(p, origemEl) {
    const ids = loja.catalogo.alvo().length ? loja.catalogo.alvo() : focoId ? [focoId] : []
    const img = origemEl?.querySelector?.('img')
    const tirar = img && imagemDoPalco.current ? nomearFoto(img) : null
    void aplicarEm(p, ids)
    if (!tirar) {
      definirEscolhido(p.id)
      return
    }
    void comTransicao(
      async () => {
        tirar()
        definirEscolhido(p.id)
        await new Promise((ok) => setTimeout(ok, 0))
        if (imagemDoPalco.current) imagemDoPalco.current.style.viewTransitionName = 'foto'
      },
      { sentido: 'fica' },
    ).then(() => {
      if (imagemDoPalco.current) imagemDoPalco.current.style.viewTransitionName = ''
    })
  }

  function aplicarEmTodas() {
    const p = estiloEscolhido
    if (!p) return
    const ids = loja.catalogo.visiveis().map((f) => f.id)
    definirEscolhido(p.id)
    void aplicarEm(p, ids)
  }

  /** A intensidade vale também para a última aplicação, se o palco mostra aquele estilo (o modo vale para a próxima). */
  function reaplicar(mudanca) {
    const u = ultimo.current
    const p = u && estado.current.todos.get(u.pId)
    if (!p || palcoId !== u.pId) return
    void aplicarEm(
      p,
      u.ids.filter((id) => loja.catalogo.foto(id)),
      { ...mudanca, silencioso: true },
    )
  }

  // ── a biblioteca muda ──
  const mudarBiblioteca = (f, texto) => {
    try {
      const desfazer = acervo.mudar(f)
      if (texto) avisar(texto, { desfazer })
      return true
    } catch (e) {
      avisar(e?.message || 'Não deu.')
      return false
    }
  }
  const alternarFavorito = (id) => {
    const p = estado.current.todos.get(id)
    if (!p) return
    if (!estado.current.locaisIds.has(id) && !id.startsWith('casa-')) {
      // da conta ou da equipe: entra neste aparelho para poder ser favorita
      mudarBiblioteca((e) => favoritar(acrescentar(e, p), id, true))
      return
    }
    mudarBiblioteca((e) => favoritar(e, id))
  }
  const duplicarEstilo = (p) => {
    let novo = null
    const ok = mudarBiblioteca((e) => {
      try {
        const r = duplicar(e, p.id)
        novo = r.predefinicao
        return r.estado
      } catch {
        novo = criarPredefinicao({ ...p, id: undefined, nome: `${p.nome} cópia`, familia: FAMILIA_DA_PESSOA, origem: { tipo: 'manual' } })
        return acrescentar(e, novo)
      }
    })
    if (ok && novo) {
      avisar(`${novo.nome} em Meus`, { desfazer: () => acervo.mudar((e) => remover(e, novo.id)) })
    }
  }
  const apagar = (p) => mudarBiblioteca((e) => remover(e, p.id), `${p.nome} apagado`)
  const exportar = (f, p) => {
    try {
      avisar(f(p).aviso)
    } catch (e) {
      avisar(e?.message || 'Não deu para exportar.')
    }
  }
  const guardarNaConta = async (p, compartilhada) => {
    const r = await acervo.guardarNaConta(p, { compartilhada })
    if (r.ok) avisar(compartilhada ? 'Compartilhado com a equipe' : 'Guardado na conta')
    else if (r.erro === 'sem_equipe') avisar('Você não está numa equipe agora.')
    else if (r.erro === 'teto') avisar('A conta já tem 500 estilos.')
    else avisar('Não deu para guardar na conta.')
  }

  const itensDoMenu = (p) => {
    const s = estado.current
    const local = s.locaisIds.has(p.id)
    const daCasa = p.id.startsWith('casa-')
    const fav = s.bib.favoritos.includes(p.id)
    return [
      { rotulo: 'Aplicar', icone: 'ok', aoEscolher: () => escolher(p) },
      { rotulo: 'O que mexe', icone: 'info', aoEscolher: () => abrirFolha('mexe', p) },
      { rotulo: fav ? 'Tirar dos favoritos' : 'Favoritar', icone: 'estrela', detalhe: 'F', aoEscolher: () => alternarFavorito(p.id) },
      { rotulo: 'Duplicar', icone: 'mais', aoEscolher: () => duplicarEstilo(p) },
      local ? { rotulo: 'Renomear', icone: 'lapis', aoEscolher: () => abrirFolha('renomear', p) } : null,
      local ? { rotulo: 'Mover de família', icone: 'pasta', aoEscolher: () => abrirFolha('mover', p) } : null,
      !local && !daCasa
        ? { rotulo: 'Guardar neste aparelho', icone: 'soltar', aoEscolher: () => mudarBiblioteca((e) => acrescentar(e, p), `${p.nome} guardado`) }
        : null,
      { divisa: true },
      { titulo: 'Exportar' },
      { rotulo: 'Estilo', detalhe: '.zropreset', icone: 'soltar', aoEscolher: () => exportar(exportarZropreset, p) },
      { rotulo: 'Lightroom', detalhe: '.xmp', icone: 'soltar', aoEscolher: () => exportar(exportarXmp, p) },
      { rotulo: 'LUT', detalhe: '.cube', icone: 'soltar', aoEscolher: () => exportar(exportarCube, p) },
      s.conta.ligada ? { divisa: true } : null,
      s.conta.ligada ? { rotulo: 'Guardar na conta', icone: 'pessoa', aoEscolher: () => guardarNaConta(p, false) } : null,
      s.conta.ligada ? { rotulo: 'Compartilhar com a equipe', icone: 'set', aoEscolher: () => guardarNaConta(p, true) } : null,
      local ? { divisa: true } : null,
      local ? { rotulo: 'Apagar', icone: 'lixo', perigo: true, aoEscolher: () => apagar(p) } : null,
    ]
  }

  function abrirFolha(nome, p = null) {
    definirAlvoDaFolha(p)
    definirFolha(nome)
  }

  // ── importar e extrair ──
  async function importarArquivos(lista) {
    definirFolha('importar')
    definirImportacao((i) => ({ ...i, lendo: true }))
    const resultados = []
    for (const arquivo of lista) resultados.push(await lerParaImportar(arquivo))
    let entraram = 0
    const desfazer = acervo.mudar((e) => {
      let s = e
      for (const r of resultados) {
        for (const p of r.predefinicoes) {
          try {
            s = acrescentar(s, p)
            entraram++
          } catch (erro) {
            r.erros.push(erro?.message || 'Não entrou.')
          }
        }
      }
      return s
    })
    definirImportacao((i) => ({
      lendo: false,
      resultados: [...i.resultados, ...resultados],
      entraram: (i.entraram || 0) + entraram,
      desfazer: entraram ? (i.desfazer ? () => (desfazer(), i.desfazer()) : desfazer) : i.desfazer,
      importadas: i.importadas || resultados.some((r) => r.predefinicoes.some((p) => p.familia === FAMILIA_IMPORTADAS)),
    }))
  }
  function fecharImportar() {
    const i = importacao
    definirFolha(null)
    definirImportacao({ lendo: false, resultados: [], desfazer: null })
    if (i.entraram) {
      definirFiltro(i.importadas ? 'importados' : 'meus')
      avisar(`${i.entraram} ${i.entraram === 1 ? 'estilo importado' : 'estilos importados'}`, { desfazer: i.desfazer })
    }
  }
  const extrair = (arquivos) =>
    previas.extrair({ referencias: arquivos, alvo: semFoto ? null : fonte, daFoto: daFoto ?? daFotoBase, nome: arquivos[0]?.name?.replace(/\.[^.]+$/, '') })

  function guardarNovo(p, { filtroDepois = 'meus' } = {}) {
    let novo
    try {
      novo = criarPredefinicao({ ...p, familia: p.familia || FAMILIA_DA_PESSOA })
    } catch (e) {
      avisar(e?.message || 'Não deu para guardar.')
      return
    }
    definirFolha(null)
    definirReferencias(null)
    const desfazer = acervo.mudar((e) => acrescentar(e, novo))
    definirFiltro(filtroDepois)
    definirEscolhido(novo.id)
    avisar(`${novo.nome} guardado`, { desfazer })
  }

  async function soltouNaTela(lista) {
    const presets = lista.filter(eArquivoDeEstilo)
    const imagens = lista.filter((f) => !eArquivoDeEstilo(f) && eImagem(f))
    const doLightroom = []
    const refs = []
    for (const f of imagens) ((await temXmpDoLightroom(f).catch(() => false)) ? doLightroom : refs).push(f)
    if (presets.length || doLightroom.length) void importarArquivos([...presets, ...doLightroom])
    else if (refs.length) {
      definirReferencias(refs)
      definirFolha('extrair')
    } else avisar('Solte um preset ou uma foto de referência.')
  }

  // soltar em qualquer lugar da tela: preset vira importação, foto vira referência (e não abre como foto do trabalho)
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    let dentro = 0
    const tem = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
    const entrou = (e) => {
      if (!tem(e)) return
      e.stopPropagation()
      dentro++
      if (!document.querySelector('dialog[open]')) definirSoltando(true)
    }
    const sobre = (e) => {
      if (!tem(e)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
    }
    const saiu = (e) => {
      if (!tem(e)) return
      e.stopPropagation()
      dentro = Math.max(0, dentro - 1)
      if (!dentro) definirSoltando(false)
    }
    const soltou = (e) => {
      if (!tem(e)) return
      e.preventDefault()
      e.stopPropagation()
      dentro = 0
      definirSoltando(false)
      const lista = [...e.dataTransfer.files]
      if (lista.length) void soltouNaTela(lista)
    }
    el.addEventListener('dragenter', entrou)
    el.addEventListener('dragover', sobre)
    el.addEventListener('dragleave', saiu)
    el.addEventListener('drop', soltou)
    return () => {
      el.removeEventListener('dragenter', entrou)
      el.removeEventListener('dragover', sobre)
      el.removeEventListener('dragleave', saiu)
      el.removeEventListener('drop', soltou)
    }
  }, [])

  // ── teclado: setas na biblioteca, Enter aplica (o botão), F favorita, / busca, \ mostra o antes ──
  const verCartao = (id, como) => definirVendo((v) => (v[como] === id ? v : { ...v, [como]: id }))
  const cartoes = () => [...(raiz.current?.querySelectorAll('.estilo-cartao') || [])]
  usarAtalhos(ativa && !folha, (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === '/') {
      e.preventDefault()
      campoBusca.current?.focus()
      return
    }
    if (e.key === '\\') {
      e.preventDefault()
      definirAntes(true)
      return
    }
    const atual = document.activeElement?.closest?.('.estilo')?.querySelector('.estilo-cartao')
    if (e.key === 'f' || e.key === 'F') {
      const id = atual?.dataset.estilo ?? palcoId
      if (id) {
        e.preventDefault()
        alternarFavorito(id)
      }
      return
    }
    const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 'cima', ArrowDown: 'baixo' }[e.key]
    if (!passo) return
    const lista = cartoes()
    if (!lista.length) return
    e.preventDefault()
    let i = lista.indexOf(atual)
    if (i < 0)
      i = Math.max(
        0,
        lista.findIndex((b) => b.dataset.estilo === palcoId),
      )
    else if (typeof passo === 'number') i = Math.max(0, Math.min(lista.length - 1, i + passo))
    else {
      // a linha de cima ou de baixo: o cartão mais perto na horizontal
      // posição de layout (sem as transformações da cascata, que ainda podem estar correndo)
      const caixa = (b) => {
        const li = b.closest('.estilo')
        return { left: li.offsetLeft, top: li.offsetTop, width: li.offsetWidth, height: li.offsetHeight, bottom: li.offsetTop + li.offsetHeight }
      }
      const r = caixa(lista[i])
      const meio = r.left + r.width / 2
      const candidatos = lista
        .map((b, k) => ({ k, r: caixa(b) }))
        .filter((c) => (passo === 'baixo' ? c.r.top > r.top + r.height / 2 : c.r.bottom < r.top + r.height / 2))
      if (candidatos.length) {
        const linha = passo === 'baixo' ? Math.min(...candidatos.map((c) => c.r.top)) : Math.max(...candidatos.map((c) => c.r.top))
        const naLinha = candidatos.filter((c) => Math.abs(c.r.top - linha) < 4)
        i = naLinha.reduce((m, c) => (Math.abs(c.r.left + c.r.width / 2 - meio) < Math.abs(m.r.left + m.r.width / 2 - meio) ? c : m)).k
      }
    }
    lista[i].focus()
    lista[i].scrollIntoView({ block: 'nearest' })
  })
  useEffect(() => {
    if (!antes) return
    const solta = (e) => e.key === '\\' && definirAntes(false)
    addEventListener('keyup', solta)
    addEventListener('blur', () => definirAntes(false), { once: true })
    return () => removeEventListener('keyup', solta)
  }, [antes])

  // os cartões recebem funções que não mudam (o memo do cartão vale); por dentro, chamam as de agora
  const acoes = useRef(null)
  acoes.current = { itensDoMenu, verCartao, escolher, alternarFavorito }
  const estaveis = useMemo(
    () => ({
      itensDoMenu: (p) => acoes.current.itensDoMenu(p),
      verCartao: (id, como) => acoes.current.verCartao(id, como),
      escolher: (p, el) => acoes.current.escolher(p, el),
      alternarFavorito: (id) => acoes.current.alternarFavorito(id),
    }),
    [],
  )
  const nomeDaFoto = foto?.nome ?? ''
  const vazio = totalDeFotos === 0
  const modoAtual = MODOS.find((m) => m.valor === modo)
  const lookDaFoto = aplicadoId ? (todos.get(aplicadoId)?.look ?? null) : null
  let indice = 0

  return html`<div class=${cx('tela tela--fixa estilos', soltando && 'estilos--soltando')} ref=${raiz}>
    <div class="estilos-grade">
      <${Palco}
        fonte=${fonte}
        daFoto=${daFoto}
        p=${estiloDoPalco}
        intensidade=${intensidadeVer}
        arrastando=${arrastando}
        antes=${antes}
        semFoto=${semFoto}
        vazio=${vazio}
        refImagem=${imagemDoPalco}
        nomeDaFoto=${nomeDaFoto}
        podeAndar=${visiveisN > 1}
        aoAndar=${(passo) => loja.catalogo.mover(passo)}
      >
        <header class="palco-cabeca">
          <div class="palco-titulo" aria-live="polite">
            <span class="sobretitulo">${antes ? 'Antes' : (estiloDoPalco?.familia ?? (nomeDaFoto || ' '))}</span>
            <h2>${!antes && estiloDoPalco ? html`<span class="pesado">${estiloDoPalco.nome}</span>` : html`<span class="fino">Sem estilo</span>`}</h2>
          </div>
          ${
            estiloDoPalco
              ? html`<div class="palco-acoes">
                  <button
                    type="button"
                    class="liso"
                    aria-pressed=${favoritos.has(estiloDoPalco.id) ? 'true' : 'false'}
                    aria-label=${favoritos.has(estiloDoPalco.id) ? 'Tirar dos favoritos' : 'Favoritar'}
                    data-dica="Favoritar"
                    data-tecla="F"
                    data-dica-lado="esquerda"
                    onClick=${() => alternarFavorito(estiloDoPalco.id)}
                  >
                    <${Icone} nome="estrela" cheio=${favoritos.has(estiloDoPalco.id)} />
                  </button>
                  <button
                    type="button"
                    class="liso"
                    aria-label="O que este estilo mexe"
                    data-dica="O que mexe"
                    data-dica-lado="esquerda"
                    onClick=${() => abrirFolha('mexe', estiloDoPalco)}
                  >
                    <${Icone} nome="info" />
                  </button>
                </div>`
              : null
          }
        </header>
        <div class="estilos-barra barra-vidro" role="group" aria-label="Aplicar">
          <button
            type="button"
            class="vidro vidro--icone"
            aria-label="Ver antes (segure)"
            aria-pressed=${antes ? 'true' : 'false'}
            data-dica="Antes · segure"
            data-tecla="\\"
            data-dica-lado="cima"
            onPointerDown=${(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId)
              definirAntes(true)
            }}
            onPointerUp=${() => definirAntes(false)}
            onPointerCancel=${() => definirAntes(false)}
            onKeyDown=${(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), definirAntes(true))}
            onKeyUp=${(e) => (e.key === ' ' || e.key === 'Enter') && definirAntes(false)}
            onContextMenu=${(e) => e.preventDefault()}
          >
            <${Icone} nome="comparar" />
          </button>
          <${Controle}
            rotulo="Intensidade"
            classe="estilos-intensidade"
            min=${0}
            max=${200}
            neutro=${100}
            passo=${1}
            valor=${intensidadeVer}
            formato=${(v) => `${v}%`}
            aoMudar=${(v, { final }) => {
              definirIntensidadeVer(v)
              definirArrastando(!final)
              if (final) {
                definirIntensidade(v)
                reaplicar({ intensidadeNova: v })
              }
            }}
          />
          <${Menu}
            classe="estilos-modo"
            classeBotao="vidro vidro--pequeno"
            rotulo=${`Como tratar: ${modoAtual.rotulo}`}
            lado="cima"
            gatilho=${html`<span class="modo-longo">${modoAtual.rotulo}</span><span class="modo-curto">${modoAtual.curto}</span><${Icone} nome="baixo" />`}
            itens=${MODOS.map((m) => ({
              rotulo: m.rotulo,
              detalhe: m.detalhe,
              marcado: m.valor === modo,
              aoEscolher: () => {
                definirModo(m.valor)
              },
            }))}
          />
          ${
            tratando
              ? html`<div class="estilos-tratando" role="status">
                  <${Progresso} valor=${tratando.total ? tratando.feitas / tratando.total : null} rotulo="Tratando" /><span
                    ><${Numero} valor=${tratando.feitas} /> de <${Numero} valor=${tratando.total}
                  /></span>
                </div>`
              : html`<button
                  type="button"
                  class="vidro vidro--tinta estilos-aplicar"
                  disabled=${!estiloEscolhido || !visiveisN}
                  onClick=${aplicarEmTodas}
                  title=${estiloEscolhido ? `${estiloEscolhido.nome} em todas as fotos à vista` : 'Escolha um estilo'}
                >
                  ${visiveisN > 1 ? html`Aplicar em todas <span class="estilos-n"><${Numero} valor=${visiveisN} /></span>` : 'Aplicar'}
                </button>`
          }
        </div>
      <//>

      <section class="estilos-biblioteca" aria-label="Biblioteca de estilos">
        <header class="biblioteca-cabeca">
          <h2><span class="pesado">Estilos</span>${alvoN > 1 ? html`<span class="fino"> · ${alvoN} fotos</span>` : null}</h2>
          <${Menu}
            classe="biblioteca-novo"
            classeBotao="vidro vidro--icone"
            rotulo="Novo estilo"
            dica="Novo"
            lado="esquerda"
            gatilho=${html`<${Icone} nome="mais" />`}
            itens=${[
              { rotulo: 'Importar preset', detalhe: 'Lightroom, LUT', icone: 'soltar', aoEscolher: () => abrirFolha('importar') },
              { rotulo: 'Extrair de uma foto', icone: 'fotos', aoEscolher: () => abrirFolha('extrair') },
              { rotulo: 'Guardar o ajuste desta foto', icone: 'revelar', aoEscolher: () => abrirFolha('criar') },
              { divisa: true },
              { rotulo: 'Exportar meus estilos', detalhe: '.zropack', icone: 'pasta', aoEscolher: () => avisar(exportarPacote(bib).aviso) },
            ]}
          />
        </header>
        <label class="busca">
          ${LUPA}
          <span class="so-leitor">Buscar estilo</span>
          <input
            ref=${campoBusca}
            type="search"
            placeholder="Buscar"
            value=${busca}
            autocomplete="off"
            spellcheck="false"
            onInput=${(e) => definirBusca(e.currentTarget.value)}
            onKeyDown=${(e) => {
              if (e.key === 'Escape') {
                definirBusca('')
                e.currentTarget.blur()
              } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault()
                cartoes()[0]?.focus()
              }
            }}
          />
          <kbd class="tecla busca-tecla" aria-hidden="true">/</kbd>
        </label>
        <${Pilulas} classe="biblioteca-filtros" rola rotulo="Filtrar" opcoes=${pilulas} valor=${filtro} aoMudar=${(v) => definirFiltro(v ?? 'todos')} />
        <div class="biblioteca-lista" key=${filtro}>
          ${
            !secoes.length
              ? html`<${Vazio} icone="estilos" titulo=${busca ? ['Nada', 'com essa busca.'] : ['Nada', 'por aqui.']}>
                  ${busca ? html`<button type="button" class="vidro" onClick=${() => definirBusca('')}>Limpar a busca</button>` : null}
                <//>`
              : secoes.map(
                  (s) =>
                    html`<section class="biblioteca-secao" key=${s.id} aria-label=${s.titulo ?? undefined}>
                      ${s.titulo ? html`<h3>${s.titulo}</h3>` : null}
                      <ul class="estilos-lista cascata">
                        ${s.lista.map(
                          (p) =>
                            html`<${Cartao}
                              key=${`${s.id}:${p.id}`}
                              i=${indice++}
                              p=${p}
                              fonte=${fonte}
                              daFoto=${daFoto}
                              naFoto=${p.id === aplicadoId}
                              favorito=${favoritos.has(p.id)}
                              marca=${s.marca}
                              previas=${previas}
                              itensDoMenu=${estaveis.itensDoMenu}
                              aoVer=${estaveis.verCartao}
                              aoAplicar=${estaveis.escolher}
                              aoFavoritar=${estaveis.alternarFavorito}
                            />`,
                        )}
                      </ul>
                    </section>`,
                )
          }
        </div>
      </section>
    </div>

    ${
      soltando
        ? html`<div class="estilos-soltar" aria-hidden="true">
            <div>
              <${Icone} nome="soltar" />
              <h2><span class="fino">Solte o </span><span class="pesado">preset ou a referência.</span></h2>
            </div>
          </div>`
        : null
    }

    <${FolhaImportar}
      aberta=${folha === 'importar'}
      aoFechar=${fecharImportar}
      lendo=${importacao.lendo}
      resultados=${importacao.resultados}
      aoArquivos=${importarArquivos}
      previas=${previas}
      fonte=${fonte}
      daFoto=${daFoto}
    />
    <${FolhaExtrair}
      aberta=${folha === 'extrair'}
      aoFechar=${() => {
        definirFolha(null)
        definirReferencias(null)
      }}
      comAlvo=${!semFoto}
      extrair=${extrair}
      iniciais=${referencias}
      aoGuardar=${(p) => guardarNovo(p)}
    />
    <${FolhaCriar}
      aberta=${folha === 'criar'}
      aoFechar=${() => definirFolha(null)}
      ajustes=${foto?.ajustes ?? null}
      look=${lookDaFoto}
      familias=${familias}
      aoGuardar=${(p) => guardarNovo(p)}
    />
    <${FolhaEditar}
      aberta=${folha === 'renomear' || folha === 'mover'}
      aoFechar=${() => definirFolha(null)}
      modo=${folha === 'mover' ? 'mover' : 'renomear'}
      p=${alvoDaFolha}
      familias=${familias}
      aoSalvar=${(v) => {
        const p = alvoDaFolha
        definirFolha(null)
        if (!p) return
        if (folha === 'renomear') mudarBiblioteca((e) => renomear(e, p.id, v), `Agora é ${v}`)
        else mudarBiblioteca((e) => moverDeFamilia(e, p.id, v), `${p.nome} em ${v}`)
      }}
    />
    <${FolhaMexe} aberta=${folha === 'mexe'} aoFechar=${() => definirFolha(null)} p=${alvoDaFolha} />
  </div>`
}

/** Quanto custou cada prévia no worker ({ lado, ms }): para medir (o teste lê). */
export const temposDasPrevias = () => previas?.tempos() ?? []
