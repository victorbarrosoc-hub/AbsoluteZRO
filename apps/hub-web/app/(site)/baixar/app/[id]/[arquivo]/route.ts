import { enderecoDoArquivo } from '@/lib/desktop-apps'

/**
 * /baixar/app/<ferramenta>/<arquivo>: a central de apps baixa daqui. Só arquivos que o catálogo reconhece; redireciona
 * para o endereço assinado e temporário do GitHub. O arquivo não passa pela Vercel.
 */
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; arquivo: string }> }) {
  const { id, arquivo } = await params
  const destino = await enderecoDoArquivo(id, decodeURIComponent(arquivo))
  if (!destino)
    return new Response('Arquivo indisponível.', { status: 404, headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' } })
  return new Response(null, { status: 302, headers: { location: destino, 'cache-control': 'no-store' } })
}
