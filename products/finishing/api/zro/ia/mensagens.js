// POST /api/zro/ia/mensagens — repasse para a API da Z, com a resposta em NDJSON passando aos poucos (api/_ia.js).
import { repassar } from '../../_ia.js'

export default (req, res) => repassar(req, res)
