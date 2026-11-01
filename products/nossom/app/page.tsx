import type { Metadata } from 'next';
import Landing from '@/components/landing';
import { nossomClosed } from '@/lib/server/release';
import { zroConfigured } from '@/lib/server/zro/config';
export function generateMetadata(): Metadata {
  return {
    description: nossomClosed()
      ? 'Quasar, o estúdio de áudio da Absolute ZRO: limpeza de voz, separação de vocais e finalização. Em desenvolvimento.'
      : 'Envie seu áudio para a IA do Quasar. Limpeza neural, equalização, masterização, efeitos e presets de entrega. Comece com 5 minutos de restauração grátis por mês.',
  };
}
export default function Page() {
  // Fechado ao público: a página apresenta o projeto, sem ação de abrir, entrar, baixar ou assinar.
  const closed = nossomClosed();
  return <Landing closed={closed} zroIa={!closed && zroConfigured()} />;
}
