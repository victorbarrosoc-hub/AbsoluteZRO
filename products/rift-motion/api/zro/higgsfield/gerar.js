// POST /api/zro/higgsfield/gerar { acao: envio | telas | animar } e GET ?id= — gerar pela Absolute ZRO (api/_higgsfield.js).
import { repassarHiggsfield } from '../../_higgsfield.js'

export default (req, res) => repassarHiggsfield(req, res)
