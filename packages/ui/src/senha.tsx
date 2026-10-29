'use client'
/**
 * Campo de senha com o olho para mostrar e esconder o que foi digitado (senha longa é difícil de conferir).
 * O olho fica dentro do campo, à direita: `type="button"` (nunca envia o form), `aria-pressed`, rótulo
 * "Mostrar senha"/"Ocultar senha". Clicar com o mouse não tira o foco do campo e o cursor volta ao mesmo lugar.
 * `autoComplete` e os demais atributos passam direto para o input. Classes em components.css (`.zro-senha`).
 */
import { useLayoutEffect, useRef, useState, type InputHTMLAttributes, type Ref } from 'react'

export const ROTULO_MOSTRAR = 'Mostrar senha'
export const ROTULO_OCULTAR = 'Ocultar senha'

export type CampoSenhaProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  ref?: Ref<HTMLInputElement>
  /** Classe extra da caixa que envolve input e olho. */
  caixa?: string
}

export function CampoSenha({ ref, caixa, disabled, ...props }: CampoSenhaProps) {
  const [visivel, setVisivel] = useState(false)
  const campo = useRef<HTMLInputElement | null>(null)
  const selecao = useRef<[number | null, number | null] | null>(null)

  // trocar o type pode mandar o cursor para o fim: devolve a seleção de antes, se o foco continuou no campo
  useLayoutEffect(() => {
    const el = campo.current
    const s = selecao.current
    selecao.current = null
    if (!el || !s || document.activeElement !== el) return
    try {
      el.setSelectionRange(s[0], s[1])
    } catch {
      /* alguns tipos não aceitam seleção */
    }
  }, [visivel])

  const ligar = (el: HTMLInputElement | null) => {
    campo.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  const alternar = () => {
    const el = campo.current
    if (el && document.activeElement === el) selecao.current = [el.selectionStart, el.selectionEnd]
    setVisivel((v) => !v)
  }

  return (
    <span className={caixa ? `zro-senha ${caixa}` : 'zro-senha'}>
      <input autoCapitalize="none" autoCorrect="off" spellCheck={false} {...props} disabled={disabled} ref={ligar} type={visivel ? 'text' : 'password'} />
      <button
        type="button"
        className="zro-senha__olho"
        aria-label={visivel ? ROTULO_OCULTAR : ROTULO_MOSTRAR}
        title={visivel ? ROTULO_OCULTAR : ROTULO_MOSTRAR}
        aria-pressed={visivel}
        aria-controls={props.id}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={alternar}
      >
        <OlhoSenha aberto={!visivel} />
      </button>
    </span>
  )
}

/** Olho aberto (senha escondida, clique para ver) ou riscado (senha à mostra). Traço em currentColor. */
export function OlhoSenha({ aberto, tamanho = 20 }: { aberto: boolean; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {aberto ? (
        <>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      )}
    </svg>
  )
}
