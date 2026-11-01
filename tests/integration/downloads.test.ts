// Página Downloads: só links oficiais, em HTTPS, e cada ferramenta do catálogo aparece uma vez. Central única (ADR 0036):
// no computador, todo app instala pela Absolute ZRO; nenhum instalador avulso, Terminal por app ou aviso de "primeira vez".
import { describe, expect, it } from 'vitest'

import { APPS_DESKTOP } from '../../apps/hub-web/lib/desktop-apps'
import { DOWNLOADS, downloadsLiberados, ehAdmin, hasDesktopInstaller, HUB_TERMINAL, PASSOS, SO_PARA_ADMIN } from '../../apps/hub-web/lib/downloads'

const OFFICIAL = new Set([
  'sobedesce.com',
  'synquei.absolutezro.com',
  'quasar.absolutezro.com',
  'tpeasy.absolutezro.com',
  'carro.absolutezro.com',
  'aeon.absolutezro.com',
  'revela.absolutezro.com',
  'maestro.absolutezro.com',
  'relay.absolutezro.com',
  // instaladores que a própria Absolute ZRO entrega (rota /baixar/app/<id>/<sistema>, com o gate e o plano)
  'absolutezro.com',
])
const CATALOG = ['carro-do-freela', 'tpeasy', 'sobedesce', 'synquei', 'ai-edit', 'nossom', 'finishing', 'maestro', 'relay']

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
    }
  })

  it('central única: app com versão para computador é um app da central, e a rota é a da Absolute ZRO', () => {
    for (const d of DOWNLOADS) {
      const pc = d.options.filter((x) => x.os === 'mac' || x.os === 'windows')
      if (pc.length)
        expect(
          APPS_DESKTOP.some((a) => a.id === d.productId),
          d.productId,
        ).toBe(true)
      for (const o of pc) expect(o.href).toBe(`https://absolutezro.com/baixar/app/${d.productId}/${o.os}`)
      // nada de instruções por app nem nota sobre o que falta
      expect(Object.keys(d).sort(), d.productId).not.toContain('terminal')
      expect(Object.keys(d).sort(), d.productId).not.toContain('firstOpen')
      expect(d.note ?? '', d.productId).not.toMatch(/notariza|assinatura|sem atualiza/i)
    }
  })

  it('um download só, o da Absolute ZRO: passo a passo curto e a linha do Terminal, sem nada que assuste', () => {
    expect(HUB_TERMINAL).toEqual({
      mac: 'curl -fsSL https://absolutezro.com/instalar.sh | bash',
      windows: 'irm https://absolutezro.com/instalar.ps1 | iex',
    })
    for (const passos of Object.values(PASSOS)) {
      expect(passos.length).toBeLessThanOrEqual(3)
      for (const p of passos) expect(`${p.texto} ${p.dica ?? ''}`).not.toMatch(/assinad|malware|identificad|não pôde verificar|inseguro|risco/i)
    }
  })

  it('não lançados (AEON, Revela, NOSSOM, Rift Motion) só para admin de plataforma', () => {
    expect([...SO_PARA_ADMIN].sort()).toEqual(['ai-edit', 'finishing', 'nossom', 'rift-motion'])
    expect(ehAdmin({ user: { platformRole: 'admin', emailVerified: true } })).toBe(true)
    expect(ehAdmin({ user: { platformRole: 'admin', emailVerified: false } })).toBe(false)
    expect(ehAdmin({ user: { platformRole: 'admin' } })).toBe(false)
    expect(ehAdmin({ user: { platformRole: 'support' } })).toBe(false)
    expect(ehAdmin(null)).toBe(false)
  })

  it('o que está em desenvolvimento não oferece nada', () => {
    for (const d of DOWNLOADS.filter((x) => x.status === 'soon')) expect(d.options).toEqual([])
  })

  it('gate de lançamento: produto fora dos liberados vira "Em desenvolvimento", sem app nem link', () => {
    const lancados = new Set(['sobedesce', 'synquei', 'tpeasy'])
    const vistos = downloadsLiberados(lancados)
    for (const id of ['nossom', 'ai-edit', 'finishing', 'carro-do-freela', 'maestro']) {
      expect(vistos.find((x) => x.productId === id)).toEqual({ productId: id, status: 'soon', options: [] })
      expect(hasDesktopInstaller(id, lancados)).toBe(false)
    }
    expect(vistos.find((x) => x.productId === 'sobedesce')?.options.length).toBeGreaterThan(0)
    expect(hasDesktopInstaller('synquei', lancados)).toBe(true)
    expect(hasDesktopInstaller('nossom', new Set([...lancados, 'nossom']))).toBe(true)
  })

  it('Maestro, Relay, Carro do Freela e TPeasy: liberados no canal download, no computador pela Absolute ZRO; fechados, só a web', () => {
    for (const id of ['maestro', 'relay', 'carro-do-freela', 'tpeasy']) {
      const aberto = downloadsLiberados(new Set([id])).find((x) => x.productId === id)!
      expect(aberto.status, id).toBe('test')
      expect(hasDesktopInstaller(id, new Set([id])), id).toBe(true)
      const fechado = downloadsLiberados(new Set(['sobedesce']), new Set([id])).find((x) => x.productId === id)!
      expect(
        fechado.options.every((o) => o.os === 'web' || o.os === 'mobile'),
        id,
      ).toBe(true)
      expect(hasDesktopInstaller(id, new Set(['sobedesce'])), id).toBe(false)
    }
    expect(
      downloadsLiberados(new Set(['maestro']))
        .find((x) => x.productId === 'maestro')!
        .options.map((o) => o.os),
    ).toEqual(['mac', 'windows', 'web', 'mobile'])
  })

  it('AEON: só no navegador até o Release dele entrar na central', () => {
    const aeon = downloadsLiberados(new Set(['ai-edit'])).find((x) => x.productId === 'ai-edit')!
    expect(aeon.options.map((o) => o.href)).toEqual(['https://aeon.absolutezro.com/app/'])
  })
})
