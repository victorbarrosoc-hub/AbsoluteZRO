// Página Downloads: só links oficiais, em HTTPS, e cada ferramenta do catálogo aparece uma vez.
import { describe, expect, it } from 'vitest'
import { DOWNLOADS } from '../../apps/hub-web/lib/downloads'

const OFFICIAL = new Set(['sobedesce.vercel.app', 'synquei.vercel.app', 'nossom-teal.vercel.app', 'tpeasy.vercel.app', 'carrodofreela.com.br', 'github.com'])
const CATALOG = ['carro-do-freela', 'tpeasy', 'sobedesce', 'synquei', 'ai-edit', 'nossom', 'finishing']

describe('downloads', () => {
  it('cobre o catálogo inteiro, sem repetir', () => {
    expect(DOWNLOADS.map((d) => d.productId).sort()).toEqual([...CATALOG].sort())
  })

  it('usa só HTTPS em domínios oficiais; GitHub só nos releases do próprio produto', () => {
    for (const d of DOWNLOADS) {
      for (const o of d.options) {
        const u = new URL(o.href)
        expect(u.protocol, o.href).toBe('https:')
        expect(OFFICIAL.has(u.hostname), o.href).toBe(true)
        if (u.hostname === 'github.com') expect(u.pathname.startsWith('/victorbarrosoc-hub/'), o.href).toBe(true)
      }
      for (const cmd of Object.values(d.terminal ?? {})) expect(cmd).toMatch(/https:\/\/(sobedesce|synquei)\.vercel\.app\/instalar\.(sh|ps1)/)
    }
  })

  it('o que está em desenvolvimento não oferece instalador', () => {
    for (const d of DOWNLOADS.filter((x) => x.status === 'soon')) expect(d.options).toEqual([])
  })
})
