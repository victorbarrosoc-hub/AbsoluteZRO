import Studio from '@/components/studio';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCOUNT_COOKIE, accountFromToken } from '@/lib/server/account';
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const account = accountFromToken((await cookies()).get(ACCOUNT_COOKIE)?.value);
  if (!account) redirect('/entrar');
  return (
    <>
      <Studio key={account.id} account={account} />
      {children}
    </>
  );
}
