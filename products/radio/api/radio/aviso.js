// POST /api/radio/aviso — aviso de set (só o dono e a Direção). Regras em api/_nucleo.js.
import { avisar } from '../_nucleo.js'
import { rota } from '../_rota.js'

export default rota({ POST: avisar })
