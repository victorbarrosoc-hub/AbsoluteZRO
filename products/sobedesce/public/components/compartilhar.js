// Menu do item da tela Drive (titular, 09/11/2026): "Copiar link" com a escolha "Qualquer pessoa com o link pode ver",
// a janela Compartilhar (acesso geral: Restrito × Qualquer pessoa com o link, Leitor) e a janela Detalhes. Nada vira
// público sem a pessoa escolher: sem escolha lembrada, o Copiar link pergunta; o Compartilhar só muda no clique.
import { html, useEffect, useState } from '/vendor/preact-htm.js'
import { api, enc, withQuery } from '../lib/api.js'
import { openModal, registerModal } from '../lib/modals.js'
import { bytes, fullDate } from '../lib/format.js'
import { cx, storage } from '../lib/ui.js'
import { copyText } from '../lib/mobile.js'
import { openExternal } from '../lib/desktop.js'
import { toast } from '../lib/toasts.js'
import { LINK_PUBLICO, LINK_PUBLICO_SUB, LINK_SO_COPIAR, LINK_SO_COPIAR_SUB, PADRAO_LINK, RESTRITO, padraoDoLink } from '../lib/compartilhar.js'
import { Icon } from './icons.js'
import { Button, Segmented, Spinner } from './common.js'
import { Modal } from './modal.js'
import { copyDriveLink, driveLinkFor, mudarAcessoDoLink } from './link-share.js'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/** O que copiar de um item da lista: atalho vira o alvo (o link do atalho só abre para quem o criou). */
export function alvoDoLink(it) {
  if (it.isShortcut && it.shortcutTargetId) return { id: it.shortcutTargetId, resourceKey: it.shortcutTargetResourceKey || null, url: null, isFolder: it.shortcutTargetMimeType === FOLDER_MIME }
  return { id: it.id, resourceKey: it.resourceKey || null, url: it.webViewLink || null, isFolder: !!it.isFolder }
}

export const lerPadraoDoLink = () => padraoDoLink(storage.get(PADRAO_LINK))
export const guardarPadraoDoLink = (v) => storage.set(PADRAO_LINK, padraoDoLink(v))

function EscolherLink({ nome, onClose }) {
  const [lembrar, setLembrar] = useState(true)
  const opcao = (modo, icon, titulo, sub) =>
    html`<button type="button" class=${cx('lk-opcao', modo === 'publico' && 'is-publico')} onClick=${() => onClose({ modo, lembrar })} data-autofocus=${modo === 'publico' ? true : undefined}>
      <span class="lk-opcao-ic"><${Icon} name=${icon} size=${20} /></span>
      <span class="lk-opcao-txt"><b>${titulo}</b><span class="sub">${sub}</span></span>
    </button>`
  return html`<${Modal} size="sm" class="dialog lk-escolher" title="Copiar link" subtitle=${nome} onClose=${() => onClose(null)}>
    <div class="lk-opcoes">
      ${opcao('publico', 'globe', LINK_PUBLICO, LINK_PUBLICO_SUB)}
      ${opcao('copiar', 'link', LINK_SO_COPIAR, LINK_SO_COPIAR_SUB)}
    </div>
    <label class="lk-lembrar"><input type="checkbox" checked=${lembrar} onChange=${(e) => setLembrar(e.currentTarget.checked)} /> Lembrar minha escolha</label>
  </${Modal}>`
}
registerModal('escolher-link', EscolherLink)

/**
 * "Copiar link" do menu: com a escolha lembrada, faz direto; sem ela, pergunta. `perguntar: true` pergunta sempre
 * (o "Copiar link…" da janela Compartilhar não passa por aqui).
 */
export async function copiarLink({ accountId, item, perguntar = false }) {
  if (!accountId || !item) return
  let modo = perguntar ? null : lerPadraoDoLink()
  if (!modo) {
    const r = await openModal('escolher-link', { nome: item.name })
    if (!r) return
    modo = r.modo
    if (r.lembrar) guardarPadraoDoLink(modo)
  }
  return copyDriveLink({ accountId, name: item.name, ...alvoDoLink(item), publico: modo === 'publico' })
}

function Compartilhar({ accountId, item, onClose }) {
  const alvo = alvoDoLink(item)
  const [link, setLink] = useState(null)
  const [erro, setErro] = useState(null)
  const [mudando, setMudando] = useState(null) // 'publico' | 'restrito'
  const [padrao, setPadrao] = useState(() => lerPadraoDoLink() || 'perguntar')
  useEffect(() => {
    let vivo = true
    api
      .get(withQuery(`/api/drive/${enc(accountId)}/link`, { id: alvo.id, rk: alvo.resourceKey }))
      .then((r) => vivo && setLink(r.link))
      .catch((err) => vivo && setErro(err?.message || 'Não consegui ver quem consegue abrir.'))
    return () => (vivo = false)
  }, [])

  const publico = link?.access === 'qualquer'
  // O que impede mudar (o motivo aparece embaixo da opção; nada falha calado).
  const motivo = !link ? null : link.root ? (link.sharedDrive ? 'A raiz de um drive compartilhado não pode ficar pública.' : 'O Meu Drive inteiro não pode ficar público.') : !link.canShare ? 'Sua conta não pode mudar o compartilhamento: peça a quem é dono.' : null
  const mudar = async (paraPublico) => {
    if (!link || mudando || paraPublico === publico || motivo) return
    setMudando(paraPublico ? 'publico' : 'restrito')
    setErro(null)
    try {
      setLink(await mudarAcessoDoLink({ accountId, id: alvo.id, resourceKey: alvo.resourceKey, publico: paraPublico }))
    } catch (err) {
      setErro(err?.message || 'Não consegui mudar o link.')
    } finally {
      setMudando(null)
    }
  }
  const url = link?.url || alvo.url || driveLinkFor(alvo.id, alvo.isFolder, alvo.resourceKey)
  const copiar = async () => {
    if (await copyText(url)) toast('success', publico ? `Copiado. ${LINK_PUBLICO}.` : 'Copiado. Só quem tem acesso consegue abrir.')
    else toast('error', 'Não consegui copiar o link.')
  }
  const opcao = (paraPublico, icon, titulo, sub) => {
    const on = !!link && publico === paraPublico
    return html`<button
      type="button"
      role="radio"
      aria-checked=${on ? 'true' : 'false'}
      class=${cx('lk-opcao', on && 'is-on', paraPublico && 'is-publico')}
      disabled=${!link || !!motivo}
      aria-busy=${mudando ? 'true' : undefined}
      onClick=${() => mudar(paraPublico)}
    >
      <span class="lk-opcao-ic">${mudando === (paraPublico ? 'publico' : 'restrito') ? html`<${Spinner} size=${16} />` : html`<${Icon} name=${icon} size=${20} />`}</span>
      <span class="lk-opcao-txt"><b>${titulo}</b><span class="sub">${sub}</span></span>
      ${on ? html`<${Icon} name="check" size=${16} class="lk-opcao-ok" />` : null}
    </button>`
  }
  const trocarPadrao = (v) => {
    setPadrao(v)
    guardarPadraoDoLink(v === 'perguntar' ? null : v)
  }

  return html`<${Modal}
    size="sm"
    class="dialog lk-compartilhar"
    title="Compartilhar"
    subtitle=${item.name}
    onClose=${onClose}
    footer=${html`
      <${Button} icon="users" onClick=${() => openExternal(url)} title="Convidar por e-mail no Google Drive">Convidar pessoas</${Button}>
      <${Button} variant="primary" icon="link" onClick=${copiar} data-autofocus>Copiar link</${Button}>
    `}
  >
    <p class="lk-rotulo">Acesso geral</p>
    <div class="lk-opcoes" role="radiogroup" aria-label="Acesso geral">
      ${opcao(false, 'lock', RESTRITO, link?.access === 'dominio' ? `Quem é de ${link.domain || 'sua organização'} abre.` : 'Só quem tem acesso abre.')}
      ${opcao(true, 'globe', 'Qualquer pessoa com o link', LINK_PUBLICO_SUB)}
    </div>
    ${!link && !erro ? html`<p class="sub lk-nota"><${Spinner} size=${13} /> Conferindo quem consegue abrir…</p>` : null}
    ${motivo ? html`<p class="sub lk-nota">${motivo}</p>` : null}
    ${erro ? html`<p class="lk-erro" role="alert"><${Icon} name="warning" size=${15} />${erro}</p>` : null}
    <div class="lk-padrao">
      <span class="lk-rotulo">No Copiar link</span>
      <${Segmented}
        size="sm"
        label="No Copiar link"
        value=${padrao}
        onChange=${trocarPadrao}
        options=${[
          { value: 'perguntar', label: 'Perguntar' },
          { value: 'publico', label: 'Público' },
          { value: 'copiar', label: 'Só copiar' },
        ]}
      />
    </div>
  </${Modal}>`
}
registerModal('compartilhar', Compartilhar)

export const abrirCompartilhar = ({ accountId, item }) => openModal('compartilhar', { accountId, item })

const TIPOS = [
  [/^video\//, 'Vídeo'],
  [/^image\//, 'Imagem'],
  [/^audio\//, 'Áudio'],
  [/pdf$/, 'PDF'],
  [/google-apps\.document$/, 'Documento Google'],
  [/google-apps\.spreadsheet$/, 'Planilha Google'],
  [/google-apps\.presentation$/, 'Apresentação Google'],
  [/google-apps\.shortcut$/, 'Atalho'],
]
export function tipoDoItem(it) {
  if (it.isFolder) return 'Pasta'
  const m = it.mimeType || ''
  const t = TIPOS.find(([re]) => re.test(m))
  const ext = /\.([a-z0-9]{1,6})$/i.exec(it.name || '')?.[1]?.toUpperCase()
  return t ? (ext && !it.isGoogleDoc ? `${t[1]} · ${ext}` : t[1]) : ext ? `Arquivo ${ext}` : 'Arquivo'
}

function Detalhes({ accountId, item, local, onClose }) {
  const alvo = alvoDoLink(item)
  const [link, setLink] = useState(undefined)
  useEffect(() => {
    let vivo = true
    api
      .get(withQuery(`/api/drive/${enc(accountId)}/link`, { id: alvo.id, rk: alvo.resourceKey }))
      .then((r) => vivo && setLink(r.link))
      .catch(() => vivo && setLink(null))
    return () => (vivo = false)
  }, [])
  const acesso = link === undefined ? 'Conferindo…' : !link ? 'Não deu para conferir' : link.access === 'qualquer' ? LINK_PUBLICO : link.access === 'dominio' ? `Quem é de ${link.domain || 'sua organização'}` : `${RESTRITO}: só quem tem acesso`
  const v = item.video
  const i = item.image
  const linhas = [
    ['Tipo', tipoDoItem(item)],
    item.size != null ? ['Tamanho', bytes(item.size, { precise: true })] : null,
    v?.width ? ['Resolução', `${v.width} × ${v.height}`] : i?.width ? ['Resolução', `${i.width} × ${i.height}`] : null,
    i?.camera ? ['Câmera', i.camera] : null,
    local ? ['Local', local] : null,
    item.owner?.name || item.owner?.email ? ['Dono', item.owner.name || item.owner.email] : null,
    item.modifiedTime ? ['Modificado', fullDate(item.modifiedTime)] : null,
    item.createdTime ? ['Criado', fullDate(item.createdTime)] : null,
    ['Quem abre o link', acesso],
    item.starred ? ['Estrela', 'Com estrela'] : null,
  ].filter(Boolean)
  return html`<${Modal} size="sm" class="dialog lk-detalhes" title="Detalhes" subtitle=${item.name} onClose=${onClose}
    footer=${html`<${Button} icon="external" onClick=${() => openExternal(alvo.url || driveLinkFor(alvo.id, alvo.isFolder, alvo.resourceKey))}>Abrir no Google Drive</${Button}><${Button} variant="primary" onClick=${onClose} data-autofocus>OK</${Button}>`}
  >
    <dl class="lk-dl">${linhas.map(([k, val]) => html`<dt>${k}</dt><dd title=${val}>${val}</dd>`)}</dl>
  </${Modal}>`
}
registerModal('detalhes', Detalhes)

export const abrirDetalhes = ({ accountId, item, local }) => openModal('detalhes', { accountId, item, local })

/** Põe ou tira a estrela. Devolve o estado novo, ou null se não deu (o aviso diz por quê). */
export async function trocarEstrela({ accountId, item }) {
  const quer = !item.starred
  try {
    const r = await api.post(`/api/drive/${enc(accountId)}/estrela`, { id: alvoDoLink(item).id, starred: quer })
    toast('success', r.starred ? `“${item.name}” ganhou estrela.` : `Estrela tirada de “${item.name}”.`)
    return r.starred
  } catch (err) {
    toast('error', err?.message || 'Não consegui mudar a estrela.')
    return null
  }
}
