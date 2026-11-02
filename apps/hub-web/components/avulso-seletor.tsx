'use client'
/**
 * Avulso (ADR 0040): o Absoluto num app só. A pessoa toca no app e o botão leva a ele (mensal ou anual, conforme o par
 * de rádios da página). Com as vendas abertas, vai para assinar em Sua conta › Plano; fechadas, para baixar o app.
 */
import { useState, type CSSProperties } from 'react'
import { ProductMark } from '@zro/ui'
import { brl } from '@/lib/labels'

export type AvulsoApp = { id: string; name: string; color: CSSProperties }

export function AvulsoSeletor({
  apps,
  mes,
  ano,
  z,
  vendas,
}: {
  apps: AvulsoApp[]
  /** preço de um app avulso, em centavos */
  mes: number
  ano: number | null
  /** mensagens da Z por mês no avulso */
  z: number | null
  /** vendas abertas (chaves do Stripe no ambiente): o botão vai para assinar */
  vendas: boolean
}) {
  const [app, setApp] = useState<string | null>(null)
  const nome = apps.find((a) => a.id === app)?.name
  const destino = (ciclo: 'mes' | 'ano') =>
    vendas ? `/perfil/plano?plano=avulso&ciclo=${ciclo}${app ? `&app=${app}` : ''}#assinar` : `/baixar${app ? `?apps=${app}` : ''}#absolute-zro`
  const rotulo = vendas ? (nome ? `Assinar ${nome}` : 'Assinar') : nome ? `Baixar ${nome}` : 'Baixar'

  return (
    <>
      <div className="tier__price when-month">
        <span className="tier__amount">{brl(mes)}</span>
        <span className="tier__per">/mês</span>
      </div>
      <div className="tier__price when-year">
        {ano ? (
          <>
            <span className="tier__amount">{brl(ano)}</span>
            <span className="tier__per">/ano</span>
          </>
        ) : (
          <span className="tier__per">Só mensal</span>
        )}
      </div>
      <p className="tier__sub" aria-live="polite">
        {nome ? `${nome} inteiro, no Absoluto.` : 'Um app, no Absoluto.'}
      </p>

      {z != null && z > 0 && (
        <p className="tier__credits" title="Cada mensagem da Z conta uma. A franquia renova todo mês.">
          <strong>{z.toLocaleString('pt-BR')}</strong>
          <span>mensagens da Z por mês</span>
        </p>
      )}

      <div className="tier__apps">
        <p className="tier__label">Escolha o app</p>
        <ul className="avulso__lista">
          {apps.map((a) => (
            <li key={a.id} style={a.color}>
              <button type="button" className="avulso__app" aria-pressed={app === a.id} onClick={() => setApp(app === a.id ? null : a.id)} title={a.name}>
                <ProductMark productId={a.id} name={a.name} size={40} />
                <span>{a.name}</span>
                <i className="avulso__check" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {(['mes', 'ano'] as const).map((ciclo) => (
        <a
          key={ciclo}
          className={`glass-btn tier__cta ${ciclo === 'mes' ? 'when-month' : 'when-year'}${app ? '' : ' is-off'}`}
          href={destino(ciclo)}
          aria-disabled={!app}
        >
          {rotulo}
        </a>
      ))}
    </>
  )
}
