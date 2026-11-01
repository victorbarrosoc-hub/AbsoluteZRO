import { ESCOPO_HIGGSFIELD, painelHiggsfield } from '@zro/core'
import { route } from '@/lib/api'
import { ambienteHiggsfield } from '@/lib/conexoes'

/**
 * GET /api/v1/higgsfield?duracao=curto|longo&proporcao=16:9 — o painel de créditos do app: saldo e plano na Higgsfield,
 * o gasto do mês, o que os apps registraram e o preço agora das telas (1, 2 e 4) e das três opções de vídeo, sem gerar
 * nada. Só com o token do app (Bearer, escopo zro.higgsfield). Contrato: packages/core/src/higgsfield.ts.
 */
export const GET = route(
  ({ db, auth, req }) => {
    const q = new URL(req.url).searchParams
    return painelHiggsfield(db, ambienteHiggsfield(), auth, { duracao: q.get('duracao'), proporcao: q.get('proporcao') })
  },
  { bearer: ESCOPO_HIGGSFIELD },
)
