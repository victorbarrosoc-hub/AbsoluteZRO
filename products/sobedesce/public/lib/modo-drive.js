// Drive híbrido na interface do computador (docs/CONTAS.md §13). O motor aplica as regras (src/google/modo-drive.js);
// aqui ficam o nome do modo, os textos e o "Escolher do Drive". A marca e a regra são as mesmas do app do celular
// (web/public/app/lib/modo-drive.js), conferidas por test/modo-drive.test.js.
// - 'total': o Drive inteiro.
// - 'arquivos' (Arquivos escolhidos): o SOBEDESCE só vê o que passou por ele e o que a pessoa escolheu no Google
//   Picker. Uma pasta qualquer aparece pela metade: nunca "Pasta vazia" nem "falta subir" para o que só está invisível.
// Sem dependência do navegador (os testes rodam em Node); abrir o navegador fica em components/modo-drive.js.

export const NOME_MODO = { total: 'Acesso total', arquivos: 'Arquivos escolhidos' }
export const PRECISA_TOTAL = 'Precisa de acesso total'
export const MARCA_PASTA = { sobedesce: 'pasta' }

/** O modo de uma conta da lista (`accounts[i]`). Conta deste computador ou sem o campo: 'total'. */
export function modoDe(conta) {
  return conta?.modo === 'arquivos' ? 'arquivos' : 'total'
}

/** A pasta foi criada pelo SOBEDESCE novo? (DriveItem com `appProperties`.) */
export function criadaPeloSobedesce(pasta) {
  if (!pasta) return false
  if (pasta.sd === true) return true
  const v = pasta.appProperties?.sobedesce
  return typeof v === 'string' && v.length > 0
}

/** O que muda em cada modo (Ajustes e a dica recolhida da tela Drive). */
export const DICA_MODO = {
  total: ['O SOBEDESCE vê o Drive inteiro: navegar, comparar e somar o tamanho de qualquer pasta.'],
  arquivos: [
    'O SOBEDESCE vê o que você enviou ou criou por ele e o que você escolher em Escolher do Drive. Escolheu uma vez, fica liberado.',
    'Comparar e somar o tamanho ficam completos nas pastas criadas pelo SOBEDESCE. Nas outras, pedem acesso total.',
    'Arquivos do SOBEDESCE antigo também precisam ser escolhidos uma vez.',
  ],
}

/**
 * "Escolher do Drive": o Google Picker só abre numa página do site (a chave dele é presa ao endereço do site), então o
 * computador abre o SOBEDESCE no navegador já no Drive certo (/app/#escolher/<id da conta no site>), sem token nenhum
 * no endereço. O que a pessoa escolhe lá fica liberado também para este computador (o mesmo projeto Google): aparece
 * em Liberados. Conta deste computador (chave própria) não tem esse modo.
 */
export function urlEscolher(accountId, site) {
  const id = String(accountId || '')
  if (!id.startsWith('nuvem:')) return null
  const conta = id.slice('nuvem:'.length)
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(conta)) return null
  let base
  try {
    base = new URL(String(site))
  } catch {
    return null
  }
  if (base.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(base.hostname)) return null
  return `${base.origin}/app/#escolher/${conta}`
}
