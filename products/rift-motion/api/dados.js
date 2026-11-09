// /api/rift/* — projetos, biblioteca, exportações, a Z e a saúde do banco, numa função só (api/_roteador.js). Os
// handlers são os de sempre, em api/_rotas/rift/.
import { roteador } from './_roteador.js'
import projetos from './_rotas/rift/projetos.js'
import biblioteca from './_rotas/rift/biblioteca.js'
import exportacoes from './_rotas/rift/exportacoes.js'
import saude from './_rotas/rift/saude.js'
import z from './_rotas/rift/z.js'

export const ROTAS = { projetos, biblioteca, exportacoes, saude, z }

export default roteador('/api/rift', ROTAS)
