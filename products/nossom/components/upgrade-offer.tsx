'use client';
import { useEffect, useState } from 'react';
import { Gem, X } from 'lucide-react';
import { allowance, initialPlans, minutes, price, type Plan } from '@/lib/plans';
import type { AudioUsage } from '@/lib/usage';
export type UpgradeReason = 'low' | 'out' | 'blocked';
const next: Record<string, Plan['id']> = { free: 'essential', essential: 'studio' };
/** Next plan up, or none for the top plan and unlimited accounts. */
export function upgradeTarget(usage: AudioUsage | null) {
  if (!usage || usage.unlimited) return null;
  return next[usage.planId ?? 'free'] ?? null;
}
/**
 * Which offer the minutes justify: under 1 minute nothing more fits (every job uses at least
 * one); "low" is the last fifth of the month, or the last 2 minutes on a small allowance.
 */
export function upgradeReason(usage: AudioUsage | null): UpgradeReason | null {
  if (!upgradeTarget(usage)) return null;
  const limit = usage!.limitSeconds ?? 0,
    left = usage!.remainingSeconds ?? 0;
  if (!limit) return null;
  if (left < 60) return 'out';
  return left <= Math.max(limit * 0.2, 120) ? 'low' : null;
}
const titles: Record<UpgradeReason, string> = {
  low: 'Seus minutos estão acabando.',
  out: 'Seus minutos do mês acabaram.',
  blocked: 'Este áudio precisa de mais minutos.',
};
export default function UpgradeOffer({
  usage,
  reason,
  onClose,
  onChoose,
}: {
  usage: AudioUsage;
  reason: UpgradeReason;
  onClose: () => void;
  onChoose: (plan: Plan['id']) => void;
}) {
  const target = upgradeTarget(usage)!;
  const [plan, setPlan] = useState(() => initialPlans.find((p) => p.id === target)!);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/plans', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const found = Array.isArray(data.plans) && data.plans.find((p: Plan) => p.id === target);
        if (found) setPlan(found);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [target]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    addEventListener('keydown', close);
    return () => removeEventListener('keydown', close);
  }, [onClose]);
  const reset = Date.parse(usage.resetAt);
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section
        className="confirm-dialog upgrade-offer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        aria-describedby="upgrade-text"
      >
        <Gem size={27} />
        <h2 id="upgrade-title">{titles[reason]}</h2>
        <p id="upgrade-text">
          {reason === 'blocked'
            ? `Restam ${minutes(usage.remainingSeconds ?? 0)} min neste mês, menos do que este áudio usa.`
            : `Restam ${minutes(usage.remainingSeconds ?? 0)} de ${minutes(usage.limitSeconds ?? 0)} min neste mês.`}{' '}
          {Number.isFinite(reset) &&
            `Eles renovam dia ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Fortaleza' }).format(new Date(reset))}.`}
        </p>
        <div className="upgrade-plan lg">
          <div>
            <strong>{plan.name}</strong>
            <span>{allowance(plan.monthly_seconds)} de restauração por mês</span>
          </div>
          <span className="upgrade-price">
            <strong>{price(plan.price_cents)}</strong>/mês
          </span>
        </div>
        <div>
          <button className="button secondary" onClick={onClose}>
            Agora não
          </button>
          <button className="button primary" onClick={() => onChoose(plan.id)}>
            Ver o {plan.name}
          </button>
        </div>
        <button className="icon-button upgrade-close" aria-label="Fechar" onClick={onClose}>
          <X size={18} />
        </button>
      </section>
    </div>
  );
}
