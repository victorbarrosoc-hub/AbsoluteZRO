import Link from 'next/link';
import { Brand } from '@/components/brand';
export const metadata = { title: 'Confirme seu acesso', robots: { index: false, follow: false } };
export default function Confirm() {
  return (
    <main className="privacy-page container">
      <Brand />
      <span className="eyebrow">SUA CONTA NOSSOM</span>
      <h1>Continue no seu espaço.</h1>
      <p>
        Se o Supabase confirmou seu e-mail, entre com sua senha para acessar o estúdio. Se o link
        expirou ou houve um erro na confirmação, solicite um novo e-mail pela tela de acesso.
      </p>
      <Link className="button primary" href="/entrar">
        Entrar na NOSSOM
      </Link>
    </main>
  );
}
