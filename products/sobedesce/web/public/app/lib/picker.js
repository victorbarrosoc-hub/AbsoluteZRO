// "Escolher do Drive" (Google Picker) no modo Arquivos escolhidos (lib/modo-drive.js). O que a pessoa escolhe aqui
// fica liberado para o SOBEDESCE de vez (drive.file): abrir, baixar, tocar, enviar para dentro da pasta escolhida.
// O token é o mesmo da conta (lib/auth.js, só em memória); o client ID, a chave do Picker e o App ID (número do projeto
// Google SOBEDESCE) vêm de /api/drive/picker. O script vem de apis.google.com (CSP do /app/ em web/next.config.ts).
// Mesmo jeito de carregar do teste do HUB (apps/hub-web/components/admin/teste-drive).
import { getToken } from './auth.js'

const GAPI = 'https://apis.google.com/js/api.js'
const PASTA_MIME = 'application/vnd.google-apps.folder'

let config = null // Promise<{ pronto, clientId, apiKey, appId }>
let carregado = null // Promise<void>

function lerConfig() {
  if (!config) {
    config = fetch('/api/drive/picker', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : { pronto: false }))
      .catch(() => {
        config = null
        return { pronto: false, rede: true }
      })
  }
  return config
}

function script(src) {
  return new Promise((resolve, reject) => {
    const ja = document.querySelector(`script[src="${src}"]`)
    if (ja?.dataset.pronto) return resolve()
    const s = ja || document.createElement('script')
    s.addEventListener('load', () => ((s.dataset.pronto = '1'), resolve()), { once: true })
    s.addEventListener('error', () => reject(new Error('picker_script')), { once: true })
    if (!ja) {
      s.src = src
      s.async = true
      document.head.appendChild(s)
    }
  })
}

function carregar() {
  if (!carregado) {
    carregado = script(GAPI)
      .then(() => new Promise((resolve, reject) => window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('picker_script')) })))
      .catch((e) => {
        carregado = null
        throw e
      })
  }
  return carregado
}

/** Pode oferecer o botão? (o servidor tem a chave e o App ID). Não carrega nada do Google. */
export async function pickerDisponivel() {
  const c = await lerConfig()
  return Boolean(c?.pronto)
}

/** Um item do Picker no formato dos arquivos do Drive v3 que o app usa. */
export function doPicker(d) {
  return {
    id: String(d.id),
    name: String(d.name || ''),
    mimeType: String(d.mimeType || ''),
    size: d.sizeBytes != null ? String(d.sizeBytes) : undefined,
    parents: d.parentId ? [String(d.parentId)] : undefined,
  }
}

/**
 * Abre o Picker. `tipo`: 'arquivos' (vários de uma vez, pastas só para entrar) ou 'pasta' (uma pasta, para enviar
 * para dentro dela). Resolve com a lista escolhida (vazia = cancelou). Erros: 'sem_config', 'picker_script', do token.
 */
export async function escolherDoDrive({ tipo = 'arquivos', titulo, origem = null, varios = true } = {}) {
  const c = await lerConfig()
  if (!c?.pronto) throw Object.assign(new Error(c?.rede ? 'Sem conexão. Tente de novo.' : 'O Escolher do Drive ainda não foi ligado neste servidor.'), { code: 'sem_config' })
  const [token] = await Promise.all([getToken(), carregar()])
  const p = window.google.picker
  const pasta = tipo === 'pasta'
  const view = new p.DocsView(p.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(pasta)
  if (pasta) view.setMimeTypes(PASTA_MIME)
  return new Promise((resolve) => {
    let b = new p.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(c.apiKey)
      .setAppId(c.appId)
      .setLocale('pt-BR')
      .setTitle(titulo || (pasta ? 'Escolha a pasta' : 'Escolha os arquivos'))
    // Dentro de um quadro (o Relay embute o app): o Picker precisa saber a origem da página de cima.
    if (origem) b = b.setOrigin(origem)
    b = b
      .setCallback((d) => {
        if (d.action === p.Action.PICKED) resolve((d.docs || []).map(doPicker))
        else if (d.action === p.Action.CANCEL) resolve([])
      })
    if (!pasta && varios) b = b.enableFeature(p.Feature.MULTISELECT_ENABLED)
    b.build().setVisible(true)
  })
}
