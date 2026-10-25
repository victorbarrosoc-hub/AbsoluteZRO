// Cada rota do OpenAPI existe no app (e cada rota do app está documentada).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(import.meta.dirname, '../..')
const API = path.join(ROOT, 'apps/hub-web/app/api')

function routes(dir: string, base = '/api'): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return routes(path.join(dir, e.name), `${base}/${e.name.replace(/^\[(.+)\]$/, '{$1}')}`)
    return e.name === 'route.ts' ? [base] : []
  })
}

describe('OpenAPI', () => {
  it('documenta exatamente as rotas da API', () => {
    const spec = fs.readFileSync(path.join(ROOT, 'docs/integration-contracts/openapi.yaml'), 'utf8')
    const documented = [...spec.matchAll(/^ {2}(\/api\/[^:]+):$/gm)].map((m) => m[1]).sort()
    expect(documented).toEqual(routes(API).sort())
  })
})
