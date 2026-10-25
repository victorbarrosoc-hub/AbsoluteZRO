/** npm run db:migrate: aplica as migrations no DATABASE_URL (banco NOVO do HUB). */
import { createDatabase } from './index'
import { migrate } from './migrate'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL não configurada.')
  process.exit(2)
}
const db = createDatabase(url, { max: 1, prepare: process.env.DATABASE_PREPARE !== 'false' })
try {
  const r = await migrate(db.sql)
  console.log(`aplicadas: ${r.applied.join(', ') || 'nenhuma'} · já estavam: ${r.skipped.length}`)
} finally {
  await db.close()
}
