/**
 * Sons originais da Absolute ZRO (pedido do titular em 01/11/2026): o pack de efeitos da plataforma, o banco padrão da
 * aba Sons do AEON e de todo app da família. Os arquivos ficam no banco (zro.sons_zro, migração 0050), leitura pelo
 * papel zro_app (RLS); só quem entra com a conta (escopo `zro.sons`) lista, ouve e baixa. Licença da plataforma: sem
 * crédito no vídeo.
 */
import type { Authenticated } from '@zro/auth'
import type { Database } from '@zro/db'
import { DomainError } from '@zro/observability'

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

export type VersaoZro = { id: string; versao: number; duracao: number | null; bytes: number; formato: string; melhor: boolean }
const FORMATOS: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg' }
export type SomZro = { id: string; origem: 'zro'; titulo: string; categoria: string; versoes: VersaoZro[] }
export type CatalogoZro = { categorias: { nome: string; total: number }[]; sons: SomZro[] }

function contexto(auth: Authenticated | null) {
  if (!auth) throw new DomainError('unauthenticated', 'Entre com a conta Absolute ZRO para usar os sons da plataforma.')
  return { userId: auth.user.id, orgId: auth.session?.activeOrgId ?? null }
}

/** O catálogo inteiro (sem o áudio): as categorias na ordem do pack e cada som com as suas versões (a melhor primeiro). */
export async function listarSonsZro(db: Database, auth: Authenticated | null): Promise<CatalogoZro> {
  const ctx = contexto(auth)
  const linhas = await db.asUser(
    ctx,
    (tx) =>
      tx`select id, som, categoria, ordem, titulo, versao, melhor, duracao, content_type, octet_length(audio) as bytes
         from zro.sons_zro order by ordem, titulo, versao`,
  )
  const categorias: CatalogoZro['categorias'] = []
  const sons = new Map<string, SomZro>()
  for (const l of linhas) {
    const categoria = l.categoria as string
    let s = sons.get(l.som as string)
    if (!s) {
      s = { id: l.som as string, origem: 'zro', titulo: l.titulo as string, categoria, versoes: [] }
      sons.set(s.id, s)
      const c = categorias.find((x) => x.nome === categoria)
      if (c) c.total++
      else categorias.push({ nome: categoria, total: 1 })
    }
    const duracao = l.duracao == null ? null : Number(l.duracao)
    s.versoes.push({
      id: l.id as string,
      versao: Number(l.versao),
      duracao,
      bytes: Number(l.bytes),
      formato: FORMATOS[l.content_type as string] ?? 'mp3',
      melhor: Boolean(l.melhor),
    })
  }
  for (const s of sons.values()) s.versoes.sort((a, b) => Number(b.melhor) - Number(a.melhor) || a.versao - b.versao)
  return { categorias, sons: [...sons.values()] }
}

/** O arquivo de uma versão. O id muda se o áudio mudar, então o app pode guardar por um bom tempo. */
export async function baixarSomZro(db: Database, auth: Authenticated | null, id: string): Promise<Response> {
  const ctx = contexto(auth)
  if (!ID.test(id) || id.length < 3 || id.length > 100) throw new DomainError('invalid_input', 'Som inválido.')
  const [l] = await db.asUser(ctx, (tx) => tx`select id, titulo, versao, content_type, audio, sha256 from zro.sons_zro where id = ${id}`)
  if (!l) throw new DomainError('not_found', 'Esse som não está mais nos sons da Absolute ZRO.')
  const audio = l.audio as Buffer
  return new Response(new Uint8Array(audio), {
    status: 200,
    headers: {
      'Content-Type': l.content_type as string,
      'Content-Length': String(audio.byteLength),
      'Cache-Control': 'private, max-age=86400',
      ETag: `"${l.sha256 as string}"`,
      'X-Zro-Som-Id': l.id as string,
      'X-Zro-Som-Titulo': encodeURIComponent(`${l.titulo as string} ${l.versao as number}`).slice(0, 300),
      'X-Zro-Som-Licenca': encodeURIComponent('Absolute ZRO'),
    },
  })
}
