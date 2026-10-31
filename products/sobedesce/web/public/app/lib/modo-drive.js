// Drive híbrido (titular, 31/10/2026; web/src/lib/google/vagas.ts). Cada Drive da conta vem do servidor com `modo`:
// - 'total': o Drive inteiro (escopo `drive`), como sempre foi.
// - 'arquivos' (Arquivos escolhidos, `drive.file`): o app só vê o que passou pelo SOBEDESCE (enviou ou criou) e o que
//   a pessoa escolher no Picker ("Escolher do Drive"). Uma pasta qualquer aparece pela metade: o resto existe, só
//   está invisível. Por isso, nesse modo, o que precisa da pasta inteira (navegar completo, somar tamanho, comparar,
//   backup, porta-malas) só vale nas pastas que o SOBEDESCE novo criou; nas outras fica desligado, com
//   "Precisa de acesso total". Nunca "falta subir" nem "pasta vazia" para o que só está invisível.
// Sem o campo (servidor antigo, modo Wi-Fi pelo computador): 'total', o comportamento de antes.

export const NOME_MODO = { total: 'Acesso total', arquivos: 'Arquivos escolhidos' }
export const PRECISA_TOTAL = 'Precisa de acesso total'

/** O modo de um Drive da conta (`drives[i]` do /api/eu). */
export function modoDe(drive) {
  return drive?.modo === 'arquivos' ? 'arquivos' : 'total'
}

/**
 * Marca das pastas que o SOBEDESCE cria (appProperties é por app: só o projeto Google do SOBEDESCE novo lê e grava).
 * As do servidor (Referências) usam outros valores de `sobedesce`; qualquer um vale como "criada pelo SOBEDESCE".
 */
export const MARCA_PASTA = { sobedesce: 'pasta' }

/** A pasta foi criada pelo SOBEDESCE novo? (`sd`: a marca já copiada para a trilha da aba Drive.) */
export function criadaPeloSobedesce(pasta) {
  if (!pasta) return false
  if (pasta.sd === true) return true
  const v = pasta.appProperties?.sobedesce
  return typeof v === 'string' && v.length > 0
}

/**
 * O lugar aberto mostra tudo o que tem? Acesso total: sempre. Arquivos escolhidos: só dentro de uma pasta criada pelo
 * SOBEDESCE (a raiz do Meu Drive, Compartilhados e Drives de equipe nunca são).
 */
export function lugarCompleto(modo, pasta) {
  if (modo !== 'arquivos') return true
  return criadaPeloSobedesce(pasta)
}

/**
 * Uma função que precisa da pasta inteira (comparar, backup, porta-malas, somar o tamanho): ligada ou, no modo
 * Arquivos escolhidos fora das pastas do SOBEDESCE, desligada com o motivo.
 */
export function funcaoDaPasta(modo, pasta) {
  return lugarCompleto(modo, pasta) ? { ligada: true, motivo: null } : { ligada: false, motivo: PRECISA_TOTAL }
}

/**
 * Comparar honesto: um arquivo do aparelho que não apareceu no Drive só é "falta subir" quando o lugar está completo.
 * Senão a resposta é "não sei" (pode estar lá, invisível para o app). Devolve 'no_drive' | 'falta_subir' | 'nao_sei'.
 */
export function situacaoDoLocal({ achouNoDrive, completo }) {
  if (achouNoDrive) return 'no_drive'
  return completo ? 'falta_subir' : 'nao_sei'
}

/** A lista de um lugar incompleto nunca diz "Pasta vazia": o que tem ali pode só estar invisível. */
export function vazioDoLugar(modo, pasta) {
  return lugarCompleto(modo, pasta)
    ? null
    : { titulo: PRECISA_TOTAL, texto: 'Aqui só aparece o que passou pelo SOBEDESCE ou que você escolheu. Toque em Escolher do Drive para trazer mais.' }
}

/** O que muda em cada modo (Ajustes e a dica recolhida da aba Drive). */
export const DICA_MODO = {
  total: ['O SOBEDESCE vê o Drive inteiro: navegar, comparar e fazer backup de qualquer pasta.'],
  arquivos: [
    'O SOBEDESCE vê o que você enviou ou criou por ele e o que você escolher em Escolher do Drive. Escolheu uma vez, fica liberado.',
    'Navegar, comparar e fazer backup ficam completos nas pastas criadas pelo SOBEDESCE. Nas outras, pedem acesso total.',
    'Arquivos do SOBEDESCE antigo também precisam ser escolhidos uma vez.',
  ],
}
