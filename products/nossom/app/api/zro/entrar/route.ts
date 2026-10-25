import { startZro } from '@/lib/server/zro/routes';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** ?volta=/studio&modo=ligar → 302 para a Absolute ZRO (state, nonce e PKCE em cookie de 10 min). */
export function GET(request: Request) {
  return startZro(request);
}
