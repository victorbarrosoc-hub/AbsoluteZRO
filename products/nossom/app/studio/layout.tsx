import Studio from '@/components/studio';
import ZroBlocked from '@/components/zro-blocked';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCOUNT_COOKIE, accountFromToken } from '@/lib/server/account';
import { zroConfigured } from '@/lib/server/zro/config';
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const account = accountFromToken((await cookies()).get(ACCOUNT_COOKIE)?.value);
  if (!account) redirect('/entrar');
  // Sem o NOSSOM liberado na Absolute ZRO o estúdio não abre (as APIs também recusam).
  if (account.zroBlocked) return <ZroBlocked email={account.email} />;
  return (
    <>
      <Studio key={account.id} account={account} zroIa={zroConfigured()} />
      {children}
    </>
  );
}
