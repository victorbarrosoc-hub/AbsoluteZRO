import { downloadDiagnosis, installerAddress, installerKey } from '@/lib/desktop-releases';
import { nossomClosed } from '@/lib/server/release';
// /baixar/mac-arm64, /baixar/mac-x64 e /baixar/windows: manda o visitante para o instalador
// (endereço assinado e temporário do GitHub com GITHUB_TOKEN; link normal sem token). O arquivo
// não passa pela Vercel. /baixar/diag diz por que o download não sai, sem mostrar o token.
// Fechado ao público (28/10/2026): tudo aqui responde 404, inclusive o diagnóstico.
export const dynamic = 'force-dynamic';
const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store' } });
const UNAVAILABLE = '/apps?baixar=indisponivel';
export async function GET(_request: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  const { arquivo } = await params;
  if (nossomClosed())
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  if (arquivo === 'diag')
    return Response.json(await downloadDiagnosis(), { headers: { 'cache-control': 'no-store' } });
  const key = installerKey(arquivo);
  if (!key) return redirect('/apps');
  try {
    const address = await installerAddress(key);
    return redirect(address || UNAVAILABLE);
  } catch (error) {
    console.error('[baixar]', arquivo, error instanceof Error ? error.message : error);
    return redirect(UNAVAILABLE);
  }
}
