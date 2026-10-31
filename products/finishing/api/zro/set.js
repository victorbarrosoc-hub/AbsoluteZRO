// /api/zro/set e /api/zro/set/<caminho> (a Vercel reescreve para ?c=<caminho>, vercel.json) — repasse para a API do
// Set da Absolute ZRO (api/_set.js).
import { repassarSet } from '../_set.js'

export default (req, res) => repassarSet(req, res)
