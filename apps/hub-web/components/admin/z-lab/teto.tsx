'use client'
/**
 * O teto de gasto por dia do laboratório. Sem teto, nada que custa roda (a regra das quotas: sem limite configurado =
 * bloqueado). `compacto`: só o trilho e o número, para o topo do Testar.
 */
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { api, usd } from '@/lib/ia/lab/cliente'

export type Gasto = { hoje: number; mes: number; teto: number | null }

export function Teto({ gasto, compacto = false, onMudou }: { gasto: Gasto; compacto?: boolean; onMudou?: (teto: number | null) => void }) {
  const router = useRouter()
  const [editando, setEditando] = useState(gasto.teto == null && !compacto)
  const [valor, setValor] = useState(gasto.teto == null ? '' : String(gasto.teto).replace('.', ','))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const fracao = gasto.teto ? Math.min(1, gasto.hoje / gasto.teto) : gasto.teto === 0 ? 1 : 0

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const n = valor.trim() === '' ? null : Number(valor.replace(/\./g, '').replace(',', '.'))
    if (n != null && (!Number.isFinite(n) || n < 0)) return setErro('Use um valor em dólar, como 5 ou 2,50.')
    setSalvando(true)
    setErro(null)
    try {
      const r = await api<{ teto: number | null }>('/teto', { method: 'PUT', json: { teto: n } })
      onMudou?.(r.teto)
      setEditando(false)
      router.refresh()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  if (gasto.teto == null && compacto)
    return (
      <a className="zl-teto zl-teto--falta" href="/admin/laboratorio/configurar#teto">
        Defina o teto de hoje
      </a>
    )

  return (
    <div className="zl-teto" data-alerta={fracao >= 0.8 ? '' : undefined}>
      {!editando ? (
        <>
          <span className="zl-teto__linha">
            <strong>{usd(gasto.hoje)}</strong>
            <span>de {gasto.teto == null ? '—' : usd(gasto.teto)} hoje</span>
            {!compacto && (
              <button type="button" className="cst-link" onClick={() => setEditando(true)}>
                Mudar
              </button>
            )}
          </span>
          <span
            className="zl-teto__trilho"
            role="meter"
            aria-label="Gasto de hoje do laboratório"
            aria-valuemin={0}
            aria-valuemax={gasto.teto ?? 0}
            aria-valuenow={Math.min(gasto.hoje, gasto.teto ?? 0)}
          >
            <i style={{ transform: `scaleX(${fracao})` }} />
          </span>
          {!compacto && <span className="adm-hint">Este mês: {usd(gasto.mes)}</span>}
        </>
      ) : (
        <form className="zl-teto__form" onSubmit={salvar}>
          <label className="zro-field__label" htmlFor="zl-teto">
            Teto por dia (US$)
          </label>
          <div className="zl-teto__campos">
            <input
              id="zl-teto"
              className="zro-input"
              inputMode="decimal"
              placeholder="5,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className="glass-btn glass-btn--ink cst-btn" disabled={salvando} aria-busy={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
          {erro && (
            <p className="zro-field__error" role="alert">
              {erro}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
