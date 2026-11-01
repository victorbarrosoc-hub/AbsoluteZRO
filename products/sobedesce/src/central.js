// Atualizar pela Absolute ZRO (pedido do titular, 01/11/2026): os apps de computador da família são instalados e
// atualizados só pela central "Absolute ZRO" (apps/hub-desktop), como no Creative Cloud. O SOBEDESCE não baixa nem
// instala nada: quando sai versão nova, ele aponta para a central pelo deep link
// absolutezro://apps/sobedesce?acao=atualizar. Sem a central no computador (ninguém atende o protocolo, ou o sistema
// recusa abrir), vai para a página de baixar a central.
//
// Sem Electron aqui: o desktop/main.js injeta `temCentral` (app.getApplicationNameForProtocol) e `abrir`
// (shell.openExternal). Mesmo contrato do desktop/central.cjs dos outros apps de computador.

export const PAGINA_DA_CENTRAL = 'https://absolutezro.com/baixar'
export const ESQUEMA_DA_CENTRAL = 'absolutezro'
export const ID = 'sobedesce'
const APPS = ['sobedesce', 'synquei', 'maestro', 'relay', 'carro-do-freela', 'tpeasy', 'rift-motion']
const ACOES = ['atualizar', 'instalar']

/** absolutezro://apps/<id>?acao=<acao>, só para os apps e ações do contrato com a central. */
export function linkDaCentral(id = ID, acao = 'atualizar') {
  if (!APPS.includes(id)) throw new Error(`app fora da central: ${id}`)
  if (!ACOES.includes(acao)) throw new Error(`ação fora da central: ${acao}`)
  return `${ESQUEMA_DA_CENTRAL}://apps/${id}?acao=${acao}`
}

/**
 * Abre a central no app (deep link); sem central, a página de baixar. Nunca lança.
 * @param {{ temCentral: () => boolean, abrir: (url: string) => Promise<unknown> | unknown, id?: string, acao?: string }} o
 * @returns {Promise<'central'|'pagina'>}
 */
export async function abrirNaCentral({ temCentral, abrir, id = ID, acao = 'atualizar' }) {
  const link = linkDaCentral(id, acao)
  let tem = false
  try {
    tem = !!temCentral()
  } catch {
    tem = false
  }
  if (tem) {
    try {
      await abrir(link)
      return 'central'
    } catch {
      // o sistema não abriu o protocolo: segue para a página
    }
  }
  try {
    await abrir(PAGINA_DA_CENTRAL)
  } catch {
    // sem navegador: não há o que fazer daqui
  }
  return 'pagina'
}
