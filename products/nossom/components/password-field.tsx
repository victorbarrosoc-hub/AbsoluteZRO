'use client';

/**
 * Campo de senha com o olho dentro, à direita, para conferir o que foi digitado. O olho é um botão comum
 * (`type="button"`, nunca envia o form) com `aria-pressed` e rótulo "Mostrar senha"/"Ocultar senha"; clicar não
 * tira o foco do campo e o cursor volta ao mesmo lugar. `autoComplete` e os demais atributos passam direto.
 */
import { Eye, EyeOff } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react';

export function PasswordField({
  disabled,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef<[number | null, number | null] | null>(null);

  // trocar o type pode mandar o cursor para o fim: devolve a seleção de antes, se o foco continuou no campo
  useLayoutEffect(() => {
    const el = input.current;
    const s = selection.current;
    selection.current = null;
    if (!el || !s || document.activeElement !== el) return;
    try {
      el.setSelectionRange(s[0], s[1]);
    } catch {
      /* alguns tipos não aceitam seleção */
    }
  }, [visible]);

  function toggle() {
    const el = input.current;
    if (el && document.activeElement === el)
      selection.current = [el.selectionStart, el.selectionEnd];
    setVisible((v) => !v);
  }

  const label = visible ? 'Ocultar senha' : 'Mostrar senha';
  return (
    <span className="account-password">
      <input
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...props}
        ref={input}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
      />
      <button
        type="button"
        className="account-password-toggle"
        aria-label={label}
        title={label}
        aria-pressed={visible}
        aria-controls={props.id}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      </button>
    </span>
  );
}
