// Aviso de versão nova (o motor confere no site; src/version.js). Desde 01/11/2026 quem instala e atualiza os apps de
// computador é a central Absolute ZRO: o SOBEDESCE não baixa nem instala nada. "Atualizar na Absolute ZRO" abre
// absolutezro://apps/sobedesce?acao=atualizar no app de computador (sem a central, a página de baixar); no navegador,
// a página de baixar a central. "Depois" esconde a pílula deste build até sair um mais novo.
import { api, attempt } from './api.js'
import { getState, setVersao } from './store.js'
import { openExternal } from './desktop.js'

export const PAGINA_DA_CENTRAL = 'https://absolutezro.com/baixar'

/** "build 42 · 15 de out. de 2026" (ou "versão de desenvolvimento"). */
export function buildLabel(info) {
  if (!info?.build) return 'versão de desenvolvimento'
  const d = info.data ? new Date(info.data) : null
  const when = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  return when ? `build ${info.build} · ${when}` : `build ${info.build}`
}

/** "Atualizar na Absolute ZRO": a ponte do app abre a central (ou a página); no navegador, a página. */
export async function atualizarNaCentral(bridge = typeof window !== 'undefined' ? window.sobedesce : null) {
  if (bridge?.abrirCentral) {
    const r = await bridge.abrirCentral().catch(() => null)
    if (r) return r
  }
  openExternal(getState().versao?.pagina || PAGINA_DA_CENTRAL)
  return 'pagina'
}

export async function dismissUpdate() {
  const build = getState().versao?.ultima?.build
  const res = await attempt(api.post('/api/versao/depois', build ? { build } : {}))
  if (res?.versao) setVersao(res.versao)
}

/** Confere no site agora. Devolve o estado novo (ou null se o motor não respondeu). */
export async function checkUpdate() {
  const res = await attempt(api.post('/api/versao/verificar'))
  if (res?.versao) setVersao(res.versao)
  return res?.versao ?? null
}
