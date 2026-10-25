'use client';
import DesktopUpdates from './desktop-updates';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, LoaderCircle, ShieldCheck, UserRound, Eye, EyeOff } from 'lucide-react';
import { Brand } from './brand';
import AIMotion from './ai-motion';
export function AccountForm({
  next,
  initialMode = 'login',
  expandable = false,
}: {
  next: string;
  initialMode?: 'login' | 'register';
  expandable?: boolean;
}) {
  const reduced = useReducedMotion(),
    id = useId();
  const [expanded, setExpanded] = useState(!expandable || initialMode === 'register');
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
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>(initialMode),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmation, setConfirmation] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, name, email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível entrar.');
      if (result.confirmationRequired) {
        setConfirmation(true);
        setBusy(false);
        return;
      }
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
          ? 'Seu assistente já vem conectado. Comece com 5 minutos de restauração por mês.'
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
                  setShowPassword(false);
                  setError('');
                  setConfirmation(false);
                }}
              >
                <span className="account-mode-text">
                  {value === 'login' ? 'Entrar' : 'Criar conta'}
                </span>
              </button>
            ))}
          </div>
          <motion.form
            key={mode}
            onSubmit={submit}
            initial={reduced ? false : { opacity: 0, x: mode === 'register' ? 18 : -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {mode === 'register' && (
              <label>
                Nome
                <input
                  name="name"
                  autoComplete="nickname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={60}
                  required
                  disabled={busy}
                  placeholder="Como podemos chamar você?"
                />
              </label>
            )}
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
              <span className="account-password">
                <input
                  id={id + '-password'}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={mode === 'register' ? 8 : 1}
                  maxLength={128}
                  required
                  disabled={busy}
                  placeholder={mode === 'register' ? 'Pelo menos 8 caracteres' : 'Sua senha'}
                />
                <button
                  type="button"
                  className="account-password-toggle"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={busy}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            {confirmation && (
              <p className="account-confirmation" role="status">
                Enviamos um link de confirmação para o seu e-mail. Abra o link e depois entre com
                sua senha.
              </p>
            )}
            {error && (
              <p className="account-error" role="alert">
                {error}
              </p>
            )}
            <motion.button
              className="button primary"
              disabled={busy}
              whileTap={reduced ? undefined : { scale: 0.98 }}
            >
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <>
                  {mode === 'register' ? 'Criar conta e entrar' : 'Entrar no estúdio'}
                  <ArrowRight size={17} />
                </>
              )}
            </motion.button>
          </motion.form>
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
}: {
  next: string;
  initialMode?: 'login' | 'register';
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
        <AccountForm next={next} initialMode={initialMode} expandable />
      </section>
    </main>
  );
}
