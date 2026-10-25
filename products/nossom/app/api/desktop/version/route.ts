export const dynamic = 'force-dynamic';
/** Public deployment identifier, never an installer URL or an executable command. */
export function GET() {
  return Response.json(
    { release: process.env.VERCEL_GIT_COMMIT_SHA || 'development' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
