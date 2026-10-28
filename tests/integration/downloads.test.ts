// Página Downloads: só links oficiais, em HTTPS, e cada ferramenta do catálogo aparece uma vez.
import { describe, expect, it } from 'vitest'
import { DOWNLOADS, downloadsLiberados, hasDesktopInstaller } from '../../apps/hub-web/lib/downloads'

const OFFICIAL = new Set([
  'sobedesce.vercel.app',
  'synquei.vercel.app',
  'nossom-teal.vercel.app',
  'tpeasy.vercel.app',
  'carrodofreela.com.br',
  'aeon.absolutezro.com',
  'revela.absolutezro.com',
])
const CATALOG = ['carro-do-freela', 'tpeasy', 'sobedesce', 'synquei', 'ai-edit', 'nossom', 'finishing']

describe('downloads', () => {
  it('cobre o catálogo inteiro, sem repetir', () => {
    expect(DOWNLOADS.map((d) => d.productId).sort()).toEqual([...CATALOG].sort())
  })

  it('usa só HTTPS em domínios oficiais; nunca o GitHub direto (repositórios privados)', () => {
    for (const d of DOWNLOADS) {
      for (const o of d.options) {
        const u = new URL(o.href)
        expect(u.protocol, o.href).toBe('https:')
        expect(OFFICIAL.has(u.hostname), o.href).toBe(true)
        expect(u.hostname, o.href).not.toMatch(/github(usercontent)?\.com$/)
      }
      for (const cmd of Object.values(d.terminal ?? {}))
        expect(cmd).toMatch(/https:\/\/((sobedesce|synquei|nossom-teal)\.vercel\.app|aeon\.absolutezro\.com)\/instalar\.(sh|ps1)/)
    }
  })

  it('instaladores de desktop passam pela rota /baixar do próprio site', () => {
    for (const d of DOWNLOADS) {
      for (const o of d.options.filter((x) => x.os === 'mac' || x.os === 'windows')) {
        expect(new URL(o.href).pathname, o.href).toMatch(/^\/baixar\/(mac|windows|mac-arm64|mac-x64)$/)
      }
    }
  })

  it('o que está em desenvolvimento não oferece instalador', () => {
    for (const d of DOWNLOADS.filter((x) => x.status === 'soon')) expect(d.options).toEqual([])
  })

  it('gate de lançamento: produto fora dos liberados vira "Em desenvolvimento", sem instalador, Terminal nem link', () => {
    const lancados = new Set(['sobedesce', 'synquei', 'tpeasy'])
    const vistos = downloadsLiberados(lancados)
    for (const id of ['nossom', 'ai-edit', 'finishing', 'carro-do-freela']) {
      const d = vistos.find((x) => x.productId === id)!
      expect(d).toEqual({ productId: id, status: 'soon', options: [] })
      expect(hasDesktopInstaller(id, lancados)).toBe(false)
    }
    expect(vistos.find((x) => x.productId === 'sobedesce')?.options.length).toBeGreaterThan(0)
    expect(hasDesktopInstaller('synquei', lancados)).toBe(true)
    // quem está na lista de acesso continua baixando
    expect(hasDesktopInstaller('nossom', new Set([...lancados, 'nossom']))).toBe(true)
  })
})
