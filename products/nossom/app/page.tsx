import Landing from '@/components/landing';
import { zroConfigured } from '@/lib/server/zro/config';
export const metadata = {
  description:
    'Envie seu áudio para a IA da NOSSOM. Limpeza neural, equalização, masterização, efeitos e presets de entrega. Comece com 5 minutos de restauração grátis por mês.',
};
export default function Page() {
  return <Landing zroIa={zroConfigured()} />;
}
