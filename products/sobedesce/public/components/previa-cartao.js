// Prévia do cartão (Cartões, 09/11/2026): as fotos e os vídeos do cartão espetado, antes de copiar. Miniaturas pelas
// rotas da montagem (foto, prévia embutida do RAW e um quadro do vídeo) com a chave da mídia; tocar abre grande (o
// vídeo toca quando o navegador sabe tocar). Só lê o cartão. POST /api/backup/previa (src/backup/servico.js › previa).
import { html, useEffect, useState } from '/vendor/preact-htm.js'
import { api, withQuery } from '../lib/api.js'
import { getState } from '../lib/store.js'
import { bytes, count, plural } from '../lib/format.js'
import { openModal, registerModal } from '../lib/modals.js'
import { cx } from '../lib/ui.js'
import { Icon } from './icons.js'
import { Button, Spinner } from './common.js'
import { Modal } from './modal.js'

const k = () => getState().media?.key || ''
const fotoUrl = (p) => withQuery('/api/montagens/foto', { p, k: k() })
const quadroUrl = (p) => withQuery('/api/montagens/quadro', { p, t: '1.00', l: 480, k: k() })
const videoUrl = (p) => withQuery('/api/montagens/video', { p, k: k() })
const nome = (rel) => rel.split('/').pop()
const ext = (rel) => (/\.([a-z0-9]{1,5})$/i.exec(rel)?.[1] || '').toUpperCase()

function Miniatura({ it, onAbrir }) {
  const [falhou, setFalhou] = useState(false)
  const src = it.tipo === 'videos' ? quadroUrl(it.caminho) : fotoUrl(it.caminho)
  return html`<button type="button" class="pcv-item" onClick=${() => onAbrir(it)} title=${`${it.rel} · ${bytes(it.tamanho)}`}>
    <span class="pcv-thumb">
      ${falhou
        ? html`<span class="pcv-sem"><${Icon} name=${it.tipo === 'videos' ? 'film' : 'photo'} size=${22} /><b>${ext(it.rel)}</b></span>`
        : html`<img src=${src} alt="" loading="lazy" decoding="async" onError=${() => setFalhou(true)} />`}
      ${it.tipo === 'videos' ? html`<span class="pcv-play"><${Icon} name="play" size=${12} /></span>` : null}
    </span>
    <span class="pcv-nome">${nome(it.rel)}</span>
  </button>`
}

function Grande({ it, onFechar }) {
  const [erro, setErro] = useState(false)
  return html`<div class="pcv-grande">
    ${it.tipo === 'videos' && !erro
      ? html`<video src=${videoUrl(it.caminho)} controls autoplay playsinline poster=${quadroUrl(it.caminho)} onError=${() => setErro(true)}></video>`
      : html`<img src=${it.tipo === 'videos' ? quadroUrl(it.caminho) : fotoUrl(it.caminho)} alt=${nome(it.rel)} />`}
    <div class="pcv-grande-pe">
      <span class="mono-path" title=${it.rel}>${it.rel}</span>
      <span class="sub">${bytes(it.tamanho)}${erro ? ' · este vídeo não toca aqui, só o quadro' : ''}</span>
      <${Button} size="sm" icon="arrow-left" onClick=${onFechar}>Voltar</${Button}>
    </div>
  </div>`
}

function PreviaCartao({ caminho, nome: nomeCartao, onClose }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const [aberto, setAberto] = useState(null)
  const [filtro, setFiltro] = useState('tudo')
  useEffect(() => {
    let vivo = true
    api
      .post('/api/backup/previa', { caminho })
      .then((r) => vivo && setDados(r))
      .catch((err) => vivo && setErro(err?.message || 'Não consegui ler o cartão.'))
    return () => (vivo = false)
  }, [])
  const itens = (dados?.itens || []).filter((it) => filtro === 'tudo' || it.tipo === filtro)
  const sub = dados ? [plural(dados.videos, 'vídeo', 'vídeos'), plural(dados.fotos, 'foto', 'fotos')].join(' · ') : 'Lendo o cartão…'
  return html`<${Modal} size="xl" class="pcv-modal" title=${nomeCartao || 'Cartão'} subtitle=${sub} onClose=${onClose}>
    ${erro ? html`<p class="lk-erro" role="alert"><${Icon} name="warning" size=${15} />${erro}</p>` : null}
    ${!dados && !erro ? html`<p class="sub pcv-carregando"><${Spinner} size=${14} /> Lendo o cartão…</p>` : null}
    ${aberto
      ? html`<${Grande} it=${aberto} onFechar=${() => setAberto(null)} />`
      : dados
        ? html`<div class="pcv-barra" role="radiogroup" aria-label="Mostrar">
              ${[
                ['tudo', 'Tudo'],
                ['videos', 'Vídeos'],
                ['fotos', 'Fotos'],
              ].map(([v, l]) => html`<button type="button" role="radio" aria-checked=${filtro === v ? 'true' : 'false'} class=${cx('pcv-chip', filtro === v && 'is-on')} onClick=${() => setFiltro(v)}>${l}</button>`)}
              ${dados.total > dados.itens.length ? html`<span class="sub">Os ${count(dados.itens.length)} mais novos de ${count(dados.total)}</span>` : null}
            </div>
            ${itens.length ? html`<div class="pcv-grade">${itens.map((it) => html`<${Miniatura} key=${it.rel} it=${it} onAbrir=${setAberto} />`)}</div>` : html`<p class="sub">Nada para mostrar aqui.</p>`}`
        : null}
  </${Modal}>`
}
registerModal('previa-cartao', PreviaCartao)

export const abrirPreviaCartao = ({ caminho, nome }) => openModal('previa-cartao', { caminho, nome })
