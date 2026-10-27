import { notFound, redirect } from 'next/navigation';
import { operations } from '@/lib/presets';
import { toolSlugs } from '@/lib/studio-routes';
import { zroConfigured } from '@/lib/server/zro/config';
const titles: Record<string, string> = {
  z: 'Z',
  inicio: 'Seu estúdio',
  ...Object.fromEntries(operations.map((o) => [toolSlugs[o.id], o.label])),
  projetos: 'Meus projetos',
  ia: 'Inteligência NOSSOM',
  conta: 'Minha conta',
  planos: 'Meu plano',
  admin: 'Administração',
};
export function generateStaticParams() {
  return Object.keys(titles).map((tool) => ({ tool }));
}
export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  return { title: titles[tool] ?? 'Estúdio' };
}
export default async function Page({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  if (!titles[tool]) notFound();
  // Sem o login Absolute ZRO a Z não tem como responder: a aba some e o endereço cai no Início.
  if (tool === 'z' && !zroConfigured()) redirect('/studio/inicio');
  return null;
}
