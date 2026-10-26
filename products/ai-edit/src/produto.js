// Nome e marca do produto num lugar só. O nome é provisório (decisão do titular pendente): troque aqui e o app, a
// janela, o instalador e os textos mudam juntos. As cores ficam em app/tokens.css (--produto e --produto-2), que
// apontam para --p-ai-edit e --p-ai-edit-2 da Absolute ZRO.

export const PRODUTO = Object.freeze({
  /** id técnico no ecossistema (catálogo, contratos, eventos): não muda com o nome. */
  id: 'ai-edit',
  nome: 'AI Edit',
  provisorio: true,
  frase: 'A IA propõe. Você aprova.',
  /** protocolo interno do app de desktop (aiedit://app/...) e prefixo de arquivos */
  esquema: 'aiedit',
  arquivo: 'AI-Edit',
  appId: 'com.absolutezro.aiedit',
  /** extensão do projeto salvo */
  extensao: '.zroedit',
  repositorio: 'victorbarrosoc-hub/AbsoluteZRO',
  /** Release do GitHub com os instaladores (ADR 0013: tag com o prefixo do app) */
  release: 'ai-edit-app-desktop',
})
