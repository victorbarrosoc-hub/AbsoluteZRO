// POST /api/radio/batida — presença, sinais de conexão (WebRTC) e avisos perdidos. Regras em api/_nucleo.js.
import { bater } from '../_nucleo.js'
import { rota } from '../_rota.js'

export default rota({ POST: bater })
