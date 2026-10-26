'use client'
/**
 * Avulso numa janela só: a pessoa marca um ou mais apps e o valor vai somando (mensal e anual; o par de rádios da
 * página escolhe qual aparece). Passando do preço do Completo, avisa que o Completo sai mais barato. Enquanto as
 * vendas não abrem, o botão leva para baixar os apps escolhidos; com as vendas, para assinar.
 */
import { useState, type CSSProperties } from 'react'
import { ProductMark } from '@zro/ui'

export type AvulsoApp = { id: string; name: string; color: CSSProperties }

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })

export function AvulsoSeletor({
  apps,
  mes,
  ano,
  completoMes,
  completoAno,
  creditos,
  vendas,
}: {
  apps: AvulsoApp[]
  /** preço de um app avulso, em centavos */
  mes: number
  ano: number | null
  completoMes: number | null
  completoAno: number | null
  /** créditos de IA e GPU por app avulso, por mês */
  creditos: number
  /** vendas ligadas: o botão vai para assinar */
  vendas: boolean
}) {
  const [marcados, setMarcados] = useState<string[]>([])
  const n = marcados.length
  const totalMes = mes * Math.max(n, 1)
  const totalAno = ano ? ano * Math.max(n, 1) : null
  const vira = (id: string) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
  const destino = vendas ? '/perfil/plano' : `/baixar${n ? `?apps=${marcados.join(',')}` : ''}#absolute-zro`
  const completoMelhorMes = completoMes != null && n > 1 && totalMes >= completoMes
  const completoMelhorAno = completoAno != null && totalAno != null && n > 1 && totalAno >= completoAno

  return (
    <>
      <div className="tier__price when-month" aria-live="polite">
        <span className="tier__amount">{brl(totalMes)}</span>
        <span className="tier__per">/mês</span>
      </div>
      <div className="tier__price when-year" aria-live="polite">
        {totalAno ? (
          <>
            <span className="tier__amount">{brl(totalAno)}</span>
            <span className="tier__per">/ano</span>
          </>
        ) : (
          <span className="tier__per">Só mensal</span>
        )}
      </div>
      <p className="tier__sub">{n === 0 ? `${brl(mes)} por app. Escolha abaixo.` : `${n} ${n === 1 ? 'app' : 'apps'} · ${brl(mes)} cada`}</p>

      {creditos > 0 && (
        <p className="tier__credits" title="Uso comum é livre. Só IA e processamento em GPU gastam créditos, que renovam todo mês.">
          <strong>{creditos.toLocaleString('pt-BR')}</strong>
          <span>créditos de IA e GPU por mês</span>
        </p>
      )}

      <div className="tier__apps">
        <p className="tier__label">Escolha os apps</p>
        <ul className="avulso__lista">
          {apps.map((a) => {
            const on = marcados.includes(a.id)
            return (
              <li key={a.id} style={a.color}>
                <button type="button" className="avulso__app" aria-pressed={on} onClick={() => vira(a.id)} title={a.name}>
                  <ProductMark productId={a.id} name={a.name} size={40} />
                  <span>{a.name}</span>
                  <i className="avulso__check" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {(completoMelhorMes || completoMelhorAno) && (
        <p className="tier__note avulso__dica">
          <span className={completoMelhorMes ? 'when-month' : 'when-year'}>Com {n} apps, o Completo sai mais barato e leva todos.</span>
        </p>
      )}

      <a className={`glass-btn glass-btn--ink tier__cta${n === 0 ? ' is-off' : ''}`} href={destino} aria-disabled={n === 0}>
        {vendas ? 'Assinar' : n > 1 ? `Baixar ${n} apps` : 'Baixar'}
      </a>
    </>
  )
}
