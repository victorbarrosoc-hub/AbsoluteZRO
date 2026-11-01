import type { Metadata } from 'next';
import EmDesenvolvimento from '@/components/em-desenvolvimento';
export const metadata: Metadata = {
  title: { absolute: 'Absolute ZRO' },
  description: 'O NOSSOM ainda não está aberto. Em breve, no Absolute ZRO.',
  robots: { index: false, follow: false },
};
/** Para onde o proxy reescreve (HTTP 200, endereço preservado) qualquer rota do estúdio enquanto fechado. */
export default function Page() {
  return <EmDesenvolvimento />;
}
