// Campo de senha (ou chave secreta) com o olho dentro, à direita: botão comum (nunca envia o form), aria-pressed e
// rótulo "Mostrar senha"/"Ocultar senha". Clicar não tira o foco do campo. O type é trocado direto no elemento
// (lib/senha.js) para o cursor ficar no lugar; o vnode continua "password" e o Preact não mexe nele.
import { html, useRef, useState } from '/vendor/preact-htm.js'
import { rotuloOlho, trocarVisibilidade } from '../lib/senha.js'
import { Icon } from './icons.js'

export function CampoSenha({ class: klass, nome = 'senha', ...props }) {
  const campo = useRef(null)
  const [visivel, setVisivel] = useState(false)
  const alternar = () => {
    const v = !visivel
    trocarVisibilidade(campo.current, v)
    setVisivel(v)
  }
  const rotulo = rotuloOlho(visivel, nome)
  return html`<span class="senha-campo">
    <input autocapitalize="none" autocorrect="off" spellcheck="false" ...${props} ref=${campo} class=${klass} type="password" />
    <button
      type="button"
      class="senha-olho"
      aria-label=${rotulo}
      title=${rotulo}
      aria-pressed=${visivel ? 'true' : 'false'}
      aria-controls=${props.id}
      disabled=${props.disabled}
      onMouseDown=${(e) => e.preventDefault()}
      onClick=${alternar}
    >
      <${Icon} name=${visivel ? 'eye-off' : 'eye'} size=${16} />
    </button>
  </span>`
}
