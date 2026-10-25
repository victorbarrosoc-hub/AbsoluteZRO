#!/usr/bin/env node
// Build na Vercel: aplica as migrations no banco NOVO do HUB (se houver) e depois roda o next build.
// Usa a URL sem pooler para as migrations (trava de sessão), a com pooler fica para o app.
// Nunca aponte estas variáveis para o banco de um app original.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationUrl = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })

if (migrationUrl) {
  console.log('[vercel-build] aplicando migrations no banco do HUB…')
  run('npx', ['tsx', 'packages/db/src/cli.ts'], { cwd: ROOT, env: { ...process.env, DATABASE_URL: migrationUrl, DATABASE_PREPARE: 'true' } })
} else {
  console.warn('[vercel-build] sem DATABASE_URL: o app vai subir, mas páginas que usam o banco respondem erro até o banco ser ligado.')
}
run('npx', ['next', 'build'], { cwd: path.join(ROOT, 'apps/hub-web') })
