import { importScriptFromTpeasy, openScriptInTpeasy } from '@zro/integrations'
import { json, readJson, route } from '@/lib/api'

/**
 * Baixa o roteiro no formato de backup do TPeasy. Também atende o "Abrir no TPeasy": o servidor do TPeasy chama com o
 * token da pessoa (escopo tpeasy.roteiros) e lê a versão nos cabeçalhos.
 */
export const GET = route<{ id: string }>(
  async ({ db, auth }, { id }) => {
    const { backup, version, documentId } = await openScriptInTpeasy(db, auth, id)
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="tpeasy-roteiro-${id.slice(0, 8)}.json"`,
        'Cache-Control': 'no-store',
        'X-Zro-Versao': String(version),
        'X-Zro-Documento': documentId,
      },
    })
  },
  { bearer: 'tpeasy.roteiros' },
)

export const POST = route<{ id: string }>(
  async ({ db, auth, req }, { id }) => {
    const body = (await readJson(req, 5_000_000)) as { backup?: unknown; script_id?: string }
    return json(await importScriptFromTpeasy(db, auth, { projectId: id, backup: body.backup, scriptId: body.script_id }), 201)
  },
  { mutation: true },
)
