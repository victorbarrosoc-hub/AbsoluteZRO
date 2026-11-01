// POST /api/zro/higgsfield/gerar (envio, telas, animar) e GET ?id= (andamento), pela Absolute ZRO (api/_higgsfield.js).
import { repassarHiggsfield } from '../../_higgsfield.js'

export default (req, res) => repassarHiggsfield(req, res)
