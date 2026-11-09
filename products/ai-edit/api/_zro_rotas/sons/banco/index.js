// GET /api/zro/sons/banco?pasta&q&pagina&conta — a pasta do Drive com os sons da pessoa, pela Absolute ZRO (api/_sons.js).
import { repassarSons } from '../../../_sons.js'

export default (req, res) => repassarSons(req, res)
