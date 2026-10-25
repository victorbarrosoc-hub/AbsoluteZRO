import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSchemas, OUT_DIR } from '../src/export-schemas'

describe('JSON Schemas publicados', () => {
  it('docs/integration-contracts/schemas está em dia com o código (rode npm run contracts:export)', () => {
    for (const [name, schema] of Object.entries(buildSchemas())) {
      const file = path.join(OUT_DIR, `${name}.schema.json`)
      expect(fs.existsSync(file), file).toBe(true)
      expect(JSON.parse(fs.readFileSync(file, 'utf8')), name).toEqual(JSON.parse(JSON.stringify(schema)))
    }
  })
})
