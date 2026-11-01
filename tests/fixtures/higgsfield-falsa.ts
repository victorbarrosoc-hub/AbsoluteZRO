/**
 * Higgsfield de mentira para as Conexões (migration 0052), nos testes de integração: OAuth (registro dinâmico,
 * autorizar, token com PKCE, refresh) e o pedaço do MCP que o HUB usa (initialize, balance, transactions,
 * generate_image e generate_video com get_cost, media_upload, media_confirm, jobs_wait). Tudo em memória; nada sai
 * para a rede.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

export type HiggsfieldFalsa = Awaited<ReturnType<typeof iniciarHiggsfieldFalsa>>

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

export async function iniciarHiggsfieldFalsa() {
  const estado = {
    /** Próxima autorização: o que a "pessoa" faz na tela da Higgsfield. */
    decisao: 'aceitar' as 'aceitar' | 'negar',
    conta: { sub: 'hf-sub-1', email: 'pessoa@higgsfield.test' },
    registros: [] as { client_id: string; redirect_uris: string[] }[],
    codigos: new Map<string, { desafio: string; redirect: string; clientId: string }>(),
    acessos: new Set<string>(),
    refreshs: new Set<string>(),
    /** O próximo refresh responde invalid_grant. */
    invalidarRefresh: false,
    /** O MCP recusa todo token (401) até voltar a false. */
    recusarTokens: false,
    creditos: 120,
    plano: 'creator',
    precos: { imagem: 1.5, rapido: 4, equilibrado: 10, maximo: 22 } as Record<string, number>,
    transacoes: [] as { created_at: string; action: string; credits: number }[],
    envios: [] as string[],
    confirmados: [] as string[],
    /** job_id → como está; o teste muda à vontade */
    jobs: new Map<string, { status: string; tipo: 'imagem' | 'video'; url?: string; erro?: string }>(),
    /** o que foi pedido para gerar de verdade (sem get_cost) */
    geracoes: [] as { tool: string; params: Record<string, unknown> }[],
    chamadas: [] as string[],
  }
  let n = 0

  const enviar = (res: http.ServerResponse, status: number, dados?: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
    res.end(dados === undefined ? '' : JSON.stringify(dados))
  }
  const ler = (req: http.IncomingMessage) =>
    new Promise<string>((ok) => {
      let s = ''
      req.on('data', (c) => (s += c))
      req.on('end', () => ok(s))
    })
  const novoAcesso = () => {
    const t = `hf-at-${++n}-${randomBytes(6).toString('hex')}`
    estado.acessos.add(t)
    return t
  }
  const texto = (id: unknown, d: unknown, isError = false) => ({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(d) }], isError } })

  function ferramenta(nome: string, a: Record<string, unknown>): { d: unknown; erro?: boolean } {
    estado.chamadas.push(nome)
    const p = (a.params ?? {}) as Record<string, unknown>
    switch (nome) {
      case 'balance':
        return { d: { credits: estado.creditos, subscription_plan_type: estado.plano } }
      case 'transactions':
        return { d: { items: [...estado.transacoes].reverse(), next_cursor: null } }
      case 'media_upload': {
        const media_id = randomUUID()
        estado.envios.push(media_id)
        return { d: { uploads: [{ media_id, upload_url: `https://upload.higgsfield.test/${media_id}?assinado=1`, content_type: a.content_type }] } }
      }
      case 'media_confirm':
        estado.confirmados.push(String(a.media_id))
        return { d: { ok: true } }
      case 'generate_image':
      case 'generate_video': {
        const video = nome === 'generate_video'
        const chave = video ? ({ grok_video_v15_lite: 'rapido', kling2_6: 'equilibrado', kling3_0: 'maximo' } as Record<string, string>)[String(p.model)] : 'imagem'
        if (!chave) return { d: { error: 'modelo desconhecido' }, erro: true }
        const preco = estado.precos[chave]! * (video ? Number(p.duration) / 5 : Number(p.count ?? 1))
        if (p.get_cost) return { d: { cost: { credits: preco, credits_exact: preco } } }
        if (preco > estado.creditos) return { d: { error: 'Not enough credits' }, erro: true }
        estado.creditos -= preco
        estado.transacoes.push({ created_at: new Date().toISOString(), action: 'spend', credits: -preco })
        estado.geracoes.push({ tool: nome, params: p })
        const qtd = video ? 1 : Number(p.count ?? 1)
        const jobs = Array.from({ length: qtd }, () => {
          const job_id = randomUUID()
          estado.jobs.set(job_id, { status: 'queued', tipo: video ? 'video' : 'imagem' })
          return { job_id }
        })
        return { d: { jobs } }
      }
      case 'jobs_wait': {
        const lista = (a.jobs as { index: number; job_id: string }[]) ?? []
        return {
          d: {
            jobs: lista.map(({ index, job_id }) => {
              const j = estado.jobs.get(job_id)
              if (!j) return { index, job_id, status: 'failed', error: 'não existe' }
              return { index, job_id, status: j.status, ...(j.url ? { result: { raw_url: j.url } } : {}), ...(j.erro ? { error: j.erro } : {}) }
            }),
          },
        }
      }
      default:
        return { d: { error: `ferramenta ${nome}` }, erro: true }
    }
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x')
    try {
      if (u.pathname === '/oauth/register' && req.method === 'POST') {
        const d = JSON.parse(await ler(req)) as { redirect_uris: string[] }
        const client_id = `hf-cliente-${estado.registros.length + 1}`
        estado.registros.push({ client_id, redirect_uris: d.redirect_uris })
        return enviar(res, 201, { client_id })
      }
      if (u.pathname === '/oauth/authorize') {
        const q = u.searchParams
        const redirect = q.get('redirect_uri')!
        const volta = new URL(redirect)
        volta.searchParams.set('state', q.get('state') ?? '')
        if (estado.decisao === 'negar') volta.searchParams.set('error', 'access_denied')
        else {
          const code = `hf-code-${++n}`
          estado.codigos.set(code, { desafio: q.get('code_challenge') ?? '', redirect, clientId: q.get('client_id') ?? '' })
          volta.searchParams.set('code', code)
        }
        res.writeHead(302, { Location: volta.toString() })
        return res.end()
      }
      if (u.pathname === '/oauth/token' && req.method === 'POST') {
        const f = new URLSearchParams(await ler(req))
        if (f.get('grant_type') === 'authorization_code') {
          const c = estado.codigos.get(f.get('code') ?? '')
          estado.codigos.delete(f.get('code') ?? '')
          const desafio = createHash('sha256')
            .update(f.get('code_verifier') ?? '')
            .digest('base64url')
          if (!c || c.desafio !== desafio || c.redirect !== f.get('redirect_uri') || c.clientId !== f.get('client_id')) return enviar(res, 400, { error: 'invalid_grant' })
          const rt = `hf-rt-${++n}-${randomBytes(6).toString('hex')}`
          estado.refreshs.add(rt)
          return enviar(res, 200, { access_token: novoAcesso(), refresh_token: rt, expires_in: 3600, id_token: `e30.${b64(estado.conta)}.x` })
        }
        if (f.get('grant_type') === 'refresh_token') {
          if (estado.invalidarRefresh || !estado.refreshs.has(f.get('refresh_token') ?? '')) return enviar(res, 400, { error: 'invalid_grant' })
          return enviar(res, 200, { access_token: novoAcesso(), expires_in: 3600 })
        }
        return enviar(res, 400, { error: 'unsupported_grant_type' })
      }
      if (u.pathname === '/mcp' && req.method === 'POST') {
        const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '')
        if (estado.recusarTokens || !estado.acessos.has(tok)) return enviar(res, 401, { error: 'invalid_token' })
        const m = JSON.parse(await ler(req)) as { id?: number; method: string; params?: { name: string; arguments: Record<string, unknown> } }
        if (m.method === 'initialize') return enviar(res, 200, { jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: {} } }, { 'Mcp-Session-Id': `sessao-${++n}` })
        if (m.id === undefined) return enviar(res, 202)
        if (m.method !== 'tools/call') return enviar(res, 200, { jsonrpc: '2.0', id: m.id, error: { message: 'método' } })
        const r = ferramenta(m.params!.name, m.params!.arguments ?? {})
        // metade das respostas em SSE, como o MCP de verdade pode mandar
        if (n % 2) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' })
          return res.end(`event: message\ndata: ${JSON.stringify(texto(m.id, r.d, r.erro))}\n\n`)
        }
        return enviar(res, 200, texto(m.id, r.d, r.erro))
      }
      enviar(res, 404, { error: 'not_found' })
    } catch {
      enviar(res, 500, { error: 'falha' })
    }
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    url,
    estado,
    /** A Higgsfield termina um pedido (todas as telas ou o vídeo). */
    terminar(jobIds: string[], status = 'completed') {
      for (const id of jobIds) {
        const j = estado.jobs.get(id)
        if (j) Object.assign(j, { status, ...(status === 'completed' ? { url: `https://cdn.higgsfield.test/${id}.${j.tipo === 'video' ? 'mp4' : 'png'}` } : { erro: 'Conteúdo recusado.' }) })
      }
    },
    fechar: () => new Promise<void>((ok) => server.close(() => ok())),
  }
}
