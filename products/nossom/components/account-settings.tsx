'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  Gem,
  Camera,
  Trash2,
  Check,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { accountPlan, type Account } from '@/lib/accounts';
import StudioLink from './studio-link';
import UserAvatar, { avatarFromFile } from './user-avatar';
import { usageLabel, type AudioUsage } from '@/lib/usage';
import { zroMessage } from '@/lib/zro-messages';
type ZroStatus = {
  configured: boolean;
  link: { email: string; organization: string | null; onlyLogin: boolean } | null;
};
export default function AccountSettings({
  account,
  usage,
  theme,
  onTheme,
}: {
  account: Account;
  usage: AudioUsage | null;
  theme: 'system' | 'light' | 'dark';
  onTheme: (theme: 'system' | 'light' | 'dark') => void;
}) {
  const router = useRouter(),
    reduced = useReducedMotion();
  const [name, setName] = useState(account.name),
    [email, setEmail] = useState(account.email),
    [password, setPassword] = useState(''),
    [currentPassword, setCurrentPassword] = useState(''),
    [emailPassword, setEmailPassword] = useState(''),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [photo, setPhoto] = useState<number | undefined>(account.avatar);
  const picker = useRef<HTMLInputElement>(null);
  const [zro, setZro] = useState<ZroStatus | null>(null);
  useEffect(() => {
    // Volta da Absolute ZRO: mostra o resultado e tira o aviso do endereço.
    const url = new URL(location.href);
    const code = url.searchParams.get('erro'),
      linked = url.searchParams.get('zro') === 'ok';
    if (linked || zroMessage(code)) {
      if (linked) setSuccess('Absolute ZRO ligada. Agora você também entra por ela.');
      else setError(zroMessage(code)!);
      url.searchParams.delete('erro');
      url.searchParams.delete('zro');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
    let active = true;
    fetch('/api/zro/conta')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ZroStatus | null) => {
        if (active && data) setZro(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  async function unlinkZro() {
    if (busy) return;
    setBusy('zro');
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/zro/conta', { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não deu para desligar agora.');
      setZro((current) => current && { ...current, link: null });
      setSuccess('Absolute ZRO desligada. Você continua entrando com e-mail e senha.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu para desligar agora.');
    } finally {
      setBusy('');
    }
  }
  const zroOnly = !!zro?.link?.onlyLogin;
  async function changePhoto(file?: File | null) {
    if (!file || busy) return;
    setBusy('photo');
    setError('');
    setSuccess('');
    try {
      const image = await avatarFromFile(file);
      const response = await fetch('/api/account/avatar', {
        method: 'PUT',
        headers: { 'Content-Type': image.type },
        body: image,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a foto.');
      setPhoto(data.account?.avatar);
      setSuccess('Sua foto foi atualizada.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a foto.');
    } finally {
      setBusy('');
      if (picker.current) picker.current.value = '';
    }
  }
  async function removePhoto() {
    if (busy) return;
    setBusy('photo');
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/account/avatar', { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível remover a foto.');
      setPhoto(undefined);
      setSuccess('Sua foto foi removida.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível remover a foto.');
    } finally {
      setBusy('');
    }
  }
  async function update(action: 'profile' | 'email' | 'password') {
    if (busy) return;
    setBusy(action);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          name,
          email,
          password,
          currentPassword: action === 'email' ? emailPassword : currentPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      setPassword('');
      setCurrentPassword('');
      setEmailPassword('');
      setSuccess(
        action === 'email'
          ? 'Confira os e-mails de confirmação enviados pelo Supabase. O endereço atual continua válido até a mudança ser confirmada.'
          : action === 'password'
            ? 'Sua senha foi atualizada.'
            : 'Seu perfil foi atualizado.',
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy('');
    }
  }
  const button = (action: 'profile' | 'email' | 'password', label: string) => (
    <button className="button primary" disabled={!!busy}>
      {busy === action ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />} {label}
    </button>
  );
  return (
    <motion.section
      className="account-settings"
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h1>Minha conta.</h1>
      <p>Seu perfil, sua segurança e suas preferências.</p>
      <div className="account-settings-summary">
        <div className="account-photo">
          <button
            type="button"
            className="account-photo-button"
            aria-label="Trocar foto de perfil"
            disabled={!!busy}
            onClick={() => picker.current?.click()}
          >
            <UserAvatar
              account={{ name: account.name, avatar: photo }}
              className="account-profile-avatar"
            />
            <span className="account-photo-badge" aria-hidden="true">
              {busy === 'photo' ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Camera size={14} />
              )}
            </span>
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            hidden
            aria-label="Escolher foto de perfil"
            onChange={(e) => void changePhoto(e.target.files?.[0])}
          />
          {photo && (
            <button
              type="button"
              className="text-link account-photo-remove"
              disabled={!!busy}
              onClick={() => void removePhoto()}
            >
              <Trash2 size={13} /> Remover foto
            </button>
          )}
        </div>
        <div>
          <strong>{account.name}</strong>
          <span className="account-plan">{accountPlan(account, usage)}</span>
          <p>{account.email}</p>
        </div>
        <div className="account-summary-actions">
          <span>
            <ShieldCheck size={16} />
            {account.isAdmin ? 'Administrador' : 'Conta NOSSOM'}
          </span>
          {account.isAdmin && (
            <StudioLink className="button secondary" href="/studio/admin">
              Painel de administração <ArrowUpRight size={16} />
            </StudioLink>
          )}
        </div>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="account-settings-success" role="status">
          {success}
        </p>
      )}
      <div className="account-settings-grid">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void update('profile');
          }}
        >
          <header className="settings-card-heading">
            <UserRound size={21} />
            <h2>Perfil</h2>
          </header>
          <label>
            Nome de exibição
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={60}
              autoComplete="nickname"
              required
              disabled={!!busy}
            />
          </label>
          {button('profile', 'Salvar perfil')}
        </form>
        <section>
          <header className="settings-card-heading">
            <SlidersHorizontal size={21} />
            <h2>Aparência e uso</h2>
          </header>
          <label>
            Tema da plataforma
            <select
              aria-label="Tema da plataforma"
              value={theme}
              onChange={(e) => onTheme(e.target.value as typeof theme)}
            >
              <option value="system">Tema do aparelho</option>
              <option value="dark">Escuro</option>
              <option value="light">Claro</option>
            </select>
          </label>
          <p>
            {usage?.unlimited
              ? 'Sua conta ADM não tem limite de minutos de restauração.'
              : usage
                ? usageLabel(usage)
                : 'Consulte seu saldo na navegação.'}
          </p>
        </section>
        {zro?.configured && (
          <section className="account-zro-card">
            <header className="settings-card-heading">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/absolute-zro-o-alpha.webp" alt="" width={21} height={21} />
              <h2>Absolute ZRO</h2>
            </header>
            {zro.link ? (
              <>
                <p>
                  Ligada a <strong>{zro.link.email}</strong>
                  {zro.link.organization ? ' · ' + zro.link.organization : ''}.
                </p>
                {zroOnly ? (
                  <p>Esta conta entra só pela Absolute ZRO, então a ligação fica.</p>
                ) : (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!!busy}
                    onClick={() => void unlinkZro()}
                  >
                    {busy === 'zro' ? <LoaderCircle className="spin" size={18} /> : null}
                    Desligar
                  </button>
                )}
              </>
            ) : (
              <>
                <p>Ligue sua conta Absolute ZRO para entrar na NOSSOM com um clique.</p>
                <a
                  className="button primary"
                  href={'/api/zro/entrar?modo=ligar&volta=' + encodeURIComponent('/studio/conta')}
                >
                  Ligar Absolute ZRO
                </a>
              </>
            )}
          </section>
        )}
        {!zroOnly && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void update('email');
            }}
          >
            <header className="settings-card-heading">
              <Mail size={21} />
              <h2>E-mail</h2>
            </header>
            <label>
              Novo e-mail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                maxLength={254}
                required
                disabled={!!busy}
              />
            </label>
            <label>
              Senha atual para alterar e-mail
              <input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={!!busy}
              />
            </label>
            <p>
              A mudança exige confirmação. O acesso ADM depende do endereço administrativo
              confirmado.
            </p>
            {button('email', 'Alterar e-mail')}
          </form>
        )}
        {!zroOnly && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void update('password');
            }}
          >
            <header className="settings-card-heading">
              <LockKeyhole size={21} />
              <h2>Senha</h2>
            </header>
            <label>
              Senha atual
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={!!busy}
              />
            </label>
            <label>
              Nova senha
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                disabled={!!busy}
              />
            </label>
            {button('password', 'Atualizar senha')}
          </form>
        )}
      </div>
      <StudioLink className="account-plan-link lg" href="/studio/planos">
        <Gem size={18} />
        <span>
          <strong>{accountPlan(account, usage)}</strong>
          <small>
            {account.isAdmin
              ? 'Ver os planos como os clientes veem'
              : 'Ver meu plano, minutos do mês e fazer upgrade'}
          </small>
        </span>
        <ArrowUpRight size={16} />
      </StudioLink>
    </motion.section>
  );
}
