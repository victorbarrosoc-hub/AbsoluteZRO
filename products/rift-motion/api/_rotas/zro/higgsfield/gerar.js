// POST /api/zro/higgsfield/gerar { acao: envio | telas | animar } e GET ?id= — gerar pela Absolute ZRO (api/_higgsfield.js).
import { repassarHiggsfield } from '../../../_higgsfield.js'
import { fechadoPelaPrevia } from '../../../_previa.js'

export default (req, res) => (fechadoPelaPrevia(req, res) ? undefined : repassarHiggsfield(req, res))
