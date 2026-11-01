// GET /api/higgsfield/entrar?volta=/#estudio — "Entrar com a Higgsfield" (usa os créditos do plano da pessoa).
// Precisa da sessão do Rift. Na primeira vez o Rift se registra como app na Higgsfield (registro dinâmico) e guarda o
// client_id. Leva ao login da Higgsfield com PKCE; a volta é /api/higgsfield/callback.
import { banco, nuvemLigada } from '../_banco.js'
import { pessoaDe } from '../_rift.js'
import { comAviso, configurado, consulta, cookie, origemDoPedido, origemPermitida, redirecionar, selar, voltaSegura } from '../_zro.js'
import { appDaHiggsfield, novoSegredo, urlEntrarHf } from '../_higgsfield.js'

export const COOKIE_HF = 'rf_hf'
export const retornoHf = (origem) => `${origem}/api/higgsfield/callback`

export default async function entrar(req, res) {
  const volta = voltaSegura(consulta(req).get('volta') || '/#estudio')
  const origem = origemPermitida(req)
  if (origemDoPedido(req) !== origem) return redirecionar(res, 307, `${origem}/api/higgsfield/entrar?volta=${encodeURIComponent(volta)}`)
  if (!configurado() || !nuvemLigada()) return redirecionar(res, 303, comAviso(volta, 'hf-config'))
  if (!pessoaDe(req)) return redirecionar(res, 303, `/api/zro/entrar?volta=${encodeURIComponent(volta)}`)
  try {
    const redirect = retornoHf(origem)
    const clientId = await appDaHiggsfield(banco(), redirect)
    const state = novoSegredo()
    const verificador = novoSegredo()
    const ida = selar(COOKIE_HF, { state, verificador, volta, clientId, redirect }, 600)
    return redirecionar(res, 302, urlEntrarHf({ clientId, redirect, state, verificador }), [cookie(COOKIE_HF, ida, { maxAge: 600, path: '/api/higgsfield' })])
  } catch (e) {
    console.error('higgsfield entrar', e?.message || e)
    return redirecionar(res, 303, comAviso(volta, 'hf-erro'))
  }
}
