// GET /api/zro/higgsfield?duracao&proporcao — o painel de créditos da Higgsfield pela Absolute ZRO (api/_higgsfield.js).
import { repassarHiggsfield } from '../../_higgsfield.js'
import { fechadoPelaPrevia } from '../../_previa.js'

export default (req, res) => (fechadoPelaPrevia(req, res) ? undefined : repassarHiggsfield(req, res))
