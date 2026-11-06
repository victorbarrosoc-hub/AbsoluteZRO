// Estúdio (aba do celular, como a do computador desde a 0.3.6): Frames · Montagens · Referências nas seções do topo,
// o mesmo controle de pílulas do app de computador. Por dentro, Frames e Montagens moram na tela Criar
// (components/criar.js, `criarTela`) e Referências na tela dela (components/referencias.js, aba 'refs'): as seções só
// trocam entre elas, sem perder o trabalho de nenhuma.
import { html } from '../vendor/preact-htm.js'
import { setState, setTab, useApp } from '../lib/state.js'
import { Icon } from './icons.js'
import { cx } from './ui.js'

export const SECOES_ESTUDIO = [
  { id: 'frames', label: 'Frames', icon: 'stack' },
  { id: 'montagens', label: 'Montagens', icon: 'grid' },
  { id: 'refs', label: 'Referências', icon: 'bookmark', recurso: 'referencias' },
]

/** A seção do Estúdio aberta agora (ou null fora do Estúdio). */
export function secaoDoEstudio(s) {
  if (s.tab === 'refs') return 'refs'
  if (s.tab !== 'criar') return null
  return s.criarTela === 'montagens' ? 'montagens' : s.criarTela === 'calc' ? 'calc' : 'frames'
}

export function irParaSecao(id) {
  if (id === 'refs') return setTab('refs')
  setState({ criarTela: id })
  setTab('criar')
  window.scrollTo(0, 0)
}

export function EstudioSecoes() {
  const { atual, recursos } = useApp((s) => ({ atual: secaoDoEstudio(s), recursos: s.recursos }))
  const secoes = SECOES_ESTUDIO.filter((x) => !x.recurso || recursos?.[x.recurso])
  return html`<nav class="est-secoes" aria-label="Estúdio">
    ${secoes.map(
      (x) => html`<button type="button" class=${cx('est-secao', atual === x.id && 'is-on')} aria-current=${atual === x.id ? 'page' : undefined} onClick=${() => irParaSecao(x.id)}>
        <${Icon} name=${x.icon} size=${15} strokeWidth=${1.9} /><span>${x.label}</span>
      </button>`,
    )}
  </nav>`
}
