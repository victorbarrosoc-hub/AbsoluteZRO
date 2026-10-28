'use client';
import DesktopUpdates from './desktop-updates';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, LoaderCircle, ShieldCheck, UserRound } from 'lucide-react';
import { Brand } from './brand';
import { ZroSymbol } from './zro-symbol';
import AIMotion from './ai-motion';
import { PasswordField } from './password-field';
export function AccountForm({
  next,
  initialMode = 'login',
  expandable = false,
  zro = false,
  notice = '',
}: {
  next: string;
  initialMode?: 'login' | 'register';
  expandable?: boolean;
  /** Mostra "Entrar com Absolute ZRO" (só quando o servidor tem o cliente configurado). */
  zro?: boolean;
  /** Aviso vindo da volta da Absolute ZRO. */
  notice?: string;
}) {
  const reduced = useReducedMotion(),
    id = useId();
  const [expanded, setExpanded] = useState(!expandable || initialMode === 'register' || !!notice);
  useEffect(() => {
    if (!expandable) return;
    const query = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 901px)');
    const update = () => {
      if (!query.matches) setExpanded(true);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [expandable]);
  const [mode, setMode] = useState<'login' | 'register'>(initialMode),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(notice);
  // Conta nova só nasce pela Absolute ZRO; o HUB abre direto a tela de criar conta.
  const createHref = '/api/zro/entrar?modo=criar&volta=' + encodeURIComponent(next);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível entrar.');
      // A full navigation clears the previous user's client state and any active workers.
      location.assign(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.');
      setBusy(false);
    }
  }
  return (
    <motion.div
      className={`account-form-wrap ${expandable ? 'account-expandable' : ''} ${expanded ? 'is-expanded' : ''}`}
      onMouseEnter={() => setExpanded(true)}
      onFocusCapture={(event) => {
        if (expanded) return;
        const card = event.currentTarget;
        setExpanded(true);
        requestAnimationFrame(() =>
          card.querySelector<HTMLButtonElement>('.account-mode button')?.focus(),
        );
      }}
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <span className="account-avatar">
        <UserRound size={24} />
      </span>
      <h1>{mode === 'register' ? 'Crie sua conta.' : 'Que bom ter você aqui.'}</h1>
      <p>
        {mode === 'register'
          ? 'A conta do NOSSOM é a sua conta Absolute ZRO.'
          : 'Entre para continuar seus projetos e conversar com a IA da NOSSOM.'}
      </p>
      {expandable && !expanded && (
        <button
          className="button primary account-open"
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={expanded}
          aria-controls={id + '-fields'}
        >
          Acessar minha conta <ArrowRight size={17} />
        </button>
      )}
      <div className="account-fields" id={id + '-fields'} inert={!expanded}>
        <div className="account-fields-inner">
          <div className="account-mode" data-mode={mode} role="group" aria-label="Acesso à conta">
            {/* One pill that slides sideways between the two options. */}
            <span className="account-mode-pill" aria-hidden="true" />
            {(['login', 'register'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                className={mode === value ? 'active' : ''}
                disabled={busy}
                onClick={() => {
                  setMode(value);
                  setPassword('');
                  setError('');
                }}
              >
                <span className="account-mode-text">
                  {value === 'login' ? 'Entrar' : 'Criar conta'}
                </span>
              </button>
            ))}
          </div>
          {zro && mode === 'login' && (
            // Caminho recomendado: a conta Absolute ZRO. E-mail e senha ficam para contas antigas.
            <div className="account-zro account-zro-first">
              <a
                className="button primary account-zro-button"
                href={'/api/zro/entrar?volta=' + encodeURIComponent(next)}
              >
                <ZroSymbol size={20} />
                Entrar com Absolute ZRO
              </a>
              <span className="account-zro-divider">ou com e-mail e senha</span>
            </div>
          )}
          {mode === 'register' ? (
            <motion.div
              key="register"
              className="account-zro-create"
              initial={reduced ? false : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {error && (
                <p className="account-error" role="alert">
                  {error}
                </p>
              )}
              <a className="button primary account-zro-create-button" href={createHref}>
                <ZroSymbol size={20} />
                Criar conta com a Absolute ZRO
              </a>
            </motion.div>
          ) : (
            <motion.form
              key={mode}
              onSubmit={submit}
              initial={reduced ? false : { opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  required
                  disabled={busy}
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="voce@exemplo.com"
                />
              </label>
              <label htmlFor={id + '-password'}>
                Senha
                <PasswordField
                  key={mode}
                  id={id + '-password'}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={1}
                  maxLength={128}
                  required
                  disabled={busy}
                  placeholder="Sua senha"
                />
              </label>
              {error && (
                <p className="account-error" role="alert">
                  {error}
                </p>
              )}
              <motion.button
                className={zro ? 'button secondary' : 'button primary'}
                disabled={busy}
                whileTap={reduced ? undefined : { scale: 0.98 }}
              >
                {busy ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <>
                    Entrar no estúdio
                    <ArrowRight size={17} />
                  </>
                )}
              </motion.button>
            </motion.form>
          )}
          <p className="account-local-note">
            Seus projetos ficam neste dispositivo. Sua conta e seus minutos acompanham você.
          </p>
          <Link className="text-link" href="/privacidade">
            Privacidade e armazenamento
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

export default function AccountAccess({
  next,
  initialMode = 'login',
  zro = false,
  notice = '',
}: {
  next: string;
  initialMode?: 'login' | 'register';
  zro?: boolean;
  notice?: string;
}) {
  return (
    <main className="account-page">
      <div className="account-wave-background" aria-hidden="true">
        <AIMotion />
      </div>
      <DesktopUpdates floating />
      <Link className="account-home" href="/" aria-label="NOSSOM página inicial">
        <Brand />
      </Link>
      <section className="account-story" aria-label="NOSSOM">
        <div>
          <h2>
            O seu som.
            <br />
            <span>O seu lugar.</span>
          </h2>
          <p>Trate, crie e entregue. O assistente NOSSOM já está pronto para acompanhar você.</p>
        </div>
        <small>
          <ShieldCheck size={15} /> Seus arquivos continuam no seu dispositivo.
        </small>
      </section>
      <section className="account-form-panel">
        <AccountForm next={next} initialMode={initialMode} expandable zro={zro} notice={notice} />
      </section>
    </main>
  );
}
