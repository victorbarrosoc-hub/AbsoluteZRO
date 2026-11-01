'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, LoaderCircle } from 'lucide-react';
import { allowance, initialPlans, price, type Plan } from '@/lib/plans';
type Subscription = {
  planId: 'essential' | 'studio' | null;
  status: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
} | null;
const live = (s: Subscription) =>
  !!s && (s.status === 'active' || s.status === 'trialing' || s.status === 'past_due');
const day = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(iso))
    : '';
/**
 * Plan catalog. On the homepage it leads to the account; inside the account it opens Stripe
 * Checkout, changes plan or opens Stripe's page to manage the subscription. Until payments are
 * configured, paid plans keep the manual activation request.
 */
export default function PlanCards({
  current,
  signedIn = false,
  intro = true,
  onChange,
}: {
  current?: string;
  signedIn?: boolean;
  intro?: boolean;
  onChange?: () => void;
}) {
  const [plans, setPlans] = useState(initialPlans),
    [enabled, setEnabled] = useState(false),
    [subscription, setSubscription] = useState<Subscription>(null),
    [busy, setBusy] = useState(''),
    [confirm, setConfirm] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const section = useRef<HTMLElement>(null);
  async function load() {
    const data = await fetch('/api/subscription', { cache: 'no-store' })
      .then((r) => r.json())
      .catch(() => ({}));
    setEnabled(data.enabled === true);
    setSubscription(data.subscription ?? null);
    return data.subscription as Subscription;
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/plans', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.plans) && data.plans.length === 3) setPlans(data.plans);
      })
      .catch(() => {});
    void load().then(async (loaded) => {
      if (!signedIn) return;
      const params = new URLSearchParams(location.search);
      if (params.get('plano')) section.current?.scrollIntoView({ block: 'start' });
      if (params.get('assinatura') === 'cancelada')
        setMessage('Pagamento não concluído. Nada foi cobrado.');
      if (params.get('assinatura') !== 'ok') return;
      history.replaceState(null, '', location.pathname);
      // Stripe confirms by webhook, usually within seconds; show the plan only once it is real.
      setMessage('Pagamento recebido. Ativando seu plano…');
      for (let i = 0; i < 15 && !live(loaded); i++) {
        await new Promise((r) => setTimeout(r, 2000));
        loaded = await load();
      }
      setMessage(
        live(loaded)
          ? 'Pagamento confirmado. Seu plano já está valendo.'
          : 'Pagamento recebido. O plano aparece aqui em alguns minutos.',
      );
      onChange?.();
    });
    return () => controller.abort();
  }, []);
  async function act(action: 'checkout' | 'change' | 'portal', plan?: string) {
    if (busy) return;
    setBusy(plan || action);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, plan }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível abrir o pagamento agora.');
      if (data.url) {
        if (!window.nossomDesktop) {
          location.assign(data.url);
          return;
        }
        // The desktop app opens payment pages in the browser; refresh when the person returns.
        location.assign(data.url);
        setMessage('Abrimos a página da Stripe no seu navegador. Quando terminar, volte aqui.');
        addEventListener(
          'focus',
          () => {
            setTimeout(() => void load().then(() => onChange?.()), 1500);
          },
          { once: true },
        );
      } else {
        setSubscription(data.subscription ?? null);
        setMessage('Plano trocado.');
        onChange?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o pagamento agora.');
    }
    setConfirm('');
    setBusy('');
  }
  const subscribed = live(subscription);
  function action(plan: Plan) {
    const spinner =
      busy === plan.id ? <LoaderCircle className="spin" size={16} /> : <ArrowUpRight size={16} />;
    if (plan.id === 'free')
      return signedIn ? null : (
        <Link className="button secondary" href="/entrar?modo=criar">
          Começar grátis <ArrowUpRight size={16} />
        </Link>
      );
    if (!enabled)
      return (
        <a
          className="button primary"
          href={`mailto:contato@absolutezro.com?subject=${encodeURIComponent('Ativação Quasar · ' + plan.name)}`}
        >
          Solicitar ativação <ArrowUpRight size={16} />
        </a>
      );
    if (!signedIn)
      return (
        <Link className="button primary" href={`/studio/planos?plano=${plan.id}`}>
          Assinar {plan.name} <ArrowUpRight size={16} />
        </Link>
      );
    if (subscribed && subscription?.planId === plan.id)
      return (
        <button className="button secondary" disabled={!!busy} onClick={() => void act('portal')}>
          Gerenciar assinatura{' '}
          {busy === 'portal' ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <ArrowUpRight size={16} />
          )}
        </button>
      );
    if (subscribed)
      return confirm === plan.id ? (
        <div className="plan-confirm">
          <button
            className="button primary"
            disabled={!!busy}
            onClick={() => void act('change', plan.id)}
          >
            Confirmar troca {spinner}
          </button>
          <p>
            {plan.price_cents > (plans.find((p) => p.id === subscription?.planId)?.price_cents ?? 0)
              ? 'A diferença deste mês é cobrada agora no seu cartão.'
              : 'O valor que sobrar deste mês vira crédito nas próximas faturas.'}
          </p>
        </div>
      ) : (
        <button className="button primary" disabled={!!busy} onClick={() => setConfirm(plan.id)}>
          Trocar para {plan.name} <ArrowUpRight size={16} />
        </button>
      );
    return (
      <button
        className="button primary"
        disabled={!!busy}
        onClick={() => void act('checkout', plan.id)}
      >
        Assinar {plan.name} {spinner}
      </button>
    );
  }
  const status =
    signedIn && subscription?.planId
      ? subscription.status === 'past_due'
        ? 'Pagamento pendente. Atualize o cartão para manter o plano.'
        : subscribed && subscription.cancelAtPeriodEnd
          ? `Assinatura cancelada. Seu plano vale até ${day(subscription.periodEnd)}.`
          : subscribed
            ? `Assinatura ativa. Renova em ${day(subscription.periodEnd)}.`
            : ''
      : '';
  return (
    <section className="plans-section" aria-label="Planos do Quasar" ref={section}>
      {intro && (
        <div className="plans-intro">
          <h2>Um plano para o seu ritmo.</h2>
          <p>
            Use seus minutos para limpar fala ou isolar vocais. Equalização, efeitos e finalização
            local não descontam minutos.
          </p>
        </div>
      )}
      {(status || message || error) && (
        <div className="plans-status" role="status">
          {error ? <p className="alert error">{error}</p> : message && <p>{message}</p>}
          {status && (
            <p>
              {status}{' '}
              {subscription?.status === 'past_due' && (
                <button className="text-link" disabled={!!busy} onClick={() => void act('portal')}>
                  Atualizar cartão
                </button>
              )}
            </p>
          )}
        </div>
      )}
      <div className="plans-grid">
        {plans.map((plan: Plan) => (
          <article
            className={`plan-choice lg ${plan.id === 'essential' ? 'featured' : ''}`}
            key={plan.id}
          >
            <div className="plan-choice-head">
              <h3>{plan.name}</h3>
              {current === plan.id && <span>Seu plano</span>}
            </div>
            <div className="plan-price">
              <strong>{price(plan.price_cents)}</strong>
              <span>/mês</span>
            </div>
            <p className="plan-time">
              <strong>{allowance(plan.monthly_seconds)}</strong> de restauração por mês
            </p>
            <ul>
              {[
                'Limpeza de fala e separação de vocais',
                'Assistente da plataforma incluído',
                'EQ, multibanda e efeitos locais',
                'Histórico, comparação e exportação',
              ].map((item) => (
                <li key={item}>
                  <Check size={16} />
                  {item}
                </li>
              ))}
            </ul>
            {action(plan)}
          </article>
        ))}
      </div>
      <p className="plans-terms">
        Franquia renovada no dia 1, à 0h de Brasília, sem acumular saldo. Cada restauração desconta
        no mínimo 1 minuto; áudios maiores usam a duração em segundos. Até 10 minutos por arquivo.{' '}
        {enabled
          ? 'Planos pagos são cobrados todo mês no cartão, pela Stripe; o Quasar não guarda dados do cartão. Cancele quando quiser: o plano vale até o fim do período pago.'
          : 'Planos pagos são ativados pelo administrador após contato; não há cobrança automática de cartão nesta etapa.'}
      </p>
    </section>
  );
}
