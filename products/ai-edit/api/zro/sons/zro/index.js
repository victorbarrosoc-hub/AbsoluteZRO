// GET /api/zro/sons/zro — os sons originais da Absolute ZRO (o banco padrão), pela Absolute ZRO (api/_sons.js).
import { repassarSons } from '../../../_sons.js'

export default (req, res) => repassarSons(req, res)
