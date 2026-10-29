// GET /api/zro/roteiro?projeto=<uuid> — "Abrir no TPeasy": o roteiro mais novo de um projeto da Absolute ZRO, pronto
// para o app guardar no aparelho. O servidor pede ao HUB com o access token da sessão (cofre tp_zro_hub, escopo
// tpeasy.roteiros); o token nunca vai para a página. Quem vê o quê (organização, papel, plano) quem decide é o HUB.
//
// Respostas: 200 { projeto, versao, documento, roteiro: { id, title, body, updated } } · 400 projeto inválido · 401
// sem login (com `reconectar` quando entrar de novo resolve: login de antes do escopo, sessão vencida) · 403 sem acesso
// ao projeto ou ao TPeasy · 404 projeto sem roteiro · 502 HUB fora do ar ou resposta estranha. Sempre no-store.
import { COOKIE_HUB, COOKIE_SESSAO, DURACAO_SESSAO_S, ZroError, abrir, cifrar, config, configurado, decifrar, json, lerCookie, seguro, serializarCookie, tokenValido, urlDoPedido } from './_zro.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEXTO_MAX = 200_000
const SEM_LOGIN = 'Entre com a conta Absolute ZRO para abrir o roteiro.'

/** O backup que o HUB devolve tem de ser exatamente o roteiro deste projeto (`zro-<projeto>`), e nada além. */
export function roteiroDoBackup(corpo, projeto) {
  if (!corpo || corpo.app !== 'tpeasy' || corpo.version !== 1 || !Array.isArray(corpo.scripts) || corpo.scripts.length !== 1) return null
  const s = corpo.scripts[0]
  if (!s || s.id !== `zro-${projeto}` || typeof s.body !== 'string' || s.body.length > TEXTO_MAX) return null
  const title = typeof s.title === 'string' ? s.title.slice(0, 200) : ''
  return { id: s.id, title: title || 'Roteiro', body: s.body, updated: Number.isFinite(s.updated) ? s.updated : null }
}

export default async function roteiro(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { erro: 'metodo' })
  }
  const projeto = String(urlDoPedido(req).searchParams.get('projeto') ?? '').toLowerCase()
  if (!UUID.test(projeto)) return json(res, 400, { erro: 'entrada', mensagem: 'Link de projeto inválido.' })
  if (!configurado()) return json(res, 401, { erro: 'sem_login', mensagem: SEM_LOGIN, configurado: false })

  const s = abrir(lerCookie(req, COOKIE_SESSAO), 'sessao')
  const hub = decifrar(lerCookie(req, COOKIE_HUB))
  if (!s || typeof s.sub !== 'string' || !hub || hub.sub !== s.sub) return json(res, 401, { erro: 'sem_login', mensagem: SEM_LOGIN, reconectar: true })

  const secure = seguro(req)
  const cookies = []
  const guardar = (t) => cookies.splice(0, cookies.length, serializarCookie(COOKIE_HUB, cifrar({ sub: s.sub, ...t }), { path: '/api/zro', secure, maxAge: DURACAO_SESSAO_S }))
  const pedir = (at) =>
    fetch(`${config().emissor}/api/v1/projects/${projeto}/tpeasy/script`, {
      headers: { Authorization: `Bearer ${at}`, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    })

  let r
  try {
    let { tokens, renovou } = await tokenValido(hub)
    if (renovou) guardar(tokens)
    r = await pedir(tokens.at)
    if (r.status === 401 && !renovou) {
      await r.body?.cancel().catch(() => {})
      ;({ tokens } = await tokenValido(tokens, { forcar: true }))
      guardar(tokens)
      r = await pedir(tokens.at)
    }
  } catch (e) {
    if (e instanceof ZroError && e.codigo === 'revogado') {
      return json(res, 401, { erro: 'sem_login', mensagem: SEM_LOGIN, reconectar: true }, [serializarCookie(COOKIE_HUB, '', { path: '/api/zro', secure, maxAge: 0 })])
    }
    return json(res, 502, { erro: 'hub', mensagem: 'A Absolute ZRO não respondeu agora. Tente de novo.' }, cookies)
  }

  const corpo = await r.json().catch(() => null)
  // login de antes do "Abrir no TPeasy" (token sem tpeasy.roteiros): entrar de novo já pede o escopo
  if (r.status === 401) return json(res, 401, { erro: 'sem_login', mensagem: SEM_LOGIN, reconectar: true }, cookies)
  if (r.status === 403) return json(res, 403, { erro: 'sem_acesso', mensagem: 'Sua conta não abre este roteiro no TPeasy.' }, cookies)
  if (r.status === 404) return json(res, 404, { erro: 'sem_roteiro', mensagem: corpo?.error === 'not_found' ? 'Este projeto ainda não tem roteiro.' : 'Projeto não encontrado.' }, cookies)
  const doc = r.status === 200 ? roteiroDoBackup(corpo, projeto) : null
  if (!doc) return json(res, 502, { erro: 'hub', mensagem: 'A Absolute ZRO não respondeu agora. Tente de novo.' }, cookies)

  const versao = Number(r.headers.get('x-zro-versao'))
  const documento = String(r.headers.get('x-zro-documento') ?? '').toLowerCase()
  json(
    res,
    200,
    {
      projeto,
      versao: Number.isInteger(versao) && versao > 0 ? versao : null,
      documento: UUID.test(documento) ? documento : null,
      roteiro: doc,
    },
    cookies,
  )
}
