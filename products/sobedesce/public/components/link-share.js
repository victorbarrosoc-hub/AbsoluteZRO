// "Copiar link" de uma pasta ou arquivo do Drive (mandar para o cliente): copia o webViewLink, confere quem consegue
// abrir e, se só quem tem acesso abre, oferece "Liberar para quem tiver o link" — que SEMPRE passa por uma confirmação
// aqui mesmo ("Qualquer pessoa com o link vai poder ver e baixar") antes de chamar o motor. Um cartão por vez, no
// canto dos avisos. Com `publico: true` (a pessoa escolheu "Qualquer pessoa com o link pode ver" no Copiar link, ou
// deixou essa escolha lembrada, 09/11/2026) libera e copia num clique; o cartão oferece "Deixar restrito".
import { html, useEffect, useRef, useState } from '/vendor/preact-htm.js'
import { api, enc, withQuery } from '../lib/api.js'
import { copyText } from '../lib/mobile.js'
import { openExternal } from '../lib/desktop.js'
import { avisoDoLink, CONFIRMAR_LIBERAR, LIBERAR, RESTRITO, textoPublico } from '../lib/compartilhar.js'
import { Icon } from './icons.js'
import { Button, Spinner } from './common.js'

// Estado do cartão: null ou { seq, accountId, id, rk, name, isFolder, fase, link, copiado, erro }
// fase: 'conferindo' | 'pronto' | 'confirmar' | 'liberando' | 'liberado' | 'erro'
let card = null
let seq = 0
const subs = new Set()
let timer = null

function emit() {
  for (const fn of subs) fn(card)
}

// Quem mostra o selo "Público (link)" (a lista do Drive) fica sabendo quando o link de um item mudou.
const mudancas = new Set()
export function onLinkMudou(fn) {
  mudancas.add(fn)
  return () => mudancas.delete(fn)
}
function avisarMudanca(accountId, id, publico) {
  for (const fn of mudancas) fn({ accountId, id, publico })
}

function put(next) {
  card = next
  clearTimeout(timer)
  // Só some sozinho quando não há nada a decidir (já está aberto para qualquer pessoa, ou acabou de liberar).
  if (card && (card.fase === 'liberado' || (card.fase === 'pronto' && card.link?.access === 'qualquer'))) {
    const mine = card.seq
    timer = setTimeout(() => card?.seq === mine && put(null), 7000)
  }
  emit()
}

function patch(mine, p) {
  if (card?.seq === mine) put({ ...card, ...p })
}

/** O link do Drive montado pelo id (igual ao webViewLink), para copiar já no clique, antes de o motor responder. */
export function driveLinkFor(id, isFolder, resourceKey) {
  const base = isFolder ? `https://drive.google.com/drive/folders/${encodeURIComponent(id)}` : `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`
  return resourceKey ? `${base}?resourcekey=${encodeURIComponent(resourceKey)}` : base
}

/**
 * Copia o link de um item do Drive e mostra quem consegue abrir.
 * @param {{ accountId: string, id: string, name?: string, isFolder?: boolean, url?: string|null, resourceKey?: string|null }} item
 */
export async function copyDriveLink({ accountId, id, name, isFolder = true, url = null, resourceKey = null, publico = false }) {
  if (!accountId || !id) return
  const mine = ++seq
  // Copia já no clique (o clique ainda está "quente" para a área de transferência): o webViewLink da lista ou o link
  // montado pelo id. Se o motor devolver outro, copia de novo.
  url = url || driveLinkFor(id, isFolder, resourceKey)
  const cedo = await copyText(url)
  if (publico) {
    // A pessoa escolheu "Qualquer pessoa com o link pode ver": é o `confirmado` (nunca sai daqui sem essa escolha).
    put({ seq: mine, accountId, id, rk: resourceKey, name: name || '', isFolder, fase: 'liberando', link: null, copiado: cedo, url })
    try {
      const res = await api.post(`/api/drive/${enc(accountId)}/link/liberar`, { id, rk: resourceKey || undefined, confirmado: true })
      if (card?.seq !== mine) return
      const copiado = res.link?.url && res.link.url !== url ? await copyText(res.link.url) : cedo
      patch(mine, { fase: 'liberado', link: res.link, copiado, url: res.link?.url || url })
      avisarMudanca(accountId, id, true)
    } catch (err) {
      if (card?.seq !== mine) return
      // Política do Workspace, drive compartilhado, sem permissão: diz por quê, e que o link copiado não abre para todos.
      patch(mine, { fase: 'erro', erro: err?.message || 'Não consegui liberar o link.', nota: cedo ? 'O link copiado só abre para quem já tem acesso.' : null })
    }
    return
  }
  put({ seq: mine, accountId, id, rk: resourceKey, name: name || '', isFolder, fase: 'conferindo', link: null, copiado: cedo, url })
  try {
    const res = await api.get(withQuery(`/api/drive/${enc(accountId)}/link`, { id, rk: resourceKey }))
    if (card?.seq !== mine) return
    const link = res.link
    const copiado = cedo && link.url === url ? true : await copyText(link.url)
    patch(mine, { fase: 'pronto', link, copiado, url: link.url, isFolder: link.isFolder, name: card.name || link.name })
  } catch (err) {
    if (card?.seq !== mine) return
    // Copiado mas sem conferir (sem internet, sem permissão de ver o compartilhamento): diz isso, sem botão de liberar.
    if (cedo) patch(mine, { fase: 'pronto', link: null, copiado: true })
    else patch(mine, { fase: 'erro', erro: err?.message || 'Não consegui pegar o link.' })
  }
}

// Clique que chega logo depois de abrir a confirmação (o segundo clique de um duplo clique) não conta como confirmar.
const CONFIRM_GUARD_MS = 600

function pedirConfirmacao(mine) {
  patch(mine, { fase: 'confirmar', confirmAt: Date.now() })
}

async function liberar(mine) {
  const c = card
  if (!c || c.seq !== mine || c.fase !== 'confirmar') return
  if (Date.now() - (c.confirmAt || 0) < CONFIRM_GUARD_MS) return
  patch(mine, { fase: 'liberando' })
  try {
    // `confirmado: true` só sai daqui, do botão da confirmação.
    const res = await api.post(`/api/drive/${enc(c.accountId)}/link/liberar`, { id: c.id, rk: c.rk || undefined, confirmado: true })
    const copiado = res.link?.url && res.link.url !== c.url ? await copyText(res.link.url) : c.copiado
    patch(mine, { fase: 'liberado', link: res.link, copiado, url: res.link?.url || c.url })
    avisarMudanca(c.accountId, c.id, true)
  } catch (err) {
    patch(mine, { fase: 'erro', erro: err?.message || 'Não consegui liberar o link.' })
  }
}

/** Volta para "Restrito" (só quem tem acesso abre): o botão "Deixar restrito" do cartão. Diminuir o acesso não pede confirmação. */
async function restringir(mine) {
  const c = card
  if (!c || c.seq !== mine) return
  patch(mine, { fase: 'restringindo' })
  try {
    const res = await api.post(`/api/drive/${enc(c.accountId)}/link/restringir`, { id: c.id, rk: c.rk || undefined, confirmado: true })
    patch(mine, { fase: 'pronto', link: res.link, url: res.link?.url || c.url })
    avisarMudanca(c.accountId, c.id, false)
  } catch (err) {
    patch(mine, { fase: 'erro', erro: err?.message || 'Não consegui deixar o link restrito.' })
  }
}

/** Liga ou desliga "Qualquer pessoa com o link pode ver" fora do cartão (janela Compartilhar). Devolve o `link` novo. */
export async function mudarAcessoDoLink({ accountId, id, resourceKey = null, publico }) {
  const rota = publico ? 'liberar' : 'restringir'
  const res = await api.post(`/api/drive/${enc(accountId)}/link/${rota}`, { id, rk: resourceKey || undefined, confirmado: true })
  if (card?.accountId === accountId && card.id === id) put(null) // o cartão do mesmo item ficou velho
  avisarMudanca(accountId, id, res.link?.access === 'qualquer')
  return res.link
}

function useCard() {
  const [c, setC] = useState(card)
  useEffect(() => {
    subs.add(setC)
    return () => subs.delete(setC)
  }, [])
  return c
}

/** O cartão (vai dentro da pilha de avisos). */
export function LinkShareCard() {
  const c = useCard()
  const ref = useRef(null)
  useEffect(() => {
    // A confirmação recebe o foco no "Cancelar": Enter sozinho nunca libera.
    if (c?.fase === 'confirmar') ref.current?.querySelector('[data-cancel]')?.focus({ preventScroll: true })
  }, [c?.fase])
  if (!c) return null
  const close = () => put(null)
  const nome = c.name ? `“${c.name}”` : c.isFolder ? 'a pasta' : 'o arquivo'
  const onKey = (e) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    if (c.fase === 'confirmar') patch(c.seq, { fase: 'pronto' })
    else close()
  }

  let icon = 'link'
  let tone = 'info'
  let title = null
  let body = null
  let actions = null

  if (c.fase === 'conferindo') {
    icon = null
    body = html`<span>${c.copiado ? 'Copiado. ' : ''}Conferindo quem consegue abrir ${nome}…</span>`
  } else if (c.fase === 'pronto') {
    const a = avisoDoLink(c.link, { copiado: c.copiado })
    tone = a.tone === 'ok' ? 'success' : 'warning'
    icon = a.tone === 'ok' ? 'circle-check' : 'link'
    title = c.name || null
    body = html`<span>${a.texto}</span>${a.nota ? html`<span class="sub">${a.nota}</span>` : null}
      ${!c.copiado && c.url ? html`<input class="input linkcard-url" readonly value=${c.url} aria-label="Link" onFocus=${(e) => e.currentTarget.select()} />` : null}`
    actions = html`
      ${a.liberar ? html`<${Button} size="sm" icon="users" onClick=${() => pedirConfirmacao(c.seq)}>${LIBERAR}</${Button}>` : null}
      ${c.link?.access === 'qualquer' && c.link.canShare ? html`<${Button} size="sm" icon="lock" onClick=${() => restringir(c.seq)} title="Só quem tem acesso abre">Deixar restrito</${Button}>` : null}
      ${c.url ? html`<${Button} size="sm" variant="ghost" icon="external" onClick=${() => openExternal(c.url)}>Abrir no Drive</${Button}>` : null}`
  } else if (c.fase === 'confirmar') {
    tone = 'warning'
    icon = 'warning'
    title = `Liberar ${nome} para quem tiver o link?`
    body = html`<span>${CONFIRMAR_LIBERAR}</span><span class="sub">Dá para desfazer depois no Google Drive, em Compartilhar.</span>`
    // "Cancelar" vem primeiro, no lugar do botão que abriu a confirmação: um duplo clique cai nele, não no Liberar.
    actions = html`
      <${Button} size="sm" data-cancel onClick=${() => patch(c.seq, { fase: 'pronto' })}>Cancelar</${Button}>
      <${Button} size="sm" variant="primary" icon="users" onClick=${() => liberar(c.seq)}>Liberar</${Button}>`
  } else if (c.fase === 'liberando') {
    icon = null
    body = html`<span>Liberando ${nome}…</span>`
  } else if (c.fase === 'restringindo') {
    icon = null
    body = html`<span>Deixando ${nome} restrito…</span>`
  } else if (c.fase === 'liberado') {
    tone = 'success'
    icon = 'globe'
    title = c.name || null
    body = html`<span>${textoPublico(c.copiado)}</span>`
    actions = c.link?.canShare !== false ? html`<${Button} size="sm" icon="lock" onClick=${() => restringir(c.seq)} title="Só quem tem acesso abre">${RESTRITO}</${Button}>` : null
  } else {
    tone = 'error'
    icon = 'warning'
    title = c.name || null
    body = html`<span>${c.erro}</span>${c.nota ? html`<span class="sub">${c.nota}</span>` : null}`
  }

  return html`<div
    ref=${ref}
    class=${`toast toast-${tone} linkcard`}
    role=${c.fase === 'confirmar' ? 'alertdialog' : c.fase === 'erro' ? 'alert' : 'status'}
    aria-label=${c.fase === 'confirmar' ? title : undefined}
    onKeyDown=${onKey}
  >
    <span class="toast-icon">${icon ? html`<${Icon} name=${icon} size=${17} />` : html`<${Spinner} size=${15} />`}</span>
    <div class="toast-text">
      ${title ? html`<b class="linkcard-title" title=${title}>${title}</b>` : null}
      ${body}
      ${actions ? html`<div class="linkcard-actions">${actions}</div>` : null}
    </div>
    <button type="button" class="toast-close" aria-label="Fechar" onClick=${close}><${Icon} name="x" size=${13} /></button>
  </div>`
}
