// A marca dos apps que ainda não lançaram fica fora de public/ (revisão de 01/11/2026): nada de ícone, foto ou nome deles
// nos arquivos públicos do HUB nem no que vai para o navegador; o ícone sai só pela rota /marca/<produto>, de
// lib/marca-fechada.ts, que tem de ser igual aos .svg de apps/hub-web/marca-fechada.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '../..')
const ler = (f: string) => readFileSync(path.join(RAIZ, f), 'utf8')
const FECHADOS = ['nossom', 'finishing', 'ai-edit']

describe('marca dos apps fechados', () => {
  it('nada deles em public/products nem em public/brand', () => {
    for (const id of FECHADOS) {
      expect(existsSync(path.join(RAIZ, `apps/hub-web/public/products/${id}.svg`)), id).toBe(false)
      for (const f of readdirSync(path.join(RAIZ, 'apps/hub-web/public/brand'))) expect(f, f).not.toMatch(new RegExp(`produto-${id}-`))
    }
  })

  it('o ProductMark (vai para o navegador) não cita app fechado; o ícone dele vem de /marca/<produto>', () => {
    const ui = ler('packages/ui/src/index.tsx')
    const mark = ui.slice(ui.indexOf('const ICONES_PUBLICOS'), ui.indexOf('export { cx }'))
    expect(mark).not.toMatch(/nossom|finishing|ai-edit|revela|aeon/i)
    expect(mark).toContain('`/marca/${productId}`')
  })

  it('lib/marca-fechada.ts é igual aos .svg (fora de public/) e é só do servidor', () => {
    const ts = ler('apps/hub-web/lib/marca-fechada.ts')
    expect(ts).toMatch(/^import 'server-only'$/m)
    for (const id of FECHADOS) expect(ts.includes(`${JSON.stringify(id)}: ${JSON.stringify(ler(`apps/hub-web/marca-fechada/${id}.svg`))},`), id).toBe(true)
    const rota = ler('apps/hub-web/app/marca/[produto]/route.ts')
    expect(rota).toMatch(/releaseVisibleFor/)
    expect(rota).toMatch(/status: 404/)
  })

  it('a lista de @ reservados e os selos (com nomes de apps) ficam no servidor; a tela de criar conta usa só a forma', () => {
    const cliente = ler('packages/auth/src/arroba.ts')
    expect(cliente).not.toMatch(/nossom|revela|aeon/i)
    const conversa = ler('apps/hub-web/components/conversa-conta.tsx')
    expect(conversa).toMatch(/from '@zro\/auth\/arroba'/)
    expect(conversa).not.toMatch(/arroba-reservadas|validarArroba\(|sugerirArroba\(/)
  })
})
