'use client';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ArrowUpRight } from 'lucide-react';
import type { ProviderBalances as Balances } from '@/lib/server/provider-balances';
const usd = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(value);
export default function ProviderBalances() {
  const [data, setData] = useState<Balances | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/billing', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível consultar os saldos.');
      setData(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="provider-balances" aria-label="Créditos dos serviços">
      <div className="provider-balances-heading">
        <h2>Seus créditos nos serviços</h2>
        <button className="button secondary small" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} /> {loading ? 'Consultando…' : 'Atualizar saldos'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="provider-balances-grid">
        <article>
          <h3>RunPod</h3>
          <strong>
            {data?.runpod.balanceUsd !== null && data?.runpod.balanceUsd !== undefined
              ? usd(data.runpod.balanceUsd)
              : loading
                ? 'Consultando…'
                : 'Saldo indisponível'}
          </strong>
          <p>{data?.runpod.message || 'Créditos disponíveis para processamento.'}</p>
          {data?.runpod.spendUsdHour !== null && data?.runpod.spendUsdHour !== undefined && (
            <p>Consumo atual da conta: {usd(data.runpod.spendUsdHour)}/hora</p>
          )}
          <a
            className="text-link"
            href="https://console.runpod.io/billing"
            target="_blank"
            rel="noreferrer"
          >
            Abrir RunPod <ArrowUpRight size={15} />
          </a>
        </article>
        <article>
          <h3>Claude · Anthropic</h3>
          <strong>Consultar no console</strong>
          <p>
            {data?.claude.message ||
              'O saldo de créditos não está disponível pela integração atual.'}
          </p>
          <a
            className="text-link"
            href="https://console.anthropic.com/settings/billing"
            target="_blank"
            rel="noreferrer"
          >
            Ver créditos do Claude <ArrowUpRight size={15} />
          </a>
        </article>
      </div>
      {data && (
        <small>
          Consulta em{' '}
          {new Date(data.checkedAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })} ·
          Atualização disponível a cada minuto. O saldo da RunPod inclui a conta inteira.
        </small>
      )}
    </section>
  );
}
