// Estúdio › Montagens (#/montagens): fotos e takes do computador em modelos prontos. Três tipos: o post (foto ou
// vídeo, quando tem take), o carrossel contínuo (uma imagem que passa de um slide para o outro) e a grade do perfil
// (uma imagem dividida em 3 colunas, numerada na ordem de postar). Cada take tem o trecho escolhido na agulha.
// O desenho é do public/lib/montagens.js; o motor mostra a foto, os quadros do vídeo, grava a pronta e gera o vídeo
// (src/server/montagens.js, src/montagens/video.js).
import { html, useEffect, useMemo, useRef, useState } from '/vendor/preact-htm.js'
import { getState, useStore } from '../lib/store.js'
import { api, attempt, withQuery } from '../lib/api.js'
import { cx, storage } from '../lib/ui.js'
import { toast } from '../lib/toasts.js'
import { bridge, pathsFromDrop, pickFolderPath, revealLabel, revealPath } from '../lib/desktop.js'
import { openModal, pickDriveFolder, pickLocal, promptDialog } from '../lib/modals.js'
import { ZOOM_MAX, cobrir, enquadreDe, moverEnquadre } from '../lib/frames-posts.js'
import {
  ASPECTOS_FAIXA,
  FAIXAS_N,
  FAIXAS_PADRAO,
  FORMATOS,
  FORMATOS_CARROSSEL,
  caixasDe,
  desenharMontagem,
  formatoPersonalizado,
  formatoPorId,
  modeloDe,
  modeloFaixas,
  modelosPara,
  preencher,
  quadroNoPonto,
  telaDe,
  trechoDe,
  trocarQuadros,
} from '../lib/montagens.js'
import { Icon } from './icons.js'
import { Button, EmptyState, Slider, Switch } from './common.js'

const FOTO_EXT = /\.(jpe?g|png|webp|tiff?|heic|heif)$/i
const VIDEO_EXT = /\.(mp4|mov|m4v|mxf|mkv|avi|mts|m2ts|webm|3gp|mpg|mpeg)$/i
const MAX_MIDIAS = 60
const FUNDOS = ['#ffffff', '#f7f6f2', '#1d1d1f', '#000000']
const DURACOES = [3, 5, 8, 15]
const TIPOS = [
  { value: 'post', label: 'Post' },
  { value: 'carrossel', label: 'Carrossel contínuo' },
  { value: 'grade', label: 'Grade do perfil' },
]
const PADRAO = {
  fotos: [],
  tipo: 'post',
  formato: '4x5',
  personalizado: null,
  slides: 3,
  linhas: 2,
  quadrado: '3x4',
  modelo: 'grande-dois',
  faixas: FAIXAS_PADRAO, // o modelo "Faixas": quantas, o formato do frame e a zona dos Stories
  quadros: [],
  enquadres: [],
  espaco: 12,
  cantos: 0,
  fundo: '#ffffff',
  nome: 'Montagem',
  trechos: {},
  duracao: 5,
  som: null,
}

const nomeDe = (p) =>
  String(p || '')
    .split(/[\\/]/)
    .pop()
const ehVideo = (p) => VIDEO_EXT.test(p || '')
const k = () => getState().media?.key || ''
const fotoUrl = (p) => withQuery('/api/montagens/foto', { p, k: k() })
const quadroUrl = (p, t, l = 1280) => withQuery('/api/montagens/quadro', { p, t: (Math.round(t * 4) / 4).toFixed(2), l, k: k() })
const videoUrl = (p) => withQuery('/api/montagens/video', { p, k: k() })
const tc = (s) => {
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r.toFixed(1).padStart(4, '0').replace('.', ',')}`
}
const dois = (n) => String(n).padStart(2, '0')

const cache = new Map() // url → Promise<HTMLImageElement>
function carregarUrl(url) {
  if (!cache.has(url))
    cache.set(
      url,
      new Promise((ok, falha) => {
        const img = new Image()
        img.decoding = 'async'
        img.onload = () => ok(img)
        img.onerror = () => {
          cache.delete(url)
          falha(new Error('imagem'))
        }
        img.src = url
      }),
    )
  return cache.get(url)
}

const infos = new Map() // caminho → Promise<{ duracao, largura, altura, fps, audio }>
function infoDe(p) {
  if (!infos.has(p))
    infos.set(
      p,
      api.get(withQuery('/api/montagens/info', { p, k: k() })).then(
        (r) => r.info,
        (err) => {
          infos.delete(p)
          throw err
        },
      ),
    )
  return infos.get(p)
}

function rascunho() {
  const s = storage.get('montagens.rascunho', null)
  return s && typeof s === 'object' ? { ...PADRAO, ...s, trechos: { ...(s.trechos || {}) } } : PADRAO
}

/** A imagem de cada quadro: a foto ou o quadro do começo do trecho do take. */
async function imagensDe(quadros, d) {
  return Promise.all(
    quadros.map(async (p) => {
      if (!p) return null
      try {
        if (!ehVideo(p)) return await carregarUrl(fotoUrl(p))
        const info = await infoDe(p)
        const t = trechoDe(d.trechos[p], d.duracao, info.duracao)
        return await carregarUrl(quadroUrl(p, t.inicio))
      } catch {
        return null
      }
    }),
  )
}

/** Um modelo na galeria, já desenhado com as fotos da pessoa. */
function Modelo({ modelo, tela, fotos, d, ativo, onEscolher }) {
  const cv = useRef(null)
  useEffect(() => {
    let vivo = true
    imagensDe(preencher([], modelo.caixas.length, fotos), d).then((imgs) => {
      if (!vivo || !cv.current) return
      desenharMontagem(cv.current, {
        formato: tela,
        modelo,
        imagens: imgs,
        espaco: 14 * (tela.w / 1080) ** 0.5,
        fundo: '#ffffff',
        escala: 300 / Math.max(tela.w, tela.h),
      })
    })
    return () => {
      vivo = false
    }
  }, [modelo, tela.w, tela.h, fotos])
  return html`<button type="button" class=${cx('mt-modelo', ativo && 'is-on')} onClick=${onEscolher} aria-pressed=${ativo ? 'true' : 'false'}>
    <span class="mt-modelo-tela"><canvas ref=${cv} aria-hidden="true"></canvas></span>
    <b>${modelo.nome}</b>
    <span>${modelo.caixas.length === 1 ? '1 foto' : `${modelo.caixas.length} fotos`}</span>
  </button>`
}

function Formatos({ lista, valor, personalizado, onEscolher, outro }) {
  const pedir = async () => {
    const r = await promptDialog({
      title: 'Formato personalizado',
      message: 'Largura × altura em pixels (ex.: 1350 × 1080).',
      initial: personalizado ? `${personalizado.w} × ${personalizado.h}` : '1080 × 1350',
      confirmLabel: 'Usar',
    })
    const m = /(\d{3,4})\s*[x×*]\s*(\d{3,4})/i.exec(r || '')
    if (!m) return r != null && toast('error', 'Escreva largura × altura, como 1350 × 1080.')
    onEscolher(formatoPersonalizado(m[1], m[2]))
  }
  const itens = personalizado && outro ? [...lista, personalizado] : lista
  return html`<div class="mt-formatos" role="radiogroup" aria-label="Formato">
    ${itens.map((f) => {
      const s = 26 / Math.max(f.w, f.h)
      return html`<button
        type="button"
        role="radio"
        aria-checked=${valor === f.id ? 'true' : 'false'}
        class=${cx('mt-formato', valor === f.id && 'is-on')}
        title=${`${f.uso || ''} · ${f.w} × ${f.h}`}
        onClick=${() => onEscolher(f)}
      >
        <i style=${`width:${Math.round(f.w * s)}px;height:${Math.round(f.h * s)}px`}></i>
        <b>${f.nome}</b><span>${f.proporcao}</span>
      </button>`
    })}
    ${outro ? html`<button type="button" class="mt-formato is-mais" onClick=${pedir} title="Largura × altura em pixels"><${Icon} name="plus" size=${16} /><b>Outro</b><span>px</span></button>` : null}
  </div>`
}

function Chips({ valor, itens, onEscolher, label }) {
  return html`<div class="mt-chips" role="radiogroup" aria-label=${label}>
    ${itens.map((o) => html`<button type="button" role="radio" aria-checked=${valor === o.value ? 'true' : 'false'} class=${cx('mt-chip', valor === o.value && 'is-on')} onClick=${() => onEscolher(o.value)}>${o.label}</button>`)}
  </div>`
}

/** Escolher o trecho do take: a faixa com os quadros, a janela do trecho e a agulha do quadro de agora. */
function Trecho({ p, info, trecho, duracao, onOk, onCancel }) {
  const [t, setT] = useState(() => trechoDe(trecho, duracao, info.duracao))
  const [agulha, setAgulha] = useState(t.inicio)
  const [tocando, setTocando] = useState(false)
  const [toca, setToca] = useState(true) // o navegador toca este vídeo? (MXF, ProRes: não; fica no quadro parado)
  const faixa = useRef(null)
  const video = useRef(null)
  const arrasto = useRef(null)
  const dur = info.duracao
  const pos = (s) => `${(s / dur) * 100}%`
  const N = 12
  const tempoNoPonto = (e) => {
    const r = faixa.current.getBoundingClientRect()
    return Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur))
  }
  const mudaInicio = (inicio) => {
    const n = trechoDe({ ...t, inicio }, duracao, dur)
    setT(n)
    setAgulha(n.inicio)
  }
  useEffect(() => {
    const v = video.current
    if (v && toca && !tocando && Math.abs(v.currentTime - agulha) > 0.05) v.currentTime = agulha
  }, [agulha, toca, tocando])
  const desce = (e) => {
    const s = tempoNoPonto(e)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    if (s >= t.inicio && s <= t.fim) arrasto.current = { modo: 'janela', de: s, inicio: t.inicio }
    else {
      arrasto.current = { modo: 'agulha' }
      setAgulha(s)
    }
  }
  const move = (e) => {
    const a = arrasto.current
    if (!a) return
    const s = tempoNoPonto(e)
    if (a.modo === 'janela') mudaInicio(a.inicio + (s - a.de))
    else setAgulha(s)
  }
  const sobe = () => {
    arrasto.current = null
  }
  const tocar = () => {
    const v = video.current
    if (!v || !toca) return
    if (tocando) {
      v.pause()
      return setTocando(false)
    }
    v.currentTime = t.inicio
    v.playbackRate = t.lento ? 0.5 : 1
    v.play().then(
      () => setTocando(true),
      () => setToca(false),
    )
  }
  const noTempo = () => {
    const v = video.current
    if (!v || !tocando) return
    setAgulha(v.currentTime)
    if (v.currentTime >= t.fim) {
      v.pause()
      setTocando(false)
      setAgulha(t.inicio)
    }
  }
  return html`<div class="mt-trecho" role="dialog" aria-label="Escolher o trecho do take">
    <header class="mt-trecho-head">
      <div><h2>Escolher o trecho</h2><p>${nomeDe(p)} · ${tc(dur)}</p></div>
      <div class="mt-acoes"><${Button} onClick=${onCancel}>Cancelar</${Button}><${Button} variant="primary" icon="check" onClick=${() => onOk({ inicio: t.inicio, lento: t.lento })}>Usar este trecho</${Button}></div>
    </header>
    <div class="mt-trecho-corpo">
      <div class="mt-trecho-tela">
        ${
          toca
            ? html`<video ref=${video} src=${videoUrl(p)} muted playsinline preload="auto" onError=${() => setToca(false)} onTimeUpdate=${noTempo}></video>`
            : html`<img src=${quadroUrl(p, agulha, 640)} alt="" />`
        }
        <button type="button" class="mt-trecho-play" onClick=${tocar} disabled=${!toca} aria-label=${tocando ? 'Pausar' : 'Tocar o trecho'} title=${toca ? '' : 'Este vídeo não toca aqui; a agulha mostra os quadros parados'}><${Icon} name=${tocando ? 'pause-fill' : 'play'} size=${20} /></button>
      </div>
      <div class="mt-trecho-lado">
        <section class="mt-card"><div class="mt-rot">Trecho</div><div class="mt-trecho-tc">${tc(t.inicio)} → ${tc(t.fim)}</div><p class="mt-sub">${duracao} s na montagem${t.lento ? ' · câmera lenta' : ''}</p></section>
        <section class="mt-card"><div class="mt-rot">Velocidade</div><${Chips} label="Velocidade" valor=${t.lento ? 'lento' : 'normal'} itens=${[
          { value: 'normal', label: 'Normal' },
          { value: 'lento', label: 'Câmera lenta ½×' },
        ]} onEscolher=${(v) => {
          const n = trechoDe({ ...t, lento: v === 'lento' }, duracao, dur)
          setT(n)
          setAgulha(n.inicio)
        }} /></section>
      </div>
    </div>
    <div class="mt-agulha">
      <div class="mt-faixa" ref=${faixa} onPointerDown=${desce} onPointerMove=${move} onPointerUp=${sobe} onPointerCancel=${sobe}>
        <div class="mt-faixa-quadros">${Array.from({ length: N }, (_, i) => html`<img src=${quadroUrl(p, ((i + 0.5) * dur) / N, 160)} alt="" draggable="false" />`)}</div>
        <div class="mt-fora" style=${`left:0;width:${pos(t.inicio)}`}></div>
        <div class="mt-fora" style=${`left:${pos(t.fim)};right:0`}></div>
        <div class="mt-janela" style=${`left:${pos(t.inicio)};width:${pos(t.janela)}`}><i></i><i></i></div>
        <div class="mt-ponteiro" style=${`left:${pos(agulha)}`}></div>
      </div>
      <div class="mt-regua">${Array.from({ length: 7 }, (_, i) => html`<span>${tc((i * dur) / 6).replace(/,\d$/, '')}</span>`)}</div>
      <p class="mt-sub">Arraste a janela para escolher o trecho · toque na faixa para ver um quadro (a agulha laranja)</p>
    </div>
  </div>`
}

export function MontagensScreen() {
  const accounts = useStore((s) => s.accounts)
  const activeAccountId = useStore((s) => s.activeAccountId)
  const [d, setD] = useState(rascunho)
  const [vista, setVista] = useState(() => (rascunho().fotos.length ? 'montar' : 'escolher'))
  const [ativo, setAtivo] = useState(-1)
  const [trocando, setTrocando] = useState(-1)
  const [solto, setSolto] = useState(false)
  const [salvando, setSalvando] = useState(null) // texto do que está salvando
  const [ultimo, setUltimo] = useState(null) // { arquivos, pasta }
  const [trechoDoQuadro, setTrechoDoQuadro] = useState(-1)
  const [infoAtual, setInfoAtual] = useState({}) // caminho → info (para a tela)
  const canvas = useRef(null)
  const arrasto = useRef(null)
  const imgs = useRef([])

  const muda = (o) =>
    setD((x) => {
      const y = { ...x, ...(typeof o === 'function' ? o(x) : o) }
      storage.set('montagens.rascunho', y)
      return y
    })
  const formato = d.personalizado && d.formato === d.personalizado.id ? d.personalizado : formatoPorId(d.formato)
  const tela = telaDe({
    tipo: d.tipo,
    formato: d.tipo === 'carrossel' && !FORMATOS_CARROSSEL.includes(formato.id) ? formatoPorId('4x5') : formato,
    slides: d.slides,
    linhas: d.linhas,
    quadrado: d.quadrado,
  })
  const fx = d.faixas || FAIXAS_PADRAO
  const modelo = useMemo(() => modeloDe(d), [d.modelo, fx.n, fx.aspecto, fx.seguro, fx.antesDepois])
  const faixasDaGaleria = useMemo(() => modeloFaixas(fx), [fx.n, fx.aspecto, fx.seguro, fx.antesDepois])
  const n = modelo.caixas.length
  const quadros = useMemo(() => preencher(d.quadros.slice(0, n), n, d.fotos), [d.quadros, d.fotos, n])
  const videosNoPost = d.tipo === 'post' ? quadros.map((p, i) => (p && ehVideo(p) ? i : -1)).filter((i) => i >= 0) : []
  const escala = Math.min(d.tipo === 'carrossel' ? 980 / tela.w : 560 / tela.w, 520 / tela.h)

  // informações dos takes (duração, tamanho) para a agulha e o enquadre
  useEffect(() => {
    for (const p of d.fotos.filter(ehVideo))
      if (!infoAtual[p])
        infoDe(p).then(
          (i) => setInfoAtual((x) => ({ ...x, [p]: i })),
          () => {},
        )
  }, [d.fotos])

  // ── fotos e takes
  const juntar = (lista) => {
    const novas = lista.filter((p) => FOTO_EXT.test(p) || VIDEO_EXT.test(p))
    if (!novas.length) return toast('error', 'Escolha fotos (JPG, PNG, WebP, TIFF, HEIC) ou vídeos.')
    muda((x) => ({ fotos: [...new Set([...x.fotos, ...novas])].slice(0, MAX_MIDIAS) }))
    if (lista.length > novas.length) toast('info', 'Só fotos e vídeos entraram.')
  }
  const escolherFotos = async () => {
    const lista = bridge?.pickPaths
      ? await bridge.pickPaths({ title: 'Escolha fotos e takes', kind: 'files' }).catch(() => null)
      : await pickLocal({ mode: 'files', title: 'Escolha fotos e takes' })
    if (lista?.length) juntar(lista)
  }
  const tirarFoto = (p) => muda((x) => ({ fotos: x.fotos.filter((f) => f !== p), quadros: x.quadros.map((q) => (q === p ? null : q)) }))
  const soltar = (e) => {
    e.preventDefault()
    setSolto(false)
    const lista = pathsFromDrop(e.dataTransfer)
    if (lista.length) juntar(lista)
  }

  // ── quadros
  const porNoQuadro = (i, p) =>
    muda((x) => {
      const q = preencher(x.quadros.slice(0, n), n, x.fotos)
      const e = [...x.enquadres]
      const j = q.indexOf(p)
      if (j >= 0 && j !== i) {
        q[j] = q[i]
        e[j] = e[i]
      }
      q[i] = p
      e[i] = null
      return { quadros: q, enquadres: e }
    })
  const trocar = (a, b) =>
    muda((x) => {
      const r = trocarQuadros(preencher(x.quadros.slice(0, n), n, x.fotos), x.enquadres, a, b)
      return { quadros: r.fotos, enquadres: r.enquadres }
    })
  const enquadre = (i, e) =>
    muda((x) => {
      const lista = [...x.enquadres]
      lista[i] = e
      return { enquadres: lista }
    })
  const tirar = (i) =>
    muda((x) => {
      const q = preencher(x.quadros.slice(0, n), n, x.fotos)
      q[i] = ''
      return { quadros: q, enquadres: x.enquadres.map((e, j) => (j === i ? null : e)) }
    })

  // ── desenho
  const desenhar = async (cv, esc, { destaque = -1, buracos = null } = {}) => {
    const im = await imagensDe(quadros, d)
    imgs.current = im
    return desenharMontagem(cv, {
      formato: tela,
      modelo,
      imagens: im,
      enquadres: d.enquadres,
      espaco: d.espaco,
      cantos: d.cantos,
      fundo: d.fundo,
      escala: esc,
      destaque,
      buracos,
    })
  }
  useEffect(() => {
    if (vista !== 'montar' || !canvas.current || trechoDoQuadro >= 0) return
    let vivo = true
    const off = document.createElement('canvas')
    const dpr = window.devicePixelRatio || 1
    desenhar(off, escala * dpr, { destaque: ativo }).then(({ caixas }) => {
      if (!vivo || !canvas.current) return
      const c = canvas.current
      c.width = off.width
      c.height = off.height
      const g = c.getContext('2d')
      g.drawImage(off, 0, 0)
      // takes: o selo de vídeo (só na tela)
      quadros.forEach((p, i) => {
        if (!p || !ehVideo(p) || !caixas[i]) return
        const b = caixas[i]
        const r = 11 * dpr
        g.fillStyle = 'rgba(0,0,0,0.6)'
        g.beginPath()
        g.arc(b.x + 10 * dpr + r, b.y + b.h - 10 * dpr - r, r, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#fff'
        g.beginPath()
        const cx0 = b.x + 10 * dpr + r
        const cy0 = b.y + b.h - 10 * dpr - r
        g.moveTo(cx0 - 3.5 * dpr, cy0 - 5 * dpr)
        g.lineTo(cx0 + 5.5 * dpr, cy0)
        g.lineTo(cx0 - 3.5 * dpr, cy0 + 5 * dpr)
        g.fill()
      })
      // carrossel e grade: onde corta e (na grade) a ordem de postar — só na tela
      if (tela.fatias.length > 1) {
        const s = escala * dpr
        g.save()
        g.setLineDash([6 * dpr, 5 * dpr])
        g.strokeStyle = 'rgba(10,132,255,0.95)'
        g.lineWidth = 1.5 * dpr
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
          const r = 13 * dpr
          const x = f.x * s + 10 * dpr + r
          const y = f.y * s + 10 * dpr + r
          g.fillStyle = 'rgba(29,29,31,0.85)'
          g.beginPath()
          g.arc(x, y, r, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = '#fff'
          g.font = `700 ${12 * dpr}px -apple-system, system-ui, sans-serif`
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
  }, [vista, quadros, d.enquadres, d.espaco, d.cantos, d.fundo, d.trechos, d.duracao, tela.w, tela.h, modelo, ativo, trechoDoQuadro])

  // pontos em px da tela (escala 1)
  const ponto = (e) => {
    const r = canvas.current.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * tela.w, y: ((e.clientY - r.top) / r.height) * tela.h }
  }
  const opts = { w: tela.w, h: tela.h, espaco: d.espaco }
  const desce = (e) => {
    const { x, y } = ponto(e)
    const i = quadroNoPonto(modelo, opts, x, y)
    if (i < 0) return setAtivo(-1)
    if (trocando >= 0) {
      if (i !== trocando) trocar(trocando, i)
      setTrocando(-1)
      setAtivo(i)
      return
    }
    setAtivo(i)
    const img = imgs.current[i]
    if (!img) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    arrasto.current = { i, x, y, e: enquadreDe(d.enquadres[i]), caixa: caixasDe(modelo, opts)[i], iw: img.naturalWidth, ih: img.naturalHeight }
  }
  const move = (e) => {
    const a = arrasto.current
    if (!a) return
    const { x, y } = ponto(e)
    enquadre(a.i, moverEnquadre(a.e, x - a.x, y - a.y, a.iw, a.ih, a.caixa))
  }
  const sobe = () => {
    arrasto.current = null
  }
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const roda = (e) => {
      const { x, y } = ponto(e)
      const i = quadroNoPonto(modelo, opts, x, y)
      if (i < 0 || !quadros[i]) return
      e.preventDefault()
      const q = enquadreDe(d.enquadres[i])
      enquadre(i, { ...q, zoom: Math.min(ZOOM_MAX, Math.max(1, q.zoom * Math.exp(-e.deltaY * 0.002))) })
      setAtivo(i)
    }
    c.addEventListener('wheel', roda, { passive: false })
    return () => c.removeEventListener('wheel', roda)
  })
  const soltarNoQuadro = (e) => {
    e.preventDefault()
    const p = e.dataTransfer.getData('text/x-sd-foto')
    if (p) {
      const { x, y } = ponto(e)
      const i = quadroNoPonto(modelo, opts, x, y)
      if (i >= 0) {
        porNoQuadro(i, p)
        setAtivo(i)
      }
      return
    }
    soltar(e)
  }

  // ── salvar
  const pasta = () => storage.get('montagens.pasta', null) || undefined
  const salvarImagem = async (c, nome, formatoId) => {
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.95))
    if (!blob) throw new Error('Não consegui desenhar a montagem.')
    const r = await fetch(withQuery('/api/montagens/salvar', { nome, formato: formatoId, pasta: pasta() }), {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body: blob,
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) throw new Error(j.error || 'Não consegui salvar a montagem.')
    return j
  }
  const salvarFoto = async () => {
    const c = document.createElement('canvas')
    await desenhar(c, 1)
    if (tela.fatias.length === 1) return [await salvarImagem(c, d.nome, tela.id)]
    // carrossel e grade: uma imagem por fatia, numerada na ordem de postar
    const out = []
    for (const f of [...tela.fatias].sort((a, b) => a.n - b.n)) {
      const s = document.createElement('canvas')
      s.width = f.w
      s.height = f.h
      s.getContext('2d').drawImage(c, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h)
      out.push(await salvarImagem(s, d.nome, `${tela.id}_${dois(f.n)}`))
    }
    return out
  }
  const salvarVideo = async () => {
    const caixas = caixasDe(modelo, { w: tela.w, h: tela.h, espaco: d.espaco })
    const c = document.createElement('canvas')
    await desenhar(c, 1, { buracos: new Set(videosNoPost) })
    const png = await new Promise((ok) => c.toBlob(ok, 'image/png'))
    const rb = await fetch('/api/montagens/base', { method: 'POST', headers: { 'content-type': 'image/png' }, body: png })
    const jb = await rb.json().catch(() => ({}))
    if (!rb.ok || !jb.ok) throw new Error(jb.error || 'Não consegui preparar o vídeo.')
    const lista = []
    for (const i of videosNoPost) {
      const p = quadros[i]
      const info = await infoDe(p)
      const q = enquadreDe(d.enquadres[i])
      const b = caixas[i]
      const s = cobrir(info.largura, info.altura, b.w, b.h, q.x, q.y, q.zoom)
      const t = trechoDe(d.trechos[p], d.duracao, info.duracao)
      lista.push({ p, inicio: t.inicio, lento: t.lento, sx: s.sx, sy: s.sy, sw: s.sw, sh: s.sh, x: b.x, y: b.y, w: b.w, h: b.h })
    }
    const som = d.som != null ? videosNoPost.indexOf(quadros.indexOf(d.som)) : -1
    const r = await api.post('/api/montagens/video', {
      base: jb.base,
      w: tela.w,
      h: tela.h,
      duracao: d.duracao,
      fundo: d.fundo,
      quadros: lista,
      som: som >= 0 ? som : null,
      nome: d.nome,
      formato: tela.id,
      pasta: pasta(),
    })
    return [r]
  }
  /** Faixas em lote: as fotos na ordem, em grupos do tamanho do modelo, um story (JPG) para cada grupo. */
  const salvarLote = async () => {
    const por = modelo.faixas.n
    const grupos = []
    for (let i = 0; i < d.fotos.length; i += por) grupos.push(d.fotos.slice(i, i + por))
    try {
      const arquivos = []
      for (const [k, g] of grupos.entries()) {
        setSalvando(`Story ${k + 1} de ${grupos.length}…`)
        // o último grupo pode ser menor: sai com as faixas que tem, sem quadro vazio
        const mod = g.length < por ? modeloFaixas({ ...fx, n: g.length }) : modelo
        const im = await imagensDe(g, d)
        const c = document.createElement('canvas')
        desenharMontagem(c, { formato: tela, modelo: mod, imagens: im, enquadres: [], espaco: d.espaco, cantos: d.cantos, fundo: d.fundo, escala: 1 })
        arquivos.push(await salvarImagem(c, `${d.nome} ${dois(k + 1)}`, tela.id))
      }
      setUltimo({ arquivos: arquivos.map((a) => a.arquivo), pasta: arquivos[0]?.pasta })
      toast('success', `Salvos ${arquivos.length} stories, na ordem.`, { action: { label: revealLabel(), onClick: () => revealPath(arquivos[0].arquivo) } })
    } catch (err) {
      toast('error', err?.message || 'Não consegui salvar os stories.')
    } finally {
      setSalvando(null)
    }
  }
  const salvar = async (e) => {
    if (!quadros.some(Boolean)) return toast('error', 'Ponha pelo menos uma foto num quadro.')
    let como = 'foto'
    if (videosNoPost.length) {
      const rect = e?.currentTarget?.getBoundingClientRect?.()
      como = await openModal('choice', {
        title: 'Salvar como',
        anchorRect: rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null,
        options: [
          { value: 'video', icon: 'film', label: 'Vídeo', hint: `MP4 · ${d.duracao} s · ${tela.w} × ${tela.h}` },
          { value: 'foto', icon: 'photo', label: 'Foto', hint: 'JPG em alta (o quadro do começo dos takes)' },
          { value: 'os-dois', icon: 'stack', label: 'Os dois', hint: 'Vídeo e a capa em JPG' },
        ],
      })
      if (!como) return
    }
    try {
      const arquivos = []
      if (como === 'video' || como === 'os-dois') {
        setSalvando('Gerando o vídeo…')
        arquivos.push(...(await salvarVideo()))
      }
      if (como === 'foto' || como === 'os-dois') {
        setSalvando('Salvando…')
        arquivos.push(...(await salvarFoto()))
      }
      setUltimo({ arquivos: arquivos.map((a) => a.arquivo), pasta: arquivos[0]?.pasta })
      const msg =
        arquivos.length === 1 ? `Salva: ${arquivos[0].nome}` : `Salvos ${arquivos.length} arquivos${d.tipo === 'post' ? '' : ', numerados na ordem de postar'}.`
      toast('success', msg, { action: { label: revealLabel(), onClick: () => revealPath(arquivos[0].arquivo) } })
    } catch (err) {
      toast('error', err.message || 'Não consegui salvar a montagem.')
    } finally {
      setSalvando(null)
    }
  }
  const escolherPasta = async () => {
    const p = await pickFolderPath({ title: 'Onde salvar as montagens', defaultPath: pasta() })
    if (p) {
      storage.set('montagens.pasta', p)
      toast('success', `As montagens vão para ${nomeDe(p)}.`)
    }
  }
  const subir = async () => {
    if (!ultimo?.arquivos?.length) return
    const accountId = activeAccountId || accounts[0]?.id
    if (!accountId) return toast('error', 'Conecte um Drive primeiro.')
    const r = await pickDriveFolder({ accountId, title: 'Subir a montagem para…', destinos: true })
    if (!r) return
    const ok = await attempt(
      api.post('/api/transfers/upload', { accountId, paths: ultimo.arquivos, destFolderId: r.id, driveId: r.driveId || null, destName: r.name }),
    )
    if (ok) toast('success', 'Subindo para o Drive.', { action: { label: 'Ver', href: '#/transferencias' } })
  }

  // ── telas
  const mudaTipo = (tipo) => {
    const o = { tipo }
    if (tipo === 'carrossel' && !FORMATOS_CARROSSEL.includes(d.formato)) o.formato = '4x5'
    if (tipo !== 'post' && d.tipo === 'post') o.modelo = 'uma'
    muda(o)
    setAtivo(-1)
  }
  const escolhaDoTipo = html`<div class="mt-tipo">
    <${Chips} label="Tipo de montagem" valor=${d.tipo} itens=${TIPOS} onEscolher=${mudaTipo} />
    ${
      d.tipo === 'carrossel'
        ? html`<${Chips}
            label="Slides"
            valor=${d.slides}
            itens=${[2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ value: v, label: `${v}` }))}
            onEscolher=${(v) => muda({ slides: v })}
          />`
        : d.tipo === 'grade'
          ? html`<${Chips}
                label="Linhas"
                valor=${d.linhas}
                itens=${[1, 2, 3, 4, 5].map((v) => ({ value: v, label: `3×${v}` }))}
                onEscolher=${(v) => muda({ linhas: v })}
              />
              <${Chips}
                label="Formato do quadradinho"
                valor=${d.quadrado}
                itens=${[
                  { value: '3x4', label: '3:4 (perfil novo)' },
                  { value: '1x1', label: '1:1' },
                ]}
                onEscolher=${(v) => muda({ quadrado: v })}
              />`
          : null
    }
  </div>`
  const formatos =
    d.tipo === 'grade'
      ? null
      : html`<${Formatos}
          lista=${d.tipo === 'carrossel' ? FORMATOS.filter((f) => FORMATOS_CARROSSEL.includes(f.id)) : FORMATOS}
          valor=${formato.id}
          personalizado=${d.personalizado}
          outro=${d.tipo === 'post'}
          onEscolher=${(f) => muda(f.personalizado ? { formato: f.id, personalizado: f } : { formato: f.id })}
        />`

  const bandeja = html`<div
    class=${cx('mt-bandeja', solto && 'is-solto')}
    onDragOver=${(e) => {
      e.preventDefault()
      setSolto(true)
    }}
    onDragLeave=${() => setSolto(false)}
    onDrop=${soltar}
  >
    <div class="mt-bandeja-txt"><b>${d.fotos.length === 1 ? '1 item' : `${d.fotos.length} itens`}</b><span>Fotos e takes · arraste para um quadro</span></div>
    <div class="mt-fotos">
      ${d.fotos.map((p) => {
        const j = quadros.indexOf(p)
        const v = ehVideo(p)
        return html`<span
          key=${p}
          class=${cx('mt-foto', j >= 0 && 'is-usada')}
          draggable="true"
          title=${nomeDe(p)}
          onDragStart=${(e) => e.dataTransfer.setData('text/x-sd-foto', p)}
          onClick=${() => ativo >= 0 && porNoQuadro(ativo, p)}
        >
          <img src=${v ? quadroUrl(p, 1, 160) : fotoUrl(p)} alt="" loading="lazy" decoding="async" />
          ${j >= 0 ? html`<i>${j + 1}</i>` : null} ${v ? html`<b class="mt-foto-play" aria-label="Vídeo"><${Icon} name="play" size=${9} /></b>` : null}
          <button
            type="button"
            class="mt-foto-x"
            aria-label=${`Tirar ${nomeDe(p)}`}
            onClick=${(e) => {
              e.stopPropagation()
              tirarFoto(p)
            }}
          >
            <${Icon} name="x" size=${11} />
          </button>
        </span>`
      })}
      <button type="button" class="mt-foto is-mais" onClick=${escolherFotos} aria-label="Juntar fotos e takes"><${Icon} name="plus" size=${20} /></button>
    </div>
  </div>`

  if (!d.fotos.length)
    return html`<div class="page page-montagens" onDragOver=${(e) => e.preventDefault()} onDrop=${soltar}>
      <header class="page-head"><div><h1 class="page-title">Montagens</h1></div></header>
      <${EmptyState} art=${html`<${Icon} name="grid" size=${34} />`} title="Suas fotos e takes em modelos prontos" actions=${html`<${Button} variant="primary" icon="photo" onClick=${escolherFotos}>Escolher fotos e takes</${Button}>`}>
        Fotos (JPG, PNG, WebP, TIFF, HEIC) e vídeos do computador. Ou solte aqui.
      </${EmptyState}>
    </div>`

  if (vista === 'escolher')
    return html`<div class="page page-montagens">
      <header class="page-head mt-head">
        <div><h1 class="page-title">Montagens</h1></div>
        <${Button} variant="primary" icon="check" onClick=${() => setVista('montar')}>Montar</${Button}>
      </header>
      ${escolhaDoTipo}
      ${formatos}
      ${bandeja}
      <div class="mt-modelos">
        ${[faixasDaGaleria, ...modelosPara(d.fotos.length)].map(
          (m) =>
            html`<${Modelo}
              key=${m.id}
              modelo=${m}
              tela=${tela}
              fotos=${d.fotos}
              d=${d}
              ativo=${m.id === d.modelo}
              onEscolher=${() => {
                muda({ modelo: m.id, quadros: [], enquadres: [] })
                setAtivo(-1)
                setVista('montar')
              }}
            />`,
        )}
      </div>
    </div>`

  if (trechoDoQuadro >= 0 && quadros[trechoDoQuadro] && infoAtual[quadros[trechoDoQuadro]]) {
    const p = quadros[trechoDoQuadro]
    return html`<div class="page page-montagens">
      <${Trecho}
        p=${p}
        info=${infoAtual[p]}
        trecho=${d.trechos[p]}
        duracao=${d.duracao}
        onCancel=${() => setTrechoDoQuadro(-1)}
        onOk=${(t) => {
          muda((x) => ({ trechos: { ...x.trechos, [p]: t } }))
          setTrechoDoQuadro(-1)
        }}
      />
    </div>`
  }

  const q = ativo >= 0 ? enquadreDe(d.enquadres[ativo]) : null
  const ativoVideo = ativo >= 0 && ehVideo(quadros[ativo])
  const tipoNome =
    d.tipo === 'carrossel'
      ? `Carrossel · ${tela.fatias.length} slides ${formatoPorId(tela.id).proporcao}`
      : d.tipo === 'grade'
        ? `${tela.nome} · ${tela.proporcao}`
        : `${formato.nome} ${formato.proporcao}`
  return html`<div class="page page-montagens">
    <header class="page-head mt-head">
      <div><h1 class="page-title"><button type="button" class="mt-nome" title="Trocar o nome" onClick=${async () => {
        const r = await promptDialog({ title: 'Nome da montagem', initial: d.nome, confirmLabel: 'Usar' })
        if (r && r.trim()) muda({ nome: r.trim().slice(0, 80) })
      }}>${d.nome}</button></h1><p class="page-lead">${modelo.nome} · ${tipoNome}${videosNoPost.length ? ` · ${videosNoPost.length === 1 ? '1 take' : `${videosNoPost.length} takes`}` : ''}</p></div>
      <div class="mt-acoes">
        <${Button} icon="grid" onClick=${() => setVista('escolher')}>Modelo e formato</${Button}>
        <${Button} variant="primary" icon="check" loading=${!!salvando} disabled=${!!salvando} onClick=${salvar}>${salvando || 'Salvar'}</${Button}>
      </div>
    </header>
    ${escolhaDoTipo}
    <div class="mt-corpo">
      <div class="mt-palco" onDragOver=${(e) => e.preventDefault()} onDrop=${soltarNoQuadro}>
        <div class="mt-tela" style=${`width:${Math.round(tela.w * escala)}px;height:${Math.round(tela.h * escala)}px`}>
          <canvas ref=${canvas} class=${cx('mt-canvas', trocando >= 0 && 'is-trocando')} style=${`width:${Math.round(tela.w * escala)}px;height:${Math.round(tela.h * escala)}px`} onPointerDown=${desce} onPointerMove=${move} onPointerUp=${sobe} onPointerCancel=${sobe} aria-label="Montagem: toque num quadro para escolher, arraste para enquadrar, role para dar zoom"></canvas>
        </div>
        ${
          ativo >= 0
            ? html`<div class="mt-barra" role="toolbar" aria-label="Quadro escolhido">
                ${
                  quadros[ativo]
                    ? html`<label class="mt-zoom"
                          ><${Icon} name="zoom" size=${15} /><input
                            type="range"
                            min="1"
                            max=${ZOOM_MAX}
                            step="0.01"
                            value=${q.zoom}
                            aria-label="Zoom"
                            onInput=${(e) => enquadre(ativo, { ...q, zoom: Number(e.currentTarget.value) })}
                          /><span>${q.zoom.toFixed(1).replace('.', ',')}×</span></label
                        >
                        <button type="button" onClick=${() => enquadre(ativo, null)} title="Volta ao centro, sem zoom">Centralizar</button>`
                    : html`<span class="mt-barra-txt">Toque numa foto embaixo para pôr aqui</span>`
                }
                ${ativoVideo ? html`<button type="button" class="is-trecho" disabled=${!infoAtual[quadros[ativo]]} onClick=${() => setTrechoDoQuadro(ativo)}><${Icon} name="film" size=${14} />Trecho</button>` : null}
                <button type="button" class=${cx(trocando === ativo && 'is-on')} onClick=${() => setTrocando(trocando === ativo ? -1 : ativo)}>
                  ${trocando === ativo ? 'Toque no outro quadro' : 'Trocar de lugar'}
                </button>
                ${quadros[ativo] ? html`<button type="button" aria-label="Tirar do quadro" onClick=${() => tirar(ativo)}><${Icon} name="x" size=${14} /></button>` : null}
              </div>`
            : html`<p class="mt-dica">
                ${d.tipo === 'grade' ? 'Os números são a ordem de postar · ' : d.tipo === 'carrossel' ? 'A linha azul é onde um slide vira o outro · ' : ''}Toque
                num quadro · arraste para enquadrar · role para dar zoom
              </p>`
        }
      </div>
      <aside class="mt-lado">
        ${
          videosNoPost.length
            ? html`<section class="mt-card">
                <h3>Duração</h3>
                <${Chips}
                  label="Duração"
                  valor=${d.duracao}
                  itens=${DURACOES.map((v) => ({ value: v, label: `${v} s` }))}
                  onEscolher=${(v) => muda({ duracao: v })}
                />
                <h3 class="mt-h3-mais">Som</h3>
                <${Chips}
                  label="Som"
                  valor=${d.som && quadros.includes(d.som) ? d.som : null}
                  itens=${[{ value: null, label: 'Sem som' }, ...videosNoPost.map((i, j) => ({ value: quadros[i], label: `Do take ${j + 1}` }))]}
                  onEscolher=${(v) => muda({ som: v })}
                />
              </section>`
            : null
        }
        ${
          modelo.faixas
            ? html`<section class="mt-card">
                <h3>Faixas</h3>
                <${Chips}
                  label="Quantas faixas"
                  valor=${modelo.faixas.n}
                  itens=${FAIXAS_N.filter((v) => !modelo.faixas.antesDepois || v % 2 === 0).map((v) => ({ value: v, label: modelo.faixas.antesDepois ? `${v / 2} ${v === 2 ? 'par' : 'pares'}` : String(v) }))}
                  onEscolher=${(v) => muda({ faixas: { ...fx, n: v }, quadros: [], enquadres: [] })}
                />
                <label class="mt-linha-switch"><span><b>Antes e depois</b><small>Em pares: o arquivo em cima, a cor embaixo, com rótulo</small></span><${Switch}
                  checked=${modelo.faixas.antesDepois}
                  label="Antes e depois"
                  onChange=${(v) => muda({ faixas: { ...fx, antesDepois: v, n: v && fx.n % 2 ? Math.min(6, fx.n + 1) : fx.n }, quadros: [], enquadres: [] })}
                /></label>
                <h3 class="mt-h3-mais">Formato do frame</h3>
                <${Chips} label="Formato do frame" valor=${modelo.faixas.aspecto} itens=${ASPECTOS_FAIXA.map((a) => ({ value: a.id, label: a.nome }))} onEscolher=${(v) => muda({ faixas: { ...fx, aspecto: v }, enquadres: [] })} />
                ${
                  tela.h / tela.w > 1.6
                    ? html`<label class="mt-linha-switch"><span><b>Zona segura dos Stories</b><small>Nada embaixo do perfil nem do “responder”</small></span><${Switch} checked=${modelo.faixas.seguro} label="Zona segura dos Stories" onChange=${(v) => muda({ faixas: { ...fx, seguro: v } })} /></label>`
                    : null
                }
              </section>`
            : null
        }
        <section class="mt-card"><h3>Espaço entre as fotos</h3><${Slider} value=${d.espaco} min=${0} max=${80} onInput=${(v) => muda({ espaco: v })} label="Espaço entre as fotos" format=${(v) => `${v} px`} /></section>
        <section class="mt-card"><h3>Cantos</h3><${Slider} value=${d.cantos} min=${0} max=${80} onInput=${(v) => muda({ cantos: v })} label="Cantos arredondados" format=${(v) => `${v} px`} /></section>
        <section class="mt-card"><h3>Fundo</h3><div class="mt-cores">
          ${FUNDOS.map((c) => html`<button type="button" class=${cx('mt-cor', d.fundo === c && 'is-on')} style=${`background:${c}`} aria-label=${`Fundo ${c}`} onClick=${() => muda({ fundo: c })}></button>`)}
          <label class=${cx('mt-cor is-livre', !FUNDOS.includes(d.fundo) && 'is-on')} title="Outra cor"><input type="color" value=${d.fundo} aria-label="Outra cor de fundo" onInput=${(e) => muda({ fundo: e.currentTarget.value })} /></label>
        </div></section>
        <section class="mt-card mt-saida">
          <h3>Sai assim</h3>
          <p>${tela.fatias.length > 1 ? `${tela.fatias.length} imagens ${tela.fatias[0].w} × ${tela.fatias[0].h}, numeradas` : videosNoPost.length ? `${tela.w} × ${tela.h} · MP4 ou JPG` : `${tela.w} × ${tela.h} · JPG`}</p>
          ${d.tipo !== 'post' && d.fotos.some(ehVideo) ? html`<p class="mt-sub">Aqui os takes entram como foto (o quadro do começo do trecho).</p>` : null}
          ${
            modelo.faixas && d.tipo === 'post' && d.fotos.length > modelo.faixas.n
              ? html`<${Button} icon="stack" disabled=${!!salvando} onClick=${salvarLote} title="As fotos na ordem, em grupos do tamanho deste modelo: um story para cada grupo">
                  Todas em stories · ${Math.ceil(d.fotos.length / modelo.faixas.n)}
                </${Button}>`
              : null
          }
          <button type="button" class="mt-link" onClick=${escolherPasta}><${Icon} name="folder" size=${14} />${pasta() ? nomeDe(pasta()) : 'Downloads › Montagens'}</button>
          ${
            ultimo
              ? html`<div class="mt-ultimo">
                  <button type="button" class="mt-link" onClick=${() => revealPath(ultimo.arquivos[0])}>
                    <${Icon} name="reveal" size=${14} />${revealLabel()}
                  </button>
                  <button type="button" class="mt-link" onClick=${subir}><${Icon} name="upload" size=${14} />Subir pro Drive</button>
                </div>`
              : null
          }
        </section>
      </aside>
    </div>
    ${bandeja}
  </div>`
}
