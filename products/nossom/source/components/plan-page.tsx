'use client';
import { motion, useReducedMotion } from 'motion/react';
import PlanCards from './plan-cards';
import { usageLabel, type AudioUsage } from '@/lib/usage';
import { accountPlan, type Account } from '@/lib/accounts';
/** The person's plan, this month's minutes and the way up, in one screen. */
export default function PlanPage({
  account,
  usage,
  onUsage,
}: {
  account: Account;
  usage: AudioUsage | null;
  onUsage?: () => void;
}) {
  const reduced = useReducedMotion();
  const free = !usage?.planId || usage.planId === 'free';
  return (
    <motion.section
      className="plan-page"
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="studio-welcome">
        <div>
          <span className="eyebrow">SEU PLANO</span>
          <h1>
            {account.isAdmin ? 'Acesso ' : free ? 'Mais tempo para ' : 'Seu ritmo, '}
            <span className="text-gradient">
              {account.isAdmin ? 'ilimitado.' : free ? 'o seu som.' : 'sem pausa.'}
            </span>
          </h1>
          <p>
            {account.isAdmin
              ? 'A conta ADM não tem limite de minutos.'
              : free
                ? 'Faça upgrade para restaurar e isolar vozes por mais tempo todo mês.'
                : 'Acompanhe seus minutos e mude de plano quando quiser.'}
          </p>
        </div>
      </div>
      <div className="plan-summary lg" role="status">
        <div>
          <span className="plan-summary-label">Plano atual</span>
          <strong>{accountPlan(account, usage).replace(/^Plano /, '')}</strong>
        </div>
        <div className="plan-summary-usage">
          <span>{usage ? usageLabel(usage) : 'Consultando seus minutos…'}</span>
          {usage && !usage.unlimited && (
            <progress
              max={Math.max(1, usage.limit ?? 300)}
              value={usage.used}
              aria-label="Minutos usados ou reservados neste mês"
            />
          )}
        </div>
      </div>
      {account.isAdmin && (
        <p className="plan-admin-note">
          Visão do cliente: é assim que as contas veem os planos. Sua conta ADM continua ilimitada,
          com ou sem assinatura.
        </p>
      )}
      <PlanCards
        current={account.isAdmin ? undefined : usage?.planId}
        signedIn
        intro={false}
        onChange={onUsage}
      />
    </motion.section>
  );
}
