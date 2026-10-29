// Folha "Converter com o Relay" (menu de um vídeo ou áudio da aba Drive): escolhe o grupo e o destino num cartão e o
// CELULAR converte (lib/relay.js, o motor do Relay); o arquivo novo sobe na mesma pasta pela fila de envios. Um botão
// só: converte o aparelho que tocou.
// Pouco texto: o cartão diz o formato, o número diz o andamento. A tela fica acesa enquanto converte.
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js'
import { DESTINOS_RELAY, LIMITE_MEMORIA, converterNoAparelho, planejar, tamanhoLegivel } from '../lib/relay.js'
import { getToken, invalidate } from '../lib/auth.js'
import { ENDPOINTS } from '../lib/config.js'
import { engine } from '../lib/uploader.js'
import { keepAwake } from '../lib/wakelock.js'
import { closeSheet } from '../lib/state.js'
import { Icon } from './icons.js'
import { Button, SheetHead, cx } from './ui.js'

const GRUPOS = ['Redes', 'Trabalho', 'Tamanho', 'Áudio']
const AUDIO = /\.(wav|aiff?|flac|mp3|m4a|aac|ogg|opus|caf)$/i
const FASE = { carregando: 'Preparando', lendo: 'Lendo do Drive', convertendo: 'Convertendo', enviando: 'Enviando' }
const forma = (d) => (!d.video ? 'audio' : d.video.quadro && d.video.quadro.altura > d.video.quadro.largura ? 'vertical' : 'horizontal')
const ICONE = { vertical: 'phone', horizontal: 'monitor', audio: 'music' }

/** Estimativa antes de começar, pelo que o Drive já sabe do vídeo (sem abrir o arquivo). */
function estimativa(f, d) {
  const m = f.videoMediaMetadata
  if (!m?.width || !m?.height) return null
  try {
    return planejar({ largura: m.width, altura: m.height, fps: 30, duracao: Number(m.durationMillis || 0) / 1000, temVideo: true, temAudio: true, canais: 2, taxa: 48000, cor: null }, d).tamanhoEstimado
  } catch {
    return null
  }
}

export function RelaySheet({ f, pasta }) {
  const soAudio = AUDIO.test(f.name)
  const destinos = DESTINOS_RELAY.filter((d) => !soAudio || !d.video)
  const [grupo, setGrupo] = useState(soAudio ? 'Áudio' : 'Redes')
  const [destino, setDestino] = useState(soAudio ? 'mp3' : 'youtube-1080')
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

  const destinoAtual = destinos.find((d) => d.id === destino) ?? destinos[0]
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
      <span class="rv-fichas"><span>${res.codecs}</span>${res.file?.type?.startsWith('video') ? html`<span>BT.709</span>` : null}<span>${tamanhoLegivel(res.size)}</span></span>
      ${res.avisos?.length ? html`<ul class="rv-avisos">${res.avisos.map((a) => html`<li><${Icon} name="warning" size=${13} /> ${a}</li>`)}</ul>` : null}
    </div>`
  } else if (rodando) {
    corpo = html`<div class="rv-andamento" role="status" aria-live="polite">
      <div class="rv-fase"><span class="spinner"></span><b>${FASE[fase]}</b>${frac != null ? html`<span class="rv-pct">${Math.round(frac * 100)}%</span>` : null}</div>
      <div class=${cx('rv-barra', frac == null && 'is-vivo')}><i style=${`width:${frac == null ? 100 : Math.round(frac * 100)}%`}></i></div>
      <p class="rv-dica"><${Icon} name="phone" size=${15} /> Deixe esta tela aberta</p>
    </div>`
  } else {
    const grupos = GRUPOS.filter((g) => destinos.some((d) => d.grupo === g))
    corpo = html`${grupos.length > 1
        ? html`<div class="rv-grupos" role="tablist" aria-label="Grupo">
            ${grupos.map(
              (g) => html`<button type="button" role="tab" aria-selected=${grupo === g ? 'true' : 'false'} class=${cx('rv-grupo', grupo === g && 'is-on')} onClick=${() => {
                setGrupo(g)
                setDestino(destinos.find((d) => d.grupo === g)?.id)
              }}>${g}</button>`,
            )}
          </div>`
        : null}
      <div class="rv-destinos" role="radiogroup" aria-label="Destino">
        ${destinos
          .filter((d) => d.grupo === grupo)
          .map(
            (d) => html`<button type="button" role="radio" aria-checked=${destino === d.id ? 'true' : 'false'} class=${cx('rv-destino', destino === d.id && 'is-on')} onClick=${() => setDestino(d.id)}>
              <${Icon} name=${ICONE[forma(d)]} size=${24} />
              <b>${d.nome}</b>
              <small>${d.resumo}</small>
            </button>`,
          )}
      </div>
      ${fase === 'erro' ? html`<p class="rv-estado is-erro" role="alert"><${Icon} name="warning" size=${18} /><span>${erro}</span></p>` : null}
      ${grande ? html`<p class="rv-estado is-aviso"><${Icon} name="warning" size=${18} /><span>Grande para o celular: pode faltar memória.</span></p>` : null}`
  }

  return html`<${SheetHead}
      title="Converter com o Relay"
      left=${rodando && fase !== 'enviando' ? html`<button type="button" class="link-btn" onClick=${() => ac.current?.abort()}>Parar</button>` : null}
      right=${html`<button type="button" class="link-btn is-strong" onClick=${closeSheet}>${fase === 'pronto' ? 'OK' : 'Fechar'}</button>`}
    />
    <div class="sheet-body rvsheet">
      <div class="rv-topo">
        <img src="./icons/relay.svg" alt="" width="40" height="40" />
        <b class="rv-arquivo" title=${f.name}>${f.name}</b>
      </div>
      ${corpo}
      ${!rodando && fase !== 'pronto'
        ? html`<${Button} variant="down" size="lg" class="btn-block" icon="compare" onClick=${converter}>${fase === 'erro' ? 'De novo' : 'Converter'}</${Button}>`
        : null}
      ${fase === 'enviando' ? html`<p class="rv-dica">Pode fechar: o envio continua na aba Enviar.</p>` : null}
    </div>`
}
RelaySheet.label = 'Converter com o Relay'
