// Aba Criar › Montagens: as Montagens do Estúdio do computador, no celular. Fotos e takes da galeria ou do Drive em
// modelos prontos: o post (foto ou vídeo, quando tem take), o carrossel contínuo (uma imagem que passa de um slide para
// o outro) e a grade do perfil (3 colunas, numerada na ordem de postar). O desenho é o mesmo do computador
// (lib/montagens.js); o que é do celular está em lib/montagens-celular.js (limites do iPhone) e lib/montagens-midia.js
// (abrir as fotos e os takes e gravar o vídeo no aparelho). Fazer → a folha "Pronta": salvar no celular (folha de
// compartilhar do iPhone) ou subir pro Drive pela fila de sempre.
// O trabalho fica no módulo (a aba não desmonta): trocar de aba e voltar não perde nada.
import { html, useEffect, useMemo, useRef, useState } from '../vendor/preact-htm.js'
import { local } from '../lib/config.js'
import { closeSheet, openSheet, setState, setTab, toast, useApp } from '../lib/state.js'
import { engine } from '../lib/uploader.js'
import { keepAwake } from '../lib/wakelock.js'
import { bytes, count } from '../lib/format.js'
import { ZOOM_MAX, enquadreDe, moverEnquadre } from '../lib/frames-posts.js'
import { FORMATOS, FORMATOS_CARROSSEL, caixasDe, desenharMontagem, formatoPersonalizado, formatoPorId, modeloPorId, modelosPara, preencher, quadroNoPonto, telaDe, trechoDe, trocarQuadros } from '../lib/montagens.js'
import { DURACOES, LIMITES, desenharFatia, encaixeDoTake, escalaDaPrevia, partesDe, saidaDe, tamanhoDoVideo, tamanhoNecessario, tipoDaMidia, nomeDoArquivo } from '../lib/montagens-celular.js'
import { abrirTake, baixarFoto, gravarVideo, lerFoto, suporteVideo } from '../lib/montagens-midia.js'
import { Icon } from './icons.js'
import { Button, SheetHead, cx, reducedMotion } from './ui.js'
import { Pilulas } from './kit.js'

const AJUSTES_KEY = 'sobedesce.montagens'
const FUNDOS = ['#ffffff', '#f7f6f2', '#1d1d1f', '#000000']
const TIPOS = [
  { value: 'post', label: 'Post' },
  { value: 'carrossel', label: 'Carrossel' },
  { value: 'grade', label: 'Grade' },
]
const PADRAO = { tipo: 'post', formato: '4x5', personalizado: null, slides: 3, linhas: 2, quadrado: '3x4', modelo: 'grande-dois', espaco: 12, cantos: 0, fundo: '#ffffff', nome: 'Montagem', duracao: 5, saida: 'video' }
const MINI = 360 // lado maior da miniatura (bandeja e galeria de modelos)
const PREVIA = 1280 // lado maior da foto na prévia da tela

// ───── o trabalho (fica no módulo) ─────

const lidos = local.get(AJUSTES_KEY, null)
let ajustes = { ...PADRAO, ...(lidos && typeof lidos === 'object' ? lidos : {}) }
// midias: [{ id, nome, tipo: 'foto'|'video', origem, blob, file, mini, miniUrl, leitor, info, estado, erro }]
let obra = { midias: [], quadros: [], enquadres: [], trechos: {}, som: null, pronta: null }
let seq = 0
const ouvintes = new Set()
const mudou = () => ouvintes.forEach((f) => f())
function useObra() {
  const [, set] = useState(0)
  useEffect(() => {
    const f = () => set((x) => x + 1)
    ouvintes.add(f)
    return () => ouvintes.delete(f)
  }, [])
  return obra
}
function muda(o) {
  ajustes = { ...ajustes, ...o }
  const { personalizado, ...resto } = ajustes
  local.set(AJUSTES_KEY, { ...resto, personalizado })
  mudou()
}
const porId = (id) => obra.midias.find((m) => m.id === id) || null

/**
 * Fotos e takes entram na bandeja (galeria: File; Drive: o arquivo do Drive). Cada um abre sozinho. Um corte da aba
 * Frames entra como take com `trecho` ({ inicio }: onde ele começa) e `nome`; o mesmo vídeo pode entrar várias vezes,
 * um por corte (o que se repete é o mesmo arquivo no mesmo ponto).
 */
export function juntarMidias(itens) {
  const cabem = Math.max(0, LIMITES.midias - obra.midias.length)
  const novos = []
  for (const it of itens) {
    const fonte = it.blob || it.file
    const tipo = tipoDaMidia(it.tipo ? { type: `${it.tipo === 'video' ? 'video' : 'image'}/x` } : fonte || {})
    if (!tipo) continue
    const chave = `${it.file ? `d:${it.file.id}` : `g:${fonte.name || ''}:${fonte.size}`}@${it.trecho ? Math.round(it.trecho.inicio * 100) : ''}`
    if (obra.midias.some((m) => m.chave === chave) || novos.some((m) => m.chave === chave)) continue
    if (novos.length >= cabem) break
    const m = { id: `m${++seq}`, chave, nome: it.nome || fonte.name || 'foto', tipo, origem: it.file ? 'drive' : 'galeria', blob: it.blob || null, file: it.file || null, estado: 'lendo' }
    if (it.trecho) obra.trechos = { ...obra.trechos, [m.id]: { inicio: Math.max(0, Number(it.trecho.inicio) || 0), lento: false } }
    novos.push(m)
  }
  if (itens.length > novos.length) toast(cabem < itens.length ? `Cabem ${LIMITES.midias} na montagem` : 'Só fotos e vídeos entram', { ms: 2400 })
  if (!novos.length) return 0
  obra.midias = [...obra.midias, ...novos]
  obra.pronta = null
  mudou()
  for (const m of novos) abrirMidia(m)
  return novos.length
}

async function abrirMidia(m) {
  try {
    if (m.tipo === 'foto') {
      if (!m.blob) m.blob = await baixarFoto(m.file)
      const r = await lerFoto(m.blob, [MINI])
      m.info = { largura: r.largura, altura: r.altura }
      m.mini = r.canvases[0]
    } else {
      m.leitor = await abrirTake(m.blob ? { blob: m.blob } : { file: m.file })
      m.info = m.leitor.info
      // um corte da aba Frames mostra o ponto dele; o resto, um quadro do começo
      const t0 = obra.trechos[m.id] ? trechoDe(obra.trechos[m.id], ajustes.duracao, m.info.duracao).inicio + 0.5 : Math.min(1, m.info.duracao * 0.1)
      m.mini = await m.leitor.quadro(Math.min(t0, Math.max(0, m.info.duracao - 0.1)), MINI)
    }
    m.miniUrl = await new Promise((ok) => m.mini.toBlob((b) => ok(b ? URL.createObjectURL(b) : ''), 'image/jpeg', 0.8))
    m.estado = 'ok'
  } catch (err) {
    m.estado = 'erro'
    m.erro = err?.message || 'Não abriu'
  }
  mudou()
}

function tirarMidia(id) {
  const m = porId(id)
  m?.leitor?.fechar()
  if (m?.miniUrl) URL.revokeObjectURL(m.miniUrl)
  obra.midias = obra.midias.filter((x) => x.id !== id)
  obra.quadros = obra.quadros.map((q) => (q === id ? null : q))
  if (obra.som === id) obra.som = null
  previas.forEach((_, k) => k.startsWith(`${id}|`) && previas.delete(k))
  obra.pronta = null
  mudou()
}

function limparTudo() {
  for (const m of obra.midias) {
    m.leitor?.fechar()
    if (m.miniUrl) URL.revokeObjectURL(m.miniUrl)
  }
  previas.clear()
  obra = { midias: [], quadros: [], enquadres: [], trechos: {}, som: null, pronta: null }
  mudou()
}

/** Da aba Drive (escolhendo para a montagem, ou a seleção): os arquivos entram e a tela volta para cá. */
export function montagemDoDrive(files, { voltar = true } = {}) {
  const n = juntarMidias(files.map((file) => ({ file })))
  if (voltar) {
    setState({ escolher: null, criarTela: 'montagens' })
    setTab('criar')
  }
  return n
}

/** Quantas fotos e takes já estão na montagem (a faixa de escolher da aba Drive mostra). */
export function useNaMontagem() {
  return useObra().midias.length
}

// ───── imagens de cada quadro ─────

const previas = new Map() // `${id}|${t}` → Promise<canvas>
function previaDe(m, d) {
  if (!m || m.estado !== 'ok') return Promise.resolve(null)
  const t = m.tipo === 'video' ? trechoDe(obra.trechos[m.id], d.duracao, m.info.duracao).inicio : 0
  const k = `${m.id}|${t.toFixed(2)}`
  if (!previas.has(k)) {
    // poucas na memória: as de agora (uma foto de 1280 px são ~5 MB)
    if (previas.size > 14) previas.delete(previas.keys().next().value)
    previas.set(
      k,
      (m.tipo === 'foto' ? lerFoto(m.blob, [PREVIA]).then((r) => r.canvases[0]) : m.leitor.quadro(t, PREVIA)).catch(() => {
        previas.delete(k)
        return null
      }),
    )
  }
  return previas.get(k)
}

/** A foto (ou o quadro do take) no tamanho que o quadro da montagem pronta precisa. */
async function emAlta(m, caixa, enquadre, d) {
  if (!m || m.estado !== 'ok') return null
  const alvo = tamanhoNecessario(m.info.largura, m.info.altura, caixa, enquadreDe(enquadre).zoom)
  if (m.tipo === 'foto') return (await lerFoto(m.blob, [alvo])).canvases[0]
  const t = trechoDe(obra.trechos[m.id], d.duracao, m.info.duracao).inicio
  return m.leitor.quadro(t, Math.max(alvo.w, alvo.h))
}

// ───── a conta da tela (o que o computador faz em MontagensScreen) ─────

function contaDe(d, o) {
  const formato = d.personalizado && d.formato === d.personalizado.id ? d.personalizado : formatoPorId(d.formato)
  const tela = telaDe({ tipo: d.tipo, formato: d.tipo === 'carrossel' && !FORMATOS_CARROSSEL.includes(formato.id) ? formatoPorId('4x5') : formato, slides: d.slides, linhas: d.linhas, quadrado: d.quadrado })
  const modelo = modeloPorId(d.modelo)
  const n = modelo.caixas.length
  const prontas = o.midias.filter((m) => m.estado !== 'erro').map((m) => m.id)
  const quadros = preencher(o.quadros.slice(0, n), n, prontas)
  const takes = d.tipo === 'post' ? quadros.map((id, i) => (id && porId(id)?.tipo === 'video' ? i : -1)).filter((i) => i >= 0) : []
  return { formato, tela, modelo, n, quadros, takes }
}

function opcoesDoDesenho(d, c, imagens, extra = {}) {
  return { formato: c.tela, modelo: c.modelo, imagens, enquadres: obra.enquadres, espaco: d.espaco, cantos: d.cantos, fundo: d.fundo, ...extra }
}

// ───── fazer ─────

let suporte = null // Promise<{ ok, codec, motivo }>
const suporteAqui = () => (suporte ??= suporteVideo())

/** Imagens prontas: uma por parte, cada uma desenhada no tamanho dela. */
async function fazerImagens(d, c, onProgress) {
  const caixas = caixasDe(c.modelo, { w: c.tela.w, h: c.tela.h, espaco: d.espaco })
  const imagens = []
  for (const [i, id] of c.quadros.entries()) imagens.push(await emAlta(id ? porId(id) : null, caixas[i], obra.enquadres[i], d))
  const out = []
  const partes = partesDe(c.tela, d.nome)
  for (const [i, p] of partes.entries()) {
    const cv = document.createElement('canvas')
    desenharFatia(cv, opcoesDoDesenho(d, c, imagens), p.fatia)
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.95))
    cv.width = cv.height = 0
    if (!blob) throw new Error('Não consegui desenhar a montagem.')
    out.push({ blob, nome: p.nome, w: p.fatia.w, h: p.fatia.h, n: p.fatia.n, x: p.fatia.x, y: p.fatia.y })
    onProgress?.((i + 1) / partes.length)
  }
  return out
}

/** O vídeo: a camada da tela (com os buracos) e os takes nos quadros deles, gravado no aparelho. */
async function fazerVideo(d, c, codec, signal, onProgress) {
  const v = tamanhoDoVideo(c.tela)
  const base = document.createElement('canvas')
  const caixas = caixasDe(c.modelo, { w: c.tela.w, h: c.tela.h, espaco: d.espaco })
  const imagens = []
  for (const [i, id] of c.quadros.entries()) {
    const m = id ? porId(id) : null
    imagens.push(m && m.tipo === 'foto' ? await emAlta(m, caixas[i], obra.enquadres[i], d) : null)
  }
  const r = desenharMontagem(base, opcoesDoDesenho(d, c, imagens, { escala: v.w / c.tela.w, buracos: new Set(c.takes) }))
  const takes = c.takes.map((i) => {
    const m = porId(c.quadros[i])
    return { leitor: m.leitor, trecho: trechoDe(obra.trechos[m.id], d.duracao, m.info.duracao), encaixe: encaixeDoTake(m.info, r.caixas[i], obra.enquadres[i]) }
  })
  const somIdx = obra.som ? c.takes.findIndex((i) => c.quadros[i] === obra.som) : -1
  const g = await gravarVideo({ base, fundo: d.fundo, duracao: d.duracao, takes, som: somIdx >= 0 ? somIdx : null, codec, signal, onProgress })
  base.width = base.height = 0
  return { blob: g.blob, nome: nomeDoArquivo(d.nome, c.tela.id, 'mp4'), w: r.w, h: r.h, video: true, capa: g.capa, semSom: g.semSom, duracao: d.duracao }
}

// ───── salvar e subir ─────

/** No celular: a folha de compartilhar (Salvar imagem/vídeo, Salvar em Arquivos); sem ela, um download por arquivo. */
async function salvarNoCelular(arquivos) {
  const files = arquivos.map((a) => new File([a.blob], a.nome, { type: a.blob.type }))
  try {
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files })
      return true
    }
  } catch (err) {
    if (err?.name === 'AbortError') return false
  }
  for (const f of files) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(f)
    a.download = f.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000)
    await new Promise((r) => setTimeout(r, 300))
  }
  return true
}

function escolherPasta() {
  return new Promise((resolve) => {
    openSheet('folders', {
      verb: 'Subir aqui',
      onChoose: (f) => {
        closeSheet()
        resolve(f)
      },
      onCancel: () => {
        closeSheet()
        resolve(null)
      },
    })
  })
}

async function subirProDrive(arquivos) {
  const pasta = await escolherPasta()
  if (!pasta) return false
  engine.addFiles(
    arquivos.map((a) => new File([a.blob], a.nome, { type: a.blob.type })),
    pasta,
  )
  toast(`Subindo ${arquivos.length === 1 ? '1 arquivo' : `${count(arquivos.length)} arquivos`} para “${pasta.name}”`, { tone: 'success', ms: 3600 })
  return true
}

// ───── peças da tela ─────

/** Um modelo na galeria, desenhado com as fotos da pessoa (miniaturas). */
function Modelo({ modelo, tela, ids, ativo, onEscolher, versao }) {
  const cv = useRef(null)
  useEffect(() => {
    if (!cv.current) return
    const imgs = preencher([], modelo.caixas.length, ids).map((id) => porId(id)?.mini || null)
    desenharMontagem(cv.current, { formato: tela, modelo, imagens: imgs, espaco: 14 * (tela.w / 1080) ** 0.5, fundo: '#ffffff', escala: 168 / Math.max(tela.w, tela.h) })
  }, [modelo, tela.w, tela.h, ids.join(','), versao])
  return html`<button type="button" class=${cx('mtc-modelo', ativo && 'is-on')} onClick=${onEscolher} aria-pressed=${ativo ? 'true' : 'false'} aria-label=${modelo.nome}>
    <span class="mtc-modelo-tela"><canvas ref=${cv} aria-hidden="true"></canvas></span>
    <span class="mtc-modelo-n">${modelo.caixas.length}</span>
  </button>`
}

function Formatos({ d, formato }) {
  const lista = d.tipo === 'carrossel' ? FORMATOS.filter((f) => FORMATOS_CARROSSEL.includes(f.id)) : FORMATOS
  const itens = d.personalizado && d.tipo === 'post' ? [...lista, d.personalizado] : lista
  const outro = () => {
    const r = prompt('Largura × altura em pixels (ex.: 1350 × 1080)', d.personalizado ? `${d.personalizado.w} × ${d.personalizado.h}` : '1080 × 1350')
    if (r == null) return
    const m = /(\d{3,4})\s*[x×*]\s*(\d{3,4})/i.exec(r)
    if (!m) return toast('Escreva largura × altura, como 1350 × 1080', { tone: 'error' })
    const f = formatoPersonalizado(m[1], m[2])
    muda({ formato: f.id, personalizado: f })
  }
  return html`<div class="mtc-rolar" role="radiogroup" aria-label="Formato">
    ${itens.map((f) => {
      const s = 22 / Math.max(f.w, f.h)
      const on = formato.id === f.id
      return html`<button type="button" role="radio" aria-checked=${on ? 'true' : 'false'} class=${cx('mtc-formato', on && 'is-on')} title=${`${f.uso || ''} · ${f.w} × ${f.h}`} onClick=${() => muda({ formato: f.id })}>
        <i style=${`width:${Math.round(f.w * s)}px;height:${Math.round(f.h * s)}px`}></i><b>${f.proporcao}</b>
      </button>`
    })}
    ${d.tipo === 'post' ? html`<button type="button" class="mtc-formato is-mais" onClick=${outro} aria-label="Outro tamanho, em pixels"><${Icon} name="plus" size=${16} /><b>px</b></button>` : null}
  </div>`
}

function Bandeja({ o, quadros, ativo, onPor }) {
  const input = useRef(null)
  const daGaleria = (e) => {
    const fs = [...(e.currentTarget.files || [])]
    e.currentTarget.value = ''
    if (fs.length) juntarMidias(fs.map((blob) => ({ blob })))
  }
  return html`<div class="mtc-bandeja">
    <div class="mtc-rolar is-bandeja" aria-label="Fotos e takes">
      ${o.midias.map((m) => {
        const j = quadros.indexOf(m.id)
        return html`<span key=${m.id} class=${cx('mtc-midia', j >= 0 && 'is-usada', m.estado === 'erro' && 'is-erro')}>
          <button type="button" class="mtc-midia-img" disabled=${m.estado !== 'ok'} onClick=${() => onPor(m.id)} aria-label=${ativo >= 0 ? `Pôr ${m.nome} no quadro ${ativo + 1}` : m.nome} title=${m.erro || m.nome}>
            ${m.miniUrl ? html`<img src=${m.miniUrl} alt="" />` : m.estado === 'erro' ? html`<${Icon} name="warning" size=${18} />` : html`<span class="spinner" aria-hidden="true"></span>`}
            ${j >= 0 ? html`<i>${j + 1}</i>` : null}
            ${m.tipo === 'video' ? html`<b class="mtc-midia-play" aria-hidden="true"><${Icon} name="play" size=${9} /></b>` : null}
          </button>
          <button type="button" class="mtc-midia-x" aria-label=${`Tirar ${m.nome}`} onClick=${() => tirarMidia(m.id)}><${Icon} name="x" size=${11} strokeWidth=${2.4} /></button>
        </span>`
      })}
      ${o.midias.length < LIMITES.midias
        ? html`<button type="button" class="mtc-midia is-mais" onClick=${() => input.current?.click()} aria-label="Juntar da galeria"><${Icon} name="plus" size=${22} /></button>
            <button type="button" class="mtc-midia is-mais" onClick=${irAoDrive} aria-label="Juntar do Drive"><${Icon} name="drive" size=${20} /></button>`
        : null}
    </div>
    <input ref=${input} type="file" accept="image/*,video/*" multiple hidden onChange=${daGaleria} />
  </div>`
}

function irAoDrive() {
  setState({ escolher: { para: 'montagens' } })
  setTab('drive')
}

/** A tela vazia: de onde vêm as fotos e os takes. */
function Comecar() {
  const input = useRef(null)
  const daGaleria = (e) => {
    const fs = [...(e.currentTarget.files || [])]
    e.currentTarget.value = ''
    if (fs.length) juntarMidias(fs.map((blob) => ({ blob })))
  }
  return html`<div class="mtc-vazio">
    <div class="mtc-vazio-art k-entra" style="--i:1" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="k-opcoes cr-origens k-entra" style="--n:2;--i:2">
      <button type="button" class="k-opcao is-up" onClick=${() => input.current?.click()}>
        <span class="k-opcao-ic"><${Icon} name="photo" size=${18} strokeWidth=${1.9} /></span>
        <b>Da galeria</b>
        <span>Fotos e vídeos</span>
      </button>
      <button type="button" class="k-opcao" onClick=${irAoDrive}>
        <span class="k-opcao-ic"><${Icon} name="drive" size=${18} strokeWidth=${1.9} /></span>
        <b>Do Drive</b>
        <span>Toque para juntar</span>
      </button>
    </div>
    <input ref=${input} type="file" accept="image/*,video/*" multiple hidden onChange=${daGaleria} />
  </div>`
}

const rotuloSaida = { video: 'Vídeo', foto: 'Foto', 'os-dois': 'Os dois' }

// ───── a tela ─────

export function MontagensTela() {
  const o = useObra()
  const d = ajustes
  const [ativo, setAtivo] = useState(-1)
  const [trocando, setTrocando] = useState(-1)
  const [fazendo, setFazendo] = useState(null) // { frac, txt, ac }
  const [video, setVideo] = useState(null) // { ok, codec, motivo }
  const [larg, setLarg] = useState(() => Math.min(720, (typeof window !== 'undefined' ? window.innerWidth : 390)) - 40)
  const canvas = useRef(null)
  const toque = useRef({ dedos: new Map() })
  const imgs = useRef([])
  const c = contaDe(d, o)
  const { tela, modelo, quadros, takes } = c
  const temTakes = takes.length > 0
  const pronto = o.midias.some((m) => m.estado === 'ok')

  useEffect(() => {
    const r = () => setLarg(Math.min(720, window.innerWidth) - 40)
    window.addEventListener('resize', r)
    return () => window.removeEventListener('resize', r)
  }, [])
  useEffect(() => {
    if (temTakes && !video) suporteAqui().then(setVideo)
  }, [temTakes])

  const alturaMax = Math.min(460, Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.5))
  const escala = escalaDaPrevia(tela, larg, alturaMax)
  const cssW = Math.round(tela.w * escala)
  const cssH = Math.round(tela.h * escala)

  // ── a prévia
  const assinatura = [quadros.join(','), JSON.stringify(o.enquadres), d.espaco, d.cantos, d.fundo, d.duracao, JSON.stringify(o.trechos), tela.w, tela.h, modelo.id, ativo, cssW, o.midias.map((m) => m.estado).join('')].join('|')
  useEffect(() => {
    if (!canvas.current || !pronto) return
    let vivo = true
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    Promise.all(quadros.map((id) => (id ? previaDe(porId(id), d) : null))).then((im) => {
      if (!vivo || !canvas.current) return
      imgs.current = im
      const cv = canvas.current
      const r = desenharMontagem(cv, opcoesDoDesenho(d, c, im, { escala: escala * dpr, destaque: ativo }))
      const g = cv.getContext('2d')
      // takes: o selo de vídeo (só na tela)
      quadros.forEach((id, i) => {
        if (!id || porId(id)?.tipo !== 'video' || !r.caixas[i]) return
        const b = r.caixas[i]
        const rr = 10 * dpr
        const x0 = b.x + 8 * dpr + rr
        const y0 = b.y + b.h - 8 * dpr - rr
        g.fillStyle = 'rgba(0,0,0,0.6)'
        g.beginPath()
        g.arc(x0, y0, rr, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#fff'
        g.beginPath()
        g.moveTo(x0 - 3 * dpr, y0 - 4.5 * dpr)
        g.lineTo(x0 + 5 * dpr, y0)
        g.lineTo(x0 - 3 * dpr, y0 + 4.5 * dpr)
        g.fill()
      })
      // carrossel e grade: onde corta e a ordem de postar (só na tela)
      if (tela.fatias.length > 1) {
        const s = escala * dpr
        g.save()
        g.setLineDash([5 * dpr, 4 * dpr])
        g.strokeStyle = 'rgba(10,132,255,0.95)'
        g.lineWidth = 1.25 * dpr
        for (const f of tela.fatias) {
          if (f.x > 0) {
            g.beginPath()
            g.moveTo(f.x * s, f.y * s)
            g.lineTo(f.x * s, (f.y + f.h) * s)
            g.stroke()
          }
          if (f.y > 0) {
            g.beginPath()
            g.moveTo(f.x * s, f.y * s)
            g.lineTo((f.x + f.w) * s, f.y * s)
            g.stroke()
          }
        }
        g.setLineDash([])
        for (const f of tela.fatias) {
          const raio = Math.min(11 * dpr, (f.w * s) / 5)
          const x = f.x * s + 6 * dpr + raio
          const y = f.y * s + 6 * dpr + raio
          g.fillStyle = 'rgba(29,29,31,0.85)'
          g.beginPath()
          g.arc(x, y, raio, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = '#fff'
          g.font = `700 ${Math.round(raio * 1.05)}px -apple-system, system-ui, sans-serif`
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText(String(f.n), x, y + 0.5 * dpr)
        }
        g.restore()
      }
    })
    return () => {
      vivo = false
    }
  }, [assinatura, pronto])

  if (!o.midias.length)
    return html`<div class="cr-frames mtc">
      <header class="k-cabeca k-entra" style="--i:0">
        <div class="k-cabeca-txt"><h1>Montagens</h1><p>Fotos e takes em modelos prontos.</p></div>
      </header>
      <${Comecar} />
    </div>`

  // ── quadros
  const porNoQuadro = (i, id) => {
    const q = [...quadros]
    const e = [...o.enquadres]
    const j = q.indexOf(id)
    if (j >= 0 && j !== i) {
      q[j] = q[i]
      e[j] = e[i]
    }
    q[i] = id
    e[i] = null
    Object.assign(obra, { quadros: q, enquadres: e, pronta: null })
    mudou()
  }
  const trocar = (a, b) => {
    const r = trocarQuadros(quadros, o.enquadres, a, b)
    Object.assign(obra, { quadros: r.fotos, enquadres: r.enquadres, pronta: null })
    mudou()
  }
  const enquadre = (i, e) => {
    const l = [...obra.enquadres]
    l[i] = e
    Object.assign(obra, { enquadres: l, pronta: null })
    mudou()
  }
  const tirar = (i) => {
    const q = [...quadros]
    q[i] = ''
    Object.assign(obra, { quadros: q, enquadres: o.enquadres.map((e, j) => (j === i ? null : e)), pronta: null })
    mudou()
  }
  const porDaBandeja = (id) => {
    if (ativo >= 0) return porNoQuadro(ativo, id)
    // sem quadro escolhido: o primeiro vazio
    const vazio = quadros.findIndex((x) => !x)
    if (vazio >= 0) {
      porNoQuadro(vazio, id)
      setAtivo(vazio)
    } else toast('Toque num quadro antes', { ms: 1800 })
  }

  // ── tocar, arrastar e pinçar na prévia (px da montagem)
  const ponto = (e) => {
    const r = canvas.current.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * tela.w, y: ((e.clientY - r.top) / r.height) * tela.h }
  }
  const opts = { w: tela.w, h: tela.h, espaco: d.espaco }
  const distancia = (m) => {
    const [a, b] = [...m.values()]
    return Math.hypot(a.x - b.x, a.y - b.y) || 1
  }
  const desce = (e) => {
    const t = toque.current
    const pt = ponto(e)
    t.dedos.set(e.pointerId, pt)
    if (t.dedos.size === 1) {
      t.i = quadroNoPonto(modelo, opts, pt.x, pt.y)
      t.andou = 0
      t.e0 = enquadreDe(o.enquadres[t.i])
      t.p0 = pt
      if (t.i >= 0 && t.i === ativo) e.currentTarget.setPointerCapture?.(e.pointerId)
    } else if (t.dedos.size === 2 && ativo >= 0) {
      t.dist0 = distancia(t.dedos)
      t.zoom0 = enquadreDe(o.enquadres[ativo]).zoom
    }
  }
  const move = (e) => {
    const t = toque.current
    const ant = t.dedos.get(e.pointerId)
    if (!ant) return
    const pt = ponto(e)
    t.dedos.set(e.pointerId, pt)
    t.andou += Math.abs(pt.x - ant.x) + Math.abs(pt.y - ant.y)
    if (ativo < 0) return
    if (t.dedos.size >= 2) {
      if (t.dist0) enquadre(ativo, { ...enquadreDe(o.enquadres[ativo]), zoom: Math.min(ZOOM_MAX, Math.max(1, (t.zoom0 * distancia(t.dedos)) / t.dist0)) })
      return
    }
    // arrastar só enquadra o quadro já escolhido (assim o dedo ainda rola a página)
    if (t.i !== ativo) return
    const img = imgs.current[ativo]
    if (!img) return
    enquadre(ativo, moverEnquadre(t.e0, pt.x - t.p0.x, pt.y - t.p0.y, img.naturalWidth, img.naturalHeight, caixasDe(modelo, opts)[ativo]))
  }
  const sobe = (e) => {
    const t = toque.current
    if (!t.dedos.delete(e.pointerId)) return
    if (t.dedos.size < 2) t.dist0 = 0
    if (t.dedos.size || e.type !== 'pointerup' || t.andou > 18) return
    // toque sem arrastar: escolhe o quadro (ou troca de lugar)
    const i = t.i
    if (i < 0) return setAtivo(-1)
    if (trocando >= 0) {
      if (i !== trocando) trocar(trocando, i)
      setTrocando(-1)
    }
    setAtivo(i === ativo && trocando < 0 ? -1 : i)
  }

  // ── fazer
  const podeVideo = temTakes && video?.ok && takes.length <= LIMITES.takesVideo
  const saida = !temTakes ? 'foto' : podeVideo ? d.saida : 'foto'
  const fazer = async () => {
    if (!quadros.some((id) => id && porId(id)?.estado === 'ok')) return toast('Ponha pelo menos uma foto num quadro', { tone: 'error' })
    const ac = new AbortController()
    setFazendo({ frac: 0, txt: saida === 'foto' ? 'Desenhando' : 'Gravando o vídeo', ac })
    keepAwake(true)
    try {
      const arquivos = []
      if (saida === 'video' || saida === 'os-dois') arquivos.push(await fazerVideo(d, c, video.codec, ac.signal, (f) => setFazendo((x) => x && { ...x, frac: f * (saida === 'os-dois' ? 0.9 : 1) })))
      if (saida === 'foto' || saida === 'os-dois') {
        setFazendo((x) => x && { ...x, txt: 'Desenhando' })
        arquivos.push(...(await fazerImagens(d, c, (f) => setFazendo((x) => x && { ...x, frac: saida === 'os-dois' ? 0.9 + f * 0.1 : f }))))
      }
      obra.pronta = { arquivos, grade: d.tipo === 'grade', carrossel: d.tipo === 'carrossel' }
      openSheet('montagemPronta')
    } catch (err) {
      if (err?.name !== 'AbortError') toast(err?.message || 'Não consegui fazer a montagem.', { tone: 'error', ms: 4200 })
    } finally {
      keepAwake(false)
      setFazendo(null)
    }
  }

  const mudaTipo = (tipo) => {
    const x = { tipo }
    if (tipo === 'carrossel' && !FORMATOS_CARROSSEL.includes(d.formato)) x.formato = '4x5'
    if (tipo !== 'post' && d.tipo === 'post') x.modelo = 'uma'
    muda(x)
    setAtivo(-1)
  }
  const m = ativo >= 0 && quadros[ativo] ? porId(quadros[ativo]) : null
  const q = m ? enquadreDe(o.enquadres[ativo]) : null
  const prontas = o.midias.filter((x) => x.estado === 'ok').map((x) => x.id)
  const nomear = () => {
    const r = prompt('Nome da montagem', d.nome)
    if (r && r.trim()) muda({ nome: r.trim().slice(0, 80) })
  }

  return html`<div class="cr-frames mtc">
    <header class="mtc-cabeca">
      <div class="mtc-topo">
        <button type="button" class="mtc-nome" onClick=${nomear} title="Trocar o nome">${d.nome}<${Icon} name="pencil" size=${13} /></button>
        <button type="button" class="link-btn" onClick=${() => confirm('Começar outra montagem? As fotos saem daqui (não do celular).') && limparTudo()}>Nova</button>
      </div>
      <${Pilulas} label="Tipo de montagem" valor=${d.tipo} onEscolher=${mudaTipo} itens=${TIPOS} />
    </header>

    <div class="mtc-palco">
      <canvas
        ref=${canvas}
        class=${cx('mtc-canvas', ativo >= 0 && 'is-ativo', trocando >= 0 && 'is-trocando')}
        style=${`width:${cssW}px;height:${cssH}px`}
        role="img"
        aria-label="Montagem: toque num quadro para escolher; arraste e pince para enquadrar"
        onPointerDown=${desce}
        onPointerMove=${move}
        onPointerUp=${sobe}
        onPointerCancel=${sobe}
      ></canvas>
    </div>
    ${ativo >= 0
      ? html`<div class="mtc-barra" role="toolbar" aria-label=${`Quadro ${ativo + 1}`}>
          ${m
            ? html`<label class="mtc-zoom"><${Icon} name="zoom" size=${16} />
                  <input type="range" aria-label="Zoom" min="1" max=${ZOOM_MAX} step="0.01" value=${q.zoom} onInput=${(e) => enquadre(ativo, { ...q, zoom: Number(e.currentTarget.value) })} />
                </label>
                <button type="button" class="mtc-ferr" aria-label="Centralizar" title="Centralizar" onClick=${() => enquadre(ativo, null)}><${Icon} name="crop" size=${17} /></button>`
            : html`<span class="mtc-barra-txt">Toque numa foto embaixo</span>`}
          ${m?.tipo === 'video' && d.tipo === 'post' ? html`<button type="button" class="mtc-ferr" aria-label="Trecho do take" title="Trecho" onClick=${() => openSheet('montagemTrecho', { id: m.id })}><${Icon} name="film" size=${17} /></button>` : null}
          <button type="button" class=${cx('mtc-ferr', trocando === ativo && 'is-on')} aria-label=${trocando === ativo ? 'Toque no outro quadro' : 'Trocar de lugar'} title="Trocar de lugar" onClick=${() => setTrocando(trocando === ativo ? -1 : ativo)}><${Icon} name="swap" size=${17} /></button>
          ${m ? html`<button type="button" class="mtc-ferr" aria-label="Tirar do quadro" title="Tirar do quadro" onClick=${() => tirar(ativo)}><${Icon} name="x" size=${17} /></button>` : null}
        </div>`
      : html`<p class="cr-dica-enq">${d.tipo === 'grade' ? 'Os números são a ordem de postar' : d.tipo === 'carrossel' ? 'A linha azul é onde um slide vira o outro' : 'Toque num quadro para enquadrar'}</p>`}

    <${Bandeja} o=${o} quadros=${quadros} ativo=${ativo} onPor=${porDaBandeja} />

    <section class="mtc-secao" aria-label="Modelo">
      <div class="mtc-rolar is-modelos">
        ${modelosPara(prontas.length).map((x) => html`<${Modelo} key=${x.id} modelo=${x} tela=${tela} ids=${prontas} versao=${o.midias.length} ativo=${x.id === d.modelo} onEscolher=${() => (Object.assign(obra, { quadros: [], enquadres: [], pronta: null }), muda({ modelo: x.id }), setAtivo(-1))} />`)}
      </div>
    </section>

    ${d.tipo === 'grade'
      ? html`<div class="mtc-linhas">
          <${Pilulas} label="Linhas da grade" valor=${d.linhas} onEscolher=${(v) => muda({ linhas: v })} itens=${[1, 2, 3, 4, 5].map((v) => ({ value: v, label: `3×${v}` }))} rolar=${true} />
          <${Pilulas} label="Quadradinho" valor=${d.quadrado} onEscolher=${(v) => muda({ quadrado: v })} itens=${[{ value: '3x4', label: '3:4' }, { value: '1x1', label: '1:1' }]} />
        </div>`
      : html`<${Formatos} d=${d} formato=${c.formato} />`}
    ${d.tipo === 'carrossel' ? html`<${Pilulas} label="Slides" valor=${d.slides} onEscolher=${(v) => muda({ slides: v })} itens=${[2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ value: v, label: String(v) }))} rolar=${true} />` : null}

    ${temTakes
      ? html`<section class="mtc-card" aria-label="Vídeo">
          ${video && !video.ok
            ? html`<p class="cr-aviso"><${Icon} name="info" size=${15} />${video.motivo} Sai a foto (o quadro do começo de cada take); o vídeo, no computador por enquanto.</p>`
            : takes.length > LIMITES.takesVideo
              ? html`<p class="cr-aviso"><${Icon} name="info" size=${15} />No celular, até ${LIMITES.takesVideo} takes por vídeo. Com mais, sai a foto.</p>`
              : html`<${Pilulas} label="Sai como" valor=${d.saida} onEscolher=${(v) => muda({ saida: v })} itens=${Object.entries(rotuloSaida).map(([value, label]) => ({ value, label }))} />
                  ${saida !== 'foto'
                    ? html`<${Pilulas} label="Duração" valor=${d.duracao} onEscolher=${(v) => muda({ duracao: v })} itens=${DURACOES.map((v) => ({ value: v, label: `${v} s` }))} />
                        <${Pilulas}
                          label="Som"
                          valor=${obra.som && quadros.includes(obra.som) ? obra.som : null}
                          onEscolher=${(v) => ((obra.som = v), (obra.pronta = null), mudou())}
                          itens=${[{ value: null, label: 'Sem som' }, ...takes.map((i, j) => ({ value: quadros[i], label: `Take ${j + 1}` }))]}
                          rolar=${true}
                        />`
                    : null}`}
        </section>`
      : null}

    <details class="mtc-ajustes">
      <summary><${Icon} name="sliders" size=${16} /><span>Espaço, cantos e fundo</span><${Icon} name="chevron-down" size=${16} /></summary>
      <label class="mtc-slider"><span>Espaço</span><input type="range" min="0" max="80" step="1" value=${d.espaco} aria-label="Espaço entre as fotos" onInput=${(e) => muda({ espaco: Number(e.currentTarget.value) })} /><output>${d.espaco}</output></label>
      <label class="mtc-slider"><span>Cantos</span><input type="range" min="0" max="80" step="1" value=${d.cantos} aria-label="Cantos arredondados" onInput=${(e) => muda({ cantos: Number(e.currentTarget.value) })} /><output>${d.cantos}</output></label>
      <div class="mtc-cores" role="radiogroup" aria-label="Fundo">
        ${FUNDOS.map((cor) => html`<button type="button" role="radio" aria-checked=${d.fundo === cor ? 'true' : 'false'} class=${cx('mtc-cor', d.fundo === cor && 'is-on')} style=${`--cor:${cor}`} aria-label=${`Fundo ${cor}`} onClick=${() => muda({ fundo: cor })}></button>`)}
        <label class=${cx('mtc-cor is-livre', !FUNDOS.includes(d.fundo) && 'is-on')} title="Outra cor"><input type="color" value=${d.fundo} aria-label="Outra cor de fundo" onInput=${(e) => muda({ fundo: e.currentTarget.value })} /></label>
      </div>
    </details>

    <div class="mtc-fazer">
      ${fazendo
        ? html`<div class="mtc-andamento" role="status" aria-live="polite">
            <div class="mtc-andamento-txt"><b>${fazendo.txt}</b><span>${Math.round(fazendo.frac * 100)}%</span></div>
            <div class="mtc-barra-prog"><i style=${`width:${(fazendo.frac * 100).toFixed(1)}%`}></i></div>
            <${Button} variant="secondary" onClick=${() => fazendo.ac.abort()}>Parar</${Button}>
          </div>`
        : html`<button type="button" class="k-botao mtc-botao" disabled=${!pronto} onClick=${fazer}><${Icon} name=${saida === 'foto' ? 'grid' : 'film'} size=${19} strokeWidth=${2} /><span>Fazer a montagem</span></button>
            <p class="k-botao-dica">${saidaDe(tela, { takes: takes.length, video: saida !== 'foto' })}${saida === 'os-dois' ? ' e a capa em JPG' : ''}${saida !== 'foto' ? ` · ${d.duracao} s` : ''}</p>`}
    </div>
  </div>`
}

// ───── folhas ─────

/** A montagem pronta: as imagens (ou o vídeo e a capa), salvar no celular ou subir pro Drive. */
export function MontagemProntaSheet() {
  const p = obra.pronta
  const [busy, setBusy] = useState(null)
  const urls = useMemo(() => (p?.arquivos || []).map((a) => (a.video ? (a.capa ? URL.createObjectURL(a.capa) : null) : URL.createObjectURL(a.blob))), [p])
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls])
  if (!p) return null
  const total = p.arquivos.reduce((s, a) => s + a.blob.size, 0)
  // na tela, como fica no perfil (a grade de cima para baixo); o número é a ordem de postar
  const vista = p.arquivos.map((a, i) => ({ a, i })).sort((x, y) => (x.a.video ? -1 : 0) - (y.a.video ? -1 : 0) || (x.a.y ?? 0) - (y.a.y ?? 0) || (x.a.x ?? 0) - (y.a.x ?? 0))
  const acao = async (qual) => {
    setBusy(qual)
    try {
      if (qual === 'salvar') await salvarNoCelular(p.arquivos)
      else if (await subirProDrive(p.arquivos)) return
    } catch (err) {
      toast(err?.message || 'Não consegui.', { tone: 'error' })
    }
    setBusy(null)
  }
  return html`<${SheetHead} title="Pronta" left=${html`<button type="button" class="link-btn" onClick=${closeSheet}>Fechar</button>`} />
    <div class="sheet-scroll"><div class="mtc-pronta">
      <div class=${cx('mtc-pronta-lista', p.arquivos.length > 1 && 'is-varias')}>
        ${vista.map(
          ({ a, i }) => html`<figure key=${a.nome} class="mtc-pronta-item">
            ${a.video
              ? html`<div class="mtc-pronta-video" style=${`aspect-ratio:${a.w}/${a.h}`}>${urls[i] ? html`<img src=${urls[i]} alt="" />` : null}<span><${Icon} name="film" size=${22} /></span></div>`
              : html`<img src=${urls[i]} alt="" style=${`aspect-ratio:${a.w}/${a.h}`} data-w=${a.w} data-h=${a.h} />`}
            <figcaption>${(p.grade || p.carrossel) && a.n ? html`<b>${a.n}</b>` : null}${a.video ? `MP4 · ${a.duracao} s` : `${a.w} × ${a.h}`}</figcaption>
          </figure>`,
        )}
      </div>
      ${p.arquivos.find((a) => a.semSom) ? html`<p class="cr-aviso"><${Icon} name="volume-off" size=${15} />${p.arquivos.find((a) => a.semSom).semSom}</p>` : null}
      <p class="cr-nota">${p.grade ? 'Poste na ordem dos números: o 1 primeiro.' : p.carrossel ? 'Poste na ordem, num carrossel só.' : ''} ${count(p.arquivos.length)} ${p.arquivos.length === 1 ? 'arquivo' : 'arquivos'} · ${bytes(total)}</p>
      <div class="cr-post-btns">
        <${Button} variant="primary" size="xl" icon="download" loading=${busy === 'salvar'} onClick=${() => acao('salvar')}>Salvar no celular</${Button}>
        <${Button} variant="secondary" size="xl" icon="upload" loading=${busy === 'subir'} onClick=${() => acao('subir')}>Subir pro Drive</${Button}>
      </div>
    </div></div>`
}
MontagemProntaSheet.label = 'Montagem pronta'
MontagemProntaSheet.tall = true

const tc = (s) => {
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0').replace('.', ',')}`
}

/** O trecho do take: a faixa com os quadros, a janela do trecho (arrastar) e a câmera lenta. */
export function MontagemTrechoSheet({ id }) {
  const m = porId(id)
  const d = ajustes
  const dur = m?.info?.duracao || 0
  const [t, setT] = useState(() => trechoDe(obra.trechos[id], d.duracao, dur))
  const [quadros, setQuadros] = useState([])
  const tela = useRef(null)
  const faixa = useRef(null)
  const arrasto = useRef(null)
  const N = 8
  useEffect(() => {
    if (!m?.leitor) return
    let vivo = true
    ;(async () => {
      const out = []
      for (let i = 0; i < N && vivo; i++) {
        const c = await m.leitor.quadro(((i + 0.5) * dur) / N, 160).catch(() => null)
        out.push(c ? await new Promise((ok) => c.toBlob((b) => ok(b ? URL.createObjectURL(b) : ''), 'image/jpeg', 0.7)) : '')
        if (vivo) setQuadros([...out])
      }
    })()
    return () => {
      vivo = false
    }
  }, [id])
  const feitos = useRef([])
  feitos.current = quadros
  useEffect(() => () => feitos.current.forEach((u) => u && URL.revokeObjectURL(u)), [])
  // o quadro do começo do trecho, grande
  useEffect(() => {
    if (!m?.leitor) return
    let vivo = true
    const pausa = setTimeout(() => {
      m.leitor.quadro(t.inicio, 720).then((c) => {
        if (!vivo || !tela.current) return
        tela.current.width = c.width
        tela.current.height = c.height
        tela.current.getContext('2d').drawImage(c, 0, 0)
      }, () => {})
    }, 60)
    return () => {
      vivo = false
      clearTimeout(pausa)
    }
  }, [t.inicio])
  if (!m?.leitor) return null
  const pos = (s) => `${(s / dur) * 100}%`
  const tempoNoPonto = (e) => {
    const r = faixa.current.getBoundingClientRect()
    return Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur))
  }
  const desce = (e) => {
    const s = tempoNoPonto(e)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    // fora da janela: ela pula para lá (com o dedo no meio); dentro: arrasta
    const ini = s >= t.inicio && s <= t.fim ? t.inicio : s - t.janela / 2
    const n = trechoDe({ ...t, inicio: ini }, d.duracao, dur)
    setT(n)
    arrasto.current = { de: s, inicio: n.inicio }
  }
  const move = (e) => {
    const a = arrasto.current
    if (!a) return
    setT(trechoDe({ ...t, inicio: a.inicio + (tempoNoPonto(e) - a.de) }, d.duracao, dur))
  }
  const sobe = () => (arrasto.current = null)
  const usar = () => {
    obra.trechos = { ...obra.trechos, [id]: { inicio: t.inicio, lento: t.lento } }
    obra.pronta = null
    mudou()
    closeSheet()
  }
  return html`<${SheetHead} title="Trecho" left=${html`<button type="button" class="link-btn" onClick=${closeSheet}>Cancelar</button>`} right=${html`<button type="button" class="link-btn is-strong" onClick=${usar}>Usar</button>`} />
    <div class="sheet-scroll"><div class="mtc-trecho">
      <div class="mtc-trecho-tela" style=${`aspect-ratio:${m.info.largura}/${m.info.altura}`}><canvas ref=${tela} aria-label="Quadro do começo do trecho"></canvas></div>
      <div class="mtc-trecho-tc"><b>${tc(t.inicio)} → ${tc(t.fim)}</b><span>${d.duracao} s na montagem</span></div>
      <div class="mtc-faixa" ref=${faixa} onPointerDown=${desce} onPointerMove=${move} onPointerUp=${sobe} onPointerCancel=${sobe} aria-label="Arraste para escolher o trecho">
        <div class="mtc-faixa-quadros">${Array.from({ length: N }, (_, i) => (quadros[i] ? html`<img src=${quadros[i]} alt="" draggable="false" />` : html`<span></span>`))}</div>
        <div class="mtc-fora" style=${`left:0;width:${pos(t.inicio)}`}></div>
        <div class="mtc-fora" style=${`left:${pos(t.fim)};right:0`}></div>
        <div class=${cx('mtc-janela', reducedMotion() && 'is-parado')} style=${`left:${pos(t.inicio)};width:${pos(t.janela)}`}></div>
      </div>
      <${Pilulas}
        label="Velocidade"
        valor=${t.lento ? 'lento' : 'normal'}
        onEscolher=${(v) => setT(trechoDe({ ...t, lento: v === 'lento' }, d.duracao, dur))}
        itens=${[
          { value: 'normal', label: 'Normal' },
          { value: 'lento', label: 'Câmera lenta ½×' },
        ]}
      />
    </div></div>`
}
MontagemTrechoSheet.label = 'Trecho do take'
MontagemTrechoSheet.tall = true
