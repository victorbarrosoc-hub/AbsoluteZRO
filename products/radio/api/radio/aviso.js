// POST /api/radio/aviso — aviso de set (dono e Direção para todos ou um setor; responsável, para o setor dele). Regras em api/_nucleo.js.
import { avisar } from '../_nucleo.js'
import { rota } from '../_rota.js'

export default rota({ POST: avisar })
