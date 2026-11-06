/** GET /radio/app/<arquivo> — estilo e scripts do rádio, só para quem passa no gate (fora dele, 404). Lista fechada. */
import { RADIO_ARQUIVOS } from '@/lib/radio/arquivos'
import { acessoAoRadio } from '@/lib/radio'
import { db, getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

const nada = () => new Response('Não encontrado', { status: 404, headers: { 'cache-control': 'no-store' } })

export async function GET(_req: Request, ctx: { params: Promise<{ arquivo: string[] }> }) {
  const nome = (await ctx.params).arquivo.join('/')
  const arquivo = nome !== 'app.html' && Object.hasOwn(RADIO_ARQUIVOS, nome) ? RADIO_ARQUIVOS[nome] : undefined
  if (!arquivo) return nada()
  if (!(await acessoAoRadio(db(), await getAuth()))) return nada()
  return new Response(arquivo.corpo, {
    headers: { 'content-type': arquivo.tipo, 'cache-control': 'private, no-cache', 'x-robots-tag': 'noindex, nofollow' },
  })
}
