// Revelar: a foto em foco do catálogo no palco, revelada pelo motor Latitude (app/motor/sessao.js), e o painel de
// ajustes ao lado (no celular, a folha de baixo). O diferencial está no topo do painel: a MARGEM do arquivo — quanto o
// RAW guarda acima e abaixo do que a tela mostra, o que é recuperável e o que está perdido (margem.js).
//
// Peças: palco.js (canvas, gestos, antes/depois, corte, régua, conta-gotas, estados), margem.js, painel.js (grupos),
// curva.js, rodas.js, tira.js, folhas.js (copiar, sincronizar, versões), exportar.js, logica.js (o que é puro).
//
// Teclas: ← → trocam de foto · \ antes/depois · J avisos de corte · Z encaixar/100% · Shift+A auto · R corte ·
// W conta-gotas · Esc sai do modo · Cmd/Ctrl+Z desfaz, +Shift refaz · Cmd/Ctrl+Shift+C copia, +V cola · P X U 0–9 marcam.
//
// Contrato de tela: export default um componente Preact que recebe { loja, ativa }.

import { cx, html, useEffect, useRef, useState } from '../../preact.js'
import { Menu, Numero, avisar } from '../../componentes/index.js'
import { usarCatalogo, usarFoto } from '../../estado.js'
import { usarAtalhos } from '../../casca/atalhos.js'
import { comTransicao } from '../../casca/transicao.js'
import { TEXTOS, criarSessao } from '../../motor/sessao.js'
import { CONTROLES, aplicarEstilo, eNeutro, neutro, normalizar } from '../../../src/motor/ajustes.js'
import { lerTecla } from '../../../src/biblioteca/catalogo.js'
import { FAMILIAS, estilosDaCasa } from '../../../src/estilo/biblioteca.js'
import { aplicar } from '../../../src/estilo/predefinicao.js'
import { descompactar } from '../../../src/estilo/look.js'
import { Ajuste } from './controle.js'
import { FolhaExportar } from './exportar.js'
import { FolhaGrupos, FolhaVersoes } from './folhas.js'
import { Icone } from './icones.js'
import {
  COPIAR_PADRAO,
  anguloDaRegua,
  arrastar,
  atual,
  brancoDoPonto,
  copiarGrupos,
  corteCentrado,
  criarHistorico,
  desfazer,
  empurrar,
  enquadrar,
  grupo,
  podeDesfazer,
  podeRefazer,
  quadroDe,
  razaoDe,
  refazer,
  rotuloDoDesfazer,
  rotuloDoRefazer,
  semGeometria,
  zerarGrupo,
  zoomNoPonto,
} from './logica.js'
import { Margem } from './margem.js'
import { Grupos } from './painel.js'
import { Palco } from './palco.js'
import { Tira } from './tira.js'

// o estilo da tela entra junto com o módulo (a casca carrega a tela na primeira visita): sem piscar sem CSS
await new Promise((pronto) => {
  const href = new URL('./revelar.css', import.meta.url).href
  if (document.querySelector(`link[href="${href}"]`)) return pronto()
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.onload = link.onerror = () => pronto()
  document.head.append(link)
})

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const ev2 = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`
const MOTORES_LENTOS = [TEXTOS.semGpu, TEXTOS.software, TEXTOS.perdeu]

/** A sessão pode ser forçada para a placa ou para o JS (laboratório e testes): localStorage foto_motor. */
function motorPreferido() {
  try {
    const m = localStorage.getItem('foto_motor')
    return m === 'gpu' || m === 'js' ? m : 'auto'
  } catch {
    return 'auto'
  }
}

/** O que dizer quando o arquivo não abre (a mensagem do ErroRaw já vem em português) e o que fazer. */
function erroLegivel(e) {
  const mensagem = e?.message || 'O arquivo não abriu.'
  const oQueFazer = {
    'nao-e-raw': 'Confira se o arquivo abre em outro programa.',
    'sem-suporte': 'Converta para DNG no programa da câmera e abra de novo.',
    corrompido: 'O arquivo pode ter sido copiado pela metade: copie de novo do cartão.',
  }[e?.codigo]
  return { mensagem, oQueFazer: oQueFazer ?? null, codigo: e?.codigo ?? null }
}

/** A tira: a seleção que veio da Decupar (duas ou mais) ou as visíveis, com as escolhidas primeiro. */
function idsDaTira(c) {
  const sel = c.selecionadas()
  if (sel.length > 1) return sel
  const vis = c.visiveis()
  return [...vis.filter((f) => f.marca === 'escolhida'), ...vis.filter((f) => f.marca !== 'escolhida')].map((f) => f.id)
}

// o acervo de estilos da pessoa (o mesmo da aba Estilos), lido uma vez; sem ele, só os da casa
let acervo = null
function lerAcervo() {
  acervo ??= import('../estilos/acervo.js')
    .then(async (m) => {
      const a = m.criarAcervo()
      await a.carregando
      return a
    })
    .catch(() => null)
  return acervo
}
async function estiloPorId(id) {
  if (!id) return null
  const casa = estilosDaCasa().find((p) => p.id === id)
  if (casa) return casa
  const a = await lerAcervo()
  return a?.estado().predefinicoes?.find((p) => p.id === id) ?? null
}
/** A lista curta: os recentes da pessoa e um de cada família da casa. */
async function estilosRapidos() {
  const casa = estilosDaCasa()
  const um = FAMILIAS.slice(0, 8)
    .map((f) => casa.find((p) => p.familia === f))
    .filter(Boolean)
  const a = await lerAcervo()
  const estado = a?.estado()
  const recentes = (estado?.recentes ?? [])
    .map((id) => estado.predefinicoes?.find((p) => p.id === id) ?? casa.find((p) => p.id === id))
    .filter(Boolean)
    .slice(0, 4)
  const vistos = new Set()
  return [...recentes, ...um].filter((p) => !vistos.has(p.id) && vistos.add(p.id))
}

export default function Revelar({ loja, ativa }) {
  const aba = loja.aba('revelar')
  aba.historicos ??= new Map()
  aba.abertos ??= new Set(['luz', 'cor'])
  aba.auto ??= new Map()
  aba.porque ??= new Map()
  aba.medidas ??= { quadros: [] }

  const foco = usarCatalogo(loja, (c) => c.foco(), ['selecao', 'fotos', 'filtro'])
  const ids = usarCatalogo(loja, idsDaTira, ['selecao', 'fotos', 'filtro', 'ordem', 'pilhas', 'dados', 'historico'])
  const nSelecao = usarCatalogo(loja, (c) => c.selecao().size, ['selecao'])
  const { foto } = usarFoto(loja, foco)

  const refs = { canvas: useRef(null), antes: useRef(null), avisos: useRef(null) }
  const sessao = useRef(null)
  const antes = useRef(null)
  const geracao = useRef(0)
  const carregado = useRef(null)
  const aRef = useRef(neutro())
  const hRef = useRef(criarHistorico(neutro()))
  const lookRef = useRef(null)
  const ultimoSalvo = useRef(null)
  const esperas = useRef({ quadros: 0, g: 0 })
  const ouvintes = useRef(new Set())
  const relogios = useRef({})

  const [a, definirA] = useState(neutro())
  const [h, definirH] = useState(hRef.current)
  const [estado, definirEstado] = useState({ fase: foco ? 'abrindo' : 'vazio' })
  const [info, definirInfo] = useState(null)
  const [histo, definirHisto] = useState(null)
  const [visor, definirVisor] = useState({ W: 0, H: 0 })
  const [vista, definirVista] = useState({ zoom: 'encaixar', x: 0.5, y: 0.5 })
  const [comparar, definirComparar] = useState(null)
  const [avisos, definirAvisos] = useState(false)
  const [modo, definirModo] = useState(null)
  const [proporcao, definirProporcao] = useState('livre')
  const [abertos, definirAbertos] = useState(aba.abertos)
  const [misturador, definirMisturador] = useState('matiz')
  const [painel, definirPainel] = useState(true)
  const [folhaAlta, definirFolhaAlta] = useState(false)
  const [folha, definirFolha] = useState(null)
  const [motor, definirMotor] = useState({ modo: null, avisos: [] })
  const [porque, definirPorque] = useState(null)
  const [estilo, definirEstilo] = useState(null)
  const [rapidos, definirRapidos] = useState([])
  const [ocupado, definirOcupado] = useState(null)
  const [nivel, definirNivel] = useState(null)

  const dpr = globalThis.devicePixelRatio || 1
  const ajustesDaSessao = (x, m = modo) => (m === 'corte' ? { ...x, geometria: { ...x.geometria, corte: null } } : x)
  const quadro = info ? quadroDe(info.cheio, ajustesDaSessao(a)) : null
  const caixa = quadro && visor.W ? enquadrar({ quadro, W: visor.W, H: visor.H, dpr, vista }) : null
  const ampliada = typeof vista.zoom === 'number'

  // ─────────── a sessão ───────────

  const aoMudarSessao = useRef(null)
  aoMudarSessao.current = (ev) => {
    if (ev.tipo === 'previa') definirEstado((e) => (e.fase === 'abrindo' ? { ...e, fase: 'previa' } : e))
    else if (ev.tipo === 'quadro') {
      const q = aba.medidas.quadros
      q.push({ t: performance.now(), ms: ev.ms, motor: ev.motor, nivel: ev.nivel })
      if (q.length > 240) q.splice(0, q.length - 240)
      definirNivel(ev.nivel)
      const espera = esperas.current
      if (espera.g === geracao.current && espera.quadros > 0) {
        espera.quadros--
        if (!espera.quadros) definirEstado((e) => ({ ...e, fase: 'pronta' }))
      }
      depoisDoQuadro()
    } else if (ev.tipo === 'motor' || ev.tipo === 'erro') atualizarMotor()
    for (const f of [...ouvintes.current]) f(ev)
  }

  const atualizarMotor = () => {
    const s = sessao.current
    if (!s) return
    const e = s.estado()
    definirMotor((m) => (m.modo === e.motor && igual(m.avisos, e.avisos) ? m : { modo: e.motor, avisos: e.avisos, renderizador: e.renderizador }))
  }

  const proximoQuadro = (limite = 2500) =>
    new Promise((ok) => {
      const f = (ev) => {
        if (ev && ev.tipo !== 'quadro') return
        ouvintes.current.delete(f)
        clearTimeout(t)
        ok()
      }
      const t = setTimeout(f, limite)
      ouvintes.current.add(f)
    })

  useEffect(() => {
    if (!ativa || sessao.current || !refs.canvas.current) return
    sessao.current = criarSessao({ canvas: refs.canvas.current, motor: motorPreferido(), guardarQuadro: true, aoMudar: (ev) => aoMudarSessao.current(ev) })
    atualizarMotor()
  }, [ativa])
  useEffect(
    () => () => {
      sessao.current?.fechar()
      antes.current?.s.fechar()
      sessao.current = null
    },
    [],
  )

  // ─────────── abrir a foto em foco ───────────

  async function lookDe(f, x) {
    if (!x.look.id) return null
    const p = await estiloPorId(f?.predefinicao?.id)
    return p?.look ? descompactar(p.look) : null
  }

  async function carregar(id) {
    const s = sessao.current
    if (!s) return
    carregado.current = id
    const g = ++geracao.current
    desligarAntes()
    definirModo(null)
    definirComparar(null)
    definirPorque(aba.porque.get(id) ?? null)
    const f = loja.catalogo.foto(id)
    if (!f) {
      definirEstado({ fase: 'vazio' })
      definirInfo(null)
      return
    }
    // o desfazer desta foto; o que mudou fora daqui (Estilos, Colar) entra como um passo
    let hist = aba.historicos.get(id) ?? criarHistorico(f.ajustes)
    const doCatalogo = normalizar(f.ajustes)
    if (!igual(atual(hist), doCatalogo)) hist = empurrar(hist, doCatalogo, 'Fora daqui')
    aba.historicos.set(id, hist)
    hRef.current = hist
    definirH(hist)
    const x = atual(hist)
    aRef.current = x
    ultimoSalvo.current = JSON.stringify(f.ajustes ?? null)
    definirA(x)
    const v = { zoom: 'encaixar', x: 0.5, y: 0.5 }
    definirVista(v)
    definirHisto(null)
    definirInfo(null)
    definirNivel(null)
    definirEstado({ fase: 'abrindo', miniatura: loja.miniaturas.url(id) })
    estiloPorId(f.predefinicao?.id).then((p) => g === geracao.current && definirEstilo(p ? { p, intensidade: f.predefinicao.intensidade ?? 100 } : null))
    const origem = loja.arquivo(id)
    if (!origem) {
      definirEstado({ fase: 'sem-original', miniatura: loja.miniaturas.url(id) })
      return
    }
    lookRef.current = await lookDe(f, x)
    if (g !== geracao.current) return
    s.ver({ ...v, comparar: null, avisos: false })
    // abre com a geometria neutra: a sessão devolve o tamanho cheio, e o zoom de 100% sai dele
    s.ajustar(semGeometria(x), { look: lookRef.current })
    let r
    try {
      r = await s.abrir(origem.arquivo)
    } catch (e) {
      if (e?.codigo === 'substituida' || e?.codigo === 'fechada' || g !== geracao.current) return
      definirEstado({ fase: 'erro', erro: erroLegivel(e) })
      return
    }
    if (g !== geracao.current) return
    definirInfo({ cheio: { largura: r.largura, altura: r.altura }, latitude: r.latitude, origem: r.origem, camera: r.camera, avisos: r.avisos })
    const geo = !igual(x.geometria, neutro().geometria)
    esperas.current = { g, quadros: geo && r.motor === 'js' ? 2 : 1 }
    s.ajustar(x, { look: lookRef.current })
    definirEstado((e) => ({ ...e, fase: 'revelando' }))
    atualizarMotor()
    if (avisos) s.ver({ avisos: true })
  }

  // a foto em foco mudou fora daqui (Decupar) ou a tela voltou à frente: abre
  useEffect(() => {
    if (!ativa || !sessao.current) return
    if (!foco) {
      const primeira = idsDaTira(loja.catalogo)[0]
      if (primeira) loja.catalogo.selecionar(primeira)
      else definirEstado({ fase: 'vazio' })
      return
    }
    if (carregado.current !== foco) void carregar(foco)
  }, [ativa, foco, sessao.current])

  // os ajustes mudaram fora daqui com a foto aberta (outra aba aplicou um estilo, o catálogo desfez)
  useEffect(() => {
    if (!foto || carregado.current !== foto.id) return
    const texto = JSON.stringify(foto.ajustes ?? null)
    if (texto === ultimoSalvo.current) return
    ultimoSalvo.current = texto
    const x = normalizar(foto.ajustes)
    if (igual(x, aRef.current)) return
    const hist = empurrar(hRef.current, x, 'Fora daqui')
    hRef.current = hist
    aba.historicos.set(foto.id, hist)
    definirH(hist)
    aRef.current = x
    definirA(x)
    void lookDe(foto, x).then((look) => {
      lookRef.current = look
      sessao.current?.ajustar(ajustesDaSessao(x), { look })
    })
    estiloPorId(foto.predefinicao?.id).then((p) => definirEstilo(p ? { p, intensidade: foto.predefinicao.intensidade ?? 100 } : null))
  }, [foto?.ajustes])

  // ─────────── mudar os ajustes ───────────

  function salvar(id, x) {
    const valor = eNeutro(x) ? undefined : x
    ultimoSalvo.current = JSON.stringify(valor ?? null)
    loja.catalogo.atualizar(id, { ajustes: valor })
  }

  function mudar(novos, { final = true, rotulo = '' } = {}) {
    const x = normalizar(novos)
    aRef.current = x
    definirA(x)
    sessao.current?.ajustar(ajustesDaSessao(x), { look: lookRef.current })
    antes.current?.s.ajustar(antesDe(x))
    relogios.current.arrastando = !final
    if (!final || !foco) return
    const hist = empurrar(hRef.current, x, rotulo)
    hRef.current = hist
    aba.historicos.set(foco, hist)
    definirH(hist)
    salvar(foco, x)
    agendarMiniatura()
  }

  function andarNoHistorico(f) {
    if (!foco) return
    const antesDo = hRef.current
    const hist = f(antesDo)
    if (hist === antesDo) return
    const rotulo = f === desfazer ? rotuloDoDesfazer(antesDo) : rotuloDoRefazer(antesDo)
    hRef.current = hist
    aba.historicos.set(foco, hist)
    definirH(hist)
    const x = atual(hist)
    aRef.current = x
    definirA(x)
    sessao.current?.ajustar(ajustesDaSessao(x), { look: lookRef.current })
    antes.current?.s.ajustar(antesDe(x))
    salvar(foco, x)
    agendarMiniatura()
    if (rotulo) avisar(`${f === desfazer ? 'Desfeito' : 'Refeito'}: ${rotulo}`, { duracao: 1800 })
  }

  // ─────────── depois de cada quadro: histograma, avisos (sem placa), miniatura ───────────

  function depoisDoQuadro() {
    clearTimeout(relogios.current.histo)
    relogios.current.histo = setTimeout(async () => {
      const s = sessao.current
      if (!s || relogios.current.arrastando) return
      const ev = aRef.current.luz.exposicao
      try {
        const r = await s.histograma()
        definirHisto({ cena: r.cena, tela: r.tela, ev })
      } catch {
        // sem quadro ainda
      }
    }, 140)
    if (avisosRef.current && motorRef.current === 'js') pintarAvisosJs()
  }

  const avisosRef = useRef(false)
  avisosRef.current = avisos
  const motorRef = useRef(null)
  motorRef.current = motor.modo

  // sem placa, a sessão não desenha os avisos: o palco mostra o que a TELA corta (preto e branco puros), em listras
  function pintarAvisosJs() {
    const s = sessao.current
    const alvo = refs.avisos.current
    if (!s || !alvo) return
    let t
    try {
      t = s.lerTela()
    } catch {
      return
    }
    const { largura: w, altura: hh, dados } = t
    alvo.width = w
    alvo.height = hh
    const c = alvo.getContext('2d')
    const img = c.createImageData(w, hh)
    const o = img.data
    for (let y = 0, i = 0; y < hh; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        const r = dados[i]
        const g = dados[i + 1]
        const b = dados[i + 2]
        const listra = (x + y) % 8 < 4
        if (Math.max(r, g, b) >= 254 && listra) {
          o[i] = o[i + 1] = o[i + 2] = 32
          o[i + 3] = 255
        } else if (Math.max(r, g, b) <= 2 && listra) {
          o[i] = o[i + 1] = o[i + 2] = 236
          o[i + 3] = 255
        }
      }
    }
    c.putImageData(img, 0, 0)
  }

  function agendarMiniatura() {
    clearTimeout(relogios.current.mini)
    const id = foco
    relogios.current.mini = setTimeout(async () => {
      const s = sessao.current
      if (!s || id !== carregado.current || comparar != null || avisosRef.current || modo || typeof vista.zoom === 'number') return
      try {
        const t = s.lerTela()
        const k = Math.min(1, 400 / Math.max(t.largura, t.altura))
        const origem = new OffscreenCanvas(t.largura, t.altura)
        origem.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(t.dados.buffer, t.dados.byteOffset, t.largura * t.altura * 4), t.largura, t.altura), 0, 0)
        const mini = new OffscreenCanvas(Math.max(1, Math.round(t.largura * k)), Math.max(1, Math.round(t.altura * k)))
        mini.getContext('2d').drawImage(origem, 0, 0, mini.width, mini.height)
        const blob = await mini.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
        loja.miniaturas.entregar(id, { mini: blob, proporcao: t.largura / t.altura })
      } catch {
        // a miniatura fica a de antes
      }
    }, 1500)
  }

  // ─────────── a vista ───────────

  function ver(v) {
    definirVista(v)
    sessao.current?.ver({ zoom: v.zoom, x: v.x, y: v.y })
    antes.current?.s.ver({ zoom: v.zoom, x: v.x, y: v.y })
  }
  const contas = () => (quadro && visor.W ? { quadro, W: visor.W, H: visor.H, dpr, vista } : null)
  function zoomEm(fator, cx, cy) {
    const c = contas()
    if (!c || modo === 'corte') return
    const g = enquadrar(c)
    ver(zoomNoPonto(c, g.z * fator, cx, cy))
  }
  function alternarZoom(cx = visor.W / 2, cy = visor.H / 2) {
    const c = contas()
    if (!c || modo === 'corte') return
    if (ampliada) return ver({ zoom: 'encaixar', x: 0.5, y: 0.5 })
    ver(zoomNoPonto(c, 1, cx, cy))
  }

  // ─────────── antes / depois ───────────

  const antesDe = (x) => ({ ...neutro(), geometria: ajustesDaSessao(x).geometria })

  async function ligarAntes() {
    if (antes.current || !refs.antes.current || !foco) return
    const origem = loja.arquivo(foco)
    if (!origem) return
    const s2 = criarSessao({ canvas: refs.antes.current, motor: 'js' })
    antes.current = { s: s2, id: foco }
    s2.ajustar(antesDe(aRef.current))
    s2.ver({ zoom: vista.zoom, x: vista.x, y: vista.y })
    definirOcupado('Preparando o antes…')
    try {
      await s2.abrir(origem.arquivo)
    } catch {
      // sem o antes: a divisória fica, mas só com o depois
    }
    definirOcupado((o) => (o === 'Preparando o antes…' ? null : o))
  }
  function desligarAntes() {
    antes.current?.s.fechar()
    antes.current = null
  }

  function mudarComparar(pos) {
    definirComparar(pos)
    const s = sessao.current
    if (!s) return
    if (pos == null) {
      s.ver({ comparar: null })
      desligarAntes()
      return
    }
    if (motor.modo === 'gpu') s.ver({ comparar: { posicao: pos, antes: antesDe(aRef.current) } })
    else void Promise.resolve().then(ligarAntes)
  }
  const alternarComparar = () => mudarComparar(comparar == null ? 0.5 : null)

  function alternarAvisos() {
    const v = !avisos
    definirAvisos(v)
    sessao.current?.ver({ avisos: v })
    if (v && motor.modo === 'js') requestAnimationFrame(pintarAvisosJs)
  }

  // ─────────── ferramentas: corte, régua, conta-gotas ───────────

  function mudarModo(m) {
    const novo = modo === m ? null : m
    if (novo === 'corte' || modo === 'corte') {
      ver({ zoom: 'encaixar', x: 0.5, y: 0.5 })
      sessao.current?.ajustar(ajustesDaSessao(aRef.current, novo), { look: lookRef.current })
      if (modo === 'corte') mudar(aRef.current, { final: true, rotulo: 'Corte' })
    }
    if (novo === 'corte' && !abertos.has('geometria')) abrirGrupo('geometria', true)
    definirModo(novo)
  }
  function mudarCorte(c, final) {
    const x = normalizar(aRef.current)
    x.geometria.corte = c.x <= 0.001 && c.y <= 0.001 && c.l >= 0.999 && c.a >= 0.999 ? null : c
    mudar(x, { final, rotulo: 'Corte' })
  }
  function mudarProporcao(p) {
    definirProporcao(p)
    if (!info) return
    const q = quadroDe(info.cheio, { ...aRef.current, geometria: { ...aRef.current.geometria, corte: null } })
    const r = razaoDe(p, q)
    if (r) mudarCorte(corteCentrado(r, q), true)
  }
  function regua(dx, dy) {
    const x = normalizar(aRef.current)
    x.geometria.angulo = anguloDaRegua(x.geometria.angulo, dx, dy)
    x.geometria.corte = null
    mudar(x, { final: true, rotulo: 'Régua' })
    definirModo(null)
  }

  async function autoDe(id) {
    if (!aba.auto.has(id)) aba.auto.set(id, sessao.current.auto())
    try {
      return await aba.auto.get(id)
    } catch (e) {
      aba.auto.delete(id)
      throw e
    }
  }

  async function modoDoBranco(m) {
    const x = normalizar(aRef.current)
    if (m !== 'original' && x.branco.modo === 'original') {
      // o manual e o auto começam do branco medido (sem placa de saber o do arquivo, é o ponto de partida honesto)
      try {
        const r = await autoDe(foco)
        x.branco.temperatura = r.branco.temperatura
        x.branco.tinta = r.branco.tinta
      } catch {
        // fica o que estava
      }
    }
    x.branco.modo = m
    mudar(x, { final: true, rotulo: 'Branco' })
  }

  async function gota(fx, fy) {
    const s = sessao.current
    if (!s || !foco) return
    const tinhaComparar = comparar
    if (tinhaComparar != null) mudarComparar(null)
    if (avisos) s.ver({ avisos: false })
    let x = normalizar(aRef.current)
    try {
      if (x.branco.modo !== 'manual') {
        const r = await autoDe(foco).catch(() => null)
        x.branco = { modo: 'manual', temperatura: r?.branco.temperatura ?? x.branco.temperatura, tinta: r?.branco.tinta ?? x.branco.tinta }
        mudar(x, { final: false })
        await proximoQuadro()
      }
      for (let volta = 0; volta < 4; volta++) {
        const cor = amostra(s.lerTela(), fx, fy)
        const r = brancoDoPonto(cor, { kelvin: x.branco.temperatura, tinta: x.branco.tinta })
        if (!r) {
          avisar('Esse ponto está preto ou estourado. Escolha outro.')
          break
        }
        if (r.perto) break
        x = normalizar({ ...x, branco: { modo: 'manual', temperatura: r.kelvin, tinta: r.tinta } })
        mudar(x, { final: false })
        await proximoQuadro()
      }
    } finally {
      mudar(x, { final: true, rotulo: 'Conta-gotas' })
      if (avisos) s.ver({ avisos: true })
      definirModo(null)
    }
  }
  function amostra(t, fx, fy) {
    const cx0 = Math.round(fx * (t.largura - 1))
    const cy0 = Math.round(fy * (t.altura - 1))
    const soma = [0, 0, 0]
    let n = 0
    for (let y = cy0 - 2; y <= cy0 + 2; y++)
      for (let x = cx0 - 2; x <= cx0 + 2; x++) {
        if (x < 0 || y < 0 || x >= t.largura || y >= t.altura) continue
        const i = (y * t.largura + x) * 4
        soma[0] += t.dados[i]
        soma[1] += t.dados[i + 1]
        soma[2] += t.dados[i + 2]
        n++
      }
    return soma.map((v) => v / Math.max(1, n))
  }

  // ─────────── auto, estilo ───────────

  async function fazerAuto() {
    if (!foco || !info) return
    definirOcupado('Medindo…')
    try {
      const r = await autoDe(foco)
      const x = normalizar(aRef.current)
      x.luz.exposicao = Math.round(r.exposicao * 100) / 100
      if (r.branco.mudou) x.branco = { modo: 'auto', temperatura: r.branco.temperatura, tinta: r.branco.tinta }
      mudar(x, { final: true, rotulo: 'Auto' })
      const linha = { ev: x.luz.exposicao, frases: r.porque, branco: r.branco.mudou ? `${r.branco.temperatura.toLocaleString('pt-BR')} K` : null }
      aba.porque.set(foco, linha)
      definirPorque(linha)
    } catch {
      avisar('Não deu para medir esta foto.')
    } finally {
      definirOcupado(null)
    }
  }

  useEffect(() => {
    if (ativa) void estilosRapidos().then(definirRapidos)
  }, [ativa])

  function usarEstilo(p, intensidade = 100, final = true) {
    if (!foco) return
    lookRef.current = p?.look ? descompactar(p.look) : null
    const x = p ? aplicar(p, aRef.current, intensidade) : aplicarEstilo(aRef.current, neutro(), 100)
    definirEstilo(p ? { p, intensidade } : null)
    mudar(x, { final, rotulo: p ? p.nome : 'Sem estilo' })
    if (final) {
      loja.catalogo.atualizar(foco, { predefinicao: p ? { id: p.id, nome: p.nome, intensidade, modo: 'so-estilo' } : undefined })
      if (p) void lerAcervo().then((ac) => ac?.mudar?.((e) => ({ ...e, recentes: [p.id, ...(e.recentes ?? []).filter((i) => i !== p.id)].slice(0, 12) })))
    }
  }

  // ─────────── copiar, colar, sincronizar, versões ───────────

  function copiar(grupos) {
    aba.copiados = { ajustes: aRef.current, grupos }
    definirFolha(null)
    avisar(`Ajustes copiados (${grupos.length} ${grupos.length === 1 ? 'grupo' : 'grupos'}).`, { duracao: 2200 })
  }
  function colarEm(alvos, { ajustes, grupos }, rotulo) {
    const outros = alvos.filter((id) => id !== foco)
    if (alvos.includes(foco)) mudar(copiarGrupos(ajustes, aRef.current, grupos), { final: true, rotulo })
    if (outros.length) {
      loja.catalogo.definir(outros, (f) => ({ ajustes: copiarGrupos(ajustes, f.ajustes, grupos) }), { rotulo })
      avisar(`${rotulo}: ${outros.length + (alvos.includes(foco) ? 1 : 0)} fotos.`, { desfazer: () => loja.catalogo.desfazer() })
    } else avisar(`${rotulo}.`, { duracao: 1800 })
  }
  function colar() {
    if (!aba.copiados) return avisar('Copie os ajustes de uma foto primeiro (⌘⇧C).')
    colarEm(loja.catalogo.alvo(), aba.copiados, 'Ajustes colados')
  }
  function sincronizar(grupos) {
    definirFolha(null)
    colarEm(loja.catalogo.selecionadas(), { ajustes: aRef.current, grupos }, 'Sincronizado')
  }
  const versoes = foto?.versoes ?? []
  function guardarVersao(nome) {
    loja.catalogo.atualizar(foco, { versoes: [...versoes, { nome, ajustes: aRef.current, quando: Date.now() }] })
    avisar(`“${nome}” guardada.`, { duracao: 1800 })
  }

  // ─────────── trocar de foto ───────────

  function irPara(id, sentido = 'frente') {
    if (!id || id === foco) return
    const c = loja.catalogo
    const mudarFoco = () => {
      // dentro da seleção, só o foco anda (a seleção fica)
      if (c.selecao().size > 1 && c.selecionada(id)) {
        c.selecionar(id, { alternar: true })
        c.selecionar(id, { alternar: true })
      } else c.selecionar(id)
      const chegou = new Promise((ok) => {
        const fim = () => {
          ouvintes.current.delete(f)
          clearTimeout(t)
          ok()
        }
        const f = (ev) => (ev.tipo === 'previa' || ev.tipo === 'base' || ev.tipo === 'erro') && fim()
        const t = setTimeout(fim, 450)
        ouvintes.current.add(f)
      })
      void carregar(id)
      return chegou
    }
    void comTransicao(mudarFoco, { sentido: `revelar-${sentido}` })
  }
  const passo = (d) => {
    const i = ids.indexOf(foco)
    if (i < 0) return
    irPara(ids[Math.max(0, Math.min(ids.length - 1, i + d))], d > 0 ? 'frente' : 'volta')
  }

  // ─────────── teclado ───────────

  usarAtalhos(ativa, (e) => {
    if (folha) return
    const cmd = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    if (cmd && !e.altKey) {
      if (k === 'z' || k === 'y') {
        e.preventDefault()
        return andarNoHistorico(k === 'y' || e.shiftKey ? refazer : desfazer)
      }
      if (e.shiftKey && k === 'c') {
        e.preventDefault()
        return definirFolha('copiar')
      }
      if (e.shiftKey && k === 'v') {
        e.preventDefault()
        return colar()
      }
      return
    }
    if (e.altKey) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      return passo(e.key === 'ArrowLeft' ? -1 : 1)
    }
    if (e.key === 'Escape') {
      if (modo === 'corte') return mudarModo('corte')
      if (modo) return definirModo(null)
      if (comparar != null) return mudarComparar(null)
      return
    }
    if (e.key === '\\') return alternarComparar()
    if (k === 'j') return alternarAvisos()
    if (k === 'z' && !e.shiftKey) return alternarZoom()
    if (k === 'a' && e.shiftKey) return void fazerAuto()
    if (k === 'r' && !e.shiftKey) return mudarModo('corte')
    if (k === 'w' && !e.shiftKey) return mudarModo('gota')
    const c = lerTecla(e)
    if (!c || !foco) return
    if (c.acao === 'marca') loja.catalogo.marcar([foco], c.valor)
    else if (c.acao === 'estrelas') loja.catalogo.estrelar([foco], c.valor)
    else if (c.acao === 'cor') loja.catalogo.colorir([foco], c.valor)
  })

  // ─────────── painel ───────────

  function abrirGrupo(id, so = false) {
    const s = new Set(abertos)
    if (s.has(id) && !so) s.delete(id)
    else s.add(id)
    aba.abertos = s
    definirAbertos(s)
  }

  const motorLento = motor.avisos.find((t) => MOTORES_LENTOS.includes(t))
  const fase = estado.fase
  const pronta = fase === 'pronta' || fase === 'revelando'
  const zoomTexto = caixa && ampliada ? `${Math.round(caixa.z * 100)}%` : 'Encaixar'
  const razao = info && modo === 'corte' ? razaoDe(proporcao, quadro) : null
  const vazio = fase === 'vazio' || fase === 'sem-original' || fase === 'erro'

  const ferramentas = {
    gota: modo === 'gota',
    aoGota: () => mudarModo('gota'),
    aoModoBranco: modoDoBranco,
    corte: modo === 'corte',
    aoCorte: () => mudarModo('corte'),
    proporcao,
    aoProporcao: mudarProporcao,
    regua: modo === 'regua',
    aoRegua: () => mudarModo('regua'),
    latitude: info?.latitude ?? null,
  }

  const itensDoMenu = [
    { rotulo: 'Copiar ajustes', icone: 'copiar', detalhe: '⌘⇧C', aoEscolher: () => definirFolha('copiar') },
    { rotulo: 'Colar ajustes', icone: 'colar', detalhe: '⌘⇧V', aoEscolher: colar },
    nSelecao > 1 ? { rotulo: `Sincronizar com a seleção (${nSelecao})`, icone: 'sincronizar', aoEscolher: () => definirFolha('sincronizar') } : null,
    { divisa: true },
    { rotulo: 'Versões', icone: 'versoes', detalhe: versoes.length ? String(versoes.length) : undefined, aoEscolher: () => definirFolha('versoes') },
    { rotulo: 'Zerar tudo', icone: 'zerar', aoEscolher: () => mudar(aplicarEstilo(neutro(), neutro()), { rotulo: 'Zerar tudo' }) },
  ]
  const itensDoEstilo = [
    { rotulo: 'Sem estilo', marcado: !estilo, aoEscolher: () => usarEstilo(null) },
    { divisa: true },
    ...rapidos.map((p) => ({ rotulo: p.nome, detalhe: p.familia, marcado: estilo?.p.id === p.id, aoEscolher: () => usarEstilo(p) })),
    { divisa: true },
    { rotulo: 'Todos os estilos', icone: 'estilos', aoEscolher: () => (location.hash = '#/estilos') },
  ]

  return html`<div class=${cx('tela tela--fixa revelar', !painel && 'revelar--sem-painel', folhaAlta && 'revelar--folha-alta')}>
    <${Palco}
      refs=${refs}
      caixa=${vazio ? null : caixa}
      estado=${estado}
      comparar=${comparar}
      aoComparar=${(p) => {
        definirComparar(p)
        if (motor.modo === 'gpu') sessao.current?.ver({ comparar: { posicao: p, antes: antesDe(aRef.current) } })
      }}
      avisos=${avisos}
      avisosJs=${motor.modo === 'js'}
      antesJs=${motor.modo === 'js'}
      modo=${vazio ? null : modo}
      corte=${a.geometria.corte}
      razao=${razao}
      aoCorte=${mudarCorte}
      aoRegua=${regua}
      aoGota=${gota}
      aoArrastar=${(dx, dy) => contas() && ver(arrastar(contas(), dx, dy))}
      aoZoom=${zoomEm}
      aoAlternarZoom=${alternarZoom}
      aoVisor=${definirVisor}
      ampliada=${ampliada}
      aoAbrirFotos=${() => document.querySelector('input[data-escolher]')?.click()}
      aoReligar=${() => loja.religar().then(() => foco && carregar(foco))}
    >
      ${
        vazio
          ? null
          : html`<div class="palco-barra barra-vidro" role="toolbar" aria-label="Vista">
              <button type="button" class="liso toque" aria-pressed=${comparar != null ? 'true' : 'false'} aria-label="Antes e depois" data-dica="Antes e depois" data-tecla="\\" data-comparar onClick=${alternarComparar}>
                <${Icone} nome="comparar" />
              </button>
              <button type="button" class="liso toque" aria-pressed=${avisos ? 'true' : 'false'} aria-label="Avisos de corte" data-dica="Avisos de corte" data-tecla="J" data-avisos onClick=${alternarAvisos}>
                <${Icone} nome="avisos" />
              </button>
              <button type="button" class=${cx('liso toque', ampliada && 'palco-zoom')} aria-pressed=${ampliada ? 'true' : 'false'} aria-label=${ampliada ? 'Encaixar' : 'Ver em 100%'} data-dica=${ampliada ? 'Encaixar' : '100%'} data-tecla="Z" data-zoom onClick=${() => alternarZoom()}>
                <${Icone} nome=${ampliada ? 'encaixar' : 'zoom'} />${ampliada ? html`<span class="numeros">${zoomTexto}</span>` : null}
              </button>
              <span class="separador palco-barra-sep"></span>
              <button type="button" class="liso toque so-computador" aria-pressed=${painel ? 'true' : 'false'} aria-label=${painel ? 'Esconder o painel' : 'Mostrar o painel'} data-dica="Painel" onClick=${() => definirPainel(!painel)}>
                <${Icone} nome="painel" />
              </button>
            </div>`
      }
      ${
        !vazio && (ocupado || fase === 'abrindo' || fase === 'previa' || (ampliada && nivel === 'reduzida' && motor.modo === 'gpu'))
          ? html`<div class="palco-estado" role="status"><span class="girando" aria-hidden="true"></span>${ocupado ?? (fase === 'abrindo' || fase === 'previa' ? 'Revelando…' : 'Carregando a resolução cheia…')}</div>`
          : null
      }
      ${avisos && !vazio ? html`<div class="palco-legenda" aria-live="polite">${motor.modo === 'gpu' ? html`<span data-l="perdida">Perdido no arquivo</span><span data-l="recuperavel">Recuperável</span><span data-l="sombra">Abaixo do ruído</span>` : html`<span data-l="perdida">Branco na tela</span><span data-l="sombra">Preto na tela</span>`}</div>` : null}
      <${Tira} loja=${loja} ids=${ids} foco=${foco} aoEscolher=${(id) => irPara(id, ids.indexOf(id) < ids.indexOf(foco) ? 'volta' : 'frente')} />
    <//>

    <aside class="painel-revelar" aria-label="Ajustes" hidden=${!painel}>
      <button type="button" class="folha-puxador" aria-label=${folhaAlta ? 'Baixar os ajustes' : 'Subir os ajustes'} aria-expanded=${folhaAlta ? 'true' : 'false'} onClick=${() => definirFolhaAlta(!folhaAlta)}>
        <span></span>
      </button>
      <div class="painel-rola">
        <${Margem} latitude=${info?.latitude ?? null} histo=${histo} ajustes=${a} carregando=${!info && !vazio} origem=${info?.origem} />

        <div class="painel-acoes">
          <button type="button" class="vidro vidro--tinta vidro--pequeno" data-auto disabled=${!pronta || !!ocupado} onClick=${fazerAuto} data-dica="Auto" data-tecla="⇧A">
            <${Icone} nome="auto" />Auto
          </button>
          <${Menu}
            classe="menu-estilo"
            rotulo="Estilo"
            classeBotao="vidro vidro--pequeno"
            gatilho=${html`<span class="rv-estilo-nome">${estilo ? estilo.p.nome : 'Estilo'}</span><${Icone} nome="baixo" />`}
            itens=${itensDoEstilo}
            aoAbrir=${() => void estilosRapidos().then(definirRapidos)}
          />
          <span class="painel-acoes-fim">
            <button type="button" class="liso toque" aria-label="Desfazer" data-dica="Desfazer" data-tecla="⌘Z" disabled=${!podeDesfazer(h)} data-desfazer onClick=${() => andarNoHistorico(desfazer)}>
              <${Icone} nome="desfazer" />
            </button>
            <button type="button" class="liso toque" aria-label="Refazer" data-dica="Refazer" data-tecla="⌘⇧Z" disabled=${!podeRefazer(h)} data-refazer onClick=${() => andarNoHistorico(refazer)}>
              <${Icone} nome="refazer" />
            </button>
            <${Menu} rotulo="Mais" gatilho=${html`<${Icone} nome="tres" />`} classeBotao="liso toque" lado="direita" itens=${itensDoMenu} />
          </span>
        </div>
        ${
          porque
            ? html`<p class="rv-porque" data-porque title=${[...porque.frases, porque.branco ? `Branco: ${porque.branco}` : ''].filter(Boolean).join(' ')}>
                <strong><${Numero} valor=${porque.ev} formato=${(v) => `${ev2(v)} EV`} /></strong> ${porque.frases[0] ?? ''}
              </p>`
            : null
        }
        ${
          estilo
            ? html`<div class="estilo-intensidade">
                <${Ajuste}
                  caminho="intensidade"
                  rotulo=${CONTROLES.intensidade.rotulo}
                  valor=${estilo.intensidade}
                  min=${0}
                  max=${200}
                  neutro=${100}
                  formato=${(v) => `${Math.round(v)}%`}
                  aoMudar=${(v, o) => usarEstilo(estilo.p, v, o.final)}
                />
                ${
                  a.look.id
                    ? html`<${Ajuste}
                        caminho="look.quantidade"
                        rotulo=${CONTROLES['look.quantidade'].rotulo}
                        valor=${a.look.quantidade}
                        min=${0}
                        max=${200}
                        neutro=${100}
                        aoMudar=${(v, o) => mudar({ ...a, look: { ...a.look, quantidade: v } }, { ...o, rotulo: 'Look' })}
                      />`
                    : null
                }
              </div>`
            : null
        }

        <${Grupos}
          a=${a}
          mudar=${mudar}
          abertos=${abertos}
          aoAbrir=${(id) => abrirGrupo(id)}
          aoZerar=${(id) => mudar(zerarGrupo(a, id), { rotulo: `Zerar ${grupo(id)?.rotulo.toLowerCase()}` })}
          ferramentas=${ferramentas}
          aba=${misturador}
          aoAba=${definirMisturador}
        />
      </div>
      <div class="painel-pe">
        ${motorLento ? html`<span class="rv-nota motor-lento" data-motor-lento title=${motor.renderizador || ''}>Sem aceleração de vídeo nesta máquina: a prévia sai do processador.</span>` : null}
        <button type="button" class="vidro painel-exportar" data-exportar disabled=${!pronta} onClick=${() => definirFolha('exportar')}>
          <${Icone} nome="exportar" />Exportar esta foto
        </button>
      </div>
    </aside>

    <${FolhaGrupos}
      aberta=${folha === 'copiar'}
      titulo=${['Copiar', 'ajustes.']}
      acao="Copiar"
      escolhidos=${aba.copiados?.grupos ?? COPIAR_PADRAO}
      aoConfirmar=${copiar}
      aoFechar=${() => definirFolha(null)}
    />
    <${FolhaGrupos}
      aberta=${folha === 'sincronizar'}
      titulo=${['Sincronizar', `com ${Math.max(0, nSelecao - 1)} ${nSelecao - 1 === 1 ? 'foto' : 'fotos'}.`]}
      acao="Sincronizar"
      escolhidos=${COPIAR_PADRAO}
      aoConfirmar=${sincronizar}
      aoFechar=${() => definirFolha(null)}
    />
    <${FolhaVersoes}
      aberta=${folha === 'versoes'}
      versoes=${versoes}
      aoGuardar=${guardarVersao}
      aoUsar=${(v) => (definirFolha(null), mudar(v.ajustes, { rotulo: v.nome }))}
      aoApagar=${(i) => loja.catalogo.atualizar(foco, { versoes: versoes.filter((_, k) => k !== i) })}
      aoFechar=${() => definirFolha(null)}
    />
    <${FolhaExportar} aberta=${folha === 'exportar'} aoFechar=${() => definirFolha(null)} sessao=${sessao.current} foto=${foto} ajustes=${a} look=${lookRef.current} />
  </div>`
}

/** Para medir (testes): os quadros recentes da sessão desta tela. */
export const medidas = (loja) => loja.aba('revelar').medidas
