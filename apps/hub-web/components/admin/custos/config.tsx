'use client'
/** Cotação do dólar e metas (/admin/custos): um botão que abre a folha. Só o titular informa; nada vem preenchido. */
import { useActionState, useEffect, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import type { CustosConfig } from '@zro/core'
import { salvarConfigCustosAction } from '@/lib/actions/custos'
import { Folha } from './folha'

const numero = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="glass-btn glass-btn--ink cst-btn" disabled={pending} aria-busy={pending}>
      {pending ? 'Salvando…' : 'Salvar'}
    </button>
  )
}

export function ConfigCustos({
  config,
  hoje,
  children,
  className = 'cst-link',
}: {
  config: CustosConfig
  hoje: string
  children: ReactNode
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setAberto(true)}>
        {children}
      </button>
      {aberto && <Formulario config={config} hoje={hoje} onFechar={() => setAberto(false)} />}
    </>
  )
}

function Formulario({ config, hoje, onFechar }: { config: CustosConfig; hoje: string; onFechar: () => void }) {
  const [state, action] = useActionState(salvarConfigCustosAction, null)
  useEffect(() => {
    if (state?.ok) onFechar()
  }, [state, onFechar])
  return (
    <Folha titulo="Cotação e metas" onFechar={onFechar}>
      <form action={action} className="zro-form cst-form">
        <div className="zro-form-row">
          <div className="zro-field">
            <label className="zro-field__label" htmlFor="cfg-cotacao">
              US$ 1 em reais
            </label>
            <input
              className="zro-input"
              id="cfg-cotacao"
              name="cotacao"
              inputMode="decimal"
              defaultValue={numero(config.cotacao)}
              placeholder="0,00"
              autoComplete="off"
            />
          </div>
          <div className="zro-field">
            <label className="zro-field__label" htmlFor="cfg-cotacao-em">
              Cotação de
            </label>
            <input className="zro-input" id="cfg-cotacao-em" name="cotacaoEm" type="date" defaultValue={config.cotacaoEm ?? hoje} />
          </div>
        </div>
        <div className="zro-form-row">
          <div className="zro-field">
            <label className="zro-field__label" htmlFor="cfg-receita">
              Meta de receita por mês (R$)
            </label>
            <input
              className="zro-input"
              id="cfg-receita"
              name="metaReceitaMensal"
              inputMode="decimal"
              defaultValue={numero(config.metaReceitaMensal)}
              autoComplete="off"
            />
          </div>
          <div className="zro-field">
            <label className="zro-field__label" htmlFor="cfg-assinantes">
              Meta de assinantes
            </label>
            <input
              className="zro-input"
              id="cfg-assinantes"
              name="metaAssinantes"
              inputMode="numeric"
              defaultValue={config.metaAssinantes ?? ''}
              autoComplete="off"
            />
          </div>
        </div>
        <div className="zro-field">
          <label className="zro-field__label" htmlFor="cfg-alvo">
            Data-alvo
          </label>
          <input className="zro-input" id="cfg-alvo" name="dataAlvo" type="date" defaultValue={config.dataAlvo ?? ''} />
        </div>
        <div className="cst-form__fim">
          <Enviar />
          {state?.error && (
            <p className="zro-field__error" role="alert">
              {state.error}
            </p>
          )}
        </div>
      </form>
    </Folha>
  )
}
