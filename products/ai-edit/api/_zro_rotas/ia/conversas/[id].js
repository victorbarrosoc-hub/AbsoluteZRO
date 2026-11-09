// GET e DELETE /api/zro/ia/conversas/<id> — repasse para a API da Z (api/_ia.js).
import { repassar } from '../../../_ia.js'

export default (req, res) => repassar(req, res)
