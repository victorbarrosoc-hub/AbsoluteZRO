// GET /api/zro/ia/estado — repasse para a API da Z (api/_ia.js).
import { repassar } from '../../_ia.js'

export default (req, res) => repassar(req, res)
