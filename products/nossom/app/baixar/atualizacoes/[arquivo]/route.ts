import { updateFileAddress } from '@/lib/desktop-releases';
// Canal da atualização automática do app de desktop (NOSSOM_UPDATE_BASE_URL aponta para cá):
// latest.yml, latest-mac.yml e os arquivos que eles citam, lidos do Release fixo
// `nossom-atualizacoes`. Redireciona para o endereço assinado do GitHub; nunca devolve HTML, para o
// atualizador não confundir uma página com um manifesto.
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  const { arquivo } = await params;
  try {
    const address = await updateFileAddress(arquivo);
    if (address)
      return new Response(null, {
        status: 302,
        headers: { location: address, 'cache-control': 'no-store' },
      });
    return new Response('Arquivo indisponível.', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  } catch {
    return new Response('Atualização indisponível agora.', {
      status: 503,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
