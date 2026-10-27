// A Z, a IA do ecossistema Absolute ZRO, no painel inicial do AEON (pedido do titular, 27/10/2026: a IA no painel
// inicial de todas as plataformas). É o mesmo <zro-ia> do HUB e de todos os apps. Não confundir com a ajuda de edição
// do próprio AEON (Whisper e regras do preset): a Z conversa e lê dados da conta; não edita nada.
//
// O token nunca chega aqui: o <zro-ia> fala com /api/zro/ia/*, que no site é o repasse da Vercel (api/_ia.js, token
// no cookie cifrado) e no app de computador é o próprio app (desktop/main.cjs, token na memória do processo principal).
// No site o componente vem de absolutezro.com (a mesma Z em todo lugar, atualizada lá); no app de computador, da cópia
// em vendor/ (npm run vendor): nenhum código de fora roda na janela que tem a ponte com o sistema.

import { desktop } from './ponte.js'

const HOSPEDADO = 'https://absolutezro.com/ia/v1/zro-ia.js'
const LOCAL = new URL('../vendor/ia/v1/zro-ia.js', import.meta.url).href
const SUGESTOES = ['Como corto silêncios no AEON?', 'Qual formato uso para Reels?', 'Como sigo do AEON para a Revela?', 'Quantos créditos de IA eu tenho?']

const temaDe = () => (document.documentElement.dataset.theme === 'light' ? 'claro' : 'escuro')

/** Monta a Z em `lugar` (a página Início). `volta`: para onde o "Entrar de novo" traz a pessoa. */
export async function montarZ(lugar, { volta = '/app/' } = {}) {
  const aviso = lugar.querySelector('.z-aviso')
  const mostrar = (texto, entrar = false) => {
    aviso.hidden = false
    aviso.querySelector('p').textContent = texto
    aviso.querySelector('a').hidden = !entrar
  }
  aviso.querySelector('a').href = `/api/zro/entrar?volta=${encodeURIComponent(volta)}`
  try {
    await import(desktop ? LOCAL : HOSPEDADO)
    await customElements.whenDefined('zro-ia')
  } catch {
    lugar.dataset.z = 'fora'
    return mostrar('A Z precisa de internet. O editor segue funcionando.')
  }
  const z = document.createElement('zro-ia')
  z.setAttribute('api', '/api/zro/ia')
  z.setAttribute('apoio', 'O que vamos editar hoje?')
  z.setAttribute('sugestoes', JSON.stringify(SUGESTOES))
  z.setAttribute('tema', temaDe())
  // sem sessão com a Z (login antigo sem o escopo zro.ia, ou o acesso caiu): entrar de novo já pede o escopo
  z.addEventListener('zro-ia:sem-login', () => {
    lugar.dataset.z = 'sem-login'
    mostrar('Entre de novo para conversar com a Z.', true)
  })
  new MutationObserver(() => z.setAttribute('tema', temaDe())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  lugar.dataset.z = 'pronta'
  lugar.prepend(z)
  return z
}
