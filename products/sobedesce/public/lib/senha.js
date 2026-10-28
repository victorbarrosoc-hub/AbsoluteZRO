// Olho do campo de senha/chave: mostra e esconde o que foi digitado sem perder o cursor.
// Sem dependências, para o componente (components/senha.js) e para o teste (test/senha.test.js).

export const MOSTRAR = 'Mostrar senha'
export const OCULTAR = 'Ocultar senha'

/** Rótulo do olho; `nome` troca "senha" por outra palavra (ex.: "chave" no client secret). */
export const rotuloOlho = (visivel, nome = 'senha') => `${visivel ? 'Ocultar' : 'Mostrar'} ${nome}`

/** Troca o campo entre escondido e à mostra; se o foco está nele, o cursor (ou a seleção) fica onde estava. */
export function trocarVisibilidade(campo, visivel, ativo = campo?.ownerDocument?.activeElement) {
  if (!campo) return
  const focado = ativo === campo
  const inicio = focado ? campo.selectionStart : null
  const fim = focado ? campo.selectionEnd : null
  campo.type = visivel ? 'text' : 'password'
  if (focado && inicio != null) {
    try {
      campo.setSelectionRange(inicio, fim)
    } catch {
      /* alguns tipos não aceitam seleção */
    }
  }
}
