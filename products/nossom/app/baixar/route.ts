import { nossomClosed } from '@/lib/server/release';
export const dynamic = 'force-dynamic';
/** /baixar sem sistema: a página com os instaladores. Fechado ao público, nada para baixar (404). */
export function GET() {
  if (nossomClosed())
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  return new Response(null, { status: 302, headers: { location: '/apps' } });
}
