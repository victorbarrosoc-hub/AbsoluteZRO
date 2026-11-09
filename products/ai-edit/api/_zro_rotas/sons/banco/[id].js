// GET /api/zro/sons/banco/<id>?conta — o arquivo de um som do banco da pessoa no Drive, pela Absolute ZRO (api/_sons.js).
import { repassarSons } from '../../../_sons.js'

export default (req, res) => repassarSons(req, res)
