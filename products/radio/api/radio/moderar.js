// POST /api/radio/moderar — silenciar e reativar (pessoa, setor ou o set), mover de setor, escolher responsável, mudar
// papel, tirar, pedir a palavra, ajustes e histórico do dono. Regras em api/_nucleo.js; poderes no banco (radio.moderar).
import { moderar } from '../_nucleo.js'
import { rota } from '../_rota.js'

export default rota({ POST: moderar })
