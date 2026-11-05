// Estúdio › Montagens (#/montagens): fotos do computador em modelos prontos. Escolhe o formato e o modelo, põe cada
// foto num quadro, enquadra (arrastar e zoom) e salva em alta no computador; se quiser, sobe para o Drive.
// O desenho é do public/lib/montagens.js; o motor só mostra a foto e grava a pronta (src/server/montagens.js).
import { html, useEffect, useMemo, useRef, useState } from '/vendor/preact-htm.js'
import { getState, useStore } from '../lib/store.js'
import { api, attempt, withQuery } from '../lib/api.js'
import { cx, storage } from '../lib/ui.js'
import { toast } from '../lib/toasts.js'
import { bridge, pathsFromDrop, pickFolderPath, revealLabel, revealPath } from '../lib/desktop.js'
import { pickDriveFolder, pickLocal, promptDialog } from '../lib/modals.js'
import { ZOOM_MAX, enquadreDe, moverEnquadre } from '../lib/frames-posts.js'
import { FORMATOS, caixasDe, desenharMontagem, formatoPersonalizado, formatoPorId, modeloPorId, modelosPara, preencher, quadroNoPonto, trocarQuadros } from '../lib/montagens.js'
import { Icon } from './icons.js'
import { Button, EmptyState, Slider } from './common.js'

const FOTO_EXT = /\.(jpe?g|png|webp|tiff?|heic|heif)$/i
const MAX_FOTOS = 60
const FUNDOS = ['#ffffff', '#f7f6f2', '#1d1d1f', '#000000']
const PADRAO = { fotos: [], formato: '4x5', personalizado: null, modelo: 'grande-dois', quadros: [], enquadres: [], espaco: 12, cantos: 0, fundo: '#ffffff', nome: 'Montagem' }

const nomeDe = (p) => String(p || '').split(/[\\/]/).pop()
const fotoUrl = (p) => withQuery('/api/montagens/foto', { p, k: getState().media?.key || '' })

const cache = new Map() // url → Promise<HTMLImageElement>
function carregar(p) {
  const url = fotoUrl(p)
  if (!cache.has(url))
    cache.set(
      url,
      new Promise((ok, falha) => {
        const img = new Image()
        img.decoding = 'async'
        img.onload = () => ok(img)
        img.onerror = () => {
          cache.delete(url)
          falha(new Error('foto'))
        }
        img.src = url
      }),
    )
  return cache.get(url)
}
const carregarTodas = (lista) => Promise.all(lista.map((p) => (p ? carregar(p).catch(() => null) : null)))

function rascunho() {
  const s = storage.get('montagens.rascunho', null)
  return s && typeof s === 'object' ? { ...PADRAO, ...s } : PADRAO
}

/** Um modelo na galeria, já desenhado com as fotos da pessoa. */
function Modelo({ modelo, formato, fotos, ativo, onEscolher }) {
  const cv = useRef(null)
  useEffect(() => {
    let vivo = true
    const quadros = preencher([], modelo.caixas.length, fotos)
    carregarTodas(quadros).then((imgs) => {
      if (!vivo || !cv.current) return
      const escala = 150 / Math.max(formato.w, formato.h)
      desenharMontagem(cv.current, { formato, modelo, imagens: imgs, espaco: 14, fundo: '#ffffff', escala })
    })
    return () => {
      vivo = false
    }
  }, [modelo, formato, fotos])
  return html`<button type="button" class=${cx('mt-modelo', ativo && 'is-on')} onClick=${onEscolher} aria-pressed=${ativo ? 'true' : 'false'}>
    <span class="mt-modelo-tela"><canvas ref=${cv} aria-hidden="true"></canvas></span>
    <b>${modelo.nome}</b>
    <span>${modelo.caixas.length === 1 ? '1 foto' : `${modelo.caixas.length} fotos`}</span>
  </button>`
}

function Formatos({ valor, personalizado, onEscolher }) {
  const lista = personalizado ? [...FORMATOS, personalizado] : FORMATOS
  const outro = async () => {
    const r = await promptDialog({ title: 'Formato personalizado', message: 'Largura × altura em pixels (ex.: 1350 × 1080).', initial: personalizado ? `${personalizado.w} × ${personalizado.h}` : '1080 × 1350', confirmLabel: 'Usar' })
    const m = /(\d{3,4})\s*[x×*]\s*(\d{3,4})/i.exec(r || '')
    if (!m) return r != null && toast('error', 'Escreva largura × altura, como 1350 × 1080.')
    onEscolher(formatoPersonalizado(m[1], m[2]))
  }
  return html`<div class="mt-formatos" role="radiogroup" aria-label="Formato da postagem">
    ${lista.map((f) => {
      const s = 26 / Math.max(f.w, f.h)
      return html`<button type="button" role="radio" aria-checked=${valor === f.id ? 'true' : 'false'} class=${cx('mt-formato', valor === f.id && 'is-on')} title=${`${f.uso} · ${f.w} × ${f.h}`} onClick=${() => onEscolher(f)}>
        <i style=${`width:${Math.round(f.w * s)}px;height:${Math.round(f.h * s)}px`}></i>
        <b>${f.nome}</b><span>${f.proporcao}</span>
      </button>`
    })}
    <button type="button" class="mt-formato is-mais" onClick=${outro} title="Largura × altura em pixels"><${Icon} name="plus" size=${16} /><b>Outro</b><span>px</span></button>
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
  const [salvando, setSalvando] = useState(false)
  const [ultimo, setUltimo] = useState(null) // { arquivo, pasta }
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
  const modelo = modeloPorId(d.modelo)
  const n = modelo.caixas.length
  const quadros = useMemo(() => preencher(d.quadros.slice(0, n), n, d.fotos), [d.quadros, d.fotos, n])
  const escala = Math.min(560 / formato.w, 520 / formato.h)

  // ── fotos
  const juntar = (lista) => {
    const novas = lista.filter((p) => FOTO_EXT.test(p))
    if (!novas.length) return toast('error', 'Escolha fotos JPG, PNG, WebP, TIFF ou HEIC.')
    muda((x) => ({ fotos: [...new Set([...x.fotos, ...novas])].slice(0, MAX_FOTOS) }))
    if (lista.length > novas.length) toast('info', 'Só as fotos entraram (vídeo e outros arquivos ficaram de fora).')
  }
  const escolherFotos = async () => {
    const lista = bridge?.pickPaths ? await bridge.pickPaths({ title: 'Escolha as fotos', kind: 'files' }).catch(() => null) : await pickLocal({ mode: 'files', title: 'Escolha as fotos' })
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
  const enquadre = (i, e) => muda((x) => {
    const lista = [...x.enquadres]
    lista[i] = e
    return { enquadres: lista }
  })
  const tirar = (i) => muda((x) => {
    const q = preencher(x.quadros.slice(0, n), n, x.fotos)
    q[i] = null
    return { quadros: q.map((p) => p ?? ''), enquadres: x.enquadres.map((e, k) => (k === i ? null : e)) }
  })

  // ── desenho da prévia
  const desenhar = async (cv, esc, destaque = -1) => {
    const lista = quadros.map((p) => p || null)
    const im = await carregarTodas(lista)
    imgs.current = im
    return desenharMontagem(cv, { formato, modelo, imagens: im, enquadres: d.enquadres, espaco: d.espaco, cantos: d.cantos, fundo: d.fundo, escala: esc, destaque })
  }
  useEffect(() => {
    if (vista !== 'montar' || !canvas.current) return
    let vivo = true
    const off = document.createElement('canvas')
    desenhar(off, escala * (window.devicePixelRatio || 1), ativo).then(() => {
      if (!vivo || !canvas.current) return
      const c = canvas.current
      c.width = off.width
      c.height = off.height
      c.getContext('2d').drawImage(off, 0, 0)
    })
    return () => {
      vivo = false
    }
  }, [vista, quadros, d.enquadres, d.espaco, d.cantos, d.fundo, formato, modelo, ativo])

  // pontos em px do formato (escala 1)
  const ponto = (e) => {
    const r = canvas.current.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * formato.w, y: ((e.clientY - r.top) / r.height) * formato.h }
  }
  const opts = { w: formato.w, h: formato.h, espaco: d.espaco }
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
  const salvar = async () => {
    if (!quadros.some(Boolean)) return toast('error', 'Ponha pelo menos uma foto num quadro.')
    setSalvando(true)
    try {
      const c = document.createElement('canvas')
      await desenhar(c, 1)
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.95))
      if (!blob) throw new Error('Não consegui desenhar a montagem.')
      const pasta = storage.get('montagens.pasta', null)
      const r = await fetch(withQuery('/api/montagens/salvar', { nome: d.nome, formato: formato.id, pasta: pasta || undefined }), { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || 'Não consegui salvar a montagem.')
      setUltimo({ arquivo: j.arquivo, pasta: j.pasta })
      toast('success', `Salva: ${j.nome}`, { action: { label: revealLabel(), onClick: () => revealPath(j.arquivo) } })
    } catch (err) {
      toast('error', err.message || 'Não consegui salvar a montagem.')
    } finally {
      setSalvando(false)
    }
  }
  const escolherPasta = async () => {
    const p = await pickFolderPath({ title: 'Onde salvar as montagens', defaultPath: storage.get('montagens.pasta', null) || undefined })
    if (p) {
      storage.set('montagens.pasta', p)
      toast('success', `As montagens vão para ${nomeDe(p)}.`)
    }
  }
  const subir = async () => {
    if (!ultimo) return
    const accountId = activeAccountId || accounts[0]?.id
    if (!accountId) return toast('error', 'Conecte um Drive primeiro.')
    const r = await pickDriveFolder({ accountId, title: 'Subir a montagem para…', destinos: true })
    if (!r) return
    const ok = await attempt(api.post('/api/transfers/upload', { accountId, paths: [ultimo.arquivo], destFolderId: r.id, driveId: r.driveId || null, destName: r.name }))
    if (ok) toast('success', 'Subindo para o Drive.', { action: { label: 'Ver', href: '#/transferencias' } })
  }

  // ── telas
  const bandeja = html`<div class=${cx('mt-bandeja', solto && 'is-solto')} onDragOver=${(e) => {
    e.preventDefault()
    setSolto(true)
  }} onDragLeave=${() => setSolto(false)} onDrop=${soltar}>
    <div class="mt-bandeja-txt"><b>${d.fotos.length === 1 ? '1 foto' : `${d.fotos.length} fotos`}</b><span>Arraste para um quadro</span></div>
    <div class="mt-fotos">
      ${d.fotos.map((p) => {
        const k = quadros.indexOf(p)
        return html`<span key=${p} class=${cx('mt-foto', k >= 0 && 'is-usada')} draggable="true" title=${nomeDe(p)} onDragStart=${(e) => e.dataTransfer.setData('text/x-sd-foto', p)} onClick=${() => ativo >= 0 && porNoQuadro(ativo, p)}>
          <img src=${fotoUrl(p)} alt="" loading="lazy" decoding="async" />
          ${k >= 0 ? html`<i>${k + 1}</i>` : null}
          <button type="button" class="mt-foto-x" aria-label=${`Tirar ${nomeDe(p)}`} onClick=${(e) => {
            e.stopPropagation()
            tirarFoto(p)
          }}><${Icon} name="x" size=${11} /></button>
        </span>`
      })}
      <button type="button" class="mt-foto is-mais" onClick=${escolherFotos} aria-label="Juntar fotos"><${Icon} name="plus" size=${20} /></button>
    </div>
  </div>`

  if (!d.fotos.length)
    return html`<div class="page page-montagens" onDragOver=${(e) => e.preventDefault()} onDrop=${soltar}>
      <header class="page-head"><div><h1 class="page-title">Montagens</h1></div></header>
      <${EmptyState} art=${html`<${Icon} name="grid" size=${34} />`} title="Suas fotos em modelos prontos" actions=${html`<${Button} variant="primary" icon="photo" onClick=${escolherFotos}>Escolher fotos</${Button}>`}>
        JPG, PNG, WebP, TIFF ou HEIC do computador. Ou solte aqui.
      </${EmptyState}>
    </div>`

  if (vista === 'escolher')
    return html`<div class="page page-montagens">
      <header class="page-head mt-head">
        <div><h1 class="page-title">Montagens</h1></div>
        <${Button} variant="primary" icon="check" onClick=${() => setVista('montar')}>Montar</${Button}>
      </header>
      <${Formatos} valor=${formato.id} personalizado=${d.personalizado} onEscolher=${(f) => muda(f.personalizado ? { formato: f.id, personalizado: f } : { formato: f.id })} />
      ${bandeja}
      <div class="mt-modelos">
        ${modelosPara(d.fotos.length).map((m) => html`<${Modelo} key=${m.id} modelo=${m} formato=${formato} fotos=${d.fotos} ativo=${m.id === d.modelo} onEscolher=${() => {
          muda({ modelo: m.id, quadros: [], enquadres: [] })
          setAtivo(-1)
          setVista('montar')
        }} />`)}
      </div>
    </div>`

  const q = ativo >= 0 ? enquadreDe(d.enquadres[ativo]) : null
  return html`<div class="page page-montagens">
    <header class="page-head mt-head">
      <div><h1 class="page-title"><button type="button" class="mt-nome" title="Trocar o nome" onClick=${async () => {
        const r = await promptDialog({ title: 'Nome da montagem', initial: d.nome, confirmLabel: 'Usar' })
        if (r && r.trim()) muda({ nome: r.trim().slice(0, 80) })
      }}>${d.nome}</button></h1><p class="page-lead">${modelo.nome} · ${formato.nome} ${formato.proporcao}</p></div>
      <div class="mt-acoes">
        <${Button} icon="grid" onClick=${() => setVista('escolher')}>Modelo e formato</${Button}>
        <${Button} variant="primary" icon="check" loading=${salvando} onClick=${salvar}>Salvar</${Button}>
      </div>
    </header>
    <div class="mt-corpo">
      <div class="mt-palco" onDragOver=${(e) => e.preventDefault()} onDrop=${soltarNoQuadro}>
        <div class="mt-tela" style=${`width:${Math.round(formato.w * escala)}px;height:${Math.round(formato.h * escala)}px`}>
          <canvas ref=${canvas} class=${cx('mt-canvas', trocando >= 0 && 'is-trocando')} style=${`width:${Math.round(formato.w * escala)}px;height:${Math.round(formato.h * escala)}px`} onPointerDown=${desce} onPointerMove=${move} onPointerUp=${sobe} onPointerCancel=${sobe} aria-label="Montagem: toque num quadro para escolher, arraste para enquadrar, role para dar zoom"></canvas>
        </div>
        ${ativo >= 0
          ? html`<div class="mt-barra" role="toolbar" aria-label="Quadro escolhido">
              ${quadros[ativo]
                ? html`<label class="mt-zoom"><${Icon} name="zoom" size=${15} /><input type="range" min="1" max=${ZOOM_MAX} step="0.01" value=${q.zoom} aria-label="Zoom" onInput=${(e) => enquadre(ativo, { ...q, zoom: Number(e.currentTarget.value) })} /><span>${q.zoom.toFixed(1).replace('.', ',')}×</span></label>
                    <button type="button" onClick=${() => enquadre(ativo, null)} title="Volta ao centro, sem zoom">Centralizar</button>`
                : html`<span class="mt-barra-txt">Toque numa foto embaixo para pôr aqui</span>`}
              <button type="button" class=${cx(trocando === ativo && 'is-on')} onClick=${() => setTrocando(trocando === ativo ? -1 : ativo)}>${trocando === ativo ? 'Toque no outro quadro' : 'Trocar de lugar'}</button>
              ${quadros[ativo] ? html`<button type="button" aria-label="Tirar a foto do quadro" onClick=${() => tirar(ativo)}><${Icon} name="x" size=${14} /></button>` : null}
            </div>`
          : html`<p class="mt-dica">Toque num quadro · arraste para enquadrar · role para dar zoom</p>`}
      </div>
      <aside class="mt-lado">
        <section class="mt-card"><h3>Espaço entre as fotos</h3><${Slider} value=${d.espaco} min=${0} max=${80} onInput=${(v) => muda({ espaco: v })} label="Espaço entre as fotos" format=${(v) => `${v} px`} /></section>
        <section class="mt-card"><h3>Cantos</h3><${Slider} value=${d.cantos} min=${0} max=${80} onInput=${(v) => muda({ cantos: v })} label="Cantos arredondados" format=${(v) => `${v} px`} /></section>
        <section class="mt-card"><h3>Fundo</h3><div class="mt-cores">
          ${FUNDOS.map((c) => html`<button type="button" class=${cx('mt-cor', d.fundo === c && 'is-on')} style=${`background:${c}`} aria-label=${`Fundo ${c}`} onClick=${() => muda({ fundo: c })}></button>`)}
          <label class=${cx('mt-cor is-livre', !FUNDOS.includes(d.fundo) && 'is-on')} title="Outra cor"><input type="color" value=${d.fundo} aria-label="Outra cor de fundo" onInput=${(e) => muda({ fundo: e.currentTarget.value })} /></label>
        </div></section>
        <section class="mt-card mt-saida">
          <h3>Sai assim</h3>
          <p>${formato.w} × ${formato.h} · JPG</p>
          <button type="button" class="mt-link" onClick=${escolherPasta}><${Icon} name="folder" size=${14} />${storage.get('montagens.pasta', null) ? nomeDe(storage.get('montagens.pasta', null)) : 'Downloads › Montagens'}</button>
          ${ultimo
            ? html`<div class="mt-ultimo"><button type="button" class="mt-link" onClick=${() => revealPath(ultimo.arquivo)}><${Icon} name="reveal" size=${14} />${revealLabel()}</button>
                <button type="button" class="mt-link" onClick=${subir}><${Icon} name="upload" size=${14} />Subir pro Drive</button></div>`
            : null}
        </section>
      </aside>
    </div>
    ${bandeja}
  </div>`
}
