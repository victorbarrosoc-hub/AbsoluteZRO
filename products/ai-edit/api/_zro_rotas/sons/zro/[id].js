// GET /api/zro/sons/zro/<id> — o arquivo de uma versão de um som da Absolute ZRO (api/_sons.js).
import { repassarSons } from '../../../_sons.js'

export default (req, res) => repassarSons(req, res)
