'use client'
/**
 * Dólar dos Custos (/admin/custos, migração 0030): o valor que vale vem do Banco Central (PTAX de venda) sozinho; o
 * titular pode "Usar valor manual" e depois "Voltar ao automático". Falha do Banco Central mantém o último valor, com
 * a data dele. Nada inventado: sem nenhum valor, "Sem cotação".
 */
import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { CustosConfig } from '@zro/core'
import { atualizarDolarAction, salvarCotacaoManualAction, usarCotacaoAutomaticaAction } from '@/lib/actions/custos'
import { Folha } from './folha'

const numero = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
// Formatação local: componente de cliente não importa código do @zro/core (só tipos).
const reais = (v: number, casas: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
/** "R$ 5,34" no cartão; "R$ 5,3420" na folha (a PTAX tem 4 casas). */
const reais2 = (v: number) => reais(v, 2)
const reais4 = (v: number) => reais(v, 4)
/** "2026-10-28" → "28/10" */
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const quandoFoi = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** "Banco Central, 28/10", "Valor manual, 20/10" ou "Sem cotação". */
export function origemDoDolar(c: Pick<CustosConfig, 'cotacaoFonte' | 'cotacaoEm'>): string {
  const dia = c.cotacaoEm ? `, ${diaMes(c.cotacaoEm)}` : ''
  if (c.cotacaoFonte === 'bcb') return `Banco Central${dia}`
  if (c.cotacaoFonte === 'manual') return `Valor manual${dia}`
  return 'Sem cotação'
}

function Enviar({ rotulo, ink = false }: { rotulo: string; ink?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={`glass-btn cst-btn${ink ? ' glass-btn--ink' : ''}`} disabled={pending} aria-busy={pending}>
      {pending ? 'Um instante…' : rotulo}
    </button>
  )
}

export function DolarCustos({ config, hoje }: { config: CustosConfig; hoje: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" className="cst-cotacao" onClick={() => setAberto(true)} title={config.cotacao ? `US$ 1 = ${reais4(config.cotacao)}` : undefined}>
        {config.cotacao ? reais2(config.cotacao) : 'Sem cotação'}
      </button>
      {config.cotacao ? (
        <span className="kpi__hint cst-dolar__origem" data-fonte={config.cotacaoFonte}>
          {origemDoDolar(config)}
        </span>
      ) : null}
      {aberto && <Painel config={config} hoje={hoje} onFechar={() => setAberto(false)} />}
    </>
  )
}

function Painel({ config, hoje, onFechar }: { config: CustosConfig; hoje: string; onFechar: () => void }) {
  const manual = config.cotacaoModo === 'manual'
  const [editando, setEditando] = useState(manual && !config.cotacaoManual)
  const [salvo, salvar] = useActionState(salvarCotacaoManualAction, null)
  const [auto, voltar] = useActionState(usarCotacaoAutomaticaAction, null)
  const [busca, buscar] = useActionState(atualizarDolarAction, null)
  useEffect(() => {
    if (salvo?.ok || auto?.ok) onFechar()
  }, [salvo, auto, onFechar])

  return (
    <Folha titulo="Dólar" onFechar={onFechar}>
      <div className="cst-dolar">
        <p className="cst-dolar__valor">
          <strong>{config.cotacao ? reais4(config.cotacao) : '—'}</strong>
          <span>{config.cotacao ? origemDoDolar(config) : 'Sem cotação ainda'}</span>
        </p>

        {!manual && config.cotacaoAutoErro && (
          <p className="cst-dolar__falha" role="status">
            O Banco Central não respondeu{config.cotacaoAutoErroEm ? ` em ${quandoFoi(config.cotacaoAutoErroEm)}` : ''}.{' '}
            {config.cotacao ? 'Fica a última cotação.' : 'Use um valor manual por enquanto.'}
          </p>
        )}
        {manual && config.cotacaoAuto && (
          <p className="adm-hint">
            Banco Central: {reais4(config.cotacaoAuto)}
            {config.cotacaoAutoEm ? ` em ${diaMes(config.cotacaoAutoEm)}` : ''}.
          </p>
        )}

        <div className="cst-dolar__acoes">
          {manual ? (
            <form action={voltar}>
              <Enviar rotulo="Voltar ao automático" ink />
            </form>
          ) : (
            <form action={buscar}>
              <Enviar rotulo="Atualizar agora" />
            </form>
          )}
          {!editando && (
            <button type="button" className="cst-link" onClick={() => setEditando(true)}>
              {manual ? 'Mudar valor manual' : 'Usar valor manual'}
            </button>
          )}
        </div>
        {(auto?.error || busca?.error) && (
          <p className="zro-field__error" role="alert">
            {auto?.error ?? busca?.error}
          </p>
        )}
        {busca?.ok && (
          <p className="adm-hint" role="status">
            {busca.ok}
          </p>
        )}

        {editando && (
          <form action={salvar} className="zro-form cst-form">
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
                  defaultValue={numero(config.cotacaoManual ?? config.cotacao)}
                  placeholder="0,00"
                  autoComplete="off"
                  autoFocus
                  required
                />
              </div>
              <div className="zro-field">
                <label className="zro-field__label" htmlFor="cfg-cotacao-em">
                  Cotação de
                </label>
                <input className="zro-input" id="cfg-cotacao-em" name="cotacaoEm" type="date" max={hoje} defaultValue={config.cotacaoManualEm ?? hoje} />
              </div>
            </div>
            <div className="cst-form__fim">
              <Enviar rotulo="Usar este valor" ink />
              {salvo?.error && (
                <p className="zro-field__error" role="alert">
                  {salvo.error}
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </Folha>
  )
}
