// As chaves do lançamento do Maestro que moram no código dos apps (scripts/lancamento-maestro.mjs): todas existem, no
// mesmo estado, e virar para aberto e de volta devolve o arquivo idêntico (a reversão não deixa rastro).
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type Chave = { arquivo: string; tipo: 'js' | 'html'; nome?: string; blocos?: number; o_que: string }
type Script = {
  CHAVES: Chave[]
  estado: (c: Chave, texto: string) => boolean | string
  virar: (c: Chave, texto: string, abrir: boolean) => string
}

const RAIZ = path.resolve(__dirname, '../..')
const SCRIPT = '../../scripts/lancamento-maestro.mjs'

describe('chaves do lançamento do Maestro', () => {
  it('cada chave existe, todas no mesmo estado, e abrir + fechar devolve o arquivo igual', async () => {
    const { CHAVES, estado, virar } = (await import(SCRIPT as string)) as Script
    expect(CHAVES.length).toBeGreaterThanOrEqual(11)
    const estados = new Set<boolean>()
    for (const c of CHAVES) {
      const texto = readFileSync(path.join(RAIZ, c.arquivo), 'utf8')
      const e = estado(c, texto)
      expect(typeof e, `${c.arquivo}: ${e}`).toBe('boolean')
      estados.add(e as boolean)
      const aberto = virar(c, texto, true)
      const fechado = virar(c, texto, false)
      expect(estado(c, aberto), c.arquivo).toBe(true)
      expect(estado(c, fechado), c.arquivo).toBe(false)
      expect(virar(c, aberto, e as boolean), c.arquivo).toBe(texto)
      expect(virar(c, fechado, e as boolean), c.arquivo).toBe(texto)
      if (c.tipo === 'html') {
        // aberto, o ícone do Maestro fica fora de qualquer comentário; fechado, dentro
        const semComentarios = (t: string) => t.replace(/<!--[\s\S]*?-->/g, '')
        expect(semComentarios(aberto), c.arquivo).toMatch(/maestro\.svg/)
        expect(semComentarios(fechado), c.arquivo).not.toMatch(/maestro\.svg/)
      }
    }
    expect(estados.size, 'todas as chaves viram juntas').toBe(1)
  })

  it('o ícone do Maestro em cada app é o oficial (cópia de apps/hub-web/public/products/maestro.svg)', () => {
    const oficial = readFileSync(path.join(RAIZ, 'apps/hub-web/public/products/maestro.svg'))
    for (const f of [
      'products/sobedesce/public/familia/maestro.svg',
      'products/sobedesce/web/public/app/icons/familia/maestro.svg',
      'products/synquei/app/familia/maestro.svg',
      'products/tpeasy/icons/familia/maestro.svg',
      'products/nossom/public/familia/maestro.svg',
      'products/ai-edit/marca/familia/maestro.svg',
      'products/finishing/marca/familia/maestro.svg',
      'products/carro-do-freela/src/midia/familia-maestro.svg',
    ]) {
      expect(existsSync(path.join(RAIZ, f)), f).toBe(true)
      expect(readFileSync(path.join(RAIZ, f)).equals(oficial), f).toBe(true)
    }
  })
})
