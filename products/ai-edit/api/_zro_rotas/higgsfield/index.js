// GET /api/zro/higgsfield?duracao&proporcao — o painel de créditos da Higgsfield pela Absolute ZRO (api/_higgsfield.js).
import { repassarHiggsfield } from '../../_higgsfield.js'

export default (req, res) => repassarHiggsfield(req, res)
