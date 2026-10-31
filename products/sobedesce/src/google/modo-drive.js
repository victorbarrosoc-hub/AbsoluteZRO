// Drive híbrido no app de computador (docs/CONTAS.md §13). Cada Drive da conta SOBEDESCE vem do site com `modo`:
// - 'total': o Drive inteiro (escopo `drive`), como sempre foi.
// - 'arquivos' (Arquivos escolhidos, `drive.file`): o app só vê o que passou pelo SOBEDESCE (enviou ou criou) e o que
//   a pessoa escolheu no Google Picker. Uma pasta qualquer aparece pela metade: o resto existe, só está invisível.
// Por isso, nesse modo, o que precisa da pasta inteira (comparar, somar o tamanho, copiar de um link) só vale nas pastas
// que o SOBEDESCE novo criou; nas outras, "Precisa de acesso total". Nunca "falta subir" nem "pasta vazia" para o que
// só está invisível.
// As regras e a marca são AS MESMAS do app do celular (web/public/app/lib/modo-drive.js), conferidas por
// test/modo-drive.test.js. Contas conectadas só neste computador (chave própria) e servidor antigo: 'total'.

export const NOME_MODO = Object.freeze({ total: 'Acesso total', arquivos: 'Arquivos escolhidos' })
export const PRECISA_TOTAL = 'Precisa de acesso total'

/**
 * O que este app diz ao site (cabeçalho x-sobedesce-capacidades): "entendo o modo Arquivos escolhidos". Sem ela, o
 * site recusa o token drive.file ao computador (o app antigo daria resultado falso).
 */
export const CAPACIDADE_MODO = 'drive-arquivos'

/** O modo de um Drive (`modo` do site). Qualquer outra coisa (sem o campo, conta local): 'total'. */
export function modoDe(conta) {
  return conta?.modo === 'arquivos' ? 'arquivos' : 'total'
}

/**
 * Marca das pastas que o SOBEDESCE cria (appProperties é por app: só o projeto Google do SOBEDESCE lê e grava). A
 * mesma do celular. As do servidor (Referências) usam outros valores de `sobedesce`; qualquer um vale.
 */
export const MARCA_PASTA = Object.freeze({ sobedesce: 'pasta' })

/** A pasta foi criada pelo SOBEDESCE novo? (DriveItem com `appProperties`, ou `sd` já calculado.) */
export function criadaPeloSobedesce(pasta) {
  if (!pasta) return false
  if (pasta.sd === true) return true
  const v = pasta.appProperties?.sobedesce
  return typeof v === 'string' && v.length > 0
}

/**
 * O lugar mostra tudo o que tem? Acesso total: sempre. Arquivos escolhidos: só uma pasta criada pelo SOBEDESCE (a raiz
 * do Meu Drive, Compartilhados comigo e Drives de equipe nunca são).
 */
export function lugarCompleto(modo, pasta) {
  if (modo !== 'arquivos') return true
  return criadaPeloSobedesce(pasta)
}

/** Erro "Precisa de acesso total" (403, `code`): a rota devolve a mensagem, a tela mostra o motivo. */
export function erroPrecisaTotal(detalhe = 'Em Arquivos escolhidos, o SOBEDESCE só vê a pasta inteira quando foi ele que a criou.') {
  const err = new Error(`${PRECISA_TOTAL}. ${detalhe}`)
  err.status = 403
  err.code = 'precisa_acesso_total'
  return err
}
