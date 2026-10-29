import { liberadosPara } from '@/lib/data/catalog'
import { enderecoDoArquivo } from '@/lib/desktop-apps'
import { getAuth } from '@/lib/session'

/**
 * /baixar/app/<ferramenta>/<arquivo>: a central de apps baixa daqui. Só arquivos que o catálogo reconhece; redireciona
 * para o endereço assinado e temporário do GitHub. O arquivo não passa pela Vercel. Produto fechado (ADR 0023) é 404,
 * salvo para quem está na lista de acesso do canal download, logado. `mac`/`windows` = o instalador mais novo (botões
 * da página Downloads) e `versao.json` = o aviso "Nova versão" do app que publica um (o Maestro para computador).
 */
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; arquivo: string }> }) {
  const { id, arquivo } = await params
  const auth = await getAuth()
  const destino = await enderecoDoArquivo(await liberadosPara(auth?.user.id ?? null, 'download'), id, decodeURIComponent(arquivo))
  if (!destino)
    return new Response('Arquivo indisponível.', { status: 404, headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' } })
  return new Response(null, { status: 302, headers: { location: destino, 'cache-control': 'no-store' } })
}
