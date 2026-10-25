/** Owner-only billing data. Never return API keys or raw provider errors. */
export type ProviderBalances = {
  checkedAt: string;
  runpod: { balanceUsd: number | null; spendUsdHour: number | null; message: string };
  claude: { balanceUsd: null; message: string };
};
let cached: { until: number; value: ProviderBalances } | null = null;
let pending: Promise<ProviderBalances> | null = null;
export async function providerBalances(): Promise<ProviderBalances> {
  if (cached && cached.until > Date.now()) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    const runpod: ProviderBalances['runpod'] = {
      balanceUsd: null,
      spendUsdHour: null,
      message: 'Configure a conexão RunPod para consultar o saldo.',
    };
    if (process.env.RUNPOD_API_KEY) {
      try {
        const response = await fetch('https://api.runpod.io/graphql', {
          method: 'POST',
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
          },
          body: JSON.stringify({
            query: 'query NossomBalance { myself { clientBalance currentSpendPerHr } }',
          }),
        });
        const data = await response.json();
        if (
          !response.ok ||
          data.errors ||
          typeof data.data?.myself?.clientBalance !== 'number' ||
          !Number.isFinite(data.data.myself.clientBalance)
        )
          throw new Error('Unavailable');
        runpod.balanceUsd = data.data.myself.clientBalance;
        const spend = data.data.myself.currentSpendPerHr;
        runpod.spendUsdHour =
          typeof spend === 'number' && Number.isFinite(spend) && spend >= 0 ? spend : null;
        runpod.message = 'Saldo informado pela RunPod. Valores em dólar americano.';
      } catch {
        runpod.message =
          'Saldo indisponível agora. Confira no console RunPod; a chave conectada pode não ter acesso ao faturamento.';
      }
    }
    const value: ProviderBalances = {
      checkedAt: new Date().toISOString(),
      runpod,
      claude: {
        balanceUsd: null,
        message:
          'A integração atual do Claude não informa o saldo de créditos. Consulte o valor no console Anthropic.',
      },
    };
    cached = { until: Date.now() + 60000, value };
    return value;
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
