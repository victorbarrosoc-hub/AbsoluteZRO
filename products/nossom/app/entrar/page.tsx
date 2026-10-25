import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCOUNT_COOKIE, accountFromToken } from '@/lib/server/account';
import { safeReturnPath } from '@/lib/accounts';
import AccountAccess from '@/components/account-access';
export const metadata = { title: 'Entrar', robots: { index: false, follow: false } };
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; modo?: string }>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  if (accountFromToken((await cookies()).get(ACCOUNT_COOKIE)?.value)) redirect(next);
  return <AccountAccess next={next} initialMode={params.modo === 'criar' ? 'register' : 'login'} />;
}
