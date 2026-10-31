/**
 * O banco de sons da própria pessoa no Google Drive (Sonoplasta do AEON, fase 2b, pedido do titular em 31/10/2026):
 * uma pasta do Drive que ela alimenta com os áudios dela. O Drive está conectado no SOBEDESCE; o HUB pede em nome da
 * pessoa, servidor a servidor, com o mesmo pedido assinado da Z (`assinarPedidoDeApp`, 60 s, uso único):
 *
 * - **Listar** (`drive.listar`): uma página da pasta (subpastas e áudios), com busca por nome dentro dela. Só metadados.
 * - **Arquivo** (`drive.token`): o token curto do Drive da pessoa fica só aqui, na memória, até vencer; o HUB confere
 *   que é áudio e o tamanho, e passa o arquivo aos poucos. O token nunca vai ao app nem ao navegador. Nada é guardado.
 *
 * Só leitura: nada é movido, renomeado, criado nem apagado no Drive. A licença dos sons do banco é da pessoa (o AEON não
 * escreve crédito para eles). Contrato: docs/integration-contracts/sobedesce-drive.md ("Banco de sons do AEON").
 */
import { assinarPedidoDeApp, type Authenticated } from '@zro/auth'
import type { Database } from '@zro/db'
import { DomainError } from '@zro/observability'
import { driveConfigDoAmbiente, type DriveConfig } from './ia-drive'
import { SOM_MAX_BYTES } from './sons'

export const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3'
const PASTA_MIME = 'application/vnd.google-apps.folder'
const ID_DRIVE = /^[A-Za-z0-9_-]{10,200}$/
const CONTA = /^[A-Za-z0-9_-]{1,64}$/
const AUDIO_EXT = /\.(wav|mp3|m4a|aac|aif|aiff|flac|ogg|oga|opus|caf)$/i

export type BancoConfig = DriveConfig & { google?: string }

export function bancoConfigDoAmbiente(env: Record<string, string | undefined> = process.env): BancoConfig {
  return { ...driveConfigDoAmbiente(env), google: GOOGLE_DRIVE_API }
}

export type SomDoBanco = { id: string; origem: 'banco'; titulo: string; nome: string; formato: string | null; bytes: number | null; conta: string | null }

type ItemSd = { id?: unknown; nome?: unknown; tipo?: unknown; pasta?: unknown; tamanho?: unknown }

const ehAudio = (mime: string, nome: string) =>
  /^audio\//.test(mime) || mime === 'application/ogg' || (mime === 'application/octet-stream' && AUDIO_EXT.test(nome))
const semExtensao = (nome: string) => nome.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim() || nome

function exigirPessoa(auth: Authenticated | null): string {
  if (!auth) throw new DomainError('unauthenticated', 'Entre com a conta Absolute ZRO para usar o seu banco de sons.')
  return auth.user.id
}

/** Falha do SOBEDESCE → erro com a frase para a pessoa e o código dele em `details.erro` (o app mostra o caminho). */
function falha(status: number, codigo: string | null, base: string): DomainError {
  const conta = `${base}/conta`
  const d = { erro: codigo ?? `http_${status || 0}` }
  switch (codigo) {
    case 'sem_drive':
      return new DomainError('sem_conexao', `Conecte o seu Google Drive no SOBEDESCE (${conta}) para usar o seu banco de sons.`, { ...d, link: conta })
    case 'reconectar_drive':
      return new DomainError('sem_conexao', `O Google pediu para reconectar o Drive. Reconecte em ${conta} e tente de novo.`, { ...d, link: conta })
    case 'sem_vinculo':
      return new DomainError('sem_conexao', `Entre no SOBEDESCE (${base}) com a conta Absolute ZRO e conecte o Drive.`, { ...d, link: base })
    case 'sem_acesso_zro':
      return new DomainError('product_unavailable', 'O banco no Drive usa o SOBEDESCE, que não está liberado para esta conta.', d)
    case 'nao_achou':
      return new DomainError('not_found', 'Essa pasta ou esse som não está mais no Drive (ou é de outra conta).', d)
    case 'conta_desconhecida':
      return new DomainError('not_found', 'Essa conta do Google não está mais conectada no SOBEDESCE.', d)
    case 'devagar':
      return new DomainError('rate_limited', 'Muitos pedidos ao Drive seguidos. Espere uns minutos e tente de novo.', d)
    default:
      return new DomainError('upstream_unavailable', 'O Drive não respondeu agora. Tente de novo em instantes.', d)
  }
}

async function pedirAoSobedesce(db: Database, sub: string, cfg: BancoConfig, acao: 'drive.listar' | 'drive.token', corpo: Record<string, unknown>) {
  const caminho = acao === 'drive.listar' ? '/api/zro/drive/listar' : '/api/zro/drive/token'
  const token = await assinarPedidoDeApp(db, { sub, aud: cfg.clientId, acao })
  let r: Response
  try {
    r = await (cfg.fetch ?? fetch)(`${cfg.base}${caminho}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 15_000),
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    throw falha(0, null, cfg.base)
  }
  const j = (await r.json().catch(() => null)) as Record<string, unknown> | null
  if (!r.ok || !j) throw falha(r.status, typeof j?.erro === 'string' ? j.erro : null, cfg.base)
  return j
}

/**
 * Uma página da pasta do banco: { pasta, conta, pastas (subpastas), sons (só áudio), proxima }. Com `q`, só o que tem o
 * termo no nome, dentro dessa pasta.
 */
export async function listarBanco(
  db: Database,
  auth: Authenticated | null,
  entrada: { pasta?: string | null; q?: string | null; pagina?: string | null; conta?: string | null },
  cfg: BancoConfig = bancoConfigDoAmbiente(),
) {
  const sub = exigirPessoa(auth)
  const pasta = String(entrada.pasta ?? '')
  if (!ID_DRIVE.test(pasta)) throw new DomainError('invalid_input', 'Cole o link da pasta do Drive com os seus sons.')
  const q = String(entrada.q ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (q.length > 80) throw new DomainError('invalid_input', 'Busca de até 80 letras.')
  const pagina = typeof entrada.pagina === 'string' && entrada.pagina && entrada.pagina.length <= 2000 ? entrada.pagina : undefined
  const conta = entrada.conta && CONTA.test(entrada.conta) ? entrada.conta : undefined
  const j = await pedirAoSobedesce(db, sub, cfg, 'drive.listar', {
    pasta,
    ...(q ? { busca: q } : {}),
    ...(pagina ? { pagina } : {}),
    ...(conta ? { conta } : {}),
  })
  const contaId = typeof (j.conta as { id?: unknown } | undefined)?.id === 'string' ? (j.conta as { id: string }).id : null
  const p = j.pasta as { id?: unknown; nome?: unknown } | null | undefined
  const itens = Array.isArray(j.itens) ? (j.itens as ItemSd[]) : []
  const pastas: { id: string; nome: string }[] = []
  const sons: SomDoBanco[] = []
  for (const i of itens) {
    const id = typeof i.id === 'string' ? i.id : ''
    const nome = typeof i.nome === 'string' ? i.nome.slice(0, 200) : ''
    const tipo = typeof i.tipo === 'string' ? i.tipo : ''
    if (!ID_DRIVE.test(id) || !nome) continue
    if (i.pasta === true || tipo === PASTA_MIME) pastas.push({ id, nome })
    else if (ehAudio(tipo, nome)) {
      const bytes = Number(i.tamanho)
      sons.push({
        id,
        origem: 'banco',
        titulo: semExtensao(nome),
        nome,
        formato: (/\.([A-Za-z0-9]{1,5})$/.exec(nome)?.[1] ?? '').toLowerCase() || null,
        bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : null,
        conta: contaId,
      })
    }
  }
  return {
    pasta: { id: typeof p?.id === 'string' ? p.id : pasta, nome: typeof p?.nome === 'string' ? p.nome : 'Pasta' },
    conta: contaId,
    pastas,
    sons,
    proxima: typeof j.proxima === 'string' ? j.proxima : null,
  }
}

// token curto do Drive por pessoa e conta, só na memória desta instância; renova 1 min antes de vencer
const tokens = new Map<string, { valor: string; vence: number }>()

async function tokenDoDrive(db: Database, sub: string, conta: string | undefined, cfg: BancoConfig): Promise<string> {
  const chave = `${cfg.base}|${sub}|${conta ?? ''}`
  const t = tokens.get(chave)
  if (t && t.vence > Date.now() + 60_000) return t.valor
  const j = await pedirAoSobedesce(db, sub, cfg, 'drive.token', conta ? { conta } : {})
  if (typeof j.access_token !== 'string' || !j.access_token) throw falha(502, null, cfg.base)
  const vence = Date.parse(String(j.expira_em))
  tokens.set(chave, { valor: j.access_token, vence: Number.isFinite(vence) ? vence : Date.now() + 5 * 60_000 })
  if (tokens.size > 500) tokens.delete(tokens.keys().next().value!)
  return j.access_token
}

/** O arquivo de um som do banco (stream), conferido: áudio de verdade, não apagado, até 25 MB. */
export async function baixarDoBanco(
  db: Database,
  auth: Authenticated | null,
  id: string,
  entrada: { conta?: string | null } = {},
  cfg: BancoConfig = bancoConfigDoAmbiente(),
): Promise<Response> {
  const sub = exigirPessoa(auth)
  if (!ID_DRIVE.test(id)) throw new DomainError('invalid_input', 'Som inválido.')
  const conta = entrada.conta && CONTA.test(entrada.conta) ? entrada.conta : undefined
  const google = (cfg.google ?? GOOGLE_DRIVE_API).replace(/\/$/, '')
  const f = cfg.fetch ?? fetch
  const pedirGoogle = async (consulta: string, repetir = true): Promise<Response> => {
    const token = await tokenDoDrive(db, sub, conta, cfg)
    let r: Response
    try {
      r = await f(`${google}/files/${encodeURIComponent(id)}?${consulta}&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
        cache: 'no-store',
      })
    } catch {
      throw falha(0, null, cfg.base)
    }
    // token que o Google recusou (revogado antes da hora): pede outro uma vez
    if (r.status === 401 && repetir) {
      tokens.delete(`${cfg.base}|${sub}|${conta ?? ''}`)
      return pedirGoogle(consulta, false)
    }
    if (r.status === 404 || r.status === 403) throw falha(404, 'nao_achou', cfg.base)
    if (!r.ok) throw falha(r.status, null, cfg.base)
    return r
  }
  const meta = (await (await pedirGoogle('fields=id,name,mimeType,size,trashed')).json().catch(() => null)) as {
    name?: string
    mimeType?: string
    size?: string
    trashed?: boolean
  } | null
  const nome = String(meta?.name ?? '')
  const mime = String(meta?.mimeType ?? '')
  if (!meta || meta.trashed) throw falha(404, 'nao_achou', cfg.base)
  if (!ehAudio(mime, nome)) throw new DomainError('invalid_input', 'Esse arquivo não é um som.')
  const tamanho = Number(meta.size ?? 0)
  if (tamanho > SOM_MAX_BYTES) throw new DomainError('invalid_input', 'Esse som é grande demais para um efeito (até 25 MB).')
  const r = await pedirGoogle('alt=media')
  if (!r.body) throw falha(502, null, cfg.base)
  let n = 0
  const limite = new TransformStream<Uint8Array, Uint8Array>({
    transform(pedaco, ctl) {
      n += pedaco.byteLength
      if (n > SOM_MAX_BYTES) ctl.error(new Error('grande demais'))
      else ctl.enqueue(pedaco)
    },
  })
  return new Response(r.body.pipeThrough(limite), {
    status: 200,
    headers: {
      'Content-Type': /^audio\/|^application\/ogg$/.test(mime) ? mime : 'application/octet-stream',
      ...(tamanho ? { 'Content-Length': String(tamanho) } : {}),
      'Cache-Control': 'private, no-store',
      'X-Zro-Som-Id': id,
      'X-Zro-Som-Titulo': encodeURIComponent(semExtensao(nome)).slice(0, 300),
    },
  })
}
