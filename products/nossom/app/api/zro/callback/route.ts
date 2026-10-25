import { finishZro } from '@/lib/server/zro/routes';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Volta da Absolute ZRO → 303 para a volta com a sessão nova, ou ?erro=<código>. */
export function GET(request: Request) {
  return finishZro(request);
}
