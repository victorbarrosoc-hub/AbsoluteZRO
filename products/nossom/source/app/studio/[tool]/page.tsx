import { notFound } from 'next/navigation';
import { operations } from '@/lib/presets';
import { toolSlugs } from '@/lib/studio-routes';
const titles: Record<string, string> = {
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
  return null;
}
