import { andamentoHiggsfield, animarHiggsfield, envioHiggsfield, ESCOPO_HIGGSFIELD, telasHiggsfield } from '@zro/core'
import { DomainError } from '@zro/observability'
import { readJson, route } from '@/lib/api'
import { ambienteHiggsfield } from '@/lib/conexoes'

/**
 * POST /api/v1/higgsfield/gerar — { acao: 'envio', tipo } abre o envio de uma imagem de referência (o aparelho manda
 * direto para a Higgsfield); { acao: 'telas', prompt, quantidade, proporcao, ref? } gera as telas antes do vídeo;
 * { acao: 'animar', opcao, duracao, prompt, ref } anima uma imagem. Preço e saldo conferidos na Higgsfield antes.
 * GET ?id= — o andamento de um pedido. Só com o token do app (Bearer, escopo zro.higgsfield).
 */
export const POST = route(
  async ({ db, auth, req }) => {
    const corpo = (await readJson(req, 20_000)) as Record<string, unknown> | null
    if (!corpo || typeof corpo !== 'object') throw new DomainError('invalid_input', 'Pedido inválido.')
    const amb = ambienteHiggsfield()
    if (corpo.acao === 'envio') return envioHiggsfield(db, amb, auth, corpo.tipo)
    if (corpo.acao === 'telas') return telasHiggsfield(db, amb, auth, corpo)
    if (corpo.acao === 'animar') return animarHiggsfield(db, amb, auth, corpo)
    throw new DomainError('invalid_input', 'Ação desconhecida.')
  },
  { bearer: ESCOPO_HIGGSFIELD, mutation: true },
)

export const GET = route(({ db, auth, req }) => andamentoHiggsfield(db, ambienteHiggsfield(), auth, new URL(req.url).searchParams.get('id')), {
  bearer: ESCOPO_HIGGSFIELD,
})
