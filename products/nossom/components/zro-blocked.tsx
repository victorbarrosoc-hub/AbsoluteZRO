'use client';
import Link from 'next/link';
import { useState } from 'react';
import { LockKeyhole, LoaderCircle } from 'lucide-react';
import { Brand } from './brand';

/** Página das ferramentas na Absolute ZRO, onde o admin da organização libera o NOSSOM. */
export const ZRO_TOOLS_URL = 'https://absolutezro.vercel.app/ferramentas';

/**
 * Conta Absolute ZRO sem o NOSSOM liberado: entra, mas o estúdio fica fechado. Nada do que está
 * guardado neste dispositivo (projetos, versões, trabalhos pendentes) é apagado.
 */
export default function ZroBlocked({ email }: { email: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function logout() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account', { method: 'DELETE' });
      if (!response.ok) throw new Error();
      location.assign('/entrar');
    } catch {
      setError('Não deu para sair agora. Tente de novo.');
      setBusy(false);
    }
  }
  return (
    <main className="account-page zro-blocked-page">
      <Link className="account-home" href="/" aria-label="NOSSOM página inicial">
        <Brand />
      </Link>
      <section className="account-form-panel">
        <div className="account-form-wrap zro-blocked">
          <span className="account-avatar">
            <LockKeyhole size={22} />
          </span>
          <h1>Sua conta Absolute ZRO ainda não tem acesso ao NOSSOM.</h1>
          <p>Peça a liberação a quem administra a sua organização. Depois, entre de novo.</p>
          <a className="button primary" href={ZRO_TOOLS_URL}>
            Ver na Absolute ZRO
          </a>
          <a className="button secondary" href="/api/zro/entrar?volta=%2Fstudio">
            Já liberei, entrar de novo
          </a>
          <button type="button" className="text-link" onClick={logout} disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : 'Sair desta conta'}
          </button>
          {error && (
            <p className="account-error" role="alert">
              {error}
            </p>
          )}
          <p className="account-local-note">Conectado como {email}.</p>
        </div>
      </section>
    </main>
  );
}
