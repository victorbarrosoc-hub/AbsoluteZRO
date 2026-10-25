export const dynamic = 'force-dynamic';
/** /baixar sem sistema: a página com os instaladores. */
export function GET() {
  return new Response(null, { status: 302, headers: { location: '/apps' } });
}
