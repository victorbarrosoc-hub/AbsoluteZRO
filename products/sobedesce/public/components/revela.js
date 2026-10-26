// "Converter com a Revela" (botão direito num vídeo da tela Drive): escolhe o destino num cartão e pronto. O
// computador converte (src/media/revela.js) e o arquivo novo sobe na mesma pasta do original. Pouco texto: o cartão
// diz o formato, o número diz o andamento.
import { html, useEffect, useState } from '/vendor/preact-htm.js'
import { api, attempt, enc } from '../lib/api.js'
import { setRevelaJob, subscribe, useStore } from '../lib/store.js'
import { openModal, registerModal } from '../lib/modals.js'
import { openExternal } from '../lib/desktop.js'
import { toast } from '../lib/toasts.js'
import { bytes } from '../lib/format.js'
import { Icon } from './icons.js'
import { Button, Spinner } from './common.js'
import { Modal } from './modal.js'
import { Barra, Opcoes } from './kit.js'
import { invalidateAccount } from './drive-data.js'
import { driveLinkFor } from './link-share.js'

const CURTO = { reels: 'Reels' }
const FASE = { esperando: 'Na fila', baixando: 'Baixando', analisando: 'Lendo', convertendo: 'Convertendo', enviando: 'Enviando', conferindo: 'Conferindo' }

let destinosP = null
/** Destinos e se este computador converte (GET /api/revela), uma vez por sessão. */
function useRevela() {
  const [info, setInfo] = useState(null)
  useEffect(() => {
    let vivo = true
    destinosP ??= api.get('/api/revela').catch((err) => {
      destinosP = null
      return { erro: err?.message || 'Não consegui falar com o conversor.' }
    })
    destinosP.then((r) => vivo && setInfo(r))
    return () => {
      vivo = false
    }
  }, [])
  return info
}

// Terminou com a janela fechada: um aviso curto, e a pasta recarrega para mostrar o arquivo novo.
const vistos = new Map()
let janelas = 0
export function avisarRevela(job) {
  if (!job?.jobId || vistos.get(job.jobId) === job.status) return
  const antes = vistos.get(job.jobId)
  vistos.set(job.jobId, job.status)
  if (antes !== 'running' || job.status === 'running') return
  if (job.status === 'done') invalidateAccount(job.accountId)
  if (janelas) return
  if (job.status === 'done') toast('success', `Pronto: ${job.resultado?.nome || 'arquivo convertido'}`)
  else if (job.status === 'error') toast('error', `Revela: ${job.error || 'não deu para converter.'}`)
}

subscribe((state) => {
  for (const job of Object.values(state.revela || {})) avisarRevela(job)
})

function Andamento({ job }) {
  const p = job.frac
  return html`<div class="rv-andamento" aria-live="polite">
    <div class="rv-fase">
      ${job.fase === 'esperando' ? html`<${Icon} name="clock" size=${16} />` : html`<${Spinner} size=${16} />`}
      <b>${FASE[job.fase] || 'Começando'}</b>
      ${p != null ? html`<span class="rv-pct num">${Math.round(p * 100)}%</span>` : null}
    </div>
    <${Barra} p=${p} vivo label="Andamento" />
  </div>`
}

function Pronto({ job }) {
  const r = job.resultado || {}
  return html`<div class="rv-pronto">
    <span class="rv-ok"><${Icon} name="check" size=${22} strokeWidth=${2.4} /></span>
    <b class="rv-nome" title=${r.nome}>${r.nome}</b>
    <span class="rv-fichas">
      <span>H.264</span><span>BT.709</span>${r.size ? html`<span>${bytes(r.size)}</span>` : null}${r.conferido ? html`<span title="MD5 conferido com o Drive"><${Icon} name="shield" size=${12} /> conferido</span>` : null}
    </span>
    ${r.avisos?.length ? html`<ul class="rv-avisos">${r.avisos.map((a) => html`<li><${Icon} name="warning" size=${13} /> ${a}</li>`)}</ul>` : null}
  </div>`
}

/** @param {{ accountId: string, arquivo: { id, name, size }, onClose: Function }} props */
export function RevelaDialog({ accountId, arquivo, onClose }) {
  const info = useRevela()
  const [destino, setDestino] = useState('youtube')
  const [jobId, setJobId] = useState(null)
  const [comecando, setComecando] = useState(false)
  const job = useStore((s) => (jobId ? s.revela?.[jobId] : null))

  useEffect(() => {
    janelas++
    return () => {
      janelas--
    }
  }, [])
  // Sem SSE (reconectando), pergunta a cada 2,5 s.
  useEffect(() => {
    if (job?.status !== 'running') return undefined
    const t = setInterval(async () => {
      try {
        setRevelaJob(await api.get(`/api/revela/converter/${enc(job.jobId)}`))
      } catch {}
    }, 2500)
    return () => clearInterval(t)
  }, [job?.status, job?.jobId])

  const converter = async () => {
    if (comecando) return
    setComecando(true)
    const r = await attempt(api.post('/api/revela/converter', { accountId, id: arquivo.id, destino }))
    setComecando(false)
    if (!r?.jobId) return
    setJobId(r.jobId)
    setRevelaJob({ jobId: r.jobId, accountId, arquivo, destino, status: 'running', fase: 'esperando', frac: null })
  }
  const parar = () => job && attempt(api.del(`/api/revela/converter/${enc(job.jobId)}`))

  const destinos = info?.destinos || []
  const semMotor = info && !info.erro && !info.pronto
  let corpo
  let rodape
  if (job?.status === 'running') {
    corpo = html`<${Andamento} job=${job} />`
    rodape = html`<span class="rt-foot-hint sub">Pode fechar: continua.</span>
      <${Button} icon="x" onClick=${parar}>Parar</${Button}>
      <${Button} variant="primary" onClick=${() => onClose()}>Fechar</${Button}>`
  } else if (job?.status === 'done') {
    corpo = html`<${Pronto} job=${job} />`
    rodape = html`<${Button} icon="external" onClick=${() => openExternal(driveLinkFor(job.resultado.fileId, false))}>Abrir no Drive</${Button}>
      <${Button} variant="primary" onClick=${() => onClose()} data-autofocus>Concluir</${Button}>`
  } else if (job) {
    corpo = html`<div class="rt-warn" role="alert"><${Icon} name="warning" size=${18} /><div><b>${job.status === 'canceled' ? 'Parado.' : job.error || 'Não deu para converter.'}</b></div></div>`
    rodape = html`<${Button} icon="retry" onClick=${() => setJobId(null)}>De novo</${Button}>
      <${Button} variant="primary" onClick=${() => onClose()}>Fechar</${Button}>`
  } else if (!info) {
    corpo = html`<div class="rt-phase"><${Spinner} size=${16} /></div>`
    rodape = null
  } else if (info.erro || semMotor) {
    corpo = html`<div class="rt-warn" role="alert"><${Icon} name="warning" size=${18} /><div><b>${info.erro || 'Este computador não tem o ffmpeg para converter.'}</b>${semMotor && info.motor ? html`<span>${info.motor}</span>` : null}</div></div>`
    rodape = html`<${Button} variant="primary" onClick=${() => onClose()}>Fechar</${Button}>`
  } else {
    corpo = html`<${Opcoes}
      label="Destino"
      valor=${destino}
      colunas=${4}
      onEscolher=${setDestino}
      itens=${destinos.map((d) => ({ value: d.id, icone: d.vertical ? 'phone' : 'monitor', titulo: CURTO[d.id] || d.nome, sub: d.vertical ? '9:16' : '16:9' }))}
    />`
    rodape = html`<${Button} onClick=${() => onClose()}>Cancelar</${Button}>
      <${Button} variant="primary" icon="compare" onClick=${converter} loading=${comecando}>Converter</${Button}>`
  }

  return html`<${Modal}
    size="md"
    class="dialog rv-dialog"
    icon=${html`<img class="rv-marca" src="/revela-icone.svg" alt="" width="28" height="28" />`}
    title="Converter com a Revela"
    subtitle=${arquivo.name}
    onClose=${() => onClose()}
    footer=${rodape}
  >
    ${corpo}
  </${Modal}>`
}

registerModal('revela', RevelaDialog)

/** "Converter com a Revela" de um vídeo (menu da tela Drive). */
export function openRevela({ accountId, item }) {
  return openModal('revela', { accountId, arquivo: { id: item.id, name: item.name, size: item.size } })
}
