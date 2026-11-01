'use client';
import StudioLink from './studio-link';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  ChevronDown,
  Folder,
  Gem,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { AccountForm } from './account-access';
import UserAvatar from './user-avatar';
import FamilyNav from './family-nav';
import { ZroSymbol } from './zro-symbol';
import { useDialog } from '@/lib/use-dialog';
import { accountPlan, type Account } from '@/lib/accounts';
import { usageLabel, type AudioUsage } from '@/lib/usage';
export default function AccountMenu({
  account: initialAccount,
  usage,
  disabled = false,
  familia = false,
}: {
  account?: Account;
  usage?: AudioUsage | null;
  disabled?: boolean;
  /** Os apps da Absolute ZRO no menu (na página inicial; no estúdio eles ficam na lateral). */
  familia?: boolean;
}) {
  const [account, setAccount] = useState<Account | null>(initialAccount || null),
    [loading, setLoading] = useState(!initialAccount),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [remoteUsage, setRemoteUsage] = useState<AudioUsage | null>(null);
  const [position, setPosition] = useState({ top: 80, right: 20 });
  const trigger = useRef<HTMLButtonElement>(null),
    reduced = useReducedMotion(),
    id = useId();
  useDialog(open);
  useEffect(() => {
    if (initialAccount) {
      setAccount(initialAccount);
      return;
    }
    const controller = new AbortController();
    fetch('/api/account', { cache: 'no-store', signal: controller.signal })
      .then(async (r) => (r.ok ? (await r.json()).account : null))
      .then((a) => setAccount(a))
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialAccount]);
  useEffect(() => {
    if (!open) return;
    const locate = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect)
        setPosition({ top: rect.bottom + 12, right: Math.max(14, window.innerWidth - rect.right) });
    };
    locate();
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('resize', locate);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', locate);
      window.removeEventListener('keydown', escape);
    };
  }, [open, busy]);
  useEffect(() => {
    if (!open || !account || usage !== undefined) return;
    const controller = new AbortController();
    fetch('/api/usage', { cache: 'no-store', signal: controller.signal })
      .then(async (r) => (r.ok ? r.json() : null))
      .then(setRemoteUsage)
      .catch(() => {});
    return () => controller.abort();
  }, [open, account, usage]);
  async function logout() {
    if (disabled || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account', { method: 'DELETE' });
      if (!response.ok) throw new Error('Não foi possível sair da conta. Tente novamente.');
      location.assign('/entrar');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível sair da conta.');
      setBusy(false);
    }
  }
  const saldo = usage === undefined ? remoteUsage : usage;
  return (
    <>
      <motion.button
        ref={trigger}
        type="button"
        className={`account-menu-trigger ${account ? 'signed-in' : ''}`}
        aria-label={account ? 'Abrir menu da conta' : 'Entrar na sua conta'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled || loading}
        onClick={() => {
          setError('');
          setOpen(true);
        }}
        whileTap={reduced ? undefined : { scale: 0.95 }}
      >
        {account && !loading ? (
          <UserAvatar account={account} className="account-trigger-avatar" />
        ) : (
          <span className="account-trigger-avatar">
            {loading ? <LoaderCircle size={16} className="spin" /> : <UserRound size={17} />}
          </span>
        )}
        <span className="account-trigger-name">
          {account ? account.name.split(' ')[0] : 'Entrar'}
        </span>
        <ChevronDown size={13} className="account-trigger-chevron" />
      </motion.button>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="modal-backdrop account-menu-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.16 }}
                onClick={() => {
                  if (!busy) setOpen(false);
                }}
              >
                <motion.section
                  id={id}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={id + '-title'}
                  className={`account-menu-panel ${!account ? 'access-panel' : ''}`}
                  style={
                    {
                      '--account-top': `${position.top}px`,
                      '--account-right': `${position.right}px`,
                    } as CSSProperties
                  }
                  initial={
                    reduced ? false : { opacity: 0, y: -8, scale: 0.96, filter: 'blur(4px)' }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: reduced ? 0 : -5, scale: reduced ? 1 : 0.98 }}
                  transition={
                    reduced ? { duration: 0 } : { type: 'spring', stiffness: 390, damping: 32 }
                  }
                  onClick={(e) => e.stopPropagation()}
                >
                  <header className="account-menu-heading">
                    <h2 id={id + '-title'}>{account ? 'Sua conta' : 'SEU ESPAÇO QUASAR'}</h2>
                    <button
                      className="account-menu-close"
                      aria-label="Fechar menu da conta"
                      onClick={() => setOpen(false)}
                      disabled={busy}
                    >
                      <X size={17} />
                    </button>
                  </header>
                  {account ? (
                    <>
                      <div className="account-profile">
                        <UserAvatar account={account} className="account-profile-avatar" />
                        <div>
                          <strong>{account.name}</strong>
                          <span className="account-plan">{accountPlan(account, saldo)}</span>
                          <p>
                            {[account.email, account.zro?.organization].filter(Boolean).join(' · ')}
                          </p>
                          {account.zro ? (
                            // Perfil único: a mesma conta em todos os apps da Absolute ZRO.
                            <span
                              className="account-profile-badge account-zro-badge"
                              title={
                                account.zro.email && account.zro.email !== account.email
                                  ? 'Conta Absolute ZRO: ' + account.zro.email
                                  : 'A mesma conta em todos os apps da Absolute ZRO'
                              }
                            >
                              <ZroSymbol size={13} />
                              Conta Absolute ZRO
                            </span>
                          ) : (
                            <span className="account-profile-badge">
                              <ShieldCheck size={12} />
                              {account.isAdmin ? 'Administrador' : 'Conta Quasar'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="account-menu-quota">
                        {saldo ? (
                          <>
                            <div>
                              <span>
                                {saldo.unlimited ? 'Seu espaço, sem limites' : usageLabel(saldo)}
                              </span>
                              <strong>
                                {saldo.unlimited ? 'ADM' : `${Math.round(saldo.used / 60)} min`}
                              </strong>
                            </div>
                            {!saldo.unlimited && (
                              <progress
                                max={Math.max(1, saldo.limit ?? 300)}
                                value={saldo.used}
                                aria-label="Uso mensal da sua conta"
                              />
                            )}
                            <small>
                              {saldo.unlimited
                                ? 'Sem limite de minutos de restauração.'
                                : 'O saldo renova no dia 1, à 0h de Brasília.'}
                            </small>
                          </>
                        ) : (
                          <small>Seu saldo fica disponível no estúdio.</small>
                        )}
                      </div>
                      <nav className="account-menu-links" aria-label="Atalhos da conta">
                        {[
                          { href: '/studio', label: 'Meu estúdio', icon: AudioLines },
                          { href: '/studio/projetos', label: 'Meus projetos', icon: Folder },
                          {
                            href: '/studio/planos',
                            label: account.isAdmin ? 'Planos' : 'Meu plano e upgrade',
                            icon: Gem,
                          },
                          {
                            href: '/studio/conta',
                            label: 'Configurações da conta',
                            icon: UserRound,
                          },
                        ].map((item, i) => (
                          <motion.div
                            key={item.href}
                            initial={reduced ? false : { opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: reduced ? 0 : 0.035 * i }}
                          >
                            <StudioLink href={item.href} onClick={() => setOpen(false)}>
                              <item.icon size={17} />
                              <span>{item.label}</span>
                              <ArrowRight size={14} />
                            </StudioLink>
                          </motion.div>
                        ))}
                      </nav>
                      {account.zro ? (
                        <a
                          className="account-menu-zro"
                          href={account.zro.manage}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Nome, foto e e-mail são os mesmos em todos os apps. Abre no navegador."
                          onClick={() => setOpen(false)}
                        >
                          <ZroSymbol size={17} />
                          <span>Editar na conta Absolute ZRO</span>
                          <ArrowUpRight size={14} />
                        </a>
                      ) : account.zroInvite ? (
                        <a
                          className="account-menu-zro"
                          href={
                            '/api/zro/entrar?modo=ligar&volta=' +
                            encodeURIComponent('/studio/conta')
                          }
                          title="Uma conta para todos os apps da Absolute ZRO."
                        >
                          <ZroSymbol size={17} />
                          <span>Ligar conta Absolute ZRO</span>
                          <ArrowRight size={14} />
                        </a>
                      ) : null}
                      {familia && (
                        <div className="account-menu-familia">
                          <FamilyNav onOpen={() => setOpen(false)} />
                        </div>
                      )}
                      {error && (
                        <p className="account-menu-error" role="alert">
                          {error}
                        </p>
                      )}
                      <button className="account-menu-logout" onClick={logout} disabled={busy}>
                        {busy ? <LoaderCircle size={16} className="spin" /> : <LogOut size={16} />}
                        <span>{busy ? 'Saindo…' : 'Sair da conta'}</span>
                      </button>
                    </>
                  ) : (
                    <AccountForm next="/studio" />
                  )}
                </motion.section>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
