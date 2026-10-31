// GET /api/zro/sons/openverse/<id> — o arquivo do som pela Absolute ZRO (api/_sons.js).
import { repassarSons } from '../../../_sons.js'

export default (req, res) => repassarSons(req, res)
