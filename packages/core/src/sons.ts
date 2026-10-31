/**
 * Sons para os apps da família (Sonoplasta do AEON, pedido do titular em 31/10/2026): busca de efeitos sonoros no
 * Openverse e o arquivo de cada um, pelo HUB, com o token da pessoa (escopo `zro.sons`). Só licenças que deixam usar
 * em vídeo comercial sem mudar a licença do vídeo: CC0, CC BY e domínio público (nada de NC, ND nem SA). Só fontes de
 * efeito (Freesound e Wikimedia); música (Jamendo) fica de fora. Cada som volta com autor, licença e página para os
 * créditos (o app escreve o CREDITOS.txt).
 *
 * - Com `OPENVERSE_CLIENT_ID` e `OPENVERSE_CLIENT_SECRET` (cadastro gratuito no Openverse) o HUB usa o limite do app;
 *   sem eles, o anônimo (20 por minuto, 200 por dia para o servidor inteiro) e avisa quando acaba.
 * - O arquivo vem só de hosts conhecidos das fontes (sem buscar URL qualquer em nome da pessoa), por https, sem seguir
 *   redirecionamento para outro host, e com tamanho máximo. Nada é guardado aqui: o HUB só repassa.
 */
import type { Authenticated } from '@zro/auth'
import { DomainError } from '@zro/observability'

export const ESCOPO_SONS = 'zro.sons'
export const OPENVERSE_PADRAO = 'https://api.openverse.org'
/** Um efeito passa disto? É trilha, não efeito (e o AEON recusa acima de 10 min). */
export const SOM_MAX_BYTES = 25 * 1024 * 1024
export const SONS_POR_PAGINA = 20
export const SONS_PAGINAS = 10
/** Licenças que entram (código do Openverse → nome nos créditos). */
const LICENCAS: Record<string, string> = { cc0: 'CC0', by: 'CC BY', pdm: 'Domínio público' }
const FONTES = ['freesound', 'wikimedia_audio']
/** De onde o arquivo pode vir (o host do `url` que o Openverse devolve). */
const HOSTS = ['cdn.freesound.org', 'freesound.org', 'upload.wikimedia.org']
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type SonsConfig = { base: string; clientId?: string; clientSecret?: string; fetch?: typeof fetch; timeoutMs?: number }

export function sonsConfigDoAmbiente(env: Record<string, string | undefined> = process.env): SonsConfig {
  return {
    base: (env.OPENVERSE_URL?.trim() || OPENVERSE_PADRAO).replace(/\/$/, ''),
    clientId: env.OPENVERSE_CLIENT_ID?.trim() || undefined,
    clientSecret: env.OPENVERSE_CLIENT_SECRET?.trim() || undefined,
  }
}

export type SomEncontrado = {
  id: string
  origem: 'openverse'
  titulo: string
  autor: string | null
  licenca: string
  licencaUrl: string | null
  pagina: string | null
  fonte: string
  duracao: number | null
  formato: string | null
  bytes: number | null
}

function exigirPessoa(auth: Authenticated | null) {
  if (!auth) throw new DomainError('unauthenticated', 'Entre com a conta Absolute ZRO para buscar sons.')
}

// token do app no Openverse (12 h), um por instância; renova 5 min antes de vencer
let tokenApp: { valor: string; vence: number; chave: string } | null = null
async function cabecalhos(cfg: SonsConfig, f: typeof fetch): Promise<Record<string, string>> {
  if (!cfg.clientId || !cfg.clientSecret) return {}
  const chave = `${cfg.base}|${cfg.clientId}`
  if (tokenApp && tokenApp.chave === chave && tokenApp.vence > Date.now() + 300_000) return { Authorization: `Bearer ${tokenApp.valor}` }
  const r = await f(`${cfg.base}/v1/auth_tokens/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.clientId, client_secret: cfg.clientSecret }),
  })
  if (!r.ok) return {}
  const j = (await r.json()) as { access_token?: string; expires_in?: number }
  if (!j.access_token) return {}
  tokenApp = { valor: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000, chave }
  return { Authorization: `Bearer ${j.access_token}` }
}

async function pedir(cfg: SonsConfig, caminho: string) {
  const f = cfg.fetch ?? fetch
  let r: Response
  try {
    r = await f(`${cfg.base}${caminho}`, {
      headers: { Accept: 'application/json', ...(await cabecalhos(cfg, f)) },
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 10_000),
    })
  } catch {
    throw new DomainError('upstream_unavailable', 'O banco de sons livres não respondeu. Tente de novo em instantes.')
  }
  if (r.status === 429) throw new DomainError('rate_limited', 'O banco de sons livres pediu uma pausa. Tente de novo em alguns minutos.')
  if (r.status === 404) throw new DomainError('not_found', 'Esse som não existe mais no banco.')
  if (!r.ok) throw new DomainError('upstream_unavailable', 'O banco de sons livres não respondeu. Tente de novo em instantes.')
  return r.json() as Promise<Record<string, unknown>>
}

const texto = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** Um resultado do Openverse no formato da família (null se a licença ou a fonte não servem). */
export function somDoOpenverse(r: Record<string, unknown>): SomEncontrado | null {
  const lic = typeof r.license === 'string' ? r.license.toLowerCase() : ''
  const id = typeof r.id === 'string' ? r.id : ''
  if (!LICENCAS[lic] || !ID.test(id) || !FONTES.includes(String(r.source ?? r.provider))) return null
  const versao = texto(r.license_version, 10)
  const ms = Number(r.duration)
  const bytes = Number(r.filesize)
  return {
    id,
    origem: 'openverse',
    titulo: texto(r.title) || 'Sem título',
    autor: texto(r.creator, 120),
    licenca: lic === 'pdm' || !versao ? LICENCAS[lic] : `${LICENCAS[lic]} ${versao}`,
    licencaUrl: texto(r.license_url, 300),
    pagina: texto(r.foreign_landing_url, 300),
    fonte: String(r.source ?? r.provider) === 'freesound' ? 'Freesound' : 'Wikimedia Commons',
    duracao: Number.isFinite(ms) && ms > 0 ? Math.round(ms) / 1000 : null,
    formato: texto(r.filetype, 10),
    bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : null,
  }
}

/** Busca efeitos (q de 2 a 80 letras, página de 1 a 10): { sons, pagina, paginas }. */
export async function buscarSons(cfg: SonsConfig, auth: Authenticated | null, entrada: { q?: string | null; pagina?: string | number | null }) {
  exigirPessoa(auth)
  const q = String(entrada.q ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (q.length < 2 || q.length > 80) throw new DomainError('invalid_input', 'Diga o som em 2 a 80 letras (ex.: whoosh, impacto, clique).')
  const pagina = Math.max(1, Math.min(SONS_PAGINAS, Math.trunc(Number(entrada.pagina) || 1)))
  const params = new URLSearchParams({
    q,
    license: Object.keys(LICENCAS).join(','),
    source: FONTES.join(','),
    length: 'shortest,short',
    page_size: String(SONS_POR_PAGINA),
    page: String(pagina),
    mature: 'false',
  })
  const j = await pedir(cfg, `/v1/audio/?${params}`)
  const res = Array.isArray(j.results) ? (j.results as Record<string, unknown>[]) : []
  const sons = res.map(somDoOpenverse).filter((x): x is SomEncontrado => x !== null)
  return { sons, pagina, paginas: Math.min(SONS_PAGINAS, Math.max(1, Number(j.page_count) || 1)) }
}

/** O host do arquivo é de uma fonte conhecida e por https? */
export function hostPermitido(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && HOSTS.includes(u.hostname) && !u.username && !u.password
  } catch {
    return false
  }
}

/**
 * O arquivo do som (stream), com o tipo e o tamanho conferidos. Os metadados vão em cabeçalhos curtos para o app
 * conferir que veio o som pedido (x-zro-som-id) e saber a licença sem outro pedido.
 */
export async function baixarSom(cfg: SonsConfig, auth: Authenticated | null, id: string): Promise<Response> {
  exigirPessoa(auth)
  if (!ID.test(id)) throw new DomainError('invalid_input', 'Som inválido.')
  const item = await pedir(cfg, `/v1/audio/${id}/`)
  const som = somDoOpenverse(item)
  const url = typeof item.url === 'string' ? item.url : ''
  if (!som) throw new DomainError('not_found', 'Esse som não tem licença livre para uso comercial.')
  if (!hostPermitido(url)) throw new DomainError('invalid_input', 'Esse som vem de uma fonte que ainda não aceitamos.')
  const f = cfg.fetch ?? fetch
  let r: Response
  try {
    r = await f(url, { redirect: 'manual', signal: AbortSignal.timeout(cfg.timeoutMs ?? 20_000) })
  } catch {
    throw new DomainError('upstream_unavailable', 'A fonte do som não respondeu. Tente outro.')
  }
  if (!r.ok || !r.body) throw new DomainError('upstream_unavailable', 'A fonte do som não entregou o arquivo. Tente outro.')
  const tipo = (r.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase()
  if (!/^(audio\/[\w.+-]+|application\/ogg)$/.test(tipo)) throw new DomainError('upstream_unavailable', 'A fonte não entregou um arquivo de som.')
  const declarado = Number(r.headers.get('content-length') || 0)
  if (declarado > SOM_MAX_BYTES) throw new DomainError('invalid_input', 'Esse som é grande demais para um efeito.')
  // conta o que passa: o tamanho declarado pode mentir
  let n = 0
  const limite = new TransformStream<Uint8Array, Uint8Array>({
    transform(pedaco, ctl) {
      n += pedaco.byteLength
      if (n > SOM_MAX_BYTES) ctl.error(new Error('grande demais'))
      else ctl.enqueue(pedaco)
    },
  })
  const ascii = (s: string | null) => (s ? encodeURIComponent(s).slice(0, 300) : '')
  return new Response(r.body.pipeThrough(limite), {
    status: 200,
    headers: {
      'Content-Type': tipo,
      ...(declarado ? { 'Content-Length': String(declarado) } : {}),
      'Cache-Control': 'private, max-age=3600',
      'X-Zro-Som-Id': som.id,
      'X-Zro-Som-Titulo': ascii(som.titulo),
      'X-Zro-Som-Autor': ascii(som.autor),
      'X-Zro-Som-Licenca': ascii(som.licenca),
    },
  })
}
