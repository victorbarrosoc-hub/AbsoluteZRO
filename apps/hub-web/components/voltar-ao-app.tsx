'use client'
import { useState, useTransition } from 'react'
import { emitirCodigoDoAppAction } from '@/lib/actions/desktop-login'

/**
 * Botão da tela "Voltar para o app" (ADR 0041). O clique emite o código de uso único e abre o deep link do app; o link
 * visível fica de reserva, para quando o navegador não abre o app sozinho.
 */
export function VoltarAoApp({ app, state, challenge, next, nome }: { app: string; state: string; challenge: string; next: string | null; nome: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, comecar] = useTransition()

  const emitir = () =>
    comecar(async () => {
      setErro(null)
      const fd = new FormData()
      fd.set('app', app)
      fd.set('state', state)
      fd.set('challenge', challenge)
      if (next) fd.set('next', next)
      const r = await emitirCodigoDoAppAction(fd)
      if (r.url) {
        setUrl(r.url)
        window.location.assign(r.url)
      } else setErro(r.erro ?? 'Não deu certo. Tente de novo.')
    })

  return (
    <div className="stack">
      <button className="glass-btn glass-btn--ink" type="button" onClick={emitir} disabled={pendente}>
        {pendente ? 'Abrindo…' : `Voltar para o ${nome}`}
      </button>
      {url && (
        <p className="zro-faint" role="status">
          Se o {nome} não abriu, <a href={url}>toque aqui</a>. O código vale 1 minuto.
        </p>
      )}
      {erro && (
        <p className="zro-field__error" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}
