// Atualizar pela Absolute ZRO (pedido do titular, 01/11/2026): os apps de computador da família são instalados e
// atualizados só pela central "Absolute ZRO" (apps/hub-desktop), como no Creative Cloud. Este app não baixa nem
// instala nada: quando sai versão nova, ele aponta para a central pelo deep link
// absolutezro://apps/<id>?acao=atualizar. Sem a central no computador (ninguém atende o protocolo, ou o sistema
// recusa abrir), vai para a página de baixar a central.
//
// Sem Electron aqui (os testes rodam no Node): o main.cjs injeta `temCentral` (app.getApplicationNameForProtocol) e
// `abrir` (shell.openExternal). Arquivo igual em todos os apps de computador dos produtos.

const PAGINA_DA_CENTRAL = 'https://absolutezro.com/baixar'
const ESQUEMA_DA_CENTRAL = 'absolutezro'
const APPS = ['sobedesce', 'synquei', 'maestro', 'relay', 'carro-do-freela', 'tpeasy', 'rift-motion']
const ACOES = ['atualizar', 'instalar']

/** absolutezro://apps/<id>?acao=<acao>, só para os apps e ações do contrato com a central. */
function linkDaCentral(id, acao = 'atualizar') {
  if (!APPS.includes(id)) throw new Error(`app fora da central: ${id}`)
  if (!ACOES.includes(acao)) throw new Error(`ação fora da central: ${acao}`)
  return `${ESQUEMA_DA_CENTRAL}://apps/${id}?acao=${acao}`
}

/**
 * Abre a central no app (deep link); sem central, a página de baixar. Nunca lança.
 * @param {string} id
 * @param {{ temCentral: () => boolean, abrir: (url: string) => Promise<unknown> | unknown, acao?: string }} o
 * @returns {Promise<'central'|'pagina'>}
 */
async function abrirNaCentral(id, { temCentral, abrir, acao = 'atualizar' }) {
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

module.exports = { PAGINA_DA_CENTRAL, ESQUEMA_DA_CENTRAL, APPS, linkDaCentral, abrirNaCentral }
