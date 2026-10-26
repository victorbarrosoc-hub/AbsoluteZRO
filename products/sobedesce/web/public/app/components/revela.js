// Folha "Converter com a Revela" (menu de um vídeo da aba Drive): o celular escolhe o destino num cartão e pede; o
// app SOBEDESCE do computador converte (src/media/revela.js) e o arquivo novo aparece ao lado do vídeo no Drive.
// Pouco texto: o cartão diz o formato, a linha diz como está. Acompanha a cada 5 s com a folha aberta.
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js'
import { DESTINOS_REVELA, pedirRevela, revelaPedidos, tentarDeNovo } from '../lib/proxies.js'
import { closeSheet, getState, toast } from '../lib/state.js'
import { Icon } from './icons.js'
import { Button, SheetHead, cx } from './ui.js'

const ACOMPANHAR_MS = 5000
const ESTADO = { pendente: 'Na fila do computador', gerando: 'Convertendo…', pronto: 'Pronto no Drive', erro: 'Não deu' }

export function RevelaSheet({ f }) {
  const [destino, setDestino] = useState('youtube')
  const [pedidos, setPedidos] = useState([])
  const [pedindo, setPedindo] = useState(false)
  const vivo = useRef(true)
  useEffect(() => () => (vivo.current = false), [])

  // Os pedidos deste vídeo (um por destino, o mais novo), atualizados a cada 5 s com a tela à vista.
  useEffect(() => {
    const ac = new AbortController()
    let t = 0
    const tick = async () => {
      if (document.visibilityState !== 'hidden') {
        try {
          const lista = await revelaPedidos(f.id, ac.signal)
          if (!ac.signal.aborted) setPedidos(lista)
        } catch {
          // segue tentando
        }
      }
      if (!ac.signal.aborted) t = setTimeout(tick, ACOMPANHAR_MS)
    }
    tick()
    return () => {
      ac.abort()
      clearTimeout(t)
    }
  }, [f.id])

  const porDestino = new Map()
  for (const p of pedidos) if (!porDestino.has(p.ajustes?.destino)) porDestino.set(p.ajustes?.destino, p)

  const pedir = async () => {
    setPedindo(true)
    try {
      const r = await pedirRevela(f, destino)
      if (!vivo.current) return
      if (r.pedido) setPedidos((l) => [r.pedido, ...l.filter((p) => p.id !== r.pedido.id)])
    } catch (err) {
      toast(err?.message || 'Não deu para pedir agora.', { tone: 'error', ms: 4200 })
    } finally {
      if (vivo.current) setPedindo(false)
    }
  }
  const deNovo = async (p) => {
    try {
      const novo = await tentarDeNovo(p.id)
      setPedidos((l) => [novo, ...l.filter((x) => x.id !== novo.id)])
    } catch (err) {
      toast(err?.message || 'Não deu agora.', { tone: 'error' })
    }
  }

  const ligado = (getState().pc?.computadores || []).find((pc) => pc.online)
  const atual = porDestino.get(destino)
  const esperando = atual && (atual.status === 'pendente' || atual.status === 'gerando')
  return html`<${SheetHead} title="Converter com a Revela" right=${html`<button type="button" class="link-btn is-strong" onClick=${closeSheet}>OK</button>`} />
    <div class="sheet-body rvsheet">
      <div class="rv-topo">
        <img src="./icons/revela.svg" alt="" width="40" height="40" />
        <b class="rv-arquivo" title=${f.name}>${f.name}</b>
      </div>
      <div class="rv-destinos" role="radiogroup" aria-label="Destino">
        ${DESTINOS_REVELA.map((d) => {
          const p = porDestino.get(d.id)
          return html`<button type="button" role="radio" aria-checked=${destino === d.id ? 'true' : 'false'} class=${cx('rv-destino', destino === d.id && 'is-on')} onClick=${() => setDestino(d.id)}>
            <${Icon} name=${d.vertical ? 'phone' : 'monitor'} size=${24} />
            <b>${d.nome}</b>
            <small>${d.vertical ? '9:16' : '16:9'}</small>
            ${p ? html`<span class=${cx('rv-marca-estado', `is-${p.status}`)} aria-label=${ESTADO[p.status]}>${p.status === 'pronto' ? html`<${Icon} name="check" size=${12} />` : p.status === 'erro' ? '!' : html`<span class="rv-ponto"></span>`}</span>` : null}
          </button>`
        })}
      </div>
      ${atual
        ? html`<p class=${cx('rv-estado', `is-${atual.status}`)} role="status">
            ${atual.status === 'gerando' ? html`<span class="spinner"></span>` : html`<${Icon} name=${atual.status === 'pronto' ? 'circle-check' : atual.status === 'erro' ? 'warning' : 'clock'} size=${18} />`}
            <span>${atual.status === 'pronto' ? atual.resultado || ESTADO.pronto : atual.status === 'erro' ? atual.erro || ESTADO.erro : ESTADO[atual.status]}</span>
            ${atual.status === 'erro' ? html`<button type="button" class="link-btn" onClick=${() => deNovo(atual)}>De novo</button>` : null}
          </p>`
        : html`<p class="rv-estado"><${Icon} name="laptop" size=${18} /><span>${ligado ? `${ligado.nome} converte` : 'Precisa do SOBEDESCE aberto num computador'}</span></p>`}
      <${Button} variant="down" size="lg" class="btn-block" icon="compare" onClick=${pedir} disabled=${pedindo || esperando}>
        ${pedindo ? 'Pedindo…' : esperando ? 'Já está na fila' : 'Converter'}
      </${Button}>
    </div>`
}
RevelaSheet.label = 'Converter com a Revela'
