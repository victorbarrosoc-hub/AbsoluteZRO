// Nome e marca do produto num lugar só: AEON, "Time is yours." (escolhidos pelo titular em 26/10/2026). Troque aqui
// e o app, a janela, o instalador, o site e os textos mudam juntos. As cores ficam em app/editor.css (--produto e
// --produto-2, que apontam para --p-ai-edit e --p-ai-edit-2 da Absolute ZRO) e a geometria da marca em src/marca.js.

export const PRODUTO = Object.freeze({
  /** id técnico no ecossistema (catálogo, contratos, eventos): não muda com o nome. */
  id: 'ai-edit',
  nome: 'AEON',
  assinatura: 'by Absolute ZRO',
  /** frase da marca (fica em inglês, como no material do titular) */
  frase: 'Time is yours.',
  /** o que o produto faz, em uma linha: editor completo; a IA é ajuda opcional (titular, 26/10/2026) */
  promessa: 'Edite do começo ao fim. A IA ajuda quando você quiser.',
  /** protocolo interno do app de desktop (aeon://app/...) e prefixo de arquivos */
  esquema: 'aeon',
  arquivo: 'AEON',
  appId: 'com.absolutezro.aeon',
  /** extensão do projeto salvo */
  extensao: '.aeon',
  /** o site (projeto Vercel autorizado pelo titular): página de instalação em /#baixar */
  site: 'https://aeon.absolutezro.com',
  repositorio: 'victorbarrosoc-hub/AbsoluteZRO',
  /** Release do GitHub com os instaladores (ADR 0013: tag com o prefixo do app) */
  release: 'ai-edit-app-desktop',
})
