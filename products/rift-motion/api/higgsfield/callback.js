// GET /api/higgsfield/callback — volta do login da Higgsfield: confere o state, troca o código (PKCE) e guarda os
// tokens CIFRADOS em rift.conexoes (tipo "conta"). Nunca põe token em cookie nem na URL.
import { pessoaDe } from '../_rift.js'
import { abrir, comAviso, consulta, cookie, lerCookie, redirecionar } from '../_zro.js'
import { emailDoIdToken, trocarCodigoHf } from '../_higgsfield.js'
import { guardarConexao } from '../_conexao.js'
import { COOKIE_HF } from './entrar.js'

export default async function callback(req, res) {
  const q = consulta(req)
  const ida = abrir(COOKIE_HF, lerCookie(req, COOKIE_HF))
  const limpar = [cookie(COOKIE_HF, '', { maxAge: 0, path: '/api/higgsfield' })]
  const volta = ida?.volta || '/#estudio'
  const pessoa = pessoaDe(req)
  if (!ida || !pessoa || !q.get('state') || q.get('state') !== ida.state) return redirecionar(res, 303, comAviso(volta, 'hf-erro'), limpar)
  if (q.get('error') || !q.get('code')) return redirecionar(res, 303, comAviso(volta, 'hf-cancelado'), limpar)
  try {
    const t = await trocarCodigoHf({ clientId: ida.clientId, code: q.get('code'), redirect: ida.redirect, verificador: ida.verificador })
    const email = emailDoIdToken(t.idToken)
    await guardarConexao(pessoa, { tipo: 'conta', rotulo: email ? `Conta ${email}` : 'Conta Higgsfield', segredo: { access: t.access, refresh: t.refresh, expira: t.expira, clientId: ida.clientId } })
    return redirecionar(res, 303, comAviso(volta, 'hf-ok'), limpar)
  } catch (e) {
    console.error('higgsfield callback', e?.message || e)
    return redirecionar(res, 303, comAviso(volta, 'hf-erro'), limpar)
  }
}
