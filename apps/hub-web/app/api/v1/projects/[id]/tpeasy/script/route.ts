import { exportScriptToTpeasy, importScriptFromTpeasy } from '@zro/integrations'
import { json, readJson, route } from '@/lib/api'

/** Baixa o roteiro no formato de backup do TPeasy. */
export const GET = route<{ id: string }>(async ({ db, auth }, { id }) => {
  const backup = await exportScriptToTpeasy(db, auth, id)
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="tpeasy-roteiro-${id.slice(0, 8)}.json"`,
      'Cache-Control': 'no-store',
    },
  })
})

export const POST = route<{ id: string }>(
  async ({ db, auth, req }, { id }) => {
    const body = (await readJson(req, 5_000_000)) as { backup?: unknown; script_id?: string }
    return json(await importScriptFromTpeasy(db, auth, { projectId: id, backup: body.backup, scriptId: body.script_id }), 201)
  },
  { mutation: true },
)
