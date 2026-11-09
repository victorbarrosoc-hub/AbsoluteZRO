// Menu de um item da aba Drive: abre ao segurar o dedo numa pasta ou arquivo (ou no botão direito do mouse). Só o que
// faz sentido para o tipo e a permissão: Abrir, Selecionar, Baixar, Enviar para esta pasta, Copiar link, Abrir no Google
// Drive, Renomear, Mover para… (o seletor de pastas, components/folders.js), Calcular tamanho, Gerar proxy, Frames e
// Mover para a lixeira. As ações que já existiam (Baixar, Lixeira, Gerar proxy, Copiar links, Frames) são as mesmas
// folhas e funções da seleção (components/selecao.js); aqui só com um item. Igual ao Google Drive (titular, 09/11/2026):
// Compartilhar (Restrito × Qualquer pessoa com o link), Copiar link com a escolha "Qualquer pessoa com o link pode ver"
// (lib/link-publico.js; nunca vira público sem a pessoa escolher), estrela e Detalhes. O que não dá fica cinza com o motivo.
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js'
import { driveUrl, folderSizes, isFolder, kindOf, canDownload, target } from '../lib/browse.js'
import { closeLink, createFolder, fileLink, folderLink, linkAccess, moveErrorText, moveFile, openLink, openLinkError, renameFile, setStarred } from '../lib/drive.js'
import { LINK_PUBLICO, LINK_PUBLICO_SUB, LINK_SO_COPIAR, LINK_SO_COPIAR_SUB, PADRAO_LINK, RESTRITO, SELO_PUBLICO, acoesDoVazio, ehPublico, gruposDaPasta, padraoDoLink, voltasDoMover } from '../lib/link-publico.js'
import { engine } from '../lib/uploader.js'
import { isIOS } from '../lib/platform.js'
import { local } from '../lib/config.js'
import { podeProxy } from '../lib/proxies.js'
import { bytes, shortDate } from '../lib/format.js'
import { closeSheet, getState, openSheet, pushRecent, setState, setTab, toast } from '../lib/state.js'
import { Icon } from './icons.js'
import { Button, SheetHead, copyText, cx } from './ui.js'
import { Thumb } from './thumb.js'
import { FileName } from './queue.js'
import { framesDoDrive } from './criar.js'
import { montagemDoDrive } from './montagens.js'
import { enviarPara } from './browser.js'

/** O navegador escolhe uma pasta inteira? (o iPhone e o iPad não: lá só arquivos) */
const PASTA_INTEIRA = typeof document !== 'undefined' && !isIOS && 'webkitdirectory' in document.createElement('input')

/**
 * "Enviar pasta": cria a pasta (e as subpastas) dentro de `dest` e põe cada arquivo na fila da pasta dele. As pastas
 * vão uma a uma, na ordem (a de cima antes da de dentro).
 */
async function enviarPastaPara(files, dest) {
  const grupos = gruposDaPasta(files)
  const ids = new Map([['', { id: dest.id, path: dest.path || [] }]])
  let n = 0
  for (const g of grupos) {
    const chave = g.caminho.join('/')
    if (!ids.has(chave)) {
      const pai = ids.get(g.caminho.slice(0, -1).join('/'))
      const nome = g.caminho[g.caminho.length - 1]
      const criada = await createFolder(nome, pai.id)
      ids.set(chave, { id: criada.id, path: [...pai.path, { id: criada.id, name: nome }] })
    }
    if (!g.arquivos.length) continue
    const aqui = ids.get(chave)
    const r = engine.addFiles(g.arquivos, { id: aqui.id, name: g.caminho[g.caminho.length - 1] || dest.name, driveId: dest.driveId || null, path: aqui.path })
    n += r.added + r.resumed
  }
  return n
}

/**
 * O menu do vazio da aba Drive (segurar no espaço livre ou botão direito): Nova pasta, Enviar arquivos, Enviar pasta.
 * O que não dá fica cinza com o motivo (lib/link-publico.js acoesDoVazio).
 */
export function VazioSheet({ dest, busca = false, onMudou }) {
  const [fase, setFase] = useState('menu')
  const [nome, setNome] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState(null)
  const ref = useRef(null)
  useEffect(() => {
    if (fase === 'pasta') ref.current?.focus({ preventScroll: true })
  }, [fase])
  const acoes = acoesDoVazio({ dest, busca, pastaInteira: PASTA_INTEIRA })
  const criar = async (e) => {
    e?.preventDefault()
    const limpo = nome.trim()
    if (!limpo || busy) return
    setBusy(true)
    setErro(null)
    try {
      await createFolder(limpo, dest.id)
      toast(`Pasta “${limpo}” criada`, { tone: 'success' })
      closeSheet()
      onMudou?.({ recarregar: true })
    } catch (err) {
      setErro(err?.status === 0 ? 'Sem conexão com o Google. Tente de novo.' : err?.status === 403 || err?.status === 404 ? 'Você não pode criar pastas aqui.' : 'Não consegui criar a pasta agora.')
      setBusy(false)
    }
  }
  if (fase === 'pasta') {
    return html`<${SheetHead}
        title="Nova pasta"
        left=${html`<button type="button" class="link-btn" onClick=${() => setFase('menu')}>Voltar</button>`}
        right=${html`<button type="button" class="link-btn is-strong" onClick=${criar} disabled=${!nome.trim() || busy}>Criar</button>`}
      />
      <form class="sheet-body rsheet" onSubmit=${criar}>
        <label class="rfield">
          <span class="rfield-label">Dentro de “${dest.name}”</span>
          <input ref=${ref} class="input" type="text" value=${nome} placeholder="Sem título" enterkeyhint="done" autocomplete="off" spellcheck=${false} onInput=${(e) => setNome(e.currentTarget.value)} />
        </label>
        ${erro ? html`<p class="item-error" role="alert">${erro}</p>` : null}
        <${Button} variant="primary" size="lg" class="btn-block" loading=${busy} disabled=${!nome.trim()} onClick=${criar}>Criar pasta</${Button}>
      </form>`
  }
  const escolheu = (pasta) => async (e) => {
    const files = [...(e.currentTarget.files || [])]
    e.currentTarget.value = ''
    if (!files.length) return
    closeSheet()
    if (!pasta) return enviarPara(files, dest)
    try {
      setState({ dest })
      pushRecent(dest, getState().user?.emailAddress)
      const n = await enviarPastaPara(files, dest)
      setTab('send')
      toast(n === 1 ? `Enviando para ${dest.name}` : `${n} arquivos indo para ${dest.name}`, { tone: 'success' })
      onMudou?.({ recarregar: true })
    } catch (err) {
      toast(err?.status === 0 ? 'Sem conexão com o Google. Tente de novo.' : 'Não consegui criar as pastas no Drive.', { tone: 'error', ms: 4200 })
    }
  }
  const linha = (a) => {
    const off = Boolean(a.motivo)
    const inner = html`<${Icon} name=${a.icon} /><span class=${off ? 'menu-text' : undefined}>${a.label}${off ? html`<small>${a.motivo}</small>` : null}</span>`
    if (off) return html`<li><button type="button" class="menu-item" disabled>${inner}</button></li>`
    if (a.id === 'pasta') return html`<li><button type="button" class="menu-item" onClick=${() => setFase('pasta')}>${inner}</button></li>`
    const id = `vazio-${a.id}`
    return html`<li>
      <input id=${id} class="offscreen" type="file" multiple webkitdirectory=${a.id === 'enviar-pasta' ? '' : undefined} onChange=${escolheu(a.id === 'enviar-pasta')} />
      <label for=${id} class="menu-item">${inner}</label>
    </li>`
  }
  return html`<${SheetHead} title=${dest?.name || 'Drive'} right=${html`<button type="button" class="link-btn is-strong" onClick=${closeSheet}>OK</button>`} />
    <div class="sheet-body rsheet imenu">
      <ul class="group menu">${acoes.map(linha)}</ul>
    </div>`
}
VazioSheet.label = 'Ações da pasta'

export const lerPadraoDoLink = () => padraoDoLink(local.get(PADRAO_LINK))
export const guardarPadraoDoLink = (v) => local.set(PADRAO_LINK, padraoDoLink(v))

const linkDe = (f) => {
  const t = target(f)
  return t.id === f.id && f.webViewLink ? f.webViewLink : isFolder(f) ? folderLink(t.id) : fileLink(t.id)
}

/**
 * Copia o link (já no toque: o iPhone só deixa copiar no gesto) e, com `publico`, libera para "qualquer pessoa com o
 * link" (leitor). A recusa da empresa (Workspace) ou de quem é dono vira aviso claro: o link copiado só abre para quem
 * já tem acesso. `onMudou({ ajuste })` atualiza o selo na lista.
 */
export async function copiarLinkDoItem(f, { publico, onMudou } = {}) {
  const copiado = await copyText(linkDe(f))
  if (!publico) {
    toast(copiado ? 'Link copiado' : 'Não consegui copiar o link', { tone: copiado ? 'success' : 'error' })
    return
  }
  try {
    await openLink(target(f).id)
    onMudou?.({ ajuste: { id: f.id, publico: true } })
    toast(copiado ? `Copiado. ${LINK_PUBLICO}.` : `${LINK_PUBLICO}. Não consegui copiar o link.`, { tone: copiado ? 'success' : 'error', ms: 3600 })
  } catch (err) {
    toast(`${openLinkError(err).text}${copiado ? ' O link copiado só abre para quem já tem acesso.' : ''}`, { tone: 'error', ms: 6000 })
  }
}

/** "Copiar link": com a escolha lembrada, direto; sem ela, a folha pergunta (fase 'link'). */
function EscolherLink({ f, onMudou, onVoltar }) {
  const [lembrar, setLembrar] = useState(true)
  const ir = (modo) => {
    if (lembrar) guardarPadraoDoLink(modo)
    closeSheet()
    copiarLinkDoItem(f, { publico: modo === 'publico', onMudou })
  }
  return html`<${SheetHead} title="Copiar link" left=${html`<button type="button" class="link-btn" onClick=${onVoltar}>Voltar</button>`} />
    <div class="sheet-body rsheet lk">
      <p class="sub lk-nome">${f.name}</p>
      <button type="button" class="lk-opcao is-publico" onClick=${() => ir('publico')}>
        <span class="lk-ic"><${Icon} name="globe" /></span><span class="lk-txt"><b>${LINK_PUBLICO}</b><small>${LINK_PUBLICO_SUB}</small></span>
      </button>
      <button type="button" class="lk-opcao" onClick=${() => ir('copiar')}>
        <span class="lk-ic"><${Icon} name="link" /></span><span class="lk-txt"><b>${LINK_SO_COPIAR}</b><small>${LINK_SO_COPIAR_SUB}</small></span>
      </button>
      <label class="lk-lembrar"><input type="checkbox" checked=${lembrar} onChange=${(e) => setLembrar(e.currentTarget.checked)} /> Lembrar minha escolha</label>
    </div>`
}

/** Compartilhar: acesso geral (Restrito × Qualquer pessoa com o link, Leitor), copiar e o que o Copiar link faz. */
function Compartilhar({ f, onMudou, onVoltar }) {
  const id = target(f).id
  const [acesso, setAcesso] = useState(null) // { open, canShare }
  const [erro, setErro] = useState(null)
  const [mudando, setMudando] = useState(null)
  const [padrao, setPadrao] = useState(() => lerPadraoDoLink() || 'perguntar')
  useEffect(() => {
    let vivo = true
    linkAccess(id, { folder: isFolder(f) })
      .then((a) => vivo && setAcesso(a))
      .catch((err) => vivo && setErro(openLinkError(err).text))
    return () => (vivo = false)
  }, [])
  const semPoder = acesso && !acesso.canShare ? 'Você não pode mudar o compartilhamento: peça a quem é dono.' : f.isDrive ? 'Um Drive compartilhado inteiro não fica público.' : null
  const mudar = async (publico) => {
    if (!acesso || mudando || semPoder || acesso.open === publico) return
    setMudando(publico ? 'publico' : 'restrito')
    setErro(null)
    try {
      if (publico) await openLink(id)
      else await closeLink(id)
      setAcesso({ ...acesso, open: publico })
      onMudou?.({ ajuste: { id: f.id, publico } })
    } catch (err) {
      setErro(openLinkError(err).text)
    } finally {
      setMudando(null)
    }
  }
  const opcao = (publico, icon, titulo, sub) => {
    const on = acesso && acesso.open === publico
    return html`<button type="button" role="radio" aria-checked=${on ? 'true' : 'false'} class=${cx('lk-opcao', publico && 'is-publico', on && 'is-on')} disabled=${!acesso || !!semPoder} aria-busy=${mudando ? 'true' : undefined} onClick=${() => mudar(publico)}>
      <span class="lk-ic">${mudando === (publico ? 'publico' : 'restrito') ? html`<span class="spinner" aria-hidden="true"></span>` : html`<${Icon} name=${icon} />`}</span>
      <span class="lk-txt"><b>${titulo}</b><small>${sub}</small></span>
      ${on ? html`<${Icon} name="check" size=${18} class="lk-ok" />` : null}
    </button>`
  }
  const copiar = async () => {
    const ok = await copyText(linkDe(f))
    toast(ok ? (acesso?.open ? `Copiado. ${LINK_PUBLICO}.` : 'Copiado. Só quem tem acesso consegue abrir.') : 'Não consegui copiar o link', { tone: ok ? 'success' : 'error' })
  }
  const trocar = (v) => {
    setPadrao(v)
    guardarPadraoDoLink(v === 'perguntar' ? null : v)
  }
  return html`<${SheetHead} title="Compartilhar" left=${html`<button type="button" class="link-btn" onClick=${onVoltar}>Voltar</button>`} right=${html`<button type="button" class="link-btn is-strong" onClick=${closeSheet}>OK</button>`} />
    <div class="sheet-body rsheet lk">
      <p class="sub lk-nome">${f.name}</p>
      <p class="lk-rotulo">Acesso geral</p>
      <div role="radiogroup" aria-label="Acesso geral" class="lk-grupo">
        ${opcao(false, 'lock', RESTRITO, 'Só quem tem acesso abre.')}
        ${opcao(true, 'globe', 'Qualquer pessoa com o link', LINK_PUBLICO_SUB)}
      </div>
      ${!acesso && !erro ? html`<p class="sub lk-nota"><span class="spinner" aria-hidden="true"></span> Conferindo quem consegue abrir…</p>` : null}
      ${semPoder ? html`<p class="sub lk-nota">${semPoder}</p>` : null}
      ${erro ? html`<p class="item-error" role="alert">${erro}</p>` : null}
      <p class="lk-rotulo">No Copiar link</p>
      <div class="seg lk-seg" role="radiogroup" aria-label="No Copiar link">
        ${[
          ['perguntar', 'Perguntar'],
          ['publico', 'Público'],
          ['copiar', 'Só copiar'],
        ].map(([v, l]) => html`<button type="button" role="radio" aria-checked=${padrao === v ? 'true' : 'false'} class=${cx('seg-btn', padrao === v && 'is-on')} onClick=${() => trocar(v)}>${l}</button>`)}
      </div>
      <${Button} variant="primary" size="lg" class="btn-block" icon="link" onClick=${copiar}>Copiar link</${Button}>
      <a class="btn btn-secondary btn-lg btn-block lk-convidar" href=${driveUrl(f)} target="_blank" rel="noopener noreferrer"><${Icon} name="users" size=${18} />Convidar pessoas no Google Drive</a>
    </div>`
}

const TIPOS = { video: 'Vídeo', image: 'Imagem', audio: 'Áudio', pdf: 'PDF', gdoc: 'Documento Google', folder: 'Pasta' }

/** Detalhes: tipo, tamanho, resolução, dono, datas e quem abre o link. */
function Detalhes({ f, local: onde, onVoltar }) {
  const [acesso, setAcesso] = useState(undefined)
  useEffect(() => {
    let vivo = true
    linkAccess(target(f).id, { folder: isFolder(f) })
      .then((a) => vivo && setAcesso(a))
      .catch(() => vivo && setAcesso(null))
    return () => (vivo = false)
  }, [])
  const kind = kindOf(f)
  const ext = /\.([a-z0-9]{1,6})$/i.exec(f.name || '')?.[1]?.toUpperCase()
  const v = f.videoMediaMetadata
  const i = f.imageMediaMetadata
  const dono = f.owners?.[0]
  const data = (t) => (t ? new Date(t).toLocaleString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null)
  const linhas = [
    ['Tipo', [TIPOS[kind] || 'Arquivo', kind !== 'folder' && kind !== 'gdoc' ? ext : null].filter(Boolean).join(' · ')],
    f.size != null ? ['Tamanho', bytes(Number(f.size))] : null,
    v?.width ? ['Resolução', `${v.width} × ${v.height}`] : i?.width ? ['Resolução', `${i.width} × ${i.height}`] : null,
    onde ? ['Local', onde] : null,
    dono ? ['Dono', dono.displayName || dono.emailAddress] : null,
    f.modifiedTime ? ['Modificado', data(f.modifiedTime)] : null,
    f.createdTime ? ['Criado', data(f.createdTime)] : null,
    ['Quem abre o link', acesso === undefined ? 'Conferindo…' : !acesso || acesso.open === null ? 'Não deu para conferir' : acesso.open ? LINK_PUBLICO : `${RESTRITO}: só quem tem acesso`],
    f.starred ? ['Estrela', 'Com estrela'] : null,
  ].filter(Boolean)
  return html`<${SheetHead} title="Detalhes" left=${html`<button type="button" class="link-btn" onClick=${onVoltar}>Voltar</button>`} right=${html`<button type="button" class="link-btn is-strong" onClick=${closeSheet}>OK</button>`} />
    <div class="sheet-body rsheet lk">
      <p class="sub lk-nome">${f.name}</p>
      <dl class="lk-dl">${linhas.map(([k, val]) => html`<dt>${k}</dt><dd>${val}</dd>`)}</dl>
    </div>`
}

function Item({ icon, label, sub, onClick, disabled, perigo, href }) {
  const inner = html`<${Icon} name=${icon} /><span class=${sub ? 'menu-text' : undefined}>${label}${sub ? html`<small>${sub}</small>` : null}</span>`
  if (href) return html`<li><a class="menu-item" href=${href} target="_blank" rel="noopener noreferrer" onClick=${() => closeSheet()}>${inner}<${Icon} name="external" size=${16} class="menu-chev" /></a></li>`
  return html`<li><button type="button" class=${cx('menu-item', perigo && 'is-danger')} onClick=${onClick} disabled=${disabled}>${inner}</button></li>`
}

/** "Enviar para esta pasta": o toque no rótulo abre o seletor de arquivos (o gesto que o iPhone exige). */
function EnviarAqui({ dest }) {
  const id = 'item-menu-enviar'
  const onChange = (e) => {
    const files = [...(e.currentTarget.files || [])]
    e.currentTarget.value = ''
    if (!files.length) return
    closeSheet()
    enviarPara(files, dest)
  }
  return html`<li>
    <input id=${id} class="offscreen" type="file" multiple onChange=${onChange} />
    <label for=${id} class="menu-item"><${Icon} name="upload" /><span>Enviar para esta pasta</span></label>
  </li>`
}

/** Renomear, dentro da própria folha. */
function Renomear({ f, onFeito, onVoltar }) {
  const [nome, setNome] = useState(f.name)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState(null)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    // Seleciona o nome sem a extensão (como no Finder): trocar "Master_v1" sem apagar o ".mov".
    const ponto = isFolder(f) ? -1 : f.name.lastIndexOf('.')
    try {
      el.setSelectionRange(0, ponto > 0 ? ponto : f.name.length)
    } catch {
      // alguns teclados não deixam
    }
  }, [])
  const limpo = nome.trim()
  const salvar = async (e) => {
    e?.preventDefault()
    if (!limpo || limpo === f.name || busy) return limpo === f.name && onVoltar()
    setBusy(true)
    setErro(null)
    try {
      const r = await renameFile(f.id, limpo)
      toast(`Agora se chama “${r.name || limpo}”`, { tone: 'success' })
      closeSheet()
      onFeito?.()
    } catch (err) {
      setErro(moveErrorText(err, 'renomear'))
      setBusy(false)
    }
  }
  return html`<${SheetHead}
      title=${isFolder(f) ? 'Renomear pasta' : 'Renomear arquivo'}
      left=${html`<button type="button" class="link-btn" onClick=${onVoltar}>Voltar</button>`}
      right=${html`<button type="button" class="link-btn is-strong" onClick=${salvar} disabled=${!limpo || busy}>Salvar</button>`}
    />
    <form class="sheet-body rsheet" onSubmit=${salvar}>
      <label class="rfield">
        <span class="rfield-label">Nome</span>
        <input ref=${ref} class="input" type="text" value=${nome} enterkeyhint="done" autocomplete="off" autocorrect="off" spellcheck=${false} onInput=${(e) => setNome(e.currentTarget.value)} />
      </label>
      ${erro ? html`<p class="item-error" role="alert">${erro}</p>` : null}
      <${Button} variant="primary" size="lg" class="btn-block" loading=${busy} disabled=${!limpo} onClick=${salvar}>Renomear</${Button}>
    </form>`
}

/**
 * @param {{ f: object, onAbrir: () => void, onSelecionar: () => void, dest: object|null, inicio: object|null,
 *           driveId: string|null, onMudou: (o: { removidos?: string[], destId?: string, recarregar?: boolean }) => void }} props
 * `dest`: a pasta como destino de envio (só pastas em que dá para pôr arquivos). `inicio`: onde o "Mover para…" abre.
 */
export function ItemMenuSheet({ f, onAbrir, onSelecionar, dest, inicio, driveId, onMudou, local: onde = '', fase: faseInicial = 'menu' }) {
  const [fase, setFase] = useState(faseInicial)
  const voltar = () => setFase('menu')
  if (fase === 'renomear') return html`<${Renomear} f=${f} onVoltar=${voltar} onFeito=${() => onMudou?.({ recarregar: true })} />`
  if (fase === 'link') return html`<${EscolherLink} f=${f} onMudou=${onMudou} onVoltar=${voltar} />`
  if (fase === 'compartilhar') return html`<${Compartilhar} f=${f} onMudou=${onMudou} onVoltar=${voltar} />`
  if (fase === 'detalhes') return html`<${Detalhes} f=${f} local=${onde} onVoltar=${voltar} />`

  const kind = kindOf(f)
  const pasta = kind === 'folder'
  const caps = f.capabilities || {}
  const t = target(f)
  const video = podeProxy(f)
  const podeMover = !f.isDrive && caps.canMoveItemWithinDrive !== false && caps.canEdit !== false && (f.parents?.length ?? 1) > 0
  const podeRenomear = !f.isDrive && caps.canRename !== false
  const meta = pasta ? (f.isDrive ? 'Drive compartilhado' : 'Pasta') : [f.size != null ? bytes(Number(f.size)) : null, shortDate(f.modifiedTime)].filter(Boolean).join(' · ')
  const fechar = (fn) => () => {
    closeSheet()
    fn()
  }
  const padrao = lerPadraoDoLink()
  const copiarLink = () => {
    if (!padrao) return setFase('link')
    closeSheet()
    copiarLinkDoItem(f, { publico: padrao === 'publico', onMudou })
  }
  const estrela = async () => {
    closeSheet()
    try {
      const r = await setStarred(target(f).id, !f.starred)
      onMudou?.({ ajuste: { id: f.id, starred: r?.starred === true } })
      toast(r?.starred ? `“${f.name}” ganhou estrela` : 'Estrela tirada', { tone: 'success' })
    } catch (err) {
      toast(err?.status === 0 ? 'Sem conexão com o Google. Tente de novo.' : 'Não consegui mudar a estrela agora.', { tone: 'error' })
    }
  }

  const mover = () =>
    openSheet('folders', {
      titulo: 'Mover para',
      verb: 'Mover para',
      icone: 'arrow-right',
      recente: false,
      inicio,
      onCancel: closeSheet,
      onChoose: async (para) => {
        closeSheet()
        try {
          const r = await moveFile(f.id, para)
          const voltas = r.moved ? voltasDoMover([f], para.id === 'root' ? null : para.id) : {}
          const de = Object.keys(voltas)[0]
          toast(r.moved ? `“${f.name}” foi para “${para.name}”` : `Já estava em “${para.name}”`, {
            tone: r.moved ? 'success' : 'neutral',
            ms: r.moved ? 6000 : 2800,
            action: de
              ? {
                  label: 'Desfazer',
                  onClick: () =>
                    moveFile(f.id, { id: de, name: '' })
                      .then(() => onMudou?.({ recarregar: true, destId: para.id }))
                      .catch((err) => toast(moveErrorText(err, 'mover'), { tone: 'error', ms: 4200 })),
                }
              : null,
          })
          if (r.moved) onMudou?.({ removidos: [f.id], destId: para.id })
        } catch (err) {
          toast(moveErrorText(err, 'mover'), { tone: 'error', ms: 4200 })
        }
      },
    })

  return html`<${SheetHead} title="" right=${html`<button type="button" class="link-btn is-strong" onClick=${closeSheet}>OK</button>`} />
    <div class="sheet-body rsheet imenu">
      <div class="item-head">
        <span class="imenu-thumb"><${Thumb} file=${f} px=${56} kind=${kind} small /></span>
        <div class="item-titles">
          ${pasta ? html`<b class="item-name">${f.name}</b>` : html`<${FileName} name=${f.name} class="item-name" />`}
          <p class="sub">${meta}${ehPublico(f) ? html` · <span class="lk-selo"><${Icon} name="globe" size=${12} />${SELO_PUBLICO}</span>` : null}</p>
        </div>
      </div>
      <ul class="group menu">
        <${Item} icon=${pasta ? 'folder' : 'eye'} label=${pasta ? 'Abrir' : 'Ver'} onClick=${fechar(onAbrir)} />
        ${f.isDrive ? null : html`<${Item} icon="check" label="Selecionar" sub="Para baixar, copiar ou mover vários" onClick=${fechar(onSelecionar)} />`}
      </ul>
      ${f.isDrive
        ? null
        : html`<ul class="group menu">
            ${!pasta && kind !== 'gdoc' ? html`<${Item} icon="download" label="Baixar" disabled=${!canDownload(f)} onClick=${() => openSheet('baixarSelecao', { itens: [f], semPermissao: 0 })} />` : null}
            ${pasta && dest ? html`<${EnviarAqui} dest=${dest} />` : null}
            <${Item} icon="users" label="Compartilhar" onClick=${() => setFase('compartilhar')} />
            <${Item} icon=${padrao === 'publico' ? 'globe' : 'link'} label="Copiar link" sub=${padrao === 'publico' ? LINK_PUBLICO : null} onClick=${copiarLink} />
            <${Item} icon="drive" label="Abrir no Google Drive" href=${driveUrl(f)} />
          </ul>
          <ul class="group menu">
            <${Item} icon="pencil" label="Renomear" sub=${podeRenomear ? null : 'Só quem é dono ou edita pode renomear'} disabled=${!podeRenomear} onClick=${() => setFase('renomear')} />
            <${Item} icon="arrow-right" label="Mover para…" sub=${podeMover ? null : 'Só quem é dono ou edita pode mudar de lugar'} disabled=${!podeMover} onClick=${mover} />
            <${Item} icon=${f.starred ? 'star-fill' : 'star'} label=${f.starred ? 'Tirar a estrela' : 'Adicionar estrela'} onClick=${estrela} />
            <${Item} icon="info" label="Detalhes" onClick=${() => setFase('detalhes')} />
            ${pasta ? html`<${Item} icon="disk" label="Calcular tamanho" onClick=${fechar(() => folderSizes.start({ id: t.id, driveId: driveId || f.driveId || null }, { refresh: true }))} />` : null}
            ${video ? html`<${Item} icon="film" label="Gerar proxy" sub="O computador gera a cópia leve" onClick=${() => openSheet('proxySelecao', { itens: [f], fora: 0 })} />` : null}
            ${video ? html`<${Item} icon="sparkle" label="Frames" onClick=${fechar(() => framesDoDrive(f))} />` : null}
            ${!pasta && (kind === 'video' || kind === 'image') ? html`<${Item} icon="grid" label="Pôr numa montagem" onClick=${fechar(() => montagemDoDrive([f]))} />` : null}
            ${video || /\.(wav|aiff?|flac|mp3|m4a|aac|ogg|opus|caf)$/i.test(f.name) ? html`<${Item} icon="compare" label="Converter com o Relay" onClick=${() => openSheet('relay', { f, pasta: inicio })} />` : null}
          </ul>
          ${!f.isDrive && caps.canTrash !== false
            ? html`<ul class="group menu rmenu-danger">
                <${Item} icon="trash" label="Mover para a lixeira" perigo onClick=${() => openSheet('lixeiraSelecao', { itens: [f], onFeito: (ids) => onMudou?.({ removidos: ids }) })} />
              </ul>`
            : null}`}
    </div>`
}
ItemMenuSheet.label = 'Ações do item'
