import { liberadosPara } from '@/lib/data/catalog'
import { enderecoDoArquivo } from '@/lib/desktop-apps'
import { acessoAoDownload, liberadosParaBaixar } from '@/lib/meus-apps'
import { db, getAuth } from '@/lib/session'

/**
 * /baixar/app/<ferramenta>/<arquivo>: a central "Absolute ZRO" baixa daqui (ADR 0036). Só arquivos que o catálogo
 * reconhece; redireciona para o endereço assinado e temporário do GitHub (o arquivo não passa pela Vercel).
 * - Produto fechado (ADR 0023) é 404, salvo para quem está na lista de acesso do canal download, logado. AEON, Revela,
 *   NOSSOM e Rift Motion (não lançados) só baixam para admin de plataforma, que baixa tudo.
 * - Instalador de app pago pede a sessão (a da central) e o produto no plano da organização, conferido aqui: sem sessão
 *   401, sem o direito 403. App de uso livre (plano grátis) e o `versao.json` seguem só com o gate, para os apps já
 *   instalados continuarem a se atualizar por aqui.
 * `mac`/`windows` = o instalador mais novo daquele sistema; `versao.json` = o aviso "Nova versão" do app que publica um.
 * Estas rotas saíram da página Downloads (lá fica só a Absolute ZRO), mas continuam no ar.
 */
export const dynamic = 'force-dynamic'

const texto = (corpo: string, status: number) =>
  new Response(corpo, { status, headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' } })

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; arquivo: string }> }) {
  const { id, arquivo } = await params
  const nome = decodeURIComponent(arquivo)
  const auth = await getAuth()
  const liberados = liberadosParaBaixar(auth, await liberadosPara(auth?.user.id ?? null, 'download'))
  const acesso = await acessoAoDownload(db(), auth, id, nome, liberados)
  if (acesso === 'entrar') return texto('Entre na Absolute ZRO para baixar este app.', 401)
  if (acesso === 'sem-direito') return texto('Este app não está no seu plano.', 403)
  const destino = acesso === 'ok' ? await enderecoDoArquivo(liberados, id, nome) : null
  if (!destino) return texto('Arquivo indisponível.', 404)
  return new Response(null, { status: 302, headers: { location: destino, 'cache-control': 'no-store' } })
}
