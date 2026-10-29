/**
 * Google de mentira para as Conexões (ADR 0026), nos testes de integração e no e2e: OAuth (autorizar, token com PKCE,
 * refresh, revogar) e o pedaço da Calendar API que o HUB usa (calendarList, events: listar, buscar pela marca privada,
 * ler, criar com id, substituir e apagar). Tudo em memória; nada sai para a rede.
 */
import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

export type EventoFalso = Record<string, unknown> & {
  id: string
  status: string
  start: { date?: string; dateTime?: string }
  end: { date?: string; dateTime?: string }
  extendedProperties?: { private?: Record<string, string> }
}

export type GoogleFalso = Awaited<ReturnType<typeof iniciarGoogleFalso>>

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

export async function iniciarGoogleFalso(o: { porta?: number; clientId?: string } = {}) {
  const clientId = o.clientId ?? 'google-teste'
  const estado = {
    /** Próxima autorização: o que a "pessoa" faz na tela do Google. */
    decisao: 'aceitar' as 'aceitar' | 'negar' | 'sem_agenda',
    conta: { sub: 'google-sub-1', email: 'pessoa@gmail.test' },
    codigos: new Map<string, { desafio: string; nonce: string; redirect: string }>(),
    acessos: new Map<string, number>(),
    refreshs: new Set<string>(),
    revogados: [] as string[],
    /** O próximo refresh responde invalid_grant. */
    invalidarRefresh: false,
    semRefreshToken: false,
    calendarios: [
      { id: 'pessoa@gmail.test', summary: 'Pessoa', primary: true, backgroundColor: '#1d1d1f', accessRole: 'owner' },
      { id: 'trabalho@group.calendar.google.com', summary: 'Trabalho', backgroundColor: '#5e5e63', accessRole: 'owner' },
    ] as Record<string, unknown>[],
    eventos: new Map<string, EventoFalso[]>([
      ['primary', []],
      ['trabalho@group.calendar.google.com', []],
    ]),
    chamadas: [] as { metodo: string; caminho: string }[],
  }
  let n = 0

  const enviar = (res: http.ServerResponse, status: number, dados?: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(dados === undefined ? '' : JSON.stringify(dados))
  }
  const novoAcesso = () => {
    const t = `at-${++n}-${randomBytes(6).toString('hex')}`
    estado.acessos.set(t, Date.now() + 3600_000)
    return t
  }
  const lista = (cal: string) => {
    const c = cal === estado.calendarios.find((x) => x.primary)?.id ? 'primary' : cal
    if (!estado.eventos.has(c)) return null
    return estado.eventos.get(c)!
  }

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    let texto = ''
    for await (const p of req) texto += p
    estado.chamadas.push({ metodo: req.method ?? 'GET', caminho: url.pathname })
    const form = new URLSearchParams(texto)

    // ── OAuth ──
    if (url.pathname === '/o/oauth2/v2/auth') {
      const volta = new URL(url.searchParams.get('redirect_uri')!)
      volta.searchParams.set('state', url.searchParams.get('state') ?? '')
      if (estado.decisao === 'negar') volta.searchParams.set('error', 'access_denied')
      else {
        const code = `code-${randomBytes(8).toString('hex')}`
        estado.codigos.set(code, {
          desafio: url.searchParams.get('code_challenge') ?? '',
          nonce: url.searchParams.get('nonce') ?? '',
          redirect: url.searchParams.get('redirect_uri') ?? '',
        })
        volta.searchParams.set('code', code)
      }
      res.writeHead(302, { Location: volta.toString() })
      return res.end()
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      if (form.get('client_id') !== clientId) return enviar(res, 401, { error: 'invalid_client' })
      if (form.get('grant_type') === 'authorization_code') {
        const c = estado.codigos.get(form.get('code') ?? '')
        estado.codigos.delete(form.get('code') ?? '')
        const verif = form.get('code_verifier') ?? ''
        if (!c || createHash('sha256').update(verif).digest('base64url') !== c.desafio || c.redirect !== form.get('redirect_uri'))
          return enviar(res, 400, { error: 'invalid_grant' })
        const escopos = ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/calendar.events']
        if (estado.decisao !== 'sem_agenda') escopos.push('https://www.googleapis.com/auth/calendar.calendarlist.readonly')
        const rt = `rt-${randomBytes(8).toString('hex')}`
        estado.refreshs.add(rt)
        const agora = Math.floor(Date.now() / 1000)
        const idToken = `${b64({ alg: 'RS256' })}.${b64({ iss: 'https://accounts.google.com', aud: clientId, sub: estado.conta.sub, email: estado.conta.email, email_verified: true, nonce: c.nonce, iat: agora, exp: agora + 3600 })}.assinatura`
        return enviar(res, 200, {
          access_token: novoAcesso(),
          expires_in: 3599,
          id_token: idToken,
          scope: escopos.join(' '),
          token_type: 'Bearer',
          ...(estado.semRefreshToken ? {} : { refresh_token: rt }),
        })
      }
      if (form.get('grant_type') === 'refresh_token') {
        const rt = form.get('refresh_token') ?? ''
        if (estado.invalidarRefresh || !estado.refreshs.has(rt)) return enviar(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
        return enviar(res, 200, { access_token: novoAcesso(), expires_in: 3599, token_type: 'Bearer' })
      }
      return enviar(res, 400, { error: 'unsupported_grant_type' })
    }
    if (url.pathname === '/revoke' && req.method === 'POST') {
      const t = form.get('token') ?? ''
      estado.revogados.push(t)
      estado.refreshs.delete(t)
      return enviar(res, 200, {})
    }

    // ── Calendar API ──
    const at = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''))?.[1] ?? ''
    if (!estado.acessos.has(at) || estado.acessos.get(at)! < Date.now()) return enviar(res, 401, { error: { code: 401, message: 'Invalid Credentials' } })
    if (url.pathname === '/calendar/v3/users/me/calendarList') return enviar(res, 200, { items: estado.calendarios })
    const m = /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname)
    if (!m) return enviar(res, 404, { error: { code: 404 } })
    const evs = lista(decodeURIComponent(m[1]!))
    if (!evs) return enviar(res, 404, { error: { code: 404, message: 'Not Found' } })
    const id = m[2] ? decodeURIComponent(m[2]) : null
    if (!id && req.method === 'GET') {
      const marcas = url.searchParams.getAll('privateExtendedProperty').map((p) => p.split('='))
      const de = url.searchParams.get('timeMin') ? Date.parse(url.searchParams.get('timeMin')!) : null
      const ate = url.searchParams.get('timeMax') ? Date.parse(url.searchParams.get('timeMax')!) : null
      const itens = evs.filter((e) => {
        if (e.status === 'cancelled' && url.searchParams.get('showDeleted') !== 'true') return false
        if (marcas.some(([k, v]) => e.extendedProperties?.private?.[k!] !== v)) return false
        const ini = Date.parse(e.start.dateTime ?? `${e.start.date}T00:00:00-03:00`)
        const fim = Date.parse(e.end.dateTime ?? `${e.end.date}T00:00:00-03:00`)
        return (de === null || fim > de) && (ate === null || ini < ate)
      })
      return enviar(res, 200, { timeZone: 'America/Sao_Paulo', items: itens })
    }
    if (!id && req.method === 'POST') {
      const corpo = JSON.parse(texto) as EventoFalso
      if (evs.some((e) => e.id === corpo.id)) return enviar(res, 409, { error: { code: 409, message: 'The requested identifier already exists.' } })
      const e = { ...corpo, id: corpo.id ?? randomBytes(8).toString('hex'), status: 'confirmed', htmlLink: `https://calendar.google.test/e/${corpo.id}` }
      evs.push(e)
      return enviar(res, 200, e)
    }
    const i = evs.findIndex((e) => e.id === id)
    if (req.method === 'GET') return i < 0 ? enviar(res, 404, { error: { code: 404 } }) : enviar(res, 200, evs[i])
    if (req.method === 'PUT') {
      if (i < 0) return enviar(res, 404, { error: { code: 404 } })
      evs[i] = { ...(JSON.parse(texto) as EventoFalso), id: id!, htmlLink: `https://calendar.google.test/e/${id}` }
      return enviar(res, 200, evs[i])
    }
    if (req.method === 'DELETE') {
      if (i < 0 || evs[i]!.status === 'cancelled') return enviar(res, 410, { error: { code: 410, message: 'Resource has been deleted' } })
      evs[i] = { ...evs[i]!, status: 'cancelled' }
      res.writeHead(204)
      return res.end()
    }
    return enviar(res, 405, {})
  })
  await new Promise<void>((ok) => servidor.listen(o.porta ?? 0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
  return {
    url,
    clientId,
    estado,
    /** Um evento que a pessoa criou direto no Google. */
    criarNoGoogle(cal: string, e: Omit<EventoFalso, 'status'> & { status?: string }) {
      lista(cal)!.push({ status: 'confirmed', ...e } as EventoFalso)
    },
    /** Faz o access token guardado vencer (o próximo pedido leva 401). */
    vencerAcessos() {
      estado.acessos.clear()
    },
    fechar: () => new Promise<void>((ok) => servidor.close(() => ok())),
  }
}
