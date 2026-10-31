// GET /api/zro/sons/buscar?q&pagina — efeitos sonoros livres pela Absolute ZRO (api/_sons.js).
import { repassarSons } from '../../_sons.js'

export default (req, res) => repassarSons(req, res)
