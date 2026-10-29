import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { zroConfigured } from '@/lib/server/zro/config';
export const metadata: Metadata = { title: 'Seu estúdio' };
// A Z é a entrada do estúdio (site, celular/PWA e app de computador). Sem o login Absolute ZRO, o Início.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (zroConfigured()) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams))
      for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value])
        query.append(key, v);
    const search = query.toString();
    redirect('/studio/z' + (search ? '?' + search : ''));
  }
  return null;
}
