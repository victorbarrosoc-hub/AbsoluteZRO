'use client'
/**
 * Excluir a conta em duas etapas: 1) a senha atual (ou, sem senha, o e-mail); 2) uma tela que diz o que acontece e
 * pede a confirmação. A senha fica só na memória desta tela, nunca no HTML; o servidor confere tudo de novo no fim.
 */
import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Field } from '@zro/ui'
import type { FormState } from './action-form'

type Acao = (prev: FormState, fd: FormData) => Promise<FormState>

export function ExcluirConta({ confirmarCom, email, conferir, excluir }: { confirmarCom: 'senha' | 'email'; email: string; conferir: Acao; excluir: Acao }) {
  const valor = useRef('')
  const [etapa, setEtapa] = useState<1 | 2>(1)
  const [conferido, conferirAction] = useActionState(async (prev: FormState, fd: FormData) => {
    valor.current = String(fd.get('confirmacao') ?? '')
    const r = await conferir(prev, fd)
    if (r?.ok) setEtapa(2)
    return r
  }, null)
  const [excluido, excluirAction] = useActionState(async (prev: FormState) => {
    const fd = new FormData()
    fd.set('confirmacao', valor.current)
    return excluir(prev, fd)
  }, null)

  if (etapa === 2) {
    return (
      <form action={excluirAction} className="excluir excluir--confirmar" aria-labelledby="excluir-confirmar-titulo">
        <h2 id="excluir-confirmar-titulo" className="excluir__titulo">
          Excluir a conta <strong>de vez?</strong>
        </h2>
        <p className="zro-mute">Seu acesso a todos os apps acaba agora e as organizações só suas são encerradas. Não dá para desfazer.</p>
        <div className="excluir__acoes">
          <Enviar texto="Excluir conta" enviando="Excluindo…" variante="danger" />
          <button
            type="button"
            className="zro-btn zro-btn--ghost"
            onClick={() => {
              valor.current = ''
              setEtapa(1)
            }}
          >
            Cancelar
          </button>
        </div>
        {excluido?.error && (
          <p className="zro-field__error" role="alert">
            {excluido.error}
          </p>
        )}
      </form>
    )
  }

  return (
    <form action={conferirAction} className="excluir">
      {confirmarCom === 'senha' ? (
        <Field label="Senha atual" htmlFor="excluir-confirmacao">
          <input className="zro-input" id="excluir-confirmacao" name="confirmacao" type="password" autoComplete="current-password" required />
        </Field>
      ) : (
        <Field label="Digite seu e-mail" htmlFor="excluir-confirmacao" hint={email}>
          <input className="zro-input" id="excluir-confirmacao" name="confirmacao" type="email" autoComplete="off" spellCheck={false} required />
        </Field>
      )}
      <div className="excluir__acoes">
        <Enviar texto="Continuar" enviando="Conferindo…" variante="primary" />
        <Link className="zro-btn zro-btn--ghost" href="/perfil/seguranca">
          Voltar
        </Link>
      </div>
      {conferido?.error && (
        <p className="zro-field__error" role="alert">
          {conferido.error}
        </p>
      )}
    </form>
  )
}

function Enviar({ texto, enviando, variante }: { texto: string; enviando: string; variante: 'primary' | 'danger' }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={`zro-btn zro-btn--${variante}`} disabled={pending} aria-busy={pending}>
      {pending ? enviando : texto}
    </button>
  )
}
