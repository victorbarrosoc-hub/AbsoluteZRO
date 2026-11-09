// /api/zro/* — login único da Absolute ZRO e o repasse da Higgsfield, numa função só (api/_roteador.js). Os handlers
// são os de sempre, em api/_rotas/zro/.
import { roteador } from './_roteador.js'
import entrar from './_rotas/zro/entrar.js'
import callback from './_rotas/zro/callback.js'
import eu from './_rotas/zro/eu.js'
import sair from './_rotas/zro/sair.js'
import higgsfield from './_rotas/zro/higgsfield/index.js'
import gerar from './_rotas/zro/higgsfield/gerar.js'

export const ROTAS = { entrar, callback, eu, sair, higgsfield, 'higgsfield/gerar': gerar }

export default roteador('/api/zro', ROTAS)
