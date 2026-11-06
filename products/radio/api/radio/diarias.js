// /api/radio/diarias — GET as diárias da pessoa; POST { acao: criar | entrar | funcao }. Regras em api/_nucleo.js.
import { listarDiarias, mudarDiarias } from '../_nucleo.js'
import { rota } from '../_rota.js'

export default rota({ GET: listarDiarias, POST: mudarDiarias })
