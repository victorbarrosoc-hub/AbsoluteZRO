// /privacidade e /termos existem no HUB e trazem o que o Google exige para verificar os escopos.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SITE = path.resolve(import.meta.dirname, '../../apps/hub-web/app/(site)')
const ler = (p: string) => fs.readFileSync(path.join(SITE, p), 'utf8')

describe('páginas legais', () => {
  it('privacidade traz a declaração de Limited Use e os escopos reais', () => {
    const privacidade = ler('privacidade/page.tsx')
    expect(privacidade).toContain('https://developers.google.com/terms/api-services-user-data-policy')
    expect(privacidade).toContain('including the Limited Use requirements')
    for (const escopo of ['openid', 'calendar.events', 'calendar.calendarlist.readonly']) expect(privacidade).toContain(escopo)
  })
  it('termos existem e o rodapé liga as duas páginas', () => {
    expect(ler('termos/page.tsx')).toContain('Termos de uso')
    const layout = ler('layout.tsx')
    expect(layout).toContain('href="/privacidade"')
    expect(layout).toContain('href="/termos"')
  })
})
