// Folha "Converter com a Revela" (menu de um vídeo da aba Drive): escolhe o destino num cartão e o CELULAR converte
// (lib/revela.js); o arquivo novo sobe na mesma pasta pela fila de envios. Um botão só: converte o aparelho que tocou.
// Pouco texto: o cartão diz o formato, o número diz o andamento. A tela fica acesa enquanto converte.
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js'
import { DESTINOS_REVELA, LIMITE_MEMORIA, converterNoAparelho } from '../lib/revela.js'
import { planejar, tamanhoLegivel } from '../lib/revela/conversao/plano.js'
import { getToken, invalidate } from '../lib/auth.js'
import { ENDPOINTS } from '../lib/config.js'
import { engine } from '../lib/uploader.js'
import { keepAwake } from '../lib/wakelock.js'
import { closeSheet } from '../lib/state.js'
import { Icon } from './icons.js'
import { Button, SheetHead, cx } from './ui.js'

const CURTO = { reels: 'Reels' }
const FASE = { carregando: 'Preparando', lendo: 'Lendo do Drive', convertendo: 'Convertendo', enviando: 'Enviando' }
const vertical = (d) => Boolean(d.video.altura && d.video.altura > d.video.largura)

/** Estimativa antes de começar, pelo que o Drive já sabe do vídeo (sem abrir o arquivo). */
function estimativa(f, d) {
  const m = f.videoMediaMetadata
  if (!m?.width || !m?.height) return null
  return planejar({ largura: m.width, altura: m.height, fps: 30, duracao: Number(m.durationMillis || 0) / 1000, temAudio: true, cor: null }, d).tamanhoEstimado
}

export function RevelaSheet({ f, pasta }) {
  const [destino, setDestino] = useState('youtube')
  const [fase, setFase] = useState(null) // null | carregando | lendo | convertendo | enviando | pronto | erro
  const [frac, setFrac] = useState(null)
  const [res, setRes] = useState(null) // { nome, codecs, avisos, size }
  const [erro, setErro] = useState(null)
  const ac = useRef(null)
  const vivo = useRef(true)
  useEffect(
    () => () => {
      vivo.current = false
      ac.current?.abort()
      keepAwake(false)
    },
    [],
  )

  const destinoAtual = DESTINOS_REVELA.find((d) => d.id === destino)
  const grande = (estimativa(f, destinoAtual) || 0) > LIMITE_MEMORIA

  const converter = async () => {
    ac.current = new AbortController()
    setErro(null)
    setFrac(null)
    setFase('carregando')
    keepAwake(true)
    try {
      const r = await converterNoAparelho({
        url: `${ENDPOINTS.api}/files/${encodeURIComponent(f.id)}?alt=media&supportsAllDrives=true`,
        nome: f.name,
        destino,
        token: getToken,
        invalidar: invalidate,
        signal: ac.current.signal,
        onFase: (fs, fr) => {
          if (!vivo.current) return
          setFase(fs)
          setFrac(fr ?? null)
        },
      })
      if (!vivo.current) return
      // Sobe pela fila de envios de sempre (retomável), na pasta do vídeo.
      const dest = pasta || { id: f.parents?.[0], name: 'a pasta do vídeo', driveId: f.driveId || null }
      engine.addFiles([r.file], dest)
      setRes({ nome: r.file.name, codecs: r.codecs, avisos: r.avisos, size: r.file.size, file: r.file })
      setFase('enviando')
      setFrac(0)
    } catch (err) {
      if (!vivo.current) return
      if (err?.name === 'AbortError') {
        setFase(null)
        return
      }
      setErro(err?.message || 'Não deu para converter neste aparelho.')
      setFase('erro')
    } finally {
      keepAwake(false)
    }
  }

  // Envio: acompanha o item da fila até chegar no Drive.
  useEffect(() => {
    if (fase !== 'enviando' || !res?.file) return undefined
    const olhar = () => {
      const it = engine.items.find((x) => x.file === res.file)
      if (!it) return
      if (it.status === 'done') setFase('pronto')
      else if (it.status === 'failed') {
        setErro(it.error?.message || it.error || 'O envio parou. Veja na aba Enviar.')
        setFase('erro')
      } else setFrac(it.size ? it.offset / it.size : null)
    }
    olhar()
    return engine.subscribe(olhar)
  }, [fase, res?.file])

  const rodando = fase && fase !== 'pronto' && fase !== 'erro'
  let corpo
  if (fase === 'pronto') {
    corpo = html`<div class="rv-fim">
      <span class="rv-ok"><${Icon} name="check" size=${26} /></span>
      <b class="rv-arquivo" title=${res.nome}>${res.nome}</b>
      <span class="rv-fichas"><span>${res.codecs}</span><span>BT.709</span><span>${tamanhoLegivel(res.size)}</span></span>
      ${res.avisos?.length ? html`<ul class="rv-avisos">${res.avisos.map((a) => html`<li><${Icon} name="warning" size=${13} /> ${a}</li>`)}</ul>` : null}
    </div>`
  } else if (rodando) {
    corpo = html`<div class="rv-andamento" role="status" aria-live="polite">
      <div class="rv-fase"><span class="spinner"></span><b>${FASE[fase]}</b>${frac != null ? html`<span class="rv-pct">${Math.round(frac * 100)}%</span>` : null}</div>
      <div class=${cx('rv-barra', frac == null && 'is-vivo')}><i style=${`width:${frac == null ? 100 : Math.round(frac * 100)}%`}></i></div>
      <p class="rv-dica"><${Icon} name="phone" size=${15} /> Deixe esta tela aberta</p>
    </div>`
  } else {
    corpo = html`<div class="rv-destinos" role="radiogroup" aria-label="Destino">
        ${DESTINOS_REVELA.map(
          (d) => html`<button type="button" role="radio" aria-checked=${destino === d.id ? 'true' : 'false'} class=${cx('rv-destino', destino === d.id && 'is-on')} onClick=${() => setDestino(d.id)}>
            <${Icon} name=${vertical(d) ? 'phone' : 'monitor'} size=${24} />
            <b>${CURTO[d.id] || d.nome}</b>
            <small>${vertical(d) ? '9:16' : '16:9'}</small>
          </button>`,
        )}
      </div>
      ${fase === 'erro' ? html`<p class="rv-estado is-erro" role="alert"><${Icon} name="warning" size=${18} /><span>${erro}</span></p>` : null}
      ${grande ? html`<p class="rv-estado is-aviso"><${Icon} name="warning" size=${18} /><span>Grande para o celular: pode faltar memória.</span></p>` : null}`
  }

  return html`<${SheetHead}
      title="Converter com a Revela"
      left=${rodando && fase !== 'enviando' ? html`<button type="button" class="link-btn" onClick=${() => ac.current?.abort()}>Parar</button>` : null}
      right=${html`<button type="button" class="link-btn is-strong" onClick=${closeSheet}>${fase === 'pronto' ? 'OK' : 'Fechar'}</button>`}
    />
    <div class="sheet-body rvsheet">
      <div class="rv-topo">
        <img src="./icons/revela.svg" alt="" width="40" height="40" />
        <b class="rv-arquivo" title=${f.name}>${f.name}</b>
      </div>
      ${corpo}
      ${!rodando && fase !== 'pronto'
        ? html`<${Button} variant="down" size="lg" class="btn-block" icon="compare" onClick=${converter}>${fase === 'erro' ? 'De novo' : 'Converter'}</${Button}>`
        : null}
      ${fase === 'enviando' ? html`<p class="rv-dica">Pode fechar: o envio continua na aba Enviar.</p>` : null}
    </div>`
}
RevelaSheet.label = 'Converter com a Revela'
