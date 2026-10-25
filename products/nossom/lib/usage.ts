export type AudioUsage = {
  unit?: 'seconds';
  planId?: string;
  planName?: string;
  usedSeconds?: number;
  limitSeconds?: number | null;
  remainingSeconds?: number | null;
  allowed: boolean;
  used: number;
  remaining: number | null;
  limit: number | null;
  unlimited: boolean;
  resetAt: string;
  requestId?: string;
};
export function usageLabel(usage: AudioUsage) {
  return usage.unlimited
    ? 'ADM · tratamentos ilimitados'
    : usage.unit === 'seconds'
      ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format((usage.remainingSeconds ?? 0) / 60)} de ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format((usage.limitSeconds ?? 0) / 60)} min disponíveis neste mês`
      : 'Consultando a franquia mensal…';
}
